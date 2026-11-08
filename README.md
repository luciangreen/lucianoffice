# Lucian Office

The core of Lucian Office, the office suite inside [LucianOS](https://github.com/luciangreen/lucianos). Every Lucian Office app (Writer, Counter, Presenter, Etcher, Tabler, Studio, Movie MR, Visual Starlog) is built on it. It holds five parts:

1. **Converter**: plain English becomes Prolog, which is optimised with mnns, written back as text, proved to say the same thing, and then put into each app's format.
2. **Year level**: a setting from Year 1 to postgraduate. It limits sentence length, word difficulty and new terms per paragraph, and says why each sentence changed.
3. **Office document**: one JSON format with a Prolog form beside it. Its change history keeps deletions, changes and additions, and any of them can be undone.
4. **Command API**: each app registers commands that the RetroMR character can do and undo.
5. **Plug-ins**: a small interface for add-ons such as GL Inspire, the Chatbot App Authorer and Etcher's filters.

The work is done by algorithms you can open and improve. The core never calls Claude.

## Install

Lucian Office runs inside [LucianOS](https://github.com/luciangreen/lucianos): the apps share its server, password, files, character and Claude settings. Each app has its own repo, and all of them sit side by side in LucianOS's `apps` folder.

### What you need

- **Node.js 20 or newer** (`node --version`), to run LucianOS. It needs nothing else installed.
- **SWI-Prolog** (`swipl --version`), for Optimise with mnns, Grammar Logic in GL Inspire, funnels and Tabler sites. On a Mac: `brew install swi-prolog`.
- **Git**, to clone the repos.

### 1. LucianOS

Skip this if you already have LucianOS.

```sh
git clone https://github.com/luciangreen/lucianos
cd lucianos
cp config.example.json config.json   # edit "root" if you want a smaller suite folder than your home folder
```

To use Grammar Logic in GL Inspire, put `lucianos` in `Dropbox/GitHub-private2` with your other repos. The [LucianOS README](https://github.com/luciangreen/lucianos#needed-for-grammar-logic-and-breasoning) explains this, including the `~/Dropbox` link.

### 2. The Lucian Office apps

From the `lucianos` folder:

```sh
cd apps
git clone https://github.com/luciangreen/lucianoffice   # the core: Converter, year level, documents, commands, plug-ins
git clone https://github.com/luciangreen/writer         # word processor, GL Inspire, Chatbot App Authorer
git clone https://github.com/luciangreen/counter        # spreadsheet, proformas, segment graphs
git clone https://github.com/luciangreen/presenter      # slide decks (uses counter for workbooks)
git clone https://github.com/luciangreen/etcher         # drawings, flowcharts, filters
git clone https://github.com/luciangreen/tabler         # Prolog database websites and funnels
cd ..
```

Every app needs `lucianoffice` beside it, and Presenter also reads Counter workbooks through `counter`. Studio, Movie MR and Visual Starlog will be added here as their phases are built.

### 3. The tools the apps use

Clone these beside `lucianos` (in the same folder as your other repos, such as `Dropbox/GitHub-private2`). The apps ask where each one is the first time it's needed.

```sh
cd ..                                                   # the folder that holds lucianos
git clone https://github.com/luciangreen/mnns            # Optimise with mnns (Lucian Office, fastos)
git clone https://github.com/luciangreen/vetusiapl2webpl # turns funnels into web servers (Tabler)
```

| Used by | Repos (beside lucianos) | What for |
| --- | --- | --- |
| Lucian Office, fastos | `mnns` | Optimise with mnns |
| Tabler funnels | `vetusiapl2webpl` | Converting funnels to web servers |
| Writer (GL Inspire) | `Algorithm-Writer-with-Lists`, `Text-to-Breasonings`, `listprologinterpreter`, `Philosophy`, `Languages`, `List-Prolog-to-Prolog-Converter`, `Prolog-to-List-Prolog`, `SSI`, `culturaltranslationtool` | Grammar Logic. Install these with [Time Machine](https://github.com/luciangreen/Time_Machine), as the LucianOS README says. GL Inspire still works without them, from your bio and recent texts. |

### Or all at once

After cloning `lucianoffice` into `apps/`, this clones (or updates) every app above and `mnns` and `vetusiapl2webpl`. Run it from the `lucianos` folder:

```sh
sh apps/lucianoffice/scripts/install.sh
```

### 4. Start

```sh
npm start
```

Open http://localhost:4170/. The apps are in the Apps menu, and each also opens at its own address: http://localhost:4170/apps/lucianoffice/, /apps/writer/, /apps/counter/, /apps/presenter/, /apps/etcher/ and /apps/tabler/.

To use the apps on an iPhone, follow [remote mode](https://github.com/luciangreen/lucianos#remote-mode-iphone-through-tailscale) in the LucianOS README.

### Updating

Run `sh apps/lucianoffice/scripts/install.sh` again, or `git pull` in each app's folder.

## The window

- **Describe it**: write statements, rules and questions, then press **Convert**.
- **Questions**: the Converter asks about what it couldn't pin down, such as "What height counts as tall?". Your answers go into **Data** and change the result.
- **Data** and **Opinion**: editable sections kept with the document.
- **Tell Lucian**: say a command, such as "remember that tall is 180", "set the year level to 5", "add Cal is tall to the description", "undo that" or "what changed". The desktop character takes the same commands while the Lucian Office window is in front.
- **Tabs**:
  - Text: the readable version at your year level, its measurements and reasons, and the exact version.
  - Prolog: the program, the vague words and what they were drilled down to, and anything left out.
  - Proof
  - Answers
  - Formats: Writer, Counter, Presenter, Etcher and Tabler.
  - Changes: the history, with undo.
- **Save** writes `Name.office.json` and its Prolog form, `Name.office.pl`. **Open** reads a saved document back.

## The Converter

### Text to Prolog

Grammatical constructs become Prolog constructs:

| You write | Prolog |
| --- | --- |
| Socrates is a man. | `man(socrates).` |
| Ann likes Ben. Ann works for Acme. Ann sings. | `likes(ann, ben).` `works_for(ann, acme).` `sings(ann).` |
| Ann is 190 cm tall. Ann's age is 40. The pen costs $3. Ann has 2 cats. | `height(ann, 190).` `age(ann, 40).` `price(pen, 3).` `cats(ann, 2).` |
| Every man is mortal. Dogs are animals. | `mortal(X) :- man(X).` `animal(X) :- dog(X).` |
| Tall people play basketball. | `plays(X, basketball) :- person(X), tall(X).` |
| If X works for Acme and X is not busy then X is available. | `available(X) :- works_for(X, acme), \+ busy(X).` |
| If someone is a cat or they are a dog then they are a pet. | two clauses, one for each case |
| If something is an item and its price is more than 20 then it is expensive. | `expensive(X) :- item(X), price(X, A), A > 20.` |
| The total price is the sum of the price of every item. (Also "Add up the price of all items.") | `total_price(T) :- findall(V, (item(X), price(X, V)), Vs), sum_list(Vs, T).` |
| The average price is the average of the price of every item. | the same loop with `sum_list`, `length` and `is` |
| Count the items. | `number_of_items(N) :- findall(X, item(X), Xs), length(Xs, N).` |
| Ann can help. | `can_help(ann).` |
| Is Socrates mortal? Who is mortal? What is Ann's age? What is the total price? | kept as questions and answered |

**Vague, qualitative words** ("tall", "old", "expensive", "fast", "rich" and others) are drilled down to a measurement:

- **Your examples:** if the text gives examples ("Ann is 190 cm tall. Ann is tall. Ben is 160 cm tall. Ben is not tall."), the threshold goes half-way between the examples on each side, giving `tall(X) :- height(X, V), V >= 175`.
- **Positive examples only:** the threshold is the lowest of them, for a word like "tall".
- **No examples:** it is interpolated from the measurements given (the middle value), and you are asked to confirm it.
- **Data:** an answer in Data, such as `tall = 185`, overrides all of these.

The examples are not thrown away: they become checks in the proof.

**Comparatives** ("older than", "taller than", "cheaper than" and others) become comparisons on the matching measure, for example `older(X, Y) :- age(X, A), age(Y, B), A > B`.

**What can't be pinned down is left out and listed with the reason**, never guessed. Each item comes with a question asking you to rephrase it. Examples:

- "No man is a god." is left out, because a negative universal can't be a fact.
- "Ann is very happy." keeps `happy(ann)`, and the note says "very" was dropped.
- A predicate that is used but never defined is declared `dynamic`, and you are asked what it means.

### Optimise

**Optimise with mnns** runs `swipl optimise.pl -- in.pl out.pl` from mnns as a LucianOS job. Its PLOp, simplifier and Detlog stages each keep a rewrite only when mnns' proof checker accepts it. Lucian Office then checks again that every predicate gives the same answers before it uses the result.

### Prolog back to text

Each clause is written as a plain sentence that the Converter reads back as the same clause, for example "X is available if X works for Acme and X is not busy." A clause it can't say plainly is written as a `Prolog: ...` line, which reads back exactly, so nothing is lost.

### The proof

A conversion is used only when all of these hold:

1. **Round trip**: the regenerated text reads back as the same program, clause for clause, up to variable names, with the same questions.
2. **Same answers**: every predicate gives the same answers in both programs.
3. **Examples agree**: every example given for a drilled-down word comes out as you stated it. A failing example is shown, not hidden.
4. **Nothing lost**: the regenerated text reads back with nothing left out.

The built-in evaluator runs these checks in the browser. CI checks the evaluator against SWI-Prolog itself (see below).

### Formats

| App | First version |
| --- | --- |
| Writer | Paragraphs of facts, rules and questions; drilled-down meanings go into Data |
| Counter | A sheet with one row per named thing and one column per measure; totals and averages become `=SUM(...)` and `=AVERAGE(...)` rows |
| Presenter | Slides for the facts, the rules, the questions and what the vague words mean |
| Etcher | A flowchart with a box per predicate and an arrow from each condition to its result; dashed arrows mean "not" |
| Tabler | A table per fact predicate, plus the rules as views |

## Year level

| Level | Longest sentence | Word difficulty | New terms per paragraph |
| --- | --- | --- | --- |
| Year 1 | 8 words | the 250 most common words | 0 |
| Year 3 | 12 | 550 | 1 |
| Year 6 | 16 | 1,000 | 3 |
| Year 7 to Year 12 | 18 to 25 | any word | 3 to 7 |
| Undergraduate | 30 | any word | 9 |
| Postgraduate | 35 | any word | 12 |

- Words are ranked by a word-frequency list.
- Names and numbers never count as hard.
- From Year 7 up, rare words are allowed but still count as new terms.
- `simplify` replaces hard words with plainer ones (for example "utilise" becomes "use") and splits long sentences where they join two clauses. Every change carries its reason.
- A sentence that can't be split safely is reported, not rewritten.

## Office document

```json
{ "format": "lucianoffice/1", "id": "...", "app": "writer", "title": "Plan",
  "blocks": [{ "id": "b1", "type": "paragraph", "text": "..." }],
  "data": { "tall": "175" }, "opinion": "...",
  "history": [{ "seq": 1, "by": "character", "label": "...", "ops": [...], "inverse": [...] }] }
```

- **Changes:** made with `apply(doc, ops, { by, label })`. The ops are `insert`, `delete`, `set`, `move`, `data`, `opinion` and `title`. Each step stores its exact inverse.
- **Undo:** `undo` and `redo` work as usual. `undoLastBy(doc, 'character')` undoes the character's latest step even after later edits elsewhere. If a later step edited the same block, it refuses and says why.
- **Change log:** `changeLog` lists the additions, changes and deletions, and who made each one.
- **Prolog form:** `toProlog(doc)` writes facts any Prolog tool can read: `document/3`, `block/5`, `data/3`, `opinion/2` and `change/4`.

## Command API

```js
import { createCommands, characterHandler } from './index.js';
const commands = createCommands({ app: 'Presenter' }).register({
  name: 'add slide', patterns: ['add [a] slide about {topic}'],
  run: ({ args }) => ({ ops: [{ op: 'insert', block: { type: 'slide', text: args.topic } }] })
});
```

- **Patterns:** `[word]` is optional and `{name}` captures words.
- **Performing:** `perform(text, doc, { by: 'character' })` applies the ops as one undoable step and returns what to say.
- **Built-in commands:** every app has "undo that" (the character's last change), "undo", "redo", "what changed", "remember that X is Y", "my opinion is ..." and "rename to ...".
- **The character:** `characterHandler(commands, getDoc, setDoc)` is the `handle` for LucianOS's `mountCharacter`. Inside LucianOS, an app sends `{ type: 'lucianos.commands', names }` to the desktop. The desktop character then forwards what is said to the app in front (`lucianos.command`), and the app replies with `lucianos.reply`.

## Plug-ins

```js
import { createPlugins } from './index.js';
const plugins = createPlugins().register({ id: 'shout', name: 'Shout', apps: ['writer'],
  run: ({ doc, selection }) => ({ ops: selection.blockIds.map((id) => ({ op: 'set', id, key: 'text', value: '...' })) }) });
await plugins.run('shout', doc, { selection });
```

A plug-in runs on a selection, and its result is one undoable step recorded as `plugin:<id>`.

## Tests

```sh
npm test               # unit tests (Node 20+, no dependencies)
npm run check-prolog   # needs swipl; set MNNS_DIR to an mnns checkout to include optimising
```

`check-prolog` converts every sample text in `test/fixtures` and checks four things:

- the proof holds;
- SWI-Prolog gives the same answers as the built-in evaluator, for every predicate and question;
- with `MNNS_DIR` set, mnns optimises each program;
- any rewrite from mnns gives the same answers.

GitHub Actions runs both commands with real SWI-Prolog and mnns.

## Limits

- **The grammar is a subset of English** (the table above). Anything outside it is left out with a reason rather than guessed. Longer descriptions convert best as short, plain sentences.
- **Vague words** are drilled down only when there is a measurement to anchor them, or an answer in Data. Otherwise the Converter asks.
- **Year level** uses a built-in list of about 900 common words, not a full frequency dictionary.
- **Not yet connected:** texttoalg2 and Essay-Helper's keyword and positivity checks, which the plan names for the Converter. They are not wired in yet.

## Licence

BSD-3-Clause, like the rest of the LucianOS suite.
