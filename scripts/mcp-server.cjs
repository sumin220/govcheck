// scripts/mcp-server.cjs
'use strict';

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { loadConfig } = require('./lib/config-loader.cjs');
const { loadRules } = require('./lib/rules-loader.cjs');
const { scanFiles } = require('./lib/scanner.cjs');
const { getChangedFiles } = require('./lib/git-diff.cjs');
const { scanAccessibility } = require('./lib/scanners/accessibility.cjs');
const { scanWebstandard } = require('./lib/scanners/webstandard.cjs');
const { scanSecurecoding } = require('./lib/scanners/securecoding.cjs');
const { scanPrivacy } = require('./lib/scanners/privacy.cjs');
const { scanEgovCompat } = require('./lib/scanners/egov-compat.cjs');
const { scanQuality } = require('./lib/scanners/quality.cjs');
const { scanWebvuln } = require('./lib/scanners/webvuln.cjs');
const { runKeyboardAudit } = require('./lib/dynamic/keyboard-audit.cjs');
const fs = require('node:fs');
const path = require('node:path');

// Resolve the types module from the SDK's CJS dist
const sdkServerPath = require.resolve('@modelcontextprotocol/sdk/server/index.js');
const sdkTypesPath = path.join(path.dirname(sdkServerPath), '..', 'types.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require(sdkTypesPath);

/**
 * Domain scanner configuration mapping.
 * Each entry maps a domain name to its scanner function, rule key, and file pattern.
 */
const DOMAIN_SCANNERS = {
  accessibility: { scanner: scanAccessibility, ruleKey: 'kwcag22', filePattern: 'jsp' },
  webstandard: { scanner: scanWebstandard, ruleKey: 'webstandard', filePattern: 'jsp' },
  securecoding: { scanner: scanSecurecoding, ruleKey: 'securecoding49', filePattern: 'java' },
  privacy: { scanner: scanPrivacy, ruleKey: 'privacy', filePattern: 'java' },
  egovCompat: { scanner: scanEgovCompat, ruleKey: 'egov', filePattern: null },
  quality: { scanner: scanQuality, ruleKey: 'quality', filePattern: 'java' },
  webvuln: { scanner: scanWebvuln, ruleKey: 'webvuln', filePattern: 'java', multiFile: true }
};

/**
 * Per-domain timeout wrapper (30 seconds default).
 * Returns the promise result or rejects with TIMEOUT error.
 */
function withTimeout(promise, ms = 30000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
  ]);
}

/**
 * Scan a single domain against the given project root.
 *
 * @param {string} domainName - One of the keys in DOMAIN_SCANNERS
 * @param {object} args - { projectRoot, maxResults }
 * @returns {Promise<object>} Domain scan result
 */
async function handleScanDomain(domainName, args) {
  const startTime = Date.now();
  const config = loadConfig(args.projectRoot, { maxResults: args.maxResults });
  const rulesDir = path.join(__dirname, '..', 'rules');
  const rules = loadRules(rulesDir);

  const domainConfig = DOMAIN_SCANNERS[domainName];
  if (!domainConfig) {
    return {
      domain: domainName,
      scannedFiles: 0,
      elapsed: Date.now() - startTime,
      violations: [],
      truncated: false,
      totalCount: 0,
      error: 'UNKNOWN_DOMAIN'
    };
  }

  const ruleSet = rules[domainConfig.ruleKey];

  let allViolations = [];
  let scannedFiles = 0;

  try {
    if (domainConfig.filePattern === null) {
      // Project-level scanner (egovCompat)
      allViolations = await withTimeout(domainConfig.scanner(args.projectRoot, ruleSet));
      scannedFiles = 1;
    } else {
      // File-level scanner
      const pattern = config.paths[domainConfig.filePattern];
      const files = await scanFiles(args.projectRoot, pattern, config.ignore);

      let filesToScan = files;

      // securecoding and privacy also need to scan JSP files
      if (domainName === 'securecoding') {
        const jspFiles = await scanFiles(args.projectRoot, config.paths.jsp, config.ignore);
        // Merge java + jsp, dedup by absolute path
        const seen = new Set(files.map(f => f));
        const extra = jspFiles.filter(f => !seen.has(f));
        filesToScan = [...files, ...extra];
      }
      if (domainName === 'privacy') {
        const jspFiles = await scanFiles(args.projectRoot, config.paths.jsp, config.ignore);
        const seen = new Set(files.map(f => f));
        const extra = jspFiles.filter(f => !seen.has(f));
        filesToScan = [...files, ...extra];
      }
      if (domainName === 'webvuln') {
        const jspFiles = await scanFiles(args.projectRoot, config.paths.jsp, config.ignore);
        const xmlFiles = await scanFiles(args.projectRoot, 'src/main/webapp/WEB-INF/**/*.xml', config.ignore);
        const seen = new Set(files.map(f => f));
        const extra = [...jspFiles, ...xmlFiles].filter(f => !seen.has(f));
        filesToScan = [...files, ...extra];
      }

      scannedFiles = filesToScan.length;

      for (const file of filesToScan) {
        const violations = await withTimeout(domainConfig.scanner(file, ruleSet));
        allViolations.push(...violations);
      }
    }
  } catch (err) {
    if (err.message === 'TIMEOUT') {
      const maxResults = args.maxResults || config.maxResults;
      return {
        domain: domainName,
        scannedFiles,
        elapsed: Date.now() - startTime,
        violations: allViolations.slice(0, maxResults),
        truncated: true,
        totalCount: allViolations.length,
        reason: 'timeout'
      };
    }
    throw err;
  }

  const maxResults = args.maxResults || config.maxResults;
  const totalCount = allViolations.length;
  const truncated = totalCount > maxResults;
  const violations = allViolations.slice(0, maxResults);

  return {
    domain: domainName,
    scannedFiles,
    elapsed: Date.now() - startTime,
    violations,
    truncated,
    totalCount
  };
}

