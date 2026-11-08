// Checks the Converter against SWI-Prolog, as CI does for Grammar Logic:
//   1. every sample text converts with a proof;
//   2. SWI-Prolog gives the same answers as the built-in evaluator, for every predicate and question;
//   3. with MNNS_DIR set, mnns optimises each program, and the rewrite is kept only if it
//      gives the same answers (and still reads back as text).
// Usage: node scripts/check-prolog.mjs [texts...]   (default: test/fixtures/*.txt)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptOptimised, allAnswers, answers, convert, predicateKeys, show } from '../index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(ROOT, 'test/fixtures')).map((f) => path.join(ROOT, 'test/fixtures', f));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucianoffice-'));
let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL ${msg}`); };

// Prints every answer of Goal as its variables' values, written as the evaluator writes them.
const RUNNER = `
:- initialization(main, main).
main([File, GoalsFile]) :-
    load_files(File, []),
    read_file_to_terms(GoalsFile, Goals, []),
    forall(member(goal(Key, G, Vs), Goals),
           ( catch(findall(Vs, G, L), E, (print_message(error, E), L = [error])),
             forall(member(A, L), ( answer_text(A, T), format("~w\\t~w~n", [Key, T]) )) )).
answer_text([], true) :- !.
answer_text(error, error) :- !.
answer_text(Vs, T) :- maplist([V, S]>>(format(string(S), "~q", [V])), Vs, Ss), atomic_list_concat(Ss, ', ', T).
`;
fs.writeFileSync(path.join(tmp, 'runner.pl'), RUNNER);

for (const file of files) {
  const name = path.basename(file);
  console.log(name);
  const r = convert(fs.readFileSync(file, 'utf8'));
  if (!r.proof.ok) fail(`${name}: conversion not proved: ${JSON.stringify(r.proof)}`);
  const pl = path.join(tmp, `${name}.pl`);
  fs.writeFileSync(pl, `${r.prolog}\n`);

  // goals: each predicate with fresh variables, then each question
  const keys = predicateKeys(r.program.clauses);
  const goals = keys.map((k) => {
    const [f, n] = [k.slice(0, k.lastIndexOf('/')), Number(k.slice(k.lastIndexOf('/') + 1))];
    const vs = Array.from({ length: n }, (_, i) => `A${i}`);
    return { key: k, goal: { f, args: vs.map((v) => ({ v })) }, text: `goal('${k}', ${n ? `${f}(${vs.join(', ')})` : f}, [${vs.join(', ')}]).` };
  });
  r.program.queries.forEach((q, i) => {
    const vs = [...new Set(JSON.stringify(q.goal).match(/"v":"([A-Z_]\w*)"/g)?.map((m) => m.slice(5, -1)) ?? [])];
    goals.push({ key: `question ${i + 1}`, goal: q.goal, text: `goal('question ${i + 1}', ${show(q.goal)}, [${vs.join(', ')}]).` });
  });
  const goalsFile = path.join(tmp, `${name}.goals`);
  fs.writeFileSync(goalsFile, goals.map((g) => g.text).join('\n') + '\n');
  let out;
  try {
    out = execFileSync('swipl', [path.join(tmp, 'runner.pl'), '--', pl, goalsFile], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    fail(`${name}: swipl failed: ${e.stderr || e.message}`);
    continue;
  }
  const swi = {};
  for (const line of out.split('\n').filter(Boolean)) {
    const [k, t] = line.split('\t');
    (swi[k] ??= []).push(t);
  }
  for (const g of goals) {
    const js = answers(r.program.clauses, g.goal).sort();
    const sw = (swi[g.key] ?? []).sort();
    if (JSON.stringify(js) !== JSON.stringify(sw)) fail(`${name} ${g.key}: evaluator ${JSON.stringify(js)} but SWI-Prolog ${JSON.stringify(sw)}`);
  }
  console.log(`  ${goals.length} goals give the same answers in SWI-Prolog`);

  // mnns
  if (process.env.MNNS_DIR) {
    const outPl = path.join(tmp, `${name}.opt.pl`);
    let report = '';
    try {
      report = execFileSync('swipl', [path.join(process.env.MNNS_DIR, 'optimise.pl'), '--', pl, outPl], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      report = e.stdout || '';
    }
    const written = fs.existsSync(outPl) ? fs.readFileSync(outPl, 'utf8') : '';
    const a = acceptOptimised(r.program, report, written);
    console.log(`  mnns: ${a.accepted ? 'optimised' : 'kept the original'}: ${a.reason}`);
    if (a.accepted) {
      const before = allAnswers(r.program.clauses, {}, keys), after = allAnswers(a.program.clauses, {}, keys);
      if (JSON.stringify(before) !== JSON.stringify(after)) fail(`${name}: mnns rewrite changed answers`);
      if (!a.proof.ok) console.log(`  note: the optimised program reads back with differences: ${JSON.stringify(a.proof.differences)}`);
    }
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `${failures} failure(s)` : 'All Prolog checks passed.');
process.exit(failures ? 1 : 0);
