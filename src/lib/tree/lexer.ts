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
import {
  ASSIGN, CARRIED_JOIN, CONSTANT_PRECISION, DOTTED_NAME, MATHJS_DELIMITERS, MATHJS_NAMED_DELIMITERS, NAME, NAME_CHAR, NAME_CHAR_RE, NUMBER, QUOTE, ROUND_BRACKETS, ROW_SEPARATOR, SEPARATOR,
  SETTING_MARK, SIGIL, SQUARE_BRACKETS, KEYWORD, LEADING_SPACES, UNCERTAINTY_WORDS, inClass, regex, src,
} from '../syntax.ts'
import { FIRST_UNIT, NEXT_UNIT, POWER, isUnitName } from '../engine/core/literals.ts'
import { NODE_KIND, TOKEN_KIND, isToken, type Part, type SyntaxNode, type Token } from './nodes.ts'

// ---------------------------------------------------------------------------
// mathjs's own (its delimiters are the language's: syntax/operators.ts)
// ---------------------------------------------------------------------------

/** A number, as mathjs reads one: digits, a decimal mark, an exponent (`2.00`, `.5`, `1.2e-3`). */
const NUMBER_AT = regex(NUMBER, 'y')

/** Round brackets (a call's, a group's). */
const OPEN = ROUND_BRACKETS.open
const CLOSE = ROUND_BRACKETS.close

/** The brackets a line can leave open, carrying it on over the lines after it (see openBrackets). */
const CARRYING_BRACKETS = [ROUND_BRACKETS, SQUARE_BRACKETS] as const
const CARRYING_OPEN: ReadonlySet<string> = new Set(CARRYING_BRACKETS.map((b) => b.open))
const CARRYING_CLOSE: ReadonlySet<string> = new Set(CARRYING_BRACKETS.map((b) => b.close))

/** Whether a delimiter opens, or closes, a bracket that carries a line on: `(`, `[`; `)`, `]`. */
export const opensBracket = (delimiter: string): boolean => CARRYING_OPEN.has(delimiter)
export const closesBracket = (delimiter: string): boolean => CARRYING_CLOSE.has(delimiter)

/** Whether text starts (after its indentation) by closing a bracket that carries a line on: `)` or `]`. */
export const startsByClosing = (text: string): boolean => CARRYING_CLOSE.has(text.trimStart().charAt(0))

/**
 * How many round and square brackets parts leave open: those opened less those
 * closed, read from the delimiter tokens at any depth (a closed call's are in
 * its node, and cancel out; one in a string is in its token). Less than 0 when
 * they close more than they open (`)` carrying on a line).
 */
export function openBrackets(parts: readonly Part[]): number {
  let open = 0
  for (const p of parts) {
    if (!isToken(p)) open += openBrackets(p.parts)
    else if (p.t !== TOKEN_KIND.delimiter) continue
    else if (CARRYING_OPEN.has(p.text)) open++
    else if (CARRYING_CLOSE.has(p.text)) open--
  }
  return open
}

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
  /**
   * Whether what's at `pos` in `text` isn't this rule's yet but could be once
   * more text follows it: an opener whose closer hasn't come (a label's `"`, a
   * `{species}`'s `{`, a vector's `<`). A line carrying on a continued line can
   * close it, making one part of what's between; so a continued line is read
   * after a context that keeps such an opener (carriedContext). A rule that
   * never reads past what's there to read leaves it out.
   */
  pending?(text: string, pos: number): boolean
}

/** The rules declared, in the order they're tried, by who declared them (the core's last). */
const rules: { owner: string; rule: LexRule }[] = []

/** The core's name as an owner, whose rules are tried after every module's. */
export const LEXER_CORE = 'core'

/** Declare rules (a module's are tried before the core's, in the order they're declared). */
export function declareLexRules(owner: string, declared: readonly LexRule[]): void {
  const at = owner === LEXER_CORE ? rules.length : rules.findIndex((r) => r.owner === LEXER_CORE)
  rules.splice(at < 0 ? rules.length : at, 0, ...declared.map((rule) => ({ owner, rule })))
  lexed.clear()
}

