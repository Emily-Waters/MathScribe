/**
 * Expressions read into tokens: what a calculation says, `n = 5.00 g / M_w`,
 * as mathjs reads it, with what MathScribe and its modules add, as rules.
 *
 * The base is mathjs's own tokenizer: its kinds of token (a number, a symbol, a
 * delimiter), its delimiters (`+`, `.*`, `==`, `>>>`, …) and named delimiters
 * (`to`, `mod`, `and`, …), and its own tests for a name's letters and a number's
 * digits (math.parse.isAlpha, isDigit, …). On top of that, rules, each declared
 * with its owner, in the order they're tried (a module's first, then the core's):
 * a unit after a number (`5.00 g`, as a `quantity`), a call (`f(x)`, as a
 * `call` holding its arguments), MathScribe's `@` names, a label in quotes,
 * `pm`; a module's own (vectors' `<3.0, 4.0>`, chemistry's `{H2O}`).
 *
 * A rule sees only the text and what's before it on the line, so an
 * expression's tokens depend on its text alone, and are cached with its line.
 */
import { CONSTANT_PRECISION, NAME, NAME_CHAR, SIGIL, KEYWORD, UNCERTAINTY_WORDS } from '../syntax.ts'
import { FIRST_UNIT, NEXT_UNIT, POWER, isUnitName } from '../engine/core/literals.ts'
import { NODE_KIND, TOKEN_KIND, isToken, type Part, type SyntaxNode, type Token } from './nodes.ts'

// ---------------------------------------------------------------------------
// mathjs's own (as in its parser, mathjs/lib/esm/expression/parse.js)
// ---------------------------------------------------------------------------

/** mathjs's delimiters: operators, brackets, separators. Longest first, as mathjs tries them. */
export const MATHJS_DELIMITERS = [
  '>>>',
  '.*', './', '.^', '^|', '?.', '??', '==', '!=', '<=', '>=', '<<', '>>',
  ',', '(', ')', '[', ']', '{', '}', '"', '\'', ';', '+', '-', '*', '/', '%', '^', '~', '!', '&', '|', '=', ':', '?', '<', '>',
] as const

/** mathjs's named delimiters: words that are operators (`2 m to cm`, `a mod b`). */
export const MATHJS_NAMED_DELIMITERS = ['mod', 'to', 'in', 'and', 'xor', 'or', 'not'] as const

/** A number, as mathjs reads one: digits, a decimal mark, an exponent (`2.00`, `.5`, `1.2e-3`). */
const NUMBER = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y

/** Brackets that open and close (a call's, a group's). */
const OPEN = '('
const CLOSE = ')'

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** What a rule knows of where it is: the text, what's before it, and the span being read. */
export interface LexState {
  readonly text: string
  /** The end of the span being read (a call's arguments end before its `)`). */
  readonly end: number
  /** The last part before this one that isn't a space. */
  readonly prev?: Part
  /** Before the line's first `=` (at the top, not in brackets): the name being assigned and its settings. */
  readonly lhs: boolean
  /** The function whose arguments are being read, if any: `@table` in `@table(t, x; …)`. */
  readonly callee?: string
}

/** What a rule reads at a position: its parts (a token, or a node, or a few), and how much of the text they take. */
export interface Lexed {
  readonly parts: readonly Part[]
  readonly length: number
}

/**
 * Read a span of the text (a call's arguments, a vector's values) with the same
 * rules: as a call's arguments if `callee` is given, and as part of the name
 * being assigned if `lhs` (`@tuple(r:3, theta:deg) = …`: deg is a unit).
 */
export type ReadSpan = (start: number, end: number, callee?: string, lhs?: boolean) => Part[]

/** A rule: what's at a position, if it's this rule's. */
export interface LexRule {
  /** What it reads, for the schema's listing: `a unit after a number`. */
  readonly describes: string
  read(pos: number, state: LexState, span: ReadSpan): Lexed | undefined
}

/** The rules declared, in the order they're tried, by who declared them (the core's last). */
const rules: { owner: string; rule: LexRule }[] = []

/** The core's name as an owner, whose rules are tried after every module's. */
export const LEXER_CORE = 'core'

/** Declare rules (a module's are tried before the core's, in the order they're declared). */
export function declareLexRules(owner: string, declared: readonly LexRule[]): void {
  const at = owner === LEXER_CORE ? rules.length : rules.findIndex((r) => r.owner === LEXER_CORE)
  rules.splice(at < 0 ? rules.length : at, 0, ...declared.map((rule) => ({ owner, rule })))
}

/** Every rule declared, with its owner, in the order they're tried (for the schema's listing). */
export const declaredLexRules = () => rules.map(({ owner, rule }) => ({ owner, describes: rule.describes }))

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export const token = (t: string, text: string): Token => Object.freeze({ t, text })
export const node = (kind: string, parts: readonly Part[]): SyntaxNode => Object.freeze({ kind, parts: Object.freeze([...parts]) })
const one = (part: Part, length: number): Lexed => ({ parts: [part], length })

