// The business coach (Lucian Office, Phase 7): workflows that take one owner from an idea to
// a running business, the advertising budget, spending against the funnel's own records, and
// a guide to publishing on a VPS. Every figure says how it was worked out.
import { api } from '/shared/api.js';
import {
  CHECKLIST_GROUP, PRODUCT_TYPES, addStep, addTask, apply, budgetStatus, characterHandler, checklistItems, coachCommands, coachOf, coachOps,
  completeStep, deserialise, mindMap, money, newCoachDoc, newVps, nextDue, nextImprovement, nextStep, parseEvents, parseMoney, periodReport,
  redo, removeStep, removeTask, reminders, reopenStep, serialise, setEnabled, setEvery, stepList, stepStatus, today, addDays, toProlog,
  toggleTask, undo, updateCoach, vpsCosts, vpsProgress, vpsSteps
} from './index.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const { dataset, ...rest } = props;
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(rest)) if (k.startsWith('aria-')) n.setAttribute(k, v); else n[k] = v;
  Object.assign(n.dataset, dataset ?? {});
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};
const say = (t) => { $('reply').textContent = t; };
const inFrame = parent !== window;

let doc = newCoachDoc();
let pick = 'mindmap';
let report = null;      // the last figures worked out
let reportNote = '';
let settings = { savePath: '', sync: true, lastReminder: '', period: '7' };

const coach = () => coachOf(doc);
const persist = () => { api.state.set('coach', settings).catch(() => {}); api.state.set('coach-doc', doc).catch(() => {}); syncChecklist(); };
function change(next, label) {
  doc = apply(doc, coachOps(next), { by: 'user', label });
  persist();
  render();
}
const edit = (label, f) => change(updateCoach(coach(), f), label);

// The steps in the LucianOS checklist, so reminders come through even when the coach is closed.
let syncTimer;
function syncChecklist() {
  if (!inFrame || !settings.sync) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => parent.postMessage({ type: 'lucianos.checklist', group: { ...CHECKLIST_GROUP, title: `Business coach: ${doc.title}` }, items: checklistItems(coach()) }, location.origin), 400);
}
const finishInChecklist = (id) => { if (inFrame && settings.sync) parent.postMessage({ type: 'lucianos.checklist', group: CHECKLIST_GROUP, finish: id }, location.origin); };

// ------------------------------------------------------------------ helpers
const input = (value, onCommit, props = {}) => el('input', { type: 'text', value: value ?? '', onchange: (e) => onCommit(e.target.value), ...props });
const area = (value, onCommit, props = {}) => el('textarea', { value: value ?? '', onchange: (e) => onCommit(e.target.value), ...props });
const field = (label, control) => el('label', {}, label, control);
const btn = (text, onclick, props = {}) => el('button', { type: 'button', textContent: text, onclick, ...props });
const STATUS_TEXT = { done: 'done', due: 'due', todo: 'to do', off: 'off' };
const REPEATS = [[0, 'once'], [1, 'every day'], [7, 'every week'], [14, 'every 2 weeks'], [30, 'every month'], [90, 'every 3 months']];
const openApp = (app, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  if (inFrame) parent.postMessage({ type: 'lucianos.do', text: `open ${app}` }, location.origin);
  else window.open(`/apps/${app}/${qs ? `?${qs}` : ''}`, '_blank');
};

// ------------------------------------------------------------------ rendering
function render() {
  $('title').value = doc.title;
  const day = today();
  const steps = stepList(coach());
  if (!steps.some((s) => s.id === pick)) pick = steps[0].id;
  $('steps').replaceChildren(...steps.map((s, i) => {
    const st = stepStatus(s, day);
    return el('li', {}, el('button', { type: 'button', className: `step${s.id === pick ? ' on' : ''}`, onclick: () => { pick = s.id; render(); } },
      el('span', { className: 'num', textContent: String(i + 1) }), el('span', { textContent: s.title }), el('span', { className: `st ${st}`, textContent: STATUS_TEXT[st] })));
  }));
  const due = reminders(coach(), day);
  $('remind').replaceChildren(...due.slice(0, 3).map((r) => el('p', {}, el('a', { href: '#', textContent: r.text, onclick: (e) => { e.preventDefault(); pick = r.id; render(); } }))));
  const s = steps.find((x) => x.id === pick);
  $('step').replaceChildren(...stepView(s, day).filter((x) => x && x.nodeType));
}

