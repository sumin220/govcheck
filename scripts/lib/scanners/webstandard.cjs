// scripts/lib/scanners/webstandard.cjs
'use strict';

const fs = require('node:fs');
const cheerio = require('cheerio');
const { preprocessJsp } = require('../jsp-preprocessor.cjs');

/**
 * Find the 1-based line number of the first occurrence of `text` in `source`.
 * Falls back to line 1 if not found.
 *
 * @param {string} source
 * @param {string} text
 * @returns {number}
 */
function findLineNumber(source, text) {
  if (!text) return 1;
  const idx = source.indexOf(text);
  if (idx === -1) return 1;
  return source.slice(0, idx).split('\n').length;
}

/**
 * Handle W-03: DOCTYPE missing — flag if first non-empty line is not a DOCTYPE.
 * This rule is inverted: it fires when the pattern is ABSENT.
 *
 * @param {string} source
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkW03(source, rule, filePath) {
  // Find first non-empty line (skip JSP directives at top)
  const lines = source.split('\n');
  let doctypeFound = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Allow JSP directives (<%@ ... %>) before DOCTYPE
    if (/^<%@/.test(trimmed)) continue;
    // Check if this non-directive line starts with DOCTYPE
    if (/^<!DOCTYPE/i.test(trimmed)) {
      doctypeFound = true;
    }
    break;
  }

  // Also check whole document for any DOCTYPE
  if (!doctypeFound) {
    const hasDoctype = /<!DOCTYPE/i.test(source);
    if (!hasDoctype) {
      return [{
        id: rule.id,
        title: rule.title,
        severity: rule.severity,
        tier: rule.tier,
        file: filePath,
        line: 1,
        column: 0,
        code: '(DOCTYPE declaration missing)',
        suggestion: rule.autoFixTemplate || '<!DOCTYPE html>',
        autoFixable: rule.autoFixable || false,
        confidence: 'high',
        category: rule.patternType
      }];
    }
  }

  return [];
}

/**
 * Handle W-07: Duplicate IDs — collect all [id] elements, find duplicates.
 * Reports one violation per duplicate id value.
 *
 * @param {cheerio.CheerioAPI} $
 * @param {string} source
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkW07($, source, rule, filePath) {
  const violations = [];
  const idCounts = {};
  const idElements = {};

  $('[id]').each((_, el) => {
    const id = $(el).attr('id');
    if (!id) return;
    // JSP EL 동적 id(예: id="row-${st.index}")는 c:forEach 등으로 런타임에 고유하게 렌더링되므로
    // 정적 소스상 동일 리터럴이어도 중복으로 오탐하면 안 됨 — skip.
    if (id.includes('${')) return;
    if (!idCounts[id]) {
      idCounts[id] = 0;
      idElements[id] = el;
    }
    idCounts[id]++;
  });

  for (const [id, count] of Object.entries(idCounts)) {
    if (count > 1) {
      // Find first occurrence line
      const idAttrPattern = `id="${id}"`;
      const line = findLineNumber(source, idAttrPattern);
      violations.push({
        id: rule.id,
        title: rule.title,
        severity: rule.severity,
        tier: rule.tier,
        file: filePath,
        line,
        column: 0,
        code: `id="${id}" (${count}회 사용)`,
        suggestion: rule.autoFixTemplate || '',
        autoFixable: rule.autoFixable || false,
        confidence: 'high',
        category: rule.patternType
      });
    }
  }

  return violations;
}

/**
 * Handle W-09: Missing charset — flag if NOT found.
 * This rule is inverted: it fires when the pattern is ABSENT.
 *
 * @param {string} source
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkW09(source, rule, filePath) {
  let regex;
  try {
    regex = new RegExp(rule.pattern, 'i');
  } catch (e) {
    return [];
  }

  if (!regex.test(source)) {
    return [{
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      tier: rule.tier,
      file: filePath,
      line: 1,
      column: 0,
      code: '(charset declaration missing)',
      suggestion: rule.autoFixTemplate || '<meta charset="UTF-8">',
      autoFixable: rule.autoFixable || false,
      confidence: 'high',
      category: rule.patternType
    }];
  }

  return [];
}

/**
 * Main web standard scanner.
 *
 * @param {string} filePath - Absolute path to JSP/HTML file
 * @param {object} ruleSet - Parsed webstandard.json object { rules: [...] }
 * @returns {Promise<Array>} violations
 */
async function scanWebstandard(filePath, ruleSet) {
  const source = fs.readFileSync(filePath, 'utf-8');
  const { html } = preprocessJsp(source);
  const $ = cheerio.load(html, { xmlMode: false });

  const violations = [];
  const rules = ruleSet.rules || [];

  for (const rule of rules) {
    // Skip T2 and T3 rules
    if (rule.tier === 'T2' || rule.tier === 'T3') continue;
    // Skip rules with no pattern
    if (!rule.pattern) continue;

    // Special inverted/compound rules
    if (rule.id === 'W-03') {
      violations.push(...checkW03(source, rule, filePath));
      continue;
    }

    if (rule.id === 'W-07') {
      violations.push(...checkW07($, source, rule, filePath));
      continue;
    }

    if (rule.id === 'W-09') {
      violations.push(...checkW09(source, rule, filePath));
      continue;
    }

    if (rule.patternType === 'css-selector') {
      let elements;
      try {
        elements = $(rule.pattern);
      } catch (e) {
        // Invalid selector — skip gracefully
        continue;
      }

      elements.each((_, el) => {
        let outerHtml;
        try {
          outerHtml = $.html($(el));
        } catch (e) {
          outerHtml = null;
        }

        const code = outerHtml ? outerHtml.trim().slice(0, 200) : rule.pattern;
        const line = findLineNumber(source, code);

        violations.push({
          id: rule.id,
          title: rule.title,
          severity: rule.severity,
          tier: rule.tier,
          file: filePath,
          line,
          column: 0,
          code,
          suggestion: rule.autoFixTemplate || '',
          autoFixable: rule.autoFixable || false,
          confidence: rule.tier === 'T1' ? 'high' : 'medium',
          category: rule.patternType
        });
      });

    } else if (rule.patternType === 'regex') {
      let regex;
      try {
        regex = new RegExp(rule.pattern, 'gi');
      } catch (e) {
        continue;
      }

      let match;
      while ((match = regex.exec(source)) !== null) {
        const code = match[0].slice(0, 200);
        const line = source.slice(0, match.index).split('\n').length;

        violations.push({
          id: rule.id,
          title: rule.title,
          severity: rule.severity,
          tier: rule.tier,
          file: filePath,
          line,
          column: 0,
          code,
          suggestion: rule.autoFixTemplate || '',
          autoFixable: rule.autoFixable || false,
          confidence: rule.tier === 'T1' ? 'high' : 'medium',
          category: rule.patternType
        });
      }
    }
  }

  return violations;
}

module.exports = { scanWebstandard };
