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
  BLOCK_NAME, BLOCK_OPEN, INLINE_MATHS, MATHS_MARK, NOTED_PIECE, PARAGRAPH_MARK, VALUE_BRACES, VALUE_IN_TEXT, isComment, readNoted, regex,
  type NotedLine,
} from '../syntax.ts'
import { CONTENT, contextInfo, syntaxesIn, type Body, type Content } from './grammar.ts'
import { HEADING_MARKS } from './core.ts'
import { closesBracket, isTokenOf, lexExpression, lexTail, node, openBrackets, opensBracket } from './lexer.ts'
import { ROW_SEPARATOR, SEPARATOR, lexLine, lineShape } from './shapes.ts'
import { NODE_KIND, TOKEN_KIND, isToken, type Part, type SyntaxNode, type Token } from './nodes.ts'

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
 * for what a line says when it's an expression, as the expression's tokens, as
 * `lex` reads them (lexer.ts).
 */
function spaced(t: string, text: string, into: Part[], lex?: (text: string) => readonly Part[]): void {
  const lead = LEADING_SPACE.exec(text)?.[0] ?? ''
  const trail = text.length > lead.length ? TRAILING_SPACE.exec(text)?.[0] ?? '' : ''
  const middle = text.slice(lead.length, text.length - trail.length)
  if (lead) into.push(token(TOKEN_KIND.space, lead))
  if (middle) {
    if (lex && t === TOKEN_KIND.body) into.push(...lex(middle))
    else into.push(token(t, middle))
  }
  if (trail) into.push(token(TOKEN_KIND.space, trail))
}

/** How a noted line's body (each of its pieces, between #commands) is read into tokens. */
type BodyReader = (text: string, into: Part[], first: boolean, last: boolean) => void

/** A body as it is: one token. */
const plainBody: BodyReader = (text, into) => spaced(TOKEN_KIND.body, text, into)

/** A body that's an expression: its tokens, with what it assigns to (shapes.ts). */
const expressionBody: BodyReader = (text, into) => spaced(TOKEN_KIND.body, text, into, lexLine)

/** A body carrying on an expression: its tokens as they are (lexer.ts), not read for what it assigns. */
const continuationBody: BodyReader = (text, into) => spaced(TOKEN_KIND.body, text, into, lexExpression)

/** A body carrying on an expression, with what it's said so far: its tokens as the rest of it (lexTail). */
const tailBody = (said: string): BodyReader => (text, into) => spaced(TOKEN_KIND.body, text, into, (t) => lexTail(said, t))

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

/**
 * A line's content as tokens, read as its kind reads it (`noted`: its content
 * read as a noted line, if it was already; `said`: for a continuation line,
 * what the line it carries on has said so far).
 */
