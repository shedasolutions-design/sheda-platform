# from email.mime.application import MIMEApplication
import secrets
from core.configs import settings, redis
from core.logger import logger
from core.dependecies import env

from typing import Literal, Optional, List, Tuple, Union
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate
from datetime import datetime, timezone
from jinja2 import Environment, FileSystemLoader
import os


def render_template(env: Environment, template_name: str, **context) -> str:
    """Renders an email template dynamically."""
    template = env.get_template(template_name)
    return template.render(**context)


MailTextType = Literal["plain", "html"]

# The branded layout every Sheda email uses. Its own environment, with
# autoescape on: property names and other text people typed go into it.
_branded_env = Environment(
    loader=FileSystemLoader(os.path.join(settings.BASE_DIR, "templates")), autoescape=True
)
LOGO_URL = "https://www.sheda.app/images/shedddddddddd-1.png"


def site_url() -> str:
    return "https://market.sheda.app" if settings.NEAR_NETWORK == "mainnet" else "https://testing.sheda.app"


def support_address() -> str:
    return settings.EMAIL_REPLY_TO or settings.SMTP_SEND_FROM_MAIL or "support@sheda.app"


def branded_email(
    heading: str,
    paragraphs: List[str],
    *,
    cta_label: Optional[str] = None,
    cta_url: Optional[str] = None,
    code: Optional[str] = None,
    code_note: Optional[str] = None,
    notice: Optional[str] = None,
    footnote: Optional[str] = None,
    settings_url: Optional[str] = None,
    preheader: Optional[str] = None,
) -> Tuple[str, str]:
    """One email in Sheda's layout: the HTML and its plain-text twin.

    Both go out together, so a client that shows only text (or a spam
    filter that reads it) gets the same message."""
    network_note = "Testnet: test money only" if settings.NEAR_NETWORK == "testnet" else None
    html = _branded_env.get_template("email_layout.html").render(
        heading=heading,
        paragraphs=paragraphs,
        cta_label=cta_label,
        cta_url=cta_url,
        code=code,
        code_note=code_note,
        notice=notice,
        footnote=footnote,
        settings_url=settings_url,
        preheader=preheader,
        network_note=network_note,
        site_url=site_url(),
        logo_url=LOGO_URL,
        support_email=support_address(),
        year=datetime.now(timezone.utc).year,
    )
    lines = [heading, ""]
    lines += [p for para in paragraphs for p in (para, "")]
    if code:
        lines += [code, ""]
        if code_note:
            lines += [code_note, ""]
    if cta_url:
        lines += [f"{cta_label or 'Open Sheda'}: {cta_url}", ""]
    if notice:
        lines += [notice, ""]
    lines += ["--", "Sheda Solutions. Revolutionizing real estate operations"]
    if footnote:
        lines.append(footnote + (f" Notification settings: {settings_url}" if settings_url else ""))
    lines.append(f"Help: {support_address()}")
    return html, "\n".join(lines)


