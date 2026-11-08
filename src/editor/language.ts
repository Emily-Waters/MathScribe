/**
 * The MathScribe sheet language for CodeMirror: a line-by-line tokenizer for
 * highlighting, plus indentation and folding that follow the sheet's own rules.
 *
 * The tokenizer reads lines the way the engine does (document.ts / engine.ts):
 * a line's first character decides what kind of line it is, a unit name right
 * after a number is a unit (`9.81 m/s^2`), and `#` starts either a display
 * command (`#sym`, `#numbered`, …) or a note.
 */
import { StreamLanguage, foldService, indentService, type StringStream } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { isUnitName } from '../lib/engine.ts'

type LineKind = 'calc' | 'heading' | 'text' | 'latex' | 'opener' | 'def'

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
}

const COMMANDS = /#(?:sym|val|full|hide|multiline|center|list|numbered|text)(?=\s|$)/
const NUMBER = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/
const KEYWORDS = new Set(['def', 'return', 'to', 'pm'])

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

function token(stream: StringStream, state: State): string | null {
  if (stream.sol()) {
    const indent = indentOf(stream.string)
    // A text block ends at the first line indented no further than its opener.
    if (state.textIndent !== null && indent <= state.textIndent) state.textIndent = null
    if (state.textIndent !== null) {
      state.kind = 'text'
    } else {
      state.kind = lineKind(stream.string)
      // `Title:  #text`: the lines indented under it are prose.
      if (state.kind === 'opener' && /(?:^|\s)#text(?=\s|$)/.test(stream.string)) state.textIndent = indent
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
  }

  // Commands and notes, on any other line.
  if (stream.peek() === '#') {
    if (stream.match(COMMANDS)) return 'command'
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

  if (stream.match(NUMBER)) {
    state.afterNumber = true
    state.inUnit = false
    return 'number'
  }
  if (stream.match(/@[A-Za-z]\w*(?::(?:\d+|exact))?/)) return 'constant'

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

  const word = stream.match(/[A-Za-z_]\w*/) as RegExpMatchArray | null
  if (word) {
    const id = word[0]
    const call = /^\s*\(/.test(stream.string.slice(stream.pos))
    // A display unit on the assigned name: the deg in `phi:3:deg = …`.
    const displayUnit = stream.string[stream.start - 1] === ':' && /^\s*[A-Za-z]\w*(?::[^:=\s]+)*$/.test(stream.string.slice(0, stream.pos))
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
        && /^\s*[A-Za-z]\w*\s*\([^()]*\)\s*=(?!=)/.test(stream.string)
      return state.kind === 'def' || oneLiner ? 'definition' : 'function'
    }
    return 'variable'
  }

  if (stream.match('±') || stream.match('+-')) return 'keyword'
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

export const mathscribeLanguage = StreamLanguage.define<State>({
  name: 'mathscribe',
  startState: () => ({ kind: 'calc', afterNumber: false, inUnit: false, afterTo: false, inTitle: false, textIndent: null }),
  copyState: (s) => ({ ...s }),
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

const INDENT = 4
export const indentOf = (text: string) => /^[ \t]*/.exec(text)![0].replace(/\t/g, '    ').length
/** Whether a line opens an indented block: `Title:`, `name {`, or a `def`. */
const opensBlock = (text: string) => {
  const t = text.trim()
  return /^def\s/.test(t) || /[:{]$/.test(bodyOf(t))
}

/**
 * Indentation for a new or re-indented line: the line above's, one level deeper
 * after a line that opens a block, and one level shallower for a closing `}`.
 */
export const mathscribeIndent = indentService.of((cx, pos) => {
  const line = cx.lineAt(pos)
  for (let n = cx.state.doc.lineAt(line.from).number - 1; n >= 1; n--) {
    const above = cx.state.doc.line(n).text
    if (!above.trim()) continue
    let indent = indentOf(above) + (opensBlock(above) ? INDENT : 0)
    if (/^\s*\}/.test(line.text)) indent -= INDENT
    return Math.max(0, indent)
  }
  return 0
})

/**
 * Folding: a `def` or `Title:` folds its indented lines; a `{` block folds to
 * its matching `}`.
 */
export const mathscribeFolding = foldService.of((state, lineStart, lineEnd) => {
  const doc = state.doc
  const first = doc.lineAt(lineStart)
  if (!opensBlock(first.text)) return null
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
  for (let n = first.number + 1; n <= doc.lines; n++) {
    const text = doc.line(n).text
    if (!text.trim()) continue
    if (indentOf(text) <= base) break
    last = n
  }
  return last > first.number ? { from: lineEnd, to: doc.line(last).to } : null
})

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
    return /(?:^|\s)#text(?=\s|$)/.test(text) && bodyOf(text).endsWith(':')
  }
  return false
}
