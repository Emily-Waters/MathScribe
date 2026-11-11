/**
 * Calculation engine: evaluates plain-text math lines with mathjs, keeping a
 * shared scope so variables defined on one line are usable on later lines,
 * and produces LaTeX for each line (symbolic = substituted = result).
 */
import {
  all,
  create,
  isAssignmentNode,
  isConstantNode,
  isFunctionAssignmentNode,
  isFunctionNode,
  isOperatorNode,
  isParenthesisNode,
  isSymbolNode,
  type FunctionNode,
  type MathNode,
  type MathType,
  type SymbolNode,
  type Unit,
} from 'mathjs'
import {
  EXACT,
  MAX_DIGITS,
  countSigFigs,
  formatExact,
  formatSigFigs,
  formatWithUncertainty,
  uncertaintySigFigs,
  hasAmbiguousZeros,
  isMeasuredLiteral,
  lastPlace,
  sigFigsFromPlace,
} from './sigfigs.ts'
import { BUILTIN_CONSTANTS, DEFAULT_CONSTANT_SIG_FIGS, suggestConstant } from './constants.ts'
import {
  ASSIGNMENT, ASSIGNMENT_WITH_VALUE, AXES, COMPONENTS_SETTING, CONSTANT_REF, DECLARED, EXACT_SETTING, IS_NAME,
  GREEK_BY_CHAR, GREEK_BY_NAME, GREEK_CHARS, LEADING_NAME, NAME, NAME_CHAR, NAME_WITH_SETTINGS, NOTATIONS, NUMBER, ONE_LINE_FUNCTION, PERCENT, SERIES_SUFFIXES,
  ELSE_IF_LINE, ELSE_LINE, IF_LINE, KEYWORD, PLOT_CALL, RETURN_LINE, SELECT_CALL, SOLVE_CALL, SUBSCRIPT, TABLE_CALL, UNCERTAINTY_WORDS, UNIT_VECTOR_SETTING, UNPACK, VECTOR_FUNCTION,
  DISPLAY_MODE, EACH_SETTING, LABEL_QUOTE, LINE_COMMAND, SERIES_STAT, VALUE_IN_TEXT,
  type DisplayMode, type LineCommand, type Notation, type Precision, type UncertaintyWord,
  type VectorStyle,
} from './syntax.ts'
import {
  FIT, INLINE_VALUE_NAME, JOIN, RESERVED_NAMESPACES, constantRefName, expandDots, isHiddenName, isUncertaintyName, memberName,
  parseConstantRefName, parseMemberName, parseNumberedName, parseSeriesStatName, parseSolvedName, parseUncertaintyName, readableMembers,
  seriesMemberName, solvedName, uncertaintyName, unpackedColumnName, unpackedName,
} from './names.ts'
import { COMPARISONS, FN, MATHJS_IN, MATH_CONSTANT, OP, OP_SYMBOL, UNIT, UNIT_LOOKS, isOp } from './mathjsNames.ts'
import {
  SPECIES_AFTER_UNIT, formulaOf, formulaTex, isSpeciesUnit, outsideMaths, readableSpecies, speciesUnit, withFormulas,
} from './chemistry.ts'
import { POLYNOMIAL_KIND, Solver, contains, countOccurrences, matchingParen, splitArgs, splitEquation } from './solve.ts'
import { nestBrackets } from './brackets.ts'
import type { CsvColumn } from './csv.ts'
import { SETTING, parseRowRange, parseTableSettings, settingParts, splitCallArgs } from './tableSettings.ts'
import { parsePlotSettings } from './plotSettings.ts'
import { linearFit, type LinearFit, type PlotData, type PlotPoint, type PlotSeries } from './plot.ts'

/** Our own mathjs instance, with the functions below added or replaced. */
const math = create(all)

/** Molarity: `0.100 M` is 0.100 mol/L (and mM, µM). (M before another unit is still mega: MPa.) */
math.createUnit(UNIT.molar, { definition: `1 ${UNIT.mole}/${UNIT.litre}`, prefixes: 'short' })

/** A species' unit (see chemistry.ts), made in mathjs the first time it's used. */
function speciesUnitName(formula: string): string {
  const { name, isNew } = speciesUnit(formula)
  if (isNew) math.createUnit(name)
  return name
}

/** In unitTex: between an amount and its species (mol EDTA). */
const SPECIES_GAP = '~'

/**
 * `lit("2.00")` evaluates to 2 but keeps the number as typed. Numbers whose
 * written form says more than their value (2.00, 0.250, 1.2e3) are wrapped in
 * it, so their trailing zeros and sig figs survive parsing, rearranging and
 * copying of expression trees, and can't be confused with a plain 2 elsewhere.
 */
math.import({ [FN.literal]: (text: string) => Number(text) })

/**
 * `tuple(x, y, z)`: a tuple of values, such as coordinates. It's a
 * one-dimensional matrix, so `2 * r`, `r1 + r2`, `norm(r)`, `dot` and `cross` all
 * work, and it's shown as (1.0, 2.0, 3.0) m. `tuple(a, b, c) = …` unpacks one
 * into separate variables (see evaluateUnpack).
 */
math.import({ [FN.tuple]: (...values: MathType[]) => math.matrix(values as never) })

/**
 * `<3.0, 4.0> N`: a vector. It's a tuple like any other (so everything that
 * works on tuples works on it), but it's shown in angle brackets, ⟨3.0, 4.0⟩ N,
 * or with unit vectors (`F:ijk`). `<…>` is rewritten to `vector(…)` before parsing.
 */
math.import({ [VECTOR_FUNCTION]: (...values: MathType[]) => math.matrix(values as never) })

/** Characters after which a `<` opens a vector rather than comparing: the start, `=`, `(`, `[`, `,`, an operator. */
const VECTOR_OPENS_AFTER = /(?:^|[=([,+\-*/^<]|\breturn)\s*$/

/**
 * Where the vector opened by the `<` at `start` closes: the index of its `>`,
 * or -1 if `<` there doesn't open a vector (it's a comparison, or nothing
 * closes it, or there's no comma inside). Brackets and vectors may nest.
 */
function vectorEnd(src: string, start: number): number {
  if (!VECTOR_OPENS_AFTER.test(src.slice(0, start))) return -1
  let depth = 0
  let comma = false
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      if (--depth < 0) return -1
    } else if (c === '<' && depth === 0) {
      const inner = vectorEnd(src, i)
      if (inner < 0) return -1
      i = inner
    } else if (c === ',' && depth === 0) comma = true
    else if (c === '>' && depth === 0) return comma ? i : -1
  }
  return -1
}

/**
 * `<3.0, 4.0> N` → `(vector(3.0, 4.0) * N)`. A unit right after the `>` applies
 * to every component; other `<` and `>` (comparisons) are left alone.
 */
export function expandVectors(src: string): string {
  let out = ''
  let last = 0
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '<') continue
    const end = vectorEnd(src, i)
    if (end < 0) continue
    const inside = expandVectors(src.slice(i + 1, end))
    const unit = readUnit(src, end + 1)
    out += src.slice(last, i)
    out += unit
      ? `(${VECTOR_FUNCTION}(${inside}) * ${FN.unit}("${unit.text}"))`
      : `${VECTOR_FUNCTION}(${inside})`
    last = unit ? unit.end : end + 1
    i = last - 1
  }
  return out + src.slice(last)
}

/** Whether the `>` at `end` closes a vector (so a unit can follow it), for the editor. */
export function closesVector(src: string, end: number): boolean {
  for (let i = end - 1; i >= 0; i--) if (src[i] === '<' && vectorEnd(src, i) === end) return true
  return false
}

/** Text ending where a bracket would start a call's arguments: after a name (`f`, `λ`) or a closing bracket. */
const CALL_BEFORE = new RegExp(String.raw`(?:${NAME_CHAR}|[)\]])$`)

/** The vector products, written as operators: dot(a, b) → a · b, cross(a, b) → a × b. */
const VECTOR_PRODUCTS = { dot: '\\cdot', cross: '\\times' } as const

/** Whether some text has a vector written `<…>` or `vector(…)` in it. */
const hasVector = (src: string) =>
  expandVectors(src) !== src || new RegExp(`\\b${VECTOR_FUNCTION}\\s*\\(`).test(src)

/**
 * The first bracketed list with commas, `(a, b)`, that isn't a function call's
 * argument list (it doesn't follow a name or a closing bracket); null if none.
 * It isn't a value: tuples are written tuple(a, b).
 */
export function bareTuple(src: string): string | null {
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '(') continue
    const before = src.slice(0, i).trimEnd()
    if (CALL_BEFORE.test(before)) continue // a call: f(a, b), λ(a, b), solve(…), or (x)(y)
    let depth = 0
    let comma = false
    let j = i
    for (; j < src.length; j++) {
      const c = src[j]
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')' || c === ']' || c === '}') {
        depth--
        if (depth === 0) break
      } else if (c === ',' && depth === 1) comma = true
    }
    if (comma) return src.slice(i, j + 1)
  }
  return null
}

/** A one-dimensional matrix: a tuple like (x, y, z). */
const isTuple = (v: unknown): v is math.Matrix =>
  math.isMatrix(v) && (v as math.Matrix).size().length === 1

/**
 * atan2(y, x) of two lengths (or any matching units), such as a point's
 * coordinates: mathjs only takes plain numbers. The ratio is what matters, so
 * both are read in x's unit.
 */
const mathAtan2 = math.atan2
math.import({
  atan2: (y: MathType, x: MathType) => {
    if (math.isUnit(y) && math.isUnit(x)) {
      const unit = (x as Unit).formatUnits()
      return mathAtan2((y as Unit).toNumber(unit), (x as Unit).toNumber(unit))
    }
    return mathAtan2(y as never, x as never)
  },
}, { override: true })

/**
 * norm(r), the length of a tuple, also when it has units: mathjs's own norm
 * starts its sum from a plain 0, which can't be added to 1.00 m.
 */
const mathNorm = math.norm
math.import({
  norm: (value: MathType, p?: number | string) => {
    if (isTuple(value) && (p === undefined || p === 2)) {
      const squares = (value.toArray() as MathType[]).map((v) => math.multiply(v, v) as MathType)
      return math.sqrt(squares.reduce((sum, sq) => math.add(sum, sq) as MathType) as never)
    }
    return p === undefined ? mathNorm(value as never) : mathNorm(value as never, p as never)
  },
}, { override: true })

/**
 * sin, cos and tan of exact angles come out with floating-point noise
 * (sin(pi) = 1.2e-16, sin(30 deg) = 0.49999999999999994). Results within 1e-14 of
 * 0, ±1/2 or ±1 are snapped to that value. Their outputs are bounded (or, for tan,
 * these are the values that matter), so an absolute tolerance is safe. A genuinely
 * tiny angle keeps its tiny sine: snapping to 0 only happens for angles that aren't
 * themselves near 0.
 */
const SNAP_TARGETS = [0, 0.5, -0.5, 1, -1]
/** How close a result must be to a target to snap to it. */
const SNAP_TOLERANCE = 1e-14
/** An angle (in rad) this small is genuinely tiny, so its sine isn't snapped to 0. */
const TINY_ANGLE = 1e-6
/** A trig function's result, snapped if it's floating-point noise away from a target. */
const snap = (r: unknown, angle: unknown) => {
  if (typeof r !== 'number') return r
  const radians = Math.abs(math.isUnit(angle) ? ((angle as Unit).value ?? 0) : Number(angle))
  const target = SNAP_TARGETS.find((t) => Math.abs(r - t) < SNAP_TOLERANCE && (t !== 0 || radians > TINY_ANGLE))
  return target === undefined ? r : target
}
for (const name of [FN.sin, FN.cos, FN.tan] as const) {
  const original = math[name] as unknown as ((x: unknown) => unknown) & { toTex?: unknown }
  const wrapped = Object.assign((x: unknown) => snap(original(x), x), { toTex: original.toTex })
  math.import({ [name]: wrapped }, { override: true })
}

/**
 * `x to deg` for a plain number reads it as radians, as `:deg` does: so
 * `asin(0.50) to deg`, `atan(v_y / v_x) to deg` and `theta to deg` work. (mathjs
 * only converts quantities that already have a unit; an angle from asin, acos or
 * atan is a plain number, in radians.) A tuple of plain numbers converts each one.
 */
{
  const original = math[OP.to] as unknown as ((x: unknown, unit: unknown) => unknown) & { toTex?: unknown }
  const radian = math.unit(UNIT.radian)
  const isAngle = (unit: unknown) => math.isUnit(unit) && (unit as Unit).equalBase(radian)
  const inRadians = (x: unknown): unknown => (typeof x === 'number'
    ? math.unit(x, UNIT.radian)
    : math.isMatrix(x) ? math.map(x, (v: MathType) => inRadians(v) as MathType) : x)
  const wrapped = Object.assign(
    (x: unknown, unit: unknown) => {
      if (isAngle(unit)) return original(inRadians(x), unit)
      // (mathjs's own message for this is about argument types.)
      if (typeof x === 'number' && math.isUnit(unit)) {
        throw new Error(`${x} has no unit, so it can't be converted to ${(unit as Unit).formatUnits()}: give it one (3.0 m to cm).`)
      }
      // An amount of a species keeps it: mol NaOH to mmol is mmol NaOH.
      const species = math.isUnit(x) ? (x as Unit).units.filter((p) => isSpeciesUnit(p.unit.name)) : []
      const target = unit as Unit
      if (species.length && math.isUnit(unit) && !target.units.some((p) => isSpeciesUnit(p.unit.name))) {
        const tag = species.map((p) => (p.power === 1 ? p.unit.name : `${p.unit.name}^${p.power}`)).join(' ')
        return original(x, math.unit(`${target.formatUnits()} ${tag}`))
      }
      return original(x, unit)
    },
    { toTex: original.toTex },
  )
  math.import({ [OP.to]: wrapped }, { override: true })
}

/** mathjs's built-in constants. Series sums never take these names. */
const BUILTIN_CONSTANT_NAMES = new Set([
  'pi', 'PI', 'e', 'E', 'tau', 'phi', 'i', 'Infinity', 'NaN',
  'LN2', 'LN10', 'LOG2E', 'LOG10E', 'SQRT1_2', 'SQRT2', 'true', 'false', 'null',
])

