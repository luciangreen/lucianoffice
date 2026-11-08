// Prolog terms for the Office core: build, print, parse and compare them.
//   variable  { v: 'X' }
//   number    190
//   atom      { f: 'socrates', args: [] }
//   compound  { f: 'man', args: [term, ...] }
// A clause is { head, body } with body null for a fact.

export const v = (name) => ({ v: name });
export const t = (f, ...args) => ({ f, args });
export const atom = (name) => ({ f: name, args: [] });
export const isVar = (x) => x !== null && typeof x === 'object' && 'v' in x;
export const isNum = (x) => typeof x === 'number';
export const isAtom = (x) => x !== null && typeof x === 'object' && 'f' in x && x.args.length === 0;

// Right-nested conjunction of a list of goals (null for none).
export function conj(goals) {
  if (!goals.length) return null;
  return goals.slice(0, -1).reduceRight((rest, g) => t(',', g, rest), goals[goals.length - 1]);
}
export function unconj(body) {
  if (!body) return [];
  return body.f === ',' && body.args.length === 2 ? [body.args[0], ...unconj(body.args[1])] : [body];
}

// ------------------------------------------------------------------ printing
const OPS = {
  ':-': [1200, 'xfx'], ';': [1100, 'xfy'], '->': [1050, 'xfy'], ',': [1000, 'xfy'], '\\+': [900, 'fy'],
  '=': [700, 'xfx'], '\\=': [700, 'xfx'], '==': [700, 'xfx'], '\\==': [700, 'xfx'], is: [700, 'xfx'],
  '<': [700, 'xfx'], '>': [700, 'xfx'], '=<': [700, 'xfx'], '>=': [700, 'xfx'], '=:=': [700, 'xfx'], '=\\=': [700, 'xfx'],
  '+': [500, 'yfx'], '-': [500, 'yfx'], '*': [400, 'yfx'], '/': [400, 'yfx'], '//': [400, 'yfx'], mod: [400, 'yfx']
};

