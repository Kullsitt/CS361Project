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

RESET_CHECKPOINT = False  # SET processed_teachers.txt ที่เก็บ uuid อาจารย์ที่ดึงข้อมูลแล้ว (True = ล้างไฟล์เก่า, False = ต่อจากเดิม)

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


def safe_openalex_get(session, url, params):
    headers = {"User-Agent": f"TAPRR-Aggregator/1.0 (mailto:{OPENALEX_MAILTO})"}
    wait_time = 5

    while True:
        try:
            res = session.get(url, headers=headers, params=params, timeout=15)

            if res.status_code in (429, 420):
                retry_after = res.headers.get("Retry-After")
                if retry_after and retry_after.isdigit():
                    sleep_sec = int(retry_after)
                else:
                    sleep_sec = wait_time

                print(f"  ⏳ ติด Rate Limit (HTTP {res.status_code})! พักรอ {sleep_sec} วินาทีก่อนลองใหม่...")
                time.sleep(sleep_sec)
                wait_time = min(wait_time + 5, 60)
                continue

            if res.status_code == 200:
                return res.json()

            if res.status_code >= 500:
                print(f"  ⚠️ OpenAlex Server Error (HTTP {res.status_code}) พักรอ 5 วินาที...")
                time.sleep(5)
                continue

            print(f"  ⚠️ OpenAlex ตอบกลับ HTTP Status: {res.status_code}")
            return None

        except Exception as e:
            print(f"  ⚠️ เกิดข้อผิดพลาด Network: {e} พักรอ 3 วินาที...")
            time.sleep(3)


