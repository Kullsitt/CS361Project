-- =====================================================================
-- FRWS V2 - Faculty Output Repository : MOCK DATA
-- รันหลัง 01_v2_schema.sql ใน Supabase SQL Editor
--
-- - ผูกข้อมูลจำลองกับอาจารย์ 8 ท่านที่มีอยู่แล้วในตาราง teachers
--   (เลือกสาขาด้านคอมพิวเตอร์ คณะวิทยาศาสตร์และเทคโนโลยี และผู้ที่มี openalex_id ก่อน)
-- - ครอบคลุมปีการศึกษา 2566-2569 (ปี 2569 มีเฉพาะภาคเรียนที่ 1)
-- - ทุกแถวมี source = 'mock' รันซ้ำได้ โดยจะลบชุดเดิมแล้วสร้างใหม่
-- - รหัสวิชา ชื่อโครงการ และหน่วยงาน เป็นข้อมูลสมมติทั้งหมด
-- =====================================================================

begin;

-- ล้างชุดข้อมูลจำลองเดิม (details และ evidence ถูกลบตามด้วย on delete cascade)
delete from workload_items where source in ('mock', 'openalex');

-- ---------------------------------------------------------------------
-- เลือกอาจารย์ที่จะใช้กับข้อมูลจำลอง
-- ---------------------------------------------------------------------
create temp table mock_teachers on commit drop as
select id as teacher_id,
       (row_number() over (order by id))::int as rn
from (
  select id
  from teachers
  where coalesce(first_name_en, '') not ilike '%account%'
    and coalesce(first_name_th, '') not like '%กลาง%'
  order by (department ilike '%คอมพิวเตอร์%') desc nulls last,
           (faculty = 'คณะวิทยาศาสตร์และเทคโนโลยี') desc nulls last,
           (openalex_id is not null) desc,
           id
  limit 8
) picked;

do $$
begin
  if (select count(*) from mock_teachers) = 0 then
    raise exception 'ไม่พบข้อมูลในตาราง teachers กรุณารัน sync_teachers.py ก่อน';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) การสอน: 2 วิชาต่อภาคเรียน
-- ---------------------------------------------------------------------
with course (n, code, name_th, name_en, credits, course_level, lec, lab) as (
  values
    (0, 'CS101', 'การเขียนโปรแกรมคอมพิวเตอร์เบื้องต้น', 'Introduction to Computer Programming', 3, 'bachelor', 2, 2),
    (1, 'CS213', 'โครงสร้างข้อมูล',                    'Data Structures',                      3, 'bachelor', 3, 0),
    (2, 'CS251', 'ระบบฐานข้อมูล',                      'Database Systems',                     3, 'bachelor', 2, 2),
    (3, 'CS284', 'วิศวกรรมซอฟต์แวร์',                  'Software Engineering',                 3, 'bachelor', 3, 0),
    (4, 'CS314', 'ระบบปฏิบัติการ',                     'Operating Systems',                    3, 'bachelor', 3, 0),
    (5, 'CS332', 'เครือข่ายคอมพิวเตอร์',                'Computer Networks',                    3, 'bachelor', 2, 2),
    (6, 'CS365', 'ปัญญาประดิษฐ์',                      'Artificial Intelligence',              3, 'bachelor', 3, 0),
    (7, 'CS385', 'การเรียนรู้ของเครื่อง',                'Machine Learning',                     3, 'bachelor', 2, 2),
    (8, 'CS655', 'การทำเหมืองข้อมูลขั้นสูง',             'Advanced Data Mining',                 3, 'master',   3, 0),
    (9, 'CS701', 'สัมมนาทางวิทยาการคอมพิวเตอร์',        'Seminar in Computer Science',          1, 'master',   1, 0)
),
src as materialized (
  select gen_random_uuid() as id,
         t.teacher_id, t.rn, y.year_be, s.sem, k.slot,
         c.code, c.name_th, c.name_en, c.credits, c.course_level, c.lec, c.lab,
         case when k.slot = 1 and t.rn % 3 = 0 then 50 else 100 end as share_pct,
         25 + (t.rn * 7 + y.year_be * 3 + s.sem * 11 + k.slot * 13) % 60 as students
  from mock_teachers t
  cross join academic_years y
  cross join (values (1), (2)) as s (sem)
  cross join (values (0), (1)) as k (slot)
  join course c on c.n = (t.rn * 3 + y.year_be + s.sem * 5 + k.slot * 4) % 10
  where y.year_be between 2566 and 2569
    and not (y.year_be = 2569 and s.sem = 2)
),
ins as (
  insert into workload_items
    (id, teacher_id, academic_year, semester, category, title, description,
     start_date, end_date, workload_hours, status, is_public, source)
  select id, teacher_id, year_be, sem, 'TEACHING',
         code || ' ' || name_th,
         name_en || ' (ภาคเรียนที่ ' || sem || '/' || year_be || ')',
         case sem when 1 then make_date(year_be - 543, 8, 15) else make_date(year_be - 542, 1, 10) end,
         case sem when 1 then make_date(year_be - 543, 12, 10) else make_date(year_be - 542, 5, 15) end,
         (lec + lab) * 15 * share_pct / 100.0,
         case when year_be < 2569 then 'approved'
              else (array['draft', 'submitted', 'returned', 'submitted'])[1 + (rn % 4)] end,
         true, 'mock'
  from src
)
insert into teaching_details
  (workload_item_id, course_code, course_name_th, course_name_en, section, credits, course_level,
   lecture_hours_per_week, lab_hours_per_week, weeks, enrolled_students, teaching_share_percent, role)
