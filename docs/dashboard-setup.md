# การเชื่อม Dashboard

โค้ดชุดนี้เพิ่ม API บน Backend ใน repository; การแก้ไฟล์ในเครื่องไม่ใช่การ deploy EC2

## เส้นทาง API

- `GET /api/profile/me`: โหลดอาจารย์จาก JWT
- `PUT /api/profile/me`: แก้ไขข้อมูลส่วนตัว ยกเว้นคณะ สาขา สิทธิ์ และรหัสผ่าน
- `GET /api/workloads`: โหลดเฉพาะรายการของผู้ล็อกอิน
- `POST /api/workloads`: เพิ่มรายการ พร้อมคำนวณคะแนนที่เซิร์ฟเวอร์
- `PUT /api/workloads/{key}`: แก้ไข/ย้ายประเภทและภาคเรียนใน transaction เดียว
- `DELETE /api/workloads/{key}`: ลบเฉพาะรายการของผู้ล็อกอินที่ยังไม่ผ่านการพิจารณา

`key` คือ `table_name:uuid` ที่ API ส่งกลับ ต้อง URL-encode ก่อนใช้ใน path

## เตรียมระบบ

1. ใช้ `backend/.env` สำหรับ DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD และ SECRET_KEY จริงของระบบ ห้าม commit ไฟล์นี้
2. ตรวจและสำรองฐานข้อมูลก่อนใช้ `backend/migrations/001_dashboard_fields.sql` ภายใน transaction ไฟล์นี้เพิ่มช่องที่ฟอร์มต้องเก็บ และขยายชนิดของหน่วยกิต/ชื่อบทบาท/คะแนน/น้ำหนัก ไม่ลบแถวเดิม ใช้ `python scripts/apply-dashboard-migration.py` เพื่อตรวจ และเพิ่ม `--apply` เมื่อต้องการนำไปใช้จริง
3. ติดตั้ง `backend/requirements.txt` และรันจาก root: `python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000`
4. เปิด `http://127.0.0.1:8000/login.html` จากนั้นเข้า `teacher-dashboard.html` หน้า localhost เรียก `/api` บน Backend ในเครื่อง
5. Deploy Backend และไฟล์ public ไปยัง EC2/hosting ที่ใช้จริง แล้วตรวจ `/openapi.json` ว่ามีเส้นทางข้างต้น

## การทดสอบ

- `node tests/workload-scoring.cjs`
- `node scripts/export-workload-rules.cjs --check`
- `python tests/test_dashboard_api.py` ทดสอบโดยไม่เปิดฐานข้อมูล
- `python tests/test_dashboard_database.py` ใช้ PostgreSQL จริง แต่สร้าง TEMP tables จำลอง schema และ rollback ทั้งหมด ไม่แก้ไข public tables

## ข้อจำกัดที่ต้องทราบ

- migration ยังต้องผ่านการตรวจและนำไปใช้ก่อน workload API จะใช้งานครบ
- รายการเดิมที่ไม่มี subtype จะอ่านได้ แต่ยังไม่เปิดแก้ไขเพราะไม่มีข้อมูลพอจะเดาประเภท/บทบาท
- ภาคฤดูร้อนใช้ semester = 3 ในฐานข้อมูล
- คะแนนเป็นคะแนนดิบต่อรายการ ไม่ใช่ผลประเมินที่อนุมัติ รายการ pending เก็บ score = NULL
- ชื่อไฟล์หลักฐานเป็น metadata เท่านั้น ยังไม่ใช่ระบบอัปโหลด; ลิงก์หลักฐานบันทึกได้
- การศึกษาหรือความเชี่ยวชาญหนึ่งบรรทัดถูกเก็บเป็นสมาชิกหนึ่งตัวของ text[]
- ยังไม่ deploy จนกว่าจะมีช่องทางเข้าถึง EC2 ที่ได้รับอนุญาต
