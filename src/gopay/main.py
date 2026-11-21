"""Point d'entrée de l'application."""

from fastapi import FastAPI

from gopay.errors import installer_gestionnaires
from gopay.routers import operations, wallets

app = FastAPI(
    title="Go Pay API",
    version="1.0.0",
    description="API Go Pay - TD1",
)

installer_gestionnaires(app)
app.include_router(wallets.router)
app.include_router(operations.router)


@app.get("/health", tags=["Supervision"])
def health() -> dict[str, str]:
    return {"statut": "ok"}