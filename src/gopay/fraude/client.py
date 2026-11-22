"""Client utilisé par Go Pay pour contacter le service FraudCheck."""

from dataclasses import dataclass

import grpc

from gopay.errors import OperationInterdite, ServiceIndisponible
from gopay.fraude import fraud_pb2, fraud_pb2_grpc


@dataclass
class Verdict:
    score: float
    bloquer: bool
    raison: str


class ClientFraude:
    def __init__(
        self,
        adresse: str = "localhost:50051",
        echeance: float = 0.2,
    ) -> None:
        self._stub = fraud_pb2_grpc.FraudCheckStub(grpc.insecure_channel(adresse))
        self._echeance = echeance

    def evaluer(
        self,
        wallet_id: int,
        montant: int,
        beneficiaire_tel: str,
        region: str,
    ) -> Verdict:
        requete = fraud_pb2.TransfertRequest(
            wallet_id=wallet_id,
            montant=montant,
            beneficiaire_tel=beneficiaire_tel,
            region=region,
        )

        try:
            reponse = self._stub.Evaluer(
                requete,
                timeout=self._echeance,
            )
        except grpc.RpcError as erreur:
            if erreur.code() == grpc.StatusCode.INVALID_ARGUMENT:
                raise OperationInterdite(f"FraudCheck : {erreur.details()}") from erreur

            raise ServiceIndisponible("FraudCheck est injoignable ou a dépassé le délai.") from erreur

        return Verdict(
            score=reponse.score,
            bloquer=reponse.bloquer,
            raison=reponse.raison,
        )
