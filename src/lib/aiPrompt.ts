/**
 * Create: a prompt for an AI model to write a MathScribe sheet (a test, an
 * assignment, worked examples, a lab write-up), and reading its answer back.
 *
 * The prompt is the request, the choices ticked, and the rules of writing a
 * sheet (PRIMER). Nothing is sent anywhere: the prompt is copied for pasting
 * into any AI, and its answer pasted back opens as a new sheet.
 *
 * The rules' examples (SNIPPETS, EXAMPLE_SHEET) are evaluated by a test, so the
 * prompt can't promise syntax MathScribe doesn't accept.
 */
import { BUILTIN_CONSTANTS } from './constants.ts'
import { SHEET_FILE } from '../config.ts'

// ---------------------------------------------------------------------------
// What can be made, and the choices for each
// ---------------------------------------------------------------------------

export const CREATE_KINDS = ['test', 'assignment', 'examples', 'lab'] as const
export type CreateKind = (typeof CREATE_KINDS)[number]

/** A tickbox: what it says, whether it starts ticked, and what it asks of the AI. */
export interface CreateOption {
  id: string
  label: string
  ticked: boolean
  instruction: string
}

/** The kinds' names, descriptions, examples of a request, and their tickboxes. */
export const CREATE_KIND_INFO: Record<CreateKind, {
  name: string
  description: string
  placeholder: string
  /** What the AI is asked to write. */
  task: string
  options: CreateOption[]
}> = {
  test: {
    name: 'Test',
    description: 'A test or exam, with worked solutions at the end',
    placeholder: 'A midterm for PHYS 1100 covering work, energy and momentum, about 6 questions',
    task: 'a test (exam) for students to sit',
    options: [
      { id: 'solutions', label: 'Worked solutions (at the end)', ticked: true, instruction: 'Include a worked solution to every question, after all the questions (see "Questions and solutions").' },
      { id: 'hide', label: 'Hide the solutions (a copy to hand out)', ticked: false, instruction: 'Put `#hide` on each solution block\'s opening line, so the solutions are worked out but not shown.' },
      { id: 'marks', label: 'Marks for each question', ticked: true, instruction: 'Give each question a mark value in its heading, e.g. `## Question 1 (5 marks)`, and the total at the top.' },
      { id: 'formulas', label: 'A formula sheet at the start', ticked: false, instruction: 'Start with a short formula sheet: a `## Formula sheet` section of `$ …` LaTeX lines (not calculations).' },
    ],
  },
  assignment: {
    name: 'Assignment',
    description: 'A problem set to work through, with solutions at the end',
    placeholder: 'An assignment on projectile motion for first-year physics, 5 problems of increasing difficulty',
    task: 'an assignment (problem set) for students to work through',
    options: [
      { id: 'solutions', label: 'Worked solutions (at the end)', ticked: true, instruction: 'Include a worked solution to every question, after all the questions (see "Questions and solutions").' },
      { id: 'hide', label: 'Hide the solutions (a copy to hand out)', ticked: false, instruction: 'Put `#hide` on each solution block\'s opening line, so the solutions are worked out but not shown.' },
      { id: 'hints', label: 'A hint with each question', ticked: false, instruction: 'After each question, add a hint as a `> Hint: …` line.' },
      { id: 'marks', label: 'Marks for each question', ticked: false, instruction: 'Give each question a mark value in its heading, e.g. `## Question 1 (5 marks)`.' },
    ],
  },
  examples: {
    name: 'Worked examples',
    description: 'Examples solved step by step, to learn from',
    placeholder: 'Worked examples of conservation of momentum in collisions, from simple to harder',
    task: 'a set of worked examples that teach a topic step by step',
    options: [
      { id: 'explain', label: 'Explain each step', ticked: true, instruction: 'Explain the reasoning before each calculation with `>` lines.' },
      { id: 'mistakes', label: 'Common mistakes', ticked: false, instruction: 'End each example with a `> Common mistake: …` line.' },
      { id: 'practice', label: 'Practice questions at the end, with solutions', ticked: false, instruction: 'After the examples, add a few practice questions, with their solutions after them (see "Questions and solutions").' },
    ],
  },
  lab: {
    name: 'Lab write-up',
    description: 'A lab report template with data, analysis and uncertainty',
    placeholder: 'A lab write-up for measuring g with a pendulum, with sample data',
    task: 'a lab write-up with sample measurements and their analysis',
    options: [
      { id: 'uncertainty', label: 'Uncertainties carried through', ticked: true, instruction: 'Give measured values uncertainties with `pm`, and show the uncertainty of the main result with a `delta` line.' },
      { id: 'repeats', label: 'Repeated measurements (mean and spread)', ticked: true, instruction: 'Include repeated measurements as a series (`T1`, `T2`, …) and use `T_avg` and `T_std`.' },
      { id: 'graph', label: 'A graph with a best-fit line', ticked: false, instruction: 'Include a data series plotted with `p = plot(x, y; fit linear)`, and use `p.slope`.' },
      { id: 'discussion', label: 'Discussion and conclusion', ticked: true, instruction: 'End with `@layout.text Discussion {` and `@layout.text Conclusion {` blocks of prose, each closed by `}`.' },
    ],
  },
}

