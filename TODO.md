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

- [ ] **Balancing equations**: `balance({C3H8 + O2 -> CO2 + H2O})`, with the
      coefficients usable as mole ratios.
- [ ] **Limiting reagent and yield**: which reactant runs out, theoretical and
      percent yield.
- [ ] **Equilibrium and pH helpers**: ICE tables, pH/pOH, K from concentrations.

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

- [ ] **No placeholder title on untitled blocks**: an untitled `{ }` block
      shouldn't show "Block" as its title; with no title, there's no title line.
- [ ] **Blocks titled as sections**: a block's title written with `#` or `##`
      (`# Kinematics {` … `}`) makes it a numbered section or subsection, taking
      part in the numbering as headings do.
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
- [ ] **How expressions are typeset: brackets, multiplication signs and
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
      them.

## Done

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
