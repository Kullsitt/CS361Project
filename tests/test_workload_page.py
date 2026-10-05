from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


def test_workload_page_and_script_are_served():
    page = client.get('/ui/workload.html')
    assert page.status_code == 200
    assert 'js/workload.js' in page.text
    assert client.get('/ui/js/workload.js').status_code == 200
    assert client.get('/ui/workloadStyle.css').status_code == 200


def test_static_mount_does_not_serve_configuration():
    assert client.get('/ui/.env').status_code == 404
    assert client.get('/ui/api/.env').status_code == 404
    assert client.get('/ui/%2e%2e/api/.env').status_code == 404
