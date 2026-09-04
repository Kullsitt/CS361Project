const SUPABASE_URL = "https://svijmtiaeormkmdtmbud.supabase.co";
const SUPABASE_KEY = "sb_publishable_e6LgiJKOQeA6VXi5Ng_JGg_Q8aKNDLD";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentTab = 'publications';
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

let teacherLookupList = [];
let isTeacherMapLoaded = false;
let pubCountMap = {};
let cachedAllTeachers = null;

function cleanStr(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .replace(/^(assoc\.?\s*prof\.?|asst\.?\s*prof\.?|prof\.?|dr\.?|mr\.?|mrs\.?|ms\.?|ศ\.?|รศ\.?|ผศ\.?|ดร\.?|อาจารย์|นาย|นาง|นางสาว)\s+/i, '')
    .replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');
}

async function loadTeacherMap() {
  if (isTeacherMapLoaded && teacherLookupList.length > 0) return;
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
      isTeacherMapLoaded = true;
      console.log(`[FRWS] โหลดข้อมูลอาจารย์สำเร็จ: ${teacherLookupList.length} ท่าน`);
    }
  } catch (e) {
    console.error("Failed to load teacher map", e);
  }
}

// ฟังก์ชันจับคู่อาจารย์แบบ Token-Based และ Partial Initials
function findTeacherMatch(rawName) {
  if (!rawName || teacherLookupList.length === 0) return null;

  const rawClean = cleanStr(rawName);
  if (!rawClean) return null;

  // 1. เช็กชื่อเต็มตรงกัน 100% หรือเป็น Substring กัน
  for (const t of teacherLookupList) {
    if (t.fullCleanEn && (t.fullCleanEn === rawClean || rawClean.includes(t.fullCleanEn) || t.fullCleanEn.includes(rawClean))) return t;
    if (t.fullCleanTh && (t.fullCleanTh === rawClean || rawClean.includes(t.fullCleanTh) || t.fullCleanTh.includes(rawClean))) return t;
  }

  // 2. แยกคำทั้งหมดออกมาเป็น Array (ตัดช่องว่าง, จุลภาค, จุด, ขีด)
  const rawParts = rawName
    .replace(/^(assoc\.?\s*prof\.?|asst\.?\s*prof\.?|prof\.?|dr\.?|mr\.?|mrs\.?|ms\.?|ศ\.?|รศ\.?|ผศ\.?|ดร\.?|อาจารย์|นาย|นาง|นางสาว)\s+/i, '')
    .split(/[\s,.\-_/]+/)
    .map(cleanStr)
    .filter(p => p.length > 0);

  if (rawParts.length < 2) return null;

  // ค้นหาแบบเปรียบเทียบชิ้นส่วน (Tokens)
  for (const t of teacherLookupList) {
    // --- ตรวจสอบชื่อภาษาอังกฤษ ---
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

          // รูปแบบ: ชื่อเต็ม + นามสกุลเต็ม (หรือขึ้นต้นด้วยคำเดียวกัน)
          if ((p1 === fn || fn.startsWith(p1) || p1.startsWith(fn)) && (p2 === ln || ln.startsWith(p2) || p2.startsWith(ln))) {
            return t;
          }

          // รูปแบบ: ชื่อเต็ม + นามสกุลย่อ (เช่น "Chansuda" + "B")
          if ((p1 === fn || fn.startsWith(p1)) && (p2 === lnInit || ln.startsWith(p2))) {
            return t;
          }

          // รูปแบบ: นามสกุลเต็ม + ชื่อย่อ (เช่น "Phantawong" + "K")
          if ((p1 === ln || ln.startsWith(p1)) && (p2 === fnInit || fn.startsWith(p2))) {
            return t;
          }
        }
      }
    }

    // --- ตรวจสอบชื่อภาษาไทย ---
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

