// Configuration
const SUPABASE_URL = "https://ewklxmvohanstvaphwow.supabase.co";
const SUPABASE_KEY = "sb_publishable_tTlNhmQ6ZfFJVD1VEvXewA_piv6ngYP";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const urlParams = new URLSearchParams(window.location.search);
const teacherId = urlParams.get('id');

let teacherLookupList = [];
let currentWorkloadCategory = 'TEACHING';
let rawWorkloadList = [];
let rawPublicationsList = [];

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

// Render list helper
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

// สลับแท็บ 1-4 ของ Workloads
function switchWorkloadTab(category, btnEl) {
  currentWorkloadCategory = category;
  document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  filterWorkloads();
}

// กรองข้อมูลตามแท็บ, ภาคเรียน, และคำค้นหา
function filterWorkloads() {
  const container = document.getElementById('workload-cards-container');
  if (!container) return;

  const selectedTerm = document.getElementById('term-select')?.value || 'all';
  const keyword = document.getElementById('workload-search-input')?.value.trim().toLowerCase() || '';

  let itemsToDisplay = [];

  // หมวดหมู่ที่ 3 (RESEARCH): รวม Publications เข้าด้วย
  if (currentWorkloadCategory === 'RESEARCH') {
    const wlResearch = rawWorkloadList.filter(item => item.category === 'RESEARCH');
    itemsToDisplay = [...wlResearch];

    rawPublicationsList.forEach(pub => {
      itemsToDisplay.push({
        id: pub.id,
        isPublication: true,
        title: pub.title || "Untitled Paper",
        academic_year: pub.publication_year || pub.publication_date?.split('-')[0] || "วิจัย",
        semester: null,
        workload_hours: null,
        sub_info: (pub.work_type || 'ARTICLE').toUpperCase(),
        official_url: pub.official_url || pub.doi_url || pub.url
      });
    });
  } else {
    itemsToDisplay = rawWorkloadList.filter(item => item.category === currentWorkloadCategory);
  }

  // 2. กรองตาม Term
  if (selectedTerm !== 'all') {
    itemsToDisplay = itemsToDisplay.filter(item => {
      const termStr = item.semester ? `${item.semester}/${item.academic_year}` : `${item.academic_year}`;
      return termStr === selectedTerm || String(item.academic_year) === selectedTerm;
    });
  }

  // 3. กรองตาม Keyword Search
  if (keyword) {
    itemsToDisplay = itemsToDisplay.filter(item => {
      const titleMatch = (item.title || '').toLowerCase().includes(keyword);
      const codeMatch = (item.details?.course_code || '').toLowerCase().includes(keyword);
      const roleMatch = (item.details?.role || '').toLowerCase().includes(keyword);
      return titleMatch || codeMatch || roleMatch;
    });
  }

  // Render HTML Output
  if (itemsToDisplay.length === 0) {
    container.innerHTML = `<div class="info-card" style="text-align: center; color: #666; padding: 30px;">ไม่พบรายการภาระงานหรือผลงานวิชาการในหมวดหมู่นี้</div>`;
    return;
  }

  let html = '';
  itemsToDisplay.forEach(item => {
    if (item.isPublication) {
      const pubLink = item.official_url ? `<a href="${escapeHtml(item.official_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)} ↗</a>` : escapeHtml(item.title);
      html += `
        <div class="wl-item-card">
          <div class="wl-badges">
            <span class="badge-term">${item.academic_year}</span>
            <span class="badge-hours" style="background:#f2f0ff; color:#4b0082; border-color:#dcd6f7;">${item.sub_info}</span>
          </div>
          <div class="wl-title">${pubLink}</div>
        </div>
      `;
    } else {
      const termLabel = item.semester ? `${item.semester}/${item.academic_year}` : `ปีการศึกษา ${item.academic_year}`;
      const hoursLabel = item.workload_hours ? `${item.workload_hours} ชั่วโมง` : '';
      const courseCode = item.details?.course_code ? `${item.details.course_code}: ` : '';

      let subText = '';
      if (item.category === 'TEACHING') {
        const share = item.details?.teaching_share_percent ? `สัดส่วนการสอน: ${item.details.teaching_share_percent}%` : '';
        const credits = item.details?.credits ? `${item.details.credits} หน่วยกิต` : '';
        subText = [credits, share].filter(Boolean).join(' · ');
      } else {
        subText = item.description || `หลักฐาน ${item.evidence_count || 0} รายการ`;
      }

      html += `
        <div class="wl-item-card">
          <div class="wl-badges">
            <span class="badge-term">${termLabel}</span>
            ${hoursLabel ? `<span class="badge-hours">${hoursLabel}</span>` : ''}
          </div>
          <div class="wl-title">
            <a href="workload.html?id=${encodeURIComponent(item.id)}">${courseCode}${escapeHtml(item.title)}</a>
          </div>
          ${subText ? `<div class="wl-subtext">${subText}</div>` : ''}
        </div>
      `;
    }
  });

  container.innerHTML = html;
}

// โหลดข้อมูลอาจารย์
async function loadTeacherData() {
  if (!teacherId) {
    setElementText('t-name-en', 'ไม่พบรหัสอาจารย์ใน URL');
    return;
  }

  // Fetch Teacher Info
  const { data: teacher, error } = await supabaseClient
    .from('teachers')
    .select('*')
    .eq('id', teacherId)
    .single();

  if (error || !teacher) {
    setElementText('t-name-en', 'ไม่พบข้อมูลอาจารย์ในระบบ');
    return;
  }

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

  renderListItems('t-expertise', teacher.expertise, 'ไม่พบข้อมูลความเชี่ยวชาญ');
  renderListItems('t-research_interests', teacher.research_interests, 'ไม่พบข้อมูลความสนใจในการวิจัย');
  renderListItems('t-education', teacher.education, 'ไม่พบข้อมูลการศึกษา');
  
  const profileImageEl = document.getElementById('profile_image');
  if (profileImageEl) {
    profileImageEl.src = teacher.profile_url || 'assets/default-profile.png';
  }

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

  // Fetch Publications
  const { data: relations } = await supabaseClient
    .from('teacher_publications')
    .select(`publications (*)`)
    .eq('teacher_id', teacherId);

  if (relations && relations.length > 0) {
    rawPublicationsList = relations.map(r => r.publications).filter(Boolean);
  }

  // Fetch Workloads
  try {
    const res = await fetch(`/api/workloads?teacher_id=${encodeURIComponent(teacherId)}&page_size=100`);
    if (res.ok) {
      const result = await res.json();
      rawWorkloadList = result.data || [];
    }
  } catch (e) {
    console.error("Failed to fetch workloads", e);
  }

  // Dropdown options
  const termSelect = document.getElementById('term-select');
  if (termSelect && rawWorkloadList.length > 0) {
    const terms = new Set();
    rawWorkloadList.forEach(item => {
      if (item.semester && item.academic_year) terms.add(`${item.semester}/${item.academic_year}`);
      else if (item.academic_year) terms.add(`${item.academic_year}`);
    });
    
    terms.forEach(term => {
      const opt = document.createElement('option');
      opt.value = term;
      opt.textContent = term;
      termSelect.appendChild(opt);
    });
  }

  filterWorkloads();
}

document.addEventListener('DOMContentLoaded', loadTeacherData);