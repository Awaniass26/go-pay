"""Tests d'intégration des règles gRPC et des notifications du TD3."""

from collections.abc import Iterator
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from gopay.dependencies import get_antifraude, get_envoyeur, get_repository
from gopay.errors import ServiceIndisponible
from gopay.fraude.client import Verdict
from gopay.main import app
from gopay.repository import MemoireRepository
from gopay.webhooks import signer, verifier

TEL_EXPEDITEUR = "+221770000001"
TEL_BENEFICIAIRE = "+221770000002"


class FauxAntiFraude:
    def __init__(self, *, score: float = 0.1, en_panne: bool = False) -> None:
        self.score = score
        self.en_panne = en_panne

    def evaluer(
        self,
        wallet_id: int,
        montant: int,
        beneficiaire_tel: str,
        region: str,
    ) -> Verdict:
        if self.en_panne:
            raise ServiceIndisponible("FraudCheck indisponible pour le test.")
        return Verdict(score=self.score, bloquer=self.score >= 0.8, raison="test")


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    repo = MemoireRepository()
    monkeypatch.setitem(app.dependency_overrides, get_repository, lambda: repo)
    monkeypatch.setitem(app.dependency_overrides, get_antifraude, lambda: FauxAntiFraude())
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_repository, None)
    app.dependency_overrides.pop(get_antifraude, None)


def ouvrir_wallet(client: TestClient, nom: str, telephone: str, type_: str = "client") -> int:
    resultat = client.post(
        "/v1/wallets",
        json={"nom": nom, "telephone": telephone, "type": type_},
    )
    assert resultat.status_code == 201
    wallet_id = resultat.json()["id"]
    assert isinstance(wallet_id, int)
    return wallet_id


def deposer(client: TestClient, wallet_id: int, montant: int) -> None:
    resultat = client.post(f"/v1/wallets/{wallet_id}/depots", json={"montant": montant})
    assert resultat.status_code == 201


def test_score_antifraude_superieur_au_seuil_bloque_transfert(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setitem(
        app.dependency_overrides,
        get_antifraude,
        lambda: FauxAntiFraude(score=0.8),
    )
    wallet_id = ouvrir_wallet(client, "Awa", TEL_EXPEDITEUR)
    deposer(client, wallet_id, 20_000)

    resultat = client.post(
        "/v1/transferts",
        headers={"X-Wallet-Id": str(wallet_id)},
        json={"beneficiaire_tel": TEL_BENEFICIAIRE, "montant": 5_000},
    )

    assert resultat.status_code == 422
    assert client.get(f"/v1/wallets/{wallet_id}").json()["solde"] == "20000"


def test_panne_antifraude_applique_le_seuil_de_secours(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setitem(
        app.dependency_overrides,
        get_antifraude,
        lambda: FauxAntiFraude(en_panne=True),
    )
    wallet_id = ouvrir_wallet(client, "Awa", TEL_EXPEDITEUR)
    deposer(client, wallet_id, 200_000)
    headers = {"X-Wallet-Id": str(wallet_id)}

    petit = client.post(
        "/v1/transferts",
        headers=headers,
        json={"beneficiaire_tel": TEL_BENEFICIAIRE, "montant": 10_000},
    )
    grand = client.post(
        "/v1/transferts",
        headers=headers,
        json={"beneficiaire_tel": TEL_BENEFICIAIRE, "montant": 50_000},
    )

    assert petit.status_code == 201
    assert grand.status_code == 503


def test_alerte_websocket_agent_ne_contient_pas_le_code(client: TestClient) -> None:
    wallet_id = ouvrir_wallet(client, "Awa", TEL_EXPEDITEUR)
    deposer(client, wallet_id, 20_000)
    with client.websocket_connect("/ws/agents/7") as websocket:
        resultat = client.post(
            "/v1/transferts",
            headers={"X-Wallet-Id": str(wallet_id)},
            json={"beneficiaire_tel": TEL_BENEFICIAIRE, "montant": 5_000},
        )
        alerte = websocket.receive_json()

    assert resultat.status_code == 201
    assert alerte["type"] == "transfert"
    assert alerte["montant"] == "5000"
    assert "code_retrait" not in alerte


def test_sse_emet_le_statut_retire(client: TestClient) -> None:
    wallet_id = ouvrir_wallet(client, "Awa", TEL_EXPEDITEUR)
    deposer(client, wallet_id, 20_000)
    transfert = client.post(
        "/v1/transferts",
        headers={"X-Wallet-Id": str(wallet_id)},
        json={"beneficiaire_tel": TEL_BENEFICIAIRE, "montant": 5_000},
    ).json()
    retrait = client.post(
        "/v1/retraits",
        json={
            "code_retrait": transfert["code_retrait"],
            "beneficiaire_tel": TEL_BENEFICIAIRE,
        },
    )

    suivi = client.get(f"/v1/transferts/{transfert['id']}/suivi")

    assert retrait.status_code == 201
    assert suivi.headers["content-type"].startswith("text/event-stream")
    assert '"statut": "retire"' in suivi.text


def test_webhook_marchand_est_signe_et_configurable(client: TestClient) -> None:
    marchand_id = ouvrir_wallet(client, "Marchand", "+221770000003", "marchand")
    configuration = client.put(
        f"/v1/marchands/{marchand_id}/webhook",
        json={"url": "http://localhost:8002/hooks/gopay"},
    )
    secret = configuration.json()["secret"]
    corps = b'{"event_id":"evt_test","type":"paiement.recu"}'
    signature = f"t=1799999999,v1={signer(secret, corps, 1799999999)}"

    assert configuration.status_code == 200
    assert verifier(secret, corps, signature, tolerance=10**10)
    assert not verifier(secret, corps + b" ", signature, tolerance=10**10)


def test_paiement_envoie_evenement_webhook_au_marchand(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FauxEnvoyeur:
        def __init__(self) -> None:
            self.envois: list[tuple[str, str, dict[str, object]]] = []

        def envoyer(self, url: str, secret: str, evenement: dict[str, object]) -> None:
            self.envois.append((url, secret, evenement))

    envoyeur = FauxEnvoyeur()
    monkeypatch.setitem(app.dependency_overrides, get_envoyeur, lambda: envoyeur)
    client_id = ouvrir_wallet(client, "Awa", TEL_EXPEDITEUR)
    deposer(client, client_id, 20_000)
    marchand_id = ouvrir_wallet(client, "Marchand", "+221770000003", "marchand")
    config = client.put(
        f"/v1/marchands/{marchand_id}/webhook",
        json={"url": "http://localhost:8002/hooks/gopay"},
    ).json()

    resultat = client.post(
        "/v1/paiements",
        headers={"X-Wallet-Id": str(client_id)},
        json={"marchand_id": marchand_id, "montant": 5_000},
    )

    assert resultat.status_code == 201
    assert len(envoyeur.envois) == 1
    url, secret, evenement = envoyeur.envois[0]
    assert url == config["url"]
    assert secret == config["secret"]
    assert evenement["type"] == "paiement.recu"
    assert evenement["marchand_id"] == marchand_id
    assert evenement["client_id"] == client_id


def test_ouverture_wallet_conserve_le_solde_decimal(client: TestClient) -> None:
    wallet_id = ouvrir_wallet(client, "Awa", TEL_EXPEDITEUR)
    deposer(client, wallet_id, 1_000)

    wallet = client.get(f"/v1/wallets/{wallet_id}").json()

    assert Decimal(wallet["solde"]) == Decimal("1000")
