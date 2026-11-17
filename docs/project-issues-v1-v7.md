# ชุด GitHub Issues โครงการ FRWS (แบ่งตาม V1 – V7)
> **โจทย์ที่ 2: ระบบผลงานและภาระงานอาจารย์ (Faculty Output & Workload Management System)**  
> วิชา CS361: สถาปัตยกรรมซอฟต์แวร์และคลาวด์  
> ชุด Issue นี้ถูกปรับปรุงและเขียนขึ้นใหม่ให้ตรงตามเกณฑ์มาตรฐานสากล (Agile / GitHub Issues) โดยครอบคลุม User Story, Functional Requirements (FR1–FR10), Acceptance Criteria (DoD), รายละเอียดเชิงเทคนิค และสถาปัตยกรรมของแต่ละ Version อย่างสมบูรณ์

---

## 📌 สรุปภาพรวมการจับคู่ Requirement กับ Version

| Version | ชื่อฟีเจอร์หลัก | FR ที่เกี่ยวข้อง | บทบาทผู้ใช้หลัก |
|---|---|---|---|
| **V1** | Faculty Profile / Public Output | FR1, FR10 | ผู้ใช้ทั่วไป (Public) |
| **V2** | Faculty Output Repository | FR2, FR3, FR4, FR10 | อาจารย์, เจ้าหน้าที่ |
| **V3** | Secure Faculty Workspace | FR3, FR4, FR5, FR6 | อาจารย์, เจ้าหน้าที่, ผู้ตรวจสอบ |
| **V4** | Department Reporting & Aggregation | FR7, FR8, FR9 (เน้น V4) | เจ้าหน้าที่, ผู้บริหาร, อาจารย์ |
| **V5** | Automation & CI/CD | All Requirements | DevOps, นักพัฒนา |
| **V6** | Performance & Cloud Cost Optimization | FR7, FR8, FR9, FR10 | Architect, ผู้ดูแลระบบ |
| **V7** | Integrated System & Architecture Review | FR1 – FR10 | ผู้บริหาร, ทุกบทบาท |

---

<!-- ========================================================================= -->
## 📋 Issue #1: [V1] Faculty Profile & Public Output Display
**Title:** `[V1] Feature: ระบบสืบค้นและแสดงข้อมูลประวัติอาจารย์และผลงานทางวิชาการสาธารณะ`  
**Labels:** `v1`, `frontend`, `api`, `public-access`  
**Assignees:** Frontend / API Developer  

### 📖 User Story
> ในฐานะ **ผู้ใช้ทั่วไป (นักศึกษา, บุคคลภายนอก, นักวิจัย)**  
> ฉันต้องการ **เข้าถึงและสืบค้นข้อมูลประวัติ ความเชี่ยวชาญ และผลงานทางวิชาการของอาจารย์ได้**  
> เพื่อ **ตรวจสอบความเชี่ยวชาญ ค้นหาอาจารย์ที่ปรึกษา หรืออ้างอิงผลงานวิจัยโดยไม่ต้องเข้าสู่ระบบ**

### 🎯 Functional Requirements ที่เกี่ยวข้อง
- **FR1:** ผู้ใช้ทั่วไปสามารถดูข้อมูลประวัติอาจารย์และผลงานบางส่วนที่กำหนดให้เผยแพร่ได้
- **FR10:** ระบบสามารถเชื่อมโยงข้อมูลผลงานจากแหล่งข้อมูลภายนอก (เช่น OpenAlex API, Google Scholar) มาแสดงผลได้

### 📝 รายละเอียดงาน (Scope of Work)
1. **หน้าแสดงรายชื่ออาจารย์ (Faculty Directory):**
   - พัฒนาหน้าเว็บ `index.html` แสดงการ์ดรายชื่อคณาจารย์ในสาขาวิชา
   - มีช่องค้นหาอาจารย์ตามชื่อ-สกุล, ตำแหน่งวิชาการ, ความเชี่ยวชาญ
2. **หน้าโปรไฟล์อาจารย์รายบุคคล (Public Teacher Profile):**
   - พัฒนาหน้าเว็บ `teacher.html` แสดงข้อมูลประวัติ: About, Education, Expertise, Research Interests และ Contact
   - แสดงรายการผลงานตีพิมพ์ทางวิชาการ (Publications) และภาระงานที่เปิดเผยได้
