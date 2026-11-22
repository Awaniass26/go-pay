"""Injection des dépendances FastAPI."""

import os
from typing import Annotated

from fastapi import Depends, Header

from gopay.fraude.client import ClientFraude
from gopay.models import Wallet
from gopay.repository import MemoireRepository
from gopay.services import AntiFraude, GoPayService

_repo = MemoireRepository()
_antifraude = ClientFraude(os.environ.get("GOPAY_FRAUDE_ADRESSE", "localhost:50051"))


def get_repository() -> MemoireRepository:
    return _repo


def get_antifraude() -> AntiFraude:
    return _antifraude


def get_service(
    repo: Annotated[MemoireRepository, Depends(get_repository)],
    antifraude: Annotated[AntiFraude, Depends(get_antifraude)],
) -> GoPayService:
    return GoPayService(repo, antifraude)


Service = Annotated[GoPayService, Depends(get_service)]


def wallet_courant(
    service: Service,
    x_wallet_id: Annotated[int, Header()],
) -> Wallet:
    return service.lire_wallet(x_wallet_id)


WalletCourant = Annotated[Wallet, Depends(wallet_courant)]