select id, code, name_th, name_en, '65000' || (1 + slot), credits, course_level,
       lec, lab, 15, students, share_pct,
       case when slot = 0 then 'coordinator'
            when share_pct = 50 then 'co_instructor'
            else 'instructor' end
from src;

-- ---------------------------------------------------------------------
-- 2) งานวิจัย: โครงการวิจัย 2 ปี (บันทึกแยกรายปีการศึกษา)
-- ---------------------------------------------------------------------
with topic (n, title_th, funding_source, funding_type, budget) as (
  values
    (0, 'การพัฒนาแบบจำลองการเรียนรู้เชิงลึกเพื่อวิเคราะห์ภาพทางการแพทย์',   'แหล่งทุนวิจัยระดับชาติ (สมมติ)',        'external', 850000),
    (1, 'ระบบแนะนำรายวิชาด้วยเทคนิคการเรียนรู้ของเครื่อง',                  'กองทุนวิจัยของมหาวิทยาลัย (สมมติ)',     'internal', 200000),
    (2, 'การตรวจจับความผิดปกติของเครือข่ายแบบเรียลไทม์',                   'แหล่งทุนวิจัยระดับชาติ (สมมติ)',        'external', 600000),
    (3, 'การประมวลผลภาษาธรรมชาติสำหรับภาษาไทยในงานบริการภาครัฐ',          'ทุนความร่วมมือกับภาคเอกชน (สมมติ)',     'external', 1200000),
    (4, 'แพลตฟอร์มวิเคราะห์ข้อมูลขนาดใหญ่เพื่อการเกษตรอัจฉริยะ',            'ทุนวิจัยของคณะ (สมมติ)',               'internal', 150000),
    (5, 'การประเมินคุณภาพซอฟต์แวร์ด้วยการวิเคราะห์โค้ดอัตโนมัติ',            'กองทุนวิจัยของมหาวิทยาลัย (สมมติ)',     'internal', 180000),
    (6, 'ระบบอินเทอร์เน็ตของสรรพสิ่งเพื่อติดตามคุณภาพอากาศ',                'แหล่งทุนวิจัยระดับชาติ (สมมติ)',        'external', 700000),
    (7, 'การคุ้มครองข้อมูลส่วนบุคคลในระบบการเรียนรู้แบบสหพันธ์',             null,                                  'none',     null)
),
src as materialized (
  select gen_random_uuid() as id,
         t.teacher_id, t.rn, y.year_be,
         p.title_th, p.funding_source, p.funding_type, p.budget
  from mock_teachers t
  cross join academic_years y
  join topic p on p.n = (t.rn + ((y.year_be - 2566) / 2) * 3) % 8
  where y.year_be between 2566 and 2569
),
ins as (
  insert into workload_items
    (id, teacher_id, academic_year, category, title, description,
     start_date, end_date, workload_hours, status, is_public, source)
  select id, teacher_id, year_be, 'RESEARCH',
         title_th,
         'โครงการวิจัยปีที่ ' || (1 + (year_be - 2566) % 2) || ' จาก 2 ปี',
         make_date(year_be - 543, 10, 1),
         make_date(year_be - 542, 9, 30),
         120 + (rn % 4) * 30,
         case when year_be < 2569 then 'approved'
              else (array['draft', 'submitted', 'returned', 'submitted'])[1 + (rn % 4)] end,
         true, 'mock'
  from src
)
insert into research_details
  (workload_item_id, research_type, role, funding_source, funding_type,
   budget_amount, contribution_percent, project_status)