3. **Backend Public APIs:**
   - Endpoint `GET /api/professors` สำหรับดึงรายชื่ออาจารย์ทั้งหมดพร้อมตัวกรอง
   - Endpoint `GET /api/professors/{id}` สำหรับดึงข้อมูลโปรไฟล์รายบุคคล
   - Endpoint `GET /api/publications?professor_id={id}` สำหรับดึงผลงานวิชาการของอาจารย์
   - Endpoint `GET /api/workloads/by-category?professor_id={id}&category={category}` สำหรับแสดงภาระงานที่อนุมัติแล้ว

### 🏗️ สถาปัตยกรรมและเทคนิค (Architecture & Tech Specs)
- **Public Sandbox:** Endpoint ฝั่ง Public ต้องไม่เปิดเผยข้อมูลส่วนบุคคลที่ละเอียดอ่อน (เช่น Password hash, ข้อมูลเงินเดือน, ข้อมูลติดต่อส่วนตัว)
- **Database Connection Security:** Frontend ติดต่อฐานข้อมูลผ่าน FastAPI Backend เท่านั้น ห้ามเชื่อมต่อตรงไปยัง RDS
- **Caching & OpenAlex Integration:** ดึงข้อมูลผลงานตีพิมพ์ภายนอกมาแคชไว้ในฐานข้อมูล RDS เพื่อป้องกันปัญหา Third-party API rate limit

### ✅ เกณฑ์การตรวจรับงาน (Acceptance Criteria / DoD)
- [ ] ผู้ใช้ทั่วไปสามารถเปิดหน้าเว็บ `index.html` และ `teacher.html` ได้โดยไม่ต้องล็อกอิน
- [ ] ค้นหาอาจารย์ตามชื่อภาษาไทย/อังกฤษ หรือความเชี่ยวชาญ แล้วผลลัพธ์แสดงได้ถูกต้อง
- [ ] แสดงรายการผลงานวิจัยของอาจารย์ พร้อมลิงก์ไปยังเอกสารหรือ DOI ภายนอกได้
- [ ] API ไม่ส่งคืนข้อมูลลับ (เช่น password hash หรือ session token) ให้แก่ Public Client
- [ ] มี Responsive Design รองรับการเปิดบนหน้าจอคอมพิวเตอร์และมือถือ

---

<!-- ========================================================================= -->
## 📋 Issue #2: [V2] Faculty Output Repository & Multi-Year Data Model
**Title:** `[V2] Feature: ฐานข้อมูลกลางสำหรับจัดเก็บและบริหารข้อมูลผลงานและภาระงานรองรับหลายปีการศึกษา`  
**Labels:** `v2`, `database`, `backend`, `data-model`  
**Assignees:** Backend Developer / Database Engineer  

### 📖 User Story
> ในฐานะ **อาจารย์และเจ้าหน้าที่สาขาวิชา**  
> ฉันต้องการ **ระบบฐานข้อมูลกลางที่จัดเก็บภาระงานครบทุกประเภทและรองรับข้อมูลย้อนหลังได้หลายปีการศึกษา**  
> เพื่อ **ลดความกระจัดกระจายของไฟล์ แก้ปัญหาข้อมูลซ้ำซ้อน และเรียกดูย้อนหลังได้ตลอดเวลา**

### 🎯 Functional Requirements ที่เกี่ยวข้อง
- **FR2:** จัดเก็บและบริหารข้อมูลผลงานและภาระงานอาจารย์ (การสอน, วิจัย, บริการวิชาการ, การดูแลนักศึกษา ฯลฯ) หลายปีการศึกษา
- **FR3:** อาจารย์สามารถเพิ่ม แก้ไข และติดตามข้อมูลผลงานหรือภาระงานของตนเอง
- **FR4:** ระบบสามารถจัดเก็บข้อมูลประกอบหรือหลักฐาน (Evidence URLs & Attachments) ที่เกี่ยวข้องกับภาระงาน
- **FR10:** รองรับการเชื่อมโยงข้อมูลกับระบบอื่นอย่างเป็นระบบ

### 📝 รายละเอียดงาน (Scope of Work)
1. **ออกแบบ Schema ฐานข้อมูลกลาง (PostgreSQL on AWS RDS):**
   - ตารางหลัก: `professors`, `workload_submissions` (เก็บรอบปีการศึกษา/ภาคเรียน และสถานะ)
   - ตารางแยกตามหมวดภาระงาน 5 หมวด:
     - `teaching_workloads` (วิชาบรรยาย / ปฏิบัติการ)
     - `student_project_supervisions` (โครงงานนักศึกษา / สหกิจศึกษา)
     - `thesis_supervisions` (วิทยานิพนธ์ / สารนิพนธ์)
     - `academic_work_items` (บทความวิจัย, รายงานวิจัย, ตำรา, สิทธิบัตร, ทุนวิจัย)
     - `administrative_work_items` (ตำแหน่งบริหาร, ผู้ประสานงานรายวิชา)
     - `service_work_items` (บริการวิชาการ, กรรมการ, คณะทำงาน)
     - `extra_score_items` (คะแนนพิเศษและผลงานอื่น ๆ)
