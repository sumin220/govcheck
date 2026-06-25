// test/report.test.cjs
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { summarize, toMarkdown, toHtml, toCsv, generateReport } = require('../scripts/lib/report.cjs');

const scanResult = {
  file: 'src/main/webapp/x.jsp',
  results: [
    {
      domain: 'accessibility', totalCount: 3, truncated: false,
      violations: [
        { id: 'A-44', title: 'th scope 누락', severity: 'warning', tier: 'T2', file: 'src/main/webapp/x.jsp', line: 10, code: '<th>이름</th>', suggestion: 'scope="col" 추가' },
        { id: 'A-44', title: 'th scope 누락', severity: 'warning', tier: 'T2', file: 'src/main/webapp/x.jsp', line: 12, code: '<th>값</th>', suggestion: 'scope="col" 추가' },
        { id: 'A-01', title: 'img alt 누락', severity: 'critical', tier: 'T1', file: 'src/main/webapp/x.jsp', line: 5, code: '<img src="a.png">', suggestion: 'alt 추가' }
      ]
    },
    { domain: 'webstandard', totalCount: 0, violations: [] }
  ]
};

const ruleIndex = {
  kwcag22: { rules: [
    { id: 'A-01', tier: 'T1', pattern: 'x' },
    { id: 'A-44', tier: 'T2', pattern: 'x' },               // a11y는 T2도 실행 → 점검 대상
    { id: 'A-05', tier: 'T1', pattern: 'x' },               // 점검했으나 미발화 → 위반 미발견
    { id: 'A-21', tier: 'T3', title: '대체 텍스트 적절성', description: '이미지 내용과 alt 의미 일치는 사람이 확인' }
  ] },
  // W-05(T2)는 webstandard 스캐너가 실행하지 않으므로 "위반 미발견"에 잡히면 안 됨(HIGH#2 회귀 가드)
  webstandard: { rules: [ { id: 'W-01', tier: 'T1', pattern: 'x' }, { id: 'W-04', tier: 'T1', pattern: 'x' }, { id: 'W-05', tier: 'T2', pattern: 'x' } ] }
};

describe('report.summarize', () => {
  const data = summarize(scanResult, ruleIndex);

  it('위반 총계·심각도 집계', () => {
    assert.strictEqual(data.totals.violations, 3);
    assert.strictEqual(data.totals.critical, 1);
    assert.strictEqual(data.totals.warning, 2);
  });

  it('위반 미발견 = 실제 실행 tier만 집계 (T2-false-pass 방지)', () => {
    // a11y(execTiers T1,T2): A-05 미발화(1). webstandard(execTiers T1만): W-01,W-04 미발화(2),
    // W-05(T2)는 webstandard에서 실행 안 됨 → 제외. 합 3 (4 아님).
    assert.strictEqual(data.totals.noViolRules, 3);
    const ws = data.domains.find(d => d.domain === 'webstandard');
    assert.strictEqual(ws.noViolRules, 2, 'W-05(T2)는 미실행이라 미발견에 포함 안 됨');
    assert.strictEqual(ws.checkedCount, 2, 'webstandard 점검 규칙은 T1 2개');
  });

  it('수동확인(T3) 집계', () => {
    assert.strictEqual(data.totals.manualRules, 1); // A-21
    const a11y = data.domains.find(d => d.domain === 'accessibility');
    assert.ok(a11y.manual.some(m => m.id === 'A-21'));
  });

  it('규칙ID별 집계 + 건수 내림차순', () => {
    const a11y = data.domains.find(d => d.domain === 'accessibility');
    assert.strictEqual(a11y.rules[0].id, 'A-44'); // 2건이 최상위
    assert.strictEqual(a11y.rules[0].count, 2);
  });
});

