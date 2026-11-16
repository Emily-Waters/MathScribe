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

/** Every kind of node declared, in the order they were. */
export const declaredNodeKinds = (): readonly KindInfo[] => [...nodeKinds.values()]

/** Every kind of token declared, in the order they were. */
export const declaredTokenKinds = (): readonly KindInfo[] => [...tokenKinds.values()]

/** Whether a kind of node, or of token, is declared. */
export const isNodeKind = (kind: string) => nodeKinds.has(kind)
export const isTokenKind = (kind: string) => tokenKinds.has(kind)

// The core's own.
declareNodeKinds(CORE_OWNER, {
  [NODE_KIND.blank]: 'A line with nothing on it but spaces',
  [NODE_KIND.comment]: 'A comment line, // …, never shown or worked out',
  [NODE_KIND.line]: 'A line whose content isn’t read into parts yet',
})
declareTokenKinds(CORE_OWNER, {
  [TOKEN_KIND.indent]: 'The spaces and tabs a line starts with',
  [TOKEN_KIND.space]: 'Spaces and tabs between parts, or after the last',
  [TOKEN_KIND.eol]: 'What ends a line: \\n, \\r\\n or \\r',
  [TOKEN_KIND.text]: 'Text not read into finer parts',
  [TOKEN_KIND.comment]: 'A comment, // …',
})
