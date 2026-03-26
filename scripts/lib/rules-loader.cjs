const fs = require('node:fs');
const path = require('node:path');

const RULE_FILES = ['kwcag22', 'securecoding49', 'privacy', 'webstandard', 'egov', 'quality'];

function loadRules(rulesDir) {
  const rules = {};
  for (const name of RULE_FILES) {
    const filePath = path.join(rulesDir, `${name}.json`);
    rules[name] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return rules;
}

module.exports = { loadRules, RULE_FILES };
