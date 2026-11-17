// public/js/dashboard.js

let globalLecturersData = [];
let currentInspectedLecturer = null;
let currentInspectedDetails = {};

function getApiBaseUrl() {
    if (typeof API_BASE_URL !== 'undefined') return API_BASE_URL;
    if (typeof window.API_BASE_URL !== 'undefined') return window.API_BASE_URL;
    return 'http://34.236.42.23/api';
}

function getStoredRole() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        return String(user.role || '').trim().toLowerCase();
    } catch (error) {
        return '';
    }
}

function hasOfficerDashboardRole(role = getStoredRole()) {
    return true;
}

function canReviewSubmissions() {
    return true;
}

function canInspectWorkloads() {
    return true;
}

document.addEventListener('DOMContentLoaded', () => {
    const termFilter = document.getElementById('term-filter');
    const trackFilter = document.getElementById('track-filter');
    const statusFilter = document.getElementById('status-filter');
    const searchInput = document.getElementById('search-lecturer');

    if (termFilter) termFilter.addEventListener('change', filterData);
    if (trackFilter) trackFilter.addEventListener('change', filterData);
    if (statusFilter) statusFilter.addEventListener('change', filterData);
    if (searchInput) searchInput.addEventListener('input', filterData);

    loadDashboardData();
});

async function loadDashboardData() {
    const termVal = document.getElementById('term-filter')?.value || '2-2567';
    const statusVal = document.getElementById('status-filter')?.value || 'ALL';
    const searchVal = document.getElementById('search-lecturer')?.value || '';

    const params = new URLSearchParams();
    if (searchVal) params.append('search', searchVal.trim());
    if (termVal && termVal !== 'ALL') {
        const [semester, year] = termVal.split('-');
        if (year) params.append('academic_year', year);
        if (semester) params.append('semester', semester);
    }

    const baseUrl = getApiBaseUrl();
    const token = localStorage.getItem('token') || localStorage.getItem('access_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
        const response = await fetch(`${baseUrl}/workloads/officer/dashboard?${params.toString()}`, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) throw new Error(`HTTP Error status: ${response.status}`);

        const resData = await response.json();
        
        let rawList = [];
        if (Array.isArray(resData)) {
            rawList = resData;
        } else if (resData && Array.isArray(resData.submissions)) {
            rawList = resData.submissions;
        }

        // กรองปี/ภาคการศึกษาบน Frontend เพิ่มเติมกรณี API ส่งมาหลายรอบ
        if (termVal && termVal !== 'ALL') {
            const [filterSem, filterYr] = termVal.split('-');
            const hasMatchingTerm = rawList.some(item => 
                item.academic_year && String(item.academic_year) === String(filterYr) &&
                item.semester && String(item.semester) === String(filterSem)
            );
            if (hasMatchingTerm) {
                rawList = rawList.filter(item => 
                    !item.academic_year || (String(item.academic_year) === String(filterYr) && String(item.semester) === String(filterSem))
                );
            }
        }

        globalLecturersData = rawList;

        const reviewStatus = statusVal.toUpperCase();
        if (reviewStatus === 'PASS') {
            globalLecturersData = globalLecturersData.filter(isScorePassing);
        } else if (reviewStatus === 'FAIL') {
            globalLecturersData = globalLecturersData.filter(item => !isScorePassing(item));
        } else if (reviewStatus === 'PENDING') {
            globalLecturersData = globalLecturersData.filter(item =>
                ['PENDING', 'DRAFT', ''].includes(String(item.status || '').toUpperCase())
            );
        }

        updateKPIs(globalLecturersData, rawList.length);
        renderTable(globalLecturersData);
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        const tbody = document.getElementById('workload-table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:#dc2626; padding:20px;">เกิดข้อผิดพลาดในการดึงข้อมูล: ${error.message}</td></tr>`;
        }
    }
}

function getTotalCalculatedScore(item) {
    return ['m1_calc', 'm2_calc', 'm3_calc', 'm4_calc', 'm5_calc']
        .reduce((total, key) => total + Number(item[key] || 0), 0) || Number(item.total_score || 0);
}

function isScorePassing(item) {
    return getTotalCalculatedScore(item) >= 650 || String(item.status || '').toUpperCase() === 'PASS';
}

function updateKPIs(data, totalLecturersCount = 0) {
    const submittedCount = data.length;
    let passCount = 0;
    let pendingCount = 0;
    let totalCalcScoreSum = 0;

    data.forEach(item => {
        const totalCalc = getTotalCalculatedScore(item);
        totalCalcScoreSum += totalCalc;

        if (isScorePassing(item)) passCount++;
        if (['PENDING', 'DRAFT', ''].includes(String(item.status || '').toUpperCase())) pendingCount++;
    });

    const passRate = submittedCount > 0 ? ((passCount / submittedCount) * 100).toFixed(1) : '0.0';
    const avgCalc = submittedCount > 0 ? (totalCalcScoreSum / submittedCount).toFixed(1) : '0.0';

    if (document.getElementById('kpi-total-faculty')) document.getElementById('kpi-total-faculty').innerText = `${submittedCount} คน`;
    if (document.getElementById('kpi-pass-rate')) document.getElementById('kpi-pass-rate').innerText = `${passRate}%`;
    if (document.getElementById('kpi-avg-score')) document.getElementById('kpi-avg-score').innerText = avgCalc;
    if (document.getElementById('kpi-pending')) document.getElementById('kpi-pending').innerText = `${pendingCount} รายการ`;
}

