// Keep the backend catalog identical to the UI. Run after editing scoring rules.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scoring = require('../public/js/workload-scoring.js');
const source = fs.readFileSync(path.join(__dirname, '../public/js/teacher-workload.js'), 'utf8');
const categories = vm.runInNewContext('(' + source.match(/const categories = (\{[\s\S]*?\n  \});/)[1] + ')');
const catalog = {};
for (const [category, [, subtypes]] of Object.entries(categories)) {
  for (const subtype of subtypes) {
    const rule = scoring.rule(subtype);
    if (!rule.roles.length) continue;
    catalog[rule.code] = {
      category, subtype, basis: rule.basis,
      roles: rule.roles.map(([name, weight], index) => ({
        name, weight, available: !rule.unavailable.includes(index),
        fields: scoring.fields(subtype, name), students: scoring.hasStudents(subtype, name)
      }))
    };
  }
}
const output = path.join(__dirname, '../backend/app/workload_rules.json');
const json = JSON.stringify(catalog, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(output, 'utf8') !== json) throw new Error('Backend catalog is stale; run scripts/export-workload-rules.cjs');
} else fs.writeFileSync(output, json);
