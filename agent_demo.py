"""Agent local qui affiche les alertes WebSocket reçues."""

import asyncio
import json

import websockets


async def ecouter(agent_id: int) -> None:
    url = f"ws://127.0.0.1:8000/ws/agents/{agent_id}"
    async with websockets.connect(url) as websocket:
        print(f"Agent {agent_id} connecté. Ctrl+C pour quitter.")
        async for message in websocket:
            print("Alerte reçue :", json.loads(message))


asyncio.run(ecouter(7))