/** The tickboxes each kind starts with: id → ticked. */
export const defaultChoices = (kind: CreateKind): Record<string, boolean> =>
  Object.fromEntries(CREATE_KIND_INFO[kind].options.map((o) => [o.id, o.ticked]))

// ---------------------------------------------------------------------------
// The rules of writing a sheet
// ---------------------------------------------------------------------------

/**
 * One-line examples the rules show, each a whole sheet that must evaluate
 * without errors (a test checks).
 */
export const SNIPPETS = {
  products: 'm = 2.00 kg\nv = 3.0 m/s\nK = 1/2 * m * v^2',
  valueInText: '// a comment\nT1 = 1.21 s\nT2 = 1.17 s\n> The mean period was {{T_avg}}.',
  chemistry: [
    'c_EDTA = 0.01000 M {EDTA}',
    'V = 27.55 mL',
    'n_EDTA:"Moles of EDTA" = c_EDTA * V',
    'n_X = n_EDTA * (1 mol {X}) / (1 mol {EDTA})',
    'm = 5.00 g {NaOH}',
    'n_NaOH = m / @chem.mm({NaOH})',
    '> The {Ca^2+} and {Mg^2+} came to {{n_X}}.',
    '{Ca^2+ + EDTA^4- -> CaEDTA^2-}',
  ].join('\n'),
  convert: 'v = 25.0 m/s\nv_kmh = v to km/h',
  angle: 'theta = asin(0.50) to deg',
  settings: 'phi:3:deg = atan(0.75)',
  pm: 'm = 2.0 kg pm 0.1 kg\nt = (1.50 pm 0.02) s\nL = 2.00 m pm 1%',
  delta: 'm = 2.0 kg pm 0.1 kg\na = 3.00 m/s^2\nF = m * a\ndelta F',
  constants: 'w = 2.00 kg * @g',
  function: 'KE(m, v) = 1/2 * m * v^2\nK = KE(2.0 kg, 3.0 m/s)',
  conditions: [
    'k = 250. N/m',
    'F(x) = x > 0 m ? k * x : 0 N',
    'def friction(v, f_k)',
    '    if v > 0 m/s',
    '        return -f_k',
    '    else if v < 0 m/s',
    '        return f_k',
    '    else',
    '        return 0 N',
    'F_s = F(0.120 m)',
    'F_f = friction(-1.5 m/s, 6.0 N)',
  ].join('\n'),
  system: 'm_1 = 2.00 kg\nm_2 = 4.00 kg\nu = 6.00 m/s\ntuple(v_1, v_2) = solve(m_1 * u = m_1 * v_1 + m_2 * v_2, u = v_2 - v_1)',
  solve: 'v_0 = 0 m/s\nv_f = 5.86 m/s\na = 4.91 m/s^2\nd = solve(v_f^2 = v_0^2 + 2 * a * d, d)',
  series: 'T1 = 1.21 s\nT2 = 1.17 s\nT3 = 1.24 s\nT_avg\nT_std',
  plot: 'x1 = 0.10 m\nx2 = 0.20 m\nx3 = 0.30 m\nF1 = 0.52 N\nF2 = 0.98 N\nF3 = 1.51 N\np = plot(x, F; fit linear)\nk = p.slope',
} as const

