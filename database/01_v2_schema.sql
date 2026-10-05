-- =====================================================================
-- FRWS V2 - Faculty Output Repository : SCHEMA
-- รันใน Supabase SQL Editor (รันซ้ำได้ ไม่ลบข้อมูลเดิม)
--
-- อ้างอิงตารางเดิมในฐานข้อมูล:
--   - teachers (id uuid, faculty, department, ...)
--   - publications (id uuid, ...)
--
-- โครงสร้าง:
--   academic_years, workload_categories      ข้อมูลอ้างอิง
--   workload_items                           ฟิลด์ร่วมของภาระงานทุกหมวด (1 แถว = 1 รายการ)
--   teaching_details / research_details /
--   service_details / advising_details       ฟิลด์เฉพาะหมวด (1:1 กับ workload_items)
--   evidence_files                           metadata ของไฟล์หลักฐาน (N:1 กับ workload_items)
--   v_workload_items                         view สำหรับค้นหา/กรอง
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) ปีการศึกษา (พ.ศ.)
-- ---------------------------------------------------------------------
create table if not exists academic_years (
  year_be    smallint primary key check (year_be between 2500 and 2700),
  start_date date not null,
  end_date   date not null,
  is_current boolean not null default false,
  check (end_date > start_date)
);

-- มีปีการศึกษาปัจจุบันได้ปีเดียว
create unique index if not exists academic_years_one_current
  on academic_years (is_current) where is_current;

insert into academic_years (year_be, start_date, end_date, is_current) values
  (2566, '2023-08-01', '2024-07-31', false),
  (2567, '2024-08-01', '2025-07-31', false),
  (2568, '2025-08-01', '2026-07-31', false),
  (2569, '2026-08-01', '2027-07-31', true)
on conflict (year_be) do nothing;

-- ---------------------------------------------------------------------
-- 2) หมวดภาระงาน
-- ---------------------------------------------------------------------
create table if not exists workload_categories (
  code       text primary key,
  name_th    text not null,
  name_en    text not null,
  sort_order smallint not null default 0
);

insert into workload_categories (code, name_th, name_en, sort_order) values
  ('TEACHING', 'การสอน',            'Teaching',         1),
  ('RESEARCH', 'งานวิจัย',           'Research',         2),
  ('SERVICE',  'งานบริการวิชาการ',    'Academic Service', 3),
  ('ADVISING', 'การดูแลนักศึกษา',     'Student Advising', 4)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 3) รายการภาระงาน (ฟิลด์ร่วมทุกหมวด)
-- ---------------------------------------------------------------------
create table if not exists workload_items (
  id             uuid primary key default gen_random_uuid(),
  teacher_id     uuid not null references teachers (id) on delete cascade,
  academic_year  smallint not null references academic_years (year_be),
  semester       smallint check (semester in (1, 2, 3)),   -- 3 = ภาคฤดูร้อน, null = ทั้งปีการศึกษา
  category       text not null references workload_categories (code),
  title          text not null,
  description    text,
  start_date     date,
  end_date       date,
  workload_hours numeric(8, 2) check (workload_hours >= 0), -- ชั่วโมงรวมของรายการนี้ (ข้อมูลดิบ ยังไม่ผ่านสูตรคิดภาระงาน)
  status         text not null default 'draft'
                 check (status in ('draft', 'submitted', 'approved', 'returned')), -- เตรียมไว้สำหรับ V3
  is_public      boolean not null default false,            -- เผยแพร่ต่อผู้ใช้ทั่วไปได้หรือไม่ (FR1)
  source         text not null default 'manual'
                 check (source in ('manual', 'import', 'openalex', 'mock')),       -- ที่มาของข้อมูล (FR10)
  created_at     timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists workload_items_teacher_year_idx  on workload_items (teacher_id, academic_year);
create index if not exists workload_items_year_category_idx on workload_items (academic_year, category);

-- ---------------------------------------------------------------------
-- 4) รายละเอียดเฉพาะหมวด (primary key = workload_items.id)
-- ---------------------------------------------------------------------
create table if not exists teaching_details (
  workload_item_id       uuid primary key references workload_items (id) on delete cascade,
  course_code            text not null,
  course_name_th         text,
  course_name_en         text,
  section                text,
  credits                numeric(3, 1),
  course_level           text check (course_level in ('bachelor', 'master', 'doctoral')),
  lecture_hours_per_week numeric(4, 1),
  lab_hours_per_week     numeric(4, 1),
  weeks                  smallint,
  enrolled_students      integer check (enrolled_students >= 0),
  teaching_share_percent numeric(5, 2) check (teaching_share_percent between 0 and 100), -- สัดส่วนกรณีสอนร่วม
  role                   text check (role in ('coordinator', 'instructor', 'co_instructor'))
);

create table if not exists research_details (
  workload_item_id        uuid primary key references workload_items (id) on delete cascade,
  research_type           text not null check (research_type in ('project', 'publication', 'patent', 'other')),
  role                    text check (role in ('principal_investigator', 'co_investigator', 'author', 'advisor', 'other')),
  funding_source          text,
  funding_type            text check (funding_type in ('internal', 'external', 'none')),
  budget_amount           numeric(14, 2) check (budget_amount >= 0),   -- งบประมาณของปีการศึกษานั้น
  contribution_percent    numeric(5, 2) check (contribution_percent between 0 and 100),
  project_status          text check (project_status in ('ongoing', 'completed', 'cancelled')),
  publication_id          uuid references publications (id) on delete set null  -- เชื่อมกับผลงานตีพิมพ์ในตาราง publications (ถ้ามี)
);

