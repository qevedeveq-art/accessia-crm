"""Tests routes /api/projects"""


def _make_client(client_fixture):
    r = client_fixture.post("/api/clients", json={"name": "Proj Client"})
    return r.json()["id"]


def test_list_projects_empty(client):
    r = client.get("/api/projects")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_project(client):
    cid = _make_client(client)
    r = client.post("/api/projects", json={
        "name": "Projet IA",
        "client_id": cid,
        "type": "integration",
        "status": "en_cours",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Projet IA"
    assert data["code"].startswith("ACC-")


def test_get_project_not_found(client):
    r = client.get("/api/projects/99999")
    assert r.status_code == 404


def test_update_project_status(client):
    cid = _make_client(client)
    r = client.post("/api/projects", json={"name": "Update Test", "client_id": cid})
    pid = r.json()["id"]
    r2 = client.put(f"/api/projects/{pid}", json={"status": "termine"})
    assert r2.status_code == 200
    assert r2.json()["status"] == "termine"


def test_delete_project(client):
    cid = _make_client(client)
    r = client.post("/api/projects", json={"name": "Del Proj", "client_id": cid})
    pid = r.json()["id"]
    r2 = client.delete(f"/api/projects/{pid}")
    assert r2.status_code == 200
    r3 = client.get(f"/api/projects/{pid}")
    assert r3.status_code == 404
