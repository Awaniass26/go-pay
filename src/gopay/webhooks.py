"""Signature et envoi sécurisé des webhooks."""

import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any
from urllib.parse import urlsplit

import httpx

logger = logging.getLogger(__name__)


def signer(secret: str, corps: bytes, horodatage: int) -> str:
    message = f"{horodatage}.".encode() + corps
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verifier(
    secret: str,
    corps: bytes,
    entete: str,
    tolerance: int = 300,
) -> bool:
    try:
        parties = dict(partie.split("=", 1) for partie in entete.split(","))
        horodatage = int(parties["t"])
        signature = parties["v1"]
    except (KeyError, ValueError):
        return False

    if abs(time.time() - horodatage) > tolerance:
        return False

    attendu = signer(secret, corps, horodatage)
    return hmac.compare_digest(attendu, signature)


class EnvoyeurWebhooks:
    def __init__(self, delai: float = 5.0, tentatives: int = 3) -> None:
        self._http = httpx.Client(
            timeout=delai,
            follow_redirects=False,
        )
        self._tentatives = tentatives
        self._hotes_autorises = {
            hote.strip().lower()
            for hote in os.environ.get(
                "GOPAY_WEBHOOK_HOSTS",
                "127.0.0.1,localhost",
            ).split(",")
            if hote.strip()
        }

    def _url_autorisee(self, url: str) -> bool:
        morceaux = urlsplit(url)
        hote = (morceaux.hostname or "").lower()

        if morceaux.username or morceaux.password or hote not in self._hotes_autorises:
            return False

        if morceaux.scheme == "https":
            return True

        return morceaux.scheme == "http" and hote in {"127.0.0.1", "localhost"}

    def envoyer(
        self,
        url: str,
        secret: str,
        evenement: dict[str, Any],
    ) -> bool:
        if not self._url_autorisee(url):
            logger.error("Webhook refusé : hôte non autorisé.")
            return False

        corps = json.dumps(evenement).encode()

        for essai in range(self._tentatives):
            horodatage = int(time.time())
            entetes = {
                "Content-Type": "application/json",
                "GoPay-Signature": (
                    f"t={horodatage},"
                    f"v1={signer(secret, corps, horodatage)}"
                ),
            }

            try:
                reponse = self._http.post(
                    url,
                    content=corps,
                    headers=entetes,
                )
            except httpx.HTTPError:
                reponse = None

            if reponse is not None and reponse.is_success:
                return True

            if essai < self._tentatives - 1:
                time.sleep(0.5 * 2**essai)

        logger.error("Échec du webhook après %s tentatives.", self._tentatives)
        return False