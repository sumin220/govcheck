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
 * Handle A-34: elements that open a new window missing the new-window notice.
 * Covers both a[target="_blank"] links and any element whose onclick calls
 * window.open (2차 심사 2-33 VR bottom_logo 사각지대 보완).
 * An element is only a violation if it lacks a notice in its title /
 * aria-label / visually-hidden (or .sr-only) text.
 * Elements matching both selectors are deduped via a processed-element Set.
 *
 * @param {cheerio.CheerioAPI} $
 * @param {string} source
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkA34($, source, rule, filePath) {
  const violations = [];
  const noticePattern = /새\s*창|new\s*window|opens?\s*in/i;
  const processedElements = new Set();

  const hasNotice = ($el) =>
    noticePattern.test(
      ($el.attr('title') || '') + ($el.attr('aria-label') || '') +
      ($el.find('.visually-hidden, .sr-only').text() || '')
    );

  // onclick 값이 실제 window.open(...) 호출 형태인지 검증 — 문자열 리터럴('window.open is disabled')
  // 안에만 등장하는 경우 등 부분 문자열 오탐 차단. 단순 휴리스틱이므로 onclick 경로는 confidence를 낮춤.
  const isWindowOpenCall = ($el) =>
    /(?:^|[^\w'"])window\s*\.\s*open\s*\(/.test($el.attr('onclick') || '');

  const collect = (selector, fallbackCode, confidence, extraFilter) => {
    $(selector).each((_, el) => {
      if (processedElements.has(el)) return;
      processedElements.add(el);
      const $el = $(el);
      if (extraFilter && !extraFilter($el)) return;
      if (hasNotice($el)) return;
      const outerHtml = $.html($el);
      const code = outerHtml ? outerHtml.trim().slice(0, 200) : fallbackCode;
      const line = findLineNumber(source, code);
      violations.push({
        id: rule.id, title: rule.title, severity: rule.severity, tier: rule.tier,
        file: filePath, line, column: 0, code,
        suggestion: 'title="... (새 창 열림)" 또는 <span class="visually-hidden">새 창 열림</span> 추가',
        autoFixable: rule.autoFixable || false, confidence, category: rule.patternType
      });
    });
  };

  collect('a[target="_blank"]', '<a target="_blank">', 'high');
  collect('[onclick*="window.open"]', '<element onclick="window.open(...)">', 'medium', isWindowOpenCall);

  return violations;
}

// 참고: 문서 내 중복 id(KWCAG 32 마크업 오류)는 webstandard 스캐너의 W-07이 이미 담당한다.
// 접근성 도메인에 중복 규칙을 두지 않고(DRY) W-07을 단일 출처로 사용한다. W-07도 EL(${}) id를 skip하도록 보정됨.

/**
 * Handle A-46: select/textarea without an associated label.
 * Accepts label[for], aria-label, or aria-labelledby as valid labeling.
 *
 * @param {cheerio.CheerioAPI} $
 * @param {string} source
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkA46($, source, rule, filePath) {
  const violations = [];
  $('select, textarea').each((_, el) => {
    const $el = $(el);
    const id = $el.attr('id');
    let ok = false;
    if (id && $('label[for="' + id + '"]').length > 0) ok = true;
    if ($el.attr('aria-label') || $el.attr('aria-labelledby')) ok = true;
    if (ok) return;
    const code = ($.html($el) || '<'+(el.tagName||el.name)+'>').trim().slice(0, 200);
    violations.push({
      id: rule.id, title: rule.title, severity: rule.severity, tier: rule.tier,
      file: filePath, line: findLineNumber(source, code), column: 0, code,
      suggestion: 'label[for] 연결 또는 aria-label/aria-labelledby 제공',
      autoFixable: rule.autoFixable || false, confidence: 'high', category: rule.patternType
    });
  });
  return violations;
}

// 참고: A-40(인라인 a 카드 패턴)은 카드의 display 값이 외부 CSS 클래스에 정의되어
// 단일 파일 정적 분석으로 판정 불가(스모크 테스트에서 .program-box/.gallery-media-box 등 전부 오탐).
// 따라서 kwcag22.json에서 tier=T3(수동 점검)로 전환했고 전용 check 함수를 두지 않는다.

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

  // regex 규칙용 마스킹 사본: JSP(<%-- --%>)·HTML(<!-- -->) 주석 내부를 공백으로 치환.
  // 오프셋·라인 번호가 그대로 보존되며, 레거시 프로젝트의 주석 처리된 옛 마크업
  // (엔티티·aria-label 등)이 regex 규칙에 오탐되는 것을 방지한다.
  const maskedSource = source.replace(/<%--[\s\S]*?--%>|<!--[\s\S]*?-->/g,
    (m) => m.replace(/[^\n]/g, ' '));
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

    if (rule.id === 'A-34') { violations.push(...checkA34($, source, rule, filePath)); continue; }
    if (rule.id === 'A-46') { violations.push(...checkA46($, source, rule, filePath)); continue; }

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
      while ((match = regex.exec(maskedSource)) !== null) {
        const code = match[0].slice(0, 200);
        const line = maskedSource.slice(0, match.index).split('\n').length;

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
