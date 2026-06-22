// scripts/lib/dynamic/keyboard-audit.cjs
'use strict';

/**
 * Playwright 기반 동적 키보드 접근성 감사.
 *
 * 정적 분석(cheerio)으로는 못 잡는 런타임 키보드 문제를 실제 브라우저로 검사한다:
 *  - 클릭/호버되는데 Tab으로 도달 못 하는 요소 (cursor:pointer·onclick·role이 있으나 focusable 아님)
 *    → JS가 런타임에 tabindex를 붙이는 경우(예: main.js)는 페이지 로드 후 측정하므로 정상 처리됨
 *  - 양수 tabindex (포커스 순서 깨짐)
 *  - Tab 포커스 시 시각적 표시(outline 등) 없음
 *  - 키보드 트랩 (Tab이 진행 안 되거나 일부 영역에 갇힘)
 *
 * playwright는 optionalDependency — 미설치 시 명확한 안내와 함께 실패한다.
 */

const DEFAULTS = {
  maxPages: 20,        // 크롤 최대 페이지 수
  maxTabs: 200,        // 페이지당 Tab 최대 횟수
  navTimeout: 20000,   // 페이지 이동 타임아웃(ms)
  settleDelay: 700,    // JS 실행(tabindex 동적 부여 등) 대기(ms)
  sameOriginOnly: true,
  viewport: { width: 1280, height: 900 }
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. 브라우저 컨텍스트에서 실행되는 프로브 (page.evaluate 인자) — 순수 DOM 측정
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 페이지 내 "클릭 가능해 보이지만 키보드 포커스 불가"한 요소 + 양수 tabindex를 수집.
 * 각 후보에 data-kbd-audit-id를 부여해 Tab 도달 여부와 대조할 수 있게 한다.
 * (이 함수는 직렬화되어 브라우저에서 실행되므로 외부 변수를 참조하면 안 됨)
 */
function collectCandidatesInBrowser() {
  const FOCUSABLE_SEL = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], audio[controls], video[controls], iframe, summary';
  const INTERACTIVE_ROLES = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch', 'option'];

  const isNativelyFocusable = (el) => {
    try { return el.matches(FOCUSABLE_SEL); } catch (e) { return false; }
  };
  const isVisible = (el, cs, rect) => {
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    if (rect.width < 8 || rect.height < 8) return false;
    if (rect.bottom < 0 || rect.right < 0) return false;
    return true;
  };
  const describe = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).slice(0, 3).map(c => '.' + c).join('');
    let snippet = '';
    try { snippet = el.outerHTML.replace(/\s+/g, ' ').trim().slice(0, 160); } catch (e) { snippet = el.tagName; }
    return { tag: el.tagName.toLowerCase(), sel: el.tagName.toLowerCase() + id + cls, code: snippet };
  };

  const candidates = [];
  const positiveTabindex = [];
  let auditSeq = 0;
  const all = document.querySelectorAll('body *');

  all.forEach((el) => {
    let cs, rect;
    try { cs = getComputedStyle(el); rect = el.getBoundingClientRect(); } catch (e) { return; }
    if (!isVisible(el, cs, rect)) return;

    // 양수 tabindex 수집 (포커스 순서 깨짐)
    const tiAttr = el.getAttribute('tabindex');
    if (tiAttr !== null) {
      const ti = parseInt(tiAttr, 10);
      if (!isNaN(ti) && ti > 0) {
        const d = describe(el);
        positiveTabindex.push({ tabindex: ti, sel: d.sel, code: d.code });
      }
    }

    // 이미 포커스 가능(native 또는 tabindex 보유)하면 후보 아님 — 런타임 JS가 tabindex 부여한 경우 포함
    if (isNativelyFocusable(el) || tiAttr !== null) return;

    const role = (el.getAttribute('role') || '').toLowerCase();
    const hasOnclick = el.hasAttribute('onclick');
    const interactiveRole = INTERACTIVE_ROLES.indexOf(role) !== -1;
    const cursorPointer = cs.cursor === 'pointer';

    // cursor:pointer는 자식에 상속되어 노이즈가 큼 → 최상위(부모는 pointer 아님)만 채택
    let topMostPointer = false;
    if (cursorPointer) {
      const parent = el.parentElement;
      let parentPointer = false;
      if (parent && parent !== document.body) {
        try { parentPointer = getComputedStyle(parent).cursor === 'pointer'; } catch (e) { parentPointer = false; }
      }
      topMostPointer = !parentPointer;
    }

    const looksInteractive = hasOnclick || interactiveRole || topMostPointer;
    if (!looksInteractive) return;

    // 후보 확정 — 마킹
    auditSeq += 1;
    const auditId = 'kbd-' + auditSeq;
    el.setAttribute('data-kbd-audit-id', auditId);
    const d = describe(el);
    candidates.push({
      auditId,
      sel: d.sel,
      code: d.code,
      reason: hasOnclick ? 'onclick' : (interactiveRole ? ('role=' + role) : 'cursor:pointer')
    });
  });

  return {
    candidates,
    positiveTabindex,
    focusableCount: document.querySelectorAll(FOCUSABLE_SEL + ', [tabindex]').length
  };
}

