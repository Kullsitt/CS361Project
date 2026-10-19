from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, HTTPException, status
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel
from app.core.database import get_db

router = APIRouter(prefix="/workloads", tags=["Workloads"])

class StatusUpdatePayload(BaseModel):
    status: str  # 'PASS', 'FAIL', 'PENDING', 'APPROVED', 'REJECTED'


# ---------------- 1. ดึงข้อมูลภาระงานแยกตามหมวดหมู่ ----------------
@router.get("/by-category", summary="ดึงข้อมูลภาระงานแยกตามหมวดหมู่ (ไม่รวมงานวิจัย)")
def get_workloads_by_category(
    professor_id: str = Query(..., description="ID ของอาจารย์ (professor_id)"),
    category: str = Query("TEACHING", description="TEACHING, ADVISING, ADMINISTRATIVE, SERVICE"),
    conn = Depends(get_db)
):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cat = category.upper()

        if cat == "TEACHING":
            query = """
                SELECT 
                    tw.id::text, tw.course_code, tw.course_name_th, tw.section, 
                    tw.credits, tw.student_count, tw.workload_hours, tw.is_selected, 
                    tw.score, ws.semester, ws.academic_year
                FROM teaching_workloads tw
                JOIN workload_submissions ws ON ws.id = tw.submission_id
                WHERE ws.professor_id::text = %s
                ORDER BY ws.academic_year DESC, ws.semester DESC;
            """
            params = (str(professor_id),)

        elif cat == "ADVISING":
            query = """
                SELECT 
                    ts.id::text, ts.course_code, ts.student_name AS advisee_name, 
                    ts.degree_level, ts.role_type AS role, ts.is_selected, ts.score, 
                    ws.semester, ws.academic_year
                FROM thesis_supervisions ts
                JOIN workload_submissions ws ON ws.id = ts.submission_id
                WHERE ws.professor_id::text = %s

                UNION ALL

                SELECT 
                    sps.id::text, sps.course_code, 
                    CONCAT('โครงงานนักศึกษา (', sps.project_count, ' โครงงาน)') AS advisee_name, 
                    'ปริญญาตรี' AS degree_level, sps.role_type AS role, sps.is_selected, sps.score, 
                    ws.semester, ws.academic_year
                FROM student_project_supervisions sps
                JOIN workload_submissions ws ON ws.id = sps.submission_id
                WHERE ws.professor_id::text = %s;
            """
            params = (str(professor_id), str(professor_id))

        elif cat == "ADMINISTRATIVE":
            query = """
                SELECT 
                    awi.id::text, awi.position_or_task_name AS title, awi.organization, 
                    awi.appointment_no, awi.start_date::text, awi.end_date::text, 
                    awi.weight, awi.is_selected, awi.score, ws.semester, ws.academic_year
                FROM administrative_work_items awi
                JOIN workload_submissions ws ON ws.id = awi.submission_id
                WHERE ws.professor_id::text = %s;
            """
            params = (str(professor_id),)

        elif cat in ["SERVICE", "EXTRA"]:
            query = """
                SELECT 
                    swi.id::text, swi.title, swi.role_type AS role, swi.organization, 
                    swi.service_date::text, swi.weight, swi.is_selected, swi.score, 
                    ws.semester, ws.academic_year
                FROM service_work_items swi
                JOIN workload_submissions ws ON ws.id = swi.submission_id
                WHERE ws.professor_id::text = %s

                UNION ALL

                SELECT 
                    esi.id::text, esi.title, 'Extra Score' AS role, esi.description AS organization, 
                    NULL AS service_date, 1.0 AS weight, esi.is_selected, esi.score, 
                    ws.semester, ws.academic_year
                FROM extra_score_items esi
                JOIN workload_submissions ws ON ws.id = esi.submission_id
                WHERE ws.professor_id::text = %s;
            """
            params = (str(professor_id), str(professor_id))

        else:
            return []

        cursor.execute(query, params)
        return cursor.fetchall()

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database Query Error: {str(e)}"
        )
    finally:
        cursor.close()


