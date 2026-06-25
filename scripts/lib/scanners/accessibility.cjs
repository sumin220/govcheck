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

// A-49 휴리스틱 상수: 공백/구두점만, 이미지 파일명 확장자, 요소 유형만 반복하는 generic 단어.
// '로고'/'logo'는 심볼 전용 로고 alt에서 정당할 수 있어 의도적으로 제외(오탐 방지).
const A49_PUNCT_ONLY = /^[-_.·*~#|+\s]+$/;
const A49_FILENAME = /\.(jpe?g|png|gif|svg|webp|bmp|ico|tiff?)$/i;
const A49_GENERIC_WORDS = new Set([
  '이미지', '사진', '그림', '배너', '썸네일', '아이콘',
  'image', 'photo', 'picture', 'img', 'banner', 'thumbnail', 'icon'
]);

/**
 * Collect post-preprocessing residues of alt values that contained scriptlets.
 * preprocessJsp는 cheerio 도달 전에 <%...%>를 삭제하므로, DOM에서 보이는 alt 값만으로는
 * 스크립틀릿 유래 여부를 알 수 없다(예: alt="<%=fileNm%>.jpg" → DOM ".jpg" → 파일명 오탐).
 * 원본 source에서 스크립틀릿 포함 alt의 "삭제 후 잔여값"을 미리 모아 skip 목록으로 쓴다.
 *
 * @param {string} source - original (pre-preprocessing) source
 * @returns {Set<string>}
 */
function collectA49ScriptletResidues(source) {
  const residues = new Set();
  if (!source.includes('<%')) return residues;
  const attrRe = /alt\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = attrRe.exec(source)) !== null) {
    const raw = m[2] !== undefined ? m[2] : m[3];
    if (raw && raw.includes('<%')) {
      residues.add(raw.replace(/<%[\s\S]*?%>/g, ''));
    }
  }
  return residues;
}

/**
 * Classify an alt value against the A-49 sub-patterns.
 * Returns a reason string when the value is an inadequate alt, or null when acceptable.
 *
 * @param {string} value - alt attribute value as seen in the (preprocessed) DOM
 * @param {Set<string>} scriptletResidues - values originating from scriptlet-containing alt (skip)
 * @returns {string|null}
 */
function classifyA49AltValue(value, scriptletResidues) {
  // EL/스크립틀릿 skip (최우선): 런타임 값은 정적 판정 불가 (W-07 EL 교훈).
  // 스크립틀릿은 preprocessJsp가 이미 삭제했으므로 원본 기반 residue 목록으로 판정한다.
  if (value.includes('${')) return null;
  if (scriptletResidues && scriptletResidues.has(value)) return null;
  // 빈 alt는 정당한 장식 선언 → A-41 영역
  if (value === '') return null;
  const trimmed = value.trim();
  if (trimmed === '' || A49_PUNCT_ONLY.test(trimmed)) {
    return '공백/구두점만으로는 의미 전달 불가 — 장식이면 alt=""를 사용';
  }
  if (A49_FILENAME.test(trimmed)) {
    return '파일명은 대체 텍스트가 아님 — 이미지 내용을 설명';
  }
  // NFC 정규화: macOS 편집 JSP의 NFD 한글('이미지' 분해형)도 동일 판정
  if (A49_GENERIC_WORDS.has(trimmed.normalize('NFC').toLowerCase())) {
    return '요소 유형만 반복하는 무의미한 값';
  }
  return null;
}

/**
 * Handle A-49: inadequate alt text on images (alt exists but is meaningless).
 * A-01(누락)·A-41(장식)·A-48(이중 이스케이프)과 달리 "있지만 무의미한" alt를 잡는다.
 * Sub-patterns: (a) whitespace/punctuation-only, (b) image filename, (c) generic word.
 *
 * @param {cheerio.CheerioAPI} $
 * @param {string} source
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkA49($, source, rule, filePath) {
  const violations = [];
  const scriptletResidues = collectA49ScriptletResidues(source);
  $('img[alt]').each((_, el) => {
    const $el = $(el);
    const reason = classifyA49AltValue($el.attr('alt') || '', scriptletResidues);
    if (reason === null) return;
    const code = ($.html($el) || '<img>').trim().slice(0, 200);
    violations.push({
      id: rule.id, title: rule.title, severity: rule.severity, tier: rule.tier,
      file: filePath, line: findLineNumber(source, code), column: 0, code,
      suggestion: reason,
      autoFixable: rule.autoFixable || false, confidence: 'high', category: rule.patternType
    });
  });
  return violations;
}

// 참고: A-40(인라인 a 카드 패턴)은 카드의 display 값이 외부 CSS 클래스에 정의되어
// 단일 파일 정적 분석으로 판정 불가(스모크 테스트에서 .program-box/.gallery-media-box 등 전부 오탐).
// 따라서 kwcag22.json에서 tier=T3(수동 점검)로 전환했고 전용 check 함수를 두지 않는다.

/**
 * Handle A-05 (html lang missing): fire ONLY when the source contains a real
 * `<html ...>` opening tag that lacks a lang/xml:lang attribute.
 *
 * Why a dedicated handler instead of the generic css-selector `html:not([lang])`:
 * cheerio synthesizes an `<html>` wrapper around EVERY parsed fragment, so the
 * css-selector fired on Tiles content fragments / includes that never emit an
 * `<html>` element at runtime (the document `<html lang>` is contributed solely by
 * the layout JSP). That produced massive false positives. Matching the literal tag
 * in the (comment-masked) source eliminates fragment synthesis artifacts while still
 * catching genuine standalone documents (full pages, popup/iframe pages) missing lang.
 *
 * @param {string} maskedSource - source with JSP/HTML comments masked to spaces
 * @param {object} rule
 * @param {string} filePath
 * @returns {Array}
 */
