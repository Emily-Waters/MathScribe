/**
 * Reading what more than one reader needs, besides the syntax in syntax/: a
 * sheet-wide constant declaration, and imported data's rows.
 */
import { CONSTANT_DECLARATION } from '../syntax.ts'
import { constantKey } from '../sheet/names.ts'
import { parseCsv, type CsvData } from '../data/csv.ts'

// ---------------------------------------------------------------------------
// Sheet-wide constant declarations
// ---------------------------------------------------------------------------

/**
 * A line that sets a constant's precision and/or display unit sheet-wide: `@c:4`,
 * `@a_0:3 to angstrom`, `@chem.mm.Na:3`. Its name as typed (chem.mm.Na), and inside (chem__mm__Na).
 */
export interface ConstantDeclaration { name: string; key: string; precision?: string; unit?: string }

/** A constant declaration's parts, or null if the line isn't one (`@c` alone isn't). */
export function parseConstantDeclaration(body: string): ConstantDeclaration | null {
  const groups = CONSTANT_DECLARATION.exec(body)?.groups
  if (!groups || (groups.precision === undefined && groups.unit === undefined)) return null
  return { name: groups.name, key: constantKey(groups.name), precision: groups.precision, unit: groups.unit }
}

// ---------------------------------------------------------------------------
// Imported data
// ---------------------------------------------------------------------------

/**
 * Imported data as read, kept between evaluations of the sheet (one per edit)
 * while its rows don't change, so it isn't read again, and its values (made
 * once per column read; see the engine) are reused. Only the latest few are kept.
 */
const readData = new Map<string, CsvData>()
const KEPT_IMPORTS = 8

/** Imported data's rows, read (or as read last time, if they haven't changed). */
export function readCsv(rows: string[]): CsvData {
  const key = rows.join('\n')
  let data = readData.get(key)
  if (!data) {
    data = parseCsv(rows)
    readData.set(key, data)
    if (readData.size > KEPT_IMPORTS) readData.delete(readData.keys().next().value!)
  }
  return data
}
