/**
 * Products as in a textbook: names side by side (ma, ½mv², 2πr), and × where a
 * number comes next or a unit ends a factor (2.00 kg × 9.81 m/s², 2 × 1.50 m),
 * so numbers and units never run into each other. Brackets only where they're
 * needed: (2.0 s)², × (−1.5 m/s).
 */
import { isConstantNode, isFunctionNode, isOperatorNode, isSymbolNode, type MathNode } from 'mathjs'
import { MATH_CONSTANT, OP, isOp } from '../../mathjsNames.ts'
import { RAW } from './results.ts'
import { INV_FUNCTION } from '../../names.ts'
import { symbolTex, isUnitCall, unitCallText, isLitCall } from './tex.ts'
import { unwrap, seeThrough } from './nodes.ts'

/** A number followed by its unit: `2.0 kg`. */
export const isNumberWithUnit = (n: MathNode): n is math.OperatorNode =>
  isOp(n, OP.multiply) && isUnitCall(n.args[1])

// ---------------------------------------------------------------------------
// Products: ma, ½mv², 2.00 kg × 9.81 m/s²
// ---------------------------------------------------------------------------

/** The sign between factors where one is needed (a number next, or a unit before it). */
export const PRODUCT_SIGN = '\\times '
/** Between every factor, with "Show · in every product" on (CalcOptions.productDots). */
export const EVERY_PRODUCT_SIGN = '\\cdot '
/** Between a wide name (an upright word) and its neighbour: a thin space, Fn F. */
const NAME_GAP = '\\,'
/** Between names: nothing (a space in LaTeX, which isn't shown). */
const NO_SIGN = ' '

/**
 * What a factor shows at one edge, which decides what goes between it and its
 * neighbour in a product: a number, a quantity (a number with a unit, or a
 * substituted value), a value in brackets ((2.0 s)², (−1.5 m/s)), any other
 * bracket ((a + b)), a power's raised exponent, a minus sign, a fraction, a
 * name (one letter, or Greek), a wide name (an upright word, like Fn), or
 * anything else (a call).
 */
export const EDGE = {
  number: 'number',
  quantity: 'quantity',
  value: 'value',
  bracket: 'bracket',
  power: 'power',
  minus: 'minus',
  /** Euler's number, e: a number to the reader only after a number (5.67 × e, not 5.67e, which reads as scientific notation). */
  euler: 'euler',
  fraction: 'fraction',
  name: 'name',
  wide: 'wide',
  other: 'other',
} as const
export type Edge = (typeof EDGE)[keyof typeof EDGE]

/** Which side of a factor: its left edge, or its right. */
export const SIDE = { left: 'left', right: 'right' } as const
export type Side = (typeof SIDE)[keyof typeof SIDE]

