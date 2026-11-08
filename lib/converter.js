// The Converter: description -> Prolog -> optimised Prolog -> text -> each app's format.
//   1. Text to Prolog (text-to-prolog.js), with vague words drilled down to measures.
//   2. Optimise: mnns' optimise command (PLOp, simplifier, Detlog, each proof-checked),
//      run as a LucianOS job; kept only if it also gives the same answers here.
//   3. Prolog back to text (describe.js), proved to say what the source said (proof.js).
//   4. Format: Writer paragraphs, Counter rows and formulas, Presenter slides, Etcher shapes,
//      Tabler tables.
import { describeClause, describeProgram } from './describe.js';
import { answers, EvalLimit } from './evaluate.js';
import { proof, proveConversion, sameAnswersAs } from './proof.js';
import { isNum, isVar, parseProgram, show, showProgram, unconj } from './terms.js';
import { textToProlog } from './text-to-prolog.js';
import { measure, simplify } from './year-level.js';

export function convert(text, { data = {}, yearLevel = 'pg' } = {}) {
  const { program, regenerated, program2, proof: p } = proveConversion(text, { data });
  const readable = simplify(regenerated, yearLevel);
  return {
    program,
    prolog: prologText(program),
    text: regenerated,
    readable: readable.text,
    yearLevel: { before: measure(regenerated, yearLevel), changes: readable.changes, after: readable.after },
    proof: p,
    reread: program2,
    answers: program.queries.map((q) => ({ question: q.sentence, answers: safeAnswers(program.clauses, q.goal) })),
    formats: formats(program)
  };
}

function safeAnswers(clauses, goal) {
  try { return answers(clauses, goal, { limit: 50 }); } catch (e) { return [`(${e instanceof EvalLimit ? e.message : `error: ${e.message}`})`]; }
}

// The program as a Prolog file: predicates that are used but have no clauses are declared
// dynamic, so asking about them gives "no" rather than an error.
export function prologText(program) {
  const decl = (program.undefined ?? []).map((k) => `:- dynamic ${k}.`);
  return [...decl, showProgram(program.clauses)].filter(Boolean).join('\n');
}

// ------------------------------------------------------------------ optimise with mnns
// A LucianOS job spec (POST /api/jobs) that runs mnns on a file. The file arguments come
// after "--" so swipl reads them as arguments, not as program files to load.
export function optimiseJobSpec({ mnns, input, output, cwd = '' }) {
  return { cmd: 'swipl', args: [`${mnns.replace(/\/$/, '')}/optimise.pl`, '--', input, output], cwd, label: 'mnns optimise (Lucian Office)' };
}

// Accept mnns' rewrite only if mnns reported success and the rewrite gives the same answers
// as the original for every original predicate. Returns the program to use and why.
export function acceptOptimised(program, stdout, outputText) {
  const line = String(stdout ?? '').split('\n').find((l) => l.startsWith('MNN_OPTIMISE '));
  if (!line) return { accepted: false, program, reason: 'mnns gave no report' };
  if (line.startsWith('MNN_OPTIMISE error')) return { accepted: false, program, reason: line.slice(19) };
  const fields = Object.fromEntries(line.split(' ').slice(2).map((kv) => kv.split('=')));
  if (fields.changed !== 'true') return { accepted: false, program, reason: 'mnns found nothing to improve', report: fields };
  let clauses;
  try { clauses = parseProgram(outputText); } catch (e) { return { accepted: false, program, reason: `couldn't read mnns' output: ${e.message}`, report: fields }; }
  const same = sameAnswersAs(program.clauses, clauses);
  if (!same.ok) return { accepted: false, program, reason: `different answers for ${same.differing.join(', ')}`, report: fields };
  const optimised = { ...program, clauses };
  // the optimised program must still read back as text, clause for clause
  const regenerated = describeProgram(optimised);
  const reread = textToProlog(regenerated);
  return { accepted: true, program: optimised, reason: 'mnns proved each rewrite, and the answers are the same', report: fields, text: regenerated, proof: proof(optimised, reread) };
}

// ------------------------------------------------------------------ formats
export function formats(program) {
  return { writer: toWriter(program), counter: toCounter(program), presenter: toPresenter(program), etcher: toEtcher(program), tabler: toTabler(program) };
}

const kindOf = (c) => (!c.body ? 'fact' : 'rule');

export function toWriter(program) {
  const facts = program.clauses.filter((c) => !c.body).map((c) => describeClause(c, program.lexicon));
  const rules = program.clauses.filter((c) => c.body).map((c) => describeClause(c, program.lexicon));
  const blocks = [];
  if (facts.length) blocks.push({ type: 'paragraph', text: facts.join(' ') });
  if (rules.length) blocks.push({ type: 'paragraph', text: rules.join(' ') });
  if (program.queries.length) blocks.push({ type: 'paragraph', text: program.queries.map((q) => q.sentence).join(' ') });
  return {
    blocks,
    data: Object.fromEntries(program.drilled.filter((d) => d.threshold !== undefined).map((d) => [d.word, String(d.threshold)])),
    opinion: ''
  };
}