2. **ระบบจัดการความสัมพันธ์ (Relationships & Multi-Year Constraints):**
   - กำหนด Foreign Key และ Index อ้างอิงตาม `submission_id` และ `professor_id`
   - รองรับปีการศึกษา (พ.ศ. 2500–2700) และภาคการศึกษา (1, 2, ฤดูร้อน)
3. **การจัดเก็บข้อมูลหลักฐาน (Evidence Management):**
   - จัดเก็บ URL ลิงก์หลักฐานภายนอก (`evidence_url`) และรายชื่อไฟล์อ้างอิง (`attachment_names`)
4. **Data Migration Script:**
   - สร้าง Migration SQL สำหรับปรับปรุง Column ให้รองรับสัดส่วนการมีส่วนร่วม (%) และจำนวนหน่วยกิต

### 🏗️ สถาปัตยกรรมและเทคนิค (Architecture & Tech Specs)
- **Data Integrity:** มี Foreign Key Cascade/Restrict ที่ถูกต้อง ข้อมูลคะแนนใช้ประเภท `numeric` เพื่อความแม่นยำสูง
- **Isolation:** ข้อมูลภาระงานแยกตารางตามธรรมชาติของโครงสร้างข้อมูล แต่ผูกรวมกันผ่าน `workload_submissions`

### ✅ เกณฑ์การตรวจรับงาน (Acceptance Criteria / DoD)
- [ ] Schema รองรับข้อมูลภาระงานครบทั้ง 5 หมวดตามเอกสารเกณฑ์ภาระงานของมหาวิทยาลัย
- [ ] สามารถบันทึกข้อมูลย้อนหลังข้ามปีการศึกษาได้โดยข้อมูลไม่ปะปนกัน
- [ ] บันทึกและดึงข้อมูลหลักฐาน (Evidence Link และชื่อไฟล์แนบ) ได้อย่างถูกต้อง
- [ ] สคริปต์ Migration ทำงานได้สมบูรณ์โดยไม่ทำลายข้อมูลเดิมในระบบ
- [ ] ผ่าน Integration Tests การบันทึกและอ่านข้อมูลภาระงานข้ามหมวดหมู่

---

<!-- ========================================================================= -->
## 📋 Issue #3: [V3] Secure Faculty Workspace & Role-Based Access Control
**Title:** `[V3] Feature: ระบบยืนยันตัวตน กำหนดสิทธิ์ตามบทบาท (RBAC) และพื้นที่จัดการภาระงานอาจารย์`  
**Labels:** `v3`, `security`, `auth`, `rbac`, `frontend`  
**Assignees:** Full-stack Developer / Security Engineer  

### 📖 User Story
> ในฐานะ **อาจารย์ประจำสาขาวิชา**  
> ฉันต้องการ **เข้าสู่ระบบอย่างปลอดภัย และมีพื้นที่ทำงานส่วนตัวสำหรับกรอกและจัดการภาระงานของตนเอง**  
> และในฐานะ **เจ้าหน้าที่/ผู้ตรวจสอบ**  
> ฉันต้องการ **เข้าถึงข้อมูลภาระงานของอาจารย์เพื่อตรวจสอบและส่งกลับแก้ไขได้ตามสิทธิ์ที่ได้รับมอบหมาย**

### 🎯 Functional Requirements ที่เกี่ยวข้อง
- **FR3:** อาจารย์สามารถเพิ่ม แก้ไข และติดตามข้อมูลผลงานหรือภาระงานของตนเองตามสิทธิ์
- **FR4:** จัดเก็บหลักฐานและเอกสารประกอบภาระงานในพื้นที่ของตนเอง
- **FR5:** ระบบรองรับการเข้าสู่ระบบและกำหนดสิทธิ์ตามบทบาท (RBAC) จำกัดการเข้าถึงข้อมูลที่ไม่ควรเปิดเผย
- **FR6:** ข้อมูลสามารถกำหนดกระบวนการตรวจสอบ รับรอง หรือส่งกลับแก้ไขโดยผู้ได้รับสิทธิ์

### 📝 รายละเอียดงาน (Scope of Work)
1. **ระบบ Authentication & Security:**
   - ระบบ Login ตรวจสอบ Username/Password ด้วยการเข้ารหัสผ่าน `bcrypt`
   - ใช้ JSON Web Token (JWT) ในการยืนยันตัวตนผ่าน HTTP Authorization Bearer Header
   - กำหนด Role: `Teacher` (อาจารย์), `Officer` / `Reviewer` (เจ้าหน้าที่/ผู้ตรวจสอบ), `Admin` (ผู้ดูแลระบบ)
