// scripts/lib/scanner.cjs
const { glob } = require('glob');
const path = require('node:path');

async function scanFiles(baseDir, pattern, ignorePatterns = []) {
  const matches = await glob(pattern, {
    cwd: baseDir,
    absolute: true,
    ignore: ignorePatterns,
    nodir: true
  });
  return matches;
}

module.exports = { scanFiles };
