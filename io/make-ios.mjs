// Writes io/ios.txt and io/ios.jsonl from io/cases.mjs (npm run ios).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeIos, toJsonl, toText } from './engine.mjs';
import { cases, title } from './cases.mjs';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const ios = await makeIos(cases);
fs.writeFileSync(here('./ios.txt'), toText(ios, title));
fs.writeFileSync(here('./ios.jsonl'), toJsonl(ios));
const errors = ios.filter((io) => io.output && io.output.error).length;
console.log(`${ios.length} inputs and outputs written to io/ios.txt and io/ios.jsonl (${cases.length} functions, ${errors} raised errors on purpose or otherwise)`);

// The Self-updating box's own 200 (io/self-update.*), which proofs/self_update_ios.pl checks against the Prolog spec.
const su = await import('./self-update-cases.mjs');
const suIos = await makeIos(su.cases);
fs.writeFileSync(here('./self-update.txt'), toText(suIos, su.title));
fs.writeFileSync(here('./self-update.jsonl'), toJsonl(suIos));
console.log(`${suIos.length} self-updating inputs and outputs written to io/self-update.txt and io/self-update.jsonl`);
