"""Authenticated teacher CRUD. Deploy only after the dashboard migration."""
import logging
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException
from psycopg2.extras import RealDictCursor
from app.core.database import get_db
from app.routers.auth import get_current_user
from app.workload_records import MAPPINGS, columns, from_row, validate

router = APIRouter(prefix='/workloads', tags=['Teacher workload management'])
log = logging.getLogger(__name__)


def key_parts(key):
    try:
        table, raw_id = key.split(':', 1)
        if table not in MAPPINGS:
            raise ValueError()
        return table, str(UUID(raw_id))
    except ValueError:
        raise HTTPException(404, 'ไม่พบรายการภาระงาน') from None


def lock_owner(cur, user):
    # Serialize writes for one professor, including creating the first submission.
    cur.execute('SELECT id FROM professors WHERE id::text = %s FOR UPDATE', (user['id'],))
    if not cur.fetchone():
        raise HTTPException(404, 'ไม่พบข้อมูลอาจารย์')


def owned_item(cur, key, user):
    table, item_id = key_parts(key)
    cur.execute(f'''SELECT i.*, s.status FROM {table} i
        JOIN workload_submissions s ON s.id = i.submission_id
        WHERE i.id::text = %s AND s.professor_id::text = %s FOR UPDATE OF i, s''',
        (item_id, user['id']))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, 'ไม่พบรายการภาระงาน')
    check_editable(row['status'])
    return table, item_id, row


def check_editable(status):
    if status and str(status).upper() not in ('DRAFT', 'PENDING'):
        raise HTTPException(409, 'ภาระงานผ่านการพิจารณาแล้ว กรุณาติดต่อเจ้าหน้าที่ก่อนแก้ไข')


def submission(cur, user, record):
    semester = 3 if record['semester'] == 'summer' else int(record['semester'])
    cur.execute('''SELECT id, status FROM workload_submissions
        WHERE professor_id::text = %s AND academic_year = %s AND semester = %s
        ORDER BY created_at LIMIT 2 FOR UPDATE''', (user['id'], record['year'], semester))
    rows = cur.fetchall()
    if len(rows) > 1:
        raise HTTPException(409, 'มีชุดภาระงานซ้ำในภาคเรียนนี้ กรุณาให้เจ้าหน้าที่ตรวจสอบ')
    if rows:
        check_editable(rows[0]['status'])
        return str(rows[0]['id'])
    new_id = str(uuid4())
    cur.execute('''INSERT INTO workload_submissions
        (id, professor_id, academic_year, semester, total_score, status, created_at, updated_at)
        VALUES (%s, %s, %s, %s, 0, 'PENDING', NOW(), NOW())''',
        (new_id, user['id'], record['year'], semester))
    return new_id


def recalculate(cur, submission_id):
    # Raw item total only: category caps/approval are a separate assessment step.
    tables = [*MAPPINGS, 'extra_score_items']
    query = ' UNION ALL '.join(f'SELECT score FROM {t} WHERE submission_id = %s AND is_selected IS TRUE' for t in tables)
    cur.execute(f'''UPDATE workload_submissions SET total_score =
        (SELECT COALESCE(SUM(score), 0) FROM ({query}) scores), updated_at = NOW()
        WHERE id = %s''', tuple([submission_id] * len(tables) + [submission_id]))


@router.get('')
def list_workloads(user=Depends(get_current_user), conn=Depends(get_db)):
    try:
        result = []
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            for table in MAPPINGS:
                cur.execute(f'''SELECT i.*, s.academic_year, s.semester, s.status AS submission_status
                    FROM {table} i JOIN workload_submissions s ON s.id = i.submission_id
                    WHERE s.professor_id::text = %s ORDER BY s.academic_year DESC, s.semester DESC, i.created_at DESC''', (user['id'],))
                for row in cur.fetchall():
                    item = from_row(table, row)
                    item['editable'] = item['editable'] and str(row['submission_status'] or 'PENDING').upper() in ('DRAFT', 'PENDING')
                    item['deletable'] = str(row['submission_status'] or 'PENDING').upper() in ('DRAFT', 'PENDING')
                    result.append(item)
        return result
    except Exception:
        log.exception('Could not list workloads')
        raise HTTPException(500, 'โหลดภาระงานไม่สำเร็จ กรุณาลองใหม่') from None


def save(payload, user, conn, key=None):
    try:
        record = validate(payload)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            lock_owner(cur, user)
            old = owned_item(cur, key, user) if key else None
            sid = submission(cur, user, record)
            table, values = columns(record)
            if record['subtype'].split(' ')[0] == '3.5':
                cur.execute('''SELECT id::text FROM administrative_work_items
                    WHERE submission_id = %s AND workload_subtype LIKE '3.5 %%' AND role_type = %s''', (sid, record['role']))
                if any(not old or old[0] != table or row['id'] != old[1] for row in cur.fetchall()):
                    raise HTTPException(409, 'บทบาทอาจารย์ที่ปรึกษานี้มีแล้วในภาคเรียนเดียวกัน')
            if old and old[0] == table:
                item_id = old[1]
                values['submission_id'] = sid
                # values contains only server-owned column names, never client keys.
                assignments = ', '.join(f'{column} = %s' for column in values)
                cur.execute(f'UPDATE {table} SET {assignments} WHERE id = %s', (*values.values(), item_id))
            else:
                item_id = str(uuid4())
                values.update(id=item_id, submission_id=sid, is_selected=True)
                names = ', '.join(values)
                placeholders = ', '.join(['%s'] * len(values))
                cur.execute(f'INSERT INTO {table} ({names}) VALUES ({placeholders})', tuple(values.values()))
                if old:
                    cur.execute(f'DELETE FROM {old[0]} WHERE id = %s', (old[1],))
            recalculate(cur, sid)
            if old and str(old[2]['submission_id']) != sid:
                recalculate(cur, str(old[2]['submission_id']))
        conn.commit()
        return dict(record, id=f'{table}:{item_id}', editable=True, deletable=True)
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        log.exception('Could not save workload')
        raise HTTPException(500, 'บันทึกภาระงานไม่สำเร็จ กรุณาลองใหม่') from None


@router.post('', status_code=201)
def create_workload(payload: dict, user=Depends(get_current_user), conn=Depends(get_db)):
    return save(payload, user, conn)


@router.put('/{key}')
def update_workload(key: str, payload: dict, user=Depends(get_current_user), conn=Depends(get_db)):
    return save(payload, user, conn, key)


@router.delete('/{key}', status_code=204)
def delete_workload(key: str, user=Depends(get_current_user), conn=Depends(get_db)):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            lock_owner(cur, user)
            table, item_id, row = owned_item(cur, key, user)
            cur.execute(f'DELETE FROM {table} WHERE id = %s', (item_id,))
            recalculate(cur, str(row['submission_id']))
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        log.exception('Could not delete workload')
        raise HTTPException(500, 'ลบภาระงานไม่สำเร็จ กรุณาลองใหม่') from None
