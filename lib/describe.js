// Prolog back to text: each clause becomes a plain sentence that the Converter reads back
// as the same clause. Anything it can't say plainly is written as a "Prolog:" line, which
// reads back exactly, so the round trip never loses a clause.
import { isNum, isVar, show, showClause, unconj } from './terms.js';
import { article, singular, plural } from './words.js';
import { MODALS, thirdPersonOf } from './text-to-prolog.js';

const CMP_TEXT = { '>=': 'at least', '=<': 'at most', '>': 'more than', '<': 'less than', '=:=': 'equal to' };
const AGG_TEXT = { total: 'sum', average: 'average', maximum: 'maximum', minimum: 'minimum' };
const LETTERS = ['X', 'Y', 'Z', 'W'];

class Unsayable extends Error {}
const no = () => { throw new Unsayable(); };
const words = (name) => name.replace(/_/g, ' ');

export function describeProgram(program) {
  const { clauses, queries = [], lexicon = { kinds: {}, names: {}, units: {} } } = program;
  const lines = clauses.map((c) => describeClause(c, lexicon));
  for (const q of queries) {
    const s = describeQuery(q.goal, lexicon);
    if (s) lines.push(s);
  }
  return lines.join('\n');
}

export function describeClause(c, lexicon) {
  try {
    return c.body ? describeRule(c, lexicon) : `${sentenceCase(statement(c.head, lexicon, new Map()))}.`;
  } catch (e) {
    if (!(e instanceof Unsayable)) throw e;
    return `Prolog: ${showClause(c).replace(/\n\s*/g, ' ')}`;
  }
}

function sentenceCase(s) { return s[0].toUpperCase() + s.slice(1); }

function nameOf(x, lexicon, letters) {
  if (isVar(x)) { if (!letters.has(x.v)) no(); return letters.get(x.v); }
  if (isNum(x)) return String(x);
  if (x.args.length || !/^[a-z][a-z0-9_]*$/.test(x.f) || /^\d/.test(x.f)) no();
  return lexicon.names[x.f] ?? x.f.split('_').map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
}

const isWordName = (f) => /^[a-z]+(_[a-z]+)*$/.test(f);

// A goal as a phrase with its first argument as the subject.
function statement(g, lexicon, letters, { negative = false } = {}) {
  if (isVar(g) || isNum(g) || !isWordName(g.f)) no();
  const kind = lexicon.kinds[g.f];
  const [a, b] = g.args;
  if (g.args.length === 1) {
    const s = nameOf(a, lexicon, letters);
    if (kind === 'noun') {
      if (g.f.split('_').some((w) => singular(w) !== w)) no();
      return `${s} is ${negative ? 'not ' : ''}${article(g.f)} ${words(g.f)}`;
    }
    if (kind === 'verb') {
      const parts = g.f.split('_');
      if (parts.length === 2 && MODALS.has(parts[0]) && !negative) return `${s} ${parts[0]} ${parts[1]}`;
      if (g.f.includes('_')) no();
      return negative ? `${s} does not ${base(g.f)}` : `${s} ${g.f}`;
    }
    if (g.f.split('_').length > 3) no();
    return `${s} is ${negative ? 'not ' : ''}${words(g.f)}`;
  }
  if (g.args.length === 2) {
    const s = nameOf(a, lexicon, letters);
    if (isNum(b)) {
      if (negative) no();
      if (kind === 'count') return `${s} has ${b} ${words(g.f)}`;
      const unit = lexicon.units[g.f];
      return `${s}'s ${words(g.f)} is ${b}${unit ? (unit === 'dollars' ? ' dollars' : ` ${unit}`) : ''}`;
    }
    const o = nameOf(b, lexicon, letters);
    if (kind === 'comparative') return `${s} is ${negative ? 'not ' : ''}${g.f} than ${o}`;
    if (kind === 'noun_of') {
      const [noun, prep] = g.f.split('_');
      return `${s} is ${negative ? 'not ' : ''}${article(noun)} ${noun} ${prep} ${o}`;
    }
    const parts = g.f.split('_');
    if (parts.length > 2) no();
    if (MODALS.has(parts[0]) && negative) no();
    const verb = negative ? `does not ${base(parts[0])}` : parts[0];
    return `${s} ${verb}${parts[1] ? ` ${parts[1]}` : ''} ${o}`;
  }
  no();
}