create table if not exists service_details (
  workload_item_id uuid primary key references workload_items (id) on delete cascade,
  service_type     text not null check (service_type in
                   ('speaker', 'reviewer', 'committee', 'consulting', 'community', 'administrative', 'other')),
  organization     text,
  role             text,
  service_scope    text check (service_scope in
                   ('department', 'faculty', 'university', 'local', 'national', 'international')),
  is_paid          boolean not null default false,
  participants     integer check (participants >= 0)
);

create table if not exists advising_details (
  workload_item_id uuid primary key references workload_items (id) on delete cascade,
  advising_type    text not null check (advising_type in
                   ('academic_advisor', 'senior_project', 'thesis', 'independent_study', 'internship', 'student_activity')),
  student_level    text check (student_level in ('bachelor', 'master', 'doctoral')),
  student_count    integer check (student_count >= 0),
  role             text check (role in ('main_advisor', 'co_advisor', 'committee')),
  project_title    text
);

-- ---------------------------------------------------------------------
-- 5) ไฟล์หลักฐานประกอบ (เก็บเฉพาะ metadata ตัวไฟล์อยู่ใน Supabase Storage หรือลิงก์ภายนอก)
-- ---------------------------------------------------------------------
create table if not exists evidence_files (
  id               uuid primary key default gen_random_uuid(),
  workload_item_id uuid not null references workload_items (id) on delete cascade,
  title            text not null,
  evidence_type    text not null default 'document'
                   check (evidence_type in ('document', 'certificate', 'order', 'image', 'link', 'other')),
  file_name        text,
  mime_type        text,
  file_size_bytes  bigint check (file_size_bytes >= 0),
  storage_bucket   text,          -- ชื่อ bucket ใน Supabase Storage
  storage_path     text,          -- path ของไฟล์ใน bucket
  external_url     text,          -- ใช้แทน storage กรณีหลักฐานเป็นลิงก์ภายนอก
  uploaded_by      uuid,          -- V3: ผูกกับ auth.users
  uploaded_at      timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);

create index if not exists evidence_files_item_idx on evidence_files (workload_item_id);

-- ---------------------------------------------------------------------
-- 6) View สำหรับค้นหา/กรอง (รวมชื่ออาจารย์ ชื่อหมวด และจำนวนหลักฐาน)
-- ---------------------------------------------------------------------
drop view if exists v_workload_items;

create view v_workload_items with (security_invoker = true) as
select
  w.id,
  w.teacher_id,
  w.academic_year,
  w.semester,
  w.category,
  c.name_th as category_name_th,
  c.name_en as category_name_en,
  w.title,
  w.description,
  w.start_date,
  w.end_date,
  w.workload_hours,
  w.status,
  w.is_public,
  w.source,
  w.created_at,
  concat_ws(' ', t.first_name_th, t.last_name_th) as teacher_name_th,
  concat_ws(' ', t.first_name_en, t.last_name_en) as teacher_name_en,
  t.faculty,
  t.department,
  (select count(*) from evidence_files e where e.workload_item_id = w.id) as evidence_count
from workload_items w
join workload_categories c on c.code = w.category
join teachers t on t.id = w.teacher_id;

-- ---------------------------------------------------------------------
-- 7) สิทธิ์การเข้าถึง: เปิด RLS และให้ key ฝั่งหน้าเว็บ "อ่านได้อย่างเดียว"
--    (V2 ยังไม่มี login จึงอ่านได้ทุกแถว ต้องจำกัดตาม role/is_public ใน V3)
--    การเขียนข้อมูลต้องทำผ่าน SQL Editor หรือ service role key เท่านั้น
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'academic_years', 'workload_categories', 'workload_items',
    'teaching_details', 'research_details', 'service_details',
    'advising_details', 'evidence_files'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists public_read on %I', t);
    execute format('create policy public_read on %I for select to anon, authenticated using (true)', t);
    execute format('grant select on %I to anon, authenticated', t);
  end loop;
end $$;

grant select on v_workload_items to anon, authenticated;

commit;

-- =====================================================================
-- ตัวอย่างการเรียกใช้จาก supabase-js (สำหรับขั้น API/UI)
--
-- ค้นหาแบบหลายเงื่อนไข:
--   supabaseClient.from('v_workload_items').select('*', { count: 'exact' })
--     .eq('academic_year', 2568)
--     .eq('category', 'TEACHING')
--     .or('teacher_name_th.ilike.%คำค้น%,teacher_name_en.ilike.%คำค้น%')
--     .order('academic_year', { ascending: false })
--     .range(0, 9)
--
-- รายละเอียดรายรายการพร้อมหลักฐาน:
--   supabaseClient.from('workload_items')
--     .select('*, teaching_details(*), research_details(*), service_details(*), advising_details(*), evidence_files(*)')
--     .eq('id', itemId).single()
-- =====================================================================
