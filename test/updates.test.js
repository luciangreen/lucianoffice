// updates.json (what LucianOS's self-updating box updates) matches scripts/install.sh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('updates.json lists the same apps and tools as install.sh', () => {
  const list = JSON.parse(fs.readFileSync(new URL('../updates.json', import.meta.url), 'utf8'));
  const sh = fs.readFileSync(new URL('../scripts/install.sh', import.meta.url), 'utf8');
  const apps = sh.match(/for app in ([^;]+);/)[1].trim().split(/\s+/);
  const tools = [...sh.matchAll(/^get "\$TOOLS\/([^"]+)"/gm)].map((m) => m[1]);
  assert.deepEqual(list.apps, apps);
  assert.deepEqual(list.tools, tools);
});
