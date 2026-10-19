const API_BASE_URL = 'http://34.236.42.23/api';

document.addEventListener('DOMContentLoaded', () => {
  renderAuthNav();
});

/**
 * ตรวจสอบ Token และ Role เพื่อแสดงผล Navbar ขวาบนตามสิทธิ์ของผู้ใช้ (Scope V3)
 */
function renderAuthNav() {
  const authNavSection = document.getElementById('auth-nav-section');
  if (!authNavSection) return;

  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');

  // 1. กรณีผู้ใช้เข้าสู่ระบบแล้ว (Authenticated User)
  if (token && userStr) {
    try {
      const user = JSON.parse(userStr);
      const userName = user.name || user.email || 'ผู้ใช้งาน';
      const role = (user.role || '').toLowerCase(); // แปลงเป็นตัวพิมพ์เล็กเพื่อความแม่นยำ

      let dashboardButtonHtml = '';

      // เช็ก Role เพื่อเลือกแสดงเฉพาะ Dashboard ที่มีสิทธิ์เข้าถึง
      if (role === 'officer') {
        dashboardButtonHtml = `
          <a href="dashboard.html" class="dashboard-icon" title="แดชบอร์ดเจ้าหน้าที่" aria-label="แดชบอร์ดเจ้าหน้าที่">
            <i class="fa fa-bar-chart" aria-hidden="true"></i><span>Officer Dashboard</span>
          </a>
        `;
      } else if (role === 'teacher' || role === 'professor') {
        dashboardButtonHtml = `
          <a href="teacher-dashboard.html" class="dashboard-icon" title="ข้อมูลส่วนตัวอาจารย์" aria-label="ข้อมูลส่วนตัวอาจารย์">
            <i class="fa fa-user-circle-o" aria-hidden="true"></i><span>Teacher Dashboard</span>
          </a>
        `;
      } else if (role === 'admin') {
        // กรณี Admin แสดงทั้งสอง Dashboard
        dashboardButtonHtml = `
          <a href="teacher-dashboard.html" class="dashboard-icon" title="ข้อมูลส่วนตัวอาจารย์">
            <i class="fa fa-user-circle-o" aria-hidden="true"></i><span>Teacher Dashboard</span>
          </a>
          <a href="dashboard.html" class="dashboard-icon" title="แดชบอร์ดเจ้าหน้าที่">
            <i class="fa fa-bar-chart" aria-hidden="true"></i><span>Officer Dashboard</span>
          </a>
        `;
      }

      // แสดง Navbar สำหรับคนที่ Login แล้ว
      authNavSection.innerHTML = `
        <div class="user-menu" style="display: flex; align-items: center; gap: 12px;">
          ${dashboardButtonHtml}
          
          <a href="teacher.html?id=${user.id || ''}" class="profile-link" 
             style="display: flex; align-items: center; gap: 6px; color: #ffffff; text-decoration: none; font-size: 13.5px; font-weight: 500;">
             <i class="fa fa-user"></i> ${userName}
          </a>

          <button id="logout-btn" type="button" style="
            background-color: rgba(255, 255, 255, 0.15);
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.4);
            padding: 6px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13.5px;
            transition: all 0.2s ease;
          ">
            <i class="fa fa-sign-out"></i> ออกจากระบบ
          </button>
        </div>
      `;

      const logoutBtn = document.getElementById('logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
      }

    } catch (e) {
      console.error('Error parsing user data:', e);
      handleLogout();
    }
  } else {
    // 2. กรณี Guest (ยังไม่ได้เข้าสู่ระบบ): แสดงเฉพาะปุ่ม "เข้าสู่ระบบ"
    authNavSection.innerHTML = `
      <a href="login.html" class="btn-login-header" style="
        color: #ffffff;
        text-decoration: none;
        padding: 6px 14px;
        border: 1px solid rgba(255, 255, 255, 0.6);
        border-radius: 6px;
        font-size: 13.5px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      ">
        <i class="fa fa-sign-in"></i> เข้าสู่ระบบ
      </a>
    `;
  }
}

/**
 * ฟังก์ชันออกจากระบบ
 */
function handleLogout() {
  if (confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
  }
}

/**
 * Helper Function สำหรับยิง API ที่ต้องแนบ Bearer Token
 */
async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.href = 'login.html';
    return null;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {})
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    alert('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
    return null;
  }

  return response;
}