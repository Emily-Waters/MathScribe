/** Products written without dots, as in a textbook: ma, ½mv², 2πr. */
import { isConstantNode, isOperatorNode, isSymbolNode, type MathNode } from 'mathjs'
import { MATH_CONSTANT, OP, isOp } from '../../mathjsNames.ts'
import { RAW } from './results.ts'
import { symbolTex, isUnitCall, unitCallText, isLitCall } from './tex.ts'
import { unwrap, seeThrough } from './nodes.ts'

/** A number followed by its unit: `2.0 kg`. */
export const isNumberWithUnit = (n: MathNode): n is math.OperatorNode =>
  isOp(n, OP.multiply) && isUnitCall(n.args[1])

// ---------------------------------------------------------------------------
// Products without dots: ma, ½mv², 2πr
// ---------------------------------------------------------------------------

/**
 * What a factor shows at one edge, which decides what goes between it and its
 * neighbour in a product: a number, a quantity (a number with a unit, or a
 * substituted value), a bracket, a power's raised exponent, a minus sign, a
 * fraction, a name (one letter, or Greek), a wide name (an upright word, like
 * Fn), or anything else (a call).
 */
export const EDGE = {
  number: 'number',
  quantity: 'quantity',
  bracket: 'bracket',
  power: 'power',
  minus: 'minus',
  fraction: 'fraction',
  name: 'name',
  wide: 'wide',
  other: 'other',
} as const
export type Edge = (typeof EDGE)[keyof typeof EDGE]

/** Which side of a factor: its left edge, or its right. */
export const SIDE = { left: 'left', right: 'right' } as const
export type Side = (typeof SIDE)[keyof typeof SIDE]

/**
 * What a substituted value (pre-rendered TeX) shows at one edge: a bracket
 * ((−2.0), ⟨3.0, 4.0⟩), a unit at its end (⟨3.0, 4.0⟩ N), or a number.
 */
export function rawEdge(tex: string, side: Side): Edge {
  if (side === SIDE.left) return /^(?:\\left|\()/.test(tex) ? EDGE.bracket : EDGE.number
  if (/(?:\\right\)|\\right\\rangle|\))$/.test(tex)) return EDGE.bracket
  return /\\mathrm|\\text/.test(tex) ? EDGE.quantity : EDGE.number
}

/** What `node` shows at its `side` edge (in a product written without dots). */
export function edgeOf(node: MathNode, side: Side): Edge {
  const n = unwrap(node)
  // Bracketed by the product: a value with a unit, a sum, ….
  if (needsBrackets(n, side === SIDE.left ? SIDE.right : SIDE.left, true)) return EDGE.bracket
  if (isConstantNode(n) || isLitCall(n)) return EDGE.number
  if (isUnitCall(n) || isNumberWithUnit(n)) return EDGE.quantity
  if (isSymbolNode(n)) {
    if (n.name.startsWith(RAW)) return rawEdge(n.name.slice(RAW.length), side)
    // Euler's number after a number would read as scientific notation (5.67e), so it counts as a number.
    if (n.name === MATH_CONSTANT.e && side === SIDE.left) return EDGE.number
    return symbolTex(n.name).startsWith('\\mathrm') ? EDGE.wide : EDGE.name
  }
  if (isOperatorNode(n)) {
    if (n.fn === OP.divide) return EDGE.fraction
    if (n.fn === OP.multiply) return edgeOf(side === SIDE.left ? n.args[0] : n.args[n.args.length - 1], side)
    if (n.fn === OP.pow) {
      // A power ends in its raised exponent. It starts with its base, which is
      // bracketed if it's a value with a unit: (0.400 Å)².
      if (side === SIDE.right) return EDGE.power
      return isNumberWithUnit(unwrap(n.args[0])) ? EDGE.bracket : edgeOf(n.args[0], side)
    }
  }
  return EDGE.other
}

/**
 * A value in scientific notation, with or without a unit (9.11 × 10⁻³¹ kg),
 * and not bracketed already. In a product it's bracketed, so its × 10ⁿ isn't
 * read as one more factor: 8 · (9.11 × 10⁻³¹ kg) · L².
 */
export function inScientificNotation(node: MathNode): boolean {
  let n = unwrap(node)
  if (isNumberWithUnit(n)) n = unwrap(n.args[0])
  if (isSymbolNode(n) && n.name.startsWith(RAW)) return n.name.includes('\\times') && !n.name.startsWith(`${RAW}\\left`)
  if (isLitCall(n)) return /e/i.test(unitCallText(n))
  return false
}

/**
 * Whether a factor needs brackets in a product, on the `side` of it it's on:
 * a value in scientific notation, a sum, a conversion, a comparison, and a
 * negative after another factor. Also a value with a unit, with
 * `valuesBracketed` (products written without dots, where the brackets keep
 * values apart: 4π(250.0 Å), (2.00 kg)(9.81 m/s²)).
 */
export function needsBrackets(node: MathNode, side: Side, valuesBracketed: boolean): boolean {
  if (inScientificNotation(node)) return true
  const n = seeThrough(node)
  if (valuesBracketed && isNumberWithUnit(n)) return true
  if (!isOperatorNode(n)) return false
  if (n.fn === OP.unaryMinus) return side === SIDE.right
  return !isOp(n, OP.multiply, OP.divide, OP.pow, OP.unaryPlus)
}

/**
 * What goes between two factors: a dot where a number or quantity comes next
 * (x · 2, not x2), after a quantity ending in its unit (2.0 kg · m, and
 * 9.81 m/s² · (2.0 s)²), or between a number and a fraction (2 · ½, not the
 * mixed number 2½); a thin space beside a wide name (Fn F); otherwise nothing,
 * which includes before a bracket: 4π(0.400 Å)²(0.688 Å⁻¹ᐟ²)².
 */
export function productSeparator(left: MathNode, right: MathNode): string {
  const l = edgeOf(left, SIDE.right)
  const r = edgeOf(right, SIDE.left)
  if (r === EDGE.number || r === EDGE.quantity || r === EDGE.minus || l === EDGE.quantity
    || (r === EDGE.fraction && (l === EDGE.number || l === EDGE.fraction))) return '\\cdot '
  if (l === EDGE.wide || r === EDGE.wide) return '\\,'
  return ' '
}
