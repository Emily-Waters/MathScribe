# MathScribe

A plain-text calculation sheet. Type calculations on the left, one per line;
variables carry forward to later lines, units, significant figures and
uncertainties are tracked, and every line is typeset on the right as
`symbolic = substituted = result`. The sheet exports to LaTeX.

**Use it online:** <https://emily-waters.github.io/MathScribe/>

To run it locally:

```
npm install
npm run dev
```

**Testing:** `npm test` runs the tests once; `npm run test:watch` re-runs them as
you edit. They cover the calculation rules, the sheet structure and LaTeX export,
and the editor's highlighting, indentation, folding and suggestions. The golden
tests (`src/lib/golden.test.ts`) record the full output of whole sheets (the
sample sheet, a hydrogen-orbitals worksheet and every Reference example) in
`src/lib/__snapshots__/`; when a change alters that output on purpose, check the
difference and update the recording with `npx vitest run -u`.

**Deploying:** every push to `main` lints, tests and builds the site and
publishes it to GitHub Pages (`.github/workflows/deploy.yml`); progress shows in
the repository's Actions tab. If any step fails, nothing is published. The build uses `/MathScribe/` as its base path (`vite.config.ts`), so if the
repository is renamed, change it there too.

Built on [mathjs](https://mathjs.org) (parsing, evaluation, units),
[KaTeX](https://katex.org) (rendering) and [CodeMirror](https://codemirror.net)
(the editor).

## The window

**Theme** (top bar): **System** (Light or Dark, following your computer's
setting), **Light**, **Dark** (blue-grey slate), **Charcoal** (neutral greys, like
a code editor's dark theme) or **Black** (true black). The choice is remembered in
the browser.

- **Input** (left): the sheet, in a code editor with MathScribe syntax colours.
  Its **Options ▾** menu picks the colour theme.
- **Output** (right), in three tabs:
  - **Rendered**: the typeset sheet.
  - **LaTeX**: the whole sheet as a compilable `.tex` document, with a Copy button.
  - **Reference**: every feature as an example you can copy, shown with its real
    output (each example is evaluated live, so the reference always matches what
    MathScribe actually does), plus the list of built-in constants.

  Its **Options ▾** menu holds the output settings:

  | Setting | Does |
  | --- | --- |
  | Sig figs | **Auto** works out each result's sig figs from its inputs; a number shows every result to that many |
  | Show substitution | Include the step with values put in for the variables |
  | Use ≈ for every rounded result | Off: ≈ only when every input is exact (`1/3 ≈ 0.333`); on: before any rounded result |

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
| Enter | Keeps the indentation; one level deeper after a line ending in `{` or `:`, or a `def` |
| `}` | Dedents itself to match its block |
| Ctrl+X / Ctrl+C, nothing selected | Cut / copy the whole line (pasting it puts it above the current line) |
| Alt+↑ / Alt+↓ | Move the line (or selected lines) up / down |
| Shift+Alt+↑ / ↓ | Duplicate the line |
| Ctrl+Click a function's name, or F12 | Go to its definition (names you can jump from are underlined while Ctrl is held) |
| Ctrl+F | Find and replace |
| Ctrl+Z / Ctrl+Y | Undo / redo |

On a Mac, use ⌘ for Ctrl. `def` bodies, `:` layout blocks and `{ }` blocks fold
from the arrows in the gutter.

**Suggestions as you type** (Enter or Tab accepts, Esc closes, Ctrl+Space asks):

| Typing | Suggests |
| --- | --- |
| a name | variables defined above and in scope (not another block's locals), with their value; a function's parameters inside its body; your functions with their parameters (accepting one puts the cursor between the brackets); series names like `t_avg` (once there are two or more `t_1`, `t_2`, …); built-in functions, `pi`/`e`, and keywords |
| `@` | constants with their description and value, including your own `@constants` |
| a unit, after a number or `to` | units, with what they are in SI (`angstrom = 1e-10 m`); `percent` after `to` |
| `#` after a line's text | display commands, with what each does |

Nothing is suggested in headings, `>` text, `$` lines or notes.

**Hover over a name** to see what it is: a variable's value (typeset) and where
it's defined, a function's signature, a constant's full value, a unit in SI, or
what a command or keyword does.

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
| Open | Ctrl/⌘ + O | Opens one or more sheets (select several in the dialog), each in its own tab; a file that's already open is switched to instead |
| Save | Ctrl/⌘ + S | Saves to the current file, or asks where the first time |
| Save as | Ctrl/⌘ + Shift + S | Saves to a new file |

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

## Syntax

| Line | Meaning |
| --- | --- |
| `m = 2.0 kg` | define a variable (with a unit) |
| `F = m * a` | compute from earlier variables |
| `F to kN`, `v = d / t to km/h` | convert units |
| `f = P * dr to percent` | show a unitless result as a percentage |
| `f(x) = x^2 + 1`, then `f(3)` | define and call a function |
| `E(n, m to kg) = …` | a function whose argument is converted to kg |
| `x = 3  # note` | text after `#` becomes the line's description |
| `x = 3  #val` | a display command (see below) |
| `# Title` | `\section{Title}`, numbered 1, 2, … |
| `## Title` | `\subsection{Title}`, numbered 1.1, 1.2, … |
| `### Title` (or more `#`) | `\textbf{Title}` bold run-in heading |
| `> Some text` | paragraph; `$...$` for inline LaTeX |
| `$ \LaTeX` | raw LaTeX, displayed but not evaluated |
| `Title {` … `}` | a block that scopes its variables |
| `Title:  #numbered` + indented lines | a layout block: centered, bulleted or numbered |
| `@c`, `@a_0:3 to angstrom` | constants, and setting their precision and unit |

**Subscripts in headings and block titles:** as in variable names, `_` makes a
subscript: `Hydrogen 2p_z orbital {` shows 2p with a subscript z, and `x_{max}`
takes a longer one. Write `\_` for a plain underscore. `$…$` adds inline maths,
as in `>` text: `## Energy $E_n = -13.6/n^2$ eV`. The LaTeX export uses
`\textsubscript` and `$…$` to match.

**Spacing:** one blank line between lines is just for readability in the input and
doesn't change the output. Two or more blank lines leave one empty line in the
output (and `\vspace{\baselineskip}` in the LaTeX export).

### Display commands

Put a command after a calculation to control how it's shown. It can go before or
after the note:

| Command | Shows | Example |
| --- | --- | --- |
| *(none)* or `#full` | everything | F = m·a = 2.0 kg · 9.81 m/s² = (20 ± 1) N |
| `#sym` | the equation only | F = m·a |
| `#val` | the result only | F = (20 ± 1) N |
| `#hide` | nothing; the line is still calculated | |
| `#multiline` | each `=` on its own row, lined up | F = m·a ⏎ = 2.0 kg · 9.81 m/s² ⏎ = (20 ± 1) N |
| `#center`, `#list`, `#numbered` | layout (see Layout blocks) | |

```
F = m * a  #val  # weight
F = m * a  # weight  #val      (same thing)
F = m * a  #sym #multiline     (commands combine)
```

- `#multiline` is a layout, so it combines with `#sym`, `#val` and `#full`. A line
  with only one `=` left to show stays on one line. On a function's definition
  (`f(x) = …  #multiline`), every line that calls the function is shown multiline.
- A variable **defined** with `#sym` stays a symbol in later substitution steps:
  after `k = 4.0 N/m * 2 #sym`, `F = k * x` shows `F = k·x = k · 0.150 m = 1.2 N`.
  Its value is still used in every calculation;
  only the substitution display keeps the name. This also applies inside a function's
  working when it's passed as an argument, and to variables defined in a `#sym`
  block. Defining it again without `#sym` brings its value back into substitutions.
- On a line that's just a name (`delta F`, `t_avg`), `#sym` shows its defining
  formula (δF = √(…), t̄ = (1/n) Σ tᵢ) and `#val` shows the name and value.
- On a block opener (`Working { #val`), the command applies to every line inside,
  including nested blocks, unless a line has its own (`#full` to show one in full).
  `#hide` on a block hides the whole block.
- Hidden lines and blocks are left out of the LaTeX export too, but their variables
  can still be used. If a hidden line has an error, it's shown anyway.
- Only these exact words are commands; any other `#word` (like `#3`) stays part of
  the note.

**= or ≈:** a result whose inputs are all exact (whole numbers, π, `:exact`
constants) and that has been rounded for display follows ≈: `1/3 ≈ 0.333333`,
`π/4 ≈ 0.785398`. Measured results use =, since their sig figs already say they're
rounded; turn on *Use ≈ for every rounded result* in the Output options to use ≈
for those too. Values with a `±` always use =.

### Layout blocks

A line ending in `:` holds the lines indented under it, and arranges them:

```
Assumptions:   #list
    > The electron is confined to a 1-D box
    > The walls are infinitely high
        > so ψ = 0 at the walls          (indent further for a sub-list)

Steps:   #numbered   # the 1s orbital
    sigma = Z*r/a_0
    psi = pi^(-0.5) * (Z/a_0)^(3/2) * e^(-sigma)

Key result:   #center
    P = 4 * pi * r^2 * psi^2

F = 2.00 kg * 9.81 m/s^2   #center        (a single calculation, centered)
```

- `#list` makes bullets, `#numbered` a numbered list and `#center` centers the
  lines. With none of them, `Title:` is just a titled, indented section.
- The block ends at the first line indented no further than its opener, like a
  `def` body. Blank lines don't end it.
- Layout blocks only arrange lines: variables assigned inside **stay available**
  afterwards (unlike `{ }` blocks, which scope them).
- The title is optional (`:  #numbered` on its own). A note after the opener is
  shown beside the title, and display commands on the opener apply to the lines
  inside, as on `{ }` blocks.
- In the LaTeX export, lists become `itemize` / `enumerate` (each calculation inline
  beside its marker) and centered blocks `center`.

### Functions

Write a one-line function the way it's written in maths:

```
radialProb(r, psi) = 4 * pi * r^2 * psi^2
P = radialProb(r, psi_200)
```

or, for several steps, Python-style: `def`, a name and parameters (a trailing `:` is
optional), then an indented body of `name = …` lines ending in `return …`. The two
styles behave the same.

```
def KE(mass, speed)
    E = 1/2 * mass * speed^2     # local to the function
    return E

K = KE(m, v)
```

A call shows the working inside the function, in terms of **what you passed in**
(here `m` and `v`, not `mass` and `speed`), followed by the line itself:

```
E = ½ · m · v² = ½ · 2.0 kg · (3.00 m/s)² = (9.0 ± 0.5) J
K = E = (9.0 ± 0.5) J
```

- Each body line shows its own substitution and result, with sig figs and
  uncertainties carried through.
- When the right-hand side is just the call, the line reads `K = E = …` (the return
  expression); when the call is part of a bigger expression (`w = 2 * KE(m, v)`), the
  working is shown above and the line is shown as usual.
- Functions that call functions show their working too, innermost first.
- `#sym` on the calling line shows the body equations without values; `#val` skips
  the working and shows just `K = (9.0 ± 0.5) J`.

**Casting parameters:** write `name to unit` in the parameter list to convert that
argument when the function is called, so the working shows it in that unit:

```
E_k(n, m to kg, L to m) = n^2 * @h^2 / (8*m*L^2)
E_1 = E_k(1, m_e, 0.100 nm)       # working shows 1.00 × 10⁻¹⁰ m
```

An argument in the wrong kind of unit (a length for `m to kg`), or with no unit at
all, is an error rather than a silent assumption. The definition shows the casts:
E_k(n, m [kg], L [m]).

Body lines can have their own notes and commands, which apply whenever the function
is called:

```
def calc(a, b)
    s = a + b          # the sum             → s = a + b = 2.0 + 3.0 = 5.0   (the sum)
    p = a * b  #val    # the product         → p = 6.0                       (the product)
    q = s / p  #sym                          → q = s / p
    h = q * 2  #hide                         → (runs, not shown)
    return h + 1       # final answer        → r = h + 1 = 1.7 + 1 = 2.7     (final answer)
```

- A body line's command decides how that step is shown; lines without one follow the
  calling line (or its block's command). `#multiline` on the `def` line or a body
  line lays out that working one `=` per row.
- `#hide` still runs the step, since later lines may use it, but leaves it out of the
  working. If it has an error, it's shown anyway.
- The `return` line's note goes on the calling line, unless that line has its own
  note. Its command sets how the calling line is shown, unless the calling line (or
  its block) has a command of its own.
- The body is every following line indented further than `def` (spaces or tabs).
  Blank lines and `#` comment lines inside it are fine; notes after a line work too.
- Each call gets its own local scope: assignments in the body stay inside it. The
  body can read variables from where the function was defined, and a function
  defined inside a `{ }` block is only visible in that block.
- Calls work like any other function: units, sig figs and uncertainties carry
  through, so `KE(m, v)` propagates the uncertainties of `m` and `v`.
- Your function takes precedence over a built-in of the same name (e.g. `def sum(a, b)`).
- The definition is shown as a card with each body line as an equation, the return
  line reading `KE(mass, speed) = E`. `#hide` on the `def` line hides the card.

Two limits for now: bodies are straight-line (no `if` or loops), and a variable the
body reads from outside contributes its value but not its uncertainty; pass it as a
parameter if its uncertainty matters. A cast unit can't contain spaces or brackets
(write `J/mol/K`, not `J/(mol*K)`).

### Blocks and scope

A line ending in `{` opens a block (text before the brace is its title) and a
line with `}` closes it. Blocks nest and scope variables like a programming
language:

```
theta = 30 deg
a = g * sin(theta)

Steeper ramp {      # title, then an optional note
  theta = 45 deg    # local: shadows the outer theta
  a = g * sin(theta)
}
a                   # still the outer value
```

- Inside a block you can read everything defined above it, including in outer blocks.
- Anything assigned inside a block is local to it and disappears at `}`. Assigning a
  name that already exists outside shadows it; the outer value is untouched.
- Functions see the variables from where they were defined (lexical scope).
- Each block lists its local variables underneath.
- For arranging lines without scoping them, use a layout block (`Title:`) instead.

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

### Units

A unit written right after a number is always a unit, even if a variable has the
same name: after `m = 2.0 kg`, `d = 3.5 m` is still 3.5 metres. Compound units are
written without spaces (`9.81 m/s^2`, `kg*m^2`). To multiply a number by a
variable whose name is also a unit, use `*`: `1/2 * m * v^2`, not `1/2 m v^2`.
A warning is shown when a line looks like that mistake.

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
- Results use scientific notation when plain digits would misstate the precision:
  19.6 at 2 sig figs shows as 2.0 × 10¹, not 20.
- Results of exact inputs aren't limited by sig figs (`1/3 ≈ 0.333333`); write
  `name:3 = …` to choose.
- Hover a variable in a block's Local row to see its sig figs.

Pick a number instead of Auto to show every result to that many sig figs.

#### Declaring a variable's sig figs

Add `:n` to the name being assigned to set its sig figs yourself, instead of counting
them from how the value is written:

```
m:4 = 2 kg          # m = 2.000 kg
n:3 = 1.999 kg      # shown as 2.00 kg; calculations use 1.999
F:2 = m * a         # a computed result, limited to 2 sig figs: 2.0 × 10¹ N
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
  and with `solve` (`d:3 = solve(…, d)`).
- A function's result takes its sig figs from its `return` line, so a declared
  `q:2 = …` inside a function, or a measured number in its body, carries through to
  the calling line.

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

Physical constants start with `@`:

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

### Solving equations

`solve(equation, unknown)` rearranges an equation for the unknown and evaluates it:

```
d = solve(v_f^2 = 2*a*d, d)
```

shows the equation, then the rearranged formula, the values and the answer:

```
v_f² = 2·a·d                                   (solving for d)
d = v_f²/(2·a) = (5.86 m/s)²/(2 · 4.91 m/s²) = 3.50 m
```

- The result is an ordinary formula, so units, sig figs, uncertainty and `#sym`/`#val`
  all work as usual.
- `solve(…)` is the whole right-hand side, optionally followed by a conversion:
  `theta = solve(sin(theta) = 0.500, theta) to deg`. Without an assignment
  (`solve(v^2 = 2*a*d, d)` on its own) it shows the answer without storing it.
- The unknown is solved for even if it already has a value; assigning the result
  replaces it.

How it solves:

1. **Rearranging**, when the unknown appears once: each operation around it is
   undone (+/−, ×/÷, powers and roots, sin/asin, exp/ln, …).
2. **Collecting terms**, when the equation is linear in the unknown (`3k + 2 = k + 10`).
3. **The quadratic formula**, when it's quadratic (`h = v₀t + ½gt²` gives
   `t = (√(v₀² + 2gh) − v₀)/g`).
4. **Numerically**, from a starting guess, for anything else:
   `x = solve(x = cos(x), x, 0.5)`. The guess also sets the answer's units
   (`solve(…, T, 300 K)`). The uncertainty still propagates.

When there's more than one solution (from x², √, sin, cos, |x| or a quadratic), the
principal or positive one is used and the others are noted below the line. Give a
guess (`solve(…, x, -1)`) to choose the solution nearest it.

Angles from asin, acos and atan are in radians; add `to deg` for degrees.

`to percent` isn't supported on a `solve` line yet.

### Series: sums, means and counts

Numbered variables form a series. Define `t1`, `t2`, `t3`, … (or `t_1`, `t_2`, …)
and these names become available:

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
- The series aggregates aren't listed in a block's Local row, since they're derived.
- A name that only matches one numbered variable still forms a series: if a block
  defines `psi_200` and you write `psi`, it means that one-member series. Check the
  name if a value appears where you expected an "undefined" error.

## To do

Roughly in priority order.

### 1. Quality of life

- [ ] **Remember the output options** (sig figs, substitution, ≈) in the browser.
- [ ] **Quick fixes on warnings**, like VS Code's lightbulb: trailing zeros →
      `300.`, a unit read as a variable → insert `*`, an unknown constant → the
      suggested one.
- [ ] **Hover shows a variable's value at that line**, not at the end of its scope.
- [ ] **Go to definition for variables and constants** (`@rho_w` → its
      `@constants` entry).

### 2. Sharing

- [ ] **Share by link**: the sheet compressed into the URL
      (`…/MathScribe/#sheet=…`), so opening the link loads it, with no server and
      nothing uploaded.
- [ ] **Installable and offline**: make the app a progressive web app, so it can be
      installed from the browser and used without a connection.
- [ ] **Templates**: "New from template", e.g. a lab write-up with sections, a
      measurements table and an uncertainty analysis.

### 3. Editor intelligence

- [ ] **Parameter hints**: typing `E_k(1, ` shows `E_k(n, m [kg], L [m])` with the
      current parameter highlighted.
- [ ] **Snippets**: `def`, `:  #numbered` blocks, `@constants { }`.
- [ ] **Rename (F2)**: rename a variable or function everywhere it's used,
      respecting scope.
- [ ] **Inline results**: a faint value at the end of each line in the editor
      (`F = m * a   ⟶ 19.6 N`).

### 4. Lab work

- [ ] **Tables**: a table block whose columns become series (so `t_avg`, `t_std`,
      `t_sem` work on them), with units from the column headers, plus `linfit` for a
      slope and intercept with uncertainties.
- [ ] **Graphs**: plot data and functions (e.g. `plot(h, t^2, fit)`), with error bars
      from uncertainties and an optional fitted line, included in the LaTeX export.
- [ ] **Importing from CSV**: load a CSV file as a table, with headers as column names
      (and units, where given).
- [ ] **Explore compiling the LaTeX to a PDF** in the LaTeX tab (a Source / PDF
      switch, Download .tex and Download PDF). Options considered: an online
      compile service such as texlive.net (simple, but sends the sheet off the
      device), pdfTeX compiled to WebAssembly (private, but tens of MB), or an
      "Open in Overleaf" button.

### 5. Housekeeping

- [ ] **Speed on long sheets**: the whole sheet is evaluated on every keystroke;
      wait for a pause in typing, or evaluate in a web worker.
- [ ] **Narrow screens**: a stacked layout, or an Input / Output switch, for
      phones and small laptops.

### Done

- [x] **Hosting**: published to GitHub Pages on every push.
- [x] **Custom colour theme**: per-category colour pickers in the editor options,
      starting from a preset, with separate light and dark colours.
- [x] **IntelliSense**: suggestions as you type and hover information.
- [x] **Automated tests** (Vitest): unit tests, golden tests of whole sheets, and
      editor tests, run on every push before the site is published.

## Structure

- `src/lib/engine.ts`: evaluation with scoped variables, unit-literal handling,
  sig-fig tracking, uncertainty propagation, functions, LaTeX generation
- `src/lib/document.ts`: line types and blocks (`{ }`, layout, `def`,
  `@constants`), sheet evaluation, the `.tex` export, diagnostics and definitions
  for the editor
- `src/lib/sigfigs.ts`: counting, propagating and formatting significant figures
- `src/lib/solve.ts`: `solve(…)`: rearranging, linear, quadratic and numeric solving
- `src/lib/constants.ts`: the built-in `@` constants
- `src/lib/reference.ts`: the examples shown in the Reference tab;
  `src/lib/sample.ts`: the example sheet shown the first time
- `*.test.ts` beside the code they test; `src/test/helpers.ts`: shared test
  helpers (evaluate a sheet, read a result as plain text)
- `src/lib/files.ts`, `src/useSheets.ts`: the open sheets (tabs), opening, saving,
  auto-saving and the browser's copy; `src/components/SheetTabs.tsx`: the tab bar
- `src/editor/language.ts`: the MathScribe language for CodeMirror (highlighting,
  indentation, folding)
- `src/editor/themes.ts`: syntax colour themes; `src/appTheme.ts`: app themes
  (both sets of colours are in `App.css`; `index.html` applies the saved app
  theme before the page draws)
- `src/editor/gotoDefinition.ts`: Ctrl+Click / F12 go to definition
- `src/editor/intellisense.ts`: suggestions as you type and hover information;
  `src/editor/vocabulary.ts`: the commands, keywords and built-in functions they describe
- `src/components/EditorPane.tsx`: the editor; `PreviewPane.tsx`: rendered output,
  LaTeX and Reference tabs; `ReferencePane.tsx`: the Reference tab;
  `OptionsMenu.tsx` / `Dropdown.tsx`: the options menus; `SplitPane.tsx`: resizable
  two-pane layout (drag, arrow keys, double-click to reset)
