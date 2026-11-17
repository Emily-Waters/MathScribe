/** Questions about expression trees: brackets, literals, conversions. */
import { isConstantNode, isFunctionNode, isOperatorNode, isParenthesisNode, type MathNode } from 'mathjs'
import { OP, isOp } from '../../maths/mathjsNames.ts'
import { isUnitCall, isLitCall } from './tex.ts'
import { isUnwrittenFunction } from './module.ts'

/** A node without any brackets around it. */
export function unwrap(n: MathNode): MathNode {
  return isParenthesisNode(n) ? unwrap(n.content) : n
}

/** A node as it's written: without brackets, or a module's unwritten functions around it (so a sum inside one is bracketed in a product). */
export function seeThrough(node: MathNode): MathNode {
  const n = unwrap(node)
  return isFunctionNode(n) && isUnwrittenFunction(n.fn.name) ? seeThrough(n.args[0]) : n
}

/** A bare number or quantity such as `2.0 kg` or `-3`, with nothing to compute. */
export function isLiteral(n: MathNode): boolean {
  n = unwrap(n)
  if (isConstantNode(n) || isLitCall(n)) return true
  if (isOp(n, OP.unaryMinus)) return isLiteral(n.args[0])
  if (isOp(n, OP.multiply) && isUnitCall(n.args[1])) return isLiteral(n.args[0])
  return false
}

/**
 * A tuple of typed values, made by a call to one of `tupleFunctions` (a module's:
 * a vector, `<3.0, 4.0> N`, `<1.0 m, 2.0 m>`), with a unit after it or not.
 */
export function isTupleLiteral(n: MathNode, tupleFunctions: (name: string) => boolean): boolean {
  n = unwrap(n)
  if (isOp(n, OP.multiply) && isUnitCall(n.args[1])) n = unwrap(n.args[0])
  return isFunctionNode(n) && tupleFunctions(n.fn.name) && n.args.every(isLiteral)
}

/** An expression made only of number literals and arithmetic, like `-(0.5)` or `3/2`. */
export function isPureNumber(n: MathNode): boolean {
  n = unwrap(n)
  if (isConstantNode(n)) return typeof n.value === 'number'
  if (isLitCall(n)) return true
  if (isOperatorNode(n)) return n.args.every(isPureNumber)
  return false
}

/** `x to unit`. */
export const isConversion = (n: MathNode) => isOp(n, OP.to)
