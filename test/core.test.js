import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  answers, apply, canonical, changeLog, characterHandler, compile, createCommands, createDocument, createPlugins, deserialise,
  measure, parseProgram, redo, serialise, show, showClause, simplify, toProlog, undo, undoLastBy, YEAR_LEVELS
} from '../index.js';

test('Prolog terms print and parse back', () => {
  const src = "p(X, [a, b|T], 'Hi there', -3) :-\n    q(X),\n    \\+ r(X),\n    X >= 2 + 3 * 4,\n    (s(X) ; t(X)).";
  const [c] = parseProgram(src);
  assert.equal(showClause(c), src);
  assert.equal(canonical(parseProgram('a(X, Y) :- b(Y, X).')[0]), canonical(parseProgram('a(P, Q) :- b(Q, P).')[0]));
  assert.equal(parseProgram(':- module(m, []).\nfoo.').length, 1);
});

test('the evaluator answers, counts and refuses runaway searches', () => {
  const db = parseProgram('n(1). n(2). n(3). big(X) :- n(X), X > 1. s(T) :- findall(X, n(X), L), sum_list(L, T). loop(X) :- loop(X).');
  const goal = (g) => parseProgram(`${g}.`)[0].head;
  assert.deepEqual(answers(db, goal('big(X)')), ['2', '3']);
  assert.deepEqual(answers(db, goal('s(T)')), ['6']);
  assert.deepEqual(answers(db, goal('\\+ n(4)')), ['true']);
  assert.throws(() => answers(db, goal('loop(1)')), /too deep|too many/);
});

test('year level: measured limits, with reasons', () => {
  const text = 'The council will utilise additional funding to commence construction of the new library, which will open next year, and residents can borrow books, use computers and attend classes there.';
  const m5 = measure(text, '5');
  assert.equal(m5.ok, false);
  assert.ok(m5.paragraphs[0].sentences[0].reasons.some((r) => /words; Year 5 allows 15/.test(r)));
  assert.ok(measure(text, 'pg').paragraphs[0].sentences[0].tooLong === false);
  const s = simplify(text, '5');
  assert.ok(s.changes.some((c) => c.from === 'utilise' && c.to === 'use'));
  assert.ok(s.changes.some((c) => /split in two/.test(c.reason)));
  assert.ok(s.after.stats.longest < m5.stats.longest);
  assert.equal(YEAR_LEVELS.length, 14);
});

test('documents: apply, undo, redo and the change log', () => {
  let d = createDocument({ blocks: [{ id: 'a', type: 'paragraph', text: 'One.' }] });
  d = apply(d, [{ op: 'insert', at: 1, block: { id: 'b', type: 'paragraph', text: 'Two.' } }]);
  d = apply(d, [{ op: 'set', id: 'a', key: 'text', value: 'First.' }, { op: 'data', key: 'tall', value: '175' }]);
  assert.deepEqual(d.blocks.map((b) => b.text), ['First.', 'Two.']);
  let r = undo(d);
  assert.deepEqual(r.doc.blocks.map((b) => b.text), ['One.', 'Two.']);
  assert.equal(r.doc.data.tall, undefined);
  r = redo(r.doc);
  assert.equal(r.doc.data.tall, '175');
  const log = changeLog(r.doc);
  assert.equal(log[0].changes, 2);
  assert.equal(log[1].additions, 1);
});

test("only the character's edit is undone, even after later edits elsewhere", () => {
  let d = createDocument({ blocks: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }] });
  d = apply(d, [{ op: 'delete', id: 'b' }], { by: 'character' });
  d = apply(d, [{ op: 'set', id: 'c', key: 'text', value: 'C2' }], { by: 'user' });
  const r = undoLastBy(d, 'character');
  assert.ok(r.undone);
  assert.deepEqual(r.doc.blocks.map((b) => b.text), ['A', 'B', 'C2']);
  assert.equal(r.doc.history.length, 1);
  // a later edit to the same block blocks the undo
  let e = apply(createDocument({ blocks: [{ id: 'a', text: 'A' }] }), [{ op: 'set', id: 'a', key: 'text', value: 'X' }], { by: 'character' });
  e = apply(e, [{ op: 'set', id: 'a', key: 'text', value: 'Y' }], { by: 'user' });
  const blocked = undoLastBy(e, 'character');
  assert.equal(blocked.undone, null);
  assert.match(blocked.reason, /later change/);
});

