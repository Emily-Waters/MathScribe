/** The engine's own mathjs instance, and the functions it adds to it or replaces. */
import { all, create, type MathType, type Unit } from 'mathjs'
import { VECTOR_FUNCTION } from '../../syntax.ts'
import { FN, OP, UNIT } from '../../mathjsNames.ts'
import { isSpeciesUnit } from '../../chemistry.ts'

/** Our own mathjs instance, with the functions below added or replaced. */
export const math = create(all)

/** A one-dimensional matrix: a tuple like (x, y, z). */
export const isTuple = (v: unknown): v is math.Matrix =>
  math.isMatrix(v) && (v as math.Matrix).size().length === 1

/** Molarity: `0.100 M` is 0.100 mol/L (and mM, µM). (M before another unit is still mega: MPa.) */
math.createUnit(UNIT.molar, { definition: `1 ${UNIT.mole}/${UNIT.litre}`, prefixes: 'short' })

/**
 * `lit("2.00")` evaluates to 2 but keeps the number as typed. Numbers whose
 * written form says more than their value (2.00, 0.250, 1.2e3) are wrapped in
 * it, so their trailing zeros and sig figs survive parsing, rearranging and
 * copying of expression trees, and can't be confused with a plain 2 elsewhere.
 */
math.import({ [FN.literal]: (text: string) => Number(text) })

/**
 * `tuple(x, y, z)`: a tuple of values, such as coordinates. It's a
 * one-dimensional matrix, so `2 * r`, `r1 + r2`, `norm(r)`, `dot` and `cross` all
 * work, and it's shown as (1.0, 2.0, 3.0) m. `tuple(a, b, c) = …` unpacks one
 * into separate variables (see evaluateUnpack).
 */
math.import({ [FN.tuple]: (...values: MathType[]) => math.matrix(values as never) })

/**
 * `<3.0, 4.0> N`: a vector. It's a tuple like any other (so everything that
 * works on tuples works on it), but it's shown in angle brackets, ⟨3.0, 4.0⟩ N,
 * or with unit vectors (`F:ijk`). `<…>` is rewritten to `vector(…)` before parsing.
 */
math.import({ [VECTOR_FUNCTION]: (...values: MathType[]) => math.matrix(values as never) })

/**
 * atan2(y, x) of two lengths (or any matching units), such as a point's
 * coordinates: mathjs only takes plain numbers. The ratio is what matters, so
 * both are read in x's unit.
 */
export const mathAtan2 = math.atan2
math.import({
  atan2: (y: MathType, x: MathType) => {
    if (math.isUnit(y) && math.isUnit(x)) {
      const unit = (x as Unit).formatUnits()
      return mathAtan2((y as Unit).toNumber(unit), (x as Unit).toNumber(unit))
    }
    return mathAtan2(y as never, x as never)
  },
}, { override: true })

/**
 * norm(r), the length of a tuple, also when it has units: mathjs's own norm
 * starts its sum from a plain 0, which can't be added to 1.00 m.
 */
export const mathNorm = math.norm
math.import({
  norm: (value: MathType, p?: number | string) => {
    if (isTuple(value) && (p === undefined || p === 2)) {
      const squares = (value.toArray() as MathType[]).map((v) => math.multiply(v, v) as MathType)
      return math.sqrt(squares.reduce((sum, sq) => math.add(sum, sq) as MathType) as never)
    }
    return p === undefined ? mathNorm(value as never) : mathNorm(value as never, p as never)
  },
}, { override: true })

/**
 * sin, cos and tan of exact angles come out with floating-point noise
 * (sin(pi) = 1.2e-16, sin(30 deg) = 0.49999999999999994). Results within 1e-14 of
 * 0, ±1/2 or ±1 are snapped to that value. Their outputs are bounded (or, for tan,
 * these are the values that matter), so an absolute tolerance is safe. A genuinely
 * tiny angle keeps its tiny sine: snapping to 0 only happens for angles that aren't
 * themselves near 0.
 */
export const SNAP_TARGETS = [0, 0.5, -0.5, 1, -1]
/** How close a result must be to a target to snap to it. */
export const SNAP_TOLERANCE = 1e-14
/** An angle (in rad) this small is genuinely tiny, so its sine isn't snapped to 0. */
export const TINY_ANGLE = 1e-6
/** A trig function's result, snapped if it's floating-point noise away from a target. */
export const snap = (r: unknown, angle: unknown) => {
  if (typeof r !== 'number') return r
  const radians = Math.abs(math.isUnit(angle) ? ((angle as Unit).value ?? 0) : Number(angle))
  const target = SNAP_TARGETS.find((t) => Math.abs(r - t) < SNAP_TOLERANCE && (t !== 0 || radians > TINY_ANGLE))
  return target === undefined ? r : target
}
for (const name of [FN.sin, FN.cos, FN.tan] as const) {
  const original = math[name] as unknown as ((x: unknown) => unknown) & { toTex?: unknown }
  const wrapped = Object.assign((x: unknown) => snap(original(x), x), { toTex: original.toTex })
  math.import({ [name]: wrapped }, { override: true })
}

/**
 * `x to deg` for a plain number reads it as radians, as `:deg` does: so
 * `asin(0.50) to deg`, `atan(v_y / v_x) to deg` and `theta to deg` work. (mathjs
 * only converts quantities that already have a unit; an angle from asin, acos or
 * atan is a plain number, in radians.) A tuple of plain numbers converts each one.
 */
{
  const original = math[OP.to] as unknown as ((x: unknown, unit: unknown) => unknown) & { toTex?: unknown }
  const radian = math.unit(UNIT.radian)
  const isAngle = (unit: unknown) => math.isUnit(unit) && (unit as Unit).equalBase(radian)
  const inRadians = (x: unknown): unknown => (typeof x === 'number'
    ? math.unit(x, UNIT.radian)
    : math.isMatrix(x) ? math.map(x, (v: MathType) => inRadians(v) as MathType) : x)
  const wrapped = Object.assign(
    (x: unknown, unit: unknown) => {
      if (isAngle(unit)) return original(inRadians(x), unit)
      // (mathjs's own message for this is about argument types.)
      if (typeof x === 'number' && math.isUnit(unit)) {
        throw new Error(`${x} has no unit, so it can't be converted to ${(unit as Unit).formatUnits()}: give it one (3.0 m to cm).`)
      }
      // An amount of a species keeps it: mol NaOH to mmol is mmol NaOH.
      const species = math.isUnit(x) ? (x as Unit).units.filter((p) => isSpeciesUnit(p.unit.name)) : []
      const target = unit as Unit
      if (species.length && math.isUnit(unit) && !target.units.some((p) => isSpeciesUnit(p.unit.name))) {
        const tag = species.map((p) => (p.power === 1 ? p.unit.name : `${p.unit.name}^${p.power}`)).join(' ')
        return original(x, math.unit(`${target.formatUnits()} ${tag}`))
      }
      return original(x, unit)
    },
    { toTex: original.toTex },
  )
  math.import({ [OP.to]: wrapped }, { override: true })
}
