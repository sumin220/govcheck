// scripts/lib/report.cjs
'use strict';

// govcheck 점검 결과(scan_all/scan_file 출력)를 사람이 읽는 리포트로 변환한다.
// kwcag-check 스킬의 골격을 차용: 요약 + 도메인별 표 + 부적합 상세 + 수동확인 안내.
//
// 정직성 원칙(공공 점검 리포트의 핵심):
//  - govcheck는 '위반(부적합)'만 직접 관측한다. "위반 미발견"은 적합을 보장하지 않는다
//    (해당 요소 부재 포함, 자동 점검 대상이 아닌 항목 제외). 그래서 "적합"이라 단정하지 않는다.
//  - "위반 미발견" 집계는 각 도메인 스캐너가 '실제로 실행하는 tier'(execTiers)만 대상으로 한다
//    — 실행도 안 한 T2 규칙을 통과로 위장하지 않기 위함.
//  - 도메인 결과가 잘리면(truncated) 미발견 집계가 신뢰 불가하므로 '집계 불가'로 표기한다.

const path = require('node:path');
const { loadRules } = require('./rules-loader.cjs');

// 도메인 메타. execTiers = 해당 도메인 스캐너가 '실제 실행'하는 tier.
// ⚠️ scripts/lib/scanners/*.cjs 의 tier-skip 로직과 동기화돼야 한다(불확실하면 보수적으로 좁게 — 과대표시 금지):
//   accessibility : T3만 skip            → [T1,T2]
//   webstandard/securecoding/privacy/quality/webvuln : T2·T3 skip → [T1]
//   egovCompat    : (보수적) [T1,T2]
const DOMAIN_META = {
  accessibility: { ruleKey: 'kwcag22', label: '웹접근성 (KWCAG 2.2)', execTiers: ['T1', 'T2'] },
  webstandard:   { ruleKey: 'webstandard', label: '웹표준', execTiers: ['T1'] },
  securecoding:  { ruleKey: 'securecoding49', label: '시큐어코딩', execTiers: ['T1'] },
  privacy:       { ruleKey: 'privacy', label: '개인정보보호', execTiers: ['T1'] },
  egovCompat:    { ruleKey: 'egov', label: 'eGov 호환성', execTiers: ['T1', 'T2'] },
  quality:       { ruleKey: 'quality', label: '품질 (GS인증)', execTiers: ['T1'] },
  webvuln:       { ruleKey: 'webvuln', label: '웹취약점', execTiers: ['T1'] },
  keyboard:      { ruleKey: null, label: '동적 키보드·명도대비 (K)', execTiers: [] }
};

const SEVERITY_LABEL = { critical: '심각', warning: '경고', info: '정보' };

// 파일 경로를 src/main/webapp|java 이후 또는 마지막 3세그먼트로 축약.
function shortFile(f) {
  if (!f) return '';
  const s = String(f).replace(/\\/g, '/');
  const m = s.match(/(?:src\/main\/webapp\/|src\/main\/java\/)(.*)$/);
  if (m) return m[1];
  return s.split('/').slice(-3).join('/');
}

