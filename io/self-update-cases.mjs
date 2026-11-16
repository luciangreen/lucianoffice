// The Self-updating box's decisions (lib/self-update.js): the functions whose 200 inputs and
// outputs are in io/self-update.txt and io/self-update.jsonl. proofs/self_update.pl gives the same.
import { boxView, installList, listsAgree, toggleMessage } from '../lib/self-update.js';

export const title = 'Lucian Office self-updating';

const APPS = ['lucianoffice', 'writer', 'glinspire', 'counter', 'presenter', 'etcher', 'tabler', 'studio', 'moviemr', 'mnnaction'];
const TOOLS = ['mnns', 'S2A2', 'vetusiapl2webpl', 'Starlog'];
const FLAGS = [true, false, null, 1, 0];
const uniq = (xs) => [...new Set(xs)];

// An install.sh like the real one: a for line of apps, and get lines for tools (some commented out or indented).
function script(rnd) {
  const apps = uniq(rnd.some(APPS, 0, 5));
  const tools = uniq(rnd.some(TOOLS, 0, 3));
  const lines = ['#!/bin/sh', 'set -e'];
  if (apps.length || rnd.chance(0.5)) lines.push(`for app in ${rnd.pick(['', '  '])}${apps.join(rnd.pick([' ', '  ', '\t']))}${rnd.pick(['', ' '])}; do`, '  get "apps/$app" "$app"', 'done');
  for (const t of tools) lines.push(`${rnd.pick(['', '', '', '  ', '# '])}get "$TOOLS/${t}" ${t}${rnd.pick(['', '   # a tool'])}`);
  if (rnd.chance(0.3)) lines.push('echo "Done."');
  return lines.join('\n');
}

export const cases = [
  { name: 'boxView', run: boxView, make: (rnd) => [rnd.pick([null, { failed: true }, {}, { office: rnd.pick(FLAGS), officeInstalled: rnd.pick(FLAGS), everyHours: rnd.pick([1, 6, 24]) }, { office: rnd.pick(FLAGS), officeInstalled: true }])] },
  { name: 'toggleMessage', run: toggleMessage, make: (rnd) => [rnd.pick(FLAGS), rnd.pick([1, 2, 6, 12, 24, 168, '6'])] },
  { name: 'installList', run: installList, make: (rnd) => [script(rnd)] },
  { name: 'listsAgree', run: listsAgree, make: (rnd) => {
    const install = { apps: uniq(rnd.some(APPS, 0, 4)), tools: uniq(rnd.some(TOOLS, 0, 3)) };
    const edit = (xs, pool) => { let ys = [...xs]; if (rnd.chance(0.3)) ys.splice(rnd.int(0, ys.length), 0, rnd.pick(pool)); if (ys.length && rnd.chance(0.3)) ys.splice(rnd.int(0, ys.length - 1), 1); if (ys.length > 1 && rnd.chance(0.2)) ys.reverse(); return ys; };
    const json = rnd.chance(0.08) ? rnd.pick([null, {}, { apps: 'writer' }]) : { apps: rnd.chance(0.5) ? [...install.apps] : edit(install.apps, APPS), tools: rnd.chance(0.5) ? [...install.tools] : edit(install.tools, TOOLS) };
    return [json, install];
  } }
];
