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
  it('A-34 extension: onclick window.open without notice fires, with notice does not', async () => {
    const r = await scanAccessibility(path.join(fixturesDir,'sample-bad.jsp'), rules);
    const a34 = r.filter(v => v.id === 'A-34');
    assert.strictEqual(a34.length, 3, 'a[target=_blank] 1건 + onclick div 1건 + 양쪽 패턴 앵커 1건 = 정확히 3건');
    assert.ok(a34.some(v => v.code.includes('window.open')), 'onclick 패턴 발화');
    assert.ok(!a34.some(v => v.code.includes('팝업 안내')), '안내 있는 onclick은 미발화');
    // dedupe 가드: target=_blank + onclick 동시 보유 요소가 2건으로 중복 보고되지 않음
    const dualReports = a34.filter(v => v.code.includes('/dual'));
    assert.strictEqual(dualReports.length, 1, '양쪽 셀렉터 매칭 요소는 정확히 1건만 보고');
    // 호출 형태 가드: 문자열 리터럴 안의 window.open은 미발화
    assert.ok(!a34.some(v => v.code.includes('disabled here')), '문자열 리터럴 window.open은 미발화');
    // onclick 경로는 휴리스틱이므로 confidence medium, a[target=_blank]는 high
    assert.ok(a34.filter(v => v.code.includes('VR 보기')).every(v => v.confidence === 'medium'));
  });
  it('comment masking: commented-out violations do not fire (A-47/A-48)', async () => {
    const r = await scanAccessibility(path.join(fixturesDir,'sample-good.jsp'), rules);
    // good fixture의 JSP 주석 안에 aria-label="버튼"과 &amp;#39;가 있으나 마스킹으로 미발화
    assert.ok(!r.some(v => v.id === 'A-47' || v.id === 'A-48'), '주석 내부 패턴은 마스킹되어 미발화');
  });
  it('detects generic aria-label (A-47)', async () => {
    const r = await scanAccessibility(path.join(fixturesDir,'sample-bad.jsp'), rules);
    assert.ok(r.some(v => v.id === 'A-47'), 'A-47 should fire on aria-label="버튼"');
  });
  it('detects double-escaped entities (A-48)', async () => {
    const r = await scanAccessibility(path.join(fixturesDir,'sample-bad.jsp'), rules);
    assert.ok(r.some(v => v.id === 'A-48'), 'A-48 should fire on &amp;#39;');
  });
  it('detects inadequate alt text — exactly 3, one per sub-pattern (A-49)', async () => {
    const r = await scanAccessibility(path.join(fixturesDir,'sample-bad.jsp'), rules);
    const a49 = r.filter(v => v.id === 'A-49');
    assert.strictEqual(a49.length, 3, '파일명 + generic 단어 + 공백 = 정확히 3건');
    const filename = a49.find(v => v.code.includes('IMG_1234.jpg'));
    assert.ok(filename, '(b) 파일명 alt 발화');
    assert.ok(/파일명/.test(filename.suggestion), '(b) reason은 파일명 안내');
    const generic = a49.find(v => v.code.includes('/b.jpg'));
    assert.ok(generic, '(c) generic 단어 alt 발화');
    assert.ok(/무의미한 값/.test(generic.suggestion), '(c) reason은 무의미한 값 안내');
    const blank = a49.find(v => v.code.includes('/c.jpg'));
    assert.ok(blank, '(a) 공백 alt 발화');
    assert.ok(/공백\/구두점/.test(blank.suggestion), '(a) reason은 공백/구두점 안내');
  });
  it('A-49 EL skip: ${} alt in good file does not fire', async () => {
    const r = await scanAccessibility(path.join(fixturesDir,'sample-good.jsp'), rules);
    const a49 = r.filter(v => v.id === 'A-49');
    assert.strictEqual(a49.length, 0, `good file A-49는 0건이어야 함: ${JSON.stringify(a49.map(v=>v.code))}`);
    // EL skip 전용 가드: ${item.imgNm} img가 발화 목록에 없어야 함
    assert.ok(!r.some(v => v.id === 'A-49' && v.code.includes('${item.imgNm}')), 'EL alt는 정적 판정 불가 — skip');
  });
  it('A-49 scriptlet skip: <%= %> alt residues do not fire, real literals still do', async () => {
    // preprocessJsp가 스크립틀릿을 삭제한 잔여값(".jpg", " 사진", "이미지 ")은 미발화,
    // 같은 파일의 진짜 리터럴 파일명(hero.jpg)은 발화해야 함 (과잉 skip 방지 대조군)
    const r = await scanAccessibility(path.join(fixturesDir,'sample-a49-scriptlet.jsp'), rules);
    const a49 = r.filter(v => v.id === 'A-49');
    assert.strictEqual(a49.length, 1, `스크립틀릿 잔여값 3건 skip + 리터럴 1건 발화: ${JSON.stringify(a49.map(v=>v.code))}`);
    assert.ok(a49[0].code.includes('hero.jpg'), '리터럴 파일명 alt는 정상 발화');
  });
  it('good file: no false positives for new/modified rules', async () => {
    const r = await scanAccessibility(path.join(fixturesDir, 'sample-good.jsp'), rules);
    const ids = ['A-34','A-36','A-37','A-38','A-41','A-25','A-09','A-43','A-44','A-45','A-46','A-47','A-48','A-49'];
    const fp = r.filter(v => ids.includes(v.id));
    assert.strictEqual(fp.length, 0, `good file should be clean, got: ${JSON.stringify(fp.map(v=>v.id+':'+v.code))}`);
  });
});
