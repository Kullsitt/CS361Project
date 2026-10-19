const API_BASE_URL = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? '/api' : 'http://34.236.42.23/api';

document.addEventListener('DOMContentLoaded', () => {
  renderAuthNav();
});

/**
 * ตรวจสอบ Token, Role และหน้าปัจจุบัน เพื่อแสดงผล Navbar ขวาบนอย่างถูกต้อง
 */
function renderAuthNav() {
  const authNavSection = document.getElementById('auth-nav-section');
  if (!authNavSection) return;

  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  
  // ดึงชื่อไฟล์หน้าปัจจุบัน (เช่น index.html หรือ dashboard.html)
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  if (token && userStr) {
    try {
      const user = JSON.parse(userStr);
      const userName = user.name || user.email || 'ผู้ใช้งาน';
      const role = (user.role || '').toLowerCase().trim();

      const isOfficer = role === 'officer' || role === 'staff' || userName.includes('เจ้าหน้าที่');
      const isTeacher = role === 'teacher' || role === 'professor';
      const isAdmin = role === 'admin';

      let userNavContent = '';

      // 1. กรณีเปิดอยู่ในหน้า Dashboard (dashboard.html หรือ teacher-dashboard.html): แสดงปุ่ม "กลับหน้าหลัก"
      if (currentPage === 'dashboard.html' || currentPage === 'teacher-dashboard.html') {
        userNavContent = `
          <a href="index.html" class="btn-home" style="
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: #ffffff;
            background-color: rgba(255, 255, 255, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.4);
            padding: 6px 14px;
            border-radius: 6px;
            text-decoration: none;
            font-size: 13.5px;
            font-weight: 500;
            transition: all 0.2s ease;
          ">
            <i class="fa fa-home" aria-hidden="true"></i>
            <span>กลับหน้าหลัก</span>
          </a>
        `;
      } 
      // 2. กรณีอยู่หน้า index.html: แสดงปุ่มเข้า Dashboard ตามสิทธิ์
      else {
        if (isOfficer) {
          userNavContent = `
            <a href="dashboard.html" class="btn-dashboard-officer" style="
              display: inline-flex;
              align-items: center;
              gap: 6px;
              color: #ffffff;
              background-color: rgba(255, 255, 255, 0.2);
              border: 1px solid rgba(255, 255, 255, 0.4);
              padding: 6px 14px;
              border-radius: 6px;
              text-decoration: none;
              font-size: 13.5px;
              font-weight: 500;
              transition: all 0.2s ease;
            ">
              <i class="fa fa-tachometer" aria-hidden="true"></i>
              <span>แดชบอร์ดการจัดการภาระงาน</span>
            </a>
          `;
        } else if (isTeacher) {
          userNavContent = `
            <a href="teacher-dashboard.html" style="color: #ffffff; text-decoration: none; font-size: 13.5px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;">
              <i class="fa fa-user-circle-o"></i> Teacher Dashboard
            </a>
            <a href="teacher.html?id=${user.id || ''}" class="profile-link" style="color: #ffffff; text-decoration: none; font-size: 13.5px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;">
              <i class="fa fa-user"></i> ${userName}
            </a>
          `;
        } else if (isAdmin) {
          userNavContent = `
            <a href="dashboard.html" style="color: #ffffff; text-decoration: none; font-size: 13.5px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;">
              <i class="fa fa-tachometer"></i> แดชบอร์ดการจัดการภาระงาน
            </a>
            <a href="teacher-dashboard.html" style="color: #ffffff; text-decoration: none; font-size: 13.5px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;">
              <i class="fa fa-user-circle-o"></i> Teacher Dashboard
            </a>
          `;
        } else {
          userNavContent = `
            <a href="dashboard.html" style="color: #ffffff; text-decoration: none; font-size: 13.5px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;">
              <i class="fa fa-tachometer"></i> แดชบอร์ดการจัดการภาระงาน
            </a>
          `;
        }
      }

      // แสดงผลบน Navbar
      authNavSection.innerHTML = `
        <div class="user-menu" style="display: flex; align-items: center; gap: 12px;">
          ${userNavContent}

          <button id="logout-btn" type="button" style="
            background-color: rgba(255, 255, 255, 0.15);
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.4);
            padding: 6px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13.5px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
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
    // กรณีไม่ได้เข้าสู่ระบบ
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
 * Helper Function สำหรับยิง API
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
