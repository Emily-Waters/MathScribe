/**
 * The LaTeX export's toolkit: text, equations, cards, errors and plots, as LaTeX.
 * These are the pieces each kind of block writes itself with (see constructs/);
 * none of them knows about blocks, so a construct can use them without the
 * export (latex.ts) being involved.
 */
import { TITLE_SEGMENT, titleSegments } from './document.ts'
import { GREEK_BY_CHAR } from './syntax.ts'
import { symbolTex, unitTex } from './engine/index.ts'
import type { PlotData, PlotName } from './plot.ts'
import type { LatexOptions } from './latex.ts'

// ---------------------------------------------------------------------------
// Text and equations
// ---------------------------------------------------------------------------

/** Text, with the characters LaTeX treats specially escaped. */
export const escapeTex = (s: string) =>
  s.replace(/[\\{}#%&_^~$]/g, (c) =>
    c === '\\' ? '\\textbackslash{}' : c === '^' ? '\\^{}' : c === '~' ? '\\~{}' : `\\${c}`)
    // (Characters pdflatex can't set in text, past Latin-1, as a little maths: σ as $\sigma$.)
    .replace(TEXT_MATHS_CHAR, (c) => `$${TEXT_MATHS.get(c)}$`)

/**
 * Characters past Latin-1 that a sheet's text uses (Greek letters, √, ≈, ≤, …),
 * which pdflatex can't set as text, as the maths that draws them. (±, ×, °, µ
 * and the like are Latin-1, which it sets as they are.)
 */
const TEXT_MATHS: ReadonlyMap<string, string> = new Map<string, string>([
  ...[...GREEK_BY_CHAR].map(([char, name]): [string, string] => [char, `\\${name}`]),
  ['√', '\\surd'], ['≈', '\\approx'], ['≤', '\\le'], ['≥', '\\ge'], ['≠', '\\ne'], ['∞', '\\infty'],
  ['→', '\\to'], ['←', '\\leftarrow'], ['⇌', '\\rightleftharpoons'], ['−', '-'], ['∑', '\\sum'],
  ['∆', '\\Delta'], ['′', '\\prime'], ['∝', '\\propto'], ['∂', '\\partial'],
])

/** Any of TEXT_MATHS's characters. */
const TEXT_MATHS_CHAR = new RegExp(`[${[...TEXT_MATHS.keys()].join('')}]`, 'gu')

/** A heading or block title in LaTeX: `2p_z` → 2p\textsubscript{z}. */
export function titleToLatex(text: string): string {
  return titleSegments(text).map((s) => (s.kind === TITLE_SEGMENT.math
    ? `$${s.value}$`
    : s.kind === TITLE_SEGMENT.sub ? `\\textsubscript{${escapeTex(s.value)}}` : escapeTex(s.value))).join('')
}

/** Title and note of a block, as one heading. */
export const heading = (title: string, note?: string) =>
  [title, note && titleToLatex(note)].filter(Boolean).join(' --- ')

/** An equation to display, with its note (set at the right margin). */
export interface Equation {
  tex: string
  note?: string
}

/**
 * Equations in a row, as one `gather*`: they sit as close together as in the
 * Rendered tab (separate displays would each get a paragraph's spacing), each
 * with its note on the right.
 */
export function gather(eqs: Equation[], share = 1): string {
  // (A note is a comment on its line: small and italic, at the right margin. Like a
  // title, it shows a name's subscript, v_f, and `$…$` as maths.)
  // A noted line goes through NOTE_MACRO, which drops the note under it if they
  // don't fit side by side, and then leaves more room before the next line (NOTE_SEPARATOR).
  const rows = eqs.map((e) => (e.note
    ? `  \\${NOTE_MACRO}{${fitted(e.tex, share)}}{${NOTE_STYLE}${titleToLatex(e.note)}}`
    : `  ${fitted(e.tex, share)}`))
  const separators = eqs.map((e) => (e.note ? ` \\${NOTE_SEPARATOR}\n` : ' \\\\\n'))
  return ['\\begin{gather*}', rows.map((r, i) => (i ? separators[i - 1] : '') + r).join(''), '\\end{gather*}'].join('\n')
}

/**
 * The macro (defined in the preamble: noteMacroDefinition) that sets a line
 * with its note: `\msnoted{equation}{note}`. Side by side if they fit (LaTeX
 * measures them, as amsmath would), and otherwise the note just under its line,
 * with more room after it, so it reads as its line's and not the next one's.
 */
export const NOTE_MACRO = 'msnoted'
/** The row break after a noted line: `\\`, with the room a dropped note leaves. */
export const NOTE_SEPARATOR = 'msnotesep'
const NOTE_EQUATION_BOX = 'msnoteeqbox'
const NOTE_BOX = 'msnotebox'
const NOTE_ROOM = 'msnoteroom'
/** The least gap between a line and its note beside it. */
const NOTE_GAP = '1em'
/** The room after a dropped note, before the next line. */
const NOTE_DROPPED_ROOM = '0.5\\baselineskip'

/** The noting macro's definition, for the preamble (after the fitting macro's, whose helpers it uses). */
export const noteMacroDefinition = (flushLeft: boolean) => {
  // The width they need side by side. (Centred, the line leaves only half of what's left on its right.)
  const needed = flushLeft
    ? `\\wd\\${NOTE_EQUATION_BOX}+\\wd\\${NOTE_BOX}+${NOTE_GAP}`
    : `\\wd\\${NOTE_EQUATION_BOX}+2\\wd\\${NOTE_BOX}+2\\dimexpr${NOTE_GAP}\\relax`
  return [
  '% A line and its note side by side if they fit; else the note just under it.',
  `\\newsavebox{\\${NOTE_EQUATION_BOX}}`,
  `\\newsavebox{\\${NOTE_BOX}}`,
  `\\newdimen\\${NOTE_ROOM}`,
  `\\newcommand{\\${NOTE_SEPARATOR}}{\\\\[\\${NOTE_ROOM}]}`,
  `\\newcommand{\\${NOTE_MACRO}}[2]{\\sbox{\\${NOTE_EQUATION_BOX}}{$\\displaystyle #1$}\\sbox{\\${NOTE_BOX}}{#2}%`,
  `  \\ifdim\\dimexpr${needed}\\relax>\\dimexpr\\linewidth${flushLeft ? '-\\mathindent' : ''}\\relax`,
  `  \\expandafter\\${FIT_SECOND}\\else\\expandafter\\${FIT_FIRST}\\fi`,
  `  {\\global\\${NOTE_ROOM}=0pt\\relax #1\\tag*{#2}}`,
  // (Dropped: a row of its own, pulled up to its line.)
  `  {\\global\\${NOTE_ROOM}=${NOTE_DROPPED_ROOM}\\relax #1\\\\*[-\\jot]{}\\tag*{#2}}}`,
  ]
}

/** How a line's note is set, in its \tag*: small and italic (maths in it stays upright). */
const NOTE_STYLE = '\\small\\itshape '

// ---------------------------------------------------------------------------
// Equations too wide for the line
// ---------------------------------------------------------------------------

/**
 * The macro (defined in the preamble: FIT_MACRO_DEFINITION) that sets an
 * equation on one line if it fits, and otherwise one `=` per row, lined up:
 * `\msfit{one line}{rows}`. LaTeX measures it, so it's right for the page,
 * margins, font size and card it's in.
 */
export const FIT_MACRO = 'msfit'

/** The box the macro measures an equation in. */
const FIT_BOX = 'msfitbox'

/**
 * The fitting macro's definition, for the preamble. The room an equation has is
 * the line's width (less the indent equations have when they're flush left).
 */
export const fitMacroDefinition = (flushLeft: boolean) => [
  '% An equation too wide for the line is set one = per row, lined up.',
  `\\newsavebox{\\${FIT_BOX}}`,
  // (Both forms stay in braces until one is chosen: in an alignment, gather*'s, the rows' & would end the cell.)
  `\\newcommand{\\${FIT_FIRST}}[2]{#1}`,
  `\\newcommand{\\${FIT_SECOND}}[2]{#2}`,
  `\\newcommand{\\${FIT_MACRO}}[2]{\\sbox{\\${FIT_BOX}}{$\\displaystyle #1$}%`,
  `  \\ifdim\\wd\\${FIT_BOX}>\\dimexpr\\linewidth${flushLeft ? '-\\mathindent' : ''}\\relax`,
  `  \\expandafter\\${FIT_SECOND}\\else\\expandafter\\${FIT_FIRST}\\fi{#1}{#2}}`,
]

/** The helpers that take one of two arguments, for the fitting macro. */
const FIT_FIRST = 'msfitfirst'
const FIT_SECOND = 'msfitsecond'

/**
 * How many characters an equation draws before it might not fit on a line (a
 * line of maths at 10–12 pt holds more; fractions, counted top and bottom, make
 * it an overestimate, so fewer can't overflow).
 */
const MIGHT_NOT_FIT = 60

/** Commands that draw nothing themselves: what they hold is drawn, or they only space or size it. */
const DRAWS_NOTHING = /\\(?:left|right|mathrm|text|frac|sqrt|begin|end|displaystyle|quad|qquad|ce)(?![a-zA-Z])|\\[,;:! ]/g
/** Any other command, which draws one symbol: \times, \pi, \pm. */
const ONE_SYMBOL = /\\[a-zA-Z]+/g

/** About how many characters an equation draws: its LaTeX without markup. */
const drawnLength = (tex: string) => tex.replace(DRAWS_NOTHING, '').replace(ONE_SYMBOL, '#').replace(/[{}^_&\s]/g, '').length

/** The relations an equation's steps are joined with (as layoutEquation joins them), at a position. */
const RELATION_AT = / (=|\\approx) /y
/** What opens or closes a group the relations inside it don't count in. */
const OPENS = /\\left(?![a-zA-Z])|\\begin(?![a-zA-Z])/y
const CLOSES = /\\right(?![a-zA-Z])|\\end(?![a-zA-Z])/y

/** An equation's steps, and the relation before each after the first, split at its top level (not in brackets or braces). */
function stepsOf(tex: string): { steps: string[]; relations: string[] } {
  const steps: string[] = []
  const relations: string[] = []
  let depth = 0
  let start = 0
  const at = (re: RegExp, i: number) => {
    re.lastIndex = i
    return re.exec(tex)
  }
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i]
    if (c === '\\' && (tex[i + 1] === '{' || tex[i + 1] === '}')) {
      i++ // an escaped brace, \{ or \}
      continue
    }
    if (at(OPENS, i) || c === '{') depth++
    else if (at(CLOSES, i) || c === '}') depth--
    else if (depth === 0) {
      const relation = at(RELATION_AT, i)
      if (relation) {
        steps.push(tex.slice(start, i))
        relations.push(relation[1])
        start = i + relation[0].length
        i = start - 1
      }
    }
  }
  steps.push(tex.slice(start))
  return { steps, relations }
}