function base(verb) {
  const candidates = [verb.replace(/ies$/, 'y'), verb.replace(/es$/, ''), verb.replace(/s$/, ''), verb];
  const found = candidates.find((c) => thirdPersonOf(c) === verb);
  if (!found) no();
  return found;
}

function describeRule(c, lexicon) {
  const body = unconj(c.body);
  const agg = aggregateSentence(c, body, lexicon);
  if (agg) return agg;
  // "Every man is mortal."
  if (body.length === 1 && c.head.args.length >= 1 && isVar(c.head.args[0]) && body[0].args?.length === 1 &&
      isVar(body[0].args[0]) && body[0].args[0].v === c.head.args[0].v && lexicon.kinds[body[0].f] === 'noun' &&
      singular(body[0].f) === body[0].f && !body[0].f.includes('_') &&
      c.head.args.slice(1).every((x) => !isVar(x))) {
    const X = c.head.args[0].v;
    const phrase = statement(c.head, lexicon, new Map([[X, '@']]));
    if (phrase.startsWith('@ ')) return `Every ${body[0].f} ${phrase.slice(2)}.`;
  }
  // General: "X is happy if X is rich and X is not busy."
  const letters = new Map();
  const values = new Set();
  const subjects = [];
  const note = (x) => { if (isVar(x) && !letters.has(x.v) && !values.has(x.v)) { if (letters.size >= LETTERS.length) no(); letters.set(x.v, LETTERS[letters.size]); } };
  // value variables: second argument of a measure goal that a comparison then uses
  for (let i = 0; i < body.length; i++) {
    const g = body[i];
    if (g.args?.length === 2 && isVar(g.args[1]) && !['\\+', ','].includes(g.f) && !CMP_TEXT[g.f]) {
      const later = body.slice(i + 1).find((h) => CMP_TEXT[h.f]);
      if (later && later.args.some((a) => isVar(a) && a.v === g.args[1].v)) values.add(g.args[1].v);
    }
  }
  c.head.args.forEach(note);
  body.forEach((g) => (g.f === '\\+' ? g.args[0] : g).args?.forEach((x) => { if (!CMP_TEXT[g.f]) note(x); }));
  subjects.push(...letters.values());
  const parts = [];
  for (let i = 0; i < body.length; i++) {
    const g = body[i];
    const n = body[i + 1], n2 = body[i + 2];
    if (isMeasure(g, values) && n && CMP_TEXT[n.f] && sameVar(n.args[0], g.args[1]) && isNum(n.args[1])) {
      parts.push(`${nameOf(g.args[0], lexicon, letters)}'s ${words(g.f)} is ${CMP_TEXT[n.f]} ${n.args[1]}`);
      i += 1;
      continue;
    }
    if (isMeasure(g, values) && isMeasure(n, values) && n.f === g.f && n2 && CMP_TEXT[n2.f] &&
        sameVar(n2.args[0], g.args[1]) && sameVar(n2.args[1], n.args[1])) {
      parts.push(`${nameOf(g.args[0], lexicon, letters)}'s ${words(g.f)} is ${CMP_TEXT[n2.f]} ${nameOf(n.args[0], lexicon, letters)}'s ${words(g.f)}`);
      i += 2;
      continue;
    }
    if (g.f === '\\+') { parts.push(statement(g.args[0], lexicon, letters, { negative: true })); continue; }
    if (CMP_TEXT[g.f] || [';', '->', 'findall', 'is', '!'].includes(g.f)) no();
    if (g.args.some((x) => isVar(x) && values.has(x.v))) no();
    parts.push(statement(g, lexicon, letters));
  }
  if (c.head.args.some((x) => isVar(x) && values.has(x.v))) no();
  return `${sentenceCase(statement(c.head, lexicon, letters))} if ${parts.join(' and ')}.`;
}

const sameVar = (a, b) => isVar(a) && isVar(b) && a.v === b.v;
const isMeasure = (g, values) => g && g.args?.length === 2 && isVar(g.args[1]) && values.has(g.args[1].v) && isWordName(g.f);

