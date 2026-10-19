// public/js/dashboard.js

let globalLecturersData = [];

// ฟังก์ชันช่วยดึง API Base URL อย่างปลอดภัย
function getApiBaseUrl() {
    if (typeof API_BASE_URL !== 'undefined') return API_BASE_URL;
    if (typeof window.API_BASE_URL !== 'undefined') return window.API_BASE_URL;
    return 'http://34.236.42.23/api';
}

document.addEventListener('DOMContentLoaded', () => {
    // ผูก Event Listener สำหรับส่วน Filter และ Search
    const termFilter = document.getElementById('term-filter');
    const statusFilter = document.getElementById('status-filter');
    const searchInput = document.getElementById('search-lecturer');

    if (termFilter) termFilter.addEventListener('change', filterData);
    if (statusFilter) statusFilter.addEventListener('change', filterData);
    if (searchInput) searchInput.addEventListener('input', filterData);

    loadDashboardData();
});

async function loadDashboardData() {
    const termVal = document.getElementById('term-filter')?.value || '2-2567';
    const statusVal = document.getElementById('status-filter')?.value || 'ALL';
    const searchVal = document.getElementById('search-lecturer')?.value || '';

    const [semester, year] = termVal.split('-');

    const params = new URLSearchParams();
    if (year) params.append('academic_year', year);
    if (semester) params.append('semester', semester);
    if (statusVal !== 'ALL') params.append('status', statusVal);
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

        if (!response.ok) throw new Error('ไม่สามารถดึงข้อมูลภาระงานได้');

        const resData = await response.json();
        
        // รองรับ Response ทั้งแบบ Array ตรงๆ และแบบ Object { summary: {...}, submissions: [...] }
        if (Array.isArray(resData)) {
            globalLecturersData = resData;
        } else if (resData && Array.isArray(resData.submissions)) {
            globalLecturersData = resData.submissions;
        } else {
            globalLecturersData = [];
        }

        updateKPIs(globalLecturersData);
        renderTable(globalLecturersData);
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        const tbody = document.getElementById('workload-table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:#dc2626; padding:20px;">เกิดข้อผิดพลาดในการดึงข้อมูล: ${error.message}</td></tr>`;
        }
    }
}

function updateKPIs(data) {
    const totalFaculty = data.length;
    let passCount = 0;
    let pendingCount = 0;
    let totalCalcScoreSum = 0;
    let totalActualScoreSum = 0;

    data.forEach(item => {
        const totalActual = Number(item.m1_actual || 0) + Number(item.m2_actual || 0) + Number(item.m3_actual || 0) + Number(item.m4_actual || 0) + Number(item.m5_actual || 0);
        const totalCalc = Number(item.m1_calc || 0) + Number(item.m2_calc || 0) + Number(item.m3_calc || 0) + Number(item.m4_calc || 0) + Number(item.m5_calc || 0) || Number(item.total_score || 0);

        totalActualScoreSum += totalActual;
        totalCalcScoreSum += totalCalc;

        if (totalCalc >= 650 || item.status === 'PASS' || item.status === 'APPROVED') {
            passCount++;
        }
        if (item.status === 'PENDING') {
            pendingCount++;
        }
    });

    const passRate = totalFaculty > 0 ? ((passCount / totalFaculty) * 100).toFixed(1) : '0.0';
    const avgCalc = totalFaculty > 0 ? (totalCalcScoreSum / totalFaculty).toFixed(1) : '0.0';
    const avgActual = totalFaculty > 0 ? (totalActualScoreSum / totalFaculty).toFixed(1) : '0.0';

    // อัปเดตตัวเลขหลัก
    if (document.getElementById('kpi-total-faculty')) document.getElementById('kpi-total-faculty').innerText = `${totalFaculty} คน`;
    if (document.getElementById('kpi-pass-rate')) document.getElementById('kpi-pass-rate').innerText = `${passRate}%`;
    if (document.getElementById('kpi-avg-score')) document.getElementById('kpi-avg-score').innerText = avgCalc;
    if (document.getElementById('kpi-pending')) document.getElementById('kpi-pending').innerText = `${pendingCount} รายการ`;

    // อัปเดตข้อความย่อยบรรทัดล่าง
    if (document.getElementById('kpi-total-sub')) document.getElementById('kpi-total-sub').innerText = `อาจารย์ในระบบทั้งหมด`;
    if (document.getElementById('kpi-pass-sub')) document.getElementById('kpi-pass-sub').innerText = `${passCount} จาก ${totalFaculty} คนผ่านเกณฑ์`;
    if (document.getElementById('kpi-avg-sub')) document.getElementById('kpi-avg-sub').innerText = `คะแนนจริงเฉลี่ย ${avgActual}`;
}

