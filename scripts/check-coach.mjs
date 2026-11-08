// The business coach's figures match a real funnel's records. Tabler's funnel check runs a
// funnel through vetusiapl2webpl in SWI-Prolog and keeps what it recorded (EVENTS_OUT); this
// reads that file two ways, the coach's way (parseEvents and periodReport) and by counting the
// lines directly, and checks they agree, with sales and ad spend added.
//   node scripts/check-coach.mjs funnel_events.pl
import fs from 'node:fs';
import { budgetStatus, dayStart, newCoach, parseEvents, periodReport } from '../index.js';

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.log(`FAIL no funnel records at ${file}`); process.exit(1); }
const text = fs.readFileSync(file, 'utf8');
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };

// counted directly from the lines
const lines = text.split('\n').filter((l) => l.startsWith('funnel_event('));
const kind = (k) => lines.filter((l) => new RegExp(`^funnel_event\\([^,]+, ${k},`).test(l)).length;
const direct = { visits: kind('visit'), signups: kind('signup'), checkouts: kind('checkout'), declined: kind('declined') };
const signupEmail = lines.filter((l) => /, signup,/.test(l)).map((l) => /"([^"]+@[^"]+)"/.exec(l)?.[1]).filter(Boolean);
console.log(`the funnel recorded ${lines.length} events: ${JSON.stringify(direct)}`);
check(lines.length > 0 && direct.visits > 0 && direct.signups > 0, 'the funnel recorded visits and sign-ups');

// the coach's way, for the day the records were made
const events = parseEvents(text);
const d = new Date(events[0].time * 1000);
const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sales = [
  { provider: 'stripe', id: 'ch_1', amount: 49, currency: 'AUD', time: dayStart(day) + 3600, email: signupEmail[0].toUpperCase(), status: 'paid' },
  { provider: 'stripe', id: 'ch_2', amount: 20, currency: 'AUD', time: dayStart(day) + 3600, email: 'someone@else.com', status: 'paid' },
  { provider: 'stripe', id: 'ch_3', amount: 49, currency: 'AUD', time: dayStart(day) + 3600, email: signupEmail[0], status: 'refunded' }
];
const spend = [{ date: day, channel: 'Search ads', amount: 10, note: '' }];
const r = periodReport({ events, sales, spend, from: day, to: day, runningPerDay: 0.5 });
const f = Object.fromEntries(r.figures.map((x) => [x.key, x.value]));
check(f.visits === direct.visits, `visits: the coach ${f.visits}, the records ${direct.visits}`);
check(f.signups === direct.signups, `sign-ups: the coach ${f.signups}, the records ${direct.signups}`);
check(f.checkouts === direct.checkouts, `chose to buy: the coach ${f.checkouts}, the records ${direct.checkouts}`);
check(r.stats.declined === direct.declined, `said no: the coach ${r.stats.declined}, the records ${direct.declined}`);
check(f.signupRate === Math.round((direct.signups / direct.visits) * 1000) / 10, `sign-up rate ${f.signupRate}%`);
check(f.sales === 1 && f.revenue === 49, `one sale matched to a sign-up by email (any case), the refund and the other sale left out: ${f.sales} sale, $${f.revenue}`);
check(f.adSpend === 10 && f.running === 0.5 && f.net === 38.5, `profit $49 − $10 ads − $0.50 running = $${f.net}`);
check(f.returnOnSpend === 4.9, `return on ad spend ${f.returnOnSpend}×`);
const b = budgetStatus({ ...newCoach().budget, monthly: 100 }, spend, day);
check(b.spent === 10 && b.remaining === 90, `budget: $${b.spent} spent, $${b.remaining} left of $100`);
console.log(failures ? `${failures} failure(s)` : "The coach's figures match the funnel's own records.");
process.exit(failures ? 1 : 0);
