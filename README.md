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
  - **LaTeX**: the whole sheet as a compilable `.tex` document, with **Copy** and
    **Download .tex**. It's laid out like the Rendered tab: equations flush left
    with notes on the right, compact spacing, a function's working indented above
    its line, and blocks as cards. The **Document ▾** menu sets the equations'
    alignment, spacing, cards (which use the standard `mdframed` package), section
    numbering, font size, paper, margins and an optional title, author and date;
    the choices are remembered in the browser.

    **Download .docx** saves the sheet as a Word document with the same layout and
    Document options, and with real Word equations you can edit (not pictures).
    Notes sit at the right margin beside their equation (under it, when the
    equation is too wide to share the line), blocks are cards with a shaded title,
    `#list` / `#numbered` blocks are Word lists, and headings use Word's Heading
    styles, so they appear in the navigation pane. For Google Docs, upload the
    file to Drive and open it with Google Docs; its equations become Google Docs
    equations.
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
  | Use ≈ for every rounded result | Off: ≈ only when every input is exact (`1/3 ≈ 0.333`); on: before any rounded result |
  | Show · in every product | Off: products as in a textbook, ½mv²; on: ½·m·v² |

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
| Ctrl+/ | Comment or uncomment the line (or selected lines) with `//` |
| Ctrl+Z / Ctrl+Y | Undo / redo |

On a Mac, use ⌘ for Ctrl. `def` bodies, `:` layout blocks and `{ }` blocks fold
from the arrows in the gutter.

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
| `@` | constants with their description and value, including your own `@constants` |
| a unit, after a number or `to` | units, with what they are in SI (`angstrom = 1e-10 m`); `percent` after `to` |
| `#` after a line's text | display commands, with what each does |
| `\` and a Greek letter's name | the letter: `\Delta` gives Δ (see Greek letters) |

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

| Line | Meaning |
| --- | --- |
| `m = 2.0 kg` | define a variable (with a unit) |
| `F = m * a` | compute from earlier variables |
| `F to kN`, `v = d / t to km/h` | convert units |
| `f = P * dr to percent` | show a unitless result as a percentage |
| `f(x) = x^2 + 1`, then `f(3)` | define and call a function |
| `E(n, m to kg) = …` | a function whose argument is converted to kg |
| `phi:3:deg = atan(y/x)` | show a result to 3 sig figs, in degrees |
| `N:sci = …`, `L:dec = …` | always scientific notation, or always plain digits |
| `F = <3.0, 4.0> N` | a vector |
| `F:ijk = …`, `F:xyz = …` | a vector with unit vectors, or broken into components F_x, F_y |
| `r = tuple(x, y, z)` | a tuple, such as coordinates |
| `tuple(a, b, c) = r` | unpack a tuple into variables |
| `x = 3  # note` | text after `#` becomes the line's description |
| `x = 3  #val` | a display command (see below) |
| `# Title` | `\section{Title}`, numbered 1, 2, … |
| `## Title` | `\subsection{Title}`, numbered 1.1, 1.2, … |
| `### Title` (or more `#`) | `\textbf{Title}` bold run-in heading |
| `> Some text` | paragraph; `$...$` for inline LaTeX |
| `> It took {{V_avg}}.` | a variable's value in text (see Values in text) |
| `// a note to self` | a comment: never shown or worked out |
| `$ \LaTeX` | raw LaTeX, displayed but not evaluated |
| `Title {` … `}` | a block that scopes its variables |
| `Title:  #numbered` + indented lines | a layout block: centered, bulleted or numbered |
| `Title:  #text` + indented lines | a block of prose: paragraphs, nothing calculated |
| `@c`, `@a_0:3 to angstrom` | constants, and setting their precision and unit |

**Subscripts in headings and block titles:** as in variable names, `_` makes a
subscript: `Hydrogen 2p_z orbital {` shows 2p with a subscript z, and `x_{max}`
takes a longer one. Write `\_` for a plain underscore. `$…$` adds inline maths,
as in `>` text: `## Energy $E_n = -13.6/n^2$ eV`. The LaTeX export uses
`\textsubscript` and `$…$` to match.

