/** Imported data: columns, their values and uncertainties. */
import { EXACT, countSigFigs, formatWithUncertainty, isMeasuredLiteral } from '../../maths/sigfigs.ts'
import { seriesMemberName } from '../../sheet/names.ts'
import type { CsvColumn } from '../../data/csv.ts'
import { math } from './math.ts'
import { PERCENT_SCALE, isValidUnit } from './numbers.ts'

/** An imported value, ready to store: its variable's name, value (with the column's unit) and sig figs. */
export interface DataValue {
  name: string
  value: unknown
  sf: number
  /** Its uncertainty, from the column's uncertainty column (dx for x), in the value's unit. */
  unc?: unknown
  /** The uncertainty's sig figs as typed (not for a percentage), kept for display as with `pm`. */
  uncSf?: number
}

/** What's wrong with a column's uncertainty column's unit, if anything. */
export function uncertaintyUnitError(c: CsvColumn): string | undefined {
  const u = c.unc
  if (!u || u.percent || !u.unit) return undefined
  const where = `Column ${u.column}, the uncertainties of ${c.name},`
  if (!isValidUnit(u.unit)) return `${where} has a unit MathScribe doesn't know: "${u.unit}".`
  if (!c.unit) return `${where} has a unit (${u.unit}) but ${c.name} doesn't: give ${c.name} its unit too, or take it off ${u.column}.`
  if (!math.unit(u.unit).equalBase(math.unit(c.unit))) return `${where} is in ${u.unit}, which doesn't convert to ${c.name}'s ${c.unit}.`
  return undefined
}

/**
 * A value's uncertainty, as typed in its row of the uncertainty column: in the
 * value's unit, and that number in the column's unit (for its sig figs).
 */
export function dataUncertainty(c: CsvColumn, x: number, text: string): { unc: unknown; dx: number } {
  const n = Number(text)
  const u = c.unc!
  if (u.percent) {
    const dx = (Math.abs(x) * n) / PERCENT_SCALE
    if (!c.unit) return { unc: dx, dx }
    const q = math.unit(dx, c.unit)
    q.fixPrefix = true
    return { unc: q, dx }
  }
  if (!c.unit) return { unc: n, dx: n }
  const q = math.unit(n, u.unit ?? c.unit)
  q.fixPrefix = true
  return { unc: q, dx: u.unit && u.unit !== c.unit ? q.toNumber(c.unit) : n }
}

/**
 * Each column's values, made once per column as read (sheets are evaluated on
 * every edit, and imported data can have tens of thousands of values). The
 * values aren't changed by calculations with them, so they can be shared.
 */
export const madeColumns = new WeakMap<CsvColumn, DataValue[] & { range: { lowest: DataValue; highest: DataValue } }>()

/** A column's values, as variables: t[1], t[2], … (t__1, t__2), with the column's unit and their sig figs as typed. */
export function columnValues(c: CsvColumn) {
  const made = madeColumns.get(c)
  if (made) return made
  // The column's unit, read once: each value is a copy of one unit of it, scaled.
  // (A unit with an offset, like degC, doesn't scale, so each of those is made afresh.)
  const one = c.unit ? math.unit(1, c.unit) : undefined
  const scales = one !== undefined && !one.units.some((p) => p.unit.offset)
  let lowest: DataValue | undefined
  let highest: DataValue | undefined
  let low = Infinity
  let high = -Infinity
  const values = c.values.map(({ row, text }): DataValue => {
    const x = Number(text)
    let value: unknown = x
    if (c.unit) {
      const u = scales ? one!.clone() : math.unit(x, c.unit)
      if (scales) u.value = (one!.value as number) * x
      u.fixPrefix = true
      value = u
    }
    // A whole number without a unit is exact, as when it's typed in a sheet.
    const v: DataValue = { name: seriesMemberName(c.name, row), value, sf: c.unit || isMeasuredLiteral(text) ? countSigFigs(text) : EXACT }
    // With an uncertainty, it sets the precision, as with `x = 0.012 m pm 0.001 m`.
    const uncText = c.unc?.values.get(row)
    if (uncText !== undefined && Number(uncText) > 0) {
      const { unc, dx } = dataUncertainty(c, x, uncText)
      v.unc = unc
      v.uncSf = c.unc!.percent ? undefined : countSigFigs(uncText)
      v.sf = formatWithUncertainty(x, dx, v.uncSf).sf
    }
    if (x < low) [low, lowest] = [x, v]
    if (x > high) [high, highest] = [x, v]
    return v
  })
  const result = Object.assign(values, { range: { lowest: lowest!, highest: highest! } })
  madeColumns.set(c, result)
  return result
}
