// Configuration
const SUPABASE_URL = "https://ewklxmvohanstvaphwow.supabase.co";
const SUPABASE_KEY = "sb_publishable_tTlNhmQ6ZfFJVD1VEvXewA_piv6ngYP";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const urlParams = new URLSearchParams(window.location.search);
const teacherId = urlParams.get('id');

let teacherLookupList = [];

// Helper: XSS Protection
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper: Safe DOM element setter
function setElementText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

// Helper: Normalize string/array inputs to Array
function normalizeList(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string' && input.trim()) {
    return input.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

// Clean prefixes and special characters
function cleanStr(str) {
  if (!str) return '';
  return str
    .toString()
    .trim()
    .toLowerCase()
    .replace(/^(assoc\.?\s*prof\.?|asst\.?\s*prof\.?|prof\.?|dr\.?|mr\.?|mrs\.?|ms\.?|ศ\.?|รศ\.?|ผศ\.?|ดร\.?|อาจารย์|นาย|นาง|นางสาว)\s+/i, '')
    .replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');
}

// Batch load teacher lookup with optional SessionStorage caching
async function loadTeacherMap() {
  if (teacherLookupList.length > 0) return;

  // Try retrieving from session cache first
  const cached = sessionStorage.getItem('teacherLookupList');
  if (cached) {
    try {
      teacherLookupList = JSON.parse(cached);
      return;
    } catch (e) {
      sessionStorage.removeItem('teacherLookupList');
    }
  }

  try {
    let allRecords = [];
    let start = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseClient
        .from('teachers')
        .select('id, first_name_en, last_name_en, first_name_th, last_name_th, name')
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

      // Cache to avoid refetching during same session
      sessionStorage.setItem('teacherLookupList', JSON.stringify(teacherLookupList));
    }
  } catch (e) {
    console.error("Failed to load teacher map", e);
  }
}

// Token-Based Matching
function findTeacherMatch(rawName) {
  if (!rawName || teacherLookupList.length === 0) return null;

  const rawClean = cleanStr(rawName);
  if (!rawClean) return null;

  // 1. Exact Full Name Match
  for (const t of teacherLookupList) {
    if (t.fullCleanEn && t.fullCleanEn === rawClean) return t;
    if (t.fullCleanTh && t.fullCleanTh === rawClean) return t;
  }

  // 2. Tokenized Name Match
  const rawParts = rawName
    .trim()
    .replace(/^(assoc\.?\s*prof\.?|asst\.?\s*prof\.?|prof\.?|dr\.?|mr\.?|mrs\.?|ms\.?|ศ\.?|รศ\.?|ผศ\.?|ดร\.?|อาจารย์|นาย|นาง|นางสาว)\s+/i, '')
    .split(/[\s,.\-_/]+/)
    .map(cleanStr)
    .filter(p => p.length > 0);

  if (rawParts.length < 2) return null;

  for (const t of teacherLookupList) {
    // English Checks
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

          if (p1 === fn && p2 === ln) return t;
          if (p1 === fn && p2 === lnInit) return t;
          if (p1 === ln && p2 === fnInit) return t;
        }
      }
    }

    // Thai Checks
    if (t.firstCleanTh && t.lastCleanTh) {
      const hasFn = rawParts.includes(t.firstCleanTh);
      const hasLn = rawParts.includes(t.lastCleanTh);
      if (hasFn && hasLn) return t;
    }
  }

  return null;
}

function formatShortName(fullName) {
  if (!fullName) return "";
  const cleaned = fullName
    .trim()
    .replace(/^(assoc\.?\s*prof\.?|asst\.?\s*prof\.?|prof\.?|dr\.?|mr\.?|mrs\.?|ms\.?|ศ\.?|รศ\.?|ผศ\.?|ดร\.?|อาจารย์|นาย|นาง|นางสาว)\s+/i, '');
  const parts = cleaned.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 1) return escapeHtml(parts[0]);
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  return `${escapeHtml(firstName)} ${escapeHtml(lastName.charAt(0).toUpperCase())}.`;
}

function renderAuthorBadge(rawName) {
  const shortName = formatShortName(rawName);
  const matchedTeacher = findTeacherMatch(rawName);
  const safeRawName = escapeHtml(rawName);

  if (matchedTeacher) {
    return `<a href="teacher.html?id=${encodeURIComponent(matchedTeacher.id)}" title="${safeRawName} (อาจารย์ มธ. - คลิกดูผลงาน)" class="author-item" style="text-decoration: underline; text-decoration-color: #800000; text-underline-offset: 3px; color: #1a1a1a; font-weight: 600; cursor: pointer;"><i class="fa fa-user-circle" style="color: #800000;"></i>${shortName}</a>`;
  }
  return `<span title="${safeRawName}" class="author-item" style="cursor: default; color: #555;"><i class="fa fa-user-circle-o" style="color: #888;"></i>${shortName}</span>`;
}

