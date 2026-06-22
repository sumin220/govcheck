// test/keyboard-audit.test.cjs
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const {
  analyzePage, normalizeUrl, sameOrigin, ruleMeta
} = require('../scripts/lib/dynamic/keyboard-audit.cjs');

const rules = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'rules', 'keyboard-dynamic.json'), 'utf-8')
).rules;

describe('keyboard-audit: 규칙 JSON', () => {
  it('K-01~K-05 규칙이 모두 정의됨', () => {
    ['K-01', 'K-02', 'K-03', 'K-04', 'K-05'].forEach((id) => {
      const r = rules.find((x) => x.id === id);
      assert.ok(r, id + ' 규칙 존재');
      assert.ok(r.title && r.severity && r.category, id + ' 필수 필드');
      assert.strictEqual(r.tier, 'DYN', id + ' tier=DYN');
    });
  });
});

describe('keyboard-audit: analyzePage (순수 분석)', () => {
  const url = 'https://example.go.kr/page.do';

  it('K-01: Tab으로 도달 못 한 클릭 후보는 위반', () => {
    const probe = {
      candidates: [
        { auditId: 'kbd-1', sel: 'div.img-box', code: '<div class="img-box">…', reason: 'cursor:pointer' },
        { auditId: 'kbd-2', sel: 'span.more', code: '<span class="more" onclick>…', reason: 'onclick' }
      ],
      positiveTabindex: []
    };
    const walk = { reachedAuditIds: [], focusInvisible: [], trap: { detected: false } };
    const v = analyzePage(probe, walk, url, rules);
    const k01 = v.filter((x) => x.id === 'K-01');
    assert.strictEqual(k01.length, 2, '도달 못 한 후보 2건 모두 K-01');
    assert.strictEqual(k01[0].file, url, 'file 자리에 URL');
    assert.strictEqual(k01[0].confidence, 'high', '런타임 실측 high');
  });

  it('K-01: Tab으로 도달한 후보는 미발화 (JS가 tabindex 부여한 경우)', () => {
    const probe = {
      candidates: [{ auditId: 'kbd-1', sel: 'div.img-box', code: '<div…', reason: 'cursor:pointer' }],
      positiveTabindex: []
    };
    // main.js가 런타임에 tabindex 부여 → Tab으로 도달 → reachedAuditIds에 포함
    const walk = { reachedAuditIds: ['kbd-1'], focusInvisible: [], trap: { detected: false } };
    const v = analyzePage(probe, walk, url, rules);
    assert.strictEqual(v.filter((x) => x.id === 'K-01').length, 0, 'Tab 도달했으면 미발화');
  });

  it('K-02: 양수 tabindex 발화', () => {
    const probe = {
      candidates: [],
      positiveTabindex: [{ tabindex: 3, sel: 'a.nav', code: '<a tabindex="3">…' }]
    };
    const walk = { reachedAuditIds: [], focusInvisible: [], trap: { detected: false } };
    const v = analyzePage(probe, walk, url, rules);
    const k02 = v.filter((x) => x.id === 'K-02');
    assert.strictEqual(k02.length, 1);
    assert.ok(k02[0].suggestion.includes('3'), '값 안내 포함');
  });

  it('K-03: 포커스 시각 표시 없는 요소 발화', () => {
    const probe = { candidates: [], positiveTabindex: [] };
    const walk = {
      reachedAuditIds: [],
      focusInvisible: [{ sel: 'a.link', code: '<a class="link">…' }],
      trap: { detected: false }
    };
    const v = analyzePage(probe, walk, url, rules);
    assert.strictEqual(v.filter((x) => x.id === 'K-03').length, 1);
  });

  it('K-04: 키보드 트랩 발화', () => {
    const probe = { candidates: [], positiveTabindex: [] };
    const walk = { reachedAuditIds: [], focusInvisible: [], trap: { detected: true, at: 12, sel: 'div.modal' } };
    const v = analyzePage(probe, walk, url, rules);
    const k04 = v.filter((x) => x.id === 'K-04');
    assert.strictEqual(k04.length, 1);
    assert.ok(k04[0].suggestion.includes('12'), '트랩 위치 안내');
  });

  it('K-05: 명도대비 미달 발화 (ratio·기준 안내 + confidence medium)', () => {
    const probe = {
      candidates: [], positiveTabindex: [],
      contrastFails: [
        { text: '저대비 텍스트', ratio: 2.1, threshold: 4.5, fg: 'rgb(150,150,150)', bg: 'rgb(255,255,255)', fontSize: 14, large: false, code: '<p>저대비 텍스트</p>' }
      ]
    };
    const walk = { reachedAuditIds: [], focusInvisible: [], trap: { detected: false } };
    const v = analyzePage(probe, walk, url, rules);
    const k05 = v.filter((x) => x.id === 'K-05');
    assert.strictEqual(k05.length, 1);
    assert.ok(k05[0].suggestion.includes('2.1:1'), '실측 대비비 포함');
    assert.ok(k05[0].suggestion.includes('4.5:1'), '기준 포함');
    assert.strictEqual(k05[0].confidence, 'medium', '배경 근사라 medium');
    assert.strictEqual(k05[0].category, '명도 대비');
  });

  it('K-05: 미달 텍스트 없으면 미발화', () => {
    const probe = { candidates: [], positiveTabindex: [], contrastFails: [] };
    const walk = { reachedAuditIds: [], focusInvisible: [], trap: { detected: false } };
    assert.strictEqual(analyzePage(probe, walk, url, rules).filter((x) => x.id === 'K-05').length, 0);
  });

  it('위반 없음: 깨끗한 페이지는 빈 배열', () => {
    const probe = { candidates: [], positiveTabindex: [] };
    const walk = { reachedAuditIds: [], focusInvisible: [], trap: { detected: false } };
    assert.deepStrictEqual(analyzePage(probe, walk, url, rules), []);
  });

  it('모든 violation은 표준 스키마(id/severity/tier/file/confidence)를 가짐', () => {
    const probe = {
      candidates: [{ auditId: 'kbd-1', sel: 'div', code: '<div>', reason: 'cursor:pointer' }],
      positiveTabindex: [{ tabindex: 2, sel: 'a', code: '<a>' }]
    };
    const walk = { reachedAuditIds: [], focusInvisible: [{ sel: 'a', code: '<a>' }], trap: { detected: true, at: 1, sel: 'x' } };
    const v = analyzePage(probe, walk, url, rules);
    v.forEach((x) => {
      ['id', 'title', 'severity', 'tier', 'file', 'code', 'suggestion', 'confidence', 'category'].forEach((k) => {
        assert.ok(x[k] !== undefined, 'violation.' + k + ' 존재');
      });
    });
  });
});

describe('keyboard-audit: URL 유틸', () => {
  it('normalizeUrl은 해시 제거', () => {
    assert.strictEqual(normalizeUrl('https://a.go.kr/x?y=1#frag'), 'https://a.go.kr/x?y=1');
    assert.strictEqual(normalizeUrl('not a url'), null);
  });
  it('sameOrigin 비교', () => {
    assert.ok(sameOrigin('https://a.go.kr/1', 'https://a.go.kr/2'));
    assert.ok(!sameOrigin('https://a.go.kr/1', 'https://b.go.kr/1'));
  });
  it('ruleMeta는 미정의 id에 fallback 제공', () => {
    const r = ruleMeta(rules, 'K-99');
    assert.strictEqual(r.id, 'K-99');
    assert.ok(r.tier);
  });
});