select id, 'project',
       case when rn % 2 = 0 then 'co_investigator' else 'principal_investigator' end,
       funding_source, funding_type,
       budget / 2.0,
       case when rn % 2 = 0 then 40 else 60 end,
       case when year_be = 2567 then 'completed' else 'ongoing' end
from src;

-- ---------------------------------------------------------------------
-- 3) งานบริการวิชาการ: 2 รายการต่อปี (ปี 2569 มี 1 รายการ)
-- ---------------------------------------------------------------------
with svc (n, title_th, service_type, organization, role_th, service_scope, hours) as (
  values
    (0, 'วิทยากรอบรมเชิงปฏิบัติการ Python สำหรับการวิเคราะห์ข้อมูล',       'speaker',        'หน่วยงานภาครัฐ (สมมติ)',                 'วิทยากร',            'national',      12),
    (1, 'ผู้ทรงคุณวุฒิประเมินบทความวารสารวิชาการ',                        'reviewer',       'วารสารวิชาการระดับชาติ (สมมติ)',          'ผู้ประเมินบทความ',     'national',      10),
    (2, 'กรรมการสอบวิทยานิพนธ์ภายนอกสถาบัน',                           'committee',      'มหาวิทยาลัยภายนอก (สมมติ)',              'กรรมการสอบ',         'national',      6),
    (3, 'กรรมการปรับปรุงหลักสูตรวิทยาศาสตรบัณฑิต สาขาวิชาวิทยาการคอมพิวเตอร์', 'administrative', 'สาขาวิชาวิทยาการคอมพิวเตอร์',             'กรรมการ',            'department',    30),
    (4, 'ที่ปรึกษาโครงการพัฒนาระบบสารสนเทศ',                            'consulting',     'หน่วยงานภาครัฐ (สมมติ)',                 'ที่ปรึกษา',           'national',      40),
    (5, 'ค่ายคอมพิวเตอร์สำหรับนักเรียนมัธยมศึกษาตอนปลาย',                  'community',      'โรงเรียนมัธยมในพื้นที่ (สมมติ)',           'วิทยากรและผู้จัด',     'local',         16),
    (6, 'กรรมการตัดสินการแข่งขันพัฒนาโปรแกรมคอมพิวเตอร์',                 'committee',      'สมาคมวิชาชีพด้านคอมพิวเตอร์ (สมมติ)',      'กรรมการตัดสิน',       'national',      8),
    (7, 'กรรมการพิจารณาบทความการประชุมวิชาการนานาชาติ',                  'reviewer',       'การประชุมวิชาการนานาชาติ (สมมติ)',        'Program Committee', 'international', 15)
),
src as materialized (
  select gen_random_uuid() as id,
         t.teacher_id, t.rn, y.year_be, k.slot,
         s.n, s.title_th, s.service_type, s.organization, s.role_th, s.service_scope, s.hours,
         make_date(year_be - 543 + k.slot,
                   case k.slot when 0 then 9 else 2 end,
                   1 + (t.rn * 3) % 25) as d
  from mock_teachers t
  cross join academic_years y
  cross join (values (0), (1)) as k (slot)
  join svc s on s.n = (t.rn * 2 + y.year_be + k.slot * 3) % 8
  where y.year_be between 2566 and 2569
    and not (y.year_be = 2569 and k.slot = 1)
),
ins as (
  insert into workload_items
    (id, teacher_id, academic_year, semester, category, title, description,
     start_date, end_date, workload_hours, status, is_public, source)
  select id, teacher_id, year_be, slot + 1, 'SERVICE',
         title_th,
         role_th || ' - ' || organization,
         d, d + (rn % 3),
         hours,
         case when year_be < 2569 then 'approved'
              else (array['draft', 'submitted', 'returned', 'submitted'])[1 + (rn % 4)] end,
         true, 'mock'
  from src
)
insert into service_details
  (workload_item_id, service_type, organization, role, service_scope, is_paid, participants)
