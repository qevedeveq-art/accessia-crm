"""Tests routes /api/clients"""


def test_list_clients_empty(client):
    r = client.get("/api/clients")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_client(client):
    payload = {"name": "Acme SA", "type": "pme", "status": "prospect"}
    r = client.post("/api/clients", json=payload)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Acme SA"
    assert "id" in data
    return data["id"]


def test_get_client(client):
    r = client.post("/api/clients", json={"name": "Beta Corp"})
    cid = r.json()["id"]
    r2 = client.get(f"/api/clients/{cid}")
    assert r2.status_code == 200
    assert r2.json()["name"] == "Beta Corp"


def test_get_client_not_found(client):
    r = client.get("/api/clients/99999")
    assert r.status_code == 404


def test_update_client(client):
    r = client.post("/api/clients", json={"name": "Gamma Ltd"})
    cid = r.json()["id"]
    r2 = client.put(f"/api/clients/{cid}", json={"name": "Gamma Ltd Updated", "status": "active"})
    assert r2.status_code == 200
    assert r2.json()["status"] == "active"


def test_delete_client(client):
    r = client.post("/api/clients", json={"name": "To Delete"})
    cid = r.json()["id"]
    r2 = client.delete(f"/api/clients/{cid}")
    assert r2.status_code == 200
    r3 = client.get(f"/api/clients/{cid}")
    assert r3.status_code == 404


def test_create_client_invalid_siret(client):
    r = client.post("/api/clients", json={"name": "Bad SIRET", "siret": "12345"})
    assert r.status_code == 422


def test_pipeline(client):
    r = client.get("/api/pipeline")
    assert r.status_code == 200
    data = r.json()
    assert "stages" in data
