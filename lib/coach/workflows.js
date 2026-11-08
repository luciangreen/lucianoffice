// The business coach's workflows: the loop that takes one owner from an idea to a running
// business, then improves it a step at a time. Each step can be turned off, given its own
// tasks, repeated on its own schedule, or replaced by steps you add.
//
//   mind-map the idea -> research the market -> build the funnel -> publish to a VPS
//        ^                                                              |
//        +-- next improvement <- track spend and returns <- budget advertising

const pad = (n) => String(n).padStart(2, '0');
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
export const addDays = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// The built-in steps. every: days between repeats (0 = once). app/tab: where the work is done.
export const STEPS = [
  { id: 'mindmap', title: 'Mind-map the idea', every: 0, app: '', how: 'Your idea, who it is for and the problem it solves, with keywords from it (and Grammar Logic if you like).',
    tasks: ['Write the idea in one sentence', 'Say who it is for', 'Say what problem it solves', 'Find its keywords'], checkIn: 'What is the idea, in one sentence?' },
  { id: 'research', title: 'Research the market', every: 7, app: '', how: 'A weekly look at competitors, prices and what customers say.',
    tasks: ['Find three competitors and their prices', 'Ask three possible customers what they would pay', 'Note one thing nobody offers'], checkIn: 'What did you learn about the market this week?' },
  { id: 'funnel', title: 'Build the funnel', every: 0, app: 'tabler', tab: 'funnel', how: 'A landing page, an offer and a payment link, made in Tabler and run through vetusiapl2webpl.',
    tasks: ['Write the headline and points', 'Set the price and payment link', 'Run the funnel on this computer and try both choices'], checkIn: 'Does the funnel work from start to finish?' },
  { id: 'publish', title: 'Publish to a VPS', every: 0, app: '', how: 'A domain and a small server, with the costs budgeted, then the funnel copied there from Tabler.',
    tasks: ['Choose the domain and VPS providers', 'Buy the domain and the VPS', 'Install SWI-Prolog and set up an ssh key', 'Publish the funnel from Tabler'], checkIn: 'Is the funnel live at your domain?' },
  { id: 'budget', title: 'Budget advertising', every: 30, app: '', how: 'A monthly amount you can afford, split across channels, with each payment logged.',
    tasks: ['Set a monthly amount you can afford to lose', 'Split it across channels', 'Log each payment'], checkIn: 'How much will you spend on advertising this month?' },
  { id: 'track', title: 'Track spend and returns', every: 7, app: '', how: "The funnel's own records and your sales, against what you spent: the figures, how each was worked out, and the next improvement.",
    tasks: ['Refresh the figures', "Log this week's ad spend", 'Choose the next improvement and make it'], checkIn: 'Which figure changed most, and what will you change next?' }
];

export function newCoach() {
  return {
    idea: { text: '', type: '', forWhom: '', problem: '', offer: '', price: '', channels: '', competitors: '' },
    steps: Object.fromEntries(STEPS.map((s) => [s.id, { enabled: true, every: s.every, tasks: s.tasks.map((text) => ({ text, done: false })), doneOn: null, notes: '' }])),
    custom: [],
    budget: { monthly: 0, currency: 'AUD', channels: [{ name: 'Search ads', share: 50 }, { name: 'Social ads', share: 50 }] },
    spend: [],
    vps: null,
    thresholds: { minVisits: 100, signupRate: 20, checkoutRate: 10, saleRate: 50, raiseAt: 2 },
    opinions: {},
    tracking: { since: '', last: null }
  };
}

// Built-in and your own steps, in loop order, each with its saved settings.
export function stepList(coach) {
  const builtIn = STEPS.map((s) => ({ ...s, custom: false, ...(coach.steps?.[s.id] ?? {}) }));
  const mine = (coach.custom ?? []).map((s) => ({ how: '', app: '', checkIn: `How is "${s.title}" going?`, ...s, custom: true }));
  // your steps go after the step you put them after (or at the end)
  const out = [...builtIn];
  for (const s of mine) { const i = out.findIndex((x) => x.id === s.after); out.splice(i >= 0 ? i + 1 : out.length, 0, s); }
  return out;
}

// off | todo (not started) | done (once and done; or repeating and not yet due) | due (repeating and due again)
export function stepStatus(step, day = today()) {
  if (!step.enabled) return 'off';
  if (!step.doneOn) return 'todo';
  if (!step.every) return 'done';
  return daysBetween(step.doneOn, day) >= step.every ? 'due' : 'done';
}
export const nextDue = (step) => (step.every && step.doneOn ? addDays(step.doneOn, step.every) : null);

// The first step to work on: one not done yet, or due again, in loop order.
export function nextStep(coach, day = today()) {
  return stepList(coach).find((s) => ['todo', 'due'].includes(stepStatus(s, day))) ?? null;
}

// What the coach reminds you about today.
// The next step, and repeating steps you have done before that are due again. (Steps you
// haven't reached yet wait their turn.)
export function reminders(coach, day = today()) {
  const next = nextStep(coach, day);
  return stepList(coach).filter((s) => stepStatus(s, day) === 'due' || s.id === next?.id)
    .map((s) => ({ id: s.id, title: s.title, text: s.doneOn ? `${s.title} is due again (every ${s.every} days; last done ${s.doneOn}).` : `Next: ${s.title}. ${s.checkIn}` }));
}