function stepView(s, day) {
  const st = stepStatus(s, day);
  const nd = nextDue(s);
  const tools = { mindmap: ideaTools, research: () => [], funnel: funnelTools, publish: vpsTools, budget: budgetTools, track: trackTools }[s.id];
  return [
    el('h2', {}, s.title),
    s.how && el('p', { className: 'note' }, s.how),
    el('div', { className: 'checkin' }, el('strong', {}, 'Check-in: '), s.checkIn),
    field('Your notes', area(s.notes, (v) => edit('wrote notes', (c) => { (c.steps[s.id] ?? c.custom.find((x) => x.id === s.id)).notes = v; }), { placeholder: 'Your answer, what you found, what you decided' })),
    el('h3', {}, 'Tasks'),
    el('ul', { className: 'tasks' }, s.tasks.map((t, i) => el('li', { className: t.done ? 'done' : '' },
      el('input', { type: 'checkbox', checked: t.done, 'aria-label': t.text, onchange: () => change(toggleTask(coach(), s.id, i), 'ticked a task') }),
      el('span', { textContent: t.text }),
      btn('✕', () => change(removeTask(coach(), s.id, i), 'removed a task'), { title: 'Remove', className: 'small' })))),
    el('form', { className: 'row', onsubmit: (e) => { e.preventDefault(); const v = e.target.elements.task.value.trim(); if (v) change(addTask(coach(), s.id, v), 'added a task'); } },
      el('input', { type: 'text', name: 'task', placeholder: 'Add a task', 'aria-label': 'New task' }), el('button', { textContent: 'Add' })),
    ...(tools ? tools(s) : []),
    el('h3', {}, 'This step'),
    el('div', { className: 'row' },
      st === 'off'
        ? btn('Turn on', () => change(setEnabled(coach(), s.id, true), `turned on ${s.title}`))
        : btn(st === 'done' ? 'Done again' : 'Mark done', () => { change(completeStep(coach(), s.id, day), `finished ${s.title}`); finishInChecklist(s.id); const n = nextStep(coach(), day); say(`${s.title} is done.${n ? ` Next: ${n.title}.` : ''}`); }, { className: 'primary' }),
      s.doneOn && btn('Not done', () => change(reopenStep(coach(), s.id), `reopened ${s.title}`)),
      el('label', {}, 'Repeat ', el('select', { onchange: (e) => change(setEvery(coach(), s.id, e.target.value), 'changed a repeat') },
        REPEATS.some(([d]) => d === s.every) ? null : el('option', { value: s.every, textContent: `every ${s.every} days`, selected: true }),
        REPEATS.map(([d, t]) => el('option', { value: d, textContent: t, selected: d === s.every })))),
      st !== 'off' && btn('Turn off', () => change(setEnabled(coach(), s.id, false), `turned off ${s.title}`)),
      s.custom && btn('Delete step', () => { if (confirm(`Delete "${s.title}"?`)) change(removeStep(coach(), s.id), 'deleted a step'); })),
    el('p', { className: 'note' }, s.doneOn ? `Last done ${s.doneOn}.${nd ? ` Due again ${nd}.` : ''}` : 'Not done yet.')
  ];
}

