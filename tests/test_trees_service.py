from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.models import TreeAccess, User
from app.services.trees_service import TreesService, _validate_document
from tests.conftest import MockConn


def _access(**overrides):
    base = {
        "id": "tree-1",
        "owner_id": "user-1",
        "name": "My tree",
        "document": {"name": "My tree", "root": {"id": "r", "name": "My tree"}, "topics": []},
        "version": 1,
        "role": "owner",
        "updated_at": datetime(2026, 9, 21, tzinfo=timezone.utc),
        "owner_email": "owner@example.com",
    }
    base.update(overrides)
    return TreeAccess(
        id=base["id"],
        owner_id=base["owner_id"],
        name=base["name"],
        document=base["document"],
        version=base["version"],
        role=base["role"],
        updated_at=base["updated_at"].isoformat(),
        owner_email=base["owner_email"],
    )


def test_create_tree_validates_document(settings, user, patch_trees_get_conn):
    row = {
        "id": "tree-1",
        "owner_id": user.id,
        "name": "Tree",
        "document": {"name": "Tree", "root": {"id": "r", "name": "Tree"}, "topics": []},
        "version": 1,
        "updated_at": datetime.now(timezone.utc),
    }
    cursor = MagicMock()
    cursor.fetchone.return_value = row
    conn = MockConn([cursor])
    with patch_trees_get_conn(conn):
        created = TreesService(settings).create_tree(
            user,
            name="Tree",
            document={"name": "Tree", "root": {"id": "r", "name": "Tree"}, "topics": []},
        )
    assert created.role == "owner"
    assert created.version == 1


def test_update_tree_view_only_forbidden(settings, user):
    service = TreesService(settings)
    with patch.object(service, "_get_access", return_value=_access(role="view")):
        with pytest.raises(PermissionError, match="read-only"):
            service.update_tree(
                user,
                "tree-1",
                name=None,
                document={"name": "X", "root": {"id": "r", "name": "X"}, "topics": []},
                expected_version=1,
            )


def test_delete_tree_requires_owner(settings, user):
    service = TreesService(settings)
    with patch.object(service, "_get_access", return_value=_access(role="edit")):
        with pytest.raises(PermissionError, match="owner"):
            service.delete_tree(user, "tree-1")


def test_add_share_rejects_self(settings, user):
    service = TreesService(settings)
    with patch.object(service, "_get_access", return_value=_access(role="owner")):
        with pytest.raises(ValueError, match="already own"):
            service.add_share(user, "tree-1", email=user.email, permission="view")


def test_add_share_invalid_permission(settings, user):
    service = TreesService(settings)
    with patch.object(service, "_get_access", return_value=_access(role="owner")):
        with pytest.raises(ValueError, match="view or edit"):
            service.add_share(user, "tree-1", email="other@example.com", permission="admin")


@patch("app.services.trees_service.EmailService")
def test_add_share_creates_user_and_share(mock_mailer, settings, user, patch_trees_get_conn):
    mock_mailer.return_value.configured = False
    select_cursor = MagicMock()
    select_cursor.fetchone.return_value = None
    insert_user = MagicMock()
    insert_user.fetchone.return_value = {"id": "guest-1", "email": "guest@example.com"}
    conn = MockConn([select_cursor, insert_user, MagicMock()])
    service = TreesService(settings)
    with patch.object(service, "_get_access", return_value=_access(role="owner")):
        with patch_trees_get_conn(conn):
            result = service.add_share(
                user, "tree-1", email="guest@example.com", permission="view"
            )
    assert result["email"] == "guest@example.com"
    assert result["permission"] == "view"
    assert result["emailSent"] is False


def test_serialize_access(settings, user):
    access = _access()
    payload = TreesService(settings)._serialize_access(access)
    assert payload["cloudId"] == "tree-1"
    assert payload["role"] == "owner"
    assert "document" in payload


def test_get_tree_denied(settings, user):
    service = TreesService(settings)
    with patch.object(service, "_get_access", return_value=None):
        with pytest.raises(PermissionError, match="not found"):
            service.get_tree(user, "tree-1")


def test_list_shares_requires_owner(settings, user):
    service = TreesService(settings)
    with patch.object(service, "_get_access", return_value=_access(role="edit")):
        with pytest.raises(PermissionError, match="owner"):
            service.list_shares(user, "tree-1")


