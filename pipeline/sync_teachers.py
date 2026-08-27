import os
import requests
from dotenv import load_dotenv
from supabase import create_client, Client

# โหลดค่าจากไฟล์ .env
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
TU_API_KEY = os.getenv("TU_API_KEY")

# สร้าง Supabase Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
TU_INSTRUCTORS_API = "https://restapi.tu.ac.th/api/v2/profile/Instructors/info/"

def fetch_all_instructors():
    """ยิง TU REST API ดึงข้อมูลอาจารย์ทั้งหมดทุกคณะโดยไม่จำกัด Filter"""
    headers = {
        "Content-Type": "application/json",
        "Application-Key": TU_API_KEY
    }
    
    try:
        # ไม่ใส่ params เพื่อดึงข้อมูลอาจารย์ทั้งหมดในระบบ
        response = requests.get(TU_INSTRUCTORS_API, headers=headers, timeout=30)
        
        if response.status_code == 200:
            res_json = response.json()
            # รองรับโครงสร้างข้อมูลที่ส่งกลับมาทั้งแบบ dict และ list
            if isinstance(res_json, dict):
                return res_json.get("data", res_json.get("results", []))
            elif isinstance(res_json, list):
                return res_json
        else:
            print(f"❌ TU API Error [{response.status_code}]: {response.text}")
    except Exception as e:
        print(f"❌ เกิดข้อผิดพลาดขณะเรียก TU API: {e}")
    
    return []

def run_teacher_pipeline():
    print("🚀 เริ่มต้นกระบวนการดึงข้อมูลอาจารย์ทุกคณะจาก TU API...\n")
    
    if not TU_API_KEY:
        print("❌ ไม่พบ TU_API_KEY ในไฟล์ .env กรุณาตรวจสอบก่อนรัน")
        return

    instructors = fetch_all_instructors()
    print(f"📌 ดึงข้อมูลจาก TU API สำเร็จ พบอาจารย์ทั้งหมด {len(instructors)} ท่าน\n")

    if not instructors:
        print("⚠️ ไม่พบข้อมูลอาจารย์จาก API กรุณาตรวจสอบ TU_API_KEY หรือการเชื่อมต่อ")
        return

    total_saved = 0

    for item in instructors:
        # ดึงข้อมูลและรองรับทั้งรูปแบบตัวพิมพ์เล็ก/ใหญ่จาก API Response
        email = item.get("Email") or item.get("email")
        
        # กรองรายการที่ไม่มีอีเมลออก เพื่อป้องกัน Error บน Supabase (เนื่องจากใช้ email เป็น Key ในการ Upsert)
        if not email:
            continue

        teacher_data = {
            "first_name_th": item.get("First_Name_Th") or item.get("first_name_th"),
            "last_name_th": item.get("Last_Name_Th") or item.get("last_name_th"),
            "first_name_en": item.get("First_Name_En") or item.get("first_name_en"),
            "last_name_en": item.get("Last_Name_En") or item.get("last_name_en"),
            "email": email.strip().lower(),
            "faculty_th": item.get("Faculty_Name_Th") or item.get("faculty_name_th"),
            "faculty_en": item.get("Faculty_Name_En") or item.get("faculty_name_en")
        }

        try:
            # บันทึกลงตาราง teachers (ถ้ามีอีเมลนี้แล้วจะ Update ข้อมูลให้อัตโนมัติ)
            res = supabase.table("teachers").upsert(teacher_data, on_conflict="email").execute()
            if res.data:
                total_saved += 1
        except Exception as e:
            print(f"⚠️ ไม่สามารถบันทึกข้อมูลอาจารย์ {teacher_data.get('first_name_th')}: {e}")

    print(f"🎉 บันทึกข้อมูลอาจารย์ทุกคณะลง Supabase สำเร็จทั้งหมด {total_saved} ท่าน!")

if __name__ == "__main__":
    run_teacher_pipeline()