// ------------------------------------------------------------------ 1. the idea
function ideaTools() {
  const idea = coach().idea;
  const set = (k) => (v) => edit('changed the idea', (c) => { c.idea[k] = v; });
  const m = mindMap(idea);
  const type = PRODUCT_TYPES[idea.type];
  return [
    el('h3', {}, 'The idea'),
    field('In one sentence', input(idea.text, set('text'), { placeholder: 'e.g. Short meditation courses for busy parents' })),
    field('Kind of business', el('select', { onchange: (e) => set('type')(e.target.value) }, el('option', { value: '', textContent: 'Choose…' }), Object.entries(PRODUCT_TYPES).map(([k, t]) => el('option', { value: k, textContent: t.name, selected: k === idea.type })))),
    type && type.products.length && el('p', { className: 'note' }, `You could sell ${type.products.join(', ')}. Make them in ${type.apps.map((a) => a[0].toUpperCase() + a.slice(1)).join(' and ')}.`),
    field('Who it is for (commas between)', input(idea.forWhom, set('forWhom'))),
    field('The problem it solves', input(idea.problem, set('problem'))),
    field('What you offer', input(idea.offer, set('offer'))),
    field('Price', input(idea.price, set('price'))),
    field('Where customers will find it', input(idea.channels, set('channels'))),
    field('Competitors', input(idea.competitors, set('competitors'))),
    el('h3', {}, 'Mind map'),
    el('div', { className: 'mm' }, el('div', { className: 'centre', textContent: m.centre }),
      m.branches.map((b) => el('div', { className: 'branch' }, el('b', {}, b.label), b.items.length ? el('ul', {}, b.items.map((x) => el('li', { textContent: x }))) : el('span', { className: 'note', textContent: '—' })))),
    el('p', {}, el('span', { className: 'note' }, 'Keywords (the words used most, leaving out common ones): '), m.keywords.length ? m.keywords.map((k) => el('span', { className: 'kw', textContent: `${k.word} ×${k.count}` })) : el('span', { className: 'note' }, 'write the idea first')),
    el('div', { className: 'row' },
      btn('Grammar Logic on it', () => {
        if (!idea.text.trim()) { say('Write the idea first.'); return; }
        if (inFrame) { parent.postMessage({ type: 'lucianos.gl', topic: m.keywords[0]?.word ?? idea.text }, location.origin); say(`Grammar Logic is running on "${m.keywords[0]?.word ?? idea.text}" in LucianOS; its 80 words open in iEdit.`); } else say('Grammar Logic runs from inside LucianOS.');
      }),
      el('span', { className: 'note' }, 'Grammar Logic adds 79 related words to the main keyword, to give you more directions.'))
  ];
}

// ------------------------------------------------------------------ 3. the funnel
function funnelTools() {
  return [el('h3', {}, 'In Tabler'),
    el('p', { className: 'note' }, "The funnel is built in Tabler's Funnel tab: headline, sign-up fields, offer, price and payment link, with a live preview. Run it there (Publish ▸ Run funnel) and try both choices; each visit appears in the figures here."),
    el('div', { className: 'row' }, btn('Open Tabler', () => openApp('tabler', { tab: 'funnel' })))];
}

