from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg2.extras import RealDictCursor
from app.core.database import get_db

# กำหนด prefix="/professors" เพื่อให้สอดคล้องกับ prefix="/api" ใน main.py
router = APIRouter(prefix="/professors", tags=["Professors"])

# =================================================================
# 1. ดึงรายชื่ออาจารย์ทั้งหมด (พร้อมสร้างชื่อเต็มและกรองตามภาควิชา/คณะ)
# Endpoint: GET /api/professors
# =================================================================
@router.get("", summary="ดึงรายชื่ออาจารย์ทั้งหมด")
@router.get("/", include_in_schema=False)
def get_all_professors(
    department: Optional[str] = Query(None, description="กรองตามภาควิชา"),
    faculty: Optional[str] = Query(None, description="กรองตามคณะ"),
    conn = Depends(get_db)
):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        query = """
            SELECT 
                id::text,
                title,
                first_name_th,
                last_name_th,
                CONCAT(COALESCE(title, ''), COALESCE(first_name_th, ''), ' ', COALESCE(last_name_th, '')) AS full_name_th,
                title_en,
                first_name_en,
                last_name_en,
                CONCAT(COALESCE(title_en, ''), ' ', COALESCE(first_name_en, ''), ' ', COALESCE(last_name_en, '')) AS full_name_en,
                academic_rank,
                academic_rank_en,
                faculty,
                department,
                email,
                phone_number,
                profile_url
            FROM professors
            WHERE 1=1
        """
        params = []

        if department:
            query += " AND department = %s"
            params.append(department)
            
        if faculty:
            query += " AND faculty = %s"
            params.append(faculty)

        query += " ORDER BY first_name_th ASC;"

        cursor.execute(query, tuple(params))
        professors = cursor.fetchall()

        return {
            "status": "success",
            "count": len(professors),
            "data": professors
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")
    finally:
        cursor.close()


# =================================================================
# 2. ดึงข้อมูลโปรไฟล์อาจารย์รายบุคคลแบบละเอียด (รวมประวัติ/ผลงาน)
# Endpoint: GET /api/professors/{prof_id}
# =================================================================
@router.get("/{prof_id}", summary="ดึงข้อมูลโปรไฟล์อาจารย์รายบุคคลตาม UUID")
def get_professor_by_id(prof_id: str, conn = Depends(get_db)):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        query = """
            SELECT 
                id::text,
                title,
                first_name_th,
                last_name_th,
                CONCAT(COALESCE(title, ''), COALESCE(first_name_th, ''), ' ', COALESCE(last_name_th, '')) AS full_name_th,
                title_en,
                first_name_en,
                last_name_en,
                CONCAT(COALESCE(title_en, ''), ' ', COALESCE(first_name_en, ''), ' ', COALESCE(last_name_en, '')) AS full_name_en,
                academic_rank,
                academic_rank_en,
                faculty,
                department,
                office_address,
                phone_number,
                email,
                expertise,
                google_scholar,
                research_gate,
                research_interests,
                education,
                profile_url,
                created_at,
                updated_at
            FROM professors
            WHERE id::text = %s;
        """
        cursor.execute(query, (str(prof_id),))
        professor = cursor.fetchone()

        if not professor:
            raise HTTPException(status_code=404, detail=f"ไม่พบอาจารย์รหัส ID: {prof_id}")

        # ส่ง Object ของอาจารย์กลับไปตรงๆ เพื่อให้ Frontend (teacherScript.js) อ่านค่าได้ทันที
        return professor

    except HTTPException as http_ex:
        raise http_ex
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")
    finally:
        cursor.close()