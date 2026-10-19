"""Explicit deployment step. Default is a read-only schema check."""
import sys
from pathlib import Path
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'backend'))
from app.core.database import get_pool
from app.workload_records import MAPPINGS

conn = get_pool().getconn()
try:
    with conn.cursor() as cur:
        if '--apply' in sys.argv:
            cur.execute((root / 'backend/migrations/001_dashboard_fields.sql').read_text(encoding='utf-8'))
            if '--remove-course-name' in sys.argv:
                cur.execute((root / 'backend/migrations/002_remove_course_name.sql').read_text(encoding='utf-8'))
            conn.commit()
            print('Dashboard migration committed. Existing rows preserved.')
            if '--remove-course-name' in sys.argv:
                print('Removed course_name_th column and its stored values; course_code retained.')
        else:
            conn.set_session(readonly=True)
            missing = []
            for table, fields in MAPPINGS.items():
                cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s", (table,))
                actual = {row[0] for row in cur.fetchall()}
                missing.extend(f'{table}.{column}' for column in fields.values() if column not in actual)
            print('Missing columns:', len(missing))
            for column in missing:
                print(column)
            print('Check only. Review/backup before running with --apply; type changes are also in the SQL file.')
finally:
    conn.rollback()
    conn.close()
