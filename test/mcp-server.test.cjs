// test/mcp-server.test.cjs
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Test the tool handlers directly (not via MCP protocol)
const { handleScanAll, handleScanDomain, handleScanDiff } = require('../scripts/mcp-server.cjs');

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
});
