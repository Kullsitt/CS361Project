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
            async def check():
              async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                for method, path in [('GET','/api/workloads'), ('POST','/api/workloads'),
                                     ('PUT','/api/workloads/x'), ('DELETE','/api/workloads/x'),
                                     ('GET','/api/profile/me'), ('PUT','/api/profile/me')]:
                    response = await client.request(method, path, json={})
                    self.assertEqual(response.status_code, 401)
            asyncio.run(check())
        finally:
            app.dependency_overrides.clear()

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
