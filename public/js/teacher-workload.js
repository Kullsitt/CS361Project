// Workload UI prototype. Records and attachment names stay in memory only.
/* ===== WORKLOAD_SCORE: จุดที่ต้องแก้หากยกเลิกช่องคะแนน =====
 * ค้นหา WORKLOAD_SCORE เพื่อดูส่วนที่เกี่ยวข้องใน HTML / CSS / JS
 * 1. ลบ score-panel ใน HTML และสไตล์ score-panel / live-score / record-score
 * 2. ไม่มีช่องกรอก weight หรือสูตรใน UI; น้ำหนักมาจาก workload-scoring.js เท่านั้น
 * 3. ลบส่วนแสดงคะแนนใน updateScore() แต่เก็บส่วนแสดงช่องชื่อนักศึกษาไว้
 * 4. ลบการเรียก evaluate ก่อนบันทึก, score / score_status ใน record และคะแนนบนการ์ด
 * 5. ปรับ required ของ credits / quantity / share หากไม่บังคับใช้คำนวณแล้ว
 * ยังต้องเก็บ workload-scoring.js และ scoring.rule() หากใช้ dropdown บทบาทเดิม
 * เพราะไฟล์นั้นมีทั้งรายการบทบาทและสูตรคะแนน ไม่ใช่เฉพาะช่องแสดงผล
 * หมายเหตุ: ตอนนี้เป็นคอมเมนต์อธิบายเท่านั้น ระบบคะแนนยังทำงานตามเดิม
 * ===================================================== */
