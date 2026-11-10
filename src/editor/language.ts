/**
 * The MathScribe sheet language for CodeMirror: a line-by-line tokenizer for
 * highlighting, plus indentation and folding that follow the sheet's own rules.
 *
 * The tokenizer reads lines the way the engine does (document.ts / engine.ts):
 * a line's first character decides what kind of line it is, a unit name right
 * after a number is a unit (`9.81 m/s^2`), and `#` starts either a display
 * command (`#sym`, `#numbered`, …) or a note.
 */
import { StreamLanguage, foldService, foldedRanges, indentService, type StringStream } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { closesVector, isUnitName } from '../lib/engine.ts'
import {
  COMMAND_NAMES, CONSTANT_TOKEN, FUNCTION_HEAD, GREEK_CHARS, IMPORT, INDENT_WIDTH, NAME, NAME_CHAR, NUMBER, SETTINGS,
  commandPattern, indentOf,
} from '../lib/syntax.ts'

/** What a line is, from how it starts and ends (as document.ts reads it). */
type LineKind = 'calc' | 'heading' | 'text' | 'latex' | 'opener' | 'def' | 'data'

/** The tokenizer's state, carried from one token (and line) to the next. */
interface State {
  kind: LineKind
  /** The previous token was a number, so a unit name now is a unit. */
  afterNumber: boolean
  /** Inside a unit (`m/s^2`): `/unit`, `*unit` and `^2` continue it. */
  inUnit: boolean
  /** After `to`: what follows is a unit. */
  afterTo: boolean
  /** On an opener line, before its `:` or `{`: words are the block's title. */
  inTitle: boolean
  /** Inside a `Title:  #text` block: the opener's indentation (lines indented further are prose). */
  textIndent: number | null
  /** Under an `import(…)` line: its indentation (lines indented further are the file's rows). */
  dataIndent: number | null
}

/** A display command at the current position: `#sym`, `#numbered`, … */
const COMMAND = new RegExp(String.raw`#(?:${COMMAND_NAMES.join('|')})(?=\s|$)`)
/** `#text` on an opener: the lines indented under it are prose. */
const TEXT_COMMAND = commandPattern(['text'])
/** A word at the current position: a name (Greek letters included), keyword or unit (µm starts with the micro sign). */
const WORD = new RegExp(`[A-Za-z_µ${GREEK_CHARS}]${NAME_CHAR}*`)
/** A number at the current position. */
const NUMBER_TOKEN = new RegExp(NUMBER)
/** Words coloured as keywords. */
const KEYWORDS = new Set(['def', 'return', 'to', 'pm'])