function formatAuthors(rawAuthors, pubId) {
  const authorArray = normalizeList(rawAuthors);

  if (authorArray.length === 0) {
    return '<div class="authors-container"><span class="author-item"><i class="fa fa-user-circle-o"></i> Unknown Author</span></div>';
  }

  if (authorArray.length <= 5) {
    return `<div class="authors-container">${authorArray.map(renderAuthorBadge).join('')}</div>`;
  }

  const visible = authorArray.slice(0, 5).map(renderAuthorBadge).join('');
  const hidden = authorArray.slice(5).map(renderAuthorBadge).join('');

  return `
    <div class="authors-container">
      ${visible}
      <button type="button" data-pub-id="${pubId}" class="btn-et-al" style="background: none; border: none; color: #800000; font-weight: bold; cursor: pointer; padding: 0 4px; font-size: inherit;">et al.</button>
      <span id="hidden-authors-t-${pubId}" class="hidden-authors" style="display: none;">${hidden}</span>
    </div>
  `;
}

function renderListItems(elementId, dataList, fallbackText) {
  const container = document.getElementById(elementId);
  if (!container) return;

  container.innerHTML = '';
  const items = normalizeList(dataList);

  if (items.length > 0) {
    items.forEach(item => {
      const li = document.createElement('li');
      li.style.listStyleType = 'disc';
      li.style.marginLeft = '20px';
      li.innerText = item;
      container.appendChild(li);
    });
  } else {
    container.innerText = fallbackText;
  }
}

async function loadTeacherData() {
  if (!teacherId) {
    setElementText('t-name-en', 'ไม่พบรหัสอาจารย์ใน URL');
    const container = document.getElementById('teacher-publications-list');
    if (container) container.innerHTML = '<div class="info-card" style="text-align: center; color: #666;">กรุณาเลือกอาจารย์จากหน้าหลัก</div>';
    return;
  }

  await loadTeacherMap();

  // 1. Fetch Teacher Info
  const { data: teacher, error } = await supabaseClient
    .from('teachers')
    .select('*')
    .eq('id', teacherId)
    .single();

  if (error || !teacher) {
    setElementText('t-name-en', 'ไม่พบข้อมูลอาจารย์ในระบบ');
    return;
  }

  // Set Profile Metadata
  const nameTh = `${teacher.first_name_th || ''} ${teacher.last_name_th || ''}`.trim();
  const nameEn = `${teacher.first_name_en || ''} ${teacher.last_name_en || ''}`.trim();
  const titleEl = document.getElementById('t-name-en');
  const subEl = document.getElementById('t-name-th');

  if (nameTh && nameEn) {
    if (titleEl) titleEl.innerText = nameTh;
    if (subEl) { subEl.innerText = nameEn.toUpperCase(); subEl.style.display = 'block'; }
  } else if (nameTh) {
    if (titleEl) titleEl.innerText = nameTh;
    if (subEl) subEl.style.display = 'none';
  } else if (nameEn) {
    if (titleEl) titleEl.innerText = nameEn.toUpperCase();
    if (subEl) subEl.style.display = 'none';
  } else {
    if (titleEl) titleEl.innerText = teacher.name || 'Unknown Name';
    if (subEl) subEl.style.display = 'none';
  }

  // Render Expertise & Research Interests safely
  renderListItems('t-expertise', teacher.expertise, 'ไม่พบข้อมูลความเชี่ยวชาญ');
  renderListItems('t-research_interests', teacher.research_interests, 'ไม่พบข้อมูลความสนใจในการวิจัย');
  renderListItems('t-education', teacher.education, 'ไม่พบข้อมูลการศึกษา');
  
  // Profile Image
  const profileImageEl = document.getElementById('profile_image');
  if (profileImageEl) {
    profileImageEl.src = teacher.profile_url || 'assets/default-profile.png';
  }

  // Contact Information
  const faculty = teacher.faculty_en || teacher.faculty_th || teacher.faculty || 'Thammasat University';
  setElementText('t-faculty', faculty);

  if (teacher.department_en || teacher.department_th || teacher.department) {
    setElementText('t-department', `Department: ${teacher.department_en || teacher.department_th || teacher.department}`);
  }

  const emailEl = document.getElementById('t-email');
  if (emailEl) {
    emailEl.innerHTML = teacher.email 
      ? `<i class="fa fa-envelope-o" style="width: 24px; color: #800000;"></i> <a href="mailto:${escapeHtml(teacher.email)}" style="color: #800000; text-decoration: none;">${escapeHtml(teacher.email)}</a>`
      : '';
  }

  const officeEl = document.getElementById('t-office_address');
  if (officeEl) {
    const officeText = teacher.office_address || faculty;
    officeEl.innerHTML = `<i class="fa fa-building-o" style="width: 24px; color: #800000;"></i> ${escapeHtml(officeText)}`;
  }

  const phoneEl = document.getElementById('t-phone');
  if (phoneEl) {
    if (teacher.phone_number) {
      phoneEl.style.display = 'block';
      phoneEl.innerHTML = `<i class="fa fa-phone" style="width: 24px; color: #800000;"></i> ${escapeHtml(teacher.phone_number)}`;
    } else {
      phoneEl.style.display = 'none';
    }
  }

  // 2. Fetch Publications via Join
  const { data: relations } = await supabaseClient
    .from('teacher_publications')
    .select(`publications (*)`)
    .eq('teacher_id', teacherId);

  let pubs = [];
  if (relations && relations.length > 0) {
    pubs = relations.map(r => r.publications).filter(Boolean);
  }

  // Fallback: Scan publications
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
        const authors = normalizeList(p.authors || p.author_names);
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
  if (!container) return;

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
    const title = escapeHtml(pub.title || "Untitled Paper");
    const rawPaperUrl = pub.official_url || pub.doi_url || pub.doi || pub.url || pub.link || '';
    const paperUrl = escapeHtml(rawPaperUrl);
    const pubType = escapeHtml((pub.work_type ? pub.work_type : "ARTICLE").toUpperCase());
    const pubDate = escapeHtml(pub.publication_date || pub.publication_year || "Unknown Date");

    let hostDomain = '';
    if (rawPaperUrl) {
      try {
        const fullUrl = rawPaperUrl.startsWith('http') ? rawPaperUrl : 'https://' + rawPaperUrl;
        hostDomain = escapeHtml(new URL(fullUrl).hostname.replace(/^www\./, ''));
      } catch (e) { }
    }

    const sourceName = escapeHtml(pub.source_name || pub.publisher || '');

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

  // Event delegation for "et al." buttons
  container.querySelectorAll('.btn-et-al').forEach(btn => {
    btn.addEventListener('click', function() {
      const pubId = this.getAttribute('data-pub-id');
      const hiddenSpan = document.getElementById(`hidden-authors-t-${pubId}`);
      if (hiddenSpan) hiddenSpan.style.display = 'inline-flex';
      this.style.display = 'none';
    });
  });
}

