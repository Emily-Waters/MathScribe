/**
 * Symbolic equation solving for `solve(lhs = rhs, x)`.
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
  isConstantNode,
  isFunctionNode,
  isOperatorNode,
  isParenthesisNode,
  isSymbolNode,
  type MathJsInstance,
  type MathNode,
} from 'mathjs'

/** Whether `node` uses the variable `x` (not counting function names). */
export function contains(node: MathNode, x: string): boolean {
  return node.filter((n, path) => isSymbolNode(n) && n.name === x && path !== 'fn').length > 0
}

export function countOccurrences(node: MathNode, x: string): number {
  return node.filter((n, path) => isSymbolNode(n) && n.name === x && path !== 'fn').length
}

/** A constant number written as such (possibly negated or bracketed), else undefined. */
function numericValue(n: MathNode): number | undefined {
  if (isParenthesisNode(n)) return numericValue(n.content)
  if (isConstantNode(n) && typeof n.value === 'number') return n.value
  if (isOperatorNode(n) && n.fn === 'unaryMinus') {
    const v = numericValue(n.args[0])
    return v === undefined ? undefined : -v
  }
  return undefined
}

export class Solver {
  private math: MathJsInstance

  constructor(math: MathJsInstance) {
    this.math = math
  }

  private C = (v: number) => new this.math.ConstantNode(v)
  private P = (n: MathNode) => new this.math.ParenthesisNode(n)
  private fn = (name: string, args: MathNode[]) => new this.math.FunctionNode(new this.math.SymbolNode(name), args)
  private add = (a: MathNode, b: MathNode) => new this.math.OperatorNode('+', 'add', [a, b])
  private sub = (a: MathNode, b: MathNode) => new this.math.OperatorNode('-', 'subtract', [a, this.P(b)])
  private mul = (a: MathNode, b: MathNode) => new this.math.OperatorNode('*', 'multiply', [this.P(a), this.P(b)])
  private div = (a: MathNode, b: MathNode) => new this.math.OperatorNode('/', 'divide', [this.P(a), this.P(b)])
  private pow = (a: MathNode, b: MathNode) => new this.math.OperatorNode('^', 'pow', [this.P(a), b])
  private neg = (a: MathNode) => new this.math.OperatorNode('-', 'unaryMinus', [this.P(a)])

