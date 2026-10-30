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


# ---------------- 1. ดึงข้อมูลภาระงานแยกตามหมวดหมู่ ----------------
@router.get("/by-category", summary="ดึงข้อมูลภาระงานแยกตามหมวดหมู่ (ไม่รวมงานวิจัย)")
def get_workloads_by_category(
    professor_id: UUID = Query(..., description="ID ของอาจารย์ (professor_id)"),
    category: str = Query("TEACHING", description="TEACHING, ADVISING, ADMINISTRATIVE, SERVICE"),
    conn = Depends(get_db)
):
    professor_id = str(professor_id)

    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cat = category.upper()

        if cat == "TEACHING":
            query = """
                SELECT 
                    tw.id::text, tw.course_code, tw.course_code AS title, tw.section,
                    tw.credits, tw.workload_hours,
                    ws.semester, ws.academic_year
                FROM teaching_workloads tw
                JOIN workload_submissions ws ON ws.id = tw.submission_id
                WHERE ws.professor_id::text = %s
                  AND UPPER(ws.status) = 'APPROVED'
                  AND tw.is_selected IS TRUE
                ORDER BY ws.academic_year DESC, ws.semester DESC;
            """
            params = (str(professor_id),)

        elif cat == "ADVISING":
            query = """
                SELECT 
                    ts.id::text, ts.course_code, 'นักศึกษา' AS advisee_name,
                    ts.degree_level, ts.role_type AS role,
                    ws.semester, ws.academic_year
                FROM thesis_supervisions ts
                JOIN workload_submissions ws ON ws.id = ts.submission_id
                WHERE ws.professor_id::text = %s
                  AND UPPER(ws.status) = 'APPROVED'
                  AND ts.is_selected IS TRUE

                UNION ALL

                SELECT 
                    sps.id::text, sps.course_code,
                    CONCAT('โครงงานนักศึกษา (', sps.project_count, ' โครงงาน)') AS advisee_name,
                    'ปริญญาตรี' AS degree_level, sps.role_type AS role,
                    ws.semester, ws.academic_year
                FROM student_project_supervisions sps
                JOIN workload_submissions ws ON ws.id = sps.submission_id
                WHERE ws.professor_id::text = %s
                  AND UPPER(ws.status) = 'APPROVED'
                  AND sps.is_selected IS TRUE
            """
            params = (str(professor_id), str(professor_id))

        elif cat == "ADMINISTRATIVE":
            query = """
                SELECT 
                    awi.id::text, awi.position_or_task_name AS title, awi.organization, 
                    awi.start_date::text, awi.end_date::text,
                    ws.semester, ws.academic_year
                FROM administrative_work_items awi
                JOIN workload_submissions ws ON ws.id = awi.submission_id
                WHERE ws.professor_id::text = %s
                  AND UPPER(ws.status) = 'APPROVED'
                  AND awi.is_selected IS TRUE;
            """
            params = (str(professor_id),)

        elif cat in ["SERVICE", "EXTRA"]:
            query = """
                SELECT 
                    swi.id::text, swi.title, swi.role_type AS role, swi.organization, 
                    swi.service_date::text,
                    ws.semester, ws.academic_year
                FROM service_work_items swi
                JOIN workload_submissions ws ON ws.id = swi.submission_id
                WHERE ws.professor_id::text = %s
                  AND UPPER(ws.status) = 'APPROVED'
                  AND swi.is_selected IS TRUE

                UNION ALL

                SELECT 
                    esi.id::text, esi.title, 'Extra Score' AS role, esi.description AS organization, 
                    NULL AS service_date,
                    ws.semester, ws.academic_year
                FROM extra_score_items esi
                JOIN workload_submissions ws ON ws.id = esi.submission_id
                WHERE ws.professor_id::text = %s
                  AND UPPER(ws.status) = 'APPROVED'
                  AND esi.is_selected IS TRUE;
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
    current_user: dict = Depends(require_roles({"officer", "reviewer", "manager", "admin"})),
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
def inspect_professor_workload(
    professor_id: UUID,
    current_user: dict = Depends(require_roles({"officer", "reviewer", "admin"})),
    conn=Depends(get_db),
):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        teaching_query = """
            SELECT tw.course_code AS code, tw.course_code AS name, tw.section,
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
def update_submission_status(
    submission_id: UUID,
    payload: StatusUpdatePayload,
    current_user: dict = Depends(require_roles({"reviewer", "admin"})),
    conn=Depends(get_db),
):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cursor.execute(
            "SELECT id::text, status FROM workload_submissions WHERE id = %s FOR UPDATE;",
            (str(submission_id),),
        )
        submission = cursor.fetchone()
        if not submission:
            raise HTTPException(status_code=404, detail="ไม่พบข้อมูลการยื่นภาระงาน")
        if str(submission["status"] or "").upper() not in ("PENDING", "DRAFT"):
            raise HTTPException(status_code=409, detail="สถานะภาระงานนี้ไม่สามารถเปลี่ยนได้")

        update_query = """
            UPDATE workload_submissions 
            SET status = %s, updated_at = NOW()
            WHERE id = %s
            RETURNING id::text, status;
        """
        cursor.execute(update_query, (payload.status, str(submission_id)))
        updated = cursor.fetchone()
        conn.commit()
        return {"message": "อัปเดตสถานะสำเร็จ", "data": updated}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ไม่สามารถอัปเดตสถานะภาระงานได้ กรุณาลองใหม่"
        ) from e
    finally:
        cursor.close()