/**
 * An equation as the fitting macro takes it, if it might not fit and has more
 * than one step to put on rows of their own; otherwise as it is. (One already
 * on rows, #multiline's, is as it is.)
 */
export function fitted(tex: string, share = 1): string {
  // (In a column, `share` of the line, a shorter one might not fit.)
  if (drawnLength(tex) <= MIGHT_NOT_FIT * share || tex.includes('\\begin{aligned}')) return tex
  const { steps, relations } = stepsOf(tex)
  if (relations.length < 2) return tex
  const rows = steps.slice(1).map((s, i) => `&${relations[i]} ${s}`)
  return `\\${FIT_MACRO}{${tex}}{\\begin{aligned}${steps[0]} ${rows.join(' \\\\ ')}\\end{aligned}}`
}


/** A block with a title: a card (with cards on), else a paragraph heading and an indented body. */
export function titled(o: LatexOptions, title: string, body: string): string {
  if (o.cards) {
    return [`\\begin{mdframed}[style=msblock${title ? `, frametitle={${title}}` : ''}]`, body, '\\end{mdframed}'].join('\n')
  }
  return [title ? `\\paragraph{${title}}` : '', '\\begin{quote}', body, '\\end{quote}'].filter(Boolean).join('\n')
}

/** A line with an error, as a LaTeX comment (so it doesn’t stop the document compiling). */
export const errorComment = (line: number, what: string, error: string) => `% Line ${line}: ${what}\n% Error: ${error}`

