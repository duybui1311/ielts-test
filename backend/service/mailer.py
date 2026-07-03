"""Transactional email, kept deliberately tiny.

Sends through the Resend HTTP API (free tier: resend.com — create an API key
and set RESEND_API_KEY + MAIL_FROM). When unconfigured, emails are logged to
the server console instead, so local/dev flows still work and links can be
copied from the logs.
"""
import logging
import os

logger = logging.getLogger("backend.mailer")


def is_configured() -> bool:
    return bool(os.getenv("RESEND_API_KEY") and os.getenv("MAIL_FROM"))


def send(to: str, subject: str, html: str) -> bool:
    """Send an email; returns True when handed to the provider. Unconfigured
    deployments log the message body (incl. any action link) and return False."""
    if not is_configured():
        logger.warning("Email not configured (RESEND_API_KEY/MAIL_FROM). "
                       "Would send to %s — %s\n%s", to, subject, html)
        return False
    import httpx  # lazy — already a transitive dependency

    try:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {os.getenv('RESEND_API_KEY')}"},
            json={
                "from": os.getenv("MAIL_FROM"),
                "to": [to],
                "subject": subject,
                "html": html,
            },
            timeout=15,
        )
        if resp.status_code >= 400:
            logger.error("Email send failed (%s): %s", resp.status_code, resp.text[:300])
            return False
        return True
    except Exception:  # noqa: BLE001 — email must never take the request down
        logger.exception("Email send failed")
        return False


def action_email(title: str, body: str, button_text: str, url: str) -> str:
    """Simple, client-safe HTML for a one-button action email."""
    return f"""
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h2 style="color:#4f46e5;margin:0 0 12px">Bandly</h2>
  <h3 style="margin:0 0 8px">{title}</h3>
  <p style="color:#444;line-height:1.6">{body}</p>
  <p style="margin:24px 0">
    <a href="{url}" style="background:#4f46e5;color:#fff;padding:12px 22px;border-radius:8px;
       text-decoration:none;font-weight:bold">{button_text}</a>
  </p>
  <p style="color:#888;font-size:12px">If the button doesn't work, copy this link:<br>{url}</p>
  <p style="color:#888;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
</div>"""
