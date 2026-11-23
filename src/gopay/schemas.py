"""Les schémas Pydantic : ce que l'API accepte en entrée et renvoie en sortie."""

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, computed_field, field_validator

# ---------- Types réutilisables (définis une fois, utilisés partout) ----------

# Numéro sénégalais : +221, puis 70, 75, 76, 77 ou 78, puis 7 chiffres
Telephone = Annotated[str, Field(pattern=r"^\+2217[05678]\d{7}$", examples=["+221770000000"])]

# Montant strictement positif, sans centimes (le FCFA n'en a pas)
Montant = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=0)]

# R1 : un transfert vaut au minimum 100 FCFA (ge = "supérieur ou égal")
MontantTransfert = Annotated[Decimal, Field(ge=100, max_digits=12, decimal_places=0)]


def nettoyer_telephone(valeur: object) -> object:
    """Accepte « +221 77 000 00 00 » en retirant les espaces."""
    if isinstance(valeur, str):
        return valeur.replace(" ", "")
    return valeur


# ---------- Wallets ----------


class WalletIn(BaseModel):
    """Ce que le client envoie pour ouvrir un wallet."""

    nom: str = Field(min_length=2, max_length=100)
    telephone: Telephone
    type: Literal["client", "marchand"] = "client"  # "client" si le champ est absent
    region: str = Field(default="Dakar", min_length=2, max_length=50)

    # mode="before" : on nettoie la valeur AVANT de vérifier le motif du téléphone
    @field_validator("telephone", mode="before")
    @classmethod
    def sans_espaces(cls, valeur: object) -> object:
        return nettoyer_telephone(valeur)


class WalletOut(BaseModel):
    """Ce que l'API montre d'un wallet."""

    model_config = ConfigDict(from_attributes=True)  # peut se construire depuis un objet Python

    id: int
    nom: str
    telephone: str
    type: str
    solde: Decimal
    cree_le: datetime
    region: str


class DepotIn(BaseModel):
    """Dépôt d'espèces chez un agent."""

    montant: Montant


# ---------- Transferts ----------


class TransfertIn(BaseModel):
    """Ce que le client a le droit d'envoyer : jamais les frais ni le statut."""

    beneficiaire_tel: Telephone
    montant: MontantTransfert  # R1

    @field_validator("beneficiaire_tel", mode="before")
    @classmethod
    def sans_espaces(cls, valeur: object) -> object:
        return nettoyer_telephone(valeur)


class TransfertOut(BaseModel):
    """Ce que l'API montre d'un transfert."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    expediteur_id: int
    beneficiaire_tel: str
    montant: Decimal
    frais: Decimal
    code_retrait: str
    statut: Literal["en_attente", "retire"]
    cree_le: datetime

    # Champ calculé, ajouté à la réponse : R3 (montant + frais)
    @computed_field  # type: ignore[prop-decorator]
    @property
    def total_debite(self) -> Decimal:
        return self.montant + self.frais


# ---------- Retraits ----------


class RetraitIn(BaseModel):
    """Retrait en espèces avec le code reçu."""

    code_retrait: str = Field(pattern=r"^\d{6}$")  # exactement 6 chiffres
    beneficiaire_tel: Telephone

    @field_validator("beneficiaire_tel", mode="before")
    @classmethod
    def sans_espaces(cls, valeur: object) -> object:
        return nettoyer_telephone(valeur)


class RetraitOut(BaseModel):
    transfert_id: int
    montant: Decimal
    statut: Literal["retire"]


# ---------- Paiements et historique ----------


class PaiementIn(BaseModel):
    """Paiement chez un marchand affilié (R7)."""

    marchand_id: int
    montant: Montant


class TransactionOut(BaseModel):
    """Une ligne de l'historique d'un wallet."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    wallet_id: int
    type: str
    montant: Decimal
    frais: Decimal
    solde_apres: Decimal
    reference: str | None
    cree_le: datetime
    beneficiaire_tel: str | None = None


class PageTransactions(BaseModel):
    """Une page d'historique, avec le curseur de la page suivante."""

    items: list[TransactionOut]
    next_cursor: int | None  # None = plus de page suivante


class WebhookIn(BaseModel):
    url: HttpUrl


class WebhookOut(BaseModel):
    marchand_id: int
    url: str
    secret: str
