import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptOptimised, answers, canonical, convert, describeProgram, optimiseJobSpec, parseProgram, proveConversion, show, showProgram, textToProlog } from '../index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const prolog = (text, opts) => showProgram(textToProlog(text, opts).clauses);
const ask = (text, goalText) => answers(textToProlog(text).clauses, parseProgram(`${goalText}.`)[0].head);

test('statements become facts', () => {
  assert.equal(prolog('Socrates is a man. Ann likes Ben. Ann works for Acme. Ann sings. Ann is happy.'),
    'man(socrates).\nlikes(ann, ben).\nworks_for(ann, acme).\nsings(ann).\nhappy(ann).');
});

test('measurements become facts with numbers, keeping the unit', () => {
  const p = textToProlog("Ann is 190 cm tall. Ben's age is 30. The pen costs $3. Ann has 2 cats.");
  assert.equal(showProgram(p.clauses), 'height(ann, 190).\nage(ben, 30).\nprice(pen, 3).\ncats(ann, 2).');
  assert.equal(p.lexicon.units.height, 'cm');
  assert.equal(p.lexicon.units.price, 'dollars');
});

test('every, all and plural generics become rules', () => {
  assert.equal(prolog('Every man is mortal.'), 'mortal(X) :-\n    man(X).');
  assert.equal(prolog('All men like Ann.'), 'likes(X, ann) :-\n    man(X).');
  assert.equal(prolog('Dogs are animals.'), 'animal(X) :-\n    dog(X).');
  assert.equal(prolog('Tall people play basketball.'), 'plays(X, basketball) :-\n    person(X),\n    tall(X).');
});

test('conditions become rules; or makes one rule each; not becomes \\+', () => {
  assert.equal(prolog('If X is a man then X is mortal.'), 'mortal(X) :-\n    man(X).');
  assert.equal(prolog('X is happy if X is rich and X is not busy.'), 'happy(X) :-\n    rich(X),\n    \\+ busy(X).');
  assert.equal(prolog('If someone is a cat or they are a dog then they are a pet.'), 'pet(X) :-\n    cat(X).\npet(X) :-\n    dog(X).');
  assert.equal(prolog("If something is an item and its price is more than 20 then it is expensive."),
    'expensive(X) :-\n    item(X),\n    price(X, A),\n    A > 20.');
});

test('modal verbs stay with their verb', () => {
  assert.equal(prolog('Ann can help. Ann must pay Ben.'), 'can_help(ann).\nmust_pay(ann, ben).');
  const r = proveConversion('If X is a manager then X can help. Ann is a manager. Who can help?');
  assert.ok(r.proof.ok);
  assert.match(r.regenerated, /Every manager can help\./);
});

test('each and all become loops: totals, averages and counts', () => {
  assert.equal(prolog('The total price is the sum of the price of every item.'),
    'total_price(T) :-\n    findall(V, (item(X), price(X, V)), Vs),\n    sum_list(Vs, T).');
  assert.equal(prolog('Count the items.'), 'number_of_items(N) :-\n    findall(X, item(X), Xs),\n    length(Xs, N).');
  assert.equal(prolog('Add up the spend of all customers.'), prolog('The total spend is the sum of the spend of every customer.'));
  assert.deepEqual(ask('Pen is an item. Book is an item. Pen\'s price is 3. Book\'s price is 12. The average price is the average of the price of every item.', 'average_price(T)'), ['7.5']);
});

test('questions are kept as queries', () => {
  const p = textToProlog('Socrates is a man. Is Socrates a man? Who is a man? What is Socrates\'s age? Does Ann like Ben? What is the total price?');
  assert.deepEqual(p.queries.map((q) => show(q.goal)), ['man(socrates)', 'man(X)', 'age(socrates, X)', 'likes(ann, ben)', 'total_price(X)']);
});

test('vague words are drilled down: between examples, from positives only, or interpolated', () => {
  const both = textToProlog('Ann is 190 cm tall. Ben is 160 cm tall. Ann is tall. Ben is not tall.');
  assert.equal(both.drilled[0].threshold, 175);
  assert.match(both.drilled[0].how, /half-way/);
  assert.equal(both.checks.length, 2);
  assert.ok(showProgram(both.clauses).includes('tall(X) :-\n    height(X, V),\n    V >= 175.'));

  const pos = textToProlog('Ann is 190 cm tall. Ben is 160 cm tall. Ann is tall.');
  assert.equal(pos.drilled[0].threshold, 190);

  const none = textToProlog('Ann is 190 cm tall. Ben is 160 cm tall. Cal is 170 cm tall. If X is tall then X plays basketball.');
  assert.equal(none.drilled[0].threshold, 170);
  assert.match(none.drilled[0].how, /interpolated/);
  assert.ok(none.questions.some((q) => q.key === 'tall'));

  const low = textToProlog('Ann is 190 cm tall. Ben is 150 cm tall. Ben is short. Ann is not short.');
  assert.ok(showProgram(low.clauses).includes('V =< 170'));
});

test('Data answers set what a vague word means', () => {
  const p = textToProlog('Ann is 190 cm tall. Ben is 180 cm tall. If X is tall then X plays basketball.', { data: { tall: '185' } });
  assert.equal(p.drilled[0].threshold, 185);
  assert.match(p.drilled[0].how, /given in Data/);
});

