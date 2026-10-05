"""Opt-in read-only integration tests using the configured Supabase repository."""
import os
from collections import defaultdict
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from api.main import app

pytestmark = pytest.mark.skipif(os.getenv('FRWS_LIVE_TEST') != '1', reason='Opt-in live repository test')


def test_live_filters_details_evidence_and_summary():
    client = TestClient(app)
    initial = client.get('/api/workloads?page_size=1')
    assert initial.status_code == 200, initial.text
    if not initial.json()['data']:
        pytest.skip('No visible seed data')
    sample = initial.json()['data'][0]
    teacher_id = sample['teacher_id']
    year = sample['academic_year']
    filters = {'teacher_id': teacher_id, 'academic_year': year, 'page_size': 100}
    items = []
    page = 1
    while True:
        result = client.get('/api/workloads', params={**filters, 'page': page})
        assert result.status_code == 200, result.text
        data = result.json()['data']
        items.extend(data)
        if not data or len(items) >= result.json()['total']:
            break
        page += 1
    assert all(row['teacher_id'] == teacher_id and row['academic_year'] == year for row in items)
    expected = defaultdict(lambda: [0, Decimal('0')])
    for row in items:
        expected[row['category']][0] += 1
        expected[row['category']][1] += Decimal(str(row['workload_hours'] or 0))
    summary = client.get(f'/api/teachers/{teacher_id}/workload-summary', params={'academic_year': year})
    assert summary.status_code == 200, summary.text
    actual = {row['category']: [row['item_count'], Decimal(str(row['total_hours']))] for row in summary.json()['data']}
    assert actual == dict(expected)
    for category in ['TEACHING', 'RESEARCH', 'SERVICE', 'ADVISING']:
        filtered = client.get('/api/workloads', params={**filters, 'category': category})
        assert filtered.status_code == 200, filtered.text
        assert all(row['category'] == category for row in filtered.json()['data'])
        assert filtered.json()['total'] == expected[category][0]
        if filtered.json()['data']:
            selected = filtered.json()['data'][0]
            detail = client.get(f"/api/workloads/{selected['id']}")
            assert detail.status_code == 200, detail.text
            detail_data = detail.json()['data']
            assert detail_data['id'] == selected['id']
            assert len(detail_data['evidences']) == selected['evidence_count']
            for evidence in detail_data['evidences']:
                assert evidence['workload_item_id'] == selected['id']
                assert evidence['storage_path'] or evidence['external_url']
    named = client.get('/api/workloads', params={'teacher_name': sample['teacher_name_th'], 'q': sample['title']})
    assert named.status_code == 200, named.text
    assert named.json()['total'] >= 1
    assert all(sample['teacher_name_th'].casefold() in row['teacher_name_th'].casefold() for row in named.json()['data'])
