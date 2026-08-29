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
OPENALEX_API_KEY = os.getenv("OPENALEX_API_KEY")

# 📌 ปรับเป็น False เพื่อให้ระบบจำ Checkpoint ได้ต่อเนื่อง หากรันใหม่กลางคัน
RESET_CHECKPOINT = False

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
OPENALEX_AUTHORS_URL = "https://api.openalex.org/authors"
OPENALEX_WORKS_URL = "https://api.openalex.org/works"
CHECKPOINT_FILE = "processed_teachers.txt"
BATCH_SIZE = 75


def get_fresh_session():
    s = requests.Session()
    s.proxies = {}
    s.trust_env = False
    return s


def load_processed_teacher_ids():
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
            return set(line.strip() for line in f if line.strip())
    return set()


def save_processed_teacher_id(teacher_id):
    with open(CHECKPOINT_FILE, "a", encoding="utf-8") as f:
        f.write(f"{str(teacher_id)}\n")


def is_english_name(text):
    if not text:
        return False
    return bool(re.search(r'[a-zA-Z]', text))


def fetch_all_teachers():
    all_teachers = []
    page_size = 1000
    start = 0

    while True:
        end = start + page_size - 1
        res = (
            supabase.table("teachers")
            .select("id, first_name_th, last_name_th, first_name_en, last_name_en, openalex_id")
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


def search_author_profiles(session, fn_clean, ln_clean):
    search_queries = [
        f"{fn_clean} {ln_clean}",
        f"{fn_clean} {ln_clean[0]}." if ln_clean else fn_clean,
        fn_clean
    ]

    headers = {"User-Agent": f"TAPRR-Aggregator/1.0 (mailto:{OPENALEX_MAILTO})"}

    for query in search_queries:
        params = {
            "search": query,
            "per_page": 10,
            "mailto": OPENALEX_MAILTO
        }
        if OPENALEX_API_KEY:
            params["api_key"] = OPENALEX_API_KEY

        for attempt in range(3):
            try:
                res = session.get(OPENALEX_AUTHORS_URL, headers=headers, params=params, timeout=12)
                if res.status_code == 200:
                    results = res.json().get("results", [])
                    if results:
                        return results
                    break
                elif res.status_code == 429:
                    time.sleep(5)
                    continue
                else:
                    break
            except Exception:
                time.sleep(2)
                break
                
    return []


def is_tu_affiliated_author(author_obj):
    last_inst = author_obj.get("last_known_institution") or {}
    if "thammasat" in (last_inst.get("display_name") or "").lower():
        return True

    for inst in author_obj.get("last_known_institutions") or []:
        if "thammasat" in (inst.get("display_name") or "").lower():
            return True

    for aff in author_obj.get("affiliations") or []:
        inst = aff.get("institution") or {}
        if "thammasat" in (inst.get("display_name") or "").lower():
            return True

    return False


def is_name_match(author_obj, fn_clean, ln_clean):
    fn_lower = fn_clean.lower()
    ln_lower = ln_clean.lower()
    ln_initial = ln_lower[0] if ln_lower else ""

    names_to_check = [author_obj.get("display_name") or ""]
    names_to_check.extend(author_obj.get("display_name_alternatives") or [])

    for name in names_to_check:
        n_lower = name.lower()
        if fn_lower in n_lower:
            if (ln_lower in n_lower) or (f" {ln_initial}." in n_lower) or (f" {ln_initial} " in n_lower) or n_lower.endswith(f" {ln_initial}"):
                return True
    return False


def fetch_all_works_by_author_id(session, author_id):
    all_works = []
    page = 1
    per_page = 100

    while True:
        params = {
            "filter": f"author.id:{author_id}",
            "per_page": per_page,
            "page": page,
            "mailto": OPENALEX_MAILTO
        }
        if OPENALEX_API_KEY:
            params["api_key"] = OPENALEX_API_KEY

        headers = {"User-Agent": f"TAPRR-Aggregator/1.0 (mailto:{OPENALEX_MAILTO})"}

        try:
            res = session.get(OPENALEX_WORKS_URL, headers=headers, params=params, timeout=12)
            if res.status_code == 200:
                results = res.json().get("results", [])
                if not results:
                    break
                all_works.extend(results)
                if len(results) < per_page:
                    break
                page += 1
            elif res.status_code == 429:
                time.sleep(5)
                continue
            else:
                break
        except Exception as e:
            print(f"  ❌ ดึงงานวิจัยล้มเหลว: {e}")
            break

    return all_works


def run_pipeline():
    if RESET_CHECKPOINT and os.path.exists(CHECKPOINT_FILE):
        os.remove(CHECKPOINT_FILE)
        print("🧹 ทำการล้างไฟล์ประวัติการรันเก่าเรียบร้อยแล้ว\n")

    print("🚀 เริ่มต้นกระบวนการดึงงานวิจัยแบบ Profile-First Search (Bulk Mode)...\n")

    teachers = fetch_all_teachers()
    if not teachers:
        print("⚠️ ไม่พบข้อมูลอาจารย์ในฐานข้อมูล Supabase")
        return

    processed_ids = load_processed_teacher_ids()
    total_teachers = len(teachers)
    total_batches = (total_teachers + BATCH_SIZE - 1) // BATCH_SIZE
    
    print(f"📋 อาจารย์ทั้งหมด: {total_teachers} ท่าน | แบ่งเป็น {total_batches} Batch (กลุ่มละ {BATCH_SIZE} คน)")
    print(f"📌 ดึงเสร็จไปแล้ว: {len(processed_ids)} ท่าน\n")

    total_saved = 0

    for batch_idx in range(0, total_teachers, BATCH_SIZE):
        batch_teachers = teachers[batch_idx : batch_idx + BATCH_SIZE]
        current_batch_num = (batch_idx // BATCH_SIZE) + 1
        start_num = batch_idx + 1
        end_num = min(batch_idx + BATCH_SIZE, total_teachers)

        print(f"============================================================")
        print(f"📦 เริ่มต้น Batch ที่ {current_batch_num}/{total_batches} (อาจารย์คนที่ {start_num} - {end_num})")
        print(f"============================================================\n")

        current_session = get_fresh_session()

        for t in batch_teachers:
            teacher_id = str(t["id"])
            first_name_th = t.get("first_name_th", "")
            last_name_th = t.get("last_name_th", "")

            if teacher_id in processed_ids:
                print(f"⏩ ข้ามอาจารย์ {first_name_th} {last_name_th} (เคยทำเสร็จแล้ว)")
                continue

            first_name_en = t.get("first_name_en") or ""
            last_name_en = t.get("last_name_en") or ""

            if not is_english_name(first_name_en) or not is_english_name(last_name_en):
                print(f"⏩ ข้ามอาจารย์ {first_name_th} {last_name_th} (ชื่อภาษาอังกฤษไม่ถูกต้อง)")
                save_processed_teacher_id(teacher_id)
                continue

            fn_clean = first_name_en.strip()
            ln_clean = last_name_en.strip()
            full_name_en = f"{fn_clean} {ln_clean}"
            print(f"📌 กำลังจัดการข้อมูลอาจารย์: {first_name_th} {last_name_th} ({full_name_en})")

            target_author_id = t.get("openalex_id")

            if target_author_id:
                print(f"  └─ ⚡ พบ OpenAlex ID ในฐานข้อมูลแล้ว: {target_author_id}")
            else:
                author_profiles = search_author_profiles(current_session, fn_clean, ln_clean)
                
                for profile in author_profiles:
                    if is_name_match(profile, fn_clean, ln_clean) and is_tu_affiliated_author(profile):
                        raw_id = profile.get("id", "")
                        if raw_id:
                            target_author_id = raw_id.split("/")[-1]
                        break

                if not target_author_id:
                    print(f"  └─ ⏩ ข้าม: ไม่พบโปรไฟล์นักวิจัยใน OpenAlex ที่ชื่อตรงและระบุสังกัด Thammasat University\n")
                    save_processed_teacher_id(teacher_id)
                    continue

                try:
                    supabase.table("teachers").update({"openalex_id": target_author_id}).eq("id", teacher_id).execute()
                    print(f"  └─ 💾 บันทึก OpenAlex ID ({target_author_id}) ลงตาราง teachers สำเร็จ")
                except Exception as e:
                    print(f"  ⚠️ อัปเดต openalex_id ลงฐานข้อมูลไม่สำเร็จ: {e}")

            works = fetch_all_works_by_author_id(current_session, target_author_id)
            print(f"  └─ 📚 ดึงผลงานวิจัยจากโปรไฟล์ได้ทั้งหมด {len(works)} รายการ")

            if not works:
                save_processed_teacher_id(teacher_id)
                continue

            # 📌 ปรับปรุง: ใช้ seen_ids เพื่อป้องกันรายการวิจัยซ้ำภายในชุดข้อมูลเดียวกัน
            seen_ids = set()
            pubs_to_upsert = []
            links_map = []

            for work in works:
                openalex_id = work.get("id", "").split("/")[-1]
                if not openalex_id or openalex_id in seen_ids:
                    continue
                seen_ids.add(openalex_id)

                author_pos = None
                authors_list = []
                for authorship in work.get("authorships", []):
                    author_obj = authorship.get("author") or {}
                    curr_author_id = author_obj.get("id", "").split("/")[-1] if author_obj.get("id") else ""
                    
                    display_name = author_obj.get("display_name") or authorship.get("raw_author_name") or ""
                    if display_name:
                        authors_list.append(display_name)
                    
                    if curr_author_id == target_author_id:
                        author_pos = authorship.get("author_position")

                authors_str = ", ".join(authors_list) if authors_list else "N/A"
                primary_loc = work.get("primary_location") or {}
                source = primary_loc.get("source") or {}

                pubs_to_upsert.append({
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
                })

                links_map.append({
                    "openalex_id": openalex_id,
                    "author_position": author_pos
                })

            if pubs_to_upsert:
                try:
                    pub_res = supabase.table("publications").upsert(pubs_to_upsert, on_conflict="openalex_id").select("id, openalex_id").execute()
                    
                    oid_to_db_id = {p["openalex_id"]: p["id"] for p in (pub_res.data or [])}

                    links_to_upsert = []
                    for item in links_map:
                        db_pub_id = oid_to_db_id.get(item["openalex_id"])
                        if db_pub_id:
                            links_to_upsert.append({
                                "teacher_id": teacher_id,
                                "publication_id": db_pub_id,
                                "author_position": item["author_position"]
                            })

                    if links_to_upsert:
                        supabase.table("teacher_publications").upsert(
                            links_to_upsert, on_conflict="teacher_id,publication_id"
                        ).execute()

                    print(f"  └─ ✅ บันทึกงานวิจัยแบบ Bulk เข้า Database สำเร็จ {len(pubs_to_upsert)} รายการ\n")
                    total_saved += len(pubs_to_upsert)
                except Exception as e:
                    print(f"  ❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล: {e}\n")

            save_processed_teacher_id(teacher_id)
            time.sleep(0.5)

        current_session.close()

        if current_batch_num < total_batches:
            print(f"☕ จบ Batch ที่ {current_batch_num} -> พักรอ 5 วินาที...\n")
            time.sleep(5)

    print(f"🎉 เสร็จสิ้นกระบวนการทั้งหมด! บันทึกไปรวมทั้งสิ้น {total_saved} รายการ")


if __name__ == "__main__":
    run_pipeline()