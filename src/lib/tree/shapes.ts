/**
 * A line's shape: what it assigns to, before its `=`, as a node holding that
 * part of its tokens (lexer.ts), so the engine, the editor and anything reading
 * a sheet's tree read it the same way, from the same tokens:
 *
 *   v:3:km/h = d / t         assigned       a name, with its settings
 *   f(x, y):3 = x^2 + y      functionHead   a one-line function's head, with settings for what it gives back
 *   @tuple(r:3, theta) = p   unpack         the names a tuple is unpacked into
 *
 * A line whose left side is none of these (`x + 1 = 2`, `delta F =`) keeps its
 * tokens as they are. Like the lexer, it depends on the text alone.
 */
import { CALL, SIGIL } from '../syntax.ts'
import { ROUND_BRACKETS, lexExpression, isTokenOf, node, partText as textOf } from './lexer.ts'
import { NODE_KIND, TOKEN_KIND, isToken, type Part, type SyntaxNode } from './nodes.ts'

/** The `=` that assigns. */
export const ASSIGN = '='
/** Before each of a name's settings: `v:3:km/h`. */
export const SETTING_MARK = ':'
/** Between a call's parameters or arguments. */
const SEPARATOR = ','

/** `@tuple`, as typed. */
const TUPLE_CALL = `${SIGIL}${CALL.tuple}`

/** The kinds of node a line's left side can be. */
export const TARGET_KINDS: ReadonlySet<string> = new Set([NODE_KIND.assigned, NODE_KIND.functionHead, NODE_KIND.unpack])

const isSpace = (p: Part | undefined) => isTokenOf(p, TOKEN_KIND.space)
const isCall = (p: Part | undefined): p is SyntaxNode => !!p && !isToken(p) && p.kind === NODE_KIND.call

/** A call's arguments: its parts between its brackets. */
const argumentsOf = (call: SyntaxNode) => {
  const open = call.parts.findIndex((p) => isTokenOf(p, TOKEN_KIND.delimiter, ROUND_BRACKETS.open))
  return call.parts.slice(open + 1, -1)
}

/** A quote that isn't closed: mathjs's quote as a delimiter of its own (a closed one is in a string token). */
const STRAY_QUOTES: ReadonlySet<string> = new Set(['"', '\''])

/**
 * Settings after a name or a head: none, or `:`s each with a setting after it
 * (`:3:deg`, `:"Moles"`), with no space at the top, nothing empty (`x::`) and
 * no quote left open (`x:"Moles`).
 */
function areSettings(rest: readonly Part[]): boolean {
  if (rest.length === 0) return true
  if (!isTokenOf(rest[0], TOKEN_KIND.delimiter, SETTING_MARK) || rest.some(isSpace)) return false
  if (rest.some((p) => isToken(p) && p.t === TOKEN_KIND.delimiter && STRAY_QUOTES.has(p.text))) return false
  return splitAt(rest, SETTING_MARK).slice(1).every(Boolean)
}

/** A head's parameters (or the names unpacked into): no brackets inside them. */
const areParameters = (call: SyntaxNode) => !argumentsOf(call).some((p) => isCall(p))

/** The kind of a line's left side, if it's one (see the top of this file). */
function targetKind(lhs: readonly Part[]): string | undefined {
  const [first, ...rest] = lhs
  if (isTokenOf(first, TOKEN_KIND.symbol) && areSettings(rest)) return NODE_KIND.assigned
  if (!isCall(first) || !areParameters(first)) return undefined
  const callee = first.parts[0]
  if (isTokenOf(callee, TOKEN_KIND.builtin, TUPLE_CALL) && rest.length === 0) return NODE_KIND.unpack
  if (isTokenOf(callee, TOKEN_KIND.symbol) && areSettings(rest)) return NODE_KIND.functionHead
  return undefined
}

