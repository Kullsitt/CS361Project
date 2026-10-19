"""Read schema metadata only; never prints credentials or professor records."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.core.database import get_pool

conn = get_pool().getconn()
try:
    conn.set_session(readonly=True)
    with conn.cursor() as cur:
        cur.execute("""SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod)
            FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
              AND a.attnum > 0 AND NOT a.attisdropped
            ORDER BY c.relname, a.attnum""")
        print(json.dumps(cur.fetchall(), ensure_ascii=False, indent=2))
finally:
    conn.rollback()
    conn.close()
