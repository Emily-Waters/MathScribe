/**
 * An expression as the working shows it, as LaTeX: products as in a textbook
 * (ma, 2.00 kg × 9.81 m/s²), a unit after its number, a condition's cases,
 * `@inv(x)` as its fraction turned over, a name as its display name, the
 * sheet's functions as f(x), a module's as it says; and, for the substitution
 * step, each variable as its value at its own sig figs. While a call's working
 * is shown, its parameters are written as the arguments it was given
 * (`paramAliases`, set by the Calculator's traceCall).
 */
import { EXACT } from '../../maths/sigfigs.ts'
import type { Variable } from '../../sheet/values.ts'
import {
  INV_FUNCTION, JOIN, TUPLE_FUNCTION, parseNumberedName, parseSeriesStatName, seriesMemberName, seriesStatName,
} from '../../sheet/names.ts'
import { SIGN, SUBSCRIPT, inClass, regex, src } from '../../syntax.ts'
import {
  FN, OP, call as callExpr, constant, copyExpr, exprTex, findAll, formatValue, isCall, isConditional, isConstant, isLibraryName, isOp,
  isSymbol, operator, paren, symbol, transform, type CallExpr, type Expr, type SymbolExpr, type TexOptions,
} from '../../maths/library/index.ts'
import { isTuple } from './math.ts'
import type { EngineModule, ModuleHost } from './module.ts'
import { RAW, rawNode, type CalcOptions } from './results.ts'
import { CASE_WORDS, attachUnit, caseTex, isLitCall, isUnitCall, numberTex, splitUnit, symbolTex, unitCallText, unitTex } from './tex.ts'
import { isLiteral, unwrap } from './nodes.ts'
import { BUILTIN_CONSTANT_NAMES } from './literals.ts'
import { bracketed } from './tuples.ts'
import {
  EVERY_PRODUCT_SIGN, PRODUCT_SIGN, SIDE, inScientificNotation, isNumberWithUnit, needsBrackets, productSeparator, type Side,
} from './products.ts'
import type { ValueTex } from './valueTex.ts'
import { TEX_GROUP, TEX_ROUND, TEX_ROW_BREAK } from '../../latex/syntax.ts'

/** Spaces right after a group's brace or a round bracket opens, which the library's LaTeX leaves (1: the brace or bracket). */
const SPACE_AFTER_OPENING = regex(src`([${inClass(TEX_GROUP.open, TEX_ROUND.open)}])\s+`, 'g')

/** What the working's LaTeX needs of the Calculator: its variables and values, options, modules, and how values are shown. */
export interface WorkingTexHost {
  variable(name: string): Variable | undefined
  /** How a name is shown in place of its symbol, if it is: a variable's or a series' display name (see ShownName). */
  shownName(name: string): string | undefined
  value(name: string): unknown
  has(name: string): boolean
  options(): CalcOptions
  modules(): readonly EngineModule[]
  /** What the modules are given, for writing their own functions (EngineModule.functionTex). */
  moduleHost(): ModuleHost
  display(): ValueTex
}

export class WorkingTex {
  private readonly host: WorkingTexHost

  /**
   * While showing a call's working: parameter → TeX of the argument it was given,
   * so psi_prob(r, psi_200) shows 4πr²ψ₂₀₀², not 4πr²ψ².
   */
  paramAliases = new Map<string, Expr>()

  /**
   * While showing a call's working: a parameter given a series → the series' name,
   * so the parameter and the names made from it show as the series' own: x as t,
   * x[3] as t₃, x.avg as t̄, and a row's x_i as t_i.
   */
  seriesAliases = new Map<string, string>()

  /** The series a name given as an argument stands for, through the calls around this one: x, given t, is t. */
  seriesAliasOf(name: string): string {
    return this.seriesAliases.get(name) ?? name
  }

  /** A name as LaTeX, a series parameter's (or one made from it) as the series it was given: x__avg → t̄. */
  seriesNameTex(name: string): string {
    return symbolTex(this.seriesRenamed(name) ?? name)
  }

  /** A series parameter's name, or one made from it, as the series it was given: x__avg → t__avg; undefined if it's neither. */
  private seriesRenamed(name: string): string | undefined {
    const whole = this.seriesAliases.get(name)
    if (whole) return whole
    const member = parseNumberedName(name)
    const memberOf = member && this.seriesAliases.get(member.base)
    if (memberOf) return seriesMemberName(memberOf, member.n)
    const stat = parseSeriesStatName(name)
    const statOf = stat && this.seriesAliases.get(stat.base)
    if (statOf) return seriesStatName(statOf, stat.suffix)
    // A subscript on it, x_i: on the series, t_i (a parameter's name can't be another name's start: it's one letter's or word's).
    const at = name.indexOf(SUBSCRIPT)
    const subscripted = at > 0 && !name.startsWith(JOIN, at) ? this.seriesAliases.get(name.slice(0, at)) : undefined
    return subscripted ? `${subscripted}${name.slice(at)}` : undefined
  }

