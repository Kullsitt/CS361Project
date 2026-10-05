// Run with Node and Playwright available (NODE_PATH may point to its installation).
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true, channel:process.env.FRWS_BROWSER || 'msedge'});
  const page = await browser.newPage();
  const base = process.env.FRWS_UI_URL || 'http://127.0.0.1:8014';
  const id = '00000000-0000-0000-0000-000000000014';
  let status = 200;
  const item = {id,teacher_id:id,title:'การสอนวิชา CS361 การพัฒนาซอฟต์แวร์',teacher_name_th:'อาจารย์ตัวอย่าง',faculty:'คณะวิทยาศาสตร์และเทคโนโลยี',academic_year:2567,semester:null,workload_hours:0,status:'approved',category:'TEACHING',source:'mock',description:'รายละเอียดภาระงาน\nทดสอบการแสดงหลายบรรทัด',details:{course_code:'CS361',enrolled_students:0},evidences:[{title:'หลักฐาน PDF',file_name:'document.pdf',mime_type:'application/pdf',file_size_bytes:1024,download_url:'https://example.com/document.pdf'}]};
  await page.route('**/api/workloads/*', route => route.fulfill({status,contentType:'application/json',body:JSON.stringify({data:item})}));
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const category of ['TEACHING','RESEARCH','SERVICE','ADVISING']) {
    item.category = category;
    item.details = {course_code:'CS361',enrolled_students:0,research_type:'project',budget_amount:0,is_paid:false,participants:0,student_count:0};
    await page.goto(`${base}/ui/workload.html?id=${id}`);
    await page.locator('#workload').waitFor({state:'visible'});
    assert.equal(await page.locator('h1').textContent(),item.title);
    assert.ok((await page.locator('#summary').innerText()).includes('ทั้งปีการศึกษา'));
    assert.equal(await page.locator('#evidences a').getAttribute('href'),'https://example.com/document.pdf');
    if(category === 'SERVICE') assert.ok((await page.locator('#details').innerText()).includes('ไม่ใช่'));
  }
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({path:'tests/workload-mobile.png',fullPage:true});
  item.title = '<img src=x onerror=alert(1)>';
  item.details = null; item.evidences = [{title:'Unsafe',download_url:'javascript:alert(1)'}];
  await page.reload(); await page.locator('#workload').waitFor({state:'visible'});
  assert.equal(await page.locator('h1 img').count(),0);
  assert.equal(await page.locator('#evidences a').count(),0);
  assert.equal(await page.locator('#detail-empty').isVisible(),true);
  item.evidences = [];
  await page.reload(); await page.locator('#workload').waitFor({state:'visible'});
  assert.equal(await page.locator('#evidence-empty').isVisible(),true);
  status = 404; await page.reload(); await page.getByText('ไม่พบรายการภาระงานนี้',{exact:true}).waitFor();
  assert.equal(await page.locator('#retry').isVisible(),false);
  status = 503; await page.reload(); await page.locator('#retry').waitFor({state:'visible'});
  status = 200; await page.locator('#retry').click(); await page.locator('#workload').waitFor({state:'visible'});
  await page.goto(`${base}/ui/workload.html`);
  assert.ok((await page.locator('#state').innerText()).includes('ไม่พบรหัส'));
  // Exercise the profile -> workload -> profile navigation independently of CDN/data.
  await page.route('**/npm/@supabase/supabase-js@2', route => route.fulfill({contentType:'text/javascript',body:`window.supabase={createClient:()=>({from:()=>{const q={select:()=>q,range:()=>q,eq:()=>q,single:()=>q,then:(resolve)=>Promise.resolve({data:null,error:null}).then(resolve)};return q}})};`}));
  await page.route('**/api/workloads?*', route => {
    const url = new URL(route.request().url());
    assert.equal(url.searchParams.get('teacher_id'),id);
    return route.fulfill({contentType:'application/json',body:JSON.stringify({data:[item],total:1})});
  });
  await page.goto(`${base}/ui/teacher.html?id=${id}`);
  await page.locator('#teacher-workloads a').waitFor();
  await page.locator('#teacher-workloads a').click();
  await page.locator('#workload').waitFor({state:'visible'});
  assert.equal(await page.locator('.header').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(140, 29, 36)');
  await page.locator('#back-teacher').click();
  await page.locator('#teacher-workloads a').waitFor();
  assert.ok(page.url().endsWith('#workloads'));
  assert.deepEqual(errors,[]);
  await browser.close(); console.log('Workload UI: four categories, mobile, XSS, empty states, errors and retry passed');
})().catch(error => {console.error(error);process.exit(1)});
