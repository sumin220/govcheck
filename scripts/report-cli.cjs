#!/usr/bin/env node
'use strict';

// govcheck 리포트 CLI
// 사용법:
//   node scripts/report-cli.cjs <projectRoot> [--file <path>] [--format md|html|both] [--out <basepath>]
// 예:
//   node scripts/report-cli.cjs /path/to/project                 # 전체 점검 → stdout(md)
//   node scripts/report-cli.cjs /path/to/project --out report    # report.md (+ --format both 면 report.html)
//   node scripts/report-cli.cjs /path/to/project --file src/.../index.jsp   # 단일 파일

const fs = require('node:fs');
const { handleScanAll, handleScanFile } = require('./mcp-server.cjs');
const { generateReport } = require('./lib/report.cjs');

function parseArgs(argv) {
  const out = { format: 'md' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') out.filePath = argv[++i];
    else if (a === '--format') out.format = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--max') out.maxResults = parseInt(argv[++i], 10);
    else rest.push(a);
  }
  out.projectRoot = rest[0];
  return out;
}

(async () => {
  const opt = parseArgs(process.argv.slice(2));
  if (!opt.projectRoot && !opt.filePath) {
    process.stderr.write('usage: report-cli.cjs <projectRoot> [--file <path>] [--format md|html|both] [--out <basepath>]\n');
    process.exit(1);
  }
  if (!['md', 'html', 'csv', 'both'].includes(opt.format)) {
    process.stderr.write(`invalid --format "${opt.format}" (md|html|csv|both)\n`);
    process.exit(1);
  }

  const scan = opt.filePath
    ? await handleScanFile({ filePath: opt.filePath, projectRoot: opt.projectRoot, maxResults: opt.maxResults || 100000 })
    : await handleScanAll({ projectRoot: opt.projectRoot, maxResults: opt.maxResults || 100000 });

  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const rep = generateReport(scan, { timestamp: stamp });

  if (opt.out) {
    if (opt.format === 'md' || opt.format === 'both') fs.writeFileSync(opt.out + '.md', rep.markdown);
    if (opt.format === 'html' || opt.format === 'both') fs.writeFileSync(opt.out + '.html', rep.html);
    if (opt.format === 'csv') fs.writeFileSync(opt.out + '.csv', '﻿' + rep.csv);  // BOM: Excel 한글
    process.stderr.write(`리포트 생성: ${opt.out}.${opt.format === 'both' ? 'md/.html' : opt.format} (부적합 ${rep.data.totals.violations}건)\n`);
  } else {
    process.stdout.write(opt.format === 'html' ? rep.html : opt.format === 'csv' ? rep.csv : rep.markdown);
  }
})().catch((e) => { process.stderr.write('REPORT_ERROR ' + (e && e.stack || e) + '\n'); process.exit(1); });
