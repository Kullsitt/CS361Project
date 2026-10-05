"""Read-only workload repository API. Supabase RLS remains authoritative."""
import os
import re
from enum import Enum
from pathlib import Path
from uuid import UUID
from decimal import Decimal
from urllib.parse import quote, urlsplit

import requests
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query

load_dotenv(Path(__file__).with_name('.env'))
app = FastAPI(title='FRWS Repository Query API', version='1.0.0')


class Category(str, Enum):
    TEACHING = 'TEACHING'
    RESEARCH = 'RESEARCH'
    SERVICE = 'SERVICE'
    ADVISING = 'ADVISING'


class Semester(str, Enum):
    FIRST = '1'
    SECOND = '2'
    SUMMER = '3'


def literal_pattern(value, quoted=True):
    # Quoted PostgREST values prevent commas/parentheses becoming query syntax.
    value = value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    pattern = f'%{value}%'
    if quoted:
        pattern = pattern.replace('\\', '\\\\').replace('"', '\\"')
        return f'"{pattern}"'
    return pattern


def evidence_with_url(evidence):
    """Public bucket confirmed by the repository owner; never sign private keys."""
    result = dict(evidence)
    external = evidence.get('external_url')
    bucket = evidence.get('storage_bucket')
    path = evidence.get('storage_path')
    result['download_url'] = None
    if external and urlsplit(external).scheme in ('https', 'http'):
        result['download_url'] = external
    elif bucket and path:
        result['download_url'] = (
            f"{os.getenv('SUPABASE_URL', '').rstrip('/')}/storage/v1/object/public/"
            f"{quote(bucket, safe='')}/{quote(path, safe='/')}"
        )
    return result


class Repository:
    def __init__(self, authorization=None):
        self.url = os.getenv('SUPABASE_URL', '').rstrip('/')
        key = os.getenv('SUPABASE_KEY', '')
        if not self.url or not key:
            raise HTTPException(503, 'Repository is not configured')
        self.headers = {'apikey': key, 'Prefer': 'count=exact'}
        if authorization:
            self.headers['Authorization'] = authorization

    def query(self, resource, params=None, body=None):
        try:
            response = requests.request(
                'POST' if body is not None else 'GET',
                f'{self.url}/rest/v1/{resource}', headers=self.headers,
                params=params, json=body, timeout=(3.05, 15),
            )
            if response.status_code in (401, 403):
                raise HTTPException(response.status_code, 'Repository access denied')
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, list):
                raise ValueError('Expected rows')
            total = response.headers.get('Content-Range', '').rsplit('/', 1)[-1]
            return data, int(total) if total.isdigit() else None
        except requests.Timeout as exc:
            raise HTTPException(504, 'Repository request timed out') from exc
        except (requests.RequestException, ValueError) as exc:
            raise HTTPException(502, 'Repository request failed') from exc


def get_repository(authorization: str | None = Header(default=None)):
    return Repository(authorization)


@app.get('/api/workloads')
def list_workloads(
    academic_year: int | None = Query(None, ge=2500, le=2700),
    category: Category | None = None,
    teacher_id: UUID | None = None,
    teacher_name: str | None = Query(None, min_length=1, max_length=255),
    semester: Semester | None = None,
    q: str | None = Query(None, min_length=1, max_length=255),
    page: int = Query(1, ge=1, le=1000000),
    page_size: int = Query(20, ge=1, le=100),
    repository=Depends(get_repository),
):
    params = {'select': '*',
              'order': 'academic_year.desc,created_at.desc,id.desc',
              'offset': (page - 1) * page_size, 'limit': page_size}
    for key, value in [('academic_year', academic_year), ('category', category),
                       ('teacher_id', teacher_id), ('semester', semester)]:
        if value is not None:
            params[key] = f'eq.{value.value if isinstance(value, Enum) else value}'
    if teacher_name:
        pattern = literal_pattern(teacher_name)
        params['or'] = f'(teacher_name_th.ilike.{pattern},teacher_name_en.ilike.{pattern})'
    if q:
        params['title'] = f'ilike.{literal_pattern(q, quoted=False)}'
    rows, total = repository.query('v_workload_items', params)
    return {'data': rows, 'page': page, 'page_size': page_size, 'total': total}


@app.get('/api/workloads/{workload_id}')
def workload_detail(workload_id: UUID, repository=Depends(get_repository)):
    rows, _ = repository.query('v_workload_items', {
        'select': '*',
        'id': f'eq.{workload_id}', 'limit': 1})
    if not rows:
        raise HTTPException(404, 'Workload not found')
    item = rows[0]
    category = item['category']
    if category not in {entry.value for entry in Category}:
        raise HTTPException(502, 'Unknown workload category')
    table = os.getenv(f'{category}_DETAIL_TABLE', f'{category.lower()}_details')
    if not re.fullmatch(r'[a-z][a-z0-9_]*', table):
        raise HTTPException(503, 'Invalid detail table configuration')
    select = '*,publications(*)' if category == 'RESEARCH' else '*'
    details, _ = repository.query(table, {'select': select, 'workload_item_id': f'eq.{workload_id}', 'limit': 1})
    evidence = []
    # Follow the actual returned row count, including repositories with a lower cap.
    while True:
        batch, _ = repository.query('evidence_files', {
            'select': '*', 'workload_item_id': f'eq.{workload_id}',
            'order': 'id.asc', 'offset': len(evidence), 'limit': 1000})
        if not batch:
            break
        evidence.extend(evidence_with_url(item) for item in batch)
    return {'data': {**item, 'details': details[0] if details else None, 'evidences': evidence}}


@app.get('/api/teachers/{teacher_id}/workload-summary')
def workload_summary(
    teacher_id: UUID,
    academic_year: int | None = Query(None, ge=2500, le=2700),
    repository=Depends(get_repository),
):
    teachers, _ = repository.query('teachers', {'select': 'id,first_name_th,last_name_th,first_name_en,last_name_en', 'id': f'eq.{teacher_id}', 'limit': 1})
    if not teachers:
        raise HTTPException(404, 'Teacher not found')
    groups = {}
    offset = 0
    while True:
        params = {'select': 'id,academic_year,category,workload_hours',
                  'teacher_id': f'eq.{teacher_id}', 'order': 'id.asc',
                  'offset': offset, 'limit': 1000}
        if academic_year is not None:
            params['academic_year'] = f'eq.{academic_year}'
        batch, total = repository.query('workload_items', params)
        if not batch:
            break
        for item in batch:
            key = (item['academic_year'], item['category'])
            group = groups.setdefault(key, {'academic_year': key[0], 'category': key[1],
                                            'item_count': 0, 'total_hours': Decimal('0')})
            group['item_count'] += 1
            group['total_hours'] += Decimal(str(item['workload_hours'] or 0))
        offset += len(batch)
        if total is not None and offset >= total:
            break
    rows = sorted(groups.values(), key=lambda row: (-row['academic_year'], row['category']))
    return {'teacher': teachers[0], 'data': rows}
