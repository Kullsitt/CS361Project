'use strict';

const categories = {TEACHING: 'การสอน', RESEARCH: 'งานวิจัย', SERVICE: 'บริการวิชาการ', ADVISING: 'การดูแลนักศึกษา'};
const labels = {
  course_code:'รหัสวิชา',course_name_th:'ชื่อวิชา (ไทย)',course_name_en:'ชื่อวิชา (อังกฤษ)',section:'กลุ่มเรียน',credits:'หน่วยกิต',course_level:'ระดับรายวิชา',lecture_hours_per_week:'ชั่วโมงบรรยายต่อสัปดาห์',lab_hours_per_week:'ชั่วโมงปฏิบัติต่อสัปดาห์',weeks:'จำนวนสัปดาห์',enrolled_students:'จำนวนนักศึกษา',teaching_share_percent:'สัดส่วนการสอน (%)',role:'บทบาท',
  research_type:'ประเภทงานวิจัย',funding_source:'แหล่งทุน',funding_type:'ประเภททุน',budget_amount:'งบประมาณ (บาท)',contribution_percent:'สัดส่วนการมีส่วนร่วม (%)',project_status:'สถานะโครงการ',
  service_type:'ประเภทบริการ',organization:'หน่วยงาน',service_scope:'ขอบเขตบริการ',is_paid:'มีค่าตอบแทน',participants:'จำนวนผู้เข้าร่วม',
  advising_type:'ประเภทการดูแล',student_level:'ระดับนักศึกษา',student_count:'จำนวนนักศึกษา',project_title:'ชื่อโครงการ'
};
const fields = {
  TEACHING:['course_code','course_name_th','course_name_en','section','credits','course_level','lecture_hours_per_week','lab_hours_per_week','weeks','enrolled_students','teaching_share_percent','role'],
  RESEARCH:['research_type','role','funding_source','funding_type','budget_amount','contribution_percent','project_status'],
  SERVICE:['service_type','organization','role','service_scope','is_paid','participants'],
  ADVISING:['advising_type','student_level','student_count','role','project_title']
};
const values = {bachelor:'ปริญญาตรี',master:'ปริญญาโท',doctoral:'ปริญญาเอก',coordinator:'ผู้ประสานงาน',instructor:'ผู้สอน',co_instructor:'ผู้สอนร่วม',project:'โครงการวิจัย',publication:'ผลงานตีพิมพ์',patent:'สิทธิบัตร',other:'อื่น ๆ',principal_investigator:'หัวหน้าโครงการ',co_investigator:'ผู้ร่วมวิจัย',author:'ผู้แต่ง',advisor:'ที่ปรึกษา',internal:'ภายใน',external:'ภายนอก',none:'ไม่มี',ongoing:'กำลังดำเนินการ',completed:'เสร็จสิ้น',cancelled:'ยกเลิก',speaker:'วิทยากร',reviewer:'ผู้ประเมิน',committee:'กรรมการ',consulting:'ที่ปรึกษา',community:'บริการชุมชน',administrative:'งานบริหาร',department:'ภาควิชา',faculty:'คณะ',university:'มหาวิทยาลัย',local:'ท้องถิ่น',national:'ระดับชาติ',international:'นานาชาติ',academic_advisor:'อาจารย์ที่ปรึกษา',senior_project:'โครงงาน',thesis:'วิทยานิพนธ์',independent_study:'การศึกษาค้นคว้าอิสระ',internship:'ฝึกงาน',student_activity:'กิจกรรมนักศึกษา',main_advisor:'ที่ปรึกษาหลัก',co_advisor:'ที่ปรึกษาร่วม',draft:'ฉบับร่าง',submitted:'ส่งแล้ว',approved:'อนุมัติแล้ว',returned:'ส่งกลับแก้ไข',manual:'บันทึกเอง',import:'นำเข้าข้อมูล',openalex:'OpenAlex',mock:'ข้อมูลตัวอย่าง'};
const $ = id => document.getElementById(id);
const text = value => value === null || value === undefined || value === '' ? 'ไม่ระบุ' : typeof value === 'boolean' ? (value ? 'ใช่' : 'ไม่ใช่') : String(value);
const translated = value => Object.hasOwn(values, value) ? values[value] : text(value);

