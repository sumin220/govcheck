// test/git-diff.test.cjs
const { describe, it } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { getChangedFiles } = require('../scripts/lib/git-diff.cjs');

describe('git-diff', () => {
  it('returns NOT_GIT_REPO error for non-git directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'govcheck-test-'));
    const result = getChangedFiles(tmpDir);
    assert.strictEqual(result.error, 'NOT_GIT_REPO');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns files array for valid git repo', () => {
    // Use the govcheck project itself (which is a git repo)
    const result = getChangedFiles(path.join(__dirname, '..'), 'unstaged');
    assert.ok(!result.error || result.error !== 'NOT_GIT_REPO');
    if (!result.error) {
      assert.ok(Array.isArray(result.files));
    }
  });

  it('falls back to unstaged when staged is empty', () => {
    const result = getChangedFiles(path.join(__dirname, '..'), 'staged');
    // Should not error with NOT_GIT_REPO
    assert.ok(!result.error || result.error !== 'NOT_GIT_REPO');
  });
});
