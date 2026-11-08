import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STEPS, CHECKLIST_GROUP, addStep, addTask, budgetStatus, checklistItems, coachCommands, coachOf, completeStep, dayStart, findStepByName,
  funnelStats, keywords, mindMap, monthEnd, newCoach, newCoachDoc, newVps, nextImprovement, nextStep, parseEvents, parseMoney, periodReport,
  reminders, setEnabled, setEvery, stepList, stepStatus, toggleTask, vpsCosts, vpsSteps
} from '../index.js';

test('the loop: steps in order, done once or repeating, and reminders when due', () => {
  let c = newCoach();
  assert.deepEqual(stepList(c).map((s) => s.id), ['mindmap', 'research', 'funnel', 'publish', 'budget', 'track']);
  assert.equal(nextStep(c, '2026-11-08').id, 'mindmap');
  c = completeStep(c, 'mindmap', '2026-11-08');
  assert.equal(stepStatus(stepList(c)[0], '2026-11-08'), 'done');
  assert.equal(nextStep(c, '2026-11-08').id, 'research');
  c = completeStep(c, 'research', '2026-11-08');
  assert.equal(stepStatus(stepList(c)[1], '2026-11-14'), 'done');
  assert.equal(stepStatus(stepList(c)[1], '2026-11-15'), 'due');
  // turned off, publishing is skipped
  c = setEnabled(completeStep(c, 'funnel', '2026-11-09'), 'publish', false);
  assert.equal(nextStep(c, '2026-11-09').id, 'budget');
  assert.equal(stepStatus(stepList(c)[3], '2026-11-09'), 'off');
  // on 15 November research is due again (budget and tracking wait their turn)
  const due = reminders(c, '2026-11-15');
  assert.deepEqual(due.map((r) => r.id), ['research']);
  assert.match(due[0].text, /due again \(every 7 days; last done 2026-11-08\)/);
  assert.deepEqual(reminders(completeStep(c, 'research', '2026-11-15'), '2026-11-15').map((r) => r.text), [`Next: Budget advertising. ${STEPS[4].checkIn}`]);
  // repeating steps clear their ticks when done, so next week starts fresh
  c = toggleTask(c, 'research', 0);
  assert.equal(stepList(c)[1].tasks[0].done, true);
  c = completeStep(c, 'research', '2026-11-15');
  assert.equal(stepList(c)[1].tasks[0].done, false);
  c = setEvery(c, 'research', 14);
  assert.equal(stepStatus(stepList(c)[1], '2026-11-22'), 'done');
});

test('your own steps and tasks, and steps found by the names people use', () => {
  let c = addStep(newCoach(), { title: 'Write a newsletter', every: 30, after: 'funnel' });
  c = addStep(c, { title: 'Write a newsletter' });
  assert.deepEqual(stepList(c).map((s) => s.id), ['mindmap', 'research', 'funnel', 'write-a-newsletter', 'publish', 'budget', 'track', 'write-a-newsletter-2']);
  c = addTask(c, 'write-a-newsletter', 'Pick a topic');
  assert.deepEqual(stepList(c)[3].tasks, [{ text: 'Pick a topic', done: false }]);
  assert.equal(findStepByName(c, 'the market research').id, 'research');
  assert.equal(findStepByName(c, 'publishing').id, 'publish');
  assert.equal(findStepByName(c, 'advertising').id, 'budget');
  assert.equal(findStepByName(c, 'newsletter').id, 'write-a-newsletter');
});

test('the steps go into the LucianOS checklist with their repeats', () => {
  const items = checklistItems(setEnabled(newCoach(), 'publish', false));
  assert.equal(CHECKLIST_GROUP.key, 'lucianoffice-coach');
  assert.deepEqual(items.find((i) => i.key === 'research'), { key: 'research', title: 'Research the market', kind: 'url', target: '/apps/lucianoffice/?coach=research', everyDays: 7, daily: false, comment: STEPS[1].checkIn, hidden: false });
  assert.equal(items.find((i) => i.key === 'publish').hidden, true);
  assert.equal(items.find((i) => i.key === 'mindmap').everyDays, 0);
});

test('the mind map: answers as branches, and the idea\'s keywords', () => {
  const idea = { ...newCoach().idea, text: 'Short meditation courses for busy parents', forWhom: 'busy parents, office workers', problem: 'no time for meditation; stress', offer: 'ten-minute meditation lessons' };
  const m = mindMap(idea);
  assert.equal(m.centre, 'Short meditation courses for busy parents');
  assert.deepEqual(m.branches[0], { label: 'For whom', items: ['busy parents', 'office workers'] });
  assert.deepEqual(m.branches[1].items, ['no time for meditation', 'stress']);
  assert.deepEqual(m.keywords.slice(0, 3), [{ word: 'meditation', count: 3 }, { word: 'busy', count: 2 }, { word: 'parents', count: 2 }]);
  assert.deepEqual(keywords('the and of'), []);
});