function safeUrl(value) {
  try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
function dateText(value) {
  if (!value) return 'ไม่ระบุ';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleDateString('th-TH', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
}
function fact(container, label, value) {
  const row = document.createElement('div');
  const term = document.createElement('dt'); term.textContent = label;
  const description = document.createElement('dd'); description.textContent = text(value);
  row.append(term, description); container.append(row);
}
function link(label, href) {
  const anchor = document.createElement('a'); anchor.textContent = label; anchor.href = href;
  anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.className = 'file-link'; return anchor;
}
function renderWorkload(item) {
  $('title').textContent = text(item.title); document.title = `${text(item.title)} | FRWS`;
  $('category').textContent = categories[item.category] || text(item.category);
  $('teacher').textContent = item.teacher_name_th || item.teacher_name_en || 'ไม่ระบุอาจารย์';
  if (item.teacher_id) {
    $('teacher').href = `teacher.html?id=${encodeURIComponent(item.teacher_id)}`;
    $('back-teacher').href = `${$('teacher').getAttribute('href')}#workloads`;
    $('back-teacher').hidden = false;
  }
  $('affiliation').textContent = [item.faculty,item.department].filter(Boolean).join(' · ');
  $('summary').replaceChildren();
  for (const [label,value] of [['ปีการศึกษา',item.academic_year],['ภาคเรียน',item.semester == null ? 'ทั้งปีการศึกษา' : item.semester],['ภาระงาน (ชั่วโมง)',item.workload_hours],['สถานะ',translated(item.status)]]) fact($('summary'), label, value);
  $('description').textContent = item.description || 'ยังไม่มีคำอธิบายเพิ่มเติม';
  $('general').replaceChildren();
  for (const [label,value] of [['วันที่เริ่ม',dateText(item.start_date)],['วันที่สิ้นสุด',dateText(item.end_date)],['แหล่งข้อมูล',translated(item.source)],['วันที่บันทึก',dateText(item.created_at)]]) fact($('general'),label,value);
  $('detail-heading').textContent = `รายละเอียด${categories[item.category] || 'ภาระงาน'}`;
  $('details').replaceChildren(); $('publication').replaceChildren(); $('publication').hidden = true;
  $('detail-empty').hidden = !!item.details;
  if (item.details) {
    for (const field of fields[item.category] || []) fact($('details'), labels[field], translated(item.details[field]));
    const pub = item.details.publications;
    if (pub) {
      $('publication').hidden = false;
      const heading = document.createElement('h3'); heading.textContent = pub.title || 'ผลงานตีพิมพ์'; $('publication').append(heading);
      const date = document.createElement('p'); date.textContent = `วันที่เผยแพร่: ${pub.publication_date ? dateText(pub.publication_date) : text(pub.publication_year)}`; $('publication').append(date);
      const url = safeUrl(pub.official_url || pub.doi_url || pub.doi || pub.url);
      if (url) $('publication').append(link('เปิดผลงานตีพิมพ์ ↗',url));
    }
  }
  const evidence = Array.isArray(item.evidences) ? item.evidences : [];
  $('evidence-count').textContent = `(${evidence.length})`; $('evidences').replaceChildren(); $('evidence-empty').hidden = evidence.length > 0;
  for (const file of evidence) {
    const row = document.createElement('li');
    const title = document.createElement('h3'); title.textContent = file.title || file.file_name || 'หลักฐานประกอบ'; row.append(title);
    const info = document.createElement('p'); info.className = 'muted';
    info.textContent = [file.file_name, file.mime_type, file.file_size_bytes != null ? `${(file.file_size_bytes / 1024).toLocaleString('th-TH',{maximumFractionDigits:1})} KB` : null].filter(Boolean).join(' · '); row.append(info);
    const uploaded = document.createElement('p'); uploaded.className = 'muted'; uploaded.textContent = `อัปโหลด: ${dateText(file.uploaded_at)}`; row.append(uploaded);
    const url = safeUrl(file.download_url) || safeUrl(file.external_url);
    if (url) row.append(link('เปิดหลักฐาน ↗',url));
    else { const unavailable = document.createElement('p'); unavailable.textContent = 'ยังไม่มีลิงก์เปิดหลักฐาน'; row.append(unavailable); }
    $('evidences').append(row);
  }
}
async function loadWorkload() {
  $('workload').hidden = true; $('retry').hidden = true; $('state').hidden = false; $('state').classList.remove('error'); $('state').textContent = 'กำลังโหลดรายละเอียดภาระงาน…';
  const id = new URLSearchParams(location.search).get('id');
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    $('state').textContent = 'ไม่พบรหัสภาระงานที่ถูกต้อง กรุณาเลือกรายการภาระงานจากหน้ารายการ'; return;
  }
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`/api/workloads/${encodeURIComponent(id)}`, {signal:controller.signal});
    if (!response.ok) {
      const error = new Error(response.status === 404 ? 'ไม่พบรายการภาระงานนี้' : response.status === 401 || response.status === 403 ? 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' : 'ไม่สามารถโหลดรายละเอียดได้ กรุณาลองอีกครั้ง');
      error.retryable = ![401,403,404,422].includes(response.status); throw error;
    }
    const payload = await response.json();
    if (!payload.data || typeof payload.data !== 'object') throw new Error('ข้อมูลที่ได้รับไม่ถูกต้อง');
    renderWorkload(payload.data); $('state').hidden = true; $('workload').hidden = false;
  } catch (error) {
    $('state').textContent = error.name === 'AbortError' ? 'การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองอีกครั้ง' : error instanceof TypeError ? 'เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง' : error.message;
    $('state').classList.add('error'); $('retry').hidden = error.retryable === false;
  } finally { clearTimeout(timer); }
}
$('retry').addEventListener('click',loadWorkload);
loadWorkload();
