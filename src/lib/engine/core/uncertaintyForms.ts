/**
 * The shapes of formula whose uncertainty is worked out relatively, as it's
 * often taught (CalcOptions.uncertaintyWorking): a product, quotient or power
 * of the inputs, Y = c A B² / C (δY = Y √((δA/A)² + (2 δB/B)² + (δC/C)²)), and
 * a sum or difference of them, Y = A + B − C (δY = √(δA² + δB² + δC²)). Any
 * other formula is neither, and its working is by derivatives.
 */
import { isFunctionNode, isParenthesisNode, isSymbolNode, type MathNode } from 'mathjs'
import { OP, isOp } from '../../maths/mathjsNames.ts'

/** The function a square root is, as mathjs names it (`sqrt(A)` is A to the ½). */
const SQRT = 'sqrt'

/** Whether a node uses any of the inputs (a constant, a unit or a variable with no uncertainty doesn't). */
const usesAny = (node: MathNode, inputs: ReadonlySet<string>) =>
  node.filter((n) => isSymbolNode(n) && inputs.has(n.name)).length > 0

/** A node's value if it's a plain number, uses no variable (an exponent: `2`, `-1`, `1/2`), else undefined. */
function numberOf(node: MathNode): number | undefined {
  try {
    const v = node.compile().evaluate({}) as unknown
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  } catch {
    return undefined
  }
}

/**
 * Each input's power in a formula that's a product, quotient or power of them
 * (times anything with no uncertainty): `4 * pi^2 * m / k` → m: 1, k: −1;
 * `sqrt(L / g)` → L: ½. Undefined if it's anything else (an input in a sum or
 * a function: `(A + B) / C`, `sin(θ)`), or an input's powers cancel (A / A).
 */
export function productPowers(def: MathNode, inputs: readonly string[]): Map<string, number> | undefined {
  const names = new Set(inputs)
  const powers = new Map<string, number>()
  const visit = (node: MathNode, power: number): boolean => {
    if (!usesAny(node, names)) return true
    if (isParenthesisNode(node)) return visit(node.content, power)
    if (isSymbolNode(node)) {
      powers.set(node.name, (powers.get(node.name) ?? 0) + power)
      return true
    }
    if (isOp(node, OP.multiply)) return node.args.every((a) => visit(a, power))
    if (isOp(node, OP.divide)) return visit(node.args[0], power) && visit(node.args[1], -power)
    if (isOp(node, OP.unaryMinus, OP.unaryPlus)) return visit(node.args[0], power)
    if (isOp(node, OP.pow)) {
      const n = numberOf(node.args[1])
      return n !== undefined && visit(node.args[0], power * n)
    }
    if (isFunctionNode(node) && node.fn.name === SQRT && node.args.length === 1) return visit(node.args[0], power / 2)
    return false
  }
  if (!visit(def, 1)) return undefined
  if (inputs.some((n) => !powers.get(n))) return undefined
  return new Map(inputs.map((n) => [n, powers.get(n)!]))
}

/**
 * Whether a formula is a sum or difference of the inputs, each once and on its
 * own (and anything with no uncertainty): `A + B - C`, `L - 0.5 m`. Not `2 A + B`
 * (a multiple's uncertainty is a multiple's: by derivatives), nor `A + A`.
 */
export function isSumOfInputs(def: MathNode, inputs: readonly string[]): boolean {
  const names = new Set(inputs)
  const seen: string[] = []
  const visit = (node: MathNode): boolean => {
    if (!usesAny(node, names)) return true
    if (isParenthesisNode(node)) return visit(node.content)
    if (isSymbolNode(node)) {
      seen.push(node.name)
      return true
    }
    if (isOp(node, OP.add, OP.subtract)) return node.args.every(visit)
    if (isOp(node, OP.unaryMinus, OP.unaryPlus)) return visit(node.args[0])
    return false
  }
  return visit(def) && seen.length === inputs.length && new Set(seen).size === seen.length
}

/** An input's power as a factor in its relative term, written: `2`, `\frac{1}{2}`, `3` (its sign is squared away). */
export function powerTex(power: number): string {
  const n = Math.abs(power)
  if (Number.isInteger(n)) return String(n)
  if (Number.isInteger(n * 2)) return `\\frac{${n * 2}}{2}`
  return String(n)
}
