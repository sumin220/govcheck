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
    quality: true
  },
  paths: {
    jsp: 'src/main/webapp/**/*.jsp',
    java: 'src/main/java/**/*.java',
    css: 'src/main/webapp/**/*.css',
    lib: 'src/main/webapp/WEB-INF/lib'
  },
  severity: 'warning',
  ignore: [],
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