// The steps as LucianOS checklist items (lucianos.checklist), so their reminders come through
// the morning question even when the coach isn't open.
export const CHECKLIST_GROUP = { key: 'lucianoffice-coach', title: 'Business coach', kind: 'url', target: '/apps/lucianoffice/?coach=1' };
export function checklistItems(coach) {
  return stepList(coach).map((s) => ({ key: s.id, title: s.title, kind: 'url', target: `/apps/lucianoffice/?coach=${encodeURIComponent(s.id)}`, everyDays: s.every || 0, daily: false, comment: s.checkIn, hidden: !s.enabled }));
}

// Changes to the coach state, as plain functions (the page and the character apply them as
// one undoable step each).
const copy = (x) => JSON.parse(JSON.stringify(x));
const findStep = (c, id) => c.steps[id] ?? c.custom.find((s) => s.id === id);
export function updateCoach(coach, f) { const c = copy(coach); f(c); return c; }
export const completeStep = (coach, id, day = today()) => updateCoach(coach, (c) => { const s = findStep(c, id); if (s) { s.doneOn = day; if (s.every) for (const t of s.tasks) t.done = false; } });
export const reopenStep = (coach, id) => updateCoach(coach, (c) => { const s = findStep(c, id); if (s) s.doneOn = null; });
export const setEnabled = (coach, id, on) => updateCoach(coach, (c) => { const s = findStep(c, id); if (s) s.enabled = on; });
export const setEvery = (coach, id, days) => updateCoach(coach, (c) => { const s = findStep(c, id); if (s) s.every = Math.max(0, Math.round(Number(days) || 0)); });
export const toggleTask = (coach, id, i) => updateCoach(coach, (c) => { const t = findStep(c, id)?.tasks[i]; if (t) t.done = !t.done; });
export const addTask = (coach, id, text) => updateCoach(coach, (c) => { findStep(c, id)?.tasks.push({ text: String(text).trim(), done: false }); });
export const removeTask = (coach, id, i) => updateCoach(coach, (c) => { findStep(c, id)?.tasks.splice(i, 1); });
export function addStep(coach, { title, every = 0, after = '' }) {
  const base = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'step';
  let id = base;
  for (let i = 2; findStep(coach, id) || STEPS.some((s) => s.id === id); i++) id = `${base}-${i}`;
  return updateCoach(coach, (c) => { c.custom.push({ id, title: String(title).trim(), every: Number(every) || 0, after, enabled: true, tasks: [], doneOn: null, notes: '' }); });
}
export const removeStep = (coach, id) => updateCoach(coach, (c) => { c.custom = c.custom.filter((s) => s.id !== id); });

// A step named the way people say it: "research", "the market research", "publishing".
export function findStepByName(coach, name) {
  const n = String(name).toLowerCase().replace(/^(the|my)\s+/, '').replace(/\s+(step|workflow)$/, '').trim();
  const steps = stepList(coach);
  const words = { mindmap: ['idea', 'mind map', 'mind-map', 'mindmap'], research: ['research', 'market'], funnel: ['funnel'], publish: ['publish', 'vps', 'server', 'domain'], budget: ['budget', 'advertising'], track: ['track', 'figures', 'returns', 'spend and returns'] };
  return steps.find((s) => s.id === n || s.title.toLowerCase() === n)
    ?? steps.find((s) => (words[s.id] ?? []).some((w) => n.includes(w)))
    ?? steps.find((s) => s.title.toLowerCase().includes(n));
}

// Information products the coach knows how to start, and the Lucian Office apps for each.
export const PRODUCT_TYPES = {
  education: { name: 'Education', products: ['a short course', 'lesson notes', 'tutoring sessions'], apps: ['writer', 'presenter'] },
  computing: { name: 'Computing', products: ['a small program or algorithm', 'code tutorials', 'a database website'], apps: ['writer', 'tabler'] },
  music: { name: 'Music composition', products: ['compositions', 'backing tracks', 'composition lessons'], apps: ['studio', 'writer'] },
  acting: { name: 'Acting', products: ['monologues', 'audition coaching', 'scene videos'], apps: ['moviemr', 'writer'] },
  other: { name: 'Something else', products: [], apps: ['writer'] }
};

// The mind map: your answers as branches, and the idea's keywords (most used words that
// aren't common ones), so you can see what the idea is mostly about.
const COMMON = new Set('a an the and or but of to in on for with at by from as is are be been was were it its this that these those i me my we our you your they them their he she his her not no so if then than very can will would should could do does did have has had about into over more most some any all each every just also only up out who what which when where why how there here'.split(' '));
export function keywords(text, n = 8) {
  const counts = new Map();
  for (const w of String(text ?? '').toLowerCase().match(/[a-z][a-z'-]+/g) ?? []) if (!COMMON.has(w) && w.length > 2) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([word, count]) => ({ word, count }));
}
export function mindMap(idea) {
  const branches = [['For whom', idea.forWhom], ['Problem', idea.problem], ['Offer', idea.offer], ['Price', idea.price], ['Channels', idea.channels], ['Competitors', idea.competitors]];
  const all = [idea.text, idea.forWhom, idea.problem, idea.offer].join(' ');
  return { centre: idea.text || 'Your idea', branches: branches.map(([label, value]) => ({ label, items: String(value ?? '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean) })), keywords: keywords(all) };
}
