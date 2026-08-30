const SUPABASE_URL = "https://svijmtiaeormkmdtmbud.supabase.co";
const SUPABASE_KEY = "sb_publishable_e6LgiJKOQeA6VXi5Ng_JGg_Q8aKNDLD";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const urlParams = new URLSearchParams(window.location.search);
const teacherId = urlParams.get('id');

let teacherLookupList = [];

// ฟังก์ชันทำความสะอาดข้อความ รองรับภาษาไทยและอังกฤษสมบูรณ์
function cleanStr(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .replace(/^(assoc\.?\s*prof\.?|asst\.?\s*prof\.?|prof\.?|dr\.?|mr\.?|mrs\.?|ms\.?|ศ\.?|รศ\.?|ผศ\.?|ดร\.?|อาจารย์|นาย|นาง|นางสาว)\s+/i, '')
    .replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');
}

// โหลดข้อมูลอาจารย์ทั้งหมดแบบทะลุ Limit 1000
async function loadTeacherMap() {
  if (teacherLookupList.length > 0) return;
  try {
    let allRecords = [];
    let start = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseClient
        .from('teachers')
        .select('*')
        .range(start, start + batchSize - 1);

      if (error || !data || data.length === 0) {
        hasMore = false;
      } else {
        allRecords = allRecords.concat(data);
        start += batchSize;
        if (data.length < batchSize) hasMore = false;
      }
    }

    if (allRecords.length > 0) {
      teacherLookupList = allRecords.map(t => {
        const fnEn = (t.first_name_en || '').trim();
        const lnEn = (t.last_name_en || '').trim();
        const fnTh = (t.first_name_th || '').trim();
        const lnTh = (t.last_name_th || '').trim();
        const rawFullEn = `${fnEn} ${lnEn}`.trim();
        const rawFullTh = `${fnTh} ${lnTh}`.trim();

        return {
          id: t.id,
          firstCleanEn: cleanStr(fnEn),
          lastCleanEn: cleanStr(lnEn),
          fullCleanEn: cleanStr(rawFullEn),
          firstCleanTh: cleanStr(fnTh),
          lastCleanTh: cleanStr(lnTh),
          fullCleanTh: cleanStr(rawFullTh),
          rawFull: rawFullEn || rawFullTh || t.name || ''
        };
      });
    }
  } catch (e) {
    console.error("Failed to load teacher map", e);
  }
}

// อัลกอริทึมค้นหาแบบ Token-Based และ Partial Match
function findTeacherMatch(rawName) {
  if (!rawName || teacherLookupList.length === 0) return null;

  const rawClean = cleanStr(rawName);
  if (!rawClean) return null;

  // 1. เช็กความตรงกันของชื่อเต็ม
  for (const t of teacherLookupList) {
    if (t.fullCleanEn && (t.fullCleanEn === rawClean || rawClean.includes(t.fullCleanEn) || t.fullCleanEn.includes(rawClean))) return t;
    if (t.fullCleanTh && (t.fullCleanTh === rawClean || rawClean.includes(t.fullCleanTh) || t.fullCleanTh.includes(rawClean))) return t;
  }

  // 2. แยกพยางค์/คำ (ตัดช่องว่าง, จุลภาค, จุด, ขีด)
  const rawParts = rawName
    .replace(/^(assoc\.?\s*prof\.?|asst\.?\s*prof\.?|prof\.?|dr\.?|mr\.?|mrs\.?|ms\.?|ศ\.?|รศ\.?|ผศ\.?|ดร\.?|อาจารย์|นาย|นาง|นางสาว)\s+/i, '')
    .split(/[\s,.\-_/]+/)
    .map(cleanStr)
    .filter(p => p.length > 0);

  if (rawParts.length < 2) return null;

  for (const t of teacherLookupList) {
    // ตรวจสอบชื่อภาษาอังกฤษ
    if (t.firstCleanEn && t.lastCleanEn) {
      const fn = t.firstCleanEn;
      const ln = t.lastCleanEn;
      const fnInit = fn.charAt(0);
      const lnInit = ln.charAt(0);

      for (let i = 0; i < rawParts.length; i++) {
        for (let j = 0; j < rawParts.length; j++) {
          if (i === j) continue;
          const p1 = rawParts[i];
          const p2 = rawParts[j];

          if ((p1 === fn || fn.startsWith(p1) || p1.startsWith(fn)) && (p2 === ln || ln.startsWith(p2) || p2.startsWith(ln))) return t;
          if ((p1 === fn || fn.startsWith(p1)) && (p2 === lnInit || ln.startsWith(p2))) return t;
          if ((p1 === ln || ln.startsWith(p1)) && (p2 === fnInit || fn.startsWith(p2))) return t;
        }
      }
    }

    // ตรวจสอบชื่อภาษาไทย
    if (t.firstCleanTh && t.lastCleanTh) {
      const fnTh = t.firstCleanTh;
      const lnTh = t.lastCleanTh;
      const hasFn = rawParts.some(p => p === fnTh || fnTh.startsWith(p) || p.startsWith(fnTh));
      const hasLn = rawParts.some(p => p === lnTh || lnTh.startsWith(p) || p.startsWith(lnTh));
      if (hasFn && hasLn) return t;
    }
  }

  return null;
}

