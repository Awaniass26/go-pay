"""API GraphQL en lecture seule pour explorer les wallets et transactions."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

import strawberry
from fastapi import Depends
from strawberry.dataloader import DataLoader
from strawberry.fastapi import BaseContext, GraphQLRouter

from gopay import models
from gopay.dependencies import get_repository
from gopay.repository import MemoireRepository

LIMITE_MAX = 100


class Contexte(BaseContext):
    """Données partagées par les résolveurs d'une requête GraphQL."""

    def __init__(self, repo: MemoireRepository) -> None:
        super().__init__()
        self.repo = repo
        self.lectures_wallets = 0
        self.wallets = DataLoader(load_fn=self.charger_wallets)

    async def charger_wallets(self, ids: list[int]) -> list[Wallet]:
        """Charge les wallets demandés en une seule fois."""
        self.lectures_wallets += 1
        return [Wallet.depuis(self.repo.wallets[wallet_id]) for wallet_id in ids]


Info = strawberry.Info[Contexte, None]


@strawberry.type
class Wallet:
    id: int
    nom: str
    type: str
    region: str
    solde: Decimal

    @classmethod
    def depuis(cls, wallet: models.Wallet) -> Wallet:
        return cls(
            id=wallet.id,
            nom=wallet.nom,
            type=wallet.type,
            region=wallet.region,
            solde=wallet.solde,
        )

    @strawberry.field
    def transactions(self, info: Info, limite: int = 10) -> list[Transaction]:
        nombre = max(0, min(limite, LIMITE_MAX))
        items = info.context.repo.transactions_du_wallet(self.id, None, nombre)
        return [Transaction.depuis(transaction) for transaction in items]


@strawberry.type
class Transaction:
    id: int
    type: str
    montant: Decimal
    frais: Decimal
    wallet_id: strawberry.Private[int]

    @classmethod
    def depuis(cls, transaction: models.Transaction) -> Transaction:
        return cls(
            id=transaction.id,
            type=transaction.type,
            montant=transaction.montant,
            frais=transaction.frais,
            wallet_id=transaction.wallet_id,
        )

    @strawberry.field
    async def wallet(self, info: Info) -> Wallet:
        """Le DataLoader regroupe les lectures de wallets."""
        return await info.context.wallets.load(self.wallet_id)


@strawberry.type
class Query:
    @strawberry.field
    def wallets(self, info: Info, limite: int = 20) -> list[Wallet]:
        nombre = max(0, min(limite, LIMITE_MAX))
        wallets = list(info.context.repo.wallets.values())[:nombre]
        return [Wallet.depuis(wallet) for wallet in wallets]

    @strawberry.field
    def transactions(
        self,
        info: Info,
        type: str | None = None,
        limite: int = 20,
    ) -> list[Transaction]:
        nombre = max(0, min(limite, LIMITE_MAX))
        transactions = [
            transaction
            for transaction in info.context.repo.transactions.values()
            if type is None or transaction.type == type
        ][:nombre]
        return [Transaction.depuis(transaction) for transaction in transactions]


def get_contexte(
    repo: Annotated[MemoireRepository, Depends(get_repository)],
) -> Contexte:
    return Contexte(repo)


schema = strawberry.Schema(query=Query)
graphql_router: GraphQLRouter[Contexte, None] = GraphQLRouter(
    schema,
    context_getter=get_contexte,
)