2. **หน้าพื้นที่ทำงานของอาจารย์ (Teacher Workspace):**
   - พัฒนาหน้า `teacher-dashboard.html` สำหรับแก้ไขข้อมูลโปรไฟล์ส่วนตัว
   - ฟอร์มกรอกภาระงานรองรับ 5 หมวด พร้อม Dynamic Fields ตามบทบาทที่เลือก
   - เอนจินคำนวณคะแนนแสดงผลแบบ Real-time (`workload-scoring.js`)
   - รายการประวัติภาระงานของตนเอง พร้อมปุ่มแก้ไขและลบ (เฉพาะสถานะ DRAFT หรือ PENDING)
3. **Workflow การส่งและตรวจสอบภาระงาน:**
   - สถานะของชุดภาระงาน: `DRAFT` (ร่าง) -> `PENDING` (รอตรวจ) -> `APPROVED` (อนุมัติแล้ว) / `REJECTED` (ส่งกลับแก้ไข)
   - กฎความปลอดภัย: อาจารย์ไม่สามารถแก้ไขข้อมูลภาระงานที่ผ่านการอนุมัติแล้วได้ หากต้องการแก้ไขต้องให้เจ้าหน้าที่ส่งกลับแก้ไขก่อน
4. **Backend Security Guard:**
   - Dependency `get_current_user` และ `require_roles` ป้องกันการเข้าถึง Endpoint โดยไม่ได้รับอนุญาต
   - ตรวจสอบความเป็นเจ้าของข้อมูล (Data Ownership Validation) เพื่อป้องกันไม่ให้อาจารย์ท่านอื่นแก้ไขข้อมูลข้ามบัญชี

### 🏗️ สถาปัตยกรรมและเทคนิค (Architecture & Tech Specs)
- **Token Security:** เก็บ Token ใน localStorage/session พร้อมกำหนดวันหมดอายุที่เหมาะสม
- **Server-Side Validation:** แม้หน้าบ้านจะคำนวณคะแนนให้ดู แต่ Server จะคำนวณคะแนนจริงใหม่เสมอโดยไม่อ่านค่าคะแนนที่ Client ส่งมา
- **Audit Locking:** ป้องกัน Race Condition ขณะแก้ไขสถานะด้วยคำสั่ง `SELECT ... FOR UPDATE`

### ✅ เกณฑ์การตรวจรับงาน (Acceptance Criteria / DoD)
- [ ] เข้าสู่ระบบด้วยบทบาทต่าง ๆ แล้วระบบแสดงเมนูและเข้าถึงหน้าเว็บตามสิทธิ์ได้อย่างถูกต้อง
- [ ] อาจารย์สามารถ เพิ่ม/แก้ไข/ลบ รายการภาระงานของตนเองได้
- [ ] อาจารย์ไม่สามารถเข้าถึงหรือแก้ไขภาระงานของอาจารย์ท่านอื่นได้ (Unauthorized / 403 Forbidden)
- [ ] ภาระงานที่ถูก Approve แล้ว จะถูกล็อกไม่ให้อาจารย์แก้ไขโดยพลการ
- [ ] เจ้าหน้าที่สามารถเปลี่ยนสถานะเป็น APPROVED หรือ REJECTED ได้อย่างถูกต้อง

---

<!-- ========================================================================= -->
## 📋 Issue #4: [V4] Department Reporting, Aggregation & Dashboard
**Title:** `[V4] Feature: แดชบอร์ดตรวจสอบและสรุปผลงานภาระงานระดับสาขาวิชา และส่งออกรายงาน Workload Sheet`  
**Labels:** `v4`, `dashboard`, `reporting`, `analytics`, `export`  
**Assignees:** Full-stack Developer / Data Analyst  

### 📖 User Story
> ในฐานะ **เจ้าหน้าที่สาขาวิชาและผู้บริหาร**  
> ฉันต้องการ **แดชบอร์ดที่รวบรวม สรุปผล คำนวณคะแนนตามเกณฑ์ และเปรียบเทียบภาระงานของอาจารย์ทุกคนในสาขาวิชา**  
> เพื่อ **ตรวจสอบความถูกต้อง ความครบถ้วน เกณฑ์การเลื่อนเงินเดือน และจัดทำรายงานประจำปีหรือ Workload Sheet ได้อย่างรวดเร็ว**

