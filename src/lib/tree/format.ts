/**
 * A sheet formatted: each line's indentation from the bodies it's in, as the
 * tree reads it (stream.ts), one level (INDENT) for each, and a line carried on
 * over several laid out as one is written:
 *
 *   val = [
 *       1234,
 *       5678
 *   ]
 *
 * A bracket that opens on one line and closes on another has what's in it one
 * to a line: a line break after it, before its closing bracket, and after each
 * `,` or `;` directly in it (a matrix's `[ ]` at its `;`s, if it has any: one
 * row to a line). Its lines are a level deeper than the first for each bracket
 * open where they start (one starting by closing a bracket a level out), its
 * closing bracket at the first's indentation, and a trailing comma before that
 * bracket taken off. A bracket that opens and closes on one line is left as it is.
 *
 * Nothing changes what the sheet says: only whitespace, and those commas. (The
 * lines of a continued line are joined with a space, so a line break between
 * two of its tokens is the same to the engine as the space it replaces.) Where
 * indentation means something, it's kept: an `@layout` block's lines keep how
 * much further in than its first line each is (a list's sub-list); imported
 * data's rows move with their import; raw LaTeX and prose are kept as written.
 * Formatting a formatted sheet changes nothing.
 */
import { INDENT_WIDTH, indentOf, isComment } from '../syntax.ts'
import { CONTENT, contextInfo, type Content } from './grammar.ts'
import { LINE_CONTEXT, NODE_KIND, TOKEN_KIND, isToken, type Part, type SyntaxNode, type Token } from './nodes.ts'
import { splitLines, startsClosing, type SourceLine } from './lines.ts'
import { ROUND_BRACKETS, SQUARE_BRACKETS, closesBracket, opensBracket } from './lexer.ts'
import { ROW_SEPARATOR, SEPARATOR, STRAY_QUOTES } from './shapes.ts'
import { LINE_ROLE, TOP, stepLine, type Step } from './stream.ts'
import { statementOfLines, type PlacedToken } from './statements.ts'

/** A change to a text: what's from `from` up to `to` replaced with `insert`. */
export interface TextChange {
  readonly from: number
  readonly to: number
  readonly insert: string
}

/** The contents whose lines are kept as written: raw LaTeX and imported data (`whole`), prose (`text`). */
const KEPT_CONTENT: ReadonlySet<Content> = new Set([CONTENT.whole, CONTENT.text])

/** The bodies whose lines keep how much further in than the first each is: a list's sub-lists. */
const RELATIVE_BODIES: ReadonlySet<string> = new Set([NODE_KIND.layout])

/** The kinds of token that aren't something said: spaces, indentation, line endings, notes, comments. */
const UNSAID: ReadonlySet<string> = new Set([
  TOKEN_KIND.space, TOKEN_KIND.indent, TOKEN_KIND.eol, TOKEN_KIND.note, TOKEN_KIND.comment,
])

/** A body being formatted (one for each the tree has open, and the sheet's top). */
interface Level {
  /** Where its opener is indented to, formatted. */
  readonly opener: number
  /** Where its lines are indented to, formatted. */
  readonly indent: number
  /** How far its opener moved: imported data's rows move as far, so they stay under it. */
  readonly moved: number
  /** Whether its lines keep how much further in than its first each is (RELATIVE_BODIES). */
  readonly relative: boolean
  /** Where its first line was indented to, as written (for a body whose lines keep how much further in each is). */
  base?: number
}