// ------------------------------------------------------------------ 4. publishing
function vpsTools() {
  const v = coach().vps ?? newVps();
  const setV = (label, f) => edit(label, (c) => { c.vps ??= newVps(); f(c.vps); });
  const num = (v0, k) => input(String(v0), (x) => setV('changed a cost', (vv) => { vv.costs[k] = Number(parseMoney(x)) || 0; }), { inputMode: 'decimal' });
  const costs = vpsCosts(v);
  const prog = vpsProgress(v);
  return [
    el('h3', {}, 'Your details'),
    el('div', { className: 'row' },
      field('Domain company', input(v.domainProvider, (x) => setV('changed the domain company', (vv) => { vv.domainProvider = x; }))),
      field('VPS company', input(v.vpsProvider, (x) => setV('changed the VPS company', (vv) => { vv.vpsProvider = x; })))),
    el('div', { className: 'row' },
      field('Domain', input(v.domain, (x) => setV('changed the domain', (vv) => { vv.domain = x.trim().toLowerCase(); }), { placeholder: 'yourdomain.com' })),
      field('Server IP address', input(v.ip, (x) => setV('changed the IP address', (vv) => { vv.ip = x.trim(); }), { inputMode: 'decimal' })),
      field('User', input(v.user, (x) => setV('changed the user', (vv) => { vv.user = x.trim(); }))),
      field('ssh port', input(String(v.sshPort), (x) => setV('changed the ssh port', (vv) => { vv.sshPort = Number(x) || 22; }), { inputMode: 'numeric' }))),
    el('h3', {}, 'Costs'),
    el('div', { className: 'row' },
      field('VPS price ($)', num(v.costs.vpsAmount, 'vpsAmount')), field('every (months)', num(v.costs.vpsMonths, 'vpsMonths')),
      field('Domain a year ($)', num(v.costs.domainPerYear, 'domainPerYear')), field('Setting up ($)', num(v.costs.setup, 'setup'))),
    el('table', { className: 'fig' }, [['A month', costs.monthly, costs.how.monthly], ['A year', costs.yearly, costs.how.yearly], ['The first year', costs.firstYear, costs.how.firstYear]]
      .map(([k, n, how]) => el('tr', {}, el('td', {}, k, el('details', { className: 'how' }, el('summary', {}, 'How?'), el('p', {}, how))), el('td', { className: 'n', textContent: money(n) })))),
    el('p', { className: 'note' }, `The running costs (${money(costs.perDay)} a day) are taken off the profit in Track spend and returns.`),
    el('h3', {}, `Steps (${prog.done} of ${prog.total} done)`),
    ...vpsSteps(v).map((st, i) => el('div', { className: `vstep${v.done?.[st.id] ? ' done' : ''}` },
      el('label', {}, el('input', { type: 'checkbox', checked: !!v.done?.[st.id], onchange: (e) => setV('ticked a publishing step', (vv) => { vv.done = { ...(vv.done ?? {}), [st.id]: e.target.checked }; }) }), `${i + 1}. ${st.title}`),
      el('p', {}, st.detail),
      (st.commands ?? []).map((c) => el('div', { className: 'row' }, el('pre', { className: 'cmd', textContent: c }), btn('Copy', () => navigator.clipboard?.writeText(c).then(() => say('Copied.'), () => say(c)), { className: 'small' })))))
  ];
}

// ------------------------------------------------------------------ 5. the budget
function budgetTools() {
  const c = coach();
  const b = budgetStatus(c.budget, c.spend, today());
  const row = (label, value, how) => el('tr', {}, el('td', {}, label, how && el('details', { className: 'how' }, el('summary', {}, 'How?'), el('p', {}, how))), el('td', { className: 'n', textContent: value }));
  return [
    el('h3', {}, 'The budget'),
    el('div', { className: 'row' },
      field('A month ($)', input(c.budget.monthly ? String(c.budget.monthly) : '', (v) => edit('set the budget', (cc) => { cc.budget.monthly = Math.max(0, parseMoney(v) || 0); }), { inputMode: 'decimal', placeholder: 'what you can afford to lose' })),
      field('Currency', input(c.budget.currency, (v) => edit('set the currency', (cc) => { cc.budget.currency = v.trim().toUpperCase(); })))),
    el('p', { className: 'note' }, 'Channels and their shares of the budget:'),
    ...c.budget.channels.map((ch, i) => el('div', { className: 'row' },
      input(ch.name, (v) => edit('renamed a channel', (cc) => { const old = cc.budget.channels[i].name; cc.budget.channels[i].name = v.trim() || old; for (const s of cc.spend) if (s.channel === old) s.channel = cc.budget.channels[i].name; }), { 'aria-label': 'Channel' }),
      input(String(ch.share), (v) => edit('changed a share', (cc) => { cc.budget.channels[i].share = Math.max(0, Number(v) || 0); }), { inputMode: 'decimal', 'aria-label': 'Share', style: 'max-width:5em' }),
      btn('✕', () => edit('removed a channel', (cc) => cc.budget.channels.splice(i, 1)), { className: 'small' }))),
    el('div', { className: 'row' }, btn('Add channel', () => edit('added a channel', (cc) => cc.budget.channels.push({ name: 'New channel', share: 0 })))),
    el('h3', {}, `This month (${b.month})`),
    el('table', { className: 'fig' },
      row('Spent', money(b.spent), b.how.spent), row('Left', money(b.remaining), b.how.remaining), row('Can spend each day left', money(b.perDayLeft), b.how.perDayLeft), row('At this pace, the month ends at', money(b.projected), b.how.projected),
      b.channels.map((ch) => row(ch.name, `${money(ch.spent)} of ${money(ch.planned)}`, ch.how)),
      b.other ? row('Other channels', money(b.other)) : null),
    (b.over || b.onTrackToOverspend) && el('div', { className: 'advice warn' }, b.over ? `You are ${money(b.spent - b.monthly)} over this month's budget.` : 'At this pace you will go over the budget this month: spend less each day, or raise the budget if the ads are paying for themselves.'),
    el('h3', {}, 'Log a payment'),
    el('form', { className: 'row', onsubmit: (e) => {
      e.preventDefault();
      const f = e.target.elements; const n = parseMoney(f.amount.value);
      if (!(n > 0)) { say('Enter the amount as a number.'); return; }
      edit('logged ad spend', (cc) => cc.spend.push({ date: f.date.value || today(), channel: f.channel.value, amount: n, note: f.note.value.trim() }));
    } },
    el('input', { type: 'date', name: 'date', value: today(), 'aria-label': 'Date' }),
    el('select', { name: 'channel', 'aria-label': 'Channel' }, c.budget.channels.map((ch) => el('option', { value: ch.name, textContent: ch.name }))),
    el('input', { type: 'text', name: 'amount', inputMode: 'decimal', placeholder: 'Amount', 'aria-label': 'Amount', style: 'max-width:7em' }),
    el('input', { type: 'text', name: 'note', placeholder: 'Note', 'aria-label': 'Note' }),
    el('button', { textContent: 'Log' })),
    c.spend.length ? el('table', { className: 'fig' }, el('tr', {}, el('th', {}, 'Date'), el('th', {}, 'Channel'), el('th', {}, 'Note'), el('th', { className: 'n' }, 'Amount'), el('th', {})),
      [...c.spend.map((s, i) => ({ s, i }))].sort((a, b2) => b2.s.date.localeCompare(a.s.date)).slice(0, 30).map(({ s, i }) => el('tr', {}, el('td', {}, s.date), el('td', {}, s.channel), el('td', {}, s.note), el('td', { className: 'n' }, money(s.amount)), el('td', {}, btn('✕', () => edit('removed a payment', (cc) => cc.spend.splice(i, 1)), { className: 'small' }))))) : null
  ];
}

