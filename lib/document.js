// The Office document: one JSON format shared by every app, with a Prolog form beside it
// and a change history that keeps deletions, changes and additions. Each history entry
// records who made it (the user, the character, a plug-in) and its exact inverse, so any
// entry can be undone, including only the character's own edits.
import { atom, showProgram, t } from './terms.js';

let counter = 0;
export const newId = (prefix = 'b') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export function createDocument({ app = 'writer', title = 'Untitled', blocks = [], data = {}, opinion = '' } = {}) {
  return { format: 'lucianoffice/1', id: newId('d'), app, title, blocks: blocks.map((b) => ({ id: b.id ?? newId(), ...b })), data, opinion, history: [], redo: [], seq: 0 };
}

const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const indexOf = (doc, id) => doc.blocks.findIndex((b) => b.id === id);

// Ops:
//   { op: 'insert', at, block }        { op: 'delete', id }
//   { op: 'set', id, key, value }      { op: 'move', id, to }
//   { op: 'data', key, value }         { op: 'opinion', value }   { op: 'title', value }
// applyOp mutates d and returns the op that undoes it.
function applyOp(d, op) {
  switch (op.op) {
    case 'insert': {
      const block = { id: op.block.id ?? newId(), ...clone(op.block) };
      const at = Math.max(0, Math.min(op.at ?? d.blocks.length, d.blocks.length));
      d.blocks.splice(at, 0, block);
      return { op: 'delete', id: block.id };
    }
    case 'delete': {
      const i = indexOf(d, op.id);
      if (i < 0) throw new Error(`no block ${op.id}`);
      const [block] = d.blocks.splice(i, 1);
      return { op: 'insert', at: i, block };
    }
    case 'set': {
      const b = d.blocks[indexOf(d, op.id)];
      if (!b) throw new Error(`no block ${op.id}`);
      const before = clone(b[op.key]);
      if (op.value === undefined) delete b[op.key]; else b[op.key] = clone(op.value);
      return { op: 'set', id: op.id, key: op.key, value: before };
    }
    case 'move': {
      const i = indexOf(d, op.id);
      if (i < 0) throw new Error(`no block ${op.id}`);
      const [block] = d.blocks.splice(i, 1);
      d.blocks.splice(Math.max(0, Math.min(op.to, d.blocks.length)), 0, block);
      return { op: 'move', id: op.id, to: i };
    }
    case 'data': {
      const before = clone(d.data[op.key]);
      if (op.value === undefined) delete d.data[op.key]; else d.data[op.key] = clone(op.value);
      return { op: 'data', key: op.key, value: before };
    }
    case 'opinion': { const before = d.opinion; d.opinion = op.value; return { op: 'opinion', value: before }; }
    case 'title': { const before = d.title; d.title = op.value; return { op: 'title', value: before }; }
    default: throw new Error(`unknown op ${op.op}`);
  }
}

function run(doc, ops) {
  const d = clone({ ...doc, history: [], redo: [] });
  const inverse = [];
  for (const op of ops) inverse.unshift(applyOp(d, op));
  return { d, inverse };
}

// Apply ops as one undoable step. Returns a new document; the old one is unchanged.
export function apply(doc, ops, { by = 'user', label = '' } = {}) {
  if (!ops.length) return doc;
  const context = {};
  for (const op of ops) if (op.op === 'delete') { const i = indexOf(doc, op.id); context[op.id] = i > 0 ? doc.blocks[i - 1].id : null; }
  const { d, inverse } = run(doc, ops);
  const seq = doc.seq + 1;
  const entry = { seq, at: new Date().toISOString(), by, label: label || describeOps(ops), ops: clone(ops), inverse, touches: touched(doc, ops), context };
  return { ...d, history: [...doc.history, entry], redo: [], seq };
}

function touched(doc, ops) {
  const ids = new Set();
  for (const op of ops) {
    if (op.id) ids.add(op.id);
    if (op.op === 'insert' && op.block.id) ids.add(op.block.id);
    if (op.op === 'data') ids.add(`data:${op.key}`);
    if (op.op === 'opinion') ids.add('opinion');
    if (op.op === 'title') ids.add('title');
  }
  return [...ids];
}

export function undo(doc) {
  const entry = doc.history[doc.history.length - 1];
  if (!entry) return { doc, undone: null };
  const { d } = run(doc, entry.inverse);
  return { doc: { ...d, history: doc.history.slice(0, -1), redo: [...doc.redo, entry], seq: doc.seq }, undone: entry };
}

