from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg2.extras import RealDictCursor
from app.core.database import get_db

# 1. กำหนด prefix="/publications" เพื่อจับคู่กับ main.py (prefix="/api") เป็น /api/publications
router = APIRouter(prefix="/publications", tags=["Publications"])


# =================================================================
# 1. ดึงผลงานวิชาการทั้งหมด (รองรับ Filter ตาม professor_id และ year)
# Endpoint: GET /api/publications
# =================================================================
@router.get("", summary="ดึงผลงานวิชาการทั้งหมด")
@router.get("/", include_in_schema=False)
def get_all_publications(
    professor_id: Optional[str] = Query(None, description="กรองตามรหัสอาจารย์ (UUID)"),
    year: Optional[int] = Query(None, description="กรองตามปีที่ตีพิมพ์"),
    conn = Depends(get_db)
):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # แก้ไข 1: เปลี่ยนชื่อตารางเป็น professor_publications (มี s)
        query = """
            SELECT 
                p.id::text,
                p.openalex_id,
                p.title,
                p.publication_year,
                p.publication_date,
                p.work_type,
                p.doi,
                p.source_name,
                p.citation_count,
                p.authors,
                pp.professor_id::text AS professor_id,
                pp.author_position,
                pp.is_corresponding,
                CONCAT(COALESCE(prof.title, ''), COALESCE(prof.first_name_th, ''), ' ', COALESCE(prof.last_name_th, '')) AS professor_name
            FROM publications p
            LEFT JOIN professor_publications pp ON p.id = pp.publication_id
            LEFT JOIN professors prof ON pp.professor_id = prof.id
            WHERE 1=1
        """
        params = []

        if professor_id:
            # แก้ไข 2: ใช้ ::text เปรียบเทียบ UUID เป็น String
            query += " AND pp.professor_id::text = %s"
            params.append(str(professor_id))

        if year:
            query += " AND p.publication_year = %s"
            params.append(year)

        # แก้ไข 3: เอา p.created_at ออกจาก ORDER BY
        query += " ORDER BY p.publication_year DESC NULLS LAST;"

        cursor.execute(query, tuple(params))
        publications = cursor.fetchall()

        return {
            "status": "success",
            "count": len(publications),
            "data": publications
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")
    finally:
        cursor.close()


# =================================================================
# 2. ดึงผลงานวิชาการของอาจารย์รายคน ตาม professor_id
# Endpoint: GET /api/publications/professor/{prof_id}
# =================================================================
@router.get("/professor/{prof_id}", summary="ดึงผลงานวิชาการทั้งหมดของอาจารย์รายบุคคล")
def get_publications_by_professor(prof_id: str, conn = Depends(get_db)):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        query = """
            SELECT 
                p.id::text,
                p.openalex_id,
                p.title,
                p.publication_year,
                p.publication_date,
                p.work_type,
                p.doi,
                p.source_name,
                p.citation_count,
                p.authors,
                pp.author_position,
                pp.is_corresponding,
                pp.created_at AS linked_at
            FROM publications p
            INNER JOIN professor_publications pp ON p.id = pp.publication_id
            WHERE pp.professor_id::text = %s
            ORDER BY p.publication_year DESC NULLS LAST, p.publication_date DESC NULLS LAST;
        """
        cursor.execute(query, (str(prof_id),))
        publications = cursor.fetchall()

        return {
            "status": "success",
            "count": len(publications),
            "data": publications
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")
    finally:
        cursor.close()


# =================================================================
# 3. ดึงรายละเอียดผลงานวิชาการชิ้นเดียว พร้อมรายชื่ออาจารย์ในระบบที่เกี่ยวข้อง
# Endpoint: GET /api/publications/{pub_id}
# =================================================================
@router.get("/{pub_id}", summary="ดึงรายละเอียดผลงานวิชาการตาม ID")
def get_publication_by_id(pub_id: str, conn = Depends(get_db)):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # ดึงข้อมูลผลงาน
        query_pub = """
            SELECT 
                id::text,
                openalex_id,
                title,
                publication_year,
                publication_date,
                work_type,
                doi,
                source_name,
                citation_count,
                authors
            FROM publications
            WHERE id::text = %s;
        """
        cursor.execute(query_pub, (str(pub_id),))
        pub = cursor.fetchone()

        if not pub:
            raise HTTPException(status_code=404, detail=f"ไม่พบผลงานวิชาการรหัส ID: {pub_id}")

        # ดึงรายชื่ออาจารย์ในภาควิชาที่มีส่วนร่วมในผลงานชิ้นนี้
        query_authors = """
            SELECT 
                prof.id::text AS professor_id,
                CONCAT(COALESCE(prof.title, ''), COALESCE(prof.first_name_th, ''), ' ', COALESCE(prof.last_name_th, '')) AS professor_name,
                prof.email,
                pp.author_position,
                pp.is_corresponding
            FROM professor_publications pp
            JOIN professors prof ON pp.professor_id = prof.id
            WHERE pp.publication_id::text = %s;
        """
        cursor.execute(query_authors, (str(pub_id),))
        related_professors = cursor.fetchall()

        pub["related_professors"] = related_professors

        return {
            "status": "success",
            "data": pub
        }
    except HTTPException as http_ex:
        raise http_ex
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")
    finally:
        cursor.close()

        