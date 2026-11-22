# MathScribe reference

Everything a sheet can say, by topic: how each thing is written, what it does, the rules for
writing it, and examples, each a whole sheet you can paste in. The Reference tab in the app
shows the same, with each example worked out beside it.

<!-- Made from the language tree (src/lib/language/), as the Reference tab and the AI primer are:
don't edit it by hand. `npm run docs` writes it again after the tree changes. -->

**Topics:** [Basics](#basics) · [Units](#units) · [Significant figures](#significant-figures) · [Uncertainty](#uncertainty) · [Repeated measurements](#repeated-measurements) · [Table settings](#table-settings) · [Plot settings](#plot-settings) · [Functions](#functions) · [Vectors](#vectors) · [Tuples and coordinates](#tuples-and-coordinates) · [Constants](#constants) · [Chemistry](#chemistry) · [Display commands](#display-commands) · [Layout](#layout) · [Solving](#solving) · [Built-in constants](#built-in-constants)

## Basics

Assign a value. Text after \# is a note shown beside the result.

- Text after \` \# \` on a calculation is its note: two spaces or more before the \#.

```
m = 2.00 kg   # mass of the block
```

// starts a comment, never shown. A blank line is spacing; two leave a gap in the output.

- Don't use \# for a comment on its own line: it makes a heading.
- A // line is never shown or worked out, wherever it is: in a block, a function, or an @layout.text block (where it doesn't split a paragraph).

```
// the block's mass
m = 2.00 kg
```

Use earlier variables; the working is shown with values substituted.

- Always write \* for multiplication: 1/2 \* m \* v^2, 2 \* pi \* r. Never 2m or 1/2 m v^2.
- Don't write LaTeX in calculation lines (\\frac, \\cdot): write plain maths.
- A variable can be redefined; later lines use the newest value.

```
m = 2.00 kg
F = m * 9.81 m/s^2
```

Names are letters, digits and underscores, and \_ makes a subscript: v\_0 is v₀, v\_1x (or v1x) is v₁ₓ, F\_net\_x is F\_net,x; a subscript that's a word (net, max) is upright. Greek letters by name (theta, mu\_k, Delta) or as characters (ΔE, ω).

- Name things as the question writes them.
- Write Δt, not dt. No dots in names.
- Don't use phi, tau, e or pi as names of your own.
- A Greek letter typed into a name stays part of it: ΔE is a variable of its own, while Delta E (with a space) is E's uncertainty; both show ΔE.
- Type one as \\ and its name, then Tab or a space: \\Delta gives Δ, and the space ends the name, as in LaTeX (\\Delta E types ΔE). Not in headings, prose, @latex, notes or \$…\$, where \\Delta is LaTeX.

```
v_0 = 2.0 m/s
Δt = 1.5 s
mu_k = 0.150
a = v_0 / Δt
```

Powers are ^. The functions of maths: sqrt, sin, cos, tan, asin, acos, atan, atan2, exp, log (natural), log10, abs, min, max, round; and pi and e.

| Written | Does |
| --- | --- |
| `sqrt(x)` | Square root |
| `cbrt(x)` | Cube root |
| `nthRoot(x, n)` | The nth root |
| `abs(x)` | Absolute value |
| `exp(x)` | e to the power x |
| `log(x)` | Natural logarithm (or log(x, base)) |
| `log10(x)` | Base-10 logarithm |
| `log2(x)` | Base-2 logarithm |
| `sin(θ)` | Sine; angles in rad, or with deg |
| `cos(θ)` | Cosine; angles in rad, or with deg |
| `tan(θ)` | Tangent; angles in rad, or with deg |
| `asin(x)` | Inverse sine, in rad (add to deg) |
| `acos(x)` | Inverse cosine, in rad (add to deg) |
| `atan(x)` | Inverse tangent, in rad (add to deg) |
| `atan2(y, x)` | Angle of the point (x, y), in rad |
| `sinh(x)` | Hyperbolic sine |
| `cosh(x)` | Hyperbolic cosine |
| `tanh(x)` | Hyperbolic tangent |
| `round(x, n)` | Round to n decimal places |
| `floor(x)` | Round down |
| `ceil(x)` | Round up |
| `min(a, b, …)` | Smallest value |
| `max(a, b, …)` | Largest value |
| `factorial(n)` | n! |
| `norm(r)` | Length of a vector or tuple: norm(\<3, 4\>) = 5 |
| `dot(a, b)` | Dot product of two vectors |
| `cross(a, b)` | Cross product of two 3D vectors |
| `pi` | π ≈ 3.14159 |
| `e` | Euler’s number ≈ 2.71828 |
| `tau` | τ = 2π |
| `phi` | The golden ratio ≈ 1.61803 |

- Everything mathjs has works, matrices (\[1, 2; 3, 4\]) too.
- pi, e and the like stay symbols in substitution steps, and so does a variable made only of numbers and them: after theta = pi/4, sin(theta) shows sin(π/4).
- sin, cos and tan of exact angles are exact: sin(pi) is 0, sin(30 deg) is 0.5.
- A series doesn't take a built-in constant's name: with e1 and e2 defined, e is still Euler's number (e\_avg is the series' mean).
- phi and tau are built in too (the golden ratio, 2π): define them before using them as names of your own.
- atan2(y, x) takes coordinates with units, as long as they match: atan2(1.0 m, 2.0 m).

```
r = 2.00 m
A = pi * r^2
h = sqrt(2 * 9.81 m/s^2 * 1.20 m)
```

@ starts everything built in rather than written in the sheet: constants (@c), the @constants \{ \} block, MathScribe's own functions (@tuple, @series, @table, @plot, @solve, …) and namespaces, whose members are written with a dot (@layout.text, @chem.substance). mathjs's maths isn't (sin, sqrt, norm).

- The names of MathScribe's functions are free for your own: tuple(a, b) = … defines a function of yours.
- Your own constants are @name too, so they can't be called layout, chem, constants, or one of MathScribe's functions.

```
E = @h * @c / 532 nm to eV
```

Products are written as in a textbook: 1/2 \* m \* v^2 shows ½mv², 2 \* pi \* r shows 2πr. Where a number comes next, or a unit ends a factor, a × keeps them apart (2.00 kg × 9.81 m/s²); brackets go only where they're needed: a value to a power, (2.0 s)², a negative after another factor, a sum, m(v + u). The Output options can show · in every product.

```
m = 2.00 kg
v = 3.0 m/s
K = 1/2 * m * v^2
```

Brackets with others inside them change, as in textbooks: ( ) innermost, then \[ \], then ( ) again, so ((a + b) \* c)^2 shows \[(a + b)c\]². A function's brackets stay round, and so do a tuple's. What you type stays as you wrote it.

```
a = 1.0 m
b = 2.0 m
c = 3.0
d = ((a + b) * c)^2
```

Headings. \# and \#\# are numbered, like LaTeX sections. In headings and block titles, a\_b is a subscript (write \\\_ for a plain underscore) and \$…\$ is maths.

- A line starting with \# is always a heading: write // for a comment.
- x\_\{max\} takes a subscript of more than one letter.

```
# Section
## The 2p_z orbital
### Energy $E_n$
```

A line starting with \> is a paragraph of text.

- Don't start a line with \$: \$…\$ is inline maths, for prose.

```
> Prose, with inline maths like $E = mc^2$.
```

\{\{name\}\} in prose or a heading puts in a variable's value as worked out above it, with its unit and sig figs. Settings and to work in it: \{\{V:3 to L\}\}.

- Don't type a worked-out number into prose: write \{\{name\}\}, so it stays right.
- Any expression works: \{\{2 \* m\}\}, \{\{delta F\}\}, \{\{a.x\_1\}\}; and settings (\{\{x:3\}\}, \{\{x:sci\}\}) and to.
- A value is worked out where the text is, so it must be defined above it: one that isn't is marked as an error, and left as typed.
- Inside \$…\$, \{\{…\}\} is left alone. In the exports, each value is inline maths.

```
T1 = 1.21 s
T2 = 1.17 s
> The mean period was {{T_avg}}.
```

@latex \{ … \} is raw LaTeX, displayed but not calculated.

```
@latex { \int_0^\infty e^{-x}\,dx = 1 }
```

Over several lines, it goes up to a \} on its own line.

```
@latex {
    \begin{aligned}
      F &= ma \\
        &= 19.6\,\mathrm{N}
    \end{aligned}
}
```

A name can be shown as words, with a setting in quotes on the name being assigned: n\_Na:"Moles of \{Na^+\}" = …. It's shown so wherever the variable is: on its own line, in later substitutions and in the exports.

- It can hold formulas and values; a value in it is the one when the variable was defined. It combines with the other settings: n:3:"Moles":sci = ….
- Subscripts work as in names: m\_ball, x\_\{max\}, F\_net\_x; one starting with a capital letter is a formula, m\_\{H2O\}. \$…\$ is maths.

```
V_s = 25.00 mL
n_X = 0.00120 mol
n_Ca:"Moles of {Ca^2+} in {{V_s}}" = n_X / 6
```

A line that leaves a ( or \[ open carries on over the lines after it, up to the one that closes it, so a long @series, @table or @plot (or any call, or a matrix) can list one thing a line.

- The lines inside are indented further than the first; the closing bracket can be under the first line. A blank line, or one not indented further, ends it.
- A trailing comma before the closing bracket is fine (the formatter takes it out). \#commands and notes can go on any of its lines.
- The formatter (Ctrl+Shift+F, or saving) lays it out so.

```
t = @series(
    1.52 s,
    1.48 s,
    1.55 s
)
```

Title \{ … \} is a block. Variables assigned inside are local to it.

- Indent the lines inside 4 spaces.
- Title \{  \#hide works the whole block out without showing it.
- Don't end a line with : to start a block: write Title \{.
- Inside a block you can read everything defined above it, in the blocks around it too.
- What's assigned inside is gone at its \}; a name that's outside too is shadowed, and the outer value is as it was.
- A block without a title has no title bar: just its lines, in a card.
- A block's title can be a heading: \# Kinematics \{ titles it as a numbered section, \#\# Energy \{ as a subsection. Commands and a note go after the \{.

```
g = 9.81 m/s^2
Steeper ramp {
    theta = 45.0 deg
    a = g * sin(theta)
}
```

```
# Kinematics {
    v = 2.0 m/s
    t = 3.0 s
    d = v * t
}
```

## Units

A unit goes right after the number. Compound units have no spaces.

- A unit goes right after a number: 9.81 m/s^2, 2.00 kg, 5.0 um (micro is u). Never after a name (m kg).
- Compound units have no spaces: kg\*m^2, J/mol/K.
- Litres are L and mL. Use kelvin for temperature.
- A unit right after a number is always a unit, even where a variable has its name: after m = 2.0 kg, 3.5 m is metres. To multiply by such a variable, write \*; a warning says when a line looks like that mistake.
- Micro is u (5.0 um, 2.0 uF), or typed as µ or μ (5.0 µm); μ alone is still a name.
- A value you type keeps its unit wherever it's shown later: L = 1.00e-10 m stays in m.
- Worked-out results are shown in tidy units (N/kg is m/s², kg m/s² is N) with a sensible prefix, none beyond pico and tera; a single unit with a fractional power (Å^-1.5) is kept as it is.

```
g = 9.81 m/s^2
```

to converts to another unit.

| Written | Does |
| --- | --- |
| `to` | Convert to a unit: v to km/h, or to percent |

- A variable defined with to (a = @a\_0 to angstrom) keeps that unit.

```
v = 25.0 m/s
v to km/h
```

Ångström is angstrom (A is the ampere).

```
r = 0.400 angstrom
```

name:unit shows (and keeps) the result in that unit; a plain angle from atan or asin counts as radians. Combine it with sig figs in either order: phi:3:deg.

- A unit that doesn't fit is an error (3.0 m can't be shown in deg); a plain number takes only an angle unit this way. Uncertainties are converted too.

```
phi:3:deg = atan(1.00 / 2.00)
```

Angles in deg or rad; trig functions accept either.

- Trig takes radians unless given deg; asin, acos and atan give radians, so add to deg.

```
theta = 30.0 deg
```

to percent shows a unitless result ×100 (stored as the fraction). Values with units are refused.

| Written | Does |
| --- | --- |
| `percent` | a unitless result ×100, with % |

- The variable keeps the fraction, so later lines work with it.

```
P = 0.950 angstrom^-1
dr = 0.010 angstrom
shell = P * dr to percent
```

## Significant figures

Numbers with a decimal point or a unit are measured; whole numbers alone (the 2) are exact.

- Write 1/2, not 0.5, for an exact factor: 0.5 is a measurement with 1 sig fig, and rounds the answer to 1.
- × ÷, powers and functions: the fewest sig figs of the inputs. + −: the least precise decimal place (12.52 m + 3.1 m = 15.6 m).
- Values are kept at full precision and rounded only to be shown, so rounding doesn't build up; a substitution step shows each variable to its own sig figs.
- Trailing zeros that count show with a decimal point (20., 90.°); where one can't show the precision, scientific notation does: 1.50 × 10³.
- Sig figs in the Output options can be a number instead of Auto, to show every result to that many.

```
d = 2 * 1.50 m
```

Trailing zeros without a decimal point aren’t significant. Write 300. m if they are.

- Prefer values like 12.0 m and 30.0 deg; write 300. m or 3.00e2 m when the zeros count.

```
L = 300 m
```

A rounded result of exact inputs follows ≈. Measured results use =; Options can switch them to ≈ too.

- A value with a ± always uses =.
- A result of exact inputs isn't limited (1/3 ≈ 0.333333): write name:3 = … to choose.

```
q = pi / 4
F = 2.00 kg * 9.81 m/s^2
```

name:n = … sets the sig figs of a result.

- Settings go on the name being assigned, left of = only: d:km = …, N:sci = …, L:dec = ….
- Later lines count it as that many; its value is kept at full precision. It keeps them with a fixed Sig figs setting too.
- It's that assignment's: a later m = … without :n counts as written again.
- With a pm uncertainty, the uncertainty sets its precision, and :n is ignored, with a warning.
- It works in blocks, function bodies, @constants and with @solve (d:3 = @solve(…, d)).
- A function's result takes its sig figs from its expression, so a measured number in it carries through.

```
third:3 = 1/3
```

:exact shows full precision.

| Written | Does |
| --- | --- |
| `exact` | full precision; never limits a result |

```
third:exact = 1/3
```

:sci always shows scientific notation, :dec always plain digits. A variable keeps its notation wherever its value appears; combine with sig figs and units, like E:3:sci:eV.

| Written | Does |
| --- | --- |
| `sci` | always scientific notation |
| `dec` | always decimal notation, no powers of ten |

- Without them, numbers are plain digits, and scientific for very large or small values, or where digits can't show the precision.
- :sci always uses a power of ten (but not × 10⁰); :dec never does, even where its zeros then can't show the precision.
- It works with uncertainties ((1.50 ± 0.02) × 10³ m), tuples and their unpacked names, and a function's result (f(x):sci = …).

```
N:sci = 1500. * 12.0
lambda:dec = 5.32e-7 m
x = lambda / 2
```

Exponents written as plain numbers (^0.5, ^(3/2)) don’t limit sig figs.

```
side = (4.00 m^2)^0.5
```

A measured zero counts by decimal places, and doesn’t limit a function’s result.

```
theta = 0.00 deg
c = cos(theta)
```

## Uncertainty

pm (or ±) gives a value an uncertainty.

| Written | Does |
| --- | --- |
| `pm` | An uncertainty: 2.0 kg pm 0.1 kg (also ± or +-) |

- Write pm only where a value is defined, never inside a function's brackets: it propagates by itself.
- (2.0 pm 0.1) kg brackets it; 3.50 m pm 0.05 takes the value's unit. A value without pm has none.

```
d = 3.50 m pm 0.02 m
```

A percentage uncertainty.

```
m = 2.00 kg pm 2%
```

Results combine uncertainties in quadrature. delta v = shows how; delta v / v is the relative uncertainty.

| Written | Does |
| --- | --- |
| `delta` | The uncertainty of a variable: delta F |

- delta F (shown δF) is F's uncertainty; on its own line it shows the working of its propagation.
- It works through any formula, functions and blocks too.
- Correlations are kept: each pm is a source of its own, so in F = m \* a then G = F / m, m's uncertainty cancels, and m - m has none.
- delta and Delta mean an uncertainty only before a defined variable; otherwise they're δ and Δ, names like any other (delta = 5 deg). Write delta \* x to multiply.
- A worked-out uncertainty is given to 1 sig fig (2 if it starts with 1), and its value to the same place: (20 ± 1) N. A declared one keeps the precision typed; with a fixed Sig figs setting, 2 sig figs.
- The working's derivatives are left out when the formula has a unit written in it or a function of yours, or when its inputs share a source; the result still counts it.

```
d = 3.50 m pm 0.02 m
t = 1.21 s pm 0.03 s
v = d / t
delta v =
delta v / v
```

## Repeated measurements

Numbered variables form a series: t\_avg is the mean ± standard error, t\_count the count, t the sum.

| Written | Does |
| --- | --- |
| `t` | Sum of the series |
| `t_avg` | Mean, ± the standard error |
| `t_count` | Number of values |
| `t_std` | Sample standard deviation |
| `t_sem` | Standard error of the mean |

- T1, T2, … (or T\_1, T\_2) form a series T: T\_avg, T\_std, T\_sem, T\_count and T each show their working on a line of their own.
- t1 and t\_1 are the same name, whichever is written.
- Each on its own line shows its working: Σ notation, the members and their values. They're worked out each time they're used, so a t6 added later counts.
- A variable of your own with the name wins: after t = 9.0 s, t is that, though t\_avg is still the mean.
- The sum carries the members' pm uncertainties; the mean's is σ/√n, from their spread. delta t\_avg shows its working. Every use of a mean shares one source, so t\_avg twice in a formula is correlated.
- Members must have compatible units; results are in the first member's unit.
- A name matching one numbered variable is a series of one: psi, with psi\_200 defined.

```
t_1 = 1.21 s
t_2 = 1.17 s
t_3 = 1.24 s
t_avg
t_count
t
```

@import() opens a file chooser for a CSV file. Its rows go into the sheet under the line, folded away, and each value becomes a variable named for its column and row: t\_1, t\_2, …. A unit in a header, t (s), goes with that column.

- The first row names the columns; a unit in brackets, t (s) or t \[s\], goes with every value in it. Values keep their sig figs as typed; commas, tabs or semicolons separate them, and empty cells are skipped.
- A column dx (or δx, σx, delta\_x, sigma\_x, x\_unc, x\_err) holds x's uncertainties, each row's as if typed with pm, in its own unit or x's; dx (%) is a percentage. It makes no variables of its own.
- Name an import (run1 = @import(…)) to keep two files apart: run1.x\_avg.
- The data is kept in the sheet, and left out of the exports.

```
@import("ramp.csv")
    t (s), d (m)
    1.21, 3.50
    1.17, 3.48
    1.24, 3.52
