// Text to Prolog: grammatical constructs become Prolog constructs.
//   statements            -> facts                 "Socrates is a man."           man(socrates).
//   conditions            -> rules                 "If X is a man then X is mortal."
//   all, every, each      -> rules and loops       "Every man is mortal."  "The total price is the sum of the price of every item."
//   vague, qualitative    -> measured definitions  "tall" with heights given -> tall(X) :- height(X, V), V >= 175.
//   comparatives          -> comparisons           "older" -> older(X, Y) :- age(X, A), age(Y, B), A > B.
// Whatever cannot be pinned down is left out and listed with the reason, never guessed.
import { atom, conj, isVar, t, v, vars } from './terms.js';
import { COMPARATIVE, INTENSIFIERS, UNIT_DIM, VAGUE, isPlural, plural, singular } from './words.js';
import { parseProgram } from './terms.js';

const VAR_LETTERS = ['X', 'Y', 'Z', 'W'];
const SOMEONE = new Set(['someone', 'something', 'somebody', 'anyone', 'anything', 'anybody', 'everyone', 'everything', 'everybody']);
const PRONOUN = new Set(['they', 'it', 'he', 'she', 'them', 'him', 'her']);
const QUANT = new Set(['all', 'every', 'each', 'any']);
const ARTICLE = new Set(['a', 'an']);
const BE = new Set(['is', 'are', 'am']);
const HAVE = new Set(['has', 'have']);
export const MODALS = new Set(['can', 'could', 'will', 'would', 'must', 'should', 'may', 'might']);
const PREP = new Set(['for', 'with', 'at', 'in', 'on', 'to', 'from', 'of', 'by', 'about', 'into', 'near']);
const CMP_WORDS = [
  [['at', 'least'], '>='], [['at', 'most'], '=<'], [['more', 'than'], '>'], [['less', 'than'], '<'], [['fewer', 'than'], '<'],
  [['greater', 'than'], '>'], [['over'], '>'], [['under'], '<'], [['above'], '>'], [['below'], '<'], [['equal', 'to'], '=:=']
];
const KEYWORDS = new Set(['the', 'a', 'an', 'all', 'every', 'each', 'any', 'if', 'no', 'who', 'what', 'is', 'are', 'does', 'do',
  'count', 'add', 'total', 'when', 'then', 'there', 'this', 'that', 'these', 'those', 'for', 'some', ...SOMEONE, ...PRONOUN]);
const AGGREGATES = { sum: 'total', total: 'total', average: 'average', mean: 'average', maximum: 'maximum', highest: 'maximum', largest: 'maximum', minimum: 'minimum', lowest: 'minimum', smallest: 'minimum' };

class Unparsed extends Error {}
const fail = (reason) => { throw new Unparsed(reason); };
export const thirdPersonOf = (verb) => thirdPerson(verb);

export const slug = (words) => words.join('_').toLowerCase().replace(/[^a-z0-9_]/g, '').replace(/^(\d)/, 'n$1');

