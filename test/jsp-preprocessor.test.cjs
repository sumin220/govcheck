// test/jsp-preprocessor.test.cjs
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { preprocessJsp, extractElExpressions } = require('../scripts/lib/jsp-preprocessor.cjs');

describe('jsp-preprocessor', () => {
  it('strips scriptlet tags', () => {
    const input = '<div><% String x = "hello"; %><p>text</p></div>';
    const result = preprocessJsp(input);
    assert.ok(!result.html.includes('<%'));
    assert.ok(result.html.includes('<p>text</p>'));
  });

  it('strips directive tags', () => {
    const input = '<%@ page contentType="text/html" %><html><body></body></html>';
    const result = preprocessJsp(input);
    assert.ok(!result.html.includes('<%@'));
    assert.ok(result.html.includes('<html>'));
  });

  it('preserves JSTL tags as custom elements', () => {
    const input = '<c:out value="${name}" />';
    const result = preprocessJsp(input);
    assert.ok(result.html.includes('c:out') || result.html.includes('c-out'));
  });

  it('extracts EL expressions with line numbers', () => {
    const input = 'line1\n${user.name}\nline3\n${board.title}';
    const expressions = extractElExpressions(input);
    assert.strictEqual(expressions.length, 2);
    assert.strictEqual(expressions[0].expression, '${user.name}');
    assert.strictEqual(expressions[0].line, 2);
    assert.strictEqual(expressions[1].expression, '${board.title}');
    assert.strictEqual(expressions[1].line, 4);
  });

  it('distinguishes bare EL from c:out wrapped EL', () => {
    const input = '<p>${bare}</p>\n<p><c:out value="${safe}" /></p>';
    const expressions = extractElExpressions(input);
    const bare = expressions.filter(e => !e.wrappedInCout);
    assert.strictEqual(bare.length, 1);
    assert.strictEqual(bare[0].expression, '${bare}');
  });
});