t_avg
v = d_2 / t_2
```

@table(…) shows series side by side, a row per number. name = … works out a column row by row, and makes it a series of its own (v\_1, v\_2, …), so v\_avg works afterwards.

- A unit every value shares goes in the header; a value with an uncertainty shows as 3.0 ± 0.1; a row a series doesn't have shows —.
- An expression without a name (@table(x / t)) is just shown.
- A table of more than 60 rows shows its first 50 and last 5, with ⋮ between (all rows shows every one).
- Row labels are text, as a sheet's text is (\$…\$, \{KCl\}); a series of numbers labels with its values; a row it doesn't have is blank.
- In the exports it's a table, its title a numbered caption above it: in LaTeX a table float (tabularx), in Word a Word table, its header on each page.

```
t1 = 1.21 s
t2 = 1.17 s
t3 = 1.24 s
d1 = 3.50 m
d2 = 3.48 m
d3 = 3.52 m
@table(t, d, v = d / t)
v_avg
```

@series(…) makes a series on one line: its values listed (F\_1, F\_2, F\_3), or a rule worked out row by row from other series, with any other name used as it is. Series of different lengths use the rows they all have (with a warning); ; rows 2-5 works out just those.

- Each value is worked out as if typed on a line of its own, so units, sig figs, pm and settings on the name (m:3 = @series(F / g)) work.
- In a rule, a series' name is that row's value, and any other name is used as it is (its uncertainty from one source).
- It keeps the rows of the series it's from, so @table(d, t, v) lines up; if they have different rows, a warning says so, and ; rows … chooses.
- Making a series again replaces it. Its line shows the values (the first three and last two of a long one); \#sym the rule, \#val the values.

```
F = @series(2.00 N, 3.00 N, 10.0 N)
g_0 = 9.81 m/s^2 pm 0.02 m/s^2
m = @series(F / g_0)
m_avg
```

@plot(x axis, y series…) draws one series against another, with error bars for uncertainties. fit linear adds a best-fit line and its equation, and makes its slope and intercept variables: x\_slope, x\_intercept. Its settings, after a semicolon, are listed under Plot settings; the ⚙ after it sets them too.

- A named plot keeps its fit: p = @plot(x, y; fit linear), then p.slope, p.intercept and p.r2.
- Each axis is labelled with its name and unit; every y series must be in units that convert to the first one's.
- When every point has a y uncertainty the fit is weighted (each by 1/δy²), and the reduced χ²\_ν is shown: about 1 when the points scatter as their bars say. Otherwise its uncertainties come from the scatter.
- In a weighted fit x uncertainties count too, by the effective variance, 1/(δy² + (slope · δx)²); the line under the graph says which were used.
- What's on the axes is what's plotted: a point outside an axis's range isn't drawn, fitted, or in a named plot's series.
- With several series, each fit has its own: p.x\_slope, p.y\_slope. An unnamed plot makes x\_slope and x\_intercept.
- In LaTeX a plot is a pgfplots graph; in Word, a picture.

```
t1 = 0.10 s
t2 = 0.20 s
t3 = 0.30 s
t4 = 0.40 s
x1 = 0.051 m pm 0.004 m
x2 = 0.098 m pm 0.004 m
x3 = 0.152 m pm 0.004 m
x4 = 0.199 m pm 0.004 m
@plot(t, x; fit linear)
v = x_slope
```

@select(…) keeps the rows where its conditions hold, as new series under a name: a.t, a.x, numbered from 1. A named plot keeps its fit the same way: p.slope, p.intercept. Name an import too, run1 = @import(…), to keep two files apart.

- Its conditions all hold: t from 0.2 to 0.8 (either end can go), x to 0.16, rows 5-20. A bare number is in the series' unit, or give one: t from 250 ms.
- In a condition a name means the selected series of that name first: @select(run1.t, run1.x; t from 0.2).
- A selection doesn't copy: a.x\_1 is x\_2, with its sig figs and uncertainty, so x\_2 - a.x\_1 is exactly 0. a.x is shown x\_a.
- Names with a dot work alike wherever they're made: a selection, a named import (run1.x\_3), a named plot (p.x, p.slope). Typing a name and a dot suggests what it holds.

```
t1 = 0.10 s
t2 = 0.20 s
t3 = 0.30 s
t4 = 0.40 s
x1 = 0.020 m
x2 = 0.098 m
x3 = 0.152 m
x4 = 0.199 m
a = @select(t, x; t from 0.2)
p = @plot(a.t, a.x; fit linear)
v = p.slope
```

## Table settings

@table(…)'s settings go after a semicolon in its brackets, separated by commas: @table(…; lines header, numbers off). Leave out any as it is by itself. Its ⚙ in the editor sets them too.

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
salts = @series("KCl", "KBr", "KI", "NaCl", "NaBr", "NaI")
@table(t, x; lines header, numbers off)
```

