// A small Prolog evaluator for the Converter's subset, so proofs can run in the browser
// (and on a phone) as well as in SWI-Prolog. It supports facts and rules, conjunction,
// disjunction, if-then-else, \+, arithmetic comparison and is/2, findall/3, length/2,
// sum_list/2, max_list/2, min_list/2, member/2, =/2 and \=/2. Search is bounded.
import { atom, isNum, isVar, show, t } from './terms.js';

export class EvalLimit extends Error {}

export function answers(clauses, goal, { limit = 500, steps = 200000 } = {}) {
  const db = new Map();
  for (const c of clauses) {
    const k = `${c.head.f}/${c.head.args.length}`;
    if (!db.has(k)) db.set(k, []);
    db.get(k).push(c);
  }
  const budget = { steps };
  const out = [];
  const qvars = [...collectVars(goal)];
  for (const env of solve([goal], new Map(), db, budget, 0)) {
    out.push(qvars.map((name) => show(resolveTerm({ v: name }, env))).join(', ') || 'true');
    if (out.length >= limit) break;
  }
  return out;
}

export const holds = (clauses, goal, opts) => answers(clauses, goal, { ...opts, limit: 1 }).length > 0;

function collectVars(x, out = new Set()) {
  if (isVar(x)) { if (x.v !== '_') out.add(x.v); } else if (!isNum(x)) x.args.forEach((a) => collectVars(a, out));
  return out;
}

function walk(x, env) {
  while (isVar(x) && env.has(x.v)) x = env.get(x.v);
  return x;
}
export function resolveTerm(x, env) {
  x = walk(x, env);
  if (isVar(x) || isNum(x)) return x;
  return { f: x.f, args: x.args.map((a) => resolveTerm(a, env)) };
}

function unify(a, b, env) {
  a = walk(a, env); b = walk(b, env);
  if (isVar(a)) { if (isVar(b) && a.v === b.v) return env; const e = new Map(env); e.set(a.v, b); return e; }
  if (isVar(b)) { const e = new Map(env); e.set(b.v, a); return e; }
  if (isNum(a) || isNum(b)) return isNum(a) && isNum(b) && a === b ? env : null;
  if (a.f !== b.f || a.args.length !== b.args.length) return null;
  for (let i = 0; i < a.args.length; i++) { env = unify(a.args[i], b.args[i], env); if (!env) return null; }
  return env;
}

let renameCounter = 0;
function rename(c) {
  const n = ++renameCounter;
  const map = (x) => (isVar(x) ? { v: x.v === '_' ? `_${n}_${Math.random()}` : `${x.v}#${n}` } : isNum(x) ? x : { f: x.f, args: x.args.map(map) });
  return { head: map(c.head), body: c.body ? map(c.body) : null };
}

function arith(x, env) {
  x = walk(x, env);
  if (isNum(x)) return x;
  if (isVar(x)) throw new Error('arguments are not sufficiently instantiated');
  const [a, b] = x.args.map((y) => arith(y, env));
  switch (x.f) {
    case '+': return a + b;
    case '-': return x.args.length === 1 ? -a : a - b;
    case '*': return a * b;
    case '/': return Number.isInteger(a) && Number.isInteger(b) && a % b === 0 ? a / b : a / b;
    case '//': return Math.trunc(a / b);
    case 'mod': return ((a % b) + b) % b;
    case 'min': return Math.min(a, b);
    case 'max': return Math.max(a, b);
    case 'abs': return Math.abs(a);
    default: throw new Error(`unknown arithmetic ${x.f}`);
  }
}

const COMPARE = { '<': (a, b) => a < b, '>': (a, b) => a > b, '=<': (a, b) => a <= b, '>=': (a, b) => a >= b, '=:=': (a, b) => a === b, '=\\=': (a, b) => a !== b };

function toList(x, env) {
  const items = [];
  x = walk(x, env);
  while (!isVar(x) && !isNum(x) && x.f === '[|]') { items.push(walk(x.args[0], env)); x = walk(x.args[1], env); }
  if (isVar(x) || isNum(x) || x.f !== '[]') return null;
  return items;
}
const fromList = (items) => items.reduceRight((rest, h) => t('[|]', h, rest), atom('[]'));

