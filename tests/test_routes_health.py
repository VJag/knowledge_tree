def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["app"] == "knowledgetree"
    assert "email_configured" in data
    assert "database_configured" in data


def test_index_returns_html(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "KnowledgeTree" in res.text
