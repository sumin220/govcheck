// test/privacy.test.cjs
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { scanPrivacy } = require('../scripts/lib/scanners/privacy.cjs');
const { loadRules } = require('../scripts/lib/rules-loader.cjs');

describe('scan_privacy', () => {
  const rulesDir = path.join(__dirname, '..', 'rules');
  const rules = loadRules(rulesDir).privacy;

  function createTempFile(content, ext = '.java') {
    const tmpFile = path.join(os.tmpdir(), `govcheck-test-${Date.now()}${ext}`);
    fs.writeFileSync(tmpFile, content, 'utf-8');
    return tmpFile;
  }

  it('detects resident registration number (P-01)', async () => {
    const file = createTempFile('// 주민번호: 900101-1234567');
    const results = await scanPrivacy(file, rules);
    assert.ok(results.some(v => v.id === 'P-01'));
    fs.unlinkSync(file);
  });

  it('detects phone number (P-02)', async () => {
    const file = createTempFile('String phone = "010-1234-5678";');
    const results = await scanPrivacy(file, rules);
    assert.ok(results.some(v => v.id === 'P-02'));
    fs.unlinkSync(file);
  });

  it('detects email (P-03)', async () => {
    const file = createTempFile('String email = "user@example.com";');
    const results = await scanPrivacy(file, rules);
    assert.ok(results.some(v => v.id === 'P-03'));
    fs.unlinkSync(file);
  });

  it('detects credit card number (P-04)', async () => {
    const file = createTempFile('// card: 1234-5678-9012-3456');
    const results = await scanPrivacy(file, rules);
    assert.ok(results.some(v => v.id === 'P-04'));
    fs.unlinkSync(file);
  });

  it('detects personal info in log statement (P-07)', async () => {
    const file = createTempFile('logger.info("User RRN: " + "900101-1234567");');
    const results = await scanPrivacy(file, rules);
    assert.ok(results.some(v => v.id === 'P-07'));
    fs.unlinkSync(file);
  });

  it('no false positives on date-like strings', async () => {
    const file = createTempFile('String date = "20260326-1234567";');
    const results = await scanPrivacy(file, rules);
    const rrn = results.filter(v => v.id === 'P-01');
    assert.strictEqual(rrn.length, 0);
    fs.unlinkSync(file);
  });

  it('returns correct violation schema', async () => {
    const file = createTempFile('// 900101-1234567');
    const results = await scanPrivacy(file, rules);
    const v = results[0];
    assert.ok(v.id);
    assert.ok(v.file);
    assert.ok(typeof v.line === 'number');
    assert.ok(v.code);
    assert.ok(v.severity);
    assert.ok(v.confidence);
    fs.unlinkSync(file);
  });
});