/** An expression's text read into parts: tokens, and nodes (a quantity, a call, a module's). */
export function lexExpression(text: string): Part[] {
  const span: ReadSpan = (start, end, callee, lhs = start === 0 && callee === undefined) => readSpan(text, start, end, callee, lhs, span)
  return span(0, text.length)
}

function readSpan(text: string, start: number, end: number, callee: string | undefined, startLhs: boolean, span: ReadSpan): Part[] {
  const parts: Part[] = []
  let prev: Part | undefined
  let lhs = startLhs
  for (let pos = start; pos < end;) {
    const state: LexState = { text, end, prev, lhs, callee }
    const read = rules.map((r) => r.rule.read(pos, state, span)).find((r) => r && r.length > 0)
      ?? one(token(TOKEN_KIND.unknown, text[pos]), 1)
    parts.push(...read.parts)
    for (const p of read.parts) {
      if (isToken(p) && p.t === TOKEN_KIND.space) continue
      prev = p
      if (isToken(p) && p.t === TOKEN_KIND.delimiter && p.text === '=') lhs = false
    }
    pos += read.length
  }
  return parts
}

/** The text of a part (a token's, or a node's tokens joined). */
const textOf = (part: Part): string => (isToken(part) ? part.text : part.parts.map(textOf).join(''))

/** Whether a part is a token of this kind (and this text, if given). */
export const isTokenOf = (part: Part | undefined, t: string, text?: string): boolean =>
  !!part && isToken(part) && part.t === t && (text === undefined || part.text === text)

/** The index of the bracket closing the one opened at `open` (-1 if none does, before `end`). */
export function closingBracket(text: string, open: number, end: number): number {
  let depth = 0
  let quoted = false
  for (let i = open; i < end; i++) {
    const c = text[i]
    if (c === '"') quoted = !quoted
    if (quoted) continue
    if (c === OPEN) depth++
    else if (c === CLOSE && --depth === 0) return i
  }
  return -1
}

/**
 * A unit at a position, as MathScribe reads one after a number or `to`: one or
 * more of mathjs's units, joined by `*`, `/` or `·`, each with a power
 * (`m/s^2`, `kg*m^2`). Its length, or 0 if there isn't one.
 */
export function unitAt(text: string, pos: number): number {
  FIRST_UNIT.lastIndex = pos
  const first = FIRST_UNIT.exec(text)
  // (FIRST_UNIT takes spaces before the unit: a unit here starts at pos.)
  if (!first || first.index !== pos || first[0] !== first[1] || !isUnitName(first[1])) return 0
  let end = FIRST_UNIT.lastIndex
  const power = () => {
    POWER.lastIndex = end
    if (POWER.exec(text)) end = POWER.lastIndex
  }
  power()
  for (;;) {
    NEXT_UNIT.lastIndex = end
    const next = NEXT_UNIT.exec(text)
    if (!next || !isUnitName(next[2])) break
    end = NEXT_UNIT.lastIndex
    power()
  }
  return end - pos
}

/** Spaces and tabs at a position: their length. */
const spacesAt = (text: string, pos: number) => /^[ \t]*/.exec(text.slice(pos))![0].length

/**
 * A part with the unit after it, if one follows (a space between them, or not):
 * a quantity, `5.00 g`, `<3.0, 4.0> N`. Otherwise the part as it is.
 */
export function withUnit(part: Part, length: number, pos: number, state: LexState): Lexed {
  const at = pos + length
  const gap = spacesAt(state.text, at)
  const unit = at + gap < state.end ? unitAt(state.text, at + gap) : 0
  if (!unit) return one(part, length)
  const parts = [part, ...(gap ? [token(TOKEN_KIND.space, state.text.slice(at, at + gap))] : []), token(TOKEN_KIND.unit, state.text.slice(at + gap, at + gap + unit))]
  return one(node(NODE_KIND.quantity, parts), length + gap + unit)
}

/** A call: what's called, then its arguments in brackets, read as a call's (or undefined if its `(` isn't closed). */
function call(callee: Token, pos: number, state: LexState, span: ReadSpan): Lexed | undefined {
  const after = pos + callee.text.length
  const gap = spacesAt(state.text, after)
  const open = after + gap
  if (state.text[open] !== OPEN) return undefined
  const close = closingBracket(state.text, open, state.end)
  if (close < 0) return undefined
  const parts: Part[] = [
    callee, ...(gap ? [token(TOKEN_KIND.space, state.text.slice(after, open))] : []), token(TOKEN_KIND.delimiter, OPEN),
    ...span(open + 1, close, callee.text, state.lhs), token(TOKEN_KIND.delimiter, CLOSE),
  ]
  return one(node(NODE_KIND.call, parts), close + 1 - pos)
}

/** A match of a sticky pattern at a position, or undefined. */
function sticky(pattern: RegExp, text: string, pos: number): string | undefined {
  const re = new RegExp(pattern.source, 'y')
  re.lastIndex = pos
  return re.exec(text)?.[0]
}

