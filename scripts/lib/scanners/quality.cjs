// scripts/lib/scanners/quality.cjs
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
 * Check Q-02: method length exceeds 50 lines.
 * Tracks brace depth to find method boundaries.
 *
 * @param {string[]} lines
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkQ02MethodLength(lines, rule, filePath) {
  const violations = [];

  // Regex to detect method declaration with opening brace on same line
  const methodDeclRegex = /(public|private|protected)\s+[\w<>\[\]]+\s+\w+\s*\([^)]*\)\s*(\throws\s+[\w,\s]+)?\{/;
  // Also catch closing paren followed by brace (e.g., multi-line declarations ending with `) {`)
  const closingParenBrace = /\)\s*(\w+\s*)?\{/;

  let inMethod = false;
  let braceDepth = 0;
  let methodStartLine = 0;
  let methodSignature = '';
  let methodBraceDepth = 0; // brace depth at method start

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inMethod) {
      // Look for a method declaration with opening brace
      if (methodDeclRegex.test(line)) {
        inMethod = true;
        methodStartLine = i + 1;
        methodSignature = line.trim();
        methodBraceDepth = braceDepth;

        // Count braces on this line
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          else if (ch === '}') braceDepth--;
        }
      } else {
        // Still count braces outside methods for class-level tracking
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          else if (ch === '}') braceDepth--;
        }
      }
    } else {
      // Inside a method body — count braces
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }

      // When depth returns to method's outer depth, method has ended
      if (braceDepth <= methodBraceDepth) {
        const methodLineCount = (i + 1) - methodStartLine;
        if (methodLineCount > 50) {
          violations.push(makeViolation(rule, filePath, methodStartLine, methodSignature));
        }
        inMethod = false;
      }
    }
  }

  return violations;
}

/**
 * Check Q-12: class file exceeds 500 lines.
 *
 * @param {string[]} lines
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkQ12FileLength(lines, rule, filePath) {
  if (lines.length > 500) {
    return [makeViolation(rule, filePath, 1, `File has ${lines.length} lines (limit: 500)`)];
  }
  return [];
}

/**
 * Main quality scanner for GS certification readiness (ISO 25010).
 *
 * @param {string} filePath - Absolute path to file
 * @param {object} ruleSet  - Parsed quality.json object { rules: [...] }
 * @returns {Promise<Array>} violations
 */
async function scanQuality(filePath, ruleSet) {
  const source = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).replace('.', '').toLowerCase();
  const lines = source.split('\n');

  const violations = [];
  const rules = ruleSet.rules || [];

  for (const rule of rules) {
    // Skip T2 and T3 rules
    if (rule.tier === 'T2' || rule.tier === 'T3') continue;

    // Skip rules that don't apply to this file type
    const fileTypes = rule.fileTypes || [];
    if (fileTypes.length > 0 && !fileTypes.includes(ext)) continue;

    if (rule.patternType === 'structure') {
      // Q-02: method length check
      if (rule.id === 'Q-02') {
        violations.push(...checkQ02MethodLength(lines, rule, filePath));
        continue;
      }

      // Q-12: file length check
      if (rule.id === 'Q-12') {
        violations.push(...checkQ12FileLength(lines, rule, filePath));
        continue;
      }

      // Unknown structure rule — skip
      continue;
    }

    if (rule.patternType === 'regex') {
      // Skip rules with no pattern
      if (!rule.pattern) continue;

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
  }

  return violations;
}

module.exports = { scanQuality };
