// The business coach as a Lucian Office document (data.coach), so the character's changes are
// one undoable step each, and its commands: "what's next", "I've finished the research",
// "turn off publishing", "set my ad budget to $300 a month", "I spent $40 on search ads",
// "how is the business doing".
import { createCommands } from '../commands.js';
import { createDocument } from '../document.js';
import { addStep, addTask, completeStep, findStepByName, newCoach, nextStep, reminders, setEnabled, stepList, stepStatus, today } from './workflows.js';
import { budgetStatus, money, nextImprovement, parseMoney } from './money.js';

export const newCoachDoc = (coach = newCoach(), title = 'My business') => createDocument({ app: 'coach', title, data: { coach } });
export const coachOf = (doc) => doc.data.coach;
export const coachOps = (coach) => [{ op: 'data', key: 'coach', value: coach }];

const clean = (s) => String(s ?? '').trim().replace(/^["“']|["”']$/g, '').replace(/[.!]$/, '').trim();

export function coachCommands({ day = () => today(), report = () => null } = {}) {
  const reg = createCommands({ app: 'Business coach' });
  const step = (doc, name) => findStepByName(coachOf(doc), clean(name));
  reg
    .register({
      name: 'next step', patterns: ["what's next", 'what is next', 'what should i do next', 'what now', 'next step'], help: "what's next",
      run: ({ doc }) => {
        const s = nextStep(coachOf(doc), day());
        if (!s) return { ops: [], say: 'Everything is done for now. The next check-in comes when a repeating step is due.' };
        const left = s.tasks.filter((t) => !t.done).map((t) => t.text);
        return { ops: [], say: `Next: ${s.title}. ${s.checkIn}${left.length ? ` Still to do: ${left.join('; ')}.` : ''}` };
      }
    })
    .register({
      name: 'reminders', patterns: ['what is due', "what's due", 'any reminders', 'remind me'], help: "what's due",
      run: ({ doc }) => { const r = reminders(coachOf(doc), day()); return { ops: [], say: r.length ? r.map((x) => x.text).join(' ') : 'Nothing is due today.' }; }
    })
    .register({
      name: 'finish step', patterns: ["i've finished {step}", 'i have finished {step}', 'i finished {step}', 'done with {step}', 'finished {step}', 'mark {step} as done', 'mark {step} done'],
      help: "I've finished the market research",
      run: ({ args, doc }) => {
        const s = step(doc, args.step);
        if (!s) return { ops: [], say: `I don't know a step called ${clean(args.step)}.` };
        const next = completeStep(coachOf(doc), s.id, day());
        const after = nextStep(next, day());
        return { ops: coachOps(next), say: `Well done: ${s.title} is done${s.every ? `; I'll remind you again in ${s.every} days` : ''}.${after ? ` Next: ${after.title}.` : ''}` };
      }
    })
    .register({
      name: 'turn step off', patterns: ['turn off {step}', 'turn {step} off', 'skip {step}', 'disable {step}'], help: 'turn off publishing',
      run: ({ args, doc }) => { const s = step(doc, args.step); return s ? { ops: coachOps(setEnabled(coachOf(doc), s.id, false)), say: `${s.title} is off. Say "turn on ${s.title.toLowerCase()}" to bring it back.` } : { ops: [], say: `I don't know a step called ${clean(args.step)}.` }; }
    })
    .register({
      name: 'turn step on', patterns: ['turn on {step}', 'turn {step} on', 'enable {step}'], help: 'turn on publishing',
      run: ({ args, doc }) => { const s = step(doc, args.step); return s ? { ops: coachOps(setEnabled(coachOf(doc), s.id, true)), say: `${s.title} is on again.` } : { ops: [], say: `I don't know a step called ${clean(args.step)}.` }; }
    })
    .register({
      name: 'add task', patterns: ['add a task to {rest}', 'add task to {rest}'], help: 'add a task to research: call three customers',
      run: ({ args, doc }) => {
        const m = /^(.+?)\s*:\s*(.+)$/.exec(args.rest);
        if (!m) return { ops: [], say: 'Say it like "add a task to research: call three customers".' };
        const s = step(doc, m[1]);
        return s ? { ops: coachOps(addTask(coachOf(doc), s.id, clean(m[2]))), say: `Added to ${s.title}: ${clean(m[2])}.` } : { ops: [], say: `I don't know a step called ${clean(m[1])}.` };
      }
    })
    .register({
      name: 'add step', patterns: ['add a step called {title}', 'add a step {title}', 'add a workflow called {title}'], help: 'add a step called Write a newsletter',
      run: ({ args, doc }) => ({ ops: coachOps(addStep(coachOf(doc), { title: clean(args.title) })), say: `Added the step "${clean(args.title)}" at the end of the loop. You can give it tasks and a repeat in the coach.` })
    })
    .register({
      name: 'idea', patterns: ['my idea is {text}', 'the idea is {text}', 'my business is {text}'], help: 'my idea is short meditation courses for busy people',
      run: ({ args, doc }) => {
        const c = JSON.parse(JSON.stringify(coachOf(doc)));
        c.idea.text = clean(args.text);
        return { ops: coachOps(c), say: `Got it: ${c.idea.text}. Who is it for, and what problem does it solve?` };
      }
    })
    .register({
      name: 'ad budget', patterns: ['set my ad budget to {amount}', 'set the ad budget to {amount}', 'my ad budget is {amount}', 'set my advertising budget to {amount}'], help: 'set my ad budget to $300 a month',
      run: ({ args, doc }) => {
        let n = parseMoney(args.amount);
        if (!Number.isFinite(n) || n < 0) return { ops: [], say: 'How much a month, as a number?' };
        if (/week/i.test(args.amount)) n = Math.round(((n * 52) / 12) * 100) / 100;
        const c = JSON.parse(JSON.stringify(coachOf(doc)));
        c.budget.monthly = n;
        return { ops: coachOps(c), say: `Your advertising budget is ${money(n)} a month${/week/i.test(args.amount) ? ` (${money(parseMoney(args.amount))} a week × 52 ÷ 12)` : ''}.` };
      }
    })
    .register({
      name: 'log spend', patterns: ['i spent {amount} on {channel}', 'spent {amount} on {channel}', 'log {amount} on {channel}'], help: 'I spent $40 on search ads',
      run: ({ args, doc }) => {
        const n = parseMoney(args.amount);
        if (!Number.isFinite(n) || n <= 0) return { ops: [], say: 'How much, as a number?' };
        const c = JSON.parse(JSON.stringify(coachOf(doc)));
        const said = clean(args.channel).replace(/^(the|my)\s+/i, '');
        const known = c.budget.channels.find((x) => x.name.toLowerCase() === said.toLowerCase() || x.name.toLowerCase().startsWith(said.toLowerCase().split(' ')[0]));
        c.spend.push({ date: day(), channel: known?.name ?? said, amount: n, note: '' });
        const b = budgetStatus(c.budget, c.spend, day());
        return { ops: coachOps(c), say: `Logged ${money(n)} on ${known?.name ?? said}. ${b.monthly ? `${money(b.spent)} of ${money(b.monthly)} spent this month; ${money(b.remaining)} left${b.onTrackToOverspend ? ', and at this pace you would go over' : ''}.` : 'Set a monthly budget to keep track against it.'}` };
      }
    })
    .register({
      name: 'budget status', patterns: ['how much have i spent', 'how is the budget', "how's the budget", 'budget status'], help: 'how is the budget',
      run: ({ doc }) => {
        const c = coachOf(doc); const b = budgetStatus(c.budget, c.spend, day());
        return { ops: [], say: b.monthly ? `${money(b.spent)} of ${money(b.monthly)} spent this month; ${money(b.remaining)} left, about ${money(b.perDayLeft)} a day.` : `${money(b.spent)} spent this month, with no budget set.` };
      }
    })
    .register({
      name: 'how is the business', patterns: ['how is the business doing', "how's the business doing", 'how is business', 'how are we doing', 'how is it going'], help: 'how is the business doing',
      run: ({ doc }) => {
        const r = report();
        if (!r) return { ops: [], say: 'Open Track spend and returns and press Refresh figures first.' };
        const imp = nextImprovement(r, coachOf(doc).thresholds);
        const f = (k) => r.figures.find((x) => x.key === k).show;
        return { ops: [], say: `From ${r.from} to ${r.to}: ${f('visits')} visits, ${f('signups')} sign-ups, ${f('sales')} sales, revenue ${f('revenue')}, ad spend ${f('adSpend')}, profit ${f('net')}. Next: ${imp.advice} (because ${imp.because}).` };
      }
    })
    .register({
      name: 'steps', patterns: ['show the steps', 'list the steps', 'what are the steps'], help: 'list the steps',
      run: ({ doc }) => ({ ops: [], say: stepList(coachOf(doc)).map((s) => `${s.title} (${stepStatus(s, day())})`).join('; ') + '.' })
    });
  return reg;
}