function* solve(goals, env, db, budget, depth) {
  if (!goals.length) { yield env; return; }
  if (--budget.steps < 0) throw new EvalLimit('the search took too many steps');
  if (depth > 400) throw new EvalLimit('the search went too deep (is a rule recursive without an end?)');
  const [g0, ...rest] = goals;
  const g = walk(g0, env);
  if (isVar(g)) throw new Error('a goal is an unbound variable');
  if (isNum(g)) throw new Error('a number is not a goal');
  const k = `${g.f}/${g.args.length}`;
  switch (k) {
    case 'true/0': yield* solve(rest, env, db, budget, depth); return;
    case 'fail/0': case 'false/0': return;
    case ',/2': yield* solve([g.args[0], g.args[1], ...rest], env, db, budget, depth); return;
    case ';/2': {
      const [l, r] = g.args;
      const lw = walk(l, env);
      if (!isVar(lw) && lw.f === '->' && lw.args.length === 2) {
        const first = solve([lw.args[0]], env, db, budget, depth + 1).next();
        if (!first.done) yield* solve([lw.args[1], ...rest], first.value, db, budget, depth);
        else yield* solve([r, ...rest], env, db, budget, depth);
        return;
      }
      yield* solve([l, ...rest], env, db, budget, depth);
      yield* solve([r, ...rest], env, db, budget, depth);
      return;
    }
    case '->/2': {
      const first = solve([g.args[0]], env, db, budget, depth + 1).next();
      if (!first.done) yield* solve([g.args[1], ...rest], first.value, db, budget, depth);
      return;
    }
    case '\\+/1': {
      if (solve([g.args[0]], env, db, budget, depth + 1).next().done) yield* solve(rest, env, db, budget, depth);
      return;
    }
    case 'once/1': {
      const first = solve([g.args[0]], env, db, budget, depth + 1).next();
      if (!first.done) yield* solve(rest, first.value, db, budget, depth);
      return;
    }
    case '=/2': { const e = unify(g.args[0], g.args[1], env); if (e) yield* solve(rest, e, db, budget, depth); return; }
    case '\\=/2': { if (!unify(g.args[0], g.args[1], env)) yield* solve(rest, env, db, budget, depth); return; }
    case 'is/2': { const e = unify(g.args[0], arith(g.args[1], env), env); if (e) yield* solve(rest, e, db, budget, depth); return; }
    case 'findall/3': {
      const results = [];
      for (const e of solve([g.args[1]], env, db, budget, depth + 1)) results.push(resolveTerm(g.args[0], e));
      const e = unify(g.args[2], fromList(results), env);
      if (e) yield* solve(rest, e, db, budget, depth);
      return;
    }
    case 'length/2': {
      const items = toList(g.args[0], env);
      if (!items) throw new Error('length/2 needs a list');
      const e = unify(g.args[1], items.length, env);
      if (e) yield* solve(rest, e, db, budget, depth);
      return;
    }
    case 'sum_list/2': case 'sumlist/2': case 'max_list/2': case 'min_list/2': {
      const items = toList(g.args[0], env)?.map((x) => arith(x, env));
      if (!items) throw new Error(`${g.f} needs a list of numbers`);
      if (g.f !== 'sum_list' && g.f !== 'sumlist' && !items.length) return;
      const val = g.f.startsWith('sum') ? items.reduce((a, b) => a + b, 0) : g.f === 'max_list' ? Math.max(...items) : Math.min(...items);
      const e = unify(g.args[1], val, env);
      if (e) yield* solve(rest, e, db, budget, depth);
      return;
    }
    case 'member/2': {
      const items = toList(g.args[1], env);
      if (!items) throw new Error('member/2 needs a list');
      for (const item of items) { const e = unify(g.args[0], item, env); if (e) yield* solve(rest, e, db, budget, depth); }
      return;
    }
    default:
      if (COMPARE[g.f] && g.args.length === 2) {
        if (COMPARE[g.f](arith(g.args[0], env), arith(g.args[1], env))) yield* solve(rest, env, db, budget, depth);
        return;
      }
  }
  const clauses = db.get(k);
  if (!clauses) return; // unknown predicate: no answers (SWI-Prolog would raise an error)
  for (const c of clauses) {
    const r = rename(c);
    const e = unify(r.head, g, env);
    if (!e) continue;
    yield* solve(r.body ? [r.body, ...rest] : rest, e, db, budget, depth + 1);
  }
}

// Every predicate of a program queried with fresh variables: its full set of answers.
export function allAnswers(clauses, opts, keys = predicateKeys(clauses)) {
  const out = {};
  for (const k of keys) {
    const [f, n] = [k.slice(0, k.lastIndexOf('/')), Number(k.slice(k.lastIndexOf('/') + 1))];
    const goal = { f, args: Array.from({ length: n }, (_, i) => ({ v: `A${i}` })) };
    try { out[k] = answers(clauses, goal, opts).sort(); } catch (e) { out[k] = [`error: ${e.message}`]; }
  }
  return out;
}

export const predicateKeys = (clauses) => [...new Set(clauses.map((c) => `${c.head.f}/${c.head.args.length}`))];
