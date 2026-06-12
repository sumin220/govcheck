// test/egov-compat.test.cjs
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { scanEgovCompat } = require('../scripts/lib/scanners/egov-compat.cjs');
const { loadRules } = require('../scripts/lib/rules-loader.cjs');

describe('scan_egov_compat', () => {
  const rulesDir = path.join(__dirname, '..', 'rules');
  const rules = loadRules(rulesDir).egov;

  it('good project passes all checks', async () => {
    const projectDir = path.join(__dirname, 'fixtures', 'egov-project');
    const results = await scanEgovCompat(projectDir, rules);
    assert.strictEqual(results.length, 0);
  });

  it('detects missing egovframework jar (E-01)', async () => {
    const projectDir = path.join(__dirname, 'fixtures', 'egov-bad-project');
    const results = await scanEgovCompat(projectDir, rules);
    assert.ok(results.some(v => v.id === 'E-01'));
  });

  it('detects missing globals.properties (E-05)', async () => {
    const projectDir = path.join(__dirname, 'fixtures', 'egov-bad-project');
    const results = await scanEgovCompat(projectDir, rules);
    assert.ok(results.some(v => v.id === 'E-05'));
  });

  it('detects missing standard directory structure (E-06)', async () => {
    const projectDir = path.join(__dirname, 'fixtures', 'egov-bad-project');
    const results = await scanEgovCompat(projectDir, rules);
    assert.ok(results.some(v => v.id === 'E-06'));
  });

  it('violation has correct schema', async () => {
    const projectDir = path.join(__dirname, 'fixtures', 'egov-bad-project');
    const results = await scanEgovCompat(projectDir, rules);
    const v = results[0];
    assert.ok(v.id);
    assert.ok(v.title);
    assert.ok(v.severity);
    assert.ok(typeof v.autoFixable === 'boolean');
  });
});
