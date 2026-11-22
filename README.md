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

**Theme** (top bar): **System** (Light or Dark, following your computer's
setting), **Light**, **Dark** (blue-grey slate), **Charcoal** (neutral greys, like
a code editor's dark theme) or **Black** (true black). The choice is remembered in
the browser.

**Export** (top bar) opens a dialog to download the sheet as a document:

- **Word** (`.docx`): real Word equations you can edit (not pictures). Notes sit
  at the right margin beside their equation (under it, when the equation is too
  wide to share the line), blocks are cards with a shaded title,
  `@layout.list` / `@layout.numbered` blocks are Word lists, and headings use
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
  Its **Options ▾** menu picks the colour theme.
- **Output** (right), in tabs:
  - **Rendered**: the typeset sheet.
  - **Library**: common equations from first-year physics (kinematics, forces,
    energy and momentum, oscillation, waves and optics, electricity, heat, modern
    physics) and general chemistry (moles and solutions, gases, thermochemistry,
    kinetics), searchable. Each is a one-line function with a worked example;
    **Insert** puts it in the sheet at the cursor (on the cursor's line if it's
    empty, otherwise just below it), where it's ordinary text you can rename or
    change. Temperatures are converted to kelvin on the way in (`T to K`), so
    25.0 degC works.
  - **Reference**: every feature as an example you can copy, shown with its real
    output (each example is evaluated live, so the reference always matches what
    MathScribe actually does), plus the list of built-in constants.

  Its **Options ▾** menu holds the output settings:

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
to have Enter accept a suggestion too, choose *Tab or Enter* under Input → Options →
Accept suggestions with.

| Typing | Suggests |
| --- | --- |
| a name | variables defined above and in scope (not another block's locals), with their value; a function's parameters inside its body; your functions with their parameters (accepting one puts the cursor between the brackets); series names like `t_avg` (once there are two or more `t_1`, `t_2`, …); built-in functions, `pi`/`e`, and keywords |
| `@` | constants with their description and value, including your own `@constants`; `@chem`; and, at the start of a line, `@layout` and `@constants { }` |
| `@chem.` | its elements, with their molar masses, and its functions `mm` and `total` |
| `@layout.`, at the start of a line | the layouts (`text`, `list`, `numbered`, `center`, `titlepage`), `column` and display settings (`hidden`, `sym`, `val`, …); after another dot, the ones not chosen yet |
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
which value is which without counting. Turn them off under Input → Options.

**Parameter hints:** inside a call's brackets, what the function takes appears
above the cursor, the parameter being typed in bold: `E_k(1, ` shows `E_k(n, m
to kg)` with `m to kg` bold. It works for your own functions, MathScribe's `@`
functions and mathjs's.

**Keyboard shortcuts** are listed under Input → Options.

**Syntax colours** (Input → Options → Colours): **Default**, **Vivid**,
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

## Saving

Sheets are plain `.txt` files. Each open sheet has its own **tab** above the
editor: click a tab to switch, × (or a middle-click) to close it, and + for a new
sheet. A dot on a tab means it has changes not yet saved to a file; closing such a
tab asks first. Each tab keeps its own undo history, cursor and scroll position,
and the output always shows the active tab.

The buttons in the top bar act on the active tab:

| Button | Shortcut | Does |
| --- | --- | --- |
| New | | Opens an empty sheet in a new tab |
| Template | | Opens a new sheet started from a template: a lab report (title page, purpose, method, data, calculations, results, discussion, conclusion) or a problem set, each with a little of every section filled in to write over |
| Open | Ctrl/⌘ + O | Opens one or more sheets (select several in the dialog), each in its own tab; a file that's already open is switched to instead |
| Save | Ctrl/⌘ + S | Formats the sheet and saves it to the current file, or asks where the first time |
| Save as | Ctrl/⌘ + Shift + S | Formats the sheet and saves it to a new file |

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

**Create** (in the top bar) has an AI model write a sheet for you: a test, an
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
end, which starts by defining the question's values; add `#hide` to a solution
block's first line to hide it. The dialog remembers your last choices.

## Syntax

**The full reference is [docs/REFERENCE.md](docs/REFERENCE.md):** every topic, how
each thing is written, what it does, its rules, and an example of each, made from the
same source as the app's Reference tab (so it's always as MathScribe is). What
follows here is a guide, with more on why and how.

**In this section:** [Greek letters](#greek-letters) ·
[Built-in functions](#built-in-functions) · [Vectors](#vectors) ·
[Tuples](#tuples-and-coordinates) · [Units](#units) ·
[Significant figures](#significant-figures) · [Uncertainty](#uncertainty) ·
[Constants](#constants) · [Chemistry](#chemistry) ·
[Solving equations](#solving-equations) · [Series](#series-sums-means-and-counts) ·
[Tables](#tables) · [Plots](#plots) ·
[Selections](#selections-and-names-with-a-dot) ·
[Importing data](#importing-data-csv)

A sheet is lines, worked out from top to bottom: calculations (`F = m * a`),
headings (`# Title`), prose (`> Some text`, with `{{name}}` for a value), comments
(`// …`), and blocks (`Title {` … `}`). Display commands after a line (`#val`,
`#multiline`) say how much of it to show. The reference has each, with the rules for
writing it: [Basics](docs/REFERENCE.md#basics) and
[Display commands](docs/REFERENCE.md#display-commands) first, then
[Functions](docs/REFERENCE.md#functions) and [Layout](docs/REFERENCE.md#layout) (blocks that
arrange lines: lists, centred lines, prose, a title page, columns).

### Greek letters

Names can be spelled out (`theta`, `mu_k`, `Delta`), shown as θ, μ_k and Δ, or use
the Greek letters themselves. A letter typed into a name stays part of it, so
`ΔE` is a variable of its own, shown ΔE:

```
ΔE = E_f - E_i        # ΔE = E_f − E_i
Δv_x = v_2 - v_1      # Δv_x = …
ω = 2 * pi * f        # ω = 2πf
```

- **Typing one:** type `\` and the letter's name, then Tab or a space: `\Delta`
  gives Δ, and `\omega` gives ω. As in LaTeX, the space ends the name, so
  `\Delta E` types ΔE (type another space for a space). The suggestion list shows
  the letters as you type `\de…`. Every letter with a LaTeX name works (α to ω,
  and Γ, Δ, Θ, Λ, Ξ, Π, Σ, Υ, Φ, Ψ, Ω).
- This happens where names are typed, not in headings, `>` text, `@latex` blocks, notes
  or `$…$` maths, where `\Delta` is LaTeX and stays as typed.
- `ΔE` and `Delta E` (with a space) are different: the first is a variable, the
  second is E's uncertainty (see Uncertainty). Both are shown ΔE.
- A sheet with Greek letters is saved as UTF-8, like any other text file.

### Built-in functions

Everything mathjs supports works: `sqrt`, `sin`/`cos` (accepting `deg`), `log`,
`exp`, `abs`, constants `pi` and `e`, matrices `[1, 2; 3, 4]`, and so on.

- `pi`, `e` and the other built-in constants stay as symbols in substitution steps.
  A variable or function argument made only of numbers and these constants keeps its
  symbolic form too: after `theta = pi/4`, `sin(theta)` shows `sin(π/4)`.
- `sin`, `cos` and `tan` of exact angles give exact answers: `sin(pi)` is 0 and
  `sin(30 deg)` is 0.5, not 1.2 × 10⁻¹⁶ and 0.49999999999999994.
- Built-in constant names aren't taken over by series: with `e1`, `e2` defined, `e`
  is still Euler's number (`e_avg` still averages the series).
- Note that `phi` and `tau` are also built in (the golden ratio and 2π), so define
  them before using them as your own variables.
- `atan2(y, x)` also takes coordinates with units, as long as they match
  (`atan2(1.0 m, 2.0 m)`).

### Vectors

`<…>` makes a **vector**, shown in angle brackets. A unit after the `>` applies to
every component:

```
F = <3.0, 4.0> N                 # ⟨3.0, 4.0⟩ N
G = 2 * F + <1.0, -1.0> N        # ⟨7.0, 7.0⟩ N
mag = norm(F)                    # 5.0 N
```

- A vector is a tuple (below), so everything that works on tuples works on it:
  scaling, adding, `to`, `norm`, `dot`, `cross` and unpacking. `@vector(…)` is the
  same as `<…>`.
- What's worked out from a vector is a vector too, and so is a function's result
  when its body writes one (`f(x) = <x, 2*x>`). A plain tuple stays a tuple.
- Each typed component keeps its own sig figs: `<0.50, -9.81>` shows as typed.
  What's worked out from it has the fewest sig figs of its components, as with
  tuples.
- `<` only starts a vector where a value can start (after `=`, `(`, a comma or an
  operator) and when there's a comma inside, so `a < b` is still a
  comparison.
- **`:ijk`** shows a vector with unit vectors: `v:ijk = <2.0, -1.5, 4.0> m/s` shows
  (2.0 î − 1.5 ĵ + 4.0 k̂) m/s. Vectors worked out from it are shown that way too, and
  it works on a function's result (`f(x):ijk = …`).
- **`:xyz`** also stores each component as a variable of its own, shown under the
  vector: `a:xyz = <0.50, -9.81> m/s^2` adds a_x = 0.50 m/s² and a_y = −9.81 m/s²
  (and a_z for a 3D vector). It combines with the other settings (`F_net:3:ijk:xyz`),
  and works inside function bodies. With `#sym`, the components are made but not
  shown.

### Tuples and coordinates

`@tuple(…)` makes a **tuple**, such as a point's coordinates. It's shown in
brackets, as coordinates usually are:

```
r = @tuple(1.00 m, 2.00 m, 3.00 m)   # (1.00, 2.00, 3.00) m
s = 2 * r                            # (2.00, 4.00, 6.00) m
d = norm(r)                          # 3.74 m
```

- A unit shared by every value is written once, after the bracket; values with
  different units each keep their own: (1.41 m, 45.0°).
- Tuples scale, add and convert with `to`; `norm` gives the length, and `dot` and
  `cross` work on them. A display unit (`r:cm = …`) applies to every value.
- A function can return a tuple: `to_cart(r, th to rad) = @tuple(r*cos(th), r*sin(th))`.
- **Unpacking:** `@tuple(a, b, c) = …` stores each value of a tuple as a variable
  of its own, shown as (a, b, c) = (1.00, 2.00, 3.00) m. The right-hand side can be
  any tuple, such as a function's result: `@tuple(r, theta) = polar(x, y)`. It works
  inside function bodies too.
- Each name takes the same settings as a single assignment, sig figs and a unit
  in any order: `@tuple(r:3, theta:deg) = polar(x, y)` shows (1.41 m, 45.0°), and
  `r` and `theta` keep those settings afterwards.
- A bracketed list with commas on its own, like `(1, 2)`, is an error that points
  to `@tuple(1, 2)`, so brackets only ever mean grouping or a function call.
- For now, uncertainties don't carry into a tuple's values.

### Units

A unit written right after a number is always a unit, even if a variable has the
same name: after `m = 2.0 kg`, `d = 3.5 m` is still 3.5 metres. Compound units are
written without spaces (`9.81 m/s^2`, `kg*m^2`). To multiply a number by a
variable whose name is also a unit, use `*`: `1/2 * m * v^2`, not `1/2 m v^2`.
A warning is shown when a line looks like that mistake.

**Micro:** write the µ prefix as `u` (`5.0 um`, `2.0 uF`, `3.0 us`), or type µ or μ
(`5.0 µm`); it's shown as µ either way. (μ on its own is still a name, such as a
friction coefficient.)

- **A value you type keeps its unit** wherever it's shown later: `m = 9.11e-31 kg`
  stays in kg and `L = 1.00e-10 m` in m, in later lines and function working.
- **Computed results are shown in tidy units:** `N/kg` becomes `m/s^2`, `kg m/s^2`
  becomes `N`, `Å² · Å⁻³` becomes `Å⁻¹`, and a sensible prefix is chosen
  (`3.0 km`, `5.00 mm`). Prefixes beyond pico and tera (ronto, zepto, exa, …) are
  never used; such values stay in their own unit in scientific notation. A single
  unit with a fractional power, like `Å^-1.5`, is kept as it is.
- Use `to` to choose a unit yourself. A variable defined with `to` (`a = @a_0 to
  angstrom`) keeps that unit.
- Ångström is written `angstrom` (shown as Å); `A` is the ampere.
- **Percentages:** `… to percent` shows a unitless result ×100 with a % sign, with
  its sig figs and uncertainty: `shell = P * dr to percent` → 0.95 %. The variable
  stores the fraction (0.0095), so later lines calculate with it correctly. A value
  that still has units (like a probability density in Å⁻¹) can't be a percentage
  and gives an error.

### Significant figures

With **Sig figs: Auto** (the default, in the Output options), every value keeps the
significant figures it was written with, and computed results are rounded by the
usual rules:

| Situation | Rule | Example |
| --- | --- | --- |
| Measured value | counted as typed | `2.00 kg` → 3, `0.0250 m` → 3, `1.2e3 N` → 2 |
| Exact number | never limits a result | the `2` in `2 * a * d`, the `1/2`, `n = 3` |
| × ÷, powers, functions | fewest sig figs among the inputs | `2.00 kg * 9.81 m/s^2` = 19.6 N |
| + − | least precise decimal place | `12.52 m + 3.1 m` = 15.6 m |

- A number is **measured** if it has a unit or is written with a decimal point or
  exponent. Integers without a unit are **exact**.
- **Exponents written as plain numbers** (`^0.5`, `^(3/2)`, `^(-0.5)`) are part of
  the formula, not measurements, so they never limit the result; only the base does.
- **Zeros:** a measured zero counts by decimal places (`0.00` shows as 0.00), and a
  zero passed to a function doesn't limit it: `cos(0.00°)` is 1, known far better
  than 2 sig figs.
- Trailing zeros in whole numbers don't count (`300 m` has 1 sig fig). Write `300. m`
  or `3.00e2 m` if they do; a warning points these out.
- Values are kept at full precision and only rounded for display, so rounding
  doesn't build up across steps. The substitution step shows each variable rounded
  to its own sig figs.
- Trailing zeros that count are shown with a decimal point, the same notation as
  input: 19.6 at 2 sig figs shows as `20.` and 90° as `90.°`, not 20 or 90. Where a
  decimal point can't show the precision (1500 to 3 sig figs), the result uses
  scientific notation: 1.50 × 10³.
- Results of exact inputs aren't limited by sig figs (`1/3 ≈ 0.333333`); write
  `name:3 = …` to choose.

Pick a number instead of Auto to show every result to that many sig figs.

#### Declaring a variable's sig figs and unit

Add `:n` to the name being assigned to set its sig figs yourself, instead of counting
them from how the value is written. Add `:unit` to show (and keep) the value in that
unit; the two combine in either order:

```
phi:3:deg = atan(y/x)   # 26.6°: an angle from atan, asin or acos counts as radians
d:km = 1500. m * 2      # 3.000 km
f:percent = 0.25        # 25 %
```

A unit that doesn't fit is an error ("3.0 m can't be shown in deg"); a plain number
can only be given an angle unit this way. Uncertainties are converted too. The sig
figs work as follows:

```
m:4 = 2 kg          # m = 2.000 kg
n:3 = 1.999 kg      # shown as 2.00 kg; calculations use 1.999
F:2 = m * a         # a computed result, limited to 2 sig figs: 20. N
k:exact = 2.5       # exact: never limits a result
```

- Later lines count the variable as having that many sig figs. Its value is kept at
  full precision; only the display and the sig-fig count change.
- A declared variable keeps its sig figs even when the sig-fig setting is a fixed
  number instead of Auto (on its own line and in substitutions).
- It applies to that assignment; a later `m = …` without `:n` counts as written again.
- If the value has a `pm` uncertainty, the uncertainty sets its precision and `:n` is
  ignored, with a warning.
- Only on the left of `=`: inside expressions, `:` means something else to the
  calculator (a range, as in `1:4`). It works in blocks, function bodies, `@constants`
  and with `solve` (`d:3 = @solve(…, d)`).
- A function's result takes its sig figs from its expression, so a measured number
  in it carries through to the calling line.

#### Scientific or decimal notation

By default a number is written as plain digits, switching to scientific notation for
very large or small values, or where plain digits can't show the precision (19600 to
3 sig figs is 1.96 × 10⁴). `:sci` and `:dec` on the name choose for that variable:

```
N:sci = 1500. * 12.0     # 1.80 × 10⁴
L:dec = 5.32e-7 m        # 0.000000532 m
x:3:sci:km = 2500. m     # combines with sig figs and a unit, in any order
```

- `:sci` always uses a power of ten (but not × 10⁰: 2.50 stays 2.50); `:dec` never
  does, even where trailing zeros then can't show the precision (19600).
- The variable keeps its notation wherever its value is shown: in substitutions,
  on a line of its own, `x to km`, `delta x`, and in a value assigned straight from
  it (`y = x`).
- It works with uncertainties ((1.50 ± 0.02) × 10³ m), tuples and their unpacked
  names (`@tuple(a:sci, b) = …`), and a function's result (`f(x):sci = …`).
- For a line with no name, such as `psi_4^2`, or a whole block, use the `#sci` and
  `#dec` commands (see [Display commands](docs/REFERENCE.md#display-commands)).

### Uncertainty

Give a value an uncertainty with `pm` (or `±`, `+-`):

```
m = 2.0 kg pm 0.1 kg        # (2.0 ± 0.1) kg
t = (1.50 pm 0.02) s        # same thing, bracketed
d = 3.50 m pm 0.05          # uncertainty takes the value's unit
L = 2.00 m pm 1%            # relative uncertainty
```

- Values without `pm` have zero uncertainty.
- Any result computed from uncertain values shows `±` automatically, combined in
  quadrature: Δf = √(Σ (∂f/∂x · Δx)²). This works through any formula, including
  functions like `sin` and `sqrt`, and through blocks.
- Correlations are tracked: each `pm` is a separate source, so in `F = m * a`
  followed by `G = F / m`, the uncertainty in `m` cancels correctly instead of
  being counted twice, and `m - m` has no uncertainty.
- `delta F` or `Delta F` is the uncertainty of F, shown as δF or ΔF to match what
  you typed. On its own line (`delta F` or `delta F =`) it shows the working: the
  quadrature formula, the partial derivatives, and the values substituted in, using
  the same letter throughout. It can be used in expressions, e.g. `delta F / F` for
  the relative uncertainty; results like that don't carry a `±` themselves.
- `delta` and `Delta` only mean "uncertainty of" when followed by a defined
  variable. Otherwise they are the Greek letters δ and Δ, usable as variable names
  (`delta = 5 deg`). To multiply δ by a variable, write `delta * x`.
- Rounding: computed uncertainties are quoted to 1 sig fig (2 if they start with a
  1) and the value is rounded to the same decimal place, e.g. (20 ± 1) N. Declared
  uncertainties keep the precision you typed. With a fixed sig-fig setting,
  uncertainties are shown to 2 sig figs.

The working's derivative step is skipped when the formula contains a unit written
inline (`m * 9.81 m/s^2`) or a user-defined function; the general formula and the
result are still shown. It is also skipped when the inputs share an uncertainty
source, since the simple formula assumes independent inputs; the result still
accounts for the correlation.

### Constants

Physical constants start with `@` (the elements' molar masses are in `@chem`; see Chemistry):

| Write | Value used | Sig figs |
| --- | --- | --- |
| `@c` | 3.00 × 10⁸ m/s | 3 (the default) |
| `@c:5` | 2.9979 × 10⁸ m/s | 5 |
| `@c:exact` | 299792458 m/s | every digit; never limits a result |

```
w = m * @g                       # g = 9.81 m/s²
E = @h * @c / 532 nm to eV       # 2.33 eV
V = n * @R * T / @atm to L
```

- The rounded value counts as a measured value with that many sig figs, as when a
  problem says "use g = 9.81 m/s²".
- **Set a constant's precision and unit for the whole sheet** with a line that's
  just the constant: `@c:4`, `@g:exact`, `@a_0 to angstrom` or `@a_0:3 to angstrom`.
  Every plain `@c` in the sheet then uses 4 sig figs (every `@a_0` is 0.529 Å),
  including lines above the declaration and constants defined from it. The
  declaration line shows the value it sets. A use with its own `:n` still wins, and
  a second declaration for the same constant is ignored with a warning.
  Declarations can also go inside an `@constants { }` block.
- Constants carry units, so conversions just work (`@R` in J/(mol·K) gives litres
  when you ask `to L`).
- A mistyped name suggests the closest one: `@kb` → "Did you mean @k_B?"
- `@e` is the elementary charge and `@g` standard gravity; they don't clash with
  Euler's `e`, grams, or a variable of your own called `g`.

Built-in constants (CODATA 2018; "exact" means exact by definition in the SI). The
Reference tab lists them too:

| Name | Constant | Name | Constant |
| --- | --- | --- | --- |
| `@c` | speed of light (exact) | `@G` | gravitational constant |
| `@h` | Planck constant (exact) | `@g` | standard gravity, 9.80665 m/s² (exact) |
| `@hbar` | reduced Planck constant | `@k_e` | Coulomb constant |
| `@e` | elementary charge (exact) | `@epsilon_0` | vacuum permittivity |
| `@k_B` | Boltzmann constant (exact) | `@mu_0` | vacuum permeability |
| `@N_A` | Avogadro constant (exact) | `@m_e`, `@m_p`, `@m_n` | electron, proton, neutron mass |
| `@R` | molar gas constant | `@u` | atomic mass unit |
| `@F` | Faraday constant | `@a_0` | Bohr radius |
| `@atm` | standard atmosphere, 101325 Pa (exact) | `@sigma` | Stefan–Boltzmann constant |
| `@V_m` | molar volume at 0 °C, 1 atm | | |

#### Your own constants

Define constants in an `@constants { }` block and use them anywhere in the sheet as
`@name`, even above the block:

```
@constants {
    rho_w = 998 kg/m^3                   # water at 20 °C
    g_lab = 9.807 m/s^2 pm 0.002 m/s^2   # measured in the lab
}
P = @rho_w * @g * 0.250 m to kPa
```

- Your constants default to the precision you wrote them with (`998` has 3 sig figs,
  `9.807` has 4); `:n` and `:exact` work the same as for built-ins.
- They can use units, other constants, and `pm` uncertainties, which carry through
  wherever they're used. They can't use the sheet's ordinary variables, since they're
  worked out before the rest of the sheet.
- A constant of yours with the same name as a built-in takes its place.

### Chemistry

**Formulas** go in single braces, anywhere text is: in `>` lines, `#text` blocks,
headings, block titles and display names. On a line of their own they're a
reaction, displayed but not worked out:

```
> The {Na^+} concentration was {{c_Na}}.        → The Na⁺ concentration was 0.466 M.
## Moles of {Ca^2+} and {Mg^2+}
{OH^-(aq) + H3O^+(aq) -> 2 H2O(l)}              → OH⁻(aq) + H₃O⁺(aq) → 2 H₂O(l)
```

Inside the braces: counts as digits (`H2O`), a charge after `^` (`Ca^2+`, `OH^-`; `Na+`
works too), a state in brackets (`(aq)`), a coefficient before the formula (`2 H2O`),
arrows (`->`, `<=>`), and a hydrate's dot as `*` (`CuSO4*5H2O`). Two braces, `{{…}}`,
is still a value. Formulas are drawn with mhchem, so the LaTeX export loads it
(only when the sheet has formulas) and the Word export gets proper chemistry.

**Molarity:** `M` is mol/L, with `mM` and `µM`: `c = 0.100 M`. A worked-out
concentration is shown in M (0.200 M, not 200 mol/m³). `MPa` is still megapascals,
and `M` is still free as a variable name (a molar mass), since a unit only counts
right after a number.

**Species:** `{formula}` after a value says what it's of. What it qualifies follows
from the value's unit, by one fixed rule:

| The value's unit | `{H2O}` makes it | Example |
| --- | --- | --- |
| a mass | a mass of H2O | `5.00 g {H2O}` |
| an amount (mol, M) | an amount of H2O | `0.278 mol {H2O}`, `0.100 M {NaOH}` |
| mass / volume | a mass concentration of H2O | `2.0 g/L {H2O}` |
| mass / amount | a molar mass of H2O: a mass of it per amount of it | `18.02 g/mol {H2O}`, `(18.02 g / 1 mol) {H2O}` |
| no mass or amount | an error | `5.0 m {H2O}` |

It can follow a unit, a bracket or a name (`n_1 {H2O}`). A value that's already of a
species can't be given another: going from one species to another is a mole ratio.

```
n_EDTA = 2.755e-4 mol {EDTA}
q = (1 mol {X}) / (1 mol {EDTA})          # a mole ratio, from the reaction
n_X = n_EDTA * q                          → 2.755 × 10⁻⁴ mol X   (EDTA cancels)
c = 0.100 M {NaOH}
n = c * 17.10 mL                          → 0.00171 mol NaOH
NaOH = @chem.substance({NaOH})
m = 5.00 g {NaOH}
n_2 = m / NaOH.M                          → 0.125 mol NaOH       (a mass of NaOH over g NaOH/mol NaOH)
m_2 = n_2 * NaOH.M                        → 5.00 g NaOH
```

- Each species is part of the unit, so species cancel as units do, and amounts of
  different species can't be added or compared (mol Na⁺ + mol Cl⁻ is an error, like
  metres + seconds). `to` keeps the species: `n to mmol` is 1.71 mmol NaOH.
- **Species are strict.** Once a calculation has species, every mass, amount and
  molar mass in it needs one: `5.00 g / NaOH.M` and
  `5.00 g {NaOH} / (40.00 g/mol)` are errors (give the mass, or the molar mass, its
  species). Going from one species to another without a mole ratio is an error too:
  `5.00 g {HCl} / NaOH.M` says it mixes species. Calculations without any
  species work as before.
- A whole number of a species, written without a decimal point (`1 mol {X}`,
  `6 mol {X}`), is a coefficient from a balanced equation, so it's exact and never
  limits the sig figs. `1.00 mol {Na}` is a measurement. `1 mol` on its own, as in a
  molar mass (`18.02 g / 1 mol`), is exact too.
- To add amounts of different species on purpose (the total moles of ions), use
  `@chem.total`, which adds them as plain amounts:

  ```
  n_Na = 0.100 mol {Na^+}
  n_Cl = 0.200 mol {Cl^-}
  n = @chem.total(n_Na, n_Cl)             → n = n_Na + n_Cl = 0.100 mol Na⁺ + 0.200 mol Cl⁻ = 0.300 mol
  ```

  It still only adds amounts to amounts (or masses to masses): `@chem.total(n_Na, 2.0 g)` is an error.

**Substances:** `@chem.substance({formula})`, named on a line of its own, is a
substance: its molar mass, an amount of it, and what follows from the two, each a
member. Until an amount is set it's 1 mol, so its elements' members are per mole.

```
H2SO4 = @chem.substance({H2SO4})   → M = 2M_H + M_S + 4M_O = … = 98.07 g H₂SO₄/mol H₂SO₄
H2SO4.H.n                          → 2 mol H         (in 1 mol of H₂SO₄)
H2SO4.n = 2.00 mol                 → sets its amount
H2SO4.H.n                          → n = 2.00 mol H₂SO₄ × 2 mol H / 1 mol H₂SO₄ = 4.00 mol H
H2SO4.m                            → m = n M = 2.00 mol H₂SO₄ × 98.07 g/mol = 196 g H₂SO₄
H2SO4.H.w                          → w = m_H / m = 4.03 g / 196 g = 0.0206
H2SO4.m = 5.00 g                   → sets it again: its amount follows from the mass
```

| Member | What it is |
|---|---|
| `X.M` | its molar mass, the sum of its elements' (g X over mol X, stacked) |
| `X.n` | its amount: 1 mol until set |
| `X.m` | its mass, n × M |
| `X.E.n` | an element's amount in it: its count × n |
| `X.E.m` | that element's mass, E.n × E.M |
| `X.E.M` | the element's molar mass |
| `X.E.w` | the element's mass fraction, E.m / m |

- Any amount or mass can be set, the substance's or an element's (`H2SO4.n = 2.00 mol`,
  `H2SO4.m = 5.00 g`, `H2SO4.O.m = 1.00 g`): its amount is worked out from it, and every
  member from that, from that line on, as a variable assigned again is. A value with
  no unit is read as mol (an amount) or g (a mass); one already of a species, as from
  a mole ratio (`H2O.n = H2.n * r.H2O / r.H2`), is used as it is. The molar masses and
  mass fractions follow from the formula, so they can't be set.
- A member on a line of its own shows how it's worked out, back to what was set. In a
  calculation (`x = 2 * H2SO4.m`) it's a value like any other.
- Its members are drawn as chemistry: H2SO4.m is m with H₂SO₄ below it, and
  H2SO4.H.n is n with H, H₂SO₄ below it.
- Atomic weights are IUPAC's abridged standard atomic weights (2021), with the digits
  IUPAC gives as their sig figs (Na 22.990, Cl 35.45). An element with no stable
  isotope (Tc, Pm, Po, …) has the mass number of its longest-lived isotope. The molar
  mass's sum follows the addition rule from them.
- The formula is written as in the rest of the sheet: counts as digits, groups in
  brackets (`Ca(OH)2`, `K4[Fe(CN)6]`), a hydrate's water after `*`. A charge or state
  (`{SO4^2-}`, `{NaCl(aq)}`) doesn't change the molar mass, but it's part of the species,
  as written. Symbols are case-sensitive: `{Co}` is cobalt, `{CO}` carbon monoxide.
- In a formula of parts joined by `*`, a number written right against a part is how
  many of that part, the first as well as the others: dietzeite,
  `{7Ca(IO3)2*8CaCrO4}`, is 7 Ca(IO3)2 and 8 CaCrO4 (3977.7 g/mol).
- A substance is one formula, without a count in front: to work with 2 mol of water,
  set `H2O.n = 2`.
- A mass worked out from grams stays in grams (mol × g/mol is 5.00 g, not 0.00500 kg).

**Species names:** name a species once, and use the name wherever braces take a
formula: after a value, in a substance, in reactions, in prose and headings.

```
@chem.species {
    dietzeite = {7Ca(IO3)2*8CaCrO4}
    edta:formula = {EDTA^4-}             # shown by its formula
}

D = @chem.substance({dietzeite})
D.m = 5.00 g                             → 5.00 g dietzeite
D.n                                      → 0.00126 mol dietzeite
m_2:formula = 5.00 g {dietzeite}         → 5.00 g 7Ca(IO₃)₂·8CaCrO₄
> A {dietzeite} sample.                  → A dietzeite sample.
```

- A name is its formula: `{dietzeite}` and `{7Ca(IO3)2*8CaCrO4}` are the same species,
  so they cancel. Names apply to the whole sheet, above the block too. One can be
  named on a line of its own: `@chem.species dietzeite = {7Ca(IO3)2*8CaCrO4}`.
- A species is shown by its name, unless it's declared `:formula`. A line can say
  either, as a setting on its name: `m:formula = …`, `n:name = …`. In a reaction, it's
  drawn by its formula, and its member is the name: `r.dietzeite`.
- A name can't be something braces already read: a formula (`CO` is carbon
  monoxide), an electron (`e`) or a state (`aq`, `s`, `l`, `g`). What it names
  needn't be a formula: `{EDTA}` is a species too.
- Typing `{` suggests your names; hovering over one shows its formula.

**Reactions and stoichiometry:** a balanced reaction, named on a line of its own,
has each species' coefficient as a member, an exact amount of it, so a mole ratio is
one member over another:

```
r = @chem.reaction({2 H2 + O2 -> 2 H2O})   → checked: balanced; r.H2 = 2 mol H2, r.O2 = 1 mol O2, r.H2O = 2 mol H2O
H2 = @chem.substance({H2})
H2O = @chem.substance({H2O})
H2.m = 4.00 g                              → its amount, 1.98 mol H2
H2O.n = H2.n * r.H2O / r.H2                → 1.98 mol H2O
H2O.m                                      → 35.7 g H2O
n_H2O = H2O.n                              → n_H2O is drawn n with H₂O below it
```

- A name's subscript that's a formula, of two or more characters of element symbols
  and counts (`n_H2`, `n_H2O`, `c_NaCl`), is drawn as chemistry, H₂O. A single letter
  (`F_N`, `T_C`) or labels that aren't elements (`v_AB`) stay as they are.
- It's checked atom by atom, and by charge: `{H2 + O2 -> H2O}` says O has 2 on the
  left and 1 on the right. Electrons in a half-reaction are `e^-`
  (`{Fe^3+ + 3 e^- -> Fe}`). The arrow can be `->`, `<=>`, `<->` or `=`.
- A species whose formula isn't a name is a member by its letters and digits:
  `Ca(OH)2` is `r.CaOH2`, `Na^+` is `r.Na`.

**Display names:** a name can be shown as words instead, with a setting in quotes on
the name being assigned:

```
V_s = 25.00 mL
n_Na:"Moles of {Na^+}" = n_H3O - 2 * n_X
n_Ca:"Moles of {Ca^2+} in {{V_s}}" = n_X / 6
c_Ca:"[{Ca^2+}]" = n_Ca / V_s
```

It's shown that way wherever the variable is: on its own line, in later
substitutions, and in both exports. It can hold formulas and values; a value in it is
the one when the variable was defined, so the name always says what it was worked
out from. It combines with the other settings (`n:3:"Moles":sci = …`).

Subscripts work as in names and headings: `m:"Mass of m_ball" = …` shows "Mass of
m" with "ball" as a subscript; `x_{max}` takes a longer one, `F_net_x` shows net,x,
and `\_` is a plain underscore. A subscript that starts with a capital letter is a
formula, drawn as chemistry: `m_{H2O}` shows m with H₂O below, `c_{Na^+}` c with
Na⁺ (the same in headings and block titles). `$…$` is inline maths, for anything more.

**Display-name templates:** for display names that follow a pattern, define a
template once, a one-line function whose body is words in quotes with `{{x}}`
where each argument goes, and use it as the setting:

```
massName(x) = "m_{{x}}"
m_w:massName(H2O) = 18.02 g          → m with H₂O below
m_s:massName(NaCl) = 5.85 g          → m with NaCl below
conc(ion) = "[{{{ion}}}]"            → braces around {{ion}} make it a formula
c_Na:conc(Na^+) = 0.100 M            → [Na⁺]
```

- Arguments are text, taken as written, not worked out; separate them with commas.
- A `{{name}}` that isn't a parameter is a value, as in any display name.
- The template's own line shows its words with each parameter in its place.
- It combines with the other settings (`m:3:massName(Na) = …`).

### Solving equations

`@solve(equation, unknown)` rearranges an equation for the unknown and evaluates it:

```
d = @solve(v_f^2 = 2*a*d, d)
```

shows the equation, then the rearranged formula, the values and the answer:

```
v_f² = 2·a·d                                   (solving for d)
d = v_f²/(2·a) = (5.86 m/s)²/(2 · 4.91 m/s²) = 3.50 m
```

- The result is an ordinary formula, so units, sig figs, uncertainty and `#sym`/`#val`
  all work as usual.
- `@solve(…)` is the whole right-hand side, optionally followed by a conversion:
  `theta = @solve(sin(theta) = 0.500, theta) to deg`. Without an assignment
  (`@solve(v^2 = 2*a*d, d)` on its own) it shows the answer without storing it.
- The unknown is solved for even if it already has a value; assigning the result
  replaces it.

How it solves:

1. **Rearranging**, when the unknown appears once: each operation around it is
   undone (+/−, ×/÷, powers and roots, sin/asin, exp/ln, …).
2. **Collecting terms**, when the equation is linear in the unknown (`3k + 2 = k + 10`).
3. **The quadratic formula**, when it's quadratic (`h = v₀t + ½gt²` gives
   `t = (√(v₀² + 2gh) − v₀)/g`).
4. **Numerically**, from a starting guess, for anything else:
   `x = @solve(x = cos(x), x, 0.5)`. The guess also sets the answer's units
   (`@solve(…, T, 300 K)`). The uncertainty still propagates.

**Several unknowns:** put the unknowns in a `@tuple(…)` on the left and give as many
equations:

```
@tuple(v_1, v_2) = @solve(m_1 * u = m_1 * v_1 + m_2 * v_2, u = v_2 - v_1)
@tuple(T, a) = @solve(T - m_1 * @g = m_1 * a, m_2 * @g - T = m_2 * a)
```

- They're solved by substitution, as by hand: one equation is rearranged for one
  unknown, which is put into the others, until one unknown is left in known values;
  then each is worked out in turn. The working shows the equations, then each
  unknown's formula, values and result, and the line ends with them all:
  (v₁, v₂) = (−2.0 m/s, 4.00 m/s).
- Each unknown is an ordinary variable afterwards, with its units, sig figs and
  uncertainty. Settings go on the names, as when unpacking: `@tuple(T:3, a:2) = …`.
- Each step must be a rearrangement the single-equation solve can do (the unknown
  appears once, or in a linear or quadratic way); of a quadratic's two solutions,
  the first is used. Equations that contradict each other, or say the same thing
  twice, have no single solution and give an error.

When there's more than one solution (from x², √, sin, cos, |x| or a quadratic), the
principal or positive one is used and the others are noted below the line. Give a
guess (`@solve(…, x, -1)`) to choose the solution nearest it.

Angles from asin, acos and atan are in radians; add `to deg` for degrees.

`to percent` isn't supported on a `solve` line yet.

### Series: sums, means and counts

Numbered variables form a series. Define `t1`, `t2`, `t3`, … (or `t_1`, `t_2`, …;
either spelling finds a value defined with the other) and these names become
available:

| Name | Value | Shown as |
| --- | --- | --- |
| `t` | sum of the series | t = Σ tᵢ |
| `t_avg` (or `t_mean`) | mean, ± the standard error σ/√n | t̄ |
| `t_std` | sample standard deviation σ (n − 1) | σₜ |
| `t_sem` | standard error of the mean, σ/√n | σ with t̄ subscript |
| `t_count` | number of values | nₜ |

- Typing one of these on its own line shows the working: Σ notation, the members,
  and their values.
- They're recomputed every time they're used, so adding `t6` later (or inside a
  block) is picked up automatically.
- A variable you define yourself with the same name takes precedence: after
  `t = 9.0 s`, `t` means that, though `t_avg` is still the series mean.
- The **sum** carries the members' own `pm` uncertainties, propagated in
  quadrature. The **mean**'s uncertainty is the standard error σ/√n, from the
  spread of the values; members' individual `pm` values aren't added to it. With
  only one value, the mean is just that value. `delta t_avg` shows the σ/√n working.
- Every use of a series mean shares one uncertainty source, so using `t_avg` twice
  in a formula is correctly treated as correlated.
- Members must all have compatible units. Results are shown in the first member's unit.
- A name that only matches one numbered variable still forms a series: if a block
  defines `psi_200` and you write `psi`, it means that one-member series. Check the
  name if a value appears where you expected an "undefined" error.

**A series on one line:** `@series(…)` makes one without a line per value, either
listing its values or working them out row by row from other series:

```
t = @series(1.52 s, 1.48 s, 1.55 s)   # t_1, t_2, t_3: t = (1.52, 1.48, 1.55) s
m = @series(F / g)                    # m_i = F_i / g, for every row of F
v = @series(d / t)                    # row by row from two series: v_3 = d_3 / t_3
v = @series(d / t; rows 5-20)         # only those rows
```

- Each value is worked out as if it were typed on a line of its own (`t_2 = 1.48 s`),
  so units, sig figs, `pm` uncertainties and settings on the name
  (`m:3 = @series(F / g)`) work as they do anywhere.
- In a rule, a name that's a series stands for that row's value; any other name
  is used as it is. `g`'s uncertainty goes into every `m_i` from one source, so
  `m_avg` treats them as correlated.
- A series worked out from others keeps their row numbers: `v_5` comes from `d_5`
  and `t_5`, so `@table(d, t, v)` lines up. It has the rows every series it uses
  has; if they don't all have the same rows, a warning says which has how many,
  and `; rows …` chooses the rows yourself.
- Making a series again replaces it: `t = @series(5.0 s, 6.0 s)` after a
  three-value `t` leaves just `t_1` and `t_2`.
- The line shows the values (the first three and last two of a long series) and
  how many there are; `#sym` shows just the rule, `#val` just the values. Use
  `@table(t)` to see them all.

**A call over several lines:** a line that leaves a `(` or `[` open carries on
over the lines after it, up to the one that closes it, so a long `@series`,
`@table`, `@plot` or `@select` (or any call, or a matrix) can list one thing a line:

```
t = @series(
    1.52 s,
    1.48 s,
    1.55 s,
)
@table(
    t,
    x,
    v = x / t;
    rows 5-20
)
```

- The lines inside are indented further than the first; the closing bracket can
  be under the first line. A blank line, or one not indented further, ends it.
- A trailing comma before the closing bracket is fine.
- `#commands` and notes can go on any of its lines, as if it were one.
- Ctrl+Shift+F (and Save) lays it out like this.

### Tables

`@table(…)` on a line of its own shows series side by side, one row per number:

```
@table(t, x)              # 1, 2, … down the side | t [s] | x [m]
@table(t, x, v = x / t)   # adds a column v, worked out row by row
v_avg                    # v is a series now: v_1, v_2, …

salts = @series("{KCl}", "{KBr}", "{KI}")
@table(t, x; labels salts)   # KCl, KBr, KI down the side instead of 1, 2, 3
```

- A name is a series' values. A unit every value shares goes in the header; a
  value with an uncertainty shows as 3.0 ± 0.1; a row a series doesn't have shows —.
- `name = expression` works out a column row by row: each series in it stands for
  that row's value (`x / t` is x₃ / t₃ in row 3), and any other name is used as it
  is (`h = 1/2 * g * t^2`). The column becomes a series of its own, with sig figs
  and uncertainties worked out as on any line, so `v_avg`, `v_std` and `v_3` work
  afterwards. An expression without a name (`@table(x / t)`) is just shown.
- A table with more than 60 rows shows its first 50 and last 5, with ⋮ between.
- **Row labels:** down the side go the row numbers, under a blank header, or with
  `labels salts` a series' values in their place: each row's label is that row's
  value of the series. A label is text as a sheet's text is (`$…$` maths, `{KCl}`
  formulas; a comma in the quotes is fine); a series of numbers labels with its
  values. A row the series doesn't have is left blank.
- **Settings:** the ⚙ after a table in the editor opens its settings: which rows to
  show (from and to), the lines (a grid, the default; under the header; or none), the
  row numbers, row labels, showing uncertainties (± with each value, unless
  turned off), showing every row of a long table, and a title. They're kept in
  the sheet after a semicolon in the brackets, `@table(t, x; rows 5-20, lines
  header, numbers off, labels salts, uncertainty off, all rows, title "Runs")`,
  so they can be typed too. Rows only limit what's shown: a computed column is
  still worked out for every row.
- In the LaTeX and Word exports a table is a table, as one is written by hand:
  its title a numbered caption over it, the full width of the page, the row
  numbers or labels bold and to the left, the other columns centred, the header bold. In LaTeX it's
  a `table` float held where it's written (`tabularx`; in a list or a column it's
  centred where it is, captioned with `\captionof`); in Word a Word table, its
  header repeated on each page and its caption Word's own, so a table of tables
  lists it. The Rendered tab draws it the same way (its caption unnumbered).

### Plots

`@plot(…)` on a line of its own draws a graph: the first series is the x axis,
the others are plotted against it.

```
@plot(t, x)                 # x against t, with error bars for uncertainties
@plot(t, x, y)              # two series on one graph, with a legend
@plot(t, x; fit linear)     # adds a best-fit line and its equation
v = x_slope                # the fit's slope, with its uncertainty
```

- Each axis is labelled with its name and unit; every y series must be in units
  that convert to the first one's.
- `fit linear` is a least-squares line. Its equation and R² show under the graph,
  and its slope and intercept become variables, `x_slope` and `x_intercept`, with
  their uncertainties.
- When every point has a y uncertainty, the fit is **weighted**: each point counts
  by 1/δy², so precise points pull the line more, and the slope's and intercept's
  uncertainties come from the error bars. It shows the reduced chi-squared, χ²_ν:
  about 1 when the points scatter as much as their bars say, well above 1 when they
  scatter more (or a straight line is the wrong shape), well below 1 when the bars
  are larger than they need be. Without uncertainties on every point, the fit is
  unweighted and its uncertainties come from the scatter.
- **x uncertainties count too**, in a weighted fit: a point's x error bar is
  turned into how far it moves the point along y on the line, so each point
  counts by 1/(δy² + (slope · δx)²) (the effective variance method; the line is
  refitted until its slope settles). That matters when x is the less precise of
  the two: T² against mass, with masses known to 1% and periods to 0.01%, would
  otherwise give a slope uncertainty far too small and χ²_ν in the thousands.
  The line under the graph says which were used: (weighted by δT² and δm).
- **Settings:** the ⚙ after a plot opens its settings: rows, style (points, lines,
  or both), fit, showing the fit's equation, each axis's range and log scale,
  showing uncertainties (error bars, unless turned off: a fit still weighs the
  points by them), the legend, colours, and a title. As with tables, they're kept
  after a semicolon: `@plot(t, x; rows 2-, style both, fit linear, x from 0 to 1,
  log y, uncertainty off, equation off, legend top right, colour fit red, title
  "Run 1")`.
- **Legend:** `legend top left` (or `top right`, `bottom left`, `bottom right`;
  `outside`, beside the plot; `off`, none). It lists each series and each fit
  (Best fit). Without the setting, a plot with several series has one top left.
- **Colours:** `colour points black`, `colour line grey`, `colour fit red` set every
  series' points (with their error bars), joining line and fit line; `colour F_2
  points green` sets one series'. The colours are black, grey, blue, red, green,
  orange, purple, teal and brown, the same shade in the Rendered tab and both
  exports. (`color` works too.)
- **Axis numbers:** ticks are plain numbers; when an axis's would need a power of
  ten (0.0002 … 0.0016), it's said once in the axis's label instead, `d [10⁻³ m]`,
  with ticks 0.2 … 1.6.
- **What's on the axes is what's plotted:** a point outside an axis's range isn't
  drawn, isn't fitted, and isn't in a named plot's series. So `x from 0.15 to 0.45`
  fits just that stretch of the data, and `p.slope` is that stretch's slope.
- In the LaTeX export a plot is a pgfplots graph (the package is added only when
  the sheet has one); in the Word export it's a picture.
- A named plot, `p = @plot(t, x; fit linear)`, keeps its fit under its name:
  `p.slope`, `p.intercept`, `p.r2` (and `p.chi2` for a weighted fit). With several
  series, each has its own: `p.x_slope`, `p.y_slope`. (An unnamed plot makes
  `x_slope` and `x_intercept` instead.)

### Selections and names with a dot

`@select(…)` takes the rows where conditions hold, as new series under a name:

```
a = @select(t, x; t from 0.2 to 0.8)   # a.t, a.x: just those rows
a.x_1                                 # the first row that matched (numbered from 1)
a.x_avg                               # statistics of the selection
p = @plot(a.t, a.x; fit linear)        # fit only the selected region
v = p.slope
```

- Conditions go after the semicolon, and all must hold: `t from 0.2 to 0.8` (either
  end can be left off), `x to 0.16`, `rows 5-20`. A bare number is in the series'
  unit; a bound can have its own, `t from 250 ms`. In a condition, a name means the
  selected series of that name first, so `@select(run1.t, run1.x; t from 0.2)` works.
- A selection doesn't copy its values: each member is the variable it picks
  (`a.x_1` *is* `x_2`), so it keeps its sig figs and uncertainty, and a selection
  stays correlated with the data it came from (`x_2 - a.x_1` is exactly 0). That
  also keeps selections of thousands of rows quick.
- `a.x` is shown x_a, and `a.x_1` is x_{a,1}. Hovering any member shows its value.

Names with a dot work the same everywhere they're made:

| Made by | Holds |
| --- | --- |
| `a = @select(t, x; …)` | `a.t`, `a.x`, their members and statistics |
| `run1 = @import("run1.csv")` | each column: `run1.t`, `run1.x_3`, `run1.x_avg` |
| `p = @plot(t, x; fit linear)` | the series it plots, `p.t`, `p.x` (the rows drawn, numbered from 1), and its fit: `p.slope`, `p.intercept`, `p.r2`, `p.chi2` |

Naming imports keeps two files with the same columns apart:
`d = run2.x_avg - run1.x_avg`. Typing a name and a dot suggests what it holds.

### Importing data (CSV)

Write `@import()` on a line, then press the **Choose a CSV file…** button that appears
between its brackets. The file's rows go into the sheet, indented under the line,
which now names the file:

```
@import("run1.csv")
    t (s), x (m), y (m)
    0.10, 0.012, 0.031
    0.20, 0.047, 0.118
    …
v = x_4 / t_4
x_avg
```

- Each value becomes a variable named for its column and row: `t_1`, `t_2`, …, so
  the series names (`t_avg`, `t_count`, …) work too. As with any series, `t1` and
  `t_1` are the same name.
- The first row names the columns. A unit in brackets, `t (s)` or `t [s]`, goes
  with every value in that column; without one the values are plain numbers.
  Values keep their sig figs as typed (0.10 is 2 sig figs). Commas, tabs or
  semicolons separate the values; empty cells are skipped.
- **Uncertainties:** a column named `dx` holds x's uncertainties (so do `δx`, `σx`,
  `delta_x`, `sigma_x`, `x_unc` and `x_err`, as long as there's an `x` column). Each
  `x_n` gets its row's uncertainty, exactly as if typed `x_3 = 0.152 m pm 0.004 m`:
  it sets the value's precision, `delta x_3` reads it, and it carries through
  calculations, tables and plots (as error bars). It's in the uncertainty column's
  unit, or x's if it has none; `dx (%)` is a percentage of each value. A row with an
  empty `dx` cell has no uncertainty. The column doesn't make variables of its own.
- The output shows a summary instead of the rows: the file, the number of rows,
  and for each column its variables (t₁ … t₄₀) and the range of its values.
  The file's name between the brackets is a button too: press it to choose another
  file, which replaces the rows.
- In the editor, the rows are folded away when they arrive (unfold them from the
  gutter). Instead of line numbers they show their row numbers, in colour: row 3
  holds t_3, x_3 and y_3. The header row shows –. The rows count as part of the
  import's line, so the line after a 27-row import on line 1 is line 2, in the
  gutter and in the output's messages alike.
- The rows are laid out as a table when the file is imported: the columns padded
  and right-aligned so the digits line up, the header in bold, on a shaded band.
  (Separators are written as commas; the values are unchanged.)
- An import line and its rows stay together: moving the line (Alt+↑/↓), deleting
  it (Ctrl+Shift+K), or cutting or copying it takes its rows too, and other lines
  step over the block rather than into it. Deleting any of the import line removes
  the whole import; so does the × after it in the editor, or **Remove** in the
  output. Folded rows can't be edited by accident; unfold them to change the data.
- The ▼ before the × shows the rows, and ▲ (highlighted while they're showing)
  folds them away again.
- The data is kept in the sheet, so it works anywhere the sheet is opened. It's
  left out of the LaTeX and Word exports.

## To do

What's planned, and what's been done (with how it was addressed), is in
[TODO.md](TODO.md).

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
  #commands, `@layout`), written with `patterns.ts` (`src`, `named`, `words`);
  `src/lib/syntax.ts` gathers them. Shared by the tree, the engine, the outputs
  and the editor
- `src/lib/sheet/names.ts`: the names the engine makes for itself (`delta__F`, `at__c__5`,
  `a__x_1` for `a.x_1`, series members and statistics, a plot's fit), each built and
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
- `src/lib/output/plot.ts`: the linear fit, axes, and drawing a plot as SVG;
  `src/lib/output/plotImage.ts`: plots as pictures for the Word export
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
- `src/modules/series/`: the series module: `@series(…)`, `@table(…)`, `@plot(…)`
  and `@select(…)` as line forms (`series.ts`, `table.ts`, `plot.ts`, `select.ts`), and the
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