**Values in text:** `{{name}}` in a `>` line, a `#text` block, a heading or a
block's title puts in the variable's value, as it is at that point in the sheet,
with its unit, sig figs and any uncertainty. Numbers in your discussion then stay
right when the data changes.

```
V1 = 27.55 mL
V2 = 27.10 mL
> The average volume was {{V_avg}}, or {{V_avg to L}}.   → (27.3 ± 0.2) mL, or (0.0273 ± 0.0002) L
## Moles in {{V1:3}} of solution                         → Moles in 27.6 mL of solution
```

- Settings go on the name as on any line (`{{x:3}}`, `{{x:sci}}`), and `to`
  converts. Any expression works too: `{{2 * m}}`, `{{delta F}}`, `{{a.x_1}}`.
- A value is worked out where the text is, so it must be defined above it. A name
  that isn't (or a typo) is marked as an error on that line, and left as typed.
- In the exports, each value is inline maths. Inside `$…$`, `{{…}}` is left alone.
- Typing `{{` suggests names, as in a calculation.

**Comments:** a line starting with `//` is never shown or worked out, wherever it
is: between calculations, inside a block or function, or in a `#text` block (where
it doesn't end the block or split a paragraph, even if it's indented less).
Ctrl+/ comments or uncomments the selected lines.

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
| `#sci`, `#dec` | the result in scientific notation, or plain digits | ψ² = 5.000 × 10⁻³ Å⁻¹ |
| `#center`, `#list`, `#numbered`, `#text` | layout (see Layout blocks) | |

```
F = m * a  #val  # weight
F = m * a  # weight  #val      (same thing)
F = m * a  #sym #multiline     (commands combine)
```

- `#multiline` is a layout, so it combines with `#sym`, `#val` and `#full`. A line
  with only one `=` left to show stays on one line. On a function's definition
  (`f(x) = …  #multiline`), every line that calls the function is shown multiline.
- `#sci` and `#dec` combine with the others too. They're for lines without a name to
  put `:sci` on (`psi_4^2  #sci`), and for whole blocks (`Q7 {  #sci`). They only
  change how the line is shown: the variable doesn't keep the notation (use
  `x:sci = …` for that). A name's own `:sci`/`:dec` beats the line's command, which
  beats a variable's own notation (`x` after `x:dec = …`), which beats the block's.
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

**Products:** type `*` between factors, and they're written as in a textbook:
`1/2 * m * v^2` shows ½mv², `m * @g * cos(theta)` shows mg cos θ, and `2 * pi * r`
shows 2πr. Values with a unit, or in scientific notation, are bracketed, so a
substitution step reads (2.00 kg)(9.81 m/s²), 4π(250.0 Å) and 8(9.11 × 10⁻³¹ kg).
A dot is kept where it's needed: before a number (`m · 2`), and between a number and
a fraction (2 · ½, not 2½). A word-like name gets a thin space (Fn m). Sums and
negative factors are bracketed: m(v + u), m(−v). Turn on *Show · in every product*
in the Output options for m·g·cos θ and 2.00 kg · 9.81 m/s².

**Brackets by nesting:** in the output, brackets with others inside them change,
as in textbooks: ( ) innermost, then [ ], then { }: `((a + b) * c)^2` shows
[(a + b)c]². A function call's brackets stay round, sin((a + b)c), and so do a
tuple's. What you type in the editor stays as you wrote it.

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
- `#text` makes a block of **prose**, for longer writing like a discussion or
  conclusion. Nothing inside it is calculated, so lines don't need `>`, and a line
  that looks like a calculation or a heading is just text. Lines run together into
  paragraphs, a blank line starts a new one, and `$…$` is inline maths:

  ```
  Discussion:   #text
      The measured acceleration is lower than g sin θ, because the
      ramp isn't frictionless: $\mu_k \approx 0.05$ would explain it.

      A blank line starts a new paragraph.
  ```
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
optional), then an indented body of `name = …` lines, usually ending in
`return …`. The two styles behave the same.

A `def` without a `return` gives no value, as in Python. Call it on a line of its
own (`steps(1.0, 2.0)`) to show its working; using it in a calculation
(`r = steps(1.0, 2.0)`) is an error, since there's nothing to store.

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