select id, service_type, organization, role_th, service_scope,
       n in (0, 4),
       case when service_type in ('speaker', 'community') then 30 + (rn * 5) % 40 end
from src;

-- ---------------------------------------------------------------------
-- 4) การดูแลนักศึกษา (ก): อาจารย์ที่ปรึกษาทางวิชาการ ทั้งปีการศึกษา
-- ---------------------------------------------------------------------
with src as materialized (
  select gen_random_uuid() as id, t.teacher_id, t.rn, y.year_be
  from mock_teachers t
  cross join academic_years y
  where y.year_be between 2566 and 2569
),
ins as (
  insert into workload_items
    (id, teacher_id, academic_year, category, title, description,
     start_date, end_date, workload_hours, status, is_public, source)
  select id, teacher_id, year_be, 'ADVISING',
         'อาจารย์ที่ปรึกษานักศึกษาปริญญาตรี ชั้นปีที่ ' || (1 + (rn + year_be) % 4),
         'ให้คำปรึกษาด้านการเรียนและการลงทะเบียนตลอดปีการศึกษา',
         make_date(year_be - 543, 8, 1),
         make_date(year_be - 542, 7, 31),
         30,
         case when year_be < 2569 then 'approved'
              else (array['draft', 'submitted', 'returned', 'submitted'])[1 + (rn % 4)] end,
         false, 'mock'
  from src
)
insert into advising_details
  (workload_item_id, advising_type, student_level, student_count, role)
select id, 'academic_advisor', 'bachelor', 12 + (rn * 3 + year_be) % 14, 'main_advisor'
from src;

-- ---------------------------------------------------------------------
-- 4) การดูแลนักศึกษา (ข): ที่ปรึกษาโครงงานพิเศษ / วิทยานิพนธ์
-- ---------------------------------------------------------------------
with proj (n, title_th) as (
  values
    (0, 'ระบบจัดการคิวร้านอาหารผ่านแอปพลิเคชันมือถือ'),
    (1, 'การจำแนกโรคใบพืชด้วยโครงข่ายประสาทเทียมแบบคอนโวลูชัน'),
    (2, 'แชตบอตตอบคำถามนักศึกษาด้วยแบบจำลองภาษาขนาดใหญ่'),
    (3, 'ระบบติดตามการใช้พลังงานในอาคารด้วยอุปกรณ์ IoT'),
    (4, 'การวิเคราะห์ความรู้สึกจากข้อความรีวิวภาษาไทย'),
    (5, 'เครื่องมือตรวจหาช่องโหว่ของเว็บแอปพลิเคชันอัตโนมัติ')
),
src as materialized (
  select gen_random_uuid() as id,
         t.teacher_id, t.rn, y.year_be, p.title_th,
         (t.rn % 2 = 1) as is_senior
  from mock_teachers t
  cross join academic_years y
  join proj p on p.n = (t.rn + y.year_be) % 6
  where y.year_be between 2566 and 2569
),
ins as (
  insert into workload_items
    (id, teacher_id, academic_year, category, title, description,
     start_date, end_date, workload_hours, status, is_public, source)
  select id, teacher_id, year_be, 'ADVISING',
         case when is_senior then 'อาจารย์ที่ปรึกษาโครงงานพิเศษ: ' else 'อาจารย์ที่ปรึกษาวิทยานิพนธ์: ' end || title_th,
         case when is_senior then 'โครงงานพิเศษระดับปริญญาตรี' else 'วิทยานิพนธ์ระดับปริญญาโท' end,
         make_date(year_be - 543, 8, 1),
         make_date(year_be - 542, 5, 31),
         45,
         case when year_be < 2569 then 'approved'
              else (array['draft', 'submitted', 'returned', 'submitted'])[1 + (rn % 4)] end,
         false, 'mock'
  from src
)
insert into advising_details
  (workload_item_id, advising_type, student_level, student_count, role, project_title)
select id,
       case when is_senior then 'senior_project' else 'thesis' end,
       case when is_senior then 'bachelor' else 'master' end,
       case when is_senior then 2 + (rn + year_be) % 2 else 1 end,
       case when rn % 4 = 0 then 'co_advisor' else 'main_advisor' end,
       title_th
