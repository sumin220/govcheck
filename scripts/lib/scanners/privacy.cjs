// scripts/lib/scanners/privacy.cjs
'use strict';

const fs = require('node:fs');
const path = require('node:path');

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
    category: rule.category || rule.patternType
  };
}

/**
 * Validate that a 6-digit prefix looks like a valid date (YYMMDD).
 * Month must be 01-12, day must be 01-31.
 *
 * @param {string} sixDigits - The 6-digit string before the dash
 * @returns {boolean}
 */
function isValidRrnPrefix(sixDigits) {
  if (sixDigits.length !== 6) return false;
  // year: 00-99 (already constrained by \d{2})
  const month = parseInt(sixDigits.slice(2, 4), 10);
  const day = parseInt(sixDigits.slice(4, 6), 10);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/**
 * Personal info patterns used by P-07 to check log contents.
 * We re-check the portion after the log call for PII.
 */
const PERSONAL_INFO_PATTERN = /password|passwd|pwd|ssn|주민|핸드폰|전화|email|이메일|\d{6}-[1-4]\d{6}|01[016789]-?\d{3,4}-?\d{4}/i;

/**
 * Log statement opener pattern — matches the start of a log call.
 */
const LOG_PATTERN = /(log|logger)\.(info|debug|warn|error)\(/i;

/**
 * Check P-01 (주민등록번호) with false-positive reduction.
 * Validates month 01-12 and day 01-31 in the YYMMDD prefix.
 *
 * @param {string[]} lines
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkP01(lines, rule, filePath) {
  const violations = [];
  // Pattern: 6 digits, dash, gender digit 1-4, 6 more digits
  // Use negative lookbehind to avoid matching within longer digit sequences (e.g. date strings like 20260326-1234567)
  const regex = /(?<!\d)(\d{6})-([1-4]\d{6})(?!\d)/g;

  lines.forEach((lineText, idx) => {
    let match;
    // Reset lastIndex for each line
    regex.lastIndex = 0;
    while ((match = regex.exec(lineText)) !== null) {
      const prefix = match[1];
      if (isValidRrnPrefix(prefix)) {
        violations.push(makeViolation(rule, filePath, idx + 1, lineText.trim()));
        break; // one violation per line
      }
    }
  });

  return violations;
}

/**
 * Check P-07 (로그 내 개인정보):
 * Line must match a log pattern AND contain a personal info pattern.
 *
 * @param {string[]} lines
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkP07(lines, rule, filePath) {
  const violations = [];

  lines.forEach((lineText, idx) => {
    if (LOG_PATTERN.test(lineText) && PERSONAL_INFO_PATTERN.test(lineText)) {
      violations.push(makeViolation(rule, filePath, idx + 1, lineText.trim()));
    }
  });

  return violations;
}

/**
 * Main privacy scanner.
 *
 * @param {string} filePath - Absolute path to the file to scan
 * @param {object} ruleSet  - Parsed privacy.json object { rules: [...] }
 * @returns {Promise<Array>} violations
 */
async function scanPrivacy(filePath, ruleSet) {
  const source = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).replace('.', '').toLowerCase();
  const lines = source.split('\n');

  const violations = [];
  const rules = ruleSet.rules || [];

  for (const rule of rules) {
    // Skip T2 and T3 rules
    if (rule.tier === 'T2' || rule.tier === 'T3') continue;

    // Skip rules with no pattern
    if (!rule.pattern) continue;

    // Skip rules that don't apply to this file type
    const fileTypes = rule.fileTypes || [];
    if (fileTypes.length > 0 && !fileTypes.includes(ext)) continue;

    // P-01: RRN with date-validation false-positive reduction
    if (rule.id === 'P-01') {
      violations.push(...checkP01(lines, rule, filePath));
      continue;
    }

    // P-07: log + personal info compound check
    if (rule.id === 'P-07') {
      violations.push(...checkP07(lines, rule, filePath));
      continue;
    }

    // P-06: search within comment blocks (line-by-line regex handles this naturally)
    // The rule pattern itself matches comments, so standard regex scan works.

    // Default: line-by-line regex matching
    let regex;
    try {
      regex = new RegExp(rule.pattern, 'i');
    } catch (e) {
      // Invalid pattern — skip gracefully
      continue;
    }

    lines.forEach((lineText, idx) => {
      if (regex.test(lineText)) {
        violations.push(makeViolation(rule, filePath, idx + 1, lineText.trim()));
      }
    });
  }

  return violations;
}

module.exports = { scanPrivacy };