/**
 * What can follow a unit as part of it, as a module reads it: chemistry's
 * species, `2.0 mol {EDTA}` (mol of EDTA). Read into the quantity, after its unit.
 */
const unitRules: { owner: string; rule: LexRule }[] = []

/** Declare rules for what can follow a unit as part of it (see unitRules). */
export function declareUnitRules(owner: string, declared: readonly LexRule[]): void {
  unitRules.push(...declared.map((rule) => ({ owner, rule })))
  lexed.clear()
}

/** Every rule declared, with its owner, in the order they're tried (for the schema's listing); a unit's after the others. */
export const declaredLexRules = () => [
  ...rules.map(({ owner, rule }) => ({ owner, describes: rule.describes })),
  ...unitRules.map(({ owner, rule }) => ({ owner, describes: `${AFTER_A_UNIT}${rule.describes}` })),
]

/** How a rule for what follows a unit is listed: `after a unit: a formula in braces…`. */
const AFTER_A_UNIT = 'after a unit: '

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export const token = (t: string, text: string): Token => Object.freeze({ t, text })
export const node = (kind: string, parts: readonly Part[]): SyntaxNode => Object.freeze({ kind, parts: Object.freeze([...parts]) })
const one = (part: Part, length: number): Lexed => ({ parts: [part], length })

/** An expression's text read into parts: tokens, and nodes (a quantity, a call, a module's). */
export function lexExpression(text: string): readonly Part[] {
  const cached = lexed.get(text)
  if (cached) return cached
  const span: ReadSpan = (start, end, callee, lhs = start === 0 && callee === undefined) => readSpan(text, start, end, callee, lhs, span)
  const parts = Object.freeze(span(0, text.length))
  // (Oldest first out: a Map keeps the order its keys were added.)
  if (lexed.size >= LEXED_CACHE_SIZE) lexed.delete(lexed.keys().next().value!)
  lexed.set(text, parts)
  return parts
}

/**
 * Expressions read, by their text: what's read depends on the text and the
 * rules alone, and the engine reads a line's text more than once as it works it
 * out (its shape, its numbers, what it writes for mathjs). Emptied when a rule
 * is declared.
 */
const lexed = new Map<string, readonly Part[]>()

/** How many expressions are kept read (as many as the tree keeps lines: lines.ts). */
const LEXED_CACHE_SIZE = 20_000

/** Whether a rule read something (`read` at `pos`), and kept within the span it was given, which ends at `end`. */
const withinSpan = (read: Lexed | undefined, pos: number, end: number): read is Lexed =>
  !!read && read.length > 0 && pos + read.length <= end

function readSpan(text: string, start: number, end: number, callee: string | undefined, startLhs: boolean, span: ReadSpan): Part[] {
  const parts: Part[] = []
  let prev: Part | undefined
  let lhs = startLhs
  for (let pos = start; pos < end;) {
    const state: LexState = { text, end, prev, lhs, callee }
    // (A rule's reading counts only within the span: a `{species}` read inside a
    // call's brackets can't take the call's `)` and what's after it, which the
    // span after the call would then read again: `h({)}`.)
    const read = rules.map((r) => r.rule.read(pos, state, span)).find((r) => withinSpan(r, pos, end))
      ?? one(token(TOKEN_KIND.unknown, text[pos]), 1)
    parts.push(...read.parts)
    for (const p of read.parts) {
      if (isToken(p) && p.t === TOKEN_KIND.space) continue
      prev = p
      if (isToken(p) && p.t === TOKEN_KIND.delimiter && p.text === ASSIGN) lhs = false
    }
    pos += read.length
  }
  return parts
}

