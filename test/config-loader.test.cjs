// test/config-loader.test.cjs
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { loadConfig } = require('../scripts/lib/config-loader.cjs');

describe('config-loader', () => {
  it('returns defaults when no .govcheckrc.json exists', () => {
    const config = loadConfig('/nonexistent/path');
    assert.strictEqual(config.scan.accessibility, true);
    assert.strictEqual(config.scan.securecoding, true);
    assert.strictEqual(config.severity, 'warning');
    assert.deepStrictEqual(config.ignore, []);
    assert.strictEqual(config.maxResults, 100);
  });

  it('merges user config with defaults', () => {
    const config = loadConfig('/nonexistent/path', {
      scan: { accessibility: false },
      severity: 'critical'
    });
    assert.strictEqual(config.scan.accessibility, false);
    assert.strictEqual(config.scan.securecoding, true);
    assert.strictEqual(config.severity, 'critical');
  });

  it('provides default paths for eGov project structure', () => {
    const config = loadConfig('/nonexistent/path');
    assert.strictEqual(config.paths.jsp, 'src/main/webapp/**/*.jsp');
    assert.strictEqual(config.paths.java, 'src/main/java/**/*.java');
  });
});
