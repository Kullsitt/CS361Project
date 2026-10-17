// UI prototype only: no API, authentication, or persistent storage.
(() => {
  const form = document.getElementById('profile-form');
  const fields = document.getElementById('fields');
  const edit = document.getElementById('edit');
  const notice = document.getElementById('notice');
  const allInputNames = Array.from(fields.querySelectorAll('input, textarea'), input => input.name);
  const inputNames = Array.from(fields.querySelectorAll('input:not([readonly]), textarea:not([readonly])'), input => input.name);
  let profile = {
    title: 'ดร.', title_en: 'Dr.',
    first_name_th: 'กมล', last_name_th: 'วิชาการ',
    first_name_en: 'Kamon', last_name_en: 'Wichakan',
    academic_rank: 'ผู้ช่วยศาสตราจารย์', academic_rank_en: 'Assistant Professor',
    faculty: 'คณะวิทยาศาสตร์และเทคโนโลยี', department: 'สาขาวิชาวิทยาการคอมพิวเตอร์',
    expertise: 'วิศวกรรมซอฟต์แวร์\nการพัฒนาเว็บแอปพลิเคชัน\nการออกแบบฐานข้อมูล',
    research_interests: 'การประยุกต์ใช้ปัญญาประดิษฐ์ในการศึกษา\nการพัฒนาระบบสารสนเทศเพื่อสนับสนุนการเรียนรู้',
    education: 'ปรัชญาดุษฎีบัณฑิต สาขาวิทยาการคอมพิวเตอร์\nวิทยาศาสตรมหาบัณฑิต สาขาวิทยาการคอมพิวเตอร์\nวิทยาศาสตรบัณฑิต สาขาวิทยาการคอมพิวเตอร์',
    google_scholar: '', research_gate: '',
    email: 'kamon.w@example.com', phone_number: '02-000-0000 ต่อ 1234',
    office_address: 'อาคารบรรยายรวม ห้อง 301\nมหาวิทยาลัยธรรมศาสตร์ ศูนย์รังสิต'
  };
  let editing = false;

  function render() {
    for (const name of allInputNames) {
      const input = form.elements.namedItem(name);
      input.value = profile[name] || '';
      input.setCustomValidity('');
    }
    const values = {
      'profile-name': `${profile.title}${profile.first_name_th} ${profile.last_name_th}`,
      'profile-name-en': [profile.title_en, profile.first_name_en, profile.last_name_en].filter(Boolean).join(' '),
      'profile-rank': profile.academic_rank,
      'profile-faculty': profile.faculty || 'ยังไม่ได้ระบุคณะ',
      'profile-department': profile.department || 'ยังไม่ได้ระบุสาขาวิชา',
      'profile-email': profile.email,
      avatar: Array.from(profile.first_name_th)[0] || 'อ'
    };
    for (const [id, value] of Object.entries(values)) document.getElementById(id).textContent = value;
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
    return editing && inputNames.some(name => form.elements.namedItem(name).value !== (profile[name] || ''));
  }

  function message(text) {
    notice.textContent = text;
    notice.dataset.kind = 'success';
    notice.hidden = false;
  }

  edit.addEventListener('click', () => {
    notice.hidden = true;
    setEditing(true);
    form.elements.namedItem('first_name_th').focus();
  });

  document.getElementById('cancel').addEventListener('click', () => {
    render();
    setEditing(false);
    message('ยกเลิกการแก้ไขแล้ว ข้อมูลกลับเป็นค่าก่อนแก้ไข');
    edit.focus();
  });

  form.addEventListener('input', event => {
    event.target.setCustomValidity('');
    document.getElementById('save-state').textContent = dirty() ? 'มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก' : 'ข้อมูลจะเปลี่ยนแปลงเมื่อกดบันทึก';
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!editing) return;
    for (const name of inputNames) {
      const input = form.elements.namedItem(name);
      input.value = input.value.trim();
      input.setCustomValidity('');
      if (input.required && !input.value) input.setCustomValidity('กรุณากรอกข้อมูลในช่องนี้');
      if (input.type === 'url' && input.value && !/^https?:\/\//i.test(input.value)) input.setCustomValidity('กรุณาใช้ลิงก์ที่ขึ้นต้นด้วย https:// หรือ http://');
    }
    if (!form.reportValidity()) return;
    profile = { ...profile, ...Object.fromEntries(inputNames.map(name => [name, form.elements.namedItem(name).value])) };
    render();
    setEditing(false);
    message('อัปเดตข้อมูลตัวอย่างบนหน้านี้แล้ว • ยังไม่มีการบันทึกลงระบบ และข้อมูลจะรีเซ็ตเมื่อรีเฟรช');
    edit.focus();
  });

  window.addEventListener('beforeunload', event => {
    if (dirty()) { event.preventDefault(); event.returnValue = ''; }
  });
  render();
  setEditing(false);
  document.getElementById('dashboard').hidden = false;
})();