**Settings for the result:** write sig figs and a unit after the parameters, as on
a variable, and every call's result is shown (and kept) that way:

```
ang(y, x):3:deg = atan(y/x)
phi = ang(1.0, 2.0)               # 26.6°, to 3 sig figs

def polar(x, y):3                 # each value of the returned tuple to 3 sig figs
    …
```

The definition shows the unit as ang(y, x) → [°]. A tuple result takes the unit
on each value. Settings on the calling line still win: `w:2 = ang(y, x)`. A plain
trailing colon (`def f(x):`) works as before.

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
- For arranging lines without scoping them, use a layout block (`Title:`) instead.

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
- This happens where names are typed, not in headings, `>` text, `$` lines, notes
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
  scaling, adding, `to`, `norm`, `dot`, `cross` and unpacking. `vector(…)` is the
  same as `<…>`.
- What's worked out from a vector is a vector too, and so is a function's result
  when its body writes one (`f(x) = <x, 2*x>`). A plain tuple stays a tuple.
- Each typed component keeps its own sig figs: `<0.50, -9.81>` shows as typed.
  What's worked out from it has the fewest sig figs of its components, as with
  tuples.
- `<` only starts a vector where a value can start (after `=`, `(`, a comma, an
  operator or `return`) and when there's a comma inside, so `a < b` is still a
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

`tuple(…)` makes a **tuple**, such as a point's coordinates. It's shown in
brackets, as coordinates usually are:

```
r = tuple(1.00 m, 2.00 m, 3.00 m)   # (1.00, 2.00, 3.00) m
s = 2 * r                            # (2.00, 4.00, 6.00) m
d = norm(r)                          # 3.74 m
```

- A unit shared by every value is written once, after the bracket; values with
  different units each keep their own: (1.41 m, 45.0°).
- Tuples scale, add and convert with `to`; `norm` gives the length, and `dot` and
  `cross` work on them. A display unit (`r:cm = …`) applies to every value.
- A function can return a tuple: `to_cart(r, th to rad) = tuple(r*cos(th), r*sin(th))`.
- **Unpacking:** `tuple(a, b, c) = …` stores each value of a tuple as a variable
  of its own, shown as (a, b, c) = (1.00, 2.00, 3.00) m. The right-hand side can be
  any tuple, such as a function's result: `tuple(r, theta) = polar(x, y)`. It works
  inside function bodies too.
- Each name takes the same settings as a single assignment, sig figs and a unit
  in any order: `tuple(r:3, theta:deg) = polar(x, y)` shows (1.41 m, 45.0°), and
  `r` and `theta` keep those settings afterwards.
- A bracketed list with commas on its own, like `(1, 2)`, is an error that points
  to `tuple(1, 2)`, so brackets only ever mean grouping or a function call.
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
- Hover a variable in a block's Local row to see its sig figs.

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
  and with `solve` (`d:3 = solve(…, d)`).
- A function's result takes its sig figs from its `return` line, so a declared
  `q:2 = …` inside a function, or a measured number in its body, carries through to
  the calling line.

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
  names (`tuple(a:sci, b) = …`), and a function's result (`f(x):sci = …`).
- For a line with no name, such as `psi_4^2`, or a whole block, use the `#sci` and
  `#dec` commands (see Display commands).

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

**Species:** after a unit, a formula is what the amount is of:

```
n_EDTA = 2.755e-4 mol {EDTA}
r = (1 mol {X}) / (1 mol {EDTA})          # a mole ratio, from the reaction
n_X = n_EDTA * r                          → 2.755 × 10⁻⁴ mol X   (EDTA cancels)
c = 0.100 M {NaOH}
n = c * 17.10 mL                          → 0.00171 mol NaOH
m = 5.00 g {NaOH}
n_2 = m / (40.00 g/mol)                   → 0.125 mol NaOH       (a molar mass needs no species)
```

- Each species is a unit of its own, so species cancel as units do, and amounts of
  different species can't be added or compared (mol Na⁺ + mol Cl⁻ is an error, like
  metres + seconds). `to` keeps the species: `n to mmol` is 1.71 mmol NaOH.
