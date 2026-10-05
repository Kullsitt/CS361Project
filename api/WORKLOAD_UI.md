# Workload Details UI — Issue #14

Start the existing FastAPI server from the repository root:

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.main:app --reload
```

Open `http://127.0.0.1:8000/ui/workload.html?id=<workload UUID>`.
Use an ID from `GET /api/workloads` in `/docs`. No additional `.env` is required.
The `/ui` mount exposes only the `public` folder; frontend requests `/api` on the
same origin. Open through FastAPI, not `file://` or a separate Live Server port.

## Integration for #13

When rendering a workload list, link the selected workload to:

```javascript
const link = document.createElement('a');
link.href = `workload.html?id=${encodeURIComponent(workload.id)}`;
link.textContent = workload.title;
```

The existing faculty profile now includes a paginated Workloads section. Navigate
from index -> Faculty Members -> teacher -> Workloads -> workload title. The detail
page includes a link back to the same teacher's Workloads section.

This relative path assumes the list page is also inside `/ui/`. Alternatively use
`/ui/workload.html?id=...` on the same server. The directory/search page from #13
is separate work; no list page is added by #14. The current home link returns to
the existing index page. The teacher link opens the existing faculty profile.

## Behavior

- Common information, academic year, semester (including annual work), hours,
  dates, description and status.
- All V2 fields for teaching, research, service and advising; research includes
  linked publication title, publication date and a supported HTTP(S) source URL.
- Evidence title, filename, MIME type, size, upload date and an open button.
  PDF opens in a new tab; the browser PDF viewer provides download/save controls.
  External resources control their own response and may open or download.
- Text from the database is inserted using textContent; only HTTP(S) links are
  clickable. Missing links render a message instead of an active button.
- Loading, empty detail, empty evidence, missing/invalid ID, not found, access
  denied, timeout and retryable error states.
- Responsive single-column layout on mobile and keyboard focus indicators.

## Verification

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
```

Browser test requires Node.js, Playwright and installed Microsoft Edge (or set
`FRWS_BROWSER=chrome`). With FastAPI running on port 8014:

```text
node tests/workload-ui.cjs
```

Set `FRWS_UI_URL` to another local server origin if needed. The browser test mocks
API responses for deterministic checks of all four categories, zero/false values,
mobile overflow, malicious text/links, empty states, not-found and retry behavior.
It saves an ignored mobile screenshot at `tests/workload-mobile.png`.
These fixtures do not confirm availability of actual stored evidence files.
