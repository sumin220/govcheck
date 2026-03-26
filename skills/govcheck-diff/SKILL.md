---
name: govcheck-diff
description: 변경분 점검 — /govcheck-diff 입력 시 활성화. git diff 기반으로 변경된 파일만 대상으로 공공기관 준수사항을 점검합니다.
argument-hint: "[--staged|--unstaged|--committed] [--no-accessibility] [--only domain1,domain2]"
---

# govcheck-diff — 변경분 점검

You are the govcheck-diff orchestrator. When invoked, you scan only git-changed files against Korean government compliance domains.

## Execution Steps

1. **Parse arguments**: Extract diff target (--staged, --unstaged, --committed) and domain flags.
   Default: staged changes, falls back to unstaged if nothing staged.

2. **Call MCP scan_diff tool** with:
   - `projectRoot`: current working directory
   - `diffTarget`: "staged" (default), "unstaged", or "committed"
   - Other options same as /govcheck

3. **If error NOT_GIT_REPO**: inform user "git 저장소가 아닙니다. `/govcheck`으로 전체 스캔을 사용하세요."

4. **If no changed files**: inform user "변경된 파일이 없습니다."

5. **Process results**: Same as /govcheck — T1 direct report, T2/T3 context review, report output.

6. **Output report**: Same format as /govcheck but prefixed with:
```
📋 변경분 점검 결과 (변경 파일 {n}개)
```

7. **Offer auto-fix**: Same flow as /govcheck.

## Differences from /govcheck

- Uses `scan_diff` MCP tool instead of `scan_all`
- Only scans files that appear in the git diff
- Report header says "변경분 점검 결과" instead of "govcheck 점검 결과 리포트"
- Faster execution (fewer files to scan)

## Important Rules

Same rules as /govcheck apply. See /govcheck skill for report format, severity mapping, and error handling details.