`rows 5-20`: Only these rows: rows 5-20, rows 5- (from 5 on), rows -20 (up to 20), rows 7.

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
salts = @series("KCl", "KBr", "KI", "NaCl", "NaBr", "NaI")
@table(t, x; rows 5-20)
```

`lines header`: How its lines are drawn. header: a line under the header, and after the row headers; grid: a line around every cell (as it is by itself); none: no lines.

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
salts = @series("KCl", "KBr", "KI", "NaCl", "NaBr", "NaI")
@table(t, x; lines header)
```

`numbers off`: Row numbers down the side; numbers off leaves them out.

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
salts = @series("KCl", "KBr", "KI", "NaCl", "NaBr", "NaI")
@table(t, x; numbers off)
```

`labels salts`: A series' values down the side, in the row numbers' place.

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
salts = @series("KCl", "KBr", "KI", "NaCl", "NaBr", "NaI")
@table(t, x; labels salts)
```

`uncertainty off`: Each value with ± its uncertainty; uncertainty off shows the values alone.

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
salts = @series("KCl", "KBr", "KI", "NaCl", "NaBr", "NaI")
@table(t, x; uncertainty off)
```

`all rows`: Every row, even in a long table (one is normally shortened).

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
salts = @series("KCl", "KBr", "KI", "NaCl", "NaBr", "NaI")
@table(t, x; all rows)
```

