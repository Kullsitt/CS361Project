# backend/app/routers/workloads.py

from typing import Literal, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, HTTPException, status
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel
from app.core.database import get_db
from app.routers.auth import get_current_user, require_roles

router = APIRouter(prefix="/workloads", tags=["Workloads"])

class StatusUpdatePayload(BaseModel):
    status: Literal["APPROVED", "REJECTED"]


# ---------------- 3. ตรวจสอบรายละเอียดภาระงานอาจารย์ (V4 Inspect) ----------------
@router.get("/officer/inspect/{professor_id}", summary="ดึงรายละเอียดภาระงานอาจารย์ทุกหมวดตามปี/ภาคการศึกษา")
def inspect_professor_workload(
    professor_id: UUID,
    academic_year: Optional[int] = Query(None),
    semester: Optional[int] = Query(None),
    current_user: dict = Depends(require_roles({"officer", "reviewer", "admin", "manager"})),
    conn=Depends(get_db),
):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        prof_id_str = str(professor_id)

        # 1. ค้นหา submission_id
        sub_query = """
            SELECT id::text, status, academic_year, semester
            FROM workload_submissions
            WHERE professor_id::text = %s
        """
        params = [prof_id_str]
        if academic_year:
            sub_query += " AND (academic_year = %s OR academic_year IS NULL)"
            params.append(academic_year)
        if semester:
            sub_query += " AND (semester = %s OR semester IS NULL)"
            params.append(semester)
            
        sub_query += " ORDER BY academic_year DESC NULLS LAST, semester DESC NULLS LAST LIMIT 1;"
        
        cursor.execute(sub_query, tuple(params))
        submission = cursor.fetchone()

        sub_id = submission["id"] if submission else None

        teaching, projects, thesis = [], [], []
        academic, admin, service, extra = [], [], []

        if sub_id:
            # หมวด 1: วิชาบรรยาย/ปฏิบัติการ
            cursor.execute("""
                SELECT 
                    COALESCE(course_code, '') AS course_code,
                    COALESCE(section, 1) AS section,
                    COALESCE(credits, 0) AS credits,
                    COALESCE(workload_hours, 0) AS hours,
                    COALESCE(student_count, 0) AS student_count,
                    COALESCE(contribution_percent, 100) AS share,
                    COALESCE(score, 0) AS score,
                    evidence_url
                FROM teaching_workloads
                WHERE submission_id::text = %s;
            """, (str(sub_id),))
            teaching = cursor.fetchall() or []

            # หมวด 1 ย่อย: โครงงานนักศึกษา/สหกิจ
            cursor.execute("""
                SELECT 
                    COALESCE(workload_title, '') AS workload_title,
                    COALESCE(course_code, '') AS course_code,
                    COALESCE(role_type, 'อาจารย์ที่ปรึกษา') AS role,
                    COALESCE(project_count, 1) AS quantity,
                    COALESCE(contribution_percent, 100) AS share,
                    COALESCE(score, 0) AS score,
                    student_names, evidence_url
                FROM student_project_supervisions
                WHERE submission_id::text = %s;
            """, (str(sub_id),))
            projects = cursor.fetchall() or []

            # หมวด 1 ย่อย: วิทยานิพนธ์/สารนิพนธ์
            cursor.execute("""
                SELECT 
                    COALESCE(workload_title, '') AS workload_title,
                    COALESCE(course_code, '') AS course_code,
                    COALESCE(role_type, 'ที่ปรึกษาหลัก') AS role,
                    COALESCE(registered_credit, 0) AS credits,
                    COALESCE(contribution_percent, 100) AS share,
                    COALESCE(score, 0) AS score,
                    student_name, evidence_url
                FROM thesis_supervisions
                WHERE submission_id::text = %s;
            """, (str(sub_id),))
            thesis = cursor.fetchall() or []

            # หมวด 2: งานวิชาการและงานวิจัย
            cursor.execute("""
                SELECT 
                    COALESCE(title, 'ผลงานวิชาการ/วิจัย') AS title,
                    COALESCE(work_type, workload_subtype, 'บทความวิจัย') AS subtype,
                    COALESCE(role_type, 'ผู้เขียน/ผู้ร่วมวิจัย') AS role,
                    COALESCE(source_name, '') AS source,
                    COALESCE(contribution_percent, 100) AS share,
                    COALESCE(score, 0) AS score,
                    evidence_url
                FROM academic_work_items
                WHERE submission_id::text = %s;
            """, (str(sub_id),))
            academic = cursor.fetchall() or []

            # หมวด 3: งานบริหาร
            cursor.execute("""
                SELECT 
                    COALESCE(position_or_task_name, 'งานบริหาร') AS title,
                    COALESCE(role_type, 'ผู้บริหาร/ผู้ประสานงาน') AS role,
                    course_code,
                    COALESCE(item_count, 1) AS quantity,
                    COALESCE(score, 0) AS score,
                    evidence_url
                FROM administrative_work_items
                WHERE submission_id::text = %s;
            """, (str(sub_id),))
            admin = cursor.fetchall() or []

            # หมวด 4: งานบริการวิชาการ
            cursor.execute("""
                SELECT 
                    COALESCE(title, 'งานบริการวิชาการ') AS title,
                    COALESCE(role_type, 'กรรมการ/วิทยากร') AS role,
                    COALESCE(organization, '') AS organization,
                    COALESCE(item_count, 1) AS quantity,
                    COALESCE(contribution_percent, 100) AS share,
                    COALESCE(score, 0) AS score,
                    evidence_url
                FROM service_work_items
                WHERE submission_id::text = %s;
            """, (str(sub_id),))
            service = cursor.fetchall() or []

            # หมวด 5: คะแนนพิเศษ
            cursor.execute("""
                SELECT 
                    COALESCE(title, 'คะแนนพิเศษ') AS title,
                    description,
                    COALESCE(score, 0) AS score,
                    evidence_url
                FROM extra_score_items
                WHERE submission_id::text = %s;
            """, (str(sub_id),))
            extra = cursor.fetchall() or []

        # ดึงเพิ่มเติมจาก professor_publications (หมวด 2)
        try:
            cursor.execute("""
                SELECT 
                    COALESCE(title, 'ผลงานตีพิมพ์') AS title,
                    'บทความวิชาการ/วิจัย' AS subtype,
                    'ผู้เขียน' AS role,
                    COALESCE(journal_name, '') AS source,
                    100 AS share,
                    COALESCE(calculated_score, score, 0) AS score,
                    paper_url AS evidence_url
                FROM professor_publications
                WHERE professor_id::text = %s;
            """, (prof_id_str,))
            pubs = cursor.fetchall() or []
            if pubs:
                academic.extend(pubs)
        except Exception:
            pass

        return {
            "submission": submission,
            "teaching": teaching,
            "projects": projects,
            "thesis": thesis,
            "academic": academic,
            "admin": admin,
            "service": service,
            "extra": extra
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database Query Error: {str(e)}"
        )
    finally:
        cursor.close()