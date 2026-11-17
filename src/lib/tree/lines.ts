/**
 * A sheet's lines, each read into a node. A line is read the same way wherever
 * it is, given its context (what it's inside: the sheet, prose, raw LaTeX, a
 * function's body), so what's read of a line depends only on its text and its
 * context: that's what's cached, and an edit reads again only the lines it changed.
 *
 * Nodes are frozen, so one node can stand for the same line in every tree it's
 * in (a sheet read again after an edit shares every unchanged line's node), and
 * anything worked out from a node can be kept by the node itself (a WeakMap):
 * its text (codec.ts), and later its evaluation.
 */
import {
  BLOCK_NAME, BLOCK_OPEN, INLINE_MATHS, NOTED_PIECE, VALUE_BRACES, VALUE_IN_TEXT, isComment, readNoted, type NotedLine,
} from '../syntax.ts'
import { CONTENT, contextInfo, syntaxesIn, type Body, type Content } from './grammar.ts'
import { HEADING_MARKS } from './core.ts'
import { lexExpression, node } from './lexer.ts'
import { lexLine } from './shapes.ts'
import { NODE_KIND, TOKEN_KIND, type Part, type SyntaxNode, type Token } from './nodes.ts'

/** A line, and what ends it: `\n`, `\r\n`, `\r`, or '' (the last line, if the text doesn't end with one). */
export interface SourceLine {
  text: string
  eol: string
}

/** What ends a line, in any of the ways a text can. */
const LINE_END = /\r\n|\n|\r/g

/** A text's lines, each with what ends it; joined, they're the text exactly. */
export function splitLines(source: string): SourceLine[] {
  const lines: SourceLine[] = []
  let start = 0
  for (const m of source.matchAll(LINE_END)) {
    lines.push({ text: source.slice(start, m.index), eol: m[0] })
    start = m.index + m[0].length
  }
  lines.push({ text: source.slice(start), eol: '' })
  return lines
}

/** A line's leading and trailing spaces and tabs, and what's between them. */
const EDGES = /^([ \t]*)(.*?)([ \t]*)$/s

/** Spaces and tabs at the start or end of a piece. */
const LEADING_SPACE = /^[ \t]+/
const TRAILING_SPACE = /[ \t]+$/

const token = (t: string, text: string): Token => Object.freeze({ t, text })

/**
 * A piece of text as a token, with any spaces at its ends as space tokens; or,
 * for what a line says when it's an expression (`asExpression`), as the
 * expression's tokens (lexer.ts).
 */
function spaced(t: string, text: string, into: Part[], asExpression = false): void {
  const lead = LEADING_SPACE.exec(text)?.[0] ?? ''
  const trail = text.length > lead.length ? TRAILING_SPACE.exec(text)?.[0] ?? '' : ''
  const middle = text.slice(lead.length, text.length - trail.length)
  if (lead) into.push(token(TOKEN_KIND.space, lead))
  if (middle) {
    if (asExpression && t === TOKEN_KIND.body) into.push(...lexLine(middle))
    else into.push(token(t, middle))
  }
  if (trail) into.push(token(TOKEN_KIND.space, trail))
}

/** How a noted line's body (each of its pieces, between #commands) is read into tokens. */
type BodyReader = (text: string, into: Part[], first: boolean, last: boolean) => void

/** A body as it is: one token. */
const plainBody: BodyReader = (text, into) => spaced(TOKEN_KIND.body, text, into)

/** A body that's an expression: its tokens (lexer.ts). */
const expressionBody: BodyReader = (text, into) => spaced(TOKEN_KIND.body, text, into, true)