test('the advertising budget: spent, left, per day, per channel and the month\'s pace', () => {
  const budget = { monthly: 300, currency: 'AUD', channels: [{ name: 'Search ads', share: 2 }, { name: 'Social ads', share: 1 }] };
  const spend = [
    { date: '2026-11-02', channel: 'Search ads', amount: 50 },
    { date: '2026-11-05', channel: 'Social ads', amount: 25 },
    { date: '2026-11-09', channel: 'Search ads', amount: 40 }, // after "today"
    { date: '2026-10-30', channel: 'Search ads', amount: 99 }, // last month
    { date: '2026-11-06', channel: 'Flyers', amount: 5 }
  ];
  const b = budgetStatus(budget, spend, '2026-11-08');
  assert.equal(monthEnd('2026-11-08'), '2026-11-30');
  assert.equal(monthEnd('2028-02-03'), '2028-02-29');
  assert.deepEqual([b.spent, b.remaining, b.perDayLeft, b.projected, b.over, b.onTrackToOverspend, b.other], [80, 220, 9.57, 300, false, false, 5]);
  assert.deepEqual(b.channels.map((c) => [c.name, c.planned, c.spent, c.left]), [['Search ads', 200, 50, 150], ['Social ads', 100, 25, 75]]);
  assert.match(b.how.perDayLeft, /\$220\.00 left ÷ 23 days left/);
  assert.equal(budgetStatus(budget, [...spend, { date: '2026-11-08', channel: 'Search ads', amount: 100 }], '2026-11-08').onTrackToOverspend, true);
  assert.equal(parseMoney('$1,250.50 a month'), 1250.5);
  assert.ok(Number.isNaN(parseMoney('lots')));
});

const EVENTS = (day) => {
  const t = (h) => dayStart(day) + h * 3600;
  return parseEvents([
    `funnel_event(${t(1)}, visit, landing).`, `funnel_event(${t(1.1)}, signup, ["Ann", "ann@example.com"]).`, `funnel_event(${t(1.2)}, checkout, "ann@example.com").`,
    `funnel_event(${t(2)}, visit, landing).`, `funnel_event(${t(2.1)}, signup, ["Ben", "ben@example.com"]).`, `funnel_event(${t(2.2)}, declined, "ben@example.com").`,
    `funnel_event(${t(3)}, visit, landing).`, `funnel_event(${t(4)}, visit, landing).`
  ].join('\n'));
};

test('the period\'s figures come from the funnel\'s records, with how each was worked out', () => {
  const events = [...EVENTS('2026-11-03'), ...EVENTS('2026-10-20')];
  const sales = [{ id: 'a', amount: 49, email: 'Ann@example.com', status: 'paid', time: dayStart('2026-11-03') + 4000 }, { id: 'b', amount: 49, email: 'zed@example.com', status: 'paid', time: dayStart('2026-11-04') }];
  const spend = [{ date: '2026-11-02', channel: 'Search ads', amount: 20 }, { date: '2026-10-20', channel: 'Search ads', amount: 7 }];
  const r = periodReport({ events, sales, spend, from: '2026-11-01', to: '2026-11-07', runningPerDay: 0.1 });
  const f = Object.fromEntries(r.figures.map((x) => [x.key, x]));
  // the same counts as the funnel's own figures for the period
  const direct = funnelStats(events, { sales, adSpend: 20, since: dayStart('2026-11-01'), until: dayStart('2026-11-08') - 0.001 });
  assert.deepEqual([f.visits.value, f.signups.value, f.checkouts.value, f.sales.value, f.revenue.value], [direct.visits, direct.signups, direct.checkouts, direct.sales, direct.revenue]);
  assert.deepEqual([f.visits.value, f.signups.value, f.signupRate.value, f.checkoutRate.value, f.sales.value, f.revenue.value], [4, 2, 50, 50, 1, 49]);
  assert.deepEqual([f.adSpend.value, f.running.value, f.net.value, f.returnOnSpend.value, f.costPerSignup.value, f.costPerSale.value], [20, 0.7, 28.3, 2.45, 10, 20]);
  assert.match(f.net.how, /\$49\.00 revenue − \$20\.00 ad spend − \$0\.70 running costs/);
  assert.match(f.sales.how, /1 other sale not from this funnel/);
  const prev = periodReport({ events, sales, spend, from: '2026-10-18', to: '2026-10-24' });
  assert.equal(prev.figures.find((x) => x.key === 'visits').value, 4);
  const withChange = periodReport({ events, sales, spend, from: '2026-11-01', to: '2026-11-07', previous: prev });
  assert.equal(withChange.figures.find((x) => x.key === 'revenue').change, 49);
});

