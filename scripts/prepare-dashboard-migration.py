"""Generate reviewable SQL; does not connect to or change any database."""
import sys
from pathlib import Path
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'backend'))
from app.workload_records import MAPPINGS

types = {'attachments': 'text[]', 'score': 'numeric', 'credits': 'numeric',
         'students': 'integer', 'hours': 'numeric', 'share': 'numeric',
         'quantity': 'integer', 'budget': 'numeric'}
lines = ['-- Dashboard fields: additive columns; existing rows are preserved.',
         '-- Run in a transaction after backup/schema review. No data backfill guesses.',
         "SET LOCAL lock_timeout = '5s';", "SET LOCAL statement_timeout = '60s';"]
for table, fields in MAPPINGS.items():
    for field, column in fields.items():
        lines.append(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {types.get(field, "text")};')
    # PDF role labels can exceed existing varchar limits.
    lines.append(f'ALTER TABLE {table} ALTER COLUMN role_type TYPE text;')
    lines.append(f'ALTER TABLE {table} ALTER COLUMN score TYPE numeric;')
lines.extend([
    'ALTER TABLE teaching_workloads ALTER COLUMN credits TYPE numeric USING credits::numeric;',
    'ALTER TABLE thesis_supervisions ALTER COLUMN student_name TYPE text;',
    'ALTER TABLE academic_work_items ALTER COLUMN work_type TYPE text;',
    'ALTER TABLE administrative_work_items ALTER COLUMN weight TYPE numeric;',
    'ALTER TABLE service_work_items ALTER COLUMN weight TYPE numeric;',
    'ALTER TABLE teaching_workloads ALTER COLUMN workload_hours TYPE numeric;',
    'ALTER TABLE thesis_supervisions ALTER COLUMN registered_credit TYPE numeric;',
    'ALTER TABLE workload_submissions ALTER COLUMN total_score TYPE numeric;',
])
path = root / 'backend/migrations/001_dashboard_fields.sql'
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('Prepared migration SQL (not applied).')
