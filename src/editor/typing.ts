/**
 * What's being typed at the cursor, for the editor's suggestions: read from the
 * tokens of the half-typed line, as the sheet's tree reads it (src/lib/tree), so
 * the editor reads a line the way the engine does rather than with patterns of
 * its own. `@chem.mm.N` is an `@` name being typed in @chem.mm; `2.5 ang` a unit
 * after a number; `phi:3:de` a setting on a name; `run1.x_` a member of run1.
 */
import { NODE_KIND, TOKEN_KIND, isToken, type Part, type SyntaxNode } from '../lib/tree/index.ts'
import { lexExpression } from '../lib/tree/lexer.ts'
import { CALL, KEYWORD, MEMBER_DOT, SIGIL } from '../lib/syntax.ts'
import { words, type WordOf } from '../lib/syntax/patterns.ts'

/** What can be being typed, each with its own suggestions. */
export const TYPING = words({
  /** A display command after the line's text: `#mu`. */
  command: 'command',
  /** A note, `# the mass`: nothing's suggested in one. */
  note: 'note',
  /** An `@` name: `@h`, `@chem.mm.N`, `@layout.val.` (its namespaces' path, and what's typed of the next). */
  builtin: 'builtin',
  /** A setting after a `:` on a name being assigned, unpacked, or a function's result: `phi:3:de`. */
  setting: 'setting',
  /** A unit, after a number or `to`: `2.5 ang`, `y to per`. */
  unit: 'unit',
  /** A namespace's member, after its name and a dot: `run1.x_`. */
  member: 'member',
  /** A name: a variable, a function, a keyword. */
  name: 'name',
})
export type TypingKind = WordOf<typeof TYPING>

/** What's being typed: its kind, and `typed`, the text it replaces (just before the cursor). */
export type Typing =
  | { readonly kind: typeof TYPING.command; readonly typed: string }
  | { readonly kind: typeof TYPING.note; readonly typed: '' }
  | { readonly kind: typeof TYPING.builtin; readonly typed: string; readonly path: readonly string[]; readonly lineStart: boolean }
  | { readonly kind: typeof TYPING.setting; readonly typed: string }
  | { readonly kind: typeof TYPING.unit; readonly typed: string; readonly afterTo: boolean }
  | { readonly kind: typeof TYPING.member; readonly typed: string; readonly namespace: string }
  | { readonly kind: typeof TYPING.name; readonly typed: string }

/**
 * A piece of the half-typed line: a token, or a whole call whose brackets are
 * closed (`f(x)`, `@chem.mm({H2O})`), which is what's before a `.` or `:` after it.
 */
interface Piece {
  readonly t: string
  readonly text: string
  /** A closed call: what it calls (its first part's text). */
  readonly callee?: string
  /** A closed call: whether what it calls is an `@` name. */
  readonly builtinCall?: boolean
}

/** Each token of the parts, in order, with a closed call kept whole. */
function piecesOf(parts: readonly Part[]): Piece[] {
  return parts.flatMap((p): Piece[] => {
    if (isToken(p)) return [p]
    if (p.kind === NODE_KIND.call) return [callPiece(p)]
    return piecesOf(p.parts)
  })
}

const textOf = (p: Part): string => (isToken(p) ? p.text : p.parts.map(textOf).join(''))

function callPiece(call: SyntaxNode): Piece {
  const head = call.parts[0]
  return { t: NODE_KIND.call, text: textOf(call), callee: textOf(head), builtinCall: isToken(head) && head.t === TOKEN_KIND.builtin }
}

/** Spaces, between pieces or at the start. */
const isSpace = (p: Piece | undefined) => p?.t === TOKEN_KIND.space || p?.t === TOKEN_KIND.indent
const isDelimiter = (p: Piece | undefined, text: string) => p?.t === TOKEN_KIND.delimiter && p.text === text

/** Letters only: what's typed of a setting or a unit. */
const LETTERS = /^[A-Za-z]*$/
/** A word typed as `#` and letters: a display command, finished or not. */
const COMMAND_TYPED = /^#\w*$/
/** A number ending in a digit (or a digit and its point), as a unit can follow: `2.5`, `3.`, not `1e`. */
const ENDS_IN_DIGIT = /\d\.?$/