function formatShortName(fullName) {
  if (!fullName) return "";
  const cleaned = fullName.trim().replace(/^(assoc\.?\s*prof\.?|asst\.?\s*prof\.?|prof\.?|dr\.?|mr\.?|mrs\.?|ms\.?|ศ\.?|รศ\.?|ผศ\.?|ดร\.?|อาจารย์|นาย|นาง|นางสาว)\s+/i, '');
  const parts = cleaned.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  return `${firstName} ${lastName.charAt(0).toUpperCase()}.`;
}

function renderAuthorBadge(rawName) {
  const shortName = formatShortName(rawName);
  const matchedTeacher = findTeacherMatch(rawName);

  if (matchedTeacher) {
    return `<a href="teacher.html?id=${matchedTeacher.id}" title="${rawName} (อาจารย์ มธ. - คลิกดูผลงาน)" class="author-item" style="text-decoration: underline; text-decoration-color: #800000; text-underline-offset: 3px; color: #1a1a1a; font-weight: 600; cursor: pointer;"><i class="fa fa-user-circle" style="color: #800000;"></i>${shortName}</a>`;
  }
  return `<span title="${rawName}" class="author-item" style="cursor: default; color: #555;"><i class="fa fa-user-circle-o" style="color: #888;"></i>${shortName}</span>`;
}

function formatAuthors(rawAuthors, pubId) {
  if (!rawAuthors || rawAuthors === "N/A") {
    return '<div class="authors-container"><span class="author-item"><i class="fa fa-user-circle-o"></i> Unknown Author</span></div>';
  }

  let authorArray = [];
  if (Array.isArray(rawAuthors)) {
    authorArray = rawAuthors;
  } else if (typeof rawAuthors === 'string') {
    authorArray = rawAuthors.split(/[,;]/).map(name => name.trim()).filter(Boolean);
  }

  if (authorArray.length <= 5) {
    return `<div class="authors-container">${authorArray.map(renderAuthorBadge).join('')}</div>`;
  }

  const visible = authorArray.slice(0, 5).map(renderAuthorBadge).join('');
  const hidden = authorArray.slice(5).map(renderAuthorBadge).join('');

  return `
    <div class="authors-container">
      ${visible}
      <button type="button" onclick="document.getElementById('hidden-authors-t-${pubId}').style.display = 'inline-flex'; this.style.display = 'none';" style="background: none; border: none; color: #800000; font-weight: bold; cursor: pointer; padding: 0 4px; font-size: inherit;">et al.</button>
      <span id="hidden-authors-t-${pubId}" class="hidden-authors">${hidden}</span>
    </div>
  `;
}

