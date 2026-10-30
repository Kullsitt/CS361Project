# Faculty Research & Workload Management System (FRWS)

ระบบสืบค้นผลงานวิจัยและจัดการภาระงานของคณาจารย์ มหาวิทยาลัยธรรมศาสตร์ ประกอบด้วยเว็บ frontend, FastAPI backend และ PostgreSQL บน AWS RDS โดย backend เป็นตัวกลางเชื่อมต่อฐานข้อมูล ไม่ให้ browser เชื่อมต่อ RDS โดยตรง

## เทคโนโลยี

- Frontend: HTML, CSS และ JavaScript
- Backend: Python, FastAPI, Uvicorn และ psycopg2
- Database: PostgreSQL บน AWS RDS
- Hosting เป้าหมาย: EC2 สำหรับ backend และ static frontend

## โครงสร้างหลัก

- `public/`: หน้าเว็บและไฟล์ frontend
- `backend/app/`: FastAPI application, database configuration และ API routers
- `backend/migrations/`: SQL migrations
- `scripts/`: เครื่องมือจัดเตรียมและตรวจสอบ migration
- `tests/`: การทดสอบ backend และ workload scoring
- `docs/`: วิธีตั้งค่าและรายละเอียดการเชื่อม dashboard

## รัน backend ในเครื่อง

1. ติดตั้ง dependencies: `python -m pip install -r backend/requirements.txt`
2. ตั้งค่า environment variables สำหรับ PostgreSQL และ `SECRET_KEY` ใน `backend/.env` โดยห้าม commit credentials
3. จาก repository root รัน: `python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000`
4. ตรวจสถานะที่ `http://127.0.0.1:8000/api/health` และเอกสาร API ที่ `/docs`

สำหรับ EC2 ให้ตั้ง environment variables บนเครื่องเซิร์ฟเวอร์ และให้ security group ของ RDS อนุญาตการเชื่อมต่อ PostgreSQL จาก EC2 เท่านั้น ไม่ควรเปิด RDS ให้เข้าถึงจากอินเทอร์เน็ตสาธารณะ รายละเอียดการเตรียม dashboard และ migration อยู่ใน [dashboard-setup.md](./docs/dashboard-setup.md)

## การทดสอบ

- `python tests/test_dashboard_api.py`: ทดสอบ validation และ API โดยไม่เปิดฐานข้อมูล
- `python tests/test_dashboard_database.py`: ทดสอบกับ PostgreSQL โดยใช้ TEMP tables และ rollback
- `node tests/workload-scoring.cjs`: ทดสอบสูตรคะแนน
- `node scripts/export-workload-rules.cjs --check`: ตรวจความสอดคล้องของกฎคะแนน
