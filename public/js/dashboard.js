// public/js/dashboard.js

let globalLecturersData = [];

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
    const statusFilter = document.getElementById('status-filter');
    const searchInput = document.getElementById('search-lecturer');

    if (termFilter) termFilter.addEventListener('change', filterData);
    if (statusFilter) statusFilter.addEventListener('change', filterData);
    if (searchInput) searchInput.addEventListener('input', filterData);

    loadDashboardData();
});

async function loadDashboardData() {
    const statusVal = document.getElementById('status-filter')?.value || 'ALL';
    const searchVal = document.getElementById('search-lecturer')?.value || '';

    const params = new URLSearchParams();
    if (searchVal) params.append('search', searchVal.trim());

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

    const termVal = document.getElementById('term-filter')?.value || '2-2567';
    const [semester, year] = termVal.split('-');

    const name = lecturer.name || `${lecturer.title || ''}${lecturer.first_name_th || ''} ${lecturer.last_name_th || ''}`.trim() || 'ไม่ระบุชื่อ';
    const position = lecturer.position || lecturer.academic_rank || 'อาจารย์';

    document.getElementById("modal-lecturer-name").innerText = `รายละเอียดแบบฟอร์มภาระงาน - ${name} (ภาคการศึกษา ${semester}/${year})`;

    const totalActual = Number(lecturer.m1_actual || 0) + Number(lecturer.m2_actual || 0) + Number(lecturer.m3_actual || 0) + Number(lecturer.m4_actual || 0) + Number(lecturer.m5_actual || 0);
    const totalCalc = getTotalCalculatedScore(lecturer);
    const isPass = totalCalc >= 650;

    let html = `
      <div style="background:#f8fafc; padding:16px; border-radius:8px; margin-bottom:20px; border:1px solid #cbd5e1;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <p style="margin:0;"><b>ตำแหน่ง:</b> ${position} | <b>สาขาวิชา:</b> วิทยาการคอมพิวเตอร์</p>
          <span class="badge-status ${isPass ? 'status-pass' : 'status-fail'}">
            ${isPass ? 'ผ่านเกณฑ์ (≥ 650 คะแนน)' : 'ต่ำกว่าเกณฑ์ (< 650 คะแนน)'}
          </span>
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

    try {
        const res = await fetch(`${baseUrl}/workloads/officer/inspect/${profId}?academic_year=${year}&semester=${semester}`, { headers });
        let data = {};
        if (res.ok) {
            data = await res.json();
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
                    <td>ผู้สอนวิชาบรรยาย/ปฏิบัติการ</td>
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
    if (submissionId) {
        html += `
          <div style="margin-top:24px; padding-top:16px; border-top:1px solid #e2e8f0; display:flex; gap:12px; justify-content:flex-end;">
            <button style="background:#b91c1c; color:white; border:none; padding:10px 20px; border-radius:6px; font-weight:700; cursor:pointer;" onclick="changeSubmissionStatus('${submissionId}', 'REJECTED')">
              <i class="fa fa-reply"></i> ส่งกลับแก้ไข
            </button>
            <button style="background:#15803d; color:white; border:none; padding:10px 20px; border-radius:6px; font-weight:700; cursor:pointer;" onclick="changeSubmissionStatus('${submissionId}', 'APPROVED')">
              <i class="fa fa-check"></i> อนุมัติแบบฟอร์มภาระงาน
            </button>
          </div>
        `;
    }

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

function exportCSV() {
    alert("ระบบกำลังส่งออกไฟล์รายงาน CSV สรุปคะแนนภาระงานอาจารย์...");
}