/** A block's `{`, and any spaces after it, at the end of its opener. */
const OPENING_BRACE = /\{[ \t]*$/

/**
 * A block opener's body: its `@` name at the start, if it has one
 * (`@layout.list`), its `{` at the end, and its title between.
 */
const openerBody: BodyReader = (text, into, first, last) => {
  let rest = text
  const name = first ? BLOCK_NAME.exec(rest)?.[0] : undefined
  if (name) {
    into.push(token(TOKEN_KIND.blockName, name))
    rest = rest.slice(name.length)
  }
  const brace = last ? OPENING_BRACE.exec(rest) : null
  spaced(TOKEN_KIND.title, brace ? rest.slice(0, brace.index) : rest, into)
  if (brace) {
    into.push(token(TOKEN_KIND.blockOpen, BLOCK_OPEN))
    spaced(TOKEN_KIND.space, brace[0].slice(BLOCK_OPEN.length), into)
  }
}

/**
 * Content with #commands and a note, as tokens, from its pieces as readNoted
 * reads them: `m = 2.0 kg  #val  # mass` → body, space, command, space, note.
 * (A command after the note's `#` is a command too, as it's taken.) Its body is
 * read by `body`: as it is, as an expression, or as a block's opener.
 */
function notedTokens(content: string, into: Part[], body: BodyReader = plainBody, noted = readNoted(content)): void {
  // (The first and last pieces of the body with something in them: spaces between two commands are a piece too.)
  const bodies = noted.pieces.filter((p) => p.kind === NOTED_PIECE.body && content.slice(p.start, p.end).trim())
  for (const p of noted.pieces) {
    const text = content.slice(p.start, p.end)
    if (p.kind === NOTED_PIECE.command) into.push(token(TOKEN_KIND.command, text))
    else if (p.kind === NOTED_PIECE.body) body(text, into, p === bodies[0], p === bodies.at(-1))
    else spaced(TOKEN_KIND.note, text, into)
  }
}

/** A raw block's opener, `@latex { \frac{a}{b} }`: its name, its `{`, then its text (on one line) all one token. */
function rawOpenerTokens(content: string, into: Part[]): void {
  const name = BLOCK_NAME.exec(content)?.[0] ?? ''
  if (name) into.push(token(TOKEN_KIND.blockName, name))
  const rest = content.slice(name.length)
  const at = rest.indexOf(BLOCK_OPEN)
  if (at < 0) return spaced(TOKEN_KIND.text, rest, into)
  spaced(TOKEN_KIND.space, rest.slice(0, at), into)
  into.push(token(TOKEN_KIND.blockOpen, BLOCK_OPEN))
  spaced(TOKEN_KIND.text, rest.slice(at + BLOCK_OPEN.length), into)
}

/** What each line read as a noted line says (its #commands and note), by its node, so a reader needn't read them again. */
const notedLines = new WeakMap<SyntaxNode, NotedLine>()

/** What a line read as a noted line says: its body, #commands and note (undefined for a line read another way). */
export const notedOf = (node: SyntaxNode): NotedLine | undefined => notedLines.get(node)

/** A line's content as tokens, read as its kind reads it (`noted`: its content read as a noted line, if it was already). */
function contentTokens(content: string, style: Content, into: Part[], noted?: NotedLine): void {
  if (style === CONTENT.whole) {
    into.push(token(TOKEN_KIND.text, content))
    return
  }
  if (style === CONTENT.text) {
    textTokens(content, into)
    return
  }
  if (style === CONTENT.rawOpener) {
    rawOpenerTokens(content, into)
    return
  }
  if (style === CONTENT.noted || style === CONTENT.expression || style === CONTENT.opener) {
    notedTokens(content, into, BODY_READER[style], noted)
    return
  }
  const marks = HEADING_MARKS.exec(content)![0]
  into.push(token(TOKEN_KIND.marks, marks))
  const rest = content.slice(marks.length)
  if (style === CONTENT.heading) {
    const lead = LEADING_SPACE.exec(rest)?.[0] ?? ''
    if (lead) into.push(token(TOKEN_KIND.space, lead))
    textTokens(rest.slice(lead.length), into)
  } else notedTokens(rest, into, openerBody)
}

/** How each kind of noted content's body is read. */
const BODY_READER: Record<typeof CONTENT.noted | typeof CONTENT.expression | typeof CONTENT.opener, BodyReader> = {
  [CONTENT.noted]: plainBody,
  [CONTENT.expression]: expressionBody,
  [CONTENT.opener]: openerBody,
}

/** What's in text that isn't plain text: inline maths (left as text), or a value (1: what's between its braces). */
const IN_TEXT = new RegExp(`${INLINE_MATHS.source}|${VALUE_IN_TEXT.source}`, 'g')

/**
 * Text as tokens, with each value in it, `{{V:4 to mL}}`, a value node: its
 * braces, and between them the expression's tokens (lexer.ts). A `{{` in
 * inline maths, `$…$`, is the maths's (as the reader fills values in).
 */
function textTokens(text: string, into: Part[]): void {
  let at = 0
  for (const m of text.matchAll(IN_TEXT)) {
    if (m.groups?.value === undefined) continue
    if (m.index > at) into.push(token(TOKEN_KIND.text, text.slice(at, m.index)))
    into.push(node(NODE_KIND.value, [
      token(TOKEN_KIND.delimiter, VALUE_BRACES.open), ...lexExpression(m.groups.value), token(TOKEN_KIND.delimiter, VALUE_BRACES.close),
    ]))
    at = m.index + m[0].length
  }
  if (at < text.length) into.push(token(TOKEN_KIND.text, text.slice(at)))
}

/** A line, read: its node, and what it opens, if anything. */
export interface ReadLine {
  readonly node: SyntaxNode
  readonly body?: Body
}

/** A line read into a node, in a context (not cached: see readLine). */
function parseLine(line: SourceLine, context: string): ReadLine {
  const [, indent, content, trailing] = EDGES.exec(line.text)!
  const parts: Part[] = []
  if (indent) parts.push(token(TOKEN_KIND.indent, indent))
  let kind: string
  let body: Body | undefined
  // (Read for its #commands and note once: for which kind of line it is, its tokens, and its reader.)
  let noted: NotedLine | undefined
  if (!content) kind = NODE_KIND.blank
  else if (isComment(content)) {
    kind = NODE_KIND.comment
    parts.push(token(TOKEN_KIND.comment, content))
  } else {
    const notedOnce = () => (noted ??= readNoted(content))
    const syntax = syntaxesIn(context).find((s) => s.matches(content, notedOnce))
    const info = contextInfo(context)
    kind = syntax?.kind ?? info.lineKind
    body = syntax?.opens
    const style = syntax?.content ?? info.content
    if (style === CONTENT.noted || style === CONTENT.expression || style === CONTENT.opener) notedOnce()
    contentTokens(content, style, parts, noted)
  }
  if (trailing) parts.push(token(TOKEN_KIND.space, trailing))
  if (line.eol) parts.push(token(TOKEN_KIND.eol, line.eol))
  const read = Object.freeze({ node: Object.freeze({ kind, parts: Object.freeze(parts) }), body })
  // (What the line says read as a noted line, its content whole, as its reader reads it: see reading/reader.ts Line.)
  if (noted) notedLines.set(read.node, noted)
  return read
}

/** A block's closing line, `}` with any note: read the same wherever it is. */
export function parseCloser(line: SourceLine): SyntaxNode {
  return readLine(line, CLOSER_CONTEXT).node
}

/** The context closing lines are cached under (not one a body can be in). */
const CLOSER_CONTEXT = 'closer'

// ---------------------------------------------------------------------------
// The cache
// ---------------------------------------------------------------------------

/**
 * How many lines' nodes are kept: plenty for the sheets open while editing
 * (a long one, with imported data, is a few thousand lines), and the least
 * recently read go first.
 */
export const LINE_CACHE_SIZE = 20_000

/** Between the parts of a cache key, a character a line can't have. */
const KEY_JOIN = '\u0000'

/** Lines read, by context, text and ending: least recently read first. */
const cache = new Map<string, ReadLine>()

/** A line read, the cached one if this line, in this context, has been read before. */
export function readLine(line: SourceLine, context: string): ReadLine {
  const key = [context, line.eol, line.text].join(KEY_JOIN)
  let read = cache.get(key)
  if (read) {
    // (Read again: now the most recently read.)
    cache.delete(key)
  } else {
    read = context === CLOSER_CONTEXT ? closerLine(line) : parseLine(line, context)
    if (cache.size >= LINE_CACHE_SIZE) cache.delete(cache.keys().next().value!)
  }
  cache.set(key, read)
  return read
}

/** A closing line, `}  # end`: its brace and any note, as tokens. */
function closerLine(line: SourceLine): ReadLine {
  const [, indent, content, trailing] = EDGES.exec(line.text)!
  const parts: Part[] = []
  if (indent) parts.push(token(TOKEN_KIND.indent, indent))
  const noted = readNoted(content)
  notedTokens(content, parts, plainBody, noted)
  if (trailing) parts.push(token(TOKEN_KIND.space, trailing))
  if (line.eol) parts.push(token(TOKEN_KIND.eol, line.eol))
  const read = Object.freeze({ node: Object.freeze({ kind: NODE_KIND.blockCloser, parts: Object.freeze(parts) }) })
  notedLines.set(read.node, noted)
  return read
}

/** Forget every line read (for tests). */
export const clearLineCache = () => cache.clear()