`title "…"`: Its caption, quoted so it can hold commas: title "Reactivity of the halogens".

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
salts = @series("KCl", "KBr", "KI", "NaCl", "NaBr", "NaI")
@table(t, x; title "…")
```

## Plot settings

@plot(…)'s settings go after a semicolon in its brackets, separated by commas: @plot(…; style both, fit linear). Leave out any as it is by itself. Its ⚙ in the editor sets them too.

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
@plot(t, x; style both, fit linear)
```

`rows 5-20`: Only these rows: rows 5-20, rows 5- (from 5 on), rows -20 (up to 20), rows 7.

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
@plot(t, x; fit linear, rows 5-20)
```

`style both`: How its rows are drawn. points: each row a point (as it is by itself); lines: a line joining the rows, without their points; both: the points, joined by a line.

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
@plot(t, x; fit linear, style both)
```

`fit linear`: A line fitted to the points. none: no fit (as it is by itself); linear: a best-fit line, its equation under the plot, its slope and intercept variables.

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
@plot(t, x; fit linear)
```

`x from 0 to 10`, `log x`: The x axis's range (either end may be left out, to fit the data) and, with log x, a logarithmic scale.

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
@plot(t, x; fit linear, x from 0 to 10, log x)
```

`y from 0 to 10`, `log y`: The y axis's range and, with log y, a logarithmic scale.

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
@plot(t, x; fit linear, y from 0 to 10, log y)
```

`xlabel "Extension"`: The x axis’s name, in place of its series’ (its unit is still added: Extension \[m\]).

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
@plot(t, x; fit linear, xlabel "Extension")
```