class EmailSender:
    def __init__(
        self, smtp_host: str, smtp_user: str, smtp_pass: str, from_email: str, port: int
    ):
        self.smtp_host = smtp_host
        self.smtp_user = smtp_user
        self.smtp_pass = smtp_pass
        self.from_email = from_email
        self.port = port

    async def send_email(
        self,
        text: str,
        to_email: str,
        subject: str,
        text_type: MailTextType = "plain",
        attachments: Optional[
            List[Union[str, Tuple[str, str]]]
        ] = None,  # Now supports single file paths too
        alt_text: Optional[str] = None,  # plain-text twin of an HTML email
    ) -> bool:
        """Sends an email (Brevo's API when configured, else SMTP), with optional attachments."""
        from app.utils.brevo import brevo_enabled, send_via_brevo
        from core.configs import settings

        # Someone with accounts on both sites can tell at a glance which one
        # an email (a sign-in code, say) is for.
        if settings.NEAR_NETWORK == "testnet" and not subject.startswith("[Testnet]"):
            subject = f"[Testnet] {subject}"

        if brevo_enabled():
            return await send_via_brevo(
                to_email,
                subject,
                html=text if text_type == "html" else None,
                text=text if text_type == "plain" else alt_text,
                attachments=attachments,
            )
        try:
            # Prepare email
            msg = MIMEMultipart()
            msg["From"] = formataddr((settings.EMAIL_FROM_NAME or "Sheda Solutions", self.from_email))
            msg["To"] = to_email
            msg["Date"] = formatdate(localtime=True)
            msg["Subject"] = subject
            if settings.EMAIL_REPLY_TO:
                msg["Reply-To"] = settings.EMAIL_REPLY_TO
            if text_type == "html" and alt_text:
                body = MIMEMultipart("alternative")
                body.attach(MIMEText(alt_text, "plain"))
                body.attach(MIMEText(text, "html"))
                msg.attach(body)
            else:
                msg.attach(MIMEText(text, text_type))

            # Attach files if provided
            if attachments:
                for attachment in attachments:
                    if isinstance(attachment, str):
                        filepath = attachment
                        filename = os.path.basename(
                            filepath
                        )  # Default to actual file name
                    else:
                        filepath, filename = attachment

                    if not os.path.exists(filepath):
                        logger.warning(f"Attachment not found: {filepath}")
                        continue

                    with open(filepath, "rb") as f:
                        part = MIMEApplication(f.read(), Name=filename)
                    part["Content-Disposition"] = f'attachment; filename="{filename}"'
                    msg.attach(part)

            # Send email
            smtp = smtplib.SMTP(self.smtp_host, port=self.port)
            smtp.starttls()
            smtp.login(user=self.smtp_user, password=self.smtp_pass)
            smtp.sendmail(self.from_email, to_email, msg.as_string())
            smtp.quit()

            logger.info("Email sent successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to send email: {str(e)}")
            return False


email_sender = EmailSender(
    smtp_host=settings.SMTP_HOST,
    smtp_user=settings.SMTP_USERNAME,
    smtp_pass=settings.SMTP_PASSWORD,
    from_email=settings.SMTP_SEND_FROM_MAIL,
    port=settings.SMTP_PORT,
)


OTP_TTL_MINUTES = 5

# What each code is for, in the words the email uses.
OTP_PURPOSES = {
    "verify": (
        "Your Sheda verification code",
        "Use this code to verify your email and continue in Sheda.",
        "If you didn't create a Sheda account, you can ignore this email.",
    ),
    "signin": (
        "Your Sheda sign-in code",
        "Someone is signing in to your Sheda account on a new device. If it's you, enter this code to finish.",
        "If this wasn't you, don't share the code and change your password in Sheda.",
    ),
    "action": (
        "Confirm it's you on Sheda",
        "Use this code to confirm a change to your Sheda account, such as your transaction PIN, viewing your wallet keys or deleting your account.",
        "If you didn't ask for this, don't share the code, and change your password in Sheda.",
    ),
    "email_change": (
        "Confirm your new email for Sheda",
        "Use this code to make this your Sheda email address.",
        "If you didn't ask to change your Sheda email, you can ignore this email. Nothing changes.",
    ),
    "reset": (
        "Reset your Sheda password",
        "Use this code to choose a new password for your Sheda account.",
        "If you didn't ask to reset your password, you can ignore this email. Your password stays the same.",
    ),
}


async def create_send_otp(email: str, length: int = 4, purpose: str = "verify") -> int:
    # secrets, not random: a login code must not be predictable from earlier ones.
    otp = "".join(str(secrets.randbelow(10)) for _ in range(length))
    await redis.setex(settings.OTP_PREFIX.format(email), OTP_TTL_MINUTES * 60, otp)
    logger.info(f"otp saved for {OTP_TTL_MINUTES} minutes ({purpose})")
    subject, lead, footnote = OTP_PURPOSES.get(purpose, OTP_PURPOSES["verify"])
    html, plain = branded_email(
        subject,
        [lead],
        code=otp,
        code_note=f"It expires in {OTP_TTL_MINUTES} minutes.",
        notice="Never share this code. Sheda staff will never ask you for it.",
        footnote=footnote,
        preheader=f"Your code is {otp}",
    )
    send_otp = await email_sender.send_email(
        text=html, to_email=email, subject=subject, text_type="html", alt_text=plain
    )
    if settings.DEBUG_MODE:
        logger.info(f"OTP: {otp}")

    if send_otp:
        logger.info("OTP Sent")
        return True
    logger.error("Failed to send OTP")
    return False