/**
 * What's said on a line carrying on a continued line, `text`, read as the rest
 * of it: the line so far (`said`, its lines' bodies joined) and it, read as one
 * expression, and the parts that fall on this line. So a continuation line's
 * tokens are the ones it has when the lines are joined, as the engine works
 * them out: in `@table(` then `x;` then `rows 2-3`, `rows 2-3` is the table's
 * settings, and `x` one of its arguments.
 */
export function lexTail(said: string, text: string): readonly Part[] {
  const before = said + CARRIED_JOIN
  return partsFrom(lexExpression(before + text), before.length)
}

/**
 * Where reading can start again within a span, the same as before: at a `,` or
 * `;` between its parts (each read whole by one rule, a call's settings after
 * `;` too), kept with what's after it, so what's read before it doesn't matter.
 */
const RESTARTS: ReadonlySet<string> = new Set([SEPARATOR, ROW_SEPARATOR])

/**
 * Where reading has to start again from, at the latest, for an opener a later
 * line could still close (LexRule.pending: a `"`, a `{species}`'s `{`, a
 * vector's `<`): the part before the first one (whether it's read as an opener
 * can depend on what's just before it: a `<` opens a vector only after `=`, `(`, …),
 * or -1 if there's none. (Only ever over what's carried, which is short.)
 */
function stillClosable(parts: readonly Part[]): number {
  const text = parts.map(partText).join('')
  let at = 0
  let before = 0
  for (const [i, p] of parts.entries()) {
    const start = at
    at += partText(p).length
    if (isToken(p) && p.t === TOKEN_KIND.space) continue
    if (isToken(p) && [...rules, ...unitRules].some((r) => r.rule.pending?.(text, start))) return before
    before = i
  }
  return -1
}

/**
 * A short text that leaves the lexer where `text` does, for reading what comes
 * after it (lexTail): so a line carrying on a continued line is read after
 * this, not after everything the lines before it said, which made reading a
 * long continued line (a series of 800 values, one a line) take time growing
 * with the square of its length.
 *
 * What reading the next part depends on is the span it's in (each call still
 * open, by its callee), whether it's still the name being assigned (before the
 * `=`: LexState.lhs), and what was read last. So it's each open call's head
 * (`@plot(`), then, in the innermost span, what's said since its last `,` or
 * `;` (with it); each after `= ` where an `=` had been read before it in its
 * span. lexTail(carriedContext(said), text) reads as lexTail(said, text) does.
 */
export function carriedContext(text: string): string {
  const pieces: string[] = []
  let parts = lexExpression(text)
  let lhsAtStart = true
  for (;;) {
    // This span's parts, with whether it's still the name being assigned before each.
    let lhs = lhsAtStart
    const lhsBefore: boolean[] = []
    let last = -1
    for (const [i, p] of parts.entries()) {
      lhsBefore.push(lhs)
      if (isToken(p) && p.t === TOKEN_KIND.space) continue
      last = i
      if (isTokenOf(p, TOKEN_KIND.delimiter, ASSIGN)) lhs = false
    }
    const flipped = (at: number) => (lhsAtStart && !lhsBefore[at] ? `${ASSIGN} ` : '')
    const rest = (at: number) => [...pieces, flipped(at), parts.slice(at).map(partText).join('')].join('')
    // A quote (or brace, or `<`) not closed yet: a later line's can close it,
    // making one part of what's after it (its commas, a call), so reading starts again no later.
    const quote = stillClosable(parts)
    const final = parts[last]
    if (quote >= 0 && quote < last) return rest(quote)
    // Still in a call that's open: its head, then on into its arguments.
    if (final && !isToken(final) && final.kind === NODE_KIND.openCall) {
      const open = final.parts.findIndex((p) => isTokenOf(p, TOKEN_KIND.delimiter, OPEN))
      pieces.push(flipped(last), final.parts.slice(0, open + 1).map(partText).join(''))
      parts = final.parts.slice(open + 1)
      lhsAtStart = lhsBefore[last]
      continue
    }
    // The innermost span: what's said since its last `,` or `;`, with it.
    let from = 0
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      if (isToken(p) && p.t === TOKEN_KIND.delimiter && RESTARTS.has(p.text)) {
        from = i
        break
      }
    }
    return from < parts.length ? rest(quote >= 0 ? Math.min(from, quote) : from) : pieces.join('')
  }
}

