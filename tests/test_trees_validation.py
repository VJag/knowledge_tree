import pytest

from app.services.trees_service import _validate_document


def test_validate_document_accepts_minimal(sample_document):
    assert _validate_document(sample_document)["name"] == "Sample tree"


def test_validate_document_rejects_non_object():
    with pytest.raises(ValueError, match="object"):
        _validate_document([])


def test_validate_document_rejects_empty_name():
    with pytest.raises(ValueError, match="1–80"):
        _validate_document({"name": "  ", "root": {}, "topics": []})


def test_validate_document_requires_root_and_topics():
    with pytest.raises(ValueError, match="root and topics"):
        _validate_document({"name": "Tree"})


def test_validate_document_rejects_non_array_topics():
    with pytest.raises(ValueError, match="array"):
        _validate_document({"name": "Tree", "root": {}, "topics": {}})


def test_validate_document_rejects_oversized_payload():
    huge = {"name": "Tree", "root": {"id": "1", "name": "Tree"}, "topics": []}
    huge["padding"] = "x" * 1_048_576
    with pytest.raises(ValueError, match="1 MB"):
        _validate_document(huge)
