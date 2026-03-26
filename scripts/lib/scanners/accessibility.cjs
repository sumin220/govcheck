// scripts/lib/scanners/accessibility.cjs
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
  // Count newlines before idx
  return source.slice(0, idx).split('\n').length;
}

/**
 * Handle A-02 compound logic:
 * An input is violating if:
 *   1. It has no id attribute, OR
 *   2. It has an id but there is no <label for="thatId"> in the document.
 *
 * @param {cheerio.CheerioAPI} $
 * @param {string} source - original source for line finding
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkA02($, source, rule, filePath) {
  const violations = [];

  $('input').each((_, el) => {
    const $el = $(el);
    const inputType = ($el.attr('type') || 'text').toLowerCase();

    // skip hidden inputs
    if (inputType === 'hidden') return;

    const id = $el.attr('id');
    let isViolation = false;

    if (!id) {
      isViolation = true;
    } else {
      // Check if there is a label[for] pointing to this id
      const matchingLabel = $(`label[for="${id}"]`);
      if (matchingLabel.length === 0) {
        // Also check aria-label / aria-labelledby as acceptable alternatives
        const hasAriaLabel = $el.attr('aria-label') || $el.attr('aria-labelledby');
        if (!hasAriaLabel) {
          isViolation = true;
        }
      }
    }

    if (isViolation) {
      const outerHtml = $.html($el);
      const code = outerHtml ? outerHtml.trim().slice(0, 200) : `<input>`;
      const line = findLineNumber(source, code) || findLineNumber(source, `<input`);
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
  });

  return violations;
}

/**
 * Handle A-04 compound logic:
 * A table is violating if it has neither a <caption> nor any <th>.
 *
 * @param {cheerio.CheerioAPI} $
 * @param {string} source
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkA04($, source, rule, filePath) {
  const violations = [];

  $('table').each((_, el) => {
    const $table = $(el);
    const hasCaption = $table.find('caption').length > 0;
    const hasTh = $table.find('th').length > 0;

    if (!hasCaption || !hasTh) {
      const outerHtml = $.html($table);
      // Use a compact snippet for line finding
      const tableOpen = outerHtml ? outerHtml.trim().slice(0, 100) : '<table>';
      const code = tableOpen;
      const line = findLineNumber(source, '<table');
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
  });

  return violations;
}

/**
 * Handle A-06: only flag tabindex with positive value (> 0).
 *
 * @param {cheerio.CheerioAPI} $
 * @param {string} source
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkA06($, source, rule, filePath) {
  const violations = [];

  $('[tabindex]').each((_, el) => {
    const $el = $(el);
    const tabindex = parseInt($el.attr('tabindex'), 10);
    if (!isNaN(tabindex) && tabindex > 0) {
      const outerHtml = $.html($el);
      const code = outerHtml ? outerHtml.trim().slice(0, 200) : `tabindex="${tabindex}"`;
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
    }
  });

  return violations;
}

/**
 * Handle A-08 (skip navigation): it's a "missing" pattern — flag if NOT found.
 * Uses a broader regex to allow anchors like #main-content, #skip-to-content, etc.
 *
 * @param {string} source
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkA08(source, rule, filePath) {
  // Broaden the regex to match href="#..." where anchor contains content/main/skip
  const broadRegex = /<a[^>]+href=["']#[a-z-]*(content|main|skip)[a-z-]*["']/i;
  const strictRegex = new RegExp(rule.pattern, 'i');

  if (!broadRegex.test(source) && !strictRegex.test(source)) {
    return [{
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      tier: rule.tier,
      file: filePath,
      line: 1,
      column: 0,
      code: '(skip navigation link not found)',
      suggestion: rule.autoFixTemplate || '',
      autoFixable: rule.autoFixable || false,
      confidence: rule.tier === 'T1' ? 'high' : 'medium',
      category: rule.patternType
    }];
  }
  return [];
}

/**
 * Handle A-11 (empty title): flag if empty or missing title tag.
 *
 * @param {string} source
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkA11(source, rule, filePath) {
  // Flag if title is missing entirely
  const hasTitle = /<title[^>]*>[^<\s]/i.test(source);
  const hasEmptyTitle = new RegExp(rule.pattern).test(source);

  if (!hasTitle || hasEmptyTitle) {
    // Only flag empty title, not missing (missing is a separate concern)
    if (hasEmptyTitle) {
      const match = source.match(new RegExp(rule.pattern));
      const code = match ? match[0] : '<title></title>';
      const line = findLineNumber(source, code);
      return [{
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
      }];
    }
  }
  return [];
}

/**
 * Main accessibility scanner.
 *
 * @param {string} filePath - Absolute path to JSP/HTML file
 * @param {object} ruleSet - Parsed kwcag22.json object { rules: [...] }
 * @returns {Promise<Array>} violations
 */
async function scanAccessibility(filePath, ruleSet) {
  const source = fs.readFileSync(filePath, 'utf-8');
  const { html, elExpressions } = preprocessJsp(source);
  const $ = cheerio.load(html, { xmlMode: false });

  const violations = [];
  const rules = ruleSet.rules || [];

  for (const rule of rules) {
    // Skip T3 (claude-only)
    if (rule.tier === 'T3') continue;
    // Skip rules with no pattern
    if (!rule.pattern) continue;

    // Special compound / inverted logic rules
    if (rule.id === 'A-02') {
      violations.push(...checkA02($, source, rule, filePath));
      continue;
    }

    if (rule.id === 'A-04') {
      violations.push(...checkA04($, source, rule, filePath));
      continue;
    }

    if (rule.id === 'A-06') {
      violations.push(...checkA06($, source, rule, filePath));
      continue;
    }

    if (rule.id === 'A-08') {
      violations.push(...checkA08(source, rule, filePath));
      continue;
    }

    // A-15: page title duplication requires cross-file analysis — skip for single-file scan
    if (rule.id === 'A-15') {
      continue;
    }

    if (rule.id === 'A-11') {
      violations.push(...checkA11(source, rule, filePath));
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

module.exports = { scanAccessibility };