async function loadTeacherData() {
  if (!teacherId) {
    document.getElementById('t-name-en').innerText = 'ไม่พบรหัสอาจารย์ใน URL';
    document.getElementById('teacher-publications-list').innerHTML = '<div class="info-card" style="text-align: center; color: #666;">กรุณาเลือกอาจารย์จากหน้าหลัก</div>';
    return;
  }

  await loadTeacherMap();

  // 1. ดึงข้อมูลอาจารย์
  const { data: teacher, error } = await supabaseClient
    .from('teachers')
    .select('*')
    .eq('id', teacherId)
    .single();

  if (error || !teacher) {
    document.getElementById('t-name-en').innerText = 'ไม่พบข้อมูลอาจารย์ในระบบ';
    return;
  }

  const nameTh = `${teacher.first_name_th || ''} ${teacher.last_name_th || ''}`.trim();
  const nameEn = `${teacher.first_name_en || ''} ${teacher.last_name_en || ''}`.trim();
  const faculty = teacher.faculty_en || teacher.faculty_th || teacher.faculty || 'Thammasat University';
  const department = teacher.department_en || teacher.department_th || teacher.department;

  const titleEl = document.getElementById('t-name-en');
  const subEl = document.getElementById('t-name-th');

  if (nameTh && nameEn) {
    titleEl.innerText = nameTh;
    subEl.innerText = nameEn.toUpperCase();
    subEl.style.display = 'block';
  } else if (nameTh) {
    titleEl.innerText = nameTh;
    subEl.innerText = '';
    subEl.style.display = 'none';
  } else if (nameEn) {
    titleEl.innerText = nameEn.toUpperCase();
    subEl.innerText = '';
    subEl.style.display = 'none';
  } else {
    titleEl.innerText = teacher.name || 'Unknown Name';
    subEl.innerText = '';
    subEl.style.display = 'none';
  }

  document.getElementById('t-faculty').innerText = faculty;
  if (department) {
    document.getElementById('t-department').innerText = `Department: ${department}`;
  }

  if (teacher.email) {
    document.getElementById('t-email').innerHTML = `<i class="fa fa-envelope-o" style="width: 24px; color: #800000;"></i> <a href="mailto:${teacher.email}" style="color: #800000; text-decoration: none;">${teacher.email}</a>`;
  }
  if (teacher.office) {
    document.getElementById('t-office').innerHTML = `<i class="fa fa-building-o" style="width: 24px; color: #800000;"></i> ${teacher.office}`;
  }else {
    document.getElementById('t-office').innerHTML = `<i class="fa fa-building-o" style="width: 24px; color: #800000;"></i> ${teacher.faculty_en}`;
  }

  if (teacher.phone) {
    document.getElementById('t-phone').innerHTML = `<i class="fa fa-phone" style="width: 24px; color: #800000;"></i> ${teacher.phone}`;
  } else {
    document.getElementById('t-phone').style.display = 'none';
  }

  // 2. ดึงจากตารางเชื่อม teacher_publications
  const { data: relations } = await supabaseClient
    .from('teacher_publications')
    .select(`publications (*)`)
    .eq('teacher_id', teacherId);

  let pubs = [];
  if (relations && relations.length > 0) {
    pubs = relations.map(r => r.publications).filter(Boolean);
  }

  // 3. Fallback: ถ้ายังไม่มีในตารางเชื่อม ให้ค้นหาจากรายชื่องานวิจัยทั้งหมด
  if (pubs.length === 0) {
    let allPubs = [];
    let start = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: batchPubs, error: pubErr } = await supabaseClient
        .from('publications')
        .select('*')
        .range(start, start + batchSize - 1);

      if (pubErr || !batchPubs || batchPubs.length === 0) {
        hasMore = false;
      } else {
        allPubs = allPubs.concat(batchPubs);
        start += batchSize;
        if (batchPubs.length < batchSize) hasMore = false;
      }
    }

    if (allPubs.length > 0) {
      pubs = allPubs.filter(p => {
        let authors = [];
        if (Array.isArray(p.authors)) {
          authors = p.authors;
        } else if (typeof p.authors === 'string') {
          authors = p.authors.split(/[,;]/).map(a => a.trim()).filter(Boolean);
        }

        return authors.some(authorName => {
          const matched = findTeacherMatch(authorName);
          return matched && String(matched.id) === String(teacherId);
        });
      });
    }
  }

  renderPubList(pubs);
}

function renderPubList(pubs) {
  const container = document.getElementById('teacher-publications-list');
  if (!pubs || pubs.length === 0) {
    container.innerHTML = `
      <div class="info-card" style="text-align: center; color: #666;">
        ไม่พบข้อมูลงานวิจัย
      </div>
    `;
    return;
  }

  let html = '';
  pubs.forEach((pub, idx) => {
    const title = pub.title || "Untitled Paper";
    const paperUrl = pub.official_url || pub.doi_url || pub.doi || pub.url || pub.link || '';
    const pubType = pub.work_type ? pub.work_type.toUpperCase() : "ARTICLE";
    const pubDate = pub.publication_date || pub.publication_year || "Unknown Date";

    let hostDomain = '';
    if (paperUrl) {
      try {
        const fullUrl = paperUrl.startsWith('http') ? paperUrl : 'https://' + paperUrl;
        hostDomain = new URL(fullUrl).hostname.replace(/^www\./, '');
      } catch (e) { }
    }

    const sourceName = pub.source_name || pub.publisher || '';

    let metaParts = [pubDate];
    if (hostDomain) metaParts.push(`<a href="${paperUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">${hostDomain}</a>`);
    if (sourceName && sourceName !== hostDomain) metaParts.push(sourceName);

    html += `
      <div class="info-card" style="margin-bottom: 16px;">
        <h3 style="margin: 0 0 8px 0; font-size: 1.1rem; line-height: 1.4;">
          ${paperUrl
            ? `<a href="${paperUrl}" target="_blank" rel="noopener noreferrer" style="color: #222; text-decoration: none;">${title}</a>`
            : title
          }
        </h3>
        <div style="font-size: 0.85rem; color: #666; margin-bottom: 8px;">
          <span class="badge-article">${pubType}</span>
          <span>${metaParts.join(' &bull; ')}</span>
        </div>
        ${formatAuthors(pub.authors || pub.author_names, pub.id || idx)}
      </div>
    `;
  });

  container.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', loadTeacherData);