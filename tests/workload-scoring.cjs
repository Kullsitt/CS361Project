const assert = require('node:assert/strict');
const {rule, calculate, studentWeight, groups, hasStudents, evaluate, fields, fieldLabel} = require('../public/js/workload-scoring.js');
function score(subtype, values) {
  const config = rule(subtype);
  return calculate({basis: config.basis, weight: config.roles[0]?.[1], share: 100, ...values});
}
assert.equal(score('1.1 วิชาบรรยาย', {credits: 3}), 200);
assert.equal(score('1.1 วิชาบรรยาย', {credits: 1.5, weight: 1.2, share: 50}), 60);
assert.equal(score('1.1 วิชาบรรยาย', {credits: 3, weight: 0.8}), 160);
assert.equal(score('1.4 ซีเนียร์โปรเจก', {quantity: 1}), 40);
assert.equal(score('1.5 สหกิจศึกษา', {quantity: 3}), 120);
assert.equal(score('1.9 วิทยานิพนธ์', {credits: 6}), 120);
assert.equal(score('1.11 ค้นคว้าอิสระ', {credits: 6}), 60);
assert.equal(score('4.4 ประเมินผลงาน', {quantity: 1}), 15);
assert.equal(score('1.1 วิชาบรรยาย', {credits: 3, weight: 0}), 0);
assert.equal(score('1.1 วิชาบรรยาย', {credits: 3, share: 0}), 0);
assert.equal(score('1.1 วิชาบรรยาย', {credits: ''}), null);
assert.equal(score('1.1 วิชาบรรยาย', {credits: -1}), null);
assert.equal(score('1.1 วิชาบรรยาย', {credits: 3, share: 101}), null);
assert.equal(score('1.1 วิชาบรรยาย', {credits: 3, weight: Infinity}), null);
assert.equal(score('5 คะแนนพิเศษ', {quantity: 1}), null);
assert.equal(score('5 คะแนนพิเศษ', {quantity: 1, weight: 0.25}), null);
assert.equal(rule('1.10 ปัญหาพิเศษ').roles[1][1], 0.1125);
assert.equal(rule('1.1 วิชาบรรยาย').roles[0][0], 'ผู้สอนวิชาบรรยาย');
assert.deepEqual(rule('1.4 ซีเนียร์โปรเจก').roles.slice(0, 3), [['อาจารย์ที่ปรึกษา', 0.2], ['อาจารย์ที่ปรึกษาร่วม', 0.1], ['กรรมการสอบ', 0.05]]);
for (const [students, weight] of [[0, 1], [99, 1], [100, 1.1], [250, 1.1], [251, 1.2], [500, 1.2], [501, 1.3], ['', null], [-1, null], [1.5, null]]) {
  assert.equal(studentWeight(students), weight);
}
assert.ok(Math.abs(score('1.1 วิชาบรรยาย', {credits: 3, weight: studentWeight(125)}) - 220) < 1e-9);

