/**
 * The LaTeX export's toolkit: text, equations, cards and errors, as LaTeX.
 * These are the pieces each kind of block writes itself with (see constructs/);
 * none of them knows about blocks, so a construct can use them without the
 * export (latex.ts) being involved.
 */
import { TITLE_SEGMENT, titleSegments } from './textSegments.ts'
import { inClass, lit, regex, src } from '../syntax.ts'
import {
  ANY_COMMAND, HREF_SPECIAL, TEXT_AS_MATHS, TEXT_AS_MATHS_CHAR, TEX_ALIGN, TEX_ENVIRONMENT, TEX_ESCAPE, TEX_GROUP, TEX_LIST, TEX_RELATION,
  TEX_ROUND, TEX_SIGN, TEX_SUBSCRIPT, TEX_SUPERSCRIPT, commands, escapeTexChars, escapedBraceAt, texCommand,
} from '../latex/syntax.ts'
import type { LatexOptions } from './latex.ts'

// ---------------------------------------------------------------------------
// Text and equations
// ---------------------------------------------------------------------------

/** Text, with the characters LaTeX treats specially escaped. */
export const escapeTex = (s: string) =>
  escapeTexChars(s)
    // (Characters pdflatex can't set in text, past Latin-1, as a little maths: σ as $\sigma$.)
    .replace(TEXT_AS_MATHS_CHAR, (c) => `$${TEXT_AS_MATHS.get(c)}$`)

/**
 * A heading, block title or text in LaTeX: `2p_z` → 2p\textsubscript{z},
 * `**bold**` → \textbf{bold} (its maths \boldsymbol), `[text](url)` → \href{url}{text}.
 */
export function titleToLatex(text: string): string {
  return titleSegments(text).map((s) => {
    const piece = s.kind === TITLE_SEGMENT.math
      ? `$${s.bold ? `\\boldsymbol{${s.value}}` : s.value}$`
      : s.kind === TITLE_SEGMENT.sub ? `\\textsubscript{${escapeTex(s.value)}}` : escapeTex(s.value)
    // (Maths is bold by \boldsymbol, and italic already.)
    const italic = s.italic && s.kind !== TITLE_SEGMENT.math ? `\\textit{${piece}}` : piece
    const bold = s.bold && s.kind !== TITLE_SEGMENT.math ? `\\textbf{${italic}}` : italic
    return s.href === undefined ? bold : `\\${LINK_COMMAND}{${s.href.replace(HREF_SPECIAL, `${TEX_ESCAPE}$&`)}}{${bold}}`
  }).join('')
}

/** hyperref's command for a link, `\href{url}{text}` (the preamble loads hyperref when the document has one). */
export const LINK_COMMAND = 'href'

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
 * An equation centred on the page whatever the document's equations do (as a
 * plot's fit equations are, under it: the plot is always centred), with its
 * note after it. (A `center` environment, not `gather*`, which `fleqn` sets flush left.)
 */
export function centredEquation(e: Equation): string {
  const note = e.note ? `\\quad{${NOTE_STYLE}${titleToLatex(e.note)}}` : ''
  return ['\\begin{center}', `$\\displaystyle ${e.tex}$${note}`, '\\end{center}'].join('\n')
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
  '% A row of those too wide for the line, with what comes before it (#1), is set over several rows, at its + and −.',
  `\\newcommand{\\${FIT_ROW_MACRO}}[3]{\\sbox{\\${FIT_BOX}}{$\\displaystyle #1 #2$}%`,
  `  \\ifdim\\wd\\${FIT_BOX}>\\dimexpr\\linewidth${flushLeft ? '-\\mathindent' : ''}\\relax`,
  `  \\expandafter\\${FIT_SECOND}\\else\\expandafter\\${FIT_FIRST}\\fi{#2}{#3}}`,
]

/** The macro that sets one row of an equation's rows over several if it's too wide: `\msfitrow{before}{row}{rows}`. */
const FIT_ROW_MACRO = 'msfitrow'

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
const DRAWS_NOTHING = regex(
  src`${commands('left', 'right', 'mathrm', 'text', 'frac', 'sqrt', 'begin', 'end', 'displaystyle', 'quad', 'qquad', 'ce')}|${lit(TEX_ESCAPE)}[,;:! ]`, 'g',
)
/** Any other command, which draws one symbol: \times, \pi, \pm. */
const ONE_SYMBOL = regex(ANY_COMMAND, 'g')
/** Markup that draws nothing itself: braces, sub- and superscript marks, alignment, spaces. */
const MARKUP = regex(src`[${inClass(TEX_GROUP.open, TEX_GROUP.close, TEX_SUPERSCRIPT, TEX_SUBSCRIPT, TEX_ALIGN)}\s]`, 'g')

/** About how many characters an equation draws: its LaTeX without markup. */
const drawnLength = (tex: string) => tex.replace(DRAWS_NOTHING, '').replace(ONE_SYMBOL, ONE_CHARACTER).replace(MARKUP, '').length

