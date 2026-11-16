/**
 * Bringing a tree from an older schema up to date. When the sheet's syntax
 * changes (as `tuple(…)` became `@tuple(…)`), the schema's version goes up, and
 * a migration here rewrites a tree in the old version to the new one, so a sheet
 * saved (or sent) before the change still reads. There are none yet: version 1
 * is the first.
 */
import { SCHEMA, schemaId, type SheetTree } from './nodes.ts'

/** A step from one version of the schema to the next. */
export interface Migration {
  /** The version it takes a tree from (to the next). */
  readonly from: number
  readonly migrate: (tree: SheetTree) => SheetTree
}

/** The migrations, one per version after the first, in order. */
export const MIGRATIONS: readonly Migration[] = []

/** A schema's version from its id, `mathscribe/1` → 1 (undefined if it isn't one of MathScribe's). */
export function versionOf(schema: string): number | undefined {
  const [name, version] = schema.split('/')
  const n = Number(version)
  return name === SCHEMA.name && Number.isInteger(n) && n > 0 ? n : undefined
}

/** A tree in the current schema: as it is, or brought up from an older one. Throws for a schema it can't read. */
export function upgrade(tree: SheetTree): SheetTree {
  let version = versionOf(tree.schema)
  if (version === undefined || version > SCHEMA.version) {
    throw new Error(`A tree in schema "${tree.schema}" can't be read: this is ${schemaId(SCHEMA.version)}.`)
  }
  let current = tree
  while (version < SCHEMA.version) {
    const step = MIGRATIONS.find((m) => m.from === version)
    if (!step) throw new Error(`There's no way from ${schemaId(version)} to ${schemaId(version + 1)}.`)
    current = step.migrate(current)
    version++
  }
  return current
}
