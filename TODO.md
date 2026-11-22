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
      Progress (2026-11-17): `@series(…)` (group 3) makes a series on one line;
      a range would be a third form of it. Decided with Emily for then: words
      with settings after `;`, `t = @series(0 s to 2.0 s; step 0.1 s)` (or
      `count 21`), and each value's sig figs from the decimal places of the
      inputs (exact when they're whole numbers without units).
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
      (2.755 × 10â»Â² L × 0.01000 mol EDTA / 1 L), the factor-label method chemistry
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
- [x] **A fit's uncertainty with x uncertainties** (2026-11-17, Emily, from a
      Hooke's law lab exported to Word): T² against m = F/g, fitted with
      `@plot(m, Tsquared; fit linear)`, gave a slope of 5.8353 ± 0.0015 s²/kg and
      χ²_ν = 2800, so k from it (6.7654 ± 0.0017 N/m) "did not agree" with the
      static k (6.65 ± 0.04 N/m). The fit weighted points by δy alone, and here
      the periods (δT² ≈ 0.01%) are far more precise than the masses (δm ≈ 1%).
      Resolved (2026-11-17): a weighted fit counts each point's x uncertainty
      through the line's slope, σ² = δy² + (slope · δx)² (effective variance),
      refitted until the slope settles (`linearFit`, plot.ts). Decided with
      Emily over also widening by √χ²_ν, which would change plots whose points
      scatter more than their bars. On the lab's data: χ²_ν 0.53, slope
      5.87 ± 0.08 s²/kg, k = 6.72 ± 0.09 N/m, which agrees. Plots without x
      uncertainties are unchanged (every golden test as it was); the line under
      the graph says "(weighted by δT² and δm)" when both counted.
- [ ] **Spreadsheet data**: paste from Excel or Google Sheets, and import `.xlsx`.
- [ ] **Text columns** in imported data (labels, categories), to group and filter by.
- [x] **`@series`** (2026-11-17, Emily): define a series on one line,
      `t = @series(1 s, 2 s, 3 s)`, and make one from others: `m = @series(F / g)`
      (each F divided by the one g, with or without an uncertainty), or
      `v = @series(d / t)` from two series. For series of different lengths,
      perhaps use the shortest, with a warning, and a way to choose the range,
      for a slice.
      Resolved (2026-11-17): `SeriesForm` (`modules/series/series.ts`), a line
      form of the series module. Listed values become `t_1`, `t_2`, …; a rule
      (one argument that uses a series) is worked out row by row as `@table`'s
      columns are, sharing `columns.ts` (`seriesUsedIn`, `sharedRows`,
      `withRowValues`). Each value is worked out as a line assigning it, so units,
      sig figs, uncertainty (one source for `g` across every row) and settings
      on the name (`m:3`) are the core's. Decided: rows keep their numbers
      (`v_5` from `d_5`, so `@table(d, t, v)` lines up; not renumbered as
      `@select` does); different lengths use the rows every series has, with
      a warning saying how many each has, and `; rows 5-20` (the words `@table`
      and `@select` use) chooses a slice; a series made again replaces the
      one before. The line shows `m_i = F_i/g = (…) kg  3 values`, a long one
      shortened (first three, last two); `#sym` the rule, `#val` the values.
      In the Reference tab, the AI prompt and the editor's `@` suggestions.
      Not yet: a range (see Ranges and sums), and a ⚙ menu for its rows.
- [x] **Spacing in the formatter**: `x= 5kg` → `x = 5 kg`, `x1,x2,x3` →
      `x1, x2, x3`.

      **Resolved (2026-11-20):** from each line's tokens (`spacingChanges`,
      tree/format.ts): one space either side of `=`; one after each `,` or `;`
      and none before, unless what's after it ends the line, closes a bracket
      or is a note; one between a number and its unit. Only the spaces between
      tokens change, so strings, a module's settings, notes, comments, `==` and
      prose's `{{…}}` values are left as they are. Where a line break, an
      indentation or a trailing comma's removal already changes a gap, that
      change wins; and two spacing changes in one gap (`,=`: the comma's space
      after, the `=`'s before) become one, which a random check found had
      once lost the `=`. Checked over 40,000 random texts: nothing lost but
      spaces and trailing commas, and formatting twice changes nothing more.
- [x] **Show uncertainty**: a checkbox in a table's and a plot's ⚙: a table's
      ± values, a plot's error bars.

      **Resolved (2026-11-20):** a setting both share, `uncertainty off` (on by
      default), and a "Show uncertainty" box in each ⚙. A table's cell shows
      its value alone, to the digits its uncertainty gives it (`cellParts`'s
      `uncertainty`). A plot draws no error bars, nor makes room for them on
      its axes, in the SVG (the Rendered tab, Word's picture) or in LaTeX; its
      fit still weighs each point by its uncertainty, so its slope and
      intercept are the same.
- [x] **Tables as tables**: `@table(…)` written as a real table, as Emily
      writes them by hand: a `table` float with a caption, full width
      (`tabularx`, `|l|*{n}{>{\centering\arraybackslash}X|}`), a rule after
      every row, bold headers and a bold first column; in LaTeX, Word and the
      Rendered tab alike.

      **Decided (2026-11-19):** a `title "…"` setting (as `@plot` has) is its
      caption; the n column is the bold first column; the `lines` settings
      stay. Row headers other than n come from a series of labels:
      `salts = @series("KCl", "KBr", "KI")` then `@table(t, x; labels salts)`,
      its values the bold first column in n's place (a later step, after the
      block's style). A literal table of observations (text, a header over
      several columns) is a separate feature, after this.
      **Progress (2026-11-19), step 1a, the block:** a line form can now show
      its line as a block of its module's own kind (`CalcResult.block`, the
      core's hook; the calc reader adds it with the line's note, messages,
      `#hide` and source), and `@table` is the series module's first
      (`series.table`: tableBlock.ts its data and construct, tableView.tsx its
      view). Behaviour-neutral: the `array` is written as before; checked side
      by side with the code before it over 15 sheets of tables (every
      setting, shortened, with errors, notes, `#hide`, in a list, beside an
      equation): LaTeX and Word byte for byte the same. Next, step 1b: the
      style, and `title`.
      **Progress (2026-11-19), step 1b, LaTeX and `title`:** a `title "…"`
      setting (and a Title box in the table's ⚙), read and written as a
      plot's is (the quoted setting and its splitting now shared, in
      tableSettings.ts). In LaTeX a table is a `table` float (`[H]`), its title
      the `\caption`, `tabularx` at `\linewidth`: the n column `l` and bold,
      the others centred `X` columns, the header bold (`\boldsymbol` maths);
      `lines grid` rules every cell and row, `lines header` (the default) a
      rule under the header and after n, `lines none` none. In a list or a
      column it's a `center` with `\captionof`. The preamble gets tabularx,
      float and caption when there's a table. The data and its `array` moved
      to a leaf, tableData.ts, so the module's public face can share them.
      Compiled with pdflatex (TeX Live 2025): no errors or overfull boxes, at
      the top, in a list and in a column. Next: Word, then the Rendered tab,
      then `labels`.
      **Decided (2026-11-19):** a table's lines default to `grid`, as Emily's
      are (`lines header` is written out now, as `lines grid` was).
      **Progress (2026-11-19), step 1c, Word:** a Word table (`tableDocx`,
      tableBlock.ts): its title a caption in Word's Caption style, numbered by
      a SEQ field (Word lists it in a table of tables) and counted as it's
      written (`docxKit.caption`, `Ctx.captions`); full width, the n column
      narrow, bold and to the left, the others centred and sharing the rest;
      the header row bold and repeated on each page; rules as `lines` says
      (all of them; under the header and after n; none); its note under it.
      Two things in the core's Word output this needed, both general: maths
      alone in a cell is lined up by its own setting, not the paragraph's
      (`docxKit.alignedMath`), and maths can be set all bold, a variable bold
      italic (`texToMath`'s `bold`; `\boldsymbol` over a whole header came out
      as plain upright text). Opened in Word (exported to PDF through Word
      itself) and checked by eye: grid, header and no lines, captions 1-3, a
      note, a table in a list. Next: the Rendered tab, then `labels`.
      **Progress (2026-11-19), step 1d, the Rendered tab:** an HTML table
      (tableView.tsx, its own stylesheet tableView.css in the module's folder,
      in the app's colours): its title a caption over it (unnumbered: the
      numbers are the exports'), the value columns sharing the width equally
      and n as narrow as its numbers, n and the header bold, each cell KaTeX,
      the lines as `lines` says, its note under it, the line's messages. A
      shortened table's ⋮ row has ⋮ in every column, the n column's too (in
      Word it had been the text `\vdots`). Checked by eye in a screenshot
      (headless Edge) of the tables drawn with the app's stylesheet. Next:
      `labels`.
      **Decided (2026-11-19):** the row numbers' header is blank, not n (as a
      table written by hand has).
      **Resolved (2026-11-19), step 2, `labels`:** `@table(t, x; labels
      salts)` puts a series' values down the side in place of the row numbers
      (TableData's `rowHeaders`, the first column, text drawn bold as a title
      is: `$…$` maths, and a module's notation through `markupText`, now in the
      module API, so `{KCl}` is a formula; a value that isn't text, its
      maths; a row the series doesn't have, blank; a name that isn't a series,
      an error). A "Row labels" box in the ⚙. In Word the row headers' column
      is as wide as its longest label (up to 40% of the table). Bold maths in
      bold text in all three: `\textbf{\boldmath …}` in LaTeX, `titleRuns`'s
      maths bold in bold text in Word (bold headings' maths too, now), `Title`'s
      `bold` and a CSS rule for KaTeX's formulas in the Rendered tab. Found on
      the way: `splitArgs` split at a comma inside a label in quotes, so
      `@series("KBr, solid", "KCl")` was an error; it now skips quoted
      strings. Compiled with pdflatex and checked by eye in LaTeX and the
      Rendered tab.
- [x] **Multiline calls**: a call's arguments over several lines, for
      `@series`, `@table`, `@plot` and `@select` first:

      ```
      val = @series(
          1234,
          5678
      )
      ```

      **Decided (2026-11-19):** read once, by the tree, not by each call. A line
      that's an expression and leaves a round or square bracket open is carried
      on over the lines after it, up to the one closing it (curly braces open
      blocks, so they don't). Its arguments are indented one level deeper than
      the line it starts on, its closing bracket at that line's indentation; a
      trailing comma is allowed, and the formatter takes it off. (A first go,
      by Copilot on 2026-11-17, joined the lines in the sheet reader and each
      call's own patterns; it's in `git stash`, set aside.)
      **Progress (2026-11-19), step 1, the tree:** a line whose tokens leave
      brackets open (`openBrackets`, lexer.ts) opens a `continued` node
      (`CONTINUED`, grammar.ts), as a line can open a block; the lines after it
      are `continuation` lines, read as expressions but not for what they
      assign, up to the one closing the last bracket (`BODY_END.brackets`). A
      bracket never closed (`x = sin(`, half typed) ends where the indentation
      does, or at a blank line, so it can't take in the rest of the sheet. The
      editor reads lines the same way, so Enter after `@series(` indents, and
      the call folds.
      **Progress (2026-11-19), step 2, the sheet reader:** a `continued` node
      is one line where its first line is (`continuedLine`, sheetReader.ts):
      its lines' text joined by a space, their bodies, #commands and notes
      joined (`joinSplit`, syntax/commands.ts), read by its first line's kind's
      reader, and ending at its last line, so the lines after it keep their
      numbers. Nothing else changed: the calls get the text they'd get on one
      line, so `@series`, `@table`, `@plot`, `@select` and any other call work
      over several lines (`multilineCalls.test.ts` checks each gives what its
      one-line form gives).
      **Resolved (2026-11-19):** a trailing comma before the closing bracket is
      left out as the lines are joined (`trailingSeparatorAt`, tree/lines.ts,
      finds it from the tokens), so it's allowed in any call, `max(…)` too, not
      just the series calls, which took one already. The formatter lays the
      lines out (see Format the sheet, section 5), and the README documents it.
      **Fixed (2026-11-19), found by Emily in the editor:** a multiline call was
      coloured differently from the same call on one line, and a multiline
      table or plot had no ⚙. Each line was read on its own, so `@table(` with
      its `)` on a later line wasn't a call (its callee coloured as a constant),
      and the lines after it didn't know they were its arguments (its settings
      after `;` coloured as maths). Now a call whose `)` isn't on its line is an
      `openCall` node (lexer.ts), and a continuation line is read as the rest
      of the line so far (`lexTail`: the frame carries what's been said), so
      its tokens are the ones it has on one line (tree.test.ts checks they are,
      kind for kind). The ⚙ (series/tableMenu.ts) finds tables and plots from
      the sheet's tree's tokens rather than a pattern on each line
      (`settingsCalls`, with `encode` and `ASSIGN` added to the module API),
      so it sits after the `)` of one over several lines, and its settings are
      written between the brackets, keeping the `)` on its own line.

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
- [x] **Format the sheet**, with Ctrl+Shift+F and on Save and Save as: each
      line's indentation from the blocks it's in, a multiline call's lines laid
      out as in Multiline calls (section 3), its trailing comma taken off.

      **Decided (2026-11-19):** worked out from the tree's reading of each line
      (stepLine), so it changes only whitespace at the start of a line and a
      trailing comma it finds as a token; comments, prose, raw LaTeX and
      imported data are left as they are. Formatting twice changes nothing more.
      Not on auto-save, which saves while typing and would move the text under
      the cursor (to check with Emily). (A first go, by Copilot on
      2026-11-17, worked on the text and could drop everything after a bracket
      left open; set aside in `git stash`.)
      **Resolved (2026-11-19):** `formatChanges` / `formatSheet`
      (tree/format.ts) read each line in its place with stepLine and give the
      changes as edits: whitespace at a line's start, and a continuation line's
      trailing comma. Indentation is normalised to one level (4 spaces) a body,
      except where it means something: an `@layout` block's lines keep how much
      further in than its first each is (a list's sub-lists), a continued
      line's keep what's lined up in it, imported data's rows move with their
      import; prose and raw LaTeX are kept as written. A closing line goes under
      its opener only if it starts with its bracket (`2)` closing a call stays
      a level in). A comma isn't taken off a call's first line (`f({,` would
      open a block), nor when it's alone on its line (a blank line ends the
      call). `format.test.ts` checks the layouts, and that formatting every
      sample, Reference and Library sheet, and random text, keeps its tree and
      what it works out to, and is the same formatted twice (100,000 random
      texts checked once by hand). In the editor (editor/format.ts) the edits
      are one undoable change, so the cursor stays put; Save and Save as format
      the sheet before writing it (useSheets.ts), and text changed outside the
      editor now changes only the lines that differ (EditorPane.tsx), so the
      cursor stays put there too.
      **Fixed (2026-11-19), found by Emily:** a value in `@series(…)` indented a
      level too far stayed there on Ctrl+S and Ctrl+Shift+F, because a
      continued line's lines kept how much further in than its first each was
      (meant to keep anything lined up by hand). Indentation in a call means
      nothing but its brackets, so now each of its lines is a level in for each
      bracket open where it starts (one it starts by closing a level out), and
      only an `@layout` block's lines keep their own (a list's sub-lists).
      **Changed (2026-11-19), asked for by Emily:** a call any of whose items
      is on another line has every item on a line of its own (as Prettier and
      Black do): a line break after a bracket that closes on a later line,
      before its closing bracket, and after each `,` or `;` directly in it (a
      matrix's `[ ]` with rows, only at its `;`s). Breaks only take the place of
      spaces, only where a bracket is open, never so a line starts with `//`
      or a separator, and only in a call whose brackets all match and whose
      quotes close (one half typed is just indented). A bracket that opens and
      closes on one line is left as it is. `continuedChanges` (tree/format.ts).
      **Fixed (2026-11-19), found by Emily:** a value at the wrong indentation
      (not indented further than `Fs = @series(`) ended the call, so the
      formatter couldn't bring it back. Now a line not indented further still
      carries a call on if what it's said so far ends expecting more (an open
      bracket, `,` or `;`) and the line couldn't be a line of its own: not a
      kind of line there (`}`, a heading, a block's opener) and not assigning a
      name (`standsAlone`, tree/lines.ts). So `x = sin(` half typed still ends
      at `y = 2`. The formatter then indents it with the rest. Random checks
      (100,000 texts each, two alphabets, once by hand) found no change of
      meaning; one oddity left: a #command in the middle of a call's line
      (`@table(  #val ,()`) can take a second format to settle.
- [x] **A plot's LaTeX: its fit line across the whole plot, and tidy axis
      labels**, found by Emily: in the export, the best-fit line stopped at the
      first and last points, and pgfplots wrote `1·10⁻²`, `2·10⁻²`, … under the
      x ticks, overlapping. Resolved (2026-11-21): the drawing and the LaTeX now
      share one set of axes (`plotScales`, output/plot.ts): the export gives
      pgfplots their range, ticks and labels (`scaled ticks=false`), and draws
      each fit across the x axis's range. An axis whose ticks would need a power
      of ten has one for them all, said once in its label (`d [10⁻³ m]`, ticks
      0.2 … 1.6), in the Rendered tab, the image and the LaTeX alike
      (`axisTicks`); a log axis keeps a power under each tick that needs one.
- [x] **A plot's fit equations centred under it, and a toggle for them**, asked
      for by Emily: in a centred block they sat at the left, under a centred
      plot. Resolved (2026-11-21): they're centred under the plot wherever it
      is, as the plot always is: in the Rendered tab (`calc__row--centred`), in
      LaTeX (`centredEquation`: a `center` environment, which `fleqn` doesn't
      move) and in Word. `equation off` (the ⚙ menu's *Show fit equation*)
      leaves them out; the fit's slope and intercept are still variables.
- [x] **A series' members' names before its values in the editor**, asked for
      by Emily: in a series written over several lines, `x₁:`, `x₂:`, … faint
      before each value, as a line's result is after it. Resolved
      (2026-11-21): the series module's editor extension (memberLabels.ts), from
      the sheet's statements as the ⚙ menus find their calls: a `name =
      @series(` closed on a later line, each value directly in it (between its
      top-level commas, so `max(3, 4) m` is one) named in order. They follow the
      editor's *Show results in the editor* option, which modules can now read
      (`inlineHintsShown`, in the module API).
      **Fixed (2026-11-21), found by Emily:** the names took room of their own,
      pushing each value right of where it's indented. Now each is in a box of
      no width at its value's start, set to its left over the indentation, so
      the values stay where they are.
- [x] **Log axes from 0, and a fit's slope in the series' units**, found by
      Emily: turning on log x (or y) with `x from 0` set drew an empty plot
      (log 0); and a fit of N against m gave its slope in kg/s². Resolved
      (2026-11-21): a log axis leaves an end set at 0 or below to its values
      (scaleFor), and over a decade or two has its ends and ticks at 1, 2 and 5
      of each (0.013 … 0.103 m: 0.01 to 0.2, not to 1). A slope's unit is y's
      over x's as the series give them (N/m), unless they cancel (m against mm:
      a number), in the equation and in `p.slope`.
- [x] **Plot legends**, asked for by Emily: a setting for whether there's one
      and where (`legend top left`, …, `legend outside`, `legend off`), with an
      entry for each series and its fit, in the Rendered tab and the exports.
      Resolved (2026-11-21): `legend …` (`LEGEND_POSITION`, plotSettings.ts;
      the ⚙ menu's *Legend*); without it, as before, one for several series,
      now top left in the drawing too (it was a row above the plot), as in
      LaTeX. Each series has an entry with its marks as drawn, and each fit
      one, *Best fit* (`Best fit, x` with several series). In the drawing it's
      a box in its corner, or beside the plot (`outside`, which narrows the
      plot to make room); in LaTeX, pgfplots' `legend pos`.
- [x] **Plot colours**, asked for by Emily: points (and their error bars),
      lines and fit lines each in a colour chosen from one named list that
      LaTeX (xcolor) and the drawing share, in the settings and the ⚙ menu.
      Resolved (2026-11-21): `colour points|line|fit <colour>` for every
      series, `colour F_2 points green` for one (`color` too; `PLOT_COLOUR`,
      `partColour`). Each colour has one shade (`NAMED_COLOURS`, output/plot.ts),
      written into LaTeX as RGB, so all three outputs agree; in the Rendered tab
      black and grey are the theme's text colours, so they show on a dark theme.
      The ⚙ menu sets every series' (Point, Line and Fit colour); one series'
      own is typed.
Plot ideas, to investigate (suggested 2026-11-21, after legends and colours):

- [ ] **Max and min slope lines**: the steepest and shallowest lines through
      the error bars, and the gradient's uncertainty from them, as often taught
      in school and first-year labs; drawn dashed or dotted, with their slopes
      as variables (`p.slope_max`, `p.slope_min`).
- [ ] **A fit through the origin**, `fit proportional` (y = kx), for Hooke's
      law, Ohm's law and the like, where the intercept should be 0.
- [ ] **Other fits**: quadratic, exponential, power law (with their parameters
      as variables, as a linear fit's are).
- [ ] **Axis labels of one's own**: `xlabel "Extension"`, `ylabel "Force"`, with
      the unit still added (`Extension [m]`).
- [ ] **Marker shapes per series** (circle, square, triangle, …), so a plot
      reads in black-and-white printing.
- [ ] **The fit's equation in the legend**, as well as (or instead of) under
      the plot.
- [ ] **A fit only across the data**, not the whole x axis (`fit across data`),
      for when extending it says more than the data does.
- [ ] **Grid off, or a minor grid.**
- [ ] **A plot's size** (width, aspect) in the exports.
- [ ] **A residuals plot** under a fitted one: each point's distance from the line.
- [ ] **Copying a plot as an image** (PNG or SVG) from the Rendered tab.
- [x] **Uncertainty working written relatively**, asked for by Emily (her
      physics teacher's form: Y = AB/C, δY = Y √((δA/A)² + (δB/B)² + (δC/C)²)).
      Resolved (2026-11-21): an Output option, *Uncertainty working*
      (`CalcOptions.uncertaintyWorking`, `UNCERTAINTY_WORKING`): Partial
      derivatives, as before, or Relative. It's the same first-order
      propagation, so results don't change, only `delta F`'s working: a
      product, quotient or power of the inputs (times anything certain) as
      δY = Y √((n δA/A)² + …), each input times its power (B² → 2 δB/B, √ → ½);
      a sum or difference of them, each once, as δY = √(δA² + δB²); with the
      values put in when substitution is shown. The shapes are read from the
      formula's tree (engine/core/uncertaintyForms.ts); any other formula,
      `(A + B)/C`, `2A + B`, `sin θ`, is worked by derivatives, as the option's
      help says.
- [ ] **Relative working for mixed formulas, step by step**: `(A + B)/C` as
      the sum's uncertainty first (δS = √(δA² + δB²)), then the quotient's
      relatively. Only if sheets need it; for now such formulas use derivatives.
- [x] **F2 and Ctrl+Click for a series', table's and plot's names**, found by
      Emily: neither worked on them, and a series' hover was its whole line,
      scrolling. Resolved (2026-11-21): a line that defines names (a series'
      members, a plot's or selection's) now also lists the name it assigns
      (sheetIndex.ts): a series' `t` as a variable, a plot's `p` as a new kind,
      `SYMBOL_KIND.namespace`, gone to and renamed but not suggested on its own.
      Renaming a series renames its members and statistics with it (`t_1`,
      `t3`, `t_avg`); go-to-definition finds the name on its line as a token,
      not as text (`t` in `@series` once matched). A series' hover is how many
      values it has and its first and last; a namespace's, its members.
      (`definitionAt` and `renameChanges` are worked out from the editor's
      state alone, so they're tested: gotoDefinition.test.ts.)
- [x] **The Rendered tab follows the cursor inside a multiline statement**, found
      by Emily: on a multiline `@series(…)`'s values the output didn't scroll
      to it, only on its first line. Resolved (2026-11-21): the cursor's line is
      reported as the line its statement starts on (`statementStart`,
      editor/sheetLines.ts: back over lines carrying a statement on), the line
      its output is linked to.
- [x] **A block's closing `}` coloured as its opening `{`**, found by Emily: it
      was uncoloured and didn't match its opener.
      Resolved (2026-11-21): a closing line's `}` is a token of its own,
      `blockClose` (tree/lines.ts, closerLine; it was the line's plain body),
      coloured as a brace like `blockOpen`, so the two are coloured alike and
      bracket matching pairs them. (The tree's JSON Schema has it too.)
- [x] **Sections in the editor**: a slight highlight on `#` (section) and `##`
      (subsection) lines, a section's brighter; and sections and subsections
      collapsible up to the next heading of their kind, or of a higher one.

      **Resolved (2026-11-19):** read from the tree, as the editor's other
      folds are (sheetLines.ts, `headingLevel` from a heading's marks token):
      a heading folds to the last non-blank line before the next heading of
      its level or above in the same body (a block titled as a section,
      `# Kinematics {`, counts, and folds as the block it is), or its body's
      end, or the sheet's. The highlight (editor/headings.ts) is a line
      decoration in each theme's own tint (`--section-line`,
      `--subsection-line` in App.css); a `#` in prose or a note isn't one.
- [x] **Hover shows a variable's value at that line**, not at the end of its scope.
      Resolved (2026-11-20): each line says what it assigned, as it stood after
      the line (`CalcResult.assigned`, worked out when a hover asks), and each
      definition's symbol keeps that (sheetIndex.ts), so a hover shows the
      value from the definition visible there: `F = 19.6 N`, not its working,
      and a tuple's unpacked names (which had shown their scope's last value)
      too. The hover says "its value from there".
- [x] **Inline results**: a faint value at the end of each line in the editor
      (`F = m * a   ⟶ 19.6 N`).
      Resolved (2026-11-20): each calculation that works one out carries its
      result alone (`CalcResult.result`, from the equation's parts; ≈ when
      rounded), collected by line (`collectResults`) and shown faint, typeset,
      at the line's end (editor/inlineResults.ts); a value typed as it is shows
      none. "Show results in the editor" in the editor's Options turns them off,
      remembered in the browser.
- [x] **Parameter hints**: typing `E_k(1, ` shows `E_k(n, m [kg], L [m])` with the
      current parameter highlighted.
      Resolved (2026-11-20): the innermost call still open before the cursor,
      read from the statement's tokens (an open call; on a continuation line,
      what the lines above said, as the tree keeps it), and the commas directly
      in it, say which parameter (editor/paramHints.ts). What a function takes
      comes from the sheet's own functions, MathScribe's `@` functions
      (builtins.ts) and mathjs's (vocabulary.ts); a module's settings after `;`
      are shown as one, bold once the `;` is typed. Item 3 of "MathScribe as a
      language" (call signatures) will give these more to say.
      **Fixed (2026-11-20), found by Emily:** the hint showed whenever the
      cursor was in an open call, so it sat over a long `@series(…)`'s values
      as they were edited, bolding a parameter (`F / g`, an example's) that
      wasn't the one typed. Now typing a call's `(`, `,` or `;` opens it,
      typing in the call keeps it, and moving away or Escape closes it; past a
      function's last parameter nothing is bold, unless it takes any number
      (`max(a, b, …)`).
- [x] **F2's rename takes Greek letters**, found by Emily: `\delta` couldn't be
      typed in the rename box. Resolved (2026-11-20): in the box, as in the
      editor, Space or Tab after a letter's name types the letter
      (`typeGreekInBox`, greek.ts), and on Enter any name still written out
      becomes its letter (`withGreekLetters`) before it's checked against the
      sheet's own pattern for a name (`NAME`, not a copy of it).
- [x] **A condition's `?` and `:` spaced by the formatter**, found by Emily:
      `A ? "AGREE":"NO"` kept its `:` unspaced. Resolved (2026-11-20): one space
      either side of `?`, and of a `:` while a `?` waits for it (spacingChanges);
      a `:` with no `?` before it (a setting's, `x:3`) is left.
- [x] **`delta A` of a function's parameter**, found by Emily:
      `agreement(A, B) = abs(A - B) <= delta A + delta B ? …` failed on a call
      with "Undefined symbol delta", as a call is given only its arguments'
      values. Resolved (2026-11-20): a body's `delta A` of a parameter is a
      hidden name (`parameterDeltas`, propagation.ts) and a call to such a
      function is given, after its arguments, each one's uncertainty, worked out
      from the argument as written (`withArgumentUncertainties`,
      sheetFunctions.ts; held in `argument__N`). What's built from one carries no
      uncertainty of its own, as `ΔF / F` doesn't; a word (`"AGREE"`) never
      does, which also fixed any word-valued function of an uncertain value
      failing with "Cannot convert … to a number". The working shows `δA` given
      `k1` as `δk1`.
- [ ] **`delta A` in a call inside another function's body** (`f(X) =
      agreement(X, k2)`) gets no uncertainty for `X` yet (the body is worked out
      once, given values only); pass the outer call's argument uncertainties on.
- [x] **A keyboard shortcuts list**, somewhere in the app.
      Resolved (2026-11-20): in the editor's Options (ShortcutOptions), from one
      list of the keys as they're bound (editor/shortcuts.ts, `EDITOR_KEY`,
      which the keymaps use too), shown as ⌘ on a Mac and Ctrl elsewhere.
- [ ] **Quick fixes on warnings** (above), **literal tables** (Lab and data
      tables, section 2), **images** (section 2) and **PDF in the app**
      (section 2): recommended 2026-11-20, after the quality-of-life round
      (templates, inline results, hover, shortcuts, parameter hints, output
      options, caption numbers), in roughly that order of value; literal
      tables first, as the last everyday thing a lab report needs LaTeX by hand
      for.
- [x] **Rename (F2)** a variable or function everywhere it's used, respecting scope.
      Resolved (2026-11-17): F2 opens a small in-editor panel beside the name
      and replaces uses that resolve to the same symbol, in scope. Ctrl+Click
      and F12 also jump to variables, functions and constants.
- [x] **Go to definition for variables and constants** (`@rho_w` → its
      `@constants` entry).
      Resolved (2026-11-17): Ctrl+Click and F12 navigate the name under the
      cursor to the nearest variable or function definition, or a constant
      declaration.
- [ ] **Snippets**: `def`, `@layout.numbered { }` blocks, `@constants { }`.
      (`def` functions were removed on 2026-11-16: a function is one line now, so
      the snippet would be `f(x) = …`.)

## 6. Sharing and the app

- [ ] **Share by link**: the sheet compressed into the URL
      (`…/MathScribe/#sheet=…`), with no server and nothing uploaded.
- [ ] **Installable and offline**: a progressive web app.
- [x] **Templates**: "New from template" (a lab write-up, a problem set, a design
      calculation).
      Resolved (2026-11-20), the first two: a Template menu beside New
      (TemplateMenu.tsx), from `TEMPLATES` (content/templates.ts): a lab report
      (title page, purpose, method, data, calculations, results, discussion,
      conclusion) and a problem set, each with a little of every section filled
      in as an example; a test checks each works out without errors or
      warnings. A design calculation is left for when there's one to model it on.
- [x] **Remember the output options** (sig figs, substitution, ≈) in the browser,
      or keep them in the sheet so it looks the same wherever it's opened.
      Resolved (2026-11-20), in the browser: `loadCalcOptions` /
      `saveCalcOptions` (config.ts), as the Document options are. (Kept in the
      sheet is still an idea, for a sheet shared with someone else.)
- [x] **Captions numbered in the Rendered tab**, as the exports number them.
      Resolved (2026-11-20): a module's kind of block says which caption its
      blocks have (ModuleBlockKind's `caption`; a titled table, `Table`), and
      the Rendered tab numbers them in the sheet's order, hidden and wrong ones
      left out as the exports leave them (blocks/captions.ts); a view reads its
      number with `useCaptionNumber` (in the module API).
- [ ] **Narrow screens**: a stacked layout, or an Input / Output switch.
- [ ] **Evaluate in a web worker**, if very long sheets still lag once typing pauses.

## 7. Sheets and output

- [ ] **Equations wider than the output pane**: they scroll sideways (with a
      scrollbar), which is easy to miss. Break a very long line onto rows, one
      `=` each, as `#multiline` does, when it doesn't fit. (Found in a browser
      pass, 2026-11-16, along with notes that cut equations off beside them,
      fixed then: a note goes below an equation that doesn't fit beside it.)
      Progress (2026-11-16): the LaTeX export does this. An equation that might
      not fit (by about how much it draws) goes into `\msfit{one line}{rows}`,
      which LaTeX measures against the line, so the page, margins, font size and
      card it's in decide (latexKit.ts: `fitted`). The output pane could split an
      equation into rows the same way (`stepsOf`), measuring it in the page.
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
- [x] **One Export button instead of the LaTeX tab**: a single Export button opens
      a dialog to choose the format (Word `.docx`, LaTeX `.tex`, more later), with
      each format's options in it (what the LaTeX tab's Document menu holds now).
      Resolved (2026-11-16): **Export** in the top bar, beside Save as, opens a
      dialog (`ExportDialog.tsx`): the format (Word or LaTeX, remembered), the
      document options inline (`DocumentOptions.tsx`, from the old Document
      menu), and Download; for LaTeX, Copy and Show the LaTeX too. The LaTeX tab
      is gone. A format is one entry in `EXPORT_FORMAT`, so another (PDF) is one
      more. The Create dialog's styles became shared dialog styles (`dialog__…`).
      Checked in Chrome: both downloads, Esc, and the format remembered.
- [ ] **An `@format` namespace** for how a value is *shown*, without changing the
      value or the maths. First: `@format.inv(x)`, a value shown flipped, as its
      reciprocal written out (a ratio a/b shown as b/a, 1/(2.0 s) as 0.50 sâ»Â¹),
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
      Refined (2026-11-16, from a stoichiometry line that read as one run,
      `m 1/M n_Cr/n M_Cr`): a fraction in a product has × on both sides, so a
      chain of conversion factors reads factor by factor (m × 1/M × n_Cr/n ×
      M_Cr); `@inv(…)` counts as the fraction it's drawn as. A fraction of
      numbers is a coefficient, as before (½mv²), and a fraction raised to a
      power starts with its bracket (π^{−½}(Z/a₀)^{3/2}).

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

- [ ] **Syntax tidy** (2026-11-16): `syntax.ts` and `document.ts` are grouped by
      mechanism (patterns, words, helpers) rather than by concept, and several
      kinds of text are read again by regex wherever they're used. Steps, each
      checked in:
      1. [x] Dead exports out of `syntax.ts` (`LEADING_NAME`, `UNPACK_SO_FAR`,
         `CONSTANT_TOKEN`, `NAMESPACE_CALL_TOKEN`, the `Namespace` type); ones
         used only inside it no longer exported (`SETTING`, `opening`, `NOTATION`).
      2. [x] A pattern builder (named groups) and a word-list helper; `syntax.ts`
         split into `syntax/` by concept, `@layout` as one `LayoutSyntax` class;
         `document.ts` down to evaluation (block queries by the block types,
         columns in `constructs/layout.ts`, editor services in `sheetIndex.ts`).
         Syntax half done: `syntax/patterns.ts` (`src`, `named`, `optional`,
         `oneOf`, `regex`; `words()` with `.words`, `.has`, `.alternation`, which
         can't clash with a word as `.list` would have with `LAYOUT_STYLE.list`),
         and lexical, greek, settings, text, blocks, constants, commands
         (`splitNote` moved here), layout (`LAYOUT_SYNTAX.read/openerOf/name/
         token`). `syntax.ts` re-exports them all. Every pattern's groups are
         named and read as `.groups`; the plural lists (`DISPLAY_MODES`,
         `NOTATIONS`, …) are each list's `.words`. `reading/lineSyntax.ts` keeps
         only the constant declaration and the imported-data cache.
         Resolved, `document.ts` half: it's now only the evaluation entry
         points. `isOmitted` and `listItems` are in `blocks.ts`, by the block
         types; `splitInlineMath` in `syntax/text.ts`; `titleSegments` in
         `textSegments.ts` (not syntax/, since it asks the engine's modules how
         to draw a subscript); the column grid in `constructs/columns.ts`
         (shared by the app and both exports); symbols, definitions,
         diagnostics and line numbering in `sheetIndex.ts`. The two kits
         (`latexKit.ts`, `docxKit.ts`) no longer import the sheet reader.
      3. [x] The tree tokenizes once what's now re-read: #commands and notes
         (`tree/lines.ts` and `splitNote`), block openers (`tree/core.ts`,
         `reading/lineSyntax.ts`, the editor), text markup (`$…$`, `{formula}`,
         subscripts: `document.ts`, `engine/core/text.ts`, the editor,
         `sheetReader.withValues`), imported rows (the editor, `csv.ts`), and
         `@constant` references and dot access in expressions (`calculator.ts`,
         `names.ts`).
         - [x] #commands and notes: one reader, `readNoted` (syntax/commands.ts),
           finds the commands and note in one pass and says where each piece
           is. The tree's tokens are its pieces; the tree keeps what it read
           with the line's node (`notedOf`), and the reader's `Line.parts`,
           constants' entries and species' entries take it from there rather
           than splitting the line again. `splitNote` is readNoted without the
           pieces, for text that isn't a whole line (a heading's title, the
           declarations pre-pass). One change: a command after the note's `#`
           (`# the force #sym`) was always applied, but its token was part of
           the note; it's a command token now, and the editor colours it as one.
         - [x] Block openers: the tree reads an opener (`CONTENT.opener`: `Title {`,
           `@layout…`, `@constants {`, `@chem.species {`, a section's `# Title {`)
           into its `@` name, title and `{` (new token kinds `blockName`, `title`,
           `blockOpen`; `syntax/blocks.ts` BLOCK_NAME), and `@latex {`
           (`CONTENT.rawOpener`) into its name, `{` and LaTeX. The editor
           colours them from those tokens: its own patterns for them
           (`LAYOUT_SYNTAX.token`, `CONSTANTS_TOKEN`, `LATEX_TOKEN`,
           `SPECIES_TOKEN`, the title and brace regexes) are gone, and a
           one-line `@latex { … }` now shows its `{` as a brace. The published
           schema has the three new token kinds. (What an opener *means* is
           still read from its text, by `LAYOUT_SYNTAX.read` and the like, in
           the grammar and its reader: not cached, as the reader changes what it
           returns, the column breaks.)
         - [x] Text markup: the tree reads text (prose, a paragraph after its
           new `marker` token `>`, headings) into plain text, inline maths (new
           token `maths`), values (as before), and modules' markup through
           `ModuleGrammar.textRules` (lines.ts `declareTextRules`; listed by
           `introspect`): chemistry's formulas, `{Na^+}`, are `CHEM_TOKEN.formula`
           tokens. The editor colours prose, and a reaction's line, from the
           tokens; its own patterns (`proseToken`, `FORMULA_TOKEN`, `PROSE_RUN`)
           are gone, and `x_{max}` in prose is no longer coloured as a formula.
           One definition each: inline maths is `INLINE_MATHS` (with something
           in it: `$$` is text, as the outputs already drew it), used by the
           tree, `splitInlineMath`, `outsideMaths` (moved to syntax/text.ts) and
           the engine's display names; a formula in text is chemistry's
           `FORMULA_IN_TEXT` (moved to its syntax.ts), used by its text rule and
           `withFormulas`. Left as it is: the reader's `withValues` fills values
           into text by `VALUE_IN_TEXT` (the same definition the tree's value
           nodes are read by), since block titles, which aren't read into
           tokens yet, go through it too, and paragraphs of prose are several
           lines joined.
         - [x] Imported rows: kept as one `rows` token in the tree, as they were
           (thousands of values as tokens of their own would bloat the tree and
           every edit's read), but read for the editor's colours by csv.ts, the
           one reader of a row: `rowPieces` says where each value, header name
           and unit is, split at the row's separator as `parseCsv` splits it,
           with the same header pattern (now with named groups). The editor's
           own word and number patterns for rows are gone; a header's units are
           coloured as units.
         - [x] `@constant` references and dot access: read from the line's
           tokens, as the lexer reads them. The lexer reads mathjs's `.` as the
           delimiter it is (it was `unknown`); `expandDots` moved to
           `engine/core/memberAccess.ts` and joins `name.member` tokens
           (`DOT_ACCESS` gone); `expandConstants` takes each built-in token
           that isn't a call's (`CONSTANT_WRITTEN` reads its name and precision;
           `CONSTANT_REF` gone). Checked side by side with the regex versions
           over the whole suite before switching: 97 lines with members and
           105 with constants, no difference.
      Then: a codebase-wide audit of which patterns are working, toward one
      harmonious structure.

- [ ] **One harmonious structure** (2026-11-17, from the codebase-wide audit).
      Working, to spread: a base class per kind in a typed table (Construct,
      NodeReader, Member, LineForm, EngineModule); the tree's registry, which
      modules add to as data; the boundary test; syntax/. Not working: modules
      leak outside the engine (chemistry's species block, construct and view
      are core; latex.ts, sheetIndex.ts and the editor import module
      internals); the Calculator holds six concerns and evaluates a line as a
      chain of text rewrites, each lexing again; EngineModule has ~30 hooks,
      some for one module only; src/lib's root was a grab bag; the Rendered
      tab's views live apart from the constructs; the editor's suggestions
      parse the half-typed line with regexes of their own; constants are
      written two ways. Steps, each behaviour-neutral and checked in:
      1. [x] Folders: `src/lib/` by purpose: `sheet/` (blocks, document,
         sheetIndex, values, names), `output/` (latex, docx, their kits, omml,
         katex, plot, plotImage, textSegments, alignment, `constructs/`),
         `content/` (library, reference, sample, aiPrompt), `data/` (csv,
         files, storage), `maths/` (sigfigs, solve, brackets, mathjsNames),
         beside `syntax/`, `tree/`, `reading/`, `engine/`. Tests moved with
         their subjects; the cross-cutting ones (golden, engine, robustness, …)
         stay at the top. Imports rewritten by path, so nothing else changed.
      2. [x] Module extension points (block kinds with construct and view,
         editor token styles, vocabulary, symbols, LaTeX packages), so
         chemistry, series and vectors stop leaking; the boundary test over
         all of src/. `plotSettings.ts`, `tableSettings.ts` into the series module.
         - [x] Block kinds: rather than a way for a module to add a kind, the
           two kinds that were alike became one. `@constants { }` and
           chemistry's `@chem.species { }` were both a card of equations under a
           title, with a construct and a view each, nearly line for line the
           same; they're one core kind now, `card` (`CardBlock`: a title, entries
           of source and LaTeX, `single` for one on its own line, and `defines`,
           the names its entries make usable anywhere, which the editor's
           symbols read). One `CardConstruct`, one `CardView`. Chemistry's reader
           makes its cards (title, each entry's LaTeX, the species' names);
           core has no species block, construct or view any more, and
           `sheetIndex.ts` no longer needs chemistry to list symbols. Seen
           differently: an entry that can't be read shows what was written (as
           a constant's does), not `\mathrm{…} =` with nothing after it.
         - [x] The rest of the leaks, each through a hook rather than an import:
           the LaTeX packages a module's notation needs (`EngineModule.latexPreamble`:
           chemistry's mhchem); a line form whose name is a namespace says so
           (`LineForm.assignsNamespace`: plot, select, reaction, substance), so
           `sheetIndex.ts` needs no series patterns; what a module's token
           kinds are (`ModuleGrammar.tokenRoles`, the registry's `TOKEN_ROLE`:
           formula, text), which the editor colours by, and a line's body can be
           a token of a module's kind (`LineSyntax.bodyToken`: a reaction's is a
           formula), so `language.ts` imports no module; a module's `lineSettings`
           carry what each does, which the editor's suggestions list; names
           written in braces are a core kind, `braced`, whose hover and
           suggestion text the module that defines them gives
           (`DefinedName.about`, `detail`), so the editor has no species in it.
           `plotSettings.ts` and `tableSettings.ts` moved into the series module,
           which has a public face (`modules/series/index.ts`) for the ⚙ menus
           and the plot drawing. The boundary test now covers the whole app:
           outside the engine, only `engine/index.ts` and a module's `index.ts`
           may be imported (one exception, documented: the tree's lexer reads
           mathjs's units from `core/literals.ts`).
      3. [x] One view per block kind, in `components/blocks/`, beside the constructs.
         Resolved: `PreviewPane.tsx` (440 lines) is now just the Output pane
         (90). The views are in `components/blocks/`, file for file as the
         constructs are in `lib/output/constructs/`: `lines.tsx` (heading,
         text, LaTeX, gap, calculation), `blocks.tsx` (card, import, `{ }`
         block), `layout.tsx`, and `index.tsx` with `BLOCK_VIEWS` and
         `RenderedBlock`; `shared.tsx` has what they draw with (`Tex`,
         `Title`, messages), and `context.ts` what the pane gives them (the
         line link, line numbers, removing an import), kept apart so editing
         a view reloads in place. `hasError` moved to `blocks.ts`, by the block
         types; `ImportSummary` folded into `ImportView`.
      Plugins (2026-11-17, Emily): someone running MathScribe locally should be
      able to write a module of their own; adding one is extending a class and
      registering it, nothing else edited. CLAUDE.md states it as the way to
      work. Decided: (1a) a module is a folder in `src/modules/`, found and
      installed; (2a) one class to extend, with app-level parts (views, editor
      features) declared through its hooks too.
      - [x] C1, modules as folders: chemistry, series, solve and vectors moved
        from `src/lib/engine/modules/` to `src/modules/`, each with an `index.ts`
        exporting its class as its default; `src/modules/index.ts` finds every
        folder there (`import.meta.glob`) and installs it, with a list to leave
        one out; `sheetModules()` makes them. A module imports MathScribe only
        through the module API, `src/lib/plugin.ts` (what modules used, gathered
        and documented), its own folder, and a required module's `public.ts`
        (series' face renamed from `index.ts` to `public.ts`, since `index.ts` is
        now a module's entry). The boundary test was rewritten from src/: the
        core needs no module (now counting only imports that load a file,
        which caught `results.ts` loading the plot code by `import { type … }`);
        a module imports only the module API, its folder and what it requires;
        the rest of the app uses the engine's entry and modules' `public.ts`.
        `src/lib/plugin.test.ts` is a module written only against the API
        (`@g_mars`, a setting), installed beside the others. The published
        schema lists the modules' kinds in folder order now.
      - [x] C2, a module's own block kinds (construct and view), and editor
        features (suggestions, hovers, a menu: series' ⚙ menu moves into it).
        Resolved: a core block kind, `custom` (`CustomBlock`: a `type`, the
        module's `data`, and what any block has: note, error, hidden, the
        names it defines), which a module's readers make; the module gives
        each type's construct and view (`EngineModule.blockKinds`), and the
        core's `CustomConstruct` and `CustomView` hand the block to them. A
        module adds to the editor with `EngineModule.editorExtensions`
        (CodeMirror extensions): series' ⚙ menu moved into the series module
        (`modules/series/tableMenu.ts`) and is added that way. The module API
        gives what writing them takes: `Construct`, `latexKit`, `docxKit`,
        `Tex`, `Title`, `BlockMessages`, `useLineLink`, `Extension`.
        Registering changed too: the engine's entry no longer loads the
        modules (a module loads the module API, which reaches the engine's
        entry, so the entry loading every module back made a circle that
        broke loading); `src/modules/index.ts` registers them
        (`registerModules`), and `main.tsx` and the tests' setup
        (`src/test/setup.ts`) load it first. A sheet can be read with given
        modules (`evaluateSheet(source, options, modules)`), which
        `plugin.test.ts` uses to read, export and draw a block of its own
        module's kind (`@mars.orbit Phobos`). Suggestions and hovers for a
        module's own syntax are still the editor's: what a module needs there
        is a hook to add when one does (braced names already come from the
        module, `DefinedName.about`/`detail`).
        Found on the way: `App.css` and this file had been round-tripped
        through PowerShell's `Get-Content`/`Set-Content`, which read UTF-8 as
        ANSI and turned `…`, `•`, `→`, `⚙`, `×` into `â€¦`-style mojibake
        (the file name's `•` in the top bar showed it); repaired.
      4. [x] The Calculator's concerns into collaborators, and a line read as a
         pipeline of token stages (modules add stages); EngineModule's hooks
         grouped into interfaces a module opts into.
         - [x] A, the line pipeline: a line goes through stages in order
           (`LINE_STAGE`: raw, names, members, shape, settings, expand,
           expression, check, work), each a list of steps (`LineStep`): the
           core's first (`CoreStep`s, which were `evaluateLine`'s one long body:
           names, shape, settings, expand, check, work), then the modules', in
           the order given; the first step to give a result ends the line. A
           `LineForm` is a step that works a whole line out (`run` offers it
           the line); a module adds other steps with `lineSteps`. The pipeline
           is made per Calculator from its own modules (not page-wide: see
           Packaging). What the core's steps read of a line passes between them
           on the line (`CoreLine`: its shape, settings, display name, percent,
           numbers as typed). Each step reads the line's tokens when it needs
           them (the lexer caches them), rather than the line carrying them:
           the steps that write a line out still write text, as before.
           `plugin.test.ts` adds a step (`sol`, a Martian day, written out at
           `expand` from the line's tokens). Moved, not changed: the golden
           tests and all others pass as they were.
         - [x] B, the Calculator's concerns into collaborators, each a class with
           the narrow interface it needs of the Calculator (its `…Host`):
           - [x] `SheetConstants` (`sheetConstants.ts`): the sheet's own
             constants, the precision and unit it gives any, and writing `@name`s
             out (`expand`, which `ModuleHost.expandConstants` is now).
           - [x] `DisplayNames` (`displayNames.ts`): a display name as LaTeX,
             with values in it, and display-name templates.
           - [x] `SigFigs` (`sigFigs.ts`): a result's sig figs from the numbers
             as typed, the variables and the functions it uses, and the whole
             numbers whose trailing zeros won't count; `lost` is what
             `precisionLost` was. What it needs of the Calculator (a part's
             value, a variable's and a function's sig figs, a module's exact
             counts) is its host, so it holds no state of the line's.
           - [x] `Propagation` (`propagation.ts`, beside the syntax in
             `uncertainty.ts`): combining contributions in quadrature,
             propagating them through an expression, `delta F` as a hidden
             variable, `pm` as LaTeX, and `delta F`'s working.
           - [x] Series aggregates, functions: these are woven through
             `evaluateParsed` more deeply (aggregates keep sources, functions
             trace their working), so each needs its share of the line's state
             first.
             Resolved: `SeriesAggregates` (`aggregates.ts`): a series' members
             and rows, the aggregates a line names, defined from them with
             their sig figs and uncertainty (it keeps each mean's uncertainty
             source), and their working. `SheetFunctions` (`sheetFunctions.ts`):
             defining the sheet's functions, what's kept about each (in place of
             the Calculator's `userFunctions`), and the calls to them in an
             expression. A call's working (`traceCall`) stays in the Calculator:
             it runs the line evaluator again inside the function's scope, with
             the line's state (scope, parameter aliases, #multiline, depth), so
             it's the evaluator's own, not a collaborator's. Moved, not changed:
             all tests pass as they were. The Calculator is down from 1891
             lines to about 1480.
         - [x] D, EngineModule's hooks grouped, so a module's author finds
           what to override by what it's for.
           Resolved: the hooks are in documented sections, in two kinds, as
           the class's own comment says: shared (called on one module of each
           class: what it adds when installed; the sheet's language; units;
           how its notation is written; blocks and the editor) and per sheet
           (called on the sheet's own module, which keeps its state: a line's
           pipeline; values; tuples). `settingProblem` moved to the shared
           ones, where it's called. Grouped as sections of the one class
           rather than separate interfaces a module implements: a module
           still only extends `EngineModule` and overrides what it needs, as
           CLAUDE.md has it, and every hook keeps its no-op default. Moved,
           not changed: all tests pass as they were.
           (Pulled in on the way, 2026-11-17: `@series(…)` and the fit that
           counts x uncertainties, from Emily's other machine; written as a
           series line form through the module API, as the approach has it, so
           nothing needed adapting. All tests passed as pulled.)
      5. [x] The editor's suggestions from the tokens of the half-typed line.
         Resolved: `src/editor/typing.ts` reads what's being typed (a command,
         a note, an `@` name, a setting, a unit, a namespace's member, a name:
         `TYPING`) from the tokens of the line so far, read in its place
         (`readAs`), or of the value being typed in text (`{{c_`), by a list of
         readers asked in turn; `complete` switches on its kind, in place of
         the patterns it had (`BUILTIN_SO_FAR`, `SETTING_ON_NAME`/`UNPACKED`/
         `RESULT`, `UNIT_SO_FAR`, `AFTER_TO`, `MEMBER_SO_FAR`, `WORD`). Run side
         by side with the patterns at every point of every line of the sample,
         the reference and the library (6900 points) before switching: they
         agreed but for two kinds, both fixes kept on purpose (and tested):
         in a compound unit (`9.81 m/s`, `mol/L`) units are offered, not
         names; and after a name ending in a digit (`T_1 k`, `m/s^2 K`) names
         are offered, not units (the pattern took any digit for a number).
         Checked in the app too: each kind's list as typed.
         - [ ] Still read with patterns: hovers (`BUILTIN_BEFORE`, `UNIT_PLACE`,
           a namespace before a dot, `IN_BRACES`), which could read the token
           under the pointer from the whole line; and braced names, `{dietz`
           (`BRACED_SO_FAR`), which are chemistry's syntax, in prose too, so
           belong to a hook of the module's for its own suggestions.
      6. [ ] Constants as `words()`, patterns with `src`/`named`, file by file
         as each is touched.
- [ ] **MathScribe as a language** (looked over 2026-11-20): the front end (a
      lossless tree, a grammar declared as data, modules adding to it) and the
      tooling on it (highlighting, folding, formatting, rename) are a
      language's; the middle still reads text with patterns (24 files in the
      engine and modules: each `@function` found by a regex, its options a
      mini-language of their own, arguments split from text, a series a naming
      convention, a line's text rewritten in stages and parsed again by mathjs).
      The bugs of 2026-11-19 (quoted commas splitting `@series`, a settings
      token taking a `]`, multiline calls joined in three places) were that.

      **Decided (2026-11-20), the middle path:** now, (1) statements in the
      tree and (3) call signatures with one options syntax, from which the ⚙,
      parameter hints, argument errors and the Reference come; (4) names and
      scopes in one pass, with places, when the editor next needs it; new syntax
      (literal tables) built as declared syntax from the start. Not now, unless
      the cost of not doing them grows: (2) an expression tree that writes
      mathjs's nodes, (5) series and namespaces as values of their own, a
      display IR for the outputs, re-working out only what an edit touches.
      1. [x] **Statements in the tree:** each thing a sheet says, as one line,
         over however many it's written, read once and kept with its node.
         (Each line keeps its own tokens, which the editor reads a line at a
         time: `lexTail` stays, its cost negligible at a call's sizes.)
         **Progress (2026-11-20), step 1a:** `Statement` (tree/statements.ts):
         its kind, lines, every token with its place (line, offset), its text
         as one line, its notes and commands as one line's; `statementOf(node)`,
         kept in a WeakMap. The sheet reader takes a line from its statement
         (its own joining, trailing commas and note merging gone). Checked side
         by side with the reader's old joining over every sample, Reference and
         Library sheet and 5,000 random texts: the same. Next, 1b: the
         formatter and the ⚙ (series' tableMenu) lay out tokens from it, not
         each their own.
         **Resolved (2026-11-20), step 1b:** the formatter takes a continued
         line's tokens from its statement (`statementOfLines`, for lines read
         one at a time), and the ⚙ finds tables and plots in the sheet's
         statements (`sheetStatements`, in the module API: each statement with
         where its lines start). Checked side by side over every sheet and
         3,000 random texts: the formatter's changes the same; the ⚙ the same
         but in 10 texts, where the old found a `@table(` closed by a `)` in a
         later statement, which it no longer does (a test says so).

### One source for the language

MathScribe is described in about eight places, mostly by hand: the README, the
Reference tab, the AI primer, the ⚙ menus, the settings' parsers and their
errors, `COMMANDS`, `vocabulary.ts`, hovers. A feature added (a plot's legend)
is written into four or five of them. Instead: each feature declared once, in
a tree (where it sits, what it is, how it's written, its values, examples,
rules for writers), by the core or its module through a hook, and the rest
made from it. Agreed with Emily (2026-11-21); the reference is to be generated
into its own file (`docs/REFERENCE.md`), not into the README.

- [x] **Step 1a: settings, declared.** Plot and table settings, each declared
      once, read, written back and listed in their error from the declarations.
      Resolved (2026-11-21): `src/lib/language/settings.ts`, in the module API:
      a kind of setting is a class extending `Setting` (switch, flag, choice,
      name, rows, title), with its examples and, for a choice, what each value
      means; a call's settings are a `SettingsSpec` (`TABLE_SETTINGS`,
      `PLOT_SETTINGS`), and a module adds kinds of its own (a plot's axes, its
      colours). Checked side by side with the hand-written parsers over the
      whole suite and 40,000 random settings texts: read and written back
      alike in every one, the same ones refused; then the hand-written ones
      were taken out. Only the error's wording changed: it now lists every
      setting by its example. A test checks each declared example is a
      setting, written back as itself.
      (The framework is the module API's first export: a module's settings are
      declared as it loads, which the outputs reach through its public face, so
      it must be loaded before them.)
- [x] **Step 1b: the ⚙ menus from the declarations.** Each kind of setting
      gives its own control (a checkbox, a choice, number boxes) in terms of a
      small interface the menu provides, and its help from its summary; the
      panels become a loop over the declarations.
      Resolved (2026-11-21): a setting's declaration says what it's called in
      the menu, what it does and any help under it (`SettingAbout`), and each
      choice's values their names there; each kind of setting gives its control
      (`rows`, in terms of `SettingsPanel`: a row, a checkbox, a choice, number
      and text boxes, help), and `SettingsSpec.controls` makes a call's panel
      from them, in the order declared. The ⚙ menu (tableMenu.ts) provides the
      DOM panel and nothing else of its own: its hand-made panels, names and
      colour box are gone. The panels are as before but for their order, which
      is now the settings' (a table's *Show uncertainty* before *Show every
      row*; a plot's *Show fit equation* after *Show uncertainty*), and a row
      label box's placeholder (`e.g. salts`). A test drives a declared call's
      controls through a panel of text.
      **Then (2026-11-21), asked for by Emily:** the help under a control made
      the panel busy; it's now each row's tooltip (its help, else its summary),
      so every row has one and the panel is just its controls.
- [x] **Step 2: the reference and the AI primer, generated** for settings,
      beside the hand-written ones, then replacing them.
      Resolved (2026-11-21): a call's settings are described from their
      declarations (`SettingsSpec.describe`), each module giving its calls'
      (`EngineModule.settingsDescriptions`, collected by
      `moduleSettingsDescriptions`), and written out in
      lib/language/reference.ts: in Markdown for the AI primer (a section for
      each call: how settings are written in it, then each setting's examples,
      what it does and its values), and in the Reference tab, a Settings
      section with a table for each call. There were no hand-written lists of
      settings in either to replace (the primer had none; the Reference's plot
      example named "rows, style, fit, axes and title", out of date since the
      legend, and now points to the section). Tests: the primer lists every
      declared setting's examples, and the Markdown is as expected.
- [ ] **Step 3: the rest of the language, in one tree**, area by area:
      commands, calculations, uncertainty, series, chemistry, layout. Agreed
      with Emily (2026-11-21): the references, tooltips and AI primer all from
      one tree, which the tests walk, so an example that's no longer valid is
      caught; an entry's rules shown in both the Reference and the primer.
   - [x] **Part 1: the tree, its tests, and the Reference's examples in it.**
         Resolved (2026-11-21): `lib/language/tree.ts`, the tree: topics, each
         a list of entries (what's said, rules, whole-sheet examples); the
         core's topics in `topics.ts`, each module's in its own `language.ts`
         (`EngineModule.languageTopics`, each placed after the core topic it
         follows), put together by `languageTopics()`. The Reference tab shows
         it (an entry's rules as a list under it), and `content/reference.ts` is
         gone, its 72 examples converted into the tree mechanically (the series,
         vectors, chemistry and solving ones into their modules). Every test
         that read them (golden, Word, format, schema, round trip) now walks the
         tree; the golden snapshots are unchanged. `tree.test.ts` checks every
         example has no errors (and no warnings unless it says it warns) and is
         written as the formatter writes it, which found two indented by 2
         spaces, not 4, and one that warns on purpose (`L = 300 m`, now marked).
   - [x] **Part 2: settings as entries**, through their specs.
         Resolved (2026-11-21): `settingsTopic` (lib/language/reference.ts, in
         the module API) makes a call's settings a topic of the tree from their
         declarations: how they're written in the call, then an entry for each
         setting (its syntax, what it does, its values), each with a whole sheet
         using it, which a module gives (the series module's table and plot
         samples: series/language.ts). So the tests run every table and plot
         setting in a real sheet (19 new golden snapshots), and the Reference
         tab's separate Settings section is gone: Table settings and Plot
         settings are topics, after Repeated measurements. An entry can now say
         how it's written (`syntax`), shown before what's said of it. A module's
         topic can follow another module's (the tree checks each follows one
         that's there).
   - [x] **Part 3: the AI primer from the tree**: its rules and snippets become
         entries' rules and examples, the old and new compared before switching.
         Under way (2026-11-21): the primer's rules are now entries' rules in
         the tree (shown in the Reference too, as agreed), and what it described
         that the Reference lacked is now entries of Basics with examples
         (comments, names, the functions of maths, values in text: 4 new golden
         snapshots). `primerFromTree()` (aiPrompt.ts) makes the primer from the
         tree (`primerMarkdown`, lib/language/reference.ts: each topic, each
         entry with its rules and first example, a setting in a line), with the
         constants' names and how a sheet of questions is laid out (the task's,
         so kept in aiPrompt.ts). It's beside the old PRIMER for Emily to compare
         before it replaces it; a test checks it says every topic, entry, rule
         and setting in the tree.
         Resolved (2026-11-21): compared, and switched by Emily: the prompt's
         rules are `primer()`, from the tree; the hand-written PRIMER and its
         SNIPPETS are gone (their examples are the tree's, which tree.test.ts
         runs). So is step 2's path for settings (`EngineModule.settingsDescriptions`,
         `settingsMarkdown`): the primer lists them from the tree, as the
         Reference does.
   - [x] **Part 4: editor hovers and completions from the tree** (`#`
         commands, keywords, settings words), in place of `vocabulary.ts`'s
         copies; and a test that every declared command, setting and `@`
         member has an entry.
         Resolved (2026-11-21): an entry can name the words it brings, its
         `terms` (a display command, a keyword, a setting after a name, one of
         mathjs's functions or constants, a series' name), each with what it
         does; the editor's suggestions and hovers (vocabulary.ts) are the
         tree's terms now, and its hand-written descriptions are gone. The
         Reference shows an entry's terms as a small table under it, and the
         primer lists them. New tests check nothing is left undescribed: every
         display command, keyword, setting word and series name is a term;
         every module's setting after a name, and everything built in under @
         a sheet can type, is written in an example. They found what no example
         showed: @layout.column (now an entry of Layout), the layouts' .sym,
         .full, .sci, .dec and .multiline, chemistry's :formula and :name, and
         @vector (each now in an example: 4 new golden snapshots). The commands
         are suggested in the tree's order now (#sym, #val, … #full), not the
         syntax's.
- [x] **Step 4: `docs/REFERENCE.md`**, generated, with a test that fails when
      the checked-in file is out of date.
      Resolved (2026-11-21): `referenceMarkdown` (lib/language/reference.ts)
      writes the whole tree as Markdown (a list of topics; each entry's syntax,
      what it does, its terms as a table, its rules, every example; the
      built-in constants), its plain text escaped so `*`, `#`, `$…$` and `<…>`
      show as written; reference.test.ts checks docs/REFERENCE.md is it
      (`toMatchFileSnapshot`: `npm run docs` writes it again, and nothing
      else, unlike `vitest -u`). The
      README's Syntax section points to it.
- [x] **Step 5: the README's Syntax section into the tree.** It's ~1,270 lines
      written by hand, with much the tree doesn't say yet (why and how, edge
      cases, more examples). Each fact moved into an entry (its explain, a rule,
      an example), section by section, then the section cut down to a short
      guide that points to docs/REFERENCE.md, so nothing is said in two places.
   - [x] **Batch 1: the overview, and Display commands.** Resolved
         (2026-11-21): the overview's table and notes (`@` is MathScribe's own,
         subscripts in headings, values in text, comments, spacing, = or ≈,
         products, brackets by nesting) and Display commands, moved into the
         tree: new Basics entries for `@`, products and brackets, and a Display
         entry for a variable defined with #sym; the rest as rules of the
         entries they're about. The README's part became a paragraph that
         points to the reference's Basics and Display commands (1,750 → 1,617 lines).
   - [x] **Batch 2: Layout blocks, Functions, Blocks and scope.** Resolved
         (2026-11-21): moved as rules of Layout's, Functions' and Basics' block
         entries (sub-lists, layouts don't scope, a title page's lines, how
         members combine and which wins, columns of blocks and in prose, what
         a call shows, casts' limits, a result's settings, conditions' brace and
         sig figs, scope and shadowing, a title as a heading), with examples of
         a column of blocks and a block titled as a section, and a Functions
         entry for @inv (turning a fraction over). The README's three sections
         are gone; its guide paragraph points to Functions and Layout (1,617 →
         1,371 lines).
   - [x] **Batches 3 to 6: the rest** (Greek letters, built-in functions,
         vectors, tuples, units; significant figures, uncertainty, constants;
         chemistry, solving; series, tables, plots, selections, imports).
         Resolved (2026-11-21), asked by Emily to do them all at once: each
         section's facts are rules of the entries they're about, with new
         entries where the tree had none: display names and calls over several
         lines (Basics), formulas in text and molarity (Chemistry), each with an
         example (4 new golden snapshots). What's about the editor rather than
         what's written (an import's rows, folded, moved and removed with it)
         went to the README's The editor. The README's Syntax section is now a
         paragraph and a list of the reference's topics (1,371 → 517 lines), so
         nothing is said in two places.

## 9. Packaging: MathScribe in someone else's app

- [ ] **MathScribe as a package** (2026-11-17, Emily): bundled so someone can
      put `<MathScribe />` in their own React app, write plugins of their own or
      install others', and inject them; a published plugin installing itself as
      a package would be nice, with the internals still open to tweaking (a
      module class can be subclassed: `class MyChemistry extends ChemistryModule`).
      Not a rewrite, since a plugin is already a class using one API
      (`src/lib/plugin.ts`) and registering is already a call
      (`registerModules`); to do after the line pipeline:
      1. [ ] Registration as the public way in: `<MathScribe modules={[...defaultModules, MyPlugin]} />`
         and `registerModules`, with MathScribe's own modules exported as
         `defaultModules` (the folder discovery stays for this app's own build).
      2. [ ] A library build (Vite library mode, TypeScript types) with two
         entries: `mathscribe` (the component, registration, the modules) and
         `mathscribe/plugin` (the module API).
      3. [ ] An embeddable `<MathScribe />`: `App.tsx` is a whole page (top bar,
         tabs, files, a global stylesheet, storage keys); it needs props (the
         starting text, `onChange`, options) and its styles scoped to it.
      4. [ ] A plugin package: explicit (import it, pass it in `modules`), or
         self-registering (importing it registers it); later, perhaps, a Vite
         plugin that registers every dependency tagged `mathscribe-plugin`.
      Known limit, to document rather than lift: modules install once per page
      (their grammar, `@` members and lex rules are page-wide, and the line
      cache with them), so several `<MathScribe />` on a page share them, and
      a module can't be uninstalled. Per-instance registries would be a large
      change; not unless it's needed. (Meanwhile, nothing new is made
      page-wide that needn't be: a Calculator takes its line stages from the
      modules it's given.)

## Done

- [x] **A line that read back with text repeated** (2026-11-17, found by the
      tree's round-trip test over the repository): `h({)}` came back as
      `h({)})}`. Inside a call's brackets, chemistry's `{species}` rule read up to
      its closing brace, past the call's `)`, and the rest of the line then read
      the `)}` again. Resolved: the lexer takes a rule's reading only if it stays
      within the span it was given (`withinSpan`, lexer.ts), the unit rules' too;
      otherwise the next rule is tried. No sheet's output changed.

- [x] **`@layout.column(n)`** (2026-11-16): lines side by side in columns. As
      asked: n columns, a blank line starting the next. Then, since the breaks
      already say how many there are, `n` became optional; and each block inside
      is a column of its own, so spacing inside it doesn't matter. Settled: `n` is
      how many a row has (2–4, rounded into that with a warning), wrapping to
      further rows; unsaid, a row has as many as there are, up to 4. With no
      breaks the lines are shared out evenly (2 columns unless `n` says). A
      layout applies within each column (`.column(3).numbered`, the count
      carrying on); in prose two blank lines start a column. Exports: LaTeX
      minipages (not `multicol`, which flows text rather than keeping the
      columns as written), with equations fitted to the column's share of the
      line; Word, a borderless table. The app's long equations in a narrow
      column scroll, as they do anywhere (the app doesn't wrap them yet: see the
      wide-equations item).

- [x] **Headings set apart in the Rendered tab** (2026-11-16): a section or
      subsection heading is a band like a block's header (shaded, the accent
      bar at its left), a subsection's lighter. Only in the app: the exports
      set headings as LaTeX does.

- [x] **Line notes set apart** (2026-11-16): a line's `# note` is a comment on it,
      so it's small and italic in every output: grey italic at 12.5 px in the
      app, `\small\itshape` in its LaTeX `\tag*`, and a point smaller (and grey
      italic) in Word. A block's note, in its title line, stays upright.
      Later the same day: a note (and a `>` text line) shows a name's subscript as a title does
      (`v_f` → v with f below; `$…$` is maths), and @solve's "solving for"
      names the unknown as it's drawn. In LaTeX, a note too wide to sit beside
      its line goes just under it, with room after, so it doesn't look like the
      next line's (`\msnoted`, measured like `\msfit`). And a word-like name in
      a product is set apart with a dot: mass · speed², Fn · m (½ mass after a
      number).
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
