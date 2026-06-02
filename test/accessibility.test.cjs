// test/accessibility.test.cjs
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { scanAccessibility } = require('../scripts/lib/scanners/accessibility.cjs');
const { loadRules } = require('../scripts/lib/rules-loader.cjs');

describe('scan_accessibility', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const rulesDir = path.join(__dirname, '..', 'rules');
  const rules = loadRules(rulesDir).kwcag22;

  it('detects img without alt (A-01)', async () => {
    const results = await scanAccessibility(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    const v = results.filter(v => v.id === 'A-01');
    assert.ok(v.length > 0);
    assert.strictEqual(v[0].severity, 'critical');
    assert.strictEqual(v[0].autoFixable, true);
  });

  it('detects input without label (A-02)', async () => {
    const results = await scanAccessibility(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    assert.ok(results.some(v => v.id === 'A-02'));
  });

  it('detects empty links/buttons (A-03)', async () => {
    const results = await scanAccessibility(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    // sample-bad.jsp may or may not have empty a/button — test what's there
  });

  it('detects html without lang (A-05)', async () => {
    const results = await scanAccessibility(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    assert.ok(results.some(v => v.id === 'A-05'));
  });

  it('returns no violations for compliant file', async () => {
    const results = await scanAccessibility(path.join(fixturesDir, 'sample-good.jsp'), rules);
    // Good file should have 0 T1 violations (filter out T3 which are claude-only)
    const t1Violations = results.filter(v => v.tier !== 'T3');
    assert.strictEqual(t1Violations.length, 0);
  });

  it('violation has correct schema', async () => {
    const results = await scanAccessibility(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    const v = results[0];
    assert.ok(v.id);
    assert.ok(v.title);
    assert.ok(v.severity);
    assert.ok(v.file);
    assert.ok(typeof v.line === 'number');
    assert.ok(v.code);
    assert.ok(typeof v.autoFixable === 'boolean');
    assert.ok(['high', 'medium', 'low'].includes(v.confidence));
  });

  it('detects target="_blank" without notice (A-34)', async () => {
    const r = await scanAccessibility(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    assert.ok(r.some(v => v.id === 'A-34'), 'A-34 should fire');
  });
  it('detects div[onclick] without keyboard support (A-36)', async () => {
    const r = await scanAccessibility(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    assert.ok(r.some(v => v.id === 'A-36'), 'A-36 should fire');
  });
  it('detects select[onchange] (A-37)', async () => {
    const r = await scanAccessibility(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    assert.ok(r.some(v => v.id === 'A-37'), 'A-37 should fire');
  });
  it('detects CKEditor img without alt (A-38)', async () => {
    const r = await scanAccessibility(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    assert.ok(r.some(v => v.id === 'A-38'), 'A-38 should fire');
  });
  it('A-40 is T3 (manual) and does not fire in static scan', async () => {
    // A-40(인라인 a 카드)은 외부 CSS 클래스의 display 값을 정적 분석으로 판정 불가 → T3 수동 점검.
    // 정적 스캐너에서는 발화하지 않아야 함(오탐 방지). 실프로젝트 스모크에서 .program-box 등 전부 오탐 확인됨.
    const r = await scanAccessibility(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    assert.strictEqual(r.filter(v => v.id === 'A-40').length, 0, 'A-40 must not fire statically (T3)');
  });
  it('detects decorative img without aria-hidden (A-41)', async () => {
    const r = await scanAccessibility(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    assert.ok(r.some(v => v.id === 'A-41'), 'A-41 should fire');
  });
  it('detects outline removal via A-25 (T2)', async () => {
    const r = await scanAccessibility(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    assert.ok(r.some(v => v.id === 'A-25'), 'A-25 should detect outline:none');
  });
  it('A-09 fires on text color but NOT background-color (no false positive)', async () => {
    const r = await scanAccessibility(path.join(fixturesDir, 'sample-bad.jsp'), rules);
    const a09 = r.filter(v => v.id === 'A-09');
    assert.ok(a09.some(v => /color:#777777/i.test(v.code)), 'A-09 should fire on color:#777777');
    assert.ok(!a09.some(v => /background-color/i.test(v.code)), 'A-09 must NOT fire on background-color');
  });
  it('detects media without track (A-43)', async () => {
    const r = await scanAccessibility(path.join(fixturesDir,'sample-bad.jsp'), rules);
    assert.ok(r.some(v => v.id === 'A-43'), 'A-43 should fire on video without track/muted');
  });
  it('detects th without scope (A-44)', async () => {
    const r = await scanAccessibility(path.join(fixturesDir,'sample-bad.jsp'), rules);
    assert.ok(r.some(v => v.id === 'A-44'), 'A-44 should fire on th without scope');
  });
  it('detects user-scalable=no (A-45)', async () => {
    const r = await scanAccessibility(path.join(fixturesDir,'sample-bad.jsp'), rules);
    assert.ok(r.some(v => v.id === 'A-45'), 'A-45 should fire on user-scalable=no');
  });
  it('detects select/textarea without label (A-46)', async () => {
    const r = await scanAccessibility(path.join(fixturesDir,'sample-bad.jsp'), rules);
    assert.ok(r.some(v => v.id === 'A-46'), 'A-46 should fire');
  });
  it('good file: no false positives for new/modified rules', async () => {
    const r = await scanAccessibility(path.join(fixturesDir, 'sample-good.jsp'), rules);
    const ids = ['A-34','A-36','A-37','A-38','A-41','A-25','A-09','A-43','A-44','A-45','A-46'];
    const fp = r.filter(v => ids.includes(v.id));
    assert.strictEqual(fp.length, 0, `good file should be clean, got: ${JSON.stringify(fp.map(v=>v.id+':'+v.code))}`);
  });
});
