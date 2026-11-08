# MathScribe

A plain-text calculation sheet. Type calculations on the left, one per line;
variables carry forward to later lines, units are tracked, and every line is
typeset on the right as `symbolic = substituted = result`.

```
npm install
npm run dev
```

Built on [mathjs](https://mathjs.org) (parsing, evaluation, units, LaTeX) and
[KaTeX](https://katex.org) (rendering).

## Saving

Sheets are plain `.txt` files. The buttons in the top bar:

| Button | Shortcut | Does |
| --- | --- | --- |
| New | | Starts an empty sheet (asks first if there are unsaved changes) |
| Open | Ctrl/⌘ + O | Opens a sheet |
| Save | Ctrl/⌘ + S | Saves to the current file, or asks where the first time |
| Save as | Ctrl/⌘ + Shift + S | Saves to a new file |

Auto-saving happens at two levels:

- **In the browser, always.** Every edit is kept in the browser's storage, so a
  refresh or closing the tab never loses work; the sheet comes back as you left it.
- **To the file, in Chrome and Edge.** Once you open or save a file, it stays linked
  and changes are written to it about a second after you stop typing. The top bar
  shows the file name and "saved", "saving…" or "unsaved changes". If the browser asks
  for permission to edit the file, allow it; if auto-save is ever paused, pressing
  Save resumes it. After reloading the page, the work is restored from the browser
  but the file isn't linked any more: use Save (and pick the same file) or Open again.

Firefox and Safari don't let web pages write to files, so there Save downloads the
sheet as a file instead, and the browser copy keeps your work safe in between.

## Syntax

| Line | Meaning |
| --- | --- |
| `m = 2.0 kg` | define a variable (with a unit) |
| `F = m * a` | compute from earlier variables |
| `F to kN`, `v = d / t to km/h` | convert units |
| `f(x) = x^2 + 1`, then `f(3)` | define and call a function |
| `x = 3  # note` | text after `#` becomes the line's description |
| `# Title` | `\section{Title}`, numbered 1, 2, … |
| `## Title` | `\subsection{Title}`, numbered 1.1, 1.2, … |
| `### Title` (or more `#`) | `\textbf{Title}` bold run-in heading |
| `> Some text` | paragraph; `$...$` for inline LaTeX |
| `$ \LaTeX` | raw LaTeX, displayed but not evaluated |

**Linked input and output:** click any line of output (a calculation, a heading, a
step inside a function or constants card) to put the editor's cursor on its source
line. Moving the cursor in the editor highlights the matching output and scrolls it
into view. The line numbers beside the editor are marked red for errors and amber
for warnings; hover one to read the message, click it to go to that line. The editor
doesn't wrap long lines, so the line numbers stay aligned; scroll sideways for long
lines.

**Spacing:** one blank line between lines is just for readability in the input and
doesn't change the output. Two or more blank lines leave one empty line in the
output (and `\vspace{\baselineskip}` in the LaTeX export).

### Display commands

Put a command after a calculation to control how much of it is shown. It can go
before or after the note:

| Command | Shows | Example |
| --- | --- | --- |
| *(none)* or `#full` | everything | F = m·a = 2.0 kg · 9.81 m/s² = (20 ± 1) N |
| `#sym` | the equation only | F = m·a |
| `#val` | the result only | F = (20 ± 1) N |
| `#hide` | nothing; the line is still calculated | |

```
F = m * a  #val  # weight
F = m * a  # weight  #val      (same thing)
```

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

### Functions

Define a function Python-style: `def`, a name and parameters (a trailing `:` is
optional), then an indented body of `name = …` lines ending in `return …`.

```
def KE(mass, speed)
    E = 1/2 * mass * speed^2     # local to the function
    return E

K = KE(m, v)
```

A call shows the working inside the function, with the arguments' values filled in,
followed by the line itself:

```
E = ½ · mass · speed² = ½ · 2.0 kg · (3.00 m/s)² = (9.0 ± 0.5) J
K = E = (9.0 ± 0.5) J
```

- Each body line shows its own substitution and result, with sig figs and
  uncertainties carried through.
- When the right-hand side is just the call, the line reads `K = E = …` (the return
  expression); when the call is part of a bigger expression (`w = 2 * KE(m, v)`), the
  working is shown above and the line is shown as usual.
- Functions that call functions show their working too, innermost first.
- `#sym` on the calling line shows the body equations without values
  (`E = ½ · mass · speed²`, `K = E`); `#val` skips the working and shows just
  `K = (9.0 ± 0.5) J`.

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
  calling line (or its block's command).
- `#hide` still runs the step, since later lines may use it, but leaves it out of the
  working. If it has an error, it's shown anyway.
- The `return` line's note goes on the calling line, unless that line has its own
  note. Its command sets how the calling line is shown, unless the calling line (or
  its block) has a command of its own.
- On the definition card, notes are shown beside each body line.

- The body is every following line indented further than `def` (spaces or tabs).
  Blank lines and `#` comment lines inside it are fine; notes after a line work too.
- Each call gets its own local scope: assignments in the body stay inside it. The
  body can read variables from where the function was defined (like `g` below), and
  a function defined inside a `{ }` block is only visible in that block.
- Calls work like any other function: units, sig figs and uncertainties carry
  through, so `KE(m, v)` propagates the uncertainties of `m` and `v`.
- Your function takes precedence over a built-in of the same name (e.g. `def sum(a, b)`).
- The definition is shown as a card with each body line as an equation, the return
  line reading `KE(mass, speed) = E`. `#hide` on the `def` line hides the card.
- One-line definitions still work: `f(x) = x^2 + 1`.

```
g = 9.81 m/s^2
def weight(mass)
    return mass * g
```

Two limits for now: bodies are straight-line (no `if` or loops), and a variable the
body reads from outside (like `g`) contributes its value but not its uncertainty;
pass it as a parameter if its uncertainty matters.

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

The editor is CodeMirror, with MathScribe syntax colours (Options → Editor
colours: Default, Vivid, High contrast or Minimal). Tab indents by one level
(4 spaces) and Shift+Tab removes one; Backspace in the indentation removes a
whole level. Enter keeps the indentation (one level deeper after a line ending
in `{` or `:`, or a `def`), and typing `}` dedents it. As in VS Code, Ctrl+X /
Ctrl+C with nothing selected cut or copy the whole line, Alt+↑/↓ move lines,
Shift+Alt+↑/↓ duplicate them, Ctrl+F finds and replaces, and Ctrl+Click (or F12)
on a function's name goes to its definition. Blocks, `def` bodies and `:` layout
blocks fold from the gutter.

### Functions and constants

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

Computed results are shown in tidy units: `N/kg` becomes `m/s^2`, `kg m/s^2`
becomes `N`. Use `to` to choose a unit yourself.

### Significant figures

With **Sig figs: Auto** (the default), every value keeps the significant figures
it was written with, and computed results are rounded by the usual rules:

| Situation | Rule | Example |
| --- | --- | --- |
| Measured value | counted as typed | `2.00 kg` → 3, `0.0250 m` → 3, `1.2e3 N` → 2 |
| Exact number | never limits a result | the `2` in `2 * a * d`, the `1/2`, `n = 3` |
| × ÷, powers, functions | fewest sig figs among the inputs | `2.00 kg * 9.81 m/s^2` = 19.6 N |
| + − | least precise decimal place | `12.52 m + 3.1 m` = 15.6 m |

- A number is **measured** if it has a unit or is written with a decimal point or
  exponent. Integers without a unit are **exact**.
- Trailing zeros in whole numbers don't count (`300 m` has 1 sig fig). Write `300. m`
  or `3.00e2 m` if they do; a warning points these out.
- Values are kept at full precision and only rounded for display, so rounding
  doesn't build up across steps. The substitution step shows each variable rounded
  to its own sig figs.
- Results use scientific notation when plain digits would misstate the precision:
  19.6 at 2 sig figs shows as 2.0 × 10¹, not 20.
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
- **Set a constant's precision for the whole sheet** with a line that's just `@c:4`
  (or `@g:exact`). Every plain `@c` in the sheet then uses 4 sig figs, including
  lines above the declaration and constants defined from it. The declaration line
  shows the value it sets (`c = 2.998 × 10⁸ m/s`). A use with its own `:n` still
  wins, and a second declaration for the same constant is ignored with a warning.
  Declarations can also go inside an `@constants { }` block.
- Constants carry units, so conversions just work (`@R` in J/(mol·K) gives litres
  when you ask `to L`).
- A mistyped name suggests the closest one: `@kb` → "Did you mean @k_B?"
- `@e` is the elementary charge and `@g` standard gravity; they don't clash with
  Euler's `e`, grams, or a variable of your own called `g`.

Built-in constants (CODATA 2018; "exact" means exact by definition in the SI):

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

## To do

- [ ] **Graphs**: plot data and functions (e.g. `plot(h, t^2, fit)`), with error bars
      from uncertainties and an optional fitted line, included in the LaTeX export.
- [ ] **Tables**: a table block whose columns become series (so `t_avg`, `t_std`,
      `t_sem` work on them), with units from the column headers, plus `linfit` for a
      slope and intercept with uncertainties.
- [ ] **Importing from CSV**: load a CSV file as a table, with headers as column names
      (and units, where given).

## Structure

- `src/lib/engine.ts`: evaluation with scoped variables, unit-literal handling, sig-fig tracking, LaTeX generation
- `src/lib/sigfigs.ts`: counting, propagating and formatting significant figures
- `src/lib/document.ts`: line types, sheet evaluation, full `.tex` export
- `src/components/SplitPane.tsx`: resizable two-pane layout (drag, arrow keys, double-click to reset)
- `src/components/EditorPane.tsx` / `PreviewPane.tsx`: input, rendered output, options, variables
