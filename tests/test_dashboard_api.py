"""Offline validation/security tests. No live database is opened."""
import sys
import unittest
from pathlib import Path
from decimal import Decimal
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import asyncio
import httpx
from app.main import app
from app.core.database import get_db
from app.workload_records import RULES, validate, columns, from_row
from app.routers.dashboard_workloads import key_parts, owned_item, check_editable
from app.routers.auth import create_access_token, get_current_user
from app.routers.dashboard_profile import convert, update_profile
from fastapi import HTTPException


def example(code='1.1', index=0):
    rule = RULES[code]
    return dict(category=rule['category'], subtype=rule['subtype'], role=rule['roles'][index]['name'],
                year='2567', semester='2', title='ทดสอบ', course='CS999', students='301',
                credits='3', hours='45', quantity='2', share='50', budget='20000000',
                source='ทดสอบ', organization='ทดสอบ', student_names='นักศึกษาทดสอบ', attachments=[])


class DashboardTests(unittest.TestCase):
    def test_all_roles_roundtrip(self):
        count = 0
        for code, config in RULES.items():
            for index, role in enumerate(config['roles']):
                if not role['available']:
                    continue
                record = validate(example(code, index))
                table, values = columns(record)
                returned = from_row(table, dict(values, id='test', academic_year=2567, semester=2))
                for field in role['fields']:
                    self.assertEqual(returned[field], record[field], (code, field))
                self.assertEqual(returned['score'], record['score'])
                self.assertEqual(returned.get('student_names'), record.get('student_names'))
                count += 1
        self.assertEqual(count, 115)

    def test_score_is_server_owned(self):
        data = example()
        data.update(students='125', score=999999, weight=99, professor_id='someone-else')
        self.assertEqual(validate(data)['score'], Decimal('110'))
        self.assertNotIn('professor_id', validate(data))

    def test_pending_not_zero(self):
        self.assertIsNone(validate(example('3.1'))['score'])

    def test_invalid_values(self):
        for change in ({'share':'101'}, {'students':'1.5'}, {'students':'NaN'},
                       {'credits':'-1'}, {'year':'2499'}, {'role':'fake'},
                       {'category':'admin'}, {'evidence_url':'javascript:alert(1)'},
                       {'subtype':'2.5', 'role':RULES['2.5']['roles'][3]['name']}):
            with self.assertRaises(ValueError):
                validate(dict(example(), **change))

    def test_auth_required(self):
        app.dependency_overrides[get_db] = lambda: None
        try:
            owner_id = '00000000-0000-0000-0000-000000000001'
            async def check():
              async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                for method, path in [('GET','/api/workloads'), ('POST','/api/workloads'),
                                     ('PUT','/api/workloads/x'), ('DELETE','/api/workloads/x'),
                                     ('GET','/api/profile/me'), ('PUT','/api/profile/me'),
                                     ('GET','/api/workloads/officer/dashboard'),
                                     ('GET',f'/api/workloads/officer/inspect/{owner_id}')]:
                    response = await client.request(method, path, json={})
                    self.assertEqual(response.status_code, 401)
            asyncio.run(check())
        finally:
            app.dependency_overrides.clear()

    def test_staff_api_permissions(self):
        from unittest.mock import Mock
        from app.routers.auth import get_current_user as current_user_dependency
        owner_id = '00000000-0000-0000-0000-000000000001'
        cursor = Mock()
        cursor.fetchall.return_value = []
        conn = Mock()
        conn.cursor.return_value = cursor

        async def check():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
                app.dependency_overrides[get_db] = lambda: conn
                app.dependency_overrides[current_user_dependency] = lambda: {'id': owner_id, 'role': 'teacher'}
                for path in ('/api/workloads/officer/dashboard',
                             f'/api/workloads/officer/inspect/{owner_id}'):
                    response = await client.get(path)
                    self.assertEqual(response.status_code, 403)

                app.dependency_overrides[current_user_dependency] = lambda: {'id': owner_id, 'role': 'officer'}
                response = await client.get('/api/workloads/officer/dashboard')
                self.assertEqual(response.status_code, 200)
                response = await client.get(
                    f'/api/workloads/officer/inspect/{owner_id}',
                )
                self.assertEqual(response.status_code, 200)
                app.dependency_overrides[current_user_dependency] = lambda: {
                    'id': owner_id, 'role': 'manager'
                }
                response = await client.get('/api/workloads/officer/dashboard')
                self.assertEqual(response.status_code, 200)
                response = await client.get(f'/api/workloads/officer/inspect/{owner_id}')
                self.assertEqual(response.status_code, 403)

                app.dependency_overrides[current_user_dependency] = lambda: {
                    'id': owner_id, 'role': 'officer'
                }
                cursor.fetchone.side_effect = [
                    {'id': owner_id, 'status': 'PENDING'},
                    {'id': owner_id, 'status': 'APPROVED'},
                ]
                response = await client.patch(
                    f'/api/workloads/submissions/{owner_id}/status',
                    json={'status': 'APPROVED'},
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['data']['status'], 'APPROVED')
                conn.commit.assert_called_once()

                app.dependency_overrides[current_user_dependency] = lambda: {'id': owner_id, 'role': 'reviewer'}
                response = await client.patch(
                    f'/api/workloads/submissions/{owner_id}/status',
                    json={'status': 'NOT_A_STATUS'},
                )
                self.assertEqual(response.status_code, 422)

        try:
            asyncio.run(check())
        finally:
            app.dependency_overrides.clear()

    def test_public_workloads_are_approved_selected_and_minimized(self):
        from unittest.mock import Mock
        professor_id = '00000000-0000-0000-0000-000000000001'
        cursor = Mock()
        cursor.fetchall.return_value = []
        conn = Mock()
        conn.cursor.return_value = cursor

        async def check():
            app.dependency_overrides[get_db] = lambda: conn
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url='http://test',
            ) as client:
                response = await client.get(
                    '/api/workloads/by-category',
                    params={'professor_id': professor_id, 'category': 'ADVISING'},
                )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), [])
            query = cursor.execute.call_args.args[0]
            self.assertEqual(query.count("UPPER(ws.status) = 'APPROVED'"), 2)
            self.assertIn('ts.is_selected IS TRUE', query)
            self.assertIn('sps.is_selected IS TRUE', query)
            self.assertNotIn('ts.student_name AS advisee_name', query)
            self.assertNotIn('ts.score', query)

        try:
            asyncio.run(check())
        finally:
            app.dependency_overrides.clear()

    def test_current_role_comes_from_database(self):
        from unittest.mock import Mock
        user_id = '00000000-0000-0000-0000-000000000001'
        token = create_access_token({
            'sub': user_id,
            'email': 'teacher@example.com',
            'role': 'teacher',
        })
        cursor = Mock()
        cursor.__enter__ = Mock(return_value=cursor)
        cursor.__exit__ = Mock(return_value=False)
        cursor.fetchone.return_value = {
            'id': user_id,
            'email': 'teacher@example.com',
            'role': 'officer',
        }
        conn = Mock()
        conn.cursor.return_value = cursor

        user = get_current_user(token=token, conn=conn)

        self.assertEqual(user['role'], 'officer')

    def test_role_aliases_map_to_least_privilege_groups(self):
        from app.routers.auth import normalize_role
        self.assertEqual(normalize_role('branch_officer'), 'officer')
        self.assertEqual(normalize_role('data_reviewer'), 'reviewer')
        self.assertEqual(normalize_role('executive'), 'manager')
        self.assertIsNone(normalize_role('unknown'))

    def test_reviewer_can_approve_only_open_submission(self):
        from unittest.mock import Mock
        from app.routers.workloads import StatusUpdatePayload, update_submission_status
        from fastapi import HTTPException
        submission_id = '00000000-0000-0000-0000-000000000003'

        for original_status, next_status in (
            ('PENDING', 'APPROVED'),
            ('REJECTED', 'APPROVED'),
        ):
            cursor = Mock()
            cursor.fetchone.side_effect = [
                {'id': submission_id, 'status': original_status},
                {'id': submission_id, 'status': next_status},
            ]
            conn = Mock()
            conn.cursor.return_value = cursor
            result = update_submission_status(
                submission_id=submission_id,
                payload=StatusUpdatePayload(status=next_status),
                current_user={'id': submission_id, 'role': 'reviewer'},
                conn=conn,
            )
            self.assertEqual(result['data']['status'], next_status)
            conn.commit.assert_called_once()

        cursor = Mock()
        cursor.fetchone.return_value = {'id': submission_id, 'status': 'APPROVED'}
        conn = Mock()
        conn.cursor.return_value = cursor
        with self.assertRaises(HTTPException) as error:
            update_submission_status(
                submission_id=submission_id,
                payload=StatusUpdatePayload(status='REJECTED'),
                current_user={'id': submission_id, 'role': 'reviewer'},
                conn=conn,
            )
        self.assertEqual(error.exception.status_code, 409)
        conn.rollback.assert_called_once()

    def test_dashboard_teaching_score_includes_supervision_items(self):
        from unittest.mock import Mock
        from app.routers.workloads import get_officer_dashboard
        cursor = Mock()
        cursor.fetchall.return_value = []
        conn = Mock()
        conn.cursor.return_value = cursor

        get_officer_dashboard(
            current_user={'id': 'reviewer', 'role': 'reviewer'},
            conn=conn,
        )

        query = cursor.execute.call_args.args[0]
        self.assertIn('FROM thesis_supervisions WHERE submission_id = ws.id AND is_selected IS TRUE', query)
        self.assertIn('FROM student_project_supervisions WHERE submission_id = ws.id AND is_selected IS TRUE', query)

    def test_ownership_and_locked_submission(self):
        from unittest.mock import Mock
        cursor = Mock()
        cursor.fetchone.return_value = None
        with self.assertRaises(HTTPException) as error:
            owned_item(cursor, 'teaching_workloads:00000000-0000-0000-0000-000000000001', {'id':'owner'})
        self.assertEqual(error.exception.status_code, 404)
        self.assertIn('s.professor_id::text = %s', cursor.execute.call_args.args[0])
        self.assertEqual(cursor.execute.call_args.args[1][-1], 'owner')
        with self.assertRaises(HTTPException):
            key_parts('professors:00000000-0000-0000-0000-000000000001')
        with self.assertRaises(HTTPException):
            check_editable('APPROVED')

    def test_profile_arrays(self):
        self.assertEqual(convert('หนึ่ง\nสอง', {'data_type':'ARRAY'}), ['หนึ่ง', 'สอง'])

    def test_profile_cannot_change_identity_or_access(self):
        for field in ('id', 'role', 'password_hash', 'faculty', 'department'):
            with self.assertRaises(HTTPException) as error:
                update_profile({field: 'changed'}, {'id':'owner'}, None)
            self.assertEqual(error.exception.status_code, 422)


if __name__ == '__main__':
    unittest.main()
