import os
import re
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


def clean_name_str(name_str):
    """ฟังก์ชันทำความสะอาดชื่อเพื่อนำไปเทียบแมตช์"""
    if not name_str:
        return ""
    # ตัดคำนำหน้าทางวิชาการและอักขระพิเศษ
    cleaned = re.sub(r'^(assoc\.?|asst\.?|prof\.?|dr\.?|mr\.?|mrs\.?|ms\.?)\s+', '', name_str.strip(), flags=re.IGNORECASE)
    return re.sub(r'[^a-zA-Z0-9]', '', cleaned).lower()


def fetch_all_teachers():
    """ดึงข้อมูลอาจารย์ทั้งหมดจาก Supabase"""
    all_teachers = []
    page_size = 1000
    start = 0

    while True:
        end = start + page_size - 1
        res = (
            supabase.table("teachers")
            .select("id, first_name_th, last_name_th, first_name_en, last_name_en")
            .order("id")
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


def build_teacher_lookup(teachers):
    """สร้างตาราง Lookup สำหรับตรวจจับ Co-authors ทุกรูปแบบชื่อ"""
    lookup = []
    for t in teachers:
        fn = t.get("first_name_en") or ""
        ln = t.get("last_name_en") or ""
        full = f"{fn} {ln}".strip()
        
        lookup.append({
            "id": t["id"],
            "first_clean": clean_name_str(fn),
            "last_clean": clean_name_str(ln),
            "full_clean": clean_name_str(full),
            "first_init": clean_name_str(fn[:1]) if fn else "",
            "last_init": clean_name_str(ln[:1]) if ln else ""
        })
    return lookup


def match_teacher_id(raw_author_name, lookup_list):
    """เทียบชื่อผู้แต่งจากงานวิจัยว่าตรงกับอาจารย์ท่านไหนใน มธ."""
    if not raw_author_name or not lookup_list:
        return None

    raw_clean = clean_name_str(raw_author_name)
    parts = raw_author_name.strip().split()
    first_part = clean_name_str(parts[0]) if len(parts) > 0 else ""
    last_part = clean_name_str(parts[-1]) if len(parts) > 1 else ""

    for t in lookup_list:
        # 1. แมตช์ชื่อเต็มตรงกัน
        if t["full_clean"] and (t["full_clean"] == raw_clean or t["full_clean"] in raw_clean or raw_clean in t["full_clean"]):
            return t["id"]

        # 2. แมตช์แบบชื่อย่อ (เช่น P. Rattanatamrong หรือ Prapaporn R.)
        if first_part and last_part:
            if t["first_clean"] == first_part and (last_part.startswith(t["last_init"]) or t["last_clean"].startswith(last_part)):
                return t["id"]
            if t["last_clean"] == last_part and (first_part.startswith(t["first_init"]) or t["first_clean"].startswith(first_part)):
                return t["id"]

    return None


def fetch_openalex_works(author_name):
    """ค้นหาผลงานวิจัยจาก OpenAlex"""
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
            works_params = {"filter": f"author.id:{author_id}", "per_page": 50}
        else:
            works_params = {"filter": f"raw_author_name.search:{author_name}", "per_page": 50}

        res_works = requests.get(OPENALEX_API_URL, headers=headers, params=works_params, timeout=10)
        if res_works.status_code == 200:
            return res_works.json().get("results", [])

    except Exception as e:
        print(f"❌ ดึงข้อมูล OpenAlex ล้มเหลว ({author_name}): {e}")
    
    return []


def run_pipeline():
    print("🚀 เริ่มต้นกระบวนการดึงงานวิจัยและผูกความสัมพันธ์อาจารย์ทั้งหมด...\n")

    teachers = fetch_all_teachers()
    if not teachers:
        print("⚠️ ไม่พบข้อมูลอาจารย์ในฐานข้อมูล Supabase")
        return

    print(f"📋 พบข้อมูลอาจารย์ในระบบทั้งหมด {len(teachers)} ท่าน")
    lookup_list = build_teacher_lookup(teachers)

    total_works_saved = 0

    for t in teachers:
        first_name_en = t.get("first_name_en")
        last_name_en = t.get("last_name_en")
        first_name_th = t.get("first_name_th", "")
        last_name_th = t.get("last_name_th", "")

        if not first_name_en or not last_name_en:
            print(f"⏩ ข้ามอาจารย์ {first_name_th} {last_name_th} (ไม่มีชื่อภาษาอังกฤษ)")
            continue

        full_name_en = f"{first_name_en.strip()} {last_name_en.strip()}"
        print(f"📌 กำลังประมวลผล: {first_name_th} {last_name_th} ({full_name_en})")

        works = fetch_openalex_works(full_name_en)
        print(f"  └─ พบงานวิจัยใน OpenAlex จำนวน {len(works)} รายการ")

        for work in works:
            openalex_id = work.get("id", "").split("/")[-1]
            if not openalex_id:
                continue

            authorships = work.get("authorships", [])
            authors_list = []
            for authorship in authorships:
                name = authorship.get("author", {}).get("display_name") or authorship.get("raw_author_name")
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

                # วนลูป Co-authors ทุกคนเพื่อผูกอาจารย์ทั้งหมดที่อยู่ในเปเปอร์นี้
                for authorship in authorships:
                    author_name = authorship.get("author", {}).get("display_name") or authorship.get("raw_author_name")
                    matched_id = match_teacher_id(author_name, lookup_list)

                    if matched_id:
                        link_data = {
                            "teacher_id": matched_id,
                            "publication_id": pub_id,
                            "author_position": authorship.get("author_position")
                        }
                        supabase.table("teacher_publications").upsert(
                            link_data, on_conflict="teacher_id,publication_id"
                        ).execute()

                total_works_saved += 1

        time.sleep(0.2)

    print(f"\n🎉 ซิงก์เสร็จสิ้นเรียบร้อย! อัปเดตงานวิจัยไปทั้งหมด {total_works_saved} รายการ")


if __name__ == "__main__":
    run_pipeline()