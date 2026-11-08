// A funnel's own records and the figures worked out from them, shared by Tabler (which
// builds and runs funnels) and the business coach (which tracks spending against them).
// Each funnel writes funnel_event(Time, Event, Detail) facts to funnel_events.pl: visit,
// signup ([Name, Email, ...]), checkout (Email) and declined (Email).
import { parseProgram } from './terms.js';

const listOf = (x) => { const out = []; while (x && x.f === '[|]') { out.push(x.args[0]); x = x.args[1]; } return out; };

export function parseEvents(text) {
  const events = [];
  const clauses = parseProgram(String(text ?? '').split('\n').filter((l) => /^funnel_event\(/.test(l.trim())).join('\n'));
  for (const c of clauses) {
    if (c.body || c.head.f !== 'funnel_event' || c.head.args.length !== 3) continue;
    const [t, e, d] = c.head.args;
    const plain = (x) => (typeof x === 'number' ? x : x.f === '[|]' ? listOf(x).map(plain) : x.f);
    events.push({ time: typeof t === 'number' ? t : 0, event: e.f, detail: plain(d) });
  }
  return events;
}

// Visits, sign-ups, checkouts and refusals, the rates between them, and sales read from the
// payment provider, matched to the funnel by the email given at sign-up. Sales with a time
// outside since..until are left out.
export function funnelStats(events, { sales = [], adSpend = 0, since = 0, until = Infinity } = {}) {
  const inRange = events.filter((e) => e.time >= since && e.time <= until);
  const count = (k) => inRange.filter((e) => e.event === k).length;
  const visits = count('visit'), signups = count('signup'), checkouts = count('checkout'), declined = count('declined');
  const emails = new Set(inRange.filter((e) => e.event === 'signup').flatMap((e) => (Array.isArray(e.detail) ? e.detail : [e.detail])).filter((x) => typeof x === 'string' && x.includes('@')).map((x) => x.toLowerCase()));
  const paid = sales.filter((s) => s.status !== 'failed' && s.status !== 'refunded' && (s.time === undefined || (s.time >= since && s.time <= until)));
  const matched = paid.filter((s) => s.email && emails.has(s.email.toLowerCase()));
  const revenue = Math.round(matched.reduce((a, s) => a + s.amount, 0) * 100) / 100;
  const rate = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    visits, signups, checkouts, declined,
    signupRate: rate(signups, visits), checkoutRate: rate(checkouts, signups), saleRate: rate(matched.length, checkouts),
    sales: matched.length, revenue, unmatchedSales: paid.length - matched.length,
    adSpend, profit: Math.round((revenue - adSpend) * 100) / 100,
    returnOnSpend: adSpend ? Math.round((revenue / adSpend) * 100) / 100 : null,
    costPerSignup: adSpend && signups ? Math.round((adSpend / signups) * 100) / 100 : null
  };
}
