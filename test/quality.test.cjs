// test/quality.test.cjs
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { scanQuality } = require('../scripts/lib/scanners/quality.cjs');
const { loadRules } = require('../scripts/lib/rules-loader.cjs');

describe('scan_quality', () => {
  const rulesDir = path.join(__dirname, '..', 'rules');
  const rules = loadRules(rulesDir).quality;

  function createTempFile(content, ext = '.java') {
    const tmpFile = path.join(os.tmpdir(), `govcheck-quality-${Date.now()}${ext}`);
    fs.writeFileSync(tmpFile, content, 'utf-8');
    return tmpFile;
  }

  it('detects TODO/FIXME (Q-01)', async () => {
    const file = createTempFile('// TODO: implement this\n// FIXME: broken');
    const results = await scanQuality(file, rules);
    assert.ok(results.some(v => v.id === 'Q-01'));
    fs.unlinkSync(file);
  });

  it('detects method > 50 lines (Q-02)', async () => {
    let content = 'public class Test {\n  public void longMethod() {\n';
    for (let i = 0; i < 55; i++) content += '    int x' + i + ' = ' + i + ';\n';
    content += '  }\n}\n';
    const file = createTempFile(content);
    const results = await scanQuality(file, rules);
    assert.ok(results.some(v => v.id === 'Q-02'));
    fs.unlinkSync(file);
  });

  it('detects OS paths (Q-08)', async () => {
    const file = createTempFile('String path = "C:\\\\Users\\\\admin";');
    const results = await scanQuality(file, rules);
    assert.ok(results.some(v => v.id === 'Q-08'));
    fs.unlinkSync(file);
  });

  it('detects hardcoded IP (Q-09)', async () => {
    const file = createTempFile('String host = "192.168.0.1";');
    const results = await scanQuality(file, rules);
    assert.ok(results.some(v => v.id === 'Q-09'));
    fs.unlinkSync(file);
  });

  it('detects hardcoded port (Q-10)', async () => {
    const file = createTempFile('String url = "http://server:8080/api";');
    const results = await scanQuality(file, rules);
    assert.ok(results.some(v => v.id === 'Q-10'));
    fs.unlinkSync(file);
  });

  it('good file has no violations', async () => {
    const goodFile = path.join(__dirname, 'fixtures', 'sample-good.java');
    const results = await scanQuality(goodFile, rules);
    assert.strictEqual(results.length, 0);
  });

  it('detects class file > 500 lines (Q-12)', async () => {
    let content = 'public class BigClass {\n';
    for (let i = 0; i < 502; i++) content += '  int field' + i + ' = ' + i + ';\n';
    content += '}\n';
    const file = createTempFile(content);
    const results = await scanQuality(file, rules);
    assert.ok(results.some(v => v.id === 'Q-12'));
    fs.unlinkSync(file);
  });

  it('violation has correct schema', async () => {
    const file = createTempFile('// TODO: fix me');
    const results = await scanQuality(file, rules);
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
