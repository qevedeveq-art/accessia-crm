"""Tests routes /api/invoices"""


def _make_client(client_fixture):
    r = client_fixture.post("/api/clients", json={"name": "Test Client Invoices"})
    return r.json()["id"]


def test_list_invoices_empty(client):
    r = client.get("/api/invoices")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_invoice(client):
    cid = _make_client(client)
    r = client.post("/api/invoices", json={
        "client_id": cid,
        "amount_ht": 5000.0,
        "tva_rate": 20.0,
        "status": "brouillon",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["amount_ht"] == 5000.0
    assert data["number"].startswith("ACC-")


def test_invoice_status_update(client):
    cid = _make_client(client)
    r = client.post("/api/invoices", json={"client_id": cid, "amount_ht": 1000.0})
    inv_id = r.json()["id"]
    r2 = client.patch(f"/api/invoices/{inv_id}/status", json={"status": "envoyee"})
    assert r2.status_code == 200
    assert r2.json()["status"] == "envoyee"


def test_invoice_status_invalid(client):
    cid = _make_client(client)
    r = client.post("/api/invoices", json={"client_id": cid, "amount_ht": 1000.0})
    inv_id = r.json()["id"]
    r2 = client.patch(f"/api/invoices/{inv_id}/status", json={"status": "not_a_status"})
    assert r2.status_code == 422


def test_invoice_number_uniqueness(client):
    """Deux factures créées rapidement doivent avoir des numéros différents."""
    cid = _make_client(client)
    r1 = client.post("/api/invoices", json={"client_id": cid, "amount_ht": 100.0})
    r2 = client.post("/api/invoices", json={"client_id": cid, "amount_ht": 200.0})
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["number"] != r2.json()["number"]
