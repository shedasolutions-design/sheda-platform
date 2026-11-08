# from email.mime.application import MIMEApplication
from random import randint
from core.configs import settings, redis
from core.logger import logger
from core.dependecies import env

from typing import Literal, Optional, List, Tuple, Union
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate
from jinja2 import Environment
import os


def render_template(env: Environment, template_name: str, **context) -> str:
    """Renders an email template dynamically."""
    template = env.get_template(template_name)
    return template.render(**context)


MailTextType = Literal["plain", "html"]


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
    ) -> bool:
        """Sends an email using SMTP with optional file attachments."""
        try:
            # Prepare email
            msg = MIMEMultipart()
            msg["From"] = self.from_email
            msg["To"] = to_email
            msg["Date"] = formatdate(localtime=True)
            msg["Subject"] = subject
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


async def create_send_otp(email: str, length: int = 4) -> int:
    otp = "".join(str(randint(0, 9)) for _ in range(length))
    await redis.setex(settings.OTP_PREFIX.format(email), 300, otp)
    logger.info(f"otp saved to redis for {settings.verification_expire_delta} minutes")
    otp_text = render_template(
        env,
        settings.TEMPLATES["otp"],
        otp=otp,
        expiry=settings.verification_expire_delta,
        support_email=settings.SMTP_SEND_FROM_MAIL,
    )
    send_otp = await email_sender.send_email(
        text=otp_text, to_email=email, subject="OTP for Verification", text_type="html"
    )
    if settings.DEBUG_MODE:
        logger.info(f"OTP: {otp}")

    if send_otp:
        logger.info("OTP Sent")
        return True
    logger.error("Failed to send OTP")
    return False
