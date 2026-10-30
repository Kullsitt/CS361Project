// =========================================================================
// 1. CONFIGURATION & STATE MANAGEMENT
// =========================================================================
const API_BASE_URL = "http://34.236.42.23/api";

const state = {
  teacherId: new URLSearchParams(window.location.search).get('id'),
  currentCategory: 'TEACHING',
  rawWorkloads: []
};

// =========================================================================
// 2. HELPER FUNCTIONS (SECURITY & DOM)
// =========================================================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setElementText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text || '';
}

function normalizeList(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string' && input.trim()) {
    return input.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
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

// =========================================================================
// 3. API FETCHING LOGIC
// =========================================================================

async function loadTeacherProfileData() {
  if (!state.teacherId) {
    setElementText('t-name-en', 'ไม่พบรหัสอาจารย์ใน URL');
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/professors/${encodeURIComponent(state.teacherId)}`);
    if (!res.ok) {
      setElementText('t-name-en', 'ไม่พบข้อมูลอาจารย์ในระบบ RDS');
      return;
    }

    const teacher = await res.json();
    renderTeacherProfileInfo(teacher);

    // เริ่มต้นโหลดภาระงานหมวดแรก (TEACHING)
    loadCategoryWorkloads(state.currentCategory);

  } catch (error) {
    console.error("Error loading professor profile:", error);
    setElementText('t-name-en', 'เกิดข้อผิดพลาดในการดึงข้อมูลอาจารย์');
  }
}

async function loadCategoryWorkloads(category) {
  const container = document.getElementById('workload-cards-container');
  if (!container) return;

  container.innerHTML = `
    <div class="info-card" style="text-align: center; color: #666; padding: 30px;">
      <i class="fa fa-spinner fa-spin fa-2x"></i>
      <p style="margin-top: 10px;">กำลังโหลดข้อมูล...</p>
    </div>`;

  try {
    // กรณีเลือกแท็บ "3. งานวิจัย/วิชาการ"
    if (category === 'RESEARCH' || category === 'ACADEMIC') {
      const resPubs = await fetch(`${API_BASE_URL}/publications?professor_id=${encodeURIComponent(state.teacherId)}`);
      
      if (resPubs.ok) {
        const pubsData = await resPubs.json();
        state.rawWorkloads = (pubsData.data || pubsData || []).map(pub => ({
          id: pub.id,
          isPublication: true,
          title: pub.title || "Untitled Paper",
          academic_year: pub.publication_year || pub.year || "งานวิจัย",
          publication_type: pub.work_type || pub.type || "Journal Article",
          source_name: pub.source_name || pub.journal_name || "",
          role: pub.role || "Author",
          official_url: pub.official_url || pub.doi_url || pub.url
        }));
      } else {
        state.rawWorkloads = [];
      }
    } 
    // กรณีเลือกแท็บอื่นๆ
    else {
      const resWl = await fetch(`${API_BASE_URL}/workloads/by-category?professor_id=${encodeURIComponent(state.teacherId)}&category=${category}`);
      if (resWl.ok) {
        state.rawWorkloads = await resWl.json();
      } else {
        state.rawWorkloads = [];
      }
    }

    populateFilterDropdown(); // สร้างตัวเลือก Dropdown จากข้อมูล
    applyFilters(); // กรองและแสดงผล

  } catch (error) {
    console.error("Error fetching category data:", error);
    container.innerHTML = `
      <div class="info-card" style="text-align: center; color: #dc3545; padding: 30px;">
        เกิดข้อผิดพลาดในการโหลดข้อมูล
      </div>`;
  }
}

// =========================================================================
// 4. UI RENDERERS, FILTER, & SEARCH LOGIC
// =========================================================================

function renderTeacherProfileInfo(teacher) {
  const nameTh = `${teacher.first_name_th || ''} ${teacher.last_name_th || ''}`.trim();
  const nameEn = `${teacher.first_name_en || ''} ${teacher.last_name_en || ''}`.trim();
  const titleEl = document.getElementById('t-name-en');
  const subEl = document.getElementById('t-name-th');

  if (nameTh && nameEn) {
    if (titleEl) titleEl.innerText = nameTh;
    if (subEl) { subEl.innerText = nameEn.toUpperCase(); subEl.style.display = 'block'; }
  } else {
    if (titleEl) titleEl.innerText = nameTh || nameEn || teacher.name || 'Unknown Name';
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
    officeEl.innerHTML = `<i class="fa fa-building-o" style="width: 24px; color: #800000;"></i> ${escapeHtml(teacher.office_address || faculty)}`;
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
}

/** สร้างตัวเลือกใน Dropdown อัตโนมัติ */
function populateFilterDropdown() {
  const selectEl = document.getElementById('dynamic-filter-select');
  if (!selectEl) return;

  selectEl.innerHTML = ''; 

  if (state.currentCategory === 'RESEARCH' || state.currentCategory === 'ACADEMIC') {
    selectEl.innerHTML = '<option value="all">ประเภทงาน (ทั้งหมด)</option>';
    const uniqueTypes = [...new Set(state.rawWorkloads.map(item => item.publication_type).filter(Boolean))];
    uniqueTypes.forEach(type => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      selectEl.appendChild(option);
    });
  } else {
    selectEl.innerHTML = '<option value="all">ภาค/ปีการศึกษา (ทั้งหมด)</option>';
    const uniqueTerms = [...new Set(state.rawWorkloads.map(item => {
      if (item.semester && item.academic_year) return `${item.semester}/${item.academic_year}`;
      if (item.academic_year) return `ปี ${item.academic_year}`;
      return null;
    }).filter(Boolean))];
    
    uniqueTerms.sort((a, b) => b.localeCompare(a));
    
    uniqueTerms.forEach(term => {
      const option = document.createElement('option');
      option.value = term;
      option.textContent = term;
      selectEl.appendChild(option);
    });
  }
}

/** กรองข้อมูลจากทั้งช่องค้นหาและ Dropdown */
function applyFilters() {
  const searchKeyword = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  const filterValue = document.getElementById('dynamic-filter-select')?.value || 'all';

  const filteredList = state.rawWorkloads.filter(item => {
    // 1. ตรวจสอบ Text Search
    const title = (item.title || item.course_code || item.position_or_task_name || '').toLowerCase();
    const code = (item.course_code || '').toLowerCase();
    const source = (item.source_name || item.organization || item.advisee_name || '').toLowerCase();
    const role = (item.work_type || item.role || item.publication_type || '').toLowerCase();
    const year = String(item.academic_year || item.publication_year || '');

    const matchesSearch = !searchKeyword || 
                          title.includes(searchKeyword) || 
                          code.includes(searchKeyword) || 
                          source.includes(searchKeyword) || 
                          role.includes(searchKeyword) || 
                          year.includes(searchKeyword);

    // 2. ตรวจสอบ Dropdown
    let matchesDropdown = true;
    if (filterValue !== 'all') {
      if (state.currentCategory === 'RESEARCH' || state.currentCategory === 'ACADEMIC') {
        matchesDropdown = item.publication_type === filterValue;
      } else {
        const itemTerm = (item.semester && item.academic_year) ? `${item.semester}/${item.academic_year}` : (item.academic_year ? `ปี ${item.academic_year}` : null);
        matchesDropdown = itemTerm === filterValue;
      }
    }

    return matchesSearch && matchesDropdown;
  });

  renderWorkloadCards(filteredList);
}

function renderWorkloadCards(itemsToRender = state.rawWorkloads) {
  const container = document.getElementById('workload-cards-container');
  if (!container) return;

  const items = itemsToRender;

  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="info-card" style="text-align: center; color: #666; padding: 30px;">
        ไม่พบรายการภาระงานหรือผลงานวิชาการที่ตรงกับเงื่อนไข
      </div>`;
    return;
  }

  let html = '';
  items.forEach(item => {
    if (item.isPublication) {
      const pubLink = item.official_url 
        ? `<a href="${escapeHtml(item.official_url)}" target="_blank" rel="noopener noreferrer" style="color:#0056b3; text-decoration:none;">${escapeHtml(item.title)} <i class="fa fa-external-link"></i></a>` 
        : escapeHtml(item.title);

      const subText = [item.publication_type, item.source_name, item.role ? `บทบาท: ${item.role}` : ''].filter(Boolean).join(' · ');

      html += `
        <div class="wl-item-card" style="background: #fff; padding: 16px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #e0e0e0; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
          <div class="wl-badges" style="display: flex; gap: 8px; margin-bottom: 6px;">
            <span class="badge-term" style="background: #f0f4f8; color: #102a43; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;">ปี ${item.academic_year}</span>
            <span class="badge-hours" style="background: #e3f2fd; color: #0d47a1; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;">RESEARCH</span>
          </div>
          <div class="wl-title" style="font-size: 16px; font-weight: 600; line-height: 1.4;">
            ${pubLink}
          </div>
          ${subText ? `<div class="wl-subtext" style="color: #627d98; font-size: 13px; margin-top: 6px;">${subText}</div>` : ''}
        </div>
      `;
    } 
    else {
      const termLabel = item.semester ? `${item.semester}/${item.academic_year}` : `ปี ${item.academic_year || '-'}`;
      const hoursLabel = item.workload_hours ? `${item.workload_hours} ชม./สัปดาห์` : (item.score ? `คะแนน: ${item.score}` : '');
      const displayTitle = item.title || item.course_code || 'ไม่มีชื่อรายการ';

      let subText = '';
      if (state.currentCategory === 'TEACHING') {
        const sec = item.section ? `กลุ่ม ${item.section}` : '';
        const credits = item.credits ? `${item.credits} หน่วยกิต` : '';
        subText = [credits, sec].filter(Boolean).join(' · ');
      } else if (state.currentCategory === 'ADVISING') {
        const student = item.advisee_name || '';
        const degree = item.degree_level || '';
        subText = [student ? `นักศึกษา: ${student}` : '', degree, item.role ? `บทบาท: ${item.role}` : ''].filter(Boolean).join(' · ');
      } else if (state.currentCategory === 'ADMINISTRATIVE') {
        subText = item.organization ? `หน่วยงาน: ${item.organization}` : (item.appointment_no ? `คำสั่ง: ${item.appointment_no}` : '');
      } else {
        subText = item.organization || item.description || `บทบาท: ${item.role || 'ผู้ปฏิบัติงาน'}`;
      }

      html += `
        <div class="wl-item-card" style="background: #fff; padding: 16px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #e0e0e0; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
          <div class="wl-badges" style="display: flex; gap: 8px; margin-bottom: 6px;">
            <span class="badge-term" style="background: #f0f4f8; color: #102a43; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;">${termLabel}</span>
            ${hoursLabel ? `<span class="badge-hours" style="background: #e3f2fd; color: #0d47a1; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;">${hoursLabel}</span>` : ''}
          </div>
          <div class="wl-title" style="font-size: 16px; font-weight: 600;">
            <span style="color: #111; text-decoration: none;">${escapeHtml(displayTitle)}</span>
          </div>
          ${subText ? `<div class="wl-subtext" style="color: #627d98; font-size: 13px; margin-top: 6px;">${subText}</div>` : ''}
        </div>
      `;
    }
  });

  container.innerHTML = html;
}

// =========================================================================
// 5. EVENT HANDLERS
// =========================================================================

function switchWorkloadTab(category, btnEl) {
  state.currentCategory = category;
  document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  // ล้างค่าในช่องค้นหาเมื่อสลับแท็บ
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  loadCategoryWorkloads(state.currentCategory);
}

// =========================================================================
// 6. INITIALIZATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  loadTeacherProfileData();

  const searchInput = document.getElementById('search-input');
  const filterSelect = document.getElementById('dynamic-filter-select');
  let debounceTimer = null;

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        applyFilters();
      }, 300);
    });
  }

  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      applyFilters();
    });
  }
});
