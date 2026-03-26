// scripts/lib/scanners/webvuln.cjs
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Check if a file is a web.xml (or web.xml-like) deployment descriptor.
 */
function isWebXml(filePath, source) {
  const basename = path.basename(filePath).toLowerCase();
  if (basename === 'web.xml') return true;
  // Heuristic: XML file containing <web-app
  if (basename.endsWith('.xml') && /<web-app[\s>]/i.test(source)) return true;
  return false;
}

/**
 * Build a violation object with the standard schema.
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
 * Check V-02: Directory listing enabled in web.xml.
 * Violation if <param-value>true</param-value> for listings,
 * or if no listing configuration exists at all.
 */
function checkDirectoryListing(source, rule, filePath) {
  const violations = [];
  // Check if listings is explicitly set to true
  const listingTruePattern = /<param-name>\s*listings\s*<\/param-name>\s*[\s\S]*?<param-value>\s*true\s*<\/param-value>/i;
  if (listingTruePattern.test(source)) {
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/listings/i.test(lines[i])) {
        violations.push(makeViolation(rule, filePath, i + 1, lines[i].trim()));
        break;
      }
    }
    return violations;
  }
  // If it's a web.xml and there's no listings config at all, that's also a violation
  if (isWebXml(filePath, source)) {
    if (!/<param-name>\s*listings\s*<\/param-name>/i.test(source)) {
      violations.push(makeViolation(rule, filePath, 1, 'No directory listing configuration found'));
    }
  }
  return violations;
}

/**
 * Check V-03: Missing error-page for 404 and 500 in web.xml.
 */
function checkErrorPages(source, rule, filePath) {
  if (!isWebXml(filePath, source)) return [];

  const violations = [];
  const has404 = /<error-code>\s*404\s*<\/error-code>/i.test(source);
  const has500 = /<error-code>\s*500\s*<\/error-code>/i.test(source);

  if (!has404) {
    violations.push(makeViolation(rule, filePath, 1, 'Missing <error-page> for HTTP 404'));
  }
  if (!has500) {
    violations.push(makeViolation(rule, filePath, 1, 'Missing <error-page> for HTTP 500'));
  }
  return violations;
}

/**
 * Check V-07: Missing or excessive session timeout in web.xml.
 * Violation if <session-timeout> is missing or value > 30.
 */
function checkSessionTimeout(source, rule, filePath) {
  if (!isWebXml(filePath, source)) return [];

  const violations = [];
  const match = source.match(/<session-timeout>\s*(\d+)\s*<\/session-timeout>/i);

  if (!match) {
    violations.push(makeViolation(rule, filePath, 1, 'Missing <session-config><session-timeout> configuration'));
    return violations;
  }

  const timeout = parseInt(match[1], 10);
  if (timeout > 30) {
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/session-timeout/i.test(lines[i])) {
        violations.push(makeViolation(rule, filePath, i + 1, lines[i].trim()));
        break;
      }
    }
  }
  return violations;
}

/**
 * Check V-17: Missing HTTPS transport-guarantee in web.xml.
 */
function checkTransportGuarantee(source, rule, filePath) {
  if (!isWebXml(filePath, source)) return [];

  const violations = [];
  const hasConfidential = /<transport-guarantee>\s*CONFIDENTIAL\s*<\/transport-guarantee>/i.test(source);

  if (!hasConfidential) {
    violations.push(makeViolation(rule, filePath, 1, 'Missing <transport-guarantee>CONFIDENTIAL</transport-guarantee>'));
  }
  return violations;
}

/**
 * Check V-13: Cookie without SameSite attribute.
 * Scans for cookie creation and checks if SameSite is set nearby.
 */
function checkCookieSameSite(source, rule, filePath) {
  const violations = [];
  const lines = source.split('\n');
  const cookiePattern = /new Cookie\(|addCookie\(/;

  for (let i = 0; i < lines.length; i++) {
    if (cookiePattern.test(lines[i])) {
      // Check surrounding lines (±5) for SameSite
      const contextStart = Math.max(0, i - 5);
      const contextEnd = Math.min(lines.length, i + 6);
      const context = lines.slice(contextStart, contextEnd).join('\n');
      if (!/SameSite/i.test(context)) {
        violations.push(makeViolation(rule, filePath, i + 1, lines[i].trim()));
      }
    }
  }
  return violations;
}

/**
 * Main web vulnerability scanner.
 *
 * @param {string} filePath - Absolute path to .java, .jsp, .xml, .properties, or .gradle file
 * @param {object} ruleSet  - Parsed webvuln.json object { rules: [...] }
 * @returns {Promise<Array>} violations
 */
async function scanWebvuln(filePath, ruleSet) {
  const source = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).replace('.', '').toLowerCase();

  const violations = [];
  const rules = ruleSet.rules || [];

  for (const rule of rules) {
    // Skip T2 and T3 rules (except those with xml-check which we handle)
    if ((rule.tier === 'T2' || rule.tier === 'T3') && rule.patternType !== 'xml-check') continue;

    // Skip rules that don't apply to this file type
    const fileTypes = rule.fileTypes || [];
    if (!fileTypes.includes(ext)) continue;

    // XML-specific checks
    if (rule.patternType === 'xml-check') {
      switch (rule.xmlCheck) {
        case 'directory-listing':
          violations.push(...checkDirectoryListing(source, rule, filePath));
          continue;
        case 'error-page':
          violations.push(...checkErrorPages(source, rule, filePath));
          continue;
        case 'session-timeout':
          violations.push(...checkSessionTimeout(source, rule, filePath));
          continue;
        case 'transport-guarantee':
          violations.push(...checkTransportGuarantee(source, rule, filePath));
          continue;
        default:
          continue;
      }
    }

    // Skip rules without a pattern
    if (!rule.pattern) continue;

    // V-13: Special cookie SameSite check
    if (rule.id === 'V-13') {
      violations.push(...checkCookieSameSite(source, rule, filePath));
      continue;
    }

    // V-19, V-20, V-21: Negative checks — violation when pattern is NOT found
    if (rule.negativeCheck) {
      // Only apply negative checks to Spring Security config Java files, not web.xml
      const basename = path.basename(filePath).toLowerCase();
      const isSecurityConfig = basename.includes('security') ||
                               basename.includes('webmvcconfigurer') ||
                               basename.includes('websecurityconfig');
      if (!isSecurityConfig) continue;

      let regex;
      try {
        regex = new RegExp(rule.pattern, 'i');
      } catch (e) {
        continue;
      }

      if (!regex.test(source)) {
        violations.push(makeViolation(rule, filePath, 1, `Missing ${rule.title} configuration`));
      }
      continue;
    }

    // Default: line-by-line regex matching
    let regex;
    try {
      regex = new RegExp(rule.pattern, 'i');
    } catch (e) {
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

module.exports = { scanWebvuln };
