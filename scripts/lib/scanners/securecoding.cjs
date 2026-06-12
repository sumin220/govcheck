// scripts/lib/scanners/securecoding.cjs
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extractElExpressions } = require('../jsp-preprocessor.cjs');

/**
 * Build a violation object with the standard schema.
 *
 * @param {object} rule
 * @param {string} filePath
 * @param {number} line
 * @param {string} code
 * @returns {object}
 */
function makeViolation(rule, filePath, line, code) {
  return {
    id: rule.id,
    title: rule.title,
    severity: rule.severity,
    tier: rule.tier,
    file: filePath,
    line,
    column: 0,
    code: (code || '').slice(0, 200),
    suggestion: rule.autoFixTemplate || '',
    autoFixable: rule.autoFixable || false,
    confidence: rule.tier === 'T1' ? 'high' : 'medium',
    category: rule.patternType
  };
}

/**
 * Check S-02 (XSS / c:out missing) for JSP files.
 * Uses extractElExpressions to find bare ${} not wrapped in <c:out>.
 *
 * @param {string} source
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkS02Jsp(source, rule, filePath) {
  const expressions = extractElExpressions(source);
  return expressions
    .filter(e => !e.wrappedInCout)
    .map(e => makeViolation(rule, filePath, e.line, e.expression));
}

/**
 * Check S-34 (empty catch block) with multi-line regex against the whole source.
 * A catch block is considered "empty" if it contains only whitespace and/or comments.
 *
 * @param {string} source
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkS34EmptyCatch(source, rule, filePath) {
  const violations = [];
  // Match catch(...) { <body> } — capture the body between braces
  const regex = /catch\s*\([^)]*\)\s*\{([^}]*)\}/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const body = match[1];
    // Strip single-line comments (// ...) and whitespace
    const stripped = body.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (stripped === '') {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(makeViolation(rule, filePath, line, match[0].trim()));
    }
  }
  return violations;
}

/**
 * Main secure coding scanner.
 *
 * @param {string} filePath - Absolute path to .java or .jsp file
 * @param {object} ruleSet  - Parsed securecoding49.json object { rules: [...] }
 * @returns {Promise<Array>} violations
 */
async function scanSecurecoding(filePath, ruleSet) {
  const source = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).replace('.', '').toLowerCase(); // 'java' | 'jsp' | etc.

  const violations = [];
  const rules = ruleSet.rules || [];

  for (const rule of rules) {
    // Skip T2 and T3 rules
    if (rule.tier === 'T2' || rule.tier === 'T3') continue;

    // Skip rules with no pattern
    if (!rule.pattern) continue;

    // Skip rules that don't apply to this file type
    const fileTypes = rule.fileTypes || [];
    if (!fileTypes.includes(ext)) continue;

    // S-02: JSP-specific EL expression check
    if (rule.id === 'S-02') {
      if (ext === 'jsp') {
        violations.push(...checkS02Jsp(source, rule, filePath));
      }
      continue;
    }

    // S-34: Empty catch — use multi-line regex on full source
    if (rule.id === 'S-34') {
      violations.push(...checkS34EmptyCatch(source, rule, filePath));
      continue;
    }

    // Default: line-by-line regex matching
    let regex;
    try {
      regex = new RegExp(rule.pattern, 'i');
    } catch (e) {
      // Invalid pattern — skip gracefully
      continue;
    }

    const lines = source.split('\n');
    lines.forEach((lineText, idx) => {
      if (regex.test(lineText)) {
        violations.push(makeViolation(rule, filePath, idx + 1, lineText.trim()));
      }
    });
  }

  return violations;
}

module.exports = { scanSecurecoding };
