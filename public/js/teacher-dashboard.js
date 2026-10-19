const API_URL = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://34.236.42.23/api';

(async () => {
  // 1. ตรวจสอบการเข้าสู่ระบบ (Authentication Check)
  const token = localStorage.getItem('token');
  if (!token) {
    alert('กรุณาเข้าสู่ระบบก่อนใช้งาน');
    window.location.href = 'login.html';
    return;
  }

  const form = document.getElementById('profile-form');
  const fields = document.getElementById('fields');
  const edit = document.getElementById('edit');
  const notice = document.getElementById('notice');
  const allInputNames = Array.from(fields.querySelectorAll('input, textarea'), input => input.name);
  const inputNames = Array.from(fields.querySelectorAll('input:not([readonly]), textarea:not([readonly])'), input => input.name);

  let profile = {};
  let editing = false;
  let profId = null;

  // อ่าน ID ของอาจารย์ที่เก็บบันทึกไว้ตอน Login
  try {
    const userData = localStorage.getItem('user');
    if (userData) {
      const user = JSON.parse(userData);
      profId = user.id || user.prof_id || user.professor_id || user.user_id;
    }
  } catch (e) {
    console.error('Error parsing user data:', e);
  }

  // 2. ฟังก์ชันดึงข้อมูลโปรไฟล์จาก Backend (FastAPI + RDS)
  async function fetchProfile() {
    try {
      if (!profId) {
        throw new Error('ไม่พบ ID ของอาจารย์ในเซสชัน กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
      }

      const response = await fetch(`${API_URL}/professors/${profId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // จัดการกรณี Token หมดอายุ
      if (response.status === 401 || response.status === 403) {
        alert('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
        return;
      }

      if (response.status === 404) {
        throw new Error(`ไม่พบข้อมูลอาจารย์รหัส: ${profId}`);
      }

      if (!response.ok) {
        throw new Error('ไม่สามารถดึงข้อมูลโปรไฟล์ได้');
      }

      profile = await response.json();
      render();
      document.getElementById('dashboard').hidden = false;

    } catch (error) {
      console.error('Fetch Profile Error:', error);
      showMessage(error.message, 'error');
    }
  }

  // 3. ฟังก์ชันแสดงผลข้อมูลลงใน HTML
  function render() {
    for (const name of allInputNames) {
      const input = form.elements.namedItem(name);
      if (input) {
        input.value = profile[name] || '';
        input.setCustomValidity('');
      }
    }

    const values = {
      'profile-name': `${profile.title || ''}${profile.first_name_th || ''} ${profile.last_name_th || ''}`.trim() || 'ไม่ระบุชื่อ',
      'profile-name-en': [profile.title_en, profile.first_name_en, profile.last_name_en].filter(Boolean).join(' '),
      'profile-rank': profile.academic_rank || 'อาจารย์',
      'profile-faculty': profile.faculty || 'ยังไม่ได้ระบุคณะ',
      'profile-department': profile.department || 'ยังไม่ได้ระบุสาขาวิชา',
      'profile-email': profile.email || ''
    };

    for (const [id, value] of Object.entries(values)) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    }

    const avatarEl = document.getElementById('avatar');
    if (avatarEl) {
      if (profile.profile_url && profile.profile_url.trim() !== '') {
        // หากมี profile_url ใน Database ให้สร้างแท็ก <img> มาแสดงรูป
        avatarEl.innerHTML = `<img src="${profile.profile_url}" alt="Profile Picture" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      } else {
        // หากไม่มี URL ให้แสดงตัวอักษรแรกของชื่อตามเดิม
        avatarEl.textContent = Array.from(profile.first_name_th || 'อ')[0];
      }
    }
  }

  function setEditing(value) {
    editing = value;
    fields.disabled = !value;
    edit.hidden = value;
    document.getElementById('actions').hidden = !value;
    document.getElementById('edit-hint').hidden = !value;
    document.getElementById('save-state').textContent = 'ข้อมูลจะเปลี่ยนแปลงเมื่อกดบันทึก';
  }

  function dirty() {
    return editing && inputNames.some(name => {
      const input = form.elements.namedItem(name);
      return input && input.value !== (profile[name] || '');
    });
  }

  function showMessage(text, kind = 'success') {
    notice.textContent = text;
    notice.dataset.kind = kind;
    notice.style.backgroundColor = kind === 'error' ? '#fdf2f2' : '#eefdf2';
    notice.style.color = kind === 'error' ? '#9b1c1c' : '#1e7e34';
    notice.hidden = false;
  }

  // Event Listeners
  edit.addEventListener('click', () => {
    notice.hidden = true;
    setEditing(true);
    const firstNameInput = form.elements.namedItem('first_name_th');
    if (firstNameInput) firstNameInput.focus();
  });

  document.getElementById('cancel').addEventListener('click', () => {
    render();
    setEditing(false);
    showMessage('ยกเลิกการแก้ไขแล้ว ข้อมูลกลับเป็นค่าก่อนแก้ไข');
    edit.focus();
  });

  form.addEventListener('input', event => {
    event.target.setCustomValidity('');
    document.getElementById('save-state').textContent = dirty() ? 'มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก' : 'ข้อมูลจะเปลี่ยนแปลงเมื่อกดบันทึก';
  });

  // 4. จัดการการบันทึกข้อมูล (PUT /professors/{profId})
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!editing) return;

    for (const name of inputNames) {
      const input = form.elements.namedItem(name);
      if (!input) continue;
      input.value = input.value.trim();
      input.setCustomValidity('');
      if (input.required && !input.value) input.setCustomValidity('กรุณากรอกข้อมูลในช่องนี้');
      if (input.type === 'url' && input.value && !/^https?:\/\//i.test(input.value)) {
        input.setCustomValidity('กรุณาใช้ลิงก์ที่ขึ้นต้นด้วย https:// หรือ http://');
      }
    }

    if (!form.reportValidity()) return;

    const updatedData = Object.fromEntries(inputNames.map(name => [name, form.elements.namedItem(name).value]));

    try {
      const response = await fetch(`${API_URL}/professors/${profId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'ไม่สามารถบันทึกข้อมูลลงฐานข้อมูลได้');
      }

      profile = await response.json();
      render();
      setEditing(false);
      showMessage('บันทึกข้อมูลลงในระบบเรียบร้อยแล้ว');
      edit.focus();

    } catch (error) {
      console.error('Save Profile Error:', error);
      showMessage(error.message, 'error');
    }
  });

  window.addEventListener('beforeunload', event => {
    if (dirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  // 5. โหลดข้อมูลเมื่อเปิดหน้าเว็บ
  await fetchProfile();
  setEditing(false);
})();