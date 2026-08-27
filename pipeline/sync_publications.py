import os
import time
import requests
from dotenv import load_dotenv
from supabase import create_client, Client

# โหลดค่าจากไฟล์ .env เข้าสู่ระบบ
load_dotenv()

# ดึงค่ามาตาม "ชื่อตัวแปร" ที่เราตั้งไว้ในไฟล์ .env
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
OPENALEX_MAILTO = os.getenv("OPENALEX_MAILTO")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
OPENALEX_API_URL = "https://api.openalex.org/works"


TARGET_TEACHERS = [
    {
        "first_name_th": "ประภาพร",
        "last_name_th": "รัตนธำรง",
        "first_name_en": "Prapaporn",
        "last_name_en": "Rattanatamrong",
        "email": "rattanat@tu.ac.th",
        "faculty_th": "คณะวิทยาศาสตร์และเทคโนโลยี",
        "faculty_en": "Faculty of Science and Technology"
    },
    # {
    #     "first_name_th": "ทรงศักดิ์",
    #     "last_name_th": "รองวิริยะพานิช",
    #     "first_name_en": "Songsak",
    #     "last_name_en": "Rongviriyapanich",
    #     "email": "songsak@cs.tu.ac.th"
    # }
]

def fetch_openalex_works(author_name):
    """ค้นหา Author ID ก่อน แล้วจึงยิง API ดึงงานวิจัยจาก OpenAlex"""
    headers = {"User-Agent": f"TAPRR-Aggregator/1.0 (mailto:{OPENALEX_MAILTO})"}
    
    try:
        # 1. ค้นหา Author ID
        author_api_url = "https://api.openalex.org/authors"
        author_params = {"search": author_name}
        res_author = requests.get(author_api_url, headers=headers, params=author_params, timeout=10)
        
        author_id = None
        if res_author.status_code == 200:
            authors = res_author.json().get("results", [])
            if authors:
                # ดึง OpenAlex Author ID รายการแรกที่ตรงที่สุด (เช่น A5012345678)
                author_id = authors[0].get("id")

        # 2. ดึงงานวิจัยโดยใช้ Author ID หรือสลับไปใช้ raw_author_name หากหา ID ไม่พบ
        if author_id:
            works_params = {"filter": f"author.id:{author_id}", "per_page": 20}
        else:
            works_params = {"filter": f"raw_author_name.search:{author_name}", "per_page": 20}

        res_works = requests.get(OPENALEX_API_URL, headers=headers, params=works_params, timeout=10)
        if res_works.status_code == 200:
            return res_works.json().get("results", [])

    except Exception as e:
        print(f"❌ ดึงข้อมูล OpenAlex ล้มเหลว ({author_name}): {e}")
    
    return []

def run_pipeline():
    print("🚀 เริ่มต้นกระบวนการดึงงานวิจัย...\n")

    for t in TARGET_TEACHERS:
        full_name_en = f"{t['first_name_en']} {t['last_name_en']}"
        print(f"📌 กำลังจัดการข้อมูลอาจารย์: {t['first_name_th']} {t['last_name_th']} ({full_name_en})")

        # 1. บันทึก/อัปเดตข้อมูลอาจารย์ลงตาราง teachers บน Supabase เพื่อเอา ID
        t_res = supabase.table("teachers").upsert(t, on_conflict="email").execute()
        if not t_res.data:
            print(f"⚠️ ไม่สามารถสร้าง/ดึงข้อมูลอาจารย์ {full_name_en} ได้")
            continue
        
        teacher_id = t_res.data[0]["id"]

        # 2. ยิง OpenAlex API ดึงงานวิจัยตามชื่อภาษาอังกฤษ
        works = fetch_openalex_works(full_name_en)
        print(f"  └─ พบงานวิจัยใน OpenAlex จำนวน {len(works)} รายการ")

        # 3. บันทึกผลงานวิจัยลง Supabase
        saved_count = 0
        for work in works:
            openalex_id = work.get("id", "").split("/")[-1]
            if not openalex_id:
                continue

                # 📌 เพิ่มจุดนี้: รวบรวมรายชื่อผู้แต่งทุกคนเป็น Text (เช่น "Author A, Author B")
            authors_list = []
            for authorship in work.get("authorships", []):
                name = authorship.get("author", {}).get("display_name")
                if name:
                    authors_list.append(name)
            authors_str = ", ".join(authors_list) if authors_list else "N/A"

            primary_loc = work.get("primary_location") or {}
            source = primary_loc.get("source") or {}


            pub_data = {
                "openalex_id": openalex_id,
                "title": work.get("title") or "Untitled",
                "authors": authors_str,
                "publication_year": work.get("publication_year"),
                "publication_date": work.get("publication_date"),
                "work_type": work.get("type"),
                "doi": work.get("doi"),
                "official_url": primary_loc.get("landing_page_url") or work.get("doi"),
                "source_name": source.get("display_name"),
                "citation_count": work.get("cited_by_count", 0),
                "raw_data": work
            }

            # บันทึกลงตาราง publications
            pub_res = supabase.table("publications").upsert(pub_data, on_conflict="openalex_id").execute()

            if pub_res.data:
                pub_id = pub_res.data[0]["id"]

                # หาตำแหน่งชื่อผู้เขียน (Author Position)
                author_pos = None
                for authorship in work.get("authorships", []):
                    author_obj = authorship.get("author", {})
                    if full_name_en.lower() in author_obj.get("display_name", "").lower():
                        author_pos = authorship.get("author_position")
                        break

                # จับคู่ความสัมพันธ์อาจารย์กับงานวิจัยใน teacher_publications
                link_data = {
                    "teacher_id": teacher_id,
                    "publication_id": pub_id,
                    "author_position": author_pos
                }
                supabase.table("teacher_publications").upsert(
                    link_data, on_conflict="teacher_id,publication_id"
                ).execute()
                saved_count += 1

        print(f"  └─ ✅ บันทึกลง Supabase สำเร็จ {saved_count} รายการ\n")
        time.sleep(0.3)  # หน่วงเวลาสั้นๆ รักษามารยาท API

    print("🎉 เสร็จสิ้นกระบวนการทั้งหมด!")

if __name__ == "__main__":
    run_pipeline()
