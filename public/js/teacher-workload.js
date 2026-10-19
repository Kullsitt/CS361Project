(async () => {
  // 1. กำหนด API_URL ให้อยู่ใน Scope ของฟังก์ชัน
  const API_URL = window.DashboardAPI.base;
  const token = localStorage.getItem('token');
  let profId = null;

  try {
    const userData = localStorage.getItem('user');
    if (userData) {
      const user = JSON.parse(userData);
      profId = user.id || user.prof_id || user.professor_id || user.user_id;
    }
  } catch (e) {
    console.error('Error parsing user data:', e);
  }

  const categories = {
    teaching: ['1. งานสอน', ['1.1 วิชาบรรยาย (ปริญญาตรี)', '1.2 วิชาปฏิบัติการ (ปริญญาตรี)', '1.3 สัมมนา (ปริญญาตรี)', '1.4 ซีเนียร์โปรเจก / ปัญหาพิเศษ', '1.5 สหกิจศึกษา', '1.6 วิชาบรรยาย (โท / เอก)', '1.7 วิชาปฏิบัติการ (โท / เอก)', '1.8 สัมมนา (โท / เอก)', '1.9 วิทยานิพนธ์', '1.10 ปัญหาพิเศษ (โท / เอก)', '1.11 สารนิพนธ์ / ค้นคว้าอิสระ']],
    academic: ['2. งานวิชาการ', ['2.1 รายงานวิจัยฉบับสมบูรณ์', '2.2 รายงานความก้าวหน้า', '2.3.1 บทความวิจัยนานาชาติ', '2.3.2 Short Communication / บทความปริทัศน์', '2.3.3 วารสารในฐานข้อมูล TCI', '2.3.4 วารสารนานาชาติอื่น / Proceedings / Data Article', '2.3.5 วารสารระดับชาติอื่น / Proceedings', '2.4.1 นำเสนอผลงานระดับนานาชาติ', '2.4.2 นำเสนอผลงานระดับชาติ / สถาบัน', '2.5 สิทธิบัตร / สิ่งประดิษฐ์', '2.6.1 หนังสือ / ตำรา', '2.6.2 Book Chapter', '2.7 เอกสารและสื่อการสอน', '2.8.1 ทุนวิจัยภายนอก', '2.8.2 ทุนวิจัยอื่น', '2.9 รางวัลทางวิชาการ', '2.10 การนำผลงานวิจัยไปใช้ประโยชน์']],
    admin: ['3. งานบริหาร', ['3.1 งานบริหารในตำแหน่ง', '3.2 งานบริหารระดับสาขาวิชา', '3.3 ผู้ประสานงานประจำวิชา', '3.4 ผู้ประสานงานฝึกงาน / ฝึกภาคสนาม', '3.5 อาจารย์ที่ปรึกษา / PostMaster / PostDoc / Visiting Professor']],
    service: ['4. งานบริการวิชาการและอื่น ๆ', ['4.1.1 คณะทำงาน / กรรมการระดับคณะหรือสาขา', '4.2.1 กรรมการ / คณะทำงานนอกคณะ', '4.2.2 ตำแหน่งบริหารนอกคณะใน มธ.', '4.3 บริการวิชาการแก่สังคม', '4.4 ประเมินผลงานทางวิชาการ', '4.5 ประเมินตำแหน่งทางวิชาการ', '4.6 บรรณาธิการ / Editor']],
    special: ['5. คะแนนพิเศษ', ['คะแนนพิเศษ / ผลงานเพิ่มเติม']]
  };

  const schemas = {
    teaching: [['course', 'รหัสวิชา', 'text'], ['role', 'หน้าที่ / บทบาท', 'text'], ['hours', 'จำนวนชั่วโมง', 'number'], ['credits', 'หน่วยกิต', 'number'], ['students', 'จำนวนนักศึกษา', 'integer'], ['quantity', 'จำนวนเรื่อง / โครงงาน', 'integer'], ['share', 'สัดส่วนความรับผิดชอบ (%)', 'percent']],
    academic: [['role', 'บทบาท / ชนิดผลงาน', 'text'], ['share', 'สัดส่วนการมีส่วนร่วม (%)', 'percent'], ['source', 'แหล่งทุน / วารสาร / การประชุม', 'text'], ['level', 'ระดับ / ฐานข้อมูล / Quartile', 'text'], ['budget', 'งบประมาณ (บาท)', 'number'], ['quantity', 'จำนวนผลงาน / Chapter', 'integer']],
    admin: [['role', 'ตำแหน่ง / หน้าที่', 'text'], ['course', 'รหัสวิชา (ถ้ามี)', 'text'], ['students', 'จำนวนนักศึกษา', 'integer'], ['quantity', 'จำนวนงาน / รายวิชา', 'integer'], ['share', 'สัดส่วนความรับผิดชอบ (%)', 'percent']],
    service: [['role', 'หน้าที่ / บทบาท', 'text'], ['organization', 'หน่วยงาน / วารสาร', 'text'], ['level', 'ระดับผลงาน', 'text'], ['quantity', 'จำนวนคำสั่ง / เรื่อง / คน', 'integer'], ['share', 'สัดส่วนความรับผิดชอบ (%)', 'percent']],
    special: [['role', 'ประเภทผลงาน / เหตุผลประกอบ', 'text'], ['quantity', 'จำนวนผลงาน', 'integer'], ['share', 'สัดส่วนความรับผิดชอบ (%)', 'percent']]
  };

  const form = document.getElementById('workload-form');
  if (!form) return;

  const category = form.elements.category;
  const subtype = form.elements.subtype;
  const group = form.elements.group;
  const filter = document.getElementById('workload-filter');
  const list = document.getElementById('workload-list');
  const notice = document.getElementById('workload-notice');
  const common = ['semester', 'year', 'category', 'subtype', 'title', 'evidence_url', 'role_note', 'student_names'];
  const scoring = window.WorkloadScoring;

  let records = [];
  let busy = false;
  let editingId = null;
  let attachments = [];
  let changed = false;

  function option(value, label) { const el = document.createElement('option'); el.value = value; el.textContent = label; return el; }
  
  function activeSchema(type = subtype.value, role = form.elements.role?.value, categoryKey = category.value) {
    if (!scoring) return [];
    const visible = scoring.fields(type, role);
    return schemas[categoryKey].filter(([name]) => visible.includes(name));
  }

  function detailValues() {
    return Object.fromEntries(Array.from(document.getElementById('workload-details').querySelectorAll('input, select'), input => [input.name, input.value]));
  }

  for (const [key, [label]] of Object.entries(categories)) {
    if (category) category.append(option(key, label)); 
    if (filter) filter.append(option(key, label));
  }

  function details(values = {}, rebuildTypes = true) {
    if (!scoring) return;
    if (rebuildTypes) {
      const groups = scoring.groups[category.value];
      const selected = values.subtype ? groups.find(([, , codes]) => codes.includes(values.subtype.split(' ')[0]))?.[0] : group.value;
      group.replaceChildren(...groups.map(([key, title]) => option(key, title)));
      group.value = groups.some(([key]) => key === selected) ? selected : groups[0][0];
      const codes = groups.find(([key]) => key === group.value)[2];
      subtype.replaceChildren(...categories[category.value][1].filter(label => codes.includes(label.split(' ')[0])).map(label => option(label, label.replace(/^\d+(?:\.\d+)*\s+/, ''))));
    }
    if (values.subtype) subtype.value = values.subtype;
    const config = scoring.rule(subtype.value);
    const container = document.getElementById('workload-details');
    container.replaceChildren();

    for (const [name, title, type] of activeSchema(subtype.value, values.role || config.roles[0]?.[0])) {
      const label = document.createElement('label'); label.textContent = scoring.fieldLabel(subtype.value, name, title);
      const input = document.createElement(name === 'role' ? 'select' : 'input'); input.name = name;
      if (name === 'role') {
        input.append(...config.roles.map(([role], index) => {
          const entry = option(role, `${index + 1}. ${role}`);
          entry.disabled = config.unavailable.includes(index);
          return entry;
        }));
        if (!config.roles.length) input.append(option('', 'ยังไม่มีรายละเอียดในเอกสาร'));
        input.required = true;
        input.disabled = !config.roles.length;
        input.setAttribute('aria-describedby', 'role-guidance');
        input.value = values.role || config.roles[0]?.[0] || '';
      } else {
        input.type = type === 'text' ? 'text' : 'number';
        if (type === 'text') input.maxLength = name === 'course' ? 20 : name === 'organization' ? 255 : 300;
        else { input.min = '0'; input.step = type === 'integer' ? '1' : '0.01'; if (type === 'percent') input.max = '100'; }
        input.value = values[name] ?? (name === 'share' ? '100' : name === 'quantity' ? '1' : '');
        input.required = name === 'share' || (name === 'quantity' && config.basis === 'quantity') || (name === 'credits' && ['credits', 'credits3'].includes(config.basis));
        if (name === 'students') {
          input.placeholder = 'กรอกจำนวนนักศึกษาจริง เช่น 125';
          input.required = config.code === '1.1' || config.code === '3.3';
        }
      }
      label.append(input); container.append(label);
    }

    const custom = document.createElement('label'); custom.textContent = 'หมายเหตุเกี่ยวกับบทบาท';
    const roleNote = document.createElement('input'); roleNote.name = 'role_note'; roleNote.maxLength = 300; roleNote.value = values.role_note || ''; custom.append(roleNote); container.append(custom);
    if (form.elements.student_names) form.elements.student_names.value = values.student_names || '';
    
    const saveBtn = document.getElementById('workload-save');
    if (saveBtn) saveBtn.disabled = !config.roles.length;

    const guidance = document.getElementById('role-guidance');
    if (guidance) {
      guidance.textContent = !config.roles.length ? config.note : config.code === '2.5' ? 'ข้อ 4 ในเอกสารต้นฉบับไม่ครบ จึงยังเลือกไม่ได้' : '';
      guidance.hidden = !guidance.textContent;
    }
    updateScore();
  }

  function currentScore() {
    if (!scoring) return { status: 'pending', score: null };
    return scoring.evaluate({
      subtype: subtype.value, 
      role: form.elements.role?.value, 
      students: form.elements.students?.value, 
      credits: form.elements.credits?.value, 
      quantity: form.elements.quantity?.value, 
      share: form.elements.share?.value ?? '100'
    });
  }

  function updateScore() {
    if (!scoring) return;
    const result = currentScore();
    const liveScore = document.getElementById('live-score');
    if (liveScore) {
      liveScore.value = result.status === 'pending' ? 'รอประเมิน' : result.score === null ? '—' : result.score.toLocaleString('th-TH', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' คะแนน';
    }
    const scoreHelp = document.getElementById('score-help');
    if (scoreHelp) {
      scoreHelp.textContent = {
        pending:'บันทึกข้อมูลได้ คะแนนส่วนนี้รอการประเมินจากผู้รับผิดชอบ', 
        incomplete:'กรอกข้อมูลของงานให้ครบเพื่อคำนวณคะแนน', 
        unavailable:'ยังไม่มีเกณฑ์สำหรับรายการนี้', 
        calculated:'คะแนนคำนวณอัตโนมัติจากข้อมูลที่เลือก'
      }[result.status] || '';
    }
    const withStudents = scoring.hasStudents(subtype.value, form.elements.role?.value);
    const studentField = document.getElementById('student-names-field');
    if (studentField) studentField.hidden = !withStudents;
    if (!withStudents && form.elements.student_names) form.elements.student_names.value = '';
  }

  function announce(message) { 
    if (notice) {
      notice.textContent = message; 
      notice.hidden = false; 
    }
  }

  function reset() {
    form.reset(); editingId = null; attachments = []; changed = false; details();
    for (const input of form.elements) if (typeof input.setCustomValidity === 'function') input.setCustomValidity('');
    const selectedEv = document.getElementById('selected-evidence');
    if (selectedEv) selectedEv.textContent = '';
    const saveBtn = document.getElementById('workload-save');
    if (saveBtn) saveBtn.textContent = 'เพิ่มรายการภาระงาน';
    const cancelBtn = document.getElementById('workload-cancel');
    if (cancelBtn) cancelBtn.textContent = 'ล้างข้อมูล';
  }

  // 📥 1. ดึงข้อมูลภาระงานจาก API (ยิงตรงไปที่ /workloads?professor_id=...)
  // 1. ดึงข้อมูลภาระงานของอาจารย์ที่ล็อกอินอยู่จาก API
  async function fetchWorkloads() {
    try {
      if (!token) {
        console.warn('ไม่พบ Token การเข้าสู่ระบบ กรุณาล็อกอินใหม่');
        return;
      }
      
      // Backend จะอ่านอาจารย์ที่ล็อกอินอยู่ผ่าน Authorization Header
      const response = await fetch(`${API_URL}/workloads`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          alert('Session หมดอายุ กรุณาล็อกอินใหม่อีกครั้ง');
          window.location.href = '/login.html';
          return;
        }
        throw new Error('ไม่สามารถดึงข้อมูลภาระงานได้');
      }

      const data = await response.json();
      records = Array.isArray(data) ? data : data.data || [];
      render();
    } catch (err) {
      console.error('Fetch Workloads Error:', err);
      announce('โหลดรายการไม่สำเร็จ กรุณารีเฟรชเพื่อลองใหม่');
    }
  }

  function render() {
    if (!list) return;
    list.replaceChildren();
    const countEl = document.getElementById('workload-count');
    if (countEl) countEl.textContent = `${records.length} รายการ`;
    const visible = records.filter(record => filter.value === 'all' || record.category === filter.value);
    
    if (!visible.length) {
      const empty = document.createElement('p'); empty.className = 'workload-empty';
      empty.textContent = records.length ? 'ยังไม่มีรายการในหมวดนี้' : 'ยังไม่มีภาระงาน กรอกข้อมูลด้านบนเพื่อเพิ่มรายการแรก'; 
      list.append(empty);
    }

    for (const record of visible) {
      const card = document.createElement('article'); card.className = 'workload-record';
      const catLabel = categories[record.category] ? categories[record.category][0] : record.category;
      const badge = document.createElement('p'); badge.className = 'eyebrow'; badge.textContent = `${catLabel} · ${record.semester === 'summer' ? 'ฤดูร้อน' : 'ภาค ' + record.semester}/${record.year}`;
      const title = document.createElement('h4'); title.textContent = record.title;
      const type = document.createElement('p'); type.className = 'muted'; type.textContent = (record.subtype || '').replace(/^\d+(?:\.\d+)*\s+/, '');
      const summary = document.createElement('p'); summary.className = 'muted';
      
      summary.textContent = (record.subtype ? activeSchema(record.subtype, record.role, record.category) : [])
        .filter(([key]) => record[key] != null && record[key] !== '')
        .map(([key, label]) => `${scoring.fieldLabel(record.subtype, key, label)}: ${record[key]}`).join(' · ');
      
      card.append(badge, title, type, summary);
      
      const score = document.createElement('p'); score.className = 'record-score';
      const scoreVal = typeof record.score === 'number' ? record.score.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00';
      score.textContent = record.score_status === 'pending' ? 'คะแนน: รอประเมิน' : `คะแนน: ${scoreVal}`;
      card.append(score);

      if (record.role_note) { const note = document.createElement('p'); note.textContent = record.role_note; card.append(note); }
      if (record.student_names) { const students = document.createElement('p'); students.className = 'student-names-summary'; students.textContent = 'นักศึกษาที่เกี่ยวข้อง:\n' + record.student_names; card.append(students); }
      
      const more = document.createElement('details'); const heading = document.createElement('summary'); heading.textContent = 'ดูรายละเอียดและหลักฐาน'; more.append(heading);
      if (record.attachments && record.attachments.length) {
        const p = document.createElement('p'); p.textContent = `ไฟล์ที่เลือก: ${Array.isArray(record.attachments) ? record.attachments.join(', ') : record.attachments}`;
        more.append(p);
      }
      if (record.evidence_url && /^https?:\/\//i.test(record.evidence_url)) {
        const a = document.createElement('a'); a.href = record.evidence_url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'เปิดลิงก์หลักฐาน ↗'; 
        more.append(a); 
      }
      card.append(more);

      const actions = document.createElement('div'); actions.className = 'workload-actions';
      
      // ปุ่มแก้ไข
      const editBtn = document.createElement('button'); editBtn.type = 'button'; editBtn.className = 'secondary'; editBtn.textContent = 'แก้ไข';
      editBtn.dataset.action = 'edit'; editBtn.dataset.id = record.id; editBtn.setAttribute('aria-label', `แก้ไข ${record.title}`); 
      editBtn.disabled = record.editable === false;
      if (record.editable === false) editBtn.title = 'รายการเดิมที่ยังไม่ระบุประเภท หรือผ่านการพิจารณาแล้ว';
      actions.append(editBtn);
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button'; deleteBtn.className = 'secondary'; deleteBtn.textContent = 'ลบ';
      deleteBtn.dataset.action = 'delete'; deleteBtn.dataset.id = record.id;
      deleteBtn.disabled = record.deletable === false;
      deleteBtn.setAttribute('aria-label', `ลบ ${record.title}`);
      actions.append(deleteBtn);

      card.append(actions); 
      list.append(card);
    }
  }

  // Event Listeners
  if (category) category.addEventListener('change', () => { group.value = ''; details(); });
  if (group) group.addEventListener('change', () => details());
  if (subtype) subtype.addEventListener('change', () => {
    const values = detailValues();
    delete values.role;
    details(values, false);
  });

  form.addEventListener('change', event => {
    changed = true;
    if (event.target.name === 'role') {
      details({...detailValues(), student_names:form.elements.student_names?.value}, false);
      if (form.elements.role) form.elements.role.focus();
    }
    updateScore();
  });

  form.addEventListener('input', event => {
    changed = true; event.target.setCustomValidity('');
    updateScore();
  });

  if (form.elements.attachments) {
    form.elements.attachments.addEventListener('change', () => {
      attachments = Array.from(form.elements.attachments.files, file => file.name);
      const selectedEv = document.getElementById('selected-evidence');
      if (selectedEv) selectedEv.textContent = attachments.join(', '); 
      changed = true;
    });
  }

  // 📤 2. ส่งข้อมูลบันทึก / แก้ไข ไปยัง API (Backend)
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const names = [...common, ...activeSchema().map(([name]) => name)];
    for (const name of names) { 
      const input = form.elements.namedItem(name); 
      if (input) {
        input.value = input.value.trim(); 
        input.setCustomValidity(''); 
      }
    }

    if (!form.elements.title.value) form.elements.title.setCustomValidity('กรุณาระบุชื่อรายการภาระงาน');
    const url = form.elements.evidence_url;
    if (url && url.value && !/^https?:\/\//i.test(url.value)) url.setCustomValidity('กรุณาใช้ลิงก์ http:// หรือ https://');
    if (!form.reportValidity()) return;

    const result = currentScore();
    if (!['calculated', 'pending'].includes(result.status)) { announce('กรุณาเลือกบทบาทและกรอกข้อมูลของงานให้ครบถ้วน'); return; }

    const isEditing = editingId !== null;
    const payload = {
      ...Object.fromEntries(names.map(name => [name, form.elements.namedItem(name)?.value || ''])),
      attachments: attachments
    };

    busy = true;
    const controls = [...form.querySelectorAll('input, select, textarea, button')];
    const disabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    try {
      const targetEndpoint = isEditing 
        ? `${API_URL}/workloads/${encodeURIComponent(editingId)}`
        : `${API_URL}/workloads`;

      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(targetEndpoint, {
        method: method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || 'ไม่สามารถบันทึกข้อมูลภาระงานลงฐานข้อมูลได้');
      }

      announce(isEditing ? 'แก้ไขรายการภาระงานเรียบร้อยแล้ว' : 'เพิ่มรายการภาระงานเรียบร้อยแล้ว');
      filter.value = 'all'; 
      reset(); 
      await fetchWorkloads(); // โหลดข้อมูลใหม่จาก DB

    } catch (err) {
      console.error('Save Workload Error:', err);
      announce(err.message);
    } finally {
      controls.forEach((control, index) => { if (control.isConnected) control.disabled = disabled[index]; });
      busy = false;
      updateScore();
    }
  });

  const cancelBtn = document.getElementById('workload-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => { reset(); announce('ยกเลิกข้อมูลในฟอร์มแล้ว'); });
  if (filter) filter.addEventListener('change', render);

  // ✏️ 3. จัดการปุ่มแก้ไขในตาราง
  list.addEventListener('click', async event => {
    if (busy) return;
    const button = event.target.closest('button[data-action]'); if (!button) return;
    const record = records.find(item => String(item.id) === String(button.dataset.id)); if (!record) return;

    if (button.dataset.action === 'delete') {
      if (!window.confirm(`ต้องการลบ "${record.title}" หรือไม่?`)) return;
      busy = true; button.disabled = true;
      try {
        await window.DashboardAPI.request(`/workloads/${encodeURIComponent(record.id)}`, {method: 'DELETE'});
        records = records.filter(item => item.id !== record.id);
        if (editingId === record.id) reset();
        render(); announce('ลบรายการภาระงานแล้ว');
      } catch (error) { announce(error.message); button.disabled = false; }
      finally { busy = false; }
      return;
    }

    if (button.dataset.action === 'edit') {
      if (changed && !window.confirm('มีข้อมูลที่ยังไม่ได้บันทึก ต้องการเปลี่ยนไปแก้ไขรายการนี้หรือไม่?')) return;
      reset(); 
      if (category) category.value = record.category; 
      details(record);
      
      for (const name of common) {
        if (form.elements.namedItem(name)) {
          form.elements.namedItem(name).value = record[name] ?? '';
        }
      }
      
      updateScore();
      editingId = record.id; 
      attachments = Array.isArray(record.attachments) ? [...record.attachments] : [];
      
      const selectedEv = document.getElementById('selected-evidence');
      if (selectedEv) selectedEv.textContent = attachments.join(', ');
      
      const saveBtn = document.getElementById('workload-save');
      if (saveBtn) saveBtn.textContent = 'บันทึกการแก้ไขภาระงาน';
      
      const cancelBtn = document.getElementById('workload-cancel');
      if (cancelBtn) cancelBtn.textContent = 'ยกเลิกการแก้ไข';
      
      announce('กำลังแก้ไข: ' + record.title); 
      if (form.elements.title) form.elements.title.focus();
    }
  });

  // โหลดข้อมูลเมื่อเริ่มต้น
  window.addEventListener('beforeunload', event => {
    if (changed || busy) { event.preventDefault(); event.returnValue = ''; }
  });
  details(); 
  await fetchWorkloads();
})();