/** The changes that format a sheet, in order, none overlapping (only whitespace, and trailing commas). */
export function formatChanges(source: string): TextChange[] {
  const lines = splitLines(source)
  const steps: Step[] = []
  const starts: number[] = []
  let state = TOP
  let at = 0
  for (const line of lines) {
    const step = stepLine(state, line)
    steps.push(step)
    starts.push(at)
    state = step.state
    at += line.text.length + line.eol.length
  }
  const levels: Level[] = [{ opener: 0, indent: 0, moved: 0, relative: false }]
  const changes: TextChange[] = []
  /** The spaces between a line's tokens (spacingChanges): made where nothing else changes. */
  const spacing: TextChange[] = []
  lines.forEach((line, n) => {
    const step = steps[n]
    step.ended.forEach(() => levels.pop())
    // (In a continued line, how many of its brackets are open where this line starts.)
    const open = step.context === LINE_CONTEXT.continued ? steps[n - 1]?.state.at(-1)?.open : undefined
    const width = formattedIndent(line, step, levels, open)
    const lead = line.text.length - line.text.trimStart().length
    if (width !== undefined && line.text.slice(0, lead) !== ' '.repeat(width)) changes.push({ from: starts[n], to: starts[n] + lead, insert: ' '.repeat(width) })
    if (width !== undefined && step.role !== LINE_ROLE.row) spacing.push(...spacingChanges(step.node, starts[n]))
    if (step.role === LINE_ROLE.opener) {
      const opener = width ?? indentOf(line.text)
      const relative = RELATIVE_BODIES.has(step.body!.node)
      levels.push({ opener, indent: opener + INDENT_WIDTH, moved: opener - indentOf(line.text), relative })
      // A continued line: its lines, up to the one closing it, one thing to a line.
      if (step.body!.node === NODE_KIND.continued) {
        let last = n
        while (steps[last + 1]?.context === LINE_CONTEXT.continued) last++
        changes.push(...continuedChanges(lines, steps, starts, n, last, opener))
      }
    }
  })
  // (Spacing where a line break, an indentation or a trailing comma's removal already changes it, or touches it,
  // is theirs; and of two spacing changes in one gap, `,=` (the comma's space after, the `=`'s before), the first.)
  const touches = (a: TextChange, b: TextChange) => a.from <= b.to && b.from <= a.to
  const free: TextChange[] = []
  for (const s of [...spacing].sort((a, b) => a.from - b.from || a.to - b.to)) {
    if (!changes.some((c) => touches(s, c)) && !free.some((f) => touches(s, f))) free.push(s)
  }
  return [...changes, ...free].sort((a, b) => a.from - b.from || a.to - b.to)
}

/** A token of a line, where it is in the sheet's text, and whether it's in a value in text (`{{…}}`, prose's: left as it is). */
interface LineToken {
  readonly token: Token
  readonly at: number
  readonly inValue: boolean
  /** The node it's directly in (a quantity: `5 kg`), if any. */
  readonly parent?: SyntaxNode
}

/** The kinds of token nothing is said in: spaces, indentation, line endings, notes, comments. */
const QUIET: ReadonlySet<string> = new Set([
  TOKEN_KIND.space, TOKEN_KIND.indent, TOKEN_KIND.eol, TOKEN_KIND.note, TOKEN_KIND.comment,
])

/**
 * What spacing changes: the `=` that assigns or compares, the separators
 * between a call's or a list's values, and a condition's `?` and `:`
 * (`a > b ? "yes" : "no"`).
 */
const SPACED = { equals: '=', comma: SEPARATOR, semicolon: ROW_SEPARATOR, condition: '?', otherwise: ':' } as const

/** One space, as spacing puts between tokens. */
const SPACE = ' '

/**
 * The changes that space a line's tokens as maths is written: one space either
 * side of `=` (`x= 5` → `x = 5`), and of a condition's `?` and its `:`
 * (`a ? "x":"y"` → `a ? "x" : "y"`; a `:` with no `?` before it, a setting's,
 * is left); one after each `,` or `;` and none before (`x1,x2` → `x1, x2`),
 * unless what's after it ends the line, closes a bracket or is a note; one
 * between a number and its unit (`5kg` → `5 kg`). Only the
 * spaces between tokens change, so what the line says doesn't: strings, a
 * module's settings (one token), notes and comments are left as they are, and
 * so are values in text (`{{…}}`, prose's).
 */