/** A word that can be what's typed of a name or a unit: as a name, a unit or a keyword reads it so far. */
const isWord = (p: Piece | undefined) => p?.t === TOKEN_KIND.symbol || p?.t === TOKEN_KIND.unit || p?.t === TOKEN_KIND.keyword

/** What's being typed at the end of `parts` (a line's, or a value's in text), if anything is. */
export function typingAt(parts: readonly Part[]): Typing | undefined {
  const pieces = piecesOf(parts)
  if (!pieces.length) return undefined
  // The first reader that knows what's being typed says (null: that nothing is).
  for (const read of READERS) {
    const typing = read(pieces)
    if (typing !== undefined) return typing ?? undefined
  }
  return undefined
}

/** A reader of what's being typed: what it is, null if the reader knows nothing is, or undefined if it isn't the reader's kind. */
type Reader = (pieces: readonly Piece[]) => Typing | null | undefined

/** Letters at the end of a compound unit: the `s` of `m/s`, the `m` of `N*m`. */
const UNIT_WORD_SO_FAR = /[A-Za-z]+$/

/**
 * `9.81 m/s`, `conc(n, V):mol/L`: the next unit of a compound one, as the
 * lexer reads the whole as a unit (after a number, `to` or a `:`); `typed`,
 * its letters so far. (Nothing's being typed after `m/s^2`.)
 */
function inUnit(pieces: readonly Piece[]): Typing | null | undefined {
  const last = pieces.at(-1)!
  if (last.t !== TOKEN_KIND.unit || LETTERS.test(last.text)) return undefined
  const typed = UNIT_WORD_SO_FAR.exec(last.text)?.[0]
  return typed === undefined ? null : { kind: TYPING.unit, typed, afterTo: false }
}

/** What's being typed in a value in text, `{{c_`: its expression's text read as one. */
export const typingInValue = (expression: string): Typing | undefined => typingAt(lexExpression(expression))

/** `#mu` after the line's text: a command; any other `#` that's started a note: nothing. */
function commandOrNote(pieces: readonly Piece[]): Typing | null | undefined {
  const last = pieces.at(-1)!
  const hasText = pieces.slice(0, -1).some((p) => !isSpace(p))
  if ((last.t === TOKEN_KIND.note || last.t === TOKEN_KIND.command) && COMMAND_TYPED.test(last.text) && hasText && isSpace(pieces.at(-2))) {
    return { kind: TYPING.command, typed: last.text }
  }
  // (A note runs to the end of the line: the spaces after it too.)
  return pieces.some((p) => p.t === TOKEN_KIND.note) ? { kind: TYPING.note, typed: '' } : undefined
}

/** `@chem.mm.N`, `@layout.val.`, `@chem.mm({H2O}).`: the namespaces' path, and what's typed of the next member. */
function builtin(pieces: readonly Piece[]): Typing | null | undefined {
  const last = pieces.at(-1)!
  let start: number
  let path: string[]
  let typed: string
  if (last.text === SIGIL && last.t === TOKEN_KIND.unknown) {
    // `@` on its own, so far.
    typed = ''
    path = []
    start = pieces.length - 1
  } else if (last.t === TOKEN_KIND.builtin) {
    // `@c:4`: a constant and its precision, typed (no name's being typed).
    if (last.text.includes(':')) return null
    // `@chem.mm.N`: one token, with its dots.
    const names = last.text.slice(SIGIL.length).split(MEMBER_DOT)
    typed = names.pop()!
    path = names
    start = pieces.length - 1
  } else if (isDelimiter(last, MEMBER_DOT)) {
    // `@layout.val.` or `@chem.mm({H2O}).`: a name, or a call to one, and a dot.
    const before = pieces.at(-2)
    const name = before?.t === TOKEN_KIND.builtin ? before.text : before?.builtinCall ? before.callee : undefined
    if (name === undefined) return undefined
    path = name.slice(SIGIL.length).split(MEMBER_DOT)
    typed = ''
    start = pieces.length - 2
  } else {
    return undefined
  }
  const lineStart = pieces.slice(0, start).every(isSpace)
  // At the top, what's replaced is the `@` and all.
  return { kind: TYPING.builtin, path, typed: path.length ? typed : `${SIGIL}${typed}`, lineStart }
}

/**
 * `phi:3:de`, `ang(y, x):3:de`, `@tuple(r:3, theta:de`: a setting after a `:`
 * on a name being assigned (at the line's start), a function's result, or a
 * name being unpacked; `typed`, what's typed of it so far.
 */
