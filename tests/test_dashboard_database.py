"""Real PostgreSQL round trips on TEMP tables only. Always rolls back.

Uses backend/.env. No permanent schema/data changes, no existing user records.
"""
import sys
from pathlib import Path
from uuid import uuid4
root = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(root / 'backend'), str(root / 'tests')]
from app.core.database import get_pool
from app.workload_records import MAPPINGS, RULES, validate
from app.routers.dashboard_workloads import create_workload, update_workload, list_workloads, delete_workload
from app.routers.dashboard_profile import update_profile
from fastapi import HTTPException
from test_dashboard_api import example


class Transaction:
    """Endpoint commits release only a savepoint; outer transaction never commits."""
    def __init__(self, conn):
        self.conn = conn
        self.restart()
    def restart(self):
        with self.conn.cursor() as cur:
            cur.execute('SAVEPOINT dashboard_request')
    def cursor(self, *args, **kwargs):
        return self.conn.cursor(*args, **kwargs)
    def commit(self):
        with self.conn.cursor() as cur:
            cur.execute('RELEASE SAVEPOINT dashboard_request')
        self.restart()
    def rollback(self):
        with self.conn.cursor() as cur:
            cur.execute('ROLLBACK TO SAVEPOINT dashboard_request')


def main():
    conn = get_pool().getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL statement_timeout = '30s'")
            tables = ['professors', 'workload_submissions', *MAPPINGS, 'extra_score_items']
            for table in tables:
                cur.execute(f'CREATE TEMP TABLE {table} (LIKE public.{table} INCLUDING ALL) ON COMMIT DROP')
            # Every unqualified target must resolve to our TEMP schema.
            for table in tables:
                cur.execute('SELECT pg_my_temp_schema() = relnamespace FROM pg_class WHERE oid = %s::regclass', (table,))
                assert cur.fetchone()[0], f'Unsafe target: {table}'
            cur.execute((root / 'backend/migrations/001_dashboard_fields.sql').read_text(encoding='utf-8'))
            cur.execute((root / 'backend/migrations/002_remove_course_name.sql').read_text(encoding='utf-8'))
            owner, other = str(uuid4()), str(uuid4())
            for who in (owner, other):
                cur.execute("INSERT INTO professors (id, first_name_th, last_name_th, email) VALUES (%s, 'Test', 'Dashboard', %s)", (who, who + '@example.com'))
            cur.execute('ALTER TABLE workload_submissions ADD FOREIGN KEY (professor_id) REFERENCES professors(id)')
            for table in MAPPINGS:
                cur.execute(f'ALTER TABLE {table} ADD FOREIGN KEY (submission_id) REFERENCES workload_submissions(id)')
        db = Transaction(conn)
        user = {'id': owner}
        count = 0
        for code, config in RULES.items():
            for index, role in enumerate(config['roles']):
                if not role['available']:
                    continue
                if '--smoke' in sys.argv and (code not in ('1.1', '1.4', '1.9', '2.1', '3.5', '4.1.1') or index != 0):
                    continue
                payload = example(code, index)
                created = create_workload(payload, user, db)
                loaded = next(r for r in list_workloads(user, db) if r['id'] == created['id'])
                expected = validate(payload)
                assert loaded['score'] == expected['score'], code
                for field in role['fields']:
                    assert loaded[field] == expected[field], (code, field)
                assert loaded.get('student_names') == expected.get('student_names'), code
                changed = update_workload(created['id'], dict(payload, title='Updated'), user, db)
                assert changed['title'] == (payload['course'] if created['id'].startswith('teaching_workloads:') else 'Updated')
                try:
                    delete_workload(created['id'], {'id': other}, db)
                    raise AssertionError('Ownership check missing')
                except HTTPException as error:
                    assert error.status_code == 404
                delete_workload(created['id'], user, db)
                assert not list_workloads(user, db)
                count += 1
                if count % 10 == 0:
                    print(f'Checked {count} roles...', flush=True)
        a = create_workload(example(), user, db)
        moved = update_workload(a['id'], dict(example('2.1'), year='2568', semester='summer'), user, db)
        assert moved['id'].startswith('academic_work_items:')
        rows = list_workloads(user, db)
        assert len(rows) == 1 and rows[0]['semester'] == 'summer'
        delete_workload(moved['id'], user, db)
        large = create_workload(dict(example('1.4'), quantity='100'), user, db)
        assert large['score'] == 2000
        assert next(r for r in list_workloads(user, db) if r['id'] == large['id'])['score'] == 2000
        delete_workload(large['id'], user, db)
        precise = create_workload(example('4.1.1'), user, db)
        with conn.cursor() as cur:
            cur.execute('SELECT weight FROM service_work_items WHERE id = %s', (precise['id'].split(':')[1],))
            assert str(cur.fetchone()[0]) == '0.075'
        delete_workload(precise['id'], user, db)
        profile = update_profile({'expertise':'One\nTwo', 'education':'Degree', 'first_name_th':'Updated'}, user, db)
        assert profile['expertise'] == ['One', 'Two'] and profile['education'] == ['Degree']
        with conn.cursor() as cur:
            cur.execute('SELECT SUM(total_score) FROM workload_submissions')
            assert cur.fetchone()[0] == 0
        print(f'PASS: {count} role CRUD round trips, ownership, category/semester move, profile arrays and totals. TEMP tables only.')
    finally:
        conn.rollback()
        conn.close()
        print('Outer transaction rolled back; no permanent data/schema changes.')


if __name__ == '__main__':
    main()