// 마크다운 표 셀 안전화: 파이프(|)는 이스케이프, 개행은 공백으로.
function mdCell(s) {
  return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/**
 * scanResult + 규칙 정의 → 리포트 데이터 모델 (순수).
 */
function summarize(scanResult, ruleIndex) {
  const results = (scanResult && scanResult.results) || [];
  const isSingleFile = !!(scanResult && scanResult.file);
  const domains = [];
  const totals = { violations: 0, critical: 0, warning: 0, info: 0, failRules: 0, noViolRules: 0, manualRules: 0, truncatedDomains: 0 };

  for (const dr of results) {
    const meta = DOMAIN_META[dr.domain] || { ruleKey: null, label: dr.domain, execTiers: [] };
    const violations = dr.violations || [];
    const totalCount = dr.totalCount != null ? dr.totalCount : violations.length;
    const truncated = !!dr.truncated;

    // 규칙ID별 집계
    const byRule = {};
    for (const v of violations) {
      const rid = v.id || '(미분류)';
      if (!byRule[rid]) byRule[rid] = { id: rid, title: v.title, severity: v.severity, tier: v.tier, count: 0, samples: [] };
      byRule[rid].count++;
      if (byRule[rid].samples.length < 3) {
        byRule[rid].samples.push({ file: shortFile(v.file), line: v.line, code: (v.code || '').replace(/\s+/g, ' ').trim().slice(0, 120), suggestion: v.suggestion || '' });
      }
      totals.violations++;
      if (v.severity === 'critical') totals.critical++;
      else if (v.severity === 'warning') totals.warning++;
      else totals.info++;
    }
    const firedIds = new Set(Object.keys(byRule));

    // 실제 실행되는 규칙(execTiers ∩ pattern 보유)만 "점검 규칙"으로 본다.
    const ruleSet = meta.ruleKey && ruleIndex ? ruleIndex[meta.ruleKey] : null;
    const allRules = (ruleSet && ruleSet.rules) || [];
    const execRules = allRules.filter(r => meta.execTiers.includes(r.tier) && r.pattern);
    const t3Rules = allRules.filter(r => r.tier === 'T3');

    // 잘림이면 firedIds가 일부 손실 → 미발견 집계 신뢰 불가(null).
    let noViolRules = null;
    if (!truncated) {
      noViolRules = execRules.filter(r => !firedIds.has(r.id)).length;
      totals.noViolRules += noViolRules;
    } else {
      totals.truncatedDomains++;
    }
    totals.failRules += execRules.filter(r => firedIds.has(r.id)).length;
    totals.manualRules += t3Rules.length;

    domains.push({
      domain: dr.domain,
      label: meta.label,
      totalViolations: totalCount,
      truncated,
      error: dr.error || null,
      rules: Object.values(byRule).sort((a, b) => b.count - a.count),
      checkedCount: execRules.length,
      noViolRules,                 // null = 잘림으로 집계 불가
      manual: t3Rules.map(r => ({ id: r.id, title: r.title, hint: r.description || '' }))
    });
  }

  return { target: (scanResult && (scanResult.file || scanResult.target)) || '(project)', isSingleFile, totals, domains };
}

function bar(n) { return n > 0 ? `**${n}**` : '0'; }

/** 데이터 모델 → Markdown 리포트 */
function toMarkdown(data, opts = {}) {
  const ts = opts.timestamp || '';
  const t = data.totals;
  const L = [];
  L.push('# govcheck 점검 결과 리포트', '');
  L.push(`- 점검 대상: \`${data.target}\`${data.isSingleFile ? ' (단일 파일)' : ''}`);
  if (ts) L.push(`- 점검 일시: ${ts}`);
  L.push('- 기준: govcheck — KWCAG 2.2 · 웹표준 · 시큐어코딩 · 개인정보 · eGov · 품질 · 웹취약점');
  L.push('');

  L.push('## 요약', '');
  L.push('| 구분 | 값 |', '|---|---:|');
  L.push(`| 부적합(위반) 총 | ${bar(t.violations)} |`);
  L.push(`| ├ 심각(critical) | ${t.critical} |`);
  L.push(`| ├ 경고(warning) | ${t.warning} |`);
  L.push(`| └ 정보(info) | ${t.info} |`);
  L.push(`| 위반 발견 규칙(부적합) | ${t.failRules}종 |`);
  L.push(`| 위반 미발견 규칙\\* | ${t.noViolRules} |`);
  L.push(`| 수동확인 필요(T3) | ${t.manualRules} |`);
  L.push('');
  L.push('\\* **위반 미발견 ≠ 적합.** 자동 점검 규칙이 위반을 찾지 못한 것(해당 요소 부재 포함)일 뿐, 적합을 보장하지 않습니다. 자동 점검 대상이 아닌 항목(일부 T2·문서수준·런타임 계산)은 집계에서 제외됩니다.');
  if (t.truncatedDomains > 0) L.push('', `> ⚠️ ${t.truncatedDomains}개 도메인이 결과 잘림(maxResults 초과)으로 "위반 미발견" 집계 불가 — maxResults를 높여 재실행하세요.`);
  if (data.isSingleFile) L.push('', '> ※ 단일 파일 기준입니다. 문서수준·교차파일(페이지 제목 중복 등)·런타임 항목은 한 파일만으로 판정할 수 없습니다.');
  L.push('');

  L.push('### 도메인별', '');
  L.push('| 도메인 | 부적합 | 위반 미발견 | 수동확인 |', '|---|---:|---:|---:|');
  for (const d of data.domains) {
    const flag = d.error ? ` ⚠️${d.error}` : (d.truncated ? ' (잘림)' : '');
    const noViol = d.truncated ? '—' : d.noViolRules;
    L.push(`| ${mdCell(d.label)}${flag} | ${bar(d.totalViolations)} | ${noViol} | ${d.manual.length} |`);
  }
  L.push('');

  // 부적합 상세
  L.push('## 부적합 상세', '');
  const failing = data.domains.filter(d => d.rules.length > 0);
  if (failing.length === 0) L.push('_부적합 위반이 없습니다._', '');
  for (const d of failing) {
    L.push(`### ${d.label} — ${d.totalViolations}건`, '');
    L.push('| 규칙 | 제목 | 심각도 | 건수 | 대표 위치 |', '|---|---|---|---:|---|');
    for (const r of d.rules) {
      const sev = SEVERITY_LABEL[r.severity] || r.severity || '';
      const loc = r.samples[0] ? `${r.samples[0].file}:${r.samples[0].line}` : '';
      L.push(`| ${mdCell(r.id)} | ${mdCell(r.title)} | ${mdCell(sev)} | ${r.count} | \`${mdCell(loc)}\` |`);
    }
    L.push('');
    const topWithFix = d.rules.filter(r => r.samples.some(s => s.suggestion)).slice(0, 3);
    for (const r of topWithFix) {
      const s = r.samples.find(x => x.suggestion);
      if (s) L.push(`- **${mdCell(r.id)}** \`${mdCell(s.file + ':' + s.line)}\` — ${mdCell(s.suggestion)}`);
    }
    if (topWithFix.length) L.push('');
  }

  // 수동확인
  const manualDomains = data.domains.filter(d => d.manual.length > 0);
  if (manualDomains.length) {
    L.push('## 수동확인 필요 (자동 점검 불가)', '');
    L.push('> 아래 항목은 정적 분석으로 판정할 수 없어 사람·동적감사·보조기술 확인이 필요합니다. 예: **이미지 내 텍스트가 대체텍스트에 모두 반영됐는지**는 이미지를 직접 보고 판단해야 합니다(자동 OCR 전수 대조는 미지원).', '');
    for (const d of manualDomains) {
      L.push(`### ${d.label}`);
      for (const m of d.manual) L.push(`- **${mdCell(m.id)}** ${mdCell(m.title)}`);
      L.push('');
    }
  }

  L.push('---');
  L.push('> 이 리포트는 자가점검 도구(govcheck)의 결과입니다. 공공기관 웹접근성 품질인증·보안성 심의는 지정 기관의 전문가 평가가 필요하며, 본 리포트는 그 전 단계의 사전 점검 용도입니다.');
  return L.join('\n');
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function num(n) { return Number.isFinite(Number(n)) ? Number(n) : 0; }

/** 데이터 모델 → 간단한 자가완결 HTML 리포트 */
function toHtml(data, opts = {}) {
  const t = data.totals;
  const rows = data.domains.map(d => {
    const flag = d.error ? ' ⚠️' + esc(d.error) : (d.truncated ? ' (잘림)' : '');
    const noViol = d.truncated ? '—' : num(d.noViolRules);
    return `<tr><td>${esc(d.label)}${flag}</td><td class="n">${num(d.totalViolations)}</td><td class="n">${noViol}</td><td class="n">${num(d.manual.length)}</td></tr>`;
  }).join('');
  const detail = data.domains.filter(d => d.rules.length).map(d => {
    const rr = d.rules.map(r => {
      const loc = r.samples[0] ? `${esc(r.samples[0].file)}:${num(r.samples[0].line)}` : '';
      return `<tr><td>${esc(r.id)}</td><td>${esc(r.title)}</td><td>${esc(SEVERITY_LABEL[r.severity] || r.severity)}</td><td class="n">${num(r.count)}</td><td><code>${loc}</code></td></tr>`;
    }).join('');
    return `<h3>${esc(d.label)} — ${num(d.totalViolations)}건</h3><table><thead><tr><th>규칙</th><th>제목</th><th>심각도</th><th>건수</th><th>대표 위치</th></tr></thead><tbody>${rr}</tbody></table>`;
  }).join('');
  const warn = t.truncatedDomains > 0 ? `<p><small>⚠️ ${num(t.truncatedDomains)}개 도메인 결과 잘림 — "위반 미발견" 집계 불가.</small></p>` : '';
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>govcheck 점검 리포트</title>
<style>body{font-family:system-ui,'Malgun Gothic',sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;color:#222}
table{border-collapse:collapse;width:100%;margin:.5rem 0 1.5rem}th,td{border:1px solid #ddd;padding:.4rem .6rem;text-align:left}
th{background:#f5f5f5}.n{text-align:right}.cards{display:flex;gap:1rem;flex-wrap:wrap}.card{border:1px solid #ddd;border-radius:8px;padding:.8rem 1.2rem;min-width:120px}
.card .v{font-size:1.6rem;font-weight:700}.crit{color:#c0392b}code{background:#f5f5f5;padding:.1rem .3rem;border-radius:3px}small{color:#666}</style></head>
<body><h1>govcheck 점검 결과 리포트</h1>
<p><small>점검 대상: <code>${esc(data.target)}</code>${data.isSingleFile ? ' (단일 파일)' : ''}${opts.timestamp ? ' · ' + esc(opts.timestamp) : ''}<br>기준: KWCAG 2.2 · 웹표준 · 시큐어코딩 · 개인정보 · eGov · 품질 · 웹취약점</small></p>
<div class="cards">
<div class="card"><div>부적합</div><div class="v crit">${num(t.violations)}</div></div>
<div class="card"><div>심각</div><div class="v">${num(t.critical)}</div></div>
<div class="card"><div>위반 미발견*</div><div class="v">${num(t.noViolRules)}</div></div>
<div class="card"><div>수동확인</div><div class="v">${num(t.manualRules)}</div></div></div>
${warn}<p><small>* 위반 미발견 ≠ 적합(해당 요소 부재 포함, 적합 보장 아님). 자동 점검 대상 아닌 항목은 제외.</small></p>
<h2>도메인별</h2><table><thead><tr><th>도메인</th><th>부적합</th><th>위반 미발견</th><th>수동확인</th></tr></thead><tbody>${rows}</tbody></table>
<h2>부적합 상세</h2>${detail || '<p>부적합 위반 없음</p>'}
<hr><p><small>자가점검 도구(govcheck) 결과 — 전문가/인증기관 평가 대체 아님. 이미지 내 텍스트의 대체텍스트 전수 반영 여부는 수동 확인이 필요합니다.</small></p>
</body></html>`;
}

/** 통합 진입점: scanResult → { data, markdown, html }. ruleIndex 미주입 시 내장 rules/ 로드. */
function generateReport(scanResult, opts = {}) {
  const ruleIndex = opts.ruleIndex || loadRules(path.join(__dirname, '..', '..', 'rules'));
  const data = summarize(scanResult, ruleIndex);
  return { data, markdown: toMarkdown(data, opts), html: toHtml(data, opts) };
}

module.exports = { generateReport, summarize, toMarkdown, toHtml, mdCell, DOMAIN_META };