// ------------------------------------------------------------------ 6. tracking
async function tablerSetup() {
  const ts = (await api.state.get('tabler').catch(() => null)) ?? {};
  const td = await api.state.get('tabler-doc').catch(() => null);
  const title = td?.title ?? 'My shop';
  const slug = String(title).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'site';
  return {
    folder: (ts.folder || `Documents/Tabler/${slug}`).replace(/\/$/, ''),
    tabler: ts.tabler || 'lucianos/apps/tabler', keysFile: ts.keysFile || '.lucianoffice/payment-keys.json',
    provider: td?.data?.funnel?.provider ?? 'stripe', funnel: td?.data?.funnel?.name ?? title
  };
}

function periodDays(day) {
  if (settings.period === 'month') return { from: `${day.slice(0, 7)}-01`, to: day };
  const n = Number(settings.period) || 7;
  return { from: addDays(day, -(n - 1)), to: day };
}

async function refreshFigures() {
  const t = await tablerSetup();
  const path = `${t.folder}/funnel/funnel_events.pl`;
  let events = [];
  try { events = parseEvents((await api.files.read(path)).content); } catch { reportNote = `No funnel records yet at ${path}: run the funnel from Tabler's Publish tab.`; }
  let sales = [];
  say(`Reading the funnel's records and sales from ${t.provider}…`);
  try {
    const job = await api.jobs.start({ cmd: 'node', args: [`${t.tabler}/scripts/fetch-sales.mjs`], label: `Business coach: sales from ${t.provider}`, stdin: true });
    await api.jobs.input(job.id, `${JSON.stringify({ provider: t.provider, keysFile: t.keysFile, since: events[0]?.time ?? 0 })}\n`);
    const text = await new Promise((resolve) => { let out = ''; api.jobs.stream(job.id, { output: (ch) => { out += ch.text; }, end: () => resolve(out) }); });
    const ok = /^SALES (.*)$/m.exec(text);
    if (ok) sales = JSON.parse(ok[1]);
    else reportNote = `${reportNote ? `${reportNote} ` : ''}Sales weren't read (${(/^SALES_ERROR (.*)$/m.exec(text)?.[1] ?? text.trim()) || 'no reply'}); set up the keys file in Tabler's Funnel tab.`;
  } catch (err) { reportNote = `${reportNote ? `${reportNote} ` : ''}Sales weren't read: ${err.message}.`; }
  const day = today();
  const { from, to } = periodDays(day);
  const len = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const c = coach();
  const perDay = c.vps ? vpsCosts(c.vps).perDay : 0;
  const prevTo = addDays(from, -1);
  const previous = periodReport({ events, sales, spend: c.spend, from: addDays(prevTo, -(len - 1)), to: prevTo, runningPerDay: perDay });
  report = periodReport({ events, sales, spend: c.spend, from, to, runningPerDay: perDay, previous });
  report.funnel = t.funnel;
  say(`Worked out the figures for ${from} to ${to} from ${events.length} funnel record${events.length === 1 ? '' : 's'} and ${sales.length} sale${sales.length === 1 ? '' : 's'}.`);
  render();
}