/**
 * 현재 포커스된 요소의 식별/포커스 가시성 정보를 반환 (page.evaluate 인자).
 */
function readActiveElementInBrowser() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) {
    return { none: true };
  }
  const cs = getComputedStyle(el);
  // :focus-visible 상태(키보드 Tab으로 포커스됨)에서의 시각 표시 측정
  const outlineVisible = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
  const boxShadowVisible = cs.boxShadow && cs.boxShadow !== 'none';
  const borderVisible = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0;
  const auditId = el.getAttribute && el.getAttribute('data-kbd-audit-id');
  let sel = el.tagName ? el.tagName.toLowerCase() : 'unknown';
  if (el.id) sel += '#' + el.id;
  let code = '';
  try { code = el.outerHTML.replace(/\s+/g, ' ').trim().slice(0, 140); } catch (e) { code = sel; }
  // 화면 위치 기반 고유 식별 — 서로 다른 요소가 같은 키로 충돌하는 것을 방지(트랩 오탐 차단)
  let rectKey = '';
  try {
    const r = el.getBoundingClientRect();
    rectKey = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',');
  } catch (e) { rectKey = ''; }
  return {
    none: false,
    auditId: auditId || null,
    sel,
    code,
    rectKey,
    focusVisible: !!(outlineVisible || boxShadowVisible || borderVisible)
  };
}

/**
 * 텍스트 명도대비(KWCAG 5.4.3 / 항목 8) 측정 — page.evaluate 인자.
 * WCAG 상대휘도로 본문 4.5:1·큰 글자 3:1 미달 텍스트를 수집한다.
 * 오탐 가드(govcheck 철학): 배경이 이미지·그라데이션·반투명이라 확정 불가하거나,
 * 글자색이 반투명이거나, 숨김/비활성/미세 요소면 제외한다(= 정적 분석으로 못 잡되 런타임에서 확실한 것만).
 * (이 함수는 직렬화되어 브라우저에서 실행되므로 외부 변수를 참조하면 안 됨)
 */