/** What a command that draws one symbol counts as: one character, any. */
const ONE_CHARACTER = 'x'

/** The relations an equation's steps are joined with (as layoutEquation joins them), at a position. */
const RELATION_AT = regex(src` (${lit(TEX_RELATION.equals)}|${lit(TEX_RELATION.approx)}) `, 'y')
/** What opens or closes a group the relations inside it don't count in. */
const OPENS = regex(commands('left', 'begin'), 'y')
const CLOSES = regex(commands('right', 'end'), 'y')

/** A pattern's match at a position in some text, or null. */
const matchAt = (re: RegExp, text: string, i: number) => {
  re.lastIndex = i
  return re.exec(text)
}

/**
 * Each position in an equation's LaTeX that's at its top level (not in brackets,
 * braces or an environment), for `visit`, which can say where to go on from.
 */
function eachTopLevel(tex: string, visit: (i: number) => number | void): void {
  let depth = 0
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i]
    if (escapedBraceAt(tex, i)) {
      i++ // an escaped brace, \{ or \}, which is drawn
      continue
    }
    if (matchAt(OPENS, tex, i) || c === TEX_GROUP.open) depth++
    else if (matchAt(CLOSES, tex, i) || c === TEX_GROUP.close) depth--
    else if (depth === 0) i = visit(i) ?? i
  }
}

/** An equation's steps, and the relation before each after the first, split at its top level (not in brackets or braces). */
function stepsOf(tex: string): { steps: string[]; relations: string[] } {
  const steps: string[] = []
  const relations: string[] = []
  let start = 0
  eachTopLevel(tex, (i) => {
    const relation = matchAt(RELATION_AT, tex, i)
    if (!relation) return
    steps.push(tex.slice(start, i))
    relations.push(relation[1])
    start = i + relation[0].length
    return start - 1
  })
  steps.push(tex.slice(start))
  return { steps, relations }
}

/**
 * An equation as the fitting macro takes it, if it might not fit and has more
 * than one step to put on rows of their own; otherwise as it is. (One already
 * on rows, .multiline's, is as it is.)
 */
export function fitted(tex: string, share = 1): string {
  // (In a column, `share` of the line, a shorter one might not fit.)
  if (drawnLength(tex) <= MIGHT_NOT_FIT * share || tex.includes(`${TEX_ENVIRONMENT.open}{aligned}`)) return tex
  const { steps, relations } = stepsOf(tex)
  if (relations.length < 2) return tex
  const rows = steps.slice(1).map((s, i) => `&${relations[i]} ${brokenRow(`${steps[0]} ${relations[i]}`, s, share)}`)
  return `\\${FIT_MACRO}{${tex}}{\\begin{aligned}${steps[0]} ${rows.join(' \\\\ ')}\\end{aligned}}`
}

/** A + or − between terms, at a position (as the engine writes them: `a+ b`, `a- b`). */
const TERM_SIGN_AT = regex(src`[${inClass(TEX_SIGN.plus, TEX_SIGN.minus)}]`, 'y')
/** What a sign right after makes it a number's or a term's own sign, not one between terms. */
const BEFORE_OWN_SIGN = regex(
  src`(?:^|[${inClass(TEX_RELATION.equals, TEX_ROUND.open, TEX_LIST, TEX_SIGN.plus, TEX_SIGN.minus)}]|${lit(texCommand('times'))}|${lit(texCommand('cdot'))}|${lit(texCommand('pm'))})\s*$`,
)

/** A row's terms, split before each + or − at its top level (not in brackets, braces or a number's own sign). */
function termsOf(tex: string): string[] {
  const terms: string[] = []
  let start = 0
  eachTopLevel(tex, (i) => {
    if (matchAt(TERM_SIGN_AT, tex, i) && !BEFORE_OWN_SIGN.test(tex.slice(start, i)) && i > start) {
      terms.push(tex.slice(start, i).trim())
      start = i
    }
  })
  terms.push(tex.slice(start).trim())
  return terms.filter(Boolean)
}

/**
 * One row of an equation's rows: as it is, or, if it has several terms and
 * might be too wide even on a row of its own, as the row-fitting macro takes it
 * (LaTeX measures it with what's before it, `before`), its terms packed onto
 * rows of their own as many as fit, each after the first starting with its sign.
 */
function brokenRow(before: string, row: string, share: number): string {
  const room = MIGHT_NOT_FIT * share - drawnLength(before)
  if (drawnLength(row) <= room) return row
  const terms = termsOf(row)
  if (terms.length < 2) return row
  const lines: string[] = []
  for (const term of terms) {
    const last = lines.at(-1)
    if (last !== undefined && drawnLength(`${last}${term}`) <= room) lines[lines.length - 1] = `${last} ${term}`
    else lines.push(term)
  }
  if (lines.length < 2) return row
  const rows = lines.map((l, i) => (i ? `&\\quad ${l}` : `&${l}`)).join(' \\\\ ')
  return `\\${FIT_ROW_MACRO}{${before}}{${row}}{\\begin{aligned}[t]${rows}\\end{aligned}}`
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