from src;

-- ---------------------------------------------------------------------
-- 5) ไฟล์หลักฐานประกอบ
--    ทุกแถวชี้ไปที่ไฟล์ตัวอย่างไฟล์เดียว: bucket "evidence" path "mock/sample-evidence.pdf"
--    รายการ "อาจารย์ที่ปรึกษาทางวิชาการ" ตั้งใจไม่ใส่หลักฐาน เพื่อใช้ทดสอบกรณีไม่มีไฟล์
-- ---------------------------------------------------------------------
insert into evidence_files
  (workload_item_id, title, evidence_type, file_name, mime_type, file_size_bytes, storage_bucket, storage_path)
select w.id,
       case w.category
         when 'TEACHING' then 'รายละเอียดของรายวิชา (มคอ.3)'
         when 'RESEARCH' then 'สัญญารับทุนวิจัย'
         when 'SERVICE'  then 'หนังสือเชิญ/คำสั่งแต่งตั้ง'
         else 'คำสั่งแต่งตั้งอาจารย์ที่ปรึกษา'
       end,
       case when w.category in ('SERVICE', 'ADVISING') then 'order' else 'document' end,
       lower(w.category) || '-' || w.academic_year || '-' || left(w.id::text, 8) || '.pdf',
       'application/pdf',
       120000 + (w.academic_year % 7) * 35000,
       'evidence',
       'mock/sample-evidence.pdf'
from workload_items w
left join advising_details a on a.workload_item_id = w.id
where w.source = 'mock'
  and (w.category <> 'ADVISING' or a.advising_type <> 'academic_advisor');

-- หลักฐานแบบลิงก์ภายนอก: รายงานฉบับสมบูรณ์ของโครงการวิจัยที่สิ้นสุดแล้ว
insert into evidence_files (workload_item_id, title, evidence_type, external_url)
select w.id, 'รายงานวิจัยฉบับสมบูรณ์', 'link', 'https://example.com/mock/research-report'
from workload_items w
join research_details r on r.workload_item_id = w.id
where w.source = 'mock' and r.project_status = 'completed';

-- ---------------------------------------------------------------------
-- 6) (เสริม) สร้างรายการงานวิจัยประเภท "ผลงานตีพิมพ์" จากข้อมูลจริงในตาราง publications
--    สูงสุด 3 เรื่องต่ออาจารย์ต่อปีการศึกษา ใช้ source = 'openalex'
--    ถ้าโครงสร้างตารางเดิมไม่ตรงกับที่คาดไว้ ขั้นนี้จะถูกข้ามโดยไม่กระทบส่วนอื่น
-- ---------------------------------------------------------------------
do $$
begin
  with ranked as (
    select t.teacher_id, ay.year_be, p.id as publication_id, p.title,
           row_number() over (
             partition by t.teacher_id, ay.year_be
             order by p.publication_date desc, p.id
           ) as k
    from mock_teachers t
    join teacher_publications tp on tp.teacher_id = t.teacher_id
    join publications p on p.id = tp.publication_id
    join academic_years ay on p.publication_date between ay.start_date and ay.end_date
  ),
  src as materialized (
    select gen_random_uuid() as id, teacher_id, year_be, publication_id, title
    from ranked
    where k <= 3
  ),
  ins as (
    insert into workload_items
      (id, teacher_id, academic_year, category, title, description, status, is_public, source)
    select id, teacher_id, year_be, 'RESEARCH',
           coalesce(title, 'Untitled'),
           'ผลงานตีพิมพ์ (เชื่อมจากตาราง publications)',
           'approved', true, 'openalex'
    from src
  )
  insert into research_details
    (workload_item_id, research_type, role, project_status, publication_id)
  select id, 'publication', 'author', 'completed', publication_id
  from src;
exception when others then
  raise notice 'ข้ามการเชื่อมผลงานตีพิมพ์: %', sqlerrm;
end $$;

commit;

-- ---------------------------------------------------------------------
-- ตรวจผลลัพธ์: จำนวนรายการแยกตามปีการศึกษา หมวด และที่มา
-- ---------------------------------------------------------------------
select academic_year, category, source, count(*) as items
from workload_items
group by academic_year, category, source
order by academic_year, category, source;
