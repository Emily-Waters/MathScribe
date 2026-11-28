/** What evaluating a line gives back, and how its equation is laid out. */
import { PERCENT, KEYWORD, DISPLAY_MODE, SIGIL, regex, src, words, type DisplayMode, type Notation, type Precision, type WordOf } from '../../syntax.ts'
import { seriesMemberName } from '../../sheet/names.ts'
import { FunctionMember, builtinAt } from '../../builtins.ts'
import type { VariableSummary } from '../../sheet/values.ts'
import { MATHS_ERROR, mathsError, symbol, type Expr } from '../../maths/library/index.ts'
import { moduleReadableMessage, unitMismatchNotes, type LookSetting } from './module.ts'

/**
 * The precision setting that tracks significant figures from the measured
 * values and rounds each result accordingly (rather than a fixed number of them).
 */
export const AUTO_PRECISION = 'auto'

/**
 * How many sig figs an uncertainty is quoted to with a fixed precision (with
 * AUTO_PRECISION, the convention decides: see uncertaintySigFigs).
 */
export const FIXED_UNCERTAINTY_SIG_FIGS = 2

/** Settings for evaluating a sheet (the Output options). */
export interface CalcOptions {
  /** AUTO_PRECISION, or a number: show every result to that many sig figs. */
  precision: number | typeof AUTO_PRECISION
  /** Show the step with variable values substituted in. */
  showSubstitution: boolean
  /**
   * Use ≈ before every rounded result. Off: ≈ only when every input is exact
   * (1/3 ≈ 0.333), since a measured result's sig figs already say it's rounded.
   */
  approxRounded?: boolean
  /**
   * Show a dot between every pair of factors (m·a). Off: products are written
   * as in a textbook, ma, ½mv², mg cos θ, with × only where it's needed to keep
   * numbers and units apart (2.0 kg × 9.81 m/s²).
   */
  productDots?: boolean
  /** How `delta F`'s working is written (UNCERTAINTY_WORKING): by partial derivatives (the default), or relatively. */
  uncertaintyWorking?: UncertaintyWorking
}

/**
 * How `delta F`'s working is written. The result is the same either way (each
 * is first-order propagation in quadrature); only the working differs:
 *
 *   derivatives   δY = √((∂Y/∂A · δA)² + (∂Y/∂B · δB)² + …), for any formula
 *   relative      δY = Y √((δA/A)² + (n δB/B)² + …) for products, quotients and
 *                 powers, and δY = √(δA² + δB²) for sums and differences, as
 *                 it's often taught; any other formula as by derivatives
 */
export const UNCERTAINTY_WORKING = words({ derivatives: 'derivatives', relative: 'relative' })
export type UncertaintyWorking = WordOf<typeof UNCERTAINTY_WORKING>

/** The pieces of an equation, put together by layoutEquation. */
export interface EquationParts {
  lhs?: string
  expr: string
  steps: string[]
  result?: string
  /** The expression is a single name (`t.avg`, `delta F`), so it reads as a left-hand side. */
  bareSymbol?: boolean
  /** The result is rounded and follows ≈, not =. */
  approx?: boolean
}

/** Join the parts of a calculation with `=`, keeping only what `mode` asks for. */
export function layoutEquation(mode: DisplayMode, p: EquationParts, multiline = false): string {
  let parts: (string | undefined)[]
  if (mode === DISPLAY_MODE.sym) {
    // For a bare name, its defining formula is the first step (δF = √(…), t̄ = (1/n)Σ tᵢ).
    parts = p.bareSymbol ? [p.lhs, p.expr, p.steps[0]] : [p.lhs, p.expr]
  } else if (mode === DISPLAY_MODE.val) {
    const name = p.lhs ?? (p.bareSymbol ? p.expr : undefined)
    parts = p.result === undefined ? [p.lhs, p.expr] : [name, p.result]
  } else {
    parts = [p.lhs, p.expr, ...p.steps, p.result]
  }
  const shown = parts.filter((s): s is string => !!s)
  // Steps that differ only in spacing (`- 2.0` vs `-2.0`) look the same, so show one.
  const key = (s: string) => s.replace(/\s+/g, '')
  const steps = shown.filter((s, i) => i === 0 || key(s) !== key(shown[i - 1]))
  // The relation before each step after the first: =, or ≈ before a rounded result.
  const rels = steps.slice(1).map((s, i) =>
    p.approx && i === steps.length - 2 && s === p.result ? '\\approx' : '=')
  // .multiline: each `=` on its own row, lined up (a single = stays on one line).
  if (multiline && steps.length > 2) {
    const rows = steps.slice(1).map((s, i) => `&${rels[i]} ${s}`)
    return `\\begin{aligned}${steps[0]} ${rows.join(' \\\\ ')}\\end{aligned}`
  }
  return steps.reduce((out, s, i) => (i === 0 ? s : `${out} ${rels[i - 1]} ${s}`), '')
}

/** One equation of working from inside a function call. */
export interface TraceLine {
  tex: string
  note?: string
}

/** A line, evaluated: its LaTeX, and anything to say about it. */
export interface CalcResult {
  tex: string
  /**
   * Working from inside the sheet's functions called on this line, shown before
   * the line itself.
   */
  trace?: TraceLine[]
  error?: string
  warning?: string
  /** Something worth knowing that isn't a problem, e.g. other solutions of an equation. */
  info?: string
  /**
   * A drawing a module makes of the line, shown above its equation: a `@plot(…)`
   * line's plot (its `tex` is then the fits' equations, if any). Its kind is the
   * module's (EngineModule.figureKinds).
   */
  figure?: ResultBlock
  /**
   * A line a module shows as a block of its own kind rather than as an
   * equation (`@table(…)`'s table): the line's note, messages and hiding go
   * with it. Its `tex` is then unused.
   */
  block?: ResultBlock
  /** What the line assigned, each as it stands after it: its value at this line, for the editor's hover. */
  assigned?: VariableSummary[]
  /** Its result alone, `19.6\,\mathrm{N}` (≈ if `approx`), for the editor's inline results; none for a value typed as it is. */
  result?: LineValue
  /**
   * What a select or a named plot made, for suggestions: each variable's inside
   * name (a__x_1); a series by its first and last members, the first standing
   * for `members` of them, as an import's columns are.
   */
  defines?: Definition[]
}

