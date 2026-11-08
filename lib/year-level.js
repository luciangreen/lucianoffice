// Year level: a setting from Year 1 to postgraduate that limits sentence length, word
// difficulty (by word frequency) and the number of new terms per paragraph. Everything is
// measured and shown, so the user can see why a sentence changed.
import { PLAINER, wordRank } from './words.js';

// maxWords: longest sentence; maxRank: the hardest word allowed (its place in the
// frequency list); maxNewTerms: words beyond maxRank first used in one paragraph.
export const YEAR_LEVELS = [
  { id: '1', label: 'Year 1', maxWords: 8, maxRank: 250, maxNewTerms: 0 },
  { id: '2', label: 'Year 2', maxWords: 10, maxRank: 400, maxNewTerms: 1 },
  { id: '3', label: 'Year 3', maxWords: 12, maxRank: 550, maxNewTerms: 1 },
  { id: '4', label: 'Year 4', maxWords: 14, maxRank: 700, maxNewTerms: 2 },
  { id: '5', label: 'Year 5', maxWords: 15, maxRank: 850, maxNewTerms: 2 },
  { id: '6', label: 'Year 6', maxWords: 16, maxRank: 1000, maxNewTerms: 3 },
  { id: '7', label: 'Year 7', maxWords: 18, maxRank: Infinity, maxNewTerms: 3 },
  { id: '8', label: 'Year 8', maxWords: 19, maxRank: Infinity, maxNewTerms: 4 },
  { id: '9', label: 'Year 9', maxWords: 20, maxRank: Infinity, maxNewTerms: 4 },
  { id: '10', label: 'Year 10', maxWords: 22, maxRank: Infinity, maxNewTerms: 5 },
  { id: '11', label: 'Year 11', maxWords: 24, maxRank: Infinity, maxNewTerms: 6 },
  { id: '12', label: 'Year 12', maxWords: 25, maxRank: Infinity, maxNewTerms: 7 },
  { id: 'ug', label: 'Undergraduate', maxWords: 30, maxRank: Infinity, maxNewTerms: 9 },
  { id: 'pg', label: 'Postgraduate', maxWords: 35, maxRank: Infinity, maxNewTerms: 12 }
];
// From Year 7 up every word is allowed, but rare words still count as new terms.
const RARE_FROM = 1000;

export const level = (id) => YEAR_LEVELS.find((l) => l.id === String(id)) ?? YEAR_LEVELS[YEAR_LEVELS.length - 1];