function contentTokens(content: string, style: Content, into: Part[], noted?: NotedLine, bodyToken?: string, said?: string): void {
  if (style === CONTENT.whole) {
    into.push(token(TOKEN_KIND.text, content))
    return
  }
  if (style === CONTENT.text) {
    textTokens(content, into)
    return
  }
  if (style === CONTENT.paragraph) {
    paragraphTokens(content, into)
    return
  }
  if (style === CONTENT.rawOpener) {
    rawOpenerTokens(content, into)
    return
  }
  if (isNoted(style)) {
    // (A line whose body is a token of its own kind, a reaction's formula, has it as that.)
    const body: BodyReader = bodyToken && style === CONTENT.noted ? (text, parts) => spaced(bodyToken, text, parts)
      : said !== undefined && style === CONTENT.continuation ? tailBody(said)
        : BODY_READER[style]
    notedTokens(content, into, body, noted)
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
const BODY_READER = {
  [CONTENT.noted]: plainBody,
  [CONTENT.expression]: expressionBody,
  [CONTENT.continuation]: continuationBody,
  [CONTENT.opener]: openerBody,
} as const satisfies Partial<Record<Content, BodyReader>>

/** The kinds of content read as a noted line: a body, then #commands and a note. */
type NotedContent = keyof typeof BODY_READER
const isNoted = (style: Content): style is NotedContent => style in BODY_READER

/** The kinds of content whose body is an expression: whatever brackets it leaves open carry it on over the lines after it. */
const EXPRESSION_CONTENT: ReadonlySet<Content> = new Set([CONTENT.expression, CONTENT.continuation])

/** A module's rule for markup in text (chemistry's formulas, `{Na^+}`): what it reads at a position, if anything. */
export interface TextRule {
  /** What it reads, for the schema's listing. */
  readonly describes: string
  /** The characters what it reads can start with: it's tried only at one of them. */
  readonly starts: string
  read(pos: number, text: string): { parts: Part[]; length: number } | undefined
}

/** The modules' rules for text, by who declared them, tried after inline maths and values. */
const textRules: { owner: string; rule: TextRule }[] = []

/** Declare a module's rules for markup in text (lines read before are read again). */
export function declareTextRules(owner: string, declared: readonly TextRule[]): void {
  textRules.push(...declared.map((rule) => ({ owner, rule })))
  clearLineCache()
}

/** Every text rule declared, with its owner (for the schema's listing). */
export const declaredTextRules = () => textRules.map(({ owner, rule }) => ({ owner, describes: rule.describes }))

/** Inline maths at a position. */
const MATHS_AT = regex(INLINE_MATHS, 'y')
/** A value at a position. */
const VALUE_AT = regex(VALUE_IN_TEXT, 'y')

/** The markup in text at a position, as tokens: inline maths, a value, or a module's (a formula); undefined if there's none. */
function markupAt(text: string, pos: number): { parts: Part[]; length: number } | undefined {
  const c = text[pos]
  if (c === MATHS_MARK) {
    MATHS_AT.lastIndex = pos
    const m = MATHS_AT.exec(text)
    if (m) return { parts: [token(TOKEN_KIND.maths, m[0])], length: m[0].length }
  }
  if (text.startsWith(VALUE_BRACES.open, pos)) {
    VALUE_AT.lastIndex = pos
    const m = VALUE_AT.exec(text)
    if (m) {
      const value = node(NODE_KIND.value, [
        token(TOKEN_KIND.delimiter, VALUE_BRACES.open), ...lexExpression(m.groups!.value), token(TOKEN_KIND.delimiter, VALUE_BRACES.close),
      ])
      return { parts: [value], length: m[0].length }
    }
  }
  for (const { rule } of textRules) {
    if (!rule.starts.includes(c)) continue
    const read = rule.read(pos, text)
    if (read) return read
  }
  return undefined
}

/**
 * Text as tokens: plain text, and its markup: inline maths, `$x^2$` (a `{{` in
 * it is the maths's, as the reader fills values in); each value, `{{V:4 to mL}}`,
 * a value node (its braces, and between them the expression's tokens, lexer.ts);
 * and a module's (chemistry's formulas, `{Na^+}`).
 */
function textTokens(text: string, into: Part[]): void {
  let plainFrom = 0
  const plainTo = (end: number) => {
    if (end > plainFrom) into.push(token(TOKEN_KIND.text, text.slice(plainFrom, end)))
  }
  for (let pos = 0; pos < text.length;) {
    const read = markupAt(text, pos)
    if (!read) {
      pos++
      continue
    }
    plainTo(pos)
    into.push(...read.parts)
    pos += read.length
    plainFrom = pos
  }
  plainTo(text.length)
}

/** A paragraph, `> words`: its `>`, then its text. */
function paragraphTokens(content: string, into: Part[]): void {
  into.push(token(TOKEN_KIND.marker, PARAGRAPH_MARK))
  const rest = content.slice(PARAGRAPH_MARK.length)
  const lead = LEADING_SPACE.exec(rest)?.[0] ?? ''
  if (lead) into.push(token(TOKEN_KIND.space, lead))
  textTokens(rest.slice(lead.length), into)
}

/** A line, read: its node, and what it opens, if anything. */
export interface ReadLine {
  readonly node: SyntaxNode
  readonly body?: Body
  /**
   * For a line that's an expression, how many round and square brackets it
   * leaves open (fewer than 0: how many more it closes than it opens). Open
   * ones carry the line on over the lines after it (stream.ts).
   */
  readonly brackets?: number
}

/** A line read into a node, in a context, after what's been said before it if it carries a line on (not cached: see readLine). */
function parseLine(line: SourceLine, context: string, said?: string): ReadLine {
  const [, indent, content, trailing] = EDGES.exec(line.text)!
  const parts: Part[] = []
  if (indent) parts.push(token(TOKEN_KIND.indent, indent))
  let kind: string
  let body: Body | undefined
  let brackets: number | undefined
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
    if (isNoted(style)) notedOnce()
    const start = parts.length
    contentTokens(content, style, parts, noted, syntax?.bodyToken, said)
    if (EXPRESSION_CONTENT.has(style)) brackets = openBrackets(parts.slice(start)) || undefined
  }
  if (trailing) parts.push(token(TOKEN_KIND.space, trailing))
  if (line.eol) parts.push(token(TOKEN_KIND.eol, line.eol))
  const read = Object.freeze({ node: Object.freeze({ kind, parts: Object.freeze(parts) }), body, brackets })
  // (What the line says read as a noted line, its content whole, as its reader reads it: see reading/reader.ts Line.)
  if (noted) notedLines.set(read.node, noted)
  return read
}

/** The kinds of token after what a line says: its #commands, its note, the spaces between them, and its ending. */
const AFTER_SAID: ReadonlySet<string> = new Set([TOKEN_KIND.space, TOKEN_KIND.command, TOKEN_KIND.note, TOKEN_KIND.eol])

/**
 * Where in a line's parts the `,` is that what it says ends with (before any
 * #commands and note), or -1: `5678,` in a call carried on over several lines,
 * which a trailing comma before its `)` is allowed in.
 */
export function trailingSeparatorAt(line: SyntaxNode): number {
  for (let i = line.parts.length - 1; i >= 0; i--) {
    const p = line.parts[i]
    if (isToken(p) && AFTER_SAID.has(p.t)) continue
    return isTokenOf(p, TOKEN_KIND.delimiter, SEPARATOR) ? i : -1
  }
  return -1
}

/** The last token said in parts, at any depth (before any #commands and note); undefined if nothing's said. */
function lastSaid(parts: readonly Part[]): Token | undefined {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    if (!isToken(p)) {
      const said = lastSaid(p.parts)
      if (said) return said
    } else if (!AFTER_SAID.has(p.t) && p.t !== TOKEN_KIND.indent) return p
  }
  return undefined
}