function aggregateSentence(c, body, lexicon) {
  const h = c.head;
  if (h.args.length !== 1 || !isVar(h.args[0])) return null;
  const f = body[0];
  if (!f || f.f !== 'findall') return null;
  const [tmpl, goal, list] = f.args;
  // number_of_items(N) :- findall(X, item(X), Xs), length(Xs, N).
  if (body.length === 2 && goal.args?.length === 1 && sameVar(tmpl, goal.args[0]) && body[1].f === 'length' &&
      sameVar(body[1].args[0], list) && sameVar(body[1].args[1], h.args[0]) && h.f === `number_of_${plural(goal.f)}`) {
    return `The number of ${words(plural(goal.f))} is the count of every ${words(goal.f)}.`;
  }
  // total_price(T) :- findall(V, (item(X), price(X, V)), Vs), sum_list(Vs, T).
  if (goal.f !== ',' ) return null;
  const [typeG, attrG] = goal.args;
  if (!typeG.args || typeG.args.length !== 1 || !attrG.args || attrG.args.length !== 2 || !sameVar(typeG.args[0], attrG.args[0]) || !sameVar(attrG.args[1], tmpl)) return null;
  const T = h.args[0];
  const rest = body.slice(1);
  let kind = null;
  if (rest.length === 1 && rest[0].f === 'sum_list' && sameVar(rest[0].args[0], list) && sameVar(rest[0].args[1], T)) kind = 'total';
  if (rest.length === 1 && rest[0].f === 'max_list' && sameVar(rest[0].args[0], list) && sameVar(rest[0].args[1], T)) kind = 'maximum';
  if (rest.length === 1 && rest[0].f === 'min_list' && sameVar(rest[0].args[0], list) && sameVar(rest[0].args[1], T)) kind = 'minimum';
  if (rest.length === 4 && rest[0].f === 'sum_list' && rest[1].f === 'length' && rest[2].f === '>' && rest[3].f === 'is' &&
      sameVar(rest[0].args[0], list) && sameVar(rest[1].args[0], list) && sameVar(rest[2].args[0], rest[1].args[1]) && rest[2].args[1] === 0 &&
      sameVar(rest[3].args[0], T) && rest[3].args[1].f === '/' && sameVar(rest[3].args[1].args[0], rest[0].args[1]) && sameVar(rest[3].args[1].args[1], rest[1].args[1])) kind = 'average';
  if (!kind || h.f !== `${kind}_${attrG.f}` || singular(typeG.f) !== typeG.f) return null;
  return `The ${kind} ${words(attrG.f)} is the ${AGG_TEXT[kind]} of the ${words(attrG.f)} of every ${words(typeG.f)}.`;
}

export function describeQuery(g, lexicon) {
  try {
    if (g.args.length === 1 && isVar(g.args[0])) {
      const m = /^(total|average|maximum|minimum)_(.+)$/.exec(g.f);
      if (m) return `What is the ${m[1]} ${words(m[2])}?`;
      if (g.f.startsWith('number_of_')) return `What is the number of ${words(g.f.slice(10))}?`;
      return `${statement(g, lexicon, new Map([[g.args[0].v, 'Who']]))}?`;
    }
    if (g.args.length === 2 && isVar(g.args[1]) && !isVar(g.args[0])) {
      return `What is ${nameOf(g.args[0], lexicon, new Map())}'s ${words(g.f)}?`;
    }
    if (g.args.length === 2 && isVar(g.args[0]) && !isVar(g.args[1])) {
      return `${statement(g, lexicon, new Map([[g.args[0].v, 'Who']]))}?`;
    }
    if (g.args.every((x) => !isVar(x))) {
      const s = statement(g, lexicon, new Map());
      const kind = lexicon.kinds[g.f];
      if (kind === 'verb' || (!kind && g.args.length === 2 && !isNum(g.args[1]))) {
        const parts = g.f.split('_');
        const subj = nameOf(g.args[0], lexicon, new Map());
        const obj = g.args[1] ? ` ${nameOf(g.args[1], lexicon, new Map())}` : '';
        return `Does ${subj} ${base(parts[0])}${parts[1] ? ` ${parts[1]}` : ''}${obj}?`;
      }
      const m = /^(.+?) is (.+)$/.exec(s);
      if (m) return `Is ${m[1]} ${m[2]}?`;
    }
  } catch (e) {
    if (!(e instanceof Unsayable)) throw e;
  }
  return null;
}

export const describeGoal = (g, lexicon) => { try { return statement(g, lexicon, new Map()); } catch { return show(g); } };