### 🎯 Functional Requirements ที่เกี่ยวข้อง
- **FR7:** ดูสรุปผลงานและภาระงานของอาจารย์ตามปีการศึกษา ประเภทงาน หรือเงื่อนไขที่เกี่ยวข้อง
- **FR8:** ดูข้อมูลรวมระดับสาขาวิชา พร้อมค้นหา กรอง และเปรียบเทียบข้อมูลตามช่วงเวลา ประเภทงาน หรือบุคลากร
- **FR9:** ระบบสามารถจัดทำหรือสนับสนุนการจัดทำร่าง Workload Sheet และส่งออกรายงานในรูปแบบที่เหมาะสม (CSV)

### 📝 รายละเอียดงาน (Scope of Work)
1. **หน้าแดชบอร์ดสาขาวิชา (Officer Dashboard):**
   - พัฒนาหน้า `dashboard.html` แสดง KPI Cards: จำนวนอาจารย์ทั้งหมด, อัตราผ่านเกณฑ์ประเมิน (≥ 650 คะแนน), คะแนนคำนวณเฉลี่ย, จำนวนรายการที่รอตรวจสอบ
   - ตารางสรุปคะแนนรายบุคคล: แยกแสดงคะแนนจริงและคะแนนคำนวณของทั้ง 5 หมวด, รวมคะแนนสุทธิ, หน่วยกิตสอนรวม, และสถานะการประเมิน
2. **ระบบการกรองและค้นหา (Filter & Search Engine):**
   - กรองตามปีการศึกษา/ภาคเรียน (เช่น ภาค 2/2567, ภาค 1/2567)
   - กรองตามโครงการที่สอน (ภาคปกติ / ภาคพิเศษ / CyberSec)
   - กรองตามสถานะการประเมิน (ผ่านเกณฑ์ ≥ 650, ต่ำกว่าเกณฑ์ < 650, รอตรวจสอบ)
   - ค้นหาอาจารย์ตามชื่อ-นามสกุลแบบ Real-time
3. **Pop-up ตรวจสอบภาระงานรายบุคคล (Inspection Modal):**
   - แสดงรายละเอียดคะแนนแยก 5 หมวด (Executive Summary) เทียบกับเพดานคะแนนของแต่ละหมวด (900/900/400/300/100 รวมสูงสุด 2,000 คะแนน)
   - แสดงรายละเอียดวิชาสอน, สัดส่วน %, ชั่วโมงสอน, ลิงก์หลักฐาน, ผลงานวิจัย, งานบริหาร และงานบริการวิชาการ
   - ปุ่มดำเนินการ: "อนุมัติแบบฟอร์มภาระงาน" และ "ส่งกลับแก้ไข"
4. **ระบบส่งออกรายงานภาระงาน (CSV Export):**
   - **ดาวน์โหลด CSV รายบุคคล:** ปุ่มดาวน์โหลด `ภาระงานอาจารย์.csv` ใน Modal แสดงสรุปคะแนนและแจกแจงทุกรายการ
   - **ดาวน์โหลด CSV ภาพรวมสาขา:** ปุ่มส่งออกรายงาน CSV สรุปคะแนนของอาจารย์ทุกคนตามตารางตัวกรอง
   - รองรับ encoding UTF-8 with BOM เพื่อให้เปิดใน Microsoft Excel ภาษาไทยได้ทันที

### 🧪 Test Scenarios (ตามเอกสารโจทย์)
- **TC1 (อาจารย์):** ลองค้นหาผลงานและภาระงานของตัวเองจากหลายปีการศึกษา แล้วตรวจว่ารายการครบและถูกต้องหรือไม่
- **TC2 (เจ้าหน้าที่):** สาขาวิชาต้องการสรุปผลงานและภาระงานอาจารย์ประจำปีเพื่อใช้ประกอบการจัดทำรายงานประจำปี รวบรวมข้อมูลของอาจารย์ทุกคน แยกตามประเภทงานและปีการศึกษา พร้อมตรวจสอบความครบถ้วนและยอดสรุป
- **กลุ่มผู้ใช้ทดสอบแนะนำ:** อ.ศาตนาฎ, อ.ประภาพร, พี่จูน, พี่พัช