  constructor(host: WorkingTexHost) {
    this.host = host
  }

  /**
   * Put each aliased parameter's argument in place of the parameter, bracketed;
   * the automatic parentheses then keep the brackets only where needed
   * ((3.00 m/s)², but 2.00 kg·g).
   */
  withAliases(node: Expr): Expr {
    if (!this.paramAliases.size && !this.seriesAliases.size) return node
    return transform(node, (n, path) => {
      if (isSymbol(n) && path !== 'fn') {
        const renamed = this.seriesRenamed(n.name)
        if (renamed) return symbol(renamed)
      }
      const alias = isSymbol(n) && path !== 'fn' ? this.paramAliases.get(n.name) : undefined
      if (!alias) return n
      // Automatic brackets drop around a negative (2.0 m · −2.0); keep them, as the
      // substituted step does.
      if (isOp(alias, OP.unaryMinus)) {
        const saved = this.paramAliases
        this.paramAliases = new Map()
        try {
          return rawNode(`\\left(${this.tex(alias, new Map())}\\right)`)
        } finally {
          this.paramAliases = saved
        }
      }
      return paren(copyExpr(alias))
    })
  }

  /** A variable's value for the substitution step, at its own sig figs. */
  variableNode(name: string): Expr {
    const v = this.host.variable(name)
    if (v?.shown) return rawNode(v.shown)
    const display = this.host.display()
    return display.inNotation(v?.notation, () => display.inLook(v?.look,
      () => this.valueNode(this.host.value(name), v?.sf ?? EXACT, v?.declared === true)))
  }

  /**
   * TeX for an expression made only of numbers and built-in constants (pi, e,
   * tau, …), using at least one constant: `pi/4` → π/4 as a fraction. Bracketed
   * unless it's a single symbol, a fraction or a function call, so it can be
   * dropped into a substitution safely. Anything else (variables, units) → undefined.
   */
  constantForm(node: Expr, literals: Map<number, string>): string | undefined {
    const n = unwrap(node)
    const symbols = findAll(n, (c, path) => isSymbol(c) && path !== 'fn') as SymbolExpr[]
    if (!symbols.length) return undefined
    if (symbols.some((c) => !BUILTIN_CONSTANT_NAMES.has(c.name) || this.host.has(c.name))) return undefined
    if (findAll(n, (c) => isUnitCall(c)).length) return undefined
    const tex = this.tex(n, literals)
    const bare = isSymbol(n) || isCall(n) || (isOp(n, OP.divide))
    return bare ? tex : `\\left(${tex}\\right)`
  }

  /** Node standing in for a variable's value in the substitution step. */
  private valueNode(value: unknown, sf: number, forced = false): Expr {
    const display = this.host.display()
    // A tuple is already bracketed, (1.0, 2.0) m; a sum of unit vectors needs brackets, unless it has a unit.
    if (isTuple(value)) {
      return rawNode(bracketed(display.valueTex(value, sf, undefined, undefined, forced)))
    }
    const parts = display.split(value, sf, forced)
    if (!parts) return rawNode(`\\left(${display.valueTex(value, sf)}\\right)`)
    const numTex = numberTex(parts.num)
    // A negative value is bracketed, so its sign doesn't read as an operator:
    // ½ · (−9.81 m/s²) · t², not ½ · −9.81 m/s² · t².
    if (parts.num.startsWith(SIGN.minus)) {
      return rawNode(`\\left(${parts.unit ? attachUnit(numTex, unitTex(parts.unit)) : numTex}\\right)`)
    }
    if (!parts.unit) return rawNode(numTex)
    const unit = callExpr(FN.unit, [constant(parts.unit)])
    return paren(operator(OP.multiply, [rawNode(numTex), unit]))
  }

  /**
   * How a name is shown: its display name, if it has one; one made from another
   * name (`delta a`, `t.avg`) made from that name's display name, if it has one.
   */
  nameTex(name: string): string {
    return this.host.shownName(name) ?? symbolTex(name, (n) => this.host.shownName(n))
  }

