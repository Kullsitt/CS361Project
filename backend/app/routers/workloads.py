# backend/app/routers/workloads.py

import logging
from typing import Literal, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, HTTPException, status
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel
from app.core.database import get_db
from app.routers.auth import get_current_user, require_roles

router = APIRouter(prefix="/workloads", tags=["Workloads"])
log = logging.getLogger(__name__)

class StatusUpdatePayload(BaseModel):
    status: Literal["APPROVED", "REJECTED"]


OFFICER_ROLES = {"officer", "reviewer", "admin", "manager"}
REVIEW_ROLES = {"officer", "reviewer", "admin"}


def get_officer_dashboard(
    current_user: dict,
    conn,
    search: Optional[str] = None,
):
    """Return one row per submission with selected raw scores grouped by category."""
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    query = """
        SELECT
            ws.id::text AS submission_id,
            p.id::text AS id,
            p.id::text AS professor_id,
            p.title,
            p.first_name_th,
            p.last_name_th,
            p.academic_rank,
            p.department,
            ws.academic_year,
            ws.semester,
            ws.status,
            ws.total_score,
            COALESCE((
                SELECT SUM(score) FROM teaching_workloads
                WHERE submission_id = ws.id AND is_selected IS TRUE
            ), 0) +
            COALESCE((
                SELECT SUM(score) FROM thesis_supervisions WHERE submission_id = ws.id AND is_selected IS TRUE
            ), 0) +
            COALESCE((
                SELECT SUM(score) FROM student_project_supervisions WHERE submission_id = ws.id AND is_selected IS TRUE
            ), 0) AS m1_actual,
            COALESCE((
                SELECT SUM(score) FROM teaching_workloads
                WHERE submission_id = ws.id AND is_selected IS TRUE
            ), 0) +
            COALESCE((
                SELECT SUM(score) FROM thesis_supervisions WHERE submission_id = ws.id AND is_selected IS TRUE
            ), 0) +
            COALESCE((
                SELECT SUM(score) FROM student_project_supervisions WHERE submission_id = ws.id AND is_selected IS TRUE
            ), 0) AS m1_calc,
            COALESCE((
                SELECT SUM(score) FROM academic_work_items
                WHERE submission_id = ws.id AND is_selected IS TRUE
            ), 0) AS m2_actual,
            COALESCE((
                SELECT SUM(score) FROM academic_work_items
                WHERE submission_id = ws.id AND is_selected IS TRUE
            ), 0) AS m2_calc,
            COALESCE((
                SELECT SUM(score) FROM administrative_work_items
                WHERE submission_id = ws.id AND is_selected IS TRUE
            ), 0) AS m3_actual,
            COALESCE((
                SELECT SUM(score) FROM administrative_work_items
                WHERE submission_id = ws.id AND is_selected IS TRUE
            ), 0) AS m3_calc,
            COALESCE((
                SELECT SUM(score) FROM service_work_items
                WHERE submission_id = ws.id AND is_selected IS TRUE
            ), 0) AS m4_actual,
            COALESCE((
                SELECT SUM(score) FROM service_work_items
                WHERE submission_id = ws.id AND is_selected IS TRUE
            ), 0) AS m4_calc,
            COALESCE((
                SELECT SUM(score) FROM extra_score_items
                WHERE submission_id = ws.id AND is_selected IS TRUE
            ), 0) AS m5_actual,
            COALESCE((
                SELECT SUM(score) FROM extra_score_items
                WHERE submission_id = ws.id AND is_selected IS TRUE
            ), 0) AS m5_calc,
            COALESCE((
                SELECT SUM(credits) FROM teaching_workloads
                WHERE submission_id = ws.id AND is_selected IS TRUE
            ), 0) AS credits
        FROM workload_submissions ws
        JOIN professors p ON p.id = ws.professor_id
    """
    params = []
    if search:
        query += """
            WHERE CONCAT_WS(' ', p.title, p.first_name_th, p.last_name_th)
                ILIKE %s
        """
        params.append(f"%{search.strip()}%")
    query += " ORDER BY ws.academic_year DESC NULLS LAST, ws.semester DESC NULLS LAST, p.last_name_th"

    try:
        cursor.execute(query, tuple(params))
        return cursor.fetchall() or []
    except Exception:
        log.exception("Could not load officer workload dashboard")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="โหลดรายงานภาระงานไม่สำเร็จ กรุณาลองใหม่",
        ) from None
    finally:
        cursor.close()


@router.get("/officer/dashboard", summary="สรุปภาระงานสำหรับเจ้าหน้าที่")
def officer_dashboard(
    search: Optional[str] = Query(None, max_length=100),
    current_user: dict = Depends(require_roles(OFFICER_ROLES)),
    conn=Depends(get_db),
):
    return get_officer_dashboard(current_user=current_user, conn=conn, search=search)


