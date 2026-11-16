/**
 * A sheet's lines, each read into a node. A line is read the same way wherever
 * it is, given its context (what it's inside: the sheet, prose, raw LaTeX,
 * imported data), so a line's node depends only on its text and its context:
 * that's what's cached, and an edit reads again only the lines it changed.
 *
 * Nodes are frozen, so one node can stand for the same line in every tree it's
 * in (a sheet read again after an edit shares every unchanged line's node), and
 * anything worked out from a node can be kept by the node itself (a WeakMap):
 * its text (codec.ts), and later its evaluation.
 */
import { isComment } from '../syntax.ts'
import { NODE_KIND, TOKEN_KIND, type Part, type SyntaxNode, type Token } from './nodes.ts'

/** What a line is inside, which decides how it's read. (More come with blocks: prose, raw LaTeX, imported data.) */
export const LINE_CONTEXT = { sheet: 'sheet' } as const
export type LineContext = (typeof LINE_CONTEXT)[keyof typeof LINE_CONTEXT]

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

const token = (t: string, text: string): Token => Object.freeze({ t, text })

/** A line read into a node (not cached: see readLine). */
function parseLine(line: SourceLine, _context: LineContext): SyntaxNode {
  const [, indent, content, trailing] = EDGES.exec(line.text)!
  const parts: Part[] = []
  if (indent) parts.push(token(TOKEN_KIND.indent, indent))
  let kind: string = NODE_KIND.line
  if (!content) kind = NODE_KIND.blank
  else if (isComment(content)) {
    kind = NODE_KIND.comment
    parts.push(token(TOKEN_KIND.comment, content))
  } else parts.push(token(TOKEN_KIND.text, content))
  if (trailing) parts.push(token(TOKEN_KIND.space, trailing))
  if (line.eol) parts.push(token(TOKEN_KIND.eol, line.eol))
  return Object.freeze({ kind, parts: Object.freeze(parts) })
}

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
const cache = new Map<string, SyntaxNode>()

/** A line read into a node, the cached one if this line, in this context, has been read before. */
export function readLine(line: SourceLine, context: LineContext): SyntaxNode {
  const key = [context, line.eol, line.text].join(KEY_JOIN)
  let node = cache.get(key)
  if (node) {
    // (Read again: now the most recently read.)
    cache.delete(key)
  } else {
    node = parseLine(line, context)
    if (cache.size >= LINE_CACHE_SIZE) cache.delete(cache.keys().next().value!)
  }
  cache.set(key, node)
  return node
}

/** Forget every line read (for tests). */
export const clearLineCache = () => cache.clear()
