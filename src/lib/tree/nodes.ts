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
  /** Text not read into finer parts: prose, raw LaTeX, a heading's title. */
  text: 'text',
  /** A comment, `// …`, kept as written. */
  comment: 'comment',
  /** What a line says, before its #commands and note: `m = 2.0 kg`, `Title {`. */
  body: 'body',
  /** A display command: `#val`, `#multiline`, `#sci`, `#center`. */
  command: 'command',
  /** A note: `# the mass`, to the end of the line. */
  note: 'note',
  /** A heading's `#`s. */
  marks: 'marks',
  /** Imported data's rows, as they are (indentation and line endings too). */
  rows: 'rows',

  // An expression's tokens (lexer.ts): mathjs's kinds, and MathScribe's.
  /** A number, as mathjs reads one: `2.00`, `1.2e-3`. */
  number: 'number',
  /** A name, as mathjs reads a symbol: `m`, `v_0`, `θ`. */
  symbol: 'symbol',
  /** A unit, after a number, `to`, or a name's `:` (`m/s^2`): mathjs's units. */
  unit: 'unit',
  /** An `@` name: a built-in constant or function, `@c`, `@chem.mm`. */
  builtin: 'builtin',
  /** A word with a meaning of its own: mathjs's named delimiters (`to`, `mod`, …) and MathScribe's keywords (`pm`, `return`, …). */
  keyword: 'keyword',
  /** An operator, a bracket or a separator, as mathjs's delimiters: `+`, `(`, `,`, `==`. */
  delimiter: 'delimiter',
  /** A label in quotes, as a mathjs string: `"Mass of {Na^+}"`. */
  string: 'string',
  /** A character nothing reads (mathjs would say what's wrong when it's worked out). */
  unknown: 'unknown',
} as const

/** The core's kinds of node: lines, and the nodes holding a line and its body. */
export const NODE_KIND = {
  /** A line with nothing on it but spaces. */
  blank: 'blank',
  /** A line that's a comment: `// check the units`. */
  comment: 'comment',
  /** A calculation, or anything else no other kind of line is: `m = 2.0 kg  #val`. */
  calc: 'calc',
  /** `# Title`: a heading. */
  heading: 'heading',
  /** `> Some prose`. */
  paragraph: 'paragraph',
  /** `@latex { \frac{a}{b} }`: raw LaTeX on one line. */
  latex: 'latex',
  /** `}`: the end of a block. */
  blockCloser: 'blockCloser',

  /** `Title {`: a block's opener (`# Title {` too). */
  blockOpener: 'blockOpener',
  /** A `{ }` block: its opener, its lines, and its `}`. */
  block: 'block',
  /** `@layout.list Title {`. */
  layoutOpener: 'layoutOpener',
  /** An `@layout` block: its opener, its lines, and its `}`. */
  layout: 'layout',
  /** `@layout.text Title {`, `@layout.titlepage {`: prose up to its `}`. */
  proseOpener: 'proseOpener',
  /** A line of prose in one. */
  proseLine: 'proseLine',
  /** A prose block: its opener, its lines, and its `}`. */
  prose: 'prose',
  /** `@latex {`: raw LaTeX up to a `}` on its own. */
  latexOpener: 'latexOpener',
  /** A line of raw LaTeX in one. */
  latexLine: 'latexLine',
  /** A raw LaTeX block: its opener, its lines, and its `}`. */
  latexBlock: 'latexBlock',
  /** `@constants {`. */
  constantsOpener: 'constantsOpener',
  /** A constant's line in one: `rho = 1000 kg/m^3`. */
  constantLine: 'constantLine',
  /** An `@constants` block: its opener, its lines, and its `}`. */
  constants: 'constants',
  /** `@import("run1.csv")`. */
  importLine: 'importLine',
  /** Imported data's rows, indented under it, as one node. */
  data: 'data',
  /** An import: its line, and its data. */
  import: 'import',

  // An expression's nodes (lexer.ts).
  /** A number (or a module's value, a vector) with its unit: `5.00 g`. */
  quantity: 'quantity',
  /** A call: what's called, and its arguments in brackets, `f(x)`, `@chem.mm({H2O})`. */
  call: 'call',
  /** A value in text, `{{V:4 to mL}}`: its braces, and the expression between them. */
  value: 'value',

  // What a line assigns to, before its `=` (lexer.ts: lexLine).
  /** A name, with its settings: `v:3:km/h`, `n_Na:"Moles of {Na^+}"`. */
  assigned: 'assigned',
  /** A one-line function's head, with settings for what it gives back: `f(x, y):3`. */
  functionHead: 'functionHead',
  /** The names a tuple is unpacked into, each with its settings: `@tuple(r:3, theta:deg)`. */
  unpack: 'unpack',
} as const

/** The core's contexts: what a line can be inside, which decides how it's read. */
export const LINE_CONTEXT = {
  /** The sheet, or a `{ }` or `@layout` block in it. */
  sheet: 'sheet',
  /** An `@layout.text` or `@layout.titlepage` block. */
  prose: 'prose',
  /** An `@latex { }` block. */
  latex: 'latex',
  /** An `@constants { }` block. */
  constants: 'constants',
  /** Imported data's rows. */
  data: 'data',
} as const