/** An example of a test laid out as these rules ask (evaluated by a test). */
export const EXAMPLE_SHEET = `# Kinematics practice test
> Use $g = 9.81$ m/s². Give answers to 3 significant figures. Total: 10 marks.

## Question 1 (4 marks)
> A ball is dropped from rest from a height of $h = 12.0$ m. How long does it take
> to reach the ground, and how fast is it moving when it lands?

## Question 2 (6 marks)
> A block slides down a ramp inclined at $\\theta = 25.0°$ with $\\mu_k = 0.150$.
> Find its acceleration, and its speed after sliding $d = 2.40$ m from rest.


# Solutions

Question 1 {
    h = 12.0 m
    t_f = sqrt(2 * h / @g)   # time to fall
    v = @g * t_f             # speed on landing
}

Question 2 {
    theta = 25.0 deg
    mu_k = 0.150
    d = 2.40 m
    a = @g * (sin(theta) - mu_k * cos(theta))
    v = sqrt(2 * a * d)
}`

/** The block of a sheet in an answer: its first fenced code block, or the whole answer. */
const FENCED = /```[^\n]*\n([\s\S]*?)```/

/** Code in the rules. */
const code = (text: string) => ['```', text, '```'].join('\n')

/** The constants, by name, for the rules. */
const constantNames = Object.keys(BUILTIN_CONSTANTS).map((n) => `@${n}`).join(', ')

