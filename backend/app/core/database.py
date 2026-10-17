import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager
from app.core.config import settings

# สร้าง Connection Pool (ขั้นต่ำ 1 connection, สูงสุด 20 connections)
pool = ThreadedConnectionPool(
    minconn=1,
    maxconn=20,
    host=settings.DB_HOST,
    port=settings.DB_PORT,
    dbname=settings.DB_NAME,
    user=settings.DB_USER,
    password=settings.DB_PASSWORD
)

def get_db():
    """
    Generator function สำหรับใช้กับ FastAPI Dependency Injection (`Depends(get_db)`)
    จะทำการยืม connection จาก pool และคืนกลับอัตโนมัติเมื่อ API ทำงานเสร็จ
    """
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)

@contextmanager
def get_db_cursor():
    """
    Context manager สำหรับใช้ในสคริปต์ภายนอกหรือบริการหลังบ้าน (Services/Scripts)
    ตัวอย่างการใช้:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT * FROM professors")
            data = cursor.fetchall()
    """
    conn = pool.getconn()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        yield cursor
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()
        pool.putconn(conn)