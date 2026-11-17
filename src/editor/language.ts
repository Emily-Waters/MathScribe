/**
 * The MathScribe sheet language for CodeMirror: highlighting, indentation and
 * folding, all from the sheet's tree (src/lib/tree), so the editor reads a sheet
 * exactly as the engine does.
 *
 * Each line is read in its place, as the tree reads it (stepLine: what it is,
 * what it's inside), into its tokens: its indentation, a heading's `#`s, what it
 * says, its #commands and note. What it says is then coloured by its kind: a
 * calculation's numbers, units and names; a block opener's name, title and `{`; prose with its
 * values and formulas; raw LaTeX.
 */
import { StreamLanguage, foldService, foldedRanges, indentService, type StringStream } from '@codemirror/language'
import { tags } from '@lezer/highlight'
// (The engine installs its modules as it loads: their kinds of line and their rules for expressions are then the tree's.)
import '../lib/engine/index.ts'
import { CHEM_NODE, CHEM_TOKEN } from '../lib/engine/modules/chemistry/grammar.ts'
import { SERIES_TOKEN } from '../lib/engine/modules/series/grammar.ts'
import {
  INDENT_WIDTH, LATEX_OPENER, COMMENT_START,
  VALUE_BRACES, COMMAND_NAMES, indentOf, isComment,
} from '../lib/syntax.ts'
import { LINE_ROLE, NODE_KIND, TOKEN_KIND, TOP, isToken, stepLine, type LineState, type Part, type SyntaxNode } from '../lib/tree/index.ts'
import { dataBlocks, foldRange, opensBody, readAs, sheetLine } from './sheetLines.ts'
import { ROW_PIECE, rowPieces, type RowPiece, type RowPieceKind } from '../lib/data/csv.ts'

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

/** A piece of the line being coloured: one of the tree's tokens, where it ends on the line, whether it's what a call calls, and whether that's a definition. */
interface Piece {
  readonly t: string
  readonly end: number
  readonly callee?: boolean
  /** In a one-line function's head, `f(x) = …`: what it calls is the function being defined. */
  readonly defines?: boolean
}

/** The tokenizer's state, carried from one token (and line) to the next. */
interface State {
  /** The bodies the next line is inside (the tree's). */
  lines: LineState
  /** The line's pieces, and how what it says is coloured. */
  pieces: readonly Piece[]
  says: Says
  /** A row of imported data's values, names and units (csv.ts rowPieces). */
  rowPieces: readonly RowPiece[]
}

/** How a line's text (`text`) is coloured, by its kind and role. */
function saysOf(kind: string, role: string): Says {
  if (role === LINE_ROLE.row) return SAYS.rows
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
  state.pieces = piecesOf(step.node)
  state.says = saysOf(step.node.kind, step.role)
  state.rowPieces = state.says === SAYS.rows ? rowPieces(stream.string) : []
}

/** A line's tokens, its expression's nodes' too (a quantity's, a call's), as pieces where each ends on the line. */
function piecesOf(line: SyntaxNode): Piece[] {
  const pieces: Piece[] = []
  let end = 0
  const add = (parts: readonly Part[], call: boolean, head: boolean) => parts.forEach((p, i) => {
    if (isToken(p)) pieces.push({ t: p.t, end: (end += p.text.length), callee: call && i === 0, defines: head })
    // (A one-line function's head, `f(x)` in `f(x) = x^2`: its name is a definition.)
    else add(p.parts, p.kind === NODE_KIND.call, head || p.kind === NODE_KIND.functionHead)
  })
  add(line.parts, false, false)
  return pieces
}

/** How each of an expression's tokens is coloured (what a call calls, by expressionStyle). */
const EXPRESSION_STYLE: Readonly<Record<string, Token | null>> = {
  [TOKEN_KIND.number]: TOKEN.number,
  [TOKEN_KIND.unit]: TOKEN.unit,
  [TOKEN_KIND.symbol]: TOKEN.variable,
  [TOKEN_KIND.builtin]: TOKEN.constant,
  [TOKEN_KIND.keyword]: TOKEN.keyword,
  [TOKEN_KIND.string]: TOKEN.text,
  [TOKEN_KIND.unknown]: null,
  [CHEM_TOKEN.species]: TOKEN.formula,
  [CHEM_TOKEN.formula]: TOKEN.formula,
  [SERIES_TOKEN.settings]: TOKEN.text,
}

/** Brackets, among the delimiters (the rest are operators). */
const BRACKETS = /^[()[\]{}]$/

