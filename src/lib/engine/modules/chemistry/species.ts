/** Species in units: giving a value its species, taking them off, and the strict rules. */
import { isConstantNode, type FunctionNode, type MathNode, type MathType, type Unit } from 'mathjs'
import { isNamespaceConstant, type BuiltinConstant, type NamespaceConstant } from '../../../constants.ts'
import { GREEK_CHARS } from '../../../syntax.ts'
import { BASE_DIMENSION, FN, UNIT } from '../../../mathjsNames.ts'
import { math } from '../../core/math.ts'
import { isUnitCall, unitCallText } from '../../core/tex.ts'
import { SPECIES_KINDS, SpeciesError, isSpeciesUnit, speciesOf, speciesPowers, speciesUnit, type SpeciesKind } from './chemistry.ts'
import { SPECIES_FUNCTION } from './syntax.ts'

/** A species' unit of a kind (see chemistry.ts), made in mathjs the first time it's used. */
export function speciesUnitName(formula: string, kind: SpeciesKind): string {
  const { name, isNew } = speciesUnit(formula, kind)
  if (isNew) math.createUnit(name)
  return name
}

/** Where mass and amount are among a unit's dimensions. */
export const DIMENSION_INDEX: Record<SpeciesKind, number> = {
  mass: math.Unit.BASE_DIMENSIONS.indexOf(BASE_DIMENSION.mass),
  amount: math.Unit.BASE_DIMENSIONS.indexOf(BASE_DIMENSION.amount),
}

/** How a species is explained when it follows something with no mass or amount. */
export const neitherMassNorAmount = (formula: string) => new SpeciesError(
  `{${formula}} says what a mass or an amount is of, but this is neither: put it after a mass (5.00 g {${formula}}), `
  + `an amount (2.0 mol {${formula}}) or a molar mass ((18.02 g / 1 mol) {${formula}}).`)

/**
 * The species units `{formula}` adds to a value with these dimensions: one for
 * each power of mass and of amount it has (speciesPowers): on g, a mass of the
 * species; on mol or M, an amount; on g/mol, a mass of it per amount of it.
 */
export function speciesUnits(dimensions: readonly number[], formula: string): string {
  const powers = speciesPowers(dimensions[DIMENSION_INDEX.mass], dimensions[DIMENSION_INDEX.amount])
  if (!powers) throw neitherMassNorAmount(formula)
  return SPECIES_KINDS.filter((k) => powers[k])
    .map((k) => `${speciesUnitName(formula, k)}${powers[k] === 1 ? '' : `^${powers[k]}`}`).join(' ')
}

/** Whether a value has a species in its unit. */
export const hasSpecies = (x: unknown) => math.isUnit(x) && (x as Unit).units.some((p) => isSpeciesUnit(p.unit.name))

/**
 * A value given its species, when `{X}` follows a bracket or a name:
 * `(18.02 g / 1 mol) {H2O}` is a molar mass of H2O. A value that's already of a
 * species can't be given another (that would be a conversion: use a mole ratio).
 */
export function withSpecies(x: MathType, formula: string): MathType {
  if (math.isMatrix(x)) return math.map(x, (v: MathType) => withSpecies(v, formula)) as MathType
  if (!math.isUnit(x)) throw neitherMassNorAmount(formula)
  if (hasSpecies(x)) {
    throw new SpeciesError(`This is already of a species, so it can't be of {${formula}} too: `
      + `to go from one species to another, multiply by a mole ratio, (1 mol {${formula}}) / (1 mol {…}).`)
  }
  return math.multiply(x, math.unit(1, speciesUnits((x as Unit).dimensions, formula))) as MathType
}

/** A built-in constant's value, given its species if it's of one (@chem.mm.Na: a molar mass of Na). */
export const speciesOfConstant = (value: unknown, constant: BuiltinConstant | NamespaceConstant | undefined): unknown =>
  constant && isNamespaceConstant(constant) && constant.species ? withSpecies(value as MathType, constant.species) : value

/** An expression with the species taken out of its units, for showing it without them: unit("g massofa") → unit("g"). */
export function withoutSpeciesUnits(node: MathNode): MathNode {
  return node.transform((n) => {
    if (!isUnitCall(n)) return n
    const text = unitCallText(n)
    if (!text.split(/[\s*/^()]+/).some(isSpeciesUnit)) return n
    const plain = withoutSpecies(math.unit(1, text))
    return math.parse(math.isUnit(plain) ? `${FN.unit}("${(plain as Unit).formatUnits()}")` : '1')
  })
}

/** A value's species, by kind: each formula's power. */
export function speciesPowersOf(u: Unit): Record<SpeciesKind, Map<string, number>> {
  const out: Record<SpeciesKind, Map<string, number>> = { mass: new Map(), amount: new Map() }
  for (const p of u.units) {
    const s = speciesOf(p.unit.name)
    if (s) out[s.kind].set(s.formula, (out[s.kind].get(s.formula) ?? 0) + p.power)
  }
  for (const kind of SPECIES_KINDS) for (const [f, power] of out[kind]) if (!power) out[kind].delete(f)
  return out
}

