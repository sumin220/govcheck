// test/scanner.test.cjs
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { scanFiles } = require('../scripts/lib/scanner.cjs');

describe('scanner', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');

  it('finds JSP files matching glob pattern', async () => {
    const files = await scanFiles(fixturesDir, '**/*.jsp', []);
    assert.ok(files.length >= 2);
    assert.ok(files.every(f => f.endsWith('.jsp')));
  });

  it('respects ignore patterns', async () => {
    const files = await scanFiles(fixturesDir, '**/*.jsp', ['**/sample-good*']);
    assert.ok(files.every(f => !f.includes('sample-good')));
  });

  it('returns absolute paths', async () => {
    const files = await scanFiles(fixturesDir, '**/*.jsp', []);
    assert.ok(files.every(f => path.isAbsolute(f)));
  });

  it('returns empty array when no files match', async () => {
    const files = await scanFiles(fixturesDir, '**/*.nonexistent', []);
    assert.deepStrictEqual(files, []);
  });
});
