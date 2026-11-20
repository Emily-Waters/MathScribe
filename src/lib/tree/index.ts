/**
 * A sheet as a tree of nodes, every character of it: text → tree (encode) →
 * text (decode) exactly. Its kinds of node and token are declared once
 * (registry.ts), the core's and each module's; a tree is plain data, ready for
 * JSON, checked (check.ts) when it comes from elsewhere, and brought up to date
 * (migrations.ts) when it's from an older schema.
 */
import './registry.ts'
import './core.ts'

export { LINE_CONTEXT, NODE_KIND, SCHEMA, TOKEN_KIND, isCallKind, isToken, schemaId, type Part, type SheetTree, type SyntaxNode, type Token } from './nodes.ts'
export { decode, encode, textOf } from './codec.ts'
export { notedOf, readLine, splitLines, trailingSeparatorAt, type ReadLine, type SourceLine } from './lines.ts'
export { startsByClosing } from './lexer.ts'
export { formatChanges, formatSheet, type TextChange } from './format.ts'
export { rawOf, sheetStatements, statementOf, statementOfLines, type PlacedToken, type SheetStatement, type Statement } from './statements.ts'
export { LINE_ROLE, TOP, stepLine, type Frame, type LineRole, type LineState, type Step } from './stream.ts'
export {
  BODY_END, CONTENT, isBlockKind, declareContexts, declareLineSyntaxes, declaredContexts, declaredLineSyntaxes, type Body, type ContextInfo, type LineSyntax,
} from './grammar.ts'
export {
  CORE_OWNER, TOKEN_ROLE, declareNodeKinds, declareTokenKinds, declaredNodeKinds, declaredTokenKinds, tokenRoleOf, type KindInfo, type TokenRole,
} from './registry.ts'
export { isSheetTree, treeProblems } from './check.ts'
export { JSON_SCHEMA_DRAFT, introspect, jsonSchema, type SchemaListing, type SyntaxInfo } from './schema.ts'
export { MIGRATIONS, upgrade, versionOf, type Migration } from './migrations.ts'