/** A line's result alone, and whether it's rounded (shown after ≈ rather than =). */
export interface LineValue {
  readonly tex: string
  readonly approx: boolean
}

/** A block of a module's own kind a line is shown as (CalcResult.block): its kind (EngineModule.blockKinds) and what it shows. */
export interface ResultBlock {
  readonly type: string
  readonly data: unknown
}

/** A variable a line made, for suggestions (see CalcResult.defines). */
export interface Definition {
  name: string
  members?: number
}

/**
 * A call to a function there's none of, explained when it's one of MathScribe's
 * written without its @: `table(t, x)` → write @table(t, x).
 */
export function builtinCallHint(message: string): string {
  const error = mathsError(message)
  if (error.kind !== MATHS_ERROR.undefinedFunction || !(builtinAt([error.name]) instanceof FunctionMember)) return message
  return `There's no function ${error.name}: MathScribe's is written with an @, as ${SIGIL}${error.name}(…).`
}

/** A problem with a line, explained as it should be shown (not an unexpected error's message). */
export class ExplainedError extends Error {}

/** An error nothing expected, as a message for its line. */
export const unexpectedError = (e: unknown): string =>
  `This couldn't be worked out: ${e instanceof Error ? e.message : String(e)}`

/** A series' first and last members as Definitions (just the one, if that's all it has). */
export const seriesDefinitions = (base: string, count: number): Definition[] => (count > 1
  ? [{ name: seriesMemberName(base, 1), members: count - 1 }, { name: seriesMemberName(base, count), members: 1 }]
  : count === 1 ? [{ name: seriesMemberName(base, 1) }] : [])

/** What an imported column made: its variables (name_first … name_last) and the range of its values. */
export interface DataColumn {
  name: string
  unit?: string
  /** How many values (empty cells are skipped). */
  count: number
  /** The rows of its first and last values, so its variables run name_first … name_last. */
  first?: number
  last?: number
  /** The smallest and largest values, as LaTeX. */
  min?: string
  max?: string
  /** The column its uncertainties came from: `dx`, or `dx (%)`. */
  uncertainty?: string
}

/**
 * `.sci` / `.dec` for a line: the nearest `@layout` block's. A name's `:sci` or
 * `:dec` beats a variable's own notation (`x` after `x:sci = …`), which beats
 * the block's.
 */
export interface LineNotation {
  block?: Notation
}

/** Internal result of evaluating a line, with the pieces of its equation. */
export interface LineResult extends CalcResult {
  parts?: EquationParts
  /** Sig figs of the result. */
  sf?: number
  /** The notation the result is shown in. */
  notation?: Notation
}

/** A parsed line ready for evaluateParsed, with what the text stage worked out. */
export interface ParsedLine {
  uncNode?: Expr
  percent: boolean
  literals: Map<number, string>
  warnings: string[]
  mode: DisplayMode
  explicit: boolean
  /** Left-hand side to show when the line isn't an assignment (`@solve(…, d)` shows `d = …`). */
  lhs?: string
  /** Lines to show before this one. */
  prelude?: TraceLine[]
  info?: string
  /** Sig figs declared on the left-hand side: `m:3 = …`. */
  declaredSf?: Precision
  /** `… to percent`: show the (unitless) result ×100 with a % sign. */
  asPercent?: boolean
  /** `phi:deg = …`: show (and keep) the result in this unit. */
  displayUnit?: string
  /** `x:sci = …`, `x:dec = …`: the notation the result (and the variable) is shown in. */
  notation?: Notation
  /** The look a line's settings give a tuple it assigns (`F:ijk = …`: see TupleLook). */
  look?: LookSetting
  /** `n_Na:"Moles of {Na^+}" = …`: its display name, as LaTeX. */
  label?: string
}

/** `… to percent` at the end of a line. */
export const TO_PERCENT = regex(src`\s+${KEYWORD.to}\s+${PERCENT}\s*$`)

/** Marks a SymbolExpr whose name is pre-rendered TeX (used for substituted values). */
export const RAW = '\u0001'
/** A node standing for pre-rendered TeX. */
export const rawNode = (tex: string) => symbol(RAW + tex)

/** Relative step for numerical derivatives, as a fraction of each uncertainty. */
export const STEP = 1e-4

/**
 * The library's unit errors, said plainly: a value converted with `to` to a
 * unit of another kind ("This is in (kg m^2) / (s^4 A), which can't be
 * converted to J."), or values in different units added or compared.
 */
export function readableUnitError(problem: unknown): string {
  const error = mathsError(problem)
  if (error.kind === MATHS_ERROR.cannotConvert) {
    return `This is in ${error.from || 'no unit'}, which can't be converted to ${error.to}. Check the units of the values it uses.`
  }
  if (error.kind === MATHS_ERROR.unitsDiffer) {
    return ['The units don\'t match: values in different units (or one with a unit and one without) can\'t be added, subtracted or compared.', ...unitMismatchNotes()].join(' ')
  }
  return moduleReadableMessage(problem instanceof Error ? problem.message : String(problem))
}