/** What every calculation with species should do, to be told when it doesn't. */
export const GIVE_SPECIES = 'give every mass, amount and molar mass its species, as in 5.00 g {H2O}, 2.0 mol {H2O} or @chem.mm({H2O})'

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
  if (math.isMatrix(value)) {
    for (const v of (value as math.Matrix).toArray().flat() as unknown[]) {
      const problem = speciesProblem(v)
      if (problem) return problem
    }
    return undefined
  }
  if (!hasSpecies(value)) return undefined
  const u = value as Unit
  const powers = speciesPowersOf(u)
  const rest = withoutSpecies(u)
  const dimensions = math.isUnit(rest) ? (rest as Unit).dimensions : []
  for (const kind of SPECIES_KINDS) {
    const tagged = [...powers[kind].values()].reduce((a, b) => a + b, 0)
    if (tagged !== (dimensions[DIMENSION_INDEX[kind]] ?? 0)) {
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

/** A unit's part as mathjs reads it back: prefix, name and power (`mmol`, `L^-1`). */
export const unitPartText = (p: Unit['units'][number]) =>
  // (mathjs's types call the prefix a string; it's an object with a name.)
  `${(p.prefix as unknown as { name: string }).name}${p.unit.name}${p.power === 1 ? '' : `^${p.power}`}`

/**
 * A value with its species taken off: 0.100 mol Na⁺ → 0.100 mol, so amounts of
 * different species add (`@chem.total(n_Na, n_Cl)` puts it around each one).
 * A tuple has each of its values' taken off; anything without a species is as it was.
 */
export function withoutSpecies(x: MathType): MathType {
  if (math.isMatrix(x)) return math.map(x, (v: MathType) => withoutSpecies(v)) as MathType
  if (!math.isUnit(x)) return x
  const u = x as Unit
  if (!u.units.some((p) => isSpeciesUnit(p.unit.name))) return u
  const rest = u.units.filter((p) => !isSpeciesUnit(p.unit.name)).map(unitPartText).join(' ')
  // (A species unit has no prefix and a factor of 1, so the value in the rest of the units is the same.)
  const value = u.toNumber()
  return rest ? math.unit(value, rest) : value
}

/** A species after something that isn't a unit (after a unit, readUnit takes it): `{H2O}` (1: the formula). */
export const SPECIES_AFTER_VALUE = /(?<!\{)\{([^{}]+)\}(?!\})/

/** A character that can end a name or a number, which a species can follow. */
export const ENDS_OPERAND = new RegExp(String.raw`[\w.${GREEK_CHARS}]`)

/**
 * `{X}` after a bracket, a call, a name or a number, as a call that gives what's
 * before it its species: `(18.02 g / 1 mol) {H2O}` → of((18.02 g / 1 mol), "H2O"),
 * `n_1 {H2O}` → of(n_1, "H2O"). (After a unit, readUnit has already taken it.)
 */
export function expandSpeciesAfterValues(src: string): string {
  for (let m = SPECIES_AFTER_VALUE.exec(src); m; m = SPECIES_AFTER_VALUE.exec(src)) {
    const at = m.index
    let end = at
    while (end > 0 && /\s/.test(src[end - 1])) end--
    let start = end
    if (src[end - 1] === ')') {
      // Back to the matching bracket, and the name of the function it calls, if it does.
      let depth = 0
      for (start = end - 1; start >= 0; start--) {
        if (src[start] === ')') depth++
        else if (src[start] === '(' && --depth === 0) break
      }
      if (start < 0) return src
    }
    while (start > 0 && ENDS_OPERAND.test(src[start - 1])) start--
    // Nothing before it to give a species to: left for mathjs to explain.
    if (start === end) return src
    src = `${src.slice(0, start)}${SPECIES_FUNCTION.shown}(${src.slice(start, end)}, "${m[1]}")${src.slice(at + m[0].length)}`
  }
  return src
}

/** The amount `1 mol` is exact when written as a whole one: per one mole, as in a molar mass (18.02 g / 1 mol). */
export const ONE_MOLE = { number: 1, text: '1' } as const

/** Whether a number and its unit are one mole, written `1 mol` (any amount unit, no decimal point): exact. */
export function isOneMole(number: MathNode, unit: MathNode, literals: Map<number, string>): boolean {
  if (!isConstantNode(number) || number.value !== ONE_MOLE.number) return false
  if ((literals.get(number.value) ?? ONE_MOLE.text) !== ONE_MOLE.text || !isUnitCall(unit)) return false
  try {
    // (One mole of a species, `1 mol {X}`, is exact as a coefficient: isSpeciesCount.)
    return math.unit(unitCallText(unit)).equalBase(math.unit(UNIT.mole))
  } catch {
    return false
  }
}

/**
 * A whole number of a species, written without a decimal point (`1 mol {X}`,
 * `2 mol {H2O}`): a coefficient from a balanced equation, so exact.
 */
export function isSpeciesCount(number: MathNode, unit: MathNode, literals: Map<number, string>): boolean {
  if (!isConstantNode(number) || typeof number.value !== 'number' || !Number.isInteger(number.value)) return false
  if (/[.eE]/.test(literals.get(number.value) ?? '')) return false
  return isUnitCall(unit) && unitCallText(unit as FunctionNode).split(/[\s*/^]+/).some(isSpeciesUnit)
}