`ylabel "Force"`: The y axis’s name, in place of its series’ (its unit is still added: Force \[N\]).

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
@plot(t, x; fit linear, ylabel "Force")
```

`uncertainty off`: Error bars for the points' uncertainties; uncertainty off hides them.

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
@plot(t, x; fit linear, uncertainty off)
```

`equation off`: A fit's equation and R² under the plot; equation off leaves them out (its slope and intercept are still variables).

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
@plot(t, x; fit linear, equation off)
```

`legend top right`: Where its legend goes, listing each series and fit; without it, top left when there are several series. top left: in the top left corner; top right: in the top right corner; bottom left: in the bottom left corner; bottom right: in the bottom right corner; outside: beside the plot; off: none.

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
@plot(t, x; fit linear, legend top right)
```

`colour fit red`: A colour for every series' points (with their error bars), line or fit; colour F\_2 points green for one series'. One of black, grey, blue, red, green, orange, purple, teal, brown.

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
@plot(t, x; colour fit red)
```

`title "…"`: A title over the plot, quoted so it can hold commas: title "Run 1".

```
t = @series(0.10 s, 0.20 s, 0.30 s, 0.40 s, 0.50 s, 0.60 s)
x = @series(0.051 m pm 0.004 m, 0.098 m pm 0.004 m, 0.152 m pm 0.004 m, 0.199 m pm 0.004 m, 0.248 m pm 0.004 m, 0.301 m pm 0.004 m)
@plot(t, x; fit linear, title "…")
```

## Functions

A one-line function, written as in maths.

- A function is one line, f(x) = …; it can use variables defined above it. There are no loops.
- A function reads variables from where it's defined; one defined in a \{ \} block is only seen in that block.
- Units, sig figs and uncertainties carry through a call. A variable the body reads from outside gives its value but not its uncertainty: pass it as a parameter if that matters.
- Your function wins over a built-in of the same name: sum(a, b) = ….

```
f(x) = 2 * x^2 + 1
y = f(3.0)
```

condition ? a : b gives a if the condition holds and b otherwise; conditions nest, for more than two cases.

- Conditions compare values: \<, \>, \<=, \>=, ==, and, or.
- It's typeset with a brace, as piecewise functions are, and the result has the sig figs of the value it came to.
- != and not work too. A comparison on a line of its own shows true or false: ok = sigma \< sigma\_allow.

```
ramp(x) = x > 0 ? x : 0
y = ramp(3.0)
friction(v, f_k) = v > 0 m/s ? -f_k : (v < 0 m/s ? f_k : 0 N)
F_f = friction(-1.5 m/s, 6.0 N)
```

The working shows the variables you passed in (r₁), not the parameter names.

- When the right-hand side is just the call, the line reads K = ½mv² = … (the function's expression); a call in a bigger expression is shown as usual.
- \#sym on the calling line shows the equation without values, \#val just the result.

```
area(r) = pi * r^2
r_1 = 2.0 cm
A = area(r_1)
```

name to unit converts that argument on the way in, so the working shows it in that unit. An argument in the wrong kind of unit, or with no unit, is an error.

- The definition shows the casts: E(n, m \[kg\], L \[m\]).
- A cast unit can't have spaces or brackets in it: write J/mol/K, not J/(mol\*K).

```
E(n, m to kg, L to m) = n^2 * @h^2 / (8*m*L^2)
m_e = 9.11e-31 kg
E_1 = E(1, m_e, 0.100 nm)
```

Settings after the parameters, f(x):3:deg, apply to every call’s result: its sig figs and unit, as on a variable.

- The definition says its unit after the equation (… in °); a tuple result takes it on each value.
- Settings on the calling line still win: w:2 = ang(y, x).

```
ang(y, x):3:deg = atan(y / x)
phi = ang(1.0, 2.0)
```

A function can return a tuple of values, such as coordinates.

```
polar(x, y) = @tuple(sqrt(x^2 + y^2), atan2(y, x))
P = polar(1.00 m, 1.00 m)
```

@inv(x) is 1/x, written as the fraction turned over rather than with ⁻¹: @inv(m / V) is V/m, and a value whose unit is a fraction is turned over whole, so a conversion factor reads flipped, as in factor-label working.

- Units, species, sig figs and uncertainty follow as for any division. Zero, or a tuple, has nothing to turn over.

```
T = 2.0 s
f = @inv(T)
```

## Vectors

\<…\> is a vector, shown ⟨…⟩. A unit after the \> applies to every component. Vectors scale and add, and norm, dot and cross work on them.

- @vector(3.0, 4.0) is the same vector as \<3.0, 4.0\>, written as a call.
- A vector is a tuple, so everything that works on tuples works on it: scaling, adding, to, norm, dot, cross and unpacking.
- What's worked out from a vector is a vector, and so is a function's result when its body writes one (f(x) = \<x, 2\*x\>); a plain tuple stays a tuple.
- Each typed component keeps its own sig figs; what's worked out has the fewest of its components'.
- \< starts a vector only where a value can start, and with a comma inside, so a \< b is still a comparison.

```
F = <3.0, 4.0> N
F_2 = 2 * F + <1.0, -1.0> N
mag = norm(F)
```

```
v = @vector(3.0 m/s, 4.0 m/s)
speed = norm(v)
```

name:ijk shows a vector with unit vectors, î ĵ k̂. Vectors worked out from it are shown that way too.

- It works on a function's result: f(x):ijk = ….

```
v:ijk = <2.0, -1.5, 4.0> m/s
w = 2 * v
```

name:xyz also makes each component a variable of its own, a\_x, a\_y (and a\_z), shown under the vector.

- It combines with the other settings (F\_net:3:ijk:xyz) and works in function bodies. With \#sym, the components are made but not shown.

```
a:xyz = <0.50, -9.81> m/s^2
t = 2.0 s
d_y = 1/2 * a_y * t^2
```

## Tuples and coordinates

@tuple(…) makes a tuple, shown as (x, y, z). A shared unit is written once; tuples scale, add, convert with to, and norm, dot and cross work on them.

- Don't write (a, b) for a pair: write @tuple(a, b). \<3.0, 4.0\> N is a vector.
- A unit every value shares is written once, after the bracket; values with different units keep their own: (1.41 m, 45.0°).
- A display unit (r:cm = …) applies to every value.
- A bracketed list, (1, 2), is an error that points to @tuple(1, 2): brackets only group, or call a function.
- For now, uncertainties don't carry into a tuple's values.

```
r = @tuple(1.00 m, 2.00 m, 3.00 m)
s = 2 * r
d = norm(r)
```

@tuple(a, b) = … unpacks a tuple: each value becomes a variable of its own. Each name can take sig figs and a unit, like b:cm or theta:3:deg.

- The right-hand side can be any tuple, a function's result too: @tuple(r, theta) = polar(x, y). It works in function bodies.
- Each name keeps its settings afterwards.

```
p = @tuple(1.414 m, 0.7854)
@tuple(r:3, theta:deg) = p
x = r * cos(theta)
```

## Constants

Built-in constants start with @ and default to 3 sig figs (list below).

- The rounded value counts as a measured value with that many sig figs, as when a problem says use g = 9.81 m/s².
- Constants carry units, so conversions work: @R gives litres with to L.
- A mistyped name suggests the nearest: @kb, Did you mean @k\_B?
- @e is the elementary charge and @g standard gravity: they don't clash with Euler's e, grams, or a g of your own.
- The values are CODATA 2018 (exact means exact by definition in the SI). The elements' molar masses are in @chem.

```
E = @h * @c / 532 nm to eV
```

@name:n uses n sig figs here; @name:exact uses full precision.

```
F = @G:5 * 5.972e24 kg * 70.0 kg / (6.371e6 m)^2
```

A line with only @name:n sets that constant’s precision for the whole sheet.

- It applies to the whole sheet, lines above it and constants defined from it too, and its line shows the value it sets. A use with its own :n still wins; a second declaration is ignored, with a warning. It can go in an @constants \{ \} block.

```
@c:4
t = 1.000 m / @c
```

Add to unit to show the constant in that unit everywhere.

```
@a_0:3 to angstrom
r = 2 * @a_0
```

Define your own constants, usable anywhere in the sheet as @name.

- They're usable anywhere as @name, above the block too.
- They default to the precision they're written with; :n and :exact work as for built-ins.
- They can use units, other constants and pm uncertainties, but not the sheet's variables: they're worked out first.
- One with a built-in's name takes its place.

```
@constants {
    rho_w = 998 kg/m^3   # water at 20 °C
}
P = @rho_w * @g * 0.250 m to kPa
```

## Chemistry

A formula goes in single braces, anywhere text is: prose, headings, block titles, display names. On a line of its own it's a reaction, drawn but not worked out.

- Inside the braces: counts as digits, a charge after ^ (Ca^2+, OH^-; Na+ works too), a state in brackets, a coefficient before, arrows (-\>, \<=\>), a hydrate's dot as \*.
- \{\{…\}\} is still a value. Formulas are drawn with mhchem, which the LaTeX export loads when the sheet has one.

```
> The {Na^+} concentration.
{OH^-(aq) + H3O^+(aq) -> 2 H2O(l)}
```

M is mol/L, with mM and µM; a worked-out concentration is shown in M. MPa is still megapascals, and M is still free as a name.

```
c = 0.100 M
V = 25.0 mL
n = c * V
```

@chem.substance is a substance: its molar mass (.M), and an amount of it (.n, 1 mol until set) and its mass (.m); each element’s amount, mass, molar mass and mass fraction in it (.H.n, .H.m, .H.M, .H.w). A member on its own line shows how it’s worked out.

- A substance's molar mass comes from its formula (brackets and a hydrate's \* work); set any amount or mass and the rest follow.
- Its members: X.M its molar mass, X.n its amount (1 mol until set), X.m its mass, and each element's X.E.n, X.E.m, X.E.M and X.E.w (its mass fraction).
- A member on a line of its own shows how it's worked out, back to what was set; in a calculation it's a value like any other.
- Atomic weights are IUPAC's abridged standard atomic weights (2021), their digits as sig figs; an element with no stable isotope has its longest-lived isotope's mass number.
- Groups in brackets work (Ca(OH)2, K4\[Fe(CN)6\]). A charge or state doesn't change the molar mass, but is part of the species. Symbols are case-sensitive: \{Co\} is cobalt, \{CO\} carbon monoxide.
- In a formula of parts joined by \*, a number against a part is how many of it: \{7Ca(IO3)2\*8CaCrO4\} is 7 Ca(IO3)2 and 8 CaCrO4.
- A substance is one formula, with no count in front: for 2 mol of water, set H2O.n = 2. A mass worked out from grams stays in grams.

```
H2SO4 = @chem.substance({H2SO4})
H2SO4.n = 2.00 mol
H2SO4.m
H2SO4.H.m
H2SO4.H.w
```

Set any amount or mass, the substance’s or an element’s, and the rest follow from it, from that line on. A formula can have groups in brackets and a hydrate’s water after \*; a charge or state is left out of the molar mass.

- A value with no unit is read as mol or g; one already of a species (from a mole ratio) is used as it is. Molar masses and mass fractions follow from the formula, so they can't be set.

```
CuSO4 = @chem.substance({CuSO4*5H2O})
CuSO4.m = 5.00 g
CuSO4.n
CuSO4.O.m
```

\{formula\} after a value is its species: on g a mass of it, on mol an amount, on g/mol a molar mass. Once there are species, every mass, amount and molar mass needs one.

- A formula goes in single braces: \{Na^+\}, \{Ca^2+\}, \{H3O^+(aq)\}, \{2 H2O(l)\} (counts as digits, a charge after ^, a state in brackets).
- Species are strict: once a calculation has species, give every mass, amount and molar mass in it its species. Go from one species to another only with a mole ratio, (1 mol \{X\}) / (1 mol \{EDTA\}).
- M is molarity (mol/L). A whole number of a species (1 mol \{X\}) is exact.
- What \{H2O\} makes a value follows from its unit: a mass, an amount (mol, M), a mass concentration (g/L), a molar mass (g/mol); with no mass or amount, it's an error.
- It can follow a unit, a bracket or a name (n\_1 \{H2O\}). A value of one species can't be given another.
- Species cancel as units do, and to keeps the species: n to mmol is in mmol NaOH. 1 mol on its own, as in a molar mass (18.02 g / 1 mol), is exact too.

```
NaOH = @chem.substance({NaOH})
m = 5.00 g {NaOH}
n = m / NaOH.M
```

@chem.species names a species: \{dietzeite\} is its formula wherever braces take one, shown by its name (declare it :formula, or put :formula on a line, to show the formula).

- Names apply to the whole sheet, above the block too; a block names several: @chem.species \{ … \}.
- A name can't be something braces already read: a formula (CO), an electron (e) or a state (aq, s, l, g). What it names needn't be a formula: \{EDTA\} is a species too.
- In a reaction it's drawn by its formula, and its member is the name: r.dietzeite.

```
@chem.species dietzeite = {7Ca(IO3)2*8CaCrO4}
D = @chem.substance({dietzeite})
m = 5.00 g {dietzeite}
n = m / D.M
```

```
@chem.species dietzeite = {7Ca(IO3)2*8CaCrO4}
m:formula = 5.00 g {dietzeite}
n:name = 0.0100 mol {dietzeite}
```

@chem.reaction checks a reaction balances; each coefficient is a member, an exact amount, so r.H2O / r.H2 is a mole ratio.

- It's checked atom by atom and by charge: \{H2 + O2 -\> H2O\} says O has 2 on the left and 1 on the right. Electrons are e^-; the arrow can be -\>, \<=\>, \<-\> or =.
- A species whose formula isn't a name is a member by its letters and digits: Ca(OH)2 is r.CaOH2, Na^+ is r.Na.
- A name's subscript that's a formula (n\_H2O, c\_NaCl) is drawn as chemistry; a single letter, or labels that aren't elements (v\_AB), stay as they are.

```
r = @chem.reaction({2 H2 + O2 -> 2 H2O})
H2 = @chem.substance({H2})
H2O = @chem.substance({H2O})
H2.m = 4.00 g
H2O.n = H2.n * r.H2O / r.H2
H2O.m
```

@inv(x) is 1/x, written turned over: a molar mass as 1 mol over its grams, a conversion factor flipped. @inv(m / V) is V/m.

```
H2O = @chem.substance({H2O})
n = 36.0 g {H2O} * @inv(H2O.M)
```

Amounts of different species can’t be added with +; @chem.total adds them as plain amounts.

```
n_Na = 0.100 mol {Na^+}
n_Cl = 0.200 mol {Cl^-}
n = @chem.total(n_Na, n_Cl)
```

A display-name template: words in quotes with \{\{x\}\} where each argument goes, used as a setting on a name. A subscript starting with a capital is drawn as a formula.

- A display name goes on the name being assigned: n\_Na:"Moles of \{Na^+\}" = …; it can hold values: "Moles in \{\{V\}\}".
- Arguments are text, as written, separated by commas. A \{\{name\}\} that isn't a parameter is a value.
- Braces around a parameter make it a formula: conc(ion) = "\[\{\{\{ion\}\}\}\]".

```
massName(x) = "m_{{x}}"
m_w:massName(H2O) = 18.02 g
m_s:massName(NaCl) = 5.85 g
```

## Display commands

\#sym shows the equation only.

| Written | Does |
| --- | --- |
| `#sym` | Show the equation only |

