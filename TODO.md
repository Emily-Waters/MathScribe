# To do

Open items for MathScribe, tagged by priority (`[high]`, `[medium]`, `[low]`).
Completed items with their resolution notes live in `CHANGELOG.md`.

## 1. Maths (the gap to Mathcad)

- [ ] `[high]` **Investigate how to do calculus** (numerical and symbolic
      items below), before building either. Found (2026-11-22): mathjs's own
      `derivative` already slips through, half working:
      `derivative("x^2 * sin(x)", "x")` gives the right answer but shows it as
      plain text (`2 * x * sin(x) + …`), a sheet's function can't be
      differentiated (`derivative(f(x), x)`: "Undefined symbol x"), and
      nothing carries units, sig figs or uncertainty. To look into: a calculus
      module of its own, written with `@` (`@derivative`, `@integral`), and
      whether it should block mathjs's bare `derivative`; numerical methods
      (central differences, adaptive Simpson or Gauss–Kronrod) and how units
      go through them (d/dx divides by x's unit, ∫ multiplies by it); the
      uncertainty of a value worked out numerically; typesetting as d/dx and ∫
      in the Rendered tab, LaTeX and Word; whether mathjs's symbolic
      `derivative` and `simplify` are good enough for first-year sheets, or
      which computer algebra library would be (size, licence, running in the
      browser); and the language tree's entries and examples for each.
      Progress (2026-11-23): a sheet's formulas have a home now, `@formula {
      }` (every name a symbol, typeset, never worked out: see "Where a
      calculation ends and a formula begins" in `CHANGELOG.md`). Symbolic
      operations could act on a formula there rather than on a string.
- [ ] `[high]` **Numerical integrals and derivatives**: `integral(f(x), x, 0, 2)`
      and `derivative(f(x), x, 1.5)`, with units, sig figs and uncertainty
      carried through, typeset as ∫ and d/dx.
- [ ] `[medium]` **Symbolic calculus and algebra**: differentiate, integrate,
      expand and simplify an expression symbolically (`derivative(x^2 * sin(x), x)`
      → 2x sin x + x² cos x), by way of a computer algebra library. A formula
      in `@formula { }` is the natural thing to act on (its names are already
      symbols: `Calculator.formulaTex`, `formulaSides`).
- [ ] `[medium]` **Systems solved numerically**: non-linear systems that
      substitution can't rearrange, from starting guesses (Newton's method), and
      a choice between a quadratic's solutions.
- [ ] `[medium]` **Ranges and sums**: `x = range(0, 10, 0.5)` as a series,
      `sum(f(n), n, 1, 10)` and products, so a series can be generated as well
      as typed or imported.
      Progress (2026-11-17): `@series(…)` (group 3) makes a series on one
      line; a range would be a third form of it. Decided with Emily for then:
      words with settings after `;`, `t = @series(0 s to 2.0 s; step 0.1 s)`
      (or `count 21`), and each value's sig figs from the decimal places of the
      inputs (exact when they're whole numbers without units).
      Progress (2026-11-22): ranges are done, as `[start:stop:step]` (Emily's
      choice over words): see "A series in square brackets" in `CHANGELOG.md`.
      Sums and products of a function over a range (`sum(f(n), n, 1, 10)`)
      are still to do.
- [ ] `[medium]` **Differential equations**: a numerical ODE solver (`odesolve`)
      whose result is a series to plot.
- [ ] `[medium]` **Optimisation and root finding over a range**: `minimise`,
      `maximise`, and every root of f(x) = 0 between two bounds.
- [ ] `[low]` **Matrices typeset**: matrices and vectors shown as matrices, with
      determinant, inverse, transpose and solving A·x = b shown as working.
      Note (2026-11-22): square brackets are a series' now, so mathjs's
      `[1, 2; 3, 4]` is an error (Emily: losing matrices is fine for now);
      matrices would come back written some other way, `@matrix(…)`.
- [ ] `[low]` **Complex numbers** shown in rectangular and polar form, for AC
      circuits.

## 2. Engineering documents (the gap to Mathcad)

- [ ] `[medium]` **Conversion-factor working**: show a calculation as a chain of
      fractions (2.755 × 10⁻² L × 0.01000 mol EDTA / 1 L), the factor-label
      method chemistry courses ask for.
- [ ] `[medium]` **Title page and page breaks**: labelled fields (author, course,
      instructor, date) on a page of their own, and `#pagebreak`.
      Progress (noted in the sweep of 2026-11-22): `@layout.titlepage` makes a
      title page of its own (the title, then each line centred, then a new
      page) in the Rendered tab and both exports. Still to do: labelled fields,
      and a page break anywhere (`#pagebreak`).