@patch("app.services.trees_service.EmailService")
def test_add_share_sends_email_when_configured(mock_mailer, settings, user, patch_trees_get_conn):
    mock_mailer.return_value.configured = True
    mock_mailer.return_value.send_share_invite = MagicMock()
    grantee_cursor = MagicMock()
    grantee_cursor.fetchone.return_value = {"id": "guest-1", "email": "guest@example.com"}
    conn = MockConn([grantee_cursor, MagicMock()])
    service = TreesService(settings)
    with patch.object(service, "_get_access", return_value=_access(role="owner")):
        with patch_trees_get_conn(conn):
            result = service.add_share(
                user,
                "tree-1",
                email="guest@example.com",
                permission="edit",
                app_url="http://localhost:8000",
            )
    assert result["emailSent"] is True
    mock_mailer.return_value.send_share_invite.assert_called_once()


def test_remove_share_requires_owner(settings, user):
    service = TreesService(settings)
    with patch.object(service, "_get_access", return_value=_access(role="view")):
        with pytest.raises(PermissionError, match="manage shares"):
            service.remove_share(user, "tree-1", email="guest@example.com")


def test_sync_creates_new_trees(settings, user):
    service = TreesService(settings)
    created = _access(id="new-1", version=1)
    with patch.object(service, "create_tree", return_value=created) as mock_create:
        with patch.object(service, "_notify_after_tree_update", return_value={"progress": 0, "collaborator": 0}):
            with patch.object(service, "list_accessible", return_value=[]):
                result = service.sync(
                    user,
                    trees=[
                        {
                            "localId": "local-1",
                            "document": created.document,
                            "name": "My tree",
                        }
                    ],
                )
    mock_create.assert_called_once()
    assert len(result["uploaded"]) == 1
    assert result["uploaded"][0]["cloudId"] == "new-1"
    assert result["uploaded"][0]["localId"] == "local-1"


def test_sync_reports_conflict(settings, user):
    service = TreesService(settings)
    server = _access(version=5)
    with patch.object(
        service,
        "update_tree",
        return_value={"conflict": True, "server": server},
    ):
        with patch.object(service, "list_accessible", return_value=[]):
            result = service.sync(
                user,
                trees=[
                    {
                        "localId": "local-1",
                        "cloudId": "tree-1",
                        "document": server.document,
                        "version": 4,
                    }
                ],
            )
    assert len(result["conflicts"]) == 1
    assert result["conflicts"][0]["serverVersion"] == 5


@patch("app.services.trees_service.EmailService")
def test_notify_view_sharees_on_owner_update(mock_mailer_cls, settings, user, patch_trees_get_conn):
    mock_mailer_cls.return_value.configured = True
    view_sharee = {"id": "guest-1", "email": "mentee@example.com"}
    share_cursor = MagicMock()
    share_cursor.fetchall.return_value = [view_sharee]
    notice_cursor = MagicMock()
    notice_cursor.fetchone.return_value = None
    conn = MockConn([share_cursor, notice_cursor, MagicMock()])
    service = TreesService(settings)
    with patch_trees_get_conn(conn):
        sent = service._email_view_sharees_progress_update(
            user,
            tree_id="tree-1",
            tree_name="My tree",
            app_url="http://localhost:8000",
            mailer=mock_mailer_cls.return_value,
        )
    assert sent == 1
    mock_mailer_cls.return_value.send_progress_update.assert_called_once()


def test_update_tree_conflict(settings, user, patch_trees_get_conn):
    service = TreesService(settings)
    doc = {"name": "My tree", "root": {"id": "r", "name": "My tree"}, "topics": []}
    version_cursor = MagicMock()
    version_cursor.fetchone.return_value = {"version": 2, "updated_at": datetime.now(timezone.utc)}
    server_cursor = MagicMock()
    server_cursor.fetchone.return_value = {
        "id": "tree-1",
        "owner_id": user.id,
        "name": "My tree",
        "document": doc,
        "version": 2,
        "updated_at": datetime.now(timezone.utc),
        "owner_email": user.email,
        "role": "owner",
    }
    conn = MockConn([version_cursor, server_cursor])
    with patch.object(service, "_get_access", return_value=_access(role="owner", version=2)):
        with patch_trees_get_conn(conn):
            result = service.update_tree(
                user,
                "tree-1",
                name=None,
                document=doc,
                expected_version=1,
                force=False,
            )
    assert isinstance(result, dict)
    assert result["conflict"] is True
    assert result["server"].version == 2
