// test/securecoding.test.cjs
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { scanSecurecoding } = require('../scripts/lib/scanners/securecoding.cjs');
const { loadRules } = require('../scripts/lib/rules-loader.cjs');

describe('scan_securecoding', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const rulesDir = path.join(__dirname, '..', 'rules');
  const rules = loadRules(rulesDir).securecoding49;

  const badJava = path.join(fixturesDir, 'sample-bad.java');
  const goodJava = path.join(fixturesDir, 'sample-good.java');
  const badJsp  = path.join(fixturesDir, 'sample-bad.jsp');

  it('S-01: detects SQL string concatenation', async () => {
    const results = await scanSecurecoding(badJava, rules);
    const v = results.filter(v => v.id === 'S-01');
    assert.ok(v.length > 0, 'Expected S-01 violation');
  });

  it('S-02: detects bare ${} without c:out in JSP', async () => {
    const results = await scanSecurecoding(badJsp, rules);
    const v = results.filter(v => v.id === 'S-02');
    assert.ok(v.length > 0, 'Expected S-02 violation in JSP');
  });

  it('S-03: detects Runtime.exec', async () => {
    const results = await scanSecurecoding(badJava, rules);
    const v = results.filter(v => v.id === 'S-03');
    assert.ok(v.length > 0, 'Expected S-03 violation');
  });

  it('S-16: detects hardcoded password', async () => {
    const results = await scanSecurecoding(badJava, rules);
    const v = results.filter(v => v.id === 'S-16');
    assert.ok(v.length > 0, 'Expected S-16 violation');
  });

  it('S-17: detects weak crypto (MD5)', async () => {
    const results = await scanSecurecoding(badJava, rules);
    const v = results.filter(v => v.id === 'S-17');
    assert.ok(v.length > 0, 'Expected S-17 violation');
  });

  it('S-34: detects empty catch block', async () => {
    const results = await scanSecurecoding(badJava, rules);
    const v = results.filter(v => v.id === 'S-34');
    assert.ok(v.length > 0, 'Expected S-34 violation');
  });

  it('S-35: detects printStackTrace', async () => {
    const results = await scanSecurecoding(badJava, rules);
    const v = results.filter(v => v.id === 'S-35');
    assert.ok(v.length > 0, 'Expected S-35 violation');
  });

  it('S-44: detects public field', async () => {
    const results = await scanSecurecoding(badJava, rules);
    const v = results.filter(v => v.id === 'S-44');
    assert.ok(v.length > 0, 'Expected S-44 violation');
  });

  it('S-48: detects System.exit', async () => {
    const results = await scanSecurecoding(badJava, rules);
    const v = results.filter(v => v.id === 'S-48');
    assert.ok(v.length > 0, 'Expected S-48 violation');
  });

  it('S-49: detects String == comparison', async () => {
    const results = await scanSecurecoding(badJava, rules);
    const v = results.filter(v => v.id === 'S-49');
    assert.ok(v.length > 0, 'Expected S-49 violation');
  });

  it('good Java file returns 0 violations', async () => {
    const results = await scanSecurecoding(goodJava, rules);
    assert.strictEqual(results.length, 0, `Expected 0 violations but got: ${results.map(v => v.id).join(', ')}`);
  });

  it('violation has correct schema', async () => {
    const results = await scanSecurecoding(badJava, rules);
    assert.ok(results.length > 0, 'Need at least one violation to check schema');
    const v = results[0];
    assert.ok(v.id, 'id is required');
    assert.ok(v.title, 'title is required');
    assert.ok(v.severity, 'severity is required');
    assert.ok(v.file, 'file is required');
    assert.ok(typeof v.line === 'number', 'line must be a number');
    assert.ok(v.code, 'code is required');
    assert.ok(typeof v.autoFixable === 'boolean', 'autoFixable must be boolean');
    assert.ok(['high', 'medium', 'low'].includes(v.confidence), 'confidence must be high/medium/low');
  });
});
