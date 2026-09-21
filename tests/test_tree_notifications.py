"""Tests for share/update email notifications and sync email counts."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.models import User
from app.services.trees_service import TreesService, UPDATE_EMAIL_THROTTLE
from tests.conftest import MockConn


def _owner():
    return User(id="owner-1", email="owner@example.com", name="Owner")


def _editor():
    return User(id="editor-1", email="editor@example.com", name="Editor")


@patch("app.services.trees_service.EmailService")
def test_notify_after_tree_update_owner_emails_view_sharees(mock_mailer_cls, settings):
    service = TreesService(settings)
    mock_mailer_cls.return_value.configured = True
    with patch.object(
        service,
        "_email_view_sharees_progress_update",
        return_value=2,
    ) as mock_progress:
        counts = service._notify_after_tree_update(
            _owner(),
            tree_id="tree-1",
            tree_name="Map",
            role="owner",
            app_url="http://localhost:8000",
        )
    mock_progress.assert_called_once()
    assert counts == {"progress": 2, "collaborator": 0}


@patch("app.services.trees_service.EmailService")
def test_notify_after_tree_update_edit_emails_owner(mock_mailer_cls, settings):
    service = TreesService(settings)
    mock_mailer_cls.return_value.configured = True
    with patch.object(
        service,
        "_email_owner_collaborator_update",
        return_value=1,
    ) as mock_collab:
        counts = service._notify_after_tree_update(
            _editor(),
            tree_id="tree-1",
            tree_name="Map",
            role="edit",
            app_url="http://localhost:8000",
        )
    mock_collab.assert_called_once()
    assert counts == {"progress": 0, "collaborator": 1}


@patch("app.services.trees_service.EmailService")
def test_notify_after_tree_update_view_role_skips(mock_mailer_cls, settings):
    service = TreesService(settings)
    mock_mailer_cls.return_value.configured = True
    counts = service._notify_after_tree_update(
        User(id="v1", email="viewer@example.com", name=None),
        tree_id="tree-1",
        tree_name="Map",
        role="view",
        app_url=None,
    )
    assert counts == {"progress": 0, "collaborator": 0}


@patch("app.services.trees_service.EmailService")
def test_notify_skips_when_email_not_configured(mock_mailer_cls, settings):
    service = TreesService(settings)
    mock_mailer_cls.return_value.configured = False
    counts = service._notify_after_tree_update(
        _owner(),
        tree_id="tree-1",
        tree_name="Map",
        role="owner",
        app_url=None,
    )
    assert counts == {"progress": 0, "collaborator": 0}


def test_should_send_update_notice_respects_throttle(settings, patch_trees_get_conn):
    service = TreesService(settings)
    recent = datetime.now(timezone.utc) - timedelta(hours=1)
    cursor = MagicMock()
    cursor.fetchone.return_value = {"sent_at": recent}
    conn = MockConn([cursor])
    with patch_trees_get_conn(conn):
        with patch("app.services.trees_service.get_conn", return_value=conn):
            assert (
                service._should_send_update_notice(
                    conn,
                    tree_id="tree-1",
                    recipient_user_id="user-1",
                    notice_kind="progress_update",
                )
                is False
            )


def test_should_send_update_notice_allows_after_window(settings):
    service = TreesService(settings)
    old = datetime.now(timezone.utc) - UPDATE_EMAIL_THROTTLE - timedelta(minutes=5)
    cursor = MagicMock()
    cursor.fetchone.return_value = {"sent_at": old}
    conn = MockConn([cursor])
    assert (
        service._should_send_update_notice(
            conn,
            tree_id="tree-1",
            recipient_user_id="user-1",
            notice_kind="progress_update",
        )
        is True
    )


@patch("app.services.trees_service.EmailService")
def test_collaborator_update_emails_owner(mock_mailer_cls, settings, patch_trees_get_conn):
    mock_mailer_cls.return_value.configured = True
    owner_row = {"id": "owner-1", "email": "owner@example.com"}
    owner_cursor = MagicMock()
    owner_cursor.fetchone.return_value = owner_row
    notice_cursor = MagicMock()
    notice_cursor.fetchone.return_value = None
    conn = MockConn([owner_cursor, notice_cursor, MagicMock()])
    service = TreesService(settings)
    with patch_trees_get_conn(conn):
        sent = service._email_owner_collaborator_update(
            _editor(),
            tree_id="tree-1",
            tree_name="Shared map",
            app_url="http://localhost:8000",
            mailer=mock_mailer_cls.return_value,
        )
    assert sent == 1
    mock_mailer_cls.return_value.send_collaborator_update.assert_called_once()


@patch("app.services.trees_service.EmailService")
def test_progress_update_throttled_skips_send(mock_mailer_cls, settings, patch_trees_get_conn):
    mock_mailer_cls.return_value.configured = True
    view_sharee = {"id": "guest-1", "email": "mentee@example.com"}
    share_cursor = MagicMock()
    share_cursor.fetchall.return_value = [view_sharee]
    notice_cursor = MagicMock()
    notice_cursor.fetchone.return_value = {"sent_at": datetime.now(timezone.utc)}
    conn = MockConn([share_cursor, notice_cursor])
    service = TreesService(settings)
    with patch_trees_get_conn(conn):
        sent = service._email_view_sharees_progress_update(
            _owner(),
            tree_id="tree-1",
            tree_name="Map",
            app_url=None,
            mailer=mock_mailer_cls.return_value,
        )
    assert sent == 0
    mock_mailer_cls.return_value.send_progress_update.assert_not_called()


@patch("app.services.trees_service.TreesService._notify_after_tree_update")
@patch("app.services.trees_service.TreesService.update_tree")
def test_sync_includes_emails_sent_on_update(mock_update, mock_notify, settings, user):
    from app.models import TreeAccess

    updated = TreeAccess(
        id="tree-1",
        owner_id=user.id,
        name="Map",
        document={"name": "Map", "root": {"id": "r", "name": "Map"}, "topics": []},
        version=3,
        role="owner",
        updated_at=datetime.now(timezone.utc).isoformat(),
        owner_email=user.email,
    )
    mock_update.return_value = updated
    mock_notify.return_value = {"progress": 1, "collaborator": 0}
    service = TreesService(settings)
    with patch.object(service, "list_accessible", return_value=[]):
        result = service.sync(
            user,
            trees=[
                {
                    "localId": "local-1",
                    "cloudId": "tree-1",
                    "document": updated.document,
                    "version": 2,
                }
            ],
            app_url="http://localhost:8000",
        )
    assert result["emailsSent"] == {"progress": 1, "collaborator": 0}
    mock_notify.assert_called_once()


@patch("app.services.trees_service.EmailService")
def test_add_share_permission_change_email(mock_mailer_cls, settings, user, patch_trees_get_conn):
    mock_mailer_cls.return_value.configured = True
    select_user = MagicMock()
    select_user.fetchone.return_value = {"id": "guest-1", "email": "guest@example.com"}
    prev_perm = MagicMock()
    prev_perm.fetchone.return_value = {"permission": "view"}
    conn = MockConn([select_user, prev_perm, MagicMock()])
    service = TreesService(settings)
    with patch.object(service, "_get_access", return_value=MagicMock(role="owner", name="Map")):
        with patch_trees_get_conn(conn):
            result = service.add_share(
                user,
                "tree-1",
                email="guest@example.com",
                permission="edit",
                app_url="http://localhost:8000",
            )
    assert result.get("permissionEmailSent") is True
    mock_mailer_cls.return_value.send_share_permission_changed.assert_called_once()


@patch("app.services.trees_service.EmailService")
def test_remove_share_sends_email(mock_mailer_cls, settings, user, patch_trees_get_conn):
    mock_mailer_cls.return_value.configured = True
    grantee_cursor = MagicMock()
    grantee_cursor.fetchone.return_value = {"id": "guest-1", "email": "guest@example.com"}
    conn = MockConn([grantee_cursor, MagicMock()])
    service = TreesService(settings)
    access = MagicMock(role="owner", name="Map")
    with patch.object(service, "_get_access", return_value=access):
        with patch_trees_get_conn(conn):
            service.remove_share(
                user,
                "tree-1",
                email="guest@example.com",
                app_url="http://localhost:8000",
            )
    mock_mailer_cls.return_value.send_share_removed.assert_called_once()
