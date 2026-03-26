// scripts/lib/jsp-preprocessor.cjs

/**
 * Extract all EL expressions (${ }) from JSP source with line numbers.
 * Also determines whether each expression is wrapped in a <c:out value="..."> tag.
 *
 * @param {string} source - Raw JSP source text
 * @returns {Array<{expression: string, line: number, wrappedInCout: boolean}>}
 */
function extractElExpressions(source) {
  const results = [];
  const elRegex = /\$\{([^}]+)\}/g;
  let match;

  while ((match = elRegex.exec(source)) !== null) {
    const matchIndex = match.index;
    const expression = match[0]; // full "${...}" string

    // Count newlines before this position to get 1-based line number
    const beforeMatch = source.slice(0, matchIndex);
    const line = beforeMatch.split('\n').length;

    // Determine if this expression is inside a <c:out value="..."> attribute.
    // Strategy: find the line(s) containing this match position and look for
    // a <c:out ... value="..." pattern that encloses this expression.
    const lineStart = beforeMatch.lastIndexOf('\n') + 1;
    const lineEnd = source.indexOf('\n', matchIndex);
    const lineText = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);

    // Check if the line has a c:out tag whose value attribute contains this expression
    const coutPattern = /<c:out\s[^>]*value\s*=\s*["'][^"']*\$\{[^}]+\}[^"']*["']/i;
    const wrappedInCout = coutPattern.test(lineText);

    results.push({ expression, line, wrappedInCout });
  }

  return results;
}

/**
 * Preprocess a JSP file:
 * 1. Extracts EL expressions with metadata before stripping
 * 2. Strips <%@ ... %> directive tags
 * 3. Strips <%= ... %> expression tags
 * 4. Strips <% ... %> scriptlet tags (including multi-line)
 * 5. Preserves JSTL tags intact
 *
 * @param {string} source - Raw JSP source text
 * @returns {{ html: string, elExpressions: Array<{expression: string, line: number, wrappedInCout: boolean}> }}
 */
function preprocessJsp(source) {
  // Extract EL expressions from the original source (before any stripping)
  const elExpressions = extractElExpressions(source);

  let html = source;

  // Strip <%@ ... %> directives (must come before general <% %> stripping)
  html = html.replace(/<%@[\s\S]*?%>/g, '');

  // Strip <%= ... %> expression tags
  html = html.replace(/<%=[\s\S]*?%>/g, '');

  // Strip <% ... %> scriptlet tags (including multi-line)
  html = html.replace(/<%[\s\S]*?%>/g, '');

  return { html, elExpressions };
}

module.exports = { preprocessJsp, extractElExpressions };
