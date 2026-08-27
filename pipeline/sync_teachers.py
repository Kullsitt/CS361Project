import os
import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
TU_API_KEY = os.getenv("TU_API_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
TU_INSTRUCTORS_API = "https://restapi.tu.ac.th/api/v2/profile/Instructors/info/"

# รายชื่อคณะและหน่วยงานทั้งหมดในธรรมศาสตร์
TARGET_FACULTIES = [
    "คณะวิทยาศาสตร์และเทคโนโลยี",
    "คณะวิศวกรรมศาสตร์",
    "คณะแพทยศาสตร์",
    "คณะพยาบาลศาสตร์",
    "คณะสหเวชศาสตร์",
    "คณะทันตแพทยศาสตร์",
    "คณะเภสัชศาสตร์",
    "คณะสาธารณสุขศาสตร์",
    "คณะนิติศาสตร์",
    "คณะพาณิชยศาสตร์และการบัญชี",
    "คณะรัฐศาสตร์",
    "คณะเศรษฐศาสตร์",
    "คณะสังคมสงเคราะห์ศาสตร์",
    "คณะศิลปศาสตร์",
    "คณะวารสารศาสตร์และสื่อสารมวลชน",
    "คณะสังคมวิทยาและมานุษยวิทยา",
    "คณะสถาปัตยกรรมศาสตร์และการผังเมือง",
    "คณะศิลปกรรมศาสตร์",
    "คณะวิทยาการเรียนรู้และศึกษาศาสตร์",
    "วิทยาลัยสหวิทยาการ",
    "วิทยาลัยนวัตกรรม",
    "วิทยาลัยป๋วย อึ๊งภากรณ์",
    "วิทยาลัยนานาชาติปรีดี พนมยงค์",
    "สถาบันเทคโนโลยีนานาชาติสิรินธร"
]

def fetch_instructors_by_faculty(faculty_name):
    """ยิง TU REST API ดึงข้อมูลอาจารย์ตามชื่อคณะ"""
    headers = {
        "Content-Type": "application/json",
        "Application-Key": TU_API_KEY
    }
    params = {
        "Faculty_Name_Th": faculty_name
    }

    try:
        response = requests.get(TU_INSTRUCTORS_API, headers=headers, params=params, timeout=15)
        if response.status_code == 200:
            res_json = response.json()
            if isinstance(res_json, dict):
                return res_json.get("data", res_json.get("results", []))
            elif isinstance(res_json, list):
                return res_json
        else:
            # กรณีที่ไม่พบข้อมูลในคณะนั้น API อาจตอบกลับมาสถานะอื่น ให้ข้ามไป
            pass
    except Exception as e:
        print(f"  └─ ⚠️ เกิดข้อผิดพลาดของ {faculty_name}: {e}")
    
    return []

def run_teacher_pipeline():
    print("🚀 เริ่มต้นกระบวนการดึงข้อมูลอาจารย์ทุกคณะจาก TU API...\n")
    
    if not TU_API_KEY:
        print("❌ ไม่พบ TU_API_KEY ในไฟล์ .env กรุณาตรวจสอบก่อนรัน")
        return

    total_saved = 0

    for faculty in TARGET_FACULTIES:
        print(f"📌 กำลังดึงรายชื่ออาจารย์สังกัด: {faculty}")
        instructors = fetch_instructors_by_faculty(faculty)
        print(f"  └─ พบอาจารย์จำนวน {len(instructors)} ท่าน")

        for item in instructors:
            email = item.get("Email") or item.get("email")
            if not email:
                continue

            teacher_data = {
                "first_name_th": item.get("First_Name_Th") or item.get("first_name_th"),
                "last_name_th": item.get("Last_Name_Th") or item.get("last_name_th"),
                "first_name_en": item.get("First_Name_En") or item.get("first_name_en"),
                "last_name_en": item.get("Last_Name_En") or item.get("last_name_en"),
                "email": email.strip().lower(),
                "faculty_th": item.get("Faculty_Name_Th") or faculty,
                "faculty_en": item.get("Faculty_Name_En")
            }

            try:
                res = supabase.table("teachers").upsert(teacher_data, on_conflict="email").execute()
                if res.data:
                    total_saved += 1
            except Exception:
                pass

    print(f"\n🎉 บันทึกข้อมูลอาจารย์ทุกคณะลง Supabase สำเร็จรวมทั้งหมด {total_saved} ท่าน!")

if __name__ == "__main__":
    run_teacher_pipeline()