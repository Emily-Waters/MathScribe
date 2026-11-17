/**
 * Every kind of node and token, declared once, with what it is and who owns it:
 * the core's, and each module's (a module declares its own kinds, as GraphQL's
 * `extend type` adds to one schema). A kind is declared once: two owners
 * declaring the same kind is an error, so modules can't clash.
 *
 * What's declared can be listed (introspection): the editor, the docs and a
 * JSON Schema for checking trees from elsewhere are all made from it.
 */
import { NODE_KIND, TOKEN_KIND } from './nodes.ts'
import { words, type WordOf } from '../syntax/patterns.ts'

/** Who declared a kind: the core, or a module by name. */
export const CORE_OWNER = 'core'

/** A declared kind: its name, what it is, and who declared it. */
export interface KindInfo {
  readonly kind: string
  readonly description: string
  readonly owner: string
}

/** The kinds declared so far, by name. */
const nodeKinds = new Map<string, KindInfo>()
const tokenKinds = new Map<string, KindInfo>()

function declare(into: Map<string, KindInfo>, what: string, owner: string, kinds: Record<string, string>): void {
  for (const [kind, description] of Object.entries(kinds)) {
    const other = into.get(kind)
    if (other && other.owner !== owner) throw new Error(`The ${what} kind "${kind}" is ${other.owner}'s already, so ${owner} can't declare it too.`)
    into.set(kind, { kind, description, owner })
  }
}

/** Declare kinds of node, each with what it is: `{ speciesBlock: 'Names for species, …' }`. */
export const declareNodeKinds = (owner: string, kinds: Record<string, string>) => declare(nodeKinds, 'node', owner, kinds)

/** Declare kinds of token, each with what it is. */
export const declareTokenKinds = (owner: string, kinds: Record<string, string>) => declare(tokenKinds, 'token', owner, kinds)

/**
 * What a module's kind of token is, among the sorts of thing a sheet says
 * (so the editor, or anything else reading a tree, can treat it as one): a
 * formula (`{H2O}`), or text that's words rather than maths (a plot's settings).
 */
export const TOKEN_ROLE = words({ formula: 'formula', text: 'text' })
export type TokenRole = WordOf<typeof TOKEN_ROLE>

/** The role of each module's kind of token that has one. */
const tokenRoles = new Map<string, TokenRole>()

/** Declare what a module's kinds of token are (TOKEN_ROLE). */
export function declareTokenRoles(roles: Readonly<Record<string, TokenRole>>): void {
  for (const [kind, role] of Object.entries(roles)) tokenRoles.set(kind, role)
}

/** What a kind of token is, if it's a module's with a role declared. */
export const tokenRoleOf = (kind: string): TokenRole | undefined => tokenRoles.get(kind)

/** Every kind of node declared, in the order they were. */
export const declaredNodeKinds = (): readonly KindInfo[] => [...nodeKinds.values()]

/** Every kind of token declared, in the order they were. */
export const declaredTokenKinds = (): readonly KindInfo[] => [...tokenKinds.values()]

/** Whether a kind of node, or of token, is declared. */
export const isNodeKind = (kind: string) => nodeKinds.has(kind)
export const isTokenKind = (kind: string) => tokenKinds.has(kind)

