from unittest.mock import patch

from app.models import User


def _auth_client(client):
    with patch("app.deps.get_optional_user") as mock_user:
        mock_user.return_value = User(id="u1", email="owner@example.com", name=None)
        yield client


@patch("app.routes.trees.TreesService")
def test_sync_requires_auth(mock_service, client):
    res = client.post("/api/trees/sync", json={"trees": []})
    assert res.status_code == 401


@patch("app.deps.get_optional_user")
@patch("app.routes.trees.TreesService")
def test_sync_success(mock_service_cls, mock_user, client):
    mock_user.return_value = User(id="u1", email="owner@example.com", name=None)
    mock_service_cls.return_value.sync.return_value = {
        "uploaded": [],
        "conflicts": [],
        "remote": [],
        "emailsSent": {"progress": 0, "collaborator": 0},
    }
    res = client.post("/api/trees/sync", json={"trees": [], "force": False})
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["emailsSent"]["progress"] == 0
    mock_service_cls.return_value.sync.assert_called_once()
    assert mock_service_cls.return_value.sync.call_args.kwargs.get("app_url")


@patch("app.deps.get_optional_user")
@patch("app.routes.trees.TreesService")
def test_sync_returns_email_counts(mock_service_cls, mock_user, client):
    mock_user.return_value = User(id="u1", email="owner@example.com", name=None)
    mock_service_cls.return_value.sync.return_value = {
        "uploaded": [{"cloudId": "t1"}],
        "conflicts": [],
        "remote": [],
        "emailsSent": {"progress": 2, "collaborator": 0},
    }
    res = client.post("/api/trees/sync", json={"trees": []})
    assert res.status_code == 200
    assert res.json()["emailsSent"] == {"progress": 2, "collaborator": 0}


@patch("app.deps.get_optional_user")
@patch("app.routes.trees.TreesService")
def test_sync_permission_error(mock_service_cls, mock_user, client):
    mock_user.return_value = User(id="u1", email="owner@example.com", name=None)
    mock_service_cls.return_value.sync.side_effect = PermissionError("denied")
    res = client.post("/api/trees/sync", json={"trees": []})
    assert res.status_code == 403


@patch("app.deps.get_optional_user")
@patch("app.routes.trees.TreesService")
def test_list_shares(mock_service_cls, mock_user, client):
    mock_user.return_value = User(id="u1", email="owner@example.com", name=None)
    mock_service_cls.return_value.list_shares.return_value = [
        {"email": "guest@example.com", "permission": "view", "createdAt": "2026-01-01T00:00:00+00:00"}
    ]
    res = client.get("/api/trees/tree-1/shares")
    assert res.status_code == 200
    assert len(res.json()["shares"]) == 1


@patch("app.deps.get_optional_user")
@patch("app.routes.trees.TreesService")
def test_add_share_invalid_permission(mock_service_cls, mock_user, client):
    mock_user.return_value = User(id="u1", email="owner@example.com", name=None)
    res = client.post(
        "/api/trees/tree-1/shares",
        json={"email": "guest@example.com", "permission": "admin"},
    )
    assert res.status_code == 422


@patch("app.deps.get_optional_user")
@patch("app.routes.trees.TreesService")
def test_list_trees(mock_service_cls, mock_user, client):
    mock_user.return_value = User(id="u1", email="owner@example.com", name=None)
    access = {
        "cloudId": "tree-1",
        "name": "Mine",
        "document": {"name": "Mine", "root": {}, "topics": []},
        "version": 1,
        "role": "owner",
        "updatedAt": "2026-01-01T00:00:00+00:00",
        "ownerEmail": "owner@example.com",
    }
    mock_service_cls.return_value.list_accessible.return_value = []
    mock_service_cls.return_value._serialize_access.return_value = access
    res = client.get("/api/trees")
    assert res.status_code == 200
    assert "trees" in res.json()


@patch("app.deps.get_optional_user")
@patch("app.routes.trees.TreesService")
def test_get_tree_not_found(mock_service_cls, mock_user, client):
    mock_user.return_value = User(id="u1", email="owner@example.com", name=None)
    mock_service_cls.return_value.get_tree.side_effect = PermissionError("denied")
    res = client.get("/api/trees/missing")
    assert res.status_code == 404


@patch("app.deps.get_optional_user")
@patch("app.routes.trees.TreesService")
def test_delete_tree_success(mock_service_cls, mock_user, client):
    mock_user.return_value = User(id="u1", email="owner@example.com", name=None)
    res = client.delete("/api/trees/tree-1")
    assert res.status_code == 200
    assert res.json()["ok"] is True


@patch("app.deps.get_optional_user")
@patch("app.routes.trees.TreesService")
def test_add_share_success(mock_service_cls, mock_user, client):
    mock_user.return_value = User(id="u1", email="owner@example.com", name=None)
    mock_service_cls.return_value.add_share.return_value = {
        "email": "guest@example.com",
        "permission": "view",
        "emailSent": True,
    }
    res = client.post(
        "/api/trees/tree-1/shares",
        json={"email": "guest@example.com", "permission": "view"},
    )
    assert res.status_code == 200
    assert res.json()["emailSent"] is True


@patch("app.deps.get_optional_user")
@patch("app.routes.trees.TreesService")
def test_add_share_permission_error(mock_service_cls, mock_user, client):
    mock_user.return_value = User(id="u1", email="owner@example.com", name=None)
    mock_service_cls.return_value.add_share.side_effect = PermissionError("Only the owner")
    res = client.post(
        "/api/trees/tree-1/shares",
        json={"email": "guest@example.com", "permission": "edit"},
    )
    assert res.status_code == 403


@patch("app.deps.get_optional_user")
@patch("app.routes.trees.TreesService")
def test_remove_share(mock_service_cls, mock_user, client):
    mock_user.return_value = User(id="u1", email="owner@example.com", name=None)
    res = client.delete("/api/trees/tree-1/shares?email=guest@example.com")
    assert res.status_code == 200
    assert res.json()["ok"] is True


@patch("app.deps.get_optional_user")
@patch("app.routes.trees.TreesService")
def test_sync_value_error(mock_service_cls, mock_user, client):
    mock_user.return_value = User(id="u1", email="owner@example.com", name=None)
    mock_service_cls.return_value.sync.side_effect = ValueError("bad document")
    res = client.post("/api/trees/sync", json={"trees": []})
    assert res.status_code == 400