describe('report.toMarkdown / toHtml', () => {
  const data = summarize(scanResult, ruleIndex);
  const md = toMarkdown(data, { timestamp: '2026-06-25 10:00' });

  it('마크다운에 핵심 섹션 포함 + 정직성 문구', () => {
    assert.ok(md.includes('# govcheck 점검 결과 리포트'));
    assert.ok(md.includes('## 요약'));
    assert.ok(md.includes('부적합 상세'));
    assert.ok(md.includes('A-44'));
    assert.ok(md.includes('수동확인'));
    assert.ok(md.includes('A-21'));
    assert.ok(md.includes('이미지'), '이미지 OCR 한계 안내 포함');
    assert.ok(md.includes('위반 미발견 ≠ 적합'), '적합 보장 아님 문구 포함');
  });

  it('truncated 도메인은 위반 미발견 집계 불가(null) + 경고 표기', () => {
    const sr = { results: [ { domain: 'securecoding', totalCount: 150, truncated: true, violations: [ { id: 'S-01', title: 'x', severity: 'critical', tier: 'T1', file: 'a.java', line: 1, code: 'x' } ] } ] };
    const d = summarize(sr, { securecoding49: { rules: [ { id: 'S-01', tier: 'T1', pattern: 'x' }, { id: 'S-02', tier: 'T1', pattern: 'x' } ] } });
    assert.strictEqual(d.domains[0].noViolRules, null, '잘림 → null(집계 불가)');
    assert.strictEqual(d.totals.truncatedDomains, 1);
    const m = toMarkdown(d, {});
    assert.ok(m.includes('집계 불가') || m.includes('잘림'), '잘림 경고/표기 포함');
  });

  it('마크다운 셀의 파이프/개행 안전화', () => {
    const sr = { file: 'x.jsp', results: [ { domain: 'accessibility', totalCount: 1, violations: [ { id: 'A-09', title: '색 | 대비\n2줄', severity: 'warning', tier: 'T2', file: 'x.jsp', line: 3, code: 'a|b', suggestion: 'fix | now' } ] } ] };
    const d = summarize(sr, { kwcag22: { rules: [ { id: 'A-09', tier: 'T2', pattern: 'x' } ] } });
    const m = toMarkdown(d, {});
    assert.ok(m.includes('색 \\| 대비 2줄'), 'title 파이프 이스케이프 + 개행 제거');
    assert.ok(!/색 \| 대비/.test(m.replace(/\\\|/g, '')), '원시 파이프로 표 깨지지 않음');
  });

  it('HTML은 자가완결 문서', () => {
    const html = toHtml(data, { timestamp: '2026-06-25 10:00' });
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('govcheck 점검 결과 리포트'));
    assert.ok(html.includes('A-44'));
  });
});

describe('report.toCsv (작업용 전체 목록)', () => {
  it('헤더 + 위반당 한 행, 요약과 달리 전부 펼침', () => {
    const csv = toCsv(scanResult);
    const lines = csv.split('\n');
    assert.ok(lines[0].includes('ruleId') && lines[0].includes('file') && lines[0].includes('suggestion'), '헤더');
    // 위반 3건(A-44 x2 + A-01) → 헤더 1 + 3행 = 4
    assert.strictEqual(lines.length, 4, '위반당 한 행(요약 샘플 제한 없음)');
    assert.ok(csv.includes('A-44') && csv.includes('A-01'));
  });
  it('콤마/따옴표 포함 필드 안전 이스케이프', () => {
    const sr = { results: [ { domain: 'accessibility', violations: [ { id: 'A-09', title: '색, "대비"', severity: 'warning', tier: 'T2', file: 'x.jsp', line: 1, code: 'a,b', suggestion: 'fix, now' } ] } ] };
    const csv = toCsv(sr);
    assert.ok(csv.includes('"색, ""대비"""'), '콤마+따옴표 이스케이프');
  });
});

describe('report.generateReport', () => {
  it('내장 규칙으로 로드해 md/html/data 반환', () => {
    const r = generateReport(scanResult, { timestamp: '2026-06-25 10:00' });
    assert.ok(r.markdown && r.html && r.data);
    assert.ok(r.markdown.includes('A-44'));
    // 실제 kwcag22.json 로드 시 A-21(대체텍스트 적절성, T3)이 수동확인에 떠야 함
    assert.ok(r.markdown.includes('수동확인'));
  });
});
