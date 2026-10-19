// Generates manual test material only; does not change application data or call APIs.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const scoring = require('../public/js/workload-scoring.js');
const root = path.resolve(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'public/js/teacher-workload.js'), 'utf8');
const unitTests = fs.readFileSync(path.join(__dirname, 'workload-scoring.cjs'), 'utf8');
// Extract only local object literals, not the application or test event handlers.
const categories = vm.runInNewContext('(' + ui.match(/const categories = (\{[\s\S]*?\n  \});/)[1] + ')');
const schemas = vm.runInNewContext('(' + ui.match(/const schemas = (\{[\s\S]*?\n  \});/)[1] + ')');
// Expected weights are the independently transcribed PDF fixture, not rule().roles weights.
const expectedWeights = vm.runInNewContext('(' + unitTests.match(/const expectedWeights = (\{[\s\S]*?\n\});/)[1] + ')');
const labels = Object.fromEntries(Object.values(schemas).flat().map(([name, title]) => [name, title]));
const fieldTitle = (category, subtype, name) => scoring.fieldLabel(subtype, name, schemas[category].find(([key]) => key === name)?.[1] || labels[name] || name);
const clean = text => text.replace(/^\d+(?:\.\d+)*\s+/, '');
const md = value => String(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
const fmt = value => value == null ? 'รอประเมิน' : value.toFixed(2);
const roleCases = [];
const studentNames = 'นายทดสอบ หนึ่ง\nนางสาวตัวอย่าง สอง';
for (const [category, [categoryLabel, types]] of Object.entries(categories)) {
  if (category === 'special') continue;
  for (const subtype of types) {
    const config = scoring.rule(subtype);
    const main = scoring.groups[category].find(([, , codes]) => codes.includes(config.code));
    config.roles.forEach(([role], index) => {
      if (config.unavailable.includes(index)) return;
      const id = 'W' + String(roleCases.length + 1).padStart(3, '0');
      const names = scoring.fields(subtype, role);
      const sample = {course:'CS999', hours:'45', credits:'3', students:config.code === '3.3' ? '301' : '125', quantity:'2', share:'50', source:'หน่วยงานทดสอบภาระงาน', organization:'หน่วยงานทดสอบภาระงาน', budget:'1000000'};
      if (config.code === '2.8.1') sample.budget = String([20000000,15000000,10000000,5000000,1000000,500000,100000,50000][index]);
      if (config.code === '2.8.2') sample.budget = String([5000000,1000000,500000,100000,50000][index]);
      const inputs = Object.fromEntries(names.filter(name => name !== 'role').map(name => [name,sample[name]]));
      const withStudents = scoring.hasStudents(subtype, role);
      if (withStudents) inputs.student_names = studentNames;
      const weight = config.code === '1.1' ? 1.1 : expectedWeights[config.code][index];
      const share = names.includes('share') ? 0.5 : 1;
      const units = config.basis === 'quantity' ? 2 : config.basis === 'credits' ? 3 : 1;
      const expectedScore = weight === '' ? null : Math.round(200 * units * weight * share * 100) / 100;
      const result = scoring.evaluate({subtype,role,...inputs,share:inputs.share ?? '100'});
      assert.equal(result.status, weight === '' ? 'pending' : 'calculated', id);
      if (expectedScore !== null) assert.ok(Math.abs(result.score - expectedScore) < 1e-8, id);
      roleCases.push({id, category, category_label:categoryLabel, main_type:main[1], subtype, subtype_label:clean(subtype), role,
        common:{semester:'2',year:'2567',title:`ทดสอบภาระงาน ${id}`,evidence_url:'https://example.com',role_note:`ข้อมูลสมมติ ${id}`},
        inputs, expected:{score:expectedScore, display:fmt(expectedScore), status:result.status, student_names_visible:withStudents,
          visible_fields:names.map(name => ({name,label:fieldTitle(category,subtype,name)})), save_allowed:true}, actual_result:'', verdict:'NOT_RUN'});
    });
  }
}
assert.equal(roleCases.length,115);

const boundaryCases = [];
function boundary(id, title, code, roleIndex, inputs, expected, steps='') {
  const base = roleCases.find(c => c.subtype.split(' ')[0] === code && c.role === scoring.rule(code).roles[roleIndex][0]);
  boundaryCases.push({id,title,route:{category:base.category_label,main_type:base.main_type,subtype:base.subtype_label,role:base.role},inputs,expected,steps,actual_result:'',verdict:'NOT_RUN'});
}
for (const [count, score] of [[0,200],[99,200],[100,220],[250,220],[251,240],[500,240],[501,260]]) {
  boundary('N'+String(boundaryCases.length+1).padStart(2,'0'),`นักศึกษา ${count} คน`,'1.1',0,{credits:3,students:count,share:100},`${score.toFixed(2)} คะแนน`);
}
for (const [share, score] of [[0,0],[20,40],[50,100],[100,200]]) boundary('N'+String(boundaryCases.length+1).padStart(2,'0'),`สัดส่วน ${share}%`,'1.1',0,{credits:3,students:99,share},`${score.toFixed(2)} คะแนน`);
boundary('N12','หน่วยกิตทศนิยม','1.1',0,{credits:1.5,students:99,share:50},'50.00 คะแนน');
boundary('N13','คำนวณจากหน่วยกิตวิทยานิพนธ์','1.9',0,{credits:6,share:50},'60.00 คะแนน');
boundary('N14','คำนวณตามจำนวน Chapter','2.6.2',0,{quantity:3,share:50},'120.00 คะแนน');
boundary('N15','ข้อมูลศูนย์ไม่ใช่ค่าว่าง','1.4',0,{quantity:0,share:100},'0.00 คะแนน; บันทึกได้ตามกฎปัจจุบัน');
boundary('N16','คะแนนเพิ่มที่ 300 คน','3.3',3,{students:300,quantity:1},'คะแนน —; เพิ่มรายการไม่ได้');
boundary('N17','คะแนนเพิ่มที่ 301 คน','3.3',3,{students:301,quantity:1},'10.00 คะแนน');
boundary('N18','ล้างหน่วยกิตที่จำเป็น','1.1',0,{credits:'',students:99,share:100},'คะแนน —; เพิ่มรายการไม่ได้');
boundary('N19','สัดส่วนมากกว่า 100','1.4',0,{quantity:2,share:101},'เพิ่มรายการไม่ได้');
boundary('N20','สัดส่วนติดลบ','1.4',0,{quantity:2,share:-1},'เพิ่มรายการไม่ได้');
boundary('N21','จำนวนนักศึกษาทศนิยม','1.1',0,{credits:3,students:1.5,share:100},'คะแนน —; เพิ่มรายการไม่ได้');
boundary('N22','จำนวนเรื่องทศนิยม','1.4',0,{quantity:1.5,share:100},'เพิ่มรายการไม่ได้ เพราะจำนวนเรื่องต้องเป็นจำนวนเต็ม; ช่องคะแนนอาจแสดงผลระหว่างพิมพ์');
boundary('N23','หน่วยกิตติดลบ','1.1',0,{credits:-3,students:99,share:100},'เพิ่มรายการไม่ได้');
boundary('N24','ชื่อรายการเป็นช่องว่าง','1.4',0,{quantity:2,share:100,title:'   '},'เพิ่มรายการไม่ได้');
boundary('N25','ปีต่ำกว่าที่อนุญาต','1.4',0,{quantity:2,share:100,year:2499},'เพิ่มรายการไม่ได้');
boundary('N26','ปีสูงกว่าที่อนุญาต','1.4',0,{quantity:2,share:100,year:2701},'เพิ่มรายการไม่ได้');
boundary('N27','ลิงก์หลักฐานไม่ใช่ HTTP(S)','1.4',0,{quantity:2,share:100,evidence_url:'javascript:alert(1)'},'เพิ่มรายการไม่ได้');
boundary('N28','ลิงก์หลักฐานเว้นว่าง','1.4',0,{quantity:2,share:100,evidence_url:''},'80.00 คะแนน; เพิ่มรายการได้');
boundary('N29','ไม่กรอกชื่อนักศึกษา','1.4',0,{quantity:2,share:100,student_names:''},'80.00 คะแนน; ชื่อนักศึกษาเป็นข้อมูลเสริม ไม่บังคับตามกฎปัจจุบัน');
boundary('N30','ข้อความ HTML ต้องเป็นข้อความธรรมดา','1.4',0,{quantity:2,share:100,title:'<img src=x onerror=alert(1)>',student_names:'<script>alert(1)</script>'},'ไม่มี popup หรือรูปที่แทรก; แสดงข้อความตามที่พิมพ์หลังบันทึก');
boundary('N31','จำนวน 3 รายการของบทบาทที่นับครั้งเดียว','3.5',0,{},'ไม่มีช่องจำนวนงาน; 25.00 คะแนน ไม่เพิ่มตามจำนวนนักศึกษาหรือจำนวนชื่อ');

const flows = [
  ['F01','เพิ่มรายการ','ใช้ W001 → กดเพิ่มรายการภาระงาน','รายการเพิ่ม 1; คะแนนบนการ์ดตรงกับช่องคะแนน; ฟอร์มกลับค่าเริ่มต้น'],
  ['F02','แก้ไขคะแนนอัตโนมัติ','เปิดแก้ไข W001 → เปลี่ยนหน่วยกิตเป็น 6 → บันทึก','คะแนน 220.00; จำนวนรายการเท่าเดิม'],
  ['F03','ยกเลิกการแก้ไข','แก้ W001 เป็นหน่วยกิต 9 แต่กดยกเลิก','ข้อมูลเดิมและคะแนนเดิมบนการ์ดไม่เปลี่ยน'],
  ['F04','เปลี่ยนประเภทขณะแก้ไข','แก้ W001 → เปลี่ยนเป็นงานวิชาการ / เอกสารและสื่อการสอน / เอกสารคำสอน → สัดส่วน 50 → บันทึก','คะแนน 50.00; ไม่มีรหัสวิชา ชั่วโมง หน่วยกิต หรือจำนวนนักศึกษาติดในการ์ด'],
  ['F05','เปลี่ยนบทบาทขณะกรอก','เลือกซีเนียร์โปรเจก → จำนวน 2 สัดส่วน 100 → สลับที่ปรึกษา / ที่ปรึกษาร่วม / กรรมการสอบ','คะแนนทันที 80.00 / 40.00 / 20.00 ตามลำดับ'],
  ['F06','สลับบทบาทที่มีชื่อนักศึกษา','งานบริหาร / งานอาจารย์ที่ปรึกษา → ที่ปรึกษาทั่วไป → ใส่ชื่อ → เปลี่ยนเป็นงานเชิญ Visiting Professor','ช่องชื่อนักศึกษาหายและไม่ถูกบันทึกในรายการใหม่'],
  ['F07','หลายชื่อนักศึกษา','งานวิทยานิพนธ์ → ใส่สองชื่อคนละบรรทัด → บันทึก → แก้ไข','ชื่อครบทั้งสองบรรทัด ไม่ถูกใช้คูณคะแนนเพิ่ม'],
  ['F08','สัมมนาไม่กรอกชื่อ','เลือกสัมมนาระดับตรีและโท/เอก แล้วไล่ทุกบทบาท','ไม่มีช่องชื่อนักศึกษาทุกบทบาท'],
  ['F09','สหกิจไม่กรอกชื่อ','เลือกสหกิจศึกษา แล้วไล่ทั้งสามบทบาท','ไม่มีช่องชื่อนักศึกษาทุกบทบาท'],
  ['F10','กรองรายการ','สร้างงานสอน 1 และงานวิชาการ 1 → เปลี่ยนตัวกรองหมวด','แสดงเฉพาะหมวดที่เลือก; จำนวนรวมด้านบนยังนับทุกหมวด'],
  ['F11','ยกเลิกลบ','กดลบรายการ → เลือกยกเลิกในกล่องยืนยัน','รายการและจำนวนรวมไม่เปลี่ยน'],
  ['F12','ยืนยันลบ','กดลบรายการ → ยืนยัน','รายการหาย จำนวนรวมลด 1'],
  ['F13','ลบรายการที่กำลังแก้ไข','กดแก้ไขรายการ → กดลบรายการนั้นด้านล่าง → ยืนยัน','รายการหายและฟอร์มออกจากโหมดแก้ไข'],
  ['F14','กันทับข้อมูลค้าง','เปิดแก้ไขรายการหนึ่ง พิมพ์ข้อมูลเพิ่ม → กดแก้ไขอีกอัน → ยกเลิกคำถามยืนยัน','ข้อมูลที่กำลังกรอกยังอยู่ ไม่สลับรายการ'],
  ['F15','รอประเมิน','เลือกคณบดี / รองคณบดี / หัวหน้าสาขา / ผู้ช่วยคณบดี และตำแหน่งในงานบริหารระดับสาขา','แสดงรอประเมิน; เพิ่มและแก้ไขรายการได้; ไม่แสดง NaN หรือ 0.00 แทนคะแนนที่ยังไม่มี'],
  ['F16','งานบริหารที่มีคะแนนแน่นอน','เลือกงานบริหารในตำแหน่ง → กรรมการบริหาร','50.00 คะแนนทันที'],
  ['F17','กันซ้ำงานอาจารย์ที่ปรึกษา','เพิ่มข้อ 3.5 บทบาทเดียวกัน ภาคเดียวกัน ปีเดียวกัน 2 ครั้ง','ครั้งที่สองถูกปฏิเสธ; ใช้ปุ่มแก้ไขรายการเดิมได้'],
  ['F18','บทบาทหรือภาคต่างกัน','หลัง F17 เพิ่มอีกบทบาท หรือเปลี่ยนภาค/ปีของรายการใหม่','เพิ่มรายการใหม่ได้'],
  ['F19','ไฟล์หลายไฟล์','เลือกไฟล์ PDF และ PNG สมมติพร้อมกัน → เพิ่ม → แก้ไขโดยไม่เลือกไฟล์ใหม่ → บันทึก','ชื่อไฟล์ยังอยู่ครบ; ไม่มีการอัปโหลดจริง'],
  ['F20','แทนที่ไฟล์','แก้ไขรายการที่มีไฟล์ → เลือกไฟล์ใหม่ → บันทึก','ชื่อไฟล์ชุดใหม่แทนที่ชุดเดิม'],
  ['F21','ลิงก์หลักฐาน','ใส่ https://example.com → เพิ่ม → เปิดรายละเอียด → เปิดลิงก์','เปิดแท็บใหม่ ปลายทาง example.com'],
  ['F22','คะแนนล็อก','ลองคลิก พิมพ์ วางข้อความในช่องคะแนน และค้นหาช่องน้ำหนัก','คะแนนพิมพ์ทับไม่ได้; ไม่มีช่องน้ำหนักหรือสูตรบนหน้า'],
  ['F23','เปลี่ยนประเภทหลัก','งานวิชาการ / ทุนวิจัย ใส่งบประมาณ → เปลี่ยนเป็นบทความ → เปลี่ยนเป็นงานสอน / วิทยานิพนธ์','งบประมาณหายเมื่อไม่เกี่ยวข้อง; วารสารหายเมื่องานสอน; วิทยานิพนธ์ไม่มีช่องชั่วโมง/จำนวนนักศึกษา แต่มีชื่อและหน่วยกิต'],
  ['F24','ไม่มีเลขหัวข้อในชื่อย่อย','ไล่เลือกประเภทหลักทุกหมวดและดูรายการที่บันทึก','ชื่อประเภทย่อยไม่มี 1.1 / 2.3.1 นำหน้า; รหัสภายในไม่ต้องแสดง'],
  ['F25','รีเฟรชหลังบันทึก','เพิ่มรายการแล้วรีเฟรชหน้า','รายการหายตามพฤติกรรม mockup; ทำข้อนี้ท้ายชุด'],
  ['F26','แป้นพิมพ์','ใช้ Tab, Shift+Tab และปุ่มลูกศรเลือก dropdown; Enter เพื่อส่งฟอร์ม','เข้าถึงช่องที่แสดงอยู่ได้ ไม่มีช่องที่ถูกซ่อนขัดขวางการส่ง'],
  ['F27','หน้าจอมือถือ','ย่อหน้าต่างประมาณ 390px → เลือกบทบาทข้อความยาวและใส่ชื่อหลายบรรทัด','ช่องกรอกและปุ่มไม่ทับกัน; ไม่มีเนื้อหาสำคัญหลุดจอ'],
  ['F28','ไม่มี backend สำหรับ mockup','เปิด DevTools Network → เพิ่ม แก้ไข ลบภาระงาน','ไม่มีคำขอ POST/PATCH/DELETE ไปฐานข้อมูลจากฟอร์มภาระงานนี้'],
  ['F29','ชนิดไฟล์ไม่รองรับ','ลองเลือกไฟล์ .exe หรือ .txt โดยเปลี่ยนตัวกรองไฟล์ของระบบ','บันทึกผลจริง: accept เป็นเพียงตัวกรอง ปัจจุบันยังไม่มีการตรวจไฟล์เชิงเนื้อหาหรือขนาด; ไม่ถือว่าระบบอัปโหลดปลอดภัยแล้ว'],
  ['F30','ช่องที่หายไม่ทำให้บันทึกพัง','เลือกบทบาทกรรมการบริหาร (ไม่มี share/quantity) → เพิ่ม → แก้ไข → บันทึก','บันทึกได้ 50.00 คะแนน; Console ไม่มี TypeError จากช่องที่ไม่มีแล้ว']
].map(([id,title,steps,expected]) => ({id,title,steps,expected,actual_result:'',verdict:'NOT_RUN'}));
const gaps = [
  {id:'G01',title:'สิทธิบัตร ตัวเลือกที่ 4',steps:'งานวิชาการ → สิทธิบัตร / สิ่งประดิษฐ์ → เปิด dropdown ชนิดงาน',expected:'ตัวเลือกข้อความถูกตัดใน PDF ถูกปิด ไม่สามารถเลือกหรือคำนวณได้'},
  {id:'G02',title:'คะแนนพิเศษ',steps:'เลือกหมวดคะแนนพิเศษ',expected:'ไม่มีเกณฑ์ / คะแนน —; ปุ่มเพิ่มรายการถูกปิด'},
  {id:'G03',title:'เพดานคะแนนยังไม่ใช้',steps:'ซีเนียร์โปรเจก ที่ปรึกษา จำนวน 10 สัดส่วน 100',expected:'คะแนนดิบ 400.00 ไม่ถูกจำกัดเหลือ 200; นี่เป็นข้อจำกัดที่ทราบ ไม่ใช่คะแนนประเมินสุดท้าย'},
  {id:'G04',title:'เงื่อนไขรายงานประเมิน',steps:'ตรวจความต้องการก่อนนำไปใช้จริง',expected:'ยังไม่ตรวจครบเรื่องเพดานรวม การนับซ้ำทุกชนิด จำนวนคำสั่ง การนับ Section คุณสมบัติหลักฐาน และการอนุมัติ'}
];
const total = roleCases.length + boundaryCases.length + flows.length + gaps.length;
const data = {version:1,scope:'Teacher dashboard UI mockup only',source_commit:require('node:child_process').execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim(),all_user_results:'NOT_RUN',counts:{role_cases:roleCases.length,boundaries:boundaryCases.length,flows:flows.length,known_gaps:gaps.length,total},role_cases:roleCases,boundary_cases:boundaryCases,flow_cases:flows,known_gaps:gaps};
const outputDir = path.join(__dirname,'manual-workload'); fs.mkdirSync(outputDir,{recursive:true});
fs.writeFileSync(path.join(outputDir,'cases.json'),JSON.stringify(data,null,2)+'\n');

let text = `# ชุดทดสอบภาระงานด้วยตนเอง\n\nชุดข้อมูลสมมติ ${total} เคส สำหรับหน้า \`public/teacher-dashboard.html\` (อ้างอิงโค้ด ${data.source_commit}) ไม่มีข้อมูลบุคคลจริง\n\n`;
text += `**ยังไม่ได้ทดสอบผ่านเบราว์เซอร์ให้:** ทุกเคสมีสถานะ NOT_RUN สำหรับคุณทดสอบเอง ตัวเลขคาดหวังได้ตรวจเทียบกับชุดน้ำหนักที่ถอดจาก PDF และฟังก์ชันคำนวณแล้ว ไม่ใช่ผลยืนยันว่า UI ผ่าน\n\n`;
text += `## เตรียมทดสอบ\n\n1. เปิดเว็บด้วยวิธีเดิม แล้วกดไอคอนข้อมูลอาจารย์ → กรอกภาระงาน หรือเปิดหน้า teacher-dashboard.html โดยตรง\n2. รีเฟรชเพื่อเริ่มจากรายการว่าง; แนะนำเปิด Console ไว้ดูข้อผิดพลาด\n3. ทุกเคสใช้ภาค **2** ปี **2567** ชื่อรายการ **ทดสอบภาระงาน + รหัสเคส** เว้นแต่เคสนั้นระบุอย่างอื่น\n4. เลือกหมวด → ประเภทหลัก → ประเภทย่อย → บทบาท ตามตาราง กรอกเฉพาะช่องที่ปรากฏ\n5. ชื่อนักศึกษาตัวอย่าง: **นายทดสอบ หนึ่ง** และ **นางสาวตัวอย่าง สอง** คนละบรรทัด เฉพาะเคสที่ระบุว่าช่องชื่อแสดง\n6. ใช้ลิงก์หลักฐาน \`https://example.com\` หรือเว้นว่าง เลือกไฟล์ PDF/PNG ที่ไม่ใช่ข้อมูลจริงของบุคคลสำหรับเคสไฟล์\n7. กดเพิ่ม แล้วตรวจคะแนนบนการ์ด; ช่องท้ายตารางให้กรอก PASS / FAIL พร้อมอาการ ไม่ต้องแก้ช่องคะแนน\n8. หมายเหตุ: เคสของบทบาทเดียวกันในงานอาจารย์ที่ปรึกษาอาจชนกฎกันซ้ำ ให้ลบรายการเดิมก่อนหรือเปลี่ยนภาค/ปี\n\n`;
text += `## ลำดับที่แนะนำ\n\n- เริ่ม F01–F05, F15–F17, F22–F23, F30 เพื่อทดสอบเส้นทางหลัก\n- จากนั้นลอง N01–N31 เพื่อตรวจสัดส่วนและค่าขอบเขต\n- ไล่ W001–W115 เพื่อเช็กทุกบทบาท รวมตำแหน่งรอประเมิน 6 แบบ\n- ปิดท้ายด้วยเคสไฟล์ หน้าจอมือถือ และ F25 (รีเฟรชทำให้ข้อมูลหาย)\n\n`;
text += `## ตัวอย่างคะแนนที่ตรวจง่าย\n\n| งาน | ข้อมูล | คะแนนที่ควรได้ |\n|---|---|---:|\n| บรรยายปริญญาตรี | 3 หน่วยกิต, 99 คน, 100% | 200.00 |\n| บรรยายปริญญาตรี | 3 หน่วยกิต, 125 คน, 50% | 110.00 |\n| ซีเนียร์โปรเจก: ที่ปรึกษา | 2 เรื่อง, 100% | 80.00 |\n| ซีเนียร์โปรเจก: ที่ปรึกษาร่วม | 2 เรื่อง, 100% | 40.00 |\n| ซีเนียร์โปรเจก: กรรมการสอบ | 2 เรื่อง, 100% | 20.00 |\n| วิทยานิพนธ์: ที่ปรึกษาหลัก | 6 หน่วยกิต, 50% | 60.00 |\n| บทความนานาชาติไม่มี Q | มีส่วนร่วม 20% | 50.00 |\n| งานบริหาร: กรรมการบริหาร | เลือกบทบาท | 50.00 |\n| งานบริหาร: คณบดี | เลือกบทบาท | รอประเมิน |\n\n`;
text += `## A. ทุกบทบาท (${roleCases.length} เคส)\n\nช่องข้อมูลทั่วไป ได้แก่ ชื่อรายการ ภาค ปี หมายเหตุ และหลักฐาน ยังคงอยู่ ตารางแต่ละกลุ่มระบุเฉพาะช่องรายละเอียดที่ใช้จริง\n\n`;
for (const [category,[categoryLabel,types]] of Object.entries(categories)) {
  if(category === 'special') continue;
  text += `### ${categoryLabel}\n\n`;
  for (const subtype of types) {
    const cases = roleCases.filter(c=>c.subtype===subtype); if(!cases.length) continue;
    text += `#### ${cases[0].main_type} → ${clean(subtype)}\n\n| เคส | เลือกบทบาท / ชนิดงาน | ข้อมูลที่กรอก | ชื่อนักศึกษา | คะแนนคาดหวัง | ผล / อาการ |\n|---|---|---|---|---:|---|\n`;
    for (const c of cases) {
      const entries = Object.entries(c.inputs).filter(([key])=>key!=='student_names');
      const inputs = entries.map(([key,value])=>`${fieldTitle(c.category,c.subtype,key)}: ${value}`).join('<br>') || 'ไม่มีช่องตัวเลขที่ต้องกรอก';
      text += `| ${c.id} | ${md(c.role)} | ${md(inputs)} | ${c.expected.student_names_visible?'แสดง: ใส่ชื่อสมมติ 2 บรรทัด':'ต้องไม่แสดง'} | ${c.expected.display} | NOT_RUN |\n`;
    }
    text += '\n';
  }
}
text += `## B. ค่าขอบเขตและข้อมูลผิดรูปแบบ (${boundaryCases.length} เคส)\n\nเคสแต่ละข้อให้เริ่มจากข้อมูลที่ระบุ ไม่ต้องใช้ค่าค้างจากเคสก่อน\n\n`;
for(const c of boundaryCases) {
  text += `### ${c.id} ${c.title}\n\n- เส้นทาง: ${c.route.category} → ${c.route.main_type} → ${c.route.subtype} → ${c.route.role}\n- ข้อมูล: ${Object.entries(c.inputs).map(([key,value])=>`${({title:'ชื่อรายการ',year:'ปีการศึกษา',student_names:'ชื่อนักศึกษา',evidence_url:'ลิงก์หลักฐาน'})[key]||labels[key]||key} = ${JSON.stringify(value)}`).join('; ') || 'เลือกบทบาท ไม่ต้องกรอกตัวคูณ'}\n- ผลที่ควรได้: ${c.expected}\n- ผลจริง / PASS–FAIL: ____________________\n\n`;
}
text += `## C. การกดใช้งานจริง (${flows.length} เคส)\n\n| เคส | ทดสอบ | ขั้นตอน | ผลที่ควรได้ | ผล / อาการ |\n|---|---|---|---|---|\n`;
for(const c of flows) text += `| ${c.id} | ${md(c.title)} | ${md(c.steps)} | ${md(c.expected)} | NOT_RUN |\n`;
text += `\n## D. ข้อจำกัดที่ต้องแยกจากบั๊ก\n\n`;
for(const c of gaps) text += `- **${c.id} ${c.title}:** ${c.steps} → ${c.expected}\n`;
text += `\n## แจ้งผลกลับมา\n\nคัดลอกกรอกได้เลย:\n\n\`\`\`text\nรหัสเคส:\nเบราว์เซอร์ / ขนาดหน้าจอ:\nค่าที่กรอก:\nผลที่คาดหวัง:\nผลที่พบ:\nข้อความใน Console (ถ้ามี):\n\`\`\`\n\nข้อมูลครบทุกเคสในรูปแบบ JSON อยู่ใน [cases.json](cases.json) ช่อง actual_result และ verdict เว้นไว้สำหรับผลจริง\n`;
fs.writeFileSync(path.join(outputDir,'README.md'),text);
console.log(JSON.stringify(data.counts));
console.log('Generated tests/manual-workload/README.md and cases.json; all verdicts are NOT_RUN.');
