// The command API: each app registers its commands ("add a slide about {topic}", "make
// column {col} a total") so the RetroMR character can read them, do them and say the
// status. Every command returns document ops, applied as one undoable step marked as the
// character's, so the user can undo just the character's edits.
import { apply, changeLog, redo, undo, undoLastBy } from './document.js';

// "add [a] slide about {topic}" -> /^add(?: a)? slide about (.+?)$/i with names ['topic']
export function compile(template) {
  const names = [];
  const esc = (w) => w.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
  let out = '';
  let needSep = false;
  for (const part of template.trim().toLowerCase().split(/\s+/)) {
    const opt = /^\[(.+)\]$/.exec(part);
    const word = opt ? opt[1] : part;
    const slot = /^\{(\w+)\}$/.exec(word);
    if (slot) names.push(slot[1]);
    const piece = slot ? '(.+?)' : esc(word);
    if (!opt) { out += `${needSep ? '\\s+' : ''}${piece}`; needSep = true; }
    else if (needSep) out += `(?:\\s+${piece})?`;
    else out += `(?:${piece}\\s+)?`;
  }
  return { re: new RegExp(`^${out}$`, 'is'), names };
}

const tidy = (text) => String(text ?? '').trim().replace(/[.!?]+$/, '').replace(/^(please|can you|could you|would you)\s+/i, '').replace(/\s+please$/i, '').trim();

export function createCommands({ app = 'office' } = {}) {
  const commands = [];
  const registry = {
    app,
    register(command) {
      if (!command.name || !command.patterns?.length || typeof command.run !== 'function') throw new Error('a command needs name, patterns and run');
      commands.push({ ...command, compiled: command.patterns.map(compile) });
      return registry;
    },
    list: () => commands.map((c) => ({ name: c.name, patterns: c.patterns, help: c.help ?? c.patterns[0] })),
    help: () => `In ${app} you can say: ${commands.map((c) => c.help ?? c.patterns[0]).join('; ')}.`,
    match(text) {
      const said = tidy(text);
      for (const c of commands) {
        for (const { re, names } of c.compiled) {
          const m = re.exec(said);
          if (m) return { command: c, args: Object.fromEntries(names.map((n, i) => [n, m[i + 1].trim()])) };
        }
      }
      return null;
    },
    // Do what was said. Returns { matched, doc, say }.
    async perform(text, doc, { by = 'character', ctx = {} } = {}) {
      const m = registry.match(text);
      if (!m) return { matched: false, doc, say: null };
      const result = await m.command.run({ args: m.args, doc, ctx, by });
      if (result?.doc) return { matched: true, doc: result.doc, say: result.say ?? 'Done.' };
      const ops = result?.ops ?? [];
      if (!ops.length) return { matched: true, doc, say: result?.say ?? 'There was nothing to change.' };
      const next = apply(doc, ops, { by, label: result.label ?? `${m.command.name}: ${tidy(text)}` });
      return { matched: true, doc: next, say: result.say ?? `Done: ${next.history[next.history.length - 1].label}. Say "undo that" to take it back.` };
    }
  };
  for (const c of CORE) registry.register(c);
  return registry;
}

// Commands every app has.
const CORE = [
  { name: 'undo character', patterns: ['undo that', 'undo your last change', 'undo your change', 'take that back'], help: 'undo that',
    run: ({ doc }) => { const r = undoLastBy(doc, 'character'); return { doc: r.doc, say: r.undone ? `Undone: ${r.undone.label}.` : `I couldn't: ${r.reason}.` }; } },
  { name: 'undo', patterns: ['undo', 'undo the last change'], run: ({ doc }) => { const r = undo(doc); return { doc: r.doc, say: r.undone ? `Undone: ${r.undone.label}.` : 'There is nothing to undo.' }; } },
  { name: 'redo', patterns: ['redo'], run: ({ doc }) => { const r = redo(doc); return { doc: r.doc, say: r.redone ? `Redone: ${r.redone.label}.` : 'There is nothing to redo.' }; } },
  { name: 'what changed', patterns: ['what changed', 'what have you changed', 'show the changes', 'status'], help: 'what changed',
    run: ({ doc }) => {
      const log = changeLog(doc).slice(0, 5);
      return { doc, say: log.length ? log.map((e) => `${e.by === 'character' ? 'I' : e.by === 'user' ? 'You' : e.by} ${e.label}`).join('; ') + '.' : 'Nothing has changed yet.' };
    } },
  { name: 'set data', patterns: ['set {key} to {value} in data', 'in data set {key} to {value}', 'remember that {key} is {value}'], help: 'remember that tall is 175',
    run: ({ args }) => ({ ops: [{ op: 'data', key: args.key.toLowerCase(), value: args.value }], say: `Data: ${args.key} is ${args.value}.` }) },
  { name: 'set opinion', patterns: ['my opinion is {text}', 'set the opinion to {text}'],
    run: ({ args }) => ({ ops: [{ op: 'opinion', value: args.text }], say: 'Opinion updated.' }) },
  { name: 'rename', patterns: ['rename [this] [document] to {title}', 'call [this] [document] {title}'],
    run: ({ args }) => ({ ops: [{ op: 'title', value: args.title }], say: `Renamed to ${args.title}.` }) }
];

// A handler for mountCharacter({ handle }): tries the app's commands first, then lets
// LucianOS's own character commands answer (by returning null).
export function characterHandler(registry, getDoc, setDoc, ctx = {}) {
  return async (cmd, text) => {
    if (cmd?.intent === 'help') return registry.help();
    const r = await registry.perform(text ?? cmd?.text ?? '', getDoc(), { by: 'character', ctx });
    if (!r.matched) return null;
    setDoc(r.doc);
    return r.say;
  };
}