/** The first token in parts after the line's indentation and spaces, at any depth (a #command or note too). */
function firstToken(parts: readonly Part[]): Token | undefined {
  for (const p of parts) {
    if (!isToken(p)) {
      const first = firstToken(p.parts)
      if (first) return first
    } else if (p.t !== TOKEN_KIND.indent && p.t !== TOKEN_KIND.space) return p
  }
  return undefined
}

/**
 * Whether a line starts by closing a bracket, as its tokens say: its first token
 * after its indentation is one (`#val )` doesn't; nor does a `]` in a module's
 * settings, one token).
 */
export function startsClosing(line: SyntaxNode): boolean {
  const first = firstToken(line.parts)
  return first?.t === TOKEN_KIND.delimiter && closesBracket(first.text)
}

/**
 * Whether what a line says ends expecting more: an open bracket, or a `,` or
 * `;` (`Fs = @series(`, `1234,`); undefined if it says nothing (a note alone).
 */
export function endsExpecting(line: SyntaxNode): boolean | undefined {
  const said = lastSaid(line.parts)
  if (!said) return undefined
  return said.t === TOKEN_KIND.delimiter && (opensBracket(said.text) || said.text === SEPARATOR || said.text === ROW_SEPARATOR)
}

/**
 * Whether a line, in a context, would be read as a line of its own: a kind of
 * line there (a `}`, a heading, a block's opener), or one assigning a name
 * (`y = 2`). A comment, or a value (`0.231 N,`), wouldn't.
 */
export function standsAlone(text: string, context: string): boolean {
  const trimmed = text.trim()
  if (isComment(trimmed)) return false
  let noted: NotedLine | undefined
  const split = () => (noted ??= readNoted(trimmed))
  return syntaxesIn(context).some((s) => s.matches(trimmed, split)) || lineShape(split().body).target !== undefined
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

/** Lines read, by context, what's been said before (a continuation line's), text and ending: least recently read first. */
const cache = new Map<string, ReadLine>()

/**
 * A line read, the cached one if this line, in this context, has been read
 * before. `said`: for a line carrying on a continued line, what it's said so
 * far, which the line is read as the rest of (lexer.ts lexTail).
 */
export function readLine(line: SourceLine, context: string, said?: string): ReadLine {
  const key = [context, said ?? '', line.eol, line.text].join(KEY_JOIN)
  let read = cache.get(key)
  if (read) {
    // (Read again: now the most recently read.)
    cache.delete(key)
  } else {
    read = context === CLOSER_CONTEXT ? closerLine(line) : parseLine(line, context, said)
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
