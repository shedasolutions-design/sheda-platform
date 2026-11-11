"""
Sending email through Brevo's HTTP API.

SMTP needs a raw TCP connection, which Cloudflare Workers cannot open from
Python. Brevo (the provider this backend already relayed through) also takes
mail as an HTTPS request, which works everywhere. When BREVO_API_KEY is set,
every email goes this way; without it, the SMTP path is used as before.
"""

import base64
import os
from typing import List, Optional, Tuple, Union

import httpx

from core.configs import settings
from core.logger import logger

BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"


def brevo_enabled() -> bool:
    return bool(settings.BREVO_API_KEY)


async def send_via_brevo(
    to_email: str,
    subject: str,
    html: Optional[str] = None,
    text: Optional[str] = None,
    attachments: Optional[List[Union[str, Tuple[str, str]]]] = None,
) -> bool:
    """Send one email. Returns True on success, False (and logs) on failure."""
    payload: dict = {
        "sender": {"email": settings.SMTP_SEND_FROM_MAIL, "name": "Sheda"},
        "to": [{"email": to_email}],
        "subject": subject,
    }
    if html:
        payload["htmlContent"] = html
    if text:
        payload["textContent"] = text
    if not html and not text:
        payload["textContent"] = ""

    if attachments:
        files = []
        for item in attachments:
            path, name = (item, os.path.basename(item)) if isinstance(item, str) else item
            if not os.path.exists(path):
                logger.warning(f"Attachment not found: {path}")
                continue
            with open(path, "rb") as f:
                files.append({"name": name, "content": base64.b64encode(f.read()).decode()})
        if files:
            payload["attachment"] = files

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                BREVO_SEND_URL,
                json=payload,
                headers={"api-key": settings.BREVO_API_KEY or "", "accept": "application/json"},
            )
        if res.status_code >= 300:
            logger.error(f"Brevo rejected email ({res.status_code}): {res.text[:300]}")
            return False
        logger.info("Email sent via Brevo")
        return True
    except Exception as e:
        logger.error(f"Brevo send failed: {e}")
        return False
