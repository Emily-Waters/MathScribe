/** What evaluating a line gives back, and how its equation is laid out. */
import { type MathNode } from 'mathjs'
import { PERCENT, KEYWORD, DISPLAY_MODE, SIGIL, type DisplayMode, type Notation, type Precision } from '../../syntax.ts'
import { FIT, seriesMemberName } from '../../sheet/names.ts'
import { FunctionMember, builtinAt } from '../../builtins.ts'
import type { PlotData } from '../../output/plot.ts'
import { math } from './math.ts'
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
}

/** The pieces of an equation, put together by layoutEquation. */
export interface EquationParts {
  lhs?: string
  expr: string
  steps: string[]
  result?: string
  /** The expression is a single name (`t_avg`, `delta F`), so it reads as a left-hand side. */
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
  // #multiline: each `=` on its own row, lined up (a single = stays on one line).
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
  /** A `@plot(…)` line's plot (its `tex` is then the fits' equations, if any). */
  plot?: PlotData
  /**
   * What a select or a named plot made, for suggestions: each variable's inside
   * name (a__x_1); a series by its first and last members, the first standing
   * for `members` of them, as an import's columns are.
   */
  defines?: Definition[]
}

/** A variable a line made, for suggestions (see CalcResult.defines). */
export interface Definition {
  name: string
  members?: number
}

/** mathjs's message for a call to a function there's none of (1: its name). */
const UNDEFINED_FUNCTION = /^Undefined function (\S+)$/

/**
 * A call to a function there's none of, explained when it's one of MathScribe's
 * written without its @: `table(t, x)` → write @table(t, x).
 */
export function builtinCallHint(message: string): string {
  const name = UNDEFINED_FUNCTION.exec(message)?.[1]
  if (!name || !(builtinAt([name]) instanceof FunctionMember)) return message
  return `There's no function ${name}: MathScribe's is written with an @, as ${SIGIL}${name}(…).`
}

/** A problem with a line, explained as it should be shown (not an unexpected error's message). */
export class ExplainedError extends Error {}

/** An error nothing expected, as a message for its line. */
export const unexpectedError = (e: unknown): string =>
  `This couldn't be worked out: ${e instanceof Error ? e.message : String(e)}`

/** A missing p.slope (or intercept, r2, chi2) explained: a plot has one only with a fit. */
export function fitHint(message: string): string {
  const m = MISSING_FIT_MEMBER.exec(message)
  if (!m) return message
  return m[1] === FIT.chi2
    ? `${message}: a plot has a χ² only for a weighted fit (fit linear, with an uncertainty on every y value).`
    : `${message}: a plot has a slope, intercept and R² only with a fit. Add fit linear to it (or choose Fit in its ⚙).`
}

/** mathjs's message for a named plot's fit member that isn't there (1: which). */
export const MISSING_FIT_MEMBER = new RegExp(String.raw`^Undefined symbol \S+\.(${Object.values(FIT).join('|')})$`)

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
 * `#sci` / `#dec` for a line: its own command, and the nearest block's. They
 * rank differently: a name's `:sci` or `:dec` beats the line's own command,
 * which beats a variable's own notation (`x` after `x:sci = …`), which beats
 * the block's.
 */
export interface LineNotation {
  own?: Notation
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
  uncNode?: MathNode
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
export const TO_PERCENT = new RegExp(String.raw`\s+${KEYWORD.to}\s+${PERCENT}\s*$`)

/** Marks a SymbolNode whose name is pre-rendered TeX (used for substituted values). */
export const RAW = '\u0001'
/** A node standing for pre-rendered TeX. */
export const rawNode = (tex: string) => new math.SymbolNode(RAW + tex)

/** Relative step for numerical derivatives, as a fraction of each uncertainty. */
export const STEP = 1e-4

/**
 * mathjs's unit errors, said plainly. "Units do not match ('J' != '3454.93
 * (kg m^2) / (s^4 A)')" comes from converting with `to`: it becomes "This is
 * in (kg m^2) / (s^4 A), which can't be converted to J." On its own, it comes
 * from adding or comparing values in different units.
 */
export function readableUnitError(message: string): string {
  const conversion = /^Units do not match \('(.+)' != '[-+\d.e]+\s*(.*)'\)$/.exec(message)
  if (conversion) {
    return `This is in ${conversion[2] || 'no unit'}, which can't be converted to ${conversion[1]}. Check the units of the values it uses.`
  }
  if (message === 'Units do not match') {
    return ['The units don\'t match: values in different units (or one with a unit and one without) can\'t be added, subtracted or compared.', ...unitMismatchNotes()].join(' ')
  }
  return moduleReadableMessage(message)
}