function renderTable(data) {
    const tbody = document.getElementById('workload-table-body');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:24px; color:#666; font-weight:600;">ไม่พบรายการอาจารย์ในระบบ</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => {
        const name = item.name || `${item.title || ''}${item.first_name_th || ''} ${item.last_name_th || ''}`.trim() || 'ไม่ระบุชื่อ';
        const position = item.position || item.academic_rank || 'อาจารย์';
        const profId = item.id || item.professor_id;

        const totalActual = Number(item.m1_actual || 0) + Number(item.m2_actual || 0) + Number(item.m3_actual || 0) + Number(item.m4_actual || 0) + Number(item.m5_actual || 0);
        const totalCalc = getTotalCalculatedScore(item);

        let statusBadge = '';
        const reviewStatus = String(item.status || '').toUpperCase();
        if (reviewStatus === 'APPROVED') {
            statusBadge = `<span class="badge-status status-pass"><i class="fa fa-check-circle"></i> อนุมัติแล้ว</span>`;
        } else if (reviewStatus === 'REJECTED') {
            statusBadge = `<span class="badge-status status-fail"><i class="fa fa-times-circle"></i> ส่งกลับแก้ไข</span>`;
        } else if (isScorePassing(item)) {
            statusBadge = `<span class="badge-status status-pass"><i class="fa fa-check-circle"></i> ผ่านเกณฑ์</span>`;
        } else {
            statusBadge = `<span class="badge-status status-pending"><i class="fa fa-clock-o"></i> รอตรวจ</span>`;
        }

        return `
            <tr>
                <td style="text-align:left;">
                    <b>${name}</b><br>
                    <small style="color:#666;">${position}</small>
                </td>
                <td><span class="track-tag track-regular">ภาคปกติ</span></td>
                <td><b>${Number(item.credits || 0).toFixed(1)}</b></td>
                <td><b>${Number(item.m1_calc || 0).toFixed(0)}</b> <small style="color:#888;">(${Number(item.m1_actual || 0).toFixed(0)})</small></td>
                <td><b>${Number(item.m2_calc || 0).toFixed(0)}</b> <small style="color:#888;">(${Number(item.m2_actual || 0).toFixed(0)})</small></td>
                <td><b>${Number(item.m3_calc || 0).toFixed(0)}</b> <small style="color:#888;">(${Number(item.m3_actual || 0).toFixed(0)})</small></td>
                <td><b>${Number(item.m4_calc || 0).toFixed(0)}</b> <small style="color:#888;">(${Number(item.m4_actual || 0).toFixed(0)})</small></td>
                <td><b>${Number(item.m5_calc || 0).toFixed(0)}</b></td>
                <td style="color:#555;">${totalActual.toFixed(0)}</td>
                <td><b style="color:#8C1D24;">${totalCalc.toFixed(0)}</b></td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-action btn-inspect" onclick="openInspectModal('${profId}')">
                        <i class="fa fa-search"></i> ตรวจสอบ
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterData() {
    loadDashboardData();
}

async function openInspectModal(profId) {
    const lecturer = globalLecturersData.find(l => (l.id === profId || l.submission_id === profId || l.professor_id === profId));
    if (!lecturer) return;

    currentInspectedLecturer = lecturer;
    currentInspectedDetails = {};

    const termVal = document.getElementById('term-filter')?.value || '2-2567';
    const [filterSem, filterYr] = termVal.split('-');
    const semester = lecturer.semester || filterSem;
    const year = lecturer.academic_year || filterYr;
    const subId = lecturer.submission_id || '';

    const name = lecturer.name || `${lecturer.title || ''}${lecturer.first_name_th || ''} ${lecturer.last_name_th || ''}`.trim() || 'ไม่ระบุชื่อ';
    const position = lecturer.position || lecturer.academic_rank || 'อาจารย์';

    document.getElementById("modal-lecturer-name").innerText = `รายละเอียดแบบฟอร์มภาระงาน - ${name} (ภาคการศึกษา ${semester}/${year})`;

    const totalActual = Number(lecturer.m1_actual || 0) + Number(lecturer.m2_actual || 0) + Number(lecturer.m3_actual || 0) + Number(lecturer.m4_actual || 0) + Number(lecturer.m5_actual || 0);
    const totalCalc = getTotalCalculatedScore(lecturer);
    const isPass = totalCalc >= 650;

    let html = `
      <div style="background:#f8fafc; padding:16px; border-radius:8px; margin-bottom:20px; border:1px solid #cbd5e1;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
          <p style="margin:0;"><b>ตำแหน่ง:</b> ${position} | <b>สาขาวิชา:</b> วิทยาการคอมพิวเตอร์</p>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge-status ${isPass ? 'status-pass' : 'status-fail'}">
              ${isPass ? 'ผ่านเกณฑ์ (≥ 650 คะแนน)' : 'ต่ำกว่าเกณฑ์ (< 650 คะแนน)'}
            </span>
            <button class="btn-export-teacher" onclick="exportTeacherCSV()" style="background:#15803d; color:white; border:none; padding:6px 14px; border-radius:6px; font-weight:600; cursor:pointer; font-size:13px; display:inline-flex; align-items:center; gap:6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
              <i class="fa fa-file-excel-o"></i> ดาวน์โหลดภาระงาน (CSV)
            </button>
          </div>
        </div>
        <p style="margin:0; font-size:15px;">
          <b>สรุปคะแนนคำนวณสุทธิ:</b> <span style="font-size:20px; font-weight:700; color:#8C1D24;">${totalCalc.toFixed(1)} / 2,000 คะแนน</span> 
          (คะแนนจริงรวม: ${totalActual.toFixed(1)})
        </p>
      </div>

      <h4 style="margin-bottom:8px; color:#1e293b; font-size:15px; border-bottom:2px solid #8C1D24; padding-bottom:4px;">
        สรุปรวมคะแนน 5 หมวด (Executive Summary)
      </h4>
      <table class="score-breakdown-table">
        <thead>
          <tr>
            <th>หมวดภาระงาน</th>
            <th style="text-align:right;">คะแนนที่ได้จริง</th>
            <th style="text-align:right;">คะแนนที่นำมาคำนวณ</th>
            <th style="text-align:right;">เพดานคะแนน</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>หมวด 1: งานสอน</td><td style="text-align:right;">${Number(lecturer.m1_actual || 0).toFixed(1)}</td><td style="text-align:right;"><b>${Number(lecturer.m1_calc || 0).toFixed(1)}</b></td><td style="text-align:right;">900</td></tr>
          <tr><td>หมวด 2: งานวิชาการและงานวิจัย</td><td style="text-align:right;">${Number(lecturer.m2_actual || 0).toFixed(1)}</td><td style="text-align:right;"><b>${Number(lecturer.m2_calc || 0).toFixed(1)}</b></td><td style="text-align:right;">900</td></tr>
          <tr><td>หมวด 3: งานบริหาร</td><td style="text-align:right;">${Number(lecturer.m3_actual || 0).toFixed(1)}</td><td style="text-align:right;"><b>${Number(lecturer.m3_calc || 0).toFixed(1)}</b></td><td style="text-align:right;">400</td></tr>
          <tr><td>หมวด 4: งานบริการวิชาการ</td><td style="text-align:right;">${Number(lecturer.m4_actual || 0).toFixed(1)}</td><td style="text-align:right;"><b>${Number(lecturer.m4_calc || 0).toFixed(1)}</b></td><td style="text-align:right;">300</td></tr>
          <tr><td>หมวด 5: คะแนนพิเศษ</td><td style="text-align:right;">${Number(lecturer.m5_actual || 0).toFixed(1)}</td><td style="text-align:right;"><b>${Number(lecturer.m5_calc || 0).toFixed(1)}</b></td><td style="text-align:right;">100</td></tr>
        </tbody>
      </table>
    `;

    const baseUrl = getApiBaseUrl();
    const token = localStorage.getItem('token') || localStorage.getItem('access_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const inspectUrl = `${baseUrl}/workloads/officer/inspect/${profId}?academic_year=${year}&semester=${semester}${subId ? `&submission_id=${subId}` : ''}`;
    try {
        const res = await fetch(inspectUrl, { headers });
        let data = {};
        if (res.ok) {
            data = await res.json();
            currentInspectedDetails = data;
        }

        // --- หมวด 1: งานสอน ---
        const m1Score = Number(lecturer.m1_actual || 0);
        const hasTeaching = (data.teaching && data.teaching.length > 0) || (data.projects && data.projects.length > 0) || (data.thesis && data.thesis.length > 0);
        if (hasTeaching) {
            html += `
              <h4 style="margin-top:24px; margin-bottom:8px; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:4px;">
                หมวด 1: งานสอน (วิชาบรรยาย / ปฏิบัติการ / โครงงาน / วิทยานิพนธ์)
              </h4>
              <table class="score-breakdown-table">
                <thead>
                  <tr>
                    <th>รหัส-ชื่อรายการ</th>
                    <th>หน้าที่/บทบาท</th>
                    <th>หน่วยกิต/ชม.</th>
                    <th>สัดส่วน (%)</th>
                    <th style="text-align:right;">คะแนน</th>
                    <th>หลักฐาน</th>
                  </tr>
                </thead>
                <tbody>
            `;
            (data.teaching || []).forEach(item => {
                html += `
                  <tr>
                    <td><b>${item.course_code || ''}</b> ${item.section ? `(Sec ${item.section})` : ''}</td>
                    <td>${item.role_type || 'ผู้สอนวิชาบรรยาย/ปฏิบัติการ'}</td>
                    <td>${item.credits || 0} นก. (${item.hours || 0} ชม.)</td>
                    <td>${item.share || 100}%</td>
                    <td style="text-align:right;">${Number(item.score || 0).toFixed(1)}</td>
                    <td>${item.evidence_url ? `<a href="${item.evidence_url}" target="_blank" style="color:#0284c7;"><i class="fa fa-external-link"></i> แนบ</a>` : '—'}</td>
                  </tr>
                `;
            });
            (data.projects || []).forEach(item => {
                html += `
                  <tr>
                    <td><b>${item.course_code || ''}</b> ${item.workload_title || ''}</td>
                    <td>${item.role || 'อาจารย์ที่ปรึกษา'}</td>
                    <td>${item.quantity || 1} เรื่อง</td>
                    <td>${item.share || 100}%</td>
                    <td style="text-align:right;">${Number(item.score || 0).toFixed(1)}</td>
                    <td>${item.evidence_url ? `<a href="${item.evidence_url}" target="_blank" style="color:#0284c7;"><i class="fa fa-external-link"></i> แนบ</a>` : '—'}</td>
                  </tr>
                `;
            });
            (data.thesis || []).forEach(item => {
                html += `
                  <tr>
                    <td><b>${item.course_code || ''}</b> ${item.workload_title || ''} ${item.student_name ? `(${item.student_name})` : ''}</td>
                    <td>${item.role || 'ที่ปรึกษาหลัก'}</td>
                    <td>${item.credits || 0} นก.</td>
                    <td>${item.share || 100}%</td>
                    <td style="text-align:right;">${Number(item.score || 0).toFixed(1)}</td>
                    <td>${item.evidence_url ? `<a href="${item.evidence_url}" target="_blank" style="color:#0284c7;"><i class="fa fa-external-link"></i> แนบ</a>` : '—'}</td>
                  </tr>
                `;
            });
            html += `</tbody></table>`;
        } else if (m1Score > 0) {
            html += `
              <h4 style="margin-top:24px; margin-bottom:8px; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:4px;">
                หมวด 1: งานสอน
              </h4>
              <table class="score-breakdown-table">
                <thead>
                  <tr><th>รายการภาระงาน</th><th>บทบาท</th><th style="text-align:right;">คะแนน</th></tr>
                </thead>
                <tbody>
                  <tr><td><b>ภาระงานสอนตามรายงาน</b></td><td>ผู้สอน / ที่ปรึกษา</td><td style="text-align:right;"><b>${m1Score.toFixed(1)}</b></td></tr>
                </tbody>
              </table>
            `;
        }

        // --- หมวด 2: งานวิชาการและงานวิจัย ---
        const m2Score = Number(lecturer.m2_actual || 0);
        const hasAcademic = data.academic && data.academic.length > 0;
        if (hasAcademic) {
            html += `
              <h4 style="margin-top:24px; margin-bottom:8px; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:4px;">
                หมวด 2: งานวิชาการและงานวิจัย (บทความ / ผลงานตีพิมพ์ / งานวิจัย)
              </h4>
              <table class="score-breakdown-table">
                <thead>
                  <tr>
                    <th>ชื่อผลงาน / บทความ</th>
                    <th>ประเภท / แหล่งที่เผยแพร่</th>
                    <th>สัดส่วน (%)</th>
                    <th style="text-align:right;">คะแนน</th>
                    <th>หลักฐาน</th>
                  </tr>
                </thead>
                <tbody>
            `;
            data.academic.forEach(item => {
                html += `
                  <tr>
                    <td><b>${item.title || 'ผลงานวิชาการ'}</b></td>
                    <td>${item.subtype || item.role || 'บทความวิจัย'} ${item.source ? `(${item.source})` : ''}</td>
                    <td>${item.share || 100}%</td>
                    <td style="text-align:right;">${Number(item.score || 0).toFixed(1)}</td>
                    <td>${item.evidence_url ? `<a href="${item.evidence_url}" target="_blank" style="color:#0284c7;"><i class="fa fa-external-link"></i> แนบ</a>` : '—'}</td>
                  </tr>
                `;
            });
            html += `</tbody></table>`;
        } else if (m2Score > 0) {
            html += `
              <h4 style="margin-top:24px; margin-bottom:8px; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:4px;">
                หมวด 2: งานวิชาการและงานวิจัย
              </h4>
              <table class="score-breakdown-table">
                <thead>
                  <tr><th>รายการภาระงาน</th><th>บทบาท / ประเภท</th><th style="text-align:right;">คะแนน</th></tr>
                </thead>
                <tbody>
                  <tr><td><b>ผลงานวิชาการ / งานวิจัย</b></td><td>บทความวิชาการ / ผลงานตีพิมพ์</td><td style="text-align:right;"><b>${m2Score.toFixed(1)}</b></td></tr>
                </tbody>
              </table>
            `;
        }

        // --- หมวด 3: งานบริหาร ---
        const m3Score = Number(lecturer.m3_actual || 0);
        const hasAdmin = data.admin && data.admin.length > 0;
        if (hasAdmin) {
            html += `
              <h4 style="margin-top:24px; margin-bottom:8px; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:4px;">
                หมวด 3: งานบริหาร (ตำแหน่งบริหาร / ผู้ประสานงานรายวิชา)
              </h4>
              <table class="score-breakdown-table">
                <thead>
                  <tr>
                    <th>ตำแหน่ง / ชนิดงาน</th>
                    <th>รหัสวิชา / บทบาท</th>
                    <th>จำนวน</th>
                    <th style="text-align:right;">คะแนน</th>
                    <th>หลักฐาน</th>
                  </tr>
                </thead>
                <tbody>
            `;
            data.admin.forEach(item => {
                html += `
                  <tr>
                    <td><b>${item.title || ''}</b></td>
                    <td>${item.course_code || item.role || '—'}</td>
                    <td>${item.quantity || 1}</td>
                    <td style="text-align:right;">${Number(item.score || 0).toFixed(1)}</td>
                    <td>${item.evidence_url ? `<a href="${item.evidence_url}" target="_blank" style="color:#0284c7;"><i class="fa fa-external-link"></i> แนบ</a>` : '—'}</td>
                  </tr>
                `;
            });
            html += `</tbody></table>`;
        } else if (m3Score > 0) {
            html += `
              <h4 style="margin-top:24px; margin-bottom:8px; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:4px;">
                หมวด 3: งานบริหาร
              </h4>
              <table class="score-breakdown-table">
                <thead>
                  <tr><th>รายการภาระงาน</th><th>บทบาท / ตำแหน่ง</th><th style="text-align:right;">คะแนน</th></tr>
                </thead>
                <tbody>
                  <tr><td><b>งานบริหารสาขา / คณะ</b></td><td>ผู้บริหาร / ผู้ประสานงาน</td><td style="text-align:right;"><b>${m3Score.toFixed(1)}</b></td></tr>
                </tbody>
              </table>
            `;
        }

        // --- หมวด 4: งานบริการวิชาการ ---
        const m4Score = Number(lecturer.m4_actual || 0);
        const hasService = data.service && data.service.length > 0;
        if (hasService) {
            html += `
              <h4 style="margin-top:24px; margin-bottom:8px; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:4px;">
                หมวด 4: งานบริการวิชาการ (คณะทำงาน / วิทยากร / กรรมการ)
              </h4>
              <table class="score-breakdown-table">
                <thead>
                  <tr>
                    <th>ชื่องานบริการ / คณะกรรมการ</th>
                    <th>บทบาท / หน่วยงาน</th>
                    <th>จำนวน</th>
                    <th style="text-align:right;">คะแนน</th>
                    <th>หลักฐาน</th>
                  </tr>
                </thead>
                <tbody>
            `;
            data.service.forEach(item => {
                html += `
                  <tr>
                    <td><b>${item.title || ''}</b></td>
                    <td>${item.role || ''} ${item.organization ? `(${item.organization})` : ''}</td>
                    <td>${item.quantity || 1}</td>
                    <td style="text-align:right;">${Number(item.score || 0).toFixed(1)}</td>
                    <td>${item.evidence_url ? `<a href="${item.evidence_url}" target="_blank" style="color:#0284c7;"><i class="fa fa-external-link"></i> แนบ</a>` : '—'}</td>
                  </tr>
                `;
            });
            html += `</tbody></table>`;
        } else if (m4Score > 0) {
            html += `
              <h4 style="margin-top:24px; margin-bottom:8px; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:4px;">
                หมวด 4: งานบริการวิชาการ
              </h4>
              <table class="score-breakdown-table">
                <thead>
                  <tr><th>รายการภาระงาน</th><th>บทบาท / หน่วยงาน</th><th style="text-align:right;">คะแนน</th></tr>
                </thead>
                <tbody>
                  <tr><td><b>งานบริการวิชาการ / คณะกรรมการ</b></td><td>กรรมการ / วิทยากร</td><td style="text-align:right;"><b>${m4Score.toFixed(1)}</b></td></tr>
                </tbody>
              </table>
            `;
        }

        // --- หมวด 5: คะแนนพิเศษ ---
        const m5Score = Number(lecturer.m5_actual || 0);
        const hasExtra = data.extra && data.extra.length > 0;
        if (hasExtra) {
            html += `
              <h4 style="margin-top:24px; margin-bottom:8px; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:4px;">
                หมวด 5: คะแนนพิเศษ
              </h4>
              <table class="score-breakdown-table">
                <thead>
                  <tr>
                    <th>รายการคะแนนพิเศษ</th>
                    <th>คำอธิบาย</th>
                    <th style="text-align:right;">คะแนน</th>
                    <th>หลักฐาน</th>
                  </tr>
                </thead>
                <tbody>
            `;
            data.extra.forEach(item => {
                html += `
                  <tr>
                    <td><b>${item.title || ''}</b></td>
                    <td>${item.description || '—'}</td>
                    <td style="text-align:right;">${Number(item.score || 0).toFixed(1)}</td>
                    <td>${item.evidence_url ? `<a href="${item.evidence_url}" target="_blank" style="color:#0284c7;"><i class="fa fa-external-link"></i> แนบ</a>` : '—'}</td>
                  </tr>
                `;
            });
            html += `</tbody></table>`;
        } else if (m5Score > 0) {
            html += `
              <h4 style="margin-top:24px; margin-bottom:8px; color:#1e293b; border-bottom:1px solid #cbd5e1; padding-bottom:4px;">
                หมวด 5: คะแนนพิเศษ
              </h4>
              <table class="score-breakdown-table">
                <thead>
                  <tr><th>รายการคะแนนพิเศษ</th><th>คำอธิบาย</th><th style="text-align:right;">คะแนน</th></tr>
                </thead>
                <tbody>
                  <tr><td><b>คะแนนพิเศษ</b></td><td>คะแนนพิเศษประจำรอบการประเมิน</td><td style="text-align:right;"><b>${m5Score.toFixed(1)}</b></td></tr>
                </tbody>
              </table>
            `;
        }
    } catch (e) {
        console.error("Error fetching detailed workload inspect:", e);
    }

    const submissionId = lecturer.submission_id;
    html += `
      <div style="margin-top:24px; padding-top:16px; border-top:1px solid #e2e8f0; display:flex; gap:12px; justify-content:space-between; align-items:center; flex-wrap:wrap;">
        <button style="background:#0284c7; color:white; border:none; padding:10px 18px; border-radius:6px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:14px; box-shadow:0 1px 3px rgba(0,0,0,0.1);" onclick="exportTeacherCSV()">
          <i class="fa fa-download"></i> ดาวน์โหลดภาระงานอาจารย์ (CSV)
        </button>
        <div style="display:flex; gap:12px;">
          ${submissionId ? `
            <button style="background:#b91c1c; color:white; border:none; padding:10px 20px; border-radius:6px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px;" onclick="changeSubmissionStatus('${submissionId}', 'REJECTED')">
              <i class="fa fa-reply"></i> ส่งกลับแก้ไข
            </button>
            <button style="background:#15803d; color:white; border:none; padding:10px 20px; border-radius:6px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px;" onclick="changeSubmissionStatus('${submissionId}', 'APPROVED')">
              <i class="fa fa-check"></i> อนุมัติแบบฟอร์มภาระงาน
            </button>
          ` : ''}
        </div>
      </div>
    `;

    document.getElementById("modal-content").innerHTML = html;
    document.getElementById("inspectModal").style.display = "flex";
}

async function changeSubmissionStatus(subId, statusVal) {
    const baseUrl = getApiBaseUrl();
    const token = localStorage.getItem('token') || localStorage.getItem('access_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
        const res = await fetch(`${baseUrl}/workloads/submissions/${subId}/status`, {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify({ status: statusVal })
        });
        if (res.ok) {
            alert('อัปเดตสถานะเรียบร้อยแล้ว');
            closeModal();
            loadDashboardData();
        } else {
            const result = await res.json().catch(() => ({}));
            alert(result.detail || 'ไม่สามารถอัปเดตสถานะได้');
        }
    } catch (e) {
        console.error('Error changing status:', e);
        alert('เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่');
    }
}

function closeModal() {
    document.getElementById("inspectModal").style.display = "none";
}

function downloadCsvBlob(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportTeacherCSV() {
    const lecturer = currentInspectedLecturer;
    if (!lecturer) {
        alert("ไม่พบข้อมูลอาจารย์สำหรับส่งออก CSV");
        return;
    }

    const details = currentInspectedDetails || {};
    const name = lecturer.name || `${lecturer.title || ''}${lecturer.first_name_th || ''} ${lecturer.last_name_th || ''}`.trim() || 'อาจารย์';
    const position = lecturer.position || lecturer.academic_rank || 'อาจารย์';
    const termVal = document.getElementById('term-filter')?.value || '2-2567';
    const [filterSem, filterYr] = termVal.split('-');
    const semester = lecturer.semester || filterSem;
    const year = lecturer.academic_year || filterYr;

    const totalActual = Number(lecturer.m1_actual || 0) + Number(lecturer.m2_actual || 0) + Number(lecturer.m3_actual || 0) + Number(lecturer.m4_actual || 0) + Number(lecturer.m5_actual || 0);
    const totalCalc = getTotalCalculatedScore(lecturer);
    const isPass = isScorePassing(lecturer);
    const passStatusText = isPass ? "ผ่านเกณฑ์ (>= 650 คะแนน)" : "ต่ำกว่าเกณฑ์ (< 650 คะแนน)";

    let approvalStatus = "รอตรวจ";
    const reviewStatus = String(lecturer.status || '').toUpperCase();
    if (reviewStatus === 'APPROVED') approvalStatus = "อนุมัติแล้ว";
    else if (reviewStatus === 'REJECTED') approvalStatus = "ส่งกลับแก้ไข";

    const escapeCsv = (val) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    };

    let csv = "\uFEFF"; // UTF-8 BOM for Microsoft Excel compatibility

    // 1. ข้อมูลส่วนหัว
    csv += "แบบฟอร์มสรุปภาระงานอาจารย์ (FRWS)\n";
    csv += `ชื่อ-สกุล,${escapeCsv(name)}\n`;
    csv += `ตำแหน่ง,${escapeCsv(position)}\n`;
    csv += `สาขาวิชา,"วิทยาการคอมพิวเตอร์"\n`;
    csv += `ภาคการศึกษา,${escapeCsv(`${semester}/${year}`)}\n`;
    csv += `รวมคะแนนจริง,${totalActual.toFixed(2)}\n`;
    csv += `รวมคะแนนคำนวณสุทธิ,${totalCalc.toFixed(2)}\n`;
    csv += `เกณฑ์ขั้นต่ำในการเลื่อนเงินเดือน,650.00\n`;
    csv += `ผลการประเมิน,${escapeCsv(passStatusText)}\n`;
    csv += `สถานะการอนุมัติ,${escapeCsv(approvalStatus)}\n\n`;

    // 2. สรุปคะแนน 5 หมวด (Executive Summary)
    csv += "สรุปคะแนน 5 หมวด (Executive Summary)\n";
    csv += "หมวดภาระงาน,คะแนนที่ได้จริง,คะแนนที่นำมาคำนวณ,เพดานคะแนน\n";
    csv += `หมวด 1: งานสอน,${Number(lecturer.m1_actual || 0).toFixed(2)},${Number(lecturer.m1_calc || 0).toFixed(2)},900\n`;
    csv += `หมวด 2: งานวิชาการและงานวิจัย,${Number(lecturer.m2_actual || 0).toFixed(2)},${Number(lecturer.m2_calc || 0).toFixed(2)},900\n`;
    csv += `หมวด 3: งานบริหาร,${Number(lecturer.m3_actual || 0).toFixed(2)},${Number(lecturer.m3_calc || 0).toFixed(2)},400\n`;
    csv += `หมวด 4: งานบริการวิชาการ,${Number(lecturer.m4_actual || 0).toFixed(2)},${Number(lecturer.m4_calc || 0).toFixed(2)},300\n`;
    csv += `หมวด 5: คะแนนพิเศษ,${Number(lecturer.m5_actual || 0).toFixed(2)},${Number(lecturer.m5_calc || 0).toFixed(2)},100\n\n`;

    // 3. รายละเอียดภาระงานรายวิชา / กิจกรรม
    csv += "รายละเอียดภาระงานรายวิชา / กิจกรรม\n";
    csv += "หมวด,รหัส-ชื่อรายการภาระงาน,บทบาท / หน้าที่,หน่วยกิต / ชม. / จำนวน,สัดส่วน (%),คะแนน,หลักฐาน\n";

    let hasItems = false;

    // หมวด 1: งานสอน
    (details.teaching || []).forEach(item => {
        hasItems = true;
        const code = `${item.course_code || ''} ${item.section ? `(Sec ${item.section})` : ''}`.trim();
        const role = item.role_type || 'ผู้สอนวิชาบรรยาย/ปฏิบัติการ';
        const qty = `${item.credits || 0} นก. (${item.hours || 0} ชม.)`;
        csv += `หมวด 1: งานสอน,${escapeCsv(code)},${escapeCsv(role)},${escapeCsv(qty)},${item.share || 100}%,${Number(item.score || 0).toFixed(2)},${escapeCsv(item.evidence_url || '—')}\n`;
    });
    (details.projects || []).forEach(item => {
        hasItems = true;
        const title = `${item.course_code || ''} ${item.workload_title || ''}`.trim();
        const role = item.role || 'อาจารย์ที่ปรึกษาโครงงาน';
        const qty = `${item.quantity || 1} เรื่อง`;
        csv += `หมวด 1: โครงงานนักศึกษา,${escapeCsv(title)},${escapeCsv(role)},${escapeCsv(qty)},${item.share || 100}%,${Number(item.score || 0).toFixed(2)},${escapeCsv(item.evidence_url || '—')}\n`;
    });
    (details.thesis || []).forEach(item => {
        hasItems = true;
        const title = `${item.course_code || ''} ${item.workload_title || ''} ${item.student_name ? `(${item.student_name})` : ''}`.trim();
        const role = item.role || 'ที่ปรึกษาวิทยานิพนธ์หลัก';
        const qty = `${item.credits || 0} นก.`;
        csv += `หมวด 1: วิทยานิพนธ์,${escapeCsv(title)},${escapeCsv(role)},${escapeCsv(qty)},${item.share || 100}%,${Number(item.score || 0).toFixed(2)},${escapeCsv(item.evidence_url || '—')}\n`;
    });
    if (!hasItems && Number(lecturer.m1_actual || 0) > 0) {
        csv += `หมวด 1: งานสอน,ภาระงานสอนตามรายงาน,ผู้สอน / ที่ปรึกษา,—,100%,${Number(lecturer.m1_actual || 0).toFixed(2)},—\n`;
    }

    // หมวด 2: งานวิชาการและงานวิจัย
    let hasM2 = false;
    (details.academic || []).forEach(item => {
        hasM2 = true;
        const title = item.title || 'ผลงานวิชาการ/วิจัย';
        const role = `${item.subtype || item.role || 'บทความวิจัย'} ${item.source ? `(${item.source})` : ''}`.trim();
        csv += `หมวด 2: งานวิชาการและงานวิจัย,${escapeCsv(title)},${escapeCsv(role)},1 เรื่อง,${item.share || 100}%,${Number(item.score || 0).toFixed(2)},${escapeCsv(item.evidence_url || '—')}\n`;
    });
    if (!hasM2 && Number(lecturer.m2_actual || 0) > 0) {
        csv += `หมวด 2: งานวิชาการและงานวิจัย,ผลงานวิชาการ / งานวิจัย,บทความวิชาการ / ผลงานตีพิมพ์,1 เรื่อง,100%,${Number(lecturer.m2_actual || 0).toFixed(2)},—\n`;
    }

    // หมวด 3: งานบริหาร
    let hasM3 = false;
    (details.admin || []).forEach(item => {
        hasM3 = true;
        const title = item.title || 'งานบริหาร';
        const role = `${item.role || 'ผู้บริหาร/ผู้ประสานงาน'} ${item.course_code ? `(${item.course_code})` : ''}`.trim();
        csv += `หมวด 3: งานบริหาร,${escapeCsv(title)},${escapeCsv(role)},${item.quantity || 1} งาน,100%,${Number(item.score || 0).toFixed(2)},${escapeCsv(item.evidence_url || '—')}\n`;
    });
    if (!hasM3 && Number(lecturer.m3_actual || 0) > 0) {
        csv += `หมวด 3: งานบริหาร,งานบริหารสาขา / คณะ,ผู้บริหาร / ผู้ประสานงาน,1 งาน,100%,${Number(lecturer.m3_actual || 0).toFixed(2)},—\n`;
    }

    // หมวด 4: งานบริการวิชาการ
    let hasM4 = false;
    (details.service || []).forEach(item => {
        hasM4 = true;
        const title = item.title || 'งานบริการวิชาการ';
        const role = `${item.role || ''} ${item.organization ? `(${item.organization})` : ''}`.trim();
        csv += `หมวด 4: งานบริการวิชาการ,${escapeCsv(title)},${escapeCsv(role)},${item.quantity || 1} งาน,${item.share || 100}%,${Number(item.score || 0).toFixed(2)},${escapeCsv(item.evidence_url || '—')}\n`;
    });
    if (!hasM4 && Number(lecturer.m4_actual || 0) > 0) {
        csv += `หมวด 4: งานบริการวิชาการ,งานบริการวิชาการ / คณะกรรมการ,กรรมการ / วิทยากร,1 งาน,100%,${Number(lecturer.m4_actual || 0).toFixed(2)},—\n`;
    }

    // หมวด 5: คะแนนพิเศษ
    let hasM5 = false;
    (details.extra || []).forEach(item => {
        hasM5 = true;
        const title = item.title || 'คะแนนพิเศษ';
        const desc = item.description || 'คะแนนพิเศษประจำรอบการประเมิน';
        csv += `หมวด 5: คะแนนพิเศษ,${escapeCsv(title)},${escapeCsv(desc)},1 รายการ,100%,${Number(item.score || 0).toFixed(2)},${escapeCsv(item.evidence_url || '—')}\n`;
    });
    if (!hasM5 && Number(lecturer.m5_actual || 0) > 0) {
        csv += `หมวด 5: คะแนนพิเศษ,คะแนนพิเศษ,คะแนนพิเศษประจำรอบการประเมิน,1 รายการ,100%,${Number(lecturer.m5_actual || 0).toFixed(2)},—\n`;
    }

    const cleanFileName = `ภาระงาน_${name.replace(/[\/\\?%*:|"<>]/g, '_')}_${semester}_${year}.csv`;
    downloadCsvBlob(csv, cleanFileName);
}

function exportCSV() {
    if (!globalLecturersData || globalLecturersData.length === 0) {
        alert("ไม่มีข้อมูลอาจารย์สำหรับส่งออก CSV");
        return;
    }

    const termVal = document.getElementById('term-filter')?.value || '2-2567';
    let csv = "\uFEFF"; // UTF-8 BOM
    csv += "รายงานสรุปคะแนนภาระงานอาจารย์ (สาขาวิชาวิทยาการคอมพิวเตอร์)\n";
    csv += `รอบการประเมิน,${termVal}\n\n`;
    csv += "ชื่อ-สกุล,ตำแหน่ง,โครงการที่สอน,หน่วยกิตสอน,หมวด 1 (สอน) คำนวณ,หมวด 1 จริง,หมวด 2 (วิชาการ) คำนวณ,หมวด 2 จริง,หมวด 3 (บริหาร) คำนวณ,หมวด 3 จริง,หมวด 4 (บริการ) คำนวณ,หมวด 4 จริง,หมวด 5 (พิเศษ) คำนวณ,รวมคะแนนจริง,รวมคะแนนคำนวณ (Max 2000),ผลประเมิน,สถานะอนุมัติ\n";

    const escapeCsv = (val) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    };

    globalLecturersData.forEach(item => {
        const name = item.name || `${item.title || ''}${item.first_name_th || ''} ${item.last_name_th || ''}`.trim() || 'ไม่ระบุชื่อ';
        const position = item.position || item.academic_rank || 'อาจารย์';
        const credits = Number(item.credits || 0).toFixed(1);
        const m1Calc = Number(item.m1_calc || 0).toFixed(1);
        const m1Act = Number(item.m1_actual || 0).toFixed(1);
        const m2Calc = Number(item.m2_calc || 0).toFixed(1);
        const m2Act = Number(item.m2_actual || 0).toFixed(1);
        const m3Calc = Number(item.m3_calc || 0).toFixed(1);
        const m3Act = Number(item.m3_actual || 0).toFixed(1);
        const m4Calc = Number(item.m4_calc || 0).toFixed(1);
        const m4Act = Number(item.m4_actual || 0).toFixed(1);
        const m5Calc = Number(item.m5_calc || 0).toFixed(1);
        const totalAct = (Number(item.m1_actual || 0) + Number(item.m2_actual || 0) + Number(item.m3_actual || 0) + Number(item.m4_actual || 0) + Number(item.m5_actual || 0)).toFixed(1);
        const totalCalc = getTotalCalculatedScore(item).toFixed(1);
        const passText = isScorePassing(item) ? "ผ่านเกณฑ์" : "ต่ำกว่าเกณฑ์";
        const statusText = String(item.status || '').toUpperCase() === 'APPROVED' ? "อนุมัติแล้ว" : (String(item.status || '').toUpperCase() === 'REJECTED' ? "ส่งกลับแก้ไข" : "รอตรวจ");

        csv += `${escapeCsv(name)},${escapeCsv(position)},"ภาคปกติ",${credits},${m1Calc},${m1Act},${m2Calc},${m2Act},${m3Calc},${m3Act},${m4Calc},${m4Act},${m5Calc},${totalAct},${totalCalc},${escapeCsv(passText)},${escapeCsv(statusText)}\n`;
    });

    downloadCsvBlob(csv, `สรุปภาระงานอาจารย์_${termVal}.csv`);
}