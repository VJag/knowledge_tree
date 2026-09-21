from app.models import TreeAccess, User


def test_user_fields():
    user = User(id="u1", email="a@b.com", name="Ada")
    assert user.id == "u1"
    assert user.email == "a@b.com"
    assert user.name == "Ada"


def test_tree_access_fields(sample_document):
    access = TreeAccess(
        id="t1",
        owner_id="u1",
        name="Sample",
        document=sample_document,
        version=2,
        role="edit",
        updated_at="2026-01-01T00:00:00+00:00",
        owner_email="owner@example.com",
    )
    assert access.role == "edit"
    assert access.version == 2
    assert access.owner_email == "owner@example.com"
