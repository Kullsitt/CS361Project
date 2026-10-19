# Dashboard database mapping

Status: mapping checked against live RDS column metadata. Implementation is in `backend/app/workload_records.py`; migration is `backend/migrations/001_dashboard_fields.sql`. No permanent database changes have been performed. Integration tests use TEMP tables and roll back the outer transaction.

## Ownership and persistence

Use the authenticated JWT subject as `professors.id`; never accept the owner from a form or localStorage user object. Every workload read, update, and delete must join `workload_submissions` and constrain its `professor_id` to that subject. Profile updates must use an explicit allowlist excluding `id`, `role`, `password_hash`, faculty, and department.

Create or reuse a submission for the owner, academic year, and semester in a transaction. Verify the existing uniqueness constraints before choosing an upsert. Commit the item and submission total together; rollback on failure. Do not represent pending assessment as a calculated zero.

## Native column mapping

| UI data | Database destination |
| --- | --- |
| Personal profile fields | Same-name columns in `professors` |
| Academic year / semester | `workload_submissions.academic_year` / `semester` |
| Lecture/lab course code | `teaching_workloads.course_code` |
| Lecture/lab display title | Derived from `teaching_workloads.course_code` (one field) |
| Credits / student count / hours | `teaching_workloads.credits` / `student_count` / `workload_hours` |
| Student project course / role / count | `student_project_supervisions.course_code` / `role_type` / `project_count` |
| Thesis course / student name / role / registered credits | `thesis_supervisions.course_code` / `student_name` / `role_type` / `registered_credit` |
| Academic work title / subtype / role | `academic_work_items.title` / `work_type` / `role_type` |
| Administrative task title / organization | `administrative_work_items.position_or_task_name` / `organization` |
| Service title / role / organization | `service_work_items.title` / `role_type` / `organization` |
| Extra title / description / evidence link | `extra_score_items.title` / `description` / `evidence_url` |
| Calculated score | Corresponding item table `score` |

Research imported as publications must remain separate from manually entered academic work until deduplication and selection rules are defined. Do not create a fake DOI, OpenAlex ID, or publication to store a grant or report.

## Schema gaps to resolve

The diagram does not show storage for all editable UI inputs: subtype codes across most tables, responsibility/contribution shares for non-publication work, some role fields, quantities, student names for projects, budgets and sources for academic work, evidence links across most categories, and pending score status. Lecture section and thesis degree level exist in the database but are not currently explicit UI inputs. Multiple student names must have an intentional representation rather than being silently truncated.

Confirmed: `professors.education`, `expertise`, and `research_interests` are `text[]`. The API converts multiline form text to arrays and the UI displays arrays as one entry per line.

Confirmed: existing weights and item scores use `numeric(5,2)`, while teaching credits use integer. The prepared migration widens these to numeric to avoid truncating role weights or rejecting raw scores above 999.99. Role labels are widened to text; course codes remain limited to 20 characters and shared titles to 255.

Attachment names in the mockup are not uploaded files. Real attachment persistence requires an upload endpoint and storage; never report an upload as successful after storing only a filename.

## Required verification

- Unauthenticated writes fail; another professor cannot read or mutate owned workload records.
- Create, reload, edit, reload, delete, reload for each supported item table.
- Changing subtype/category or semester does not leave an orphan or duplicate item.
- All visible fields survive a round trip, including null pending scores and multiple names.
- Server validates allowed subtype/role and calculates scores independently of client-supplied scores.
- Submission totals remain correct after create/update/delete and transaction rollback.
- Profile arrays/structured fields round-trip without destroying existing content.
- API errors keep unsaved form values and do not display a success notice.
