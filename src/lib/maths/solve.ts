/**
 * Symbolic equation solving for `@solve(lhs = rhs, x)`.
 *
 *   1. If x appears once, undo the operations around it, outermost first:
 *      v² = 2·a·d  →  d = v² / (2·a)
 *   2. Otherwise, if the equation is linear or quadratic in x, collect terms
 *      (using symbolic derivatives) and use x = −c/b or the quadratic formula.
 *
 * Results are ordinary expression trees, so units, sig figs, uncertainty and
 * substitution all work on them like on any other formula. When a step can
 * lose solutions (even powers, abs, sin, cos), every branch is returned, the
 * principal one first.
 */
import {
  FN, MATH_CONSTANT, OP, call, constant, derivative, findAll, isCall, isConstant, isOp, isOperator, isParen, isSymbol, mapParts,
  operator, paren, simplify, symbol, transform, type Expr,
} from './library/index.ts'

/** What kind of polynomial @solve(…) found f to be in x. */
export const POLYNOMIAL_KIND = { linear: 'linear', quadratic: 'quadratic' } as const
export type PolynomialKind = (typeof POLYNOMIAL_KIND)[keyof typeof POLYNOMIAL_KIND]

/** Whether `node` uses the variable `x` (not counting function names). */
export function contains(node: Expr, x: string): boolean {
  return countOccurrences(node, x) > 0
}

/** How many times `x` appears in an expression. */
export function countOccurrences(node: Expr, x: string): number {
  return findAll(node, (n, path) => isSymbol(n) && n.name === x && path !== 'fn').length
}

/** A constant number written as such (possibly negated or bracketed), else undefined. */
function numericValue(n: Expr): number | undefined {
  if (isParen(n)) return numericValue(n.content)
  if (isConstant(n) && typeof n.value === 'number') return n.value
  if (isOp(n, OP.unaryMinus)) {
    const v = numericValue(n.args[0])
    return v === undefined ? undefined : -v
  }
  return undefined
}

/** Rearranges an equation for an unknown, when it can be done exactly. */
export class Solver {
  private C = (v: number) => constant(v)
  private P = (n: Expr) => paren(n)
  private fn = (name: string, args: Expr[]) => call(name, args)
  private add = (a: Expr, b: Expr) => operator(OP.add, [a, b])
  private sub = (a: Expr, b: Expr) => operator(OP.subtract, [a, this.P(b)])
  private mul = (a: Expr, b: Expr) => operator(OP.multiply, [this.P(a), this.P(b)])
  private div = (a: Expr, b: Expr) => operator(OP.divide, [this.P(a), this.P(b)])
  private pow = (a: Expr, b: Expr) => operator(OP.pow, [this.P(a), b])
  private neg = (a: Expr) => operator(OP.unaryMinus, [this.P(a)])

