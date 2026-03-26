const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadRules } = require('../scripts/lib/rules-loader.cjs');

describe('rules-loader', () => {
  const rulesDir = path.join(__dirname, '..', 'rules');

  it('loads all 6 rule files', () => {
    const rules = loadRules(rulesDir);
    assert.ok(rules.kwcag22);
    assert.ok(rules.securecoding49);
    assert.ok(rules.privacy);
    assert.ok(rules.webstandard);
    assert.ok(rules.egov);
    assert.ok(rules.quality);
  });

  it('each rule file has version and rules array', () => {
    const rules = loadRules(rulesDir);
    for (const [name, ruleSet] of Object.entries(rules)) {
      assert.ok(ruleSet.version, `${name} missing version`);
      assert.ok(Array.isArray(ruleSet.rules), `${name} missing rules array`);
      assert.ok(ruleSet.rules.length > 0, `${name} has no rules`);
    }
  });

  it('each rule has required fields: id, title, severity, tier', () => {
    const rules = loadRules(rulesDir);
    for (const [name, ruleSet] of Object.entries(rules)) {
      for (const rule of ruleSet.rules) {
        assert.ok(rule.id, `${name}: rule missing id`);
        assert.ok(rule.title, `${name}/${rule.id}: missing title`);
        assert.ok(['critical', 'warning', 'info'].includes(rule.severity), `${name}/${rule.id}: invalid severity`);
        assert.ok(['T1', 'T2', 'T3'].includes(rule.tier), `${name}/${rule.id}: invalid tier`);
      }
    }
  });
});