/** A name at a position: MathScribe's names, as mathjs reads symbols (letters, Greek too, digits and _ after the first). */
const NAME_AT = new RegExp(NAME)
/** A name after `@`, and its members after dots: `@chem.mm.Na`, `@tuple`. */
const BUILTIN_AT = new RegExp(String.raw`${SIGIL}${NAME}(?:\.${NAME})*`)
/** A constant's precision after its name: `@c:4`, `@c:exact`. */
const PRECISION_AT = new RegExp(CONSTANT_PRECISION)
/** A label in quotes, as mathjs reads a string (`\"` inside it). */
const STRING_AT = /"(?:[^"\\]|\\.)*"/
/** Words with a meaning of their own: mathjs's named delimiters, MathScribe's keywords, and `delta F`. */
const KEYWORDS: ReadonlySet<string> = new Set<string>([...MATHJS_NAMED_DELIMITERS, ...Object.values(KEYWORD), ...UNCERTAINTY_WORDS])
/** `±` or `+-`: an uncertainty (as `pm`). */
const PLUS_MINUS = ['±', '+-'] as const
/** A word ends here (no more name characters after it). */
const WORD_END = new RegExp(String.raw`(?!${NAME_CHAR})`, 'y')

const isWordEnd = (text: string, at: number) => {
  WORD_END.lastIndex = at
  return WORD_END.test(text)
}

/** The core's rules, in the order they're tried. */
const CORE_RULES: LexRule[] = [
  {
    describes: 'spaces and tabs',
    read: (pos, { text }) => {
      const n = spacesAt(text, pos)
      return n ? one(token(TOKEN_KIND.space, text.slice(pos, pos + n)), n) : undefined
    },
  },
  {
    describes: 'a label in quotes, as a mathjs string: "Mass of {Na^+}"',
    read: (pos, { text }) => {
      const s = sticky(STRING_AT, text, pos)
      return s ? one(token(TOKEN_KIND.string, s), s.length) : undefined
    },
  },
  {
    describes: 'a number, as mathjs reads one; with a unit after it, a quantity: 5.00 g',
    read: (pos, state) => {
      // (Not the end of a name: x1 is one name.)
      if (pos > 0 && new RegExp(NAME_CHAR).test(state.text[pos - 1])) return undefined
      NUMBER.lastIndex = pos
      const m = NUMBER.exec(state.text)
      if (!m) return undefined
      return withUnit(token(TOKEN_KIND.number, m[0]), m[0].length, pos, state)
    },
  },
  {
    describes: '± or +-: an uncertainty, as pm',
    read: (pos, { text }) => {
      const s = PLUS_MINUS.find((p) => text.startsWith(p, pos))
      return s ? one(token(TOKEN_KIND.keyword, s), s.length) : undefined
    },
  },
  {
    describes: 'an @ name: a built-in constant (@c), or a call to a built-in function (@chem.mm(…))',
    read: (pos, state, span) => {
      const s = sticky(BUILTIN_AT, state.text, pos)
      if (!s) return undefined
      const called = call(token(TOKEN_KIND.builtin, s), pos, state, span)
      if (called) return called
      // A constant, with its precision: `@c:4`.
      const precision = sticky(PRECISION_AT, state.text, pos + s.length) ?? ''
      return one(token(TOKEN_KIND.builtin, s + precision), s.length + precision.length)
    },
  },
  {
    describes: 'a word: a keyword (to, mod, pm, return, …), a unit after `to` or a name’s `:`, a call (f(x)), or a symbol',
    read: (pos, state, span) => {
      const word = sticky(NAME_AT, state.text, pos)
      if (!word || (pos > 0 && new RegExp(NAME_CHAR).test(state.text[pos - 1]))) return undefined
      // A unit: after `to` (a conversion), or a setting on the name being assigned (`phi:3:deg = …`).
      const afterTo = isTokenOf(state.prev, TOKEN_KIND.keyword, KEYWORD.to)
      const setting = state.lhs && isTokenOf(state.prev, TOKEN_KIND.delimiter, ':')
      if (afterTo || setting) {
        const unit = unitAt(state.text, pos)
        if (unit) return one(token(TOKEN_KIND.unit, state.text.slice(pos, pos + unit)), unit)
      }
      if (KEYWORDS.has(word) && isWordEnd(state.text, pos + word.length)) return one(token(TOKEN_KIND.keyword, word), word.length)
      const symbol = token(TOKEN_KIND.symbol, word)
      return call(symbol, pos, state, span) ?? one(symbol, word.length)
    },
  },
  {
    describes: 'a delimiter, as mathjs reads them: an operator, a bracket, a separator',
    read: (pos, { text }) => {
      const d = MATHJS_DELIMITERS.find((m) => text.startsWith(m, pos))
      return d ? one(token(TOKEN_KIND.delimiter, d), d.length) : undefined
    },
  },
]

declareLexRules(LEXER_CORE, CORE_RULES)

/** The callee of a call node: its first token's text. */
export const calleeOf = (call: SyntaxNode): string => textOf(call.parts[0])