document.addEventListener('DOMContentLoaded', loadTeacherData);

// Workloads use the same-origin FastAPI service, independently of publications.
let workloadPage = 1;
let loadedWorkloads = 0;
async function loadTeacherWorkloads() {
  const container = document.getElementById('teacher-workloads');
  const more = document.getElementById('workload-more');
  const retry = document.getElementById('workload-retry');
  const categoryNames = {TEACHING:'การสอน',RESEARCH:'งานวิจัย',SERVICE:'บริการวิชาการ',ADVISING:'การดูแลนักศึกษา'};
  more.hidden = true;
  retry.hidden = true;
  if (!teacherId) { container.textContent = 'กรุณาเลือกอาจารย์จากหน้าหลัก'; return; }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const params = new URLSearchParams({teacher_id:teacherId,page:String(workloadPage),page_size:'10'});
    const response = await fetch(`/api/workloads?${params}`, {signal:controller.signal});
    if (!response.ok) throw new Error('Unable to load workloads');
    const result = await response.json();
    if (!Array.isArray(result.data)) throw new Error('Invalid workload response');
    if (workloadPage === 1) container.replaceChildren();
    for (const item of result.data) {
      const card = document.createElement('div'); card.className = 'info-card workload-card';
      const heading = document.createElement('h3');
      const link = document.createElement('a');
      link.href = `workload.html?id=${encodeURIComponent(item.id)}`;
      link.textContent = item.title || 'ภาระงาน';
      heading.append(link);
      const meta = document.createElement('p');
      meta.textContent = `${categoryNames[item.category] || item.category} · ปีการศึกษา ${item.academic_year} · ${item.semester == null ? 'ทั้งปีการศึกษา' : `ภาคเรียน ${item.semester}`} · ${item.workload_hours == null ? 'ไม่ระบุชั่วโมง' : `${item.workload_hours} ชั่วโมง`}`;
      const evidence = document.createElement('p');
      evidence.textContent = `หลักฐาน ${item.evidence_count ?? 0} รายการ · คลิกชื่อภาระงานเพื่อดูรายละเอียดและหลักฐาน`;
      card.append(heading,meta,evidence); container.append(card);
    }
    loadedWorkloads += result.data.length;
    if (!loadedWorkloads) container.textContent = 'ยังไม่มีข้อมูลภาระงานของอาจารย์ท่านนี้';
    more.hidden = result.total == null ? result.data.length < 10 : loadedWorkloads >= result.total;
    workloadPage += 1;
  } catch {
    if (workloadPage === 1) container.textContent = 'ไม่สามารถโหลดภาระงานได้ กรุณาลองอีกครั้ง';
    retry.hidden = false;
  } finally { clearTimeout(timeout); }
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('workload-more').addEventListener('click', loadTeacherWorkloads);
  document.getElementById('workload-retry').addEventListener('click', loadTeacherWorkloads);
  loadTeacherWorkloads();
});