/** How to write a MathScribe sheet, for an AI model. */
export const PRIMER = `# Writing MathScribe sheets

MathScribe is a plain-text calculation sheet. Each line is evaluated top to bottom
and shown as typeset maths with its working: \`F = m * a\` shows
F = ma = (2.00 kg)(9.81 m/s²) = 19.6 N, with units, significant figures and
uncertainties carried through automatically.

## Line types
- \`name = expression\`: a calculation (the main kind of line).
- \`# Title\`, \`## Title\`, \`### Title\`: section, subsection, bold heading.
- \`> Some text\`: a paragraph of prose; \`$...$\` inside it is inline LaTeX.
- \`{{name}}\` in prose or a heading puts in a variable's value as worked out above it, with
  its unit and sig figs: \`> The mean was {{T_avg}}.\` Settings and \`to\` work: \`{{V:3 to L}}\`.
${code(SNIPPETS.valueInText)}
- \`$ \\LaTeX\`: raw LaTeX, displayed but not evaluated.
- \`x = 3  # note\`: text after \` # \` on a calculation is its description.
- \`// …\`: a comment, never shown. A line starting with \`#\` is ALWAYS a heading.
- A blank line is just spacing; two blank lines leave a gap in the output.

## Calculations
${code(SNIPPETS.products)}
- Always write \`*\` for multiplication: \`1/2 * m * v^2\`, \`2 * pi * r\`. Never \`2m\` or \`1/2 m v^2\`.
- Powers are \`^\`. Functions: sqrt, sin, cos, tan, asin, acos, atan, atan2, exp, log (natural),
  log10, abs, min, max, round; constants pi and e.
- Names: letters, digits and underscores; \`_\` makes subscripts. Name things as the question
  writes them: \`v_0\` is v₀, \`v_1x\` (or \`v1x\`) is v₁ₓ, \`v_fx\` is v_fx, \`m_A\` is m_A, \`F_net_x\`
  is F_net,x. A subscript that's a word (\`net\`, \`max\`, \`thermal\`) is shown upright.
- Greek by name (\`theta\`, \`mu_k\`, \`Delta\`) or as characters (\`ΔE\`, \`ω\`): write \`Δt\`, not
  \`dt\`. No dots in names. Don't use \`phi\`, \`tau\`, \`e\` or \`pi\` as your own names.
- A variable can be redefined; later lines use the newest value.

## Units
${code(SNIPPETS.convert)}
${code(SNIPPETS.angle)}
- A unit goes right after a number: \`9.81 m/s^2\`, \`2.00 kg\`, \`30.0 deg\`, \`5.0 um\` (micro is u).
  Compound units have no spaces: \`kg*m^2\`, \`J/mol/K\`.
- Convert with \`to\`: \`v to km/h\`, \`E = h * f to eV\`, \`ratio = a / b to percent\`.
- Ångström is \`angstrom\`; \`A\` is the ampere; litres are \`L\` and \`mL\`. Use kelvin for temperature.
- Trig takes radians unless given \`deg\`; asin, acos and atan give radians, so add \`to deg\`.

## Significant figures (automatic)
- A number with a unit, a decimal point or an exponent is measured, and its sig figs are
  counted as typed. Integers without a unit (\`2\`, \`1/2\`) are exact.
- Write \`1/2\`, not \`0.5\`, for an exact factor: \`0.5\` is a measurement with 1 sig fig and
  rounds the answer to 1 sig fig.
- Trailing zeros in whole numbers don't count: \`300 m\` has 1 sig fig. Write \`300. m\`
  or \`3.00e2 m\` when they do. Prefer values like \`12.0 m\` and \`30.0 deg\`.
- Settings on the name being assigned (left of \`=\` only): sig figs, a unit, notation.
${code(SNIPPETS.settings)}
  \`d:km = …\`, \`N:sci = …\` (scientific), \`L:dec = …\` (plain digits).

## Uncertainty
${code(SNIPPETS.pm)}
- It propagates through every calculation automatically. Write \`pm\` only where a value is
  defined, never inside a function's brackets.
${code(SNIPPETS.delta)}
- \`delta F\` (shown δF) is F's uncertainty; on its own line it shows the propagation working.

## Constants (start with @)
${code(SNIPPETS.constants)}
${constantNames}. 3 sig figs by default; \`@c:5\` for 5, \`@c:exact\` for every digit.

## Display commands (after a calculation, or on a block's opening line)
\`#sym\` equation only · \`#val\` result only · \`#hide\` worked out but not shown ·
\`#multiline\` each \`=\` on its own row · \`#sci\` / \`#dec\` notation for that line.

## Blocks
- \`Title {\` … \`}\` (lines inside indented 4 spaces): variables assigned inside are local to
  it, and it can read everything defined above it. \`Title {  #hide\` hides the whole block.
- \`@layout.numbered Title {\` … \`}\` (or \`@layout.list\`, \`@layout.center\`, \`@layout.text\`; the title is optional) arranges
  the lines inside without scoping them. An \`@layout.text\` block is paragraphs of prose; nothing in it
  is calculated. Don't end a line with \`:\` to start a block.
- \`@layout.titlepage {\` … \`}\` is a title page of prose (no \`>\`): its first line is the title,
  and each line after it (author, course, date) is centered on its own.
- \`@layout.hidden {\` … \`}\` works lines out without showing them (givens a solution uses).
  \`@layout.val {\`, \`.sym\`, \`.multiline\`, \`.sci\` show every line inside as those commands do,
  and combine: \`@layout.numbered.val Steps {\`.

## Functions and solving
${code(SNIPPETS.function)}
- Several steps: \`def KE(mass, speed)\`, an indented body of \`name = …\` lines, then
  \`return E\`. No loops.
- A condition in a line is \`cond ? a : b\`; in a def, \`if\`, \`else if\` and \`else\` with their
  lines indented under them. Conditions compare values (\`<\`, \`>=\`, \`==\`, \`and\`, \`or\`).
${code(SNIPPETS.conditions)}
${code(SNIPPETS.solve)}
- \`solve(equation, unknown)\` rearranges and evaluates. Give a guess for hard ones:
  \`solve(x = cos(x), x, 0.5)\`.
- Several unknowns: \`tuple(x, y) = solve(equation, equation)\`, with as many equations as
  unknowns (linear ones, or ones easily rearranged).
${code(SNIPPETS.system)}

## Series, tables and graphs
${code(SNIPPETS.series)}
- \`T1\`, \`T2\`, … (or \`T_1\`, \`T_2\`) form a series \`T\`: \`T_avg\` (mean ± standard error),
  \`T_std\`, \`T_sem\`, \`T_count\`, and \`T\` (the sum) show their working on their own line.
- \`table(T, x, v = x / T)\` shows series side by side; \`v = x / T\` makes a new series.
${code(SNIPPETS.plot)}
- \`p = plot(x, y; fit linear)\` graphs y against x with a best-fit line; \`p.slope\`,
  \`p.intercept\` and \`p.r2\` are its results.

## Chemistry
${code(SNIPPETS.chemistry)}
- A formula goes in single braces: \`{Na^+}\`, \`{Ca^2+}\`, \`{H3O^+(aq)}\`, \`{2 H2O(l)}\` (counts as
  digits, a charge after \`^\`, a state in brackets). In prose and headings it's drawn as chemistry;
  on a line of its own it's a reaction: \`{Na^+ + Cl^- -> NaCl}\`.
- After a unit, a formula is the species: \`0.100 M {NaOH}\`, \`2.0 mol {EDTA}\`, \`5.00 g {NaOH}\`.
  Species cancel like units, so a mole ratio is \`(1 mol {X}) / (1 mol {EDTA})\`, and amounts of
  different species can't be added. A whole number of a species (\`1 mol {X}\`) is exact.
- \`M\` is molarity (mol/L). A molar mass has no species: \`@chem.mm({NaOH})\` works one out from
  the formula (brackets and a hydrate's \`*\` work, no coefficient), \`@chem.mm.Na\` is an element's,
  or write it: \`40.00 g/mol\`.
- \`@chem.total(n_Na, n_Cl)\` adds amounts of different species, as plain amounts.
- A display name goes on the name being assigned: \`n_Na:"Moles of {Na^+}" = …\` shows as
  "Moles of Na⁺" wherever n_Na appears. It can hold values: \`"Moles in {{V}}"\`.

## Don't
- Don't write LaTeX in calculation lines (\`\\frac\`, \`\\cdot\`); write plain maths.
- Don't write \`(a, b)\` for a pair: use \`tuple(a, b)\`. \`<3.0, 4.0> N\` is a vector.
- Don't put a unit after a variable (\`m kg\`), or leave out \`*\`.
- Don't use \`#\` for a comment on its own line: it makes a heading. Use \`//\`.
- Don't type a computed number into prose: use \`{{name}}\`, so it stays right.

## Questions and solutions
Write every question first, then a \`# Solutions\` section at the end, with one block per
question. A question states its values in its text, with inline maths (\`$h = 12.0$ m\`); its
solution block starts by defining them as variables, then works the answer out. Blocks keep
their variables to themselves, so different questions can use the same names.

${code(EXAMPLE_SHEET)}
`