### ✅ เกณฑ์การตรวจรับงาน (Acceptance Criteria / DoD)
- [ ] แดชบอร์ดแสดงผลคะแนน 5 หมวด และยอดสุทธิ (Max 2,000) ของอาจารย์ทุกคนได้ตรงตามสูตรคำนวณ
- [ ] ตัวกรองปีการศึกษา, โครงการ, สถานะผ่านเกณฑ์ และช่องค้นหาทำงานสัมพันธ์กันถูกต้อง
- [ ] Modal ตรวจสอบสามารถดึงข้อมูลรายการภาระงานของอาจารย์ได้ครบถ้วน ไม่แสดงค่าว่างหรือ Placeholder หลอก
- [ ] เจ้าหน้าที่สามารถกดอนุมัติหรือส่งกลับแก้ไขได้ และสถานะอัปเดตแบบทันที
- [ ] ดาวน์โหลดไฟล์ CSV ทั้งรายบุคคลและรายสาขาได้ถูกต้อง สระภาษาไทยไม่เพี้ยนใน Excel

---

<!-- ========================================================================= -->
## 📋 Issue #5: [V5] Automation, CI/CD & Infrastructure as Code (IaC)
**Title:** `[V5] DevOps: สร้างระบบทดสอบ ติดตั้ง และปรับใช้อัตโนมัติ (Automation & Deployment Pipeline)`  
**Labels:** `v5`, `devops`, `automation`, `ci-cd`, `iac`  
**Assignees:** DevOps / Cloud Engineer  

### 📖 User Story
> ในฐานะ **ทีมพัฒนาและผู้ดูแลระบบ**  
> ฉันต้องการ **กระบวนการ Build, Test และ Deploy ที่ทำงานโดยอัตโนมัติ (CI/CD / Automation)**  
> เพื่อ **ลดการตั้งค่าด้วยมือ (Manual Configuration) ป้องกันความผิดพลาด และทำให้ระบบสามารถสร้างซ้ำได้เสมอ**

### 🎯 Functional Requirements ที่เกี่ยวข้อง
- รองรับการทำงานของทุก Requirements (FR1–FR10) ให้มีความเสถียรและ Deploy ได้อย่างต่อเนื่อง

### 📝 รายละเอียดงาน (Scope of Work)
1. **Continuous Integration (CI Pipeline):**
   - กำหนดค่า GitHub Actions ใน `.github/workflows/ci.yml`
   - ทำงานอัตโนมัติเมื่อมีการ Push หรือเปิด Pull Request เข้าสู่ Branch `main`
   - รัน Automated Tests: Unit Test ของ API, ตรวจสอบกฎการคำนวณภาระงาน (`node tests/workload-scoring.cjs`), ตรวจสอบ Syntax โค้ด
2. **Continuous Deployment (CD Pipeline / Pull-based Deployment):**
   - พัฒนาระบบ Automated Deployment บน AWS EC2 ด้วยสคริปต์ `scripts/deploy_from_github.py`
   - ควบคุมการทำงานผ่าน Systemd Service และ Timer (`frws-deploy.service`, `frws-deploy.timer`)
   - ดึงโค้ดล่าสุดจาก GitHub เฉพาะเมื่อผ่าน CI แล้วเท่านั้น โดยไม่ต้องเปิด Inbound SSH ให้ GitHub หรือเก็บ AWS Access Keys บนคลาวด์ภายนอก
3. **Infrastructure as Code & Configuration Management:**
   - จัดทำสคริปต์สำหรับสร้างและตั้งค่า Environment (Database migration, Dependency installation, Environment variables)
   - จัดทำเอกสารคู่มือการ Deploy และ Recovery ใน `docs/deployment-setup.md`

### 🏗️ สถาปัตยกรรมและเทคนิค (Architecture & Tech Specs)
- **Zero-Secret External Exposure:** EC2 ทำหน้าที่เป็นตัว Polling ออกไปหา GitHub API เอง ไม่ต้องเปิดพอร์ต SSH หรือใช้ OIDC Key ที่เสี่ยงต่อการหลุด
- **Safe Rollback:** เมื่อ Deploy ล้มเหลว ระบบต้องคงสถานะเดิมไว้และบันทึก Log ลงใน System Journal

### ✅ เกณฑ์การตรวจรับงาน (Acceptance Criteria / DoD)
- [ ] เมื่อ Commit โค้ดขึ้น GitHub ระบบ GitHub Actions ต้องรันทดสอบและแสดงสถานะเขียว (Passing)
- [ ] Server บน EC2 อัปเดตและเริ่มบริการใหม่โดยอัตโนมัติเมื่อมีเวอร์ชันใหม่ผ่าน CI
- [ ] ไม่มี Credentials หรือ Secret หลุดเข้าไปใน Git Repository
- [ ] สามารถสร้าง Environment ใหม่อีกเครื่องได้ผ่าน Script โดยไม่ต้องตั้งค่าด้วยมือทีละขั้นตอน

---