function spacingChanges(line: SyntaxNode, start: number): TextChange[] {
  const tokens: LineToken[] = []
  let at = start
  const visit = (parts: readonly Part[], parent: SyntaxNode | undefined, inValue: boolean) => {
    for (const p of parts) {
      if (!isToken(p)) visit(p.parts, p, inValue || p.kind === NODE_KIND.value)
      else {
        tokens.push({ token: p, at, inValue, parent })
        at += p.text.length
      }
    }
  }
  visit(line.parts, undefined, false)
  const changes: TextChange[] = []
  const isSpace = (t: LineToken | undefined) => t?.token.t === TOKEN_KIND.space
  const isSaid = (t: LineToken | undefined) => t !== undefined && !QUIET.has(t.token.t)
  const isDelimiter = (t: LineToken | undefined, text: string) => t?.token.t === TOKEN_KIND.delimiter && t.token.text === text
  const endOf = (t: LineToken) => t.at + t.token.text.length
  /** Exactly one space between the tokens at `i` and `i + 1` (or the space between them and the token after it), both said. */
  const oneSpaceAfter = (i: number) => {
    const next = tokens[i + 1]
    if (isSaid(next)) changes.push({ from: endOf(tokens[i]), to: endOf(tokens[i]), insert: SPACE })
    else if (isSpace(next) && isSaid(tokens[i + 2]) && next.token.text !== SPACE) changes.push({ from: next.at, to: endOf(next), insert: SPACE })
  }
  /** Exactly one space before the token at `i`, after a token said before it (not at the line's start). */
  const oneSpaceBefore = (i: number) => {
    const prev = tokens[i - 1]
    if (isSaid(prev)) changes.push({ from: tokens[i].at, to: tokens[i].at, insert: SPACE })
    else if (isSpace(prev) && isSaid(tokens[i - 2]) && prev.token.text !== SPACE) changes.push({ from: prev.at, to: endOf(prev), insert: SPACE })
  }
  /** How many conditions' `?` are waiting for their `:`. */
  let conditions = 0
  tokens.forEach((t, i) => {
    if (t.inValue) return
    const otherwise = isDelimiter(t, SPACED.otherwise) && conditions > 0
    if (isDelimiter(t, SPACED.condition)) conditions++
    if (otherwise) conditions--
    if (isDelimiter(t, SPACED.equals) || isDelimiter(t, SPACED.condition) || otherwise) {
      oneSpaceBefore(i)
      oneSpaceAfter(i)
    } else if (isDelimiter(t, SPACED.comma) || isDelimiter(t, SPACED.semicolon)) {
      // (None before it, after something said, but not after another of these, whose own space it is: `x = ,`;
      // one after it, unless a bracket closes or another separator follows.)
      const prev = tokens[i - 1]
      const spacedBefore = Object.values(SPACED).some((s) => isDelimiter(tokens[i - 2], s))
      if (isSpace(prev) && isSaid(tokens[i - 2]) && !spacedBefore) changes.push({ from: prev.at, to: endOf(prev), insert: '' })
      const after = isSpace(tokens[i + 1]) ? tokens[i + 2] : tokens[i + 1]
      const closing = after?.token.t === TOKEN_KIND.delimiter && (closesBracket(after.token.text) || after.token.text === SPACED.comma || after.token.text === SPACED.semicolon)
      if (!closing) oneSpaceAfter(i)
    } else if (t.token.t === TOKEN_KIND.number && t.parent?.kind === NODE_KIND.quantity) {
      // A number and its unit: one space between them.
      const unit = isSpace(tokens[i + 1]) ? tokens[i + 2] : tokens[i + 1]
      if (unit?.token.t === TOKEN_KIND.unit && unit.parent === t.parent) oneSpaceAfter(i)
    }
  })
  return changes
}

/** A sheet formatted (see formatChanges). */
export function formatSheet(source: string): string {
  let text = source
  // (From the last change back, so each one's place is where it was.)
  for (const { from, to, insert } of formatChanges(source).reverse()) text = text.slice(0, from) + insert + text.slice(to)
  return text
}

/**
 * How far a line is indented, formatted, in spaces; undefined if it's kept as
 * written. `open`: for a line carrying on a continued line, how many of its
 * brackets are open where the line starts.
 */
function formattedIndent(line: SourceLine, step: Step, levels: Level[], open?: number): number | undefined {
  const written = indentOf(line.text)
  // A body's closing line is where its opener is; but a continued line's is
  // placed by its brackets, as its other lines are: under its first line if it
  // starts by closing the last of them, `)`, and further in otherwise (`2)`,
  // which there would end the line before itself).
  const closer = step.role === LINE_ROLE.closer ? levels.pop()! : undefined
  const level = closer ?? levels.at(-1)!
  // A continued line's, its closing line too: a level in for each bracket open, one it starts by closing aside.
  if (open !== undefined) return continuedIndent(level.opener, open, startsClosing(step.node))
  if (closer) return closer.opener
  // Imported data's rows move with their import.
  if (step.role === LINE_ROLE.row) return written + level.moved
  if (KEPT_CONTENT.has(contextInfo(step.context).content)) return undefined
  if (!line.text.trim()) return 0
  if (!level.relative) return level.indent
  // (A comment doesn't set where a body's lines are: it's as if it weren't there, as the reader takes it.)
  if (level.base === undefined && step.node.kind !== NODE_KIND.comment) level.base = written
  return level.indent + Math.max(0, written - (level.base ?? written))
}