function collectContrastInBrowser() {
  function parseRgb(s) {
    var m = (s || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(',').map(function (x) { return parseFloat(x); });
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function lum(c) {
    function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  function ratio(f, b) { var a = lum(f), c = lum(b), hi = Math.max(a, c), lo = Math.min(a, c); return (hi + 0.05) / (lo + 0.05); }
  // 배경 해석: 조상을 거슬러 올라가며 첫 solid 불투명 색을 반환. 이미지/그라데이션/반투명을 만나면 uncertain.
  function resolveBg(el) {
    var n = el, uncertain = false;
    while (n && n.nodeType === 1) {
      var cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') uncertain = true; // 이미지/그라데이션 위 텍스트 → 계산 불가
      var c = parseRgb(cs.backgroundColor);
      if (c) {
        if (c.a === 1) return { bg: c, uncertain: uncertain };
        if (c.a > 0) uncertain = true; // 반투명 배경 → 누적색 불확실
      }
      n = n.parentElement;
    }
    return { bg: { r: 255, g: 255, b: 255, a: 1 }, uncertain: uncertain };
  }

  // 비활성/흐림 상태 판정 — KWCAG는 비활성(disabled) UI 요소를 명도대비에서 면제한다.
  // disabled 속성·aria-disabled뿐 아니라 클래스 기반 비활성(예: air-datepicker '-disabled-')과
  // cursor:not-allowed까지 잡아 비활성 텍스트 오탐을 차단한다.
  function isDisabledish(el, cs) {
    if (cs.cursor === 'not-allowed') return true;
    var n = el, depth = 0;
    while (n && n.nodeType === 1 && depth < 4) {
      if (n.disabled) return true;
      if (n.getAttribute && n.getAttribute('aria-disabled') === 'true') return true;
      var cn = typeof n.className === 'string' ? n.className : '';
      if (/(?:^|[\s_-])(disabled|inactive|readonly)(?:[\s_-]|$)/i.test(cn)) return true;
      n = n.parentElement; depth++;
    }
    return false;
  }

  var fails = [], checked = 0, seen = {};
  var nodes = [].slice.call(document.querySelectorAll('body *'));
  for (var i = 0; i < nodes.length && checked < 1000; i++) {
    var el = nodes[i], cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    if (isDisabledish(el, cs)) continue; // 비활성/흐림 텍스트 예외
    // 직접 텍스트 노드만 — 자식 요소의 텍스트는 그 요소가 따로 검사
    var txt = '';
    for (var j = 0; j < el.childNodes.length; j++) {
      if (el.childNodes[j].nodeType === 3) txt += el.childNodes[j].textContent;
    }
    txt = txt.trim();
    if (!txt) continue;
    var rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue; // 미세/숨김 요소
    var fg = parseRgb(cs.color);
    if (!fg || fg.a < 1) continue; // 반투명 글자 → 계산 불확실
    var bgInfo = resolveBg(el);
    if (bgInfo.uncertain) continue; // 배경 이미지/그라데이션/반투명 → 오탐 방지로 skip
    var key = txt.slice(0, 30) + cs.color + cs.fontSize;
    if (seen[key]) continue;
    seen[key] = 1;
    checked++;
    var sz = parseFloat(cs.fontSize), wt = parseInt(cs.fontWeight, 10) || 400;
    var large = sz >= 24 || (sz >= 18.66 && wt >= 700);
    var thr = large ? 3 : 4.5;
    var rr = ratio(fg, bgInfo.bg);
    if (rr < thr - 0.05) { // 반올림 경계 여유
      var code = '';
      try { code = el.outerHTML.replace(/\s+/g, ' ').trim().slice(0, 140); } catch (e) { code = txt.slice(0, 60); }
      fails.push({
        text: txt.slice(0, 40),
        ratio: Math.round(rr * 100) / 100,
        threshold: thr,
        fg: cs.color,
        bg: 'rgb(' + bgInfo.bg.r + ',' + bgInfo.bg.g + ',' + bgInfo.bg.b + ')',
        fontSize: Math.round(sz),
        large: large,
        code: code
      });
    }
  }
  return { contrastFails: fails, contrastChecked: checked };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 순수 분석 — 프로브/Tab워크 결과 → violations (브라우저 불필요, 테스트 대상)
// ─────────────────────────────────────────────────────────────────────────────

const RULE_FALLBACK = {
  'K-01': { title: '클릭 가능하지만 키보드 접근 불가', severity: 'critical', category: '키보드 접근' },
  'K-02': { title: '양수 tabindex (포커스 순서 깨짐)', severity: 'warning', category: '키보드 접근' },
  'K-03': { title: 'Tab 포커스 시각 표시 없음', severity: 'critical', category: '키보드 포커스' },
  'K-04': { title: '키보드 트랩 (Tab 진행 불가)', severity: 'critical', category: '키보드 접근' },
  'K-05': { title: '텍스트 명도대비 미달', severity: 'warning', category: '명도 대비' }
};

function ruleMeta(rules, id) {
  const r = (rules || []).find((x) => x.id === id);
  return r || Object.assign({ id: id, tier: 'DYN', autoFixable: false }, RULE_FALLBACK[id]);
}

function makeViolation(rule, url, code, suggestion, extra) {
  return Object.assign({
    id: rule.id,
    title: rule.title,
    severity: rule.severity,
    tier: rule.tier || 'DYN',
    file: url,            // 동적 검사는 file 자리에 URL을 넣는다
    line: 0,
    column: 0,
    code: (code || '').slice(0, 200),
    suggestion: suggestion || rule.description || '',
    autoFixable: false,
    confidence: 'high',   // 런타임 실측이므로 high
    category: rule.category || '키보드 접근'
  }, extra || {});
}

/**
 * 한 페이지의 프로브 + Tab워크 결과를 violations로 변환 (순수 함수).
 *
 * @param {object} probe - collectCandidatesInBrowser() 결과
 * @param {object} walk  - { reachedAuditIds:Set|Array, focusInvisible:[{sel,code}], trap:{detected,at,sel} }
 * @param {string} url
 * @param {Array} rules  - keyboard-dynamic.json rules
 * @returns {Array} violations
 */
function analyzePage(probe, walk, url, rules) {
  const violations = [];
  const reached = new Set(walk && walk.reachedAuditIds ? walk.reachedAuditIds : []);

  // K-01: 클릭 가능해 보이지만 Tab으로 도달 못 함
  const rK01 = ruleMeta(rules, 'K-01');
  (probe.candidates || []).forEach((c) => {
    if (reached.has(c.auditId)) return; // Tab으로 실제 도달했으면 통과
    violations.push(makeViolation(
      rK01, url, c.code,
      '클릭/호버로만 동작하는 요소입니다. <a>/<button>으로 바꾸거나 tabindex="0" + role + 키보드(focus/Enter) 처리를 추가하세요. (탐지 단서: ' + c.reason + ')'
    ));
  });

  // K-02: 양수 tabindex
  const rK02 = ruleMeta(rules, 'K-02');
  (probe.positiveTabindex || []).forEach((t) => {
    violations.push(makeViolation(
      rK02, url, t.code,
      'tabindex="' + t.tabindex + '" — 양수 tabindex는 자연스러운 포커스 순서를 깨뜨립니다. 0 또는 -1만 사용하세요.'
    ));
  });

  // K-03: 포커스 시각 표시 없음
  const rK03 = ruleMeta(rules, 'K-03');
  (walk && walk.focusInvisible ? walk.focusInvisible : []).forEach((f) => {
    violations.push(makeViolation(
      rK03, url, f.code,
      'Tab 포커스 시 outline 등 시각적 표시가 없습니다. :focus-visible에 outline/box-shadow를 제공하세요. (outline:none 제거 또는 대체 스타일)'
    ));
  });

  // K-04: 키보드 트랩
  if (walk && walk.trap && walk.trap.detected) {
    const rK04 = ruleMeta(rules, 'K-04');
    violations.push(makeViolation(
      rK04, url, walk.trap.sel || '',
      'Tab 키가 ' + (walk.trap.at != null ? (walk.trap.at + '번째 이동에서 ') : '') + '더 진행되지 않거나 일부 영역에 갇힙니다. 포커스 트랩(모달 등)에 Esc/순환 탈출을 제공하세요.'
    ));
  }

  // K-05: 텍스트 명도대비 미달 (런타임 계산 — 배경 확정 가능한 것만, confidence medium)
  const rK05 = ruleMeta(rules, 'K-05');
  (probe.contrastFails || []).forEach((f) => {
    violations.push(makeViolation(
      rK05, url, f.code,
      '명도대비 ' + f.ratio + ':1 (기준 ' + f.threshold + ':1' + (f.large ? ', 큰글자' : '') + ', ' + f.fontSize + 'px, 글자색 ' + f.fg + ' / 배경 ' + f.bg + '). 본문 4.5:1·큰글자 3:1 이상으로 조정하세요. (로고·장식·비활성 텍스트는 예외 — 수동 확인)',
      { confidence: 'medium' }   // 배경 해석이 근사이므로 medium
    ));
  });

  return violations;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Playwright 드라이버 — 크롤 + 페이지별 감사
// ─────────────────────────────────────────────────────────────────────────────

function lazyChromium() {
  try {
    return require('playwright').chromium;
  } catch (e) {
    const err = new Error(
      'PLAYWRIGHT_NOT_INSTALLED: 동적 키보드 감사는 playwright가 필요합니다.\n' +
      '  설치: cd ' + __dirname.replace(/scripts.*$/, '') + ' && npm install playwright && npx playwright install chromium'
    );
    err.code = 'PLAYWRIGHT_NOT_INSTALLED';
    throw err;
  }
}

function sameOrigin(a, b) {
  try { return new URL(a).origin === new URL(b).origin; } catch (e) { return false; }
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    return url.toString();
  } catch (e) { return null; }
}

/** 한 페이지에서 같은 출처의 링크 후보를 수집 */
async function collectLinks(page, baseUrl, opts) {
  const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map((a) => a.href));
  const out = [];
  for (const h of hrefs) {
    const n = normalizeUrl(h);
    if (!n) continue;
    if (/\.(pdf|zip|jpg|jpeg|png|gif|svg|mp4|hwp|xlsx?|docx?|pptx?)(\?|$)/i.test(n)) continue;
    if (/^(mailto:|tel:|javascript:)/i.test(h)) continue;
    if (opts.sameOriginOnly && !sameOrigin(n, baseUrl)) continue;
    out.push(n);
  }
  return out;
}

/** 한 페이지를 Tab으로 순회하며 도달 요소·포커스 가시성·트랩을 측정 */
async function tabWalk(page, opts) {
  const reachedAuditIds = [];
  const focusInvisible = [];
  const seenInvisible = new Set();
  let trap = { detected: false, at: null, sel: null };

  // 시작: body로 포커스 초기화
  await page.evaluate(() => { try { document.body.tabIndex = -1; document.body.focus(); } catch (e) {} });

  let prevKey = null;
  let stuckCount = 0;
  const visitedSeq = [];

  for (let i = 0; i < opts.maxTabs; i++) {
    await page.keyboard.press('Tab');
    let info;
    try { info = await page.evaluate(readActiveElementInBrowser); } catch (e) { break; }
    if (info.none) {
      // 포커스가 문서 밖(주소창 등)으로 나감 → 정상 종료로 간주
      break;
    }
    // 고유 식별: auditId > rectKey(화면 위치) > sel+code (충돌 최소화)
    const key = info.auditId || info.rectKey || (info.sel + '|' + (info.code || '').slice(0, 40));
    visitedSeq.push(key);

    if (info.auditId) reachedAuditIds.push(info.auditId);
    if (!info.focusVisible && !seenInvisible.has(key)) {
      seenInvisible.add(key);
      focusInvisible.push({ sel: info.sel, code: info.code });
    }

    // 트랩 휴리스틱(보수적): 완전히 동일한 요소(위치까지)가 연속 6회 반복 = 포커스 진행 불가.
    // rect 기반 키라 서로 다른 요소가 충돌하지 않음 → 진짜 트랩만 잡음(오탐 차단).
    if (key === prevKey) {
      stuckCount += 1;
      if (stuckCount >= 5) { // 동일 요소 6회 연속(최초 1 + 반복 5)
        trap = { detected: true, at: i, sel: info.sel + ' ' + (info.code || '').slice(0, 60) };
        break;
      }
    } else {
      stuckCount = 0;
    }
    prevKey = key;

    // 순환 완료 감지: 최근 방문열이 처음과 동일하게 반복되면 한 바퀴 돈 것 → 종료
    if (visitedSeq.length > 4) {
      const first = visitedSeq[0];
      // 첫 요소로 되돌아왔고, 이미 충분히 돌았으면 종료
      if (key === first && i > 2) break;
    }
  }

  return { reachedAuditIds, focusInvisible, trap, tabCount: visitedSeq.length };
}

/** 단일 URL 감사 — page 재사용 */
async function auditSinglePage(page, url, rules, opts) {
  await page.goto(url, { waitUntil: 'load', timeout: opts.navTimeout });
  try { await page.waitForLoadState('networkidle', { timeout: 3000 }); } catch (e) { /* best-effort */ }
  await page.waitForTimeout(opts.settleDelay); // JS가 동적 tabindex 부여할 시간

  const probe = await page.evaluate(collectCandidatesInBrowser);
  const contrast = await page.evaluate(collectContrastInBrowser);
  const merged = Object.assign({}, probe, contrast);
  const walk = await tabWalk(page, opts);
  const violations = analyzePage(merged, walk, url, rules);
  return {
    url,
    candidates: probe.candidates.length,
    contrastFails: (contrast.contrastFails || []).length,
    tabStops: walk.tabCount,
    violations
  };
}

/**
 * 동적 키보드 감사 실행 — baseUrl에서 크롤하며 각 페이지를 검사.
 *
 * @param {object} options - { baseUrl, urls?, rules?, maxPages, maxTabs, sameOriginOnly, navTimeout, settleDelay, ignoreHTTPSErrors }
 * @returns {Promise<object>} { baseUrl, pagesScanned, totalViolations, perPage:[], violations:[] }
 */
async function runKeyboardAudit(options) {
  const opts = Object.assign({}, DEFAULTS, options || {});
  const rules = (options && options.rules) || [];
  if (!opts.baseUrl && (!opts.urls || !opts.urls.length)) {
    throw new Error('baseUrl 또는 urls가 필요합니다.');
  }
  const startUrl = opts.baseUrl || opts.urls[0];

  const chromium = lazyChromium();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: opts.viewport,
    ignoreHTTPSErrors: opts.ignoreHTTPSErrors !== false  // dev 자가서명 인증서 허용 기본
  });
  const page = await context.newPage();

  const queue = [];
  const seen = new Set();
  const enqueue = (u) => {
    const n = normalizeUrl(u);
    if (n && !seen.has(n)) { seen.add(n); queue.push(n); }
  };

  if (opts.urls && opts.urls.length) opts.urls.forEach(enqueue);
  else enqueue(startUrl);

  const perPage = [];
  const allViolations = [];

  try {
    while (queue.length && perPage.length < opts.maxPages) {
      const url = queue.shift();
      let result;
      try {
        result = await auditSinglePage(page, url, rules, opts);
      } catch (e) {
        perPage.push({ url, error: String(e && e.message || e), violations: [] });
        continue;
      }
      perPage.push({ url: result.url, candidates: result.candidates, contrastFails: result.contrastFails, tabStops: result.tabStops, violationCount: result.violations.length });
      allViolations.push(...result.violations);

      // 크롤 확장 (urls 명시 모드가 아니면)
      if (!opts.urls && perPage.length < opts.maxPages) {
        try {
          const links = await collectLinks(page, startUrl, opts);
          links.forEach(enqueue);
        } catch (e) { /* noop */ }
      }
    }
  } finally {
    await browser.close();
  }

  return {
    baseUrl: startUrl,
    pagesScanned: perPage.length,
    totalViolations: allViolations.length,
    perPage,
    violations: allViolations
  };
}

module.exports = {
  // 순수(테스트 대상)
  analyzePage,
  ruleMeta,
  makeViolation,
  normalizeUrl,
  sameOrigin,
  // 브라우저 프로브 (직렬화되어 evaluate로 실행)
  collectCandidatesInBrowser,
  readActiveElementInBrowser,
  collectContrastInBrowser,
  // 드라이버
  runKeyboardAudit,
  DEFAULTS
};