export const splitParagraphs = (text) => String(text ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
export const splitSentences = (p) => p.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const wordsOf = (s) => s.match(/[A-Za-z][A-Za-z'-]*|\d+(?:\.\d+)?/g) ?? [];

// A word is hard for a level when it is past the level's rank limit; names (capitalised
// after the first word) and numbers never are.
function hardWords(sentence, lv, names = new Set()) {
  const ws = wordsOf(sentence);
  return ws.filter((w, i) => !/^\d/.test(w) && !(i > 0 && /^[A-Z]/.test(w)) && !/^[A-Z]$/.test(w) && !names.has(w.replace(/'s$/, '')) &&
    wordRank(w.replace(/'s$/, '')) > Math.min(lv.maxRank, RARE_FROM) - 1);
}

// Names: words written with a capital after the start of a sentence, or with "'s".
function namesIn(text) {
  const names = new Set();
  for (const s of splitSentences(String(text ?? '').replace(/\n+/g, ' '))) {
    wordsOf(s).forEach((w, i) => {
      if (/^[A-Z]/.test(w) && (i > 0 || /'s$/.test(w))) names.add(w.replace(/'s$/, ''));
    });
  }
  return names;
}

export function measure(text, id) {
  const lv = level(id);
  const seen = new Set();
  const names = namesIn(text);
  const paragraphs = splitParagraphs(text).map((p) => {
    const sentences = splitSentences(p).map((s) => {
      const words = wordsOf(s).length;
      const hard = hardWords(s, lv, names);
      return {
        text: s, words, hard,
        tooLong: words > lv.maxWords,
        tooHard: lv.maxRank !== Infinity ? hard : [],
        reasons: [
          ...(words > lv.maxWords ? [`${words} words; ${lv.label} allows ${lv.maxWords}`] : []),
          ...(lv.maxRank !== Infinity && hard.length ? [`hard for ${lv.label}: ${hard.join(', ')}`] : [])
        ]
      };
    });
    const newTerms = [...new Set(sentences.flatMap((s) => s.hard.map((w) => w.toLowerCase())))].filter((w) => !seen.has(w));
    newTerms.forEach((w) => seen.add(w));
    return { sentences, newTerms, tooManyNewTerms: newTerms.length > lv.maxNewTerms };
  });
  const all = paragraphs.flatMap((p) => p.sentences);
  const totalWords = all.reduce((n, s) => n + s.words, 0);
  const hardCount = all.reduce((n, s) => n + s.hard.length, 0);
  const problems = all.filter((s) => s.reasons.length).length + paragraphs.filter((p) => p.tooManyNewTerms).length;
  return {
    level: lv,
    paragraphs,
    stats: {
      sentences: all.length,
      averageWords: all.length ? Math.round((totalWords / all.length) * 10) / 10 : 0,
      longest: all.reduce((m, s) => Math.max(m, s.words), 0),
      hardWords: hardCount,
      hardShare: totalWords ? Math.round((hardCount / totalWords) * 1000) / 10 : 0,
      mostNewTerms: paragraphs.reduce((m, p) => Math.max(m, p.newTerms.length), 0)
    },
    ok: problems === 0,
    problems
  };
}

// Rewrite towards a level: plainer words for hard ones, long sentences split where they
// join two clauses. Every change carries its reason. Meaning-changing edits are not made:
// a sentence that can't be split safely is reported, not rewritten.
const JOINS = [/;\s+/, /,\s+and\s+/, /,\s+but\s+/, /,\s+so\s+/, /\s+because\s+/, /,\s+which\s+/];
const JOIN_WORD = ['', '', 'But ', 'So ', 'This is because ', 'This '];

export function simplify(text, id) {
  const lv = level(id);
  const changes = [];
  const out = splitParagraphs(text).map((p) => splitSentences(p).map((s) => {
    let sentence = s;
    for (const w of wordsOf(sentence)) {
      const plain = PLAINER[w.toLowerCase()];
      if (plain && wordRank(w) > Math.min(lv.maxRank, RARE_FROM) - 1 && wordRank(plain.split(' ')[0]) < wordRank(w)) {
        const to = /^[A-Z]/.test(w) ? plain[0].toUpperCase() + plain.slice(1) : plain;
        sentence = sentence.replace(new RegExp(`\\b${w}\\b`), to);
        changes.push({ from: w, to, reason: `"${w}" is a less common word than "${plain}"` });
      }
    }
    return splitLong(sentence, lv, changes);
  }).join(' '));
  return { text: out.join('\n\n'), changes, after: measure(out.join('\n\n'), id) };
}

function splitLong(sentence, lv, changes, depth = 0) {
  const n = wordsOf(sentence).length;
  if (n <= lv.maxWords || depth > 4) {
    if (n > lv.maxWords) changes.push({ from: sentence, to: sentence, reason: `${n} words, over ${lv.maxWords}, but there was no safe place to split it` });
    return sentence;
  }
  // the join nearest the middle
  let best = null;
  JOINS.forEach((re, k) => {
    const g = new RegExp(re.source, 'g');
    let m;
    while ((m = g.exec(sentence))) {
      const left = sentence.slice(0, m.index), right = sentence.slice(m.index + m[0].length);
      if (wordsOf(left).length < 3 || wordsOf(right).length < 3) continue;
      const balance = Math.abs(wordsOf(left).length - wordsOf(right).length);
      if (!best || balance < best.balance) best = { left, right, k, balance };
    }
  });
  if (!best) {
    changes.push({ from: sentence, to: sentence, reason: `${n} words, over ${lv.maxWords}, but there was no safe place to split it` });
    return sentence;
  }
  const end = /[.!?]$/.test(sentence) ? sentence.slice(-1) : '.';
  const left = best.left.replace(/[,;]\s*$/, '') + '.';
  let right = best.right.replace(/[.!?]$/, '');
  right = JOIN_WORD[best.k] + (JOIN_WORD[best.k] ? right : right[0].toUpperCase() + right.slice(1)) + end;
  changes.push({ from: sentence, to: `${left} ${right}`, reason: `${n} words; ${lv.label} allows ${lv.maxWords}, so it was split in two` });
  return `${splitLong(left, lv, changes, depth + 1)} ${splitLong(right, lv, changes, depth + 1)}`;
}