test('documents have a Prolog form and survive saving', () => {
  const d = apply(createDocument({ title: 'Plan', blocks: [{ id: 'a', text: "Ann's plan" }] }), [{ op: 'opinion', value: 'Good.' }]);
  const pl = toProlog(d);
  assert.match(pl, /document\('d\w+', lucianoffice|document\(d\w+, writer, 'Plan'\)|document\(/);
  assert.match(pl, /block\(\w+, 1, a, paragraph, 'Ann\\'s plan'\)/);
  assert.match(pl, /opinion\(\w+, 'Good\.'\)/);
  assert.deepEqual(deserialise(serialise(d)), d);
  assert.throws(() => deserialise('{}'), /not a Lucian Office document/);
});

test('commands: templates, doing them as the character, and undoing them', async () => {
  const c = compile('add [a] slide about {topic}');
  assert.deepEqual(c.re.exec('add a slide about pricing').slice(1), ['pricing']);
  assert.deepEqual(c.re.exec('Add slide about cost').slice(1), ['cost']);
  const reg = createCommands({ app: 'Presenter' }).register({
    name: 'add slide', patterns: ['add [a] slide about {topic}'],
    run: ({ args }) => ({ ops: [{ op: 'insert', block: { type: 'slide', text: args.topic } }] })
  });
  let doc = createDocument({ app: 'presenter' });
  let r = await reg.perform('Please add a slide about pricing.', doc);
  assert.equal(r.matched, true);
  assert.equal(r.doc.blocks[0].text, 'pricing');
  assert.match(r.say, /undo that/);
  doc = apply(r.doc, [{ op: 'title', value: 'Pitch' }], { by: 'user' });
  r = await reg.perform('undo that', doc);
  assert.equal(r.doc.blocks.length, 0);
  assert.equal(r.doc.title, 'Pitch');
  assert.equal((await reg.perform('make it purple', doc)).matched, false);
  assert.match(reg.help(), /add \[a\] slide about \{topic\}/);
  // as the desktop character's handler
  let current = createDocument();
  const handle = characterHandler(reg, () => current, (d) => { current = d; });
  assert.match(await handle({ intent: 'unknown' }, 'remember that tall is 180'), /tall is 180/);
  assert.equal(current.data.tall, '180');
  assert.equal(await handle({ intent: 'unknown' }, 'open my email'), null);
});

test('plug-ins run on a selection and their edits can be undone', async () => {
  const plugins = createPlugins().register({
    id: 'shout', name: 'Shout', apps: ['writer'],
    run: ({ doc, selection }) => ({ ops: selection.blockIds.map((id) => ({ op: 'set', id, key: 'text', value: doc.blocks.find((b) => b.id === id).text.toUpperCase() })) })
  });
  assert.deepEqual(plugins.list('writer').map((p) => p.id), ['shout']);
  assert.deepEqual(plugins.list('counter'), []);
  const doc = createDocument({ blocks: [{ id: 'a', text: 'hi' }, { id: 'b', text: 'there' }] });
  const r = await plugins.run('shout', doc, { selection: { blockIds: ['b'] } });
  assert.deepEqual(r.doc.blocks.map((b) => b.text), ['hi', 'THERE']);
  assert.equal(r.doc.history[0].by, 'plugin:shout');
  assert.deepEqual(undoLastBy(r.doc, 'plugin:shout').doc.blocks.map((b) => b.text), ['hi', 'there']);
  await assert.rejects(plugins.run('nope', doc), /no plug-in/);
});

test('show handles operators and negative numbers', () => {
  assert.equal(show(parseProgram('x :- A is -3 + 4.')[0].body), 'A is (-3) + 4');
});
