from unittest.mock import Mock

import pytest
import requests
from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture
def backend(monkeypatch):
    monkeypatch.setenv('SUPABASE_URL', 'https://example.supabase.co')
    monkeypatch.setenv('SUPABASE_KEY', 'publishable-test-key')
    transport = Mock()
    monkeypatch.setattr('api.main.requests.request', transport)
    return transport


def response(rows, total=None, status=200):
    result = Mock(status_code=status)
    result.json.return_value = rows
    result.headers = {'Content-Range': f'0-19/{total}'} if total is not None else {}
    if status >= 400:
        result.raise_for_status.side_effect = requests.HTTPError('private upstream message')
    return result


client = TestClient(app)
TID = '00000000-0000-0000-0000-000000000001'
WID = '00000000-0000-0000-0000-000000000007'


def test_combined_filters_and_pagination(backend):
    backend.return_value = response([{'id': 8, 'academic_year': 2567}], 31)
    result = client.get('/api/workloads', params={
        'academic_year': 2567, 'category': 'TEACHING', 'teacher_id': TID,
        'semester': '2', 'teacher_name': 'สมชาย', 'q': 'CS361', 'page': 2, 'page_size': 10})
    assert result.status_code == 200
    assert result.json()['total'] == 31
    params = backend.call_args.kwargs['params']
    assert params['academic_year'] == 'eq.2567'
    assert params['category'] == 'eq.TEACHING'
    assert params['teacher_id'] == f'eq.{TID}'
    assert params['semester'] == 'eq.2'
    assert params['offset'] == 10 and params['limit'] == 10
    assert params['or'] == '(teacher_name_th.ilike."%สมชาย%",teacher_name_en.ilike."%สมชาย%")'
    assert params['title'] == 'ilike.%CS361%'


@pytest.mark.parametrize('params', [
    {'page': 0}, {'page_size': 101}, {'academic_year': -1},
    {'category': 'OTHER'}, {'semester': '4'}, {'teacher_id': ''}, {'q': ''}])
def test_invalid_filters_do_not_query_repository(backend, params):
    assert client.get('/api/workloads', params=params).status_code == 422
    backend.assert_not_called()


def test_detail_keeps_evidence_metadata_and_follows_lower_row_cap(backend):
    backend.side_effect = [
        response([{'id': 7, 'category': 'RESEARCH'}]),
        response([{'workload_id': 7, 'doi': 'https://doi.org/example'}]),
        response([{'id': 1, 'storage_path': 'private/one.pdf', 'file_name': 'one.pdf'}]),
        response([{'id': 2, 'storage_path': 'private/two.pdf'}]), response([])]
    result = client.get(f'/api/workloads/{WID}')
    assert result.status_code == 200
    data = result.json()['data']
    assert data['details']['doi'] == 'https://doi.org/example'
    assert len(data['evidences']) == 2
    assert data['evidences'][0]['storage_path'] == 'private/one.pdf'
    assert backend.call_args_list[-1].kwargs['params']['offset'] == 2


@pytest.mark.parametrize('category', ['TEACHING', 'RESEARCH', 'SERVICE', 'ADVISING'])
def test_category_detail_table(backend, category):
    backend.side_effect = [response([{'id': 1, 'category': category}]), response([]), response([])]
    result = client.get(f'/api/workloads/{WID}')
    assert result.status_code == 200
    assert backend.call_args_list[1].args[1].endswith(f'/{category.lower()}_details')
    assert result.json()['data']['details'] is None


@pytest.mark.parametrize('path', [f'/api/workloads/{WID}', f'/api/teachers/{TID}/workload-summary'])
def test_missing_resource(backend, path):
    backend.return_value = response([])
    assert client.get(path).status_code == 404


def test_summary_pages_all_rows_and_sums_decimal_hours(backend):
    backend.side_effect = [response([{'id': TID}]), response([
        {'academic_year': 2567, 'category': 'TEACHING', 'workload_hours': '0.10'}]),
        response([{'academic_year': 2567, 'category': 'TEACHING', 'workload_hours': '0.20'}]), response([])]
    result = client.get(f'/api/teachers/{TID}/workload-summary?academic_year=2567')
    assert result.status_code == 200
    assert result.json()['data'][0]['item_count'] == 2
    assert result.json()['data'][0]['total_hours'] == 0.3
    assert backend.call_args.kwargs['params']['academic_year'] == 'eq.2567'
    assert backend.call_args.kwargs['params']['offset'] == 2


def test_empty_list(backend):
    backend.return_value = response([], 0)
    assert client.get('/api/workloads').json()['data'] == []


@pytest.mark.parametrize('error,status', [(requests.Timeout(), 504), (requests.ConnectionError(), 502)])
def test_network_errors(backend, error, status):
    backend.side_effect = error
    assert client.get('/api/workloads').status_code == status


@pytest.mark.parametrize('status', [401, 403, 500])
def test_upstream_errors_are_sanitized(backend, status):
    backend.return_value = response({}, status=status)
    result = client.get('/api/workloads')
    assert result.status_code == (status if status in (401, 403) else 502)
    assert 'private upstream message' not in result.text


def test_user_token_is_forwarded_for_rls(backend):
    backend.return_value = response([], 0)
    client.get('/api/workloads', headers={'Authorization': 'Bearer user-session'})
    assert backend.call_args.kwargs['headers']['Authorization'] == 'Bearer user-session'


def test_search_special_characters_remain_quoted(backend):
    backend.return_value = response([], 0)
    client.get('/api/workloads', params={'teacher_name': 'a",id.gt.0)%_'})
    pattern = backend.call_args.kwargs['params']['or']
    assert 'a\\",id.gt.0)' in pattern


def test_openapi_documents_endpoints():
    paths = client.get('/openapi.json').json()['paths']
    assert len(paths) == 3


def test_public_pdf_url_preserves_and_encodes_storage_metadata(backend):
    backend.side_effect = [response([{'id': WID, 'category': 'TEACHING'}]), response([]),
        response([{'storage_bucket': 'pdf', 'storage_path': 'folder/หลักฐาน #1.pdf', 'mime_type': 'application/pdf'}]), response([])]
    result = client.get(f'/api/workloads/{WID}')
    evidence = result.json()['data']['evidences'][0]
    assert evidence['download_url'].startswith('https://example.supabase.co/storage/v1/object/public/pdf/folder/')
    assert '%20%231.pdf' in evidence['download_url']
    assert evidence['mime_type'] == 'application/pdf'


def test_external_evidence_url_and_missing_bucket():
    from api.main import evidence_with_url
    assert evidence_with_url({'external_url': 'https://example.com/paper.pdf'})['download_url'] == 'https://example.com/paper.pdf'
    assert evidence_with_url({'storage_path': 'paper.pdf'})['download_url'] is None
    assert evidence_with_url({'external_url': 'javascript:alert(1)'})['download_url'] is None
