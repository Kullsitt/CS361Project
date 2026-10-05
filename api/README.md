# Repository Query API — issue #12 (Issue 6)

Read-only FastAPI API using the V2 PostgreSQL schema in
`database/01_v2_schema.sql` and sample data in `database/02_v2_mock_data.sql`.
Uses the existing Supabase repository; no additional migration is required.

## Run

From the repository root, with Python 3.10+:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r api/requirements.txt
Copy-Item api/.env.example api/.env
# Configure SUPABASE_URL and SUPABASE_KEY; preserve an existing .env.
.\.venv\Scripts\python.exe -m uvicorn api.main:app --host 127.0.0.1 --port 8000
```

Interactive API specification: http://127.0.0.1:8000/docs.
Machine-readable specification: `/openapi.json`.
Use a Supabase publishable key, not a service-role key. Optional
`Authorization: Bearer <user-access-token>` is forwarded for RLS. The current
V2 schema grants read access to all workload rows (including non-public rows);
this API follows those policies. Authentication/publication policy changes
belong to the database access contract and must be coordinated before deployment.

## API specification

| Method and path | Result |
| --- | --- |
| `GET /api/workloads` | Filtered, paginated rows from `v_workload_items` |
| `GET /api/workloads/{workload_id}` | Workload, category detail, research publication and evidence metadata |
| `GET /api/teachers/{teacher_id}/workload-summary` | Counts and hours grouped by academic year and category |

List parameters are optional and combined using AND:

| Parameter | Validation / behavior |
| --- | --- |
| `academic_year` | 2500–2700, stored Buddhist academic year, e.g. 2567 |
| `category` | TEACHING, RESEARCH, SERVICE, ADVISING |
| `teacher_id` | UUID, exact match |
| `teacher_name` | Case-insensitive substring of full Thai OR English name, 1–255 characters |
| `semester` | 1, 2, 3; omit to include annual records whose semester is null |
| `q` | Case-insensitive title substring, 1–255 characters |
| `page` | 1–1000000; default 1 |
| `page_size` | 1–100; default 20 |

Sort order is academic year descending, creation time descending, UUID descending.
Year filters use stored `academic_year`, not publication dates or calendar-year
conversion. Percent and underscore in text searches are escaped; `*` retains the PostgREST wildcard behavior.

Example: `GET /api/workloads?academic_year=2567&category=TEACHING&page_size=20`

```json
{"data": [{"id": "00000000-0000-0000-0000-000000000001", "teacher_id": "00000000-0000-0000-0000-000000000002", "teacher_name_th": "ตัวอย่าง", "academic_year": 2567, "category": "TEACHING", "title": "CS361", "workload_hours": 45}], "page": 1, "page_size": 20, "total": 1}
```

The abbreviated example omits other view fields. `data` contains all fields from
`v_workload_items`, including category names, teacher names, department, faculty,
status, source and evidence count. `total` is the filtered count reported by
Supabase (null if omitted upstream). No matches returns 200 with `data: []`.

Detail response: `{"data": {...view fields, "details": {...}, "evidences": [...]}}`.
IDs must be UUIDs. Category tables are `teaching_details`, `research_details`,
`service_details`, `advising_details`, joined through `workload_item_id`.
Missing detail returns null; no evidence returns []. Research detail includes
`publications` through its `publication_id` foreign key, preserving DOI/URLs.

Evidence comes from `evidence_files`. All metadata is preserved, including title,
file name, MIME type, byte size, storage bucket/path, external URL and upload time.
PDF files retain their MIME type and original storage location. `download_url` uses
an HTTP(S) external URL when present; otherwise it uses Supabase public storage
with the actual bucket and URL-encoded path. The owner confirmed public bucket
visibility. Missing bucket/path produces null; the API does not guess a bucket
name. This URL construction does not verify that a stored object exists. Private
buckets require a different signed-link flow. The API does not download files.

Summary accepts optional `academic_year` with the same year validation:

```json
{"teacher": {"id": "00000000-0000-0000-0000-000000000002", "first_name_th": "ตัวอย่าง", "last_name_th": "อาจารย์", "first_name_en": null, "last_name_en": null}, "data": [{"academic_year": 2567, "category": "TEACHING", "item_count": 2, "total_hours": 90}]}
```

Summary fetches only four fields for the selected teacher, filters by year in the
database, and follows all result pages even if the repository uses a lower row
cap. It sums with Decimal, treating null workload hours as zero. Only groups with
records appear; a known teacher without workloads receives `data: []`. The
repository's teacher/year index supports the query. Runtime is proportional to
that teacher's matching rows; very large histories may benefit from a future SQL
aggregation RPC. Multiple reads are not a transactional snapshot during writes.

Errors use `{"detail": ...}`: 422 invalid parameters/UUID; 404 absent or invisible
resource; 401/403 repository access denied; 502 upstream/schema failure; 503 missing
configuration; 504 timeout. Upstream error bodies and credentials are not returned.
Connection/read timeouts: 3.05/15 seconds per query.

## Testing

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_repository_api.py -q
```

Tests use a mocked HTTP transport to verify combined query parameters, paging,
validation, each detail category, evidence pages, Decimal summary, missing/empty
results, token forwarding and failure handling. The opt-in live test uses the
configured read-only Supabase connection and existing data:

```powershell
$env:FRWS_LIVE_TEST = '1'
.\.venv\Scripts\python.exe -m pytest tests/test_live_api.py -q
Remove-Item Env:FRWS_LIVE_TEST
```

No test creates, updates or deletes repository data. Live checks require seeded
V2 workloads; they report skipped when no workloads are visible. Latency on a
small sample is not a production load-test guarantee.
