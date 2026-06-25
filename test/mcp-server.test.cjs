// test/mcp-server.test.cjs
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Test the tool handlers directly (not via MCP protocol)
const { handleScanAll, handleScanDomain, handleScanFile, handleScanDiff } = require('../scripts/mcp-server.cjs');

describe('mcp-server tool handlers', () => {
  const fixturesDir = path.join(__dirname, 'fixtures', 'egov-project');

  it('scan_all returns results for all enabled domains', async () => {
    const result = await handleScanAll({
      projectRoot: fixturesDir,
      maxResults: 10
    });
    assert.ok(result.results);
    assert.ok(Array.isArray(result.results));
    assert.strictEqual(result.results.length, 7);
    assert.ok(typeof result.totalElapsed === 'number');
  });

  it('scan_accessibility returns violations array', async () => {
    const result = await handleScanDomain('accessibility', {
      projectRoot: fixturesDir,
      maxResults: 10
    });
    assert.strictEqual(result.domain, 'accessibility');
    assert.ok(typeof result.scannedFiles === 'number');
    assert.ok(Array.isArray(result.violations));
    assert.ok(typeof result.elapsed === 'number');
  });

  it('respects maxResults cap', async () => {
    const result = await handleScanDomain('accessibility', {
      projectRoot: fixturesDir,
      maxResults: 1
    });
    assert.ok(result.violations.length <= 1);
    if (result.totalCount > 1) {
      assert.strictEqual(result.truncated, true);
    }
  });

  it('scan_diff returns NOT_GIT_REPO for non-git directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'govcheck-'));
    const result = await handleScanDiff({
      projectRoot: tmpDir,
      diffTarget: 'staged'
    });
    assert.strictEqual(result.error, 'NOT_GIT_REPO');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('scan_all aggregates totalElapsed across domains', async () => {
    const result = await handleScanAll({
      projectRoot: fixturesDir,
      maxResults: 5
    });
    assert.ok(typeof result.totalElapsed === 'number');
    assert.strictEqual(result.results.length, 7);
    for (const domainResult of result.results) {
      assert.ok(typeof domainResult.elapsed === 'number');
      assert.ok(domainResult.domain);
    }
  });

  it('handles individual domain scans', async () => {
    for (const domain of ['accessibility', 'webstandard', 'securecoding', 'privacy', 'quality']) {
      const result = await handleScanDomain(domain, {
        projectRoot: fixturesDir,
        maxResults: 5
      });
      assert.strictEqual(result.domain, domain);
      assert.ok(Array.isArray(result.violations));
    }
  });

  it('egov domain scanner works at project level', async () => {
    const result = await handleScanDomain('egovCompat', {
      projectRoot: fixturesDir,
      maxResults: 10
    });
    assert.strictEqual(result.domain, 'egovCompat');
    assert.ok(Array.isArray(result.violations));
  });

  // 개선 #3a: 동적 K-rule은 baseUrl이 있을 때만 opt-in — 기본 scan_all은 정적 7개 도메인 그대로.
  it('scan_all without baseUrl: keyboard 도메인 미포함 (기본 동작 불변)', async () => {
    const result = await handleScanAll({ projectRoot: fixturesDir, maxResults: 5 });
    assert.strictEqual(result.results.length, 7, '정적 7개 도메인만');
    assert.ok(!result.results.some(d => d.domain === 'keyboard'), 'baseUrl 없으면 keyboard 미포함');
  });

  // 개선 #2: accessibility 도메인이 CSS 파일도 스캔 (A-09/A-25).
  it('accessibility scans CSS files (개선 #2)', async () => {
    const cssProject = path.join(__dirname, 'fixtures', 'css-project');
    const result = await handleScanDomain('accessibility', { projectRoot: cssProject, maxResults: 50 });
    const cssViol = result.violations.filter(v => v.file.endsWith('.css'));
    assert.ok(cssViol.length > 0, 'CSS 파일에서 위반 적발돼야 함');
    assert.ok(cssViol.some(v => v.id === 'A-25'), 'outline:none → A-25');
    assert.ok(cssViol.some(v => v.id === 'A-09'), 'color:#999 → A-09');
  });

  // 개선 #2 보완: vendor/번들 CSS(cssVendorIgnore 경로)는 CSS 스캔에서 제외 (오탐 감소).
  it('accessibility CSS scan excludes vendor CSS (cssVendorIgnore)', async () => {
    const cssProject = path.join(__dirname, 'fixtures', 'css-project');
    const result = await handleScanDomain('accessibility', { projectRoot: cssProject, maxResults: 50 });
    const vendor = result.violations.filter(v => v.file.replace(/\\/g, '/').includes('/lib/'));
    assert.strictEqual(vendor.length, 0, '/lib/ 하위 vendor CSS는 스캔 제외');
  });

  // 단일 파일 점검 technic (scan_file)
  it('scan_file: JSP 한 파일을 확장자에 맞는 도메인들로 점검', async () => {
    const jsp = path.join(__dirname, 'fixtures', 'sample-bad.jsp');
    const result = await handleScanFile({ filePath: jsp, maxResults: 100 });
    assert.strictEqual(result.file, jsp);
    assert.ok(Array.isArray(result.results), 'results 배열');
    const domains = result.results.map(r => r.domain);
    assert.ok(domains.includes('accessibility'), 'JSP → accessibility 포함');
    assert.ok(domains.includes('webstandard'), 'JSP → webstandard 포함');
    assert.ok(!domains.includes('egovCompat'), '단일 파일은 egovCompat 제외(프로젝트 레벨)');
    const allViol = result.results.flatMap(r => r.violations);
    assert.ok(allViol.some(v => v.id && v.id.startsWith('A-')), 'A-* 위반 존재');
    assert.ok(allViol.some(v => v.id && v.id.startsWith('W-')), 'W-* 위반 존재');
  });

  it('scan_file: CSS 한 파일은 접근성 CSS 스캐너로 점검', async () => {
    const css = path.join(__dirname, 'fixtures', 'sample-bad.css');
    const result = await handleScanFile({ filePath: css, maxResults: 100 });
    const a11y = result.results.find(r => r.domain === 'accessibility');
    assert.ok(a11y, 'accessibility 도메인 결과 존재');
    assert.ok(a11y.violations.some(v => v.id === 'A-25'), 'CSS outline:none → A-25');
  });

  it('scan_file: 없는 파일은 FILE_NOT_FOUND', async () => {
    const result = await handleScanFile({ filePath: '/nonexistent/x.jsp' });
    assert.strictEqual(result.error, 'FILE_NOT_FOUND');
  });
});
