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
/govcheck-diff --staged                  # staged 변경분만
/govcheck-diff --committed               # 마지막 커밋 변경분
```

## 7 Compliance Domains

| Domain | Description | Rules |
|--------|-------------|-------|
| **KWCAG 2.2 웹접근성** | 한국형 웹콘텐츠 접근성 지침 2.2 | 45 rules (33 항목) |
| **웹표준** | HTML/CSS 유효성, 시맨틱 마크업 | 10 items |
| **시큐어코딩** | 행안부 소프트웨어 개발보안 가이드 | 49 items |
| **개인정보보호** | 개인정보 노출 진단 | 9 items |
| **eGov 호환성** | 전자정부프레임워크 호환성 | 8 items |
| **GS인증 대비** | ISO 25010 기반 품질특성 | 12 items |
| **웹취약점** | KISA 주요정보통신기반시설 + OWASP Top 10 | 22 items |

## KWCAG 2.2 규칙 (45 rules)

KWCAG 2.2 표준 33개 검사항목을 45개 정적 규칙으로 점검합니다. 아래는 실제 웹접근성 전문가 심사(서울갤러리 1·2차 심사, 2026-05~06, WebWatch)에서 지적된 패턴을 반영해 추가·보정한 규칙입니다.

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

### 보정 규칙

| ID | 변경 | 사유 |
|----|------|------|
| A-09 | 명도대비 색상 패턴에 `(?<![\w-])` 경계 추가 | `background-color`·`border-color`·`outline-color` 오탐 제거 |
| A-25 | T3(claude) → T2(regex) 승격, `outline:none`/`0` 탐지 | 초점 표시 제거는 정적으로 신뢰성 있게 탐지 가능 |
| A-40 | T1 → T3(수동 점검) 강등 | 카드형 `a`의 `display`는 외부 CSS 클래스에 정의돼 단일 파일 정적 판정 불가 (실측 100% 오탐) |

> **설계 원칙:** 모든 신규 규칙은 2개 독립 분석(coverage-maximizer vs false-positive skeptic) + 실프로젝트 오탐 실측을 거쳐, **단일 파일 정적 분석으로 신뢰성 있게 탐지되는 것만** 채택했습니다. 외부 CSS·크로스파일(JSP include/Tiles)·런타임 상태·계산값(명도 대비)에 의존하는 항목은 T3(수동 점검)로 분류하거나 제외합니다. 중복 id(KWCAG 32)는 웹표준 스캐너 W-07이 담당하여 도메인 간 중복을 피합니다. regex 계열 규칙은 JSP/HTML **주석 내부를 마스킹**(오프셋 보존)하고 스캔하여 주석 처리된 옛 마크업 오탐을 방지합니다.

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
  "maxResults": 100
}
```

## Architecture

```
/govcheck → Skill (orchestrator) → MCP Server (static analysis) → Report + Auto-fix
```

- **Skill**: Parses options, calls MCP tools, filters false positives, generates reports
- **MCP Server**: File scanning, regex matching, HTML/JSP parsing — fast deterministic analysis
- **Agent**: Applies auto-fixes to source code with safety constraints

## Target Stack

- Java + Spring (eGovFramework)
- JSP (View)
- MyBatis/iBatis (Data Access)
- JSTL/EL (Expression)

## Detection Tiers

| Tier | Confidence | Auto-Fix |
|------|-----------|----------|
| T1 | High — regex/parsing exact match | Yes |
| T2 | Medium — pattern heuristic | Conditional |
| T3 | Low — requires Claude context | Report only |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add rules to `rules/*.json` or scanners to `scripts/lib/scanners/`
4. Write tests in `test/`
5. Run `npm test` to verify
6. Submit a PR

## License

MIT