// Measures become a sheet: one row per named thing, one column per measure; totals and
// averages become formula rows over those columns.
export function toCounter(program) {
  const cols = [];
  const rows = new Map();
  for (const c of program.clauses) {
    if (c.body || c.head.args.length !== 2 || !isNum(c.head.args[1]) || isVar(c.head.args[0])) continue;
    const col = c.head.f;
    if (!cols.includes(col)) cols.push(col);
    const name = program.lexicon.names[c.head.args[0].f] ?? c.head.args[0].f;
    if (!rows.has(name)) rows.set(name, {});
    rows.get(name)[col] = c.head.args[1];
  }
  const letter = (i) => String.fromCharCode(66 + i); // column A holds the names
  const n = rows.size;
  const formulas = [];
  for (const [name, kind] of Object.entries(program.lexicon.kinds)) {
    const m = /^aggregate:(\w+):(\w+):(\w+)$/.exec(kind);
    if (!m) continue;
    const i = cols.indexOf(m[2]);
    if (i < 0) continue;
    const fn = { total: 'SUM', average: 'AVERAGE', maximum: 'MAX', minimum: 'MIN' }[m[1]];
    formulas.push({ label: name.replace(/_/g, ' '), formula: `=${fn}(${letter(i)}2:${letter(i)}${n + 1})` });
  }
  return { columns: ['name', ...cols], rows: [...rows].map(([name, vals]) => [name, ...cols.map((c) => vals[c] ?? '')]), formulas };
}

export function toPresenter(program) {
  const say = (c) => describeClause(c, program.lexicon);
  const slides = [];
  const facts = program.clauses.filter((c) => !c.body);
  const rules = program.clauses.filter((c) => c.body);
  for (let i = 0; i < facts.length; i += 5) slides.push({ title: i ? 'Facts (continued)' : 'Facts', bullets: facts.slice(i, i + 5).map(say) });
  for (let i = 0; i < rules.length; i += 4) slides.push({ title: i ? 'Rules (continued)' : 'Rules', bullets: rules.slice(i, i + 4).map(say) });
  if (program.queries.length) slides.push({ title: 'Questions', bullets: program.queries.map((q) => q.sentence) });
  if (program.drilled.length) slides.push({ title: 'What the vague words mean', bullets: program.drilled.map((d) => `${d.word}: ${d.how}`) });
  return { slides };
}

// Rules as a flowchart: a box per predicate, an arrow from each condition to its result.
export function toEtcher(program) {
  const nodes = new Map();
  const edges = [];
  const node = (g) => {
    const k = `${g.f}/${g.args.length}`;
    if (!nodes.has(k)) nodes.set(k, { id: k, label: g.f.replace(/_/g, ' '), kind: 'predicate' });
    return k;
  };
  for (const c of program.clauses) {
    if (!c.body) continue;
    const to = node(c.head);
    for (const g of unconj(c.body)) {
      const goal = g.f === '\\+' ? g.args[0] : g;
      if (isVar(goal) || isNum(goal) || ['>=', '=<', '>', '<', '=:=', 'is', 'findall', 'sum_list', 'length', 'max_list', 'min_list'].includes(goal.f)) continue;
      edges.push({ from: node(goal), to, label: g.f === '\\+' ? 'not' : '' });
    }
  }
  // layers: a result sits one row below the lowest of its conditions
  const level = new Map([...nodes.keys()].map((k) => [k, 0]));
  for (let pass = 0; pass < nodes.size; pass++) {
    let moved = false;
    for (const e of edges) if (e.from !== e.to && level.get(e.to) <= level.get(e.from)) { level.set(e.to, level.get(e.from) + 1); moved = true; }
    if (!moved) break;
  }
  const rows = new Map();
  for (const [k, l] of level) rows.set(l, [...(rows.get(l) ?? []), k]);
  const shapes = [...nodes.values()].map((n) => {
    const row = rows.get(level.get(n.id));
    return { ...n, x: 40 + row.indexOf(n.id) * 180, y: 40 + level.get(n.id) * 110, w: 140, h: 56 };
  });
  return { shapes, arrows: edges };
}

// Facts as database tables: one table per predicate, one column per argument.
export function toTabler(program) {
  const tables = new Map();
  for (const c of program.clauses) {
    if (c.body) continue;
    const k = `${c.head.f}/${c.head.args.length}`;
    if (!tables.has(k)) tables.set(k, { name: c.head.f, columns: c.head.args.map((_, i) => (i === 0 ? 'name' : c.head.args.length === 2 ? 'value' : `arg${i + 1}`)), rows: [] });
    tables.get(k).rows.push(c.head.args.map((a) => (isNum(a) ? a : show(a))));
  }
  const views = program.clauses.filter((c) => c.body).map((c) => ({ name: c.head.f, sentence: describeClause(c, program.lexicon) }));
  return { tables: [...tables.values()], views };
}

export { kindOf };
