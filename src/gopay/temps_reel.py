"""Notifications WebSocket et suivi des transferts en SSE."""

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from gopay.dependencies import get_repository
from gopay.errors import RessourceIntrouvable
from gopay.repository import MemoireRepository

router = APIRouter(tags=["Temps réel"])


class GestionnaireAgents:
    """Garde en mémoire les connexions WebSocket des agents."""

    def __init__(self) -> None:
        self.connexions: dict[int, set[WebSocket]] = {}

    async def connecter(self, agent_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self.connexions.setdefault(agent_id, set()).add(ws)

    def deconnecter(self, agent_id: int, ws: WebSocket) -> None:
        connexions = self.connexions.get(agent_id)
        if connexions is not None:
            connexions.discard(ws)
            if not connexions:
                self.connexions.pop(agent_id, None)

    async def diffuser(self, message: dict[str, Any]) -> None:
        """Diffuse une alerte sans jamais transmettre le code de retrait."""
        for agent_id, connexions in list(self.connexions.items()):
            for ws in list(connexions):
                try:
                    await ws.send_json(message)
                except WebSocketDisconnect:
                    self.deconnecter(agent_id, ws)


agents = GestionnaireAgents()


@router.websocket("/ws/agents/{agent_id}")
async def canal_agent(ws: WebSocket, agent_id: int) -> None:
    await agents.connecter(agent_id, ws)
    try:
        while True:
            message = await ws.receive_json()
            await ws.send_json({"type": "accuse", "recu": message})
    except WebSocketDisconnect:
        agents.deconnecter(agent_id, ws)


async def evenements(
    repo: MemoireRepository,
    transfert_id: int,
) -> AsyncIterator[str]:
    """Envoie les changements de statut pendant 60 secondes maximum."""
    dernier_statut: str | None = None

    for numero in range(1, 121):
        transfert = repo.transferts.get(transfert_id)
        if transfert is None:
            return

        if transfert.statut != dernier_statut:
            dernier_statut = transfert.statut
            donnees = json.dumps(
                {"transfert": transfert_id, "statut": transfert.statut}
            )
            yield f"id: {numero}\nevent: statut\ndata: {donnees}\n\n"

        if transfert.statut == "retire":
            return

        await asyncio.sleep(0.5)


@router.get("/v1/transferts/{transfert_id}/suivi")
async def suivre(
    transfert_id: int,
    repo: Annotated[MemoireRepository, Depends(get_repository)],
) -> StreamingResponse:
    if transfert_id not in repo.transferts:
        raise RessourceIntrouvable(
            f"Aucun transfert avec l'identifiant {transfert_id}."
        )

    return StreamingResponse(
        evenements(repo, transfert_id),
        media_type="text/event-stream",
    )