// ---------------------------------------------------------------------------
// Plots (pgfplots)
// ---------------------------------------------------------------------------

/** Each series' colour, in order (xcolor names, as pgfplots loads xcolor). */
const PLOT_COLOURS = ['blue', 'orange', 'teal', 'violet', 'brown', 'cyan']

/** A number for pgfplots: plain, without float noise. */
const plotNumber = (v: number) => String(Number(v.toPrecision(10)))

/** An axis's or series' name and unit as LaTeX: `$t\,[\mathrm{s}]$`. */
function plotLabel(p: PlotName & { unit?: string }): string {
  const name = p.name ? symbolTex(p.name) : p.expr ? `\\text{${escapeTex(p.expr)}}` : ''
  const unit = p.unit ? `\\left[${unitTex(p.unit)}\\right]` : ''
  return `$${[name, unit].filter(Boolean).join('\\,')}$`
}

/**
 * A plot as a pgfplots graph: its points (with error bars for uncertainties),
 * lines between them if its style says so, and its fits as dashed lines.
 */
export function plotToLatex(plot: PlotData): string {
  const { settings } = plot
  const xs = plot.series.flatMap((s) => s.points.map((p) => p.x))
  const options = [
    'width=0.8\\linewidth', 'height=0.5\\linewidth', 'grid=major',
    `xlabel={${plotLabel(plot.x)}}`, `ylabel={${plotLabel(plot.y)}}`,
    ...(settings.title ? [`title={${escapeTex(settings.title)}}`] : []),
    ...(settings.x.log ? ['xmode=log'] : []),
    ...(settings.y.log ? ['ymode=log'] : []),
    ...(settings.x.from !== undefined ? [`xmin=${settings.x.from}`] : []),
    ...(settings.x.to !== undefined ? [`xmax=${settings.x.to}`] : []),
    ...(settings.y.from !== undefined ? [`ymin=${settings.y.from}`] : []),
    ...(settings.y.to !== undefined ? [`ymax=${settings.y.to}`] : []),
    ...(plot.series.length > 1 ? ['legend pos=north west'] : []),
  ]
  const lines = ['\\begin{center}', '\\begin{tikzpicture}', `\\begin{axis}[${options.join(', ')}]`]
  plot.series.forEach((s, i) => {
    const colour = PLOT_COLOURS[i % PLOT_COLOURS.length]
    const errors = s.points.some((p) => p.dx || p.dy)
    const style = [
      `color=${colour}`,
      settings.style === 'lines' ? 'no markers' : 'mark=*',
      ...(settings.style === 'points' ? ['only marks'] : []),
      ...(errors ? ['error bars/.cd', 'x dir=both', 'x explicit', 'y dir=both', 'y explicit'] : []),
    ]
    const coordinates = [...s.points].sort((a, b) => a.x - b.x).map((p) => `(${plotNumber(p.x)}, ${plotNumber(p.y)})`
      + (errors ? ` +- (${plotNumber(p.dx ?? 0)}, ${plotNumber(p.dy ?? 0)})` : ''))
    lines.push(`\\addplot[${style.join(', ')}] coordinates {${coordinates.join(' ')}};`)
    if (plot.series.length > 1) lines.push(`\\addlegendentry{${plotLabel(s)}}`)
    if (s.fit && xs.length) {
      const domain = `${plotNumber(Math.min(...xs))}:${plotNumber(Math.max(...xs))}`
      lines.push(`\\addplot[color=${colour}, dashed, no markers, domain=${domain}, samples=${settings.x.log ? 50 : 2}, forget plot] {${plotNumber(s.fit.slope)}*x + ${plotNumber(s.fit.intercept)}};`)
    }
  })
  lines.push('\\end{axis}', '\\end{tikzpicture}', '\\end{center}')
  return lines.join('\n')
}
