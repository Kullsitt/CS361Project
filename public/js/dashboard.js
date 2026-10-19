// public/js/dashboard.js

let globalLecturersData = [];

function getApiBaseUrl() {
    if (typeof API_BASE_URL !== 'undefined') return API_BASE_URL;
    if (typeof window.API_BASE_URL !== 'undefined') return window.API_BASE_URL;
    return 'http://34.236.42.23/api';
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
        
        let rawList = [];
        if (Array.isArray(resData)) {
            rawList = resData;
        } else if (resData && Array.isArray(resData.submissions)) {
            rawList = resData.submissions;
        }

        // 🌟 กรองเฉพาะอาจารย์ที่มีการยื่น/ส่งแบบฟอร์มแล้วเท่านั้น
        globalLecturersData = rawList.filter(item => {
            return item.submission_id || 
                   (item.status && item.status !== 'UNSUBMITTED' && item.status !== 'NOT_SUBMITTED' && item.status !== 'DRAFT');
        });

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

    if (document.getElementById('kpi-total-faculty')) document.getElementById('kpi-total-faculty').innerText = `${totalFaculty} คน`;
    if (document.getElementById('kpi-pass-rate')) document.getElementById('kpi-pass-rate').innerText = `${passRate}%`;
    if (document.getElementById('kpi-avg-score')) document.getElementById('kpi-avg-score').innerText = avgCalc;
    if (document.getElementById('kpi-pending')) document.getElementById('kpi-pending').innerText = `${pendingCount} รายการ`;

    if (document.getElementById('kpi-total-sub')) document.getElementById('kpi-total-sub').innerText = `อาจารย์ที่ส่งภาระงานแล้ว`;
    if (document.getElementById('kpi-pass-sub')) document.getElementById('kpi-pass-sub').innerText = `${passCount} จาก ${totalFaculty} คนผ่านเกณฑ์`;
    if (document.getElementById('kpi-avg-sub')) document.getElementById('kpi-avg-sub').innerText = `คะแนนจริงเฉลี่ย ${avgActual}`;
}

function renderTable(data) {
    const tbody = document.getElementById('workload-table-body');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:20px;">ไม่พบรายการอาจารย์ที่ส่งภาระงาน</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => {
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