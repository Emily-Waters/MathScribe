/** Species in units: giving a value its species, taking them off, and the strict rules. */
import {
  BASE_DIMENSION, type BuiltinConstant, type CallExpr, declareUnit, type Expr, isConstant, isNamespaceConstant, isQuantity,
  isUnitCall, magnitude, mapValues, multiply, type NamespaceConstant, parse, quantity, type Quantity, sameDimension, source, transform,
  UNIT, type UnitPart, unitCallText, unitParts, unitText, type Value, valuesOf, dimensionPower, isValueMatrix, NOT_JUST_DIGITS,
} from '../../lib/plugin.ts'
import { SPECIES_KINDS, SpeciesError, isSpeciesUnit, speciesOf, speciesPowers, speciesUnit, type SpeciesKind } from './chemistry.ts'

/**
 * A species' unit of a kind (see chemistry.ts): a unit of its own, a new kind
 * of quantity (a mass of H2O is a different thing from a mass of NaCl), added to
 * the maths library the first time a sheet names the species (declareUnit).
 */
export function speciesUnitName(formula: string, kind: SpeciesKind): string {
  const { name, isNew } = speciesUnit(formula, kind)
  if (isNew) declareUnit({ name })
  return name
}

/** Each kind of species' base dimension in a unit: mass, or amount of substance. */
export const SPECIES_DIMENSION: Record<SpeciesKind, string> = { mass: BASE_DIMENSION.mass, amount: BASE_DIMENSION.amount }

/** How a species is explained when it follows something with no mass or amount. */
export const neitherMassNorAmount = (formula: string) => new SpeciesError(
  `{${formula}} says what a mass or an amount is of, but this is neither: put it after a mass (5.00 g {${formula}}), `
  + `an amount (2.0 mol {${formula}}) or a molar mass ((18.02 g / 1 mol) {${formula}}).`)

/**
 * The species units `{formula}` adds to a value with these dimensions: one for
 * each power of mass and of amount it has (speciesPowers): on g, a mass of the
 * species; on mol or M, an amount; on g/mol, a mass of it per amount of it.
 */
export function speciesUnits(u: Quantity, formula: string): string {
  const powers = speciesPowers(dimensionPower(u, SPECIES_DIMENSION.mass), dimensionPower(u, SPECIES_DIMENSION.amount))
  if (!powers) throw neitherMassNorAmount(formula)
  return SPECIES_KINDS.filter((k) => powers[k])
    .map((k) => `${speciesUnitName(formula, k)}${powers[k] === 1 ? '' : `^${powers[k]}`}`).join(' ')
}

/** Whether a value has a species in its unit. */
export const hasSpecies = (x: unknown) => isQuantity(x) && unitParts(x).some((p) => isSpeciesUnit(p.name))

/**
 * A value given its species, when `{X}` follows a bracket or a name:
 * `(18.02 g / 1 mol) {H2O}` is a molar mass of H2O. A value that's already of a
 * species can't be given another (that would be a conversion: use a mole ratio).
 */
export function withSpecies(x: Value, formula: string): Value {
  if (isValueMatrix(x)) return mapValues(x, (v) => withSpecies(v, formula))
  if (!isQuantity(x)) throw neitherMassNorAmount(formula)
  if (hasSpecies(x)) {
    throw new SpeciesError(`This is already of a species, so it can't be of {${formula}} too: `
      + `to go from one species to another, multiply by a mole ratio, (1 mol {${formula}}) / (1 mol {…}).`)
  }
  return multiply(x, quantity(1, speciesUnits(x, formula)))
}

/** A built-in constant's value, given its species if it's of one (@chem.mm.Na: a molar mass of Na). */
export const speciesOfConstant = (value: unknown, constant: BuiltinConstant | NamespaceConstant | undefined): unknown =>
  constant && isNamespaceConstant(constant) && constant.species ? withSpecies(value as Value, constant.species) : value

/** An expression with the species taken out of its units, for showing it without them: unit("g massofa") → unit("g"). */
export function withoutSpeciesUnits(node: Expr): Expr {
  return transform(node, (n) => {
    if (!isUnitCall(n)) return n
    const text = unitCallText(n)
    if (!text.split(/[\s*/^()]+/).some(isSpeciesUnit)) return n
    const plain = withoutSpecies(quantity(1, text))
    return parse(isQuantity(plain) ? source.unit(unitText(plain)) : '1')
  })
}

/** A value's species, by kind: each formula's power. */
export function speciesPowersOf(u: Quantity): Record<SpeciesKind, Map<string, number>> {
  const out: Record<SpeciesKind, Map<string, number>> = { mass: new Map(), amount: new Map() }
  for (const p of unitParts(u)) {
    const s = speciesOf(p.name)
    if (s) out[s.kind].set(s.formula, (out[s.kind].get(s.formula) ?? 0) + p.power)
  }
  for (const kind of SPECIES_KINDS) for (const [f, power] of out[kind]) if (!power) out[kind].delete(f)
  return out
}

