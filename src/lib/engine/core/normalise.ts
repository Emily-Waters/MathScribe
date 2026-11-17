/** Units tidied after a calculation, and quantities shown in them. */
import { type MathType, type Unit } from 'mathjs'
import { UNIT } from '../../maths/mathjsNames.ts'
import { math } from './math.ts'
import { isLabelUnit } from './module.ts'
import { SAME_VALUE_TOLERANCE, TINY } from './numbers.ts'

// ---------------------------------------------------------------------------
// Unit normalisation
// ---------------------------------------------------------------------------

/** Derived SI units preferred over base-unit combinations (kg m/s^2 → N). */
export const DERIVED_UNITS = ['N', 'J', 'W', 'Pa', 'C', 'V', 'ohm', 'F', 'T', 'Wb', 'H', UNIT.molar].map((u) => math.unit(u))

/**
 * Units of more than one name that are kept as they are rather than turned into
 * SI, because they're how the quantity is always written: a molar mass in g/mol
 * (not 0.018015 kg/mol).
 */
export const CONVENTIONAL_UNITS: ReadonlySet<string> = new Set([`${UNIT.gram}/${UNIT.mole}`].map((u) => math.unit(u).formatUnits()))

/** How many unit names a unit is written with (`kg m/s^2` → 3). */
export const unitTokens = (s: string) => (s.match(/[A-Za-z]+/g) ?? []).length

/**
 * Computed quantities can carry awkward units (N/kg, or kg^0.5 N^0.5 after a
 * sqrt), and mathjs shares unit internals between values, so a later `to`
 * conversion can mutate an earlier variable. Every computed unit is therefore
 * replaced by a fresh, tidy copy: kept as-is if already a single unit, at any
 * power (6 km, 19.62 N, 0.688 Å^-1.5), otherwise converted to SI and then to a
 * derived unit if one fits.
 */
/**
 * mathjs doesn't combine repeats of one unit (Å^2 · Å^-3 stays `angstrom^2 / angstrom^3`).
 * If every part is the same unit, return it as one power of that unit (Å^-1); else null.
 */
export function mergeLikeUnits(u: Unit): Unit | null {
  const parts = u.units
  if (parts.length < 2) return null
  // (mathjs's types call `prefix` a string; at runtime it's a { name } object.)
  const symbol = (p: (typeof parts)[number]) =>
    `${(p.prefix as unknown as { name?: string } | undefined)?.name ?? ''}${p.unit.name}`
  const first = symbol(parts[0])
  if (!parts.every((p) => symbol(p) === first)) return null
  const power = Number(parts.reduce((sum, p) => sum + p.power, 0).toPrecision(12))
  if (power === 0) return null
  try {
    return u.to(power === 1 ? first : `${first}^${power}`)
  } catch {
    return null
  }
}

/** A mass, for telling one when it's worked out. */
export const GRAMS = math.unit(UNIT.gram)

/** A computed quantity in tidy units (see above); `keepUnits` leaves a chosen unit alone. */
export function normalise(value: unknown, keepUnits: boolean): unknown {
  if (!math.isUnit(value)) return value
  const u = value as Unit
  // Label units (a species, mol EDTA) aren't SI: set them aside, tidy the rest, and put them back.
  // (Each label unit is worth exactly 1, so the number in the other units is the same.)
  if (u.units.some((p) => isLabelUnit(p.unit.name))) {
    const part = (p: Unit['units'][number]) =>
      `${(p.prefix as unknown as { name?: string } | undefined)?.name ?? ''}${p.unit.name}${p.power === 1 ? '' : `^${p.power}`}`
    // Each label once, its powers added up: mol EDTA × (mol X / mol EDTA) is mol X.
    const powers = new Map<string, number>()
    for (const p of u.units) if (isLabelUnit(p.unit.name)) powers.set(p.unit.name, (powers.get(p.unit.name) ?? 0) + p.power)
    const labels = [...powers].filter(([, power]) => power !== 0)
      .map(([name, power]) => (power === 1 ? name : `${name}^${power}`)).join(' ')
    const others = u.units.filter((p) => !isLabelUnit(p.unit.name)).map(part).join(' ')
    const number = u.toNumber(u.formatUnits())
    const tidy = others ? normalise(math.unit(number, others), keepUnits) : number
    if (!labels) return tidy
    const result = math.multiply(tidy as MathType, math.unit(1, labels)) as Unit
    // (Shown as made: left to itself, mathjs would re-simplify it to SI when formatting.)
    result.skipAutomaticSimplification = true
    return result
  }
  const units = u.formatUnits()
  if (keepUnits || unitTokens(units) <= 1 || CONVENTIONAL_UNITS.has(units)) return u.clone()
  const merged = mergeLikeUnits(u)
  if (merged) return merged
  const si = u.toSI()
  // A mass worked out from grams stays in grams: mol × g/mol is 5.00 g, not 0.00500 kg.
  if (si.equalBase(GRAMS) && u.units.some((p) => p.unit.name === UNIT.gram)) return si.to(UNIT.gram)
  const derived = DERIVED_UNITS.find((d) => si.equalBase(d))
  return derived ? si.to(derived.formatUnits()) : si
}

/** Prefixes people expect to read: pico to tera, plus centi. */
export const COMMON_PREFIXES = new Set(['', 'p', 'n', 'u', 'm', 'c', 'k', 'M', 'G', 'T'])

/**
 * The quantity as it should be displayed. mathjs picks a "best" prefix when
 * formatting, which for tiny or huge values can be an obscure one
 * (9.11e-31 kg → 0.911 rg, ronto-grams). Then keep the unit's own prefix
 * instead, shown in scientific notation.
 */
export function displayUnit(u: Unit): Unit {
  if (u.fixPrefix || !u.units.length) return u
  // mathjs's own choice, the same one format() makes (an internal method).
  let best: { name: string } | undefined
  try {
    best = (u.clone() as unknown as { _bestPrefix?: () => { name: string } | undefined })._bestPrefix?.()
  } catch {
    return u // e.g. Å^-1.5: mathjs doesn't re-prefix fractional powers either
  }
  if (!best || COMMON_PREFIXES.has(best.name)) return u
  const fixed = u.clone()
  fixed.fixPrefix = true
  return fixed
}

/** SI magnitude of a number or quantity. */
export const magnitudeOf = (v: unknown): number => (math.isUnit(v) ? ((v as Unit).value ?? NaN) : Number(v))

/** A quantity like `like` but with SI magnitude `si` (or just `si` for plain numbers). */
export function withMagnitude(like: unknown, si: number): unknown {
  if (!math.isUnit(like)) return si
  const u = (like as Unit).clone()
  u.value = si
  return u
}

/** A finite real number or quantity (not complex, NaN or infinite). */
export const isRealValue = (v: unknown) =>
  (typeof v === 'number' && Number.isFinite(v))
  || (math.isUnit(v) && typeof (v as Unit).value === 'number' && Number.isFinite((v as Unit).value))

/** Whether two values are the same, give or take floating-point noise. */
export const sameValue = (a: unknown, b: unknown) => {
  const x = magnitudeOf(a)
  const y = magnitudeOf(b)
  return Math.abs(x - y) <= SAME_VALUE_TOLERANCE * Math.max(Math.abs(x), Math.abs(y), TINY)
}
