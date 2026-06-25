# govcheck

공공기관 프로젝트 통합 점검 Claude Code Plugin

A Claude Code plugin that checks Korean government (eGovFramework) project compliance across 7 domains.

## Installation

### Via Marketplace

```
Plugins > Marketplaces > + Add Marketplace > "sonsumin/govcheck"
Plugins > Discover > "govcheck" > Space to install
```

## Usage

### Full Scan

```
/govcheck
```

### Changed Files Only

```
/govcheck-diff
```

### Options

```
/govcheck --no-quality --no-gs          # 특정 영역 제외
/govcheck --only accessibility,securecoding  # 특정 영역만
/govcheck --severity critical            # 심각도 필터
/govcheck --file src/main/webapp/.../index.jsp  # 단일 파일/페이지만 점검
/govcheck --report                       # 미흡 사항을 보고서(Markdown)로 생성
/govcheck-diff --staged                  # staged 변경분만
/govcheck-diff --committed               # 마지막 커밋 변경분
```

### 점검 단위 & 리포트

- **전체**: `scan_all` (프로젝트 전체) · **단일 파일/페이지**: `scan_file({ filePath })` — 확장자에 맞는 도메인만 자동 적용.
- **리포트**: `scan_report({ projectRoot | filePath, format })` 또는 CLI
  `node scripts/report-cli.cjs <projectRoot> [--file <경로>] [--format md|html|both] [--out report]`.
  골격: 요약(부적합·적합추정·수동확인) → 도메인별 합불 표 → 부적합 상세(파일:라인+조치) → 수동확인 안내.
  > 정적으로 판정 불가한 항목(예: **이미지 내 텍스트의 alt 전수 반영** — 자동 OCR 미지원)은 "수동확인"으로 정직하게 표기.

## 7 Compliance Domains

| Domain | Description | Rules |
|--------|-------------|-------|
| **KWCAG 2.2 웹접근성** | 한국형 웹콘텐츠 접근성 지침 2.2 | 46 rules (33 항목) |
| **웹표준** | HTML/CSS 유효성, 시맨틱 마크업, 인라인 스타일(W-11) | 11 items |
| **시큐어코딩** | 행안부 소프트웨어 개발보안 가이드 | 49 items |
| **개인정보보호** | 개인정보 노출 진단 | 9 items |
| **eGov 호환성** | 전자정부프레임워크 호환성 | 8 items |
| **GS인증 대비** | ISO 25010 기반 품질특성 | 12 items |
| **웹취약점** | KISA 주요정보통신기반시설 + OWASP Top 10 | 22 items |

## KWCAG 2.2 규칙 (46 rules)

KWCAG 2.2 표준 33개 검사항목을 46개 정적 규칙으로 점검합니다. 아래는 실제 웹접근성 전문가 심사(서울갤러리 1·2차 심사, 2026-05~06, WebWatch)에서 지적된 패턴을 반영해 추가·보정한 규칙입니다.

### 신규 규칙 (audit-derived)

| ID | KWCAG 항목 | 탐지 내용 | Tier |
|----|-----------|-----------|------|
| A-34 | 26 사용자 요구에 따른 실행 | 새 창 열림 안내(title·aria-label·visually-hidden) 누락 — `target="_blank"` 링크 + JS `window.open` 요소(2차 확장, 호출 형태 검증·중복 제거) | T1 |
| A-36 | 10 키보드 사용 보장 | `div`/`span` 등 비인터랙티브 요소의 `onclick` + tabindex·role 부재 | T1 |
| A-37 | 26 사용자 요구에 따른 실행 | `select[onchange]`로 옵션 변경 시 자동 페이지 갱신/이동 | T1 |
| A-38 | 1 적절한 대체 텍스트 | CK Editor 본문 이미지(`ckeditor`/`getImg`) alt 누락 (A-01 보완, BO 콘텐츠 담당) | T1 |
| A-41 | 1 적절한 대체 텍스트 | 장식 이미지 `alt=""`에 `aria-hidden="true"` 누락 | T1 (info) |
| A-43 | 2 자막 제공 | `video`/`audio` 자막 `track` 누락 (장식용 `muted` 배경영상 제외) | T1 |
| A-44 | 3 표의 구성 | `th`에 `scope`/`headers` 연결 누락 (A-04 보완) | T2 |
| A-45 | 8 텍스트 명도/확대 | viewport `user-scalable=no`로 화면 확대 차단 | T2 |
| A-46 | 23·29 레이블 | `select`/`textarea` 레이블(`label[for]`·`aria-label`) 미연결 (A-02 보완) | T1 |
| A-47 | 33 웹 애플리케이션 접근성 | 무의미한 generic `aria-label` (`"버튼"`·`"button"`·`"control"` 등 요소 유형만 반복하는 값) | T2 |
| A-48 | 1 적절한 대체 텍스트 | HTML 엔티티 이중 이스케이프 흔적 (`&amp;#39;` 등 — 저장 시 이스케이프된 값을 출력 시 재이스케이프한 버그 신호) | T2 |
| A-49 | 1 적절한 대체 텍스트 | 부적절한 alt 휴리스틱 — 공백/구두점만·이미지 파일명·generic 단어(`"이미지"`·`"photo"` 등) alt (EL `${}` skip, `로고`/`logo` 제외) | T1 |