def search_author_profiles(session, fn_clean, ln_clean):
    search_queries = [
        f"{fn_clean} {ln_clean}",
        f"{fn_clean} {ln_clean[0]}." if ln_clean else fn_clean,
        fn_clean
    ]

    for query in search_queries:
        params = {
            "search": query,
            "per_page": 10,
            "mailto": OPENALEX_MAILTO
        }
        if OPENALEX_API_KEY:
            params["api_key"] = OPENALEX_API_KEY

        data = safe_openalex_get(session, OPENALEX_AUTHORS_URL, params)
        if data and "results" in data:
            results = data.get("results", [])
            if results:
                return results

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

        data = safe_openalex_get(session, OPENALEX_WORKS_URL, params)
        if not data or "results" not in data:
            break

        results = data.get("results", [])
        if not results:
            break

        all_works.extend(results)
        if len(results) < per_page:
            break
        page += 1

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

    # 📌 สร้าง Map เก็บ openalex_id -> teacher_id ของอาจารย์ทุกคนเพื่อรองรับ Smart Cross-Linking
    openalex_to_teacher_map = {}
    for t in teachers:
        if t.get("openalex_id"):
            openalex_to_teacher_map[str(t["openalex_id"])] = str(t["id"])

    processed_ids = load_processed_teacher_ids()
    total_teachers = len(teachers)
    total_batches = (total_teachers + BATCH_SIZE - 1) // BATCH_SIZE
    
    print(f"📋 อาจารย์ทั้งหมด: {total_teachers} ท่าน | แบ่งเป็น {total_batches} Batch (กลุ่มละ {BATCH_SIZE} คน)")
    print(f"📌 ดึงเสร็จไปแล้ว: {len(processed_ids)} ท่าน\n")

    total_saved = 0

    TARGET_BATCH = 42  # ตั้ง batch เริ่มต้น

    start_idx = (TARGET_BATCH - 1) * BATCH_SIZE

    for batch_idx in range(start_idx, total_teachers, BATCH_SIZE):
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
                    openalex_to_teacher_map[str(target_author_id)] = str(teacher_id)  # อัปเดต Map ทันทีที่เจอ ID ใหม่
                    print(f"  └─ 💾 บันทึก OpenAlex ID ({target_author_id}) ลงตาราง teachers สำเร็จ")
                except Exception as e:
                    print(f"  ⚠️ อัปเดต openalex_id ลงฐานข้อมูลไม่สำเร็จ: {e}")

            works = fetch_all_works_by_author_id(current_session, target_author_id)
            print(f"  └─ 📚 ดึงผลงานวิจัยจากโปรไฟล์ได้ทั้งหมด {len(works)} รายการ")

            if not works:
                save_processed_teacher_id(teacher_id)
                continue

            seen_ids = set()
            pubs_to_upsert = []
            links_map = []

            for work in works:
                openalex_id = work.get("id", "").split("/")[-1]
                if not openalex_id or openalex_id in seen_ids:
                    continue
                seen_ids.add(openalex_id)

                authors_list = []
                matched_teachers_in_work = []

                for authorship in work.get("authorships", []):
                    author_obj = authorship.get("author") or {}
                    curr_author_id = author_obj.get("id", "").split("/")[-1] if author_obj.get("id") else ""
                    
                    display_name = author_obj.get("display_name") or authorship.get("raw_author_name") or ""
                    if display_name:
                        authors_list.append(display_name)
                    
                    # 💡 Smart Cross-Linking: เช็กว่าผู้แต่งคนนี้ตรงกับอาจารย์ท่านใดในฐานข้อมูลเราบ้าง (ผูกหมดทั้ง A และ B)
                    if curr_author_id in openalex_to_teacher_map:
                        matched_teachers_in_work.append({
                            "teacher_id": openalex_to_teacher_map[curr_author_id],
                            "author_position": authorship.get("author_position")
                        })

                # รับประกันว่าอาจารย์ปัจจุบันจะถูกผูกเข้ากับงานวิจัยเสมอ
                if not any(m["teacher_id"] == teacher_id for m in matched_teachers_in_work):
                    matched_teachers_in_work.append({
                        "teacher_id": teacher_id,
                        "author_position": None
                    })

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

                for m in matched_teachers_in_work:
                    links_map.append({
                        "teacher_id": m["teacher_id"],
                        "openalex_id": openalex_id,
                        "author_position": m["author_position"]
                    })

            if pubs_to_upsert:
                try:
                    # 1. Deduplication ลบรายการซ้ำใน Memory ก่อนส่ง
                    unique_pubs_dict = {p["openalex_id"]: p for p in pubs_to_upsert}
                    pubs_to_upsert = list(unique_pubs_dict.values())

                    # จัดกลุ่ม links ตาม openalex_id เพื่อดึงใช้ตาม chunk ได้เร็วขึ้น
                    links_by_oid = {}
                    for item in links_map:
                        oid = item["openalex_id"]
                        if oid not in links_by_oid:
                            links_by_oid[oid] = []
                        links_by_oid[oid].append(item)

                    # 2. ลด CHUNK_SIZE เหลือ 10 รายการ ป้องกัน Statement Timeout (57014) สำหรับอาจารย์ที่มีผลงานเยอะ
                    CHUNK_SIZE = 10
                    total_saved_teacher = 0

                    print(f"  └─ 🔄 กำลังบันทึกผลงาน {len(pubs_to_upsert)} รายการ (แบ่งส่งทีละ {CHUNK_SIZE} รายการ)...")

                    for i in range(0, len(pubs_to_upsert), CHUNK_SIZE):
                        pub_chunk = pubs_to_upsert[i : i + CHUNK_SIZE]

                        # Upsert ตาราง publications ทีละ 10 รายการ
                        pub_res = (
                            supabase.table("publications")
                            .upsert(pub_chunk, on_conflict="openalex_id")
                            .select("id, openalex_id")
                            .execute()
                        )

                        oid_to_db_id = {p["openalex_id"]: p["id"] for p in (pub_res.data or [])}

                        # ดึงเฉพาะ links ความสัมพันธ์ของ chunk นี้มา upsert
                        links_to_upsert = []
                        for p_item in pub_chunk:
                            oid = p_item["openalex_id"]
                            db_pub_id = oid_to_db_id.get(oid)
                            if db_pub_id and oid in links_by_oid:
                                for l_item in links_by_oid[oid]:
                                    links_to_upsert.append({
                                        "teacher_id": l_item["teacher_id"],
                                        "publication_id": db_pub_id,
                                        "author_position": l_item["author_position"]
                                    })

                        if links_to_upsert:
                            unique_links = {(l["teacher_id"], l["publication_id"]): l for l in links_to_upsert}
                            supabase.table("teacher_publications").upsert(
                                list(unique_links.values()), on_conflict="teacher_id,publication_id"
                            ).execute()

                        total_saved_teacher += len(pub_chunk)
                        time.sleep(0.2)  # พัก 0.2 วินาทีให้ Database ระบายคิว ไม่ให้ CPU พีคเกินไป

                    print(f"  └─ ✅ บันทึกและผูกสัมพันธ์สำเร็จทั้งหมด {total_saved_teacher} รายการ\n")
                    total_saved += total_saved_teacher

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