// The functions whose inputs and outputs are recorded in io/ios.txt (see io/engine.mjs).
import { convert } from '../lib/converter.js';
import { textToProlog, sentences } from '../lib/text-to-prolog.js';
import { showProgram } from '../lib/terms.js';
import { singular, plural, wordRank } from '../lib/words.js';
import { measure, simplify } from '../lib/year-level.js';
import { parseEvents, funnelStats } from '../lib/funnel-records.js';
import { parseMoney } from '../lib/coach/money.js';
import { daysBetween, addDays } from '../lib/coach/workflows.js';
import { createDocument, apply, undo } from '../lib/document.js';

export const title = 'Lucian Office core';

const NOUNS = ['student', 'teacher', 'apple', 'box', 'city', 'child', 'mouse', 'leaf', 'person', 'idea', 'church', 'baby', 'knife', 'tomato', 'sheep'];
const LEVELS = ['1', '3', '6', '9', '12', 'pg'];
const facts = (rnd) => {
  const people = ['alice', 'bob', 'carol', 'dan'];
  const lines = [];
  const cap = (w) => w[0].toUpperCase() + w.slice(1);
  for (let i = 0; i < rnd.int(1, 3); i++) lines.push(`${cap(rnd.pick(people))} is ${rnd.pick(['happy', 'a student', 'tall', 'a teacher'])}.`);
  if (rnd.chance(0.6)) lines.push(`Every ${rnd.pick(['student', 'teacher'])} is ${rnd.pick(['happy', 'busy', 'kind'])}.`);
  if (rnd.chance(0.5)) lines.push(`Is ${rnd.pick(people)} happy?`);
  return lines.join(' ');
};
const date = (rnd) => `20${rnd.int(24, 27)}-${String(rnd.int(1, 12)).padStart(2, '0')}-${String(rnd.int(1, 28)).padStart(2, '0')}`;

export const cases = [
  { name: 'textToProlog', run: (text) => showProgram(textToProlog(text).clauses), make: (rnd) => [facts(rnd)] },
  { name: 'convert', run: (text, yearLevel) => { const r = convert(text, { yearLevel }); return { prolog: r.prolog, text: r.text, readable: r.readable, proof: r.proof?.same ?? r.proof?.ok ?? null, answers: r.answers }; }, make: (rnd) => [facts(rnd), rnd.pick(LEVELS)] },
  { name: 'sentences', run: sentences, make: (rnd) => [Array.from({ length: rnd.int(1, 4) }, () => rnd.sentence()).join(' ')] },
  { name: 'plural', run: plural, make: (rnd) => [rnd.pick(NOUNS)] },
  { name: 'singular', run: (w) => singular(plural(w)), make: (rnd) => [rnd.pick(NOUNS)] },
  { name: 'wordRank', run: wordRank, make: (rnd) => [rnd.pick([...NOUNS, 'the', 'algorithm', 'meditation', 'and', 'quickly'])] },
  { name: 'measure', run: measure, make: (rnd) => [Array.from({ length: rnd.int(1, 3) }, () => rnd.sentence()).join(' '), rnd.pick(LEVELS)] },
  { name: 'simplify', run: (text, id) => { const r = simplify(text, id); return { text: r.text, changes: r.changes?.length ?? 0 }; }, make: (rnd) => [`The ${rnd.pick(['enormous', 'utilise', 'commence', 'big'])} ${rnd.pick(NOUNS)} ${rnd.pick(['demonstrates', 'shows', 'facilitates'])} ${rnd.words(2, 6)}.`, rnd.pick(LEVELS)] },
  { name: 'funnelStats', run: (text) => funnelStats(parseEvents(text)), make: (rnd) => {
    const lines = [];
    let t = 1000;
    for (let i = 0; i < rnd.int(2, 12); i++) {
      t += rnd.int(1, 500);
      const ev = rnd.pick(['visit', 'visit', 'signup', 'checkout', 'declined']);
      lines.push(`funnel_event(${t}, ${ev}, ${ev === 'signup' ? `['U${rnd.int(1, 5)}', 'u${rnd.int(1, 5)}@example.com']` : ev === 'visit' ? '[]' : `'u${rnd.int(1, 5)}@example.com'`}).`);
    }
    return [lines.join('\n')];
  } },
  { name: 'parseMoney', run: parseMoney, make: (rnd) => [rnd.pick(['$', 'AUD ', '', 'about $']) + rnd.int(0, 99999).toLocaleString('en-AU') + rnd.pick(['', '.50', '.05']) + rnd.pick(['', ' a month', ' per day'])] },
  { name: 'daysBetween', run: daysBetween, make: (rnd) => [date(rnd), date(rnd)] },
  { name: 'addDays', run: addDays, make: (rnd) => [date(rnd), rnd.int(-40, 400)] },
  { name: 'document edits and undo', run: (title, texts, undos) => {
    let doc = createDocument({ app: 'writer', title });
    texts.forEach((text, i) => { doc = apply(doc, [{ op: 'insert', at: i, block: { type: 'paragraph', text } }], { by: 'user' }); });
    for (let i = 0; i < undos; i++) doc = undo(doc).doc;
    return { title: doc.title, blocks: doc.blocks.map((b) => b.text) };
  }, make: (rnd) => [rnd.words(1, 3), Array.from({ length: rnd.int(1, 4) }, () => rnd.sentence()), rnd.int(0, 2)] }
];
