"""Serveur local de démonstration qui reçoit les webhooks Go Pay."""

import json
import os
from typing import Any

from fastapi import FastAPI, HTTPException, Request

from gopay.webhooks import verifier

SECRET = os.environ.get("MARCHAND_SECRET", "")
deja_traites: set[str] = set()
recus: list[dict[str, Any]] = []

app = FastAPI(title="Marchand de démonstration")


@app.post("/hooks/gopay")
async def recevoir(request: Request) -> dict[str, str]:
    corps = await request.body()
    entete = request.headers.get("GoPay-Signature", "")

    if not SECRET or not verifier(SECRET, corps, entete):
        raise HTTPException(
            status_code=401,
            detail="Signature invalide ou message trop ancien.",
        )

    evenement = json.loads(corps)
    event_id = evenement.get("event_id")

    if not isinstance(event_id, str):
        raise HTTPException(status_code=400, detail="event_id manquant.")

    if event_id in deja_traites:
        return {"statut": "deja_traite"}

    deja_traites.add(event_id)
    recus.append(evenement)
    print(
        f"Paiement reçu : {evenement['montant']} FCFA "
        f"du client {evenement['client_id']}"
    )
    return {"statut": "recu"}


@app.get("/recus")
def lister() -> list[dict[str, Any]]:
    return recus