// The core's own (every one described: TypeScript checks none is left out).
declareNodeKinds(CORE_OWNER, {
  [NODE_KIND.blank]: 'A line with nothing on it but spaces',
  [NODE_KIND.comment]: 'A comment line, // …, never shown or worked out',
  [NODE_KIND.calc]: 'A calculation: m = 2.0 kg, with any #commands and note',
  [NODE_KIND.heading]: 'A heading: # Title, ## Title, ### Title',
  [NODE_KIND.paragraph]: 'A paragraph of prose: > Some prose',
  [NODE_KIND.latex]: 'Raw LaTeX on one line: @latex { \\frac{a}{b} }',
  [NODE_KIND.blockCloser]: 'The end of a block: }',
  [NODE_KIND.blockOpener]: 'A block’s opener: Title {, or # Title { for one titled as a section',
  [NODE_KIND.block]: 'A { } block: its opener, its lines, and its }',
  [NODE_KIND.layoutOpener]: 'An @layout block’s opener: @layout.list Title {',
  [NODE_KIND.layout]: 'An @layout block: its opener, its lines, and its }',
  [NODE_KIND.proseOpener]: 'A prose block’s opener: @layout.text Title {, @layout.titlepage {',
  [NODE_KIND.proseLine]: 'A line of prose in a prose block',
  [NODE_KIND.prose]: 'A prose block: its opener, its lines, and its }',
  [NODE_KIND.latexOpener]: 'A raw LaTeX block’s opener: @latex {',
  [NODE_KIND.latexLine]: 'A line of raw LaTeX in a raw LaTeX block',
  [NODE_KIND.latexBlock]: 'A raw LaTeX block: its opener, its lines, and its } on its own',
  [NODE_KIND.constantsOpener]: 'An @constants block’s opener: @constants {',
  [NODE_KIND.constantLine]: 'A constant in an @constants block: rho = 1000 kg/m^3',
  [NODE_KIND.constants]: 'An @constants block: its opener, its constants, and its }',
  [NODE_KIND.importLine]: 'An import line: @import("run1.csv")',
  [NODE_KIND.data]: 'Imported data’s rows, as one node',
  [NODE_KIND.import]: 'An import: its line, and its data',
  [NODE_KIND.quantity]: 'A number (or a module’s value, a vector) with its unit: 5.00 g',
  [NODE_KIND.call]: 'A call: what’s called, and its arguments in brackets, f(x), @chem.substance({H2O})',
  [NODE_KIND.value]: 'A value in text: its braces, and the expression between them, {{V:4 to mL}}',
  [NODE_KIND.assigned]: 'The name a line assigns, with its settings, before its =: v:3:km/h',
  [NODE_KIND.functionHead]: 'A one-line function’s head, with settings for what it gives back, before its =: f(x, y):3',
  [NODE_KIND.unpack]: 'The names a tuple is unpacked into, each with its settings, before its =: @tuple(r:3, theta:deg)',
} satisfies Record<(typeof NODE_KIND)[keyof typeof NODE_KIND], string>)
declareTokenKinds(CORE_OWNER, {
  [TOKEN_KIND.indent]: 'The spaces and tabs a line starts with',
  [TOKEN_KIND.space]: 'Spaces and tabs between parts, or after the last',
  [TOKEN_KIND.eol]: 'What ends a line: \\n, \\r\\n or \\r',
  [TOKEN_KIND.text]: 'Text not read into finer parts: prose, raw LaTeX, a heading’s title',
  [TOKEN_KIND.comment]: 'A comment, // …',
  [TOKEN_KIND.body]: 'What a line says, before its #commands and note',
  [TOKEN_KIND.command]: 'A display command: #val, #multiline, #sci, #center',
  [TOKEN_KIND.note]: 'A note, # …, to the end of the line',
  [TOKEN_KIND.marks]: 'A heading’s #s',
  [TOKEN_KIND.marker]: 'A paragraph’s >',
  [TOKEN_KIND.maths]: 'Inline maths in text, $x^2$, dollars and all',
  [TOKEN_KIND.blockName]: 'A block’s @ name, at the start of its opener: @layout.list.val, @constants, @latex',
  [TOKEN_KIND.title]: 'A block’s title, in its opener: Steps in @layout.numbered Steps {',
  [TOKEN_KIND.blockOpen]: 'A block’s opening brace, ending its opener',
  [TOKEN_KIND.rows]: 'Imported data’s rows, as they are',
  [TOKEN_KIND.number]: 'A number, as mathjs reads one: 2.00, 1.2e-3',
  [TOKEN_KIND.symbol]: 'A name, as mathjs reads a symbol: m, v_0, θ',
  [TOKEN_KIND.unit]: 'A unit after a number, to, or a name’s : (m/s^2): mathjs’s units',
  [TOKEN_KIND.builtin]: 'An @ name: a built-in constant or function, @c, @chem.substance',
  [TOKEN_KIND.keyword]: 'A word with a meaning of its own: mathjs’s named delimiters (to, mod, …) and MathScribe’s keywords (pm, return, …)',
  [TOKEN_KIND.delimiter]: 'An operator, a bracket or a separator, as mathjs’s delimiters: +, (, ,, ==',
  [TOKEN_KIND.string]: 'A label in quotes, as a mathjs string: "Mass of {Na^+}"',
  [TOKEN_KIND.unknown]: 'A character nothing reads',
} satisfies Record<(typeof TOKEN_KIND)[keyof typeof TOKEN_KIND], string>)
