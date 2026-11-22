# MathScribe reference

Everything a sheet can say, by topic: how each thing is written, what it does, the rules for
writing it, and examples, each a whole sheet you can paste in. The Reference tab in the app
shows the same, with each example worked out beside it.

<!-- Made from the language tree (src/lib/language/), as the Reference tab and the AI primer are:
don't edit it by hand. `npx vitest run -u` writes it again after the tree changes. -->

**Topics:** [Basics](#basics) · [Units](#units) · [Significant figures](#significant-figures) · [Uncertainty](#uncertainty) · [Repeated measurements](#repeated-measurements) · [Table settings](#table-settings) · [Plot settings](#plot-settings) · [Functions](#functions) · [Vectors](#vectors) · [Tuples and coordinates](#tuples-and-coordinates) · [Constants](#constants) · [Chemistry](#chemistry) · [Display commands](#display-commands) · [Layout](#layout) · [Solving](#solving) · [Built-in constants](#built-in-constants)

## Basics

Assign a value. Text after \# is a note shown beside the result.

- Text after \` \# \` on a calculation is its note: two spaces or more before the \#.

```
m = 2.00 kg   # mass of the block
```

// starts a comment, never shown. A blank line is spacing; two leave a gap in the output.

- Don't use \# for a comment on its own line: it makes a heading.

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

```
r = 2.00 m
A = pi * r^2
h = sqrt(2 * 9.81 m/s^2 * 1.20 m)
```

Headings. \# and \#\# are numbered, like LaTeX sections. In headings and block titles, a\_b is a subscript (write \\\_ for a plain underscore) and \$…\$ is maths.

- A line starting with \# is always a heading: write // for a comment.

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

Title \{ … \} is a block. Variables assigned inside are local to it.

- Indent the lines inside 4 spaces.
- Title \{  \#hide works the whole block out without showing it.
- Don't end a line with : to start a block: write Title \{.

```
g = 9.81 m/s^2
Steeper ramp {
    theta = 45.0 deg
    a = g * sin(theta)
}
```

## Units

A unit goes right after the number. Compound units have no spaces.

- A unit goes right after a number: 9.81 m/s^2, 2.00 kg, 5.0 um (micro is u). Never after a name (m kg).
- Compound units have no spaces: kg\*m^2, J/mol/K.
- Litres are L and mL. Use kelvin for temperature.

```
g = 9.81 m/s^2
```

to converts to another unit.

| Written | Does |
| --- | --- |
| `to` | Convert to a unit: v to km/h, or to percent |

```
v = 25.0 m/s
v to km/h
```

Ångström is angstrom (A is the ampere).

```
r = 0.400 angstrom
```

name:unit shows (and keeps) the result in that unit; a plain angle from atan or asin counts as radians. Combine it with sig figs in either order: phi:3:deg.

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

```
P = 0.950 angstrom^-1
dr = 0.010 angstrom
shell = P * dr to percent
```

## Significant figures

Numbers with a decimal point or a unit are measured; whole numbers alone (the 2) are exact.

- Write 1/2, not 0.5, for an exact factor: 0.5 is a measurement with 1 sig fig, and rounds the answer to 1.

```
d = 2 * 1.50 m
```

Trailing zeros without a decimal point aren’t significant. Write 300. m if they are.

- Prefer values like 12.0 m and 30.0 deg; write 300. m or 3.00e2 m when the zeros count.

```
L = 300 m
```

A rounded result of exact inputs follows ≈. Measured results use =; Options can switch them to ≈ too.

```
q = pi / 4
F = 2.00 kg * 9.81 m/s^2
```

name:n = … sets the sig figs of a result.

- Settings go on the name being assigned, left of = only: d:km = …, N:sci = …, L:dec = ….

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

```
t_1 = 1.21 s
t_2 = 1.17 s
t_3 = 1.24 s
t_avg
t_count
t
```

@import() opens a file chooser for a CSV file. Its rows go into the sheet under the line, folded away, and each value becomes a variable named for its column and row: t\_1, t\_2, …. A unit in a header, t (s), goes with that column.

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

```
F = @series(2.00 N, 3.00 N, 10.0 N)
g_0 = 9.81 m/s^2 pm 0.02 m/s^2
m = @series(F / g_0)
m_avg
```

@plot(x axis, y series…) draws one series against another, with error bars for uncertainties. fit linear adds a best-fit line and its equation, and makes its slope and intercept variables: x\_slope, x\_intercept. Its settings, after a semicolon, are listed under Plot settings; the ⚙ after it sets them too.

- A named plot keeps its fit: p = @plot(x, y; fit linear), then p.slope, p.intercept and p.r2.

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

```
f(x) = 2 * x^2 + 1
y = f(3.0)
```

condition ? a : b gives a if the condition holds and b otherwise; conditions nest, for more than two cases.

- Conditions compare values: \<, \>, \<=, \>=, ==, and, or.

```
ramp(x) = x > 0 ? x : 0
y = ramp(3.0)
friction(v, f_k) = v > 0 m/s ? -f_k : (v < 0 m/s ? f_k : 0 N)
F_f = friction(-1.5 m/s, 6.0 N)
```

The working shows the variables you passed in (r₁), not the parameter names.

```
area(r) = pi * r^2
r_1 = 2.0 cm
A = area(r_1)
```

name to unit converts that argument on the way in, so the working shows it in that unit. An argument in the wrong kind of unit, or with no unit, is an error.

```
E(n, m to kg, L to m) = n^2 * @h^2 / (8*m*L^2)
m_e = 9.11e-31 kg
E_1 = E(1, m_e, 0.100 nm)
```

Settings after the parameters, f(x):3:deg, apply to every call’s result: its sig figs and unit, as on a variable.

```
ang(y, x):3:deg = atan(y / x)
phi = ang(1.0, 2.0)
```

A function can return a tuple of values, such as coordinates.

```
polar(x, y) = @tuple(sqrt(x^2 + y^2), atan2(y, x))
P = polar(1.00 m, 1.00 m)
```

## Vectors

\<…\> is a vector, shown ⟨…⟩. A unit after the \> applies to every component. Vectors scale and add, and norm, dot and cross work on them.

- @vector(3.0, 4.0) is the same vector as \<3.0, 4.0\>, written as a call.

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

```
v:ijk = <2.0, -1.5, 4.0> m/s
w = 2 * v
```

name:xyz also makes each component a variable of its own, a\_x, a\_y (and a\_z), shown under the vector.

```
a:xyz = <0.50, -9.81> m/s^2
t = 2.0 s
d_y = 1/2 * a_y * t^2
```

## Tuples and coordinates

@tuple(…) makes a tuple, shown as (x, y, z). A shared unit is written once; tuples scale, add, convert with to, and norm, dot and cross work on them.

- Don't write (a, b) for a pair: write @tuple(a, b). \<3.0, 4.0\> N is a vector.

```
r = @tuple(1.00 m, 2.00 m, 3.00 m)
s = 2 * r
d = norm(r)
```

@tuple(a, b) = … unpacks a tuple: each value becomes a variable of its own. Each name can take sig figs and a unit, like b:cm or theta:3:deg.

```
p = @tuple(1.414 m, 0.7854)
@tuple(r:3, theta:deg) = p
x = r * cos(theta)
```

## Constants

Built-in constants start with @ and default to 3 sig figs (list below).

```
E = @h * @c / 532 nm to eV
```

@name:n uses n sig figs here; @name:exact uses full precision.

```
F = @G:5 * 5.972e24 kg * 70.0 kg / (6.371e6 m)^2
```

A line with only @name:n sets that constant’s precision for the whole sheet.

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

```
@constants {
    rho_w = 998 kg/m^3   # water at 20 °C
}
P = @rho_w * @g * 0.250 m to kPa
```

## Chemistry

@chem.substance is a substance: its molar mass (.M), and an amount of it (.n, 1 mol until set) and its mass (.m); each element’s amount, mass, molar mass and mass fraction in it (.H.n, .H.m, .H.M, .H.w). A member on its own line shows how it’s worked out.

- A substance's molar mass comes from its formula (brackets and a hydrate's \* work); set any amount or mass and the rest follow.

```
H2SO4 = @chem.substance({H2SO4})
H2SO4.n = 2.00 mol
H2SO4.m
H2SO4.H.m
H2SO4.H.w
```

Set any amount or mass, the substance’s or an element’s, and the rest follow from it, from that line on. A formula can have groups in brackets and a hydrate’s water after \*; a charge or state is left out of the molar mass.

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

```
NaOH = @chem.substance({NaOH})
m = 5.00 g {NaOH}
n = m / NaOH.M
```

@chem.species names a species: \{dietzeite\} is its formula wherever braces take one, shown by its name (declare it :formula, or put :formula on a line, to show the formula).

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

\#sci shows the result in scientific notation, \#dec in plain digits: for a line with no name to put :sci on, or a whole block.

| Written | Does |
| --- | --- |
| `#sci` | Results in scientific notation (on a line, or every line in a block) |
| `#dec` | Results in plain decimal digits, no powers of ten (on a line, or every line in a block) |

```
p = 0.0707
p^2   #sci
```

\#hide calculates the line but doesn’t show it.

| Written | Does |
| --- | --- |
| `#hide` | Calculate, but don’t show the line or block |

```
m = 2.00 kg   #hide
F = m * 9.81 m/s^2
```

\#multiline puts each = on its own row, lined up. It combines with the others (\#sym \#multiline), and works on a block.

| Written | Does |
| --- | --- |
| `#multiline` | Each = on its own row, lined up |

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

```
Results only {   #val
    F = 2.00 kg * 9.81 m/s^2
    p = 2.00 kg * 3.00 m/s   #full
}
```

## Layout

@layout.list makes the lines up to its \} bullets; indent further for a sub-list. The title is optional.

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

```
@layout.text Discussion {
    The measured acceleration is lower than g sin θ, because
    the ramp isn’t frictionless: $\mu_k \approx 0.05$ would explain it.

    A blank line starts a new paragraph.
}
```

@layout.column sets the lines inside side by side in columns: a blank line starts the next column, and each block inside is a column of its own. A row has up to 4; @layout.column(n) sets n a row (2 to 4). With no breaks, the lines are shared out evenly. It combines with a layout, which then applies within each column: @layout.column(3).numbered.

```
@layout.column Givens {
    m = 2.00 kg
    g_0 = 9.81 m/s^2

    theta = 30.0 deg
    d = 3.50 m
}
```

## Solving

@solve(equation, unknown) rearranges for the unknown and evaluates it.

- Give a guess for a hard one: @solve(x = cos(x), x, 0.5).

```
v = 5.00 m/s
a = 2.00 m/s^2
d = @solve(v^2 = 2*a*d, d)
```

Several unknowns: name them in @tuple(…) on the left, and give as many equations. They are solved by substitution, and the working shows each unknown in turn.

- Give as many equations as unknowns: linear ones, or ones easily rearranged.

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