test('the next improvement follows readable rules and says why', () => {
  const t = newCoach().thresholds;
  const rep = (s, adSpend = 0) => ({ stats: { visits: 0, signups: 0, checkouts: 0, sales: 0, revenue: 0, signupRate: 0, checkoutRate: 0, saleRate: 0, ...s }, adSpend });
  assert.equal(nextImprovement(rep({ visits: 40 }), t).area, 'visitors');
  assert.match(nextImprovement(rep({ visits: 200, signupRate: 12 }), t).because, /12% of visitors sign up, below 20%/);
  assert.equal(nextImprovement(rep({ visits: 200, signupRate: 30, checkoutRate: 5 }), t).area, 'offer');
  assert.equal(nextImprovement(rep({ visits: 200, signupRate: 30, checkoutRate: 20, checkouts: 10, saleRate: 30 }), t).area, 'payment');
  assert.equal(nextImprovement(rep({ visits: 200, signupRate: 30, checkoutRate: 20, checkouts: 10, saleRate: 80, revenue: 50 }, 100), t).area, 'advertising');
  assert.equal(nextImprovement(rep({ visits: 200, signupRate: 30, checkoutRate: 20, checkouts: 10, saleRate: 80, revenue: 500 }, 100), t).area, 'growth');
  assert.equal(nextImprovement(rep({ visits: 200, signupRate: 30, checkoutRate: 20, checkouts: 10, saleRate: 80, revenue: 150 }, 100), t).area, 'steady');
});

test('publishing to a VPS: the steps with your details, and the costs budgeted', () => {
  const v = { ...newVps(), domain: 'calmcourse.com', ip: '203.0.113.5', vpsProvider: 'Example VPS', costs: { domainPerYear: 24, vpsAmount: 10, vpsMonths: 3, setup: 6 } };
  const c = vpsCosts(v);
  assert.deepEqual([c.monthly, c.yearly, c.firstYear, c.perDay], [5.33, 63.96, 69.96, 0.1752]);
  assert.match(c.how.monthly, /\$10 for the VPS every 3 months = \$3\.33 a month, plus \$24 a year for the domain = \$2 a month/);
  const steps = vpsSteps(v);
  assert.equal(steps.length, 9);
  assert.deepEqual(steps.find((s) => s.id === 'key').commands, ['ssh-keygen -t ed25519', 'ssh-copy-id -p 22 root@203.0.113.5']);
  assert.equal(steps.find((s) => s.id === 'swipl').commands[0], "ssh -p 22 root@203.0.113.5 'apt-get update && apt-get install -y swi-prolog-nox'");
  assert.match(steps.find((s) => s.id === 'publish').detail, /folder \/var\/www\/calmcourse\.com/);
  assert.match(vpsSteps(newVps()).find((s) => s.id === 'dns').detail, /the server's IP address/);
});

test('the character runs the coach, and its changes can be undone', async () => {
  let doc = newCoachDoc();
  const cmds = coachCommands({ day: () => '2026-11-08', report: () => null });
  const say = async (text) => { const r = await cmds.perform(text, doc); assert.ok(r.matched, `understood "${text}"`); doc = r.doc; return r.say; };
  assert.match(await say("what's next"), /^Next: Mind-map the idea\. What is the idea, in one sentence\? Still to do: Write the idea/);
  assert.match(await say('my idea is short meditation courses for busy people'), /Who is it for/);
  assert.match(await say("I've finished the mind map"), /Mind-map the idea is done\. Next: Research the market/);
  assert.match(await say('I finished the market research'), /remind you again in 7 days/);
  assert.match(await say('turn off publishing'), /Publish to a VPS is off/);
  assert.match(await say('add a task to research: call three customers'), /Added to Research the market: call three customers/);
  assert.match(await say('set my ad budget to $300 a month'), /\$300\.00 a month/);
  assert.match(await say('set my ad budget to $70 a week'), /\$303\.33 a month \(\$70\.00 a week × 52 ÷ 12\)/);
  await say('set my ad budget to $300 a month');
  assert.match(await say('I spent $40 on search ads'), /Logged \$40\.00 on Search ads\. \$40\.00 of \$300\.00 spent this month; \$260\.00 left/);
  assert.match(await say('how is the budget'), /\$40\.00 of \$300\.00 spent/);
  assert.match(await say('how is the business doing'), /Refresh figures/);
  assert.equal(coachOf(doc).idea.text, 'short meditation courses for busy people');
  assert.deepEqual(coachOf(doc).spend, [{ date: '2026-11-08', channel: 'Search ads', amount: 40, note: '' }]);
  await say('undo that');
  assert.deepEqual(coachOf(doc).spend, []);
  assert.match(await say('list the steps'), /Mind-map the idea \(done\); Research the market \(done\); Build the funnel \(todo\); Publish to a VPS \(off\)/);
});
