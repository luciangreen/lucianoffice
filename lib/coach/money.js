// The coach's numbers: the advertising budget, what was spent, and what came back, each with
// how it was worked out, so you can check the method and improve it rather than trust it.
import { funnelStats } from '../funnel-records.js';
import { addDays, daysBetween, today } from './workflows.js';

const r2 = (n) => Math.round(n * 100) / 100;
export const money = (n, currency = '') => (n === null || n === undefined || Number.isNaN(n) ? '—' : `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}${currency ? ` ${currency}` : ''}`);

// "$300", "300 a month", "AUD 40.50" -> 300, 300, 40.5
export function parseMoney(text) {
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(String(text ?? ''));
  return m ? Number(m[0].replace(/,/g, '')) : NaN;
}

// Local midnight of a YYYY-MM-DD day, in seconds (funnel records use seconds).
export const dayStart = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d).getTime() / 1000; };
export const monthOf = (day) => day.slice(0, 7);
export const monthStart = (day) => `${monthOf(day)}-01`;
export const monthEnd = (day) => { const [y, m] = day.split('-').map(Number); return `${monthOf(day)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };

export const spentBetween = (spend, from, to) => r2(spend.filter((s) => s.date >= from && s.date <= to).reduce((a, s) => a + (Number(s.amount) || 0), 0));

// This month's budget against what has been spent: per channel, what is left, what can be
// spent each remaining day, and where the month is heading at the current pace.
export function budgetStatus(budget, spend, day = today()) {
  const from = monthStart(day), to = monthEnd(day);
  const daysInMonth = daysBetween(from, to) + 1, elapsed = daysBetween(from, day) + 1, left = daysInMonth - elapsed + 1;
  const monthly = Number(budget.monthly) || 0;
  const spent = spentBetween(spend, from, day);
  const remaining = r2(monthly - spent);
  const projected = r2((spent / elapsed) * daysInMonth);
  const shares = budget.channels.reduce((a, c) => a + (Number(c.share) || 0), 0) || 1;
  const channels = budget.channels.map((c) => {
    const planned = r2((monthly * (Number(c.share) || 0)) / shares);
    const used = spentBetween(spend.filter((s) => s.channel === c.name), from, day);
    return { name: c.name, planned, spent: used, left: r2(planned - used), how: `${money(monthly)} × ${c.share} ÷ ${shares} = ${money(planned)} planned; ${money(used)} spent so far` };
  });
  const other = spentBetween(spend.filter((s) => !budget.channels.some((c) => c.name === s.channel)), from, day);
  return {
    month: monthOf(day), monthly, spent, remaining, perDayLeft: left > 0 ? r2(Math.max(remaining, 0) / left) : 0, projected,
    over: spent > monthly, onTrackToOverspend: projected > monthly && monthly > 0, channels, other,
    how: {
      spent: `the payments you logged from ${from} to ${day}`,
      remaining: `${money(monthly)} budget − ${money(spent)} spent = ${money(remaining)}`,
      perDayLeft: `${money(Math.max(remaining, 0))} left ÷ ${left} day${left === 1 ? '' : 's'} left in the month (today included)`,
      projected: `${money(spent)} ÷ ${elapsed} day${elapsed === 1 ? '' : 's'} so far × ${daysInMonth} days in the month`
    }
  };
}

// A period's figures: the funnel's records and sales, against the ad spend logged and the
// share of running costs (the VPS and domain) for the period. Each figure says how it was
// worked out; the change from the period before is shown where there is one.
export function periodReport({ events, sales = [], spend = [], from, to, runningPerDay = 0, previous = null }) {
  const adSpend = spentBetween(spend, from, to);
  const days = daysBetween(from, to) + 1;
  const running = r2(runningPerDay * days);
  const s = funnelStats(events, { sales, adSpend, since: dayStart(from), until: dayStart(addDays(to, 1)) - 0.001 });
  const net = r2(s.revenue - adSpend - running);
  const per = (a, b) => (b ? r2(a / b) : null);
  const figures = [
    { key: 'visits', label: 'Visits', value: s.visits, show: String(s.visits), how: `visit records in funnel_events.pl from ${from} to ${to}` },
    { key: 'signups', label: 'Sign-ups', value: s.signups, show: String(s.signups), how: 'signup records (each has the name and email given)' },
    { key: 'signupRate', label: 'Sign-up rate', value: s.signupRate, show: `${s.signupRate}%`, how: `${s.signups} sign-ups ÷ ${s.visits} visits × 100` },
    { key: 'checkouts', label: 'Chose to buy', value: s.checkouts, show: String(s.checkouts), how: 'checkout records (they chose yes on the offer)' },
    { key: 'checkoutRate', label: 'Chose-to-buy rate', value: s.checkoutRate, show: `${s.checkoutRate}%`, how: `${s.checkouts} ÷ ${s.signups} sign-ups × 100` },
    { key: 'sales', label: 'Sales', value: s.sales, show: String(s.sales), how: `paid sales from your provider whose email matches a sign-up in the period (${s.unmatchedSales} other sale${s.unmatchedSales === 1 ? '' : 's'} not from this funnel)` },
    { key: 'saleRate', label: 'Paid after choosing to buy', value: s.saleRate, show: `${s.saleRate}%`, how: `${s.sales} sales ÷ ${s.checkouts} who chose to buy × 100` },
    { key: 'revenue', label: 'Revenue', value: s.revenue, show: money(s.revenue), how: 'the matched sales added up (refunded and failed payments left out)' },
    { key: 'adSpend', label: 'Ad spend', value: adSpend, show: money(adSpend), how: `the payments you logged from ${from} to ${to}` },
    { key: 'running', label: 'Running costs', value: running, show: money(running), how: `${money(runningPerDay)} a day for the VPS and domain × ${days} days` },
    { key: 'net', label: 'Profit', value: net, show: money(net), how: `${money(s.revenue)} revenue − ${money(adSpend)} ad spend − ${money(running)} running costs` },
    { key: 'returnOnSpend', label: 'Return on ad spend', value: per(s.revenue, adSpend), show: adSpend ? `${per(s.revenue, adSpend)}×` : '—', how: `${money(s.revenue)} revenue ÷ ${money(adSpend)} ad spend (above 1 means the ads paid for themselves)` },
    { key: 'costPerSignup', label: 'Cost per sign-up', value: per(adSpend, s.signups), show: money(per(adSpend, s.signups)), how: `${money(adSpend)} ad spend ÷ ${s.signups} sign-ups` },
    { key: 'costPerSale', label: 'Cost per sale', value: per(adSpend, s.sales), show: money(per(adSpend, s.sales)), how: `${money(adSpend)} ad spend ÷ ${s.sales} sales` }
  ];
  if (previous) for (const f of figures) { const p = previous.figures.find((x) => x.key === f.key); if (p && typeof p.value === 'number' && typeof f.value === 'number') f.change = r2(f.value - p.value); }
  return { from, to, stats: s, adSpend, running, net, figures };
}

// The next improvement, by rules you can read and change (coach.thresholds): it looks for the
// weakest step of the funnel, in order, and says why with the numbers.
export function nextImprovement(report, t) {
  const s = report.stats;
  if (s.visits < t.minVisits) return { area: 'visitors', advice: `Get more visitors before judging the funnel: keep advertising until there are at least ${t.minVisits} visits.`, because: `${s.visits} visits so far, fewer than ${t.minVisits}` };
  if (s.signupRate < t.signupRate) return { area: 'landing page', advice: 'Improve the landing page: a clearer headline that names the result, and fewer fields.', because: `${s.signupRate}% of visitors sign up, below ${t.signupRate}%` };
  if (s.checkoutRate < t.checkoutRate) return { area: 'offer', advice: 'Improve the offer: say what is included, add a guarantee, or test a lower price.', because: `${s.checkoutRate}% of sign-ups choose to buy, below ${t.checkoutRate}%` };
  if (s.checkouts && s.saleRate < t.saleRate) return { area: 'payment', advice: 'Check the payment page: try it yourself, and make the price match the offer.', because: `${s.saleRate}% of those who chose to buy paid, below ${t.saleRate}%` };
  const roas = report.adSpend ? s.revenue / report.adSpend : null;
  if (roas !== null && roas < 1) return { area: 'advertising', advice: 'The ads cost more than they bring in: lower the budget, or move it to the channel with the cheapest sign-ups.', because: `return on ad spend is ${r2(roas)}×, below 1×` };
  if (roas !== null && roas >= t.raiseAt) return { area: 'growth', advice: 'The ads pay well: raise next month\'s budget by a fifth and watch whether the return holds.', because: `return on ad spend is ${r2(roas)}×, at least ${t.raiseAt}×` };
  return { area: 'steady', advice: 'Every step is above your thresholds: try one new headline or channel and compare next period.', because: 'no figure is below its threshold' };
}