// What's been typed so far on a line, when the next word is a display setting
// (a unit after `:`, as in `phi:3:deg`):
/** …on the name being assigned: `phi:3:`. */
const NAME_SETTINGS_SO_FAR = new RegExp(String.raw`^\s*${NAME}${SETTINGS}$`)
/** …on a name being unpacked: `tuple(r:3, theta:`. */
const UNPACK_SO_FAR = /^\s*tuple\s*\([^()=]*$/
/** …on a function's result: `f(x):3:`, `def polar(x, y):`. */
const FUNCTION_SETTINGS_SO_FAR = new RegExp(String.raw`^\s*(?:def\s+)?${NAME}\s*\([^()]*\)${SETTINGS}$`)

/** The line without its note and commands, to see how it ends. */
function bodyOf(line: string): string {
  return line.replace(/#.*$/, '').trim()
}

/** What kind of line `line` (trimmed of nothing) is, from how it starts and ends. */
function lineKind(line: string): LineKind {
  const t = line.trim()
  if (t.startsWith('#')) return 'heading'
  if (t.startsWith('>')) return 'text'
  if (t.startsWith('$')) return 'latex'
  if (/^def\s/.test(t)) return 'def'
  const body = bodyOf(t)
  if (body.endsWith(':') || (body.endsWith('{') && !body.startsWith('@constants'))) return 'opener'
  return 'calc'
}

/** The next token on the line, and its kind (a key of tokenTable below). */
function token(stream: StringStream, state: State): string | null {
  if (stream.sol()) {
    const indent = indentOf(stream.string)
    // A text block, or imported data, ends at the first line indented no further than its opener.
    // (Imported data also ends at a blank line; see blankLine below.)
    if (state.textIndent !== null && indent <= state.textIndent) state.textIndent = null
    if (state.dataIndent !== null && (indent <= state.dataIndent || !stream.string.trim())) state.dataIndent = null
    if (state.textIndent !== null) {
      state.kind = 'text'
    } else if (state.dataIndent !== null) {
      state.kind = 'data'
    } else {
      state.kind = lineKind(stream.string)
      // `Title:  #text`: the lines indented under it are prose.
      if (state.kind === 'opener' && TEXT_COMMAND.test(stream.string)) state.textIndent = indent
      // `import("run1.csv")`: the lines indented under it are the file's rows.
      if (isImport(stream.string)) state.dataIndent = indent
    }
    state.afterNumber = state.inUnit = state.afterTo = false
    state.inTitle = state.kind === 'opener'
  }
  if (stream.eatSpace()) {
    // A space ends a compound unit (`5 kg * m` multiplies by a variable m).
    state.inUnit = false
    return null
  }

  switch (state.kind) {
    case 'heading':
      stream.skipToEnd()
      return 'heading'
    case 'text':
      return proseToken(stream)
    case 'latex':
      stream.skipToEnd()
      return 'latex'
    case 'data':
      // A file's rows: numbers, and the column names (with units) in the first row.
      if (stream.match(NUMBER_TOKEN)) return 'number'
      if (stream.match(WORD)) return 'variable'
      stream.next()
      return null
  }

  // Commands and notes, on any other line.
  if (stream.peek() === '#') {
    if (stream.match(COMMAND)) return 'command'
    stream.skipToEnd()
    return 'note'
  }

  // An opener's title, up to its `:` or `{`.
  if (state.inTitle) {
    if (stream.match(/[:{]\s*(?=#|$)/)) {
      state.inTitle = false
      return 'brace'
    }
    if (!stream.match(/[^#:{]+?(?=\s*[:{]\s*(?:#|$))/)) stream.next()
    return 'title'
  }

  const wasAfterNumber = state.afterNumber
  state.afterNumber = false

  if (stream.match(NUMBER_TOKEN)) {
    state.afterNumber = true
    state.inUnit = false
    return 'number'
  }
  if (stream.match(CONSTANT_TOKEN)) return 'constant'

  // A unit continues with /unit, *unit or ^n right after it.
  if (state.inUnit) {
    if (stream.match(/\^\(?-?\d+(?:\.\d+)?\)?/)) return 'unit'
    const m = stream.match(/[/*·]([A-Za-z]+)(?![\w(])/, false) as RegExpMatchArray | null
    if (m && isUnitName(m[1])) {
      stream.match(/[/*·][A-Za-z]+/)
      return 'unit'
    }
    state.inUnit = false
  }

  const word = stream.match(WORD) as RegExpMatchArray | null
  if (word) {
    const id = word[0]
    const call = /^\s*\(/.test(stream.string.slice(stream.pos))
    // A display unit on the assigned name: the deg in `phi:3:deg = …`.
    // (Also a name being unpacked: the deg in `tuple(r:3, theta:deg) = …`.)
    const lhsSoFar = stream.string.slice(0, stream.pos)
    const displayUnit = stream.string[stream.start - 1] === ':'
      && (NAME_SETTINGS_SO_FAR.test(lhsSoFar) || UNPACK_SO_FAR.test(lhsSoFar)
        // …or a function's result: `f(x):3:deg = …`, `def polar(x, y):deg`
        || FUNCTION_SETTINGS_SO_FAR.test(lhsSoFar))
    if ((wasAfterNumber || state.afterTo || displayUnit) && !call && isUnitName(id)) {
      state.inUnit = true
      state.afterTo = false
      return 'unit'
    }
    state.afterTo = id === 'to'
    if (KEYWORDS.has(id)) return 'keyword'
    if (call) {
      // `def f(…)`, or `f(…) = …` at the start of a line: a definition.
      // (Not `tuple(a, b) = …`, which unpacks a tuple rather than defining a function.)
      const oneLiner = stream.start === /^\s*/.exec(stream.string)![0].length && id !== 'tuple'
        && FUNCTION_HEAD.test(stream.string.trimStart())
      return state.kind === 'def' || oneLiner ? 'definition' : 'function'
    }
    return 'variable'
  }

  if (stream.match('±') || stream.match('+-')) return 'keyword'
  // The `>` closing a vector, `<3.0, 4.0> N`: a unit can follow it, as after a number.
  if (stream.peek() === '>' && closesVector(stream.string, stream.pos)) {
    stream.next()
    state.afterNumber = true
    return 'operator'
  }
  if (stream.match(/[-+*/^=<>!%,·]/)) return 'operator'
  if (stream.match(/[()[\]{}]/)) return 'bracket'
  if (stream.match(':')) return 'operator'
  stream.next()
  return null
}

/** `> prose with $inline maths$`: the maths is set off from the prose. */
function proseToken(stream: StringStream): string {
  if (stream.sol()) {
    stream.eatSpace()
    if (stream.eat('>')) return 'marker'
  }
  if (stream.match(/\$[^$]*\$/)) return 'latex'
  if (!stream.match(/[^$]+/)) stream.next()
  return 'text'
}

/** The MathScribe language: its tokens, and which highlighting tag each gets. */
export const mathscribeLanguage = StreamLanguage.define<State>({
  name: 'mathscribe',
  startState: () => ({
    kind: 'calc', afterNumber: false, inUnit: false, afterTo: false, inTitle: false, textIndent: null, dataIndent: null,
  }),
  copyState: (s) => ({ ...s }),
  // An empty line ends an import's rows.
  blankLine: (s) => {
    s.dataIndent = null
  },
  token,
  tokenTable: {
    number: tags.number,
    unit: tags.unit,
    variable: tags.variableName,
    function: tags.function(tags.variableName),
    definition: tags.definition(tags.function(tags.variableName)),
    constant: tags.constant(tags.variableName),
    keyword: tags.keyword,
    command: tags.processingInstruction,
    note: tags.lineComment,
    heading: tags.heading,
    text: tags.content,
    marker: tags.quote,
    latex: tags.special(tags.string),
    title: tags.labelName,
    brace: tags.brace,
    bracket: tags.paren,
    operator: tags.operator,
  },
  languageData: {
    // (No comment token: a line starting with # is a heading, not a comment,
    // so Ctrl+/ "toggle comment" would change what the line means.)
    // Typing `}` on its own re-indents the line to match its block.
    indentOnInput: /^\s*\}$/,
  },
})

/** Whether a line opens an indented block: `Title:`, `name {`, or a `def`. */
const opensBlock = (text: string) => {
  const t = text.trim()
  return /^def\s/.test(t) || /[:{]$/.test(bodyOf(t))
}

/**
 * Whether a line is an `import(…)`. Its file's rows are indented under it, but
 * only by choosing the file, so a new line after it isn't indented.
 */
export const isImport = (text: string) => IMPORT.test(bodyOf(text))

/** An `import(…)` line and the lines of its data: the header row, then the first and last data rows. */
export interface DataBlock {
  line: number
  header: number
  rows: { first: number; last: number } | null
}

/** Every `import(…)` line with data under it, and where its rows are (line numbers, 1-based). */
export function dataBlocks(doc: { lines: number; line(n: number): { text: string } }): DataBlock[] {
  const out: DataBlock[] = []
  for (let n = 1; n <= doc.lines; n++) {
    const text = doc.line(n).text
    if (!isImport(text)) continue
    const base = indentOf(text)
    const filled: number[] = []
    let m = n + 1
    // The rows straight under it, indented further; a blank line ends them.
    for (; m <= doc.lines; m++) {
      const row = doc.line(m).text
      if (!row.trim() || indentOf(row) <= base) break
      filled.push(m)
    }
    if (filled.length) {
      out.push({ line: n, header: filled[0], rows: filled.length > 1 ? { first: filled[1], last: filled.at(-1)! } : null })
    }
    n = Math.max(n, (filled.at(-1) ?? n))
  }
  return out
}

/** Whether line `n` is a row of imported data (where nothing is suggested). */
export const inDataBlock = (doc: { lines: number; line(n: number): { text: string } }, n: number) =>
  dataBlocks(doc).some((b) => n >= b.header && n <= (b.rows?.last ?? b.header))

/**
 * Indentation for a new or re-indented line: the line above's, one level deeper
 * after a line that opens a block, and one level shallower for a closing `}`.
 *
 * A new line straight after a folded block (Enter at the end of a folded
 * `import(…)`, whose data rows are hidden) takes the folded line's
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
    let indent = indentOf(above) + (opensBlock(above) ? INDENT_WIDTH : 0)
    if (/^\s*\}/.test(lineText)) indent -= INDENT_WIDTH
    return Math.max(0, indent)
  }
  return 0
})

/**
 * Folding: a `def`, `Title:` or `import(…)` folds its indented lines; a `{` block folds to
 * its matching `}`.
 */
export const mathscribeFolding = foldService.of((state, lineStart, lineEnd) => {
  const doc = state.doc
  const first = doc.lineAt(lineStart)
  if (!opensBlock(first.text) && !isImport(first.text)) return null
  let last = first.number
  if (bodyOf(first.text).endsWith('{') && !/^def\s/.test(first.text.trim())) {
    let depth = 0
    for (let n = first.number; n <= doc.lines; n++) {
      const body = bodyOf(doc.line(n).text)
      depth += (body.match(/\{/g) ?? []).length - (body.match(/\}/g) ?? []).length
      if (n > first.number && depth <= 0) {
        last = n
        break
      }
    }
    // Fold up to (not including) the closing brace, so `}` stays visible.
    if (last === first.number) return null
    const end = doc.line(last - 1).to
    return end > lineEnd ? { from: lineEnd, to: end } : null
  }
  const base = indentOf(first.text)
  // (An import's rows end at a blank line; other blocks can have blank lines inside.)
  const data = isImport(first.text)
  for (let n = first.number + 1; n <= doc.lines; n++) {
    const text = doc.line(n).text
    if (!text.trim()) {
      if (data) break
      continue
    }
    if (indentOf(text) <= base) break
    last = n
  }
  return last > first.number ? { from: lineEnd, to: doc.line(last).to } : null
})

/** Whether a line (or the start of it) is a heading, prose or raw LaTeX, where there are no names. */
export const isProseLine = (before: string) => /^\s*[#>$]/.test(before)

/** A finished display command (followed by a space), anywhere in a line. */
const TYPED_COMMAND = new RegExp(String.raw`(?:^|\s)#(?:${COMMAND_NAMES.join('|')})(?=\s)`, 'g')

/** Whether a `#` note has started on the line before this point (not one of the commands). */
export const inNote = (before: string) => /(?:^|\s)#/.test(before.replace(TYPED_COMMAND, ' '))

/**
 * Whether line `n` is prose inside a `Title:  #text` block: the nearest line
 * above it that's indented less is a `#text` opener. (For the editor's
 * suggestions, which stay quiet in prose.)
 */
export function inTextBlock(doc: { line(n: number): { text: string } }, n: number): boolean {
  const own = doc.line(n).text
  const indent = indentOf(own)
  if (!own.trim() || indent === 0) return false
  for (let i = n - 1; i >= 1; i--) {
    const text = doc.line(i).text
    if (!text.trim() || indentOf(text) >= indent) continue
    return TEXT_COMMAND.test(text) && bodyOf(text).endsWith(':')
  }
  return false
}
