/**
 * An expression's top level: what's in it outside any brackets, as the tree
 * reads it. Splitting a call's arguments at their commas, an equation at its
 * `=`, a value at its `pm`, finding where a bracket closes: each is a question
 * about the top level, answered here once, from the lexer's parts, rather than
 * by a scan of the text with its own count of brackets and its own idea of
 * quotes.
 *
 * At one level, a node is one part, whatever's in it: a call (`f(a, b)`), a
 * vector (`<3.0, 4.0>`), a quantity, a species (`{Na^+}`), a label in quotes,
 * a call's settings. What's in brackets that aren't a node's (a group,
 * `(a + b)`, a list, `[1, 2]`) is a level deeper than what's around them.
 */
import { ASSIGN, CLOSING_BRACKETS, OPENING_BRACKETS, SEPARATOR } from '../syntax.ts'
import { isTokenOf, lexExpression, partText } from './lexer.ts'
import { TOKEN_KIND, isToken, type Part, type Token } from './nodes.ts'

/** Whether a part opens a bracket at its level: `(`, `[`, `{` as a delimiter. */
const opensAt = (p: Part) => isToken(p) && p.t === TOKEN_KIND.delimiter && OPENING_BRACKETS.has(p.text)

/** Whether a part closes one. */
const closesAt = (p: Part) => isToken(p) && p.t === TOKEN_KIND.delimiter && CLOSING_BRACKETS.has(p.text)

/** A part at its level: where it starts in the text, and how deep in brackets it is (a bracket itself at the depth outside it). */
export interface LevelledPart {
  readonly part: Part
  readonly at: number
  readonly depth: number
}

/** Some parts (one level's), each with where it starts and its depth; `start`, where the first starts. */
export function levelled(parts: readonly Part[], start = 0): LevelledPart[] {
  let at = start
  let depth = 0
  return parts.map((part) => {
    if (closesAt(part)) depth--
    const placed = { part, at, depth }
    if (opensAt(part)) depth++
    at += partText(part).length
    return placed
  })
}

/** Parts split at the top-level ones `isSplit` picks (which are left out): each piece's parts, in order. */
export function splitParts(parts: readonly Part[], isSplit: (part: Part) => boolean): Part[][] {
  const pieces: Part[][] = [[]]
  for (const { part, depth } of levelled(parts)) {
    if (depth === 0 && isSplit(part)) pieces.push([])
    else pieces[pieces.length - 1].push(part)
  }
  return pieces
}

/** Whether a part is the delimiter given: `,`, `;`, `=`. */
export const matchesDelimiter = (delimiter: string) => (part: Part) => isTokenOf(part, TOKEN_KIND.delimiter, delimiter)

/**
 * Text split at a delimiter at its top level, as the tree reads it, each piece
 * as typed (spaces and all): `f(a, b), "c, d"` at `,` → `f(a, b)` and ` "c, d"`.
 */
export const splitTopLevel = (text: string, delimiter: string): string[] =>
  splitParts(lexExpression(text), matchesDelimiter(delimiter)).map((piece) => piece.map(partText).join(''))

/** A call's arguments, as typed between its brackets, each trimmed: `a, f(b, c), "d, e"` → a, f(b, c), "d, e". */
export const splitArgs = (text: string): string[] => splitTopLevel(text, SEPARATOR).map((arg) => arg.trim())

/** Whether a part is an equation's `=` (or `==`): not `<=`, `>=`, `!=`, which are tokens of their own. */
const isEquals = (part: Part) => EQUATION_SIGNS.some((sign) => isTokenOf(part, TOKEN_KIND.delimiter, sign))

/** The signs between an equation's sides. */
const EQUATION_SIGNS = [ASSIGN, ASSIGN.repeat(2)] as const

/** An equation split at its one top-level `=` (or `==`), each side trimmed; null if it has none, or more than one. */
export function splitEquation(text: string): [string, string] | null {
  const sides = splitParts(lexExpression(text), isEquals).map((side) => side.map(partText).join('').trim())
  return sides.length === 2 ? [sides[0], sides[1]] : null
}

