# To do

Every to-do for MathScribe is here. When one is done, it stays: it's ticked,
its words are left as they were, and a short **Resolved** note under it says
how it was addressed (and when, and in which commit), so there's a paper trail.

In priority order within each group. The first two groups are what stands
between MathScribe and a general calculation tool like Mathcad; the rest make
what's here better.

## 1. Maths (the gap to Mathcad)

- [ ] **Systems solved numerically**: non-linear systems that substitution can't
      rearrange, from starting guesses (Newton's method), and a choice between a
      quadratic's solutions.
- [ ] **Numerical integrals and derivatives**: `integral(f(x), x, 0, 2)` and
      `derivative(f(x), x, 1.5)`, with units, sig figs and uncertainty carried
      through, typeset as ∫ and d/dx.
- [ ] **Symbolic calculus and algebra**: differentiate, integrate, expand and
      simplify an expression symbolically (`derivative(x^2 * sin(x), x)` →
      2x sin x + x² cos x), by way of a computer algebra library.
- [ ] **Ranges and sums**: `x = range(0, 10, 0.5)` as a series, `sum(f(n), n, 1, 10)`
      and products, so a series can be generated as well as typed or imported.
- [ ] **Matrices typeset**: matrices and vectors shown as matrices, with
      determinant, inverse, transpose and solving A·x = b shown as working.
- [ ] **Differential equations**: a numerical ODE solver (`odesolve`) whose result
      is a series to plot.
- [ ] **Optimisation and root finding over a range**: `minimise`, `maximise`, and
      every root of f(x) = 0 between two bounds.
- [ ] **Complex numbers** shown in rectangular and polar form, for AC circuits.

## 2. Engineering documents (the gap to Mathcad)

- [ ] **Lab and data tables**: quantities as rows and trials as columns, row labels,
      a spanning header with the unit, shaded empty cells, and numbered captions
      ("Table 1: …").
- [ ] **Conversion-factor working**: show a calculation as a chain of fractions
      (2.755 × 10⁻² L × 0.01000 mol EDTA / 1 L), the factor-label method chemistry
      courses ask for.
- [ ] **Title page and page breaks**: labelled fields (author, course, instructor,
      date) on a page of their own, and `#pagebreak`.
- [ ] **Text formatting**: bold, italic, underline and links in prose; unnumbered
      and "1)"-style headings; figure and table references.
- [ ] **Images**: a picture or diagram in the sheet, with a caption.
- [ ] **PDF**: compile the LaTeX to a PDF in the app (pdfTeX in WebAssembly, or an
      "Open in Overleaf" button), and a print layout for the Rendered tab.
- [ ] **Document options**: exact margins, line spacing, headers and footers with
      page numbers.
- [ ] **Unit systems**: show results in US customary units (ft, lbf, psi) by
      choice, and define your own units (`unit kip = 1000 lbf`).
- [ ] **Checks**: a line that states a requirement (`check sigma < sigma_allow`),
      shown as OK or NOT OK, with a summary of every check in the sheet.
- [ ] **Includes**: use another sheet's variables and functions
      (`include("beams.txt")`), for shared constants and methods.

## 3. Plots and data

- [ ] **Plot functions**, not just data: `@plot(t, x, f(t))`, or a curve over a range.
- [ ] **Non-linear fits**: quadratic, exponential and power-law fits, alongside the
      linear one, and a fit over part of the data.
- [ ] **More plots**: bar charts and histograms, two y axes, residuals under a fit.
- [ ] **Spreadsheet data**: paste from Excel or Google Sheets, and import `.xlsx`.
- [ ] **Text columns** in imported data (labels, categories), to group and filter by.

## 4. Chemistry

Next for chemistry, to work out later (set aside 2026-11-16 for quality of life
and document exports): these build on substances, `@chem.reaction` and `@inv`.
Limiting reagent and yield first, then balancing, then conversion-factor
working (group 2).

- [ ] **Balancing equations**: `balance({C3H8 + O2 -> CO2 + H2O})`, with the
      coefficients usable as mole ratios. `@chem.reaction` already checks a
      reaction balances; this would find its coefficients (1, 5, 3, 4).
- [ ] **Limiting reagent and yield**: which reactant runs out, theoretical and
      percent yield. With substances, something like
      `L = @chem.limiting(r, H2, O2)` (which runs out, and the most product),
      their amounts set as usual (`H2.m = 4.00 g`).
- [ ] **Equilibrium and pH helpers**: ICE tables, pH/pOH, K from concentrations.
- [x] **A species as a value with members**: define one, `H2SO4 = @chem.substance({H2SO4})`
      (the name decided: `@chem.substance`), then read data about it, `H2SO4.M`
      (molar mass), and chain into its elements, `H2SO4.H.n` (mol of H per mol
      of the substance: 2). Setting an amount, `H2SO4.n = 2 mol`, fills in what
      follows from it: `H2SO4.m` (its mass), `H2SO4.H.n`, `H2SO4.H.m` (each
      element's amount and mass in that much of it). Decided: any of its values
      can be set (n, m, an element's n or m, …) and the rest follow. Open:
      whether two can be set at once (only if they agree?). Decided: the
      working shows how a member was worked out, by default
      (`H2SO4.H.m = 2 × H2SO4.n × M_H = …`), back to what was set. Open: how it
      shows in the working (which member came from which); and how it sits with
      `{X}` species units and reactions' members (`r.H2O`), which this could
      grow from.
      Resolved (2026-11-16): `X = @chem.substance({formula})` (substance.ts, a
      line form) defines its members as variables under its name: `X.M` (the sum
      of its elements' molar masses, shown worked out on its line), `X.n` (1 mol,
      exact, until set: decided), `X.m`, and each element's `X.E.n`, `.m`, `.M`
      and `.w` (mass fraction, added). Setting an amount or mass, the
      substance's or an element's, works out its amount, then every member,
      through lines the module writes for the engine, so sig figs, uncertainty
      and species units are the core's. A later set replaces the amount from
      that line on, as a variable assigned again does (decided: the sheet is
      read top to bottom). A member on its own line shows how it's worked out
      (`m = n M = …`); in a calculation it's a value. A value already of a
      species (from a reaction's mole ratio) is used as it is, so reactions
      work with substances. `@chem.mm` was removed from what a sheet types
      (decided): the elements' molar masses stay as the module's own (a
      namespace marked internal: not offered, and explained if typed), which a
      substance's is worked out from. Generic additions: members of members
      (`a.b.c`, read and typed back), drawn as c with b, a below; a module's
      notation for a name's subscript in a member's path (chemistry: H₂SO₄,
      and an element alone, H); internal `@` members.

## 5. Editor

- [ ] **Quick fixes on warnings**, like VS Code's lightbulb: trailing zeros →
      `300.`, a unit read as a variable → insert `*`, an unknown constant → the
      suggested one.
- [ ] **Hover shows a variable's value at that line**, not at the end of its scope.
- [ ] **Inline results**: a faint value at the end of each line in the editor
      (`F = m * a   ⟶ 19.6 N`).
- [ ] **Parameter hints**: typing `E_k(1, ` shows `E_k(n, m [kg], L [m])` with the
      current parameter highlighted.
- [ ] **Rename (F2)** a variable or function everywhere it's used, respecting scope.
- [ ] **Go to definition for variables and constants** (`@rho_w` → its
      `@constants` entry).
- [ ] **Snippets**: `def`, `@layout.numbered { }` blocks, `@constants { }`.
      (`def` functions were removed on 2026-11-16: a function is one line now, so
      the snippet would be `f(x) = …`.)

## 6. Sharing and the app

- [ ] **Share by link**: the sheet compressed into the URL
      (`…/MathScribe/#sheet=…`), with no server and nothing uploaded.
- [ ] **Installable and offline**: a progressive web app.
- [ ] **Templates**: "New from template" (a lab write-up, a problem set, a design
      calculation).
- [ ] **Remember the output options** (sig figs, substitution, ≈) in the browser,
      or keep them in the sheet so it looks the same wherever it's opened.
- [ ] **Narrow screens**: a stacked layout, or an Input / Output switch.
- [ ] **Evaluate in a web worker**, if very long sheets still lag once typing pauses.

## 7. Sheets and output

- [ ] **Equations wider than the output pane**: they scroll sideways (with a
      scrollbar), which is easy to miss. Break a very long line onto rows, one
      `=` each, as `#multiline` does, when it doesn't fit. (Found in a browser
      pass, 2026-11-16, along with notes that cut equations off beside them,
      fixed then: a note goes below an equation that doesn't fit beside it.)
- [x] **No placeholder title on untitled blocks**: an untitled `{ }` block
      shouldn't show "Block" as its title; with no title, there's no title line.

      **Resolved (2026-11-15):** in the Rendered tab, a block with neither a
      title nor a note has no header at all (`GroupView`), and clicking the card
      goes to its `{` line instead. The LaTeX and Word exports already left an
      untitled block's title out.
- [x] **Blocks titled as sections**: a block's title written with `#` or `##`
      (`# Kinematics {` … `}`) makes it a numbered section or subsection, taking
      part in the numbering as headings do.

      **Resolved (2026-11-15):** a new reader, `SectionBlockReader`, offered a
      line before the heading reader, reads `# Title {` (any heading level) as a
      heading, numbered by the same counters as any, followed by an untitled
      block holding the lines up to its `}`; so every export and the Rendered tab
      draw it with what they already have. Commands and a note go after the `{`
      (`## Energy {  #val`). The editor folds and indents it as a block. Heading
      levels are named now (`HEADING_LEVEL`).

      **Revised (2026-11-15):** a heading above an untitled block wasn't what was
      wanted: the title should stay on the block. Now the block keeps its title,
      with `section` (its level and number, from the same counters as headings)
      on the `GroupBlock`: the Rendered tab sets it in the block's title bar,
      numbered and sized as a section or subsection; the LaTeX export steps the
      section counter (`\refstepcounter`) and titles the card `\thesection\quad
      Title`, so later headings number on from it; Word puts the number before
      the card's title. The editor colours its `#`s as a heading's and the rest as
      a block's title.
- [ ] **One Export button instead of the LaTeX tab**: a single Export button opens
      a dialog to choose the format (Word `.docx`, LaTeX `.tex`, more later), with
      each format's options in it (what the LaTeX tab's Document menu holds now).
- [ ] **An `@format` namespace** for how a value is *shown*, without changing the
      value or the maths. First: `@format.inv(x)`, a value shown flipped, as its
      reciprocal written out (a ratio a/b shown as b/a, 1/(2.0 s) as 0.50 s⁻¹),
      rather than ^-1 appended. Others that may belong there:
      - `@format.frac`: as a fraction (0.75 → 3/4; π/4 kept symbolic);
      - `@format.eng`: engineering notation (exponents in multiples of 3), beside sci and dec;
      - `@format.prefix(k)`: in a chosen SI prefix (kN, mm);
      - `@format.sci`, `@format.dec`, `@format.percent`, `@format.exact`: the `:`
        settings on a name, as functions on an expression, where a `:` can't go
        (in `{{…}}` text, a table column);
      - `@format.polar`: a 2D vector as magnitude and angle (5.0 N ∠ 53.1°), from
        the vectors module;
      - `@format.abs`, `@format.sign`: a magnitude, or a forced sign (+2.0);
      - `@format.ratio(a, b)`: a ratio as a : b.

      To settle first: whether `@format` holds functions on values
      (`@format.inv(x)`), settings that chain like `@layout`'s
      (`@format.sci.frac`), or both; and whether the `:` settings on names become
      the same words (`x:sci` ≡ `@format.sci`), so how a value is shown has one
      vocabulary.

      **Decided (2026-11-15):** the chained approach. `@format`'s members chain
      like `@layout`'s, in any order (`@format.inv.sci`), so the open questions
      left are where a chain is written (on an expression, `@format.inv.sci(x)`;
      on a block, `@format.sci { … }`; or both) and whether the `:` settings on
      names become the same words.

      **Decided (2026-11-16):** `@format.inv(x)` is 1/x (it acts as ^-1), but
      written by inverting the fraction (m/V as V/m), not with ^-1 appended. A
      chain is written on a value, `@format.sci.frac(x)` (in `{{…}}` text and
      table columns too); blocks already have `@layout.sci { }`. The `:`
      settings on names are the same words (`x:eng` ≡ `@format.eng(x)`). First
      members: inv, sci, dec, eng, frac, percent, exact; the vectors module adds
      polar as its own; not prefix(k) (`to kN` does it) or abs (mathjs's maths).

      **Set aside (2026-11-16):** after weighing it up (formatting in `{{…}}`
      text and table columns, eng and frac, against a fourth place to set
      notation beside `#sci`, `:sci` and `@layout.sci`, and frac's clash with
      sig figs), `@format` waits until there's a clearer need: investigate how
      people would use it first (which notations they reach for, and where a
      `:` can't go). Flipping a fraction, which changes the value rather than
      how it's shown, became its own function instead: `@inv(x)`.
- [x] **How expressions are typeset: brackets, multiplication signs and
      fractions.** A lot of the output looks ugly, the chemistry especially:
      brackets where none are needed (or missing where they are), a mix of
      implicit products, `·` and `×`, and fractions that stack badly (units and
      species inside nested fractions, molar masses as g H₂O / mol H₂O over a
      slash). Look at the rules as a whole: when a factor is bracketed, which
      product sign goes between which kinds of factor (numbers with units,
      names, display names, species), when a division is a stacked fraction or
      a slash (inline, in an exponent, a unit's own), and how a value with a
      species reads in each. Collect the worst examples from the chemistry
      sheets and the golden tests first, and decide on the rules before changing
      them. Nested conditions (`c1 ? a : (c2 ? b : c)`) are typeset as a brace
      inside a brace; they'd read better as one brace of three cases.
      Decided (2026-11-16, from a page of each choice drawn now and as its
      alternatives): (1) `×` before a factor that starts with a number, nothing
      before a name, brackets only where needed, in place of bracketed
      quantities side by side and `·` between numbers; (2) units keep the slash,
      `m/s²`; (3) a unit with a species above and below the line is stacked,
      g Na over mol Na; (4) nested brackets go `( [ ( [`, never braces; (5) a
      formula after a name's underscore (`n_H2O`) is drawn as chemistry; (6) a
      condition inside a condition is one brace with every case; (7) a
      function's result unit is said after its equation, "in °", not as an
      arrow after its name.
      Resolved: (1) `productSeparator` (core/products.ts) puts `×` before a
      factor that starts as a number (a number, a quantity, a negative, a value
      in brackets, and Euler's e after a number) and after a quantity, nothing
      between names; values are bracketed only where they'd read wrongly
      (raised to a power, in scientific notation, a negative after another
      factor); `delta`'s working follows the same rule. (3) `unitTex` stacks a
      unit with a species above and below the line. (4) `nestBrackets` goes
      round and square in turn. (5) A module hook, `nameSubscriptTex`, draws a
      name's subscript in its notation: chemistry's, for two or more characters
      of element symbols and counts (`F_N`, `v_AB` stay as they were). (6) The
      Calculator writes a condition's cases itself, following its last case down
      through nested conditions. (7) `resultUnitTex` after the equation. The
      option *Show · in every product* is unchanged.

## 8. The sheet's schema: a tree of nodes

One structure for what a sheet says, shared by the engine, the editor and every
module (as GraphQL's schema is by its services): a sheet as a tree of nodes,
every character in a token, so text → tree → text gives back the text exactly.
Plain data, so it goes through JSON (and an HTTP request) unchanged; its kinds
declared once, the core's and each module's; versioned, with migrations.
Built for caching: a line's node depends only on its text and context, so an
edit reads again only what it changed, and nodes are shared between trees.

- [x] **Foundations**: the tree's shapes (`Token`, `SyntaxNode`, `SheetTree`),
      a registry of kinds that modules declare into, encode and decode, and a test
      that every sheet (and any text) round-trips exactly, through JSON too.

      **Resolved (2026-11-15):** `src/lib/tree/`. `encode` splits the text into
      lines (each keeps its own ending: `\n`, `\r\n`, `\r`, or none) and reads
      each into a frozen node (indent, content, trailing spaces, ending as
      tokens); for now a line is `blank`, `comment`, or `line` (content not read
      into parts yet). `decode` joins the tokens back. Lines are cached by
      context and text (least recently used dropped past 20,000), so an unchanged
      line is the same node in the next tree, and a node's text is kept by the
      node (a WeakMap). Kinds are declared in `registry.ts` with what each is and
      whose (a clash between owners is an error); `check.ts` checks a tree from
      elsewhere (its shape, its kinds declared); `migrations.ts` has the schema's
      version (`mathscribe/1`) and the place for migrations. The test
      round-trips the sample, every Reference and Library example, every file in
      the repository and 500 random texts, each through JSON too. A 4,070-line
      sheet (4,000 rows of imported data): 3.6 ms to encode cold, 1.4 ms after an
      edit, 0.4 ms to decode; its JSON is about 5 times the text (it compresses
      well, and imported data will become one node).
- [x] **Line parsers**: reading splits in two, text → tree, then tree → blocks.
      Each line reader's matching becomes a parser that gives a node of its kind
      (assignment, heading, block opener and closer, …), with contexts for what a
      line is inside (prose, raw LaTeX, imported data, a function's body); the
      modules' readers give their own kinds (chemistry's species block and
      reaction line). Blocks become nodes that hold their lines. Imported data is
      one node, not a token per cell.

      **Progress (2026-11-15), the first half: text → tree.** A grammar
      (`tree/grammar.ts`) of contexts and kinds of line, declared as data by the
      core (`tree/core.ts`, in the reading layer's order) and by modules
      (`EngineModule.grammar()`: chemistry's species block, species line and
      reaction line). A line is read by its context's syntaxes into its kind,
      with its content as tokens (body, #commands and note; a heading's `#`s and
      title; prose and raw LaTeX whole); a line that opens a body becomes a node
      holding it, its body's lines (nested blocks as nodes) and its closing line.
      Bodies end at their `}`, a `}` on its own (raw LaTeX), or where the
      indentation does (a function's body, imported data, whose rows are one
      node). Still to do: the reading layer reads blocks from the tree rather than
      from the text.

      **Resolved (2026-11-15), the second half: tree → blocks.** The
      `SheetReader` encodes the sheet, turns its tree into items (each node with
      its line numbers: a block's opener, body and `}`), and reads each with the
      reader of its kind (`NodeReader.kinds`; two readers for one kind is an
      error). Block readers take their lines from their node instead of looking
      ahead through the text (`BracedReader` and moving the sheet's place along
      are gone); a `{ }` or `@layout` block reads its body, then its `}`
      (`SheetReader.closeAt`); the sheet-wide readers (`@constants`, species'
      names) find their blocks by walking the tree. Chemistry's readers read its
      own kinds. Output unchanged (every golden test), and as fast: a 3,800-row
      import sheet evaluates in about 50 ms, before and after.
- [x] **The editor reads the same tree**: highlighting, folding and indentation
      from the tokens, so the editor's own line rules (`language.ts`) go.

      **Resolved (2026-11-15):** reading one line at a time is the tree's own
      now (`tree/stream.ts`, `stepLine`: a line and the bodies open above it →
      what it is, its role, and the bodies after it), and `encode` builds the
      tree from those steps. The editor's highlighting carries the same small
      state from line to line, reads each line with `stepLine`, and colours its
      tree tokens (indentation, a heading's `#`s, #commands, note) by kind, with
      what a line says coloured by its kind (a calculation's numbers, units and
      names; a block's title; prose; raw LaTeX; imported data's rows). Folding,
      indentation, imported data's rows and where suggestions stay quiet come
      from `editor/sheetLines.ts`, the document's lines read in their places
      (once per version of the document). The editor's own line rules
      (`lineKind`, `opensText`, the brace counting) are gone; an `if` / `else`
      in a function's body still folds by indentation, as the tree doesn't hold
      a function's branches yet. (Since 2026-11-16 there are no branches: `def`
      was removed.)
- [x] **Introspection and validation**: a JSON Schema made from the registry,
      for checking a tree from a request; the schema listed for the editor and docs.

      **Resolved (2026-11-15):** `tree/schema.ts`. `introspect()` lists, as plain
      data, every kind of node and token (what each is, whose), every context,
      and every kind of line (where it can be, what it opens, in the order a line
      is offered them); what a kind of line opens is declared data now, not a
      function, so it can be listed. `jsonSchema()` is a JSON Schema (draft
      2020-12) of a tree, one definition per kind with its description and
      owner, exactly the fields a tree has. It's published with the app at
      `/schema/mathscribe-1.schema.json` (`public/schema/`), kept up to date by a
      test (a file snapshot: `npx vitest run -u` writes it). The tree's own check
      (`check.ts`) agrees with it: it now also rejects fields a tree doesn't have,
      and a schema newer than this MathScribe reads; a test checks both accept
      every example's tree and reject the same broken ones.
- [ ] **Expressions as tokens**: names, numbers, units, `{species}`, `<…>`, so
      the modules' text-rewriting hooks (`expandSyntax`, `readAfterUnit`) become
      kinds of token they declare.
      Progress (5a, the tree reads them): `lexer.ts` reads an expression into
      tokens and nodes by rules, each declared with what it reads and whose. The
      core's follow mathjs's own grammar (its delimiters and named delimiters,
      its number and name characters, from `math.parse`), so the tokens are the
      ones mathjs reads; numbers, units (after a number, after `to`, after `:` on
      the left of the `=`), names, `@` functions and constants (with their
      precision), keywords, strings, and anything else as `unknown` (nothing is
      lost). Nodes only where something holds parts: a quantity (a value and its
      unit), a call, and a value in text (`{{…}}` in prose and headings, not in
      `$…$` maths); operators stay flat. Modules declare rules of their own
      (`ModuleGrammar.lexRules`), tried before the core's: a vector `<…>`
      (vectors), a `{species}` (chemistry), and a series call's settings after
      `;` as one token (series). The editor colours lines from these tokens, so
      its own expression tokenizer is gone. Calculation, constant, function and
      `def` lines are read this way; the lexer's rules are listed in
      `introspect()`. Next: 5b, the engine reading the tokens, so the modules'
      text-rewriting hooks go.
      Progress (5b, the engine reads them): the engine writes an expression for
      mathjs from its tokens (`core/writer.ts`), not by searching its text. Each
      kind of part has a writer: the core's write a quantity as its value times
      its unit, a unit after `to` as a unit, a number as typed (`lit("2.0")`);
      a module's (`EngineModule.writers`) write its own kinds and are tried
      first: vectors write `<…>`, chemistry a species, and a quantity of one.
      What follows a unit as part of it is a lexer rule a module declares
      (`ModuleGrammar.unitRules`: `2.0 mol {EDTA}` reads as one quantity). The
      text-rewriting hooks are gone (`expandSyntax`, `readAfterUnit`,
      `rewriteExpression`), with the text rewriters behind them. Checked by
      running the old and new side by side over every test and edge case: they
      agreed everywhere but one, a label in quotes, `"2 kg"`, which the old
      wrongly rewrote. The sample sheet works out in the same time.
      Left in text (for 5c): a species' name, `{dietzeite}`, read as its formula
      before the line is read (it's the sheet's, so it can't be the lexer's);
      collecting a line's numbers as typed for the working (`NUMBER_LITERAL`);
      `(2.0 pm 0.1) kg` (which now copies the unit as the lexer reads it); and
      the Calculator's own line patterns (assignments, unpacking, functions).
      Progress (5c, first part): a line's numbers as typed come from its number
      tokens (`typedNumbers`, writer.ts), not a search of its text, which also
      picked up digits in units (`m/s^2`), formulas (`{Ca^2+}`) and labels, and
      could take `2` as typed `2` where the line says `2.00`.
      Progress (5c, line shapes): what a line assigns to, before its `=`, is a
      node in the tree (`tree/shapes.ts`): `assigned` (a name with its
      settings, `v:3:km/h`), `functionHead` (`f(x, y):3`) or `unpack`
      (`@tuple(r:3, theta)`). The engine reads a line's shape from the same
      function on its text (`lineShape`), so the reader and the Calculator
      didn't need to change how lines are passed. The Calculator, a function's
      body lines, `@constants`, the solve module's systems, the editor's symbols
      and go-to-definition, and the editor's colouring of a one-line function's
      name read it, in place of ten patterns (`ASSIGNMENT`, `FUNCTION_HEAD`,
      `UNPACK`, `DECLARED`, …, now gone). Checked side by side with the old
      patterns over every test and edge case: they differed only on malformed
      lines (`x::: = 3`, `x:"open = 3`), which the shape now leaves alone as the
      patterns did. Expressions read are kept by their text (the lexer's cache),
      so reading a line more than once costs nothing more.
      Left: `if` / `else` / `return` lines in a function's body, and `def` lines,
      are still read by patterns (and the editor folds branches by indentation);
      intellisense reads half-typed settings by pattern (a line being typed
      has no `=` yet).
      Progress (5c, `def` removed, 2026-11-16): rather than read `def` and its
      branches into the tree, `def` functions were taken out entirely (decided
      with Emily): a function is one line, `f(x) = …`, with `cond ? a : b` (nested
      for more cases) for branches. Gone with it: the `def` line and its body in
      the tree (`defLine`, `functionLine`, `function`, the `functionBody`
      context, bodies that end by indentation or a blank line), its reader and
      block (the function card in the preview and both exports), body
      statements, branches and procedures without a `return` in the engine,
      the `def` / `return` / `if` / `else` keywords and their patterns, and the
      editor's folding and indenting of bodies and branches. The examples (the
      sample sheet, the reference, the AI prompt) write their functions on one
      line. What's lost: a function's named steps shown in its working, settings
      on a value inside it, and procedures without a value. The only body whose
      extent comes from indentation now is imported data's rows.

## Done

- [x] **`@inv(x)`** (2026-11-16, from the `@format` discussion): 1/x, written as
      the fraction turned over, `@inv(m / V)` as V/m, and a value whose unit is a
      fraction turned over whole, a molar mass as 1 mol H₂O / 18.015 g H₂O (a
      conversion factor flipped, as in factor-label working); anything else as
      1/x. A hidden mathjs function, so units, species, sig figs and uncertainty
      are a division's; zero and a tuple are explained.
- [x] **The `@` namespace**: `@layout` blocks (`@layout.text Title { … }`, and
      `list`, `numbered`, `center`, `titlepage`, and display settings such as `.hidden` and `.val.multiline` that combine); `@chem.mm.Na` molar masses,
      `@chem.mm({formula})` with the sum as working, `@chem.total(…)` to add
      amounts of different species, and `@latex { … }` for raw LaTeX (over
      several lines too).
- [x] **Display names**: subscripts (`m_ball`, and `m_{H2O}` drawn as chemistry),
      and templates, `massName(x) = "m_{{x}}"` used as `m_w:massName(H2O)`.
- [x] **Systems of equations**: `@tuple(x, y) = @solve(eq, eq)`, solved by substitution
      with the working shown.
- [x] **Conditions**: `condition ? a : b` in a line, and `if` / `else if` / `else`
      in a function's body, with the comparisons shown in the working.
      (2026-11-16: `def` functions, and with them `if` / `else if` / `else`, were
      removed; `cond ? a : b`, nested for more cases, is how a function branches.)
- [x] **Chemistry notation**: formulas in braces (`{Ca^2+}`), reactions, molarity
      (`M`), species as units that cancel in mole ratios, and display names.
- [x] **Values in text** (`{{name}}`) and `//` comments.
- [x] **Create with AI**: a prompt for any AI to write a sheet, and its answer opened.
- [x] **Tables**: `@table(…)`, with computed columns that become series, and settings.
- [x] **Plots**: `@plot(…)`, with error bars, a linear fit (weighted by the error bars
      when there are some), settings, and both exports.
- [x] **Importing from CSV**, with units from the headers and uncertainty columns.
- [x] **Selections and names with a dot**: `@select(…)`, named imports and named plots.
- [x] **Speed on long sheets**: a slow sheet is worked out once typing pauses, and
      the engine keeps each variable as one record, with a series index and
      selections as lookups (a 3800-row import: from ~105 ms to ~34 ms an evaluation).
- [x] **Vectors**: `<…>` notation, unit vectors with `:ijk`, and components as
      variables with `:xyz`.
- [x] **Equation library**: first-year physics and general chemistry, inserted at
      the cursor as one-line functions.
- [x] **Word export**: a `.docx` with editable equations, which also opens in
      Google Docs.
- [x] **Hosting**: published to GitHub Pages on every push.
- [x] **Custom colour theme**: per-category colour pickers in the editor options,
      starting from a preset, with separate light and dark colours.
- [x] **IntelliSense**: suggestions as you type and hover information.
- [x] **Automated tests** (Vitest): unit tests, golden tests of whole sheets,
      editor tests, and a robustness test of malformed input, run on every push
      before the site is published.
