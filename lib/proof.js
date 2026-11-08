// Proving a conversion accurate.
//   1. Round trip: the Prolog from the text, written back as text and read again, is the
//      same program (clause for clause, up to variable names) with the same questions.
//   2. Same answers: every predicate gives the same answers in both programs.
//   3. Checks: every example the text gave for a drilled-down word ("Ann is tall",
//      "Ben is not tall") comes out as stated under the measured definition.
//   4. Nothing lost: the regenerated text reads back with nothing left out.
// The conversion is used only when all four hold.
import { canonical, sameProgram, show } from './terms.js';
import { allAnswers, holds, predicateKeys } from './evaluate.js';
import { describeProgram, describeGoal } from './describe.js';
import { textToProlog } from './text-to-prolog.js';

export function proveConversion(text, { data = {} } = {}) {
  const program = textToProlog(text, { data });
  const regenerated = describeProgram(program);
  const program2 = textToProlog(regenerated, { data });
  return { program, regenerated, program2, proof: proof(program, program2) };
}

export function proof(program, program2) {
  const differences = [];
  const n = Math.max(program.clauses.length, program2.clauses.length);
  for (let i = 0; i < n; i++) {
    const a = program.clauses[i], b = program2.clauses[i];
    const ca = a && canonical(a), cb = b && canonical(b);
    if (ca !== cb) differences.push({ index: i, original: ca ?? '(none)', regenerated: cb ?? '(none)' });
  }
  const sameQuestions = program.queries.length === program2.queries.length &&
    program.queries.every((q, i) => show(q.goal) === show(program2.queries[i].goal));
  const a1 = allAnswers(program.clauses), a2 = allAnswers(program2.clauses);
  const sameAnswers = JSON.stringify(sortKeys(a1)) === JSON.stringify(sortKeys(a2));
  const checks = program.checks.map((c) => {
    let got;
    try { got = holds(program.clauses, c.goal); } catch (e) { got = `error: ${e.message}`; }
    return { sentence: c.sentence, goal: show(c.goal), said: describeGoal(c.goal, program.lexicon), expect: c.expect, got, ok: got === c.expect };
  });
  const roundTrip = sameProgram(program.clauses, program2.clauses);
  const nothingLost = program2.leftOut.length === 0;
  return {
    ok: roundTrip && sameQuestions && sameAnswers && checks.every((c) => c.ok) && nothingLost,
    roundTrip, sameQuestions, sameAnswers, nothingLost, differences, checks,
    lostOnRereading: program2.leftOut
  };
}

const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

// A rewritten program (from mnns optimise) is accepted only if it gives the same
// answers as the original for every predicate, on top of mnns' own checked proof.
export function sameAnswersAs(original, rewritten) {
  const keys = predicateKeys(original);
  const a = sortKeys(allAnswers(original, {}, keys)), b = sortKeys(allAnswers(rewritten, {}, keys));
  const differing = Object.keys({ ...a, ...b }).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  return { ok: differing.length === 0, differing };
}
