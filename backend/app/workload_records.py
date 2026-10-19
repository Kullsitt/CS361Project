"""Validated UI records mapped to native workload columns (no client scores)."""
import json
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from urllib.parse import urlsplit

RULES = json.loads(Path(__file__).with_name('workload_rules.json').read_text(encoding='utf-8'))
COMMON = {
    'subtype': 'workload_subtype', 'role_note': 'role_note',
    'evidence_url': 'evidence_url', 'attachments': 'attachment_names',
    'score_status': 'score_status', 'score': 'score',
}
# Existing semantic columns are used first; migration adds only missing fields.
MAPPINGS = {
    'teaching_workloads': dict(COMMON, title='course_code', course='course_code', role='role_type', credits='credits', students='student_count', hours='workload_hours', share='contribution_percent', quantity='item_count'),
    'student_project_supervisions': dict(COMMON, title='workload_title', course='course_code', role='role_type', quantity='project_count', share='contribution_percent', student_names='student_names'),
    'thesis_supervisions': dict(COMMON, title='workload_title', course='course_code', role='role_type', credits='registered_credit', share='contribution_percent', student_names='student_name'),
    'academic_work_items': dict(COMMON, title='title', role='role_type', share='contribution_percent', source='source_name', budget='budget_amount', quantity='item_count', student_names='student_names'),
    'administrative_work_items': dict(COMMON, title='position_or_task_name', role='role_type', course='course_code', students='student_count', quantity='item_count', share='contribution_percent', student_names='student_names'),
    'service_work_items': dict(COMMON, title='title', role='role_type', organization='organization', quantity='item_count', share='contribution_percent', student_names='student_names'),
}


def table_for(code):
    if code in ('1.4', '1.5', '1.10'):
        return 'student_project_supervisions'
    if code in ('1.9', '1.11'):
        return 'thesis_supervisions'
    return {'1': 'teaching_workloads', '2': 'academic_work_items',
            '3': 'administrative_work_items', '4': 'service_work_items'}[code.split('.')[0]]


def number(value, name, *, integer=False, maximum=1000000000000):
    try:
        if isinstance(value, bool) or value is None or str(value).strip() == '':
            raise ValueError()
        result = Decimal(str(value))
        if not result.is_finite() or not 0 <= result <= maximum:
            raise ValueError()
        if integer and result != result.to_integral_value():
            raise ValueError()
        return result
    except (InvalidOperation, ValueError):
        raise ValueError(f'ค่าของ {name} ไม่ถูกต้อง') from None


def text(value, name, limit=2000):
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError(f'ค่าของ {name} ไม่ถูกต้อง')
    return value.strip()


def validate(data):
    code = str(data.get('subtype', '')).split(' ')[0]
    config = RULES.get(code)
    if not config or data.get('category') != config['category']:
        raise ValueError('ประเภทภาระงานไม่ถูกต้องหรือยังไม่รองรับ')
    role = next((r for r in config['roles'] if r['name'] == data.get('role') and r['available']), None)
    if role is None:
        raise ValueError('บทบาทไม่ตรงกับประเภทภาระงาน')
    year = int(number(data.get('year'), 'ปีการศึกษา', integer=True, maximum=2700))
    if year < 2500:
        raise ValueError('ปีการศึกษาต้องอยู่ระหว่าง 2500–2700')
    semester = str(data.get('semester', ''))
    if semester not in ('1', '2', 'summer'):
        raise ValueError('ภาคการศึกษาไม่ถูกต้อง')
    result = dict(category=config['category'], subtype=config['subtype'], year=year, semester=semester)
    for name in ('title', 'role_note', 'evidence_url'):
        result[name] = text(data.get(name, ''), name, 255 if name == 'title' else 2000)
    if not result['title']:
        raise ValueError('กรุณาระบุชื่อรายการภาระงาน')
    if result['evidence_url']:
        url = urlsplit(result['evidence_url'])
        if url.scheme not in ('http', 'https') or not url.hostname:
            raise ValueError('ลิงก์หลักฐานต้องเป็น http:// หรือ https://')
    names = data.get('attachments', [])
    if not isinstance(names, list) or len(names) > 30:
        raise ValueError('รายการชื่อไฟล์ไม่ถูกต้อง')
    result['attachments'] = [text(n, 'ชื่อไฟล์', 255) for n in names]
    for name in role['fields']:
        if name in ('credits', 'hours', 'students', 'quantity', 'share', 'budget'):
            raw = data.get(name, '')
            required = name in ('credits', 'quantity', 'share') or (name == 'students' and code in ('1.1', '3.3'))
            if raw in ('', None) and not required:
                result[name] = None
            else:
                result[name] = number(raw, name, integer=name in ('students', 'quantity'), maximum=100 if name == 'share' else 1000000000)
        else:
            result[name] = text(data.get(name, ''), name, {'course':20, 'organization':255}.get(name, 1000))
    if role['students']:
        result['student_names'] = text(data.get('student_names', ''), 'ชื่อนักศึกษา', 10000)
    if table_for(code) == 'teaching_workloads':
        result['course'] = text(result.get('course') or result['title'], 'รหัสวิชา', 20)
        result['title'] = result['course']
    weight = role['weight']
    if code == '1.1':
        count = result['students']
        weight = 1 if count < 100 else 1.1 if count <= 250 else 1.2 if count <= 500 else 1.3
    if code == '3.3' and role == config['roles'][3] and result['students'] <= 300:
        raise ValueError('คะแนนเพิ่มนี้ใช้สำหรับนักศึกษามากกว่า 300 คน')
    result['score_status'] = 'pending' if weight == '' else 'calculated'
    result['score'] = None
    if weight != '':
        units = {'single': Decimal(1), 'direct': Decimal(1), 'quantity': result.get('quantity', Decimal(1)),
                 'credits': result.get('credits', Decimal(0)), 'credits3': result.get('credits', Decimal(0)) / 3}[config['basis']]
        result['score'] = (200 * units * Decimal(str(weight)) * result.get('share', Decimal(100)) / 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return result


def columns(record):
    table = table_for(record['subtype'].split(' ')[0])
    values = {column: record.get(field) for field, column in MAPPINGS[table].items()}
    if table == 'academic_work_items':
        values['work_type'] = record['subtype']
    if table == 'teaching_workloads':
        values['workload_hours'] = values['workload_hours'] or 0
    if table in ('administrative_work_items', 'service_work_items'):
        config = RULES[record['subtype'].split(' ')[0]]
        weight = next(role['weight'] for role in config['roles'] if role['name'] == record['role'])
        values['weight'] = None if weight == '' else weight
    return table, values


def from_row(table, row):
    result = {field: row.get(column) for field, column in MAPPINGS[table].items()}
    subtype = result.get('subtype') or ''
    config = RULES.get(subtype.split(' ')[0])
    result.update(id=f"{table}:{row['id']}", year=row['academic_year'],
                  semester='summer' if str(row['semester']) == '3' else str(row['semester']),
                  category=config['category'] if config else {'teaching_workloads':'teaching', 'student_project_supervisions':'teaching', 'thesis_supervisions':'teaching', 'academic_work_items':'academic', 'administrative_work_items':'admin', 'service_work_items':'service'}[table],
                  editable=bool(config), title=result.get('title') or row.get('course_code') or 'รายการเดิม',
                  score_status=result.get('score_status') or ('pending' if row.get('score') is None else 'calculated'))
    return result
