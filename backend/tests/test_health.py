"""Tests routes système — health, dashboard, notifications"""


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok"


def test_dashboard(client):
    r = client.get("/api/dashboard")
    assert r.status_code == 200
    data = r.json()
    assert "total_clients" in data
    assert "ca_total" in data


def test_notifications_list(client):
    r = client.get("/api/notifications")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_notifications_summary(client):
    r = client.get("/api/notifications/summary")
    assert r.status_code == 200
    data = r.json()
    assert "unread" in data


def test_alerts(client):
    r = client.get("/api/alerts")
    assert r.status_code == 200
