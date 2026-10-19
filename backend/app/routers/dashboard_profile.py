"""Self-service profile edits; permission/identity fields are not editable."""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from psycopg2.extras import RealDictCursor, Json
from app.core.database import get_db
from app.routers.auth import get_current_user
from app.routers.professors import get_professor_by_id

router = APIRouter(prefix='/profile', tags=['My profile'])
FIELDS = {'title', 'title_en', 'first_name_th', 'last_name_th', 'first_name_en',
          'last_name_en', 'academic_rank', 'academic_rank_en', 'office_address',
          'phone_number', 'email', 'expertise', 'research_interests', 'education',
          'google_scholar', 'research_gate'}
STRUCTURED = {'expertise', 'research_interests', 'education'}


@router.get('/me')
def read_profile(user=Depends(get_current_user), conn=Depends(get_db)):
    return get_professor_by_id(user['id'], conn)


def convert(value, metadata):
    if metadata['data_type'] == 'ARRAY':
        if isinstance(value, str):
            value = [line.strip() for line in value.splitlines() if line.strip()]
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise ValueError('ข้อมูลต้องเป็นรายการข้อความ')
        return value
    if metadata['data_type'] in ('json', 'jsonb'):
        if isinstance(value, str):
            stripped = value.strip()
            value = json.loads(stripped) if stripped.startswith(('[', '{')) else [line.strip() for line in stripped.splitlines() if line.strip()]
        return Json(value)
    if not isinstance(value, str):
        raise ValueError('ข้อมูลต้องเป็นข้อความ')
    return value.strip()


@router.put('/me')
def update_profile(payload: dict, user=Depends(get_current_user), conn=Depends(get_db)):
    if not payload or set(payload) - FIELDS:
        raise HTTPException(422, 'มีฟิลด์ที่ไม่อนุญาตให้แก้ไข')
    if any(len(str(v)) > 10000 for v in payload.values()):
        raise HTTPException(422, 'ข้อมูลยาวเกินกำหนด')
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""SELECT column_name, data_type, character_maximum_length FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'professors'""")
            metadata = {r['column_name']: r for r in cur.fetchall()}
            values = {}
            for name, value in payload.items():
                if name not in metadata:
                    raise HTTPException(409, 'โครงสร้างฐานข้อมูลยังไม่รองรับฟิลด์นี้')
                if name not in STRUCTURED and not isinstance(value, str):
                    raise ValueError('ข้อมูลต้องเป็นข้อความ')
                values[name] = convert(value, metadata[name])
                limit = metadata[name]['character_maximum_length']
                if limit and isinstance(values[name], str) and len(values[name]) > limit:
                    raise ValueError(f'{name} ยาวเกิน {limit} ตัวอักษร')
            for name in ('first_name_th', 'last_name_th', 'email'):
                if name in values and not values[name]:
                    raise ValueError('กรุณากรอกชื่อ นามสกุล และอีเมล')
            if 'email' in values:
                from pydantic import TypeAdapter, EmailStr
                values['email'] = str(TypeAdapter(EmailStr).validate_python(values['email']))
            for name in ('google_scholar', 'research_gate'):
                if values.get(name) and not values[name].startswith(('https://', 'http://')):
                    raise ValueError('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://')
            assignments = ', '.join(f'{name} = %s' for name in values)
            cur.execute(f'UPDATE professors SET {assignments}, updated_at = NOW() WHERE id::text = %s RETURNING id', (*values.values(), user['id']))
            if not cur.fetchone():
                raise HTTPException(404, 'ไม่พบข้อมูลอาจารย์')
            result = get_professor_by_id(user['id'], conn)
        conn.commit()
        return result
    except HTTPException:
        conn.rollback()
        raise
    except ValueError as exc:
        conn.rollback()
        raise HTTPException(422, str(exc)) from None
    except Exception:
        conn.rollback()
        logging.exception('Could not update profile')
        raise HTTPException(500, 'บันทึกข้อมูลส่วนตัวไม่สำเร็จ กรุณาลองใหม่') from None
