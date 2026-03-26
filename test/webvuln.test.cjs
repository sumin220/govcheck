// test/webvuln.test.cjs
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { scanWebvuln } = require('../scripts/lib/scanners/webvuln.cjs');
const { loadRules } = require('../scripts/lib/rules-loader.cjs');

describe('scan_webvuln', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const rulesDir = path.join(__dirname, '..', 'rules');
  const rules = loadRules(rulesDir).webvuln;

  const badWebXml = path.join(fixturesDir, 'sample-web.xml');
  const goodWebXml = path.join(fixturesDir, 'sample-good-web.xml');

  // Helper: create a temporary file with given content and extension
  function createTempFile(content, ext) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'govcheck-webvuln-'));
    const tmpFile = path.join(tmpDir, `test${ext}`);
    fs.writeFileSync(tmpFile, content, 'utf-8');
    return tmpFile;
  }

  // Helper: cleanup temp file
  function cleanupTempFile(filePath) {
    try {
      fs.rmSync(path.dirname(filePath), { recursive: true });
    } catch (e) { /* ignore */ }
  }

  it('V-01: detects SSI injection in JSP', async () => {
    const tmpFile = createTempFile(
      '<html>\n<!--#exec cmd="ls" -->\n<!--#include virtual="/etc/passwd" -->\n</html>',
      '.jsp'
    );
    try {
      const results = await scanWebvuln(tmpFile, rules);
      const v = results.filter(v => v.id === 'V-01');
      assert.ok(v.length > 0, 'Expected V-01 SSI injection violation');
    } finally {
      cleanupTempFile(tmpFile);
    }
  });

  it('V-02: detects directory indexing in bad web.xml', async () => {
    const results = await scanWebvuln(badWebXml, rules);
    const v = results.filter(v => v.id === 'V-02');
    assert.ok(v.length > 0, 'Expected V-02 directory indexing violation');
  });

  it('V-03: detects missing error page in bad web.xml', async () => {
    const results = await scanWebvuln(badWebXml, rules);
    const v = results.filter(v => v.id === 'V-03');
    assert.ok(v.length > 0, 'Expected V-03 missing error page violation');
  });

  it('V-07: detects missing session timeout in bad web.xml', async () => {
    const results = await scanWebvuln(badWebXml, rules);
    const v = results.filter(v => v.id === 'V-07');
    assert.ok(v.length > 0, 'Expected V-07 missing session timeout violation');
  });

  it('V-07: detects excessive session timeout (>30 min)', async () => {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<web-app>
  <session-config>
    <session-timeout>60</session-timeout>
  </session-config>
  <error-page><error-code>404</error-code><location>/404.jsp</location></error-page>
  <error-page><error-code>500</error-code><location>/500.jsp</location></error-page>
  <servlet><servlet-name>default</servlet-name>
    <init-param><param-name>listings</param-name><param-value>false</param-value></init-param>
  </servlet>
  <security-constraint>
    <user-data-constraint><transport-guarantee>CONFIDENTIAL</transport-guarantee></user-data-constraint>
  </security-constraint>
</web-app>`;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'govcheck-webvuln-'));
    const tmpFile = path.join(tmpDir, 'web.xml');
    fs.writeFileSync(tmpFile, content, 'utf-8');
    try {
      const results = await scanWebvuln(tmpFile, rules);
      const v = results.filter(v => v.id === 'V-07');
      assert.ok(v.length > 0, 'Expected V-07 excessive session timeout violation');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('V-10: detects file download vulnerability', async () => {
    const tmpFile = createTempFile(
      'public void download() {\n  File f = new File(basePath + request.getParameter("file"));\n}',
      '.java'
    );
    try {
      const results = await scanWebvuln(tmpFile, rules);
      const v = results.filter(v => v.id === 'V-10');
      assert.ok(v.length > 0, 'Expected V-10 file download vulnerability');
    } finally {
      cleanupTempFile(tmpFile);
    }
  });

  it('V-11: detects admin page URL pattern in web.xml', async () => {
    const results = await scanWebvuln(badWebXml, rules);
    const v = results.filter(v => v.id === 'V-11');
    assert.ok(v.length > 0, 'Expected V-11 admin page exposure violation');
  });

  it('V-13: detects cookie without SameSite', async () => {
    const tmpFile = createTempFile(
      'public void setCookie() {\n  Cookie cookie = new Cookie("session", value);\n  response.addCookie(cookie);\n}',
      '.java'
    );
    try {
      const results = await scanWebvuln(tmpFile, rules);
      const v = results.filter(v => v.id === 'V-13');
      assert.ok(v.length > 0, 'Expected V-13 cookie without SameSite violation');
    } finally {
      cleanupTempFile(tmpFile);
    }
  });

  it('V-15: detects Spring Security permitAll on sensitive path', async () => {
    const tmpFile = createTempFile(
      'http.authorizeRequests()\n  .antMatchers("/api/admin/**").permitAll()\n  .anyRequest().authenticated();',
      '.java'
    );
    try {
      const results = await scanWebvuln(tmpFile, rules);
      const v = results.filter(v => v.id === 'V-15');
      assert.ok(v.length > 0, 'Expected V-15 permitAll violation');
    } finally {
      cleanupTempFile(tmpFile);
    }
  });

  it('V-16: detects SSRF pattern', async () => {
    const tmpFile = createTempFile(
      'public void fetch() {\n  URL url = new URL(request.getParameter("url"));\n  url.openConnection();\n}',
      '.java'
    );
    try {
      const results = await scanWebvuln(tmpFile, rules);
      const v = results.filter(v => v.id === 'V-16');
      assert.ok(v.length > 0, 'Expected V-16 SSRF violation');
    } finally {
      cleanupTempFile(tmpFile);
    }
  });

  it('V-22: detects CSRF disabled', async () => {
    const tmpFile = createTempFile(
      '@Override\nprotected void configure(HttpSecurity http) {\n  http.csrf().disable();\n}',
      '.java'
    );
    try {
      const results = await scanWebvuln(tmpFile, rules);
      const v = results.filter(v => v.id === 'V-22');
      assert.ok(v.length > 0, 'Expected V-22 CSRF disabled violation');
    } finally {
      cleanupTempFile(tmpFile);
    }
  });

  it('V-22: detects lambda-style CSRF disable', async () => {
    const tmpFile = createTempFile(
      'http.csrf(csrf -> csrf.disable());',
      '.java'
    );
    try {
      const results = await scanWebvuln(tmpFile, rules);
      const v = results.filter(v => v.id === 'V-22');
      assert.ok(v.length > 0, 'Expected V-22 lambda CSRF disabled violation');
    } finally {
      cleanupTempFile(tmpFile);
    }
  });

  it('good web.xml has no violations', async () => {
    const results = await scanWebvuln(goodWebXml, rules);
    assert.strictEqual(results.length, 0, `Expected 0 violations but got: ${results.map(v => v.id).join(', ')}`);
  });

  it('violation has correct schema', async () => {
    const results = await scanWebvuln(badWebXml, rules);
    assert.ok(results.length > 0, 'Need at least one violation to check schema');
    const v = results[0];
    assert.ok(v.id, 'id is required');
    assert.ok(v.title, 'title is required');
    assert.ok(v.severity, 'severity is required');
    assert.ok(v.file, 'file is required');
    assert.ok(typeof v.line === 'number', 'line must be a number');
    assert.ok(typeof v.code === 'string', 'code must be a string');
    assert.ok(typeof v.autoFixable === 'boolean', 'autoFixable must be boolean');
    assert.ok(['high', 'medium', 'low'].includes(v.confidence), 'confidence must be high/medium/low');
  });
});