- A command goes before or after the note: F = m \* a  \#val  \# weight is F = m \* a  \# weight  \#val.
- Commands combine: \#sym \#multiline.
- On a line that's just a name (delta F, t\_avg), \#sym shows how it's worked out (δF = √(…)), and \#val its name and value.
- Only these words are commands: any other \#word (\#3) stays part of the note.

```
F = 2.00 kg * 9.81 m/s^2   #sym
```

\#val shows the result only.

| Written | Does |
| --- | --- |
| `#val` | Show the result only |

```
F = 2.00 kg * 9.81 m/s^2   #val
```

A variable defined with \#sym stays a symbol in later lines' substitution steps (F = k·x = k · 0.150 m), though its value is used in every calculation; in a function's working too, and for a \#sym block's variables.

- Defining it again without \#sym brings its value back into substitutions.

```
k = 4.0 N/m * 2   #sym
x = 0.150 m
F = k * x
```

\#sci shows the result in scientific notation, \#dec in plain digits: for a line with no name to put :sci on, or a whole block.

| Written | Does |
| --- | --- |
| `#sci` | Results in scientific notation (on a line, or every line in a block) |
| `#dec` | Results in plain decimal digits, no powers of ten (on a line, or every line in a block) |

- They only change how the line is shown: the variable doesn't keep the notation (write x:sci = … for that).
- A name's own :sci or :dec beats the line's command, which beats a variable's own notation, which beats the block's.

