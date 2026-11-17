# MathScribe: how to work in this repository

MathScribe is a calculation sheet: a sheet's lines are read into a tree
(`src/lib/tree/`), the tree into blocks (`src/lib/reading/`), each line worked out
by the engine (`src/lib/engine/`), and the blocks drawn in the Rendered tab
(`src/components/blocks/`) and written to LaTeX and Word
(`src/lib/output/constructs/`). The README's Structure section maps every folder.

## The architecture: a small core, and everything else a module

- **The core is small and generic.** Anything beyond the very core (chemistry,
  series, solving, vectors, and anything new) is a module that extends the core
  through its hooks. A special case for one feature never goes into the core as an
  `if`: it becomes a hook on the base class, which the feature's module overrides.
- **Adding a module is extending a class and dropping in its folder.** A module
  is a subclass of `EngineModule` (`src/lib/engine/core/module.ts`) that
  overrides the hooks it needs: its grammar (`grammar()`: kinds of line, node and
  token, lex and text rules, token roles), its `@` members (`builtinMembers()`),
  its line forms (`LineForm` subclasses), its readers (`ReadsLines`), its
  settings, its LaTeX preamble, and so on. It lives in a folder of its own in
  `src/modules/`, whose `index.ts` exports the class as its default; every folder
  there is found and installed (`src/modules/index.ts`). MathScribe's own modules
  (chemistry, series, solve, vectors) are there in just that form. Nothing else in
  the app is edited to add one. This is meant to be within reach of someone
  running MathScribe locally who wants a module of their own
  (`src/lib/plugin.test.ts` is one), so every hook is documented where it's
  declared, and a module can't need more than the hooks offer: if it does, the
  hook is added to the base (with a no-op default), not a special case to the
  core. (Still being completed: see "One harmonious structure" in `TODO.md`, for
  a module's own block kinds, views and editor features, and the line pipeline.
  Where a module still has to be named outside its own folder, that's a gap to
  close, not a pattern to follow.)
- **A module uses MathScribe only through the module API,** `src/lib/plugin.ts`:
  it imports from there, its own folder, and the `public.ts` of a module it
  `requires`. What a module needs that isn't there is added there, documented.
- **The rest of the app uses the engine through `engine/index.ts`, and a module
  through its `public.ts`,** never the core's or a module's own files.
  `src/lib/engine/boundaries.test.ts` checks all of this, and that the core needs
  no module at any depth. A type-only import is `import type { … }`
  (`import { type X }` still loads the file).
- **A kind of thing is a class extending a base, in a typed table.** A block
  kind's `Construct` (LaTeX and Word) and view (the Rendered tab), a node's
  `NodeReader`, an `@` `Member`, a `LineForm`, a module: each kind is one class,
  found by its kind in a table TypeScript checks is complete. Plain declarations
  (lex rules, text rules, a grammar's kinds) are data the core and modules add to.
- **Each piece of syntax is read once,** by the tree (`src/lib/tree/`): the
  engine, the readers, the outputs and the editor read its tokens, not the text
  again with patterns of their own.

## Conventions

- **No magic strings or numbers.** A value with a meaning is a named constant in
  one place. A set of words is a `words({ … })` list (`src/lib/syntax/patterns.ts`:
  `.words`, `.has`, `.alternation`), with its type from `WordOf`; code writes
  `BLOCK_KIND.card`, never `'card'`. Related shapes extend a shared base type.
- **Patterns** are written with `src`, `named`, `optional`, `regex`
  (`src/lib/syntax/patterns.ts`), and their groups are named and read as
  `.groups`. The sheet language's own patterns live in `src/lib/syntax/`, one
  file per concept; a module's in its own `syntax.ts`.
- **MathScribe's own functions are written with `@`** (`@tuple`, `@table`,
  `@solve`, `@chem.substance`); mathjs's maths stays bare (`sin`, `sqrt`).
- **`TODO.md` is a paper trail.** Every to-do goes there; a resolved one keeps
  its original text, ticked, with a "Resolved:" write-up of how.
- **Refactors are behaviour-neutral**, one step at a time, checked in with Emily
  between steps. The golden tests (`src/lib/golden.test.ts`) prove the outputs
  didn't change; where a step swaps one way of reading something for another,
  run both side by side over the whole suite before switching.
- **Commit and push only when asked.** End commit messages with the
  co-author line.
- **Comments** say what a thing is and why, in plain sentences, as the existing
  ones do.

## Checking work

- Type check: `npx tsc -p tsconfig.app.json --noEmit` (`tsc -p .` checks nothing).
- Lint: `npx oxlint`.
- Tests: `npx vitest run`, from `C:\…` (an uppercase drive letter: from `c:\` every
  test fails at "reading config").
- Make edits with the editor tools, not shell scripts, which mangle backslashes
  and backticks in TypeScript. After a batch of edits, touch the changed files so
  a running dev server reloads them all.
