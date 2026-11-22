/**
 * Create: a prompt for an AI model to write a MathScribe sheet (a test, an
 * assignment, worked examples, a lab write-up), and reading its answer back.
 *
 * The prompt is the request, the choices ticked, and the rules of writing a
 * sheet (primer), made from the language tree (lib/language), so it says what
 * the Reference says, and its examples are the tree's, which the tests run: it
 * can't promise syntax MathScribe doesn't accept. Nothing is sent anywhere: the
 * prompt is copied for pasting into any AI, and its answer pasted back opens
 * as a new sheet.
 */
import { BUILTIN_CONSTANTS } from '../constants.ts'
import { languageTopics } from '../engine/index.ts'
import { primerMarkdown } from '../language/reference.ts'
import { SHEET_FILE } from '../../config.ts'

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
      { id: 'formulas', label: 'A formula sheet at the start', ticked: false, instruction: 'Start with a short formula sheet: a `## Formula sheet` section of `@latex { … }` lines of LaTeX (not calculations).' },
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
      { id: 'repeats', label: 'Repeated measurements (mean and spread)', ticked: true, instruction: 'Include repeated measurements as a series (`T = [1.21 s, 1.17 s, …]`) and use `T.avg` and `T.std`.' },
      { id: 'graph', label: 'A graph with a best-fit line', ticked: false, instruction: 'Include a data series plotted with `p = @plot(x, y; fit linear)`, and use `p.slope`.' },
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

/** Between paragraphs, in the rules. */
const BLANK_LINE = '\n\n'
/** At the end of the rules. */
const LINE_END = '\n'

/** Code in the rules. */
const code = (text: string) => ['```', text, '```'].join('\n')

/** The constants, by name, for the rules. */
const constantNames = Object.keys(BUILTIN_CONSTANTS).map((n) => `@${n}`).join(', ')

// ---------------------------------------------------------------------------
// The prompt, and reading the answer back
// ---------------------------------------------------------------------------

/** What MathScribe is, at the head of the primer. */
const PRIMER_INTRO = `MathScribe is a plain-text calculation sheet. Each line is evaluated top to bottom
and shown as typeset maths with its working: \`F = m * a\` shows
F = ma = (2.00 kg)(9.81 m/s²) = 19.6 N, with units, significant figures and
uncertainties carried through automatically.`

/** How a sheet with questions is laid out: the task's, not the language's (so it's here, not in the tree). */
const QUESTIONS_AND_SOLUTIONS = `## Questions and solutions
Write every question first, then a \`# Solutions\` section at the end, with one block per
question. A question states its values in its text, with inline maths (\`$h = 12.0$ m\`); its
solution block starts by defining them as variables, then works the answer out. Blocks keep
their variables to themselves, so different questions can use the same names.

${code(EXAMPLE_SHEET)}`

/**
 * How to write a MathScribe sheet, for an AI model, made from the language
 * tree (lib/language: every topic, entry, rule and example, as the Reference
 * shows them), with the built-in constants' names after Constants, and how a
 * sheet of questions is laid out.
 */
export const primer = (): string => [
  '# Writing MathScribe sheets',
  PRIMER_INTRO,
  primerMarkdown(languageTopics(), {
    constants: `The constants: ${constantNames}. 3 sig figs by default; \`@c:5\` for 5, \`@c:exact\` for every digit.`,
  }),
  QUESTIONS_AND_SOLUTIONS,
].join(BLANK_LINE) + LINE_END

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
    primer(),
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
