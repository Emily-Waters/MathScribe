/**
 * Checking a tree that came from elsewhere (JSON from a file, a request, an AI)
 * before it's read: its shape, and that every kind in it is declared.
 */
import { isNodeKind, isTokenKind } from './registry.ts'
import { versionOf } from './migrations.ts'
import { SCHEMA, schemaId, type SheetTree } from './nodes.ts'

/** The fields of a tree, a node and a token: all there is in each (as the JSON Schema says too: schema.ts). */
export const TREE_FIELDS = ['schema', 'body'] as const satisfies readonly (keyof SheetTree)[]
export const NODE_FIELDS = ['kind', 'parts'] as const
export const TOKEN_FIELDS = ['t', 'text'] as const

/** What's wrong with a value as a sheet's tree, at most `limit` problems (none: it's a tree that can be read). */
export function treeProblems(value: unknown, limit = 10): string[] {
  const problems: string[] = []
  const say = (where: string, problem: string) => {
    if (problems.length < limit) problems.push(`${where}: ${problem}`)
  }
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  // (Nothing else is in a tree: a field it doesn't have would be lost, or mean something it can't.)
  const extra = (v: Record<string, unknown>, fields: readonly string[], where: string) => {
    for (const key of Object.keys(v)) if (!fields.includes(key)) say(where, `"${key}" isn't part of one`)
  }

  const part = (v: unknown, where: string): void => {
    if (!isRecord(v)) return say(where, 'not a token or a node')
    if ('t' in v) {
      if (typeof v.t !== 'string' || !isTokenKind(v.t)) say(where, `"${String(v.t)}" isn't a declared kind of token`)
      if (typeof v.text !== 'string') say(where, 'a token without its text')
      extra(v, TOKEN_FIELDS, where)
      return
    }
    extra(v, NODE_FIELDS, where)
    if (typeof v.kind !== 'string' || !isNodeKind(v.kind)) say(where, `"${String(v.kind)}" isn't a declared kind of node`)
    if (!Array.isArray(v.parts)) return say(where, 'a node without its parts')
    v.parts.forEach((p, i) => part(p, `${where}.parts[${i}]`))
  }

  if (!isRecord(value)) return ['the tree: not an object']
  extra(value, TREE_FIELDS, 'the tree')
  const version = typeof value.schema === 'string' ? versionOf(value.schema) : undefined
  if (version === undefined) say('schema', `"${String(value.schema)}" isn't one of MathScribe's`)
  else if (version > SCHEMA.version) say('schema', `"${String(value.schema)}" is newer than this MathScribe reads (${schemaId(SCHEMA.version)})`)
  if (!Array.isArray(value.body)) say('body', 'not a list of lines')
  else value.body.forEach((line, i) => part(line, `body[${i}]`))
  return problems
}

/** Whether a value is a sheet's tree that can be read. */
export const isSheetTree = (value: unknown): value is SheetTree => treeProblems(value, 1).length === 0
