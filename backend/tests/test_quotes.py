"""Tests routes /api/quotes"""


def _make_client(client_fixture):
    r = client_fixture.post("/api/clients", json={"name": "Quotes Client"})
    return r.json()["id"]


def test_list_quotes_empty(client):
    r = client.get("/api/quotes")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_quote(client):
    cid = _make_client(client)
    r = client.post("/api/quotes", json={
        "client_id": cid,
        "title": "Devis Intégration IA",
        "amount_ht": 12000.0,
        "tva_rate": 20.0,
    })
    assert r.status_code == 201
    data = r.json()
    assert data["number"].startswith("ACC-DEV-")
    assert data["amount_ht"] == 12000.0


def test_quote_status_transition(client):
    cid = _make_client(client)
    r = client.post("/api/quotes", json={"client_id": cid, "title": "Test", "amount_ht": 1000.0})
    qid = r.json()["id"]
    r2 = client.patch(f"/api/quotes/{qid}/status", json={"status": "envoye"})
    assert r2.status_code == 200


def test_delete_quote(client):
    cid = _make_client(client)
    r = client.post("/api/quotes", json={"client_id": cid, "title": "Del", "amount_ht": 500.0})
    qid = r.json()["id"]
    r2 = client.delete(f"/api/quotes/{qid}")
    assert r2.status_code == 204


def test_quote_number_uniqueness(client):
    cid = _make_client(client)
    r1 = client.post("/api/quotes", json={"client_id": cid, "title": "Q1", "amount_ht": 100.0})
    r2 = client.post("/api/quotes", json={"client_id": cid, "title": "Q2", "amount_ht": 200.0})
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["number"] != r2.json()["number"]
