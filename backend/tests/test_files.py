"""Tests router files."""
import pytest


def test_list_files_empty(client):
    r = client.get("/api/files")
    assert r.status_code in (200, 404)  # peut ne pas avoir de dossier configuré


def test_list_files_for_client(client):
    # Créer un client d'abord
    r = client.post("/api/clients", json={"name": "FileTest SAS", "type": "pme", "status": "prospect"})
    assert r.status_code == 201
    client_id = r.json()["id"]

    r2 = client.get(f"/api/files?client_id={client_id}")
    assert r2.status_code == 200