<!-- ========================================================================= -->
## 📋 Issue #6: [V6] Critical Path Performance Profiling & Cloud Cost Optimization
**Title:** `[V6] Optimization: วัดผลและปรับปรุงประสิทธิภาพจุดวิกฤต (Critical Path) พร้อมวิเคราะห์ต้นทุนคลาวด์`  
**Labels:** `v6`, `performance`, `cost-optimization`, `benchmarking`, `cloud`  
**Assignees:** System Architect / Backend Developer  

### 📖 User Story
> ในฐานะ **สถาปนิกและผู้ดูแลระบบ**  
> ฉันต้องการ **ระบุจุดคอขวด (Bottleneck) ของการประมวลผล ปรับแต่งประสิทธิภาพในส่วนสำคัญ (Critical Path) และบริหารจัดการต้นทุนคลาวด์**  
> เพื่อ **ให้ระบบตอบสนองได้รวดเร็วแม้มีปริมาณข้อมูลเพิ่มขึ้นหลายปี และใช้ทรัพยากรคลาวด์อย่างคุ้มค่าที่สุด**

### 🎯 Functional Requirements ที่เกี่ยวข้อง
- **FR7, FR8:** ประสิทธิภาพในการรวบรวมและสรุปผลข้อมูลหลายปีการศึกษา
- **FR9, FR10:** ประสิทธิภาพในการสร้างรายงานและการแลกเปลี่ยนข้อมูล

### 📝 รายละเอียดงาน (Scope of Work)
1. **เลือกและระบุ Critical Path ที่สำคัญ:**
   - Critical Path 1: การคำนวณและ Aggregate คะแนนสรุปภาระงาน 5 หมวดข้ามหลายปีของอาจารย์ทั้งสาขา (`/api/workloads/officer/dashboard`)
   - Critical Path 2: การดึงรายละเอียดภาระงานรายบุคคลพร้อมเชื่อมโยงงานวิจัย (`/api/workloads/officer/inspect/{id}`)
2. **การวัดผลและระบุคอขวด (Profiling & Bottleneck Identification):**
   - ใช้วิธีวัด Latency, Throughput และตรวจสอบ Query Execution Plan ด้วย `EXPLAIN ANALYZE`
   - ตรวจหาปัญหา N+1 Query และการเชื่อมต่อฐานข้อมูลที่ไม่จำกัด
3. **การปรับปรุงระบบ (System Optimization):**
   - ใช้ `ThreadedConnectionPool` (psycopg2) จัดการ Connection สูงสุด 20 Connections เพื่อลด Connection Overhead
   - เพิ่ม Database Index บน Foreign Keys และ Column ตัวกรอง เช่น `submission_id`, `professor_id`, `academic_year`, `semester`
   - ปรับ Query รวมข้อมูลในคำสั่ง SQL เดียวเพื่อลดจำนวนเที่ยว Network Round-trip
4. **การบันทึกหลักฐาน Before – After:**
   - บันทึกตารางเปรียบเทียบ Response Time (ms) และ Database Query Time ก่อนและหลังการ Optimize
5. **การวิเคราะห์ผลกระทบด้านต้นทุน (Cost-Benefit & Trade-off Analysis):**
   - ประเมินต้นทุน AWS RDS (db.t4g.micro vs db.t3.micro) และ AWS EC2 (t4g.small)
   - วิเคราะห์ Trade-off ระหว่างการทำ Caching (หน่วยความจำ vs ความสดใหม่ของข้อมูล) และการเก็บรักษาข้อมูลย้อนหลัง

### 🏗️ สถาปัตยกรรมและเทคนิค (Architecture & Tech Specs)
- **Database Optimization:** ใช้ Composite Index และ Aggregation Subquery ในระดับ SQL
- **Resource Sizing:** เลือกประเภท Instance ที่เป็น ARM-based Graviton (เช่น t4g) เพื่อประหยัดต้นทุน 20% เมื่อเทียบกับ x86

### ✅ เกณฑ์การตรวจรับงาน (Acceptance Criteria / DoD)
- [ ] มีเอกสารและผลการทดสอบแสดงเปรียบเทียบประสิทธิภาพ Before – After ของ Critical Path ชัดเจน
- [ ] Response time ของการเปิดหน้า Dashboard และ Modal ลดลงอย่างมีนัยสำคัญ (เป้าหมาย < 500ms)
- [ ] มีตารางแจกแจงค่าใช้จ่าย Cloud รายเดือน พร้อมข้อเสนอแนะในการควบคุมงบประมาณ
- [ ] มีการอธิบาย Trade-off ทางสถาปัตยกรรมที่เลือกใช้อย่างมีหลักการ

---

