/**
 * The MathScribe sheet language for CodeMirror: highlighting, indentation and
 * folding, all from the sheet's tree (src/lib/tree), so the editor reads a sheet
 * exactly as the engine does.
 *
 * Each line is read in its place, as the tree reads it (stepLine: what it is,
 * what it's inside), into its tokens: its indentation, a heading's `#`s, what it
 * says, its #commands and note. What it says is then coloured by its kind: a
 * calculation's numbers, units and names; a block opener's title; prose with its
 * values and formulas; raw LaTeX.
 */
import { StreamLanguage, foldService, foldedRanges, indentService, type StringStream } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { closesVector, isUnitName } from '../lib/engine/index.ts'
import { SPECIES_TOKEN } from '../lib/engine/modules/chemistry/syntax.ts'
import { CHEM_NODE } from '../lib/engine/modules/chemistry/grammar.ts'
import {
  CONSTANT_TOKEN, FUNCTION_HEAD, GREEK_CHARS, INDENT_WIDTH, KEYWORD, NAME, NAME_CHAR, CONSTANTS_TOKEN, LATEX_OPENER, LATEX_TOKEN,
  LAYOUT_NAME_TOKEN, COMMENT_START, NAMESPACE_CALL_TOKEN, NUMBER, SETTINGS, UNPACK_SO_FAR, VALUE_IN_TEXT, COMMAND_NAMES, indentOf, isComment,
} from '../lib/syntax.ts'
import { LINE_ROLE, NODE_KIND, TOKEN_KIND, TOP, isToken, stepLine, type LineState } from '../lib/tree/index.ts'
import { BODY_END } from '../lib/tree/grammar.ts'
import { dataBlocks, foldRange, opensBody, readAs, sheetLine } from './sheetLines.ts'

/** What each piece of a line is coloured as (the keys of the language's tokenTable). */
const TOKEN = {
  number: 'number',
  unit: 'unit',
  variable: 'variable',
  function: 'function',
  definition: 'definition',
  constant: 'constant',
  keyword: 'keyword',
  command: 'command',
  note: 'note',
  comment: 'comment',
  value: 'value',
  /** A chemical formula: `{Na^+}`. */
  formula: 'formula',
  heading: 'heading',
  text: 'text',
  marker: 'marker',
  latex: 'latex',
  title: 'title',
  brace: 'brace',
  bracket: 'bracket',
  operator: 'operator',
} as const
type Token = (typeof TOKEN)[keyof typeof TOKEN]

/** How what a line says is coloured, by its kind (from the tree). */
const SAYS = {
  /** Numbers, units, names, operators. */
  expression: 'expression',
  /** A block's title, up to its `{` (after a layout's name, `@layout.list`, or `@constants`). */
  title: 'title',
  /** Prose, with its maths, values and formulas. */
  prose: 'prose',
  /** Raw LaTeX. */
  latex: 'latex',
  /** `@latex`, its `{`, then (on one line) the LaTeX and its `}`. */
  latexOpener: 'latexOpener',
  /** A heading's title. */
  heading: 'heading',
  /** A reaction's formula. */
  formula: 'formula',
  /** Imported data: numbers, and the column names (with units) in the first row. */
  rows: 'rows',
} as const
type Says = (typeof SAYS)[keyof typeof SAYS]

/** A piece of the line being coloured: one of the tree's tokens, where it ends on the line. */
interface Piece {
  readonly t: string
  readonly end: number
}

/** The tokenizer's state, carried from one token (and line) to the next. */
interface State {
  /** The bodies the next line is inside (the tree's). */
  lines: LineState
  /** The line's pieces, and how what it says is coloured. */
  pieces: readonly Piece[]
  says: Says
  /** It defines a function: `def f(…)` (its name is a definition). */
  defines: boolean
  /** The previous token was a number, so a unit name now is a unit. */
  afterNumber: boolean
  /** Inside a unit (`m/s^2`): `/unit`, `*unit` and `^2` continue it. */
  inUnit: boolean
  /** After `to`: what follows is a unit. */
  afterTo: boolean
}

/** How a line's text (`text`) is coloured, by its kind and role. */
function saysOf(kind: string, role: string, opensTitled: boolean): Says {
  if (role === LINE_ROLE.row) return SAYS.rows
  if (opensTitled) return SAYS.title
  switch (kind) {
    case NODE_KIND.heading: return SAYS.heading
    case NODE_KIND.paragraph:
    case NODE_KIND.proseLine: return SAYS.prose
    case NODE_KIND.latexLine: return SAYS.latex
    case NODE_KIND.latex:
    case NODE_KIND.latexOpener: return SAYS.latexOpener
    case CHEM_NODE.reaction: return SAYS.formula
    default: return SAYS.expression
  }
}

