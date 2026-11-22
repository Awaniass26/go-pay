"""Routes de configuration des webhooks marchands."""

from fastapi import APIRouter

from gopay.dependencies import Service
from gopay.schemas import WebhookIn, WebhookOut

router = APIRouter(prefix="/v1/marchands", tags=["Marchands"])


@router.put("/{marchand_id}/webhook")
def configurer_webhook(
    marchand_id: int,
    data: WebhookIn,
    service: Service,
) -> WebhookOut:
    url = str(data.url)
    secret = service.configurer_webhook(marchand_id, url)
    return WebhookOut(
        marchand_id=marchand_id,
        url=url,
        secret=secret,
    )