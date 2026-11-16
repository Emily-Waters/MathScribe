/**
 * A sheet's text to its tree (encode), and back (decode): `decode(encode(text))`
 * is the text exactly, character for character, whatever it is (line endings,
 * tabs, trailing spaces, lines that don't read as anything are kept as they are).
 * A tree is plain data, so it goes through JSON (or an HTTP request) and back unchanged.
 */
import { SCHEMA, isToken, schemaId, type Part, type SheetTree, type SyntaxNode } from './nodes.ts'
import { LINE_CONTEXT, readLine, splitLines } from './lines.ts'
import { upgrade } from './migrations.ts'

/** A sheet's text as a tree, in the current schema. */
export function encode(source: string): SheetTree {
  return { schema: schemaId(SCHEMA.version), body: splitLines(source).map((line) => readLine(line, LINE_CONTEXT.sheet)) }
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
