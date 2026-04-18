"""Tests router diagnostics — /api/diagnostics."""
import pytest


def _create_client(client):
    """Helper : crée un client et retourne son id."""
    r = client.post(
        "/api/clients",
        json={"name": "Diag Client SARL", "type": "pme", "status": "prospect"},
    )
    assert r.status_code == 201
    return r.json()["id"]


def test_list_diagnostics_empty(client):
    r = client.get("/api/diagnostics")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_diagnostic(client):
    client_id = _create_client(client)
    r = client.post(
        "/api/diagnostics",
        json={
            "client_id": client_id,
            "type": "cyber",
            "title": "Diagnostic Cyber Test",
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["type"] == "cyber"
    assert data["title"] == "Diagnostic Cyber Test"
    assert data["client_id"] == client_id
    assert data["status"] == "en_cours"
    return data["id"]


def test_get_diagnostic(client):
    client_id = _create_client(client)
    r = client.post(
        "/api/diagnostics",
        json={
            "client_id": client_id,
            "type": "rgpd",
            "title": "Diagnostic RGPD Test",
        },
    )
    assert r.status_code == 201
    diag_id = r.json()["id"]

    r2 = client.get(f"/api/diagnostics/{diag_id}")
    assert r2.status_code == 200
    assert r2.json()["id"] == diag_id


def test_update_diagnostic(client):
    client_id = _create_client(client)
    r = client.post(
        "/api/diagnostics",
        json={
            "client_id": client_id,
            "type": "ia",
            "title": "Diagnostic IA Test",
        },
    )
    assert r.status_code == 201
    diag_id = r.json()["id"]

    r2 = client.put(
        f"/api/diagnostics/{diag_id}",
        json={"title": "Diagnostic IA Mis à jour"},
    )
    assert r2.status_code == 200
    assert r2.json()["title"] == "Diagnostic IA Mis à jour"


def test_delete_diagnostic(client):
    client_id = _create_client(client)
    r = client.post(
        "/api/diagnostics",
        json={
            "client_id": client_id,
            "type": "cyber",
            "title": "Diagnostic à supprimer",
        },
    )
    assert r.status_code == 201
    diag_id = r.json()["id"]

    r2 = client.delete(f"/api/diagnostics/{diag_id}")
    assert r2.status_code == 200

    r3 = client.get(f"/api/diagnostics/{diag_id}")
    assert r3.status_code == 404


def test_get_diagnostic_not_found(client):
    r = client.get("/api/diagnostics/999999")
    assert r.status_code == 404