```
p = 0.0707
p^2   #sci
```

\#hide calculates the line but doesn’t show it.

| Written | Does |
| --- | --- |
| `#hide` | Calculate, but don’t show the line or block |

- Hidden lines and blocks are left out of the exports too, but their variables can still be used. A hidden line with an error is shown anyway.

```
m = 2.00 kg   #hide
F = m * 9.81 m/s^2
```

\#multiline puts each = on its own row, lined up. It combines with the others (\#sym \#multiline), and works on a block.

| Written | Does |
| --- | --- |
| `#multiline` | Each = on its own row, lined up |

- A line with only one = left to show stays on one line.

```
m = 2.00 kg
F = m * 9.81 m/s^2   #multiline
```

On a function (f(x) = …), every line that calls it is shown multiline.

```
area(r) = pi * r^2   #multiline
r_1 = 2.0 cm
A = area(r_1)
```

On a block, a command applies to every line inside; a line’s own command (\#full) wins.

| Written | Does |
| --- | --- |
| `#full` | Show everything (the default; overrides a block’s command) |

- It applies to the blocks inside too; \#hide on a block hides all of it.
- To give some lines a command without scoping their variables, use an @layout block: @layout.val \{, @layout.hidden \{.

```
Results only {   #val
    F = 2.00 kg * 9.81 m/s^2
    p = 2.00 kg * 3.00 m/s   #full
}
```

## Layout

@layout.list makes the lines up to its \} bullets; indent further for a sub-list. The title is optional.

- Indent further for a sub-list; anywhere else, indenting the lines inside is for reading only.
- A layout block only arranges lines: what's assigned inside stays available after it (a Title \{ \} block scopes it).
- Its title is optional. A note after the opener shows beside the title, and display commands on the opener apply to the lines inside.
- In the LaTeX export, lists are itemize and enumerate (each calculation inline beside its marker), and centred blocks center.

```
@layout.list Assumptions {
    > The box is one-dimensional
    > The walls are infinitely high
        > so ψ = 0 at the walls
}
```

@layout.numbered makes a numbered list. Variables assigned inside stay available afterwards (unlike Title \{ \} blocks).

```
@layout.numbered Steps {
    m = 2.00 kg
    F = m * 9.81 m/s^2
}
```

@layout.center centers the lines. The title is optional: “@layout.center \{” on its own works too.

```
@layout.center Key result {
    E = 2.00 kg * (3.00e8 m/s)^2
}
```

@layout.titlepage makes a title page of prose: the first line is the title, bold and larger; each line after it is centered on its own. The exports start a new page after it.

- Its lines are prose (no \>, nothing worked out; \{\{values\}\} and \$…\$ work), each a line of its own; a blank line leaves a gap.
- A title on the opener (@layout.titlepage Lab 3 \{) is the title instead, and every line inside goes under it.
- In the exports it's a page of its own; in the Rendered tab a dashed line marks where the page ends.

```
@layout.titlepage {
    Lab 3: Motion on a ramp
    Emily Waters
    PHYS 101, Section B
}
```

@layout.hidden works out the lines inside without showing them; what they define is usable after it.

```
@layout.hidden {
    m = 2.00 kg
    g_0 = 9.81 m/s^2
}
F = m * g_0
```

.sym, .val, .full, .multiline, .sci and .dec set how every line inside is shown, as their \#commands do on a line. Members combine (@layout.numbered.val); a line’s own command still wins.

- Members combine in any order: a layout with display settings (@layout.numbered.val), or display settings alone (@layout.val.multiline).
- Some can't both apply, and are warned of: of two layouts the first is used; of two of .sym, .val and .full (or .sci and .dec) the last; on prose only .hidden does anything.
- The members win over \#commands on the opener.

```
@layout.val.multiline Results {
    F = 2.00 kg * 9.81 m/s^2
    p = 2.00 kg * 3.00 m/s   #full
}
```

```
m = 2.00 kg
@layout.sym.multiline Formulas {
    F = m * 9.81 m/s^2
}
@layout.full.sci Results {
    N = 6.02e23 * 2.00
}
@layout.dec {
    lambda = 5.32e-7 m
}
```

On a single line, \#center centers just that line (\#list and \#numbered work too).

| Written | Does |
| --- | --- |
| `#center` | Center the line (for a block of lines: @layout.center \{ \}) |
| `#list` | The line as a bullet (for a block of lines: @layout.list \{ \}) |
| `#numbered` | The line as a numbered item (for a block of lines: @layout.numbered \{ \}) |

```
F = 2.00 kg * 9.81 m/s^2   #center
```

@layout.text makes a block of prose: lines join into paragraphs (a blank line starts a new one), \$…\$ is maths, and nothing is calculated.

- Nothing in it is worked out: a line that looks like a calculation or a heading is just text.

```
@layout.text Discussion {
    The measured acceleration is lower than g sin θ, because
    the ramp isn’t frictionless: $\mu_k \approx 0.05$ would explain it.

    A blank line starts a new paragraph.
}
```

@layout.column sets the lines inside side by side in columns: a blank line starts the next column, and each block inside is a column of its own. A row has up to 4; @layout.column(n) sets n a row (2 to 4). With no breaks, the lines are shared out evenly. It combines with a layout, which then applies within each column: @layout.column(3).numbered.

- Each block inside (a Title \{ \} block, another layout block, @constants) is a column of its own, whatever blank lines are in it.
- A numbered list's count carries on from column to column. In .text prose, where a blank line starts a paragraph, two start a column.
- In the exports each column is a minipage (LaTeX) or a borderless table's cell (Word), and a long equation goes one = per row sooner.

```
@layout.column Givens {
    m = 2.00 kg
    g_0 = 9.81 m/s^2

    theta = 30.0 deg
    d = 3.50 m
}
```

```
m = 2.00 kg
g_0 = 9.81 m/s^2
theta = 30.0 deg
@layout.column {
    Forces {
        F_g = m * g_0
    }
    Motion {
        a = g_0 * sin(theta)
    }
}
```

## Solving

@solve(equation, unknown) rearranges for the unknown and evaluates it.

- Give a guess for a hard one: @solve(x = cos(x), x, 0.5).
- The result is an ordinary formula: units, sig figs, uncertainty, \#sym and \#val work.
- @solve(…) is the whole right-hand side, with to after it if wanted: theta = @solve(…, theta) to deg. On a line of its own, without =, it shows the answer without keeping it.
- The unknown is solved for even if it has a value; assigning the result replaces it.
- It rearranges when the unknown appears once, collects terms when it's linear, uses the quadratic formula when quadratic, and otherwise works numerically from a guess (which sets the units too: @solve(…, T, 300 K)).
- With more than one solution (x², √, sin, cos, \|x\|, a quadratic), the principal or positive one is used and the others are noted; a guess chooses the one nearest it.
- to percent isn't supported on a solve line yet.

```
v = 5.00 m/s
a = 2.00 m/s^2
d = @solve(v^2 = 2*a*d, d)
```

Several unknowns: name them in @tuple(…) on the left, and give as many equations. They are solved by substitution, and the working shows each unknown in turn.

- Give as many equations as unknowns: linear ones, or ones easily rearranged.
- They're solved by substitution, as by hand; the working shows each unknown's formula, values and result.
- Each unknown is an ordinary variable afterwards; settings go on the names: @tuple(T:3, a:2) = ….
- Each step must be one a single equation's solve can do; of a quadratic's two solutions the first is used. Equations that contradict or repeat each other give an error.

```
m_1 = 3.00 kg
m_2 = 5.00 kg
@tuple(T, a) = @solve(T - m_1 * @g = m_1 * a, m_2 * @g - T = m_2 * a)
```

## Built-in constants

Write `@name` (3 sig figs), `@name:n`, or `@name:exact`.

| Constant | What it is |
| --- | --- |
| `@c` | speed of light in vacuum (exact) |
| `@h` | Planck constant (exact) |
| `@hbar` | reduced Planck constant |
| `@e` | elementary charge (exact) |
| `@k_B` | Boltzmann constant (exact) |
| `@N_A` | Avogadro constant (exact) |
| `@R` | molar gas constant |
| `@F` | Faraday constant |
| `@G` | gravitational constant |
| `@g` | standard gravity (exact) |
| `@k_e` | Coulomb constant |
| `@epsilon_0` | vacuum permittivity |
| `@mu_0` | vacuum permeability |
| `@m_e` | electron mass |
| `@m_p` | proton mass |
| `@m_n` | neutron mass |
| `@u` | atomic mass unit |
| `@a_0` | Bohr radius |
| `@sigma` | Stefan–Boltzmann constant |
| `@atm` | standard atmosphere (exact) |
| `@V_m` | molar volume of an ideal gas at 0 °C, 1 atm |
