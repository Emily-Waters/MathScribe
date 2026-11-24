# MathScribe

A plain-text calculation sheet. Type calculations on the left, one per line;
every line is typeset on the right as `symbolic = substituted = result`, the way
working is written by hand.

**Use it online:** <https://emily-waters.github.io/MathScribe/> (nothing to
install, no sign-in, and nothing leaves your browser).

```
m = 2.00 kg pm 0.05 kg
a = 9.81 m/s^2
F = m * a              →  F = ma = 2.00 kg × 9.81 m/s² = (19.6 ± 0.5) N
```

**What it does:**

- **Units** carried through every calculation, converted with `to`, and tidied
  (kg·m/s² becomes N).
- **Significant figures** counted as typed and applied by the usual rules.
- **Uncertainties** (`pm`) propagated automatically, correlations included, with
  the working shown on request.
- **Working shown**: the formula, the values substituted, and the result, for
  every line, including inside your own functions.
- **Data**: CSV import, series statistics, tables, plots with weighted linear
  fits, and selections of rows.
- **Chemistry**: formulas, molarity, and species that cancel like units.
- **Solving**: equations rearranged and solved for an unknown.
- **Documents**: headings, prose with live values, lists and blocks; exported to
  LaTeX and to Word with editable equations.
- **Create with AI**: a prompt for any AI model to write a sheet (a test, an
  assignment, a lab write-up), and its answer opened as a sheet.