/**
 * Where a line of a continued line is indented: a level in from its first line
 * for each bracket open where it starts, one it starts by closing aside; at
 * least one level, so it carries the line on, unless it closes the last of them
 * (it's then under the first line).
 */
function continuedIndent(opener: number, open: number, startsClosing: boolean): number {
  const levels = open - (startsClosing ? 1 : 0)
  return opener + INDENT_WIDTH * (startsClosing && levels === 0 ? 0 : Math.max(1, levels))
}

/** A token of a continued line (its statement's, statements.ts): which line of the sheet it's on, and where it starts in the sheet's text. */
type Placed = PlacedToken

/** The bracket closing one that opens: `)` for `(`, `]` for `[`. */
const pairOf = (open: string) => (open === SQUARE_BRACKETS.open ? SQUARE_BRACKETS.close : ROUND_BRACKETS.close)

const isDelimiter = (p: Placed | undefined, text?: string) => p?.token.t === TOKEN_KIND.delimiter && (text === undefined || p.token.text === text)
const isSaid = (p: Placed | undefined) => p !== undefined && !UNSAID.has(p.token.t)
const endOf = (p: Placed) => p.at + p.token.text.length

/**
 * The changes laying out a continued line (its lines `first` to `last`; its
 * first line indented to `opener`, formatted): what's in each bracket that
 * spans lines, one thing to a line, and the trailing comma before its closing
 * bracket taken off (see the top of this file).
 */
function continuedChanges(
  lines: readonly SourceLine[], steps: readonly Step[], starts: readonly number[], first: number, last: number, opener: number,
): TextChange[] {
  // (Its statement's tokens, each where it is in the sheet.)
  const statement = statementOfLines(steps.slice(first, last + 1).map((s) => s.node))
  const tokens: Placed[] = statement.tokens.map((t) => ({ token: t.token, line: first + t.line, at: starts[first + t.line] + t.at }))
  // Each bracket's closing one, the bracket each token is directly in, and how many are open after each
  // (counted as the tree counts them, stream.ts, so the lines it makes are indented as it will read them).
  const closing = new Map<number, number>()
  const inside: (number | undefined)[] = []
  const openAfter: number[] = []
  const stack: number[] = []
  let open = 0
  let unmatched = false
  tokens.forEach((p, i) => {
    inside.push(stack.at(-1))
    if (isDelimiter(p) && opensBracket(p.token.text)) {
      stack.push(i)
      open++
    } else if (isDelimiter(p) && closesBracket(p.token.text)) {
      // (A bracket closes only its own kind: `[` with `]`.)
      const opened = stack.pop()
      if (opened !== undefined && pairOf(tokens[opened].token.text) === p.token.text) closing.set(opened, i)
      else unmatched = true
      open--
    }
    openAfter.push(open)
  })
  // Only a line whose brackets all close, and whose quotes do, is laid out (one half typed is left as it is).
  if (unmatched || stack.length || tokens.some((p) => isDelimiter(p) && STRAY_QUOTES.has(p.token.text))) return []
  /** Whether the bracket at `open` closes on a later line (a bracket never closed is left as it is). */
  const spans = (open: number | undefined): open is number =>
    open !== undefined && closing.has(open) && tokens[closing.get(open)!].line !== tokens[open].line
  const next = (i: number) => tokens.findIndex((p, j) => j > i && isSaid(p))
  /**
   * Whether the token at `j`, after `p` on its line, goes on a line of its own:
   * not the bracket's closing one (its own rule places it), nor a separator (an
   * empty item, `,,`: a line doesn't start with one).
   */
  const startsALine = (j: number, p: Placed, close: number | undefined): boolean =>
    j >= 0 && tokens[j].line === p.line && j !== close && !isDelimiter(tokens[j], SEPARATOR) && !isDelimiter(tokens[j], ROW_SEPARATOR)
  const previous = (i: number) => tokens.findLastIndex((p, j) => j < i && isSaid(p))
  const eol = lines[first].eol
  const changes: TextChange[] = []
  /**
   * A line break between two tokens on one line, the spaces between them taken
   * out, the new line indented for what's open there; not if the new line would
   * start with `//` (`[//,`), which would make it a comment.
   */
  const breakBetween = (from: number, to: number, startsClosing: boolean, open: number) => {
    const line = lines.findLastIndex((_, n) => starts[n] <= to)
    const text = lines[line].text
    // (And only where a bracket is open, so the line before it still carries the line on; and only
    // in place of spaces.)
    if (open < 1 || text.slice(from - starts[line], to - starts[line]).trim() || isComment(text.slice(to - starts[line]))) return
    changes.push({ from, to, insert: eol + ' '.repeat(continuedIndent(opener, open, startsClosing)) })
  }

  tokens.forEach((p, i) => {
    if (!isDelimiter(p)) return
    // After a bracket spanning lines: what's in it starts on a line of its own.
    if (opensBracket(p.token.text) && spans(i)) {
      const j = next(i)
      if (startsALine(j, p, closing.get(i))) breakBetween(endOf(p), tokens[j].at, false, openAfter[i])
      return
    }
    const bracket = inside[i]
    if (!spans(bracket)) return
    // Its closing bracket: on a line of its own, with no comma before it.
    if (i === closing.get(bracket)) {
      const j = previous(i)
      const comma = j >= 0 && isDelimiter(tokens[j], SEPARATOR) && trailingCommaGoes(tokens, j, previous(j))
      const before = comma ? tokens[j] : undefined
      if (tokens[j]?.line === p.line && j !== bracket) breakBetween(before ? before.at : endOf(tokens[j]), p.at, true, openAfter[i] + 1)
      else if (before) changes.push({ from: before.at, to: endOf(before), insert: commaGap(tokens, j) })
      return
    }
    // Each separator directly in it (a matrix's rows, if it has any), with what's after it on a line of its own.
    if (!isSeparatorIn(tokens, i, bracket, closing.get(bracket)!)) return
    const j = next(i)
    if (startsALine(j, p, closing.get(bracket))) breakBetween(endOf(p), tokens[j].at, false, openAfter[i])
  })
  return changes
}

