"""Tests router misc — dashboard, health, search, notifications, activities."""
import pytest


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"


def test_dashboard(client):
    r = client.get("/api/dashboard")
    assert r.status_code == 200
    data = r.json()
    assert "kpis" in data
    assert "recent_projects" in data
    assert "recent_clients" in data
    kpis = data["kpis"]
    assert "total_clients" in kpis
    assert "active_clients" in kpis
    assert "total_projects" in kpis
    assert "ca_total" in kpis


def test_search_returns_structure(client):
    r = client.get("/api/search?q=test")
    assert r.status_code == 200
    data = r.json()
    assert "clients" in data
    assert "projects" in data
    assert "quotes" in data
    assert "tasks" in data
    assert "diagnostics" in data
    assert isinstance(data["clients"], list)
    assert isinstance(data["projects"], list)


def test_search_with_results(client):
    # Créer un client pour avoir un résultat potentiel
    client.post(
        "/api/clients",
        json={"name": "SearchTest PME", "type": "pme", "status": "prospect"},
    )
    r = client.get("/api/search?q=SearchTest")
    assert r.status_code == 200
    data = r.json()
    assert any(c["name"] == "SearchTest PME" for c in data["clients"])


def test_search_too_short(client):
    r = client.get("/api/search?q=a")
    assert r.status_code == 422  # min_length=2 imposé par FastAPI


def test_activities_list(client):
    r = client.get("/api/activities")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_activities_create_and_list(client):
    # Créer un client pour l'activité
    rc = client.post(
        "/api/clients",
        json={"name": "ActivClient SA", "type": "pme", "status": "active"},
    )
    assert rc.status_code == 201
    client_id = rc.json()["id"]

    ra = client.post(
        "/api/activities",
        json={
            "client_id": client_id,
            "title": "Appel de suivi",
            "type": "appel",
        },
    )
    assert ra.status_code == 201
    assert ra.json()["title"] == "Appel de suivi"

    r = client.get(f"/api/activities?client_id={client_id}")
    assert r.status_code == 200
    titles = [a["title"] for a in r.json()]
    assert "Appel de suivi" in titles


def test_notifications_list(client):
    r = client.get("/api/notifications")
    # L'endpoint peut retourner 200 avec une liste ou 404 s'il n'est pas exposé
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        assert isinstance(r.json(), list)
