const API_BASE_URL = 'http://localhost:8000/api';

document.addEventListener('DOMContentLoaded', () => {
  renderAuthNav();
});

/**
 * ตรวจสอบ Token และสลับปุ่มระหว่าง "เข้าสู่ระบบ" กับ "ชื่อผู้ใช้ / ออกจากระบบ"
 */
function renderAuthNav() {
  const authNavSection = document.getElementById('auth-nav-section');
  if (!authNavSection) return;

  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');

  // กรณีผู้ใช้เข้าสู่ระบบแล้ว
  if (token && userStr) {
    try {
      const user = JSON.parse(userStr);
      const userName = user.name || user.email || 'ผู้ใช้งาน';

      authNavSection.innerHTML = `
        <div class="user-menu" style="display: flex; align-items: center; gap: 12px;">

          <a href="teacher-dashboard.html" class="dashboard-icon" title="ข้อมูลส่วนตัวอาจารย์" aria-label="ข้อมูลส่วนตัวอาจารย์">
            <i class="fa fa-user-circle-o" aria-hidden="true"></i><span>Teacher Dashboard</span>
          </a>
          <a href="dashboard.html" class="dashboard-icon" title="แดชบอร์ดเจ้าหน้าที่" aria-label="แดชบอร์ดเจ้าหน้าที่">
            <i class="fa fa-bar-chart" aria-hidden="true"></i><span>Officer Dashboard</span>
          </a>

            <a href="teacher.html?id=${user.id}" class="profile-link" 
            style="display: flex; align-items: center; gap: 12px; color: #ffffff; text-decoration: none; font-size: 13.5px;">
            ${userName}</a>

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

      // ผูก Event ปุ่ม Logout
      const logoutBtn = document.getElementById('logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
      }

    } catch (e) {
      console.error('Error parsing user data:', e);
      handleLogout();
    }
  } else {
    // กรณีผู้ใช้ยังไม่ได้เข้าสู่ระบบ
    authNavSection.innerHTML = `
      <a href="teacher-dashboard.html" class="dashboard-icon" title="ข้อมูลส่วนตัวอาจารย์" aria-label="ข้อมูลส่วนตัวอาจารย์">
        <i class="fa fa-user-circle-o" aria-hidden="true"></i><span>Teacher Dashboard</span>
      </a>
      <a href="dashboard.html" class="dashboard-icon" title="แดชบอร์ดเจ้าหน้าที่" aria-label="แดชบอร์ดเจ้าหน้าที่">
        <i class="fa fa-bar-chart" aria-hidden="true"></i><span>Officer Dashboard</span>
      </a>
      <a href="login.html" style="
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
 * ฟังก์ชันสำหรับออกจากระบบ (Logout)
 */
function handleLogout() {
  if (confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.reload();
  }
}

/**
 * Helper Function สำหรับยิง API ที่ต้องแนบ JWT Token
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

  // หาก Token หมดอายุ หรือไม่ถูกต้อง
  if (response.status === 401) {
    alert('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
    return null;
  }

  return response;
}