/** How an expression's token is coloured. */
function expressionStyle(piece: Piece, text: string): Token | null {
  if (piece.t === TOKEN_KIND.delimiter) {
    if (text === VALUE_BRACES.open || text === VALUE_BRACES.close) return TOKEN.value
    return BRACKETS.test(text) ? TOKEN.bracket : TOKEN.operator
  }
  if (piece.callee) return piece.t === TOKEN_KIND.symbol && piece.defines ? TOKEN.definition : TOKEN.function
  return EXPRESSION_STYLE[piece.t] ?? null
}

/** How each token coloured all at once is coloured: #commands, notes, and a block opener's name, title and brace. */
const WHOLE_TOKEN_STYLE: Readonly<Record<string, Token>> = {
  [TOKEN_KIND.command]: TOKEN.command,
  [TOKEN_KIND.note]: TOKEN.note,
  [TOKEN_KIND.blockName]: TOKEN.keyword,
  [TOKEN_KIND.title]: TOKEN.title,
  [TOKEN_KIND.blockOpen]: TOKEN.brace,
  [TOKEN_KIND.marker]: TOKEN.marker,
  [TOKEN_KIND.maths]: TOKEN.latex,
}

/** The piece at a position on the line. */
const pieceAt = (pieces: readonly Piece[], pos: number) => pieces.find((p) => pos < p.end)

/** The next token on the line, and its kind (a key of tokenTable below). */
function token(stream: StringStream, state: State): Token | null {
  if (stream.sol()) startLine(stream, state)
  if (stream.eatSpace()) return null
  // (Imported data's rows are rows, whatever's in them: a `#` or `//` in one is the file's.)
  const at = state.says === SAYS.rows ? undefined : pieceAt(state.pieces, stream.pos)
  // An expression's token: coloured as it is, all of it at once.
  if (at && (at.t in EXPRESSION_STYLE || at.t === TOKEN_KIND.delimiter)) {
    const text = stream.string.slice(stream.pos, at.end)
    stream.pos = at.end
    return expressionStyle(at, text)
  }
  const piece = state.says === SAYS.rows ? TOKEN_KIND.rows : at?.t
  switch (piece) {
    case TOKEN_KIND.comment:
      stream.skipToEnd()
      return TOKEN.comment
    case TOKEN_KIND.marks:
      // (A heading is all one: its `#`s and its title. A block titled as a section has its title after.)
      if (state.says === SAYS.heading) stream.skipToEnd()
      else stream.pos = at!.end
      return TOKEN.heading
  }
  // A token coloured as it is, all of it at once: a #command, a note (a #command after it is a
  // command, coloured as one), and a block opener's name, title and brace.
  const style = piece === undefined ? undefined : WHOLE_TOKEN_STYLE[piece]
  if (style) {
    stream.pos = at!.end
    return style
  }
  switch (state.says) {
    case SAYS.heading:
      stream.skipToEnd()
      return TOKEN.heading
    case SAYS.prose:
      // (Prose's text: its maths, values and formulas are tokens of their own, coloured above.)
      stream.pos = at?.end ?? stream.string.length
      return TOKEN.text
    case SAYS.latex:
      stream.skipToEnd()
      return TOKEN.latex
    case SAYS.latexOpener:
      // (After its name and `{`: the LaTeX, on one line.)
      stream.skipToEnd()
      return TOKEN.latex
    case SAYS.formula:
      // (A reaction on a line of its own: what it says is its formula.)
      stream.pos = at?.end ?? stream.string.length
      return TOKEN.formula
    case SAYS.rows: {
      // (Imported data, as csv.ts reads it: values, and the first row's names and units.)
      const next = state.rowPieces.find((p) => p.end > stream.pos)
      if (next && next.start <= stream.pos) {
        stream.pos = next.end
        return ROW_STYLE[next.kind]
      }
      stream.pos = next?.start ?? stream.string.length
      return null
    }
  }
  // (What's left: a line's text that isn't an expression's, as a closing `}`.)
  if (stream.match(/^[()[\]{}]/)) return TOKEN.bracket
  stream.next()
  return null
}

/** How each piece of imported data is coloured. */
const ROW_STYLE: Readonly<Record<RowPieceKind, Token>> = {
  [ROW_PIECE.number]: TOKEN.number,
  [ROW_PIECE.name]: TOKEN.variable,
  [ROW_PIECE.unit]: TOKEN.unit,
}

/** The MathScribe language: its tokens, and which highlighting tag each gets. */
export const mathscribeLanguage = StreamLanguage.define<State>({
  name: 'mathscribe',
  startState: () => ({
    lines: TOP, pieces: [], says: SAYS.expression, rowPieces: [],
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
    let indent = indentOf(above) + (opensBody(step) ? INDENT_WIDTH : 0)
    if (/^\s*\}/.test(lineText)) indent -= INDENT_WIDTH
    return Math.max(0, indent)
  }
  return 0
})

/** Folding: a block folds up to its `}`; an `@import(…)`, its indented rows. */
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

