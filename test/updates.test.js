// updates.json (what LucianOS's self-updating box updates) matches scripts/install.sh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boxView, installList, listsAgree, toggleMessage } from '../lib/self-update.js';

test('updates.json lists the same apps and tools as install.sh', () => {
  const list = JSON.parse(fs.readFileSync(new URL('../updates.json', import.meta.url), 'utf8'));
  const sh = fs.readFileSync(new URL('../scripts/install.sh', import.meta.url), 'utf8');
  const install = installList(sh);
  assert.ok(install.apps.includes('lucianoffice') && install.tools.includes('mnns'));
  assert.deepEqual(listsAgree(list, install), { ok: true, missingApps: [], extraApps: [], missingTools: [], extraTools: [] });
});

test('the box: off and greyed out without a new enough LucianOS', () => {
  assert.deepEqual(boxView({ failed: true }).disabled, true);
  assert.equal(boxView({ office: true, officeInstalled: true }).checked, true);
  assert.equal(boxView({ office: true, officeInstalled: false }).disabled, true);
  assert.equal(toggleMessage(true, 1), 'Self-updating is on: Lucian Office is checked every hour.');
  assert.equal(toggleMessage(false, 6), 'Self-updating is off.');
});