/** What every calculation with species should do, to be told when it doesn't. */
export const GIVE_SPECIES = 'give every mass, amount and molar mass its species, as in 5.00 g {H2O}, 2.0 mol {H2O} or a substance’s molar mass, H2O.M'

/**
 * What's wrong with a value's species, if anything: the rules a value with
 * species follows, whatever it was worked out from.
 *   1. For each kind, its species account for exactly the mass (or amount) in
 *      its unit: a mass of H2O has one mass, of H2O; a molar mass of H2O, a mass
 *      of H2O over an amount of H2O. (So something without a species, or with
 *      a species but no mass, shows here.)
 *   2. A ratio between species (X per Y, a conversion factor) is all it is: it
 *      can't also be an amount or mass of something.
 */
export function speciesProblem(value: unknown): string | undefined {
  if (isValueMatrix(value)) {
    for (const v of (valuesOf(value) as unknown[]).flat()) {
      const problem = speciesProblem(v)
      if (problem) return problem
    }
    return undefined
  }
  if (!hasSpecies(value)) return undefined
  const u = value as Quantity
  const powers = speciesPowersOf(u)
  const rest = withoutSpecies(u)
  for (const kind of SPECIES_KINDS) {
    const tagged = [...powers[kind].values()].reduce((a, b) => a + b, 0)
    if (tagged !== (isQuantity(rest) ? dimensionPower(rest, SPECIES_DIMENSION[kind]) : 0)) {
      return `The species don't match the units: something here has none. In a calculation with species, ${GIVE_SPECIES}.`
    }
  }
  const ratio = SPECIES_KINDS.find((k) => {
    const signs = [...powers[k].values()]
    return signs.some((p) => p > 0) && signs.some((p) => p < 0)
  })
  if (ratio) {
    const other = SPECIES_KINDS.find((k) => k !== ratio && powers[k].size)
    if (other) {
      const [a, b] = [...powers[ratio]].sort(([, p], [, q]) => q - p).map(([f]) => f)
      return `This mixes species: it has ${a} per ${b} and an ${other} of ${[...powers[other].keys()].join(', ')}. `
        + `To go from one species to another, multiply by a mole ratio, (1 mol {${a}}) / (1 mol {${b}}).`
    }
  }
  return undefined
}

/** The unit a ratio of species alone is shown in, by kind: a mole ratio in mol, a mass ratio in g. */
export const SPECIES_RATIO_UNIT: Record<SpeciesKind, string> = { amount: UNIT.mole, mass: UNIT.gram }

/** A unit's part as the library reads it back: prefix, name and power (`mmol`, `L^-1`). */
export const unitPartText = (p: UnitPart) => `${p.prefix}${p.name}${p.power === 1 ? '' : `^${p.power}`}`

/**
 * A value with its species taken off: 0.100 mol Na⁺ → 0.100 mol, so amounts of
 * different species add (`@chem.total(n_Na, n_Cl)` puts it around each one).
 * A tuple has each of its values' taken off; anything without a species is as it was.
 */
export function withoutSpecies(x: Value): Value {
  if (isValueMatrix(x)) return mapValues(x, (v) => withoutSpecies(v))
  if (!isQuantity(x)) return x
  const parts = unitParts(x)
  if (!parts.some((p) => isSpeciesUnit(p.name))) return x
  const rest = parts.filter((p) => !isSpeciesUnit(p.name)).map(unitPartText).join(' ')
  // (A species unit has no prefix and a factor of 1, so the value in the rest of the units is the same.)
  const value = magnitude(x)
  return rest ? quantity(value, rest) : value
}

/** The amount `1 mol` is exact when written as a whole one: per one mole, as in a molar mass (18.02 g / 1 mol). */
export const ONE_MOLE = { number: 1, text: '1' } as const

/** Whether a number and its unit are one mole, written `1 mol` (any amount unit, no decimal point): exact. */
export function isOneMole(number: Expr, unit: Expr, literals: Map<number, string>): boolean {
  if (!isConstant(number) || number.value !== ONE_MOLE.number) return false
  if ((literals.get(number.value) ?? ONE_MOLE.text) !== ONE_MOLE.text || !isUnitCall(unit)) return false
  try {
    // (One mole of a species, `1 mol {X}`, is exact as a coefficient: isSpeciesCount.)
    return sameDimension(quantity(unitCallText(unit)), quantity(UNIT.mole))
  } catch {
    return false
  }
}

/**
 * A whole number of a species, written without a decimal point (`1 mol {X}`,
 * `2 mol {H2O}`): a coefficient from a balanced equation, so exact.
 */
export function isSpeciesCount(number: Expr, unit: Expr, literals: Map<number, string>): boolean {
  if (!isConstant(number) || typeof number.value !== 'number' || !Number.isInteger(number.value)) return false
  if (NOT_JUST_DIGITS.test(literals.get(number.value) ?? '')) return false
  return isUnitCall(unit) && unitCallText(unit as CallExpr).split(/[\s*/^]+/).some(isSpeciesUnit)
}
