/**
 * A sheet's text to its tree (encode), and back (decode): `decode(encode(text))`
 * is the text exactly, character for character, whatever it is (line endings,
 * tabs, trailing spaces, lines that don't read as anything are kept as they are).
 * A tree is plain data, so it goes through JSON (or an HTTP request) and back unchanged.
 *
 * The tree's top level is the sheet's lines; a line that opens a body
 * (`Title {`, `def f(x)`, `@import(…)`) is a node holding the line, the lines of
 * its body (blocks inside it as nodes of their own), and its closing line. It's
 * built from the sheet's lines read one at a time (stream.ts), as the editor reads them.
 */
import { contextInfo } from './grammar.ts'
import { SCHEMA, TOKEN_KIND, isToken, schemaId, type Part, type SheetTree, type SyntaxNode } from './nodes.ts'
import { splitLines } from './lines.ts'
import { LINE_ROLE, TOP, stepLine } from './stream.ts'
import { upgrade } from './migrations.ts'
import './core.ts'

/** A node being built: its kind (none: the sheet's top), its parts so far, and rows being gathered. */
interface Builder {
  readonly kind?: string
  readonly parts: Part[]
  rows?: { kind: string; text: string }
}

/** A sheet's text as a tree, in the current schema. */
export function encode(source: string): SheetTree {
  const open: Builder[] = [{ parts: [] }]
  let state = TOP
  /** The innermost node being built: its rows gathered into one node, and it's done. */
  const finish = () => {
    const builder = open.pop()!
    flushRows(builder)
    open.at(-1)!.parts.push(Object.freeze({ kind: builder.kind!, parts: Object.freeze(builder.parts) }))
  }
  for (const line of splitLines(source)) {
    const step = stepLine(state, line)
    // (A body that ended before this line, where the indentation did: one builder each.)
    step.ended.forEach(() => finish())
    const top = open.at(-1)!
    if (step.role === LINE_ROLE.row) {
      // (Rows are gathered into one node: its text is theirs, one token.)
      top.rows ??= { kind: contextInfo(step.context).lineKind, text: '' }
      top.rows.text += textOf(step.node)
    } else {
      flushRows(top)
      // (An opener is the first part of the node it opens; a closer, the last of the one it closes.)
      if (step.role === LINE_ROLE.opener) open.push({ kind: step.body!.node, parts: [step.node] })
      else top.parts.push(step.node)
      if (step.role === LINE_ROLE.closer) finish()
    }
    state = step.state
  }
  // Bodies still open at the end (not closed, or running to it).
  while (open.length > 1) finish()
  flushRows(open[0])
  return { schema: schemaId(SCHEMA.version), body: open[0].parts as SyntaxNode[] }
}

/** Rows gathered in a node being built, as one node in its parts. */
function flushRows(builder: Builder): void {
  if (!builder.rows) return
  const { kind, text } = builder.rows
  builder.parts.push(Object.freeze({ kind, parts: Object.freeze([Object.freeze({ t: TOKEN_KIND.rows, text })]) }))
  builder.rows = undefined
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