function setting(pieces: readonly Piece[]): Typing | null | undefined {
  let end = pieces.length
  let typed = ''
  const last = pieces.at(-1)!
  // (A setting that's a unit, `deg`, reads as one once it's whole.)
  if (isWord(last)) {
    if (!LETTERS.test(last.text)) return undefined
    typed = last.text
    end--
  }
  if (!isDelimiter(pieces[end - 1], ':')) return undefined
  // Back to the start of the name and its settings: after a space, a `(` or a `,`.
  let start = end - 1
  while (start > 0 && !isSpace(pieces[start - 1]) && !isDelimiter(pieces[start - 1], '(') && !isDelimiter(pieces[start - 1], ',')) start--
  const head = pieces[start]
  const settings = pieces.slice(start + 1, end)
  // Each setting is a `:` and its value (no `=`, and no `:` without one).
  if (settings.some((p, i) => isDelimiter(p, '=') || (isDelimiter(p, ':') && isDelimiter(settings[i + 1], ':')))) return undefined
  if (!isDelimiter(settings[0], ':')) return undefined
  const before = pieces.slice(0, start)
  const atLineStart = before.every(isSpace)
  // A name being assigned, or a function's result: at the line's start.
  if (atLineStart && (head.t === TOKEN_KIND.symbol || (head.t === NODE_KIND.call && !head.builtinCall))) return { kind: TYPING.setting, typed }
  // A name being unpacked: in `@tuple(…`, at the line's start, after its `(` or a `,`.
  if (head.t !== TOKEN_KIND.symbol) return undefined
  const [opener, bracket, ...inside] = before.filter((p) => !isSpace(p))
  const inTuple = opener?.t === TOKEN_KIND.builtin && opener.text === `${SIGIL}${CALL.tuple}` && isDelimiter(bracket, '(')
    && !inside.some((p) => isDelimiter(p, '(') || isDelimiter(p, ')') || isDelimiter(p, '='))
  return inTuple ? { kind: TYPING.setting, typed } : undefined
}

/** `2.5 ang`, `y to per`: a unit after a number or `to` and a space; `typed`, what's typed of it so far. */
function unit(pieces: readonly Piece[]): Typing | null | undefined {
  let end = pieces.length
  let typed = ''
  const last = pieces.at(-1)!
  if (isWord(last)) {
    if (!LETTERS.test(last.text)) return undefined
    typed = last.text
    end--
  }
  if (!isSpace(pieces[end - 1])) return undefined
  const after = pieces[end - 2]
  const afterTo = after?.t === TOKEN_KIND.keyword && after.text === KEYWORD.to
  const afterNumber = after?.t === TOKEN_KIND.number && ENDS_IN_DIGIT.test(after.text)
  return afterTo || afterNumber ? { kind: TYPING.unit, typed, afterTo } : undefined
}

/** `run1.x_`: a namespace's name, its dot, and what's typed of a member so far. */
function member(pieces: readonly Piece[]): Typing | null | undefined {
  let end = pieces.length
  let typed = ''
  const last = pieces.at(-1)!
  if (last.t === TOKEN_KIND.symbol) {
    typed = last.text
    end--
  }
  if (!isDelimiter(pieces[end - 1], MEMBER_DOT)) return undefined
  const namespace = pieces[end - 2]
  if (namespace?.t !== TOKEN_KIND.symbol || isDelimiter(pieces[end - 3], MEMBER_DOT)) return undefined
  return { kind: TYPING.member, typed, namespace: namespace.text }
}

/** A name being typed (a word that isn't part of a number: `1e` is a number so far). */
function name(pieces: readonly Piece[]): Typing | null | undefined {
  const last = pieces.at(-1)!
  if (!isWord(last)) return undefined
  // (Straight after a number, `2x`, it's a product's factor, as the patterns had it: not offered;
  // nor after a dot, a member of a member, `H2SO4.H.m`.)
  if (pieces.at(-2)?.t === TOKEN_KIND.number || isDelimiter(pieces.at(-2), MEMBER_DOT)) return undefined
  return { kind: TYPING.name, typed: last.text }
}

/** The readers, in the order they're asked. */
const READERS: readonly Reader[] = [commandOrNote, builtin, inUnit, setting, unit, member, name]