# ---------------- 2. Officer Dashboard (คำนวณสรุปรายอาจารย์) ----------------
@router.get("/officer/dashboard", summary="ดึงข้อมูลสรุปภาระงานอาจารย์ทั้งหมดสำหรับ Officer")
def get_officer_dashboard(
    academic_year: Optional[int] = Query(None),
    semester: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    conn = Depends(get_db)
):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        query = """
            SELECT 
                p.id::text AS id,
                CONCAT(COALESCE(p.title, ''), p.first_name_th, ' ', p.last_name_th) AS name,
                COALESCE(p.academic_rank, 'อาจารย์') AS position,
                ws.id::text AS submission_id,
                COALESCE(ws.academic_year, 2567) AS academic_year,
                COALESCE(ws.semester, 2) AS semester,
                COALESCE(ws.status, 'PENDING') AS status,
                
                -- คำนวณหน่วยกิตสอนรวม
                COALESCE((SELECT SUM(credits) FROM teaching_workloads WHERE submission_id = ws.id), 0) AS credits,
                
                -- หมวด 1: งานสอน (เพดาน 900)
                COALESCE((SELECT SUM(score) FROM teaching_workloads WHERE submission_id = ws.id), 0) AS m1_actual,
                LEAST(COALESCE((SELECT SUM(score) FROM teaching_workloads WHERE submission_id = ws.id), 0), 900.0) AS m1_calc,
                
                -- หมวด 2: งานวิชาการ (เพดาน 900)
                COALESCE((SELECT SUM(score) FROM academic_work_items WHERE submission_id = ws.id), 0) 
                + COALESCE((SELECT SUM(calculated_score) FROM professor_publications WHERE professor_id = p.id), 0) AS m2_actual,
                LEAST(
                    COALESCE((SELECT SUM(score) FROM academic_work_items WHERE submission_id = ws.id), 0) 
                    + COALESCE((SELECT SUM(calculated_score) FROM professor_publications WHERE professor_id = p.id), 0), 900.0
                ) AS m2_calc,
                
                -- หมวด 3: งานบริหาร (เพดาน 400)
                COALESCE((SELECT SUM(score) FROM administrative_work_items WHERE submission_id = ws.id), 0) AS m3_actual,
                LEAST(COALESCE((SELECT SUM(score) FROM administrative_work_items WHERE submission_id = ws.id), 0), 400.0) AS m3_calc,
                
                -- หมวด 4: งานบริการ (เพดาน 300)
                COALESCE((SELECT SUM(score) FROM service_work_items WHERE submission_id = ws.id), 0) AS m4_actual,
                LEAST(COALESCE((SELECT SUM(score) FROM service_work_items WHERE submission_id = ws.id), 0), 300.0) AS m4_calc,
                
                -- หมวด 5: คะแนนพิเศษ (เพดาน 100)
                COALESCE((SELECT SUM(score) FROM extra_score_items WHERE submission_id = ws.id), 0) AS m5_actual,
                LEAST(COALESCE((SELECT SUM(score) FROM extra_score_items WHERE submission_id = ws.id), 0), 100.0) AS m5_calc
            FROM professors p
            LEFT JOIN workload_submissions ws ON ws.professor_id = p.id
            WHERE 1=1
        """
        params = []

        if academic_year:
            query += " AND (ws.academic_year = %s OR ws.academic_year IS NULL)"
            params.append(academic_year)
        if semester:
            query += " AND (ws.semester = %s OR ws.semester IS NULL)"
            params.append(semester)
        if status_filter and status_filter != "ALL":
            query += " AND ws.status = %s"
            params.append(status_filter)
        if search:
            query += " AND (p.first_name_th ILIKE %s OR p.last_name_th ILIKE %s)"
            search_pattern = f"%{search}%"
            params.extend([search_pattern, search_pattern])

        query += " ORDER BY p.first_name_th ASC;"

        cursor.execute(query, params)
        return cursor.fetchall()

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database Query Error: {str(e)}"
        )
    finally:
        cursor.close()


# ---------------- 3. ตรวจสอบรายละเอียดภาระงานอาจารย์ ----------------
@router.get("/officer/inspect/{professor_id}", summary="ดึงรายละเอียดภาระงานรายวิชาเฉพาะอาจารย์")
def inspect_professor_workload(professor_id: str, conn = Depends(get_db)):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        teaching_query = """
            SELECT tw.course_code AS code, tw.course_name_th AS name, tw.section, 
                   tw.credits, tw.workload_hours AS hours, tw.score
            FROM teaching_workloads tw
            JOIN workload_submissions ws ON ws.id = tw.submission_id
            WHERE ws.professor_id::text = %s;
        """
        cursor.execute(teaching_query, (str(professor_id),))
        teaching = cursor.fetchall()

        return {"teaching": teaching}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database Error: {str(e)}"
        )
    finally:
        cursor.close()


# ---------------- 4. อัปเดตสถานะการอนุมัติภาระงาน ----------------
@router.patch("/submissions/{submission_id}/status", summary="อัปเดตสถานะการอนุมัติภาระงาน")
def update_submission_status(submission_id: str, payload: StatusUpdatePayload, conn = Depends(get_db)):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        update_query = """
            UPDATE workload_submissions 
            SET status = %s, updated_at = NOW()
            WHERE id::text = %s
            RETURNING id::text, status;
        """
        cursor.execute(update_query, (payload.status, str(submission_id)))
        updated = cursor.fetchone()
        conn.commit()

        if not updated:
            raise HTTPException(status_code=404, detail="ไม่พบข้อมูลการยื่นภาระงาน")

        return {"message": "อัปเดตสถานะสำเร็จ", "data": updated}
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database Update Error: {str(e)}"
        )
    finally:
        cursor.close()