- [ ] `[medium]` **Checks**: a line that states a requirement
      (`check sigma < sigma_allow`), shown as OK or NOT OK, with a summary of
      every check in the sheet.
- [ ] `[low]` **Text formatting**: underline in prose (bold, italic and links
      are done: `**…**`, `*…*`, `[text](url)`, and an @layout.text block is
      Markdown, with unnumbered headings of its own); "1)"-style headings;
      figure and table references.
- [ ] `[low]` **Images**: a picture or diagram in the sheet, with a caption.
- [ ] `[low]` **PDF**: compile the LaTeX to a PDF in the app (pdfTeX in
      WebAssembly, or an "Open in Overleaf" button), and a print layout for the
      Rendered tab.
- [ ] `[low]` **Document options**: exact margins, line spacing, headers and
      footers with page numbers.
- [ ] `[low]` **Unit systems**: show results in US customary units (ft, lbf,
      psi) by choice, and define your own units (`unit kip = 1000 lbf`).
- [ ] `[low]` **Includes**: use another sheet's variables and functions
      (`include("beams.txt")`), for shared constants and methods.

## 3. Plots and data

- [ ] `[medium]` **Spreadsheet data**: paste from Excel or Google Sheets, and
      import `.xlsx`.
- [ ] `[medium]` **Text columns** in imported data (labels, categories), to
      group and filter by.

## 4. Chemistry

- [ ] `[medium]` **Limiting reagent and yield**: which reactant runs out,
      theoretical and percent yield. With substances, something like
      `L = @chem.limiting(r, H2, O2)` (which runs out, and the most product),
      their amounts set as usual (`H2.m = 4.00 g`).
- [ ] `[medium]` **Balancing equations**: `balance({C3H8 + O2 -> CO2 + H2O})`,
      with the coefficients usable as mole ratios. `@chem.reaction` already
      checks a reaction balances; this would find its coefficients (1, 5, 3, 4).
- [ ] `[medium]` **Equilibrium and pH helpers**: ICE tables, pH/pOH, K from
      concentrations.

## 5. Editor and plots

- [ ] `[high]` **Quick fixes on warnings**, like VS Code's lightbulb: trailing
      zeros → `300.`, a unit read as a variable → insert `*`, an unknown
      constant → the suggested one.
- [ ] `[high]` **Max and min slope lines**: the steepest and shallowest lines
      through the error bars, and the gradient's uncertainty from them, as often
      taught in school and first-year labs; drawn dashed or dotted, with their
      slopes as variables (`p.slope_max`, `p.slope_min`).
- [ ] `[medium]` **A fit through the origin**, `fit proportional` (y = kx), for
      Hooke's law, Ohm's law and the like, where the intercept should be 0.