test('comparatives are drilled down to comparisons', () => {
  const p = textToProlog("Ann's age is 40. Ben's age is 30. Ann is older than Ben. Ben is older than Ann.");
  assert.ok(showProgram(p.clauses).includes('older(X, Y) :-\n    age(X, A),\n    age(Y, B),\n    A > B.'));
  const r = proveConversion("Ann's age is 40. Ben's age is 30. Ann is older than Ben. Ben is older than Ann.");
  assert.deepEqual(r.proof.checks.map((c) => c.ok), [true, false], 'a false example is reported, not hidden');
  assert.equal(r.proof.ok, false);
});

test('what cannot be pinned down is left out with a reason, and asked about', () => {
  const p = textToProlog('Socrates is a man. No man is a god. The weather in Sydney is nice and warm, mostly. Ann is very happy.');
  assert.equal(p.clauses.length, 2);
  assert.equal(p.leftOut.length, 2);
  assert.ok(p.leftOut.every((l) => l.reason));
  assert.ok(p.questions.some((q) => q.key.startsWith('rephrase:')));
  assert.ok(p.notes.some((n) => /very/.test(n)));
});

test('predicates used but never defined are declared and asked about', () => {
  const r = convert('If X is a manager then X can_help. Ann is a person.');
  assert.deepEqual(r.program.undefined, ['manager/1']);
  assert.match(r.prolog, /^:- dynamic manager\/1\./);
  assert.ok(r.program.questions.some((q) => q.key === 'define:manager/1'));
});

test('the round trip is proved on every sample text', () => {
  const dir = path.join(HERE, 'fixtures');
  for (const f of fs.readdirSync(dir)) {
    const r = proveConversion(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(r.proof.ok, `${f}: ${JSON.stringify(r.proof)}`);
    assert.ok(r.program.clauses.length > 3, f);
  }
});

test('the regenerated text reads back as the same clauses', () => {
  const r = proveConversion(fs.readFileSync(path.join(HERE, 'fixtures', 'team.txt'), 'utf8'));
  assert.deepEqual(r.program2.clauses.map(canonical), r.program.clauses.map(canonical));
  assert.match(r.regenerated, /X is available if X works for Acme and X is not busy\./);
  assert.match(r.regenerated, /X is older than Y if X's age is more than Y's age\./);
});

test('clauses that cannot be said plainly are kept as Prolog lines, which read back exactly', () => {
  const program = { clauses: parseProgram('p(X) :- (q(X) -> true ; r(X)). q(1). r(2).'), queries: [], lexicon: { kinds: {}, names: {}, units: {} } };
  const text = describeProgram(program);
  assert.match(text, /^Prolog: p\(X\) :-/);
  const back = textToProlog(text);
  assert.deepEqual(back.clauses.map(canonical), program.clauses.map(canonical));
});

test('answers to the questions come from the evaluator', () => {
  const r = convert(fs.readFileSync(path.join(HERE, 'fixtures', 'shop.txt'), 'utf8'));
  assert.deepEqual(r.answers.map((a) => a.answers), [['55'], ['3'], ['lamp']]);
});

test('formats: Counter rows and formulas, Presenter slides, Etcher arrows, Tabler tables', () => {
  const r = convert(fs.readFileSync(path.join(HERE, 'fixtures', 'shop.txt'), 'utf8'));
  assert.deepEqual(r.formats.counter.columns, ['name', 'price']);
  assert.deepEqual(r.formats.counter.rows[0], ['the pen', 3]);
  assert.deepEqual(r.formats.counter.formulas.map((f) => f.formula), ['=SUM(B2:B4)', '=AVERAGE(B2:B4)']);
  assert.ok(r.formats.presenter.slides.some((s) => s.title === 'Rules'));
  assert.ok(r.formats.etcher.arrows.some((a) => a.from === 'item/1' && a.to === 'expensive/1'));
  assert.ok(r.formats.tabler.tables.some((t) => t.name === 'price' && t.rows.length === 3));
  assert.ok(r.formats.writer.blocks.length >= 2);
});

test('mnns: the job passes files after --, and a rewrite is kept only with the same answers', () => {
  assert.deepEqual(optimiseJobSpec({ mnns: 'GitHub/mnns/', input: 'a.pl', output: 'b.pl' }).args, ['GitHub/mnns/optimise.pl', '--', 'a.pl', 'b.pl']);
  const program = textToProlog('Ann is a man. Every man is mortal. Ann is tall.');
  const ok = 'MNN_OPTIMISE ok changed=true size_before=9 size_after=8 plop=unchanged simplify=1 detlog=unchanged detlog_steps=0';
  const same = acceptOptimised(program, ok, 'man(ann).\nmortal(A) :- man(A).\ntall(ann).\n');
  assert.equal(same.accepted, true);
  assert.equal(same.proof.ok, true);
  const different = acceptOptimised(program, ok, 'man(ann).\nmortal(bob).\ntall(ann).\n');
  assert.equal(different.accepted, false);
  assert.match(different.reason, /mortal\/1/);
  assert.equal(acceptOptimised(program, 'MNN_OPTIMISE error syntax', '').accepted, false);
  assert.equal(acceptOptimised(program, ok.replace('changed=true', 'changed=false'), '').accepted, false);
});