/** A substituted value's TeX that opens with a bracket around a value: (−2.0), ⟨3.0, 4.0⟩, (1.00, 2.00) m. */
const VALUE_BRACKET = /^\\left(?:\(|\[|\\langle|\\\|)\s*-?\d/

/**
 * What a substituted value (pre-rendered TeX) shows at one edge: a value in
 * brackets ((−2.0), ⟨3.0, 4.0⟩), another bracket, a unit at its end
 * (⟨3.0, 4.0⟩ N), or a number.
 */
export function rawEdge(tex: string, side: Side): Edge {
  if (side === SIDE.left) {
    if (VALUE_BRACKET.test(tex)) return EDGE.value
    return /^(?:\\left|\()/.test(tex) ? EDGE.bracket : EDGE.number
  }
  if (/(?:\\right\)|\\right\\rangle|\))$/.test(tex)) return EDGE.bracket
  return /\\mathrm|\\text/.test(tex) ? EDGE.quantity : EDGE.number
}

/** Whether a factor is a value that a product brackets: one in scientific notation, or a negative. */
const isBracketedValue = (n: MathNode) =>
  inScientificNotation(n) || (isOp(n, OP.unaryMinus) && (isValue(unwrap(n.args[0]))))

/** A number, with or without its unit, as typed or substituted. */
const isValue = (n: MathNode) => isConstantNode(n) || isLitCall(n) || isNumberWithUnit(n)
  || (isSymbolNode(n) && n.name.startsWith(RAW) && /^-?\d/.test(n.name.slice(RAW.length)))

/** What `node` shows at its `side` edge (in a product). */
export function edgeOf(node: MathNode, side: Side): Edge {
  const n = unwrap(node)
  // Bracketed by the product: a value in scientific notation (a value), a sum, ….
  if (needsBrackets(n, side === SIDE.left ? SIDE.right : SIDE.left)) return isBracketedValue(n) ? EDGE.value : EDGE.bracket
  if (isConstantNode(n) || isLitCall(n)) return EDGE.number
  if (isUnitCall(n) || isNumberWithUnit(n)) return EDGE.quantity
  if (isSymbolNode(n)) {
    if (n.name.startsWith(RAW)) return rawEdge(n.name.slice(RAW.length), side)
    if (n.name === MATH_CONSTANT.e && side === SIDE.left) return EDGE.euler
    return symbolTex(n.name).startsWith('\\mathrm') ? EDGE.wide : EDGE.name
  }
  // `@inv(x)` is drawn as a fraction, x turned over.
  if (isFunctionNode(n) && n.fn.name === INV_FUNCTION) return EDGE.fraction
  if (isOperatorNode(n)) {
    // A fraction of numbers is a coefficient, as a number is (½mv²); any other, a fraction.
    if (n.fn === OP.divide) return n.args.every((a) => isConstantNode(unwrap(a)) || isLitCall(unwrap(a))) ? EDGE.number : EDGE.fraction
    // A negative starts with its sign, and ends as what's negated does: −500 N × sin(30°).
    if (n.fn === OP.unaryMinus) return side === SIDE.left ? EDGE.minus : edgeOf(n.args[0], side)
    if (n.fn === OP.multiply) return edgeOf(side === SIDE.left ? n.args[0] : n.args[n.args.length - 1], side)
    if (n.fn === OP.pow) {
      // A power ends in its raised exponent. It starts with its base, which is
      // bracketed if it's a value: (0.400 Å)², (2.0)².
      if (side === SIDE.right) return EDGE.power
      const base = unwrap(n.args[0])
      if (isValue(base) || isBracketedValue(base)) return EDGE.value
      // (A fraction raised to a power is in brackets: π^{−½}(Z/a₀)^{3/2}.)
      return isOp(base, OP.divide) ? EDGE.bracket : edgeOf(n.args[0], side)
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
 * only where it'd read wrongly without them: a value in scientific notation
 * (8 × (9.11 × 10⁻³¹ kg), so its × 10ⁿ isn't one more factor), a sum, a
 * conversion, a comparison, and a negative after another factor (× (−1.5 m/s)).
 */
export function needsBrackets(node: MathNode, side: Side): boolean {
  if (inScientificNotation(node)) return true
  const n = seeThrough(node)
  if (!isOperatorNode(n)) return false
  if (n.fn === OP.unaryMinus) return side === SIDE.right
  return !isOp(n, OP.multiply, OP.divide, OP.pow, OP.unaryPlus)
}

/** The edges a factor can start with that make it a number to the reader: × goes before it. */
const STARTS_AS_NUMBER: ReadonlySet<Edge> = new Set([EDGE.number, EDGE.quantity, EDGE.value, EDGE.minus])

/**
 * What goes between two factors: × where a number comes next (x × 2, not x2;
 * 2 × 1.50 m; × (2.0 s)²), after a quantity ending in its unit (9.81 m/s² × t²),
 * or between a number and a fraction (2 × ½, not the mixed number 2½); a thin
 * space beside a wide name (Fn F); otherwise nothing: ma, ½mv², 2π(a + b).
 */
export function productSeparator(left: MathNode, right: MathNode): string {
  const l = edgeOf(left, SIDE.right)
  const r = edgeOf(right, SIDE.left)
  const afterNumber = l === EDGE.number || l === EDGE.value
  // (A fraction is set apart on both sides, so a chain of them reads as one, factor by factor:
  // m × 1/M × n_Cr/n × M_Cr, as conversion factors are written.)
  if (STARTS_AS_NUMBER.has(r) || l === EDGE.quantity || l === EDGE.fraction || r === EDGE.fraction
    || (r === EDGE.euler && afterNumber)) return PRODUCT_SIGN
  if (l === EDGE.wide || r === EDGE.wide) return NAME_GAP
  return NO_SIGN
}

/** What goes before a factor written as TeX already (a delta's δx, or its value): × before a number, else a thin space. */
export const signBeforeTex = (tex: string) => (/^(?:\\left\(\s*)?-?\d/.test(tex) ? PRODUCT_SIGN : NAME_GAP)