function checkA05(maskedSource, rule, filePath) {
  const violations = [];
  const htmlTagRe = /<html\b[^>]*>/gi;
  let m;
  while ((m = htmlTagRe.exec(maskedSource)) !== null) {
    const tag = m[0];
    // lang 또는 xml:lang 보유 시 통과. 속성 시작 경계(태그명 뒤 공백)에 앵커링해
    // data-html-lang= 같은 토큰을 lang 속성으로 오인하지 않는다. EL 값(lang="${locale}")도 인정.
    if (/(^|\s)(?:xml:)?lang\s*=/i.test(tag)) continue;
    const line = maskedSource.slice(0, m.index).split('\n').length;
    violations.push({
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      tier: rule.tier,
      file: filePath,
      line,
      column: 0,
      code: tag.slice(0, 200),
      suggestion: rule.autoFixTemplate || '<html lang="ko">',
      autoFixable: rule.autoFixable || false,
      confidence: rule.tier === 'T1' ? 'high' : 'medium',
      category: rule.patternType
    });
  }
  return violations;
}

// 개선 #2: CSS 파일 전용 접근성 스캔 — 접근성 규칙 중 fileTypes에 'css'가 선언된 regex 규칙
// (A-09 명도대비 하드코딩 색상, A-18 px 고정, A-25 outline 제거)을 외부 CSS 파일에도 적용한다.
// cheerio/preprocessJsp(JSP 전용)를 거치지 않고 CSS 주석(/* */)만 마스킹한 뒤 regex를 돌린다.
// 외부 스타일시트에 정의된 초점 제거·저대비 색을 정적 단계에서 포착하기 위함(A-25/A-09 사각 보완).
const CSS_COMMENT_RE = /\/\*[\s\S]*?\*\//g;

/**
 * Scan a CSS file with the accessibility regex rules that declare `css` in fileTypes.
 *
 * @param {string} filePath - Absolute path to a .css file
 * @param {object} ruleSet - Parsed kwcag22.json object { rules: [...] }
 * @returns {Promise<Array>} violations
 */
async function scanAccessibilityCss(filePath, ruleSet) {
  const source = fs.readFileSync(filePath, 'utf-8');
  // 주석 내부를 공백으로 치환(오프셋·라인 번호 보존) — 주석 처리된 옛 스타일 오탐 방지.
  const masked = source.replace(CSS_COMMENT_RE, (m) => m.replace(/[^\n]/g, ' '));

  const violations = [];
  for (const rule of (ruleSet.rules || [])) {
    if (rule.tier === 'T3') continue;           // 수동 점검 규칙 제외
    if (rule.patternType !== 'regex') continue; // css-selector(마크업 전용)는 CSS에 미적용
    if (!rule.pattern) continue;
    if (!(rule.fileTypes || []).includes('css')) continue;

    let regex;
    try { regex = new RegExp(rule.pattern, 'gi'); } catch (e) { continue; }

    let match;
    while ((match = regex.exec(masked)) !== null) {
      const code = match[0].slice(0, 200);
      const line = masked.slice(0, match.index).split('\n').length;
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
        category: rule.patternType   // JSP 경로와 동일 컨벤션 유지(동일 규칙이 파일종류에 따라 category가 갈리지 않도록)
      });
    }
  }
  return violations;
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

    if (rule.id === 'A-05') { violations.push(...checkA05(maskedSource, rule, filePath)); continue; }
    if (rule.id === 'A-34') { violations.push(...checkA34($, source, rule, filePath)); continue; }
    if (rule.id === 'A-46') { violations.push(...checkA46($, source, rule, filePath)); continue; }
    if (rule.id === 'A-49') { violations.push(...checkA49($, source, rule, filePath)); continue; }

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

module.exports = { scanAccessibility, scanAccessibilityCss };
