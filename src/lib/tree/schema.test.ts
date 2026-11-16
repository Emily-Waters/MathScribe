/** The schema, described: the listing (introspect) and the JSON Schema, made from what's declared. */
import { describe, expect, it } from 'vitest'
import { SAMPLE } from '../sample.ts'
import { REFERENCE } from '../reference.ts'
// (The engine installs its modules as it loads: their kinds are then the schema's.)
import '../engine/index.ts'
import { CHEM_NODE } from '../engine/modules/chemistry/grammar.ts'
import { GRAMMAR_CORE } from './grammar.ts'
import { NODE_KIND, SCHEMA, TOKEN_KIND, encode, introspect, jsonSchema, schemaId, treeProblems } from './index.ts'

/** Where the JSON Schema is published (served with the app: `/schema/mathscribe-1.schema.json`). */
const PUBLISHED = `../../../public/schema/${schemaId(SCHEMA.version).replace('/', '-')}.schema.json`

type Schema = Record<string, unknown>

/**
 * Whether a value matches a JSON Schema: the part of the language the sheet's
 * schema uses (type, const, required, properties, additionalProperties, items,
 * oneOf, $ref into $defs), so the test can check the schema itself, not just its shape.
 */
function matches(value: unknown, schema: Schema, root: Schema): boolean {
  if (typeof schema.$ref === 'string') return matches(value, (root.$defs as Record<string, Schema>)[schema.$ref.replace('#/$defs/', '')], root)
  if ('const' in schema && value !== schema.const) return false
  if (Array.isArray(schema.oneOf)) return (schema.oneOf as Schema[]).filter((s) => matches(value, s, root)).length === 1
  if (schema.type === 'string' && typeof value !== 'string') return false
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return false
    if (schema.items && !value.every((v) => matches(v, schema.items as Schema, root))) return false
  }
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const record = value as Record<string, unknown>
    const properties = (schema.properties ?? {}) as Record<string, Schema>
    if (((schema.required ?? []) as string[]).some((k) => !(k in record))) return false
    if (schema.additionalProperties === false && Object.keys(record).some((k) => !(k in properties))) return false
    if (!Object.entries(properties).every(([k, s]) => !(k in record) || matches(record[k], s, root))) return false
  }
  return true
}

const SHEETS = [SAMPLE, ...REFERENCE.flatMap((s) => s.examples.map((e) => e.source)), '@chem.species {\n  w = {H2O}\n}\n{2 H2 + O2 -> 2 H2O}']

describe('the JSON Schema', () => {
  const schema = jsonSchema() as Schema

  it('is published with the app, as it is now (update it with `npx vitest run -u`)', async () => {
    await expect(`${JSON.stringify(schema, null, 2)}\n`).toMatchFileSnapshot(PUBLISHED)
  })

  it('accepts every sheet’s tree, through JSON too, as the tree’s own check does', () => {
    for (const source of SHEETS) {
      const tree = JSON.parse(JSON.stringify(encode(source)))
      expect(matches(tree, schema, schema)).toBe(true)
      expect(treeProblems(tree)).toEqual([])
    }
  })

  it('rejects what isn’t a tree, as the tree’s own check does', () => {
    const line = { kind: NODE_KIND.calc, parts: [{ t: TOKEN_KIND.body, text: 'x = 1' }] }
    const bad = [
      { schema: 'mathscribe/999', body: [] },
      { schema: schemaId(SCHEMA.version), body: [{ kind: 'nope', parts: [] }] },
      { schema: schemaId(SCHEMA.version), body: [{ ...line, extra: true }] },
      { schema: schemaId(SCHEMA.version), body: [{ kind: NODE_KIND.calc, parts: [{ t: TOKEN_KIND.body }] }] },
      { schema: schemaId(SCHEMA.version), body: [line], more: 1 },
    ]
    for (const tree of bad) {
      expect(matches(tree, schema, schema)).toBe(false)
      expect(treeProblems(tree)).not.toEqual([])
    }
    expect(matches({ schema: schemaId(SCHEMA.version), body: [line] }, schema, schema)).toBe(true)
  })

  it('describes each kind, a module’s too, with whose it is', () => {
    const defs = schema.$defs as Record<string, Schema>
    expect(defs[`node.${NODE_KIND.calc}`].description).toMatch(/calculation/)
    expect(defs[`node.${CHEM_NODE.species}`].description).toMatch(/ChemistryModule/)
  })
})

describe('the listing', () => {
  const listing = introspect()

  it('lists every kind, context and kind of line, with whose each is', () => {
    expect(listing.schema).toBe(schemaId(SCHEMA.version))
    expect(listing.nodeKinds.map((k) => k.kind)).toEqual(expect.arrayContaining([NODE_KIND.block, CHEM_NODE.species]))
    expect(listing.contexts.map((c) => c.name)).toContain('prose')
    // A module's kinds of line are offered a line first, then the core's.
    const owners = listing.lineSyntaxes.map((s) => s.owner)
    expect(owners.indexOf(GRAMMAR_CORE)).toBeGreaterThan(owners.lastIndexOf('ChemistryModule'))
    expect(listing.lineSyntaxes.find((s) => s.kind === NODE_KIND.importLine)?.opens).toMatchObject({ node: NODE_KIND.import })
  })

  it('is plain data, the same through JSON', () => {
    expect(JSON.parse(JSON.stringify(listing))).toEqual(listing)
  })
})
