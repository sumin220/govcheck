// scripts/lib/config-loader.cjs
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  scan: {
    accessibility: true,
    webstandard: true,
    securecoding: true,
    privacy: true,
    egovCompat: true,
    quality: true,
    webvuln: true
  },
  paths: {
    jsp: 'src/main/webapp/**/*.jsp',
    java: 'src/main/java/**/*.java',
    css: 'src/main/webapp/**/*.css',
    lib: 'src/main/webapp/WEB-INF/lib'
  },
  severity: 'warning',
  ignore: [],
  // 접근성 CSS 스캔(A-09/A-25) 시 제외할 제3자/번들/압축 CSS 경로 조각.
  // 팀이 고칠 수 없는 vendor CSS의 대량 오탐이 자체 CSS의 진짜 결함을 묻지 않도록 한다.
  // 사이트 특정값이 아닌 보편적 third-party 관례 경로만 둔다. .govcheckrc.json에서 재정의 가능.
  cssVendorIgnore: ['.min.css', '/lib/', '/vendor/', '/plugins/', '/dist/', '/ckeditor/'],
  maxResults: 100
};

function loadConfig(projectRoot, overrides = {}) {
  let userConfig = {};
  const configPath = path.join(projectRoot, '.govcheckrc.json');

  try {
    if (fs.existsSync(configPath)) {
      userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (e) {
    // Invalid config — fall back to defaults
  }

  return {
    ...DEFAULTS,
    ...userConfig,
    ...overrides,
    scan: { ...DEFAULTS.scan, ...userConfig.scan, ...overrides.scan },
    paths: { ...DEFAULTS.paths, ...userConfig.paths, ...overrides.paths }
  };
}

module.exports = { loadConfig, DEFAULTS };