- A whole number of a species, written without a decimal point (`1 mol {X}`,
  `6 mol {X}`), is a coefficient from a balanced equation, so it's exact and never
  limits the sig figs. `1.00 mol {Na}` is a measurement.
- Values without a species work as before.

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

### Tables

`table(…)` on a line of its own shows series side by side, one row per number:

```
table(t, x)              # n | t [s] | x [m]
table(t, x, v = x / t)   # adds a column v, worked out row by row
v_avg                    # v is a series now: v_1, v_2, …
```

- A name is a series' values. A unit every value shares goes in the header; a
  value with an uncertainty shows as 3.0 ± 0.1; a row a series doesn't have shows —.
- `name = expression` works out a column row by row: each series in it stands for
  that row's value (`x / t` is x₃ / t₃ in row 3), and any other name is used as it
  is (`h = 1/2 * g * t^2`). The column becomes a series of its own, with sig figs
  and uncertainties worked out as on any line, so `v_avg`, `v_std` and `v_3` work
  afterwards. An expression without a name (`table(x / t)`) is just shown.
- A table with more than 60 rows shows its first 50 and last 5, with ⋮ between.
- **Settings:** the ⚙ after a table in the editor opens its settings: which rows to
  show (from and to), the lines (under the header, a grid, or none), the n column,
  and showing every row of a long table. They're kept in the sheet after a
  semicolon in the brackets, `table(t, x; rows 5-20, lines grid, numbers off,
  all rows)`, so they can be typed too. Rows only limit what's shown: a computed
  column is still worked out for every row.
- Tables go into the LaTeX and Word exports as arrays.

### Plots

`plot(…)` on a line of its own draws a graph: the first series is the x axis,
the others are plotted against it.

```
plot(t, x)                 # x against t, with error bars for uncertainties
plot(t, x, y)              # two series on one graph, with a legend
plot(t, x; fit linear)     # adds a best-fit line and its equation
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
  unweighted and its uncertainties come from the scatter. (x uncertainties are
  drawn but don't affect the fit.)
- **Settings:** the ⚙ after a plot opens its settings: rows, style (points, lines,
  or both), fit, each axis's range and log scale, and a title. As with tables,
  they're kept after a semicolon: `plot(t, x; rows 2-, style both, fit linear,
  x from 0 to 1, log y, title "Run 1")`.
- **What's on the axes is what's plotted:** a point outside an axis's range isn't
  drawn, isn't fitted, and isn't in a named plot's series. So `x from 0.15 to 0.45`
  fits just that stretch of the data, and `p.slope` is that stretch's slope.
- In the LaTeX export a plot is a pgfplots graph (the package is added only when
  the sheet has one); in the Word export it's a picture.
- A named plot, `p = plot(t, x; fit linear)`, keeps its fit under its name:
  `p.slope`, `p.intercept`, `p.r2` (and `p.chi2` for a weighted fit). With several
  series, each has its own: `p.x_slope`, `p.y_slope`. (An unnamed plot makes
  `x_slope` and `x_intercept` instead.)

### Selections and names with a dot

`select(…)` takes the rows where conditions hold, as new series under a name:

```
a = select(t, x; t from 0.2 to 0.8)   # a.t, a.x: just those rows
a.x_1                                 # the first row that matched (numbered from 1)
a.x_avg                               # statistics of the selection
p = plot(a.t, a.x; fit linear)        # fit only the selected region
v = p.slope
```

- Conditions go after the semicolon, and all must hold: `t from 0.2 to 0.8` (either
  end can be left off), `x to 0.16`, `rows 5-20`. A bare number is in the series'
  unit; a bound can have its own, `t from 250 ms`. In a condition, a name means the
  selected series of that name first, so `select(run1.t, run1.x; t from 0.2)` works.
- A selection doesn't copy its values: each member is the variable it picks
  (`a.x_1` *is* `x_2`), so it keeps its sig figs and uncertainty, and a selection
  stays correlated with the data it came from (`x_2 - a.x_1` is exactly 0). That
  also keeps selections of thousands of rows quick.
- `a.x` is shown x_a, and `a.x_1` is x_{a,1}. Hovering any member shows its value.

Names with a dot work the same everywhere they're made:

| Made by | Holds |
| --- | --- |
| `a = select(t, x; …)` | `a.t`, `a.x`, their members and statistics |
| `run1 = import("run1.csv")` | each column: `run1.t`, `run1.x_3`, `run1.x_avg` |
| `p = plot(t, x; fit linear)` | the series it plots, `p.t`, `p.x` (the rows drawn, numbered from 1), and its fit: `p.slope`, `p.intercept`, `p.r2`, `p.chi2` |

Naming imports keeps two files with the same columns apart:
`d = run2.x_avg - run1.x_avg`. Typing a name and a dot suggests what it holds.

### Importing data (CSV)

Write `import()` on a line, then press the **Choose a CSV file…** button that appears
between its brackets. The file's rows go into the sheet, indented under the line,
which now names the file:

```
import("run1.csv")
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