/**
 * Scan all enabled domains against the given project root.
 *
 * @param {object} args - { projectRoot, maxResults }
 * @returns {Promise<object>} Aggregated results from all domains
 */
async function handleScanAll(args) {
  const startTime = Date.now();
  const config = loadConfig(args.projectRoot);

  const domains = Object.keys(DOMAIN_SCANNERS).filter(d => {
    return config.scan[d] !== false;
  });

  const results = await Promise.all(
    domains.map(domain => handleScanDomain(domain, args))
  );

  return {
    results,
    totalElapsed: Date.now() - startTime
  };
}

/**
 * Scan only changed files (git diff) against the given project root.
 *
 * @param {object} args - { projectRoot, diffTarget, maxResults }
 * @returns {Promise<object>} Scan results for changed files only
 */
async function handleScanDiff(args) {
  const diffResult = getChangedFiles(args.projectRoot, args.diffTarget || 'staged');

  if (diffResult.error) {
    return { error: diffResult.error };
  }

  // Filter changed files by relevant extensions
  const relevantExts = ['.java', '.jsp', '.css', '.xml', '.properties'];
  const changedFiles = diffResult.files.filter(f =>
    relevantExts.some(ext => f.endsWith(ext))
  );

  if (changedFiles.length === 0) {
    return {
      results: Object.keys(DOMAIN_SCANNERS).map(domain => ({
        domain,
        scannedFiles: 0,
        elapsed: 0,
        violations: [],
        truncated: false,
        totalCount: 0
      })),
      totalElapsed: 0
    };
  }

  const startTime = Date.now();
  const config = loadConfig(args.projectRoot);
  const rulesDir = path.join(__dirname, '..', 'rules');
  const rules = loadRules(rulesDir);
  const maxResults = args.maxResults || config.maxResults;

  const results = [];

  for (const [domainName, domainConfig] of Object.entries(DOMAIN_SCANNERS)) {
    if (config.scan[domainName] === false) continue;

    const domainStart = Date.now();
    const ruleSet = rules[domainConfig.ruleKey];
    let allViolations = [];
    let scannedFiles = 0;

    try {
      if (domainConfig.filePattern === null) {
        // Project-level scanner — always run on the project root
        allViolations = await withTimeout(domainConfig.scanner(args.projectRoot, ruleSet));
        scannedFiles = 1;
      } else {
        // Filter changed files to those matching this domain's file types
        const extMap = { jsp: '.jsp', java: '.java', css: '.css' };
        const ext = extMap[domainConfig.filePattern];
        let domainFiles = ext ? changedFiles.filter(f => f.endsWith(ext)) : changedFiles;

        // securecoding and privacy also scan JSP files
        if (domainName === 'securecoding' || domainName === 'privacy') {
          const jspFiles = changedFiles.filter(f => f.endsWith('.jsp'));
          const seen = new Set(domainFiles);
          const extra = jspFiles.filter(f => !seen.has(f));
          domainFiles = [...domainFiles, ...extra];
        }
        // webvuln scans java, jsp, and xml files
        if (domainName === 'webvuln') {
          const extraFiles = changedFiles.filter(f => f.endsWith('.jsp') || f.endsWith('.xml'));
          const seen = new Set(domainFiles);
          const extra = extraFiles.filter(f => !seen.has(f));
          domainFiles = [...domainFiles, ...extra];
        }

        scannedFiles = domainFiles.length;

        for (const file of domainFiles) {
          const violations = await withTimeout(domainConfig.scanner(file, ruleSet));
          allViolations.push(...violations);
        }
      }
    } catch (err) {
      if (err.message === 'TIMEOUT') {
        results.push({
          domain: domainName,
          scannedFiles,
          elapsed: Date.now() - domainStart,
          violations: allViolations.slice(0, maxResults),
          truncated: true,
          totalCount: allViolations.length,
          reason: 'timeout'
        });
        continue;
      }
      throw err;
    }

    const totalCount = allViolations.length;
    const truncated = totalCount > maxResults;

    results.push({
      domain: domainName,
      scannedFiles,
      elapsed: Date.now() - domainStart,
      violations: allViolations.slice(0, maxResults),
      truncated,
      totalCount
    });
  }

  return {
    results,
    totalElapsed: Date.now() - startTime
  };
}

