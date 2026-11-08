"""
Email tasks for Celery.
Handles asynchronous email sending (OTP, notifications, etc).
"""

from typing import List, Dict, Any, Optional
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from jinja2 import Template

from core.celery_config import app
from core.logger import get_logger
from core.configs import settings

logger = get_logger(__name__)


@app.task(
    bind=True,
    autoretry_for=(smtplib.SMTPException,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
    time_limit=300,
)
def send_otp_email(self, email: str, otp_code: str, fullname: Optional[str] = None):
    """
    Send OTP verification email.

    Args:
        email: Recipient email
        otp_code: OTP code
        fullname: Optional recipient name
    """
    try:
        subject = "Sheda - Your OTP Code"

        html_template = """
        <h1>Verify Your Email</h1>
        <p>Hello {{ fullname or 'User' }},</p>
        <p>Your OTP code is: <strong>{{ otp_code }}</strong></p>
        <p>This code will expire in 15 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
        """

        html_content = Template(html_template).render(
            fullname=fullname,
            otp_code=otp_code,
        )

        await _send_email(
            recipient=email,
            subject=subject,
            html_content=html_content,
        )

        logger.info(f"OTP email sent to {email}", task_id=self.request.id)
        return {"status": "success", "email": email}

    except Exception as e:
        logger.error(f"Failed to send OTP email: {str(e)}", task_id=self.request.id)
        raise


@app.task(
    bind=True,
    autoretry_for=(smtplib.SMTPException,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
    time_limit=300,
)
def send_welcome_email(self, email: str, fullname: str, account_type: str):
    """
    Send welcome email to new user.

    Args:
        email: Recipient email
        fullname: User's full name
        account_type: Account type (agent, client)
    """
    try:
        subject = f"Welcome to Sheda Solutions - {account_type.title() if account_type else 'User'}"

        html_template = """
        <h1>Welcome to Sheda Solutions!</h1>
        <p>Hello {{ fullname }},</p>
        <p>Welcome to our platform. We're excited to have you as a {{ account_type }}.</p>
        <p>You can now start exploring properties and connect with other users.</p>
        <p>If you have any questions, please don't hesitate to contact us.</p>
        """

        html_content = Template(html_template).render(
            fullname=fullname,
            account_type=account_type,
        )

        await _send_email(
            recipient=email,
            subject=subject,
            html_content=html_content,
        )

        logger.info(f"Welcome email sent to {email}", task_id=self.request.id)
        return {"status": "success", "email": email}

    except Exception as e:
        logger.error(f"Failed to send welcome email: {str(e)}", task_id=self.request.id)
        raise


@app.task(
    bind=True,
    autoretry_for=(smtplib.SMTPException,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
    time_limit=300,
)
def send_password_reset_email(
    self, email: str, reset_link: str, fullname: Optional[str] = None
):
    """
    Send password reset email.

    Args:
        email: Recipient email
        reset_link: Password reset link
        fullname: Optional user name
    """
    try:
        subject = "Reset Your Sheda Password"

        html_template = """
        <h1>Password Reset Request</h1>
        <p>Hello {{ fullname or 'User' }},</p>
        <p>We received a request to reset your password. Click the link below to proceed:</p>
        <p><a href="{{ reset_link }}">Reset Password</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
        """

        html_content = Template(html_template).render(
            fullname=fullname,
            reset_link=reset_link,
        )

        await _send_email(
            recipient=email,
            subject=subject,
            html_content=html_content,
        )

        logger.info(f"Password reset email sent to {email}", task_id=self.request.id)
        return {"status": "success", "email": email}

    except Exception as e:
        logger.error(
            f"Failed to send password reset email: {str(e)}", task_id=self.request.id
        )
        raise


@app.task(
    bind=True,
    autoretry_for=(smtplib.SMTPException,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
    time_limit=300,
)
def send_contract_notification_email(
    self,
    email: str,
    property_title: str,
    contract_amount: float,
    contract_type: str,
    fullname: Optional[str] = None,
):
    """
    Send contract notification email.

    Args:
        email: Recipient email
        property_title: Property title
        contract_amount: Contract amount
        contract_type: Contract type (rent, sell)
        fullname: Optional user name
    """
    try:
        subject = f"New Contract - {property_title}"

        html_template = """
        <h1>Contract Update</h1>
        <p>Hello {{ fullname or 'User' }},</p>
        <p>A new {{ contract_type }} contract has been created for:</p>
        <p><strong>{{ property_title }}</strong></p>
        <p>Amount: <strong>{{ contract_amount }}</strong></p>
        <p>Please log in to your dashboard to review the details.</p>
        """

        html_content = Template(html_template).render(
            fullname=fullname,
            contract_type=contract_type,
            property_title=property_title,
            contract_amount=contract_amount,
        )

        await _send_email(
            recipient=email,
            subject=subject,
            html_content=html_content,
        )

        logger.info(f"Contract notification sent to {email}", task_id=self.request.id)
        return {"status": "success", "email": email}

    except Exception as e:
        logger.error(
            f"Failed to send contract email: {str(e)}", task_id=self.request.id
        )
        raise


@app.task(
    bind=True,
    autoretry_for=(smtplib.SMTPException,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
    time_limit=300,
)
def send_bulk_email(
    self,
    recipients: List[str],
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
):
    """
    Send bulk email to multiple recipients.

    Args:
        recipients: List of email addresses
        subject: Email subject
        html_content: HTML email body
        text_content: Optional plain text email body
    """
    try:
        success_count = 0
        failed_count = 0

        for email in recipients:
            try:
                await _send_email(
                    recipient=email,
                    subject=subject,
                    html_content=html_content,
                    text_content=text_content,
                )
                success_count += 1
            except Exception as e:
                logger.error(f"Failed to send email to {email}: {str(e)}")
                failed_count += 1

        logger.info(
            f"Bulk email sent",
            task_id=self.request.id,
            success=success_count,
            failed=failed_count,
        )

        return {
            "status": "partial" if failed_count > 0 else "success",
            "success": success_count,
            "failed": failed_count,
            "total": len(recipients),
        }

    except Exception as e:
        logger.error(f"Bulk email task failed: {str(e)}", task_id=self.request.id)
        raise


# Helper functions


async def _send_email(
    recipient: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
) -> None:
    """
    Send email using SMTP.

    Args:
        recipient: Recipient email address
        subject: Email subject
        html_content: HTML email body
        text_content: Optional plain text body
    """
    try:
        # Create message
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_SEND_FROM_MAIL
        msg["To"] = recipient

        # Add text part
        if text_content:
            part1 = MIMEText(text_content, "plain")
            msg.attach(part1)

        # Add HTML part
        part2 = MIMEText(html_content, "html")
        msg.attach(part2)

        # Send email
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(msg)

        logger.debug(f"Email sent to {recipient}")

    except smtplib.SMTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Email sending failed: {str(e)}")
        raise
