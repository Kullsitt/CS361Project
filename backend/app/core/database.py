import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager
from threading import Lock
from app.core.config import settings

# สร้าง Connection Pool (ขั้นต่ำ 1 connection, สูงสุด 20 connections)
pool = None
pool_lock = Lock()


def get_pool():
    # Importing the API for offline tests must not connect to production.
    global pool
    with pool_lock:
        if pool is None:
            pool = ThreadedConnectionPool(
                minconn=1, maxconn=20, host=settings.DB_HOST,
                port=settings.DB_PORT, dbname=settings.DB_NAME,
                user=settings.DB_USER, password=settings.DB_PASSWORD,
                connect_timeout=10,
            )
    return pool

def get_db():
    """
    Generator function สำหรับใช้กับ FastAPI Dependency Injection (`Depends(get_db)`)
    จะทำการยืม connection จาก pool และคืนกลับอัตโนมัติเมื่อ API ทำงานเสร็จ
    """
    active_pool = get_pool()
    conn = active_pool.getconn()
    try:
        yield conn
    finally:
        conn.rollback()
        active_pool.putconn(conn)

@contextmanager
def get_db_cursor():
    """
    Context manager สำหรับใช้ในสคริปต์ภายนอกหรือบริการหลังบ้าน (Services/Scripts)
    ตัวอย่างการใช้:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT * FROM professors")
            data = cursor.fetchall()
    """
    active_pool = get_pool()
    conn = active_pool.getconn()
    cursor = None
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        yield cursor
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        if cursor is not None:
            cursor.close()
        active_pool.putconn(conn)