(() => {
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
  const category = form.elements.category;
  const subtype = form.elements.subtype;
  const group = form.elements.group;
  const filter = document.getElementById('workload-filter');
  const list = document.getElementById('workload-list');
  const notice = document.getElementById('workload-notice');
  const common = ['semester', 'year', 'category', 'subtype', 'title', 'evidence_url', 'role_note', 'student_names'];
  const scoring = window.WorkloadScoring;
  let records = [];
  let nextId = 1;
  let editingId = null;
  let attachments = [];
  let changed = false;

  function option(value, label) { const el = document.createElement('option'); el.value = value; el.textContent = label; return el; }
  function activeSchema(type = subtype.value, role = form.elements.role?.value, categoryKey = category.value) {
    const visible = scoring.fields(type, role);
    return schemas[categoryKey].filter(([name]) => visible.includes(name));
  }
  function detailValues() {
    return Object.fromEntries(Array.from(document.getElementById('workload-details').querySelectorAll('input, select'), input => [input.name, input.value]));
  }
  for (const [key, [label]] of Object.entries(categories)) {
    category.append(option(key, label)); filter.append(option(key, label));
  }
  function details(values = {}, rebuildTypes = true) {
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
        if (!config.roles.length) input.append(option('', 'ยังไม่มีรายละเอียดใน PDF'));
        input.required = true;
        input.disabled = !config.roles.length;
        input.setAttribute('aria-describedby', 'role-guidance');
        input.value = values.role || config.roles[0]?.[0] || '';
      } else {
        input.type = type === 'text' ? 'text' : 'number';
        if (type === 'text') input.maxLength = 300;
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
    form.elements.student_names.value = values.student_names || '';
    document.getElementById('workload-save').disabled = !config.roles.length;
    // เงื่อนไข/น้ำหนักเก็บใน scoring.rule สำหรับผู้พัฒนา ไม่แสดงสูตรให้ผู้กรอก
    const guidance = document.getElementById('role-guidance');
    guidance.textContent = !config.roles.length ? config.note : config.code === '2.5' ? 'ข้อ 4 ในเอกสารต้นฉบับไม่ครบ จึงยังเลือกไม่ได้' : '';
    guidance.hidden = !guidance.textContent;
    updateScore();
  }
  // ===== START WORKLOAD_SCORE: อ่านข้อมูล คำนวณ และแสดงคะแนนทันที =====
  function currentScore() {
    return scoring.evaluate({subtype:subtype.value, role:form.elements.role.value, students:form.elements.students?.value, credits:form.elements.credits?.value, quantity:form.elements.quantity?.value, share:form.elements.share?.value ?? '100'});
  }
  function updateScore() {
    const result = currentScore();
    document.getElementById('live-score').value = result.status === 'pending' ? 'รอประเมิน' : result.score === null ? '—' : result.score.toLocaleString('th-TH', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' คะแนน';
    document.getElementById('score-help').textContent = {pending:'บันทึกข้อมูลได้ คะแนนส่วนนี้รอการประเมินจากผู้รับผิดชอบ', incomplete:'กรอกข้อมูลของงานให้ครบเพื่อคำนวณคะแนน', unavailable:'ยังไม่มีเกณฑ์สำหรับรายการนี้', calculated:'คะแนนคำนวณอัตโนมัติจากข้อมูลที่เลือก (ก่อนจำกัดเพดานหมวด)'}[result.status];
    const withStudents = scoring.hasStudents(subtype.value, form.elements.role.value);
    document.getElementById('student-names-field').hidden = !withStudents;
    if (!withStudents) form.elements.student_names.value = '';
  }
  // ===== END WORKLOAD_SCORE =====
  function announce(message) { notice.textContent = message; notice.hidden = false; }
  function reset() {
    form.reset(); editingId = null; attachments = []; changed = false; details();
    for (const input of form.elements) if (typeof input.setCustomValidity === 'function') input.setCustomValidity('');
    document.getElementById('selected-evidence').textContent = '';
    document.getElementById('workload-save').textContent = 'เพิ่มรายการภาระงาน';
    document.getElementById('workload-cancel').textContent = 'ล้างข้อมูล';
  }
  function render() {
    list.replaceChildren();
    document.getElementById('workload-count').textContent = `${records.length} รายการ`;
    const visible = records.filter(record => filter.value === 'all' || record.category === filter.value);
    if (!visible.length) {
      const empty = document.createElement('p'); empty.className = 'workload-empty';
      empty.textContent = records.length ? 'ยังไม่มีรายการในหมวดนี้' : 'ยังไม่มีภาระงาน กรอกข้อมูลด้านบนเพื่อเพิ่มรายการแรก'; list.append(empty);
    }
    for (const record of visible) {
      const card = document.createElement('article'); card.className = 'workload-record';
      const badge = document.createElement('p'); badge.className = 'eyebrow'; badge.textContent = `${categories[record.category][0]} · ${record.semester === 'summer' ? 'ฤดูร้อน' : 'ภาค ' + record.semester}/${record.year}`;
      const title = document.createElement('h4'); title.textContent = record.title;
      const type = document.createElement('p'); type.className = 'muted'; type.textContent = record.subtype.replace(/^\d+(?:\.\d+)*\s+/, '');
      const summary = document.createElement('p'); summary.className = 'muted';
      summary.textContent = activeSchema(record.subtype, record.role, record.category).filter(([key]) => record[key] != null && record[key] !== '').map(([key, label]) => `${scoring.fieldLabel(record.subtype, key, label)}: ${record[key]}`).join(' · ');
      card.append(badge, title, type, summary);
      // ===== START WORKLOAD_SCORE: คะแนนบนการ์ด ไม่มีตัวคูณให้กรอกหรือแก้ =====
      const score = document.createElement('p'); score.className = 'record-score';
      score.textContent = record.score_status === 'pending' ? 'คะแนน: รอประเมิน' : `คะแนน: ${record.score.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
      card.append(score);
      // ===== END WORKLOAD_SCORE =====
      if (record.role_note) { const note = document.createElement('p'); note.textContent = record.role_note; card.append(note); }
      if (record.student_names) { const students = document.createElement('p'); students.className = 'student-names-summary'; students.textContent = 'นักศึกษาที่เกี่ยวข้อง:\n' + record.student_names; card.append(students); }
      const more = document.createElement('details'); const heading = document.createElement('summary'); heading.textContent = 'ดูรายละเอียดและหลักฐาน'; more.append(heading);
      for (const [label, value] of [['ไฟล์ที่เลือก', record.attachments.join(', ')]]) {
        if (value) { const p = document.createElement('p'); p.textContent = `${label}: ${value}`; more.append(p); }
      }
      if (record.evidence_url) { const a = document.createElement('a'); a.href = record.evidence_url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'เปิดลิงก์หลักฐาน ↗'; more.append(a); }
      card.append(more);
      const actions = document.createElement('div'); actions.className = 'workload-actions';
      for (const [action, label] of [['edit', 'แก้ไข'], ['delete', 'ลบรายการ']]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.textContent = label;
        button.dataset.action = action; button.dataset.id = record.id; button.setAttribute('aria-label', `${label} ${record.title}`); actions.append(button);
      }
      card.append(actions); list.append(card);
    }
  }
  category.addEventListener('change', () => { group.value = ''; details(); });
  group.addEventListener('change', () => details());
  subtype.addEventListener('change', () => {
    const values = detailValues();
    delete values.role;
    details(values, false);
  });
  form.addEventListener('change', event => {
    changed = true;
    if (event.target.name === 'role') {
      details({...detailValues(), student_names:form.elements.student_names.value}, false);
      form.elements.role.focus();
    }
    updateScore();
  });
  form.addEventListener('input', event => {
    changed = true; event.target.setCustomValidity('');
    updateScore();
  });
  form.elements.attachments.addEventListener('change', () => {
    attachments = Array.from(form.elements.attachments.files, file => file.name);
    document.getElementById('selected-evidence').textContent = attachments.join(', '); changed = true;
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const names = [...common, ...activeSchema().map(([name]) => name)];
    for (const name of names) { const input = form.elements.namedItem(name); input.value = input.value.trim(); input.setCustomValidity(''); }
    if (!form.elements.title.value) form.elements.title.setCustomValidity('กรุณาระบุชื่อรายการภาระงาน');
    const url = form.elements.evidence_url;
    if (url.value && !/^https?:\/\//i.test(url.value)) url.setCustomValidity('กรุณาใช้ลิงก์ http:// หรือ https://');
    if (!form.reportValidity()) return;
    const code = scoring.rule(subtype.value).code;
    if (code === '3.3' && form.elements.role.selectedIndex === 3 && Number(form.elements.students.value) <= 300) {
      announce('คะแนนเพิ่มข้อ 3.3 ต้องมีนักศึกษามากกว่า 300 คน กรุณากรอกจำนวนจริง'); return;
    }
    if (code === '3.5' && records.some(item => item.id !== editingId && item.subtype === subtype.value && item.role === form.elements.role.value && item.semester === form.elements.semester.value && item.year === form.elements.year.value)) {
      announce('ข้อ 3.5 บันทึกแต่ละบทบาทได้อย่างละ 1 รายการต่อภาคการศึกษา กรุณาแก้ไขรายการเดิม'); return;
    }
    // WORKLOAD_SCORE: ตรวจคะแนนก่อนบันทึก และเก็บ score ใน record ด้านล่าง
    const result = currentScore();
    if (!['calculated', 'pending'].includes(result.status)) { announce('กรุณาเลือกบทบาทและกรอกข้อมูลของงานให้ครบถ้วน'); return; }
    const wasEditing = editingId !== null;
    const record = {id: editingId || `workload-${nextId++}`, ...Object.fromEntries(names.map(name => [name, form.elements.namedItem(name).value])), score:result.score, score_status:result.status, attachments: [...attachments]};
    if (wasEditing) records = records.map(item => item.id === editingId ? record : item); else records.push(record);
    filter.value = 'all'; reset(); render(); announce(wasEditing ? 'แก้ไขรายการภาระงานแล้ว' : 'เพิ่มรายการภาระงานแล้ว');
  });
  document.getElementById('workload-cancel').addEventListener('click', () => { reset(); announce('ยกเลิกข้อมูลในฟอร์มแล้ว'); });
  filter.addEventListener('change', render);
  list.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    const record = records.find(item => item.id === button.dataset.id); if (!record) return;
    if (button.dataset.action === 'delete') {
      if (!window.confirm(`ลบรายการ “${record.title}” หรือไม่?`)) return;
      records = records.filter(item => item.id !== record.id); if (editingId === record.id) reset(); render(); announce('ลบรายการภาระงานแล้ว'); return;
    }
    if (changed && !window.confirm('มีข้อมูลที่ยังไม่ได้เพิ่ม ต้องการเปลี่ยนไปแก้ไขรายการนี้หรือไม่?')) return;
    reset(); category.value = record.category; details(record);
    for (const name of common) form.elements.namedItem(name).value = record[name];
    updateScore();
    editingId = record.id; attachments = [...record.attachments];
    document.getElementById('selected-evidence').textContent = attachments.join(', ');
    document.getElementById('workload-save').textContent = 'บันทึกการแก้ไขภาระงาน';
    document.getElementById('workload-cancel').textContent = 'ยกเลิกการแก้ไข';
    announce('กำลังแก้ไข: ' + record.title); form.elements.title.focus();
  });
  window.addEventListener('beforeunload', event => { if (changed) { event.preventDefault(); event.returnValue = ''; } });
  details(); render();
})();