/**
 * MCP tool definitions for registration.
 */
const TOOL_DEFINITIONS = [
  {
    name: 'scan_accessibility',
    description: 'Scan JSP/HTML files for KWCAG 2.2 accessibility violations',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Absolute path to the project root directory' },
        maxResults: { type: 'number', description: 'Maximum number of violations to return (default: 100)' }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'scan_webstandard',
    description: 'Scan JSP/HTML files for web standard compliance violations (W3C, DOCTYPE, charset, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Absolute path to the project root directory' },
        maxResults: { type: 'number', description: 'Maximum number of violations to return (default: 100)' }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'scan_securecoding',
    description: 'Scan Java/JSP files for secure coding violations (행안부 49개 항목)',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Absolute path to the project root directory' },
        maxResults: { type: 'number', description: 'Maximum number of violations to return (default: 100)' }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'scan_privacy',
    description: 'Scan Java/JSP files for privacy violations (개인정보 노출, 주민등록번호, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Absolute path to the project root directory' },
        maxResults: { type: 'number', description: 'Maximum number of violations to return (default: 100)' }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'scan_egov_compat',
    description: 'Scan project for eGovFramework compatibility (전자정부프레임워크 호환성)',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Absolute path to the project root directory' },
        maxResults: { type: 'number', description: 'Maximum number of violations to return (default: 100)' }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'scan_quality',
    description: 'Scan Java files for code quality violations (GS인증, ISO 25010)',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Absolute path to the project root directory' },
        maxResults: { type: 'number', description: 'Maximum number of violations to return (default: 100)' }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'scan_webvuln',
    description: 'Scan Java/JSP/XML files for web vulnerabilities (KISA 28 + OWASP Top 10 + config checks)',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Absolute path to the project root directory' },
        maxResults: { type: 'number', description: 'Maximum number of violations to return (default: 100)' }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'scan_all',
    description: 'Run all enabled domain scanners against the project (accessibility, webstandard, securecoding, privacy, egovCompat, quality, webvuln)',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Absolute path to the project root directory' },
        maxResults: { type: 'number', description: 'Maximum number of violations per domain (default: 100)' }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'scan_diff',
    description: 'Scan only git-changed files across all domains (staged, unstaged, or last commit)',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string', description: 'Absolute path to the project root directory' },
        diffTarget: { type: 'string', enum: ['staged', 'unstaged', 'committed'], description: 'Which git diff to scan (default: staged)' },
        maxResults: { type: 'number', description: 'Maximum number of violations per domain (default: 100)' }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'audit_keyboard',
    description: '동적 키보드 접근성 감사 (Playwright). 살아있는 URL을 크롤하며 실제 브라우저로 Tab을 순회해, 정적 분석으로는 못 잡는 런타임 키보드 문제를 검사한다: 클릭/호버되는데 Tab 불가(K-01), 양수 tabindex(K-02), 포커스 시각표시 없음(K-03), 키보드 트랩(K-04). 소스 파일이 아니라 실행 중인 사이트를 검사하므로 baseUrl(또는 urls)이 필요하며 playwright 설치가 필요하다.',
    inputSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: '검사 시작 URL (예: https://site.go.kr/index.do). 같은 출처 링크를 크롤한다.' },
        urls: { type: 'array', items: { type: 'string' }, description: '크롤 대신 명시적으로 검사할 URL 목록 (선택)' },
        maxPages: { type: 'number', description: '크롤 최대 페이지 수 (기본 20)' },
        maxTabs: { type: 'number', description: '페이지당 Tab 최대 횟수 (기본 200)' },
        maxResults: { type: 'number', description: '반환 violation 최대 수 (기본 100)' },
        sameOriginOnly: { type: 'boolean', description: '같은 출처만 크롤 (기본 true)' }
      },
      required: []
    }
  }
];