function trackTools() {
  const c = coach();
  const periods = [['7', 'the last 7 days'], ['30', 'the last 30 days'], ['month', 'this month']];
  const out = [
    el('h3', {}, 'Figures'),
    el('div', { className: 'row' },
      el('label', {}, 'For ', el('select', { onchange: (e) => { settings.period = e.target.value; persist(); if (report) refreshFigures(); } }, periods.map(([v, t]) => el('option', { value: v, textContent: t, selected: v === settings.period })))),
      btn('Refresh figures', refreshFigures, { className: 'primary' })),
    reportNote && el('p', { className: 'note' }, reportNote)
  ];
  if (!report) return [...out, el('p', { className: 'note' }, "Refresh to read the funnel's records (from Tabler) and your sales, against the ad spend you logged.")];
  const imp = nextImprovement(report, c.thresholds);
  const change = (f) => (f.change === undefined || f.change === 0 ? '' : ` (${f.change > 0 ? '+' : ''}${['revenue', 'adSpend', 'running', 'net', 'costPerSignup', 'costPerSale'].includes(f.key) ? money(f.change) : Math.round(f.change * 10) / 10})`);
  const good = (f) => (['adSpend', 'running', 'costPerSignup', 'costPerSale'].includes(f.key) ? f.change < 0 : f.change > 0);
  out.push(
    el('p', { className: 'note' }, `${report.funnel}: ${report.from} to ${report.to}, compared with the ${Math.round((Date.parse(report.to) - Date.parse(report.from)) / 86400000) + 1} days before. Open "How?" to see how a figure was worked out, and say what you think of the method.`),
    el('table', { className: 'fig' }, report.figures.map((f) => el('tr', {},
      el('td', {}, f.label, el('details', { className: 'how' }, el('summary', {}, 'How?'), el('p', {}, f.how),
        el('input', { type: 'text', value: c.opinions?.[f.key] ?? '', placeholder: 'Your opinion of this method, or how to improve it', 'aria-label': `Opinion on ${f.label}`, onchange: (e) => edit('wrote an opinion', (cc) => { cc.opinions = { ...(cc.opinions ?? {}), [f.key]: e.target.value }; }) }))),
      el('td', { className: 'n' }, f.show, f.change ? el('span', { className: good(f) ? 'up' : 'down', textContent: change(f) }) : null)))),
    el('div', { className: `advice${['visitors', 'steady', 'growth'].includes(imp.area) ? '' : ' warn'}` }, el('strong', {}, 'Next improvement: '), imp.advice, el('br'), el('span', { className: 'note' }, `Because ${imp.because}.`)),
    el('details', { className: 'how' }, el('summary', {}, 'The rules (change them to suit your business)'),
      el('div', { className: 'row' },
        ...[['minVisits', 'Judge after visits'], ['signupRate', 'Sign-up rate below (%)'], ['checkoutRate', 'Chose-to-buy rate below (%)'], ['saleRate', 'Paid rate below (%)'], ['raiseAt', 'Raise budget at return of (×)']]
          .map(([k, label]) => field(label, input(String(c.thresholds[k]), (v) => edit('changed a rule', (cc) => { cc.thresholds[k] = Number(v) || 0; }), { inputMode: 'decimal' }))))));
  return out;
}

