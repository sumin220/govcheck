#!/usr/bin/env node
// scripts/keyboard-audit-cli.cjs
'use strict';

/**
 * 동적 키보드 접근성 감사 CLI.
 *
 * 사용법:
 *   node scripts/keyboard-audit-cli.cjs <baseUrl> [--max-pages N] [--max-tabs N] [--json] [--all-origins]
 *
 * 예:
 *   node scripts/keyboard-audit-cli.cjs https://fo-gallery-seoul.innodis.co.kr:46822/seoulgallery/www/index.do
 *   node scripts/keyboard-audit-cli.cjs https://example.go.kr --max-pages 30 --json
 *
 * playwright 미설치 시 안내:
 *   npm install playwright && npx playwright install chromium
 */

const path = require('node:path');
const fs = require('node:fs');
const { runKeyboardAudit } = require('./lib/dynamic/keyboard-audit.cjs');

function parseArgs(argv) {
  const args = { baseUrl: null, maxPages: 20, maxTabs: 200, json: false, sameOriginOnly: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max-pages') args.maxPages = parseInt(argv[++i], 10) || args.maxPages;
    else if (a === '--max-tabs') args.maxTabs = parseInt(argv[++i], 10) || args.maxTabs;
    else if (a === '--json') args.json = true;
    else if (a === '--all-origins') args.sameOriginOnly = false;
    else if (!a.startsWith('--') && !args.baseUrl) args.baseUrl = a;
  }
  return args;
}

function loadKeyboardRules() {
  try {
    const p = path.join(__dirname, '..', 'rules', 'keyboard-dynamic.json');
    return JSON.parse(fs.readFileSync(p, 'utf-8')).rules || [];
  } catch (e) { return []; }
}

const SEV_ICON = { critical: '🔴', warning: '🟡', info: '🔵' };

function printHuman(result) {
  console.log('\n동적 키보드 접근성 감사 결과');
  console.log('─'.repeat(60));
  console.log('기준 URL   : ' + result.baseUrl);
  console.log('검사 페이지 : ' + result.pagesScanned);
  console.log('위반 합계   : ' + result.totalViolations);
  console.log('');

  // 페이지별 요약
  result.perPage.forEach((p) => {
    if (p.error) {
      console.log('  ⚠ ' + p.url + '  (오류: ' + p.error + ')');
    } else {
      const mark = p.violationCount > 0 ? '✗' : '✓';
      console.log('  ' + mark + ' ' + p.url + '  [클릭후보 ' + p.candidates + ', Tab정지 ' + p.tabStops + ', 위반 ' + p.violationCount + ']');
    }
  });

  if (result.totalViolations > 0) {
    console.log('\n위반 상세');
    console.log('─'.repeat(60));
    // 규칙별 그룹
    const byRule = {};
    result.violations.forEach((v) => { (byRule[v.id] = byRule[v.id] || []).push(v); });
    Object.keys(byRule).sort().forEach((id) => {
      const list = byRule[id];
      const first = list[0];
      console.log('\n' + (SEV_ICON[first.severity] || '•') + ' ' + id + ' ' + first.title + ' — ' + list.length + '건');
      list.slice(0, 8).forEach((v) => {
        console.log('   · ' + v.file);
        console.log('     ' + (v.code || '').slice(0, 120));
      });
      if (list.length > 8) console.log('   … 외 ' + (list.length - 8) + '건');
    });
  }
  console.log('');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.baseUrl) {
    console.error('사용법: node scripts/keyboard-audit-cli.cjs <baseUrl> [--max-pages N] [--max-tabs N] [--json] [--all-origins]');
    process.exit(2);
  }

  try {
    const result = await runKeyboardAudit({
      baseUrl: args.baseUrl,
      rules: loadKeyboardRules(),
      maxPages: args.maxPages,
      maxTabs: args.maxTabs,
      sameOriginOnly: args.sameOriginOnly
    });

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHuman(result);
    }
    process.exit(result.totalViolations > 0 ? 1 : 0);
  } catch (e) {
    if (e && e.code === 'PLAYWRIGHT_NOT_INSTALLED') {
      console.error('\n' + e.message + '\n');
      process.exit(3);
    }
    console.error('감사 실패: ' + (e && e.message || e));
    process.exit(2);
  }
}

main();