export function atomText(name) {
  if (/^[a-z][a-zA-Z0-9_]*$/.test(name) || name === '[]' || /^[+\-*/\\^<>=~:.?@#&$]+$/.test(name) || name === '!' || name === ';' || name === ',') {
    return name === ',' ? "','" : name;
  }
  return `'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function show(x, prec = 1200) {
  if (isVar(x)) return x.v;
  if (isNum(x)) return x < 0 && prec < 999 ? `(${x})` : String(x);
  if (x.f === '[|]' && x.args.length === 2) return showList(x);
  if (!x.args.length) return atomText(x.f);
  const op = OPS[x.f];
  if (op && x.args.length === 2 && op[1] !== 'fy') {
    const [p, type] = op;
    const lp = type === 'yfx' ? p : p - 1;
    const rp = type === 'xfy' ? p : p - 1;
    const sep = x.f === ',' ? ', ' : ` ${x.f} `;
    const s = `${show(x.args[0], lp)}${sep}${show(x.args[1], rp)}`;
    return p > prec ? `(${s})` : s;
  }
  if (op && x.args.length === 1 && op[1] === 'fy') {
    const s = `${x.f} ${show(x.args[0], op[0])}`;
    return op[0] > prec ? `(${s})` : s;
  }
  return `${atomText(x.f)}(${x.args.map((a) => show(a, 999)).join(', ')})`;
}

function showList(x) {
  const items = [];
  let cur = x;
  while (cur && cur.f === '[|]' && cur.args.length === 2) { items.push(show(cur.args[0], 999)); cur = cur.args[1]; }
  const tail = cur && cur.f === '[]' && !cur.args.length ? '' : `|${show(cur, 999)}`;
  return `[${items.join(', ')}${tail}]`;
}

export function showClause(c) {
  return c.body ? `${show(c.head, 1199)} :-\n    ${unconj(c.body).map((g) => show(g, 999)).join(',\n    ')}.` : `${show(c.head, 1199)}.`;
}
export const showProgram = (clauses) => clauses.map(showClause).join('\n');

// ------------------------------------------------------------------ comparing
// Variables renamed in order of first appearance, so alpha-equivalent clauses match.
export function canonical(c) {
  const names = new Map();
  const ren = (x) => {
    if (isVar(x)) {
      if (x.v === '_') return v(`_G${names.size + 1000}`);
      if (!names.has(x.v)) names.set(x.v, `_V${names.size}`);
      return v(names.get(x.v));
    }
    if (isNum(x)) return x;
    return { f: x.f, args: x.args.map(ren) };
  };
  return showClause({ head: ren(c.head), body: c.body ? ren(c.body) : null });
}
export const sameProgram = (a, b) => a.length === b.length && a.every((c, i) => canonical(c) === canonical(b[i]));

export function vars(x, out = new Set()) {
  if (isVar(x)) out.add(x.v);
  else if (!isNum(x) && x) x.args.forEach((a) => vars(a, out));
  return out;
}

// ------------------------------------------------------------------ parsing
// Enough of Prolog's syntax to read back clauses written by SWI-Prolog's
// portray_clause (as mnns writes them): operators, lists, quoted atoms, numbers.
function tokens(text) {
  const out = [];
  const re = /\s+|%[^\n]*|\/\*[\s\S]*?\*\/|(\d+\.\d+(?:[eE][-+]?\d+)?|\d+)|([A-Z_][A-Za-z0-9_]*)|([a-z][A-Za-z0-9_]*)|'((?:[^'\\]|\\.|'')*)'|("(?:[^"\\]|\\.)*")|([()[\]{},|!;])|([+\-*/\\^<>=~:.?@#&$]+)/y;
  let m;
  re.lastIndex = 0;
  while (re.lastIndex < text.length) {
    const at = re.lastIndex;
    m = re.exec(text);
    if (!m) throw new SyntaxError(`cannot read Prolog near "${text.slice(at, at + 20)}"`);
    if (m[1] !== undefined) out.push({ k: 'num', s: m[1] });
    else if (m[2] !== undefined) out.push({ k: 'var', s: m[2] });
    else if (m[3] !== undefined) out.push({ k: 'atom', s: m[3] });
    else if (m[4] !== undefined) out.push({ k: 'atom', s: m[4].replace(/''/g, "'").replace(/\\(.)/g, '$1'), q: true });
    else if (m[5] !== undefined) out.push({ k: 'atom', s: m[5].slice(1, -1), q: true });
    else if (m[6] !== undefined) out.push({ k: 'punct', s: m[6] });
    else if (m[7] !== undefined) {
      if (m[7] === '.' && (re.lastIndex >= text.length || /\s|%/.test(text[re.lastIndex]))) out.push({ k: 'end', s: '.' });
      else out.push({ k: 'atom', s: m[7], sym: true });
    }
    // whitespace and comments produce no token; mark a following "(" as not a call
    if (!m[1] && !m[2] && !m[3] && !m[4] && !m[5] && !m[6] && !m[7] && out.length) out[out.length - 1].space = true;
  }
  return out;
}

export function parseProgram(text) {
  const ts = tokens(text);
  let i = 0;
  const peek = () => ts[i];
  const next = () => ts[i++];
  const expect = (s) => { const k = next(); if (!k || k.s !== s) throw new SyntaxError(`expected "${s}"`); };
  const varMaps = [];
  let names;

  const infix = (tok) => tok && (tok.k === 'atom' || (tok.k === 'punct' && (tok.s === ',' || tok.s === ';' || tok.s === '|'))) && OPS[tok.s === '|' ? ';' : tok.s];

  function parse(max) {
    let left = primary(max);
    for (;;) {
      const tok = peek();
      const op = infix(tok);
      if (!op || op[1] === 'fy') break;
      const [p, type] = op;
      if (p > max) break;
      next();
      const right = parse(type === 'xfy' ? p : p - 1);
      left = t(tok.s === '|' ? ';' : tok.s, left, right);
    }
    return left;
  }

  function primary(max) {
    const tok = next();
    if (!tok) throw new SyntaxError('unexpected end of clause');
    if (tok.k === 'num') return Number(tok.s);
    if (tok.k === 'var') {
      if (tok.s === '_') return v('_');
      if (!names.has(tok.s)) names.set(tok.s, v(tok.s));
      return names.get(tok.s);
    }
    if (tok.k === 'punct' && tok.s === '(') { const x = parse(1200); expect(')'); return x; }
    if (tok.k === 'punct' && tok.s === '[') {
      if (peek()?.s === ']') { next(); return atom('[]'); }
      const items = [parse(999)];
      while (peek()?.s === ',') { next(); items.push(parse(999)); }
      let tail = atom('[]');
      if (peek()?.s === '|') { next(); tail = parse(999); }
      expect(']');
      return items.reduceRight((rest, h) => t('[|]', h, rest), tail);
    }
    if (tok.k === 'punct' && tok.s === '!') return atom('!');
    if (tok.k === 'atom' || (tok.k === 'punct' && (tok.s === ';' || tok.s === ','))) {
      const name = tok.s;
      if (peek()?.s === '(' && !tok.space) {
        next();
        const args = [parse(999)];
        while (peek()?.s === ',') { next(); args.push(parse(999)); }
        expect(')');
        return t(name, ...args);
      }
      if (name === '-' && peek()?.k === 'num' && !tok.space) return -Number(next().s);
      if (name === ':-') return t(':-', parse(1199));
      const op = OPS[name];
      if (op && op[1] === 'fy' && peek() && peek().k !== 'end' && !(peek().k === 'punct' && /[),|\]]/.test(peek().s))) {
        return t(name, parse(op[0]));
      }
      return atom(name);
    }
    throw new SyntaxError(`unexpected "${tok.s}"`);
  }

  const clauses = [];
  while (i < ts.length) {
    names = new Map();
    const x = parse(1200);
    expect('.');
    varMaps.push(names);
    if (x.f === ':-' && x.args.length === 2) clauses.push({ head: x.args[0], body: x.args[1] });
    else if (x.f === ':-' && x.args.length === 1) continue; // directive
    else clauses.push({ head: x, body: null });
  }
  return clauses;
}