/**
 * Whether the trailing comma at `comma` comes off: only after something said on
 * its line (a comma alone on its line, or straight after its bracket, stays: the
 * line would be blank without it, which ends the call), and not after another
 * separator (`a,,`: an empty item, kept as written).
 */
function trailingCommaGoes(tokens: readonly Placed[], comma: number, before: number): boolean {
  const p = tokens[before]
  if (before < 0 || p.line !== tokens[comma].line) return false
  return !(isDelimiter(p) && (opensBracket(p.token.text) || p.token.text === SEPARATOR || p.token.text === ROW_SEPARATOR))
}

/** What a comma taken off leaves: a space if something's right after it (`5678,// note` keeps its note apart), or nothing. */
const commaGap = (tokens: readonly Placed[], comma: number) => {
  const after = tokens[comma + 1]
  return after && after.line === tokens[comma].line && after.token.t !== TOKEN_KIND.space && after.token.t !== TOKEN_KIND.eol ? ' ' : ''
}

/**
 * Whether the delimiter at `i`, directly in the bracket at `open` (closed at
 * `close`), is one a line breaks after: a `,` or `;`; in a matrix's `[ ]` with
 * rows (a `;` directly in it), only a `;`.
 */
function isSeparatorIn(tokens: readonly Placed[], i: number, open: number, close: number): boolean {
  const text = tokens[i].token.text
  if (text !== SEPARATOR && text !== ROW_SEPARATOR) return false
  if (tokens[open].token.text !== SQUARE_BRACKETS.open) return true
  let depth = 0
  let rows = false
  for (let j = open + 1; j < close && !rows; j++) {
    const t = tokens[j]
    if (isDelimiter(t) && opensBracket(t.token.text)) depth++
    else if (isDelimiter(t) && closesBracket(t.token.text)) depth--
    else if (depth === 0 && isDelimiter(t, ROW_SEPARATOR)) rows = true
  }
  return !rows || text === ROW_SEPARATOR
}