// Independent transcription of the PDF's numbered alternatives, including
// evaluator-supplied weights and the clipped fourth patent alternative.
const expectedWeights = {
  '1.1':[1], '1.2':[0.6,0.5,0.5], '1.3':[0.1,0.05], '1.4':[0.2,0.1,0.05],
  '1.5':[0.2,0.1,0.05], '1.6':[1.1], '1.7':[0.6,0.5], '1.8':[0.15,0.075],
  '1.9':[0.1,0.05], '1.10':[0.225,0.1125], '1.11':[0.05,0.025],
  '2.1':[1,0.5,0.25,0.125], '2.2':[0.05], '2.3.1':[2.5,2.25,2,1.75,1.5,1.25],
  '2.3.2':[1.25,1.125,1,0.875,0.75], '2.3.3':[0.75,0.5,0.375,0.25],
  '2.3.4':[0.75,0.375,0.375,0.75], '2.3.5':[0.4,0.2,0.2],
  '2.4.1':[0.75,0.375], '2.4.2':[0.5,0.25], '2.5':[0.1,2.75,2.25,''],
  '2.6.1':[2,1.5], '2.6.2':[0.4], '2.7':[0.5,0.4,0.4,0.5,0.5,0.05],
  '2.8.1':[2.25,2,1.75,1.5,1.25,1,0.75,0.375], '2.8.2':[1,0.75,0.625,0.5,0.25],
  '2.9':[1,0.5,0.25,0.125,0.05], '2.10':[1,0.5,0.25],
  '3.1':['','','','',0.25], '3.2':['',''], '3.3':[0.05,0.1,0.15,0.05],
  '3.4':[0.25], '3.5':[0.125,0.125,0.125],
  '4.1.1':[0.075,0.05], '4.2.1':[0.075,0.05], '4.2.2':[0.2],
  '4.3':[0.075,0.075,0.075,0.075], '4.4':[0.075,0.05], '4.5':[0.1], '4.6':[0.1]
};
for (const [code, expected] of Object.entries(expectedWeights)) {
  assert.deepEqual(rule(code).roles.map(([, weight]) => weight), expected, code);
  assert.ok(rule(code).page >= 2 && rule(code).page <= 16, `${code}: source page`);
}
assert.equal(rule('1.5').roles[2][0], 'กรรมการตรวจผลงาน');
assert.equal(rule('1.4').roles[2][0], 'กรรมการสอบ');
assert.equal(rule('2.1').roleLabel, 'ชนิดทุน');
assert.equal(rule('3.1').roleLabel, 'ตำแหน่ง');
assert.equal(rule('2.3.1').roleLabel, 'ชนิดงาน');
assert.deepEqual(rule('2.5').unavailable, [3]);
assert.deepEqual(rule('คะแนนพิเศษ / ผลงานเพิ่มเติม').roles, []);
assert.equal(score('2.3.1', {weight:1.25,share:20}), 50); // PDF's publication example
assert.equal(score('2.4.1', {share:20}), 30); // PDF's oral-presentation example
assert.equal(score('2.6.2', {quantity:2,share:50}), 80);
assert.equal(score('3.1', {}), null); // Never assume an evaluator's weight
assert.equal(score('3.2', {weight:75,quantity:99}), 75); // Points, not 200x points
assert.equal(score('3.2', {weight:0}), 0);
assert.equal(score('3.5', {quantity:99}), 25); // One entry per role
assert.equal(score('4.2.2', {}), 40);
// Every audited subtype is reachable through exactly one main-type dropdown.
const groupedCodes = Object.entries(groups).filter(([key]) => key !== 'special').flatMap(([, entries]) => entries.flatMap(([, , codes]) => codes));
assert.deepEqual([...groupedCodes].sort(), Object.keys(expectedWeights).sort());
assert.equal(new Set(groupedCodes).size, groupedCodes.length);
const lecture = {subtype:'1.1', role:rule('1.1').roles[0][0], credits:3, students:125, share:100};
assert.ok(Math.abs(evaluate(lecture).score - 220) < 1e-9);
assert.deepEqual(evaluate({...lecture, weight:999, score:999999, basis:'direct'}), evaluate(lecture));
assert.equal(evaluate({...lecture, students:''}).status, 'incomplete');
assert.equal(evaluate({...lecture, role:'invented role'}).status, 'unavailable');
assert.equal(evaluate({subtype:'3.1', role:rule('3.1').roles[0][0], share:100}).status, 'pending');
assert.equal(evaluate({subtype:'3.2', role:rule('3.2').roles[1][0], weight:20, share:100}).status, 'pending');
assert.equal(evaluate({subtype:'3.1', role:rule('3.1').roles[4][0], share:100}).score, 50);
assert.equal(evaluate({subtype:'2.5', role:rule('2.5').roles[3][0], share:100}).status, 'unavailable');
assert.equal(evaluate({subtype:'2.3.1', role:rule('2.3.1').roles[5][0], share:20}).score, 50);
assert.equal(evaluate({subtype:'3.3', role:rule('3.3').roles[3][0], share:100, quantity:1, students:300}).status, 'incomplete');
assert.equal(evaluate({subtype:'3.3', role:rule('3.3').roles[3][0], share:100, quantity:1, students:301}).score, 10);
for (const code of ['1.4','1.9','1.10','1.11']) {
  for (const [role] of rule(code).roles) assert.equal(hasStudents(code, role), true);
}
assert.equal(hasStudents('1.1', rule('1.1').roles[0][0]), false);
for (const [role] of rule('1.5').roles) assert.equal(hasStudents('1.5', role), false);
for (const code of ['1.3','1.8']) {
  for (const [role] of rule(code).roles) assert.equal(hasStudents(code, role), false);
}
assert.equal(hasStudents('2.3.1', rule('2.3.1').roles[0][0]), false);
assert.equal(hasStudents('3.5', rule('3.5').roles[0][0]), true);
assert.equal(hasStudents('3.5', rule('3.5').roles[1][0]), true);
assert.equal(hasStudents('3.5', rule('3.5').roles[2][0]), false);
assert.equal(hasStudents('4.3', rule('4.3').roles[1][0]), true);
assert.equal(hasStudents('4.3', rule('4.3').roles[0][0]), false);
assert.equal(hasStudents('2.9', rule('2.9').roles[3][0]), true);
assert.equal(hasStudents('2.9', rule('2.9').roles[4][0]), true);
assert.equal(hasStudents('2.9', rule('2.9').roles[0][0]), false);
assert.equal(hasStudents('1.4', 'invented role'), false);
console.log('Workload scoring: formulas, roles and student-count boundaries passed');
console.log(`PDF audit: ${Object.keys(expectedWeights).length} subtypes and ${Object.values(expectedWeights).reduce((n, values) => n + values.length, 0)} alternatives checked`);
console.log('Hierarchy coverage, automatic immutable scores, pending assessment and student-name visibility passed');
assert.deepEqual(fields('1.4'), ['course','role','quantity','share']);
assert.deepEqual(fields('1.9'), ['course','role','credits','share']);
assert.deepEqual(fields('2.3.1'), ['role','share','source']);
assert.deepEqual(fields('2.8.1'), ['role','share','source','budget']);
assert.deepEqual(fields('2.7'), ['role','share']);
assert.deepEqual(fields('3.1'), ['role']);
assert.deepEqual(fields('3.5'), ['role']);
assert.equal(fields('3.3', rule('3.3').roles[0][0]).includes('students'), false);
assert.equal(fields('3.3', rule('3.3').roles[3][0]).includes('students'), true);
assert.deepEqual(fields('4.6'), ['role','organization','quantity']);
assert.equal(fieldLabel('4.6', 'quantity'), 'จำนวนวารสาร');
for (const code of groupedCodes) {
  const config = rule(code);
  for (const [role] of config.roles) {
    const names = fields(code, role);
    assert.equal(new Set(names).size, names.length);
    assert.ok(names.includes('role'));
    if (config.basis === 'quantity') assert.ok(names.includes('quantity'), `${code}: quantity required`);
    if (['credits','credits3'].includes(config.basis)) assert.ok(names.includes('credits'), `${code}: credits required`);
    if (code.startsWith('2.')) assert.ok(!names.includes('students') && !names.includes('hours') && !names.includes('credits'));
  }
}
console.log('Subtype-specific fields and role-dependent inputs passed');
