"""Tests de l'API GraphQL et de son partage de données avec REST."""

import asyncio
from collections.abc import Iterator
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from gopay.dependencies import get_repository
from gopay.graphql_api import Contexte, schema
from gopay.main import app
from gopay.repository import MemoireRepository
from gopay.services import GoPayService


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    repo = MemoireRepository()
    monkeypatch.setitem(app.dependency_overrides, get_repository, lambda: repo)
    with TestClient(app) as test_client:
        yield test_client


def test_graphql_lit_wallet_et_transactions_crees_en_rest(client: TestClient) -> None:
    wallet = client.post(
        "/v1/wallets",
        json={
            "nom": "Awa",
            "telephone": "+221770000001",
            "region": "Thiès",
        },
    )
    assert wallet.status_code == 201
    wallet_id = wallet.json()["id"]

    depot = client.post(
        f"/v1/wallets/{wallet_id}/depots",
        json={"montant": 1200},
    )
    assert depot.status_code == 201

    resultat = client.post(
        "/graphql",
        json={
            "query": """
                {
                  wallets {
                    nom
                    region
                    solde
                    transactions(limite: 1) {
                      montant
                    }
                  }
                }
            """
        },
    )

    assert resultat.status_code == 200
    assert resultat.json()["data"]["wallets"] == [
        {
            "nom": "Awa",
            "region": "Thiès",
            "solde": "1200",
            "transactions": [{"montant": "1200"}],
        }
    ]


def test_region_par_defaut_reste_dakar(client: TestClient) -> None:
    resultat = client.post(
        "/v1/wallets",
        json={"nom": "Awa", "telephone": "+221770000001"},
    )

    assert resultat.status_code == 201
    assert resultat.json()["region"] == "Dakar"


def test_dataloader_groupe_les_lectures_de_wallets() -> None:
    repo = MemoireRepository()
    service = GoPayService(repo)

    for numero in range(5):
        wallet = service.ouvrir_wallet(
            f"Client {numero}",
            f"+22177000000{numero}",
            "client",
        )
        for _ in range(20):
            service.deposer(wallet.id, Decimal("1000"))

    contexte = Contexte(repo)
    resultat = asyncio.run(
        schema.execute(
            "{ transactions(limite: 100) { montant wallet { nom } } }",
            context_value=contexte,
        )
    )

    assert resultat.errors is None
    assert resultat.data is not None
    assert len(resultat.data["transactions"]) == 100
    assert contexte.lectures_wallets == 1