/** Read the line at the stream's start in its place, and set the state for colouring it. */
function startLine(stream: StringStream, state: State): void {
  const step = stepLine(state.lines, { text: stream.string, eol: '' })
  state.lines = step.state
  let end = 0
  state.pieces = step.node.parts.filter(isToken).map((p) => ({ t: p.t, end: (end += p.text.length) }))
  // A block opener with a title: one whose body is braced and isn't raw LaTeX (`Title {`, `@layout.list Title {`).
  const titled = step.role === LINE_ROLE.opener && (step.body?.ends === BODY_END.closer || step.body?.ends === BODY_END.brace)
  state.says = saysOf(step.node.kind, step.role, titled)
  state.defines = step.node.kind === NODE_KIND.defLine
  state.afterNumber = state.inUnit = state.afterTo = false
}

/** The kind of the piece at a position on the line. */
const pieceAt = (pieces: readonly Piece[], pos: number) => pieces.find((p) => pos < p.end)?.t

/** The next token on the line, and its kind (a key of tokenTable below). */
function token(stream: StringStream, state: State): Token | null {
  if (stream.sol()) startLine(stream, state)
  if (stream.eatSpace()) {
    // A space ends a compound unit (`5 kg * m` multiplies by a variable m).
    state.inUnit = false
    return null
  }
  // (Imported data's rows are rows, whatever's in them: a `#` or `//` in one is the file's.)
  const piece = state.says === SAYS.rows ? TOKEN_KIND.rows : pieceAt(state.pieces, stream.pos)
  switch (piece) {
    case TOKEN_KIND.comment:
      stream.skipToEnd()
      return TOKEN.comment
    case TOKEN_KIND.marks:
      // (A heading is all one: its `#`s and its title. A block titled as a section has its title after.)
      if (state.says === SAYS.heading) stream.skipToEnd()
      else stream.match(/^#+/)
      return TOKEN.heading
    case TOKEN_KIND.command:
      stream.match(/^#\S+/)
      return TOKEN.command
    case TOKEN_KIND.note:
      stream.skipToEnd()
      return TOKEN.note
  }
  switch (state.says) {
    case SAYS.heading:
      stream.skipToEnd()
      return TOKEN.heading
    case SAYS.prose:
      return proseToken(stream)
    case SAYS.latex:
      stream.skipToEnd()
      return TOKEN.latex
    case SAYS.latexOpener:
      if (stream.match(LATEX_TOKEN)) return TOKEN.keyword
      if (stream.match(/^\{\s*$/)) return TOKEN.brace
      stream.skipToEnd()
      return TOKEN.latex
    case SAYS.formula:
      if (stream.match(FORMULA_TOKEN)) return TOKEN.formula
      stream.skipToEnd()
      return TOKEN.note
    case SAYS.rows:
      if (stream.match(NUMBER_TOKEN)) return TOKEN.number
      if (stream.match(WORD)) return TOKEN.variable
      stream.next()
      return null
    case SAYS.title:
      if (stream.match(LAYOUT_NAME_TOKEN) || stream.match(CONSTANTS_TOKEN) || stream.match(SPECIES_TOKEN)) return TOKEN.keyword
      if (stream.match(/\{\s*(?=#|$)/)) return TOKEN.brace
      if (!stream.match(/[^#]+?(?=\s*\{\s*(?:#|$))/)) stream.next()
      return TOKEN.title
  }
  return expressionToken(stream, state)
}

/** A word at the current position: a name (Greek letters included), keyword or unit (µm starts with the micro sign). */
const WORD = new RegExp(`[A-Za-z_µ${GREEK_CHARS}]${NAME_CHAR}*`)
/** A number at the current position. */
const NUMBER_TOKEN = new RegExp(NUMBER)
/** Words coloured as keywords. */
const KEYWORDS: ReadonlySet<string> = new Set(Object.values(KEYWORD))

// What's been typed so far on a line, when the next word is a display setting
// (a unit after `:`, as in `phi:3:deg`):
/** …on the name being assigned: `phi:3:`. */
const NAME_SETTINGS_SO_FAR = new RegExp(String.raw`^\s*${NAME}${SETTINGS}$`)
// …on a name being unpacked, `@tuple(r:3, theta:`: UNPACK_SO_FAR.
/** …on a function's result: `f(x):3:`, `def polar(x, y):`. */
const FUNCTION_SETTINGS_SO_FAR = new RegExp(String.raw`^\s*(?:${KEYWORD.def}\s+)?${NAME}\s*\([^()]*\)${SETTINGS}$`)

/** What a calculation (or a function's line, a def, an import, a constant) says: numbers, units, names, operators. */
function expressionToken(stream: StringStream, state: State): Token | null {
  const wasAfterNumber = state.afterNumber
  state.afterNumber = false

  if (stream.match(NUMBER_TOKEN)) {
    state.afterNumber = true
    state.inUnit = false
    return TOKEN.number
  }
  // `@chem.mm(…)`, `@tuple(…)`: a built-in function (before constants, which `@chem.mm` would also look like).
  if (stream.match(NAMESPACE_CALL_TOKEN)) return TOKEN.function
  // `@chem.species name = {…}`: naming a species, on a line of its own.
  if (stream.match(SPECIES_TOKEN)) return TOKEN.keyword
  if (stream.match(CONSTANT_TOKEN)) return TOKEN.constant
  // A species after a unit: `mol {EDTA}`.
  if (stream.match(FORMULA_TOKEN)) return TOKEN.formula

  // A unit continues with /unit, *unit or ^n right after it.
  if (state.inUnit) {
    if (stream.match(/\^\(?-?\d+(?:\.\d+)?\)?/)) return TOKEN.unit
    const m = stream.match(/[/*·]([A-Za-z]+)(?![\w(])/, false) as RegExpMatchArray | null
    if (m && isUnitName(m[1])) {
      stream.match(/[/*·][A-Za-z]+/)
      return TOKEN.unit
    }
    state.inUnit = false
  }

  const word = stream.match(WORD) as RegExpMatchArray | null
  if (word) {
    const id = word[0]
    const call = /^\s*\(/.test(stream.string.slice(stream.pos))
    // A display unit on the assigned name: the deg in `phi:3:deg = …`.
    // (Also a name being unpacked: the deg in `@tuple(r:3, theta:deg) = …`.)
    const lhsSoFar = stream.string.slice(0, stream.pos)
    const displayUnit = stream.string[stream.start - 1] === ':'
      && (NAME_SETTINGS_SO_FAR.test(lhsSoFar) || UNPACK_SO_FAR.test(lhsSoFar)
        // …or a function's result: `f(x):3:deg = …`, `def polar(x, y):deg`
        || FUNCTION_SETTINGS_SO_FAR.test(lhsSoFar))
    if ((wasAfterNumber || state.afterTo || displayUnit) && !call && isUnitName(id)) {
      state.inUnit = true
      state.afterTo = false
      return TOKEN.unit
    }
    state.afterTo = id === KEYWORD.to
    if (KEYWORDS.has(id)) return TOKEN.keyword
    if (call) {
      // `def f(…)`, or `f(…) = …` at the start of a line: a definition.
      const oneLiner = stream.start === /^\s*/.exec(stream.string)![0].length
        && FUNCTION_HEAD.test(stream.string.trimStart())
      return state.defines || oneLiner ? TOKEN.definition : TOKEN.function
    }
    return TOKEN.variable
  }

  if (stream.match('±') || stream.match('+-')) return TOKEN.keyword
  // The `>` closing a vector, `<3.0, 4.0> N`: a unit can follow it, as after a number.
  if (stream.peek() === '>' && closesVector(stream.string, stream.pos)) {
    stream.next()
    state.afterNumber = true
    return TOKEN.operator
  }
  if (stream.match(/[-+*/^=<>!%,·]/)) return TOKEN.operator
  if (stream.match(/[()[\]{}]/)) return TOKEN.bracket
  if (stream.match(':')) return TOKEN.operator
  stream.next()
  return null
}

/** A formula, `{Na^+}`, at the current position (not a value's `{{`). */
const FORMULA_TOKEN = /^\{(?!\{)[^{}]+\}/

/** A value in prose, `{{c_Na}}`, at the current position. */
const VALUE_TOKEN = new RegExp(`^${VALUE_IN_TEXT.source}`)
/** Prose up to the next maths, value or formula. */
const PROSE_RUN = /^[^${]+/

/** `> prose with $inline maths$ and {{values}}`: the maths and values are set off from the prose. */
function proseToken(stream: StringStream): Token {
  if (stream.sol() || !stream.string.slice(0, stream.pos).trim()) {
    if (stream.eat('>')) return TOKEN.marker
  }
  if (stream.match(/\$[^$]*\$/)) return TOKEN.latex
  if (stream.match(VALUE_TOKEN)) return TOKEN.value
  if (stream.match(FORMULA_TOKEN)) return TOKEN.formula
  if (!stream.match(PROSE_RUN)) stream.next()
  return TOKEN.text
}

/** The MathScribe language: its tokens, and which highlighting tag each gets. */
export const mathscribeLanguage = StreamLanguage.define<State>({
  name: 'mathscribe',
  startState: () => ({
    lines: TOP, pieces: [], says: SAYS.expression, defines: false, afterNumber: false, inUnit: false, afterTo: false,
  }),
  copyState: (s) => ({ ...s }),
  // An empty line is read in its place too (it ends an import's rows).
  blankLine: (s) => {
    s.lines = stepLine(s.lines, { text: '', eol: '' }).state
  },
  token,
  tokenTable: {
    [TOKEN.number]: tags.number,
    [TOKEN.unit]: tags.unit,
    [TOKEN.variable]: tags.variableName,
    [TOKEN.function]: tags.function(tags.variableName),
    [TOKEN.definition]: tags.definition(tags.function(tags.variableName)),
    [TOKEN.constant]: tags.constant(tags.variableName),
    [TOKEN.keyword]: tags.keyword,
    [TOKEN.command]: tags.processingInstruction,
    [TOKEN.note]: tags.lineComment,
    [TOKEN.comment]: tags.comment,
    [TOKEN.value]: tags.special(tags.variableName),
    [TOKEN.formula]: tags.atom,
    [TOKEN.heading]: tags.heading,
    [TOKEN.text]: tags.content,
    [TOKEN.marker]: tags.quote,
    [TOKEN.latex]: tags.special(tags.string),
    [TOKEN.title]: tags.labelName,
    [TOKEN.brace]: tags.brace,
    [TOKEN.bracket]: tags.paren,
    [TOKEN.operator]: tags.operator,
  },
  languageData: {
    // Ctrl+/ toggles a `//` comment. (Not #: a line starting with # is a heading.)
    commentTokens: { line: COMMENT_START },
    // Typing `}` on its own re-indents the line to match its block.
    indentOnInput: /^\s*\}$/,
  },
})

/**
 * Indentation for a new or re-indented line: the line above's, one level deeper
 * after a line that opens a body, and one level shallower for a closing `}`.
 *
 * A new line straight after a folded block (Enter at the end of a folded
 * `@import(…)`, whose data rows are hidden) takes the folded line's
 * indentation, so it isn't added to the hidden rows. With the block open, Enter
 * in its rows carries on with them.
 */
export const mathscribeIndent = indentService.of((cx, pos) => {
  let foldedFrom: number | null = null
  foldedRanges(cx.state).between(pos, pos, (from, to) => {
    if (to === pos) foldedFrom = from
  })
  if (foldedFrom !== null) return indentOf(cx.state.doc.lineAt(foldedFrom).text)
  const { doc } = cx.state
  const at = doc.lineAt(pos)
  // When Enter is pressed, the line being indented is a new one that starts at
  // `pos` (a "simulated break"): the line above it is pos's own line, up to pos.
  // Otherwise (re-indenting an existing line) it's the line before pos's.
  const breaking = cx.simulatedBreak === pos
  const lineNumber = breaking ? at.number + 1 : at.number
  const lineText = breaking ? at.text.slice(pos - at.from) : at.text
  const textOf = (n: number) => (breaking && n === at.number ? at.text.slice(0, pos - at.from) : doc.line(n).text)
  for (let n = lineNumber - 1; n >= 1; n--) {
    const above = textOf(n)
    if (!above.trim()) continue
    // Below a blank line, an import's rows have ended: go on at the import's level.
    if (n < lineNumber - 1) {
      const block = dataBlocks(doc).find((b) => n >= b.header && n <= (b.rows?.last ?? b.header))
      if (block) return indentOf(doc.line(block.line).text)
    }
    // (The line above as it is now: up to the cursor, if Enter is splitting it.)
    const step = breaking && n === at.number ? readAs(doc, n, above) : sheetLine(doc, n).step
    let indent = indentOf(above) + (opensBody(step, above) ? INDENT_WIDTH : 0)
    if (/^\s*\}/.test(lineText)) indent -= INDENT_WIDTH
    return Math.max(0, indent)
  }
  return 0
})

/** Folding: a block folds up to its `}`; a `def`, an `@import(…)` or a branch, its indented lines. */
export const mathscribeFolding = foldService.of((state, lineStart, lineEnd) => {
  const { doc } = state
  const first = doc.lineAt(lineStart)
  // (The editor's document is a new object for each version, so what's read of it is kept until it changes.)
  const range = foldRange(doc, first.number)
  if (!range) return null
  const end = doc.line(range.to).to
  return end > lineEnd ? { from: lineEnd, to: end } : null
})

/** Whether a line (or the start of it) is a heading, prose, raw LaTeX or a comment, where there are no names. */
export const isProseLine = (before: string) => /^\s*[#>]/.test(before) || LATEX_OPENER.test(before.trim()) || isComment(before)

/** Whether a value in text, `{{…`, is being typed here, where there are names after all. */
export const inValue = (before: string) => /\{\{[^{}]*$/.test(before) && !isComment(before)

/** A finished display command (followed by a space), anywhere in a line. */
const TYPED_COMMAND = new RegExp(String.raw`(?:^|\s)#(?:${COMMAND_NAMES.join('|')})(?=\s)`, 'g')

/** Whether a `#` note has started on the line before this point (not one of the commands). */
export const inNote = (before: string) => /(?:^|\s)#/.test(before.replace(TYPED_COMMAND, ' '))

