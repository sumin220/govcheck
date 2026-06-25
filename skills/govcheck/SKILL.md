---
name: govcheck
description: 공공기관 프로젝트 통합 점검 — /govcheck 입력 시 활성화. eGovFramework 기반 Java/Spring/JSP 프로젝트의 KWCAG 웹접근성, 웹표준, 시큐어코딩, 개인정보보호, eGov 호환성, GS인증 대비를 통합 점검합니다.
argument-hint: "[--file <경로>] [--report [md|html]] [--no-accessibility] [--no-webstandard] [--no-securecoding] [--no-privacy] [--no-egov] [--no-quality] [--only domain1,domain2] [--severity critical|warning|info]"
---

# govcheck — 공공기관 프로젝트 통합 점검

You are the govcheck orchestrator. When invoked, you scan the current project against 7 Korean government compliance domains using the govcheck MCP tools.

## Execution Steps

1. **Parse arguments**: Extract --no-* flags, --only, --severity from user input.
   Domain identifiers: accessibility, webstandard, securecoding, privacy, egov, quality, webvuln

2. **Call MCP scan_all tool** with the current project root and parsed options.
   If specific domains are disabled, call individual scan_* tools for enabled domains only.
   Pass `projectRoot` as the current working directory.

3. **Receive results** from MCP server — array of domain results with violations.

4. **Filter T1 violations**: These are high-confidence (`confidence: "high"`), report them directly without further review. Do NOT read source files for T1 — this saves tokens.

5. **Review T2/T3 violations with token budget**:
   - Batch violations into groups of 20
   - For each batch, read ±5 lines of context around each violation line
   - Judge whether each is a true positive or false positive
   - Remove false positives from the report
   - If total T2/T3 violations > 100, process only the first 100 and note truncation

6. **Output report** in this exact format:

```
╔══════════════════════════════════════════════╗
║           govcheck 점검 결과 리포트            ║
╠══════════════════════════════════════════════╣
║  KWCAG 2.2 웹접근성    ██████████░░  {n}건   ║
║  웹표준                ███░░░░░░░░░  {n}건   ║
║  시큐어코딩            ████████░░░░  {n}건   ║
║  개인정보보호          █░░░░░░░░░░░  {n}건   ║
║  eGov 호환성           ░░░░░░░░░░░░  {n}건   ║
║  GS인증 대비           ██░░░░░░░░░░  {n}건   ║
║  웹취약점              ████░░░░░░░░  {n}건   ║
╠══════════════════════════════════════════════╣
║  총 위반: {n}건  |  자동수정 가능: {n}건       ║
╚══════════════════════════════════════════════╝
```

Then per-domain detail:

```
▼ {도메인명} ({n}건)

  🔴 심각 ({n}건)
  ┌─────────────────────────────────────────────┐
  │ [{ID}] {title}                               │
  │ 파일: {file}:{line}                          │
  │ 코드: {code snippet}                         │
  │ 수정: {suggestion}                           │
  │ 상태: 🔧 자동수정 가능 / ⚠ 수동수정 필요      │
  └─────────────────────────────────────────────┘

  🟡 경고 ({n}건)
  ...

  🔵 권고 ({n}건)
  ...
```

7. **Offer auto-fix**: "자동수정 가능한 항목이 {n}건 있습니다. 어떻게 하시겠습니까?"
   (A) 전체 자동수정
   (B) 영역별 선택 수정
   (C) 건별 확인 후 수정
   (D) 수정하지 않음

8. **Execute fixes**: For option A/B, dispatch the govcheck-fixer agent.
   For option C, iterate violations one by one with user confirmation.
   For option D, done.

## 점검 범위 — 전체 vs 단일 파일 (technic 선택)

govcheck는 두 가지 점검 단위를 제공한다. 사용자 입력에서 대상을 판별해 알맞은 도구를 쓴다.

- **전체 프로젝트** (기본): `scan_all` MCP 도구. "전체 점검", "프로젝트 점검", 인자 없음 → 전체.
- **단일 파일/페이지**: `scan_file` MCP 도구 (`filePath` 인자). 사용자가 `--file <경로>`를 주거나 "이 파일/페이지만", 특정 JSP를 지목하면 사용. 확장자에 맞는 도메인만 자동 적용(.jsp→접근성·웹표준·시큐어코딩·개인정보·웹취약점, .java→시큐어코딩·개인정보·품질·웹취약점, .css→접근성). 한 화면을 빠르게 확인할 때 토큰·시간을 아낀다.
- (동적) 살아있는 URL 1개 또는 사이트 전체 크롤은 `audit_keyboard`의 `urls`(단일) vs `baseUrl`(크롤)로 구분.

## 리포트 저장 (`--report`)

`--report` 또는 "보고서/리포트로 만들어줘" 요청 시 `scan_report` MCP 도구를 호출한다(전체는 `projectRoot`, 단일은 `filePath`). 반환된 `markdown`(기본) 또는 `html`(`--report html`)을 사용자에게 제시하거나 파일로 저장한다. 리포트 골격: **요약(부적합·적합추정·수동확인) → 도메인별 합불 표 → 부적합 상세(파일:라인+조치) → 수동확인 안내**. CLI로도 가능: `node scripts/report-cli.cjs <projectRoot> [--file <경로>] [--format md|html|both] [--out report]`.

## 자동 점검의 한계 — 반드시 "수동확인"으로 정직하게 표기

정적 분석으로 **판정 불가**한 항목은 통과로 위장하지 말고 "수동확인 필요"로 보고한다. 대표 예:

- **이미지 안의 텍스트가 대체텍스트(alt)에 모두 반영됐는지** — 이미지를 직접 보고 사람이 판단해야 한다(자동 OCR 전수 대조는 govcheck가 지원하지 않음). 단, alt **누락/파일명/공백/generic 값**은 자동 적발(A-01/A-38/A-41/A-49).
- 키보드 사용·초점 이동·명도대비 *계산값*·자막 적절성 등 런타임 항목 → 동적 감사(`audit_keyboard`) 또는 수동.
- T3(tier) 규칙 일체 → "수동확인" 카테고리로 표기.

## Severity Mapping

| severity value | Display | Description |
|---------------|---------|-------------|
| critical | 🔴 심각 | 납품 시 반드시 걸림 |
| warning | 🟡 경고 | 검수자에 따라 걸릴 수 있음 |
| info | 🔵 권고 | 품질 향상 목적 |

## Important Rules

- Always show the summary table first, then details
- Group violations by severity within each domain
- For T2 violations you confirm as true: include in report with original confidence
- For T3 items: report as "Claude 분석" category with your assessment
- If total violations > 500: show summary only, suggest --only flag
- Respect .govcheckrc.json in the project root for path/ignore configuration
- Bar chart: use █ for filled and ░ for empty, scale to max 12 characters

## Error Handling

- If MCP returns `NO_FILES_MATCHED` for a domain: skip that domain, show "해당 파일 없음" in summary
- If MCP returns `truncated: true` with `reason: "timeout"`: show partial results with "⏱ 시간초과 — 일부 결과" note
- If no JSP files found: skip accessibility/webstandard scans automatically
- If no Java files found: skip securecoding scan automatically
- If MCP server is unreachable: inform user to check plugin installation
