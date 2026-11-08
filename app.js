// Lucian Office: the Converter workbench (Phase 1). Describe something in plain English,
// answer the follow-up questions, and see the Prolog, the proof, the readable text at your
// year level, and the first version in each app's format.
import { api } from '/shared/api.js';

// LucianOS opens the business coach as /apps/lucianoffice/?coach=<step> (from its checklist).
if (new URLSearchParams(location.search).has('coach')) location.replace(`coach.html${location.search}`);
import {
  YEAR_LEVELS, acceptOptimised, apply, changeLog, characterHandler, convert, createCommands, createDocument,
  deserialise, optimiseJobSpec, serialise, showProgram, toProlog, undoLastBy
} from './index.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};

let doc = createDocument({ app: 'lucianoffice', title: 'Untitled', blocks: [{ type: 'description', text: '' }] });
let result = null;
let settings = { yearLevel: 'pg', mnns: '', savePath: '' };
let tab = 'text';
const TABS = [['text', 'Text'], ['prolog', 'Prolog'], ['proof', 'Proof'], ['answers', 'Answers'], ['formats', 'Formats'], ['history', 'Changes']];

const description = () => doc.blocks.find((b) => b.type === 'description');
const status = (text, cls = 'quiet') => { $('status').textContent = text; $('status').className = `status ${cls}`; };
const persist = () => {
  api.state.set('lucianoffice', settings).catch(() => {});
  api.state.set('lucianoffice-doc', doc).catch(() => {});
};

function change(ops, by = 'user', label = '') {
  doc = apply(doc, ops, { by, label });
  persist();
}

// ------------------------------------------------------------------ converting
function run() {
  const text = $('input').value;
  if (text !== description().text) change([{ op: 'set', id: description().id, key: 'text', value: text }], 'user', 'edited the description');
  const data = Object.fromEntries(Object.entries(doc.data).map(([k, v]) => [k, v]));
  result = convert(text, { data, yearLevel: settings.yearLevel });
  const p = result.proof;
  status(p.ok ? 'Proved: the text and the Prolog say the same thing.' : 'Not proved yet: see the Proof tab.', p.ok ? 'ok' : 'error');
  renderQuestions();
  renderTab();
}

function renderQuestions() {
  const box = $('questions');
  box.replaceChildren();
  if (!result?.program.questions.length) return;
  box.append(el('h2', {}, 'Questions'));
  for (const q of result.program.questions) {
    if (q.key === 'more' || q.key.startsWith('rephrase:')) {
      box.append(el('p', { className: 'question' }, q.ask, ' ', el('button', { className: 'small', textContent: 'Edit the description', onclick: () => $('input').focus() })));
      continue;
    }
    const input = el('input', { type: 'text', inputMode: 'decimal', value: doc.data[q.key] ?? '', 'aria-label': q.ask });
    box.append(el('form', {
      className: 'question',
      onsubmit: (e) => { e.preventDefault(); change([{ op: 'data', key: q.key, value: input.value.trim() || undefined }], 'user', `answered: ${q.key}`); renderData(); run(); }
    }, el('label', {}, q.ask, ' ', input), el('button', { textContent: 'Answer' })));
  }
}

function renderData() {
  const box = $('data');
  box.replaceChildren();
  for (const [k, v] of Object.entries(doc.data)) {
    const key = el('input', { type: 'text', value: k, 'aria-label': 'Data name', className: 'k' });
    const val = el('input', { type: 'text', value: v, 'aria-label': `Value of ${k}`, className: 'v' });
    const save = () => {
      const ops = [];
      if (key.value.trim() !== k) ops.push({ op: 'data', key: k, value: undefined });
      ops.push({ op: 'data', key: key.value.trim() || k, value: val.value });
      change(ops, 'user', `changed Data: ${k}`);
      renderData();
      run();
    };
    key.onchange = save;
    val.onchange = save;
    box.append(el('div', { className: 'datarow' }, key, val, el('button', {
      className: 'small', textContent: '✕', title: `Remove ${k}`,
      onclick: () => { change([{ op: 'data', key: k, value: undefined }], 'user', `removed Data: ${k}`); renderData(); run(); }
    })));
  }
}

