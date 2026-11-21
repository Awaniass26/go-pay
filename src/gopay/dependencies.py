"""Injection des dépendances FastAPI."""

from typing import Annotated

from fastapi import Depends, Header

from gopay.models import Wallet
from gopay.repository import MemoireRepository
from gopay.services import GoPayService

_repo = MemoireRepository()


def get_repository() -> MemoireRepository:
    return _repo


def get_service(
    repo: Annotated[MemoireRepository, Depends(get_repository)],
) -> GoPayService:
    return GoPayService(repo)


Service = Annotated[GoPayService, Depends(get_service)]


def wallet_courant(
    service: Service,
    x_wallet_id: Annotated[int, Header()],
) -> Wallet:
    return service.lire_wallet(x_wallet_id)


WalletCourant = Annotated[Wallet, Depends(wallet_courant)]