- [ ] `[medium]` **Other fits**: quadratic, exponential, power law (with their
      parameters as variables, as a linear fit's are).
- [ ] `[medium]` **`delta A` in a call inside another function's body** (`f(X) =
      agreement(X, k2)`) gets no uncertainty for `X` yet (the body is worked out
      once, given values only); pass the outer call's argument uncertainties on.
- [ ] `[low]` **Marker shapes per series** (circle, square, triangle, …), so a
      plot reads in black-and-white printing.
- [ ] `[low]` **The fit's equation in the legend**, as well as (or instead of)
      under the plot.
- [ ] `[low]` **A fit only across the data**, not the whole x axis (`fit across
      data`), for when extending it says more than the data does.
- [ ] `[low]` **Grid off, or a minor grid.**
- [ ] `[low]` **A plot's size** (width, aspect) in the exports.
- [ ] `[low]` **A residuals plot** under a fitted one: each point's distance from
      the line.
- [ ] `[low]` **Copying a plot as an image** (PNG or SVG) from the Rendered tab.
- [ ] `[low]` **Bar charts, histograms and two y axes**.
- [ ] `[low]` **Relative working for mixed formulas, step by step**: `(A + B)/C`
      as the sum's uncertainty first (δS = √(δA² + δB²)), then the quotient's
      relatively. Only if sheets need it; for now such formulas use
      derivatives.
- [ ] `[low]` **Snippets**: `def`, `@layout.list(1) { }` blocks, `@constants {
      }`. (Noted 2026-11-23: every `@` block, `@constants`, `@latex`,
      `@formula`, `@chem.species`, already completes as `@name {` … `}`, from
      its BlockMember; `@layout`'s don't.) (`def` functions were removed on 2026-11-16: a function is one line
      now, so the snippet would be `f(x) = …`.)

## 6. Sheets, output, and sharing

- [ ] `[high]` **Rethink the Create prompt: too long to paste, and the AI's
      sheets lean on LaTeX** (2026-11-22, Emily). Two problems found with
      Gemini: the prompt (about 52,000 characters, nearly all the primer) didn't
      paste in whole, and the sheet it wrote used inline `$…$` and `@latex` for
      what should have been calculation lines. A first attempt didn't work well
      enough and was scrapped, to think about the approach first. What it tried,
      for the record:
      - Rules marked as details in the language tree (`detail(…)`: how
        MathScribe shows or works something out, not what to write), said in
        the Reference but left out of the primer: 62 rules, 52,000 → 45,000
        characters.
      - The rules as a file to attach (`mathscribe-rules.md`, a Download
        button) with a short prompt of the request alone.
      - "The most important rule" at the primer's head and the prompt's end
        (every calculation a calculation line, never LaTeX), and rules on
        what `$…$` and `@latex` are for.
      - `@layout.sym` for formulas: a line in it whose names have no values yet shown
        rather than an error, so a formula sheet is `@layout.sym { … }` of
        calculation lines; the formula-sheet option and the example sheet
        using it.
      Progress (2026-11-23): formulas have a form of their own, `@formula {
      }` (not `@layout.sym`, which is only how lines are shown), and the
      formula-sheet option asks for it; `@latex`'s entry says it's for what
      MathScribe can't write. The prompt's length is still to rethink.
      To think about: a much smaller primer (the syntax a sheet needs, not
      everything the Reference says; examples over prose), whether the rules
      should be by task (a test needs different things than a lab write-up),
      a check of the answer on opening it (lines that are LaTeX but look like
      calculations), and trying the prompt on several AIs before settling.
- [ ] `[medium]` **Equations wider than the output pane**: they scroll sideways
      (with a scrollbar), which is easy to miss. Break a very long line onto
      rows, one `=` each, as `@layout.multiline` does, when it doesn't fit. (Found in
      a browser pass, 2026-11-16, along with notes that cut equations off beside
      them, fixed then: a note goes below an equation that doesn't fit beside
      it.)
      Progress (2026-11-16): the LaTeX export does this. An equation that might
      not fit (by about how much it draws) goes into `\msfit{one line}{rows}`,
      which LaTeX measures against the line, so the page, margins, font size and
      card it's in decide (latexKit.ts: `fitted`). The output pane could split an
      equation into rows the same way (`stepsOf`), measuring it in the page.
- [ ] `[medium]` **Installable and offline**: a progressive web app.
- [ ] `[low]` **An `@format` namespace** for how a value is *shown*, without
      changing the value or the maths. First: `@format.inv(x)`, a value shown
      flipped, as its reciprocal written out (a ratio a/b shown as b/a,
      1/(2.0 s) as 0.50 s⁻¹), rather than ^-1 appended. Others that may belong
      there:
      - `@format.frac`: as a fraction (0.75 → 3/4; π/4 kept symbolic);
      - `@format.eng`: engineering notation (exponents in multiples of 3),
        beside sci and dec;
      - `@format.prefix(k)`: in a chosen SI prefix (kN, mm);
      - `@format.sci`, `@format.dec`, `@format.percent`, `@format.exact`: the
        `:` settings on a name, as functions on an expression, where a `:`
        can't go (in `{{…}}` text, a table column);
      - `@format.polar`: a 2D vector as magnitude and angle (5.0 N ∠ 53.1°),
        from the vectors module;
      - `@format.abs`, `@format.sign`: a magnitude, or a forced sign (+2.0);
      - `@format.ratio(a, b)`: a ratio as a : b.

      To settle first: whether `@format` holds functions on values
      (`@format.inv(x)`), settings that chain like `@layout`'s
      (`@format.sci.frac`), or both; and whether the `:` settings on names
      become the same words (`x:sci` ≡ `@format.sci`), so how a value is shown
      has one vocabulary.
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
      members: inv, sci, dec, eng, frac, percent, exact; the vectors module
      adds polar as its own; not prefix(k) (`to kN` does it) or abs (mathjs's
      maths).
      **Set aside (2026-11-16):** after weighing it up (formatting in `{{…}}`
      text and table columns, eng and frac, against a fourth place to set
      notation beside `:sci` and `@layout.sci`, and frac's clash with
      sig figs), `@format` waits until there's a clearer need: investigate how
      people would use it first (which notations they reach for, and where a
      `:` can't go). Flipping a fraction, which changes the value rather than
      how it's shown, became its own function instead: `@inv(x)`.

## 7. Language ergonomics (for people and AI)

Each item is a design decision to settle before changing syntax, the Reference,
tests, or the Create prompt:

- [ ] `[medium]` **How a value is shown, apart from its name.** `to` converts
      units in an expression (`v to km/h`, `to percent`), a function's
      parameters on entry (`m to kg`) and a constant's display (`@a_0:3 to
      angstrom`); and colons on a name chain sig figs, notation (`:sci`,
      `:dec`), units (`:deg`), vector display (`:ijk`), components (`:xyz`) and
      labels, with rules for which order and which combine. Look at keeping
      `name = expr` plain, with how it's shown said after the expression or as
      settings (e.g., `as deg`, `3 sig`).
- [ ] `[medium]` **Brackets that don't change meaning with what's around them.**
      `[…]` is a series or a range; `(…)` groups or calls (pairs need `@tuple`);
      `<…>` is a vector only where a value can start and there's a comma
      inside; `{…}` is a block or a chemical formula. Look at an explicit form
      for each kind of value where the brackets alone are ambiguous (e.g.,
      `@vec(3, 4)` beside `<3, 4>`), so nothing turns on spacing or what comes
      before.
- [ ] `[medium]` **Clear errors for names that are taken.** `e`, `pi`, `tau`
      and `phi` are maths' constants; `A` is amperes (not ångströms); `m` is a
      variable or metres by where it is; `delta E` and `ΔE` aren't the same.
      Look at saying so plainly when a sheet shadows or trips over one, rather
      than quietly reading it one way.
      Found (2026-11-23): after `E = 1/2 * m * v^2` fails (v has no value),
      `v = sqrt(2 * E / m)` quietly gives 2.33 m^-0.5, `E` being mathjs's e
      and `m` metres; and `F = m * a` with neither defined complains only of
      `a`. A line that works out from a name that failed to be defined, or from
      a maths constant spelt as a variable would be, is worth an error.
- [ ] `[low]` **An import's uncertainty columns, named one way.** `csv.ts`
      reads `dx`, `δx`, `σx`, `delta_x`, `sigma_x`, `x_unc` and `x_err` as x's
      uncertainties. A CSV's headers often come from elsewhere (a logger, a
      spreadsheet), so decide whether to keep one name or treat the headers
      as outside data and read them all.
- [ ] `[low]` **`2.0 +- 0.1` is quietly `2.0 + (-0.1)`.** With `pm` the only
      way to write an uncertainty, `+-` is now read as mathjs reads it. It
      goes with "Clear errors for names that are taken" above.

## 8. Architecture and polish

- [ ] `[high]` **Core, modules and the maths library, in three steps**
      (2026-11-23, Emily). Decided: series are core (a kind of value, as
      tuples are; their notation and `@table`/`@plot` the series module's);
      the maths library goes behind one adapter with MathScribe's own types
      ("layers 1 and 2": not our own syntax tree yet); the module API exposes
      only that interface, never mathjs's types. In this order, so code moves
      once; each step behaviour-neutral, the golden tests proving it, checked
      in with Emily between steps:
      1. **The core stops naming modules' concepts** (CLAUDE.md: "The core
         asks; modules answer"), one at a time:
         - ~~plots~~ (done 2026-11-23): a plot is a module's *figure* now, a
           drawing above its line's equations (`CalcResult.figure`,
           `EngineModule.figureKinds`, `ModuleFigureKind`: view, LaTeX,
           preamble, picture). The line stays a calculation, so its fits'
           equations, a named plot's `defines` and the editor's hovers are
           unchanged. output/plot.ts, latexKit's `plotToLatex` and the plot
           view moved into the series module (plotGraph.ts, plotLatex.ts,
           plotView.tsx, plotFigure.ts); plotImage.ts became the generic
           figures.ts; Word's pictures are named Figure n (media/figureN.png).
           Golden tests and the visual check's pages unchanged.
         - ~~fits~~ (done 2026-11-23): `FIT`, the missing-fit message and
           R²/χ²'s typesetting are the series module's (syntax.ts,
           fitNames.ts), through two new hooks, `EngineModule.explainMessage`
           and `memberTex`. (fitNames.ts still matches mathjs's "Undefined
           symbol" text: step 2's typed errors replace that.)
         - ~~solved names~~ (done 2026-11-23): no hook needed. The core's
           hidden name is generic now, a value a module holds for itself and
           shows as the name it stands for (`heldName`, held__x; `solved` no
           longer a reserved namespace, `held` is). @solve uses it.
         - ~~the "square brackets make a series" error~~ (done 2026-11-23): a
           series module step at the `check` stage (brackets.ts). It now runs
           after the core's two checks at that stage, so a line that's wrong
           both ways (`w = t * [1, 2]`) gets the series-as-value message.
           (`seriesHint`, statistics and lookups stay core: series are.)
         - ~~caption kinds~~ (done 2026-11-23): `CAPTION_KIND.table` was the
           core's; `CaptionKind` is a string now, `Table` the series module's
           (`TABLE_CAPTION`).
         Left, for step 2: `src/lib/maths/solve.ts` (the `Solver`, polynomials,
         isolating an unknown) is maths the solve module uses, built on mathjs's
         `simplify`/`derivative`; it moves with the adapter.
      2. Decided 2026-11-23 (Emily, all four): the folder is
         `src/lib/maths/library/`, `index.ts` the interface and `mathjs.ts` the
         adapter; an expression keeps mathjs's node shape as MathScribe's
         contract (our type names, built and checked only through the
         interface); quantities only through functions (`magnitude(q, 'm')`,
         not `q.toNumber('m')`); sub-steps (1) the folder, instance, names,
         types and guards, with the boundary rule and a shrinking list of
         files still using mathjs, ~~done 2026-11-23~~; (2) typed errors,
         ~~done 2026-11-23~~ (`mathsError(problem)`: a `MathsError` by kind,
         undefinedName, undefinedFunction, unitsDiffer, cannotConvert or other;
         the adapter alone knows mathjs's wording, and library.test.ts runs
         mathjs so a reworded message fails there. It reads a thrown error or a
         message, since most errors are text by the time they're explained;
         once evaluating goes through the interface, in (4), the adapter can
         throw them typed);
         (3) values, ~~done 2026-11-23~~ (quantities, tuples, arithmetic,
         formatting, and adding units and functions to the library, all as
         the interface's functions: no `Unit`, `Matrix` or `math.*` value call
         left outside the adapter in src/lib; math.ts's additions use
         `defineFunctions`/`defineUnit`/`libraryFunction`. Nine files off the
         list: aggregates, declarations, math, normalise, numbers,
         sheetConstants, sigFigs, tex, sheet/values);
         (4) expressions and the writer's `source.*`, ~~done 2026-11-23~~
         (`parse`, `compile`/`evaluateCompiled`/`evaluate`/`evaluateText`,
         `findAll`, `transform`, `copyExpr`, `exprText`, `exprTex` with a
         `TexOptions` handler, builders `symbol`/`call`/`operator`/`constant`/
         `paren`/`assign`, `Scope`/`ScopeMap`, and `source.quantity`/`unit`/
         `literal` for the writer; `derivative` and `simplify` too, which
         propagation needed. No core file imports mathjs now; only
         maths/solve.ts and the modules are on the list. Still to do there:
         the adapter throwing typed errors itself as it evaluates, rather
         than `mathsError` reading messages; about 70 comments in the core
         that name mathjs; and the tree's lexer, which mirrors mathjs's own
         reading of characters (its delimiters, `isAlpha`), so is the
         library's knowledge outside the adapter); (5) algebra, ~~done
         2026-11-23~~ (the Solver builds and simplifies through the
         interface, `mapParts` added; it takes no instance now);
         (6) the module API and the modules, ~~done 2026-11-23~~ (plugin.ts
         exports the interface, `export *`, and no longer `math`; the hooks
         take `Expr`/`CallExpr`; chemistry, series, solve and vectors moved
         over. Emily asked that the core give modules a way to declare and
         add their own units when needed: `EngineModule.units()` (added when
         the module's installed, before its functions), `functions()` (its
         functions by name, `adding` and `replacing`), and `declareUnit` for a
         unit made as a sheet needs it, with no definition for a unit of its
         own kind (chemistry's species, each declared the first time it's
         named). plugin.test.ts's example module shows all three. Only the
         adapter imports mathjs; the boundary test's list of exceptions is
         gone. The engine's own molarity is added in math.ts as it loads,
         with `defineUnit`: through `declareUnit` it would run before
         module.ts had loaded).
         **Maths library behind one interface**: a folder (e.g.
         `src/lib/maths/mathjs/`) the only one importing `mathjs`, enforced in
         `boundaries.test.ts`. It offers named operations (parse, evaluate,
         units, node guards and builders, TeX, derivative, simplify) under
         MathScribe's own type names (`Expr`, `Value`, `Quantity`, …), and turns
         mathjs's errors into typed ones (`UndefinedSymbol { name }`) so nothing
         matches message text (results.ts, series' plot.ts and where.ts do
         now). Found 2026-11-23: 30 files import mathjs (18 core, 10 in
         modules), about 200 `math.*` calls; `plugin.ts` exports `math` and the
         EngineModule hooks take `MathNode`/`FunctionNode`. The plugin API
         changes to the interface's types, and the chemistry, series, solve and
         vectors modules with it. Also mathjs-shaped, to move behind it: the
         source text the writer produces (`unit("…")`, `lit("…")`) and hidden
         names (`chem__mm__Na`, because mathjs names have no dots).
      3. **Split `src/lib/engine/core/calculator.ts`** (~79 KB, ~1,500 lines,
         one class) along the seams left, each a typed collaborator with a
         narrow interface (as `Aggregates` and `SheetConstants` are), not loose
         functions: formatting and TeX (formatNumber, the uncertainty and
         value TeX, toTex, formulaTex), first; constants (declareConstant*,
         defineConstant); scopes and variable summaries. The line pipeline and
         evaluateParsed stay, as the core of it. Why: a concern can then be
         read whole (an edit needs only the part read, but understanding one
         now means piecing it together).
         ~~Done 2026-11-24~~, as far as is worth it: values shown (sig figs,
         notation, uncertainty, tuples, as LaTeX) are `ValueTex`'s
         (valueTex.ts); expressions as the working shows them, a call's
         parameters as its arguments, and values substituted are
         `WorkingTex`'s (workingTex.ts); each takes a small host of what it
         needs of the Calculator. calculator.ts is 63 KB now (from 79). Left
         where they are, on purpose: the constants (already `SheetConstants`'s;
         what stays is three one-line pass-throughs and `defineConstant`,
         which works the line out through the Calculator itself) and the
         variable summaries (`summary`, `assignedBy`, `describe`, ~50 lines
         tied to scopes and views): moving either would add a host for little.
      **Still open** of this item: the adapter throwing typed errors as it
      evaluates (not `mathsError` reading message text); the ~70 comments in
      the core that name mathjs; and the tree's lexer, which mirrors mathjs's
      own reading of characters (its delimiters, `isAlpha`).
- [ ] `[medium]` **One harmonious structure** (2026-11-17, from the
      codebase-wide audit). Remaining items:
      - Step 5 sub-items: hovers (`BUILTIN_BEFORE`, `UNIT_PLACE`, a namespace
        before a dot, `IN_BRACES`), which could read the token under the pointer
        from the whole line; and braced names, `{dietz` (`BRACED_SO_FAR`),
        which are chemistry's syntax, in prose too, so belong to a hook of the
        module's for its own suggestions.
      - Step 6: constants as `words()`, patterns with `src`/`named`, file by
        file as each is touched.
- [ ] `[medium]` **MathScribe as a language** (looked over 2026-11-20):
      Remaining items: (3) call signatures with one options syntax, from which
      the ⚙, parameter hints, argument errors and the Reference come; (4) names
      and scopes in one pass, with places, when the editor next needs it; new
      syntax (literal tables) built as declared syntax from the start.
- [ ] `[medium]` **Evaluate in a web worker**, if very long sheets still lag once
      typing pauses.
- [ ] `[low]` **MathScribe in someone else's app** (2026-11-17):
      1. Registration as the public way in: `<MathScribe
         modules={[...defaultModules, MyPlugin]} />` and `registerModules`,
         with MathScribe's own modules exported as `defaultModules` (the folder
         discovery stays for this app's own build).
      2. A library build (Vite library mode, TypeScript types) with two entries:
         `mathscribe` (the component, registration, the modules) and
         `mathscribe/plugin` (the module API).
      3. An embeddable `<MathScribe />`: `App.tsx` is a whole page (top bar,
         tabs, files, a global stylesheet, storage keys); it needs props (the
         starting text, `onChange`, options) and its styles scoped to it.
      4. A plugin package: explicit (import it, pass it in `modules`), or
         self-registering (importing it registers it); later, perhaps, a Vite
         plugin that registers every dependency tagged `mathscribe-plugin`.
      Known limit, to document rather than lift: modules install once per page
      (grammar, `@` members, lex rules and the line cache are page-wide), so
      several `<MathScribe />` share them and a module can't be uninstalled.

## 9. Mobile view (Level 2: touch & small screens)

- [ ] `[high]` **A row of symbol keys above the keyboard**: `*`, `^`, `_`, `@`,
      `{`, `}`, `(`, `)`, `#`, `=`, `/`, and Tab (which a phone's keyboard
      hasn't, for accepting a suggestion and for indenting), shown while the
      editor has focus on a touch screen.
- [ ] `[medium]` **Tap for what hovering shows**: a name's value, a unit's
      meaning, an `@` member's description and a ⚙ row's help, by a long press
      (or a tap, in the output), as a touch screen has no hover.
- [ ] `[medium]` **Suggestions and hints above the keyboard**: the suggestion
      list, parameter hints and the rename panel kept in the part of the screen
      the keyboard doesn't cover (the visual viewport), and the cursor's line
      scrolled into view as the keyboard opens.
- [ ] `[medium]` **Equations narrower on a phone**: a long line of working
      scrolls sideways in the output; laid out one `=` a row when it's wider
      than the pane, as the LaTeX export already does (`fitted`), it wouldn't
      need to.
- [ ] `[medium]` **Plots on a phone**: tick labels and the legend sized for a
      small drawing (the drawing scales down whole, so its text gets small), and
      a tap on a plot to see it full screen.
- [ ] `[medium]` **The Create, Export and Template dialogs on a phone**: full
      screen, with their buttons in reach at the bottom. Note (2026-11-22, the
      to-dos' sweep): Template is no longer a dialog but a list in the top
      bar's New menu (FileMenus.tsx), so this is the Create and Export dialogs,
      and the New and Save menus' bars on a narrow screen.
- [ ] `[low]` **Menu entries for what only shortcuts do**: rename (F2), go to
      definition (Ctrl+Click, F12), format (Ctrl+Shift+F), comment (Ctrl+/),
      find; in a long-press menu on a name, or the Input pane's Options.
- [ ] `[low]` **Bigger tap targets in the editor**: the fold arrows in the
      gutter, a table's or plot's ⚙, an import's ▼ ▲ × and Choose a CSV file…
      button, at least 40px for a finger.
- [ ] `[low]` **A notch and rounded corners**: the top bar and the Input/Output
      switch clear of a phone's notch and home bar (`env(safe-area-inset-*)`,
      with `viewport-fit=cover`).
- [ ] `[low]` **Landscape and tablets**: a phone turned sideways is often wider
      than 800px, so it gets the side-by-side panes; check they're usable
      there, and that the divider drags by touch on a tablet (it's pointer
      events, so it should).
- [ ] `[low]` **Swipe between Input and Output**, as well as the switch.
- [ ] `[low]` **Open a sheet from the phone's share sheet** (a web share
      target, once the app is installable) and **Share through it** (the Web
      Share API, in place of copying the link, where the phone offers it).