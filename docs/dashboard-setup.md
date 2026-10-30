# การเชื่อม Dashboard

โค้ดชุดนี้เพิ่ม API บน Backend ใน repository; การแก้ไฟล์ในเครื่องไม่ใช่การ deploy EC2

## เส้นทาง API

- `GET /api/workloads/by-category`: public endpoint สำหรับหน้าโปรไฟล์ แสดงเฉพาะรายการที่เลือกและอยู่ใน submission สถานะ `APPROVED`; ไม่คืนชื่อนักศึกษารายบุคคล คะแนน หรือข้อมูลที่ใช้ตรวจภายใน
- `GET /api/profile/me`: โหลดอาจารย์จาก JWT
- `PUT /api/profile/me`: แก้ไขข้อมูลส่วนตัว ยกเว้นคณะ สาขา สิทธิ์ และรหัสผ่าน
- `GET /api/workloads`: โหลดเฉพาะรายการของผู้ล็อกอิน
- `POST /api/workloads`: เพิ่มรายการ พร้อมคำนวณคะแนนที่เซิร์ฟเวอร์
- `PUT /api/workloads/{key}`: แก้ไข/ย้ายประเภทและภาคเรียนใน transaction เดียว
- `DELETE /api/workloads/{key}`: ลบเฉพาะรายการของผู้ล็อกอินที่ยังไม่ผ่านการพิจารณา
- `PATCH /api/workloads/submissions/{id}/status`: เจ้าหน้าที่สาขา, ผู้ตรวจสอบ หรือ admin อนุมัติ/ส่งกลับรายการได้; อนุญาตให้แก้ `REJECTED` เป็น `APPROVED` เมื่อผู้มีสิทธิ์ตัดสินใจใหม่ และไม่อนุญาตให้เปลี่ยนรายการที่ `APPROVED` แล้ว

`key` คือ `table_name:uuid` ที่ API ส่งกลับ ต้อง URL-encode ก่อนใช้ใน path

## เตรียมระบบ

1. ใช้ `backend/.env` สำหรับ DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD และ SECRET_KEY จริงของระบบ ห้าม commit ไฟล์นี้
2. ตรวจและสำรองฐานข้อมูลก่อนใช้ `backend/migrations/001_dashboard_fields.sql` ภายใน transaction ไฟล์นี้เพิ่มช่องที่ฟอร์มต้องเก็บ และขยายชนิดของหน่วยกิต/ชื่อบทบาท/คะแนน/น้ำหนัก ไม่ลบแถวเดิม ใช้ `python scripts/apply-dashboard-migration.py` เพื่อตรวจ และเพิ่ม `--apply` เมื่อต้องการนำไปใช้จริง
3. ติดตั้ง `backend/requirements.txt` และรันจาก root: `python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000`
4. เปิดหน้า `login.html` จากนั้นเข้า `teacher-dashboard.html`; ก่อนเผยแพร่ ให้ตั้ง URL สาธารณะ HTTPS ของ FastAPI ในไฟล์ frontend ที่เรียก API
5. สำหรับ production ให้ deploy backend และ frontend ไปยัง EC2, ตั้งค่า `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` และ `SECRET_KEY` บน EC2 และปรับ URL API ใน frontend ให้ตรงกับ HTTPS endpoint ที่ deploy แล้ว จากนั้นตรวจ `/api/health` และ `/openapi.json`
6. ตั้งค่า RDS security group ให้รับ PostgreSQL จาก security group ของ EC2 เท่านั้น; อย่าเปิดพอร์ตฐานข้อมูลสู่สาธารณะ

## การทดสอบ

- `node tests/workload-scoring.cjs`
- `node scripts/export-workload-rules.cjs --check`
- `python tests/test_dashboard_api.py` ทดสอบโดยไม่เปิดฐานข้อมูล
- `python tests/test_dashboard_database.py` ใช้ PostgreSQL จริง แต่สร้าง TEMP tables จำลอง schema และ rollback ทั้งหมด ไม่แก้ไข public tables

## ข้อจำกัดที่ต้องทราบ

การเปลี่ยนให้เหลือ `course_code` ช่องเดียว: ต้องอัปเดต Backend รุ่นนี้และรัน
`python scripts/apply-dashboard-migration.py --apply --remove-course-name`
ในช่วงหยุดบริการเดียวกัน แล้วเริ่ม Backend ใหม่ เพราะโค้ดเก่าอ่าน `course_name_th`
และตารางเก่าบังคับให้ส่งชื่อนี้ตอนเพิ่มรายการ คำสั่งนี้ลบคอลัมน์และชื่อวิชาเดิมจริง
ตามคำขอผู้ใช้ แต่ไม่ลบแถวภาระงานหรือ `course_code` ควรสำรองก่อนรัน

- migration ยังต้องผ่านการตรวจและนำไปใช้ก่อน workload API จะใช้งานครบ
- รายการเดิมที่ไม่มี subtype จะอ่านได้ แต่ยังไม่เปิดแก้ไขเพราะไม่มีข้อมูลพอจะเดาประเภท/บทบาท
- ภาคฤดูร้อนใช้ semester = 3 ในฐานข้อมูล
- คะแนนเป็นคะแนนดิบต่อรายการ ไม่ใช่ผลประเมินที่อนุมัติ รายการ pending เก็บ score = NULL
- ชื่อไฟล์หลักฐานเป็น metadata เท่านั้น ยังไม่ใช่ระบบอัปโหลด; ลิงก์หลักฐานบันทึกได้
- การศึกษาหรือความเชี่ยวชาญหนึ่งบรรทัดถูกเก็บเป็นสมาชิกหนึ่งตัวของ text[]
- ไฟล์นี้อธิบายการตั้งค่าแอปพลิเคชันเท่านั้น ไม่ได้ deploy หรือเปลี่ยนแปลง EC2/RDS ให้โดยอัตโนมัติ