function extractHostDomain(urlStr) {
  if (!urlStr) return '';
  try {
    let validUrl = urlStr;
    if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
      validUrl = 'https://' + validUrl;
    }
    return new URL(validUrl).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function getPaperUrl(pub) {
  return pub.official_url || pub.doi_url || pub.doi || pub.url || pub.link || '';
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
    return `<a href="teacher.html?id=${matchedTeacher.id}" title="${rawName} (อาจารย์ มธ. - คลิกดูโปรไฟล์)" class="author-item" style="text-decoration: underline; text-decoration-color: #800000; text-underline-offset: 3px; color: #1a1a1a; font-weight: 600; cursor: pointer;"><i class="fa fa-user-circle" style="color: #800000;"></i>${shortName}</a>`;
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
      <button type="button" onclick="document.getElementById('hidden-authors-idx-${pubId}').style.display = 'inline-flex'; this.style.display = 'none';" style="background: none; border: none; color: #800000; font-weight: bold; cursor: pointer; padding: 0 4px; font-size: inherit;">et al.</button>
      <span id="hidden-authors-idx-${pubId}" class="hidden-authors">${hidden}</span>
    </div>
  `;
}

function switchTab(tab) {
  if (currentTab === tab) return;
  currentTab = tab;
  currentPage = 1;
  document.getElementById('tab-publications').classList.toggle('active', tab === 'publications');
  document.getElementById('tab-authors').classList.toggle('active', tab === 'authors');
  fetchData();
}

async function fetchCountsForPage(teacherIds) {
  if (!teacherIds || teacherIds.length === 0) return;
  try {
    const { data } = await supabaseClient
      .from('teacher_publications')
      .select('teacher_id')
      .in('teacher_id', teacherIds);

    if (data) {
      data.forEach(r => {
        pubCountMap[r.teacher_id] = (pubCountMap[r.teacher_id] || 0) + 1;
      });
    }
  } catch (e) { }
}

async function fetchData() {
  const container = document.getElementById('cards-container');
  container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">กำลังโหลดข้อมูล...</p>';

  const from = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    await loadTeacherMap();

    if (currentTab === 'publications') {
      const { data, count, error } = await supabaseClient
        .from('publications')
        .select('*', { count: 'exact' })
        .order('publication_date', { ascending: false, nullsFirst: false })
        .range(from, from + ITEMS_PER_PAGE - 1);

      if (error) {
        container.innerHTML = '<p style="color: red; text-align: center;">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>';
        return;
      }

      window.currentPubData = data;
      renderPublications(data);
      renderPagination(count || 0);

    } else {
      if (!cachedAllTeachers) {
        let allRecords = [];
        let start = 0;
        const batchSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabaseClient
            .from('teachers')
            .select('*')
            .range(start, start + batchSize - 1);

          if (error) {
            container.innerHTML = '<p style="color: red; text-align: center;">เกิดข้อผิดพลาดในการโหลดข้อมูลอาจารย์</p>';
            return;
          }

          if (data && data.length > 0) {
            allRecords = allRecords.concat(data);
            start += batchSize;
            if (data.length < batchSize) hasMore = false;
          } else {
            hasMore = false;
          }
        }

        cachedAllTeachers = allRecords.filter(t => {
          const raw = `${t.first_name_en || ''} ${t.first_name_th || ''} ${t.name || ''}`.toUpperCase();
          return !raw.includes('ACCOUNT') && !raw.includes('กลาง');
        }).sort((a, b) => {
          const thA = (a.first_name_th || '').trim();
          const thB = (b.first_name_th || '').trim();
          const enA = (a.first_name_en || '').trim();
          const enB = (b.first_name_en || '').trim();

          const isThaiA = thA.length > 0 && thA.charCodeAt(0) >= 0x0E00 && thA.charCodeAt(0) <= 0x0E7F;
          const isThaiB = thB.length > 0 && thB.charCodeAt(0) >= 0x0E00 && thB.charCodeAt(0) <= 0x0E7F;

          if (isThaiA && !isThaiB) return -1;
          if (!isThaiA && isThaiB) return 1;

          if (isThaiA && isThaiB) return thA.localeCompare(thB, 'th');
          return enA.localeCompare(enB, 'en');
        });
      }

      const totalItems = cachedAllTeachers.length;
      const pageData = cachedAllTeachers.slice(from, from + ITEMS_PER_PAGE);

      const pageIds = pageData.map(t => t.id);
      await fetchCountsForPage(pageIds);

      renderAuthors(pageData);
      renderPagination(totalItems);
    }
  } catch (err) {
    container.innerHTML = '<p style="color: red; text-align: center;">เกิดข้อผิดพลาดในการเชื่อมต่อ</p>';
  }
}

function renderPublications(publications) {
  const container = document.getElementById('cards-container');
  container.className = 'cards-list'; // ใช้ Layout แบบ List สำหรับงานวิจัย

  if (!publications || publications.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #666;">ไม่พบข้อมูลงานวิจัย</p>';
    return;
  }

  let html = '';
  publications.forEach((pub, idx) => {
    const title = pub.title || "Untitled Paper";
    const paperUrl = getPaperUrl(pub);
    const isLinkValid = paperUrl && paperUrl.trim() !== '';

    const pubType = pub.work_type ? pub.work_type.toUpperCase() : "ARTICLE";
    const pubDate = pub.publication_date || pub.publication_year || "Unknown Date";
    const hostDomain = extractHostDomain(paperUrl);
    const sourceName = pub.source_name || pub.publisher || pub.category || '';

    let metaParts = [pubDate];
    if (hostDomain) {
      metaParts.push(`<a href="${paperUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">${hostDomain}</a>`);
    }
    if (sourceName && sourceName !== "Unknown Source" && sourceName !== hostDomain) {
      metaParts.push(sourceName);
    }

    const metaInfoHTML = metaParts.join(' &bull; ');
    const authorsHTML = formatAuthors(pub.authors || pub.author_names, pub.id || idx);

    html += `
      <div class="card card-pub">
        <h3 class="card-pub-title">
          ${isLinkValid
            ? `<a href="${paperUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none; cursor: pointer;">${title}</a>`
            : title
          }
        </h3>
        <div class="card-pub-meta">
          <span class="badge-article">${pubType}</span>
          <span class="meta-info">${metaInfoHTML}</span>
        </div>
        ${authorsHTML}
      </div>
    `;
  });
  container.innerHTML = html;
}

function renderAuthors(teachers) {
  const container = document.getElementById('cards-container');
  container.className = 'cards-grid'; // เปลี่ยนเป็น Grid 4 คอลัมน์สำหรับแท็บอาจารย์

  if (!teachers || teachers.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #666;">ไม่พบข้อมูลอาจารย์</p>';
    return;
  }

  let html = '';
  teachers.forEach(teacher => {
    const nameTh = `${teacher.first_name_th || ''} ${teacher.last_name_th || ''}`.trim();
    const nameEn = `${teacher.first_name_en || ''} ${teacher.last_name_en || ''}`.trim();

    let mainName = nameTh || nameEn || teacher.name || 'Unknown Name';
    const teacherId = teacher.id;
    const count = pubCountMap[teacherId] || 0;

    // ดึงความเชี่ยวชาญ/สาขา หรือข้อมูลติดต่อจาก Supabase DB
    const expertise = teacher.research_interests || teacher.expertise || teacher.department_th || teacher.department_en || teacher.department || '';
    const email = teacher.email || '';
    const phone = teacher.phone || teacher.tel || '';
    const imageUrl = teacher.image_url || teacher.photo || teacher.avatar_url || '';

    html += `
      <div class="card card-author">
        ${imageUrl 
          ? `<img src="${imageUrl}" alt="${mainName}" class="author-avatar-img">`
          : `<div class="author-avatar-placeholder"><i class="fa fa-user"></i></div>`
        }

        <div class="author-info">
          <h3>
            <a href="teacher.html?id=${teacherId}" class="author-link">${mainName}</a>
          </h3>
          
          ${expertise ? `<p class="label">${expertise}</p>` : ''}
          ${phone ? `<p class="value" style="margin-top: 6px;">${phone}</p>` : ''}
          ${email ? `<p class="value" style="margin-top: 2px;">${email}</p>` : ''}
          
          <div style="margin-top: auto; padding-top: 14px;">
            <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.82rem; background: #fdf2f2; color: #800000; padding: 3px 10px; border-radius: 12px; font-weight: 600; border: 1px solid #f5c2c7;">
              <i class="fa fa-book"></i> ${count} ${count <= 1 ? 'publication' : 'publications'}
            </span>
          </div>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function renderPagination(totalItems) {
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
  const pagEl = document.getElementById('pagination');

  if (totalPages <= 1) {
    pagEl.innerHTML = '';
    return;
  }

  let html = `<button class="pag-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">&lt;</button>`;
  let startPage = Math.max(1, currentPage - 3);
  let endPage = Math.min(totalPages, startPage + 6);

  if (endPage - startPage < 6) {
    startPage = Math.max(1, endPage - 6);
  }

  if (startPage > 1) {
    html += `<button class="pag-btn" onclick="changePage(1)">1</button>`;
    if (startPage > 2) html += `<span style="padding: 4px 8px; color: #888;">...</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="pag-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<span style="padding: 4px 8px; color: #888;">...</span>`;
    html += `<button class="pag-btn" onclick="changePage(${totalPages})">${totalPages}</button>`;
  }

  html += `<button class="pag-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">&gt;</button>`;
  pagEl.innerHTML = html;
}

function changePage(page) {
  currentPage = page;
  fetchData();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', fetchData);