  /** An expression as the working shows it, its numbers as typed (`literals`). */
  tex(node: Expr, literals: Map<number, string>): string {
    // Leading spaces keep the library's output such as `\cdot` from running into a name.
    const handler = (n: Expr, options: TexOptions): string | undefined => {
      if (isConstant(n) && typeof n.value === 'number') {
        return ` ${numberTex(literals.get(n.value) ?? formatValue(n.value, this.host.display().format))}`
      }
      if (isUnitCall(n)) return ` ${unitTex(unitCallText(n))}`
      if (isLitCall(n)) return ` ${numberTex(unitCallText(n))}`
      if (isOp(n, OP.multiply) && isUnitCall(n.args[1])) {
        return attachUnit(exprTex(n.args[0], options), unitTex(unitCallText(n.args[1])))
      }
      // -2.0 m, not -(2.0 m)
      if (isOp(n, OP.unaryMinus) && (isNumberWithUnit(unwrap(n.args[0])) || isLiteral(n.args[0]))) {
        return ` -${exprTex(unwrap(n.args[0]), options).trim()}`
      }
      // Products as in a textbook, ma, ½mv², 2.00 kg × 9.81 m/s² (or with every dot, if the option is on).
      if (isOp(n, OP.multiply)) {
        const factor = (a: Expr, side: Side) => {
          const tex = exprTex(a, options).trim()
          return needsBrackets(a, side) ? `\\left(${tex}\\right)` : tex
        }
        // A display name is words, so it's set apart from its neighbour with ×:
        // Molarity of EDTA × Average volume of EDTA.
        const labelled = (node: Expr, side: Side): boolean => {
          const e = unwrap(node)
          if (isOp(e, OP.multiply)) return labelled(side === SIDE.right ? e.args[e.args.length - 1] : e.args[0], side)
          return isSymbol(e) && this.host.variable(e.name)?.label !== undefined
        }
        const separator = (l: Expr, r: Expr) => (labelled(l, SIDE.right) || labelled(r, SIDE.left)
          ? PRODUCT_SIGN
          : this.host.options().productDots ? EVERY_PRODUCT_SIGN : productSeparator(l, r))
        return ` ${n.args.slice(1).reduce((out, a, i) => `${out}${separator(n.args[i], a)}${factor(a, SIDE.right)}`,
          factor(n.args[0], SIDE.left))}`
      }
      // A condition inside a condition's last case (`c1 ? a : (c2 ? b : c)`) is one more case of the same brace.
      if (isConditional(n)) {
        const cases: string[] = []
        let at: Expr = n
        for (; isConditional(at); at = unwrap(at.falseExpr)) {
          cases.push(caseTex(exprTex(at.trueExpr, options), `\\text{${CASE_WORDS.if}}\\; ${exprTex(at.condition, options)}`))
        }
        cases.push(caseTex(exprTex(at, options), `\\text{${CASE_WORDS.otherwise}}`))
        return `\\begin{cases} ${cases.join(TEX_ROW_BREAK)}\\end{cases}`
      }
      // A value in scientific notation raised to a power is bracketed: (7.07 × 10⁻²)², not 7.07 × 10⁻²².
      if (isOp(n, OP.pow)) {
        const base = unwrap(n.args[0])
        if (isSymbol(base) && inScientificNotation(base)) {
          return `\\left(${base.name.slice(1)}\\right)^{${exprTex(n.args[1], options).trim()}}`
        }
      }
      if (isSymbol(n)) {
        if (n.name.startsWith(RAW)) return ` ${n.name.slice(1)}`
        return ` ${this.nameTex(n.name)}`
      }
      // `@inv(x)`: a fraction turned over, m/V as V/m; a value whose unit is one,
      // 18.015 g/mol as 1 mol / 18.015 g (a conversion factor turned over); anything else, 1/x.
      if (isCall(n) && n.fn.name === INV_FUNCTION) {
        const arg = unwrap(n.args[0])
        const tex = (a: Expr) => exprTex(a, options).trim()
        if (isOp(arg, OP.divide)) return `\\frac{${tex(arg.args[1])}}{${tex(arg.args[0])}}`
        if (isNumberWithUnit(arg)) {
          const unit = splitUnit(unitCallText(arg.args[1] as CallExpr))
          if (unit) return `\\frac{${attachUnit('1', unitTex(unit.below))}}{${attachUnit(tex(arg.args[0]), unitTex(unit.above))}}`
        }
        return `\\frac{1}{${tex(n.args[0])}}`
      }
      if (isCall(n) && n.fn.name === TUPLE_FUNCTION) {
        return `\\left(${n.args.map((a) => exprTex(a, options).trim()).join(', ')}\\right)`
      }
      // A module's own functions (giving a value its species, `{H2O}`; a vector, ⟨…⟩) are written as it says.
      if (isCall(n)) {
        for (const m of this.host.modules()) {
          const tex = m.functionTex(n, (a) => exprTex(a, options).trim(), this.host.moduleHost())
          if (tex !== undefined) return tex
        }
      }
      if (isCall(n) && (!isLibraryName(n.fn.name) || typeof this.host.value(n.fn.name) === 'function')) {
        // User-defined function (even one named like a built-in, e.g. sum): f(x), not \mathrm{f}(x)
        return ` ${symbolTex(n.fn.name)}\\left(${n.args.map((a) => exprTex(a, options).trim()).join(', ')}\\right)`
      }
      return undefined
    }
    return exprTex(this.withAliases(node), { handler })
      .replace(SPACE_AFTER_OPENING, '$1')
      .trim()
  }
}
