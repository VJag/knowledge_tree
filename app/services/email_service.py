from __future__ import annotations

import html
import logging

import resend
from resend.exceptions import ResendError

from app.config import Settings

logger = logging.getLogger("knowledgetree.email")


class EmailDeliveryError(RuntimeError):
    pass


class EmailService:
    def __init__(self, settings: Settings):
        self.settings = settings

    @property
    def configured(self) -> bool:
        return bool((self.settings.resend_api_key or "").strip() and (self.settings.email_from or "").strip())

    def send_otp(self, *, to_email: str, code: str, ttl_minutes: int) -> None:
        safe_code = html.escape(code)
        subject = "Your KnowledgeTree sign-in code"
        html_body = f"""
<p>Hi,</p>
<p>Your sign-in code for KnowledgeTree is:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px">{safe_code}</p>
<p>This code expires in {ttl_minutes} minutes. If you did not request it, you can ignore this email.</p>
<p>— KnowledgeTree</p>
""".strip()
        text = (
            "Hi,\n\n"
            f"Your sign-in code for KnowledgeTree is: {code}\n\n"
            f"This code expires in {ttl_minutes} minutes.\n\n"
            "— KnowledgeTree"
        )
        self._send(to_email=to_email, subject=subject, html_body=html_body, text=text)

    def send_share_invite(
        self,
        *,
        to_email: str,
        owner_email: str,
        tree_name: str,
        permission: str,
        app_url: str | None = None,
    ) -> None:
        safe_tree = html.escape(tree_name)
        safe_owner = html.escape(owner_email)
        can_edit = permission == "edit"
        access_label = "Can edit" if can_edit else "View progress"
        access_detail = (
            "You can browse and change topics in this map."
            if can_edit
            else "You can browse the map, levels, notes, and history — but not make changes."
        )
        link = html.escape((app_url or "").rstrip("/") or "https://knowledgetree.app")
        subject = f'{owner_email} shared “{tree_name}” with you'
        html_body = f"""
<p>Hi,</p>
<p><strong>{safe_owner}</strong> shared a knowledge map with you on KnowledgeTree:</p>
<p style="font-size:18px;font-weight:700;margin:16px 0">{safe_tree}</p>
<p><strong>{access_label}</strong> — {access_detail}</p>
<p>Sign in with <strong>{html.escape(to_email)}</strong>, then tap <strong>Sync</strong> to open the map in MY TREES.</p>
<p><a href="{link}">Open KnowledgeTree</a></p>
<p>— KnowledgeTree</p>
""".strip()
        text = (
            f"Hi,\n\n"
            f"{owner_email} shared “{tree_name}” with you on KnowledgeTree.\n\n"
            f"Access: {access_label} — {access_detail}\n\n"
            f"Sign in with {to_email}, then tap Sync to open the map.\n\n"
            f"Open KnowledgeTree: {link}\n\n"
            "— KnowledgeTree"
        )
        self._send(to_email=to_email, subject=subject, html_body=html_body, text=text)

    def _send(self, *, to_email: str, subject: str, html_body: str, text: str) -> None:
        api_key = (self.settings.resend_api_key or "").strip()
        from_email = (self.settings.email_from or "").strip()
        if not api_key:
            raise EmailDeliveryError("RESEND_API_KEY is not configured")
        if not from_email:
            raise EmailDeliveryError("EMAIL_FROM is not configured")

        resend.api_key = api_key
        params: resend.Emails.SendParams = {
            "from": f"KnowledgeTree <{from_email}>",
            "to": [to_email],
            "subject": subject,
            "html": html_body,
            "text": text,
        }
        reply_to = (self.settings.email_reply_to or "").strip()
        if reply_to:
            params["reply_to"] = reply_to

        try:
            response = resend.Emails.send(params)
        except ResendError as exc:
            logger.error("resend_send_failed code=%s message=%s", exc.code, exc.message)
            raise EmailDeliveryError(f"Failed to send email: {exc.message}") from exc
        except Exception as exc:
            logger.exception("resend_send_failed")
            raise EmailDeliveryError("Failed to send email") from exc

        message_id = response.get("id") if isinstance(response, dict) else getattr(response, "id", None)
        logger.info("email_sent to=%s subject=%s id=%s", to_email, subject, message_id)