export function redo(doc) {
  const entry = doc.redo[doc.redo.length - 1];
  if (!entry) return { doc, redone: null };
  const { d, inverse } = run(doc, entry.ops);
  return { doc: { ...d, history: [...doc.history, { ...entry, inverse }], redo: doc.redo.slice(0, -1), seq: doc.seq }, redone: entry };
}

// Undo the latest step made by one actor (e.g. 'character'), even with later steps by
// others, as long as no later step touched the same blocks; otherwise say why not.
export function undoLastBy(doc, by) {
  let i = doc.history.length - 1;
  while (i >= 0 && doc.history[i].by !== by) i--;
  if (i < 0) return { doc, undone: null, reason: `nothing by ${by} to undo` };
  const entry = doc.history[i];
  const later = doc.history.slice(i + 1);
  const ids = new Set(entry.touches);
  const blockIds = entry.ops.filter((o) => o.op === 'insert').map((o) => o.block.id).filter(Boolean);
  const clash = later.find((e) => e.touches.some((x) => ids.has(x)) || (blockIds.length && e.ops.some((o) => o.op === 'move')));
  if (clash) return { doc, undone: null, reason: `a later change ("${clash.label}") also edited it; undo that first` };
  // inserts/deletes by later entries shift positions: re-anchor the inverse by block id
  const inverse = entry.inverse.map((op) => (op.op === 'insert' ? { ...op, at: positionFor(doc, entry, op) } : op));
  const { d } = run(doc, inverse);
  const history = [...doc.history.slice(0, i), ...later];
  return { doc: { ...d, history, redo: [...doc.redo, entry], seq: doc.seq }, undone: entry };
}

function positionFor(doc, entry, op) {
  // put a deleted block back after the block that preceded it when it was deleted
  const before = entry.context?.[op.block.id];
  if (before === null) return 0;
  if (before) { const i = indexOf(doc, before); if (i >= 0) return i + 1; }
  return Math.min(op.at, doc.blocks.length);
}

// What changed: additions, changes and deletions, newest first, with who made them.
export function changeLog(doc) {
  return doc.history.slice().reverse().map((e) => ({
    seq: e.seq, at: e.at, by: e.by, label: e.label,
    additions: e.ops.filter((o) => o.op === 'insert').length,
    deletions: e.ops.filter((o) => o.op === 'delete').length,
    changes: e.ops.filter((o) => !['insert', 'delete'].includes(o.op)).length
  }));
}

export function describeOps(ops) {
  const n = (kind) => ops.filter((o) => o.op === kind).length;
  const parts = [];
  if (n('insert')) parts.push(`added ${n('insert')}`);
  if (n('delete')) parts.push(`deleted ${n('delete')}`);
  if (n('set')) parts.push(`changed ${n('set')}`);
  if (n('move')) parts.push(`moved ${n('move')}`);
  if (n('data')) parts.push('updated Data');
  if (n('opinion')) parts.push('updated Opinion');
  if (n('title')) parts.push('renamed');
  return parts.join(', ');
}

// The Prolog form beside the JSON: facts any Prolog tool (and Visual Starlog) can read.
export function toProlog(doc) {
  const s = (x) => atom(String(x ?? ''));
  const clauses = [
    { head: t('document', s(doc.id), s(doc.app), s(doc.title)), body: null },
    ...doc.blocks.map((b, i) => ({ head: t('block', s(doc.id), i + 1, s(b.id), s(b.type ?? 'paragraph'), s(b.text ?? '')), body: null })),
    ...Object.entries(doc.data).map(([k, val]) => ({ head: t('data', s(doc.id), s(k), s(typeof val === 'string' ? val : JSON.stringify(val))), body: null })),
    { head: t('opinion', s(doc.id), s(doc.opinion)), body: null },
    ...doc.history.map((e) => ({ head: t('change', s(doc.id), e.seq, s(e.by), s(e.label)), body: null }))
  ];
  return `% Lucian Office document (lucianoffice/1)\n${showProgram(clauses)}\n`;
}

export const serialise = (doc) => JSON.stringify(doc, null, 2);
export function deserialise(text) {
  const doc = JSON.parse(text);
  if (doc?.format !== 'lucianoffice/1') throw new Error('not a Lucian Office document');
  return { history: [], redo: [], seq: doc.history?.length ?? 0, data: {}, opinion: '', blocks: [], ...doc };
}
