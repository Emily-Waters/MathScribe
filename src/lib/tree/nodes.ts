/**
 * A sheet as a tree of nodes: what was written, every character of it, in a
 * shape every part of MathScribe (the engine, the editor, modules) reads the
 * same way. Plain data, so it goes through JSON unchanged.
 *
 *   SheetTree   { schema, body }       the sheet: its schema's version, and its lines
 *   SyntaxNode  { kind, parts }        a line (later, a block), its parts in order
 *   Token       { t, text }            a run of the source's characters, of one kind
 *
 * Every character belongs to exactly one token, so the text is the tokens
 * joined in order (decode): text → tree → text gives back the text exactly.
 * Nothing in the tree is worked out from the rest (a line's name, its settings):
 * code reads that from the parts, so the tree never disagrees with itself.
 *
 * Kinds are declared once (registry.ts): the core's here, a module's by the
 * module, so the whole schema can be listed (introspection) and checked.
 */

/** A run of the source's characters, of one kind: `{ t: 'indent', text: '    ' }`. */
export interface Token {
  readonly t: string
  readonly text: string
}

/** A node: a line (or later, a block, a call), its kind and its parts in order. */
export interface SyntaxNode {
  readonly kind: string
  readonly parts: readonly Part[]
}

/** What a node holds: tokens, and nodes within it. */
export type Part = Token | SyntaxNode

/** Whether a part is a token (rather than a node). */
export const isToken = (part: Part): part is Token => 't' in part

/**
 * The schema a tree is written in, by version: a tree from an older one is
 * brought up to date (migrations.ts) before it's read.
 */
export const SCHEMA = { name: 'mathscribe', version: 1 } as const

/** The schema's version as a tree carries it: `mathscribe/1`. */
export const schemaId = (version: number) => `${SCHEMA.name}/${version}`

/** A whole sheet: the schema it's in, and its lines. */
export interface SheetTree {
  readonly schema: string
  readonly body: readonly SyntaxNode[]
}

// ---------------------------------------------------------------------------
// The core's kinds (a module declares its own: see registry.ts)
// ---------------------------------------------------------------------------

/** The core's kinds of token. */
export const TOKEN_KIND = {
  /** The spaces and tabs a line starts with. */
  indent: 'indent',
  /** Spaces and tabs between parts, or after the last. */
  space: 'space',
  /** What ends a line: `\n`, `\r\n` or `\r` (none on the last line, unless the text ends with one). */
  eol: 'eol',
  /** Text not read into finer parts (yet). */
  text: 'text',
  /** A comment, `// …`, kept as written. */
  comment: 'comment',
} as const

/** The core's kinds of node. */
export const NODE_KIND = {
  /** A line with nothing on it but spaces. */
  blank: 'blank',
  /** A line that's a comment: `// check the units`. */
  comment: 'comment',
  /** A line whose content isn't read into parts yet: one `text` token. */
  line: 'line',
} as const