// ---------------------------------------------------------------------------
// The prompt, and reading the answer back
// ---------------------------------------------------------------------------

/** The prompt for an AI model: the rules, then what to write and how. */
export function buildPrompt(kind: CreateKind, request: string, choices: Record<string, boolean>): string {
  const info = CREATE_KIND_INFO[kind]
  const ticked = info.options.filter((o) => choices[o.id] ?? o.ticked)
  // (Hiding the solutions only means something if there are some.)
  const instructions = ticked
    .filter((o) => o.id !== 'hide' || choices.solutions !== false)
    .map((o) => `- ${o.instruction}`)
  return [
    'You write sheets for MathScribe, a plain-text calculation sheet. Follow the rules below exactly.',
    '',
    PRIMER,
    '# Your task',
    '',
    `Write ${info.task}.`,
    '',
    `Request: ${request.trim() || info.placeholder}`,
    '',
    ...(instructions.length ? ['Requirements:', ...instructions, ''] : []),
    'Check every calculation line against the rules above. Reply with only the sheet, in a single code block.',
  ].join('\n')
}

/** A sheet from an AI's answer: what's in its code block (or all of it), without the fences. */
export function sheetFromAnswer(answer: string): string {
  const fenced = FENCED.exec(answer)
  return (fenced ? fenced[1] : answer).replace(/\r\n/g, '\n').trim() + '\n'
}

/** A name for the sheet, from its first heading: "Kinematics practice test" → kinematics-practice-test.txt. */
export function sheetName(sheet: string, fallback: string): string {
  const heading = /^#\s+(.+)$/m.exec(sheet)?.[1] ?? fallback
  const slug = heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  return `${slug || fallback}${SHEET_FILE.extension}`
}
