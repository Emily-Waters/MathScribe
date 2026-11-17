/**
 * The schema, described: what's declared (the core's kinds and every installed
 * module's), as a listing for the editor and docs (introspect), and as a JSON
 * Schema (jsonSchema) for anything outside MathScribe that sends or receives a
 * tree: a server, an AI writing a sheet, another tool. Both are made from the
 * registry and the grammar, so they're never out of date with what's read.
 *
 * (A module's kinds are declared when it's installed, so the engine is loaded
 * first: src/lib/engine/index.ts installs MathScribe's modules.)
 */
import { declaredContexts, declaredLineSyntaxes, type Body, type ContextInfo } from './grammar.ts'
import { SCHEMA, schemaId } from './nodes.ts'
import { declaredNodeKinds, declaredTokenKinds, type KindInfo } from './registry.ts'
import { declaredLexRules } from './lexer.ts'
import { declaredTextRules } from './lines.ts'
import { NODE_FIELDS, TOKEN_FIELDS, TREE_FIELDS } from './check.ts'

/** A kind of line, as the schema lists it: where it can be, and what it opens. */
export interface SyntaxInfo {
  readonly kind: string
  readonly owner: string
  readonly contexts: readonly string[]
  readonly opens?: Body
}

/** Everything declared, plain data. */
export interface SchemaListing {
  readonly schema: string
  readonly nodeKinds: readonly KindInfo[]
  readonly tokenKinds: readonly KindInfo[]
  readonly contexts: readonly ContextInfo[]
  /** The kinds of line, in the order a line is offered them. */
  readonly lineSyntaxes: readonly SyntaxInfo[]
  /** How an expression is read into tokens (lexer.ts): each rule, whose, in the order it's tried. */
  readonly lexRules: readonly { readonly owner: string; readonly describes: string }[]
  /** How text's markup is read into tokens besides inline maths and values (lines.ts): each module's rule. */
  readonly textRules: readonly { readonly owner: string; readonly describes: string }[]
}

/** Everything the schema declares: its kinds (with what each is and whose), its contexts, its kinds of line, and its lexer's rules. */
export function introspect(): SchemaListing {
  return {
    schema: schemaId(SCHEMA.version),
    nodeKinds: declaredNodeKinds(),
    tokenKinds: declaredTokenKinds(),
    contexts: declaredContexts(),
    lineSyntaxes: declaredLineSyntaxes().map(({ owner, kind, contexts, opens }) => ({ owner, kind, contexts, ...(opens ? { opens } : {}) })),
    lexRules: declaredLexRules(),
    textRules: declaredTextRules(),
  }
}

/** The JSON Schema draft the schema is written in. */
export const JSON_SCHEMA_DRAFT = 'https://json-schema.org/draft/2020-12/schema'

/** Where each kind's definition is, in the JSON Schema's `$defs`. */
const DEF = { node: 'node', token: 'token', nodeKind: (kind: string) => `node.${kind}`, tokenKind: (kind: string) => `token.${kind}` } as const
const ref = (def: string) => ({ $ref: `#/$defs/${def}` })

/** One definition per kind: an object with exactly these fields, its kind fixed, described. */
function kindDefs(kinds: readonly KindInfo[], tag: string, defOf: (kind: string) => string, fields: Record<string, object>) {
  return Object.fromEntries(kinds.map((k) => [defOf(k.kind), {
    description: `${k.description} (${k.owner})`,
    type: 'object',
    required: Object.keys({ [tag]: true, ...fields }),
    additionalProperties: false,
    properties: { [tag]: { const: k.kind }, ...fields },
  }]))
}

/** A JSON Schema of a sheet's tree, in the current schema, with every declared kind. */
export function jsonSchema(): object {
  const nodes = declaredNodeKinds()
  const tokens = declaredTokenKinds()
  const [tag, parts] = NODE_FIELDS
  const [t, text] = TOKEN_FIELDS
  const [schema, body] = TREE_FIELDS
  return {
    $schema: JSON_SCHEMA_DRAFT,
    $id: schemaId(SCHEMA.version),
    title: 'A MathScribe sheet',
    description: 'A sheet as a tree of nodes: every character of its text is in one token, so joining the tokens in order gives the text exactly.',
    type: 'object',
    required: [schema, body],
    additionalProperties: false,
    properties: {
      [schema]: { const: schemaId(SCHEMA.version), description: 'The schema the tree is written in, by version' },
      [body]: { type: 'array', items: ref(DEF.node), description: 'The sheet’s lines (a block as one node holding its lines)' },
    },
    $defs: {
      [DEF.node]: { oneOf: nodes.map((k) => ref(DEF.nodeKind(k.kind))) },
      [DEF.token]: { oneOf: tokens.map((k) => ref(DEF.tokenKind(k.kind))) },
      ...kindDefs(nodes, tag, DEF.nodeKind, {
        [parts]: { type: 'array', items: { oneOf: [ref(DEF.token), ref(DEF.node)] } },
      }),
      ...kindDefs(tokens, t, DEF.tokenKind, { [text]: { type: 'string' } }),
    },
  }
}
