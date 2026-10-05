/**
 * Safe Arithmetic Expression Evaluator & Text Replacer for Quick Log
 *
 * Evaluates mathematical expressions (+, -, *, /, parentheses) deterministically
 * without using eval() or Function constructor.
 *
 * Handles inputs like:
 *  - "119+180+240+5+176 rs yesterday" -> "720 rs yesterday"
 *  - "227*10rs" -> "2270 rs"
 *  - "1258/3rs" -> "419.33 rs"
 *  - "100 - 20 rs" -> "80 rs"
 *  - "₹119+180+240" -> "₹ 539"
 *
 * Guarantees dates (e.g. 12/04/2026, 12/04, 2026-10-05) and times (e.g. 8-00pm)
 * are NEVER treated as mathematical expressions.
 */

export function evaluateMathExpression(expr: string): number | null {
  const clean = expr.trim();
  if (!clean) return null;

  // Tokenize numbers (integers and decimals), operators, parentheses
  const tokens = clean.match(/\d+(?:\.\d+)?|[+\-*/()]/g);
  if (!tokens || tokens.length === 0) return null;

  // Strict check: non-whitespace characters must match tokenized characters exactly
  if (tokens.join('') !== clean.replace(/\s+/g, '')) {
    return null;
  }

  // Expression must contain at least one arithmetic operator
  const hasOperator = tokens.some(t => ['+', '-', '*', '/'].includes(t));
  if (!hasOperator) return null;

  const tokenList: string[] = tokens;
  let pos = 0;

  function parseExpression(): number {
    let result = parseTerm();
    while (pos < tokenList.length && (tokenList[pos] === '+' || tokenList[pos] === '-')) {
      const op = tokenList[pos++];
      const nextTerm = parseTerm();
      if (op === '+') result += nextTerm;
      else result -= nextTerm;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (pos < tokenList.length && (tokenList[pos] === '*' || tokenList[pos] === '/')) {
      const op = tokenList[pos++];
      const nextFactor = parseFactor();
      if (op === '*') {
        result *= nextFactor;
      } else {
        if (nextFactor === 0) throw new Error('Division by zero');
        result /= nextFactor;
      }
    }
    return result;
  }

  function parseFactor(): number {
    if (pos >= tokenList.length) throw new Error('Unexpected end of expression');
    const token = tokenList[pos++];
    if (token === '(') {
      const val = parseExpression();
      if (pos >= tokenList.length || tokenList[pos++] !== ')') {
        throw new Error('Mismatched parenthesis');
      }
      return val;
    }
    if (token === '-') {
      return -parseFactor();
    }
    if (token === '+') {
      return parseFactor();
    }
    const num = parseFloat(token);
    if (isNaN(num)) throw new Error('Invalid number: ' + token);
    return num;
  }

  try {
    const val = parseExpression();
    if (pos !== tokenList.length) return null;
    if (!Number.isFinite(val) || isNaN(val)) return null;
    return Math.round(val * 100) / 100;
  } catch {
    return null;
  }
}

const CURRENCY_REGEX_PART = 'pounds?|rupees?|rupee|dollars?|euros?|euro|yen|rs\\.?|inr|usd|eur|gbp|jpy|¥|€|£|\\$|₹';

/**
 * Replaces arithmetic expressions within a natural language prompt with their evaluated values.
 */
export function replaceMathExpressionsInText(inputText: string): string {
  let text = inputText;

  // 1. Suffix Currency: e.g. "119+180+240+5+176 rs", "227*10rs", "1258/3rs", "100-20 rs", "(100+50)*2 rs"
  const suffixRegex = new RegExp(
    `(\\b|\\()([0-9.()]+(?:\\s*[+\\-*/]\\s*[0-9.()]+)+)\\s*(${CURRENCY_REGEX_PART})\\b`,
    'gi'
  );

  text = text.replace(suffixRegex, (_match, prefix, expr, curr) => {
    const fullExpr = prefix === '(' ? `(${expr}` : expr;
    const evaluated = evaluateMathExpression(fullExpr);
    if (evaluated !== null && evaluated > 0) {
      return `${evaluated} ${curr}`;
    }
    const evaluatedSub = evaluateMathExpression(expr);
    if (evaluatedSub !== null && evaluatedSub > 0) {
      return `${prefix}${evaluatedSub} ${curr}`;
    }
    return _match;
  });

  // 2. Prefix Currency: e.g. "₹119+180+240+5+176", "₹ 227*10", "rs 1258/3", "$100+50"
  const prefixRegex = new RegExp(
    `(${CURRENCY_REGEX_PART})\\s*([0-9.()]+(?:\\s*[+\\-*/]\\s*[0-9.()]+)+)\\b`,
    'gi'
  );

  text = text.replace(prefixRegex, (_match, curr, expr) => {
    const evaluated = evaluateMathExpression(expr);
    if (evaluated !== null && evaluated > 0) {
      return `${curr} ${evaluated}`;
    }
    return _match;
  });

  // 3. Unambiguous Math Operators (+ or *) without adjacent currency:
  // e.g. "119+180+240+5+176 yesterday", "227*10 yesterday", "spent 100+50 on food"
  // Since + and * are NEVER used in dates or times, these are always math.
  const explicitOpRegex = /\b([0-9.]+(?:\s*[+\-*/]\s*[0-9.()]+)*\s*[+*]\s*[0-9.]+(?:\s*[+\-*/]\s*[0-9.()]+)*)\b/g;

  text = text.replace(explicitOpRegex, (_match, expr) => {
    const evaluated = evaluateMathExpression(expr);
    if (evaluated !== null && evaluated > 0) {
      return `${evaluated}`;
    }
    return _match;
  });

  // 4. Division (/) without adjacent currency: e.g. "1258/3 for dinner", "1258/3"
  // Must NOT match dates like "12/04/2026", "12/04", "02/08"
  const divisionRegex = /\b([0-9.]+\s*\/\s*[0-9.]+)\b/g;

  text = text.replace(divisionRegex, (_match, expr) => {
    const parts = expr.split('/').map((p: string) => parseFloat(p.trim()));
    if (parts.length === 2) {
      const [p1, p2] = parts;
      // If p1 <= 31 and p2 <= 12 and both are integers, it could be a date like 12/04 or 2/8
      if (Number.isInteger(p1) && Number.isInteger(p2) && p1 >= 1 && p1 <= 31 && p2 >= 1 && p2 <= 12) {
        return _match;
      }
    }
    const evaluated = evaluateMathExpression(expr);
    if (evaluated !== null && evaluated > 0) {
      return `${evaluated}`;
    }
    return _match;
  });

  return text;
}