/**
 * Map MCP tool names to domain scanner names.
 */
const TOOL_TO_DOMAIN = {
  scan_accessibility: 'accessibility',
  scan_webstandard: 'webstandard',
  scan_securecoding: 'securecoding',
  scan_privacy: 'privacy',
  scan_egov_compat: 'egovCompat',
  scan_quality: 'quality',
  scan_webvuln: 'webvuln'
};

/**
 * Load the dynamic keyboard rules (rules/keyboard-dynamic.json).
 */
function loadKeyboardRules() {
  try {
    const p = path.join(__dirname, '..', 'rules', 'keyboard-dynamic.json');
    return JSON.parse(fs.readFileSync(p, 'utf-8')).rules || [];
  } catch (e) { return []; }
}

/**
 * Handle the dynamic keyboard accessibility audit (Playwright).
 *
 * @param {object} args - { baseUrl, urls, maxPages, maxTabs, maxResults, sameOriginOnly }
 * @returns {Promise<object>} Audit result
 */
async function handleAuditKeyboard(args) {
  const startTime = Date.now();
  const maxResults = args.maxResults || 100;
  try {
    const result = await runKeyboardAudit({
      baseUrl: args.baseUrl,
      urls: args.urls,
      rules: loadKeyboardRules(),
      maxPages: args.maxPages || 20,
      maxTabs: args.maxTabs || 200,
      sameOriginOnly: args.sameOriginOnly !== false
    });
    const total = result.violations.length;
    return {
      tool: 'audit_keyboard',
      baseUrl: result.baseUrl,
      pagesScanned: result.pagesScanned,
      elapsed: Date.now() - startTime,
      perPage: result.perPage,
      violations: result.violations.slice(0, maxResults),
      truncated: total > maxResults,
      totalCount: total
    };
  } catch (e) {
    return {
      tool: 'audit_keyboard',
      error: (e && e.code) || 'AUDIT_ERROR',
      message: String(e && e.message || e),
      elapsed: Date.now() - startTime
    };
  }
}

/**
 * Handle an MCP tool call by dispatching to the appropriate handler.
 *
 * @param {string} toolName - The MCP tool name
 * @param {object} args - Tool arguments
 * @returns {Promise<object>} MCP-formatted result
 */
async function handleToolCall(toolName, args) {
  if (toolName === 'scan_all') {
    const result = await handleScanAll(args);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }

  if (toolName === 'audit_keyboard') {
    const result = await handleAuditKeyboard(args);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      isError: !!result.error
    };
  }

  if (toolName === 'scan_diff') {
    const result = await handleScanDiff(args);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }

  const domainName = TOOL_TO_DOMAIN[toolName];
  if (domainName) {
    const result = await handleScanDomain(domainName, args);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify({ error: 'UNKNOWN_TOOL', tool: toolName }) }],
    isError: true
  };
}

// Start MCP server when run directly
if (require.main === module) {
  const server = new Server(
    { name: 'govcheck', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Register tools/list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOL_DEFINITIONS };
  });

  // Register tools/call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(name, args || {});
  });

  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    process.stderr.write(`govcheck MCP server error: ${err.message}\n`);
    process.exit(1);
  });
}

// Export handlers for testing
module.exports = { handleScanAll, handleScanDomain, handleScanDiff, handleAuditKeyboard, handleToolCall, DOMAIN_SCANNERS, TOOL_DEFINITIONS };