// ------------------------------------------------------------------ tabs
function renderTabs() {
  $('tabs').replaceChildren(...TABS.map(([id, label]) => el('button', {
    role: 'tab', textContent: label, className: id === tab ? 'on' : '', 'aria-selected': String(id === tab),
    onclick: () => { tab = id; renderTabs(); renderTab(); }
  })));
}

function renderTab() {
  const box = $('tab');
  box.replaceChildren();
  if (tab === 'history') return box.append(historyView());
  if (!result) return box.append(el('p', { className: 'quiet' }, 'Write a description and press Convert.'));
  box.append({ text: textView, prolog: prologView, proof: proofView, answers: answersView, formats: formatsView }[tab]());
}

function textView() {
  const yl = result.yearLevel;
  const s = yl.after.stats;
  const wrap = el('div');
  wrap.append(el('h3', {}, 'Readable version'), el('p', { className: 'readable' }, result.readable || '(nothing yet)'));
  wrap.append(el('p', { className: 'quiet' },
    `${yl.after.level.label}: ${s.sentences} sentences, ${s.averageWords} words each on average (longest ${s.longest}, limit ${yl.after.level.maxWords}); `,
    `${s.hardShare}% hard words; at most ${s.mostNewTerms} new terms in a paragraph (limit ${yl.after.level.maxNewTerms}).`));
  const flagged = yl.after.paragraphs.flatMap((p) => p.sentences).filter((x) => x.reasons.length);
  if (flagged.length) wrap.append(el('h3', {}, 'Still over the limits'), el('ul', {}, flagged.map((x) => el('li', {}, `"${x.text}": ${x.reasons.join('; ')}`))));
  if (yl.changes.length) wrap.append(el('h3', {}, 'Why sentences changed'), el('ul', {}, yl.changes.map((c) => el('li', {}, c.from === c.to ? c.reason : `"${c.from}" → "${c.to}": ${c.reason}`))));
  wrap.append(el('h3', {}, 'Exact version (reads back as the same Prolog)'), el('pre', { className: 'output' }, result.text));
  return wrap;
}

function prologView() {
  const p = result.program;
  return el('div', {},
    el('pre', { className: 'output mono' }, result.prolog || '% nothing yet'),
    p.drilled.length ? el('div', {}, el('h3', {}, 'Vague words, drilled down'), el('ul', {}, p.drilled.map((d) => el('li', {}, el('strong', {}, d.word), `: ${d.how}`)))) : null,
    p.leftOut.length ? el('div', {}, el('h3', {}, 'Left out (not guessed)'), el('ul', {}, p.leftOut.map((l) => el('li', {}, `"${l.sentence}": ${l.reason}`)))) : null,
    p.notes.length ? el('div', {}, el('h3', {}, 'Notes'), el('ul', {}, p.notes.map((n) => el('li', {}, n)))) : null);
}

function proofView() {
  const p = result.proof;
  const tick = (ok) => el('span', { className: ok ? 'ok' : 'error' }, ok ? '✓' : '✗');
  return el('div', {},
    el('p', {}, p.ok ? 'The conversion is proved accurate.' : 'The conversion is not proved yet.'),
    el('ul', { className: 'proof' },
      el('li', {}, tick(p.roundTrip), ' Round trip: the text written from the Prolog reads back as the same Prolog.'),
      el('li', {}, tick(p.sameQuestions), ' The same questions are asked.'),
      el('li', {}, tick(p.sameAnswers), ' Every predicate gives the same answers.'),
      el('li', {}, tick(p.checks.every((c) => c.ok)), ` Examples: ${p.checks.length ? `${p.checks.filter((c) => c.ok).length} of ${p.checks.length} come out as stated` : 'none to check'}.`),
      el('li', {}, tick(p.nothingLost), ' Nothing is lost when the text is read again.')),
    p.checks.length ? el('table', {}, el('tr', {}, el('th', {}, 'You said'), el('th', {}, 'Does the definition agree?')),
      p.checks.map((c) => el('tr', { className: c.ok ? '' : 'bad' }, el('td', {}, c.sentence),
        el('td', {}, c.ok ? 'Yes ✓' : typeof c.got === 'string' ? `No: ${c.got}` : `No ✗ (it makes "${c.said}" ${c.got ? 'true' : 'false'})`)))) : null,
    p.differences.length ? el('div', {}, el('h3', {}, 'Differences'), el('pre', { className: 'output' }, p.differences.map((d) => `#${d.index + 1}\n  from the text:   ${d.original}\n  read back:       ${d.regenerated}`).join('\n'))) : null);
}

