// Plug-ins: a small interface used by GL Inspire, the Chatbot App Authorer and Etcher's
// filters. A plug-in has a name and a menu item, runs on a selection, and returns ops,
// applied as one undoable step marked with the plug-in's name.
//   { id, name, menu, apps?: ['writer'], run({ doc, selection, options, ctx }) -> { ops, say } }
// selection: { blockIds: [...], text } (what the user selected, or the whole document).
import { apply } from './document.js';

export function createPlugins() {
  const plugins = new Map();
  return {
    register(p) {
      if (!p.id || !p.name || typeof p.run !== 'function') throw new Error('a plug-in needs id, name and run');
      plugins.set(p.id, { menu: p.name, apps: null, ...p });
      return this;
    },
    list: (app) => [...plugins.values()].filter((p) => !p.apps || !app || p.apps.includes(app)).map(({ id, name, menu, apps }) => ({ id, name, menu, apps })),
    async run(id, doc, { selection = null, options = {}, ctx = {} } = {}) {
      const p = plugins.get(id);
      if (!p) throw new Error(`no plug-in ${id}`);
      const sel = selection ?? { blockIds: doc.blocks.map((b) => b.id), text: doc.blocks.map((b) => b.text ?? '').join('\n') };
      const result = (await p.run({ doc, selection: sel, options, ctx })) ?? {};
      const ops = result.ops ?? [];
      const next = ops.length ? apply(doc, ops, { by: `plugin:${id}`, label: result.label ?? p.name }) : doc;
      return { doc: next, say: result.say ?? (ops.length ? `${p.name} made ${ops.length} change${ops.length > 1 ? 's' : ''}.` : `${p.name} found nothing to change.`), result };
    }
  };
}
