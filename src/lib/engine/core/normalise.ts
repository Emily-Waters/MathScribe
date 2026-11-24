/** Units tidied after a calculation, and quantities shown in them. */
import {
  UNIT, baseMagnitude, bestPrefix, convert, copyQuantity, hasFixedPrefix, inSI, isQuantity, keepUnitsAsGiven, magnitude, multiply,
  quantity, sameDimension, unitParts, unitText, withBaseMagnitude, withFixedPrefix, type Quantity, type UnitPart,
} from '../../maths/library/index.ts'
// (The engine's additions to the library, before any unit is read here: molarity, M, among them.)
import './math.ts'
import { isLabelUnit } from './module.ts'
import { SAME_VALUE_TOLERANCE, TINY } from './numbers.ts'

// ---------------------------------------------------------------------------
// Unit normalisation
// ---------------------------------------------------------------------------

/** Derived SI units preferred over base-unit combinations (kg m/s^2 → N). */
export const DERIVED_UNITS = ['N', 'J', 'W', 'Pa', 'C', 'V', 'ohm', 'F', 'T', 'Wb', 'H', UNIT.molar].map((u) => quantity(u))

/**
 * Units of more than one name that are kept as they are rather than turned into
 * SI, because they're how the quantity is always written: a molar mass in g/mol
 * (not 0.018015 kg/mol).
 */
export const CONVENTIONAL_UNITS: ReadonlySet<string> = new Set([`${UNIT.gram}/${UNIT.mole}`].map((u) => unitText(quantity(u))))

/** How many unit names a unit is written with (`kg m/s^2` → 3). */
export const unitTokens = (s: string) => (s.match(/[A-Za-z]+/g) ?? []).length

/**
 * Computed quantities can carry awkward units (N/kg, or kg^0.5 N^0.5 after a
 * sqrt), and the library shares unit internals between values, so a later `to`
 * conversion can mutate an earlier variable. Every computed unit is therefore
 * replaced by a fresh, tidy copy: kept as-is if already a single unit, at any
 * power (6 km, 19.62 N, 0.688 Å^-1.5), otherwise converted to SI and then to a
 * derived unit if one fits.
 */
/**
 * The library doesn't combine repeats of one unit (Å^2 · Å^-3 stays `angstrom^2 / angstrom^3`).
 * If every part is the same unit, return it as one power of that unit (Å^-1); else null.
 */
export function mergeLikeUnits(u: Quantity): Quantity | null {
  const parts = unitParts(u)
  if (parts.length < 2) return null
  const symbol = (p: UnitPart) => `${p.prefix}${p.name}`
  const first = symbol(parts[0])
  if (!parts.every((p) => symbol(p) === first)) return null
  const power = Number(parts.reduce((sum, p) => sum + p.power, 0).toPrecision(12))
  if (power === 0) return null
  try {
    return convert(u, power === 1 ? first : `${first}^${power}`)
  } catch {
    return null
  }
}

/** A mass, for telling one when it's worked out. */
export const GRAMS = quantity(UNIT.gram)

/** A computed quantity in tidy units (see above); `keepUnits` leaves a chosen unit alone. */
export function normalise(value: unknown, keepUnits: boolean): unknown {
  if (!isQuantity(value)) return value
  const u = value
  const parts = unitParts(u)
  // Label units (a species, mol EDTA) aren't SI: set them aside, tidy the rest, and put them back.
  // (Each label unit is worth exactly 1, so the number in the other units is the same.)
  if (parts.some((p) => isLabelUnit(p.name))) {
    const part = (p: UnitPart) => `${p.prefix}${p.name}${p.power === 1 ? '' : `^${p.power}`}`
    // Each label once, its powers added up: mol EDTA × (mol X / mol EDTA) is mol X.
    const powers = new Map<string, number>()
    for (const p of parts) if (isLabelUnit(p.name)) powers.set(p.name, (powers.get(p.name) ?? 0) + p.power)
    const labels = [...powers].filter(([, power]) => power !== 0)
      .map(([name, power]) => (power === 1 ? name : `${name}^${power}`)).join(' ')
    const others = parts.filter((p) => !isLabelUnit(p.name)).map(part).join(' ')
    const number = magnitude(u, unitText(u))
    const tidy = others ? normalise(quantity(number, others), keepUnits) : number
    if (!labels) return tidy
    // (Shown as made: left to itself, the library would re-simplify it to SI when formatting.)
    return keepUnitsAsGiven(multiply(tidy as number | Quantity, quantity(1, labels)) as Quantity)
  }
  const units = unitText(u)
  if (keepUnits || unitTokens(units) <= 1 || CONVENTIONAL_UNITS.has(units)) return copyQuantity(u)
  const merged = mergeLikeUnits(u)
  if (merged) return merged
  const si = inSI(u)
  // A mass worked out from grams stays in grams: mol × g/mol is 5.00 g, not 0.00500 kg.
  if (sameDimension(si, GRAMS) && parts.some((p) => p.name === UNIT.gram)) return convert(si, UNIT.gram)
  const derived = DERIVED_UNITS.find((d) => sameDimension(si, d))
  return derived ? convert(si, unitText(derived)) : si
}

/** Prefixes people expect to read: pico to tera, plus centi. */
export const COMMON_PREFIXES = new Set(['', 'p', 'n', 'u', 'm', 'c', 'k', 'M', 'G', 'T'])

/**
 * The quantity as it should be displayed. The library picks a "best" prefix when
 * formatting, which for tiny or huge values can be an obscure one
 * (9.11e-31 kg → 0.911 rg, ronto-grams). Then keep the unit's own prefix
 * instead, shown in scientific notation.
 */
export function displayUnit(u: Quantity): Quantity {
  if (hasFixedPrefix(u) || !unitParts(u).length) return u
  // The library's own choice, the same one formatting makes.
  let best: string | undefined
  try {
    best = bestPrefix(u)
  } catch {
    return u // e.g. Å^-1.5: the library doesn't re-prefix fractional powers either
  }
  if (best === undefined || COMMON_PREFIXES.has(best)) return u
  return withFixedPrefix(u)
}

/** SI magnitude of a number or quantity. */
export const magnitudeOf = (v: unknown): number => (isQuantity(v) ? (baseMagnitude(v) ?? NaN) : Number(v))

/** A quantity like `like` but with SI magnitude `si` (or just `si` for plain numbers). */
export function withMagnitude(like: unknown, si: number): unknown {
  return isQuantity(like) ? withBaseMagnitude(like, si) : si
}

/** A finite real number or quantity (not complex, NaN or infinite). */
export const isRealValue = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v)
  if (!isQuantity(v)) return false
  const base = baseMagnitude(v)
  return typeof base === 'number' && Number.isFinite(base)
}

/** Whether two values are the same, give or take floating-point noise. */
export const sameValue = (a: unknown, b: unknown) => {
  const x = magnitudeOf(a)
  const y = magnitudeOf(b)
  return Math.abs(x - y) <= SAME_VALUE_TOLERANCE * Math.max(Math.abs(x), Math.abs(y), TINY)
}
