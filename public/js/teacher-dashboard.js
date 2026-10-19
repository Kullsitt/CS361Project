const API_URL = window.DashboardAPI.base;

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
  let saving = false;
  let loaded = false;
  const displayValue = value => Array.isArray(value) ? value.join('\n') : value ?? '';
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
      let response = await fetch(`${API_URL}/profile/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // The deployed API may still predate /profile/me. Its public profile GET
      // can display the existing record while the new write API is deployed.
      if (response.status === 404 && profId) {
        const error = await response.clone().json().catch(() => ({}));
        if (error.detail === 'Not Found') {
          response = await fetch(`${API_URL}/professors/${encodeURIComponent(profId)}`, {
            headers: {Authorization: `Bearer ${token}`}
          });
        }
      }

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
      loaded = true;
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
        input.value = displayValue(profile[name]);
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
        const image = document.createElement('img');
        if (/^https?:\/\//i.test(profile.profile_url)) image.src = profile.profile_url;
        image.alt = 'รูปอาจารย์'; image.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
        avatarEl.replaceChildren(image);
      } else {
        // หากไม่มี URL ให้แสดงตัวอักษรแรกของชื่อตามเดิม
        avatarEl.textContent = Array.from(profile.first_name_th || 'อ')[0];
      }
    }
  }

  function setEditing(value) {
    editing = value;
    fields.disabled = !value;
    edit.hidden = value || !loaded;
    document.getElementById('actions').hidden = !value;
    document.getElementById('edit-hint').hidden = !value;
    document.getElementById('save-state').textContent = 'ข้อมูลจะเปลี่ยนแปลงเมื่อกดบันทึก';
  }

  function dirty() {
    return editing && inputNames.some(name => {
      const input = form.elements.namedItem(name);
      return input && input.value !== displayValue(profile[name]);
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
    if (!loaded || saving) return;
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
    if (!editing || saving) return;

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

    saving = true;
    fields.disabled = true;
    const buttons = [...document.getElementById('actions').querySelectorAll('button')];
    buttons.forEach(button => { button.disabled = true; });
    try {
      const response = await fetch(`${API_URL}/profile/me`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 404 && errorData.detail === 'Not Found') {
          throw new Error('เซิร์ฟเวอร์ยังไม่มี API บันทึกข้อมูลส่วนตัว ต้องอัปเดต Backend ก่อน ข้อมูลที่กรอกยังอยู่ในฟอร์ม');
        }
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
    } finally {
      saving = false; fields.disabled = !editing;
      buttons.forEach(button => { button.disabled = false; });
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