// ------------------------------------------------------------------ the character
const commands = coachCommands({ report: () => report });
const handle = characterHandler(commands, () => doc, (d) => { doc = d; persist(); render(); }, {});
async function sayDo(text) {
  const reply = await handle({ intent: 'unknown', text }, text);
  say(reply ?? `I don't know how to do that in the coach. ${commands.help()}`);
}
$('say').addEventListener('submit', async (e) => { e.preventDefault(); await sayDo($('sayText').value); $('sayText').value = ''; });
addEventListener('message', async (e) => {
  if (e.origin !== location.origin || e.data?.type !== 'lucianos.command') return;
  const reply = await handle({ intent: 'unknown', text: e.data.text }, e.data.text);
  e.source.postMessage({ type: 'lucianos.reply', id: e.data.id, text: reply }, location.origin);
});
if (inFrame) parent.postMessage({ type: 'lucianos.commands', names: commands.list().map((c) => c.name) }, location.origin);

// ------------------------------------------------------------------ files
async function save() {
  const path = prompt('Save as (relative to your home folder)', settings.savePath || `Documents/${(doc.title || 'My business').replace(/[^\w -]/g, '')}.coach.json`);
  if (!path) return;
  await api.files.write(path, serialise(doc), { mkdirs: true, force: true });
  await api.files.write(path.replace(/\.json$/, '') + '.pl', toProlog(doc), { mkdirs: true, force: true });
  settings.savePath = path;
  persist();
  say(`Saved ${path}, with its Prolog form beside it.`);
}
async function open() {
  const path = prompt('Open which .coach.json file?', settings.savePath || '');
  if (!path) return;
  try { const d = deserialise((await api.files.read(path)).content); if (d.app !== 'coach') throw new Error('that is not a coach file'); doc = d; settings.savePath = path; report = null; persist(); render(); } catch (err) { say(`Couldn't open it: ${err.message}`); }
}

// ------------------------------------------------------------------ start
async function init() {
  settings = { ...settings, ...((await api.state.get('coach').catch(() => null)) ?? {}) };
  const d = await api.state.get('coach-doc').catch(() => null);
  if (d?.format === 'lucianoffice/1' && d.app === 'coach') doc = d;
  const params = new URLSearchParams(location.search);
  const want = params.get('coach');
  if (want && stepList(coach()).some((s) => s.id === want)) pick = want;
  else pick = nextStep(coach())?.id ?? 'mindmap';
  $('sync').checked = settings.sync;
  $('sync').onchange = () => { settings.sync = $('sync').checked; persist(); };
  $('title').onchange = () => { doc = apply(doc, [{ op: 'title', value: $('title').value.trim() || 'My business' }], { by: 'user', label: 'renamed' }); persist(); render(); };
  $('undo').onclick = () => { doc = undo(doc).doc; persist(); render(); };
  $('redo').onclick = () => { doc = redo(doc).doc; persist(); render(); };
  $('save').onclick = save;
  $('open').onclick = open;
  $('addStep').onclick = () => { const t = prompt('The new step', 'Write a newsletter'); if (t?.trim()) { change(addStep(coach(), { title: t, after: pick }), 'added a step'); pick = stepList(coach()).find((s) => s.title === t.trim())?.id ?? pick; render(); } };
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea')) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doc = (e.shiftKey ? redo(doc) : undo(doc)).doc; persist(); render(); }
  });
  render();
  syncChecklist();
  // the character says the day's first reminder, once a day
  const due = reminders(coach());
  if (inFrame && due.length && settings.lastReminder !== today()) { settings.lastReminder = today(); persist(); parent.postMessage({ type: 'lucianos.say', text: due[0].text }, location.origin); }
  if (params.get('do')) await sayDo(params.get('do'));
}
init();
