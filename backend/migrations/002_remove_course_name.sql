-- Deploy the API that uses course_code for display before running this file.
-- User-requested removal: existing course_name_th values are permanently removed.
-- No CASCADE: abort if another database object still depends on the column.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE teaching_workloads DROP COLUMN IF EXISTS course_name_th;