**Contents:** [The window](#the-window) · [Saving](#saving) ·
[Create with AI](#create-with-ai) · [Syntax](#syntax) · [To do](#to-do) ·
[Development](#development) · [Structure](#structure)

Built on [mathjs](https://mathjs.org) (parsing, evaluation, units),
[KaTeX](https://katex.org) (rendering) and [CodeMirror](https://codemirror.net)
(the editor).

## The window

**On a phone** (or any window narrower than 800px), Input and Output are shown one
at a time, with a switch between them under the sheet tabs. Tapping a line of the
output goes to it in the input; switching to the output scrolls it to the line the
cursor is on. Long lines wrap in the editor, a line's note goes under its equation,
and the New and Save menus show each button's name under its icon.

**Theme and editor** (top bar, the half-dark circle): the app's theme, **System**
(Light or Dark, following your computer's setting), **Light**, **Dark** (blue-grey
slate), **Charcoal** (neutral greys, like a code editor's dark theme) or **Black**
(true black); and the editor's settings: its syntax colours, which keys accept a
suggestion, and whether results show in the editor. The choices are remembered in
the browser.

**Export** (in the top bar's Save menu, the arrow into a tray) opens a dialog to download the sheet as a document:

- **Word** (`.docx`): real Word equations you can edit (not pictures). Notes sit
  at the right margin beside their equation (under it, when the equation is too
  wide to share the line), blocks are cards with a shaded title,
  `@layout.list` / `@layout.list(1)` blocks are Word lists, and headings use
  Word's Heading styles, so they appear in the navigation pane. For Google Docs,
  upload the file to Drive and open it with Google Docs; its equations become
  Google Docs equations.
- **LaTeX** (`.tex`): a compilable document, laid out like the Rendered tab:
  equations flush left with notes on the right, compact spacing, the working of
  a solve indented above its line, and blocks as cards. An equation too wide for
  the line is set one `=` per row, lined up (LaTeX measures it, so the paper,
  margins and font size decide). **Show the LaTeX** and **Copy the LaTeX** are
  there too.

Both use the dialog's document options: the equations' alignment, spacing, cards
(in LaTeX, the standard `mdframed` package), section numbering, font size, paper,
margins and an optional title, author and date. The format and the options are
remembered in the browser.

- **Input** (left): the sheet, in a code editor with MathScribe syntax colours.
- **Output** (right): the typeset sheet. The top bar's **Library** (the books) and
  **Reference** (the question mark) buttons show those in its place while they're
  on (lit); the × in the pane's header, or the button again, goes back to the sheet.
  - **Library**: common equations from first-year physics (kinematics, forces,
    energy and momentum, oscillation, waves and optics, electricity, heat, modern
    physics) and general chemistry (moles and solutions, gases, thermochemistry,
    kinetics), searchable. Each is a one-line function with a worked example;
    **Insert** puts it in the sheet at the cursor (on the cursor's line if it's
    empty, otherwise just below it), where it's ordinary text you can rename or
    change. Temperatures are converted to kelvin on the way in (`T to K`), so
    25.0 degC works. As in the Reference, a menu picks the topic (or all of
    them), and the search box narrows it to the equations with every word you type.
  - **Reference**: every feature as an example you can copy, shown with its real
    output (each example is evaluated live, so the reference always matches what
    MathScribe actually does), plus the built-in constants and the keyboard
    shortcuts. A menu picks
    the topic (or all of them; it's remembered), and a search box narrows it to
    the entries with every word you type.

  The Output pane's options menu (the sliders) holds the output settings:

  | Setting | Does |
  | --- | --- |
  | Sig figs | **Auto** works out each result's sig figs from its inputs; a number shows every result to that many |
  | Show substitution | Include the step with values put in for the variables |
  | Uncertainty working | How `delta F` is worked out on the page (the result is the same): **Partial derivatives**, δY = √((∂Y/∂A · δA)² + …), or **Relative**: products and quotients as δY = Y√((δA/A)² + (n δB/B)² + …), sums and differences as δY = √(δA² + δB²), anything else by derivatives |
  | Use ≈ for every rounded result | Off: ≈ only when every input is exact (`1/3 ≈ 0.333`); on: before any rounded result |
  | Show · in every product | Off: products as in a textbook, ½mv²; on: ½·m·v² |

  They're remembered in the browser.

**Linked input and output:** click any line of output (a calculation, a heading, a
step inside a function or constants card) to put the editor's cursor on its source
line. Moving the cursor in the editor highlights the matching output and scrolls it
into view. Lines with an error get a red bar beside the line number, warnings an
amber one; hover the bar to read the message.

### The editor

| Keys | Does |
| --- | --- |
| Tab / Shift+Tab | Indent / dedent by one level (4 spaces) |
| Backspace in the indentation | Removes a whole level |
| Enter | Keeps the indentation; one level deeper after a line ending in `{`, or leaving a bracket open |
| `}` | Dedents itself to match its block |
| Ctrl+X / Ctrl+C, nothing selected | Cut / copy the whole line (pasting it puts it above the current line) |
| Alt+↑ / Alt+↓ | Move the line (or selected lines) up / down |
| Shift+Alt+↑ / ↓ | Duplicate the line |
| Ctrl+Click a name, or F12 | Go to where a variable, function or constant is defined (names you can jump from are underlined while Ctrl is held) |
| F2 | Open a small rename panel beside the variable or function and rename every use in scope |
| Ctrl+F | Find and replace |
| Ctrl+Shift+F | Format the sheet: each line indented by the blocks it's in, a call over several lines laid out, and maths spaced as it's written: `x= 5kg` → `x = 5 kg`, `max(x1,x2)` → `max(x1, x2)` (Save and Save as format it too; strings, notes and prose are left as they are) |
| Ctrl+/ | Comment or uncomment the line (or selected lines) with `//` |
| Ctrl+Z / Ctrl+Y | Undo / redo |

On a Mac, use ⌘ for Ctrl. `{ }` blocks (`@layout.list { }` too) and an import's rows fold
from the arrows in the gutter, and so do sections: a `#` heading folds up to the next
`#`, a `##` up to the next `##` or `#` (or the end of the block it's in). Section lines
are lightly highlighted, subsections more lightly, so the sheet's outline stands out.

The output follows as you type. A sheet that takes a while to work out (thousands
of rows of imported data) is worked out once typing pauses instead, so typing never
waits for it; the output catches up a moment after you stop.

**Suggestions as you type** (Tab accepts, Esc closes, Ctrl+Space asks). Enter always
starts a new line, so a unit suggested at the end of a line doesn't get in the way;
to have Enter accept a suggestion too, choose *Tab or Enter* under Theme and editor →
Accept suggestions.

| Typing | Suggests |
| --- | --- |
| a name | variables defined above and in scope (not another block's locals), with their value; a function's parameters inside its body; your functions with their parameters (accepting one puts the cursor between the brackets); a series itself (`t`), `t[n]` for one of its values, and after `t.` its statistics (`avg`, `count`, …); built-in functions, `pi`/`e`, and keywords |
| `@` | constants with their description and value, including your own `@constants`; `@chem`; and, at the start of a line, `@layout` and `@constants { }` |
| `@chem.` | its elements, with their molar masses, and its functions `mm` and `total` |
| `@layout.`, at the start of a line | the layouts (`text`, `list`, `center`, `titlepage`), `column` and display settings (`hidden`, `sym`, `val`, …); after another dot, the ones not chosen yet |
| a unit, after a number or `to` | units, with what they are in SI (`angstrom = 1e-10 m`); `percent` after `to` |
| `#` after a line's text | display commands, with what each does |
| `\` and a Greek letter's name | the letter: `\Delta` gives Δ (see Greek letters) |

Nothing is suggested in headings, `>` text, `@layout.text` blocks, `@latex` blocks or notes.

**Hover over a name** to see what it is: a variable's value (typeset) as it is
at that line (after a line that sets it again, the new value) and where it's
defined, a function's signature, a constant's full value, a unit in SI, or what
a command or keyword does.

**Results in the editor:** each line that works something out shows its result,
faintly, at its end (`F = m * a      = 19.6 N`), so you can check a value without
looking across at the output. A series written over several lines shows each
value's member name before it, faintly (`x₁: 1.0 s`, `x₂: 2.0 s`), so you can see
which value is which without counting. Turn them off under Theme and editor.

**Parameter hints:** inside a call's brackets, what the function takes appears
above the cursor, the parameter being typed in bold: `E_k(1, ` shows `E_k(n, m
to kg)` with `m to kg` bold. It works for your own functions, MathScribe's `@`
functions and mathjs's.

**Keyboard shortcuts** are listed in the Reference (its Keyboard shortcuts topic).

**Syntax colours** (Theme and editor → Colours): **Default**, **Vivid**,
**Classic** (familiar code-editor colours, a good match for the Charcoal theme),
**High contrast** and **Minimal**, each with a light and a dark version that
follows the app theme. The choice is remembered in the browser.

**Custom** lets you pick a colour for each kind of text (numbers, units,
variables, functions, constants, keywords, commands, notes, headings, text,
LaTeX, block titles and operators) with your browser's colour picker, previewed
live in the editor. It starts from the theme you had selected (change it with
**Start from**); colours you haven't changed keep following that theme, and ↺
puts one back. Light and dark colours are kept separately: you edit the set for
the current app theme. The colours
follow how MathScribe reads a line: in `9.81 m/s^2` the unit is coloured as a unit,
and in `5 kg * m` the `m` is coloured as a variable.

**Imported data in the editor:** `@import()` shows a **Choose a CSV file…** button
between its brackets, and the file's rows go into the sheet under the line, folded
away (unfold them from the gutter; ▼ and ▲ after the line show and fold them). The
file's name is a button too, to choose another file. The rows show their row
numbers, in colour, instead of line numbers (row 3 holds t_3, x_3 and y_3), and count
as part of the import's line, so the line after a 27-row import on line 1 is line 2.
They're laid out as a table, the columns padded so the digits line up. An import
and its rows stay together: moving, deleting, cutting or copying the line takes its
rows too, and the × after it (or **Remove** in the output) removes the whole import.

## Saving

Sheets are plain `.txt` files. Each open sheet has its own **tab** above the
editor: click a tab to switch, × (or a middle-click) to close it, and + for a new
sheet. A dot on a tab means it has changes not yet saved to a file; closing such a
tab asks first. Each tab keeps its own undo history, cursor and scroll position,
and the output always shows the active tab.

The buttons in the top bar act on the active tab. There are three: **New** (a page
with a plus), **Open** (a folder) and **Save** (a floppy disk). New and Save each open a
small bar of buttons under them, the menu's button lit while it's open: New has New,
Template and Create; Save has Save, Save as, Export and Share. They're icons; hovering
over one shows its name and what it does:

| Button | Icon | Shortcut | Does |
| --- | --- | --- | --- |
| New → New | page with a plus | | Opens an empty sheet in a new tab |
| New → Template | page in panels | | Lists the templates under the bar; choosing one opens a new sheet started from a template: a lab report (title page, purpose, method, data, calculations, results, discussion, conclusion) or a problem set, each with a little of every section filled in to write over |
| Open | folder | Ctrl/⌘ + O | Opens one or more sheets (select several in the dialog), each in its own tab; a file that's already open is switched to instead |
| Save → Save | floppy disk | Ctrl/⌘ + S | Formats the sheet and saves it to the current file, or asks where the first time |
| Save → Save as | floppy disk and pen | Ctrl/⌘ + Shift + S | Formats the sheet and saves it to a new file |
| Save → Share | chain link (a tick once copied) | | Copies a link that opens the sheet: the sheet is in the link itself (compressed), so nothing is uploaded. Opening the link opens it in a new tab. A very long sheet (a big import) is too long for a link: send its file |

Auto-saving happens at two levels:

- **In the browser, always.** Every open sheet is kept in the browser's storage on
  every edit, so a refresh or closing the browser tab never loses work; all your
  sheets come back as you left them, with the same one active.
- **To the file, in Chrome and Edge.** Once you open or save a file, it stays linked
  and changes are written to it about a second after you stop typing. The top bar
  shows the file name and "saved", "saving…" or "unsaved changes". If the browser asks
  for permission to edit the file, allow it; if auto-save is ever paused, pressing
  Save resumes it. After reloading the page, the work is restored from the browser
  but the file isn't linked any more: use Save (and pick the same file) or Open again.

Firefox and Safari don't let web pages write to files, so there Save downloads the
sheet as a file instead, and the browser copy keeps your work safe in between.

Nothing is sent anywhere and there's no sign-in: your sheets and settings stay in
your browser and your own files.

## Create with AI

**Create** (in the top bar's New menu) has an AI model write a sheet for you: a test, an
assignment, worked examples or a lab write-up.

1. Choose what to make, describe it ("A midterm for PHYS 1100 covering work, energy
   and momentum"), and tick what it should have: worked solutions (at the end of
   the sheet, shown by default), hidden solutions for a copy to hand out, marks,
   hints, a formula sheet, uncertainties, a graph, and so on.
2. **Copy prompt** (or Ctrl+Enter) copies a prompt with your request and
   MathScribe's rules for writing a sheet. Paste it into any AI: ChatGPT, Claude,
   Gemini, …. **Show the whole prompt** shows exactly what's copied.
3. Paste the AI's whole answer back into the dialog, and **Open as a new sheet**
   takes the sheet out of its code block and opens it in a tab of its own, named
   from its first heading.

Nothing is sent from MathScribe: the prompt only goes to your clipboard. Errors in
what the AI wrote are marked line by line, as in any sheet. In a test or
assignment, the questions come first and each solution is a `{ }` block at the
end, which starts by defining the question's values; put the solution
blocks in `@layout.hidden { }` to hide them. The dialog remembers your last choices.

## Syntax

**The reference is [docs/REFERENCE.md](docs/REFERENCE.md):** every topic, how each
thing is written, what it does, the rules for writing it, and examples, made from the
same source as the app's Reference tab and the AI primer, so it's always as
MathScribe is.

A sheet is lines, worked out from top to bottom: calculations (`F = m * a`),
headings (`# Title`), prose (`> Some text`, with `{{name}}` for a value), comments
(`// …`), and blocks (`Title {` … `}`). An `@layout` block (`@layout.val`,
`@layout.multiline`) says how much of the lines in it to show; a note goes after `//`. Values carry units, significant figures
and uncertainties through every calculation by themselves.

The reference has every part, with the rules for writing it and examples:
[Basics](docs/REFERENCE.md#basics), [Units](docs/REFERENCE.md#units),
[Significant figures](docs/REFERENCE.md#significant-figures),
[Uncertainty](docs/REFERENCE.md#uncertainty),
[series, tables and plots](docs/REFERENCE.md#repeated-measurements),
[Functions](docs/REFERENCE.md#functions), [Vectors](docs/REFERENCE.md#vectors),
[Constants](docs/REFERENCE.md#constants), [Chemistry](docs/REFERENCE.md#chemistry),
[Display commands](docs/REFERENCE.md#display-commands),
[Layout](docs/REFERENCE.md#layout) and [Solving](docs/REFERENCE.md#solving).

## To do

What's planned is in [TODO.md](TODO.md); what's been done, with how it was
addressed, is in [CHANGELOG.md](CHANGELOG.md).

## Development

```
npm install
npm run dev        # the app, at localhost
npm test           # the tests, once (npm run test:watch re-runs them as you edit)
npm run lint
npm run build      # type check, then build the site
```

**Tests** cover the calculation rules, the sheet structure, both exports, and the
editor's highlighting, indentation, folding and suggestions. The golden tests
(`src/lib/golden.test.ts`) record the full output of whole sheets (the sample
sheet, a hydrogen-orbitals worksheet and every Reference example) in
`src/lib/__snapshots__/`; when a change alters that output on purpose, check the
difference and update the recording with `npx vitest run -u`. The robustness test
(`src/lib/robustness.test.ts`) runs malformed and awkward sheets through reading,
the editor's information and both exports, which must never throw.

**Failing safely:** a line that fails in a way nothing expected shows an error on
that line only; a sheet that can't be read at all shows one error instead of a
blank app; and a failure drawing the output is contained to the output pane, with
the editor and your text untouched.

**Deploying:** every push to `main` lints, tests and builds the site and
publishes it to GitHub Pages (`.github/workflows/deploy.yml`); progress shows in
the repository's Actions tab. If any step fails, nothing is published. The build
uses `/MathScribe/` as its base path (`vite.config.ts`), so if the repository is
renamed, change it there too.

## Structure

- `src/config.ts`: app-wide settings in one place: browser storage keys, default
  and example calculation options, when a sheet is worked out while typing
  (`EVALUATION`), sheet file type, timings, the pane divider's limits;
  `src/useSettled.ts`: a value once it stops changing (for working out slow sheets
  after a pause)
- `src/lib/` is in folders by what each part is for: `syntax/` (the sheet
  language's words and patterns), `tree/` (a sheet as a tree of nodes),
  `reading/` (the tree read into blocks), `engine/` (working lines out),
  `sheet/` (the blocks, their values and names, and what the editor is told),
  `output/` (the Rendered tab's pieces and the two exports, with `constructs/`),
  `content/` (the sample, Reference, Library and Create's prompt), `data/`
  (imported data, files, browser storage) and `maths/` (sig figs, algebra,
  brackets, mathjs's names). `builtins.ts` and `constants.ts` (everything under
  `@`) are at its top.
- `src/lib/syntax/`: the sheet language's words and patterns, one file per
  concept (names and numbers, settings, text markup, blocks, constants,
  notes, `@layout`), written with `patterns.ts` (`src`, `named`, `words`);
  `src/lib/syntax.ts` gathers them. Shared by the tree, the engine, the outputs
  and the editor
- `src/lib/sheet/names.ts`: the names the engine makes for itself (`delta__F`, `at__c__5`,
  `a__x_1` for `a.x_1`, `t__3` for a series' member `t[3]`, `t__avg` for `t.avg`, a plot's fit), each built and
  read in one place; `src/lib/maths/mathjsNames.ts`: mathjs's operator and function names
  and the units the engine uses by name
- Shared values are named once: a word, marker or setting used in more than one
  place is a constant in one of the modules above (or the series module's `tableSettings.ts` for the
  words settings are written with), not repeated as text
- Kinds come from one definition: every set of tags (a block's kind, a symbol's,
  a display mode, a layout style, …) is a const object, `BLOCK_KIND = { group:
  'group', … }`, with its type derived from it; code writes `BLOCK_KIND.group`, never
  `'group'`. Related types extend a shared base rather than repeating fields.
- `src/lib/sheet/blocks.ts`: the blocks a sheet is read into: `BLOCK_KIND`, `BlockBase`
  and the small parts blocks share (a note, an error, hidden, spanning lines,
  holding other blocks), and each block's type; `src/lib/output/alignment.ts`: left,
  centre and right, for the Document option and the Word export
- `src/lib/data/storage.ts`: reading and writing the browser's storage safely;
  `src/useFlash.ts`: copying to the clipboard, and the brief "Copied" messages
- `src/lib/engine/`: evaluation with scoped variables, unit-literal handling,
  sig-fig tracking, uncertainty propagation, functions, tables, plots and
  selections, LaTeX generation. `index.ts` is all the rest of MathScribe imports;
  `core/` is split by concern, one file each: the `Calculator` class
  (`calculator.ts`), the mathjs instance (`math.ts`), scopes, unit literals,
  tuples (and the look a module gives one: `TupleLook`), uncertainty, series,
  imported data and LaTeX. `writer.ts` writes an expression for mathjs from
  its tokens (`src/lib/tree/lexer.ts`), one writer per kind of part: the
  core's (a quantity, `(9.81 * unit("m/s^2"))`; a unit after `to`; a number
  kept as typed), and a module's (`EngineModule.writers`: a vector, a species),
  tried first.
  The modules that extend it are in `src/modules/` (below). Each variable is one record (`Variable`: value, sig figs,
  uncertainty, how it's shown) in a scope per `{ }` block or function call; each
  scope keeps a series index, and selections and named plots are lookups into the
  variables they pick (`Views`). mathjs sees just the values, through `Values`.
- `src/modules/`: the modules, MathScribe's own and anyone's, each a folder whose
  `index.ts` exports its class as its default; every one there is found and
  registered (`src/modules/index.ts`, which can leave one out, and which
  `main.tsx` and the tests' setup load first). A module is an
  `EngineModule` subclass (`src/lib/engine/core/module.ts`) overriding the hooks
  it needs, where an exception to the core's rules comes from; it uses
  MathScribe only through the module API, `src/lib/plugin.ts` (the engine's
  `ModuleHost`, the tree's rules, the readers, the sheet's syntax, …), and can
  add steps to a line's pipeline: a line goes through stages in order (`LINE_STAGE`:
  raw, names, members, shape, settings, expand, expression, check, work), the
  core's steps first at each, then the modules' (`LineStep`, which can change the
  line on its way, and `LineForm`, a step that works a whole kind of line out:
  `@table(…)`, `r = @chem.reaction(…)`), until a step gives its result. A
  module that builds on another says so (`requires`): it's installed after it,
  and may import from it (its `public.ts`) and no other. What the rest of the app
  may use of a module is its `public.ts` (`modules/series/public.ts`: what the ⚙
  menus and the plot drawing need); a module adds to what the app knows through
  hooks, not by being imported: the LaTeX packages its notation needs
  (`latexPreamble`), the settings it adds after a name with what each does
  (`lineSettings`), what its kinds of token are (`ModuleGrammar.tokenRoles`, which
  the editor colours by), the names its blocks define (`CardBlock.defines`), and
  whether a line form's name is a namespace (`LineForm.assignsNamespace`). A
  module can have kinds of block of its own (`blockKinds`: a `CustomBlock`'s
  construct and view) and add to the editor (`editorExtensions`: series' ⚙
  menus, `modules/series/tableMenu.ts`).
  `src/lib/engine/boundaries.test.ts` checks all of it: the core needs no module,
  a module imports only the module API, its own folder and what it requires, and
  the rest of the app uses the engine through `index.ts` and a module through its
  `public.ts`. `src/lib/plugin.test.ts` is a module written that way, as an example.
- `src/lib/data/csv.ts`: reading imported data (columns, units, uncertainty columns);
  `src/editor/dataBlocks.ts`, `dataBlockLines.ts`: an import's rows in the editor
  (row numbers, folding, the table look, moving and deleting them as one)
- `src/modules/series/tableSettings.ts`, `plotSettings.ts`: a table's and plot's settings
  after the semicolon, read and written; `tableMenu.ts` beside them: their ⚙ menus
- `src/modules/series/plotGraph.ts`: the linear fit, axes, and drawing a plot as SVG;
  `plotLatex.ts` beside it: a plot as a pgfplots graph; `plotFigure.ts`: a plot as the module's
  kind of figure (`ModuleFigureKind`: drawn above its line's equations, in each output)
- `src/lib/output/figures.ts`: figures (a module's drawing of a line, such as a plot) as
  pictures for the Word export, drawn on a canvas from the SVG the module gives
- `src/lib/maths/brackets.ts`: choosing ( ), [ ] and { } by nesting in the output
- `src/modules/chemistry/`: the chemistry module. `chemistry.ts`:
  formulas in braces, species as units, reading a formula's atoms for a substance's molar mass,
  reactions and species names; `species.ts`: giving values their species and the
  strict rules; `namespace.ts`: its `@chem` members; `syntax.ts`: its names and
  line patterns (`@chem.species`, reactions); `elements.ts`: the elements
  and their atomic weights; `reaction.ts`: `r = @chem.reaction(…)` as a line
  form; `substance.ts`: `X = @chem.substance({…})` and its members, as a line form; `readers.ts`: its lines of a sheet (`@chem.species { }`, a reaction on
  its own); `grammar.ts`: its kinds of line and token (a species, after a
  unit or a value); `writers.ts`: writing a species for mathjs; `module.ts`:
  `ChemistryModule`, where the engine's hooks meet them.
  `src/lib/output/katex.ts`: KaTeX with mhchem, which everything that draws maths imports
- `src/modules/formula/`: the formula module: an `@formula { }` block (`grammar.ts`), read into a card of
  formulas (`readers.ts`), each typeset by `Calculator.formulaTex` with every name a symbol, never worked out
- `src/modules/series/`: the series module: series in square brackets (`[…]`, ranges and slices), `@table(…)`, `@plot(…)`
  as line forms (`series.ts`, `table.ts`, `plot.ts`), conditions in a series' brackets (`where.ts`), and the
  columns they share (`columns.ts`: a column, or a series, worked out row by row)
- `src/modules/solve/`: the solve module: `x = @solve(eq, x)`, by
  rearranging or numerically from a guess (`solve.ts`), and `@tuple(x, y) =
  @solve(eq_1, eq_2)` by substitution (`system.ts`); `src/lib/maths/solve.ts` has the
  algebra they use (isolating an unknown, polynomials)
- `src/modules/vectors/`: the vectors module: a vector is a tuple
  with a look of its own. `syntax.ts`: `<…>`, `@vector(…)`, `:ijk` and `:xyz`;
  `literals.ts`: where `<…>` is a vector; `grammar.ts`: reading `<3.0, 4.0> N`
  into the tree, and writing it for mathjs; `components.ts`: F_x, F_y from `F:xyz`;
  `module.ts`: `VectorModule`, how vectors are drawn (⟨…⟩, î ĵ k̂) and dot and
  cross products
- `src/components/ErrorBoundary.tsx`: keeps a failure drawing the output from
  blanking the app
- `src/lib/content/aiPrompt.ts`: Create's prompt (what can be made, its tickboxes, and the
  rules of writing a sheet, whose examples a test evaluates) and reading the AI's
  answer back; `src/components/CreateDialog.tsx`: the dialog
- `src/lib/sheet/document.ts`: evaluating a sheet; `src/lib/sheet/sheetIndex.ts`:
  what the editor is told about it (symbols, definitions, diagnostics, line numbers)
- `src/lib/tree/`: a sheet as a tree of nodes, every character in a token, so
  text → tree → text gives back the text exactly (`encode`, `decode`), through
  JSON too. `nodes.ts`: the shapes (`Token`, `SyntaxNode`, `SheetTree`) and the
  core's kinds; `registry.ts`: every kind of node and token, declared once by the
  core or a module; `grammar.ts`: contexts and kinds of line, declared as data
  (the core's in `core.ts`, a module's by `EngineModule.grammar()`); `lines.ts`:
  lines read into nodes, cached by text and context; `lexer.ts`: an
  expression read into tokens (numbers, units, names, mathjs's delimiters and
  keywords) and nodes (a quantity, a call, a value in text), by rules: the
  core's, mathjs's grammar where it has one, and a module's
  (`ModuleGrammar.lexRules`: a vector, a species, a series call's settings), tried first;
  `shapes.ts`: what a line assigns to, before its `=`, as a node (a name with
  its settings, a one-line function's head, names to unpack into), read the
  same way by the engine and the editor (`lineShape`); `stream.ts`: reading one line at a time, in its place (`stepLine`), as the editor does too; `codec.ts`: the tree, built from those steps, with
  blocks as nodes holding their lines; `check.ts`: checking a tree from elsewhere;
  `schema.ts`: everything declared, listed (`introspect`) and as a JSON Schema
  (`jsonSchema`), published at `public/schema/mathscribe-1.schema.json`; `migrations.ts`: the
  schema's version, and bringing an older tree up to date
- `src/lib/language/`: MathScribe's language described once, from which what
  reads it and what documents it are made. `tree.ts`: the language tree, its
  topics (Basics, Units, …), each a list of entries (a feature: what's said
  about it, the rules for writing it, whole sheets showing it); `topics.ts`:
  the core's topics (a module's are its own `language.ts`, given by
  `EngineModule.languageTopics` and placed among them: `languageTopics()` in
  `engine/index.ts`). The Reference tab shows the tree, and the tests check
  every example in it (`tree.test.ts`: it works and is formatted;
  `golden.test.ts`: its output). `settings.ts`: a call's settings
  (a table's, a plot's), each declared as a kind of `Setting` (a switch, a
  choice, a range of rows, a title, …) in a `SettingsSpec`, which reads them,
  writes them back, lists them in its error and makes their ⚙ controls;
  `reference.ts`: the tree said in other forms: a call's settings as a topic
  (`settingsTopic`), and the AI primer's Markdown (`primerMarkdown`, which
  `content/aiPrompt.ts` puts in its prompt)
- `src/lib/reading/`: reading a sheet's tree (`src/lib/tree`) into blocks.
  `sheetReader.ts`: the `SheetReader`, which reads each node of the tree with
  the reader of its kind and holds what readers share (the Calculator, the open
  blocks, blank lines, section numbers); `reader.ts`: `NodeReader` (one per kind
  of node) and `TreeItem` (a node, where its lines are: a block's opener, body
  and `}`); `readers.ts`: the core's readers (a heading, `@latex { }`, a
  layout block, a calculation, …), with the sheet-wide ones (`@constants`,
  `@c:4` declarations) read before everything else. A module with kinds of node
  of its own (`ReadsLines`: chemistry's `@chem.species { }`) adds their readers;
  `lineSyntax.ts`: sheet-wide constant declarations, and imported data's rows, read once
- `src/lib/output/constructs/`: one class per kind of block (a heading, a calculation,
  an `@layout` block, …) that writes its blocks to each export; `layout.ts` has a
  class per layout, `columns.ts` how `@layout.column` splits into columns. The exports ask each block's construct to write it, and the
  Rendered tab has a view per kind in `src/components/blocks/`, file for file
  beside them (`lines.tsx`, `blocks.tsx`, `layout.tsx`; `BLOCK_VIEWS` in `index.tsx`;
  what they draw with in `shared.tsx`, what the Output pane gives them in `context.ts`)
- `src/lib/output/latex.ts`: the `.tex` export and its document options, joining up
  what the constructs write; `src/lib/output/latexKit.ts`: the pieces they write with;
  `src/components/ExportDialog.tsx`: the Export dialog (the format, the document
  options in `DocumentOptions.tsx`, used by both exports, and the download)
- `src/lib/output/docx.ts`: the `.docx` (Word) export's package; `src/lib/output/docxKit.ts`:
  its look, paragraphs, equations and cards, which the constructs write with;
  `src/lib/output/omml.ts`: LaTeX → Word equations (OMML), by way of KaTeX's MathML
- `src/lib/maths/sigfigs.ts`: counting, propagating and formatting significant figures
- `src/lib/maths/solve.ts`: `@solve(…)`: rearranging, linear, quadratic and numeric solving
- `src/lib/builtins.ts`: everything built in under `@` as one tree of members
  (constants, functions, blocks, namespaces), which the engine and the editor's
  suggestions and hovers read. An engine module adds its own namespace (`@chem`)
  when it's installed (`src/lib/engine/index.ts` installs MathScribe's as it
  loads); `src/lib/constants.ts`: the physics constants' values
- `src/lib/content/library.ts`: the equations in the Library tab (each tested with its
  example); `src/components/LibraryPane.tsx`: the tab
- `docs/REFERENCE.md`: the language tree as one document, made from it
  (`referenceMarkdown`, lib/language/reference.ts) and checked by a test;
  `npm run docs` writes it again after the tree changes
- `src/lib/content/sample.ts`: the example sheet shown the first time
- `*.test.ts` beside the code they test; `src/test/helpers.ts`: shared test
  helpers (evaluate a sheet, read a result as plain text)
- `src/lib/data/files.ts`, `src/useSheets.ts`: the open sheets (tabs), opening, saving,
  auto-saving and the browser's copy; `src/components/SheetTabs.tsx`: the tab bar
- `src/editor/language.ts`: the MathScribe language for CodeMirror (highlighting,
  indentation, folding), reading each line as the sheet's tree does (`stepLine`);
  `src/editor/sheetLines.ts`: the document's lines read in their places (what
  each is and is inside, where each block ends), for folding, indentation,
  imported data's rows and where suggestions stay quiet
- `src/editor/themes.ts`: syntax colour themes; `src/appTheme.ts`: app themes
  (both sets of colours are in `App.css`; `index.html` applies the saved app
  theme before the page draws)
- `src/editor/gotoDefinition.ts`: Ctrl+Click / F12 go to definition
- `src/editor/intellisense.ts`: suggestions as you type and hover information;
  `src/editor/typing.ts`: what's being typed, read from the tokens of the line so far;
  `src/editor/greek.ts`: typing Greek letters (`\Delta` then Tab or a space);
  `src/editor/vocabulary.ts`: the commands, keywords and built-in functions they describe
- `src/components/EditorPane.tsx`: the editor; `PreviewPane.tsx`: rendered output,
  LaTeX and Reference tabs; `ReferencePane.tsx`: the Reference tab;
  `OptionsMenu.tsx` / `Dropdown.tsx`: the options menus; `SplitPane.tsx`: resizable
  two-pane layout (drag, arrow keys, double-click to reset)
