// The Self-updating box's decisions, as pure functions (no DOM, no server), so they can be
// proved and recorded: proofs/self_update.pl states them in Prolog and proves their
// properties, and io/self-update.* holds 200 inputs and outputs that both must give.
// The box itself is LucianOS's "Keep Lucian Office up to date" (Tools ▸ Updates).

export const OLD_LUCIANOS = 'Update LucianOS first (git pull in your lucianos folder, then restart it) to use self-updating.';
export const NOT_INSTALLED = "Lucian Office isn't in lucianos/apps, so there's nothing to update.";
export const ABOUT = "Optional: LucianOS pulls Lucian Office's apps and tools from GitHub every few hours (fast-forward only; repos with your own changes are left alone)";

// How the box looks, from GET /api/updates: a status, or { failed: true } when LucianOS
// had no /api/updates (too old) or couldn't be reached.
export function boxView(s) {
  if (!s || s.failed) return { checked: false, disabled: true, title: OLD_LUCIANOS };
  if (!s.officeInstalled) return { checked: Boolean(s.office), disabled: true, title: NOT_INSTALLED };
  return { checked: Boolean(s.office), disabled: false, title: ABOUT };
}

// What the window says after the box is changed.
export function toggleMessage(on, everyHours) {
  if (!on) return 'Self-updating is off.';
  const h = Number(everyHours);
  const every = h === 1 ? 'every hour' : `every ${h} hours`;
  return `Self-updating is on: Lucian Office is checked ${every}.`;
}

// The apps and tools scripts/install.sh installs (the list updates.json must match).
export function installList(sh) {
  const m = /for app in ([^;]+);/.exec(sh);
  const apps = m ? m[1].trim().split(/\s+/).filter(Boolean) : [];
  const tools = [...sh.matchAll(/^get "\$TOOLS\/([^"]+)"/gm)].map((x) => x[1]);
  return { apps, tools };
}

// Whether updates.json lists exactly what install.sh installs, in the same order, and what differs.
export function listsAgree(json, install) {
  const missing = (want, have) => want.filter((n) => !have.includes(n));
  const apps = Array.isArray(json?.apps) ? json.apps : [];
  const tools = Array.isArray(json?.tools) ? json.tools : [];
  const out = {
    missingApps: missing(install.apps, apps), extraApps: missing(apps, install.apps),
    missingTools: missing(install.tools, tools), extraTools: missing(tools, install.tools)
  };
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  return { ok: same(apps, install.apps) && same(tools, install.tools), ...out };
}
