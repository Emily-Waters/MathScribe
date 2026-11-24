/** The engine's additions to the maths library: the functions it adds, or puts in place of the library's own. */
import {
  FN, OP, UNIT, defineFunctions, defineUnit, divide, isQuantity, isTuple, isValueMatrix, isZero, libraryFunction, magnitude,
  mapValues, multiply, add, baseMagnitude, quantity, sameDimension, sqrt, tupleOf, unitParts, unitText, valuesOf,
  type Quantity, type Value, type ValueMatrix,
} from '../../maths/library/index.ts'
import { INV_FUNCTION, TUPLE_FUNCTION } from '../../sheet/names.ts'
import { CALL, SIGIL } from '../../syntax.ts'
import { isLabelUnit } from './module.ts'

/** A one-dimensional matrix: a tuple like (x, y, z). */
export { isTuple }

/** Molarity: `0.100 M` is 0.100 mol/L (and mM, µM). (M before another unit is still mega: MPa.) */
// (Added to the library here, as the engine loads: the modules' units go through declareUnit, which loads after this.)
defineUnit(UNIT.molar, `1 ${UNIT.mole}/${UNIT.litre}`, true)

/**
 * `lit("2.00")` evaluates to 2 but keeps the number as typed. Numbers whose
 * written form says more than their value (2.00, 0.250, 1.2e3) are wrapped in
 * it, so their trailing zeros and sig figs survive parsing, rearranging and
 * copying of expression trees, and can't be confused with a plain 2 elsewhere.
 */
defineFunctions({ [FN.literal]: (text: string) => Number(text) })

/**
 * `@tuple(x, y, z)`: a tuple of values, such as coordinates. It's a
 * one-dimensional matrix, so `2 * r`, `r1 + r2`, `norm(r)`, `dot` and `cross` all
 * work, and it's shown as (1.0, 2.0, 3.0) m. `@tuple(a, b, c) = …` unpacks one
 * into separate variables (see evaluateUnpack).
 */
defineFunctions({ [TUPLE_FUNCTION]: (...values: Value[]) => tupleOf(values) })

/**
 * `@inv(x)`: 1/x, units and species flipped with it (g/mol → mol/g). It's
 * written as its fraction flipped (see the Calculator's toTex). A tuple has no
 * inverse to flip, and zero none at all.
 */
defineFunctions({
  [INV_FUNCTION]: (x: Value) => {
    if (isTuple(x)) throw new Error(`${SIGIL}${CALL.inv}(…) flips one value: a tuple has none to flip.`)
    if (isZero(isQuantity(x) ? magnitude(x) : x)) throw new Error(`${SIGIL}${CALL.inv}(…) of zero isn't defined.`)
    return divide(1, x)
  },
})

/**
 * atan2(y, x) of two lengths (or any matching units), such as a point's
 * coordinates: the library's only takes plain numbers. The ratio is what
 * matters, so both are read in x's unit.
 */
export const mathAtan2 = libraryFunction('atan2') as unknown as (y: unknown, x: unknown) => Value
defineFunctions({
  atan2: (y: Value, x: Value) => {
    if (isQuantity(y) && isQuantity(x)) {
      const unit = unitText(x)
      return mathAtan2(magnitude(y, unit), magnitude(x, unit))
    }
    return mathAtan2(y, x)
  },
}, true)

/**
 * norm(r), the length of a tuple, also when it has units: the library's own
 * norm starts its sum from a plain 0, which can't be added to 1.00 m.
 */
export const mathNorm = libraryFunction('norm') as unknown as (value: unknown, p?: unknown) => Value
defineFunctions({
  norm: (value: Value, p?: number | string) => {
    if (isTuple(value) && (p === undefined || p === 2)) {
      const squares = valuesOf(value).map((v) => multiply(v, v))
      return sqrt(squares.reduce((sum, sq) => add(sum, sq)))
    }
    return p === undefined ? mathNorm(value) : mathNorm(value, p)
  },
}, true)

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
  const radians = Math.abs(isQuantity(angle) ? (baseMagnitude(angle) ?? 0) : Number(angle))
  const target = SNAP_TARGETS.find((t) => Math.abs(r - t) < SNAP_TOLERANCE && (t !== 0 || radians > TINY_ANGLE))
  return target === undefined ? r : target
}
for (const name of [FN.sin, FN.cos, FN.tan] as const) {
  const original = libraryFunction(name) as unknown as ((x: unknown) => unknown) & { toTex?: unknown }
  const wrapped = Object.assign((x: unknown) => snap(original(x), x), { toTex: original.toTex })
  defineFunctions({ [name]: wrapped }, true)
}

/**
 * `x to deg` for a plain number reads it as radians, as `:deg` does: so
 * `asin(0.50) to deg`, `atan(v_y / v_x) to deg` and `theta to deg` work. (The
 * library only converts quantities that already have a unit; an angle from
 * asin, acos or atan is a plain number, in radians.) A tuple of plain numbers
 * converts each one.
 */
{
  const original = libraryFunction(OP.to) as unknown as ((x: unknown, unit: unknown) => unknown) & { toTex?: unknown }
  const radian = quantity(UNIT.radian)
  const isAngle = (unit: unknown): unit is Quantity => isQuantity(unit) && sameDimension(unit, radian)
  const inRadians = (x: unknown): unknown => (typeof x === 'number'
    ? quantity(x, UNIT.radian)
    : isValueMatrix(x) ? mapValues(x as ValueMatrix, (v) => inRadians(v) as Value) : x)
  const wrapped = Object.assign(
    (x: unknown, unit: unknown) => {
      if (isAngle(unit)) return original(inRadians(x), unit)
      // (The library's own message for this is about argument types.)
      if (typeof x === 'number' && isQuantity(unit)) {
        throw new Error(`${x} has no unit, so it can't be converted to ${unitText(unit)}: give it one (3.0 m to cm).`)
      }
      // A label unit is kept (see EngineModule.isLabelUnit): mol NaOH to mmol is mmol NaOH.
      const labels = isQuantity(x) ? unitParts(x).filter((p) => isLabelUnit(p.name)) : []
      if (labels.length && isQuantity(unit) && !unitParts(unit).some((p) => isLabelUnit(p.name))) {
        const tag = labels.map((p) => (p.power === 1 ? p.name : `${p.name}^${p.power}`)).join(' ')
        return original(x, quantity(`${unitText(unit)} ${tag}`))
      }
      return original(x, unit)
    },
    { toTex: original.toTex },
  )
  defineFunctions({ [OP.to]: wrapped }, true)
}