  /**
   * Solve `side = other` for x, where x appears exactly once in `side` and not in
   * `other`. Returns every branch (principal first), or null if a step can't be undone.
   */
  isolate(side: Expr, other: Expr, x: string): Expr[] | null {
    if (isSymbol(side) && side.name === x) return [other]
    if (isParen(side)) return this.isolate(side.content, other, x)
    const both = (...branches: (Expr[] | null)[]) => {
      const ok = branches.filter((b): b is Expr[] => b !== null)
      return ok.length ? ok.flat() : null
    }

    if (isOperator(side)) {
      const [a, b] = side.args
      const inA = contains(a, x)
      switch (side.fn) {
        case OP.unaryMinus:
          return this.isolate(a, this.neg(other), x)
        case OP.unaryPlus:
          return this.isolate(a, other, x)
        case OP.add:
          return inA ? this.isolate(a, this.sub(other, b), x) : this.isolate(b, this.sub(other, a), x)
        case OP.subtract:
          return inA ? this.isolate(a, this.add(other, b), x) : this.isolate(b, this.sub(a, other), x)
        case OP.multiply:
          return inA ? this.isolate(a, this.div(other, b), x) : this.isolate(b, this.div(other, a), x)
        case OP.divide:
          return inA ? this.isolate(a, this.mul(other, b), x) : this.isolate(b, this.div(a, other), x)
        case OP.pow: {
          if (!inA) {
            // a^x = O  →  x = ln(O) / ln(a), or ln(O) for e^x
            const base = isSymbol(a) && a.name === MATH_CONSTANT.e
            return this.isolate(b, base ? this.fn(FN.log, [other]) : this.div(this.fn(FN.log, [other]), this.fn(FN.log, [a])), x)
          }
          const n = numericValue(b)
          if (n === 2) {
            const root = this.fn(FN.sqrt, [other])
            return both(this.isolate(a, root, x), this.isolate(a, this.neg(root), x))
          }
          const root = this.pow(other, this.P(this.div(this.C(1), b)))
          if (n !== undefined && Number.isInteger(n) && n % 2 === 0) {
            return both(this.isolate(a, root, x), this.isolate(a, this.neg(root), x))
          }
          return this.isolate(a, root, x)
        }
      }
      return null
    }

    if (isCall(side) && side.args.length === 1) {
      const u = side.args[0]
      switch (side.fn.name) {
        case FN.sqrt:
          return this.isolate(u, this.pow(other, this.C(2)), x)
        case FN.cbrt:
          return this.isolate(u, this.pow(other, this.C(3)), x)
        case FN.exp:
          return this.isolate(u, this.fn(FN.log, [other]), x)
        case FN.log:
          return this.isolate(u, this.fn(FN.exp, [other]), x)
        case FN.log10:
          return this.isolate(u, this.pow(this.C(10), this.P(other)), x)
        case FN.sin:
          return both(
            this.isolate(u, this.fn(FN.asin, [other]), x),
            this.isolate(u, this.sub(symbol(MATH_CONSTANT.pi), this.fn(FN.asin, [other])), x),
          )
        case FN.cos:
          return both(this.isolate(u, this.fn(FN.acos, [other]), x), this.isolate(u, this.neg(this.fn(FN.acos, [other])), x))
        case FN.tan:
          return this.isolate(u, this.fn(FN.atan, [other]), x)
        case FN.asin:
          return this.isolate(u, this.fn(FN.sin, [other]), x)
        case FN.acos:
          return this.isolate(u, this.fn(FN.cos, [other]), x)
        case FN.atan:
          return this.isolate(u, this.fn(FN.tan, [other]), x)
        case FN.abs:
          return both(this.isolate(u, other, x), this.isolate(u, this.neg(other), x))
      }
    }
    return null
  }

  /**
   * Solve f = 0 when f is linear or quadratic in x. Parts of f that don't involve
   * x and contain function calls (quantities with units, numbers kept as typed,
   * which mathjs can't differentiate or would fold away) are swapped for
   * placeholder symbols first, then put back in the answer. Plain arithmetic on
   * numbers and names is left in, so it can simplify (4 · ½ → 2).
   */
  polynomial(f: Expr, x: string): { kind: PolynomialKind; solutions: Expr[] } | null {
    const saved = new Map<string, Expr>()
    const hasCall = (n: Expr) => findAll(n, (c) => isCall(c)).length > 0
    const abstract = (n: Expr): Expr => {
      if (!contains(n, x)) {
        if (!hasCall(n)) return n
        const name = `K__${saved.size}`
        saved.set(name, n)
        return symbol(name)
      }
      return mapParts(n, (child, path) => (path === 'fn' ? child : abstract(child)))
    }
    const restore = (n: Expr) =>
      transform(n, (s) => (isSymbol(s) && saved.has(s.name) ? this.P(saved.get(s.name)!) : s))
    const isZero = (n: Expr) => numericValue(n) === 0
    const at0 = (n: Expr) =>
      simplify(transform(n, (s) => (isSymbol(s) && s.name === x ? this.C(0) : s)))

    try {
      const g = abstract(f)
      const d1 = simplify(derivative(g, x))
      const d2 = simplify(derivative(d1, x))
      const d3 = simplify(derivative(d2, x))
      if (!isZero(d3)) return null
      const b = at0(d1)
      const c = at0(g)
      if (isZero(d2)) {
        if (isZero(b)) return null
        return { kind: POLYNOMIAL_KIND.linear, solutions: [restore(simplify(this.div(this.neg(c), b)))] }
      }
      const a = simplify(this.div(d2, this.C(2)))
      const disc = this.sub(this.pow(b, this.C(2)), this.mul(this.mul(this.C(4), a), c))
      const plus = this.div(this.add(this.neg(b), this.fn(FN.sqrt, [disc])), this.mul(this.C(2), a))
      const minus = this.div(this.sub(this.neg(b), this.fn(FN.sqrt, [disc])), this.mul(this.C(2), a))
      return { kind: POLYNOMIAL_KIND.quadratic, solutions: [restore(simplify(plus)), restore(simplify(minus))] }
    } catch {
      return null
    }
  }
}