/** Parts from a place in their text on: those after it whole, a node it falls in by its parts from there, a token it falls in from there. */
function partsFrom(parts: readonly Part[], from: number): Part[] {
  const out: Part[] = []
  let at = 0
  for (const p of parts) {
    const text = partText(p)
    const end = at + text.length
    if (end > from) {
      if (at >= from) out.push(p)
      else if (isToken(p)) out.push(token(p.t, text.slice(from - at)))
      else out.push(...partsFrom(p.parts, from - at))
    }
    at = end
  }
  return out
}

/** The text of a part (a token's, or a node's tokens joined; codec.ts's textOf keeps it with the node). */
export const partText = (part: Part): string => (isToken(part) ? part.text : part.parts.map(partText).join(''))

/** Whether a part is a token of this kind (and this text, if given). */
export const isTokenOf = (part: Part | undefined, t: string, text?: string): boolean =>
  !!part && isToken(part) && part.t === t && (text === undefined || part.text === text)

/** The index of the bracket closing the one opened at `open` (-1 if none does, before `end`). */
export function closingBracket(text: string, open: number, end: number): number {
  let depth = 0
  let quoted = false
  for (let i = open; i < end; i++) {
    const c = text[i]
    if (c === QUOTE) quoted = !quoted
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
  // (FIRST_UNIT takes spaces before the unit: a unit here starts at pos. A word of the language's own isn't a unit
  // straight after a number, though mathjs has one by its name: `2.0 pm 0.1` is an uncertainty, not picometres.)
  if (!first || first.index !== pos || first[0] !== first[1] || !isUnitName(first[1]) || KEYWORD.has(first[1])) return 0
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
const spacesAt = (text: string, pos: number) => LEADING_SPACES.exec(text.slice(pos))![0].length

/**
 * A part with the unit after it, if one follows (a space between them, or not):
 * a quantity, `5.00 g`, `<3.0, 4.0> N`. Otherwise the part as it is.
 */
export function withUnit(part: Part, length: number, pos: number, state: LexState): Lexed {
  const unit = unitPartsAt(state.text, pos + length, state.end)
  if (!unit) return one(part, length)
  return one(node(NODE_KIND.quantity, [part, ...unit.parts]), length + unit.length)
}

/**
 * A unit at a position (after spaces, if any), with what a module reads as part
 * of it after it (unitRules: `mol {EDTA}`): its parts, and how much of the text
 * they take. Undefined if there's no unit there.
 */
export function unitPartsAt(text: string, pos: number, end = text.length): Lexed | undefined {
  const spaceAt = (at: number) => {
    const n = spacesAt(text, at)
    return n ? [token(TOKEN_KIND.space, text.slice(at, at + n))] : []
  }
  const gap = spaceAt(pos)
  const start = pos + (gap[0]?.text.length ?? 0)
  const unit = start < end ? unitAt(text, start) : 0
  if (!unit) return undefined
  const parts: Part[] = [...gap, token(TOKEN_KIND.unit, text.slice(start, start + unit))]
  let at = start + unit
  for (;;) {
    const space = spaceAt(at)
    const from = at + (space[0]?.text.length ?? 0)
    const state: LexState = { text, end, prev: parts[parts.length - 1], lhs: false }
    const span: ReadSpan = (s, e, callee, lhs = false) => readSpan(text, s, e, callee, lhs, span)
    const read = from < end ? unitRules.map((r) => r.rule.read(from, state, span)).find((r) => withinSpan(r, from, end)) : undefined
    if (!read) break
    parts.push(...space, ...read.parts)
    at = from + read.length
  }
  return { parts, length: at - pos }
}

/**
 * A call: what's called, then its arguments in brackets, read as a call's; or,
 * if its `(` isn't closed, an open call, its arguments running to the end of
 * the span (a call carried on over the lines after it, or half typed).
 */
function call(callee: Token, pos: number, state: LexState, span: ReadSpan): Lexed | undefined {
  const after = pos + callee.text.length
  const gap = spacesAt(state.text, after)
  const open = after + gap
  if (state.text[open] !== OPEN) return undefined
  const close = closingBracket(state.text, open, state.end)
  const head: Part[] = [callee, ...(gap ? [token(TOKEN_KIND.space, state.text.slice(after, open))] : []), token(TOKEN_KIND.delimiter, OPEN)]
  if (close < 0) return one(node(NODE_KIND.openCall, [...head, ...span(open + 1, state.end, callee.text, state.lhs)]), state.end - pos)
  return one(node(NODE_KIND.call, [...head, ...span(open + 1, close, callee.text, state.lhs), token(TOKEN_KIND.delimiter, CLOSE)]), close + 1 - pos)
}

/** A match of a sticky pattern at a position, or undefined. */
function sticky(pattern: RegExp, text: string, pos: number): string | undefined {
  const re = regex(pattern, 'y')
  re.lastIndex = pos
  return re.exec(text)?.[0]
}

/** A name at a position: MathScribe's names, as mathjs reads symbols (letters, Greek too, digits and _ after the first). */
const NAME_AT = regex(NAME)
/** A name after `@`, and its members after dots: `@chem.mm.Na`, `@tuple`. */
const BUILTIN_AT = regex(src`${SIGIL}${DOTTED_NAME}`)
/** A constant's precision after its name: `@c:4`, `@c:exact`. */
const PRECISION_AT = regex(CONSTANT_PRECISION)
/** A label in quotes, as mathjs reads a string (`\"` inside it). */
const STRING_AT = regex(src`${QUOTE}(?:[^${inClass(QUOTE)}\\]|\\.)*${QUOTE}`)
/** Words with a meaning of their own: mathjs's named delimiters, MathScribe's keywords, and `delta F`. */
const KEYWORDS: ReadonlySet<string> = new Set<string>([...MATHJS_NAMED_DELIMITERS, ...KEYWORD.words, ...UNCERTAINTY_WORDS])
/** A word ends here (no more name characters after it). */
const WORD_END = regex(src`(?!${NAME_CHAR})`, 'y')

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
    // (A quote with none after it to close it: a later line's can.)
    pending: (text, pos) => text[pos] === QUOTE && !sticky(STRING_AT, text, pos),
  },
  {
    describes: 'a number, as mathjs reads one; with a unit after it, a quantity: 5.00 g',
    read: (pos, state) => {
      // (Not the end of a name: x1 is one name.)
      if (pos > 0 && NAME_CHAR_RE.test(state.text[pos - 1])) return undefined
      NUMBER_AT.lastIndex = pos
      const m = NUMBER_AT.exec(state.text)
      if (!m) return undefined
      return withUnit(token(TOKEN_KIND.number, m[0]), m[0].length, pos, state)
    },
  },
  {
    describes: 'an @ name: a built-in constant (@c), or a call to a built-in function (@chem.total(…))',
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
      if (pos > 0 && NAME_CHAR_RE.test(state.text[pos - 1])) return undefined
      // A unit: after `to` (a conversion), or a setting on the name being assigned (`phi:3:deg = …`).
      // (Before the name: a unit can start with a micro sign, `to µm`, which a name can't.)
      const afterTo = isTokenOf(state.prev, TOKEN_KIND.keyword, KEYWORD.to)
      const setting = state.lhs && isTokenOf(state.prev, TOKEN_KIND.delimiter, SETTING_MARK)
      if (afterTo || setting) {
        const unit = unitAt(state.text, pos)
        if (unit) return one(token(TOKEN_KIND.unit, state.text.slice(pos, pos + unit)), unit)
      }
      const word = sticky(NAME_AT, state.text, pos)
      if (!word) return undefined
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
export const calleeOf = (call: SyntaxNode): string => partText(call.parts[0])
