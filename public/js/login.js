const API_URL = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://18.215.169.239/api';

document.addEventListener('DOMContentLoaded', () => {
  // 1. เช็กว่าผู้ใช้ล็อกอินไว้อยู่แล้วหรือไม่ ถ้ามี Token ให้ย้ายไปหน้าหลักทันที
  const existingToken = localStorage.getItem('token');
  if (existingToken) {
    window.location.href = 'index.html';
    return;
  }

  const form = document.querySelector('form');
  const btnSubmit = form.querySelector('.btn-submit-login');

  // 2. สร้างกล่องแสดง Error Message ลอยไว้ด้านบนสุดของฟอร์ม
  const errorContainer = document.createElement('div');
  errorContainer.style.cssText = `
    color: #8C1D24;
    background-color: #fdf2f2;
    border: 1px solid #f8b4b4;
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 13.5px;
    margin-bottom: 16px;
    display: none;
    text-align: center;
  `;
  form.insertBefore(errorContainer, form.firstChild);

  // 3. จัดการการ Submit ฟอร์มเข้าสู่ระบบ
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // รีเซ็ตการแสดงผล Error และเปลี่ยนสถานะปุ่ม
    errorContainer.style.display = 'none';
    btnSubmit.disabled = true;
    const originalBtnText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = '<i class="fa fa-circle-o-notch fa-spin"></i> กำลังเข้าสู่ระบบ...';

    // ดึงค่าจาก id "username" และ "password"
    const email = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
      // 4. ยิง Fetch API ไปที่ /api/auth/login
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      }

      // 5. บันทึก Token และ User Profile ลงใน localStorage
      localStorage.setItem('token', result.access_token);
      localStorage.setItem('user', JSON.stringify(result.user));

      // 6. เปลี่ยนหน้าไปยัง index.html
      window.location.href = 'index.html';

    } catch (error) {
      console.error('Login Error:', error);
      errorContainer.innerText = error.message;
      errorContainer.style.display = 'block';
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalBtnText;
    }
  });
});