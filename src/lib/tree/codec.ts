/**
 * A sheet's text to its tree (encode), and back (decode): `decode(encode(text))`
 * is the text exactly, character for character, whatever it is (line endings,
 * tabs, trailing spaces, lines that don't read as anything are kept as they are).
 * A tree is plain data, so it goes through JSON (or an HTTP request) and back unchanged.
 *
 * The tree's top level is the sheet's lines; a line that opens a body
 * (`Title {`, `def f(x)`, `@import(…)`) is a node holding the line, the lines of
 * its body (blocks inside it as nodes of their own), and its closing line.
 */
import { BLOCK_CLOSE, closesLatex, indentOf } from '../syntax.ts'
import { BODY_END, contextInfo, type Body } from './grammar.ts'
import { LINE_CONTEXT, NODE_KIND, SCHEMA, TOKEN_KIND, isToken, schemaId, type Part, type SheetTree, type SyntaxNode } from './nodes.ts'
import { parseCloser, readLine, splitLines, type SourceLine } from './lines.ts'
import { upgrade } from './migrations.ts'
import './core.ts'

/** A sheet's text as a tree, in the current schema. */
export function encode(source: string): SheetTree {
  const reader = { lines: splitLines(source), at: 0 }
  return { schema: schemaId(SCHEMA.version), body: readBody(reader, LINE_CONTEXT.sheet) }
}

/** The lines being read, and the next one. */
interface Reader {
  readonly lines: readonly SourceLine[]
  at: number
}

/** How a body being read ends, and the line that opened it's indentation. */
interface Ending {
  readonly ends: Body['ends']
  readonly indent: number
}

/** Whether a line (blank or not) ends a body before it: one that isn't indented further, for a body that ends so. */
function endsBefore(line: SourceLine, ending: Ending): boolean {
  const blank = !line.text.trim()
  if (ending.ends === BODY_END.indent) return blank || indentOf(line.text) <= ending.indent
  if (ending.ends === BODY_END.indentOrBlank) return !blank && indentOf(line.text) <= ending.indent
  return false
}

/** Whether a line is a body's closing line, which ends it (and is its). */
function closes(line: SourceLine, ending: Ending): boolean {
  if (ending.ends === BODY_END.brace) return line.text.trimStart().startsWith(BLOCK_CLOSE)
  if (ending.ends === BODY_END.braceAlone) return closesLatex(line.text)
  return false
}

/**
 * Lines read into nodes, in a context, until the body they're in ends (or the
 * text does); a closing line it ends at is left for the caller.
 */
function readBody(reader: Reader, context: string, ending?: Ending): SyntaxNode[] {
  const nodes: SyntaxNode[] = []
  const { lines } = reader
  // Lines kept as they are, as one node (imported data's rows).
  if (contextInfo(context).raw) {
    const start = reader.at
    while (reader.at < lines.length && !(ending && endsBefore(lines[reader.at], ending))) reader.at++
    if (reader.at > start) {
      const text = lines.slice(start, reader.at).map((l) => l.text + l.eol).join('')
      nodes.push(Object.freeze({ kind: contextInfo(context).lineKind, parts: Object.freeze([Object.freeze({ t: TOKEN_KIND.rows, text })]) }))
    }
    return nodes
  }
  while (reader.at < lines.length) {
    const line = lines[reader.at]
    if (ending && (endsBefore(line, ending) || closes(line, ending))) break
    const { node, body } = readLine(line, context)
    // A `}` of its own ends the block it's in (one at the top, with none open, is just a line).
    if (ending?.ends === BODY_END.closer && node.kind === NODE_KIND.blockCloser) break
    reader.at++
    nodes.push(body ? readOpened(reader, node, body, indentOf(line.text)) : node)
  }
  return nodes
}

/** The node holding a line that opens a body: the line, its body, and its closing line if it has one. */
function readOpened(reader: Reader, opener: SyntaxNode, body: Body, indent: number): SyntaxNode {
  const ending = { ends: body.ends, indent }
  const parts: Part[] = [opener, ...readBody(reader, body.context, ending)]
  const next = reader.lines[reader.at]
  if (next && (closes(next, ending) || (body.ends === BODY_END.closer && readLine(next, body.context).node.kind === NODE_KIND.blockCloser))) {
    parts.push(parseCloser(next))
    reader.at++
  }
  return Object.freeze({ kind: body.node, parts: Object.freeze(parts) })
}

/**
 * Each node's text, kept by the node: nodes are frozen and shared between trees
 * (see lines.ts), so an unchanged line's text is joined once.
 */
const texts = new WeakMap<SyntaxNode, string>()

/** A part's text: a token's own, or a node's parts joined. */
export function textOf(part: Part): string {
  if (isToken(part)) return part.text
  let text = texts.get(part)
  if (text === undefined) {
    text = part.parts.map(textOf).join('')
    // (Only frozen nodes are kept: a node made elsewhere, from JSON, may still change.)
    if (Object.isFrozen(part)) texts.set(part, text)
  }
  return text
}

/** A tree's text, exactly as it was encoded from (a tree in an older schema is brought up to date first). */
export function decode(tree: SheetTree): string {
  return upgrade(tree).body.map(textOf).join('')
}
