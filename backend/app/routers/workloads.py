from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, HTTPException, status
from psycopg2.extras import RealDictCursor
from app.core.database import get_db

router = APIRouter(prefix="/workloads", tags=["Workloads"])

@router.get("/by-category", summary="ดึงข้อมูลภาระงานแยกตามหมวดหมู่ (ไม่รวมงานวิจัย)")
def get_workloads_by_category(
    professor_id: str = Query(..., description="ID ของอาจารย์ (professor_id)"),
    category: str = Query("TEACHING", description="TEACHING, ADVISING, ADMINISTRATIVE, SERVICE"),
    conn = Depends(get_db)
):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cat = category.upper()

        # ---------------- 1. งานสอน (TEACHING) ----------------
        if cat == "TEACHING":
            query = """
                SELECT 
                    tw.id::text, 
                    tw.course_code, 
                    tw.course_name_th, 
                    tw.section, 
                    tw.credits, 
                    tw.student_count, 
                    tw.workload_hours, 
                    tw.is_selected, 
                    tw.score, 
                    ws.semester, 
                    ws.academic_year
                FROM teaching_workloads tw
                JOIN workload_submissions ws ON ws.id = tw.submission_id
                WHERE ws.professor_id::text = %s
                ORDER BY ws.academic_year DESC, ws.semester DESC;
            """
            params = (str(professor_id),)

        # ---------------- 2. การดูแลนักศึกษา (ADVISING) ----------------
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

        # ---------------- 3. งานบริหาร (ADMINISTRATIVE) ----------------
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

        # ---------------- 4. งานบริการวิชาการ & คะแนนพิเศษ (SERVICE / EXTRA) ----------------
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