// ------------------------------------------------------------------ sentences and tokens
export function sentences(text) {
  return String(text ?? '')
    .split(/\n+/)
    .flatMap((line) => (/^\s*prolog:/i.test(line) ? [line.trim()] : line.split(/(?<=[.!?])\s+(?=[A-Z"'(\d])/)))
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokenize(sentence) {
  const s = sentence.replace(/[’‘]/g, "'").replace(/(\w)'s\b/g, "$1 's").replace(/,/g, ' , ')
    .replace(/\bits\b/g, "it 's").replace(/\bIts\b/g, "It 's").replace(/\btheir\b/g, "they 's").replace(/\bTheir\b/g, "They 's");
  const raw = s.match(/'s|\$|[A-Za-z][A-Za-z-]*|\d+(?:\.\d+)?|[,;?]|km\/h/g) ?? [];
  return raw.map((r) => ({ raw: r, w: r.toLowerCase() }));
}

// ------------------------------------------------------------------ the converter
export function textToProlog(text, { data = {} } = {}) {
  const out = {
    clauses: [], queries: [], checks: [], leftOut: [], drilled: [], questions: [], notes: [], undefined: [],
    lexicon: { kinds: {}, names: {}, units: {} }
  };
  const statements = [];
  for (const sentence of sentences(text)) {
    if (/^prolog:/i.test(sentence)) {
      try {
        for (const c of parseProgram(sentence.replace(/^prolog:\s*/i, ''))) statements.push({ sentence, clause: c, verbatim: true });
      } catch (e) { out.leftOut.push({ sentence, reason: `Prolog that could not be read: ${e.message}` }); }
      continue;
    }
    try {
      for (const st of parseSentence(tokenize(sentence), out.lexicon, out.notes)) statements.push({ sentence, ...st });
    } catch (e) {
      if (!(e instanceof Unparsed)) throw e;
      out.leftOut.push({ sentence, reason: e.message });
    }
  }
  resolve(statements, out, data);
  askQuestions(out, statements);
  return out;
}

// Second pass: vague adjectives and comparatives get measured definitions where the
// text (or the Data answers) gives measures; their example statements become checks.
function resolve(statements, out, data) {
  const defined = new Set(statements.filter((s) => s.clause && s.clause.body).map((s) => key(s.clause.head)));
  const measures = {};
  for (const s of statements) {
    if (s.clause && !s.clause.body && s.clause.head.args.length === 2 && typeof s.clause.head.args[1] === 'number' && !isVar(s.clause.head.args[0])) {
      (measures[s.clause.head.f] ??= []).push([s.clause.head.args[0].f, s.clause.head.args[1]]);
    }
  }
  const drill = new Map();
  for (const word of new Set(statements.flatMap((s) => [...predicatesUsed(s)]))) {
    const name = word.replace(/\/\d+$/, '');
    if (word.endsWith('/1') && VAGUE[name] && !defined.has(word)) {
      const def = vagueDefinition(name, VAGUE[name], statements, measures, data);
      if (def) drill.set(word, def);
    }
    if (word.endsWith('/2') && COMPARATIVE[name] && !defined.has(word)) {
      const [dim, op] = COMPARATIVE[name];
      drill.set(word, { word: name, dim, op, how: measures[dim] ? `compares each ${dim}` : `needs ${dim} values to be worked out` });
    }
  }
  for (const s of statements) {
    if (!s.clause) continue;
    const k = key(s.clause.head);
    if (!s.clause.body && !s.query && drill.has(k)) {
      out.checks.push({ goal: s.clause.head, expect: !s.negative, sentence: s.sentence });
      continue;
    }
    if (s.negative) { out.notes.push(`"${s.sentence}" is true without a fact: Prolog treats what isn't stated as false.`); continue; }
    if (s.query) out.queries.push({ goal: s.clause.head, sentence: s.sentence });
    else out.clauses.push(s.clause);
  }
  for (const [, d] of drill) {
    const X = v('X');
    if (d.op) {
      const Y = v('Y'), A = v('A'), B = v('B');
      out.clauses.push({ head: t(d.word, X, Y), body: conj([t(d.dim, X, A), t(d.dim, Y, B), t(d.op, A, B)]) });
      out.lexicon.kinds[d.word] = 'comparative';
    } else {
      const V = v('V');
      out.clauses.push({ head: t(d.word, X), body: conj([t(d.dim, X, V), t(d.dir === 'high' ? '>=' : '=<', V, d.threshold)]) });
      out.lexicon.kinds[d.word] = 'adj';
    }
    out.lexicon.kinds[d.dim] ??= 'attr';
    out.drilled.push(d);
  }
}

function vagueDefinition(word, { dim, dir }, statements, measures, data) {
  const given = data[word] ?? data[`${word} ${dim}`];
  if (given !== undefined && given !== '' && Number.isFinite(Number(given))) {
    return { word, dim, dir, threshold: Number(given), how: `given in Data: ${word} means ${dim} ${dir === 'high' ? 'at least' : 'at most'} ${Number(given)}` };
  }
  const values = measures[dim];
  if (!values?.length) return null;
  const valueOf = new Map(values);
  const pos = [], neg = [];
  for (const s of statements) {
    if (s.clause && !s.clause.body && s.clause.head.f === word && s.clause.head.args.length === 1 && !isVar(s.clause.head.args[0])) {
      const val = valueOf.get(s.clause.head.args[0].f);
      if (val !== undefined) (s.negative ? neg : pos).push(val);
    }
  }
  const round = (x) => Math.round(x * 100) / 100;
  const hi = dir === 'high';
  let threshold, how;
  if (pos.length && neg.length) {
    const edgePos = hi ? Math.min(...pos) : Math.max(...pos);
    const edgeNeg = hi ? Math.max(...neg) : Math.min(...neg);
    threshold = round((edgePos + edgeNeg) / 2);
    how = `half-way between the ${hi ? 'lowest' : 'highest'} ${word} example (${edgePos}) and the ${hi ? 'highest' : 'lowest'} example that isn't (${edgeNeg})`;
  } else if (pos.length) {
    threshold = hi ? Math.min(...pos) : Math.max(...pos);
    how = `the ${hi ? 'lowest' : 'highest'} ${dim} called ${word} (${threshold}); no counter-example was given`;
  } else {
    const sorted = values.map((x) => x[1]).sort((a, b) => a - b);
    const mid = sorted.length / 2;
    threshold = round(sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2);
    how = `interpolated: the middle ${dim} of those given (${threshold}), as no examples say what counts as ${word}`;
  }
  return { word, dim, dir, threshold, how, examples: { pos, neg } };
}

function askQuestions(out, statements) {
  const facts = statements.filter((s) => s.clause && !s.query).length;
  if (facts < 2) out.questions.push({ key: 'more', ask: 'Can you say more? A few statements of fact or rules help me draft a fuller first version.' });
  const used = new Set(statements.flatMap((s) => [...predicatesUsed(s)]));
  for (const word of used) {
    const name = word.replace(/\/\d$/, '');
    if (word.endsWith('/1') && VAGUE[name] && !out.drilled.some((d) => d.word === name)) {
      out.questions.push({ key: name, ask: `What ${VAGUE[name].dim} counts as ${name}? Give a number, or give some ${VAGUE[name].dim}s and say which are ${name}.` });
    }
  }
  for (const d of out.drilled) {
    if (d.op && !statements.some((s) => s.clause && s.clause.head.f === d.dim)) out.questions.push({ key: d.dim, ask: `What is each one's ${d.dim}? "${d.word}" is worked out from it.` });
    if (d.how?.startsWith('interpolated')) out.questions.push({ key: d.word, ask: `I took ${d.word} to mean ${d.dim} ${d.dir === 'high' ? 'at least' : 'at most'} ${d.threshold}. Is that right? Answer with a number to change it.` });
  }
  const defined = new Set(out.clauses.map((c) => key(c.head)));
  const askedAbout = new Set();
  for (const c of out.clauses) {
    for (const k of predicatesUsed({ clause: { head: { f: 'true', args: [] }, body: c.body } })) {
      if (defined.has(k) || askedAbout.has(k) || k === 'true/0' || BUILTIN.has(k)) continue;
      askedAbout.add(k);
      out.undefined.push(k);
      out.questions.push({ key: `define:${k}`, ask: `Nothing says what "${k.replace(/\/\d+$/, '').replace(/_/g, ' ')}" is true of. Add a statement or a rule for it?` });
    }
  }
  for (const l of out.leftOut) out.questions.push({ key: `rephrase:${l.sentence}`, ask: `Could you put "${l.sentence}" another way? (${l.reason})` });
}

const key = (head) => `${head.f}/${head.args.length}`;
const BUILTIN = new Set(['findall/3', 'sum_list/2', 'length/2', 'max_list/2', 'min_list/2', 'member/2', '=/2', '\\=/2', '!/0', 'fail/0', 'true/0']);
function predicatesUsed(s) {
  const found = new Set();
  const walk = (x) => {
    if (!x || isVar(x) || typeof x === 'number') return;
    if ([',', ';', '\\+', '->'].includes(x.f)) { x.args.forEach(walk); return; }
    if (x.f === 'findall' && x.args.length === 3) { walk(x.args[1]); return; }
    if (['>=', '=<', '>', '<', '=:=', '=\\=', 'is', '/', '+', '-', '*'].includes(x.f)) return;
    found.add(key(x));
  };
  if (s.clause) { walk(s.clause.head); walk(s.clause.body); }
  return found;
}

// ------------------------------------------------------------------ one sentence
function parseSentence(tokens, lexicon, notes) {
  if (!tokens.length) fail('nothing to read');
  const question = tokens[tokens.length - 1].w === '?';
  const ts = tokens.filter((x) => !['?', ';'].includes(x.w));
  for (const x of ts) if (INTENSIFIERS.has(x.w) && x.w !== 'so') notes.push(`"${x.raw}" was left out: it has no separate measure.`);
  const words = ts.filter((x) => !INTENSIFIERS.has(x.w) || x.w === 'so');
  const ctx = { lexicon, scope: newScope() };
  if (question) return [{ clause: { head: parseQuestion(words, ctx), body: null }, query: true }];

  const lw = words.map((x) => x.w);
  // "If C then H" / "If C, H"
  if (lw[0] === 'if') {
    let split = lw.indexOf('then');
    let skip = 1;
    if (split < 0) { split = lw.indexOf(','); }
    if (split < 0) fail('an "if" sentence needs "then" or a comma before what follows');
    return rule(words.slice(split + skip), words.slice(1, split), ctx);
  }
  // "H if C" / "H when C"
  const ifAt = lw.findIndex((w, i) => i > 0 && (w === 'if' || w === 'when' || w === 'whenever'));
  if (ifAt > 0) return rule(words.slice(0, ifAt), words.slice(ifAt + 1), ctx);
  // "No N is A"
  if (lw[0] === 'no') fail('a "no ..." sentence says what is false, which Prolog cannot state as a fact');
  // aggregates: "The total price is the sum of the price of every item."
  const agg = aggregate(words, ctx);
  if (agg) return [agg];
  // "Count the items." / "Add up the price of all items."
  const loop = loopCommand(words, ctx);
  if (loop) return [loop];
  // "Every man is mortal." / "Men are mortal."
  if (QUANT.has(lw[0]) || (lw[1] === 'are' && isPlural(lw[0]))) {
    const start = QUANT.has(lw[0]) ? 1 : 0;
    const noun = singular(lw[start]);
    const X = ctx.scope.fresh();
    ctx.scope.last = X;
    lexicon.kinds[noun] ??= 'noun';
    const head = predicate(words.slice(start + 1), X, ctx, { plural: true });
    if (head.negative) fail('a rule cannot make something false');
    return [{ clause: { head: head.goal, body: t(noun, X) } }];
  }
  // "Tall people play basketball." -> plays(X, basketball) :- person(X), tall(X).
  if (words.length > 2 && !isName(words[0], 0) && isPlural(lw[1]) && !BE.has(lw[0]) && !KEYWORDS.has(lw[0]) &&
      (lw[2] === 'are' || !BE.has(lw[2]))) {
    const noun = singular(lw[1]);
    const adj = lw[0];
    const X = ctx.scope.fresh();
    ctx.scope.last = X;
    lexicon.kinds[noun] ??= 'noun';
    lexicon.kinds[adj] ??= 'adj';
    const head = predicate(words.slice(2), X, ctx, { plural: true });
    if (head.negative || head.extra.length) fail('a rule cannot make something false');
    return [{ clause: { head: head.goal, body: conj([t(noun, X), t(adj, X)]) } }];
  }
  // plain statement about a named thing
  const subj = subject(words, 0, ctx, { statement: true });
  if (isVar(subj.term)) fail('a statement about "someone" needs an "if" to say when it holds');
  const p = predicate(words.slice(subj.next), subj.term, ctx, {});
  if (subj.goals.length) fail('a statement must be about a named thing');
  return [{ clause: { head: p.goal, body: null }, negative: p.negative }];
}

function rule(headWords, condWords, ctx) {
  const disjuncts = splitOn(condWords, 'or');
  ctx.scope = newScope();
  return disjuncts.map((alt) => {
    const goals = [];
    for (const part of splitOn(alt, 'and')) goals.push(...phrase(part, ctx));
    const head = phrase(headWords, ctx, { head: true });
    if (head.length !== 1 || head[0].f === '\\+') fail('the result of a rule must be one positive statement');
    const hv = vars(head[0]);
    const bv = vars(conj(goals));
    for (const name of hv) if (!bv.has(name)) fail(`"${name}" in the result isn't mentioned in the condition`);
    return { clause: { head: head[0], body: conj(goals) } };
  });
}

function splitOn(words, joiner) {
  const parts = [[]];
  for (const x of words) {
    if (x.w === joiner) parts.push([]);
    else if (x.w !== ',') parts[parts.length - 1].push(x);
  }
  if (parts.some((p) => !p.length)) fail(`"${joiner}" needs something on both sides`);
  return parts;
}

// A phrase in a rule: subject then predicate; quantified or "a N" subjects add a type goal.
function phrase(words, ctx, { head = false } = {}) {
  const subj = subject(words, 0, ctx, {});
  if (head && subj.goals.length) fail('the result of a rule should be about X, Y or "they"');
  const p = predicate(words.slice(subj.next), subj.term, ctx, {});
  const goal = p.negative ? t('\\+', p.goal) : p.goal;
  return [...subj.goals, ...p.extra, goal];
}

function newScope() {
  const used = new Map();
  const scope = {
    last: null,
    get: (letter) => { if (!used.has(letter)) used.set(letter, v(letter)); return used.get(letter); },
    fresh: () => { const letter = VAR_LETTERS.find((l) => !used.has(l)); if (!letter) fail('too many unnamed things in one sentence'); return scope.get(letter); },
    value: (() => { let n = 0; return () => v(['A', 'B', 'C', 'D', 'E'][n++] ?? `V${n}`); })()
  };
  return scope;
}

function isName(tok, i) {
  if (!/^[A-Z]/.test(tok.raw)) return false;
  if (VAR_LETTERS.includes(tok.raw)) return false;
  if (KEYWORDS.has(tok.w)) return false;
  return i > 0 || !(VAGUE[tok.w] || COMPARATIVE[tok.w]);
}

function subject(words, i, ctx, { statement = false, object = false } = {}) {
  const tok = words[i];
  if (!tok) fail('missing who or what the sentence is about');
  const { scope, lexicon } = ctx;
  if (VAR_LETTERS.includes(tok.raw)) { const x = scope.get(tok.raw); scope.last = x; return { term: x, goals: [], next: i + 1 }; }
  if (SOMEONE.has(tok.w)) { const x = scope.fresh(); scope.last = x; return { term: x, goals: [], next: i + 1 }; }
  if (PRONOUN.has(tok.w)) { if (!scope.last) fail(`"${tok.raw}" doesn't refer to anything yet`); return { term: scope.last, goals: [], next: i + 1 }; }
  if (/^\d/.test(tok.w)) return { term: Number(tok.w), goals: [], next: i + 1 };
  if ((ARTICLE.has(tok.w) || QUANT.has(tok.w) || tok.w === 'the') && words[i + 1] && !statement) {
    const noun = singular(words[i + 1].w);
    const x = scope.fresh();
    scope.last = x;
    lexicon.kinds[noun] ??= 'noun';
    return { term: x, goals: [t(noun, x)], next: i + 2 };
  }
  if (tok.w === 'the' && statement && words[i + 1] && /^[a-z]/.test(words[i + 1].raw)) {
    const name = slug([words[i + 1].w]);
    lexicon.names[name] ??= `the ${words[i + 1].raw}`;
    return { term: atom(name), goals: [], next: i + 2 };
  }
  if (object && /^[a-z]/.test(tok.raw) && !KEYWORDS.has(tok.w) && !ARTICLE.has(tok.w) && !QUANT.has(tok.w) && !PREP.has(tok.w)) {
    const name = slug([tok.w]);
    lexicon.names[name] ??= tok.w;
    return { term: atom(name), goals: [], next: i + 1 };
  }
  if (isName(tok, i) || (i === 0 && /^[A-Z]/.test(tok.raw) && !KEYWORDS.has(tok.w))) {
    let j = i;
    const parts = [];
    while (words[j] && /^[A-Z]/.test(words[j].raw) && !VAR_LETTERS.includes(words[j].raw) && (j === i || !KEYWORDS.has(words[j].w))) parts.push(words[j++].raw);
    const name = slug(parts);
    lexicon.names[name] ??= parts.join(' ');
    return { term: atom(name), goals: [], next: j };
  }
  if (!statement && words[i + 1] && /^[a-z]/.test(tok.raw)) fail(`"${tok.raw}" needs "a", "every" or a capital letter to say who it is`);
  fail(`couldn't tell who or what "${tok.raw}" is`);
}

// The predicate after a subject S. Returns { goal, negative, extra } (extra: goals it needs first).
function predicate(words, S, ctx, { plural = false } = {}) {
  const { lexicon, scope } = ctx;
  const lw = words.map((x) => x.w);
  if (!lw.length) fail('the sentence stops before saying anything about its subject');
  let i = 0;
  // S's attr is N [unit] / S's attr is cmp N / S's attr is cmp T's attr
  if (lw[0] === "'s") {
    const attrWords = [];
    i = 1;
    while (lw[i] && !BE.has(lw[i])) attrWords.push(lw[i++]);
    if (!attrWords.length || !BE.has(lw[i])) fail('after "\'s" say what it is, such as "Ann\'s height is 170"');
    const attr = slug(attrWords);
    lexicon.kinds[attr] ??= 'attr';
    i++;
    const { op, next } = comparison(lw, i);
    i = next;
    const rest = words.slice(i);
    if (rest[0] && /^\d/.test(rest[0].w) || rest[0]?.w === '$') {
      const n = number(rest);
      if (n.unit) lexicon.units[attr] = n.unit;
      if (n.next < rest.length) fail(`unexpected words after the number: "${rest.slice(n.next).map((x) => x.raw).join(' ')}"`);
      if (!op) return { goal: t(attr, S, n.value), extra: [] };
      const V = scope.value();
      return { goal: t(op ?? '=:=', V, n.value), extra: [t(attr, S, V)] };
    }
    // ... is cmp T's attr
    const other = subject(rest, 0, ctx, {});
    if (rest[other.next]?.w !== "'s") fail('compare with a number or with another\'s value, such as "Y\'s height"');
    const attr2 = slug(rest.slice(other.next + 1).map((x) => x.w));
    if (attr2 !== attr) fail(`compare ${attr} with ${attr}, not ${attr2}`);
    const A = scope.value(), B = scope.value();
    return { goal: t(op ?? '=:=', A, B), extra: [...other.goals, t(attr, S, A), t(attr, other.term, B)] };
  }
  // does not / do not VERB ...
  let negative = false;
  if ((lw[0] === 'does' || lw[0] === 'do') && lw[1] === 'not') { negative = true; i = 2; }
  // is/are [not] ...
  if (BE.has(lw[i])) {
    i++;
    if (lw[i] === 'not') { negative = true; i++; }
    // N unit adj: "190 cm tall", "40 years old"
    if (/^\d/.test(lw[i]) || lw[i] === '$') {
      const n = number(words.slice(i));
      const tail = lw.slice(i + n.next);
      const adj = tail[tail.length - 1];
      const dim = (adj && VAGUE[adj]?.dim) || (n.unit && UNIT_DIM[n.unit]);
      if (!dim) fail('say what the number measures, such as "190 cm tall" or "Ann\'s height is 190"');
      if (negative) fail('a measurement cannot be negative here');
      if (n.unit) lexicon.units[dim] = n.unit;
      lexicon.kinds[dim] ??= 'attr';
      return { goal: t(dim, S, n.value), extra: [], negative };
    }
    // comparative: "older than Y"
    if (COMPARATIVE[lw[i]] && lw[i + 1] === 'than') {
      const other = subject(words, i + 2, ctx, {});
      if (other.next < words.length) fail('unexpected words after the comparison');
      lexicon.kinds[lw[i]] = 'comparative';
      return { goal: t(lw[i], S, other.term), extra: other.goals, negative };
    }
    // "a/an N" -> noun; "N" when plural subject ("Men are animals")
    if (ARTICLE.has(lw[i]) || (plural && isPlural(lw[i] ?? '') && words.length === i + 1)) {
      const off = ARTICLE.has(lw[i]) ? 1 : 0;
      const nounWords = lw.slice(i + off);
      if (!nounWords.length) fail('a noun is missing after "a"');
      if (nounWords.length > 1 && PREP.has(nounWords[1])) {
        // "a friend of Ben" -> friend_of(S, ben)
        const rel = slug([singular(nounWords[0]), nounWords[1]]);
        const other = subject(words, i + off + 2, ctx, {});
        if (other.next < words.length) fail('unexpected words after the relation');
        lexicon.kinds[rel] = 'noun_of';
        return { goal: t(rel, S, other.term), extra: other.goals, negative };
      }
      const noun = slug(nounWords.map(singular));
      lexicon.kinds[noun] ??= 'noun';
      return { goal: t(noun, S), extra: [], negative };
    }
    // adjective / state: "mortal", "happy"
    const rest = lw.slice(i);
    if (!rest.length) fail('say what it is');
    if (rest.length > 3 || rest.some((w) => w === ',' || /^\d/.test(w))) fail('this description is too complex to turn into one condition');
    if (rest.length > 1 && PREP.has(rest[1])) {
      // "in Sydney", "married to Ben"
      fail('a description with a preposition is ambiguous; say it as a verb, such as "Ann lives in Sydney"');
    }
    const adj = slug(rest);
    lexicon.kinds[adj] ??= 'adj';
    return { goal: t(adj, S), extra: [], negative };
  }
  // has/have N noun
  if (HAVE.has(lw[i])) {
    const n = /^\d/.test(lw[i + 1] ?? '') ? number(words.slice(i + 1)) : null;
    if (!n) fail('"has" needs a number, such as "Ann has 3 cats"');
    const noun = slug(lw.slice(i + 1 + n.next));
    if (!noun) fail('say what there are that many of');
    lexicon.kinds[noun] = 'count';
    return { goal: t(noun, S, n.value), extra: [], negative };
  }
  // verbs: "likes Ben", "works for Acme", "sings"; costs/weighs N
  let verb = lw[i];
  if (!verb || !/^[a-z]/.test(verb)) fail('a verb is missing');
  // "can help", "must pay": the modal and its verb make one predicate
  if (MODALS.has(verb)) {
    if (negative) fail('"does not" with "can" or "must" is unclear; say "cannot" as a separate rule');
    if (!lw[i + 1] || lw[i + 1] === 'not') fail(`say what ${verb} happen, without "not"`);
    verb = `${verb}_${lw[i + 1]}`;
    i++;
  } else if (negative || plural || isVar(S)) verb = thirdPerson(verb);
  const measured = { costs: 'price', weighs: 'weight', earns: 'income', sells: 'sales' }[verb];
  if (measured && /^\d|\$/.test(lw[i + 1] ?? '')) {
    const n = number(words.slice(i + 1));
    if (n.unit) lexicon.units[measured] = n.unit;
    lexicon.kinds[measured] ??= 'attr';
    return { goal: t(measured, S, n.value), extra: [], negative };
  }
  const verbWords = [verb];
  i++;
  if (PREP.has(lw[i])) verbWords.push(lw[i++]);
  const name = slug(verbWords);
  if (i >= words.length) { lexicon.kinds[name] ??= 'verb'; return { goal: t(name, S), extra: [], negative }; }
  const obj = subject(words, i, ctx, { object: true });
  if (obj.next < words.length) fail(`only one object can follow "${verbWords.join(' ')}"; the rest ("${words.slice(obj.next).map((x) => x.raw).join(' ')}") was not understood`);
  lexicon.kinds[name] ??= 'verb';
  return { goal: t(name, S, obj.term), extra: obj.goals, negative };
}

function thirdPerson(verb) {
  if (verb.endsWith('s')) return verb;
  if (verb === 'have') return 'has';
  if (verb === 'do') return 'does';
  if (/(ch|sh|x|o)$/.test(verb)) return verb + 'es';
  if (/[^aeiou]y$/.test(verb)) return verb.slice(0, -1) + 'ies';
  return verb + 's';
}

function comparison(lw, i) {
  for (const [ws, op] of CMP_WORDS) if (ws.every((w, k) => lw[i + k] === w)) return { op, next: i + ws.length };
  return { op: null, next: i };
}

function number(words) {
  let i = 0;
  let unit = null;
  if (words[i]?.w === '$') { unit = 'dollars'; i++; }
  if (!/^\d/.test(words[i]?.w ?? '')) fail('a number is missing');
  const value = Number(words[i++].w);
  const u = words[i]?.w;
  if (u && (UNIT_DIM[u] || u === 'km/h')) { unit = u; i++; }
  return { value, unit, next: i };
}

// "The total price is the sum of the price of every item."
// "The number of items is the count of every item."
function aggregate(words, ctx) {
  const lw = words.map((x) => x.w);
  if (lw[0] !== 'the') return null;
  const isAt = lw.indexOf('is');
  if (isAt < 2 || lw[isAt + 1] !== 'the') return null;
  const kindWord = lw[isAt + 2];
  if (kindWord === 'count' && lw[isAt + 3] === 'of') {
    const nounAt = QUANT.has(lw[isAt + 4]) ? isAt + 5 : isAt + 4;
    const noun = singular(lw[nounAt] ?? '');
    if (!noun || nounAt !== lw.length - 1) fail('say what to count, such as "the count of every item"');
    return countClause(noun, ctx);
  }
  const kind = AGGREGATES[kindWord];
  if (!kind || lw[isAt + 3] !== 'of') return null;
  // the ATTR of every NOUN
  let j = isAt + 4;
  if (lw[j] === 'the') j++;
  const attrWords = [];
  while (lw[j] && lw[j] !== 'of') attrWords.push(lw[j++]);
  if (lw[j] !== 'of') fail(`say "the ${kindWord} of the <value> of every <thing>"`);
  j++;
  if (QUANT.has(lw[j]) || lw[j] === 'the') j++;
  const noun = singular(lw[j] ?? '');
  if (!noun || j !== lw.length - 1) fail('say which things, such as "of every item"');
  return aggClause(kind, slug(attrWords), noun, ctx);
}

function loopCommand(words, ctx) {
  const lw = words.map((x) => x.w);
  // Count the items. / Count every item.
  if (lw[0] === 'count' && lw.length <= 3) {
    const noun = singular(lw[lw.length - 1]);
    return countClause(noun, ctx);
  }
  // Add up / Total / Sum / Average the price of all items.
  const verbs = { add: 'total', total: 'total', sum: 'total', average: 'average' };
  if (verbs[lw[0]]) {
    let j = 1;
    if (lw[j] === 'up') j++;
    if (lw[j] === 'the') j++;
    const attrWords = [];
    while (lw[j] && lw[j] !== 'of' && lw[j] !== 'for') attrWords.push(lw[j++]);
    if (!attrWords.length || !lw[j]) return null;
    j++;
    if (QUANT.has(lw[j]) || lw[j] === 'the') j++;
    const noun = singular(lw[j] ?? '');
    if (!noun || j !== lw.length - 1) fail('say which things to add up, such as "of all items"');
    return aggClause(verbs[lw[0]], slug(attrWords), noun, ctx);
  }
  return null;
}

function countClause(noun, { lexicon }) {
  const N = v('N'), X = v('X'), Xs = v('Xs');
  const name = `number_of_${slug([plural(noun)])}`;
  lexicon.kinds[name] = 'count_of';
  lexicon.kinds[noun] ??= 'noun';
  return { clause: { head: t(name, N), body: conj([t('findall', X, t(noun, X), Xs), t('length', Xs, N)]) } };
}

function aggClause(kind, attr, noun, { lexicon }) {
  const T = v('T'), X = v('X'), V = v('V'), Vs = v('Vs');
  const name = `${kind}_${attr}`;
  lexicon.kinds[name] = `aggregate:${kind}:${attr}:${noun}`;
  lexicon.kinds[attr] ??= 'attr';
  lexicon.kinds[noun] ??= 'noun';
  const collect = t('findall', V, t(',', t(noun, X), t(attr, X, V)), Vs);
  const S = v('S'), L = v('L');
  const finish = {
    total: [t('sum_list', Vs, T)],
    average: [t('sum_list', Vs, S), t('length', Vs, L), t('>', L, 0), t('is', T, t('/', S, L))],
    maximum: [t('max_list', Vs, T)],
    minimum: [t('min_list', Vs, T)]
  }[kind];
  return { clause: { head: t(name, T), body: conj([collect, ...finish]) } };
}


function parseQuestion(words, ctx) {
  const lw = words.map((x) => x.w);
  // What is the total price? / What is the number of items?
  if ((lw[0] === 'what' || lw[0] === 'how') && lw[1] === 'is' && lw[2] === 'the') {
    const name = slug(lw.slice(3));
    if (AGGREGATES[lw[3]] || lw[3] === 'number') return t(lw[3] === 'number' ? `number_of_${slug(lw.slice(5))}` : `${AGGREGATES[lw[3]]}_${slug(lw.slice(4))}`, v('X'));
    return t(name, v('X'));
  }
  // What is Ann's height?
  if (lw[0] === 'what' && lw[1] === 'is') {
    const subj = subject(words, 2, ctx, {});
    if (lw[subj.next] === "'s") return t(slug(lw.slice(subj.next + 1)), subj.term, v('X'));
    fail('ask "What is Ann\'s height?" or "What is the total price?"');
  }
  // Who is mortal? / Who likes Ben?
  if (lw[0] === 'who' || lw[0] === 'what') {
    const X = ctx.scope.get('X');
    ctx.scope.last = X;
    const p = predicate(words.slice(1), X, ctx, {});
    if (p.extra.length || p.negative) fail('ask a simpler question');
    return p.goal;
  }
  // Is Socrates mortal? / Is Ann older than Ben?
  if (lw[0] === 'is' || lw[0] === 'are') {
    const subj = subject(words, 1, ctx, {});
    const p = predicate([words[0], ...words.slice(subj.next)], subj.term, ctx, {});
    if (p.extra.length || p.negative || subj.goals.length) fail('ask a simpler question');
    return p.goal;
  }
  // Does Ann like Ben?
  if (lw[0] === 'does' || lw[0] === 'do') {
    const subj = subject(words, 1, ctx, {});
    const rest = words.slice(subj.next);
    if (!rest.length) fail('say what to ask about');
    const verb = { ...rest[0], w: thirdPerson(rest[0].w) };
    const p = predicate([verb, ...rest.slice(1)], subj.term, ctx, {});
    if (p.extra.length || subj.goals.length) fail('ask a simpler question');
    return p.goal;
  }
  fail('questions can start with Is, Does, Who or What');
}