### 보정 규칙

| ID | 변경 | 사유 |
|----|------|------|
| A-05 | `html lang` 누락을 **소스의 실제 `<html>` 태그에서만** 판정 (cheerio 합성 `<html>` 무시) | Tiles 조각·include마다 합성되는 `<html>`로 인한 대량 오탐 제거 — 실제 standalone 문서만 탐지 |
| A-09 | 명도대비 색상 패턴에 `(?<![\w-])` 경계 추가 + **CSS 파일 스캔 대상 포함** | `background-color` 등 오탐 제거 / 외부 스타일시트의 하드코딩 텍스트 색도 탐지 |
| A-18 | fileTypes에서 `css` 제거 (JSP/HTML 인라인 한정) | CSS 전반의 `font-size:px` 대량 오탐 방지 — px 고정은 인라인 스타일에서만 탐지 |
| A-25 | T3(claude) → T2(regex) 승격, `outline:none`/`0` 탐지 + **CSS 파일 스캔 대상 포함** | 초점 표시 제거를 정적으로 탐지 — 외부 CSS의 초점 제거까지 포착 |
| A-40 | T1 → T3(수동 점검) 강등 | 카드형 `a`의 `display`는 외부 CSS 클래스에 정의돼 단일 파일 정적 판정 불가 (실측 100% 오탐) |

> **설계 원칙:** 모든 신규 규칙은 2개 독립 분석(coverage-maximizer vs false-positive skeptic) + 실프로젝트 오탐 실측을 거쳐, **신뢰성 있게 탐지되는 것만** 채택했습니다. 카드형 `display` 등 외부 CSS 클래스 의존·크로스파일(JSP include/Tiles)·런타임 상태·계산값(명도 대비 *계산*)에 의존하는 항목은 T3(수동 점검)로 분류하거나 제외합니다. 단, **regex 계열의 A-09(텍스트 색)·A-25(초점 제거)는 외부 CSS 파일 자체를 직접 스캔**해 정적 단계에서 보완합니다(접근성 도메인의 CSS 패스 — vendor/번들 CSS는 `cssVendorIgnore`로 제외). 중복 id(KWCAG 32)는 웹표준 스캐너 W-07이 담당하여 도메인 간 중복을 피합니다. regex 계열 규칙은 JSP/HTML·CSS **주석 내부를 마스킹**(오프셋 보존)하고 스캔하여 주석 처리된 옛 마크업 오탐을 방지합니다.

## 동적 키보드 접근성 감사 (Playwright)

정적 분석으로는 **원리적으로 못 잡는** 런타임 문제 — 예: `cursor:pointer`/외부 JS `addEventListener`로만 동작해 클릭은 되지만 **Tab으로 도달 못 하는 요소**(KWCAG 10), **명도대비 계산값**(KWCAG 8) — 를 실제 브라우저로 **살아있는 사이트를 크롤하며** 검사합니다. 정적 규칙 A-36(`onclick` 속성 한정)·A-25(outline 제거)·A-09(색상만 탐지·계산 불가)의 런타임 보완입니다.

```bash
# 설치 (playwright는 optionalDependency)
npm install playwright && npx playwright install chromium

# 실행 — baseUrl에서 같은 출처 링크를 크롤하며 페이지마다 Tab 순회
node scripts/keyboard-audit-cli.cjs https://site.go.kr/index.do --max-pages 20
node scripts/keyboard-audit-cli.cjs https://site.go.kr/index.do --json   # JSON 출력
```

MCP 도구로도 노출: `audit_keyboard({ baseUrl, maxPages?, maxTabs?, sameOriginOnly?, ignoreSelectors? })`

- `ignoreSelectors`: 통제 불가 영역(예: 공용 GNB) CSS 셀렉터 목록 — 매칭 요소는 K-01~K-05에서 제외. **cross-origin `<iframe>`은 (내부 측정 불가라) 기본 제외**됩니다.
- `scan_all`에 동적 감사 통합(opt-in): `scan_all({ projectRoot, baseUrl, dynamicUrls?, ignoreSelectors?, maxPages?, maxTabs? })` — `baseUrl`을 주면 정적 7개 도메인 + 동적 `keyboard` 도메인을 함께 반환합니다(미지정 시 정적만, 기존과 동일).