/** A line's tokens (lexer.ts), with what it assigns to, before its first `=` at the top, as a node of its kind. */
export function lexLine(text: string): readonly Part[] {
  const parts = lexExpression(text)
  const assign = parts.findIndex((p) => isTokenOf(p, TOKEN_KIND.delimiter, ASSIGN))
  if (assign < 0) return parts
  let start = 0
  while (start < assign && isSpace(parts[start])) start++
  let end = assign
  while (end > start && isSpace(parts[end - 1])) end--
  const kind = targetKind(parts.slice(start, end))
  if (!kind) return parts
  return [...parts.slice(0, start), node(kind, parts.slice(start, end)), ...parts.slice(end)]
}

// ---------------------------------------------------------------------------
// Reading a line's shape
// ---------------------------------------------------------------------------

/** What a line assigns to, read: its kind, name, settings (each without its `:`), and a head's parameters or the names unpacked into, as typed. */
export interface Target {
  readonly kind: string
  /** The name assigned, or the function's (an unpacking has none: `@tuple`'s). */
  readonly name: string
  readonly settings: readonly string[]
  /** A function's parameters, or the names unpacked into, each as typed (`r:3`). */
  readonly entries?: readonly string[]
}

/** A line, read for its shape: what it assigns to, if anything, and what's after its `=`. */
export interface LineShape {
  readonly target?: Target
  /** The text up to and through the `=` ('' without a target). */
  readonly head: string
  /** The text after the `=` (spaces at its ends taken off); without a target, the whole line's. */
  readonly value: string
  /** The value's parts (without the spaces at its ends). */
  readonly valueParts: readonly Part[]
}

/** Parts split at each top-level part that's this delimiter, each piece's text. */
function splitAt(parts: readonly Part[], delimiter: string): string[] {
  const pieces: string[] = ['']
  for (const p of parts) {
    if (isTokenOf(p, TOKEN_KIND.delimiter, delimiter)) pieces.push('')
    else pieces[pieces.length - 1] += textOf(p)
  }
  return pieces
}

/** A target node, read. */
export function readTarget(target: SyntaxNode): Target {
  const [first, ...rest] = target.parts
  const settings = rest.length ? splitAt(rest, SETTING_MARK).slice(1) : []
  if (isToken(first)) return { kind: target.kind, name: first.text, settings }
  // (`f()` has one entry, empty: a function's parameters leave it out; an unpacking says it isn't a name.)
  const entries = splitAt(argumentsOf(first as SyntaxNode), SEPARATOR).map((e) => e.trim())
  return { kind: target.kind, name: textOf((first as SyntaxNode).parts[0]), settings, entries }
}

/** A line's shape, from its text (see lexLine). */
export function lineShape(text: string): LineShape {
  const parts = lexLine(text)
  const at = parts.findIndex((p) => !isToken(p) && TARGET_KINDS.has(p.kind))
  if (at < 0) return { head: '', value: text.trim(), valueParts: trimmed(parts) }
  const assign = parts.findIndex((p, i) => i > at && isTokenOf(p, TOKEN_KIND.delimiter, ASSIGN))
  return {
    target: readTarget(parts[at] as SyntaxNode),
    head: parts.slice(0, assign + 1).map(textOf).join(''),
    value: parts.slice(assign + 1).map(textOf).join('').trim(),
    valueParts: trimmed(parts.slice(assign + 1)),
  }
}

/** Parts without the spaces at their ends. */
function trimmed(parts: readonly Part[]): readonly Part[] {
  let start = 0
  let end = parts.length
  while (start < end && isSpace(parts[start])) start++
  while (end > start && isSpace(parts[end - 1])) end--
  return parts.slice(start, end)
}

/** Parts that are one call and nothing else, read: what it calls, and its arguments' text; undefined if they aren't. */
export function soleCall(parts: readonly Part[]): { callee: string; args: string } | undefined {
  const [only, ...rest] = trimmed(parts)
  if (!isCall(only) || rest.length) return undefined
  return { callee: textOf(only.parts[0]), args: argumentsOf(only).map(textOf).join('') }
}

/** A name with its settings and nothing else, `theta:3:deg` (one of an unpacking's names), read; undefined if it isn't one. */
export function assignedOf(text: string): Target | undefined {
  const parts = lexExpression(text)
  return targetKind(parts) === NODE_KIND.assigned ? readTarget(node(NODE_KIND.assigned, parts)) : undefined
}
