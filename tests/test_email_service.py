from dataclasses import replace
from unittest.mock import patch

import pytest

from app.services.email_service import EmailDeliveryError, EmailService


def test_configured_when_key_and_from_present(settings):
    assert EmailService(settings).configured is True


def test_not_configured_without_key(settings):
    assert EmailService(replace(settings, resend_api_key=None)).configured is False


def test_send_otp_requires_api_key(settings):
    settings = replace(settings, resend_api_key=None)
    with pytest.raises(EmailDeliveryError, match="RESEND_API_KEY"):
        EmailService(settings).send_otp(to_email="a@b.com", code="123456", ttl_minutes=10)


@patch("app.services.email_service.resend.Emails.send")
def test_send_otp_success(mock_send, settings):
    mock_send.return_value = {"id": "msg-1"}
    EmailService(settings).send_otp(to_email="a@b.com", code="123456", ttl_minutes=10)
    mock_send.assert_called_once()
    params = mock_send.call_args[0][0]
    assert params["to"] == ["a@b.com"]
    assert "123456" in params["text"]


@patch("app.services.email_service.resend.Emails.send")
def test_send_share_invite_view_progress(mock_send, settings):
    mock_send.return_value = {"id": "msg-2"}
    EmailService(settings).send_share_invite(
        to_email="guest@example.com",
        owner_email="owner@example.com",
        tree_name="AI engineering",
        permission="view",
    )
    params = mock_send.call_args[0][0]
    assert "View progress" in params["html"]


@patch("app.services.email_service.resend.Emails.send")
def test_send_share_invite_edit(mock_send, settings):
    mock_send.return_value = {"id": "msg-3"}
    EmailService(settings).send_share_invite(
        to_email="guest@example.com",
        owner_email="owner@example.com",
        tree_name="AI engineering",
        permission="edit",
    )
    params = mock_send.call_args[0][0]
    assert "Can edit" in params["html"]


@patch("app.services.email_service.resend.Emails.send")
def test_send_includes_reply_to(mock_send, settings):
    settings = replace(settings, email_reply_to="support@example.com")
    mock_send.return_value = {"id": "msg-4"}
    EmailService(settings).send_otp(to_email="a@b.com", code="123456", ttl_minutes=10)
    params = mock_send.call_args[0][0]
    assert params["reply_to"] == "support@example.com"


@patch("app.services.email_service.resend.Emails.send")
def test_send_resend_error(mock_send, settings):
    from resend.exceptions import ResendError

    mock_send.side_effect = ResendError(
        500,
        "application_error",
        "upstream",
        "retry later",
    )
    with pytest.raises(EmailDeliveryError, match="Failed to send"):
        EmailService(settings).send_otp(to_email="a@b.com", code="123456", ttl_minutes=10)