### 4. More maths (what Mathcad has that courses need)

- [ ] **Numerical integrals and derivatives**: `integral(f(x), x, 0, 2)` and
      `derivative(f(x), x, 1.5)`, with units, sig figs and uncertainty carried through,
      and the working shown.
- [ ] **Systems of equations**: solve several equations for several unknowns at once,
      e.g. both final velocities in a collision.
- [ ] **Piecewise and conditional functions**: `if` in functions, and functions defined
      piece by piece (a force that switches on at a time, a spring that only pushes).

### 5. Lab work

- [ ] **Plot functions**, not just data: `plot(t, x, f(t))`, or a curve over a range.
- [ ] **Non-linear fits**: quadratic, exponential and power-law fits, alongside the
      linear one.
- [ ] **Explore compiling the LaTeX to a PDF** in the LaTeX tab (a Source / PDF
      switch and Download PDF). Options considered: an online
      compile service such as texlive.net (simple, but sends the sheet off the
      device), pdfTeX compiled to WebAssembly (private, but tens of MB), or an
      "Open in Overleaf" button.
- [ ] **Chemistry** (stoichiometry already works by hand, with `mol`, `g/mol` and
      `@N_A`, `@R`, `@F`, `@V_m`):
  - **Molar mass from a formula**: `M(H2O)` → 18.02 g/mol from a built-in table of
    atomic weights, including brackets and hydrates (`Ca(OH)2`, `CuSO4·5H2O`), with
    the sum shown as working and sig figs from the atomic weights.
  - **Formulas typeset**: H₂O, SO₄²⁻ in names and output (`n_H2O` → n(H₂O)).
  - **Balancing equations**: `balance(C3H8 + O2 -> CO2 + H2O)` → C₃H₈ + 5 O₂ →
    3 CO₂ + 4 H₂O, with the coefficients usable as mole ratios.
  - **Limiting reagent and yield**: which reactant runs out, theoretical and
    percent yield.
  - **Concentration**: a molarity unit (`M` itself is taken by the mega prefix, so
    `molar`, or just `mol/L`).

### 6. Housekeeping

- [ ] **Evaluate in a web worker**, if very long sheets still lag once typing pauses.
- [ ] **Narrow screens**: a stacked layout, or an Input / Output switch, for
      phones and small laptops.

### Done

- [x] **Tables**: `table(…)`, with computed columns that become series, and settings.
- [x] **Plots**: `plot(…)`, with error bars, a linear fit (weighted by the error bars
      when there are some), settings, and both exports.
- [x] **Importing from CSV**, with units from the headers and uncertainty columns.
- [x] **Selections and names with a dot**: `select(…)`, named imports and named plots.
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
- [x] **Automated tests** (Vitest): unit tests, golden tests of whole sheets, and
      editor tests, run on every push before the site is published.

## Structure

- `src/config.ts`: app-wide settings in one place: browser storage keys, default
  and example calculation options, when a sheet is worked out while typing
  (`EVALUATION`), sheet file type, timings, the pane divider's limits;
  `src/useSettled.ts`: a value once it stops changing (for working out slow sheets
  after a pause)
- `src/lib/syntax.ts`: the sheet language's words and patterns (keywords and calls,
  names, settings, assignments, functions, constants, display commands, series
  names, indentation), shared by the engine, the sheet structure and the editor
