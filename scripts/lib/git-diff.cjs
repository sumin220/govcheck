// scripts/lib/git-diff.cjs
const { execSync } = require('node:child_process');
const path = require('node:path');

function getChangedFiles(projectRoot, diffTarget = 'staged') {
  // Check if it's a git repo
  try {
    execSync('git rev-parse --git-dir', { cwd: projectRoot, stdio: 'pipe' });
  } catch {
    return { error: 'NOT_GIT_REPO' };
  }

  const commands = {
    staged: 'git diff --cached --name-only --diff-filter=ACMR',
    unstaged: 'git diff --name-only --diff-filter=ACMR',
    committed: 'git diff HEAD~1 --name-only --diff-filter=ACMR'
  };

  let cmd = commands[diffTarget] || commands.staged;
  let output;

  try {
    output = execSync(cmd, { cwd: projectRoot, encoding: 'utf-8' }).trim();
  } catch {
    // Fallback for staged: try unstaged
    if (diffTarget === 'staged') {
      try {
        output = execSync(commands.unstaged, { cwd: projectRoot, encoding: 'utf-8' }).trim();
      } catch {
        return { files: [] };
      }
    } else {
      return { files: [] };
    }
  }

  if (!output) {
    // If staged is empty, fallback to unstaged
    if (diffTarget === 'staged') {
      try {
        output = execSync(commands.unstaged, { cwd: projectRoot, encoding: 'utf-8' }).trim();
      } catch {
        return { files: [] };
      }
    }
    if (!output) return { files: [] };
  }

  const files = output.split('\n').filter(Boolean).map(f => path.resolve(projectRoot, f));
  return { files };
}

module.exports = { getChangedFiles };