<!-- ========================================================================= -->
## 📋 Issue #7: [V7] Integrated System & End-to-End Architecture Review
**Title:** `[V7] Architecture: การบูรณาการระบบครบวงจรและทบทวนสถาปัตยกรรมตามมาตรฐาน Well-Architected Framework`  
**Labels:** `v7`, `architecture`, `integration`, `security`, `evaluation`  
**Assignees:** Lead Architect / Project Lead  

### 📖 User Story
> ในฐานะ **หัวหน้าสาขาวิชาและผู้ประเมินระบบ**  
> ฉันต้องการ **ระบบที่ทำงานผสานกันได้อย่างสมบูรณ์แบบตั้งแต่การกรอกข้อมูล การตรวจสอบ การสรุปผล จนถึงการออกรายงาน Workload Sheet พร้อมรายงานการทบทวนสถาปัตยกรรม**  
> เพื่อ **ให้มั่นใจว่าระบบพร้อมสำหรับการนำไปใช้งานจริงในระดับสาขาวิชาอย่างยั่งยืน มั่นคงปลอดภัย และรองรับการขยายตัวในอนาคต**

### 🎯 Functional Requirements ที่เกี่ยวข้อง
- บูรณาการครบทุก Functional Requirements (FR1 – FR10)

### 📝 รายละเอียดงาน (Scope of Work)
1. **การบูรณาการระบบแบบครบวงจร (End-to-End System Integration):**
   - ทดสอบ Flow การทำงานจริงตั้งแต่ต้นน้ำถึงปลายน้ำ:
     - *ต้นน้ำ:* อาจารย์บันทึกข้อมูลการสอน/วิจัย/บริการ -> แนบหลักฐาน -> คะแนนคำนวณอัตโนมัติ
     - *กลางน้ำ:* ยื่นภาระงาน -> เจ้าหน้าที่ตรวจสอบผ่าน Dashboard -> ดูรายละเอียดใน Modal -> ส่งกลับแก้ไข/อนุมัติ
     - *ปลายน้ำ:* สรุปผลคะแนนระดับสาขา -> ดาวน์โหลดร่าง Workload Sheet / CSV -> แสดงผลงานที่ได้รับอนุมัติบนหน้าเว็บสาธารณะ
2. **การทบทวนสถาปัตยกรรมตาม 6 เสาหลัก (Well-Architected Review):**
   - **Security (ความปลอดภัย):** ทบทวนการจัดเก็บรหัสผ่าน, JWT Auth, Least Privilege บน RDS, การป้องกัน SQL Injection ด้วย Parameterized Query
   - **Availability (ความพร้อมใช้งาน):** กลไก Graceful Degradation กรณีต่อ API ภายนอกไม่ได้, Systemd Auto-restart, Health Check Endpoint
   - **Performance (ประสิทธิภาพ):** การใช้ Connection Pool, ดัชนีฐานข้อมูล, การตอบสนองที่ลื่นไหล
   - **Scalability (ความสามารถในการขยายตัว):** โครงสร้างที่พร้อมแยก Web Server และ Database ออกจากกันอย่างอิสระ
   - **Cost (การบริหารต้นทุน):** ความคุ้มค่าของทรัพยากรบน AWS ตามขอบเขตการใช้งานของสาขา
   - **Sustainability & Operational Excellence (การดูแลรักษา):** โค้ดมีโครงสร้างแบบ Modular, มี Automated CI/CD และเอกสารคู่มือครบถ้วน
3. **การประเมิน Constraints & Trade-offs:**
   - สรุปเหตุผลการเลือกใช้เทคโนโลยี (ทำไมเลือก FastAPI แทน Django/Express, ทำไมเลือก PostgreSQL RDS แทน NoSQL)
   - สรุปแนวทางการเชื่อมโยงกับระบบอื่นของมหาวิทยาลัยในอนาคต

### ✅ เกณฑ์การตรวจรับงาน (Acceptance Criteria / DoD)
- [ ] ระบบผ่านการทดสอบ Flow การทำงานแบบบูรณาการครบถ้วนตั้งแต่ V1 ถึง V7 โดยไม่มีข้อผิดพลาด
- [ ] ออกรายงานร่าง Workload Sheet และสรุปข้อมูลประจำปีได้ตรงตามเกณฑ์จริงของสาขาวิชา
- [ ] มีเอกสารสรุปผลการทบทวนสถาปัตยกรรมซอฟต์แวร์และคลาวด์ (Architecture Evaluation Document)
- [ ] โค้ดและ Configuration ทั้งหมดได้รับการบันทึกลงใน Repository อย่างสมบูรณ์พร้อมใช้งานจริง
