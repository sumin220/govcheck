// scripts/lib/scanners/egov-compat.cjs
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { glob } = require('glob');
const { scanFiles } = require('../scanner.cjs');

/**
 * Build a violation object with the standard schema.
 *
 * @param {object} rule
 * @param {string} projectRoot
 * @returns {object}
 */
function makeViolation(rule, projectRoot) {
  return {
    id: rule.id,
    title: rule.title,
    severity: rule.severity,
    tier: rule.tier,
    file: projectRoot,
    line: 0,
    code: '',
    suggestion: rule.autoFixTemplate || '',
    autoFixable: rule.autoFixable || false,
    confidence: rule.tier === 'T1' ? 'high' : 'medium',
    category: rule.category || rule.patternType
  };
}

/**
 * Check file-check rules: look for any files whose name/path OR content matches
 * the rule's pattern. If none found → violation.
 *
 * @param {string} projectRoot
 * @param {object} rule
 * @returns {Promise<boolean>} true if pattern found (no violation)
 */
async function checkFileExists(projectRoot, rule) {
  const pattern = rule.pattern;
  const fileTypes = rule.fileTypes || [];

  // Build glob patterns for the given file types
  const extensions = fileTypes.length > 0
    ? fileTypes.map(ext => `**/*.${ext}`)
    : ['**/*'];

  // For patterns with regex alternation (|), we must search file content
  const isComplexPattern = pattern.includes('|') || pattern.includes('*') || pattern.includes('?');

  for (const globPat of extensions) {
    const matches = await glob(globPat, {
      cwd: projectRoot,
      absolute: true,
      nodir: true
    });

    for (const f of matches) {
      const rel = path.relative(projectRoot, f);
      const basename = path.basename(f);

      // First try: filename/path match (for simple patterns like "egovframework", "globals.properties")
      if (!isComplexPattern && (rel.includes(pattern) || basename.includes(pattern))) {
        return true;
      }

      // Second try: search in file content (for complex patterns like "mapper-locations|mapperLocations")
      try {
        const source = fs.readFileSync(f, 'utf-8');
        const regex = new RegExp(pattern);
        if (regex.test(source)) return true;
        // Also check plain string match in content for simple patterns
        if (!isComplexPattern && source.includes(pattern)) return true;
      } catch (e) {
        // Binary file or unreadable — skip content check, rely on name check
        if (!isComplexPattern && (rel.includes(pattern) || basename.includes(pattern))) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check regex rules: scan all Java files in the project.
 * If the pattern is NOT found in any file → violation (these are "should exist" patterns).
 *
 * @param {string} projectRoot
 * @param {object} rule
 * @returns {Promise<boolean>} true if pattern found (no violation)
 */
async function checkRegexExists(projectRoot, rule) {
  const fileTypes = rule.fileTypes || ['java'];
  let regex;
  try {
    regex = new RegExp(rule.pattern);
  } catch (e) {
    // Invalid regex — skip
    return true;
  }

  for (const ext of fileTypes) {
    const files = await scanFiles(projectRoot, `**/*.${ext}`, ['**/node_modules/**']);
    for (const filePath of files) {
      let source;
      try {
        source = fs.readFileSync(filePath, 'utf-8');
      } catch (e) {
        continue;
      }
      if (regex.test(source)) return true;
    }
  }

  return false;
}

/**
 * Check structure rules: verify required directories exist.
 * The rule.pattern contains comma-separated directory paths.
 *
 * @param {string} projectRoot
 * @param {object} rule
 * @returns {boolean} true if all required dirs exist (no violation)
 */
function checkStructure(projectRoot, rule) {
  const requiredDirs = rule.pattern.split(',').map(d => d.trim());
  for (const dir of requiredDirs) {
    const fullPath = path.join(projectRoot, dir);
    if (!fs.existsSync(fullPath)) return false;
  }
  return true;
}

/**
 * Scan an eGovFramework project directory for compatibility violations.
 *
 * @param {string} projectRoot - Absolute path to the project root directory
 * @param {object} ruleSet - Parsed egov.json object { rules: [...] }
 * @returns {Promise<Array>} violations
 */
async function scanEgovCompat(projectRoot, ruleSet) {
  const violations = [];
  const rules = ruleSet.rules || [];

  for (const rule of rules) {
    if (!rule.pattern) continue;

    if (rule.patternType === 'file-check') {
      const found = await checkFileExists(projectRoot, rule);
      if (!found) {
        violations.push(makeViolation(rule, projectRoot));
      }
    } else if (rule.patternType === 'regex') {
      const found = await checkRegexExists(projectRoot, rule);
      if (!found) {
        violations.push(makeViolation(rule, projectRoot));
      }
    } else if (rule.patternType === 'structure') {
      const ok = checkStructure(projectRoot, rule);
      if (!ok) {
        violations.push(makeViolation(rule, projectRoot));
      }
    }
  }

  return violations;
}

module.exports = { scanEgovCompat };