/** Where the first top-level part `test` picks starts in some text; -1 if there's none. */
export function topLevelAt(text: string, test: (part: Part) => boolean): number {
  return levelled(lexExpression(text)).find(({ part, depth }) => depth === 0 && test(part))?.at ?? -1
}

// ---------------------------------------------------------------------------
// In a flat list of tokens (a line's, or a statement's over several lines)
// ---------------------------------------------------------------------------

/** How to see an item of a flat list as a token: it is one (the default), holds one, or is a node (undefined). */
export type TokenOf<T> = (item: T) => Token | undefined

/** An item that is a token, as itself. */
const itself = <T>(item: T) => item as unknown as Token

/** Whether a token opens or closes a bracket: `(`, `[`, `{` as a delimiter. */
const opens = (t: Token | undefined) => !!t && opensAt(t)
const closes = (t: Token | undefined) => !!t && closesAt(t)

/** Where the bracket at index `open` of a flat list closes: its index, or -1 (if it doesn't, or there's no bracket at `open`). */
export function closingIndex<T>(items: readonly T[], open: number, tokenOf: TokenOf<T> = itself): number {
  if (!opens(tokenOf(items[open]))) return -1
  let depth = 0
  for (let i = open; i < items.length; i++) {
    const t = tokenOf(items[i])
    if (opens(t)) depth++
    else if (closes(t) && --depth === 0) return i
  }
  return -1
}

/** Where the bracket at index `close` of a flat list opens, back from it: its index, or -1. */
export function openingIndex<T>(items: readonly T[], close: number, tokenOf: TokenOf<T> = itself): number {
  if (!closes(tokenOf(items[close]))) return -1
  let depth = 0
  for (let i = close; i >= 0; i--) {
    const t = tokenOf(items[i])
    if (closes(t)) depth++
    else if (opens(t) && --depth === 0) return i
  }
  return -1
}

/**
 * The items of a flat list after `open` and before `end` (a bracket's close, or
 * the list's end for one still open), split at the tokens `isSplit` picks that
 * are directly in it (not in a bracket inside it), which are left out.
 */
export function splitWithin<T>(items: readonly T[], open: number, end: number, isSplit: (token: Token) => boolean, tokenOf: TokenOf<T> = itself): T[][] {
  const pieces: T[][] = [[]]
  let depth = 0
  for (let i = open + 1; i < end; i++) {
    const t = tokenOf(items[i])
    if (opens(t)) depth++
    else if (closes(t)) depth--
    else if (depth === 0 && t && isSplit(t)) {
      pieces.push([])
      continue
    }
    pieces[pieces.length - 1].push(items[i])
  }
  return pieces
}

/** A token, with where it starts in the text. */
interface PlacedToken {
  readonly token: Token
  readonly at: number
}

/** Every token in some parts, in order (each node's in its place), with where it starts. */
function placedTokens(parts: readonly Part[], start = 0, out: PlacedToken[] = []): PlacedToken[] {
  let at = start
  for (const part of parts) {
    if (isToken(part)) out.push({ token: part, at })
    else placedTokens(part.parts, at, out)
    at += partText(part).length
  }
  return out
}

/**
 * Where the bracket at `open` in some text closes (any kind: `(`, `[`, `{`),
 * as the tree reads it, so a bracket in a label in quotes isn't one; -1 if it
 * doesn't close, or there's no bracket at `open`.
 */
export function closingBracketAt(text: string, open: number): number {
  const tokens = placedTokens(lexExpression(text))
  const first = tokens.findIndex(({ at }) => at >= open)
  if (first < 0 || tokens[first].at !== open || !opensAt(tokens[first].token)) return -1
  let depth = 0
  for (const { token, at } of tokens.slice(first)) {
    if (opensAt(token)) depth++
    else if (closesAt(token) && --depth === 0) return at
  }
  return -1
}