def update_submission_status(
    submission_id: UUID,
    payload: StatusUpdatePayload,
    current_user: dict,
    conn,
):
    if current_user.get("role") not in REVIEW_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="คุณไม่มีสิทธิ์ตรวจสอบภาระงาน",
        )

    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cursor.execute(
            """
            SELECT id::text, status
            FROM workload_submissions
            WHERE id::text = %s
            FOR UPDATE
            """,
            (str(submission_id),),
        )
        submission = cursor.fetchone()
        if not submission:
            raise HTTPException(status_code=404, detail="ไม่พบชุดภาระงาน")

        current_status = str(submission["status"] or "").upper()
        if current_status not in {"DRAFT", "PENDING", "REJECTED"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="ไม่สามารถเปลี่ยนสถานะชุดภาระงานนี้ได้",
            )

        cursor.execute(
            """
            UPDATE workload_submissions
            SET status = %s, updated_at = NOW()
            WHERE id::text = %s
            RETURNING id::text, status
            """,
            (payload.status, str(submission_id)),
        )
        updated = cursor.fetchone()
        if not updated:
            raise HTTPException(status_code=404, detail="ไม่พบชุดภาระงาน")
        conn.commit()
        return {"data": updated}
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        log.exception("Could not update workload submission status")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="อัปเดตสถานะภาระงานไม่สำเร็จ กรุณาลองใหม่",
        ) from None
    finally:
        cursor.close()


@router.patch("/submissions/{submission_id}/status", summary="อนุมัติหรือส่งกลับชุดภาระงาน")
def patch_submission_status(
    submission_id: UUID,
    payload: StatusUpdatePayload,
    current_user: dict = Depends(require_roles(REVIEW_ROLES)),
    conn=Depends(get_db),
):
    return update_submission_status(
        submission_id=submission_id,
        payload=payload,
        current_user=current_user,
        conn=conn,
    )


@router.get("/by-category", summary="ดึงภาระงานที่อนุมัติแล้วสำหรับโปรไฟล์สาธารณะ")
def get_public_workloads_by_category(
    professor_id: UUID,
    category: Literal["TEACHING", "ADVISING", "ADMINISTRATIVE", "SERVICE"] = Query(...),
    conn=Depends(get_db),
):
    queries = {
        "TEACHING": """
            SELECT
                COALESCE(tw.course_code, '') AS title,
                tw.course_code,
                tw.workload_subtype AS work_type,
                tw.role_type AS role,
                tw.credits,
                tw.section,
                tw.workload_hours,
                ws.academic_year,
                ws.semester
            FROM teaching_workloads tw
            JOIN workload_submissions ws ON ws.id = tw.submission_id
            WHERE ws.professor_id::text = %s
                AND tw.is_selected IS TRUE
                AND UPPER(ws.status) = 'APPROVED'
        """,
        "ADVISING": """
            SELECT
                COALESCE(ts.workload_title, ts.course_code, '') AS title,
                ts.course_code,
                ts.workload_subtype AS work_type,
                ts.role_type AS role,
                ts.registered_credit AS credits,
                ws.academic_year,
                ws.semester
            FROM thesis_supervisions ts
            JOIN workload_submissions ws ON ws.id = ts.submission_id
            WHERE ws.professor_id::text = %s
                AND ts.is_selected IS TRUE
                AND UPPER(ws.status) = 'APPROVED'
            UNION ALL
            SELECT
                COALESCE(sps.workload_title, sps.course_code, '') AS title,
                sps.course_code,
                sps.workload_subtype AS work_type,
                sps.role_type AS role,
                NULL::numeric AS credits,
                ws.academic_year,
                ws.semester
            FROM student_project_supervisions sps
            JOIN workload_submissions ws ON ws.id = sps.submission_id
            WHERE ws.professor_id::text = %s
                AND sps.is_selected IS TRUE
                AND UPPER(ws.status) = 'APPROVED'
        """,
        "ADMINISTRATIVE": """
            SELECT
                COALESCE(ai.position_or_task_name, '') AS title,
                ai.course_code,
                ai.workload_subtype AS work_type,
                ai.role_type AS role,
                ai.organization,
                ws.academic_year,
                ws.semester
            FROM administrative_work_items ai
            JOIN workload_submissions ws ON ws.id = ai.submission_id
            WHERE ws.professor_id::text = %s
                AND ai.is_selected IS TRUE
                AND UPPER(ws.status) = 'APPROVED'
        """,
        "SERVICE": """
            SELECT
                COALESCE(si.title, '') AS title,
                si.workload_subtype AS work_type,
                si.role_type AS role,
                si.organization,
                ws.academic_year,
                ws.semester
            FROM service_work_items si
            JOIN workload_submissions ws ON ws.id = si.submission_id
            WHERE ws.professor_id::text = %s
                AND si.is_selected IS TRUE
                AND UPPER(ws.status) = 'APPROVED'
        """,
    }
    query = queries[category]
    params = (str(professor_id),) * (2 if category == "ADVISING" else 1)
    if category == "ADVISING":
        query = f"SELECT * FROM ({query}) public_items"
    query += " ORDER BY academic_year DESC NULLS LAST, semester DESC NULLS LAST, title"

    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cursor.execute(query, params)
        return cursor.fetchall() or []
    except Exception:
        log.exception("Could not load public workload records")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="โหลดข้อมูลภาระงานสาธารณะไม่สำเร็จ กรุณาลองใหม่",
        ) from None
    finally:
        cursor.close()


# ---------------- 3. ตรวจสอบรายละเอียดภาระงานอาจารย์ (V4 Inspect) ----------------
@router.get("/officer/inspect/{professor_id}", summary="ดึงรายละเอียดภาระงานอาจารย์ทุกหมวดตามปี/ภาคการศึกษา")
def inspect_professor_workload(
    professor_id: UUID,
    academic_year: Optional[int] = Query(None),
    semester: Optional[int] = Query(None),
    current_user: dict = Depends(require_roles(REVIEW_ROLES)),
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
        academic, admin, service, extra = [], [], [], []

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