# MathScribe: working in this repository

Pipeline: sheet text → lossless tree (`src/lib/tree/`) → blocks (`src/lib/reading/`) → engine (`src/lib/engine/`) → Rendered tab (`src/components/blocks/`) and LaTeX/Word exports (`src/lib/output/constructs/`). `README.md` (Structure) maps every folder.

## Architecture

- **Small generic core; features live in modules.** Never add a feature-specific `if` to the core: add a hook with a no-op default on `EngineModule` (`src/lib/engine/core/module.ts`), documented where it's declared, and override it in the module.
- **Modules (`src/modules/<name>/index.ts`):** subclass `EngineModule` (`grammar()`, `builtinMembers()`, `units()`, `functions()`, `LineStep`/`LineForm` at a `LINE_STAGE`, `ReadsLines`, settings, `latexPreamble`, `blockKinds` for a `CustomBlock`, `editorExtensions`, …) and export it as default. `src/modules/index.ts` finds every folder (loaded first by `main.tsx` and the tests' setup). Adding one edits nothing else. `src/lib/plugin.test.ts` is an example; "One harmonious structure" in `TODO.md` lists the leaks left to close (a gap, not a pattern).
- **Import boundaries** (`src/lib/engine/boundaries.test.ts`):
  - A module imports only `src/lib/plugin.ts` (the module API), its own folder, and a required module's `public.ts`. What a module needs that isn't there is added to `plugin.ts`, documented.
  - The app imports only `src/lib/engine/index.ts` and a module's `public.ts`.
  - The core never imports a module. A type-only import is `import type { … }` (`import { type X }` still loads the file).
- **The core asks; modules answer.** The core never names a module's concept in code (its members, hidden names, error messages, blocks): it asks through a hook, and the module answers. Comments may use a module's feature as an example.
- **Kinds of value are core; what's written with them is a module's.** Numbers, quantities, tuples and series (members `t[1]`, statistics `t.avg`) are the core's. A module adds notation and operations: vectors give a tuple a look; series' `[…]`, ranges, conditions, `@table` and `@plot` are the series module's.
- **One maths adapter** (`src/lib/maths/library/`: `index.ts` the interface, `mathjs.ts` the adapter): only the adapter imports `mathjs` (`boundaries.test.ts`). Everything else, modules included, uses the interface (MathScribe's own names: `Expr`, `Value`, `Quantity`; functions, never a library object's methods; `mathsError` kinds, never message text), so a change of maths library touches the adapter alone. A module adds to the library through `EngineModule.units()` and `functions()`, and `declareUnit` for a unit a sheet makes as it goes (a species).
- **A class per kind, in typed tables:** block `Construct`s and views, `NodeReader`s, `@` `Member`s, `LineForm`s, modules. Lex/text rules and grammar kinds are plain data.
- **Syntax is read once, by the tree:** readers, engine, outputs and editor use its tokens, never their own regexes on the text.

## Conventions

- **No magic strings/numbers:** named constants (`BLOCK_KIND.card`, never `'card'`); word sets with `words({ … })` (`src/lib/syntax/patterns.ts`: `.words`, `.has`, `.alternation`, `WordOf`). Related shapes extend a shared base type.
- **Patterns:** `src`, `named`, `optional`, `regex` (`src/lib/syntax/patterns.ts`), read by `.groups`. Core syntax in `src/lib/syntax/` (a file per concept); a module's in its `syntax.ts`.
- **MathScribe's own functions use `@`** (`@tuple`, `@table`, `@solve`, `@chem.substance`); mathjs's stay bare (`sin`, `sqrt`).
- **What a user writes is described once, in the language tree** (`src/lib/language/`: `topics.ts`, a module's `language.ts`, settings declarations), with an example; the Reference tab, AI primer, tooltips and `docs/REFERENCE.md` come from it, and the tests run every example. After changing it, run `npm run docs` (not `vitest -u`).
- **Comments** say what a thing is and why, in plain sentences, as the existing ones do; they point to the language tree (`{@link …}`) rather than restate what a user writes.
- **One way to write each thing:** each meaning has a single canonical spelling (`pm` for an uncertainty, never `±` or `+-`; `±` is only how it's shown). Don't add an alias or a second spelling; when two exist, keep one and drop the other.
- **No backward compatibility, for now:** when the language changes, the old form simply stops being read; no converting old sheets or share links, no reading both forms, no deprecation warnings.
- **Refactors are behaviour-neutral,** one step at a time, checked in with Emily between steps: the golden tests (`src/lib/golden.test.ts`) prove outputs unchanged, and a step swapping one way of reading for another runs both side by side over the whole suite first.
- **Read lean:** Grep, then Read with `offset`/`limit`; never read whole `calculator.ts` (~63 KB), `CHANGELOG.md`, `README.md`, `topics.ts`, `docs/REFERENCE.md` or the golden snapshot (generated: Grep it). Don't re-read a file just edited, and use a subagent only when asked.
- **`TODO.md` holds open to-dos only,** each tagged `[high]`, `[medium]` or `[low]`. A finished one moves to `CHANGELOG.md` with its original text, ticked, and a "Resolved:" note of how. Read only the part of either you need.
- **Git and edits:** commit and push only when asked; end commit messages with the co-author line. Edit with the editor tools (shell scripts mangle backslashes and backticks); after a batch of edits, touch the changed files so a running dev server reloads them.

## Checking work

- Type check: `npx tsc -p tsconfig.app.json --noEmit` (`tsc -p .` checks nothing).
- Lint: `npx oxlint` (CI runs it; where Windows Application Control blocks its binding, leave it to CI rather than retrying).
- Tests: the affected files while iterating (`npx vitest run <file>`), then the whole suite (`npx vitest run`), from `C:\…` (an uppercase drive letter: from `c:\` every test fails at "reading config").
- Visual check of the exports: `npm run visual` (and `npx tsc -p tsconfig.visual.json --noEmit`) exports `visual/showcase.txt` to LaTeX and Word, compiled to PDF and pages in `visual/out/` with `report.txt`. Run it and look at every page when Emily asks, and after a change that could alter the exports (constructs, latexKit, docx, plots, how names are typeset, a new kind of block); add what a new feature needs to the showcase sheet.
