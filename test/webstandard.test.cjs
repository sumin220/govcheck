// test/webstandard.test.cjs
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { scanWebstandard } = require('../scripts/lib/scanners/webstandard.cjs');
const { loadRules } = require('../scripts/lib/rules-loader.cjs');

describe('scan_webstandard', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const rulesDir = path.join(__dirname, '..', 'rules');
  const rules = loadRules(rulesDir).webstandard;

  it('detects deprecated tags W-01 in sample-bad.jsp', async () => {
    // sample-bad.jsp does not have font/center tags by default, so we need to
    // test with a string that has them. Check sample-bad.jsp for what it has.
    // sample-bad.jsp has no deprecated tags, so W-01 should NOT fire on it.
    // We test detection via an inline fixture instead.
    const fs = require('node:fs');
    const os = require('node:os');
    const tmpFile = path.join(os.tmpdir(), 'w01-test.jsp');
    fs.writeFileSync(tmpFile, [
      '<%@ page language="java" contentType="text/html; charset=UTF-8" %>',
      '<!DOCTYPE html>',
      '<html lang="ko">',
      '<head><meta charset="UTF-8"><title>테스트</title></head>',
      '<body>',
      '  <font color="red">빨간 글씨</font>',
      '  <center>가운데 정렬</center>',
      '</body>',
      '</html>'
    ].join('\n'));

    const results = await scanWebstandard(tmpFile, rules);
    const v = results.filter(v => v.id === 'W-01');
    assert.ok(v.length > 0, 'W-01 should detect deprecated font/center tags');
    assert.strictEqual(v[0].severity, 'critical');
    fs.unlinkSync(tmpFile);
  });

  it('detects missing DOCTYPE W-03 in sample-bad.jsp', async () => {
    const results = await scanWebstandard(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    const v = results.filter(v => v.id === 'W-03');
    assert.ok(v.length > 0, 'W-03 should detect missing DOCTYPE in sample-bad.jsp');
    assert.strictEqual(v[0].severity, 'critical');
  });

  it('detects inline event handler W-04 in sample-bad.jsp', async () => {
    const results = await scanWebstandard(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    const v = results.filter(v => v.id === 'W-04');
    assert.ok(v.length > 0, 'W-04 should detect onclick handler in sample-bad.jsp');
    assert.strictEqual(v[0].severity, 'warning');
  });

  it('detects duplicate IDs W-07 in sample-dup-id.jsp', async () => {
    const results = await scanWebstandard(path.join(fixturesDir, 'sample-dup-id.jsp'), rules);
    const v = results.filter(v => v.id === 'W-07');
    assert.ok(v.length > 0, 'W-07 should detect duplicate IDs');
    assert.strictEqual(v[0].severity, 'critical');
    // Should detect both "main" and "title" as duplicates
    const ids = v.map(viol => viol.code);
    assert.ok(ids.some(c => c.includes('main')), 'should report duplicate "main" id');
    assert.ok(ids.some(c => c.includes('title')), 'should report duplicate "title" id');
  });

  it('detects missing charset W-09 in sample-bad.jsp', async () => {
    const results = await scanWebstandard(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    const v = results.filter(v => v.id === 'W-09');
    assert.ok(v.length > 0, 'W-09 should detect missing charset meta tag');
  });

  it('returns 0 T1 violations for sample-good.jsp', async () => {
    const results = await scanWebstandard(path.join(fixturesDir, 'sample-good.jsp'), rules);
    const t1Violations = results.filter(v => v.tier === 'T1');
    assert.strictEqual(t1Violations.length, 0, `Expected 0 T1 violations, got: ${JSON.stringify(t1Violations)}`);
  });

  it('violation has correct schema', async () => {
    const results = await scanWebstandard(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    assert.ok(results.length > 0, 'should have at least one violation for schema check');
    const v = results[0];
    assert.ok(v.id, 'violation should have id');
    assert.ok(v.title, 'violation should have title');
    assert.ok(v.severity, 'violation should have severity');
    assert.ok(v.tier, 'violation should have tier');
    assert.ok(v.file, 'violation should have file');
    assert.ok(typeof v.line === 'number', 'violation line should be a number');
    assert.strictEqual(v.column, 0, 'violation column should be 0');
    assert.ok(v.code, 'violation should have code');
    assert.ok(typeof v.autoFixable === 'boolean', 'autoFixable should be boolean');
    assert.ok(['high', 'medium', 'low'].includes(v.confidence), 'confidence should be high/medium/low');
  });
});
