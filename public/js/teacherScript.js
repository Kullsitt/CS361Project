const SUPABASE_URL = "https://svijmtiaeormkmdtmbud.supabase.co";
const SUPABASE_KEY = "sb_publishable_e6LgiJKOQeA6VXi5Ng_JGg_Q8aKNDLD";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const urlParams = new URLSearchParams(window.location.search);
const teacherId = urlParams.get('id');

let teacherLookupList = [];

function cleanStr(str) {
  return (str || '')
    .toLowerCase()
    .replace(/^(assoc\.?|asst\.?|prof\.?|dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, '')
    .replace(/[^a-z0-9]/g, '');
}

async function loadTeacherMap() {
  if (teacherLookupList.length > 0) return;
  const { data } = await supabaseClient
    .from('teachers')
    .select('*');

  if (data) {
    teacherLookupList = data.map(t => {
      const fn = t.first_name_en || '';
      const ln = t.last_name_en || '';
      const rawFull = `${fn} ${ln}`.trim() || t.name || '';
      return {
        id: t.id,
        firstClean: cleanStr(fn),
        lastClean: cleanStr(ln),
        fullClean: cleanStr(rawFull),
        rawFull: rawFull
      };
    });
  }
}

function findTeacherMatch(rawName) {
  if (!rawName || teacherLookupList.length === 0) return null;

  const rawClean = cleanStr(rawName);
  const parts = rawName.trim().replace(/^(Assoc\.?|Asst\.?|Prof\.?|Dr\.?|Mr\.?|Mrs\.?|Ms\.?)\s+/i, '').split(/\s+/);

  let firstPart = cleanStr(parts[0]);
  let lastPart = cleanStr(parts[parts.length - 1]);

  for (const t of teacherLookupList) {
    if (t.fullClean && (t.fullClean === rawClean || rawClean.includes(t.fullClean) || t.fullClean.includes(rawClean))) {
      return t;
    }

    if (parts.length >= 2) {
      if (t.firstClean === firstPart && (t.lastClean.startsWith(lastPart) || lastPart.startsWith(t.lastClean.charAt(0)))) {
        return t;
      }
      if (t.lastClean === lastPart && (t.firstClean.startsWith(firstPart) || firstPart.startsWith(t.firstClean.charAt(0)))) {
        return t;
      }
    }
  }
  return null;
}

function formatShortName(fullName) {
  if (!fullName) return "";
  const cleaned = fullName.trim().replace(/^(Assoc\.?|Asst\.?|Prof\.?|Dr\.?|Mr\.?|Mrs\.?|Ms\.?)\s+/i, '');
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function renderAuthorBadge(rawName) {
  const shortName = formatShortName(rawName);
  const matchedTeacher = findTeacherMatch(rawName);

  if (matchedTeacher) {
    return `<a href="teacher.html?id=${matchedTeacher.id}" title="${rawName} (อาจารย์ มธ. - คลิกดูผลงาน)" class="author-item" style="text-decoration: underline; text-decoration-color: #800000; text-underline-offset: 3px; color: #1a1a1a; font-weight: 600; cursor: pointer;"><i class="fa fa-user-circle" style="color: #800000;"></i>${shortName}</a>`;
  }
  return `<span title="${rawName}" class="author-item" style="cursor: help; color: #555;"><i class="fa fa-user-circle-o" style="color: #888;"></i>${shortName}</span>`;
}

function formatAuthors(rawAuthors, pubId) {
  if (!rawAuthors || rawAuthors === "N/A") {
    return '<div class="authors-container"><span class="author-item"><i class="fa fa-user-circle-o"></i> Unknown Author</span></div>';
  }

  let authorArray = Array.isArray(rawAuthors)
    ? rawAuthors
    : rawAuthors.split(',').map(name => name.trim()).filter(Boolean);

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

  const titleEl = document.getElementById('t-name-en'); // แถวบนตัวใหญ่
  const subEl = document.getElementById('t-name-th');   // แถวล่างตัวเล็ก

  if (nameTh && nameEn) {
    // มีทั้ง 2 ภาษา -> ไทยตัวใหญ่หลัก, อังกฤษตัวเล็กรอง
    titleEl.innerText = nameTh;
    subEl.innerText = nameEn.toUpperCase();
    subEl.style.display = 'block';
  } else if (nameTh) {
    // มีแค่ชื่อไทย
    titleEl.innerText = nameTh;
    subEl.innerText = '';
    subEl.style.display = 'none';
  } else if (nameEn) {
    // มีแค่ชื่ออังกฤษ
    titleEl.innerText = nameEn.toUpperCase();
    subEl.innerText = '';
    subEl.style.display = 'none';
  } else {
    // กรณีไม่มีชื่อทั้งคู่ ใช้ฟิลด์ name สำรอง
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

  // 3. Fallback: ถ้ายังไม่มีในตารางเชื่อม ให้ค้นหาจากรายชื่องานวิจัย
  if (pubs.length === 0) {
    const { data: allPubs } = await supabaseClient
      .from('publications')
      .select('*')
      .limit(500);

    if (allPubs && allPubs.length > 0) {
      pubs = allPubs.filter(p => {
        const authors = Array.isArray(p.authors) ? p.authors : (p.authors || '').split(',');
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
    const hostDomain = paperUrl ? new URL(paperUrl.startsWith('http') ? paperUrl : 'https://' + paperUrl).hostname.replace(/^www\./, '') : '';
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