# govcheck

공공기관 프로젝트 통합 점검 Claude Code Plugin

A Claude Code plugin that checks Korean government (eGovFramework) project compliance across 6 domains.

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

## 6 Compliance Domains

| Domain | Description | Rules |
|--------|-------------|-------|
| **KWCAG 2.2 웹접근성** | 한국형 웹콘텐츠 접근성 지침 2.2 | 33 items |
| **웹표준** | HTML/CSS 유효성, 시맨틱 마크업 | 10 items |
| **시큐어코딩** | 행안부 소프트웨어 개발보안 가이드 | 49 items |
| **개인정보보호** | 개인정보 노출 진단 | 9 items |
| **eGov 호환성** | 전자정부프레임워크 호환성 | 8 items |
| **GS인증 대비** | ISO 25010 기반 품질특성 | 12 items |

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
    "quality": true
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
