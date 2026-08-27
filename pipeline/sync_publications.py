import os
import time
import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
OPENALEX_MAILTO = os.getenv("OPENALEX_MAILTO")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
OPENALEX_API_URL = "https://api.openalex.org/works"


def fetch_all_teachers():
    """ดึงข้อมูลอาจารย์ทั้งหมดข้ามขีดจำกัด 1,000 รายการของ Supabase"""
    all_teachers = []
    page_size = 1000
    start = 0

    while True:
        end = start + page_size - 1
        res = (
            supabase.table("teachers")
            .select("id, first_name_th, last_name_th, first_name_en, last_name_en")
            .order("id")  # จำเป็นต้องใส่ order เพื่อให้ pagination ทำงานถูกต้อง
            .range(start, end)
            .execute()
        )
        
        data = res.data
        if not data:
            break
            
        all_teachers.extend(data)
        if len(data) < page_size:
            break
            
        start += page_size

    return all_teachers


def fetch_openalex_works(author_name):
    """ค้นหา Author ID ก่อน แล้วจึงยิง API ดึงงานวิจัยจาก OpenAlex"""
    headers = {"User-Agent": f"TAPRR-Aggregator/1.0 (mailto:{OPENALEX_MAILTO})"}
    
    try:
        author_api_url = "https://api.openalex.org/authors"
        author_params = {"search": author_name}
        res_author = requests.get(author_api_url, headers=headers, params=author_params, timeout=10)
        
        author_id = None
        if res_author.status_code == 200:
            authors = res_author.json().get("results", [])
            if authors:
                author_id = authors[0].get("id")

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
    print("🚀 เริ่มต้นกระบวนการดึงงานวิจัยจากฐานข้อมูลทั้งหมด...\n")

    # เปลี่ยนมาเรียกใช้ฟังก์ชันดึงรายชื่ออาจารย์ทั้งหมดแบบ Pagination
    teachers = fetch_all_teachers()

    if not teachers:
        print("⚠️ ไม่พบข้อมูลอาจารย์ในฐานข้อมูล Supabase")
        return

    print(f"📋 พบข้อมูลอาจารย์ในระบบทั้งหมด {len(teachers)} ท่าน\n")

    for t in teachers:
        teacher_id = t["id"]
        first_name_en = t.get("first_name_en")
        last_name_en = t.get("last_name_en")
        first_name_th = t.get("first_name_th", "")
        last_name_th = t.get("last_name_th", "")

        if not first_name_en or not last_name_en:
            print(f"⏩ ข้ามอาจารย์ {first_name_th} {last_name_th} (เนื่องจากไม่มีชื่อภาษาอังกฤษในระบบ)")
            continue

        full_name_en = f"{first_name_en.strip()} {last_name_en.strip()}"
        print(f"📌 กำลังจัดการข้อมูลอาจารย์: {first_name_th} {last_name_th} ({full_name_en})")

        works = fetch_openalex_works(full_name_en)
        print(f"  └─ พบงานวิจัยใน OpenAlex จำนวน {len(works)} รายการ")

        saved_count = 0
        for work in works:
            openalex_id = work.get("id", "").split("/")[-1]
            if not openalex_id:
                continue

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

            pub_res = supabase.table("publications").upsert(pub_data, on_conflict="openalex_id").execute()

            if pub_res.data:
                pub_id = pub_res.data[0]["id"]

                author_pos = None
                for authorship in work.get("authorships", []):
                    author_obj = authorship.get("author", {})
                    if full_name_en.lower() in author_obj.get("display_name", "").lower():
                        author_pos = authorship.get("author_position")
                        break

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
        time.sleep(0.3)

    print("🎉 เสร็จสิ้นกระบวนการทั้งหมด!")

if __name__ == "__main__":
    run_pipeline()