function answersView() {
  if (!result.answers.length) return el('p', { className: 'quiet' }, 'Ask a question in the description, such as "Who is tall?", to see answers here.');
  return el('dl', {}, result.answers.flatMap((a) => [el('dt', {}, a.question), el('dd', {}, a.answers.length ? a.answers.join('; ') : 'No.')]));
}

function formatsView() {
  const f = result.formats;
  const svg = etcherSvg(f.etcher);
  return el('div', { className: 'formats' },
    el('h3', {}, 'Writer'), el('div', {}, f.writer.blocks.map((b) => el('p', {}, b.text))),
    el('h3', {}, 'Counter'), f.counter.rows.length ? el('table', {},
      el('tr', {}, f.counter.columns.map((c) => el('th', {}, c))),
      f.counter.rows.map((r) => el('tr', {}, r.map((x) => el('td', {}, String(x))))),
      f.counter.formulas.map((x) => el('tr', {}, el('td', {}, x.label), el('td', { colSpan: f.counter.columns.length - 1, className: 'mono' }, x.formula)))) : el('p', { className: 'quiet' }, 'No measures to put in a sheet.'),
    el('h3', {}, 'Presenter'), el('ol', { className: 'slides' }, f.presenter.slides.map((s) => el('li', {}, el('strong', {}, s.title), el('ul', {}, s.bullets.map((b) => el('li', {}, b)))))),
    el('h3', {}, 'Etcher'), svg,
    el('h3', {}, 'Tabler'), el('div', {}, f.tabler.tables.map((t) => el('table', {}, el('caption', {}, t.name.replace(/_/g, ' ')), el('tr', {}, t.columns.map((c) => el('th', {}, c))), t.rows.map((r) => el('tr', {}, r.map((x) => el('td', {}, String(x)))))))));
}