| ID | 탐지 내용 | KWCAG | severity |
|----|-----------|-------|----------|
| K-01 | **클릭/호버되는데 Tab 불가** — cursor:pointer·onclick·role이 있으나 페이지 로드(JS 실행) 후에도 포커스 불가 + Tab 미도달. 런타임에 JS가 tabindex를 부여하면(예: 정상 처리) 미발화 | 10 | critical |
| K-02 | 양수 tabindex (런타임 확인) | 11 | warning |
| K-03 | Tab 포커스 시 시각 표시(outline 등) 없음 | 11 | critical |
| K-04 | 키보드 트랩 (Tab 진행 불가 — rect 기반 식별 + 연속 6회로 보수 판정) | 10 | critical |
| K-05 | **텍스트 명도대비 미달** — WCAG 상대휘도로 본문 4.5:1·큰글자 3:1 미만을 런타임 계산. 배경이 이미지·그라데이션·반투명이거나 비활성(disabled·`-disabled-` 클래스·cursor:not-allowed)·반투명 글자는 오탐 방지로 제외. 로고·장식은 예외이므로 수동 확인(confidence medium) | 8 | warning |

> **왜 동적인가:** "클릭되는데 Tab 안 됨"은 `cursor:pointer`(외부/inline CSS) + `addEventListener`(외부 JS) + DB 콘텐츠를 가로질러야 판정돼 단일 파일 정적 분석으론 불가(= A-40 교훈). **명도대비**도 전경/배경색 + 렌더링된 누적 배경을 알아야 4.5:1 계산이 가능해 정적으론 색만 탐지(A-09)할 뿐 계산은 못 한다. 실제 브라우저에서 **JS 실행 후** Tab을 눌러보고 색을 계산하면 신뢰성 있게 잡힌다. 페이지 로드 후 `settleDelay` 대기로 런타임 tabindex 부여를 정상 인식해 오탐을 막는다. 소스 파일이 아니라 **실행 중인 사이트(URL)**를 검사하므로 정적 스캐너와 별도 모드로 동작한다.

## Configuration

Create `.govcheckrc.json` in your project root:

```json
{
  "scan": {
    "accessibility": true,
    "webstandard": true,
    "securecoding": true,
    "privacy": true,
    "egovCompat": true,
    "quality": true,
    "webvuln": true
  },
  "paths": {
    "jsp": "src/main/webapp/**/*.jsp",
    "java": "src/main/java/**/*.java",
    "css": "src/main/webapp/**/*.css",
    "lib": "src/main/webapp/WEB-INF/lib"
  },
  "severity": "warning",
  "ignore": [
    "src/main/webapp/test/**"
  ],
  "cssVendorIgnore": [".min.css", "/lib/", "/vendor/", "/plugins/", "/dist/", "/ckeditor/"],
  "maxResults": 100
}
```

> **접근성 CSS 스캔:** `accessibility` 도메인은 JSP뿐 아니라 `paths.css`의 CSS 파일도 스캔해 외부 스타일시트의 초점 제거(A-25)·하드코딩 텍스트 색(A-09)을 잡습니다. 팀이 고칠 수 없는 vendor/번들/압축 CSS의 대량 오탐을 막기 위해 경로에 `cssVendorIgnore`의 조각(기본: `.min.css`·`/lib/`·`/vendor/`·`/plugins/`·`/dist/`·`/ckeditor/`)이 포함된 CSS는 스캔에서 제외합니다.

## Architecture

```
/govcheck → Skill (orchestrator) → MCP Server (static analysis) → Report + Auto-fix
```

- **Skill**: Parses options, calls MCP tools, filters false positives, generates reports
- **MCP Server**: File scanning, regex matching, HTML/JSP parsing — fast deterministic analysis
  - 점검 도구: `scan_all`(전체) · `scan_file`(단일 파일) · `scan_diff`(변경분) · `audit_keyboard`(동적) · `scan_report`(리포트 생성)
- **Report**: `scripts/lib/report.cjs` (+ `report-cli.cjs`) — 점검 결과를 Markdown/HTML 리포트로 변환
- **Agent**: Applies auto-fixes to source code with safety constraints

## Target Stack

- Java + Spring (eGovFramework)
- JSP (View)
- MyBatis/iBatis (Data Access)
- JSTL/EL (Expression)

## Detection Tiers

| Tier | Confidence | Auto-Fix |
|------|-----------|----------|
| T1 | High — regex/parsing exact match | per-rule `autoFixable` flag |
| T2 | Medium — pattern heuristic | per-rule `autoFixable` flag |
| T3 | Low — requires Claude context | Report only (manual) |

> Tier는 **탐지 신뢰도**, `autoFixable`은 **자동수정 가능 여부**로 서로 독립적이다(예: W-11 인라인 스타일은 T1이지만 안전한 자동수정이 불가능하므로 `autoFixable:false`). 또한 정적 도메인 스캐너는 **accessibility만 T1·T2를 실행**하고 나머지(webstandard/securecoding/privacy/quality/webvuln)는 **T1만** 실행한다 — 리포트의 "위반 미발견" 집계는 이 실제 실행 tier만 대상으로 한다.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add rules to `rules/*.json` or scanners to `scripts/lib/scanners/`
4. Write tests in `test/`
5. Run `npm test` to verify
6. Submit a PR

## License

MIT