/** Wrap numbers whose text isn't their plain value in lit("…"); leaves quoted strings alone. */
function markLiterals(src: string): string {
  return src
    .split(/("[^"]*")/)
    .map((part, i) => (i % 2 ? part : part.replace(NUMBER_LITERAL, (m) => (String(Number(m)) === m ? m : `${FN.literal}("${m}")`))))
    .join('')
}

/** Settings for evaluating a sheet (the Output options). */
export interface CalcOptions {
  /**
   * 'auto': track significant figures from the measured values and round each
   * result accordingly. A number: show every result to that many sig figs.
   */
  precision: number | 'auto'
  /** Show the step with variable values substituted in. */
  showSubstitution: boolean
  /**
   * Use ≈ before every rounded result. Off: ≈ only when every input is exact
   * (1/3 ≈ 0.333), since a measured result's sig figs already say it's rounded.
   */
  approxRounded?: boolean
  /**
   * Show a dot between every pair of factors (m·a). Off: products are written
   * as in a textbook, ma, ½mv², mg cos θ, with a dot only where it's needed to
   * keep numbers apart (2.0 kg · 9.81 m/s²).
   */
  productDots?: boolean
}

/** The pieces of an equation, put together by layoutEquation. */
interface EquationParts {
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
function layoutEquation(mode: DisplayMode, p: EquationParts, multiline = false): string {
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

/** A rendered multi-line function definition (`def f(a, b)` with an indented body). */
export interface FunctionResult {
  /** f\left(a, b\right) */
  signature: string
  /** Each body line as an equation; the return line reads f(a, b) = … */
  body: { tex: string; note?: string; line: number }[]
  error?: string
}


/** A body line of a multi-line function, with its note and command already split off. */
export interface FunctionLine {
  line: number
  text: string
  note?: string
  command?: LineCommand
  /** `#multiline` on this body line. */
  multiline?: boolean
  /** Its indentation: lines indented under an `if` or `else` belong to it. */
  indent?: number
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
   * Working from inside user-defined functions called on this line, one equation
   * per body line, shown before the line itself.
   */
  trace?: TraceLine[]
  /** Note from the called function's return line, for a line that is just the call. */
  returnNote?: string
  error?: string
  warning?: string
  /** Something worth knowing that isn't a problem, e.g. other solutions of an equation. */
  info?: string
  /** A `plot(…)` line's plot (its `tex` is then the fits' equations, if any). */
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

/** An error nothing expected, as a message for its line. */
export const unexpectedError = (e: unknown): string =>
  `This couldn't be worked out: ${e instanceof Error ? e.message : String(e)}`

/** A missing p.slope (or intercept, r2, chi2) explained: a plot has one only with a fit. */
function fitHint(message: string): string {
  const m = MISSING_FIT_MEMBER.exec(message)
  if (!m) return message
  return m[1] === FIT.chi2
    ? `${message}: a plot has a χ² only for a weighted fit (fit linear, with an uncertainty on every y value).`
    : `${message}: a plot has a slope, intercept and R² only with a fit. Add fit linear to it (or choose Fit in its ⚙).`
}

/** mathjs's message for a named plot's fit member that isn't there (1: which). */
const MISSING_FIT_MEMBER = new RegExp(String.raw`^Undefined symbol \S+\.(${Object.values(FIT).join('|')})$`)

/** A series' first and last members as Definitions (just the one, if that's all it has). */
const seriesDefinitions = (base: string, count: number): Definition[] => (count > 1
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

/** A variable as the sheet lists it: its name, value as LaTeX, and sig figs. */
export interface Variable {
  name: string
  tex: string
  /** Significant figures (Infinity for exact values). */
  sf: number
}

// ---------------------------------------------------------------------------
// Unit literals
//
// mathjs resolves a symbol from the scope before treating it as a unit, so after
// `m = 2 kg`, the text `9.81 m/s^2` would multiply by the mass. To keep plain
// text natural, a unit written directly after a number is always a unit:
// `9.81 m/s^2` is rewritten to `(9.81 * unit("m/s^2"))` before parsing.
// A compound unit has no spaces (`kg*m/s^2`); a space ends it, so `5 kg * m`
// multiplies by a variable m.
// ---------------------------------------------------------------------------

/** Single-letter units that are far more often meant as variables. */
const UNIT_DENYLIST = new Set(['b', 'B'])

/**
 * The micro prefix as typed: the micro sign µ, or the Greek μ often typed for
 * it, before a unit's name. mathjs writes micro as u, so `3.0 µm` is 3.0 um.
 */
const MICRO_SIGN = /^[µμ](?=[A-Za-z])/
/** A unit's name with a typed micro sign written as mathjs's u: `µm` → um. */
export const withMicroPrefix = (id: string) => id.replace(MICRO_SIGN, 'u')

/** Whether a word is a unit (used after a number, or after `to`). µ counts as the micro prefix. */
export function isUnitName(id: string): boolean {
  id = withMicroPrefix(id)
  if (UNIT_DENYLIST.has(id)) return false
  try {
    return math.Unit.isValuelessUnit(id)
  } catch {
    return false
  }
}

/** Prefixed units people type often (mathjs lists units without their prefixes). */
const COMMON_PREFIXED = [
  'km', 'cm', 'mm', 'um', 'nm', 'pm', 'kg', 'mg', 'ug', 'mL', 'kJ', 'MJ', 'kPa', 'MPa', 'kN',
  'kHz', 'MHz', 'GHz', 'mA', 'kV', 'mV', 'kW', 'MW', 'ms', 'us', 'ns', 'kmol', 'mmol', 'keV', 'MeV',
]

/** Unit names for completions: mathjs's units plus common prefixed ones. */
export function unitNames(): string[] {
  const units = Object.keys(math.Unit.UNITS)
  const known = new Set(units)
  // Leave out plural spellings (angstroms, hours) when the singular is there too.
  const singular = units.filter((u) => !(u.length > 3 && u.endsWith('s') && known.has(u.slice(0, -1))))
  return [...new Set([...singular, ...COMMON_PREFIXED])].filter(isUnitName)
}

/** What a unit is, in SI: "1 angstrom = 1e-10 m", or null if it's not a unit (or is SI already). */
export function describeUnit(name: string): string | null {
  if (!isUnitName(name)) return null
  try {
    const u = math.unit(1, name)
    // Temperature scales have an offset: "1 degC = 274.15 K" would mislead.
    if (u.units.some((p) => p.unit.offset)) return null
    const si = u.toSI()
    // In a derived unit where one fits (1 eV = 1.6e-19 J), else in base units (1 N = 1 kg m/s^2).
    const derived = DERIVED_UNITS.find((d) => si.equalBase(d) && d.formatUnits() !== name)
    const text = math.format(derived ? si.to(derived.formatUnits()) : si, { precision: MESSAGE_DIGITS })
    return text === `1 ${name}` ? null : `1 ${name} = ${text}`
  } catch {
    return null
  }
}

/** Pieces of a unit expression, read one after another: a power (`^2`, `^(-1)`), the first unit, then `/unit` or `*unit`. */
const POWER = /\^(\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)/y
/** (A unit ends where a name or a call would go on: `2 mλ` has no unit.) */
/** A unit's name, which may start with a typed micro sign (µm). */
const UNIT_WORD = String.raw`(?:[µμ](?=[A-Za-z]))?[A-Za-z]+`
const FIRST_UNIT = new RegExp(String.raw`[ \t]*(${UNIT_WORD})(?!${NAME_CHAR}|\()`, 'y')
const NEXT_UNIT = new RegExp(String.raw`([*/·])(${UNIT_WORD})(?!${NAME_CHAR}|\()`, 'y')

/** Read a unit expression like `m/s^2` or `kg*m^2` starting at `pos`. */
function readUnit(src: string, pos: number): { text: string; end: number } | null {
  FIRST_UNIT.lastIndex = pos
  const first = FIRST_UNIT.exec(src)
  if (!first || !isUnitName(first[1])) return null
  let text = withMicroPrefix(first[1])
  let end = FIRST_UNIT.lastIndex

  const readPower = () => {
    POWER.lastIndex = end
    const p = POWER.exec(src)
    if (p) {
      text += `^${p[1].replace(/[()]/g, '')}`
      end = POWER.lastIndex
    }
  }
  readPower()

  for (;;) {
    NEXT_UNIT.lastIndex = end
    const next = NEXT_UNIT.exec(src)
    if (!next || !isUnitName(next[2])) break
    text += (next[1] === '/' ? '/' : '*') + withMicroPrefix(next[2])
    end = NEXT_UNIT.lastIndex
    readPower()
  }
  // The species it's an amount of: `mol {EDTA}`, `M {NaOH}`.
  const species = SPECIES_AFTER_UNIT.exec(src.slice(end))
  if (species) {
    text += ` ${speciesUnitName(species[1])}`
    end += species[0].length
  }
  return { text, end }
}

/** Every number in a line, but not digits inside a name (`v_0`) or after a point. */
const NUMBER_LITERAL = new RegExp(String.raw`(?<!${NAME_CHAR}|\.)${NUMBER}`, 'g')
/** Every name in a line that isn't a call: not part of a longer name, or after `.` or `\`. */
const NAME_IN_LINE = new RegExp(String.raw`(?<!${NAME_CHAR}|[\\.])(${NAME})(?!${NAME_CHAR}|\()`, 'g')
/** After a unit, another term (a name or a bracket), not `to` or `in`: `1/2 m v^2`. */
const MORE_TERMS = new RegExp(String.raw`^[ \t]+(?!(?:${KEYWORD.to}|${MATHJS_IN})(?!${NAME_CHAR}))(?:${NAME_CHAR}|\()`)
/** `pm` as a word (not the start of a name like `pmax`). */
const PM_WORD = new RegExp(`^${KEYWORD.pm}(?!${NAME_CHAR})`)
/** A character that can be part of a name. */
const NAME_CHAR_RE = new RegExp(NAME_CHAR)
/** `to` before a unit. */
const CONVERSION = new RegExp(String.raw`\b${KEYWORD.to}\s+`, 'g')
/** A conversion that's all that's left of a line: `to cm` (1: the unit). */
const CONVERSION_TAIL = new RegExp(String.raw`^${KEYWORD.to}\s+(.+)$`)

/**
 * Rewrite unit literals into explicit mathjs unit() calls. Also reports the
 * likely mistake of a lone unit that is also a variable name, followed by more
 * terms: in `1/2 m v^2`, m is read as metres.
 */
export function preprocess(src: string, isVariable: (id: string) => boolean): { text: string; shadowed: string[] } {
  const shadowed = new Set<string>()
  const bare = bareTuple(src)
  if (bare) {
    throw new Error(`A bracketed list with commas, ${bare}, isn't a value: `
      + `for a vector, write <${bare.slice(1, -1)}>; for other coordinates, tuple${bare}.`)
  }
  src = expandVectors(src)

  // `... to kN`: the conversion target is always a unit.
  let out = ''
  let last = 0
  for (const m of src.matchAll(CONVERSION)) {
    if (m.index < last) continue
    const unit = readUnit(src, m.index + m[0].length)
    if (!unit) continue
    out += `${src.slice(last, m.index)}to ${FN.unit}("${unit.text}")`
    last = unit.end
  }
  src = out + src.slice(last)

  // `9.81 m/s^2` → `(9.81 * unit("m/s^2"))`
  out = ''
  last = 0
  for (const m of src.matchAll(NUMBER_LITERAL)) {
    if (m.index < last) continue
    const unit = readUnit(src, m.index + m[0].length)
    if (!unit) continue
    // (`0.25 m to kPa` is a conversion, not another term.)
    if (/^[A-Za-z]+$/.test(unit.text) && isVariable(unit.text)
      && MORE_TERMS.test(src.slice(unit.end))) {
      shadowed.add(unit.text)
    }
    out += `${src.slice(last, m.index)}(${m[0]} * ${FN.unit}("${unit.text}"))`
    last = unit.end
  }
  return { text: markLiterals(out + src.slice(last)), shadowed: [...shadowed] }
}

// ---------------------------------------------------------------------------
// Uncertainty syntax
//
//   m = 2.0 kg pm 0.1 kg     (also ± or +-)
//   m = (2.0 pm 0.1) kg
//   m = 2.0 kg pm 0.1        uncertainty takes the value's unit
//   m = 2.0 kg pm 5%         relative uncertainty
//   delta F / Delta F        the uncertainty of F, rendered δF / ΔF as typed
// ---------------------------------------------------------------------------

// (Each delta F, @c and solved unknown is held in a hidden variable: see names.ts.)

/** LaTeX's special characters, escaped for `\text{…}` (a display name's words). */
const TEXT_ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', $: '\\$', '&': '\\&', '#': '\\#', '%': '\\%', _: '\\_', '^': '\\^{}', '~': '\\~{}',
}
const escapeText = (s: string) => s.replace(/[\\{}$&#%_^~]/g, (c) => TEXT_ESCAPES[c])

/** A value in text with settings on its name: `V:4 to mL` (1: the name, 2: the settings, 3: the rest). */
const NAME_THEN_SETTINGS = new RegExp(String.raw`^(${NAME})((?::[^:\s]+)+)(.*)$`)

/** `delta F` (or `Delta F`): F's uncertainty (1: the letter, 2: the name). */
const DELTA_REF = new RegExp(String.raw`\b(${UNCERTAINTY_WORDS.join('|')})\s+(${NAME})`, 'g')


/** A select condition on a series' values: `t from 0.2 to 0.8`, `t from 0.2`, `t to 0.8` (1: the series, 2: from, 3: to). */
const SELECT_RANGE = new RegExp(String.raw`^(${NAME})\s+(?:${SETTING.from}\s+(.+?))?\s*(?:\b${SETTING.to}\s+(.+))?$`)

// ---------------------------------------------------------------------------
// Series aggregates
//
// Given a1, a2, a3 (or a_1, a_2, a_3) and no variable called `a`:
//   a         sum of the series
//   a_avg     mean (also a_mean), ± the standard error σ/√n
//   a_std     sample standard deviation σ (n − 1)
//   a_sem     standard error of the mean, σ/√n
//   a_count   number of values
// ---------------------------------------------------------------------------

/** What a series name works out: the sum (a name on its own), or one of the suffixed names' statistics. */
const AGGREGATE_KIND = { sum: 'sum', ...SERIES_STAT } as const
type AggregateKind = (typeof AGGREGATE_KIND)[keyof typeof AGGREGATE_KIND]

/** A name worked out from a series, and the variables it uses. */
interface Aggregate {
  kind: AggregateKind
  base: string
  /** Member variable names, in index order. */
  members: string[]
}

/** What a name asks of a series: `t_avg` → t's mean; a name without a suffix, the sum. */
function parseAggregateName(name: string): { base: string; kind: AggregateKind } {
  const stat = parseSeriesStatName(name)
  return stat ? { base: stat.base, kind: SERIES_SUFFIXES[stat.suffix] } : { base: name, kind: AGGREGATE_KIND.sum }
}

/** Text, escaped to match literally in a regular expression. */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `(2.0 pm 0.1)`: a bracketed value with its uncertainty (1: value, 2: uncertainty, 3: `%` if relative). */
const PAREN_PM = new RegExp(String.raw`\(\s*([-+]?[\d.]+(?:[eE][+-]?\d+)?)\s*(?:${KEYWORD.pm}\b|±|\+-)\s*([\d.]+(?:[eE][+-]?\d+)?)(%?)\s*\)`, 'g')

/** `(2.0 pm 0.1) kg` → `2.0 kg pm 0.1 kg` */
function expandParenPm(src: string): string {
  let out = ''
  let last = 0
  for (const m of src.matchAll(PAREN_PM)) {
    const unit = readUnit(src, m.index + m[0].length)
    const u = unit ? ` ${unit.text}` : ''
    out += `${src.slice(last, m.index)}${m[1]}${u} pm ${m[2]}${m[3] ? '%' : u}`
    last = unit ? unit.end : m.index + m[0].length
  }
  return out + src.slice(last)
}

/** Split `value pm uncertainty` at a top-level pm / ± / +-. */
function splitPm(src: string): [string, string] | null {
  let depth = 0
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    if (depth !== 0) continue
    let len = 0
    if (c === '±') len = 1
    else if (c === '+' && src[i + 1] === '-') len = 2
    else if (c === 'p' && PM_WORD.test(src.slice(i)) && (i === 0 || !NAME_CHAR_RE.test(src[i - 1]))) len = 2
    if (len) return [src.slice(0, i).trim(), src.slice(i + len).trim()]
  }
  return null
}

// ---------------------------------------------------------------------------
// LaTeX helpers
// ---------------------------------------------------------------------------

/** A Greek letter in a name, as a piece of its own (to split `ΔE` into Δ and E). */
const GREEK_LETTER = new RegExp(`([${GREEK_CHARS}])`)

/**
 * One part of a name, as LaTeX: Greek letters (spelled out, `theta`, or typed,
 * θ) as their commands, single letters and digits as they are, words upright.
 * A typed Greek letter goes in front of the rest: `ΔE` → \Delta E, `Δforce` →
 * \Delta \mathrm{force}.
 */
function namePart(s: string): string {
  if (GREEK_BY_NAME.has(s)) return `\\${s}`
  if (GREEK_LETTER.test(s)) {
    return s.split(GREEK_LETTER).filter(Boolean).map((piece) => {
      if (!GREEK_LETTER.test(piece)) return namePart(piece)
      const name = GREEK_BY_CHAR.get(piece)
      return name ? `\\${name}` : piece
    }).join(' ')
  }
  if (s.length === 1 || /^\d+$/.test(s)) return s
  return `\\mathrm{${s}}`
}

/** A name of letters then digits, `a2`, `ω1` (1: the letters, 2: the digits), which reads a₂. */
const TRAILING_DIGITS = new RegExp(String.raw`^([A-Za-z${GREEK_CHARS}]+?)(\d+)$`)

/** `v_0` → v_{0}, `F_net` → F_{\mathrm{net}}, `F_net_x` → F_{\mathrm{net},x}, `theta` → \theta, `a2` → a_{2} */
export function symbolTex(name: string): string {
  if (name === 'Infinity') return '\\infty'
  const unc = parseUncertaintyName(name)
  if (unc) return `\\${unc.letter} ${symbolTex(unc.of)}`
  const constant = parseConstantRefName(name)
  if (constant) return BUILTIN_CONSTANTS[constant]?.tex ?? symbolTex(constant)
  const solved = parseSolvedName(name)
  if (solved) return symbolTex(solved)
  // Statistics of a series: a_avg → ā, a_std → σ_a, a_sem → σ_ā, a_count → n_a
  const stat = parseSeriesStatName(name)
  if (stat) {
    const base = symbolTex(stat.base)
    switch (SERIES_SUFFIXES[stat.suffix]) {
      case AGGREGATE_KIND.std: return `\\sigma_{${base}}`
      case AGGREGATE_KIND.sem: return `\\sigma_{\\bar{${base}}}`
      case AGGREGATE_KIND.count: return `n_{${base}}`
      case AGGREGATE_KIND.mean: {
        // A namespace's series keeps its subscript outside the bar: a.x_avg → x̄_a.
        const sub = parseMemberName(stat.base) ? /^(.*?)(_\{.*\})$/.exec(base) : null
        return sub ? `\\bar{${sub[1]}}${sub[2]}` : `\\bar{${base}}`
      }
    }
  }
  // A namespace's member, a.x_1: the namespace goes first in the subscript, x_{a,1}.
  const member = parseMemberName(name)
  if (member) {
    const ns = namePart(member.namespace)
    // A named plot's fit: p.r2 → R²_p, p.chi2 → χ²_ν,p.
    if (member.member === FIT.r2) return `R^{2}_{${ns}}`
    if (member.member === FIT.chi2) return `\\chi^{2}_{\\nu,${ns}}`
    const tex = symbolTex(member.member)
    const sub = /^(.*?)_\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}$/.exec(tex)
    return sub ? `${sub[1]}_{${ns},${sub[2]}}` : `${tex}_{${ns}}`
  }
  const trailingDigits = TRAILING_DIGITS.exec(name)
  if (trailingDigits) return `${namePart(trailingDigits[1])}_{${trailingDigits[2]}}`
  // A letter, a number, then letters, `v1x`: v with 1x as its subscript.
  const numberedLabel = NUMBERED_LABEL.exec(name)
  if (numberedLabel) return `${namePart(numberedLabel[1])}_{${subscriptPart(numberedLabel[2])}}`
  // More than one subscript (`F_net_x`, a component) reads F_{net,x}.
  const [base, ...rest] = name.split('_')
  const subs = rest.filter(Boolean)
  return subs.length ? `${namePart(base)}_{${subs.map(subscriptPart).join(',')}}` : namePart(base)
}

/** One letter, then a number and letters, without an underscore: `v1x` (1: the letter, 2: the rest). */
const NUMBERED_LABEL = new RegExp(String.raw`^([A-Za-z${GREEK_CHARS}])(\d+[A-Za-z]+)$`)

/**
 * A short subscript made of labels rather than a word: a number and a letter
 * (`1x`, `x1`), a letter and a component (`fx`, `tx`), a capital and initial or
 * final (`Ai`, `Bf`), or two capitals (`AB`). Words (`net`, `max`, `cm`, `eq`)
 * aren't, and nor are element symbols (`Na`, `Ca`, `Mg`), which stay upright.
 */
const LABELS = /^(?:\d+[A-Za-z]|[A-Za-z]\d+|[A-Za-z][xyz]|[A-Z][if]|[A-Z]{2})$/

/** A subscript as LaTeX: labels each as itself (`fx` → f x, letters italic), a word upright (`net`). */
const subscriptPart = (s: string) => (LABELS.test(s) ? [...s].map(namePart).join('') : namePart(s))

/** `1.235e+8` → 1.235 \times 10^{8} */
export function numberTex(s: string): string {
  const m = /^(-?[\d.]+)e([+-]?\d+)$/i.exec(s)
  return m ? `${m[1]} \\times 10^{${Number(m[2])}}` : s
}

/** `(kg m) / s^2` or `m/s^2` → \mathrm{kg}\cdot\mathrm{m}/\mathrm{s}^{2} */
/** Whether a unit's name is a unit with the micro prefix (um, us, uF), worked out once per name. */
const microUnits = new Map<string, boolean>()
function hasMicroPrefix(name: string): boolean {
  if (name.length < 2 || !name.startsWith('u')) return false
  let micro = microUnits.get(name)
  if (micro === undefined) {
    try {
      const parts = math.unit(1, name).units
      micro = parts.length === 1 && (parts[0].prefix as unknown as { name: string }).name === 'u'
    } catch {
      micro = false
    }
    microUnits.set(name, micro)
  }
  return micro
}

export function unitTex(s: string): string {
  // Brackets matter in a denominator (J/(mol·K)), but not around a numerator.
  let norm = s.trim()
    .replace(/\s*\/\s*/g, '/')
    .replace(/^\(([^()]*)\)\//, '$1/')
    .replace(/\(\s*/g, '(').replace(/\s*\)/g, ')')
    .replace(/\s*[*·]\s*|\s+/g, '*')
  // A species goes after its amount with a space, not a dot: mol EDTA, M NaOH.
  // A unit of species alone is a mole ratio, from mol X / mol EDTA: shown that way.
  const words = norm.match(/[A-Za-z]+/g) ?? []
  const onlySpecies = words.length > 0 && words.every(isSpeciesUnit)
  norm = norm.replace(/\*(?=[a-z]+)/g, (star, at: number) => (isSpeciesUnit(/^[a-z]+/.exec(norm.slice(at + 1))![0]) ? SPECIES_GAP : star))
  return norm.replace(/[A-Za-z]+|\^(-?[\d.]+)|\*|~/g, (tok, pow) => {
    if (tok === '*') return '\\cdot '
    if (tok === SPECIES_GAP) return '\\,'
    if (pow !== undefined) return `^{${pow}}`
    const formula = formulaOf(tok)
    if (formula) return onlySpecies ? `\\mathrm{mol}\\,${formulaTex(formula)}` : formulaTex(formula)
    const look = UNIT_LOOKS[tok]
    if (look) return look.tex
    // The micro prefix, u in mathjs, as µ: um → µm.
    if (hasMicroPrefix(tok)) return `\\mu\\mathrm{${tok.slice(1)}}`
    return `\\mathrm{${tok}}`
  })
}

/**
 * Put a unit after a number: a thin space before most units, none before a
 * superscript unit like °. If the number already ends in a superscript
 * (1 × 10^{3}), the ° goes on an empty group to avoid a double superscript.
 */
function attachUnit(num: string, unit: string): string {
  if (!unit) return num
  if (!unit.startsWith('^')) return `${num}\\,${unit}`
  return /\^\{[^{}]*\}\s*$/.test(num) ? `${num}{}${unit}` : `${num}${unit}`
}

/** A unit as mathjs reads it: unit("kg"). */
const isUnitCall = (n: MathNode | undefined): n is FunctionNode =>
  !!n && isFunctionNode(n) && n.fn.name === FN.unit && isConstantNode(n.args[0])

/** The unit inside unit("kg"). */
const unitCallText = (n: FunctionNode) => String((n.args[0] as math.ConstantNode).value)

/** A number kept as typed: lit("2.00"). */
const isLitCall = (n: MathNode | undefined): n is FunctionNode =>
  !!n && isFunctionNode(n) && n.fn.name === FN.literal && isConstantNode(n.args[0])

/**
 * A whole number of a species, written without a decimal point (`1 mol {X}`,
 * `2 mol {H2O}`): a coefficient from a balanced equation, so exact.
 */
function isSpeciesCount(number: MathNode, unit: MathNode, literals: Map<number, string>): boolean {
  if (!isConstantNode(number) || typeof number.value !== 'number' || !Number.isInteger(number.value)) return false
  if (/[.eE]/.test(literals.get(number.value) ?? '')) return false
  return isUnitCall(unit) && unitCallText(unit as FunctionNode).split(/[\s*/^]+/).some(isSpeciesUnit)
}

/** A node without any brackets around it. */
function unwrap(n: MathNode): MathNode {
  return isParenthesisNode(n) ? unwrap(n.content) : n
}

/** A bare number or quantity such as `2.0 kg` or `-3`, with nothing to compute. */
function isLiteral(n: MathNode): boolean {
  n = unwrap(n)
  if (isConstantNode(n) || isLitCall(n)) return true
  if (isOp(n, OP.unaryMinus)) return isLiteral(n.args[0])
  if (isOp(n, OP.multiply) && isUnitCall(n.args[1])) return isLiteral(n.args[0])
  return false
}

/** A vector of typed values: `<3.0, 4.0> N`, `<1.0 m, 2.0 m>`. */
function isVectorLiteral(n: MathNode): boolean {
  n = unwrap(n)
  if (isOp(n, OP.multiply) && isUnitCall(n.args[1])) n = unwrap(n.args[0])
  return isFunctionNode(n) && n.fn.name === VECTOR_FUNCTION && n.args.every(isLiteral)
}

/** An expression made only of number literals and arithmetic, like `-(0.5)` or `3/2`. */
function isPureNumber(n: MathNode): boolean {
  n = unwrap(n)
  if (isConstantNode(n)) return typeof n.value === 'number'
  if (isLitCall(n)) return true
  if (isOperatorNode(n)) return n.args.every(isPureNumber)
  return false
}

/** `x to unit`. */
const isConversion = (n: MathNode) => isOp(n, OP.to)

// ---------------------------------------------------------------------------
// Unit normalisation
// ---------------------------------------------------------------------------

/** Derived SI units preferred over base-unit combinations (kg m/s^2 → N). */
const DERIVED_UNITS = ['N', 'J', 'W', 'Pa', 'C', 'V', 'ohm', 'F', 'T', 'Wb', 'H', UNIT.molar].map((u) => math.unit(u))

/** How many unit names a unit is written with (`kg m/s^2` → 3). */
const unitTokens = (s: string) => (s.match(/[A-Za-z]+/g) ?? []).length

/**
 * Computed quantities can carry awkward units (N/kg, or kg^0.5 N^0.5 after a
 * sqrt), and mathjs shares unit internals between values, so a later `to`
 * conversion can mutate an earlier variable. Every computed unit is therefore
 * replaced by a fresh, tidy copy: kept as-is if already a single unit, at any
 * power (6 km, 19.62 N, 0.688 Å^-1.5), otherwise converted to SI and then to a
 * derived unit if one fits.
 */
/**
 * mathjs doesn't combine repeats of one unit (Å^2 · Å^-3 stays `angstrom^2 / angstrom^3`).
 * If every part is the same unit, return it as one power of that unit (Å^-1); else null.
 */
function mergeLikeUnits(u: Unit): Unit | null {
  const parts = u.units
  if (parts.length < 2) return null
  // (mathjs's types call `prefix` a string; at runtime it's a { name } object.)
  const symbol = (p: (typeof parts)[number]) =>
    `${(p.prefix as unknown as { name?: string } | undefined)?.name ?? ''}${p.unit.name}`
  const first = symbol(parts[0])
  if (!parts.every((p) => symbol(p) === first)) return null
  const power = Number(parts.reduce((sum, p) => sum + p.power, 0).toPrecision(12))
  if (power === 0) return null
  try {
    return u.to(power === 1 ? first : `${first}^${power}`)
  } catch {
    return null
  }
}

/** A computed quantity in tidy units (see above); `keepUnits` leaves a chosen unit alone. */
function normalise(value: unknown, keepUnits: boolean): unknown {
  if (!math.isUnit(value)) return value
  const u = value as Unit
  // Species (mol EDTA) aren't SI: set them aside, tidy the rest, and put them back.
  // (Each species unit is worth exactly 1, so the number in the other units is the same.)
  if (u.units.some((p) => isSpeciesUnit(p.unit.name))) {
    const part = (p: Unit['units'][number]) =>
      `${(p.prefix as unknown as { name?: string } | undefined)?.name ?? ''}${p.unit.name}${p.power === 1 ? '' : `^${p.power}`}`
    // Each species once, its powers added up: mol EDTA × (mol X / mol EDTA) is mol X.
    const powers = new Map<string, number>()
    for (const p of u.units) if (isSpeciesUnit(p.unit.name)) powers.set(p.unit.name, (powers.get(p.unit.name) ?? 0) + p.power)
    const species = [...powers].filter(([, power]) => power !== 0)
      .map(([name, power]) => (power === 1 ? name : `${name}^${power}`)).join(' ')
    const others = u.units.filter((p) => !isSpeciesUnit(p.unit.name)).map(part).join(' ')
    const number = u.toNumber(u.formatUnits())
    const tidy = others ? normalise(math.unit(number, others), keepUnits) : number
    if (!species) return tidy
    const result = math.multiply(tidy as MathType, math.unit(1, species)) as Unit
    // (Shown as made: left to itself, mathjs would re-simplify it to SI when formatting.)
    result.skipAutomaticSimplification = true
    return result
  }
  const units = u.formatUnits()
  if (keepUnits || unitTokens(units) <= 1) return u.clone()
  const merged = mergeLikeUnits(u)
  if (merged) return merged
  const si = u.toSI()
  const derived = DERIVED_UNITS.find((d) => si.equalBase(d))
  return derived ? si.to(derived.formatUnits()) : si
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Lexical scope: lookups fall through to the enclosing scope, assignments are
 * always local. Assigning a name that exists outside shadows it until the block
 * ends, as with `let` in a nested block. Extends Map so mathjs accepts it as a
 * scope, and functions defined with `f(x) = ...` close over the scope they were
 * defined in.
 *
 * A numbered name answers to either spelling: when `t1` isn't defined, `t1`
 * finds `t_1`, and the other way round. So a series typed `t1, t2, …` and an
 * imported column (`t_1, t_2, …`) are written the same way. A name defined in
 * both spellings keeps each.
 */
class Scope<T = unknown> extends Map<string, T> {
  readonly parent: Scope<T> | undefined
  /** Selections' series, looked up rather than copied (shared by every scope of a Calculator). */
  readonly views: Views | undefined

  constructor(parent?: Scope<T>, views?: Views) {
    super()
    this.parent = parent
    this.views = views ?? parent?.views
  }

  get(key: string): T | undefined {
    return this.getExactly(this.spelling(key))
  }

  has(key: string): boolean {
    return this.hasExactly(this.spelling(key))
  }

  /**
   * The name as defined: `key` itself, or its other spelling (t1 ↔ t_1) if only
   * that is; or, for a selection's member (a.x_3), the variable it is.
   */
  private spelling(key: string): string {
    if (this.hasExactly(key)) return key
    const other = otherSpelling(key)
    if (other !== undefined && this.hasExactly(other)) return other
    const target = this.views?.resolve(key)
    return target !== undefined ? this.spelling(target) : key
  }

  private getExactly(key: string): T | undefined {
    return super.has(key) ? super.get(key) : this.parent?.getExactly(key)
  }

  private hasExactly(key: string): boolean {
    return super.has(key) || (this.parent?.hasExactly(key) ?? false)
  }

  // -------------------------------------------------------------------------
  // Series index: each series' members at this level (t → t_1, t2, …), so
  // finding a series doesn't mean going through every name (imported data can
  // make tens of thousands). Made when first asked for, then kept up to date.
  // -------------------------------------------------------------------------

  private series: Map<string, Set<string>> | undefined

  /** Series `base`'s members defined at this level (not its parents'). */
  membersHere(base: string): ReadonlySet<string> | undefined {
    if (!this.series) {
      this.series = new Map()
      for (const name of super.keys()) this.indexName(name)
    }
    return this.series.get(base)
  }

  set(key: string, value: T): this {
    if (this.series && !super.has(key)) this.indexName(key)
    return super.set(key, value)
  }

  delete(key: string): boolean {
    const had = super.delete(key)
    if (had && this.series) {
      const numbered = parseNumberedName(key)
      if (numbered) this.series.get(numbered.base)?.delete(key)
    }
    return had
  }

  private indexName(name: string): void {
    const numbered = parseNumberedName(name)
    if (!numbered) return
    let members = this.series!.get(numbered.base)
    if (!members) this.series!.set(numbered.base, members = new Set())
    members.add(name)
  }
}

/**
 * The series of selections and named plots (`a = select(t, x; …)`), as lookups:
 * a.x is the list of variables it picks, [x_2, x_5, …], so a.x_1 is x_2 itself,
 * with its sig figs and uncertainty, and nothing is copied (a selection of
 * thousands of rows is redone on every edit). Scoped by `{ }` blocks, as
 * variables are.
 */
class Views {
  private readonly levels: Map<string, (string | undefined)[]>[] = [new Map()]

  push(): void {
    this.levels.push(new Map())
  }

  pop(): void {
    if (this.levels.length > 1) this.levels.pop()
  }

  /** Make series `base` (a__x) the variables `names` picks, numbered from 1 (a gap: no member there). */
  set(base: string, names: (string | undefined)[]): void {
    this.levels.at(-1)!.set(base, names)
  }

  /** Each member of the series set at this level, and the variable it is: a__x_1 → x_2, …. */
  *membersHere(): Generator<[member: string, variable: string]> {
    for (const [base, names] of this.levels.at(-1)!) {
      for (const [i, name] of names.entries()) if (name) yield [seriesMemberName(base, i + 1), name]
    }
  }

  /** Forget the series under namespace `ns` set at this level (a selection being redone). */
  clear(ns: string): void {
    const level = this.levels.at(-1)!
    for (const base of [...level.keys()]) if (parseMemberName(base)?.namespace === ns) level.delete(base)
  }

  /** The variables series `base` picks, if it's a selection's. */
  get(base: string): (string | undefined)[] | undefined {
    for (let i = this.levels.length - 1; i >= 0; i--) {
      const names = this.levels[i].get(base)
      if (names) return names
    }
    return undefined
  }

  /** The variable a selection's member is: a__x_3 → x_7 (undefined if it isn't one). */
  resolve(key: string): string | undefined {
    if (!key.includes(JOIN) || this.levels.every((l) => !l.size)) return undefined
    const m = parseNumberedName(key)
    return m ? this.get(m.base)?.[m.n - 1] : undefined
  }
}

/** A numbered name written without an underscore, `t1`, `ω2` (1: the letters, 2: the number). */
const NUMBERED = new RegExp(String.raw`^([A-Za-z${GREEK_CHARS}]+)(\d+)$`)
/** …and with one, `t_1` (1: the letters, 2: the number). */
const NUMBERED_SUBSCRIPT = new RegExp(String.raw`^([A-Za-z${GREEK_CHARS}]+)_(\d+)$`)

/** A numbered name's other spelling: t1 → t_1, t_1 → t1 (undefined for other names). */
function otherSpelling(name: string): string | undefined {
  // Inside a namespace too: a.t1 ↔ a.t_1. (Split at the join directly: this runs
  // for every name looked up, so it skips parseMemberName's checks.)
  const join = name.indexOf(JOIN)
  if (join > 0) {
    const other = otherSpelling(name.slice(join + JOIN.length))
    return other === undefined ? undefined : name.slice(0, join + JOIN.length) + other
  }
  const plain = NUMBERED.exec(name)
  if (plain) return `${plain[1]}${SUBSCRIPT}${plain[2]}`
  const sub = NUMBERED_SUBSCRIPT.exec(name)
  return sub ? `${sub[1]}${sub[2]}` : undefined
}

/**
 * The sheet's variables, each with everything kept about it (StoredVariable),
 * by name: one scope per `{ }` block or function call, looking outward.
 */
type Variables = Scope<StoredVariable>

/**
 * Variables as mathjs evaluates with them: just their values. Setting one
 * (a function's parameter, a nudged input while propagating uncertainty) makes
 * a plain, exact variable in the scope it views.
 */
class Values {
  readonly vars: Variables

  constructor(vars: Variables) {
    this.vars = vars
  }

  get(key: string): unknown {
    return this.vars.get(key)?.value
  }

  has(key: string): boolean {
    return this.vars.has(key)
  }

  set(key: string, value: unknown): this {
    this.vars.set(key, { value, sf: EXACT })
    return this
  }

  delete(key: string): boolean {
    return this.vars.delete(key)
  }

  /** This scope's own names (not the scopes around it). */
  keys(): IterableIterator<string> {
    return this.vars.keys()
  }
}

/** A new scope inside `vars`, as mathjs sees it: what's set in it stays there. */
const innerValues = (vars: Variables) => new Values(new Scope(vars))

/** Each kind of line in a function's body: `x = …`, `tuple(a, b) = …`, `return …`. */
const STATEMENT_KIND = { assign: 'assign', unpack: 'unpack', return: 'return', branch: 'branch' } as const

/**
 * Where a body line is among the function's branches. A line under an `if` or
 * `else` runs only if that branch is taken (and the branches around it): its
 * guards. A branch line (`if`, `else if`, `else`) has an id, the chain it's part
 * of (the id of its `if`), and its condition (none for `else`); it's taken if
 * no earlier branch of its chain was and its condition holds.
 */
interface Guarded {
  guards: number[]
  branch?: { id: number; chain: number; code?: math.EvalFunction }
}

/** Which body lines run, as a call goes through them in order. */
class BranchRun {
  private readonly taken = new Set<number>()
  private readonly decided = new Set<number>()

  /** Whether a line is reached: every branch around it was taken. */
  reaches(s: Guarded): boolean {
    return s.guards.every((g) => this.taken.has(g))
  }

  /** Whether a branch line still needs its condition looked at (no earlier branch of its chain was taken). */
  open(s: Guarded): boolean {
    return !!s.branch && !this.decided.has(s.branch.chain)
  }

  /** Take a branch: the lines under it run, and the rest of its chain doesn't. */
  take(s: Guarded): void {
    if (!s.branch) return
    this.taken.add(s.branch.id)
    this.decided.add(s.branch.chain)
  }
}

/** Whether a condition's value counts as holding. */
function holds(value: unknown, what: string): boolean {
  if (typeof value === 'boolean') return value
  throw new Error(`${what} isn't a condition: it should compare values, like v > 0 m/s.`)
}

/** What's needed to replay a multi-line function's body to show its working. */
interface UserFunction {
  params: string[]
  /** Each parameter's cast unit (`m to kg` → 'kg'), if it has one. */
  casts: (string | undefined)[]
  /** Body lines as source text: `x = a + b`, and the return expression `x`. */
  statements: (Guarded & { kind: typeof STATEMENT_KIND.assign | typeof STATEMENT_KIND.return | typeof STATEMENT_KIND.branch; text: string; note?: string; command?: LineCommand; multiline?: boolean })[]
  definedIn: Variables
  /** Defined with #multiline: every line that calls it is laid out one = per row. */
  multiline: boolean
  /** Has a `return` line. Without one it gives no value, and can only be called on its own. */
  returns: boolean
  /** Sig figs declared for the result (`f(x):3 = …`), which every call's result has. */
  returnSf?: number
  /** Notation declared for the result (`f(x):sci = …`). */
  returnNotation?: Notation
  /** How a vector it returns is shown: declared (`f(x):ijk = …`), or ⟨…⟩ if its body writes a vector. */
  returnVector?: VectorStyle
  /** Unit declared for the result (`f(x):mol/L = …`), which every call's result is shown in. */
  returnUnit?: string
}

/** A constant defined in an `@constants { }` block. */
interface CustomConstant {
  value: unknown
  /** Its sig figs were declared (`rho:2 = …`). */
  declared?: boolean
  /** Sig figs as typed (Infinity for an exact integer). */
  sf: number
  contributions: Contributions
  uncSf?: number
}

/** How deep to show working for functions that call functions. */
const MAX_TRACE_DEPTH = 6

/**
 * Display settings on the name being assigned (`name:3 =`, `name:deg =`,
 * `phi:3:deg =`), each after a `:` and in any order: sig figs (`3`, `exact`),
 * a unit, a notation (`sci`, `dec`), and for a vector `ijk` and `xyz`.
 */
interface Declaration {
  name: string
  /** The `name:… =` part of the line. */
  length: number
  sf?: Precision
  /** Show the value in this unit (or `percent`). */
  unit?: string
  /** Always scientific (`sci`) or always decimal (`dec`) notation. */
  notation?: Notation
  /** `F:ijk`: show the vector with unit vectors. */
  vector?: VectorStyle
  /** `F:xyz`: also store (and show) each component as a variable, F_x, F_y, F_z. */
  components?: boolean
  /** `n_Na:"Moles of {Na^+}"`: shown as this instead of its name (as typed: text, {{values}}, {formulas}). */
  label?: string
}

/** Whether a unit measures angles. */
const isAngleUnit = (unit: string) => {
  try {
    return math.unit(unit).equalBase(math.unit(UNIT.radian))
  } catch {
    return false
  }
}

/** A value in brief, for an error message. */
const formatted = (v: unknown) => math.format(v as MathType, { precision: BRIEF_DIGITS })

/**
 * `value` in `unit`, for `phi:deg = …`. A unitless value can only be shown in an
 * angle unit, as radians (atan, asin and acos give plain numbers in radians).
 * Tuples are converted element by element.
 */
function toDisplayUnit(value: unknown, unit: string): unknown {
  if (math.isMatrix(value)) return math.map(value, (v: MathType) => toDisplayUnit(v, unit) as MathType)
  if (math.isUnit(value)) {
    try {
      return (value as Unit).to(unit)
    } catch {
      throw new Error(`${formatted(value)} can't be shown in ${unit}: the units don't match.`)
    }
  }
  if (typeof value === 'number') {
    if (isAngleUnit(unit)) return math.unit(value, UNIT.radian).to(unit)
    throw new Error(`${formatted(value)} has no unit, so it can't be shown in ${unit} `
      + '(only an angle in radians, from atan or asin for example, can be given a unit this way).')
  }
  throw new Error(`This value can't be shown in ${unit}.`)
}

/** A column of a table or plot: its name (if it has one), its header as TeX, and the variable holding each row's value. */
interface SeriesColumn {
  name?: string
  /** An unnamed column's expression, as typed. */
  expr?: string
  header: string
  rows: Map<number, string>
}

/** A column of a table worked out row by row, with a name: `v = x / t` (1: the name, 2: the expression). */
const TABLE_COLUMN = new RegExp(String.raw`^(${NAME})\s*=(?!=)\s*(.+)$`)

/** How many rows a table shows: all of them up to `max`; past that, the `first` and the `last`, with ⋮ between. */
const TABLE_ROWS = { max: 60, first: 50, last: 5 }

/** A series' name where it stands for a value: not part of a longer name, a call, or a unit after a number. */
const SERIES_IN_EXPRESSION = new RegExp(String.raw`(?<!${NAME_CHAR}|[.@])(${NAME})(?!${NAME_CHAR}|\s*\()`, 'g')

/**
 * A table column's expression for row `n`: each series it uses, replaced by
 * that row's value's name (`x / t` → `x_3 / t_3`).
 */
function withRowValues(expr: string, series: Map<string, Map<number, string>>, n: number): string {
  return expr.replace(SERIES_IN_EXPRESSION, (match: string, name: string, offset: number) => {
    const member = series.get(name)?.get(n)
    // (A unit right after a number, `2.0 m`, stays a unit.)
    if (!member || /\d\.?\s+$/.test(expr.slice(0, offset))) return match
    return member
  })
}

/** A tuple or vector's TeX, bracketed if it isn't already (a sum of unit vectors), to drop into a substitution. */
const bracketed = (tex: string) => (/^(?:\\left|\()/.test(tex) ? tex : `(${tex})`)

/** The unit vectors î, ĵ, k̂, one per axis. */
const UNIT_VECTOR_TEX = ['\\hat{\\imath}', '\\hat{\\jmath}', '\\hat{k}']

/** A vector's components, as the variables `F:xyz` makes: F → F_x, F_y (and F_z). */
function componentsOf(name: string, value: unknown): { name: string; value: unknown }[] {
  const values = isTuple(value) ? value.toArray() as unknown[] : null
  if (!values || values.length < 2 || values.length > AXES.length) {
    throw new Error(`${name}:${COMPONENTS_SETTING} needs a vector of 2 or 3 values, like <3.0, 4.0> N.`)
  }
  return values.map((v, i) => ({ name: `${name}${SUBSCRIPT}${AXES[i]}`, value: v }))
}

/**
 * An equation with more rows under it, lined up on their `=`: `F = …` then
 * `F_x = …`, `F_y = …`. `lhs` is the equation's left-hand side, where its
 * first `=` (or ≈) is; an equation already laid out one `=` per row gets the
 * rows added to the end.
 */
function withRows(tex: string, lhs: string, rows: string[]): string {
  const ALIGNED_END = '\\end{aligned}'
  if (tex.startsWith('\\begin{aligned}') && tex.endsWith(ALIGNED_END)) {
    return `${tex.slice(0, -ALIGNED_END.length)} \\\\ ${rows.join(' \\\\ ')}${ALIGNED_END}`
  }
  const first = tex.startsWith(`${lhs} `) ? `${lhs} &${tex.slice(lhs.length + 1)}` : `&${tex}`
  return `\\begin{aligned}${[first, ...rows].join(' \\\\ ')}\\end{aligned}`
}

/** A name in `tuple(a, b:3, c:deg) = …`, with its display settings. */
interface TupleName {
  name: string
  sf?: Precision
  unit?: string
  notation?: Notation
}

/** One name of an unpacking, `theta:3:deg`; or an error saying what's wrong with it. */
function parseTupleName(entry: string): TupleName | { error: string } {
  const name = LEADING_NAME.exec(entry)?.[0]
  if (!name || !NAME_WITH_SETTINGS.test(entry)) {
    return { error: `"${entry}" isn't a variable name: write tuple(a, b, c) = …, optionally with settings like b:3 or c:deg.` }
  }
  if (entry === name) return { name }
  const d = parseDeclaration(`${entry} = 0`)
  if (!d) return { name }
  if ('error' in d) return d
  if (d.unit === PERCENT) return { error: `${name}:percent isn't available when unpacking; show it as a percentage on a line of its own.` }
  if (d.vector || d.components) {
    return { error: `${name}:${d.vector ?? COMPONENTS_SETTING} is for a vector, but an unpacked name gets a single value.` }
  }
  return { name, sf: d.sf, unit: d.unit, notation: d.notation }
}

/** Whether a setting is a notation (`sci`, `dec`). */
const isNotation = (s: string): s is Notation => (NOTATIONS as readonly string[]).includes(s)

/** The display settings on a line's assigned name, or an error if one isn't understood. */
function parseDeclaration(line: string): Declaration | { error: string } | null {
  const m = DECLARED.exec(line)
  if (!m) return null
  const out: Declaration = { name: m[1], length: m[0].length }
  for (const [, spec] of m[2].matchAll(EACH_SETTING)) {
    if (spec.startsWith(LABEL_QUOTE)) out.label = spec.slice(1, -1)
    else if (spec === EXACT_SETTING) out.sf = EXACT_SETTING
    else if (isNotation(spec)) {
      if (out.notation && out.notation !== spec) return { error: `${m[1]} can't be both :${NOTATIONS[0]} and :${NOTATIONS[1]}.` }
      out.notation = spec
    } else if (spec === UNIT_VECTOR_SETTING) out.vector = UNIT_VECTOR_SETTING
    else if (spec === COMPONENTS_SETTING) out.components = true
    else if (/^\d+$/.test(spec)) {
      if (Number(spec) === 0) return { error: `${m[1]}:0 isn't valid; use at least 1 sig fig, or :exact.` }
      out.sf = Number(spec)
    } else if (spec === PERCENT || isValidUnit(spec)) out.unit = spec
    else return { error: `In ${m[1]}:${spec}, "${spec}" isn't a number of sig figs, a unit, or a setting like sci or ijk.` }
  }
  return out
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
interface LineResult extends CalcResult {
  parts?: EquationParts
  /** Sig figs of the result. */
  sf?: number
  /** The notation the result is shown in. */
  notation?: Notation
}

/** A parsed line ready for evaluateParsed, with what the text stage worked out. */
interface ParsedLine {
  uncNode?: MathNode
  percent: boolean
  literals: Map<number, string>
  warnings: string[]
  mode: DisplayMode
  explicit: boolean
  /** Left-hand side to show when the line isn't an assignment (`solve(…, d)` shows `d = …`). */
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
  /** `F:ijk = …`: show the vector with unit vectors. */
  vector?: VectorStyle
  /** `n_Na:"Moles of {Na^+}" = …`: its display name, as LaTeX. */
  label?: string
}

/** `… to percent` at the end of a line. */
const TO_PERCENT = new RegExp(String.raw`\s+${KEYWORD.to}\s+${PERCENT}\s*$`)

/** Marks a SymbolNode whose name is pre-rendered TeX (used for substituted values). */
const RAW = '\u0001'
/** A node standing for pre-rendered TeX. */
const rawNode = (tex: string) => new math.SymbolNode(RAW + tex)


/**
 * A value's uncertainty, broken down by where it came from: each `pm`
 * declaration is a source, mapped to the signed amount it moves this value.
 * Keeping sources separate means correlated quantities combine correctly,
 * e.g. F = m * a, then F / m doesn't count m's uncertainty twice.
 */
type Contributions = Map<number, unknown>

/** Relative step for numerical derivatives, as a fraction of each uncertainty. */
const STEP = 1e-4

// ---------------------------------------------------------------------------
// Numerical settings: digits shown, and the tolerances comparisons allow
// ---------------------------------------------------------------------------

/** Significant digits a value is quoted with in a message or a unit's description. */
const MESSAGE_DIGITS = 6

/** Fewer, for a value mentioned in passing inside a sentence. */
const BRIEF_DIGITS = 4

/** Digits for a value that has no sig-fig count (an exact value, a matrix), with sig figs on Auto. */
const EXACT_DISPLAY_DIGITS = 6

/** Plain digits from 10⁻³ up to 10⁶; scientific notation outside that (mathjs's format bounds). */
const FIXED_FORMAT = { lowerExp: -3, upperExp: 6 }

/** Two values this close, relative to their size, are the same value. */
const SAME_VALUE_TOLERANCE = 1e-9

/** A relative difference this small is floating-point noise, not rounding. */
const FLOAT_NOISE = 1e-12

/** Keeps a relative tolerance meaningful (and finite) for values at or near zero. */
const TINY = 1e-300

/** `… to percent` and `pm 5%`: a fraction as a percentage. */
const PERCENT_SCALE = 100

/** Solving numerically (the secant method), for `solve(…, x, guess)`. */
const SOLVER = {
  maxIterations: 100,
  /** The second starting point, relative to the guess (or absolute, if the guess is 0). */
  secondPoint: 1.01,
  secondPointFromZero: 1e-3,
  /** Converged when a step changes x by less than this, relative to x (or 1, if smaller). */
  tolerance: 1e-12,
  /** Step for the slope at the solution (for its uncertainty), relative to x (or absolute, at 0). */
  slopeStep: 1e-6,
  slopeStepAtZero: 1e-9,
}

/**
 * Remember how a number was typed, keyed by its value. Numbers typed with extra
 * precision (1.00, 2.0e3) are already kept as lit("1.00") calls, so they mustn't
 * replace a plain `1` on the same line, which would then count as measured.
 */
function addLiteral(literals: Map<number, string>, text: string): void {
  const value = Number(text)
  if (String(value) === text || !literals.has(value)) literals.set(value, text)
}

/** A function parameter: `m`, or `m to kg` (cast to kg on the way in) (1: the name, 2: the unit). */
const PARAMETER = new RegExp(String.raw`^(${NAME})(?:\s+${KEYWORD.to}\s+(\S+))?$`)

/** A function parameter's name and unit (null if it isn't one). */
function parseParam(spec: string): { name: string; unit?: string } | null {
  const m = PARAMETER.exec(spec.trim())
  return m ? { name: m[1], unit: m[2] } : null
}

/** Whether mathjs reads some text as a unit. */
function isValidUnit(text: string): boolean {
  try {
    return math.isUnit(math.unit(text))
  } catch {
    return false
  }
}

/** A cast parameter's argument, converted to its unit; errors say what didn't fit. */
function castArgument(param: string, unit: string | undefined, value: unknown): unknown {
  if (unit === undefined) return value
  if (!math.isUnit(value)) {
    throw new Error(`${param} is cast to ${unit}, so it needs a value with a unit, `
      + `but was given ${math.format(value as MathType, { precision: MESSAGE_DIGITS })}.`)
  }
  try {
    return (value as Unit).to(unit)
  } catch {
    throw new Error(`${param} is cast to ${unit}, but was given `
      + `${math.format(value as Unit, { precision: MESSAGE_DIGITS })}, which can't be converted to ${unit}.`)
  }
}

/** A number followed by its unit: `2.0 kg`. */
const isNumberWithUnit = (n: MathNode): n is math.OperatorNode =>
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
const EDGE = {
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
type Edge = (typeof EDGE)[keyof typeof EDGE]

/** Which side of a factor: its left edge, or its right. */
const SIDE = { left: 'left', right: 'right' } as const
type Side = (typeof SIDE)[keyof typeof SIDE]

/**
 * What a substituted value (pre-rendered TeX) shows at one edge: a bracket
 * ((−2.0), ⟨3.0, 4.0⟩), a unit at its end (⟨3.0, 4.0⟩ N), or a number.
 */
function rawEdge(tex: string, side: Side): Edge {
  if (side === SIDE.left) return /^(?:\\left|\()/.test(tex) ? EDGE.bracket : EDGE.number
  if (/(?:\\right\)|\\right\\rangle|\))$/.test(tex)) return EDGE.bracket
  return /\\mathrm|\\text/.test(tex) ? EDGE.quantity : EDGE.number
}

/** What `node` shows at its `side` edge (in a product written without dots). */
function edgeOf(node: MathNode, side: Side): Edge {
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
function inScientificNotation(node: MathNode): boolean {
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
function needsBrackets(node: MathNode, side: Side, valuesBracketed: boolean): boolean {
  if (inScientificNotation(node)) return true
  const n = unwrap(node)
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
function productSeparator(left: MathNode, right: MathNode): string {
  const l = edgeOf(left, SIDE.right)
  const r = edgeOf(right, SIDE.left)
  if (r === EDGE.number || r === EDGE.quantity || r === EDGE.minus || l === EDGE.quantity
    || (r === EDGE.fraction && (l === EDGE.number || l === EDGE.fraction))) return '\\cdot '
  if (l === EDGE.wide || r === EDGE.wide) return '\\,'
  return ' '
}

/**
 * mathjs's unit errors, said plainly. "Units do not match ('J' != '3454.93
 * (kg m^2) / (s^4 A)')" comes from converting with `to`: it becomes "This is
 * in (kg m^2) / (s^4 A), which can't be converted to J." On its own, it comes
 * from adding or comparing values in different units.
 */
function readableUnitError(message: string): string {
  const conversion = /^Units do not match \('(.+)' != '[-+\d.e]+\s*(.*)'\)$/.exec(message)
  if (conversion) {
    return `This is in ${conversion[2] || 'no unit'}, which can't be converted to ${conversion[1]}. Check the units of the values it uses.`
  }
  if (message === 'Units do not match') {
    return 'The units don\'t match: values in different units (or one with a unit and one without) can\'t be added, subtracted or compared. '
      + 'That includes amounts of different species (mol {Na^+} and mol {Cl^-}).'
  }
  return readableSpecies(message)
}

/** Prefixes people expect to read: pico to tera, plus centi. */
const COMMON_PREFIXES = new Set(['', 'p', 'n', 'u', 'm', 'c', 'k', 'M', 'G', 'T'])

/**
 * The quantity as it should be displayed. mathjs picks a "best" prefix when
 * formatting, which for tiny or huge values can be an obscure one
 * (9.11e-31 kg → 0.911 rg, ronto-grams). Then keep the unit's own prefix
 * instead, shown in scientific notation.
 */
function displayUnit(u: Unit): Unit {
  if (u.fixPrefix || !u.units.length) return u
  // mathjs's own choice, the same one format() makes (an internal method).
  let best: { name: string } | undefined
  try {
    best = (u.clone() as unknown as { _bestPrefix?: () => { name: string } | undefined })._bestPrefix?.()
  } catch {
    return u // e.g. Å^-1.5: mathjs doesn't re-prefix fractional powers either
  }
  if (!best || COMMON_PREFIXES.has(best.name)) return u
  const fixed = u.clone()
  fixed.fixPrefix = true
  return fixed
}

/** SI magnitude of a number or quantity. */
const magnitudeOf = (v: unknown): number => (math.isUnit(v) ? ((v as Unit).value ?? NaN) : Number(v))

/** A quantity like `like` but with SI magnitude `si` (or just `si` for plain numbers). */
function withMagnitude(like: unknown, si: number): unknown {
  if (!math.isUnit(like)) return si
  const u = (like as Unit).clone()
  u.value = si
  return u
}

/** A finite real number or quantity (not complex, NaN or infinite). */
const isRealValue = (v: unknown) =>
  (typeof v === 'number' && Number.isFinite(v))
  || (math.isUnit(v) && typeof (v as Unit).value === 'number' && Number.isFinite((v as Unit).value))

/** Whether two values are the same, give or take floating-point noise. */
const sameValue = (a: unknown, b: unknown) => {
  const x = magnitudeOf(a)
  const y = magnitudeOf(b)
  return Math.abs(x - y) <= SAME_VALUE_TOLERANCE * Math.max(Math.abs(x), Math.abs(y), TINY)
}

/** Everything kept about a variable: its value, and how it's shown and worked with. */
interface StoredVariable {
  value: unknown
  /** Its significant figures (EXACT: not limited). */
  sf: number
  /** Its uncertainty, by source (none, or empty: no uncertainty). */
  contributions?: Contributions
  /** The uncertainty's sig figs as typed (`pm 0.10` → 2), kept for display. */
  uncSf?: number
  /** Its sig figs were declared (`m:3 = …`), so they beat the global setting. */
  declared?: boolean
  /** Its declared notation (`x:sci = …`), wherever its value is shown. */
  notation?: Notation
  /** How it's shown if it holds a vector (⟨…⟩, or with unit vectors). */
  vector?: VectorStyle
  /** How to show it in substitutions, if not as its value (`theta = pi/4` as π/4). */
  shown?: string
  /** Its defining expression, for ΔX working. */
  def?: MathNode
  /** The series statistic it stands for, if it's one (t_avg). */
  agg?: Aggregate
  /** Its display name, as LaTeX (`n_Na:"Moles of {Na^+}"`), shown instead of its name. */
  label?: string
}

/** An imported value, ready to store: its variable's name, value (with the column's unit) and sig figs. */
interface DataValue {
  name: string
  value: unknown
  sf: number
  /** Its uncertainty, from the column's uncertainty column (dx for x), in the value's unit. */
  unc?: unknown
  /** The uncertainty's sig figs as typed (not for a percentage), kept for display as with `pm`. */
  uncSf?: number
}

/** What's wrong with a column's uncertainty column's unit, if anything. */
function uncertaintyUnitError(c: CsvColumn): string | undefined {
  const u = c.unc
  if (!u || u.percent || !u.unit) return undefined
  const where = `Column ${u.column}, the uncertainties of ${c.name},`
  if (!isValidUnit(u.unit)) return `${where} has a unit MathScribe doesn't know: "${u.unit}".`
  if (!c.unit) return `${where} has a unit (${u.unit}) but ${c.name} doesn't: give ${c.name} its unit too, or take it off ${u.column}.`
  if (!math.unit(u.unit).equalBase(math.unit(c.unit))) return `${where} is in ${u.unit}, which doesn't convert to ${c.name}'s ${c.unit}.`
  return undefined
}

/**
 * A value's uncertainty, as typed in its row of the uncertainty column: in the
 * value's unit, and that number in the column's unit (for its sig figs).
 */
function dataUncertainty(c: CsvColumn, x: number, text: string): { unc: unknown; dx: number } {
  const n = Number(text)
  const u = c.unc!
  if (u.percent) {
    const dx = (Math.abs(x) * n) / PERCENT_SCALE
    if (!c.unit) return { unc: dx, dx }
    const q = math.unit(dx, c.unit)
    q.fixPrefix = true
    return { unc: q, dx }
  }
  if (!c.unit) return { unc: n, dx: n }
  const q = math.unit(n, u.unit ?? c.unit)
  q.fixPrefix = true
  return { unc: q, dx: u.unit && u.unit !== c.unit ? q.toNumber(c.unit) : n }
}

/**
 * Each column's values, made once per column as read (sheets are evaluated on
 * every edit, and imported data can have tens of thousands of values). The
 * values aren't changed by calculations with them, so they can be shared.
 */
const madeColumns = new WeakMap<CsvColumn, DataValue[] & { range: { lowest: DataValue; highest: DataValue } }>()

/** A column's values, as variables: t_1, t_2, …, with the column's unit and their sig figs as typed. */
function columnValues(c: CsvColumn) {
  const made = madeColumns.get(c)
  if (made) return made
  // The column's unit, read once: each value is a copy of one unit of it, scaled.
  // (A unit with an offset, like degC, doesn't scale, so each of those is made afresh.)
  const one = c.unit ? math.unit(1, c.unit) : undefined
  const scales = one !== undefined && !one.units.some((p) => p.unit.offset)
  let lowest: DataValue | undefined
  let highest: DataValue | undefined
  let low = Infinity
  let high = -Infinity
  const values = c.values.map(({ row, text }): DataValue => {
    const x = Number(text)
    let value: unknown = x
    if (c.unit) {
      const u = scales ? one!.clone() : math.unit(x, c.unit)
      if (scales) u.value = (one!.value as number) * x
      u.fixPrefix = true
      value = u
    }
    // A whole number without a unit is exact, as when it's typed in a sheet.
    const v: DataValue = { name: seriesMemberName(c.name, row), value, sf: c.unit || isMeasuredLiteral(text) ? countSigFigs(text) : EXACT }
    // With an uncertainty, it sets the precision, as with `x = 0.012 m pm 0.001 m`.
    const uncText = c.unc?.values.get(row)
    if (uncText !== undefined && Number(uncText) > 0) {
      const { unc, dx } = dataUncertainty(c, x, uncText)
      v.unc = unc
      v.uncSf = c.unc!.percent ? undefined : countSigFigs(uncText)
      v.sf = formatWithUncertainty(x, dx, v.uncSf).sf
    }
    if (x < low) [low, lowest] = [x, v]
    if (x > high) [high, highest] = [x, v]
    return v
  })
  const result = Object.assign(values, { range: { lowest: lowest!, highest: highest! } })
  madeColumns.set(c, result)
  return result
}

/** Evaluates a sheet line by line, keeping its variables, their sig figs and uncertainties, and the functions it defines. */
export class Calculator {
  /** Selections' and named plots' series, as lookups (before the scopes, which share them). */
  private readonly views = new Views()
  /** The sheet's variables, each with everything kept about it (see StoredVariable). */
  private readonly rootVars: Variables = new Scope(undefined, this.views)
  /** The variables in scope here: the sheet's, or a `{ }` block's or function call's inside them. */
  private vars = this.rootVars
  /** Their values, as mathjs evaluates with them. */
  private scope = new Values(this.rootVars)
  /** Notation numbers are being formatted in right now (see inNotation). */
  private notation: Notation | undefined
  /** How tuples are being shown right now (undefined: as a plain tuple, (…)); see inVectorStyle. */
  private vectorStyle: VectorStyle | undefined
  /**
   * The sig figs of each component of a vector as typed (`<0.50, -9.81>` → 2, 3),
   * keyed by the value itself: a copy (`b = a`) shows the same, while anything
   * worked out from it is a new value, at the fewest sig figs of its inputs.
   */
  private readonly typedSfs = new WeakMap<object, number[]>()
  /** Sig figs of each call to a user function's result, from its return line. */
  private readonly callSigFigs = new WeakMap<MathNode, number>()
  /** Uncertainty source for each series mean, so repeated uses stay correlated. */
  private readonly aggregateSources = new Map<string, number>()
  /** Multi-line functions, keyed by the callable stored in the scope. */
  private readonly userFunctions = new WeakMap<object, UserFunction>()
  /** Nesting depth while replaying function bodies to show their working. */
  private traceDepth = 0
  private nextSource = 0
  /** Constants from `@constants { }` blocks, available anywhere as `@name`. */
  private readonly customConstants = new Map<string, CustomConstant>()
  /** Sheet-wide precision from a line like `@c:4`, used wherever `@c` has no `:n` of its own. */
  private readonly constantPrecision = new Map<string, Precision>()
  /** Sheet-wide unit from a line like `@a_0 to angstrom`. */
  private readonly constantUnit = new Map<string, string>()
  /** Set while evaluating a line whose sum/difference has no significant figures. */
  private precisionLost = false
  private options: CalcOptions

  constructor(options: CalcOptions) {
    this.options = options
  }

  private get autoSigFigs() {
    return this.options.precision === 'auto'
  }

  /** mathjs format options for values without a sig-fig count (exact values, matrices). */
  private get format() {
    const p = this.options.precision
    return { ...FIXED_FORMAT, precision: p === 'auto' ? EXACT_DISPLAY_DIGITS : p }
  }

  /** Evaluate `node`; a value typed with a unit (`1.00e-10 m`) keeps that unit for display. */
  private typedValue(node: MathNode): unknown {
    const v = node.compile().evaluate(this.scope) as unknown
    if (isLiteral(node) && math.isUnit(v)) {
      const u = (v as Unit).clone()
      u.fixPrefix = true
      return u
    }
    return v
  }

  /** Whether showing `value` at `sf` sig figs drops digits (ignoring floating-point noise). */
  private isRounded(value: unknown, sf: number, forced = false): boolean {
    const p = this.split(value, sf, forced)
    if (!p) return false
    const shown = Number(p.num)
    return Number.isFinite(shown) && Math.abs(shown - p.x) > FLOAT_NOISE * Math.max(Math.abs(p.x), TINY)
  }

  /**
   * `x` to `sf` sig figs, in the current notation. `forced`: the sig figs were
   * declared (`m:3 = …`), so they apply even with a fixed sig-fig setting.
   */
  private formatNumber(x: number, sf: number, forced = false): string {
    if ((this.autoSigFigs || forced) && Number.isFinite(sf)) return formatSigFigs(x, sf, this.notation)
    if (this.notation) return formatExact(x, this.format.precision, this.notation)
    return math.format(x, this.format)
  }

  /** Run `fn` with numbers formatted in `notation` (undefined: the default). */
  private inNotation<T>(notation: Notation | undefined, fn: () => T): T {
    const saved = this.notation
    this.notation = notation
    try {
      return fn()
    } finally {
      this.notation = saved
    }
  }

  /** Set a variable, with everything kept about it (in the current scope). */
  private store(name: string, v: StoredVariable): void {
    // One record: it replaces whatever was kept about the name before, all of it.
    this.vars.set(name, v)
  }

  /** Make `vars` the variables in scope (entering or leaving a block or function call). */
  private enter(vars: Variables): void {
    this.vars = vars
    this.scope = new Values(vars)
  }

  /**
   * How an expression's result is shown if it's a vector: with unit vectors if
   * any vector in it is (`F:ijk`), else ⟨…⟩ if it has a vector in it at all
   * (`<…>`, a variable holding one, a function returning one); undefined if
   * it has none (a plain tuple).
   */
  private vectorStyleOf(node: MathNode): VectorStyle | undefined {
    const styles = node.filter((n) => isSymbolNode(n) || isFunctionNode(n)).map((n) => {
      if (isSymbolNode(n)) return this.vars.get(n.name)?.vector
      const name = (n as FunctionNode).fn.name
      if (name === VECTOR_FUNCTION) return 'angle'
      const f = this.scope.get(name)
      return typeof f === 'function' ? this.userFunctions.get(f)?.returnVector : undefined
    })
    if (styles.includes(UNIT_VECTOR_SETTING)) return UNIT_VECTOR_SETTING
    return styles.includes('angle') ? 'angle' : undefined
  }

  /** Run `fn` with tuples shown as vectors in `style` (undefined: as plain tuples). */
  private inVectorStyle<T>(style: VectorStyle | undefined, fn: () => T): T {
    const saved = this.vectorStyle
    this.vectorStyle = style
    try {
      return fn()
    } finally {
      this.vectorStyle = saved
    }
  }

  /**
   * While showing a call's working: parameter → TeX of the argument it was given,
   * so psi_prob(r, psi_200) shows 4πr²ψ₂₀₀², not 4πr²ψ².
   */
  private paramAliases = new Map<string, MathNode>()

  /**
   * Put each aliased parameter's argument in place of the parameter, bracketed;
   * toTex's automatic parentheses then keep the brackets only where needed
   * ((3.00 m/s)², but 2.00 kg·g).
   */
  private withAliases(node: MathNode): MathNode {
    if (!this.paramAliases.size) return node
    return node.transform((n, path) => {
      const alias = isSymbolNode(n) && path !== 'fn' ? this.paramAliases.get(n.name) : undefined
      if (!alias) return n
      // Automatic brackets drop around a negative (2.0 m · −2.0); keep them, as the
      // substituted step does.
      if (isOp(alias, OP.unaryMinus)) {
        const saved = this.paramAliases
        this.paramAliases = new Map()
        try {
          return rawNode(`\\left(${this.toTex(alias, new Map())}\\right)`)
        } finally {
          this.paramAliases = saved
        }
      }
      return new math.ParenthesisNode(alias.cloneDeep())
    })
  }

  private isVariable = (id: string) => this.scope.has(id)

  private isValueSymbol(n: MathNode, path: string): n is SymbolNode {
    return isSymbolNode(n) && path !== 'fn' && this.scope.has(n.name)
      && typeof this.scope.get(n.name) !== 'function'
  }

  /** Split a value into its number (in display units), formatted number, and unit. */
  private split(value: unknown, sf: number, forced = false): { x: number; num: string; unit?: string } | null {
    if (typeof value === 'number') return { x: value, num: this.formatNumber(value, sf, forced) }
    if (math.isUnit(value)) {
      // Full precision first (mathjs picks the unit prefix), then round ourselves.
      const s = math.format(displayUnit(value as Unit), { precision: MAX_DIGITS })
      const m = /^(\S+)\s+(.+)$/.exec(s)
      if (!m) return null
      const x = Number(m[1])
      return { x, num: this.formatNumber(x, sf, forced), unit: m[2] }
    }
    return null
  }

  /** An uncertainty expressed in the same display unit as its value. */
  private inDisplayUnits(value: unknown, unc: unknown, x: number, unit?: string): number {
    if (!math.isUnit(value)) return Math.abs(Number(unc))
    const si = magnitudeOf(value)
    if (si) return Math.abs((magnitudeOf(unc) * x) / si)
    try {
      return Math.abs((unc as Unit).toNumber(unit ?? ''))
    } catch {
      return Math.abs(magnitudeOf(unc))
    }
  }

  /** Sig figs to quote an uncertainty with: as declared, else the convention (auto) or 2 (fixed). */
  private uncSigFigs(declared?: number): number | undefined {
    return declared ?? (this.autoSigFigs ? undefined : 2)
  }

  /** Formatted pieces of `value ± unc`, rounded by the uncertainty convention. */
  private uncertainParts(value: unknown, unc: unknown, uncSf?: number) {
    const p = this.split(value, EXACT)
    if (!p) return null
    const dx = this.inDisplayUnits(value, unc, p.x, p.unit)
    if (!(dx > 0)) return null
    // The value is rounded to the uncertainty's last decimal place.
    return { ...formatWithUncertainty(p.x, dx, this.uncSigFigs(uncSf), this.notation), unit: p.unit }
  }

  /**
   * TeX for an uncertainty on its own, e.g. the result of `delta F`, shown in
   * the same unit as `like` (the value it belongs to) when given.
   */
  private uncertaintyTex(unc: unknown, like?: unknown, uncSf?: number): string {
    const p = this.split(like ?? unc, EXACT)
    if (!p) return this.valueTex(unc)
    const dx = like === undefined ? p.x : this.inDisplayUnits(like, unc, p.x, p.unit)
    let num = numberTex(this.formatNumber(dx, EXACT))
    if (dx > 0) {
      const f = formatWithUncertainty(dx, dx, this.uncSigFigs(uncSf), this.notation)
      num = f.unc + (f.exp !== undefined ? ` \\times 10^{${f.exp}}` : '')
    }
    return attachUnit(num, p.unit ? unitTex(p.unit) : '')
  }

  private valueTex(value: unknown, sf: number = EXACT, unc?: unknown, uncSf?: number, forced = false): string {
    const u = unc !== undefined ? this.uncertainParts(value, unc, uncSf) : null
    if (u) {
      const core = `${numberTex(u.num)} \\pm ${numberTex(u.unc)}`
      const exp = u.exp !== undefined ? ` \\times 10^{${u.exp}}` : ''
      const unit = u.unit ? unitTex(u.unit) : ''
      if (!exp && !unit) return core
      return attachUnit(`\\left(${core}\\right)${exp}`, unit)
    }
    const parts = this.split(value, sf, forced)
    if (parts) return attachUnit(numberTex(parts.num), parts.unit ? unitTex(parts.unit) : '')
    if (typeof value === 'boolean') return `\\text{${value}}`
    if (isTuple(value)) return this.tupleTex(value, sf, forced)
    if (math.isMatrix(value) || Array.isArray(value)) {
      try {
        return math.parse(math.format(value, this.format)).toTex()
      } catch {
        /* fall through */
      }
    }
    return `\\text{${math.format(value, this.format)}}`
  }

  /**
   * A tuple as (1.0, 2.0, 3.0) m: each value at `sf` sig figs, with a unit
   * they all share written once after the bracket, or each with its own.
   */
  private tupleTex(tuple: math.Matrix, sf: number, forced: boolean): string {
    const values = tuple.toArray() as unknown[]
    // A typed vector shows each component as typed (unless sig figs were declared).
    const typed = forced ? undefined : this.typedSfs.get(tuple)
    return this.valuesTex(values, values.map((_, i) => ({ sf: typed?.[i] ?? sf, forced, notation: this.notation })), this.vectorStyle)
  }

  /**
   * Values in a tuple's brackets, each at its own sig figs and notation (as
   * unpacked names can declare). As a vector (`style`), in angle brackets,
   * ⟨3.0, 4.0⟩ N, or with unit vectors, (3.0 î + 4.0 ĵ) N.
   */
  private valuesTex(values: unknown[], shown: { sf: number; forced: boolean; notation?: Notation }[], style?: VectorStyle): string {
    const parts = values.map((v, i) => this.inNotation(shown[i].notation, () => this.split(v, shown[i].sf, shown[i].forced)))
    const unit = parts[0]?.unit
    const shared = values.length > 0 && parts.every((p) => p && p.unit === unit)
    // Each value on its own; with a shared unit, the unit is written once instead.
    const each = values.map((v, i) => (shared
      ? numberTex(parts[i]!.num)
      : this.inNotation(shown[i].notation, () => this.valueTex(v, shown[i].sf, undefined, undefined, shown[i].forced))))
    const sharedUnit = shared && unit ? unitTex(unit) : ''
    if (style === UNIT_VECTOR_SETTING && values.length >= 2 && values.length <= UNIT_VECTOR_TEX.length) {
      // 3.0 î − 4.0 ĵ: each value's sign joins the terms.
      const sum = each.map((tex, i) => {
        const negative = tex.startsWith('-')
        const term = `${negative ? tex.slice(1) : tex}\\,${UNIT_VECTOR_TEX[i]}`
        if (i === 0) return negative ? `-${term}` : term
        return `${negative ? '-' : '+'} ${term}`
      }).join(' ')
      // (Plain brackets: \left( would grow to fit the hats.)
      return sharedUnit ? attachUnit(`(${sum})`, sharedUnit) : sum
    }
    const [open, close] = style ? ['\\left\\langle ', '\\right\\rangle'] : ['\\left(', '\\right)']
    return attachUnit(`${open}${each.join(', ')}${close}`, sharedUnit)
  }

  /** A variable's value for the substitution step, at its own sig figs. */
  private variableNode(name: string): MathNode {
    const shown = this.vars.get(name)?.shown
    if (shown) return rawNode(shown)
    return this.inNotation(this.vars.get(name)?.notation, () => this.inVectorStyle(this.vars.get(name)?.vector,
      () => this.valueNode(this.scope.get(name), this.vars.get(name)?.sf ?? EXACT, this.vars.get(name)?.declared === true)))
  }

  /**
   * TeX for an expression made only of numbers and built-in constants (pi, e,
   * tau, …), using at least one constant: `pi/4` → π/4 as a fraction. Bracketed
   * unless it's a single symbol, a fraction or a function call, so it can be
   * dropped into a substitution safely. Anything else (variables, units) → undefined.
   */
  private constantForm(node: MathNode, literals: Map<number, string>): string | undefined {
    const n = unwrap(node)
    const symbols = n.filter((c, path) => isSymbolNode(c) && path !== 'fn') as SymbolNode[]
    if (!symbols.length) return undefined
    if (symbols.some((c) => !BUILTIN_CONSTANT_NAMES.has(c.name) || this.scope.has(c.name))) return undefined
    if (n.filter((c) => isUnitCall(c)).length) return undefined
    const tex = this.toTex(n, literals)
    const bare = isSymbolNode(n) || isFunctionNode(n) || (isOp(n, OP.divide))
    return bare ? tex : `\\left(${tex}\\right)`
  }

  /** Node standing in for a variable's value in the substitution step. */
  private valueNode(value: unknown, sf: number, forced = false): MathNode {
    // A tuple is already bracketed, (1.0, 2.0) m; a sum of unit vectors needs brackets, unless it has a unit.
    if (isTuple(value)) {
      return rawNode(bracketed(this.valueTex(value, sf, undefined, undefined, forced)))
    }
    const parts = this.split(value, sf, forced)
    if (!parts) return rawNode(`\\left(${this.valueTex(value, sf)}\\right)`)
    const numTex = numberTex(parts.num)
    // A negative value is bracketed, so its sign doesn't read as an operator:
    // ½ · (−9.81 m/s²) · t², not ½ · −9.81 m/s² · t².
    if (parts.num.startsWith('-')) {
      return rawNode(`\\left(${parts.unit ? attachUnit(numTex, unitTex(parts.unit)) : numTex}\\right)`)
    }
    if (!parts.unit) return rawNode(numTex)
    const unit = new math.FunctionNode(new math.SymbolNode(FN.unit), [new math.ConstantNode(parts.unit)])
    return new math.ParenthesisNode(new math.OperatorNode(OP_SYMBOL.multiply, OP.multiply, [rawNode(numTex), unit]))
  }

  private toTex(node: MathNode, literals: Map<number, string>): string {
    // Leading spaces keep mathjs output such as `\cdot` from running into a name.
    const handler = (n: MathNode, options: object): string | undefined => {
      if (isConstantNode(n) && typeof n.value === 'number') {
        return ` ${numberTex(literals.get(n.value) ?? math.format(n.value, this.format))}`
      }
      if (isUnitCall(n)) return ` ${unitTex(unitCallText(n))}`
      if (isLitCall(n)) return ` ${numberTex(unitCallText(n))}`
      if (isOp(n, OP.multiply) && isUnitCall(n.args[1])) {
        return attachUnit(n.args[0].toTex(options), unitTex(unitCallText(n.args[1])))
      }
      // -2.0 m, not -(2.0 m)
      if (isOp(n, OP.unaryMinus) && (isNumberWithUnit(unwrap(n.args[0])) || isLiteral(n.args[0]))) {
        return ` -${unwrap(n.args[0]).toTex(options).trim()}`
      }
      // Products as in a textbook, ma, ½mv², 2.0 kg · 9.81 m/s² (or with every dot, if the option is on).
      if (isOp(n, OP.multiply)) {
        const factor = (a: MathNode, side: Side) => {
          // A negative value with a unit keeps its value bracketed, like the other
          // values in the product: −(500 N) sin(30°), not −500 N sin(30°).
          const negated = unwrap(a)
          if (!this.options.productDots && isOp(negated, OP.unaryMinus)
            && isNumberWithUnit(unwrap(negated.args[0]))) {
            return `-\\left(${unwrap(negated.args[0]).toTex(options).trim()}\\right)`
          }
          const tex = a.toTex(options).trim()
          return needsBrackets(a, side, !this.options.productDots) ? `\\left(${tex}\\right)` : tex
        }
        // A display name is words, so it's set apart from its neighbour with ×:
        // Molarity of EDTA × Average volume of EDTA.
        const labelled = (node: MathNode, side: Side): boolean => {
          const e = unwrap(node)
          if (isOp(e, OP.multiply)) return labelled(side === SIDE.right ? e.args[e.args.length - 1] : e.args[0], side)
          return isSymbolNode(e) && this.vars.get(e.name)?.label !== undefined
        }
        const separator = (l: MathNode, r: MathNode) => (labelled(l, SIDE.right) || labelled(r, SIDE.left)
          ? '\\times '
          : this.options.productDots ? '\\cdot ' : productSeparator(l, r))
        return ` ${n.args.slice(1).reduce((out, a, i) => `${out}${separator(n.args[i], a)}${factor(a, SIDE.right)}`,
          factor(n.args[0], SIDE.left))}`
      }
      // A value in scientific notation raised to a power is bracketed: (7.07 × 10⁻²)², not 7.07 × 10⁻²².
      if (isOp(n, OP.pow)) {
        const base = unwrap(n.args[0])
        if (isSymbolNode(base) && inScientificNotation(base)) {
          return `\\left(${base.name.slice(1)}\\right)^{${n.args[1].toTex(options).trim()}}`
        }
      }
      if (isSymbolNode(n)) {
        if (n.name.startsWith(RAW)) return ` ${n.name.slice(1)}`
        return ` ${this.nameTex(n.name)}`
      }
      if (isFunctionNode(n) && n.fn.name === FN.tuple) {
        return `\\left(${n.args.map((a) => a.toTex(options).trim()).join(', ')}\\right)`
      }
      if (isFunctionNode(n) && n.fn.name === VECTOR_FUNCTION) {
        return `\\left\\langle ${n.args.map((a) => a.toTex(options).trim()).join(', ')}\\right\\rangle`
      }
      // dot and cross products as operators, F · d and a × b (not mathjs's (F · d)),
      // bracketing an argument only where it needs it, such as a sum.
      const product = isFunctionNode(n) && n.args.length === 2 && typeof this.scope.get(n.fn.name) !== 'function'
        ? VECTOR_PRODUCTS[n.fn.name as keyof typeof VECTOR_PRODUCTS] : undefined
      if (product && isFunctionNode(n)) {
        const [a, b] = n.args.map((arg, i) => {
          const tex = arg.toTex(options).trim()
          return needsBrackets(arg, i === 0 ? SIDE.left : SIDE.right, false) ? `\\left(${tex}\\right)` : tex
        })
        return ` ${a} ${product} ${b}`
      }
      if (isFunctionNode(n) && (!(n.fn.name in math) || typeof this.scope.get(n.fn.name) === 'function')) {
        // User-defined function (even one named like a built-in, e.g. sum): f(x), not \mathrm{f}(x)
        return ` ${symbolTex(n.fn.name)}\\left(${n.args.map((a) => a.toTex(options).trim()).join(', ')}\\right)`
      }
      return undefined
    }
    return this.withAliases(node)
      .toTex({ parenthesis: 'auto', implicit: 'hide', handler } as object)
      .replace(/([{(])\s+/g, '$1')
      .trim()
  }

  // -------------------------------------------------------------------------
  // Significant figures
  // -------------------------------------------------------------------------

  /** Numeric size of a subexpression in SI base units, for the addition rule. */
  private magnitude(node: MathNode): number {
    try {
      const v = node.compile().evaluate(this.scope)
      if (typeof v === 'number') return v
      if (math.isUnit(v)) return (v as Unit).value ?? NaN
    } catch {
      /* not evaluable on its own */
    }
    return NaN
  }

  /**
   * Significant figures of an expression's result.
   *   - measured numbers (with a unit, or written with a decimal point or exponent)
   *     count as typed; integers without a unit are exact, e.g. the 2 in 2 * a * d
   *   - × ÷, powers and functions: the fewest sig figs among the inputs
   *   - + −: rounded to the least precise decimal place among the terms
   */
  private sigFigsOf(node: MathNode, literals: Map<number, string>, measured: boolean): number {
    if (isParenthesisNode(node)) return this.sigFigsOf(node.content, literals, measured)
    if (isConstantNode(node)) {
      if (typeof node.value !== 'number') return EXACT
      const text = literals.get(node.value) ?? String(node.value)
      return measured || isMeasuredLiteral(text) ? countSigFigs(text) : EXACT
    }
    if (isUnitCall(node)) return EXACT
    // Written with extra precision (2.00, 1.2e3): always a measured value.
    if (isLitCall(node)) return countSigFigs(unitCallText(node))
    if (isSymbolNode(node)) return this.vars.get(node.name)?.sf ?? EXACT
    // `cond ? a : b`: the sig figs of whichever it comes to.
    if (math.isConditionalNode(node)) {
      let chosen = node.trueExpr
      try {
        if (node.condition.compile().evaluate(this.scope) !== true) chosen = node.falseExpr
      } catch { /* reported when the line is worked out */ }
      return this.sigFigsOf(chosen, literals, measured)
    }
    // A call to a function that declares its result's sig figs (`f(x):3 = …`).
    if (isFunctionNode(node)) {
      const f = this.scope.get(node.fn.name)
      const declared = typeof f === 'function' ? this.userFunctions.get(f)?.returnSf : undefined
      if (declared !== undefined) return declared
      // Otherwise its return line's, as worked out when its working was traced.
      const traced = this.callSigFigs.get(node)
      if (traced !== undefined) return traced
    }
    if (isOperatorNode(node)) {
      // A number with a unit is measured; but a whole number of a species (`1 mol {X}`,
      // from a balanced equation) is a count, and exact.
      if (node.fn === OP.multiply && isUnitCall(node.args[1])) {
        return this.sigFigsOf(node.args[0], literals, !isSpeciesCount(node.args[0], node.args[1], literals))
      }
      if (node.fn === OP.unaryMinus || node.fn === OP.unaryPlus) return this.sigFigsOf(node.args[0], literals, measured)
      if (node.fn === OP.add || node.fn === OP.subtract) {
        const terms = node.args.map((a) => ({ sf: this.sigFigsOf(a, literals, false), x: this.magnitude(a) }))
        const total = this.magnitude(node)
        if (Number.isNaN(total) || terms.some((t) => Number.isNaN(t.x))) return Math.min(...terms.map((t) => t.sf))
        const sf = sigFigsFromPlace(total, Math.max(...terms.map((t) => lastPlace(t.x, t.sf))))
        if (sf < 1) this.precisionLost = true
        return Math.max(1, sf)
      }
      // An exponent written as plain numbers (^0.5, ^(3/2), ^(-0.5)) is part of the
      // formula, not a measurement, so only the base limits the sig figs.
      if (node.fn === OP.pow && isPureNumber(node.args[1])) return this.sigFigsOf(node.args[0], literals, false)
    }
    let sf = EXACT
    node.forEach((child, path) => {
      if (path === 'fn') return
      // A measured zero passed to a function (cos 0.00°, exp(0.00)) has decimal places,
      // not relative precision, and the result (1) is known far better than that
      // count suggests, so it doesn't limit the sig figs.
      if (isFunctionNode(node) && this.magnitude(child) === 0) return
      sf = Math.min(sf, this.sigFigsOf(child, literals, false))
    })
    return sf
  }

  /** Whole numbers like `300 m` whose trailing zeros won't count. */
  private ambiguousLiterals(node: MathNode, literals: Map<number, string>): string[] {
    const found = new Set<string>()
    const visit = (n: MathNode, measured: boolean) => {
      n = unwrap(n)
      if (isConstantNode(n)) {
        const text = literals.get(n.value as number) ?? String(n.value)
        if (measured && hasAmbiguousZeros(text)) found.add(text)
      } else if (isOp(n, OP.multiply) && isUnitCall(n.args[1])) {
        visit(n.args[0], true)
      } else if (isOp(n, OP.unaryMinus)) {
        visit(n.args[0], measured)
      } else if (math.isConditionalNode(n)) {
        // A condition's numbers are limits to compare with (x > 10 N), not measurements.
        visit(n.trueExpr, false)
        visit(n.falseExpr, false)
      } else if (math.isRelationalNode(n) || (isOperatorNode(n) && COMPARISONS.has(n.fn))) {
        // (Nor on a comparison of its own: ok = x < 300 m.)
      } else {
        n.forEach((c) => visit(c, false))
      }
    }
    visit(node, false)
    return [...found]
  }

  // -------------------------------------------------------------------------
  // Uncertainty
  // -------------------------------------------------------------------------

  /** Combined (quadrature) uncertainty from contributions, in the same quantity as `like`. */
  private total(contributions: Contributions | undefined, like: unknown): unknown {
    if (!contributions?.size) return undefined
    let sumSq = 0
    for (const c of contributions.values()) sumSq += magnitudeOf(c) ** 2
    const t = Math.sqrt(sumSq)
    if (!(t > 0)) return undefined
    if (math.isUnit(like)) {
      const u = (like as Unit).clone()
      u.value = t
      return u
    }
    return t
  }

  private totalUncertainty(name: string): unknown {
    return this.total(this.vars.get(name)?.contributions, this.scope.get(name))
  }

  private uncertainInputs(expr: MathNode): string[] {
    const names = expr.filter((n, path) => this.isValueSymbol(n, path)).map((n) => (n as SymbolNode).name)
    return [...new Set(names)].filter((n) => this.vars.get(n)?.contributions?.size)
  }

  /**
   * Propagate uncertainty through `expr` (first order). For each source, nudge
   * every input along that source's contribution and take the central
   * difference; the result is that source's contribution to `expr`, which is
   * Σ (∂f/∂xᵢ)·δxᵢ. Combining sources in quadrature then gives
   * Δf = √(Σ (∂f/∂x · Δx)²) for independent inputs, while shared sources stay correlated.
   */
  private propagate(expr: MathNode): Contributions {
    const out: Contributions = new Map()
    const inputs = this.uncertainInputs(expr)
    // Quantities built from an uncertainty (like ΔF / F) don't carry one themselves.
    const usesUncertainty = expr.filter((n) => isSymbolNode(n) && isUncertaintyName(n.name)).length > 0
    if (!inputs.length || usesUncertainty) return out
    const code = expr.compile()
    // (Each input has contributions: uncertainInputs keeps only those.)
    const contributionsOf = (n: string) => this.vars.get(n)!.contributions!
    const sources = new Set(inputs.flatMap((n) => [...contributionsOf(n).keys()]))
    for (const source of sources) {
      const plus = innerValues(this.vars)
      const minus = innerValues(this.vars)
      for (const n of inputs) {
        const d = contributionsOf(n).get(source)
        if (d === undefined) continue
        const v = this.scope.get(n) as MathType
        const step = math.multiply(d as MathType, STEP) as MathType
        plus.set(n, math.add(v, step))
        minus.set(n, math.subtract(v, step))
      }
      const diff = math.subtract(code.evaluate(plus) as MathType, code.evaluate(minus) as MathType) as MathType
      out.set(source, math.divide(diff, 2 * STEP))
    }
    return out
  }

  /**
   * Replace `delta F` / `Delta F` with a hidden variable holding F's
   * uncertainty. Not followed by a defined variable, they stay Greek letters.
   */
  private expandDeltaRefs(line: string): string {
    return line.replace(DELTA_REF, (match, letter: UncertaintyWord, name: string) => {
      if (!this.scope.has(name) || typeof this.scope.get(name) === 'function') return match
      const value = this.scope.get(name)
      const unc = this.totalUncertainty(name) ?? math.multiply(value as MathType, 0)
      const hidden = uncertaintyName(letter, name)
      this.store(hidden, { value: unc, sf: uncertaintySigFigs(this.split(unc, EXACT)?.x ?? 0) })
      return hidden
    })
  }

  /** `2.0 kg pm 0.1 kg` → (2.0 ± 0.1) kg, keeping the numbers as typed. */
  private pmTex(value: MathNode, unc: MathNode, percent: boolean, literals: Map<number, string>): string {
    const a = unwrap(value)
    const b = unwrap(unc)
    if (!percent && isNumberWithUnit(a) && (isConstantNode(b) || (isNumberWithUnit(b)
      && unitCallText(b.args[1] as FunctionNode) === unitCallText(a.args[1] as FunctionNode)))) {
      const unit = unitTex(unitCallText(a.args[1] as FunctionNode))
      const bNum = isNumberWithUnit(b) ? b.args[0] : b
      return attachUnit(`\\left(${this.toTex(a.args[0], literals)} \\pm ${this.toTex(bNum, literals)}\\right)`, unit)
    }
    return `${this.toTex(value, literals)} \\pm ${this.toTex(unc, literals)}${percent ? '\\%' : ''}`
  }

  /**
   * Working for `delta F`: the quadrature formula over F's direct inputs, its
   * partial derivatives, and the values substituted in. Skipped when inputs
   * share an uncertainty source, since the simple formula assumes independence.
   */
  private deltaWorking(name: string, letter: UncertaintyWord): string[] {
    const def = this.vars.get(name)?.def
    if (!def) return []
    const inputs = this.uncertainInputs(def).filter((n) => !isUncertaintyName(n))
    if (!inputs.length) return []
    const sources = inputs.map((n) => new Set(this.vars.get(n)?.contributions!.keys()))
    if (sources.some((a, i) => sources.slice(i + 1).some((b) => [...a].some((s) => b.has(s))))) return []

    const target = symbolTex(name)
    // Same letter the user asked with: δx for `delta F`, Δx for `Delta F`.
    const uncOf = (n: string) => symbolTex(uncertaintyName(letter, n))
    const sqrt = (terms: string[]) => `\\sqrt{${terms.join(' + ')}}`
    const term = (factor: string, delta: string) => `\\left(${factor}\\cdot ${delta}\\right)^{2}`
    const steps = [sqrt(inputs.map((n) =>
      term(`\\frac{\\partial ${target}}{\\partial ${symbolTex(n)}}`, uncOf(n))))]
    try {
      const derivs = inputs.map((n) => math.derivative(def, n))
      const wrap = (d: MathNode, tex: string) =>
        (isOp(d, OP.add, OP.subtract, OP.unaryMinus) ? `\\left(${tex}\\right)` : tex)
      steps.push(sqrt(inputs.map((n, i) =>
        term(wrap(derivs[i], this.toTex(derivs[i], new Map())), uncOf(n)))))
      if (this.options.showSubstitution) {
        steps.push(sqrt(inputs.map((n, i) => {
          const sub = derivs[i].transform((m, path) => (this.isValueSymbol(m, path)
            ? this.variableNode(m.name)
            : m))
          return term(
            wrap(derivs[i], this.toTex(sub, new Map())),
            this.uncertaintyTex(this.totalUncertainty(n), this.scope.get(n), this.vars.get(n)?.uncSf),
          )
        })))
      }
    } catch {
      /* no symbolic derivative (units or user functions in the formula): show the general form only */
    }
    return steps
  }

  // -------------------------------------------------------------------------
  // Series aggregates
  // -------------------------------------------------------------------------

  /** Variables named base1, base2, … or base_1, base_2, …, visible from here, in index order. */
  private seriesMembers(base: string): string[] {
    // A selection's series: its members are its numbers (each a lookup; see Views).
    const view = this.views.get(base)
    if (view) return view.flatMap((name, i) => (name ? [seriesMemberName(base, i + 1)] : []))
    const found = new Map<string, number>()
    // Each level's members, from its series index (an inner level's hide an outer's of the same name).
    for (let s: Variables | undefined = this.vars; s; s = s.parent) {
      for (const name of s.membersHere(base) ?? []) {
        if (found.has(name) || isUncertaintyName(name) || this.vars.get(name)?.agg) continue
        if (typeof this.scope.get(name) === 'function') continue
        found.set(name, parseNumberedName(name)!.n)
      }
    }
    return [...found.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([n]) => n)
  }

  /**
   * Define any series aggregates named on this line (a, a_avg, a_std, a_count)
   * from the current members, so they are always up to date. A variable
   * defined explicitly with the same name takes precedence.
   */
  private defineAggregates(line: string, skip?: string): string | undefined {
    for (const m of line.matchAll(NAME_IN_LINE)) {
      const name = m[1]
      if (name === skip || (this.scope.has(name) && !this.vars.get(name)?.agg)) continue
      // e1, e2, … don't turn `e` into a sum: Euler's number (and pi, tau, …) win.
      if (BUILTIN_CONSTANT_NAMES.has(name)) continue
      const { base, kind } = parseAggregateName(name)
      const members = this.seriesMembers(base)
      if (!members.length) continue
      try {
        this.defineAggregate(name, { kind, base, members })
      } catch (e) {
        return `${name}: ${(e as Error).message}`
      }
    }
    return undefined
  }

  private defineAggregate(name: string, agg: Aggregate): void {
    const values = agg.members.map((n) => this.scope.get(n))
    if (values.some((v) => typeof v !== 'number' && !math.isUnit(v))) {
      throw new Error('only numbers and quantities can be combined.')
    }
    const n = values.length
    const first = values[0]
    if (values.some((v) => math.isUnit(v) !== math.isUnit(first)
      || (math.isUnit(v) && !(v as Unit).equalBase(first as Unit)))) {
      throw new Error(`${agg.members.join(', ')} don't all have the same units.`)
    }
    const total = values.reduce((acc, v) => math.add(acc as MathType, v as MathType))

    let value: unknown
    let contributions: Contributions = new Map()
    let sf = EXACT
    switch (agg.kind) {
      case AGGREGATE_KIND.count:
        value = n
        break
      case AGGREGATE_KIND.sum:
        value = total
        contributions = this.mergedContributions(agg.members)
        sf = this.seriesSigFigs(agg.members, total)
        break
      case AGGREGATE_KIND.mean:
        value = math.divide(total as MathType, n)
        sf = this.seriesSigFigs(agg.members, total)
        // Standard error σ/√n, as one source shared by every use of this mean.
        if (n >= 2) contributions = new Map([[this.aggregateSource(agg.base), this.standardError(values)]])
        else contributions = this.mergedContributions(agg.members)
        break
      case AGGREGATE_KIND.std:
      case AGGREGATE_KIND.sem:
        if (n < 2) throw new Error('a standard deviation needs at least two values.')
        value = agg.kind === AGGREGATE_KIND.std ? this.stdDev(values) : this.standardError(values)
        sf = uncertaintySigFigs(this.split(value, EXACT)?.x ?? 0)
        break
    }
    // Show sums, means and spreads in the members' own unit (s, not ms).
    value = math.isUnit(value) && math.isUnit(first)
      ? (value as Unit).to((first as Unit).formatUnits())
      : normalise(value, true)
    const unc = this.total(contributions, value)
    if (unc !== undefined) sf = this.uncertainParts(value, unc)?.sf ?? sf

    this.store(name, { value, sf, contributions, agg })
  }

  /** Uncertainty of a sum: each member's contributions added source by source. */
  private mergedContributions(members: string[]): Contributions {
    const out: Contributions = new Map()
    for (const m of members) {
      for (const [source, c] of this.vars.get(m)?.contributions ?? []) {
        out.set(source, out.has(source) ? math.add(out.get(source) as MathType, c as MathType) : c)
      }
    }
    return out
  }

  /** Sig figs of a series total by the addition rule (least precise decimal place). */
  private seriesSigFigs(members: string[], total: unknown): number {
    const place = Math.max(...members.map((m) =>
      lastPlace(magnitudeOf(this.scope.get(m)), this.vars.get(m)?.sf ?? EXACT)))
    const sf = sigFigsFromPlace(magnitudeOf(total), place)
    return Number.isFinite(sf) ? Math.max(1, sf) : EXACT
  }

  /** Sample standard deviation (n − 1), in the units of the first value. */
  private stdDev(values: unknown[]): unknown {
    const xs = values.map(magnitudeOf)
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    const s = Math.sqrt(xs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (xs.length - 1))
    if (!math.isUnit(values[0])) return s
    const u = (values[0] as Unit).clone()
    u.value = s
    return u
  }

  /** Standard error of the mean, σ/√n. */
  private standardError(values: unknown[]): unknown {
    return math.divide(this.stdDev(values) as MathType, Math.sqrt(values.length))
  }

  private aggregateSource(base: string): number {
    let id = this.aggregateSources.get(base)
    if (id === undefined) {
      id = this.nextSource++
      this.aggregateSources.set(base, id)
    }
    return id
  }

  /** Working for a line that is just an aggregate: Σ notation, members, values. */
  private aggregateWorking(agg: Aggregate): string[] {
    const n = agg.members.length
    if (n === 1 && agg.kind !== AGGREGATE_KIND.count) return [symbolTex(agg.members[0])]
    // A long series shows its first two members, ⋯, and its last (only those are typeset).
    const list = (f: (m: string) => string) => (n > 6
      ? [f(agg.members[0]), f(agg.members[1]), '\\cdots', f(agg.members[n - 1])]
      : agg.members.map(f)).join(' + ')
    const names = list(symbolTex)
    const values = list((m) => this.toTex(this.variableNode(m), new Map()))
    const baseTex = symbolTex(agg.base)
    const ith = agg.base.includes('_') ? `\\left(${baseTex}\\right)_{i}` : `${baseTex}_{i}`
    const sum = (body: string) => `\\sum_{i=1}^{${n}} ${body}`
    const sub = this.options.showSubstitution
    switch (agg.kind) {
      case AGGREGATE_KIND.sum:
        return [sum(ith), names, ...(sub ? [values] : [])]
      case AGGREGATE_KIND.mean:
        return [`\\frac{1}{${n}}${sum(ith)}`, `\\frac{${names}}{${n}}`, ...(sub ? [`\\frac{${values}}{${n}}`] : [])]
      case AGGREGATE_KIND.std:
        return [`\\sqrt{\\frac{1}{${n}-1}${sum(`\\left(${ith}-\\bar{${baseTex}}\\right)^{2}`)}}`]
      case AGGREGATE_KIND.sem:
        return this.standardErrorWorking(agg)
      case AGGREGATE_KIND.count:
        return []
    }
  }

  /** σ/√n, then with σ and n substituted (for `a_sem` and `delta a_avg`). */
  private standardErrorWorking(agg: Aggregate): string[] {
    const n = agg.members.length
    if (n < 2) return []
    const sigma = symbolTex(`${agg.base}_std`)
    const steps = [`\\frac{${sigma}}{\\sqrt{n}}`]
    if (this.options.showSubstitution) {
      const values = agg.members.map((m) => this.scope.get(m))
      const s = this.stdDev(values)
      // σ to 2 sig figs here, so the division visibly gives the result.
      const sTex = this.uncertaintyTex(s, math.isUnit(values[0]) ? values[0] : undefined, 2)
      steps.push(`\\frac{${sTex}}{\\sqrt{${n}}}`)
    }
    return steps
  }

  // -------------------------------------------------------------------------
  // Constants
  // -------------------------------------------------------------------------

  /**
   * Define a constant from a line of an `@constants { }` block (`rho = 998 kg/m^3`).
   * It's evaluated in a scratch scope, so it doesn't become an ordinary
   * variable, and is then available as `@rho` anywhere in the sheet.
   */
  /** Use `digits` sig figs for every `@name` in the sheet that doesn't give its own. */
  declareConstantPrecision(name: string, digits: Precision): void {
    this.constantPrecision.set(name, digits)
  }

  /** Show every `@name` in the sheet in `unit` (from a line like `@a_0:3 to angstrom`). */
  declareConstantUnit(name: string, unit: string): void {
    this.constantUnit.set(name, unit)
  }

  /**
   * Imported data (`import("run1.csv")`): each value becomes a variable named
   * for its column and row, t_1, t_2, …, with the column's unit and its sig
   * figs as typed (a whole number without a unit is exact, as when typed).
   * A named import (`run1 = import(…)`) puts them under its name: run1.t_1.
   * Returns what each column made, for the import's summary.
   */
  defineData(columns: CsvColumn[], namespace?: string): { columns: DataColumn[]; error?: string } {
    if (namespace && RESERVED_NAMESPACES.has(namespace)) return { columns: [], error: `${namespace} is a reserved word: choose another name for the data.` }
    // The name a column's variables go under: x, or run1.x.
    const named = (name: string) => (namespace ? memberName(namespace, name) : name)
    const bad = columns.find((c) => c.unit && !isValidUnit(c.unit))
    if (bad) return { columns: [], error: `In column ${bad.name}, "${bad.unit}" isn't a unit MathScribe knows.` }
    const badUnc = columns.map(uncertaintyUnitError).find(Boolean)
    if (badUnc) return { columns: [], error: badUnc }
    const out: DataColumn[] = []
    for (const c of columns) {
      const uncertainty = c.unc && (c.unc.percent ? `${c.unc.column} (%)` : c.unc.column)
      if (!c.values.length) {
        out.push({ name: named(c.name), unit: c.unit, count: 0, uncertainty })
        continue
      }
      const values = columnValues(c)
      for (const v of values) {
        // Each value's uncertainty is a source of its own, as each `pm` is.
        if (v.unc !== undefined) this.store(named(v.name), { ...v, contributions: new Map([[this.nextSource++, v.unc]]) })
        else this.store(named(v.name), v)
      }
      const { lowest, highest } = values.range
      out.push({
        name: named(c.name), unit: c.unit, count: values.length, uncertainty,
        first: c.values[0].row, last: c.values.at(-1)!.row,
        min: this.valueTex(lowest.value, lowest.sf), max: this.valueTex(highest.value, highest.sf),
      })
    }
    return { columns: out }
  }

  /**
   * A value for text, `{{c_Na}}`, as LaTeX: its value now, with its sig figs,
   * unit and uncertainty. Settings go on the name as on any line (`V:4`,
   * `x:sci`), and `to` converts (`V to mL`); any expression works.
   */
  inlineValue(source: string): { tex?: string; error?: string } {
    const text = expandDots(source.trim())
    const settings = NAME_THEN_SETTINGS.exec(text)
    // A name on its own is read as a line of its own, so it shows as the variable
    // does (in the unit it was typed in); anything else is worked out as a value.
    const line = IS_NAME.test(text)
      ? text
      : settings
        ? `${INLINE_VALUE_NAME}${settings[2]} = ${settings[1]}${settings[3]}`
        : `${INLINE_VALUE_NAME} = ${text}`
    try {
      const result = this.evaluateLine(line, DISPLAY_MODE.val, true)
      if (result.error) return { error: readableMembers(result.error) }
      return { tex: nestBrackets(result.parts?.result ?? result.tex) }
    } finally {
      this.forget(INLINE_VALUE_NAME)
    }
  }

  /**
   * A display name as LaTeX: its text upright, each `{{x}}` as x's value now
   * (so the name says what it was worked out from), each `{Na^+}` as chemistry.
   */
  private labelTex(label: string): { tex: string; error?: string } {
    let error: string | undefined
    const withValuesIn = outsideMaths(label, (part) => part.replace(VALUE_IN_TEXT, (whole, source: string) => {
      const v = this.inlineValue(source)
      if (v.tex !== undefined) return `$${v.tex}$`
      error ??= `In its display name, ${whole}: ${v.error}`
      return whole
    }))
    // (Spaces at the ends of the words are explicit spaces, outside \text, so they survive.)
    const words = (part: string) => {
      const [, before, inner, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(part)!
      const space = (s: string) => (s ? '\\ ' : '')
      return `${space(before)}${inner ? `\\text{${escapeText(inner)}}` : ''}${space(after)}`
    }
    const tex = withFormulas(withValuesIn).split(/(\$[^$]*\$)/)
      .map((part, i) => (i % 2 ? part.slice(1, -1) : words(part)))
      .join('')
    return { tex, error }
  }

  /** How a variable's name is shown: its display name, if it has one. */
  private nameTex(name: string): string {
    return this.vars.get(name)?.label ?? symbolTex(name)
  }

  defineConstant(input: string): CalcResult {
    const name = ASSIGNMENT.exec(input)?.[1]
    if (!name) return { tex: '', error: 'Inside @constants, each line is "name = value".' }
    this.pushScope()
    try {
      const result = this.evaluate(input)
      if (!result.error && this.scope.has(name)) {
        this.customConstants.set(name, {
          value: this.scope.get(name),
          sf: this.vars.get(name)?.sf ?? EXACT,
          contributions: this.vars.get(name)?.contributions ?? new Map(),
          uncSf: this.vars.get(name)?.uncSf,
          declared: this.vars.get(name)?.declared === true,
        })
      }
      return result
    } finally {
      this.popScope()
    }
  }

  /**
   * Replace `@name`, `@name:n` and `@name:exact` with hidden variables holding
   * the constant rounded to that many sig figs. Built-ins default to 3 sig figs;
   * constants from an `@constants` block default to the precision they were
   * written with. `:exact` gives full precision and doesn't limit sig figs.
   */
  private expandConstants(line: string): { text: string; error?: string } {
    let error: string | undefined
    const text = line.replace(CONSTANT_REF, (match, name: string, spec?: string) => {
      const custom = this.customConstants.get(name)
      const builtin = BUILTIN_CONSTANTS[name]
      if (!custom && !builtin) {
        const known = [...Object.keys(BUILTIN_CONSTANTS), ...this.customConstants.keys()]
        const guess = suggestConstant(name, known)
        error ??= `Unknown constant @${name}.`
          + (guess ? ` Did you mean @${guess}?` : ' Define it in an @constants { } block.')
        return match
      }
      // Precedence: this use's own :n, then the sheet's declaration, then the default.
      const digits: Precision = spec === EXACT_SETTING
        ? EXACT_SETTING
        : spec !== undefined
          ? Number(spec)
          : this.constantPrecision.get(name) ?? (custom ? custom.sf : DEFAULT_CONSTANT_SIG_FIGS)
      if (digits === 0) {
        error ??= `@${name}:0 isn't valid; use at least 1 sig fig, or :exact.`
        return match
      }
      // Built-ins stay in their own unit (1.602e-19 C, not 160.2 zC).
      let full = custom
        ? custom.value
        : builtin.unit ? math.unit(builtin.value, builtin.unit).to(builtin.unit) : builtin.value
      // A sheet-wide `@name to unit` converts before rounding, so `@a_0:3 to angstrom` is 0.529 Å.
      // (If the unit doesn't fit, the declaration line itself reports the error.)
      const unit = this.constantUnit.get(name)
      if (unit && math.isUnit(full)) {
        try {
          full = (full as Unit).to(unit)
        } catch { /* reported on the declaration line */ }
      }
      const exact = digits === EXACT_SETTING || !Number.isFinite(digits)
      const hidden = constantRefName(name, exact ? EXACT_SETTING : digits)
      // `:exact` shows every digit of the value; that many sig figs is more than any
      // measurement has, so it never limits a result.
      const allDigits = custom ? custom.sf : countSigFigs(String(builtin.value))
      this.store(hidden, {
        value: exact ? full : this.roundTo(full, digits),
        sf: exact ? allDigits : digits,
        contributions: custom?.contributions,
        uncSf: custom?.uncSf,
        // An explicit precision (`@c:4`, a sheet-wide `@c:4` line, `rho:2 = …`) beats the global setting.
        declared: spec !== undefined || this.constantPrecision.has(name) || custom?.declared || undefined,
      })
      return hidden
    })
    return { text, error }
  }

  /** A number or quantity rounded to `digits` sig figs, in its own display unit. */
  private roundTo(value: unknown, digits: number): unknown {
    if (typeof value === 'number') return Number(value.toPrecision(digits))
    if (!math.isUnit(value)) return value
    const m = /^(\S+)\s+(.+)$/.exec(math.format(value as Unit, { precision: MAX_DIGITS }))
    return m ? math.unit(Number(Number(m[1]).toPrecision(digits)), m[2]).to(m[2]) : value
  }

  // -------------------------------------------------------------------------
  // Multi-line functions
  // -------------------------------------------------------------------------

  /**
   * Define a Python-style function:
   *
   *   def f(a, b)
   *       c = a * b
   *       return c + 1
   *
   * Each call runs the body in a fresh local scope whose parent is the scope the
   * function was defined in, so the body can read variables from around the
   * definition, and its own assignments stay local. Calls go through mathjs like
   * any other function, so units, sig figs and uncertainty propagation apply.
   */
  /**
   * `returnSpec`: settings for the result, written after the parameters as on a
   * variable (`f(x):3:deg`, `def polar(x, y):3`): every call's result is shown
   * (and kept) that way.
   */
  defineFunction(name: string, paramSpecs: string[], lines: FunctionLine[], multiline = false, returnSpec = ''): FunctionResult {
    // `m to kg`: the argument is converted to kg on the way in.
    const parsed = paramSpecs.map(parseParam)
    const params = parsed.map((p) => p?.name ?? '')
    const casts = parsed.map((p) => p?.unit)
    const ret = returnSpec ? parseDeclaration(`${name}${returnSpec} = 0`) : null
    const returnSettings = ret && !('error' in ret) ? ret : null
    const shownUnit = returnSettings?.unit && returnSettings.unit !== PERCENT ? returnSettings.unit : undefined
    const signature = `${symbolTex(name)}\\left(${parsed.map((p, i) => (p
      ? `${symbolTex(p.name)}${p.unit ? `\\,[${unitTex(p.unit)}]` : ''}`
      : paramSpecs[i])).join(', ')}\\right)${shownUnit ? `\\to[${unitTex(shownUnit)}]` : ''}`
    const body: FunctionResult['body'] = []
    if (ret && 'error' in ret) return { signature, body, error: ret.error }
    if (returnSettings?.unit === PERCENT) {
      return { signature, body, error: `${name}:percent isn't available on a function; show a result as a percentage where it's used.` }
    }
    if (returnSettings?.components) {
      return { signature, body, error: `${name}:${COMPONENTS_SETTING} isn't available on a function; use it on the variable that stores the result.` }
    }
    const returnUnit = shownUnit
    const returnSf = returnSettings?.sf === EXACT_SETTING ? EXACT : returnSettings?.sf
    const returnNotation = returnSettings?.notation
    const returnVector = returnSettings?.vector ?? (lines.some((l) => hasVector(l.text)) ? 'angle' : undefined)
    const bad = paramSpecs.find((_, i) => !parsed[i])
    if (bad !== undefined) return { signature, body, error: `"${bad}" isn't a valid parameter: write a name, or "name to unit".` }
    const badUnit = casts.find((u) => u !== undefined && !isValidUnit(u))
    if (badUnit) return { signature, body, error: `"${badUnit}" isn't a unit MathScribe knows.` }
    type Statement = Guarded & (
      // `unit`: a display unit on the name (`th:deg = …`), which the value keeps.
      | { kind: typeof STATEMENT_KIND.assign; name: string; code: math.EvalFunction; unit?: string; components?: boolean }
      | { kind: typeof STATEMENT_KIND.unpack; targets: TupleName[]; code: math.EvalFunction }
      | { kind: typeof STATEMENT_KIND.return; code: math.EvalFunction }
      | { kind: typeof STATEMENT_KIND.branch; text: string }
    )
    const statements: Statement[] = []
    const sources: UserFunction['statements'] = []

    const duplicate = params.find((p, i) => params.indexOf(p) !== i)
    if (duplicate) return { signature, body, error: `The parameter "${duplicate}" is listed twice.` }

    // Branches open at this line (each with its `if`/`else` line's indentation),
    // and the chains an `else` could still continue, by their `if`'s indentation.
    const open: { indent: number; id: number }[] = []
    const chains: { indent: number; chain: number }[] = []
    let nextBranch = 0

    for (const { line, text, note, command, multiline: lineMultiline, indent = 0 } of lines) {
      // A line indented no further than a branch's own line ends that branch.
      while (open.length && indent <= open.at(-1)!.indent) open.pop()
      while (chains.length && indent < chains.at(-1)!.indent) chains.pop()
      const guards = open.map((b) => b.id)
      // How far in the definition's card shows it: one step per branch around it.
      const inset = '\\quad '.repeat(guards.length)

      // `if …`, `else if …`, `else`: a branch, holding the lines indented under it.
      const elseIf = ELSE_IF_LINE.exec(text)
      const ifLine = elseIf ? null : IF_LINE.exec(text)
      const isElse = ELSE_LINE.test(text)
      if (ifLine || elseIf || isElse) {
        const continues = chains.at(-1)?.indent === indent
        if (!ifLine && !continues) {
          return { signature, body, error: `Line ${line}: this ${KEYWORD.else} has no ${KEYWORD.if} before it at the same indentation.` }
        }
        if (ifLine && continues) chains.pop()
        const id = nextBranch++
        const chain = ifLine ? id : chains.at(-1)!.chain
        if (ifLine) chains.push({ indent, chain })
        // (After an `else`, the chain is over: another `else` has nothing to continue.)
        if (isElse) chains.pop()
        const condition = ifLine?.[1] ?? elseIf?.[1]
        try {
          let code: math.EvalFunction | undefined
          let tex = '\\text{otherwise}'
          if (condition !== undefined) {
            const literals = new Map<number, string>()
            for (const m of condition.matchAll(NUMBER_LITERAL)) addLiteral(literals, m[0])
            const expanded = this.expandConstants(condition)
            if (expanded.error) throw new Error(expanded.error)
            const node = math.parse(preprocess(expanded.text, this.isVariable).text)
            code = node.compile()
            tex = `\\text{${ifLine ? KEYWORD.if : `${KEYWORD.else} ${KEYWORD.if}`} }${this.toTex(node, literals)}`
          }
          const branch = { id, chain, code }
          statements.push({ kind: STATEMENT_KIND.branch, text: condition ?? '', guards, branch })
          sources.push({ kind: STATEMENT_KIND.branch, text: condition ?? '', note, command, multiline: lineMultiline, guards, branch })
          body.push({ tex: `${inset}${tex}`, note, line })
        } catch (e) {
          return { signature, body, error: `Line ${line}: ${(e as Error).message}` }
        }
        open.push({ indent, id })
        continue
      }
      // Any other line ends the chain at its indentation: an `else` after it has no `if`.
      if (chains.at(-1)?.indent === indent) chains.pop()

      const ret = RETURN_LINE.exec(text)
      // `x = …`, or with display settings: `x:3 = …`, `theta:deg = …`.
      const assign = ASSIGNMENT_WITH_VALUE.exec(text)
      // `tuple(a, b) = …` unpacks a tuple (checked first: it also looks like an assignment).
      const unpack = UNPACK.exec(text)
      const unpackNames = unpack?.[1].split(',').map((n) => n.trim())
      const source = ret?.[1] ?? unpack?.[2] ?? assign?.[2]
      if (!source) {
        return { signature, body, error: `Line ${line}: inside a function, each line is "name = …", "tuple(a, b) = …", "return …", or an if / else with lines indented under it.` }
      }
      // Each unpacked name, with any settings (`tuple(r:3, th:deg) = …`).
      const unpackTargets = unpackNames?.map(parseTupleName)
      const badTarget = unpackTargets?.find((t) => 'error' in t)
      if (badTarget && 'error' in badTarget) return { signature, body, error: `Line ${line}: ${badTarget.error}` }
      const targets = unpackTargets as TupleName[] | undefined
      const literals = new Map<number, string>()
      for (const m of source.matchAll(NUMBER_LITERAL)) addLiteral(literals, m[0])
      try {
        // Constants resolve where the function is defined, so calls can see them.
        const expanded = this.expandConstants(source)
        if (expanded.error) throw new Error(expanded.error)
        const node = math.parse(preprocess(expanded.text, this.isVariable).text)
        const code = node.compile()
        if (unpackNames) {
          statements.push({ kind: STATEMENT_KIND.unpack, targets: targets!, code, guards })
          sources.push({ kind: STATEMENT_KIND.assign, text, note, command, multiline: lineMultiline, guards })
          const names = targets!.map((t) => symbolTex(t.name)).join(', ')
          body.push({ tex: `${inset}\\left(${names}\\right) = ${this.toTex(node, literals)}`, note, line })
        } else if (ret) {
          statements.push({ kind: STATEMENT_KIND.return, code, guards })
          sources.push({ kind: STATEMENT_KIND.return, text: source, note, command, multiline: lineMultiline, guards })
          body.push({ tex: `${inset}${signature} = ${this.toTex(node, literals)}`, note, line })
        } else {
          const declared = parseDeclaration(text)
          const unit = declared && !('error' in declared) && declared.unit !== PERCENT ? declared.unit : undefined
          const components = declared && !('error' in declared) ? declared.components : undefined
          statements.push({ kind: STATEMENT_KIND.assign, name: assign![1], code, unit, components, guards })
          // Keep the line as written, so a declared `x:3 =` applies when its working is shown.
          sources.push({ kind: STATEMENT_KIND.assign, text, note, command, multiline: lineMultiline, guards })
          body.push({ tex: `${inset}${symbolTex(assign![1])} = ${this.toTex(node, literals)}`, note, line })
        }
      } catch (e) {
        return { signature, body, error: `Line ${line}: ${(e as Error).message}` }
      }
    }
    // No `return`: like Python, the function gives no value. Called on a line of
    // its own, it just shows its working; used in a calculation, it's an error.
    const returns = statements.some((s) => s.kind === STATEMENT_KIND.return)

    const definedIn = this.vars
    const fn = (...args: unknown[]) => {
      if (args.length !== params.length) {
        throw new Error(`${name} takes ${params.length} argument${params.length === 1 ? '' : 's'}, `
          + `but was given ${args.length}.`)
      }
      const local = innerValues(definedIn)
      params.forEach((p, i) => local.set(p, castArgument(p, casts[i], args[i])))
      const run = new BranchRun()
      for (const s of statements) {
        if (!run.reaches(s)) continue
        if (s.kind === STATEMENT_KIND.branch) {
          const code = s.branch?.code
          if (run.open(s) && (!code || holds(code.evaluate(local), s.text))) run.take(s)
          continue
        }
        const v = s.code.evaluate(local)
        if (s.kind === STATEMENT_KIND.return) return returnUnit ? toDisplayUnit(v, returnUnit) : v
        if (s.kind === STATEMENT_KIND.unpack) {
          const values = isTuple(v) ? v.toArray() as unknown[] : null
          if (!values || values.length !== s.targets.length) {
            const names = s.targets.map((t) => t.name).join(', ')
            throw new Error(`In ${name}, tuple(${names}) = … needs a tuple of ${s.targets.length} values.`)
          }
          s.targets.forEach((t, i) => local.set(t.name, t.unit ? toDisplayUnit(values[i], t.unit) : values[i]))
          continue
        }
        const value = s.unit ? toDisplayUnit(v, s.unit) : v
        local.set(s.name, value)
        if (s.components) componentsOf(s.name, value).forEach((c) => local.set(c.name, c.value))
      }
      return undefined
    }
    this.userFunctions.set(fn, {
      params, casts, statements: sources, definedIn, multiline, returns, returnSf, returnNotation, returnVector, returnUnit,
    })
    this.store(name, { value: fn, sf: EXACT })
    return { signature, body: body.map((b) => ({ ...b, tex: nestBrackets(b.tex) })) }
  }

  /** Calls to multi-line functions in `node`, innermost first (arguments before the call). */
  private userCalls(node: MathNode): FunctionNode[] {
    const out: FunctionNode[] = []
    const visit = (n: MathNode) => {
      n.forEach((child) => visit(child))
      if (isFunctionNode(n)) {
        const f = this.scope.get(n.fn.name)
        if (typeof f === 'function' && this.userFunctions.has(f)) out.push(n)
      }
    }
    visit(node)
    return out
  }

  /**
   * Show what happens inside a call: replay the function's body through the
   * normal line evaluator, in a scope like the function's own, with each
   * parameter bound to its argument's value, sig figs and uncertainty. Each body
   * line then shows as `x = a + b = 2 + 3 = 5`. Returns the body's equations and
   * the pieces of the return expression, with its note and command.
   *
   * A body line's own command (`#sym`, `#val`, `#full`) decides how that step is
   * shown; otherwise the calling line's mode applies. `#hide` still runs the step
   * (later lines may need it) but leaves it out, unless it has an error.
   */
  /**
   * A line that's only a call to a function without `return`: show the working
   * inside it, with the call itself as the line (there's no value to show).
   */
  private showWorking(call: FunctionNode, ctx: ParsedLine): LineResult {
    const tex = this.toTex(call, ctx.literals)
    const warning = ctx.warnings.join(' ') || undefined
    try {
      // Run it, so mistakes (an argument that doesn't fit a cast, say) are reported.
      call.compile().evaluate(this.scope)
    } catch (e) {
      return { tex, warning, error: (e as Error).message }
    }
    const traced = ctx.mode === DISPLAY_MODE.val ? null : this.traceCall(call, ctx.literals, ctx.mode, ctx.explicit)
    return { tex, warning, trace: traced?.lines, info: ctx.info }
  }

  private traceCall(call: FunctionNode, literals: Map<number, string>, mode: DisplayMode, explicit: boolean) {
    const fn = this.scope.get(call.fn.name)
    const def = typeof fn === 'function' ? this.userFunctions.get(fn) : undefined
    if (!def || def.params.length !== call.args.length || this.traceDepth >= MAX_TRACE_DEPTH) return null

    // Arguments are worked out in the calling scope.
    let args: { value: unknown; sf: number; contributions: Contributions; shown?: string }[]
    try {
      args = call.args.map((a, i) => ({
        // A cast parameter shows its argument converted (0.100 nm → 1.00e-10 m).
        value: castArgument(def.params[i], def.casts[i], this.typedValue(a)),
        sf: this.sigFigsOf(a, literals, false),
        contributions: this.propagate(a),
        // f(pi) shows π inside the function's working, not 3.14159, and a variable
        // that stays symbolic (defined with #sym) stays symbolic as an argument.
        shown: isSymbolNode(unwrap(a))
          ? this.vars.get((unwrap(a) as SymbolNode).name)?.shown ?? this.constantForm(a, literals)
          : this.constantForm(a, literals),
      }))
    } catch {
      return null
    }

    // Parameters show as the argument they were given, in the caller's terms
    // (psi_200, 2r, 1.00 Å), not as the parameter's own name.
    const callerAliases = this.paramAliases
    // An argument that uses the enclosing call's parameters is put in terms of
    // what those were given, so nested calls chain.
    const aliases = new Map<string, MathNode>()
    call.args.forEach((a, i) => aliases.set(def.params[i], this.withAliases(unwrap(a))))

    // A vector passed in is shown inside the function as it is outside.
    const argStyles = call.args.map((a) => this.vectorStyleOf(a))
    // The body runs in a scope of its own, inside the one the function was defined in.
    const caller = this.vars
    this.enter(new Scope(def.definedIn))
    this.traceDepth++
    this.paramAliases = aliases
    try {
      def.params.forEach((p, i) => {
        this.store(p, {
          value: args[i].value, sf: args[i].sf, contributions: args[i].contributions, shown: args[i].shown,
          vector: isTuple(args[i].value) ? argStyles[i] : undefined,
        })
      })
      const lines: TraceLine[] = []
      const run = new BranchRun()
      for (const s of def.statements) {
        if (!run.reaches(s)) continue
        if (s.kind === STATEMENT_KIND.branch) {
          if (!run.open(s)) continue
          const code = s.branch?.code
          if (!code) {
            run.take(s)
            continue
          }
          // The comparison, with its values: v > 0 = 2.0 m/s > 0 = true.
          const shown = this.evaluateLine(s.text, mode, explicit)
          if (s.command !== LINE_COMMAND.hide || shown.error) lines.push({ tex: shown.tex, note: s.note })
          if (shown.error) break
          if (holds(code.evaluate(this.scope), s.text)) run.take(s)
          continue
        }
        const own = s.command && s.command !== LINE_COMMAND.hide ? s.command : undefined
        // The function's own #multiline (or the body line's) lays out its working too.
        const outerMultiline = this.multiline
        this.multiline = outerMultiline || def.multiline || !!s.multiline
        let r: LineResult
        try {
          r = this.evaluateLine(s.text, own ?? mode, explicit || !!own)
        } finally {
          this.multiline = outerMultiline
        }
        const hidden = s.command === LINE_COMMAND.hide && !r.error
        if (!hidden) lines.push(...(r.trace ?? []))
        if (s.kind === STATEMENT_KIND.return) {
          return { lines, ret: r.parts, retNote: s.note, retCommand: own, retSf: def.returnSf ?? r.sf }
        }
        if (!hidden) lines.push({ tex: r.tex, note: s.note })
        if (r.error) break
        // A parameter reassigned in the body is now its own value, not the argument.
        const assigned = LEADING_NAME.exec(s.text)?.[0]
        if (assigned) aliases.delete(assigned)
      }
      return { lines, ret: undefined, retNote: undefined, retCommand: undefined, retSf: undefined }
    } finally {
      this.paramAliases = callerAliases
      this.traceDepth--
      this.enter(caller)
    }
  }

  private isUserFunction(name: string): boolean {
    const f = this.scope.get(name)
    return typeof f === 'function' && this.userFunctions.has(f)
  }

  // -------------------------------------------------------------------------
  // solve(lhs = rhs, x [, guess])
  // -------------------------------------------------------------------------

  /**
   * `d = solve(v_f^2 = 2*a*d, d)`: rearrange the equation for the unknown and
   * evaluate the result like any formula, showing the equation, the rearranged
   * formula, the values substituted in, and the answer. Equations that can't be
   * rearranged are solved numerically from a starting guess, if one is given.
   */
  private evaluateSolve(
    line: string,
    call: RegExpExecArray,
    literals: Map<number, string>,
    mode: DisplayMode,
    explicit: boolean,
    declaredSf?: Precision,
    displayUnit?: string,
    notation?: Notation,
  ): LineResult {
    const fail = (error: string, tex = '') => ({ tex, error })
    const target = call[1]
    const open = call.index + call[0].length - 1
    const close = matchingParen(line, open)
    if (close < 0) return fail('solve( is missing its closing bracket.')
    const tail = line.slice(close + 1).trim()
    const conversion = CONVERSION_TAIL.exec(tail)?.[1]
    if (tail && !conversion) return fail('solve(…) has to be the whole right-hand side, optionally followed by "to unit".')

    const args = splitArgs(line.slice(open + 1, close))
    if (args.length < 2 || args.length > 3) return fail('Write solve(equation, unknown), or solve(equation, unknown, guess).')
    const [equation, x, guessText] = args
    if (!IS_NAME.test(x)) return fail(`The second part of solve is the unknown to solve for, like d (got "${x}").`)
    const sides = splitEquation(equation)
    if (!sides) return fail('The first part of solve is an equation with one =, like v^2 = 2*a*d.')

    let lhs: MathNode
    let rhs: MathNode
    let guess: unknown
    try {
      lhs = math.parse(preprocess(sides[0], this.isVariable).text)
      rhs = math.parse(preprocess(sides[1], this.isVariable).text)
      if (guessText) guess = math.parse(preprocess(guessText, this.isVariable).text).compile().evaluate(this.scope)
    } catch (e) {
      return fail((e as Error).message)
    }

    const equationTex = `${this.toTex(lhs, literals)} = ${this.toTex(rhs, literals)}`
    const prelude: TraceLine[] = [{ tex: equationTex, note: `solving for ${x}` }]
    const occurrences = countOccurrences(lhs, x) + countOccurrences(rhs, x)
    if (!occurrences) return fail(`${x} doesn't appear in the equation.`, equationTex)

    // Rearrange: isolate x if it appears once, else try linear / quadratic.
    const solver = new Solver(math)
    let candidates: MathNode[] | null = null
    let quadratic = false
    if (occurrences === 1) {
      candidates = contains(lhs, x) ? solver.isolate(lhs, rhs, x) : solver.isolate(rhs, lhs, x)
    }
    if (!candidates) {
      const f = new math.OperatorNode(OP_SYMBOL.subtract, OP.subtract, [lhs, new math.ParenthesisNode(rhs)])
      const poly = solver.polynomial(f, x)
      if (poly) {
        candidates = poly.solutions
        quadratic = poly.kind === POLYNOMIAL_KIND.quadratic
      }
    }

    /** The solution, converted with `to unit` if one was given. */
    const convert = (expr: MathNode, value: unknown): MathNode => {
      let shown = expr
      if (conversion) {
        const unitNode = (math.parse(preprocess(`1 to ${conversion}`, () => false).text) as math.OperatorNode).args[1]
        // Angles from asin/acos/atan come out as plain numbers in radians.
        const targetUnit = unitNode.compile().evaluate({})
        if (typeof value === 'number' && math.isUnit(targetUnit) && (targetUnit as Unit).equalBase(math.unit(UNIT.radian))) {
          shown = new math.OperatorNode(OP_SYMBOL.multiply, OP.multiply, [
            new math.ParenthesisNode(shown),
            new math.FunctionNode(new math.SymbolNode(FN.unit), [new math.ConstantNode(UNIT.radian)]),
          ])
        }
        shown = new math.OperatorNode(OP_SYMBOL.to, OP.to, [shown, unitNode])
      }
      return shown
    }
    const finish = (expr: MathNode, value: unknown, info?: string) => {
      const shown = convert(expr, value)
      const node = target ? new math.AssignmentNode(new math.SymbolNode(target), shown) : shown
      return this.evaluateParsed(node, {
        percent: false, literals, warnings: [], mode, explicit,
        lhs: target ? undefined : symbolTex(x), prelude, info, declaredSf, displayUnit, notation,
      })
    }

    if (!candidates) {
      if (guess === undefined) {
        return fail(`Can't rearrange this for ${x}. Give a starting guess to solve it numerically: `
          + `solve(…, ${x}, guess).`, equationTex)
      }
      return this.solveNumerically(lhs, rhs, x, guess, literals, equationTex, finish)
    }

    // Work out each solution, keep the real ones, and choose one.
    const real: { node: MathNode; value: unknown }[] = []
    for (const node of candidates) {
      try {
        const value = node.compile().evaluate(this.scope)
        if (isRealValue(value) && !real.some((r) => sameValue(r.value, value))) real.push({ node, value })
      } catch {
        /* this branch doesn't apply (e.g. asin of a value above 1) */
      }
    }
    if (!real.length) return fail(`This equation has no real solution for ${x}.`, equationTex)
    let chosen = real[0]
    if (guess !== undefined) {
      // The solution nearest the guess.
      const g = magnitudeOf(guess)
      chosen = real.reduce((best, r) =>
        Math.abs(magnitudeOf(r.value) - g) < Math.abs(magnitudeOf(best.value) - g) ? r : best)
    } else if (quadratic) {
      // Prefer the positive root when there's exactly one.
      const positive = real.filter((r) => magnitudeOf(r.value) > 0)
      if (positive.length === 1) chosen = positive[0]
    }
    const others = real.filter((r) => r !== chosen)
    const sf = this.sigFigsOf(chosen.node, literals, false)
    const otherTex = (o: { node: MathNode; value: unknown }) => {
      const v = conversion ? convert(o.node, o.value).compile().evaluate(this.scope) : normalise(o.value, false)
      return `$${symbolTex(x)} = ${this.valueTex(v, sf)}$`
    }
    const info = others.length
      ? `Also a solution: ${others.map(otherTex).join(', ')}`
        + (guess === undefined ? `. Give a guess to choose it: solve(…, ${x}, guess).` : '.')
      : undefined
    return finish(chosen.node, chosen.value, info)
  }

  /**
   * Solve lhs = rhs numerically from a guess (secant method on SI magnitudes).
   * The answer's uncertainty comes from implicit differentiation: for each
   * uncertainty source, δx = −δF / (∂F/∂x), where F = lhs − rhs.
   */
  private solveNumerically(
    lhs: MathNode,
    rhs: MathNode,
    x: string,
    guess: unknown,
    literals: Map<number, string>,
    equationTex: string,
    finish: (expr: MathNode, value: unknown) => LineResult,
  ): LineResult {
    const F = new math.OperatorNode(OP_SYMBOL.subtract, OP.subtract, [lhs, new math.ParenthesisNode(rhs)])
    const code = F.compile()
    const residual = (s: number) => {
      const scope = innerValues(this.vars)
      scope.set(x, withMagnitude(guess, s))
      return magnitudeOf(code.evaluate(scope))
    }

    let s0 = magnitudeOf(guess)
    let s1 = s0 === 0 ? SOLVER.secondPointFromZero : s0 * SOLVER.secondPoint
    let found = false
    try {
      let f0 = residual(s0)
      let f1 = residual(s1)
      for (let i = 0; i < SOLVER.maxIterations && Number.isFinite(f1); i++) {
        if (f1 === 0) {
          found = true
          break
        }
        if (f1 === f0) break
        const s2 = s1 - (f1 * (s1 - s0)) / (f1 - f0)
        s0 = s1
        f0 = f1
        s1 = s2
        f1 = residual(s1)
        if (Math.abs(s1 - s0) <= SOLVER.tolerance * Math.max(1, Math.abs(s1))) {
          found = Number.isFinite(f1)
          break
        }
      }
    } catch (e) {
      return { tex: equationTex, error: (e as Error).message }
    }
    if (!found || !Number.isFinite(s1)) {
      return { tex: equationTex, error: `Couldn't find a solution for ${x} near that guess; try a different one.` }
    }
    const value = withMagnitude(guess, s1)

    // Uncertainty and sig figs, with x held at the solution.
    // (In a scope of its own, so x isn't left set in the sheet.)
    const caller = this.vars
    this.enter(new Scope(caller))
    let contributions: Contributions = new Map()
    let sf: number
    try {
      this.store(x, { value, sf: EXACT })
      const h = Math.abs(s1) * SOLVER.slopeStep || SOLVER.slopeStepAtZero
      const slope = (residual(s1 + h) - residual(s1 - h)) / (2 * h)
      if (slope !== 0 && Number.isFinite(slope)) {
        for (const [source, c] of this.propagate(F)) {
          contributions.set(source, withMagnitude(value, -magnitudeOf(c) / slope))
        }
      }
      sf = this.sigFigsOf(F, literals, false)
    } finally {
      this.enter(caller)
    }

    // Hold the answer in a hidden variable, shown as x itself.
    const hidden = solvedName(x)
    this.store(hidden, { value, sf, contributions })
    return finish(new math.SymbolNode(hidden), value)
  }

  // -------------------------------------------------------------------------
  // Evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate one line. `explicit` says the mode was asked for with a command
   * (on the line or its block), so it isn't overridden by a called function's
   * return-line command. `notation`: `#sci` or `#dec` on the line, or on a
   * block around it.
   */
  evaluate(input: string, mode: DisplayMode = DISPLAY_MODE.full, explicit = false, multiline = false, notation: LineNotation = {}): CalcResult {
    this.multiline = multiline
    this.lineNotation = notation
    try {
      const { tex, error, warning, info, trace, returnNote, plot, defines } = this.evaluateLine(input, mode, explicit)
      // Messages name a namespace's members as typed, a.x_1 (not a__x_1).
      const readable = (s: string | undefined) => (s === undefined ? s : readableSpecies(s.includes(JOIN) ? fitHint(readableMembers(s)) : s))
      // Brackets by nesting, ( ) inside [ ] inside { }, once each equation is finished.
      return {
        tex: nestBrackets(tex), error: readable(error), warning: readable(warning), info: readable(info), returnNote, plot, defines,
        trace: trace?.length ? trace.map((t) => ({ ...t, tex: nestBrackets(t.tex) })) : undefined,
      }
    } catch (e) {
      // Anything a line's own handling didn't catch stays that line's error, not the whole sheet's.
      return { tex: '', error: readableSpecies(readableMembers(unexpectedError(e))) }
    } finally {
      this.multiline = false
      this.lineNotation = {}
    }
  }

  /** `#multiline` on the line being evaluated: each `=` (and in a call's working too) on its own row. */
  private multiline = false

  /** `#sci` / `#dec` on the line being evaluated, or on a block around it. */
  private lineNotation: LineNotation = {}

  /** The left-hand side to show instead of the assigned name (set while unpacking). */
  private lhsOverride: string | undefined
  /** While unpacking: which names declare their sig figs (`tuple(a, b:2) = …`). */
  private unpackDeclaredSf: boolean[] | undefined
  private nextUnpack = 0

  /**
   * `tuple(a, b, c) = expr`: work out the tuple on the right (shown as
   * (a, b, c) = …), then store each of its values as a variable of its own.
   */
  private evaluateUnpack(namesText: string, rhs: string, mode: DisplayMode, explicit: boolean): LineResult {
    const entries = namesText.split(',').map((n) => n.trim())
    const parsed = entries.map(parseTupleName)
    const lhs = `\\left(${entries.map((n, i) => {
      const p = parsed[i]
      return 'error' in p ? n : symbolTex(p.name)
    }).join(', ')}\\right)`
    const bad = parsed.find((p) => 'error' in p)
    if (bad && 'error' in bad) return { tex: lhs, error: bad.error }
    const targets = parsed as TupleName[]
    const names = targets.map((t) => t.name)
    const twice = names.find((n, i) => names.indexOf(n) !== i)
    if (twice) return { tex: lhs, error: `${twice} is listed twice.` }

    const hidden = unpackedName(this.nextUnpack++)
    this.lhsOverride = lhs
    this.unpackDeclaredSf = targets.map((t) => t.sf !== undefined)
    let result: LineResult
    try {
      result = this.evaluateLine(`${hidden} = ${rhs}`, mode, explicit)
    } finally {
      this.lhsOverride = undefined
      this.unpackDeclaredSf = undefined
    }
    const value = this.scope.get(hidden)
    const sf = this.vars.get(hidden)?.sf ?? EXACT
    this.forget(hidden)
    if (result.error) return result
    if (!isTuple(value)) {
      return { ...result, error: `The right-hand side isn't a tuple, so it can't be unpacked into ${names.join(', ')}.` }
    }
    const values = value.toArray() as unknown[]
    if (values.length !== names.length) {
      return {
        ...result,
        error: `The tuple has ${values.length} value${values.length === 1 ? '' : 's'}, but ${names.length} names are given.`,
      }
    }
    // Each name's own settings: `tuple(r:3, theta:deg) = …`.
    let converted: unknown[]
    try {
      converted = values.map((v, i) => (targets[i].unit ? toDisplayUnit(v, targets[i].unit!) : v))
    } catch (e) {
      return { ...result, error: (e as Error).message }
    }
    const shown = targets.map((t) => (t.sf === undefined
      ? { sf, forced: false, notation: t.notation }
      : { sf: t.sf === EXACT_SETTING ? EXACT : t.sf, forced: true, notation: t.notation }))
    targets.forEach(({ name }, i) => this.store(name, {
      value: converted[i], sf: shown[i].sf, declared: shown[i].forced, notation: shown[i].notation,
    }))
    // With settings on the names, the result shows each value that way.
    if (!targets.some((t) => t.sf !== undefined || t.unit || t.notation) || !result.parts) return result
    const parts = { ...result.parts, result: this.valuesTex(converted, shown), approx: false }
    return { ...result, parts, tex: layoutEquation(mode, parts, this.multiline) }
  }

  /**
   * `table(t, x, v = x / t)`: series side by side, one row per number (row 1 is
   * t_1, x_1, v_1). A name is a series' values; `name = expression` is worked
   * out row by row from the series it uses, and makes a series of its own (v_1,
   * v_2, …, so v_avg works afterwards); an expression without a name is just
   * shown. A long table shows its first and last rows.
   */
  private evaluateTable(argsText: string): LineResult {
    // The settings come after a semicolon (see tableSettings.ts).
    const parts = splitCallArgs(argsText)
    const { settings, error: settingsError } = parseTableSettings(parts.settings)
    if (settingsError) return { tex: '', error: settingsError }
    const args = splitArgs(parts.columns).map((a) => a.trim()).filter(Boolean)
    if (!args.length) {
      return { tex: '', error: 'Name the series to show, table(t, x), and any columns worked out from them: table(t, x, v = x / t).' }
    }
    const made = this.seriesColumns(args, 'show it in a table')
    if ('error' in made) return { tex: '', error: made.error }
    const { columns, errors, hidden } = made

    // Every row that any column has, in order (within the settings' rows); a long
    // table shows its first and last rows, unless the settings ask for all of them.
    const all = [...new Set(columns.flatMap((c) => [...c.rows.keys()]))].sort((a, b) => a - b)
      .filter((n) => (settings.from === undefined || n >= settings.from) && (settings.to === undefined || n <= settings.to))
    const shortened = !settings.allRows && all.length > TABLE_ROWS.max
    const shown = shortened ? [...all.slice(0, TABLE_ROWS.first), ...all.slice(-TABLE_ROWS.last)] : all

    // Each cell, with the column's unit taken out to its header when every value shares it.
    const body = columns.map((c) => {
      const cells = shown.map((n) => (c.rows.has(n) ? this.cellParts(c.rows.get(n)!) : undefined))
      const units = new Set(cells.filter((p) => p).map((p) => p!.unit))
      const shared = units.size === 1 ? [...units][0] : undefined
      return {
        header: shared ? `${c.header}\\,\\left[${unitTex(shared)}\\right]` : c.header,
        cells: cells.map((p) => (!p ? '\\text{—}' : shared || !p.unit ? p.num : attachUnit(p.num, unitTex(p.unit)))),
      }
    })
    for (const name of hidden) this.forget(name)

    // The n column (unless it's turned off), then the columns.
    const cellsOf = (n: number, r: number) => [...(settings.numbers ? [String(n)] : []), ...body.map((c) => c.cells[r])]
    const header = [...(settings.numbers ? ['n'] : []), ...body.map((c) => c.header)].join(' & ')
    // A line after each row in a grid; otherwise just after the header (none for lines none).
    const rowEnd = settings.lines === 'grid' ? ' \\\\ \\hline ' : ' \\\\ '
    const rowsTex = shown.map((n, r) => {
      const row = cellsOf(n, r).join(' & ')
      // The gap in a shortened table, before its last rows.
      return shortened && r === TABLE_ROWS.first ? `\\vdots${rowEnd}${row}` : row
    })
    const count = columns.length + (settings.numbers ? 1 : 0)
    const columnSpec = settings.lines === 'grid'
      ? `|${'r|'.repeat(count)}`
      : settings.lines === 'none' || !settings.numbers ? 'r'.repeat(count) : `r|${'r'.repeat(count - 1)}`
    const top = settings.lines === 'grid' ? '\\hline ' : ''
    const afterHeader = settings.lines === 'none' ? ' \\\\ ' : ' \\\\ \\hline '
    const end = settings.lines === 'grid' ? ' \\\\ \\hline' : ''
    const tex = `\\begin{array}{${columnSpec}} ${top}${header}${afterHeader}${rowsTex.join(rowEnd)}${end} \\end{array}`
    const range = settings.from !== undefined || settings.to !== undefined
    return {
      tex,
      error: errors.length ? `${errors[0]}${errors.length > 1 ? ` (and ${errors.length - 1} more row${errors.length > 2 ? 's' : ''})` : ''}` : undefined,
      info: shortened
        ? `${all.length} rows${range ? ' in range' : ''}: the first ${TABLE_ROWS.first} and the last ${TABLE_ROWS.last} are shown (the ⚙ button can show them all).`
        : !all.length && range ? 'No rows in this range.' : undefined,
    }
  }

  /**
   * `plot(t, x, y)`: series plotted against the first one, a point per row
   * (columns as in table(), so `plot(t, v = x / t)` works too). Values are
   * converted to one unit per axis; uncertainties become error bars. With `fit
   * linear` in the settings, each series gets a best-fit line, and its slope
   * and intercept (with their uncertainties) become variables: x_slope,
   * x_intercept. The line's text is the fits' equations.
   */
  private evaluatePlot(argsText: string, plotName?: string): LineResult {
    if (plotName && RESERVED_NAMESPACES.has(plotName)) return { tex: '', error: `${plotName} is a reserved word: choose another name for the plot.` }
    // A plot named again forgets what it held (p.slope from a fit since taken off).
    if (plotName) {
      this.views.clear(plotName)
      // (Deleting while going through a Map is safe.)
      const prefix = memberName(plotName, '')
      for (const old of this.scope.keys()) if (old.startsWith(prefix)) this.forget(old)
    }
    const parts = splitCallArgs(argsText)
    const { settings, error: settingsError } = parsePlotSettings(parts.settings)
    if (settingsError) return { tex: '', error: settingsError }
    const args = splitArgs(parts.columns).map((a) => a.trim()).filter(Boolean)
    if (args.length < 2) return { tex: '', error: 'Give the x series, then what to plot against it: plot(t, x), or plot(t, x, y).' }
    const made = this.seriesColumns(args, 'plot it')
    if ('error' in made) return { tex: '', error: made.error }
    const { columns, errors, hidden } = made
    const [xColumn, ...yColumns] = columns
    const inRange = (n: number) => (settings.from === undefined || n >= settings.from) && (settings.to === undefined || n <= settings.to)
    const onAxis = (v: number, a: { from?: number; to?: number }) => (a.from === undefined || v >= a.from) && (a.to === undefined || v <= a.to)

    // Each axis's unit (its first value's), and every value (and uncertainty) as a number in it.
    const unitOf = (c: SeriesColumn) => this.split(this.scope.get([...c.rows.values()][0]), EXACT)?.unit
    // Each unit's size in SI, worked out once: a value in it is then its SI value
    // over that, rather than a mathjs conversion for each of thousands of points.
    // (A unit with an offset, like degC, is converted by mathjs.)
    const scales = new Map<string, { one: Unit; scale?: number }>()
    const scaleOf = (unit: string) => {
      let s = scales.get(unit)
      if (!s) {
        const one = math.unit(1, unit)
        scales.set(unit, s = { one, scale: one.units.some((p) => p.unit.offset) ? undefined : (one.value as number) })
      }
      return s
    }
    const numbers = (name: string, unit: string | undefined): { v: number; d?: number } => {
      const value = this.scope.get(name)
      const contributions = this.vars.get(name)?.contributions
      let sumSq = 0
      if (contributions) for (const c of contributions.values()) sumSq += magnitudeOf(c) ** 2
      if (!math.isUnit(value)) {
        if (unit) throw new Error('no unit') // (caught: the series don't share a unit)
        return { v: Number(value), d: Math.sqrt(sumSq) || undefined }
      }
      const u = value as Unit
      const s = scaleOf(unit ?? '')
      if (!u.equalBase(s.one)) throw new Error('units differ') // (caught: the series don't share a unit)
      if (s.scale === undefined) return { v: u.toNumber(unit ?? ''), d: Math.sqrt(sumSq) / ((s.one.value as number) || 1) || undefined }
      return { v: (u.value as number) / s.scale, d: Math.sqrt(sumSq) / s.scale || undefined }
    }
    const xUnit = unitOf(xColumn)
    const yUnit = unitOf(yColumns[0])
    const series: PlotSeries[] = []
    try {
      for (const c of yColumns) {
        const points: PlotPoint[] = []
        for (const [n, yName] of c.rows) {
          const xName = xColumn.rows.get(n)
          if (!xName || !inRange(n)) continue
          const x = numbers(xName, xUnit)
          const y = numbers(yName, yUnit)
          // An axis's range is what's on the plot: a point outside it isn't drawn,
          // fitted, or kept in a named plot's series.
          if (!onAxis(x.v, settings.x) || !onAxis(y.v, settings.y)) continue
          points.push({ n, x: x.v, y: y.v, dx: x.d, dy: y.d })
        }
        series.push({ name: c.name, expr: c.expr, points })
      }
    } catch {
      for (const name of hidden) this.forget(name)
      return { tex: '', error: 'The series plotted against x have different units, so they can\'t share the y axis: plot them separately.' }
    }
    for (const name of hidden) this.forget(name)

    // A named plot holds the series it plots, p.t and p.x: the rows it draws, numbered from 1.
    const defines: Definition[] = []
    if (plotName) {
      const drawn = [...new Set(series.flatMap((s) => s.points.map((p) => p.n)))].sort((a, b) => a - b)
      const named = columns.filter((c) => c.name)
      const shorts = named.map((c) => parseMemberName(c.name!)?.member ?? c.name!)
      named.forEach((c, i) => {
        // Two with the same name (run1.x, run2.x) keep their namespaces apart: p.run1_x, p.run2_x.
        const clash = shorts.filter((s) => s === shorts[i]).length > 1
        const base = memberName(plotName, clash ? c.name!.replace(JOIN, SUBSCRIPT) : shorts[i])
        // A lookup into the variables drawn, not a copy (see Views).
        const picked = drawn.map((n) => c.rows.get(n))
        this.views.set(base, picked)
        defines.push(...seriesDefinitions(base, picked.length))
      })
    }

    // Best-fit lines, and their slopes and intercepts as variables.
    const fits: string[] = []
    if (settings.fit === 'linear') {
      for (const [i, s] of series.entries()) {
        const fit = linearFit(s.points)
        if (!fit) {
          errors.push(`A line needs two or more points with different x values${s.name ? ` (${s.name})` : ''}.`)
          continue
        }
        s.fit = fit
        // Where the fit's numbers go: p.slope for a named plot (p.x_slope when it
        // has several series); x_slope for an unnamed plot's named series.
        const own = parseMemberName(s.name ?? '')?.member ?? s.name ?? `y${i + 1}`
        const target = (suffix: string) => (plotName
          ? memberName(plotName, series.length === 1 ? suffix : `${own}${SUBSCRIPT}${suffix}`)
          : s.name ? `${s.name}${SUBSCRIPT}${suffix}` : undefined)
        fits.push(this.fitTex(s, fit, xColumn.name, xUnit, yUnit, target))
        for (const [suffix, v] of [[FIT.r2, fit.r2], [FIT.chi2, fit.chi2]] as const) {
          const to = plotName && v !== undefined ? target(suffix) : undefined
          if (to) this.store(to, { value: v, sf: EXACT })
        }
        if (plotName) {
          for (const suffix of [FIT.slope, FIT.intercept, FIT.r2, ...(fit.chi2 !== undefined ? [FIT.chi2] : [])]) defines.push({ name: target(suffix)! })
        }
      }
    }

    const points = series.reduce((sum, s) => sum + s.points.length, 0)
    const plot: PlotData = {
      x: { name: xColumn.name, expr: xColumn.expr, unit: xUnit },
      // One series names the y axis; several share it, named in the legend.
      y: series.length === 1 ? { name: series[0].name, expr: series[0].expr, unit: yUnit } : { unit: yUnit },
      series,
      settings,
    }
    return {
      // (A weighted fit is two rows already, so it's gathered even on its own.)
      tex: fits.length > 1 || fits[0]?.includes('\\\\') ? `\\begin{gathered}${fits.join(' \\\\ ')}\\end{gathered}` : fits[0] ?? '',
      plot,
      error: errors.length ? `${errors[0]}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ''}` : undefined,
      info: points ? undefined : 'Nothing to plot: no row has both an x and a y value.',
      defines: defines.length ? defines : undefined,
    }
  }

  /**
   * A series' best-fit line as an equation, y = (a ± δa) x + (b ± δb), R² = …;
   * and its slope and intercept as variables, with their uncertainties, for
   * later lines to use, named by `target` (p.slope, or y_slope; none if undefined).
   */
  private fitTex(
    s: PlotSeries, fit: LinearFit, xName: string | undefined, xUnit: string | undefined, yUnit: string | undefined,
    target: (suffix: string) => string | undefined,
  ): string {
    // The slope's unit is simplified (m/s, not m/s… as a ratio); the intercept stays in y's unit.
    const slopeQuantity = (v: number, unit: string | undefined) => (unit ? normalise(math.unit(v, unit), false) : v)
    const interceptQuantity = (v: number) => {
      if (!yUnit) return v
      const u = math.unit(v, yUnit)
      u.fixPrefix = true
      return u
    }
    const slopeUnit = yUnit && xUnit ? `(${yUnit}) / (${xUnit})` : yUnit ?? (xUnit ? `(${xUnit})^-1` : undefined)
    const parts = [
      { value: slopeQuantity(fit.slope, slopeUnit), unc: slopeQuantity(fit.slopeUnc, slopeUnit), suffix: FIT.slope },
      { value: interceptQuantity(fit.intercept), unc: interceptQuantity(fit.interceptUnc), suffix: FIT.intercept },
    ].map((p) => {
      const sf = this.uncertainParts(p.value, p.unc)?.sf ?? EXACT
      // Each is a measured result: its uncertainty is a source of its own.
      const to = target(p.suffix)
      if (to) this.store(to, { value: p.value, sf, contributions: new Map([[this.nextSource++, p.unc]]) })
      return this.valueTex(p.value, sf, fit.slopeUnc || fit.interceptUnc ? p.unc : undefined)
    })
    const y = s.name ? symbolTex(s.name) : 'y'
    const x = xName ? symbolTex(xName) : 'x'
    // The slope in brackets with its unit, so the unit doesn't run into x: [(0.50 ± 0.01) m/s] t.
    const line = `${y} = \\left(${parts[0]}\\right) ${x} + ${parts[1]}`
    const r2 = `R^{2} = ${fit.r2.toFixed(4)}`
    if (!fit.weighted) return `${line},\\quad ${r2}`
    // A weighted fit says so, with its reduced χ² (how well the line matches the
    // error bars), on a line of its own under the equation so it isn't too wide.
    const chi2 = fit.chi2 !== undefined ? `,\\quad \\chi^{2}_{\\nu} = ${Number(fit.chi2.toPrecision(2))}` : ''
    return `${line} \\\\ ${r2}${chi2}\\quad \\text{(weighted by }\\delta ${symbolTex(s.name ?? 'y')}\\text{)}`
  }

  /**
   * The columns of a table or plot, from its arguments: a series by name, or a
   * column worked out row by row (`v = x / t` makes the series v; `x / t` is
   * held in hidden variables, listed in `hidden` to forget when done). Rows
   * that can't be worked out are listed in `errors`; `purpose` finishes the
   * message for a name that isn't a series ("show it in a table").
   */
  /**
   * `a = select(t, x; t from 0.2 to 0.8)`: the rows of series where every
   * condition holds, as new series under the name a: a.t, a.x, numbered from 1
   * (a.x_1 is the first row that matched). Each value keeps its sig figs and
   * uncertainty (the same source, so a slice and its data stay correlated).
   *
   * Conditions, after the semicolon, all of which must hold:
   *   rows 5-20                 by row number
   *   t from 0.2 to 0.8         a series' values in a range (either end can be left off);
   *                             a bare number is in the series' unit, or give one: 200 ms
   */
  private evaluateSelect(name: string, argsText: string): LineResult {
    if (RESERVED_NAMESPACES.has(name)) return { tex: '', error: `${name} is a reserved word: choose another name for the selection.` }
    const parts = splitCallArgs(argsText)
    const args = splitArgs(parts.columns).map((a) => a.trim()).filter(Boolean)
    if (!args.length) return { tex: '', error: 'Give the series to select from: a = select(t, x; t from 0.2 to 0.8).' }
    const notSeries = args.find((a) => !IS_NAME.test(a))
    if (notSeries) return { tex: '', error: `${notSeries} isn't a series name: select takes series, like select(t, x; …).` }
    const columns = args.map((arg) => ({ arg, rows: this.seriesRows(arg) }))
    const missing = columns.find((c) => !c.rows.size)
    if (missing) return { tex: '', error: `${missing.arg} isn't a series: define ${missing.arg}_1, ${missing.arg}_2, … (or import them) to select from it.` }

    // The conditions.
    const tests: ((n: number) => boolean)[] = []
    const shown: string[] = []
    for (const part of settingParts(parts.settings)) {
      const rows = parseRowRange(part)
      if (rows) {
        const { from, to } = rows
        tests.push((n) => (from === undefined || n >= from) && (to === undefined || n <= to))
        shown.push(`\\text{${SETTING.rows} } ${from ?? 1}\\text{–}${to ?? '\\text{end}'}`)
        continue
      }
      const range = SELECT_RANGE.exec(part)
      if (!range || (!range[2] && !range[3])) {
        return { tex: '', error: `"${readableMembers(part)}" isn't a condition: use t from 0.2 to 0.8 (either end can be left off), or rows 5-20.` }
      }
      // A name is one of the series selected first (t for run1.t), then any series.
      const chosen = columns.find((c) => (parseMemberName(c.arg)?.member ?? c.arg) === range[1])
      const series = chosen?.rows ?? this.seriesRows(range[1])
      if (!series.size) return { tex: '', error: `${range[1]} isn't a series, so it can't choose rows.` }
      const unit = this.split(this.scope.get([...series.values()][0]), EXACT)?.unit
      const bound = (text: string | undefined) => {
        if (text === undefined) return undefined
        let q = math.evaluate(preprocess(text, this.isVariable).text, this.scope) as unknown
        if (typeof q === 'number' && unit) q = math.unit(q, unit)
        const fits = unit ? math.isUnit(q) && (q as Unit).equalBase(math.unit(unit)) : typeof q === 'number'
        if (!fits) throw new Error(`${text} isn't in units of ${range[1]}${unit ? ` (${unit})` : ' (it has none)'}.`)
        return q
      }
      let lo: unknown
      let hi: unknown
      try {
        lo = bound(range[2])
        hi = bound(range[3])
      } catch (e) {
        return { tex: '', error: readableUnitError((e as Error).message) }
      }
      // Compared as plain numbers, in SI (a Unit's value is held in SI), not through
      // mathjs, which is slow over thousands of rows. (Units were checked above.)
      const si = (q: unknown) => (math.isUnit(q) ? ((q as Unit).value as number) : typeof q === 'number' ? q : NaN)
      const low = lo === undefined ? -Infinity : si(lo)
      const high = hi === undefined ? Infinity : si(hi)
      tests.push((n) => {
        const member = series.get(n)
        if (!member) return false
        const v = si(this.scope.get(member))
        return v >= low && v <= high
      })
      const ends = [lo !== undefined ? `${this.valueTex(lo)} \\le ` : '', symbolTex(chosen?.arg ?? range[1]), hi !== undefined ? ` \\le ${this.valueTex(hi)}` : '']
      shown.push(ends.join(''))
    }

    // The rows every series has, and every condition keeps.
    const all = [...columns[0].rows.keys()].filter((n) => columns.every((c) => c.rows.has(n))).sort((a, b) => a - b)
    const kept = all.filter((n) => tests.every((t) => t(n)))

    // Each series is a lookup into the variables it picks (see Views); a selection
    // of the same name before is replaced (a sheet can redo one).
    this.views.clear(name)
    const names: string[] = []
    for (const c of columns) {
      const short = parseMemberName(c.arg)?.member ?? c.arg
      const base = memberName(name, short)
      names.push(base)
      this.views.set(base, kept.map((n) => c.rows.get(n)!))
    }

    const conditions = shown.length ? `\\quad \\left(${shown.join(',\\ ')}\\right)` : ''
    return {
      tex: `${names.map(symbolTex).join(',\\ ')}${conditions}:\\ ${kept.length} \\text{ of } ${all.length} \\text{ rows}`,
      info: kept.length ? undefined : 'No rows match, so the selection is empty.',
      defines: names.flatMap((base) => seriesDefinitions(base, kept.length)),
    }
  }

  private seriesColumns(args: string[], purpose: string):
    { columns: SeriesColumn[]; errors: string[]; hidden: string[] } | { error: string } {
    const columns: SeriesColumn[] = []
    const errors: string[] = []
    const hidden: string[] = []
    for (const [i, arg] of args.entries()) {
      // A series, by name.
      if (IS_NAME.test(arg)) {
        const rows = this.seriesRows(arg)
        if (!rows.size) return { error: `${arg} isn't a series: define ${arg}_1, ${arg}_2, … (or import them) to ${purpose}.` }
        columns.push({ name: arg, header: symbolTex(arg), rows })
        continue
      }
      // A column worked out row by row: `v = x / t`, or just `x / t`.
      const named = TABLE_COLUMN.exec(arg)
      const name = named?.[1]
      const expr = named ? named[2] : arg
      // The series it uses, and the rows where all of them have a value.
      const used = new Map<string, Map<number, string>>()
      for (const m of expr.matchAll(NAME_IN_LINE)) {
        const id = m[1]
        if (used.has(id) || (this.scope.has(id) && !this.vars.get(id)?.agg)) continue
        const rows = this.seriesRows(id)
        if (rows.size) used.set(id, rows)
      }
      if (!used.size) return { error: `${expr} doesn't use any series, so it would be the same in every row.` }
      const numbers = [...[...used.values()][0].keys()].filter((n) => [...used.values()].every((rows) => rows.has(n)))
      const rows = new Map<number, string>()
      for (const n of numbers) {
        const target = name ? seriesMemberName(name, n) : unpackedColumnName(i, n)
        const result = this.evaluateLine(`${target} = ${withRowValues(expr, used, n)}`, DISPLAY_MODE.val, false)
        if (result.error) {
          errors.push(`Row ${n}: ${result.error}`)
          continue
        }
        rows.set(n, target)
        if (!name) hidden.push(target)
      }
      columns.push({ name, expr: name ? undefined : expr, header: name ? symbolTex(name) : this.expressionTex(expr), rows })
    }
    return { columns, errors, hidden }
  }

  /** A series' values by number: t_1, t_2, … (or t1, t2, …) as 1 → "t_1", 2 → "t_2", …. */
  private seriesRows(base: string): Map<number, string> {
    const number = new RegExp(`^${escapeRegExp(base)}_?(\\d+)$`)
    return new Map(this.seriesMembers(base).map((m) => [Number(number.exec(m)![1]), m]))
  }

  /** A table cell: a variable's value as a number (± its uncertainty), and its unit, in its own notation. */
  private cellParts(name: string): { num: string; unit?: string } {
    const value = this.scope.get(name)
    const sf = this.vars.get(name)?.sf ?? EXACT
    const unc = this.total(this.vars.get(name)?.contributions, value)
    return this.inNotation(this.vars.get(name)?.notation, () => {
      const u = unc !== undefined ? this.uncertainParts(value, unc, this.vars.get(name)?.uncSf) : null
      if (u) {
        const core = `${numberTex(u.num)} \\pm ${numberTex(u.unc)}`
        return { num: u.exp !== undefined ? `\\left(${core}\\right) \\times 10^{${u.exp}}` : core, unit: u.unit }
      }
      const p = this.split(value, sf, this.vars.get(name)?.declared === true)
      return p ? { num: numberTex(p.num), unit: p.unit } : { num: this.valueTex(value, sf) }
    })
  }

  /** An expression as typed, as TeX (an unnamed table column's header). */
  private expressionTex(expr: string): string {
    const literals = new Map<number, string>()
    for (const m of expr.matchAll(NUMBER_LITERAL)) addLiteral(literals, m[0])
    try {
      return this.toTex(math.parse(preprocess(expr, this.isVariable).text), literals)
    } catch {
      return `\\text{${expr}}`
    }
  }

  /** Remove a variable, and everything kept about it. */
  private forget(name: string): void {
    this.vars.delete(name)
  }

  private evaluateLine(input: string, requestedMode: DisplayMode, explicit = false): LineResult {
    // `a.x_1`, a namespace's member, is the variable a__x_1 inside.
    input = expandDots(input)
    // `table(t, x, v = x / t)`: series in a table; `plot(t, x)`: plotted; `a = select(t, x; …)`: a slice.
    const table = TABLE_CALL.exec(input.trim())
    if (table) return this.evaluateTable(table[1])
    const plotCall = PLOT_CALL.exec(input.trim())
    if (plotCall) return this.evaluatePlot(plotCall[2], plotCall[1])
    const select = SELECT_CALL.exec(input.trim())
    if (select) return this.evaluateSelect(select[1], select[2])

    // `tuple(a, b, c) = …` unpacks a tuple. (Before one-line functions: it looks like one.)
    const unpack = UNPACK.exec(input.trim())
    if (unpack) return this.evaluateUnpack(unpack[1], unpack[2], requestedMode, explicit)

    // `f(x, y) = …` is a one-line function, the same as a `def` whose body is just the return.
    const oneLiner = ONE_LINE_FUNCTION.exec(input.trim())
    const params = oneLiner?.[2].split(',').map((p) => p.trim()).filter(Boolean)
    // (Bad parameters, like `g(x y)`, get defineFunction's error rather than mathjs's.)
    if (oneLiner) {
      // `f(x):3:deg = …`: settings for what the function gives back.
      const result = this.defineFunction(oneLiner[1], params!, [{ line: 0, text: `${KEYWORD.return} ${oneLiner[4]}` }], this.multiline, oneLiner[3])
      return {
        tex: result.body[0]?.tex ?? result.signature,
        error: result.error?.replace(/^Line 0: /, ''),
      }
    }

    // `m:3 = …`, `phi:3:deg = …` set how what's assigned is shown; take them off the name.
    const declaration = parseDeclaration(input.trim())
    if (declaration && 'error' in declaration) return { tex: '', error: declaration.error }
    // A display name is worked out now, so values in it are the ones it was computed with.
    const label = declaration?.label !== undefined ? this.labelTex(declaration.label) : undefined
    if (label?.error) return { tex: '', error: label.error }
    const declaredSf = declaration?.sf
    const displayUnit = declaration?.unit === PERCENT ? undefined : declaration?.unit
    if (declaration) input = `${declaration.name} =${input.trim().slice(declaration.length)}`

    // `delta F =` asks for F's uncertainty; a trailing = is just a prompt.
    const constants = this.expandConstants(input.replace(/=\s*$/, '').trim())
    if (constants.error) return { tex: '', error: constants.error }
    const cleaned = constants.text
    const target = ASSIGNMENT.exec(cleaned)?.[1]
    const aggregateError = this.defineAggregates(cleaned, target)
    if (aggregateError) return { tex: '', error: aggregateError }
    // `… to percent` isn't a mathjs unit: take it off and show the result as a percentage.
    const asPercent = TO_PERCENT.test(cleaned) || declaration?.unit === PERCENT
    const line = expandParenPm(this.expandDeltaRefs(cleaned.replace(TO_PERCENT, '')))

    // Number literals as typed, so `2.0 kg` keeps its trailing zero.
    const literals = new Map<number, string>()
    for (const m of line.matchAll(NUMBER_LITERAL)) addLiteral(literals, m[0])

    // `x = solve(lhs = rhs, x)`: the equation needs special parsing (its `=`).
    const solveCall = SOLVE_CALL.exec(line)
    if (solveCall && !this.isUserFunction('solve')) {
      return this.evaluateSolve(line, solveCall, literals, requestedMode, explicit, declaredSf, displayUnit, declaration?.notation)
    }

    // Separate `value pm uncertainty` on the right-hand side.
    const lhs = ASSIGNMENT.exec(line)?.[0] ?? ''
    const pm = splitPm(line.slice(lhs.length))
    const percent = !!pm?.[1].endsWith('%')

    let node: MathNode
    let uncNode: MathNode | undefined
    const warnings: string[] = []
    try {
      const { text, shadowed } = preprocess(pm ? lhs + pm[0] : line, this.isVariable)
      if (shadowed.length) {
        warnings.push(`"${shadowed.join('", "')}" after a number is read as a unit, not your variable. `
          + `Write 2 * ${shadowed[0]} to use the variable.`)
      }
      node = math.parse(text)
      if (pm) uncNode = math.parse(preprocess(percent ? pm[1].slice(0, -1) : pm[1], this.isVariable).text)
    } catch (e) {
      return { tex: '', error: (e as Error).message }
    }

    if (isFunctionAssignmentNode(node)) {
      const lhs = `${symbolTex(node.name)}\\left(${node.params.map(symbolTex).join(', ')}\\right)`
      const tex = `${lhs} = ${this.toTex(node.expr, literals)}`
      const warning = warnings.join(' ') || undefined
      try {
        node.compile().evaluate(this.scope)
      } catch (e) {
        return { tex, error: (e as Error).message, warning }
      }
      return { tex, warning }
    }

    const result = this.evaluateParsed(node, {
      uncNode, percent, literals, warnings, mode: requestedMode, explicit, declaredSf, asPercent, displayUnit,
      notation: declaration?.notation, vector: declaration?.vector, label: label?.tex,
    })
    return declaration?.components && !result.error ? this.withComponents(declaration.name, result, requestedMode) : result
  }

  /**
   * `F:xyz = …`: store each component of the vector F as a variable of its own
   * (F_x, F_y, F_z), at F's sig figs and notation, and show them under F's line
   * (except with #sym, which shows only the equation).
   */
  private withComponents(name: string, result: LineResult, mode: DisplayMode): LineResult {
    let components: ReturnType<typeof componentsOf>
    try {
      components = componentsOf(name, this.scope.get(name))
    } catch (e) {
      return { ...result, error: (e as Error).message }
    }
    const sf = this.vars.get(name)?.sf ?? EXACT
    const declared = this.vars.get(name)?.declared === true
    // Kept as the vector's notation; shown as its line is (with #sci or #dec too).
    const notation = this.vars.get(name)?.notation
    // Each at the vector's sig figs, or for a typed vector, as typed.
    const typed = declared ? undefined : this.typedSfs.get(this.scope.get(name) as object)
    const sfs = components.map((_, i) => typed?.[i] ?? sf)
    components.forEach((c, i) => this.store(c.name, { value: c.value, sf: sfs[i], declared, notation }))
    if (mode === DISPLAY_MODE.sym) return result
    const rows = components.map((c, i) =>
      `${symbolTex(c.name)} &= ${this.inNotation(result.notation, () => this.valueTex(c.value, sfs[i], undefined, undefined, declared))}`)
    return { ...result, tex: withRows(result.tex, symbolTex(name), rows) }
  }

  /**
   * Evaluate a parsed line (an assignment or expression): display, substitution,
   * sig figs, uncertainty, and storing the result.
   */
  private evaluateParsed(node: MathNode, ctx: ParsedLine): LineResult {
    const { uncNode, percent, literals, warnings, explicit } = ctx
    let mode = ctx.mode
    const assigned = isAssignmentNode(node) ? node.object.name : undefined
    const expr = isAssignmentNode(node) ? node.value : node
    // A function without `return` gives no value: it can only be called on a line of its own.
    const valueless = this.userCalls(expr).find((c) => {
      const f = this.scope.get(c.fn.name)
      return typeof f === 'function' && this.userFunctions.get(f)?.returns === false
    })
    if (valueless) {
      const name = valueless.fn.name
      if (assigned || unwrap(expr) !== valueless) {
        return {
          tex: this.toTex(node, ctx.literals),
          warning: ctx.warnings.join(' ') || undefined,
          error: `${name} has no return line, so it doesn't give a value to ${assigned ? `store in ${assigned}` : 'calculate with'}. `
            + `Add a "return …" line to ${name}, or call it on a line of its own to show its working.`,
        }
      }
      return this.showWorking(valueless, ctx)
    }

    // #multiline on the line, or a call to a function defined with #multiline.
    const multiline = this.multiline || this.userCalls(expr).some((c) => {
      const f = this.scope.get(c.fn.name)
      return typeof f === 'function' && this.userFunctions.get(f)?.multiline === true
    })
    // For `x to kN`, show `x`; the conversion shows up in the result.
    const shown = isOperatorNode(expr) && isConversion(expr) ? expr.args[0] : expr

    // A given left-hand side, such as unpacking's (a, b, c), wins over the name assigned.
    // It's for this line only, not the working of functions it calls, so take it now.
    const override = this.lhsOverride
    this.lhsOverride = undefined
    const unpackDeclaredSf = this.unpackDeclaredSf
    this.unpackDeclaredSf = undefined
    const lhsTex = override ?? (assigned ? (ctx.label ?? symbolTex(assigned)) : ctx.lhs)
    let exprTex = uncNode ? this.pmTex(shown, uncNode, percent, literals) : this.toTex(shown, literals)
    const bare = unwrap(shown)
    /** Intermediate steps between the expression and the result. */
    const steps: string[] = []
    const parts = (result?: string): EquationParts =>
      ({ lhs: lhsTex, expr: exprTex, steps, result, bareSymbol: isSymbolNode(bare) })

    // Calls to multi-line functions: show the working inside each one first.
    // When the whole right-hand side is one call, the line itself then reads
    // `r = <return expression> = … = result` instead of `r = f(y, z) = …`.
    // Lines shown before this one (e.g. the equation being solved), except for #val.
    const trace: TraceLine[] = mode === DISPLAY_MODE.val ? [] : [...(ctx.prelude ?? [])]
    let wholeLineTraced = false
    let returnNote: string | undefined
    /** For a line that's just a function call: the sig figs of what it returns. */
    let returnSf: number | undefined
    // (Worked out with #val too: each call's result has the sig figs of its return
    // line, which sigFigsOf needs when the call is part of a bigger expression.)
    for (const call of this.userCalls(shown)) {
      const t = this.traceCall(call, literals, mode, explicit)
      if (!t) continue
      if (t.retSf !== undefined) this.callSigFigs.set(call, t.retSf)
      if (mode !== DISPLAY_MODE.val) {
        trace.push(...t.lines)
        if (call === bare && t.ret) {
          exprTex = t.ret.expr
          steps.push(...t.ret.steps)
          wholeLineTraced = true
          returnNote = t.retNote
          returnSf = t.retSf
          // A command on the return line sets how this line is shown, unless
          // this line asked for something itself.
          if (t.retCommand && !explicit) mode = t.retCommand
        }
      }
    }

    // `delta F`: show how F's uncertainty is worked out.
    const uncRef = isSymbolNode(bare) ? parseUncertaintyName(bare.name) : null
    const deltaOf = uncRef?.of
    if (uncRef) {
      // The uncertainty of a series mean is its standard error.
      const meanOf = this.vars.get(uncRef.of)?.agg
      steps.push(...(meanOf?.kind === AGGREGATE_KIND.mean
        ? this.standardErrorWorking(meanOf)
        : this.deltaWorking(uncRef.of, uncRef.letter)))
    }
    // `a`, `a_avg`, …: show how the series is combined.
    const agg = isSymbolNode(bare) ? this.vars.get(bare.name)?.agg : undefined
    if (agg) steps.push(...this.aggregateWorking(agg))

    // Substitution and sig figs use the values from before this line runs.
    const usesVariables = shown.filter((n, path) => this.isValueSymbol(n, path)).length > 0
    if (usesVariables && !isSymbolNode(bare) && !wholeLineTraced && this.options.showSubstitution) {
      const substituted = shown.transform((n, path) =>
        this.isValueSymbol(n, path)
          ? this.variableNode(n.name)
          : n)
      // Typed numbers keep their trailing zeros here too (0.250 m, not 0.25 m).
      steps.push(this.toTex(substituted, literals))
    }
    this.precisionLost = false
    // A function call's precision comes from its return line (including any
    // `x:3 =` declarations and measured numbers inside the body).
    const sf = returnSf ?? this.sigFigsOf(expr, literals, false)
    if (this.autoSigFigs && this.precisionLost) {
      warnings.push('This sum or difference is smaller than the precision of the values in it, '
        + 'so it has no significant figures; one is shown.')
    }
    // With a stated uncertainty or declared sig figs, those set the precision, not trailing zeros.
    if (this.autoSigFigs && !uncNode && ctx.declaredSf === undefined) {
      // Unpacking `tuple(a, b:2) = tuple(300 m, 90 deg)`: a value whose name declares
      // its sig figs is settled, like a single `b:2 = 90 deg`.
      const rhs = unwrap(expr)
      const checked = !unpackDeclaredSf
        ? [expr]
        : isFunctionNode(rhs) && rhs.fn.name === FN.tuple
          ? rhs.args.filter((_, i) => !unpackDeclaredSf[i])
          : unpackDeclaredSf.every(Boolean) ? [] : [expr]
      const ambiguous = checked.flatMap((n) => this.ambiguousLiterals(n, literals))
      if (ambiguous.length) {
        warnings.push(`Trailing zeros in ${ambiguous.join(', ')} aren't significant. `
          + `Add a decimal point (${ambiguous[0]}.) or use scientific notation if they are.`)
      }
    }
    let warning = warnings.join(' ') || undefined

    let value: unknown
    let contributions: Contributions
    try {
      // Evaluate the right-hand side and assign ourselves, so the stored value is normalised.
      // A call to a function that declares its result's unit (`conc(n, V):mol/L`) keeps that unit, as a conversion does.
      const called = isFunctionNode(bare) ? this.scope.get(bare.fn.name) : undefined
      const declaresUnit = typeof called === 'function' && !!this.userFunctions.get(called)?.returnUnit
      // A name on its own (`c`, `y = c`) is shown as the variable is: in its unit.
      const justAName = isSymbolNode(bare)
      value = normalise(expr.compile().evaluate(this.scope), isConversion(expr) || isLiteral(expr) || declaresUnit || justAName)
      // A value typed with a unit keeps that unit wherever it's shown (L = 1.00e-10 m
      // stays in m, not 100 pm), as a conversion's result does.
      if (isLiteral(expr) && math.isUnit(value)) (value as Unit).fixPrefix = true
      // So does each component of a typed vector: <3000., 4000.> N stays in N, not kN.
      if (isVectorLiteral(expr) && isTuple(value)) {
        value = math.map(value, (v: MathType) => {
          if (!math.isUnit(v)) return v
          const u = (v as Unit).clone()
          u.fixPrefix = true
          return u
        })
      }
      contributions = this.propagate(expr)
      if (uncNode) contributions.set(this.nextSource++, this.declaredUncertainty(uncNode, value, percent))
    } catch (e) {
      const message = e instanceof RangeError
        ? 'A function here calls itself without end, so it never finishes.'
        : readableUnitError((e as Error).message)
      return { tex: layoutEquation(DISPLAY_MODE.full, parts(), multiline), error: message, warning, trace, info: ctx.info }
    }
    if (ctx.asPercent && math.isUnit(value)) {
      const u = value as Unit
      if (!u.equalBase(math.unit('m/m'))) {
        return {
          tex: layoutEquation(DISPLAY_MODE.full, parts(), multiline), warning, trace, info: ctx.info,
          error: `This has units of ${u.formatUnits()}, so it can't be a percent: only a unitless `
            + 'fraction can. (A density like 4πr²ψ² needs multiplying by a Δr first.)',
        }
      }
      value = u.toNumber('')
    }
    // `phi:deg = …`: the result in that unit (a unitless angle counts as radians).
    if (ctx.displayUnit && value !== undefined) {
      try {
        const angle = !math.isUnit(value) && !math.isMatrix(value) && isAngleUnit(ctx.displayUnit)
        value = toDisplayUnit(value, ctx.displayUnit)
        if (angle) {
          contributions = new Map([...contributions].map(([k, c]) => [k, math.unit(c as number, UNIT.radian)]))
        }
      } catch (e) {
        return { tex: layoutEquation(DISPLAY_MODE.full, parts(), multiline), warning, trace, info: ctx.info, error: (e as Error).message }
      }
    }
    const unc = this.total(contributions, value)
    // A declared `2.0 kg pm 0.1 kg` keeps the uncertainty's sig figs as typed.
    const declaredUncSf = uncNode && !percent && isLiteral(expr) ? this.literalSigFigs(uncNode, literals) : undefined
    let shownSf = unc !== undefined ? (this.uncertainParts(value, unc, declaredUncSf)?.sf ?? sf) : sf

    // Declared sig figs (`m:3 = …`) replace the counted ones, and beat the global
    // setting, unless the value has an uncertainty, which sets its precision instead.
    /** A notation asked for on this line or its block (not just inherited from a variable). */
    const explicitNotation = ctx.notation ?? this.lineNotation.own ?? this.lineNotation.block
    let declaredSf: number | undefined
    if (ctx.declaredSf !== undefined && assigned) {
      if (unc !== undefined) {
        const ignored = `:${ctx.declaredSf} is ignored because ${assigned} has an uncertainty, which sets its precision.`
        warning = warning ? `${warning} ${ignored}` : ignored
      } else {
        declaredSf = ctx.declaredSf === EXACT_SETTING ? EXACT : ctx.declaredSf
        shownSf = declaredSf
        // A typed value shows at the declared precision: m:4 = 2 kg → 2.000 kg.
        if (isLiteral(expr) && Number.isFinite(declaredSf) && !explicitNotation) {
          exprTex = this.valueTex(value, declaredSf, undefined, undefined, true)
        }
      }
    }

    // `x:sci = …`, `x:dec = …`: the notation the result is shown in, and the
    // variable keeps. Otherwise a variable shown on its own (`x`, `x to km`,
    // `delta x`) keeps its own, and a call keeps its function's (`f(x):sci = …`).
    const callee = isFunctionNode(bare) ? this.scope.get(bare.fn.name) : undefined
    const kept = ctx.notation
      ?? (deltaOf ? this.vars.get(deltaOf)?.notation : undefined)
      ?? (isSymbolNode(bare) ? this.vars.get(bare.name)?.notation : undefined)
      ?? (typeof callee === 'function' ? this.userFunctions.get(callee)?.returnNotation : undefined)
    // `#sci` / `#dec` only change how this line is shown: the line's own command
    // beats a variable's notation, and a block's doesn't (see LineNotation).
    const notation = ctx.notation ?? this.lineNotation.own ?? kept ?? this.lineNotation.block
    // `F:ijk = …`: the vector with unit vectors. Otherwise a vector keeps the look
    // of the vectors it's made from (see vectorStyleOf); a plain tuple has none.
    const vector = isTuple(value) ? ctx.vector ?? this.vectorStyleOf(expr) : undefined
    if (ctx.vector && !isTuple(value) && value !== undefined) {
      const ignored = `:${ctx.vector} is ignored because the result isn't a vector.`
      warning = warning ? `${warning} ${ignored}` : ignored
    }
    // A typed vector keeps each component's sig figs as typed: <0.50, -9.81>
    // shows as typed, not rounded to the fewest.
    if (isVectorLiteral(expr) && isTuple(value) && unc === undefined) {
      this.typedSfs.set(value, this.componentSigFigs(expr, literals))
    }
    // A typed vector is shown with unit vectors straight away: F:ijk = <3.0, 4.0> N → F = (3.0 î + 4.0 ĵ) N.
    if (ctx.vector && vector && isVectorLiteral(expr)) {
      exprTex = this.inNotation(notation, () => this.inVectorStyle(vector,
        () => this.valueTex(value, declaredSf ?? shownSf, undefined, undefined, declaredSf !== undefined)))
    }
    // A typed value is shown in the declared notation: x:sci = 12000. m → 1.2000 × 10⁴ m.
    if (explicitNotation && isLiteral(expr) && value !== undefined) {
      exprTex = this.inNotation(notation, () => (declaredSf !== undefined
        ? this.valueTex(value, declaredSf, undefined, undefined, true)
        : this.valueTex(value, shownSf, unc, declaredUncSf)))
    }

    if (assigned) {
      // Defined with #sym (on the line or its block): later substitutions keep the
      // symbol instead of the value. Otherwise, constant-only values stay symbolic.
      const keepSymbol = ctx.mode === DISPLAY_MODE.sym && explicit
      this.store(assigned, {
        value, sf: shownSf, contributions, uncSf: declaredUncSf, declared: declaredSf !== undefined, notation: kept, vector, label: ctx.label,
        shown: keepSymbol ? (ctx.label ?? symbolTex(assigned)) : this.constantForm(expr, literals),
        def: isLiteral(expr) ? undefined : expr,
      })
    }

    const { result, approx } = this.inNotation(notation, () => this.inVectorStyle(vector, () => {
    let result: string | undefined
    if (ctx.asPercent && value !== undefined) {
      // Stored as the fraction (so later lines calculate with it); shown ×100 with a %.
      const pct = math.multiply(value as MathType, PERCENT_SCALE)
      const pctUnc = unc === undefined ? undefined : math.multiply(unc as MathType, PERCENT_SCALE)
      const tex = this.valueTex(pct, declaredSf ?? sf, pctUnc, undefined, declaredSf !== undefined)
      result = pctUnc === undefined ? `${tex}\\,\\%` : `\\left(${tex}\\right)\\,\\%`
    } else if (!isLiteral(expr) && value !== undefined) {
      result = deltaOf
        ? this.uncertaintyTex(value, this.scope.get(deltaOf), this.vars.get(deltaOf)?.uncSf)
        // A bare variable keeps its declared uncertainty precision: `m` → (2.0 ± 0.1) kg.
        : declaredSf !== undefined
          ? this.valueTex(value, declaredSf, undefined, undefined, true)
          : this.valueTex(value, sf, unc, isSymbolNode(bare) ? this.vars.get(bare.name)?.uncSf : undefined,
            isSymbolNode(bare) && this.vars.get(bare.name)?.declared === true)
    }
    // ≈ before a rounded result: always with the setting on, otherwise only when
    // every input is exact (1/3 ≈ 0.333). A value with ± already states its precision.
    let approx = false
    if (result !== undefined && unc === undefined && !deltaOf && (this.options.approxRounded || !Number.isFinite(sf))) {
      const shownValue = ctx.asPercent ? math.multiply(value as MathType, PERCENT_SCALE) : value
      approx = this.isRounded(shownValue, declaredSf ?? sf, declaredSf !== undefined)
    }
    return { result, approx }
    }))
    const finalParts = { ...parts(result), approx }
    return {
      tex: layoutEquation(mode, finalParts, multiline), parts: finalParts, warning, trace, returnNote,
      info: ctx.info, sf: shownSf, notation,
    }
  }


  /** Sig figs of each component of a typed vector (`<0.50, -9.81> m/s^2` → 2, 3). */
  private componentSigFigs(node: MathNode, literals: Map<number, string>): number[] {
    let n = unwrap(node)
    if (isOp(n, OP.multiply)) n = unwrap(n.args[0])
    return (n as FunctionNode).args.map((a) => {
      const c = unwrap(a)
      return this.literalSigFigs(isOp(c, OP.unaryMinus) ? c.args[0] : c, literals) ?? EXACT
    })
  }

  /** Sig figs of a number typed directly, with or without a unit (`0.1 kg` → 1). */
  private literalSigFigs(node: MathNode, literals: Map<number, string>): number | undefined {
    let n = unwrap(node)
    if (isNumberWithUnit(n)) n = unwrap(n.args[0])
    if (isLitCall(n)) return countSigFigs(unitCallText(n))
    if (!isConstantNode(n) || typeof n.value !== 'number') return undefined
    return countSigFigs(literals.get(n.value) ?? String(n.value))
  }

  /** The uncertainty written after `pm`, as a quantity matching `value`. */
  private declaredUncertainty(uncNode: MathNode, value: unknown, percent: boolean): unknown {
    let u = uncNode.compile().evaluate(this.scope) as unknown
    if (percent) {
      if (typeof u !== 'number') throw new Error('A percentage uncertainty must be a plain number, like pm 5%.')
      return math.multiply(math.abs(value as MathType) as MathType, u / PERCENT_SCALE)
    }
    // `2.0 kg pm 0.1`: the uncertainty takes the value's unit.
    if (math.isUnit(value) && typeof u === 'number') u = math.multiply(u, math.unit((value as Unit).formatUnits()))
    if (math.isUnit(value) !== math.isUnit(u) || (math.isUnit(u) && !(u as Unit).equalBase(value as Unit))) {
      throw new Error('The uncertainty must have the same units as the value.')
    }
    return math.abs(u as MathType)
  }

  /** Enter a nested block. */
  pushScope(): void {
    this.views.push()
    this.enter(new Scope(this.vars))
  }

  /** Leave the current block, returning the variables it defined. */
  popScope(): Variable[] {
    const locals = this.describe(this.vars)
    this.views.pop()
    this.enter(this.vars.parent ?? this.rootVars)
    return locals
  }

  /** Top-level variables (call after every block has been closed). */
  variables(): Variable[] {
    return this.describe(this.rootVars)
  }

  /**
   * Variables defined directly in `vars`, not inherited ones, and the members
   * of the selections and named plots made there (a.x_1: each the variable it
   * looks up, under its own name).
   */
  private describe(vars: Variables): Variable[] {
    // Map.prototype.entries only sees this scope's own entries. Uncertainty
    // references and series aggregates are derived on demand, so not listed.
    // Each one's TeX is worked out when it's first asked for (a hover, say): a
    // sheet with thousands of imported values would otherwise typeset them all
    // on every edit.
    const typeset = (name: string, v: StoredVariable) =>
      `${v.label ?? symbolTex(name)} = ${this.valueTex(v.value, v.sf, this.total(v.contributions, v.value), v.uncSf, v.declared === true)}`
    const listed = (name: string, v: StoredVariable): Variable => {
      let tex: string | undefined
      // (Not enumerable, so code that walks the list's properties doesn't typeset them all.)
      return Object.defineProperty({ name, sf: v.sf }, 'tex', { get: () => (tex ??= typeset(name, v)), enumerable: false }) as Variable
    }
    const own = [...vars.entries()]
      .filter(([name, v]) => typeof v.value !== 'function' && !isHiddenName(name) && !v.agg)
      .map(([name, v]) => listed(name, v))
    const looked = [...this.views.membersHere()].flatMap(([member, name]) => {
      const v = vars.get(name)
      return v ? [listed(member, v)] : []
    })
    return [...own, ...looked]
  }
}