function renderTable(data) {
    const tbody = document.getElementById('workload-table-body');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:20px;">ไม่พบข้อมูลภาระงานอาจารย์</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => {
        // จัดการชื่อและตำแหน่งให้รองรับทั้ง DB Schema และ Mock Field
        const name = item.name || `${item.title || ''}${item.first_name_th || ''} ${item.last_name_th || ''}`.trim() || 'ไม่ระบุชื่อ';
        const position = item.position || item.academic_rank || 'อาจารย์';
        const profId = item.id || item.submission_id || item.professor_id;

        const totalActual = Number(item.m1_actual || 0) + Number(item.m2_actual || 0) + Number(item.m3_actual || 0) + Number(item.m4_actual || 0) + Number(item.m5_actual || 0);
        const totalCalc = Number(item.m1_calc || 0) + Number(item.m2_calc || 0) + Number(item.m3_calc || 0) + Number(item.m4_calc || 0) + Number(item.m5_calc || 0) || Number(item.total_score || 0);

        let statusBadge = '';
        if (totalCalc >= 650 || item.status === 'PASS' || item.status === 'APPROVED') {
            statusBadge = `<span class="badge-status status-pass"><i class="fa fa-check-circle"></i> ผ่านเกณฑ์</span>`;
        } else if (item.status === 'FAIL' || item.status === 'REJECTED') {
            statusBadge = `<span class="badge-status status-fail"><i class="fa fa-times-circle"></i> ต่ำกว่าเกณฑ์</span>`;
        } else {
            statusBadge = `<span class="badge-status status-pending"><i class="fa fa-clock-o"></i> รอตรวจ</span>`;
        }

        return `
            <tr>
                <td>
                    <b>${name}</b><br>
                    <small style="color:#666;">${position}</small>
                </td>
                <td><span class="track-tag track-regular">ภาคปกติ</span></td>
                <td style="text-align:center;"><b>${Number(item.credits || 0).toFixed(2)}</b> นก.</td>
                <td><b>${Number(item.m1_calc || 0).toFixed(1)}</b> <br><small style="color:#888;">(${Number(item.m1_actual || 0).toFixed(1)})</small></td>
                <td><b>${Number(item.m2_calc || 0).toFixed(1)}</b> <br><small style="color:#888;">(${Number(item.m2_actual || 0).toFixed(1)})</small></td>
                <td><b>${Number(item.m3_calc || 0).toFixed(1)}</b> <br><small style="color:#888;">(${Number(item.m3_actual || 0).toFixed(1)})</small></td>
                <td><b>${Number(item.m4_calc || 0).toFixed(1)}</b> <br><small style="color:#888;">(${Number(item.m4_actual || 0).toFixed(1)})</small></td>
                <td><b>${Number(item.m5_calc || 0).toFixed(1)}</b></td>
                <td style="color:#555;">${totalActual.toFixed(1)}</td>
                <td><b style="font-size:15px; color:#8C1D24;">${totalCalc.toFixed(1)}</b></td>
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

    const name = lecturer.name || `${lecturer.title || ''}${lecturer.first_name_th || ''} ${lecturer.last_name_th || ''}`.trim() || 'ไม่ระบุชื่อ';
    const position = lecturer.position || lecturer.academic_rank || 'อาจารย์';

    document.getElementById("modal-lecturer-name").innerText = `รายละเอียดแบบฟอร์มภาระงาน - ${name}`;

    const totalActual = Number(lecturer.m1_actual || 0) + Number(lecturer.m2_actual || 0) + Number(lecturer.m3_actual || 0) + Number(lecturer.m4_actual || 0) + Number(lecturer.m5_actual || 0);
    const totalCalc = Number(lecturer.m1_calc || 0) + Number(lecturer.m2_calc || 0) + Number(lecturer.m3_calc || 0) + Number(lecturer.m4_calc || 0) + Number(lecturer.m5_calc || 0) || Number(lecturer.total_score || 0);

    let html = `
      <div style="background:#f8fafc; padding:16px; border-radius:8px; margin-bottom:20px; border:1px solid #e2e8f0;">
        <p style="margin:0 0 6px 0;"><b>ตำแหน่ง:</b> ${position} | <b>สาขาวิชา:</b> วิทยาการคอมพิวเตอร์</p>
        <p style="margin:0;"><b>สรุปคะแนนคำนวณ:</b> <span style="font-size:18px; font-weight:700; color:#8C1D24;">${totalCalc.toFixed(1)} / 2,000 คะแนน</span> (คะแนนจริง ${totalActual.toFixed(1)}) | เกณฑ์ขั้นต่ำ <b>650 คะแนน</b></p>
      </div>

      <h4 style="margin-bottom:8px; color:#1e293b;">สรุปคะแนนรายหมวดตามแบบฟอร์ม</h4>
      <table class="score-breakdown-table">
        <thead>
          <tr><th>หมวดภาระงาน</th><th>คะแนนจริง</th><th>คะแนนคำนวณ</th><th>เพดานคะแนน</th></tr>
        </thead>
        <tbody>
          <tr><td>หมวด 1: งานสอน</td><td>${Number(lecturer.m1_actual || 0).toFixed(1)}</td><td><b>${Number(lecturer.m1_calc || 0).toFixed(1)}</b></td><td>900</td></tr>
          <tr><td>หมวด 2: งานวิชาการ</td><td>${Number(lecturer.m2_actual || 0).toFixed(1)}</td><td><b>${Number(lecturer.m2_calc || 0).toFixed(1)}</b></td><td>900</td></tr>
          <tr><td>หมวด 3: งานบริหาร</td><td>${Number(lecturer.m3_actual || 0).toFixed(1)}</td><td><b>${Number(lecturer.m3_calc || 0).toFixed(1)}</b></td><td>400</td></tr>
          <tr><td>หมวด 4: งานบริการวิชาการ</td><td>${Number(lecturer.m4_actual || 0).toFixed(1)}</td><td><b>${Number(lecturer.m4_calc || 0).toFixed(1)}</b></td><td>300</td></tr>
          <tr><td>หมวด 5: คะแนนพิเศษ</td><td>${Number(lecturer.m5_actual || 0).toFixed(1)}</td><td><b>${Number(lecturer.m5_calc || 0).toFixed(1)}</b></td><td>100</td></tr>
        </tbody>
      </table>
    `;

    const baseUrl = getApiBaseUrl();
    const token = localStorage.getItem('token') || localStorage.getItem('access_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
        const res = await fetch(`${baseUrl}/workloads/officer/inspect/${profId}`, { headers });
        if (res.ok) {
            const details = await res.json();
            if (details.teaching && details.teaching.length > 0) {
                html += `
                  <h4 style="margin-top:20px; margin-bottom:8px; color:#1e293b;">รายละเอียดรายวิชาในหมวด 1 (งานสอน)</h4>
                  <table class="score-breakdown-table">
                    <thead><tr><th>รหัส-ชื่อวิชา</th><th>ชั่วโมง</th><th>หน่วยกิต</th><th>คะแนน</th></tr></thead>
                    <tbody>
                `;
                details.teaching.forEach(t => {
                    html += `<tr><td><b>${t.code || ''}</b> ${t.name || ''}</td><td>${t.hours || 0} ชม.</td><td>${t.credits || 0} นก.</td><td>${t.score || 0}</td></tr>`;
                });
                html += `</tbody></table>`;
            }
        }
    } catch (e) {
        console.error("Error fetching inspect details:", e);
    }

    const submissionId = lecturer.submission_id || lecturer.id;
    if (submissionId) {
        html += `
          <div style="margin-top:24px; display:flex; gap:12px;">
            <button style="background:#15803d; color:white; border:none; padding:10px 20px; border-radius:6px; font-weight:700; cursor:pointer;" onclick="changeSubmissionStatus('${submissionId}', 'APPROVED')">
              <i class="fa fa-check"></i> อนุมัติแบบฟอร์มภาระงาน
            </button>
            <button style="background:#b91c1c; color:white; border:none; padding:10px 20px; border-radius:6px; font-weight:700; cursor:pointer;" onclick="changeSubmissionStatus('${submissionId}', 'REJECTED')">
              <i class="fa fa-reply"></i> ส่งกลับแก้ไข
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
            alert('ไม่สามารถอัปเดตสถานะได้');
        }
    } catch (e) {
        console.error('Error changing status:', e);
    }
}

function closeModal() {
    document.getElementById("inspectModal").style.display = "none";
}

function exportCSV() {
    alert("ระบบกำลังส่งออกไฟล์รายงาน CSV สรุปคะแนนภาระงานอาจารย์...");
}