- `src/lib/names.ts`: the names the engine makes for itself (`delta__F`, `at__c__5`,
  `a__x_1` for `a.x_1`, series members and statistics, a plot's fit), each built and
  read in one place; `src/lib/mathjsNames.ts`: mathjs's operator and function names
  and the units the engine uses by name
- Shared values are named once: a word, marker or setting used in more than one
  place is a constant in one of the modules above (or `tableSettings.ts` for the
  words settings are written with), not repeated as text
- Kinds come from one definition: every set of tags (a block's kind, a symbol's,
  a display mode, a layout style, …) is a const object, `BLOCK_KIND = { group:
  'group', … }`, with its type derived from it; code writes `BLOCK_KIND.group`, never
  `'group'`. Related types extend a shared base rather than repeating fields.
- `src/lib/blocks.ts`: the blocks a sheet is read into: `BLOCK_KIND`, `BlockBase`
  and the small parts blocks share (a note, an error, hidden, spanning lines,
  holding other blocks), and each block's type; `src/lib/alignment.ts`: left,
  centre and right, for the Document option and the Word export
- `src/lib/storage.ts`: reading and writing the browser's storage safely;
  `src/useFlash.ts`: copying to the clipboard, and the brief "Copied" messages
- `src/lib/engine.ts`: evaluation with scoped variables, unit-literal handling,
  sig-fig tracking, uncertainty propagation, functions, tables, plots and
  selections, LaTeX generation. Each variable is one record (`StoredVariable`:
  value, sig figs, uncertainty, how it's shown) in a scope per `{ }` block or
  function call; each scope keeps a series index, and selections and named plots
  are lookups into the variables they pick (`Views`). mathjs sees just the values,
  through `Values`.
- `src/lib/csv.ts`: reading imported data (columns, units, uncertainty columns);
  `src/editor/dataBlocks.ts`, `dataBlockLines.ts`: an import's rows in the editor
  (row numbers, folding, the table look, moving and deleting them as one)
- `src/lib/tableSettings.ts`, `plotSettings.ts`: a table's and plot's settings
  after the semicolon, read and written; `src/editor/tableMenu.ts`: their ⚙ menus
- `src/lib/plot.ts`: the linear fit, axes, and drawing a plot as SVG;
  `src/lib/plotImage.ts`: plots as pictures for the Word export
- `src/lib/brackets.ts`: choosing ( ), [ ] and { } by nesting in the output
- `src/lib/aiPrompt.ts`: Create's prompt (what can be made, its tickboxes, and the
  rules of writing a sheet, whose examples a test evaluates) and reading the AI's
  answer back; `src/components/CreateDialog.tsx`: the dialog
- `src/lib/document.ts`: line types and blocks (`{ }`, layout, `def`,
  `@constants`), sheet evaluation, diagnostics, definitions and symbols for the
  editor
- `src/lib/latex.ts`: the `.tex` export and its document options;
  `src/components/LatexOptionsMenu.tsx`: the LaTeX tab's Document menu (used by
  both exports)
- `src/lib/docx.ts`: the `.docx` (Word) export; `src/lib/omml.ts`: LaTeX → Word
  equations (OMML), by way of KaTeX's MathML
- `src/lib/sigfigs.ts`: counting, propagating and formatting significant figures
- `src/lib/solve.ts`: `solve(…)`: rearranging, linear, quadratic and numeric solving
- `src/lib/constants.ts`: the built-in `@` constants
- `src/lib/library.ts`: the equations in the Library tab (each tested with its
  example); `src/components/LibraryPane.tsx`: the tab
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
  `src/editor/greek.ts`: typing Greek letters (`\Delta` then Tab or a space);
  `src/editor/vocabulary.ts`: the commands, keywords and built-in functions they describe
- `src/components/EditorPane.tsx`: the editor; `PreviewPane.tsx`: rendered output,
  LaTeX and Reference tabs; `ReferencePane.tsx`: the Reference tab;
  `OptionsMenu.tsx` / `Dropdown.tsx`: the options menus; `SplitPane.tsx`: resizable
  two-pane layout (drag, arrow keys, double-click to reset)
