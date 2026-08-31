# Faculty Research & Workload Management System (FRWS)

ระบบสืบค้นและจัดการข้อมูลผลงานวิจัยและภาระงานของคณาจารย์ มหาวิทยาลัยธรรมศาสตร์ ซึ่งเชื่อมโยงข้อมูลอาจารย์จาก TU REST API เข้ากับฐานข้อมูลงานวิจัยระดับสากลผ่าน OpenAlex API พร้อมระบบจับคู่ชื่อผู้แต่ง (Author Matching Engine) และหน้าเว็บแสดงผลข้อมูลแบบตอบสนองทันที (Responsive Web Interface)

---

## ✨ คุณสมบัติหลัก (Key Features)

* **ดึงข้อมูลคณาจารย์อัตโนมัติ (Automated Faculty Synchronization):** ซิงก์ข้อมูลรายชื่อ สังกัดคณะ/ภาควิชา และอีเมลของอาจารย์ มธ. ผ่าน TU REST API
* **ค้นหางานวิจัยสากล (OpenAlex Publication Pipeline):** ค้นหารายการผลงานวิจัย ยอดการอ้างอิง (Citations) และลิงก์บทความจริงจาก OpenAlex API โดยคัดกรองเฉพาะสังกัด Thammasat University
* **ระบบจับคู่ผู้แต่งอัจฉริยะ (Token-Based Author Matching Engine):** ระบบวิเคราะห์และจับคู่ชื่อผู้แต่งในบทความวิจัยเข้ากับโปรไฟล์อาจารย์ในระบบ รองรับทั้งการค้นด้วยชื่อย่อ นามสกุลย่อ และการเขียนชื่อภาษาไทย/อังกฤษ
* **แสดงผลโปรไฟล์และงานวิจัย (Faculty Profile & Publications Viewer):** หน้าเว็บสำหรับสืบค้นบทความวิจัย และดูโปรไฟล์ผลงานวิจัยรวมของอาจารย์แต่ละท่าน

---

## 🛠 เทคโนโลยีที่ใช้ (Tech Stack)

### **Frontend**
* **Core:** HTML5, CSS3, JavaScript (Vanilla JS ES6+)
* **UI & Styling:** Google Fonts (Sarabun), FontAwesome Icons
* **Database Client:** Supabase JavaScript Client (`@supabase/supabase-js`)

### **Data Pipeline (Backend / Automation)**
* **Language:** Python 3.x
* **Libraries:** `requests`, `supabase`, `python-dotenv`
* **External APIs:** 
  * TU REST API (ข้อมูลอาจารย์ มธ.)
  * OpenAlex API (ข้อมูลงานวิจัยระดับสากล)

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```text
CS361Project/
├── pipeline/                      # ส่วนประมวลผลและดึงข้อมูล (Python Data Pipeline)
│   ├── .env                       # ไฟล์เก็บ API Keys และค่า Configuration (ไม่ถูก push ขึ้น git)
│   ├── .env.example               # ตัวอย่างไฟล์การตั้งค่า Environment Variables
│   ├── processed_teachers.txt     # Checkpoint file บันทึกประวัติอาจารย์ที่ดึงข้อมูลเสร็จแล้ว
│   ├── requirements.txt           # รายชื่อ Python Dependencies
│   ├── sync_teachers.py           # สคริปต์ดึงรายชื่ออาจารย์จาก TU REST API ลง Supabase
│   └── sync_publications.py       # สคริปต์ดึงงานวิจัยจาก OpenAlex API ลง Supabase
│
├── public/                        # ส่วนแสดงผลหน้าเว็บ (Frontend Web Application)
│   ├── assets/                    # โลโก้และไฟล์รูปภาพประกอบ
│   ├── js/
│   │   ├── index.js               # สคริปต์หน้าหลัก (รายการงานวิจัย + รายชื่ออาจารย์)
│   │   └── teacherScript.js       # สคริปต์หน้าโปรไฟล์อาจารย์
│   ├── index.html                 # หน้าหลักระบบ (Publications / Faculty Members)
│   ├── teacher.html               # หน้าแสดงรายละเอียดโปรไฟล์อาจารย์
│   ├── style.css                  # สไตล์หลักของหน้าเว็บ
│   └── teacherStyle.css           # สไตล์เฉพาะหน้าโปรไฟล์อาจารย์
│
└── README.md                      # เอกสารอธิบายโปรเจกต์