function etcherSvg({ shapes, arrows }) {
  if (!shapes.length) return el('p', { className: 'quiet' }, 'No rules to draw.');
  const ns = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const w = Math.max(...shapes.map((s) => s.x + s.w)) + 40, h = Math.max(...shapes.map((s) => s.y + s.h)) + 40;
  const svg = mk('svg', { viewBox: `0 0 ${w} ${h}`, class: 'etcher', role: 'img', 'aria-label': 'Flowchart of the rules' });
  const defs = mk('defs', {});
  const marker = mk('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
  marker.append(mk('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'currentColor' }));
  defs.append(marker);
  svg.append(defs);
  const at = new Map(shapes.map((s) => [s.id, s]));
  for (const a of arrows) {
    const f = at.get(a.from), t = at.get(a.to);
    svg.append(mk('line', { x1: f.x + f.w / 2, y1: f.y + f.h, x2: t.x + t.w / 2, y2: t.y, stroke: 'currentColor', 'marker-end': 'url(#arrow)', 'stroke-dasharray': a.label === 'not' ? '5 4' : '' }));
  }
  for (const s of shapes) {
    svg.append(mk('rect', { x: s.x, y: s.y, width: s.w, height: s.h, rx: 10, fill: 'none', stroke: 'currentColor' }));
    const tx = mk('text', { x: s.x + s.w / 2, y: s.y + s.h / 2 + 5, 'text-anchor': 'middle', fill: 'currentColor' });
    tx.textContent = s.label;
    svg.append(tx);
  }
  return svg;
}

function historyView() {
  const log = changeLog(doc);
  if (!log.length) return el('p', { className: 'quiet' }, 'No changes yet.');
  const byCharacter = log.some((e) => e.by === 'character');
  return el('div', {},
    el('div', { className: 'row' },
      el('button', { textContent: 'Undo last change', onclick: () => doCommand('undo', 'user') }),
      byCharacter ? el('button', { textContent: "Undo Lucian's last change", onclick: () => { const r = undoLastBy(doc, 'character'); doc = r.doc; persist(); $('reply').textContent = r.undone ? `Undone: ${r.undone.label}` : r.reason; afterChange(); } }) : null),
    el('ol', { reversed: true }, log.map((e) => el('li', {}, `${e.by === 'character' ? 'Lucian' : e.by === 'user' ? 'You' : e.by}: ${e.label} `,
      el('span', { className: 'quiet' }, `(${e.additions} added, ${e.changes} changed, ${e.deletions} deleted, ${new Date(e.at).toLocaleTimeString()})`)))));
}

// ------------------------------------------------------------------ commands
const commands = createCommands({ app: 'Lucian Office' })
  .register({ name: 'convert', patterns: ['convert', 'convert [it]', 'convert [the] description'], run: ({ doc: d }) => { setTimeout(run); return { doc: d, say: 'Converting.' }; } })
  .register({
    name: 'year level', patterns: ['set [the] year level to {level}', 'year level {level}', 'make it {level} level'], help: 'set the year level to 5',
    run: ({ args, doc: d }) => {
      const id = String(args.level).toLowerCase().replace(/^year\s*/, '').replace(/undergraduate|uni(versity)?/, 'ug').replace(/postgraduate|postgrad/, 'pg');
      const lv = YEAR_LEVELS.find((l) => l.id === id);
      if (!lv) return { doc: d, say: 'Say a year from 1 to 12, undergraduate or postgraduate.' };
      settings.yearLevel = lv.id;
      $('year').value = lv.id;
      setTimeout(run);
      return { ops: [{ op: 'data', key: 'year level', value: lv.label }], say: `Year level set to ${lv.label}.` };
    }
  })
  .register({
    name: 'answer', patterns: ['answer {key} with {value}', '{key} means {value}'], help: 'tall means 180',
    run: ({ args }) => { setTimeout(() => { renderData(); run(); }); return { ops: [{ op: 'data', key: args.key.toLowerCase(), value: args.value }], say: `Data: ${args.key} is ${args.value}.` }; }
  })
  .register({ name: 'optimise', patterns: ['optimise [it]', 'optimize [it]', 'optimise with mnns'], run: ({ doc: d }) => { setTimeout(optimise); return { doc: d, say: 'Optimising with mnns.' }; } })
  .register({
    name: 'describe', patterns: ['add {sentence} to the description', 'add the sentence {sentence}'], help: 'add "Cal is tall" to the description',
    run: ({ args }) => {
      const sentence = args.sentence.replace(/^["“]|["”]$/g, '').trim();
      const text = `${description().text.trim()} ${/[.!?]$/.test(sentence) ? sentence : `${sentence}.`}`.trim();
      setTimeout(() => { $('input').value = text; run(); });
      return { ops: [{ op: 'set', id: description().id, key: 'text', value: text }], say: `Added "${sentence}".` };
    }
  });

const handle = characterHandler(commands, () => doc, (d) => { doc = d; persist(); afterChange(); });

async function doCommand(text, by = 'character') {
  const r = await commands.perform(text, doc, { by });
  if (!r.matched) return null;
  doc = r.doc;
  persist();
  afterChange();
  return r.say;
}

function afterChange() {
  const d = description();
  if (d && $('input').value !== d.text) $('input').value = d.text;
  $('opinion').value = doc.opinion;
  renderData();
  if (tab === 'history') renderTab();
}

$('say').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('sayText').value;
  const reply = await handle({ intent: 'unknown', text }, text);
  $('reply').textContent = reply ?? `I don't know how to do that here. ${commands.help()}`;
  $('sayText').value = '';
  if (tab === 'history') renderTab();
});

// The desktop character passes what is said to this window first.
addEventListener('message', async (e) => {
  if (e.origin !== location.origin || e.data?.type !== 'lucianos.command') return;
  const reply = await handle({ intent: 'unknown', text: e.data.text }, e.data.text);
  e.source.postMessage({ type: 'lucianos.reply', id: e.data.id, text: reply }, location.origin);
  if (tab === 'history') renderTab();
});
if (parent !== window) parent.postMessage({ type: 'lucianos.commands', names: commands.list().map((c) => c.name) }, location.origin);

// ------------------------------------------------------------------ optimise with mnns
async function optimise() {
  if (!result) run();
  if (!result.program.clauses.length) return status('Nothing to optimise yet.');
  if (!settings.mnns) {
    const where = prompt('Where is the mnns repository, relative to your LucianOS home folder? (for example GitHub/mnns)', 'GitHub/mnns');
    if (!where) return;
    settings.mnns = where.trim();
    persist();
  }
  const input = '.lucianoffice/optimise-in.pl', output = '.lucianoffice/optimise-out.pl';
  status('Optimising with mnns…');
  try {
    await api.files.write(input, `${result.prolog}\n`, { mkdirs: true, force: true });
    const job = await api.jobs.start(optimiseJobSpec({ mnns: settings.mnns, input, output }));
    const out = await new Promise((resolve) => {
      let text = '';
      api.jobs.stream(job.id, { output: (c) => { text += c.text; }, end: () => resolve(text) });
    });
    const written = await api.files.read(output).then((r) => r.content, () => '');
    const r = acceptOptimised(result.program, out, written);
    if (!r.accepted) return status(`Kept the original: ${r.reason}.`, 'quiet');
    result = { ...result, program: r.program, prolog: showProgram(r.program.clauses), text: r.text, proof: r.proof };
    status(`Optimised: ${r.reason}.`, 'ok');
    renderTab();
  } catch (err) {
    status(`Couldn't optimise: ${err.message}`, 'error');
  }
}

// ------------------------------------------------------------------ open and save
async function save() {
  const path = prompt('Save as (relative to your home folder)', settings.savePath || `Documents/${doc.title.replace(/[^\w -]/g, '') || 'Untitled'}.office.json`);
  if (!path) return;
  const title = path.split('/').pop().replace(/\.office\.json$|\.json$/, '');
  if (title !== doc.title) change([{ op: 'title', value: title }], 'user', 'named the document');
  await api.files.write(path, serialise(doc), { mkdirs: true, force: true });
  await api.files.write(path.replace(/\.json$/, '') + '.pl', toProlog(doc) + (result ? `\n% The Converter's Prolog\n${result.prolog}\n` : ''), { mkdirs: true, force: true });
  settings.savePath = path;
  persist();
  status(`Saved ${path} and its Prolog form beside it.`, 'ok');
}

async function open(path) {
  path ??= prompt('Open which .office.json file?', settings.savePath || '');
  if (!path) return;
  try {
    doc = deserialise((await api.files.read(path)).content);
    settings.savePath = path;
    persist();
    afterChange();
    run();
  } catch (err) {
    status(`Couldn't open it: ${err.message}`, 'error');
  }
}

// ------------------------------------------------------------------ start
const params0 = new URLSearchParams(location.search);
async function init() {
  $('year').replaceChildren(...YEAR_LEVELS.map((l) => el('option', { value: l.id, textContent: l.label })));
  settings = { ...settings, ...((await api.state.get('lucianoffice').catch(() => null)) ?? {}) };
  const saved = await api.state.get('lucianoffice-doc').catch(() => null);
  if (saved?.format === 'lucianoffice/1') doc = saved;
  $('year').value = settings.yearLevel;
  afterChange();
  if (TABS.some(([id]) => id === params0.get('tab'))) tab = params0.get('tab');
  renderTabs();
  $('convert').onclick = run;
  $('optimise').onclick = optimise;
  $('save').onclick = save;
  $('open').onclick = () => open();
  $('year').onchange = () => { settings.yearLevel = $('year').value; persist(); if (result) run(); };
  $('opinion').onchange = () => change([{ op: 'opinion', value: $('opinion').value }], 'user', 'wrote the Opinion');
  $('addData').onclick = () => { const k = prompt('Name (for example "tall")'); if (k) { change([{ op: 'data', key: k.trim().toLowerCase(), value: '' }], 'user', `added Data: ${k}`); renderData(); } };
  const params = new URLSearchParams(location.search);
  if (params.get('text')) { $('input').value = params.get('text'); if (params.get('year')) { settings.yearLevel = params.get('year'); $('year').value = settings.yearLevel; } run(); }
  else if (params.get('open')) await open(params.get('open'));
  else if (description()?.text) run();
  else renderTab();
}
init();