  /**
   * Solve `side = other` for x, where x appears exactly once in `side` and not in
   * `other`. Returns every branch (principal first), or null if a step can't be undone.
   */
  isolate(side: MathNode, other: MathNode, x: string): MathNode[] | null {
    if (isSymbolNode(side) && side.name === x) return [other]
    if (isParenthesisNode(side)) return this.isolate(side.content, other, x)
    const both = (...branches: (MathNode[] | null)[]) => {
      const ok = branches.filter((b): b is MathNode[] => b !== null)
      return ok.length ? ok.flat() : null
    }

    if (isOperatorNode(side)) {
      const [a, b] = side.args
      const inA = contains(a, x)
      switch (side.fn) {
        case 'unaryMinus':
          return this.isolate(a, this.neg(other), x)
        case 'unaryPlus':
          return this.isolate(a, other, x)
        case 'add':
          return inA ? this.isolate(a, this.sub(other, b), x) : this.isolate(b, this.sub(other, a), x)
        case 'subtract':
          return inA ? this.isolate(a, this.add(other, b), x) : this.isolate(b, this.sub(a, other), x)
        case 'multiply':
          return inA ? this.isolate(a, this.div(other, b), x) : this.isolate(b, this.div(other, a), x)
        case 'divide':
          return inA ? this.isolate(a, this.mul(other, b), x) : this.isolate(b, this.div(a, other), x)
        case 'pow': {
          if (!inA) {
            // a^x = O  →  x = ln(O) / ln(a), or ln(O) for e^x
            const base = isSymbolNode(a) && a.name === 'e'
            return this.isolate(b, base ? this.fn('log', [other]) : this.div(this.fn('log', [other]), this.fn('log', [a])), x)
          }
          const n = numericValue(b)
          if (n === 2) {
            const root = this.fn('sqrt', [other])
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

    if (isFunctionNode(side) && side.args.length === 1) {
      const u = side.args[0]
      switch (side.fn.name) {
        case 'sqrt':
          return this.isolate(u, this.pow(other, this.C(2)), x)
        case 'cbrt':
          return this.isolate(u, this.pow(other, this.C(3)), x)
        case 'exp':
          return this.isolate(u, this.fn('log', [other]), x)
        case 'log':
          return this.isolate(u, this.fn('exp', [other]), x)
        case 'log10':
          return this.isolate(u, this.pow(this.C(10), this.P(other)), x)
        case 'sin':
          return both(
            this.isolate(u, this.fn('asin', [other]), x),
            this.isolate(u, this.sub(new this.math.SymbolNode('pi'), this.fn('asin', [other])), x),
          )
        case 'cos':
          return both(this.isolate(u, this.fn('acos', [other]), x), this.isolate(u, this.neg(this.fn('acos', [other])), x))
        case 'tan':
          return this.isolate(u, this.fn('atan', [other]), x)
        case 'asin':
          return this.isolate(u, this.fn('sin', [other]), x)
        case 'acos':
          return this.isolate(u, this.fn('cos', [other]), x)
        case 'atan':
          return this.isolate(u, this.fn('tan', [other]), x)
        case 'abs':
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
  polynomial(f: MathNode, x: string): { kind: 'linear' | 'quadratic'; solutions: MathNode[] } | null {
    const math = this.math
    const saved = new Map<string, MathNode>()
    const hasCall = (n: MathNode) => n.filter((c) => isFunctionNode(c)).length > 0
    const abstract = (n: MathNode): MathNode => {
      if (!contains(n, x)) {
        if (!hasCall(n)) return n
        const name = `K__${saved.size}`
        saved.set(name, n)
        return new math.SymbolNode(name)
      }
      return n.map((child, path) => (path === 'fn' ? child : abstract(child)))
    }
    const restore = (n: MathNode) =>
      n.transform((s) => (isSymbolNode(s) && saved.has(s.name) ? this.P(saved.get(s.name)!) : s))
    const isZero = (n: MathNode) => numericValue(n) === 0
    const at0 = (n: MathNode) =>
      math.simplify(n.transform((s) => (isSymbolNode(s) && s.name === x ? this.C(0) : s)))

    try {
      const g = abstract(f)
      const d1 = math.simplify(math.derivative(g, x))
      const d2 = math.simplify(math.derivative(d1, x))
      const d3 = math.simplify(math.derivative(d2, x))
      if (!isZero(d3)) return null
      const b = at0(d1)
      const c = at0(g)
      if (isZero(d2)) {
        if (isZero(b)) return null
        return { kind: 'linear', solutions: [restore(math.simplify(this.div(this.neg(c), b)))] }
      }
      const a = math.simplify(this.div(d2, this.C(2)))
      const disc = this.sub(this.pow(b, this.C(2)), this.mul(this.mul(this.C(4), a), c))
      const plus = this.div(this.add(this.neg(b), this.fn('sqrt', [disc])), this.mul(this.C(2), a))
      const minus = this.div(this.sub(this.neg(b), this.fn('sqrt', [disc])), this.mul(this.C(2), a))
      return { kind: 'quadratic', solutions: [restore(math.simplify(plus)), restore(math.simplify(minus))] }
    } catch {
      return null
    }
  }
}

/** Split `a = b` at its one top-level `=` (or `==`), ignoring <=, >=, !=. */
export function splitEquation(text: string): [string, string] | null {
  let depth = 0
  let at = -1
  let width = 1
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === '=' && depth === 0) {
      if ('<>!'.includes(text[i - 1] ?? '')) continue
      if (at >= 0) return null // more than one =
      at = i
      width = text[i + 1] === '=' ? 2 : 1
      i += width - 1
    }
  }
  return at < 0 ? null : [text.slice(0, at).trim(), text.slice(at + width).trim()]
}

/** Split function arguments at top-level commas. */
export function splitArgs(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === ',' && depth === 0) {
      out.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  out.push(text.slice(start).trim())
  return out
}

/** Index of the bracket closing the one at `open`, or -1. */
export function matchingParen(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return i
  }
  return -1
}
