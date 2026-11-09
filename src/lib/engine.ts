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
  LEADING_NAME, NAME, NAME_WITH_SETTINGS, NOTATIONS, NUMBER, ONE_LINE_FUNCTION, PERCENT, SERIES_SUFFIXES,
  UNCERTAINTY_WORDS, UNIT_VECTOR_SETTING, UNPACK, VECTOR_FUNCTION,
  type DisplayMode, type LineCommand, type Notation, type Precision, type SeriesSuffix, type UncertaintyWord,
  type VectorStyle,
} from './syntax.ts'
import { Solver, contains, countOccurrences, matchingParen, splitArgs, splitEquation } from './solve.ts'

/** Our own mathjs instance, with the functions below added or replaced. */
const math = create(all)

/**
 * `lit("2.00")` evaluates to 2 but keeps the number as typed. Numbers whose
 * written form says more than their value (2.00, 0.250, 1.2e3) are wrapped in
 * it, so their trailing zeros and sig figs survive parsing, rearranging and
 * copying of expression trees, and can't be confused with a plain 2 elsewhere.
 */
math.import({ lit: (text: string) => Number(text) })

/**
 * `tuple(x, y, z)`: a tuple of values, such as coordinates. It's a
 * one-dimensional matrix, so `2 * r`, `r1 + r2`, `norm(r)`, `dot` and `cross` all
 * work, and it's shown as (1.0, 2.0, 3.0) m. `tuple(a, b, c) = …` unpacks one
 * into separate variables (see evaluateUnpack).
 */
math.import({ tuple: (...values: MathType[]) => math.matrix(values as never) })

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
      ? `(${VECTOR_FUNCTION}(${inside}) * unit("${unit.text}"))`
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
    if (/[\w)\]]$/.test(before)) continue // a call: f(a, b), solve(…), or (x)(y)
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
for (const name of ['sin', 'cos', 'tan'] as const) {
  const original = math[name] as unknown as ((x: unknown) => unknown) & { toTex?: unknown }
  const wrapped = Object.assign((x: unknown) => snap(original(x), x), { toTex: original.toTex })
  math.import({ [name]: wrapped }, { override: true })
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
    .map((part, i) => (i % 2 ? part : part.replace(NUMBER_LITERAL, (m) => (String(Number(m)) === m ? m : `lit("${m}")`))))
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
  if (mode === 'sym') {
    // For a bare name, its defining formula is the first step (δF = √(…), t̄ = (1/n)Σ tᵢ).
    parts = p.bareSymbol ? [p.lhs, p.expr, p.steps[0]] : [p.lhs, p.expr]
  } else if (mode === 'val') {
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

/** Whether a word is a unit (used after a number, or after `to`). */
export function isUnitName(id: string): boolean {
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
const FIRST_UNIT = /[ \t]*([A-Za-z]+)(?![\w(])/y
const NEXT_UNIT = /([*/·])([A-Za-z]+)(?![\w(])/y

/** Read a unit expression like `m/s^2` or `kg*m^2` starting at `pos`. */
function readUnit(src: string, pos: number): { text: string; end: number } | null {
  FIRST_UNIT.lastIndex = pos
  const first = FIRST_UNIT.exec(src)
  if (!first || !isUnitName(first[1])) return null
  let text = first[1]
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
    text += (next[1] === '/' ? '/' : '*') + next[2]
    end = NEXT_UNIT.lastIndex
    readPower()
  }
  return { text, end }
}

/** Every number in a line, but not digits inside a name (`v_0`) or after a point. */
const NUMBER_LITERAL = new RegExp(String.raw`(?<![\w.])${NUMBER}`, 'g')
/** `to` before a unit. */
const CONVERSION = /\bto\s+/g

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
    out += `${src.slice(last, m.index)}to unit("${unit.text}")`
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
      && /^[ \t]+(?!to\b|in\b)[\w(]/.test(src.slice(unit.end))) {
      shadowed.add(unit.text)
    }
    out += `${src.slice(last, m.index)}(${m[0]} * unit("${unit.text}"))`
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

/**
 * Hidden variable holding a variable's uncertainty. The letter as typed is kept
 * in the name so it renders the same way: `delta F` → `delta__F` (δF),
 * `Delta F` → `Delta__F` (ΔF).
 */
const uncertaintyName = (letter: UncertaintyWord, of: string) => `${letter}__${of}`

/** A hidden uncertainty variable's name (1: the word, 2: whose uncertainty). */
const HIDDEN_UNCERTAINTY = new RegExp(`^(${UNCERTAINTY_WORDS.join('|')})__(.+)$`)

/** The parts of a hidden uncertainty variable's name, or null if it isn't one. */
function parseUncertaintyName(name: string): { letter: UncertaintyWord; of: string } | null {
  const m = HIDDEN_UNCERTAINTY.exec(name)
  return m ? { letter: m[1] as UncertaintyWord, of: m[2] } : null
}

/** Whether a name is a hidden uncertainty variable's. */
const isUncertaintyName = (name: string) => parseUncertaintyName(name) !== null

// ---------------------------------------------------------------------------
// Constants: `@c` (3 sig figs), `@c:5`, `@c:exact`
//
// Each reference becomes a hidden variable holding the rounded value, e.g.
// `@c:5` → `at__c__5`, so it substitutes and counts sig figs like any variable.
// ---------------------------------------------------------------------------

/** The hidden variable for a constant at a precision: `@c:5` → `at__c__5`. */
const constantRefName = (name: string, digits: Precision) => `at__${name}__${digits === EXACT_SETTING ? 'x' : digits}`

/** The constant a hidden variable holds, or null if it isn't one. */
function parseConstantRefName(name: string): string | null {
  return /^at__(.+)__(?:\d+|x)$/.exec(name)?.[1] ?? null
}

/** Hidden variable holding a numerically solved unknown: `x` → `solved__x`. */
const solvedName = (x: string) => `solved__${x}`
/** The unknown a hidden variable holds the solution for, or null. */
const parseSolvedName = (name: string) => /^solved__(.+)$/.exec(name)?.[1] ?? null

/** Hidden helper variables that aren't listed as the sheet's own variables. */
const isHiddenName = (name: string) =>
  isUncertaintyName(name) || parseConstantRefName(name) !== null || parseSolvedName(name) !== null
  || name.startsWith(UNPACKED)

/** A hidden variable holding a tuple while `tuple(a, b) = …` unpacks it. */
const UNPACKED = 'unpacked__'

/** `delta F` (or `Delta F`): F's uncertainty (1: the letter, 2: the name). */
const DELTA_REF = new RegExp(String.raw`\b(${UNCERTAINTY_WORDS.join('|')})\s+(${NAME})`, 'g')

/** `x = solve(…`, or a bare `solve(…` (1: the name assigned, if any). */
const SOLVE_CALL = new RegExp(String.raw`^(?:(${NAME})\s*=\s*)?solve\s*\(`)

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

/** What a series name works out: the sum, or one of the suffixed names' statistics. */
type AggregateKind = 'sum' | typeof SERIES_SUFFIXES[SeriesSuffix]

/** A name worked out from a series, and the variables it uses. */
interface Aggregate {
  kind: AggregateKind
  base: string
  /** Member variable names, in index order. */
  members: string[]
}

/** A series name with its suffix: `t_avg` (1: the series, 2: the suffix). */
const SERIES_NAME = new RegExp(`^(.+?)_(${Object.keys(SERIES_SUFFIXES).join('|')})$`)

/** What a name asks of a series: `t_avg` → t's mean; a name without a suffix, the sum. */
function parseAggregateName(name: string): { base: string; kind: AggregateKind } {
  const m = SERIES_NAME.exec(name)
  return m ? { base: m[1], kind: SERIES_SUFFIXES[m[2] as SeriesSuffix] } : { base: name, kind: 'sum' }
}

/** Text, escaped to match literally in a regular expression. */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `(2.0 pm 0.1)`: a bracketed value with its uncertainty (1: value, 2: uncertainty, 3: `%` if relative). */
const PAREN_PM = /\(\s*([-+]?[\d.]+(?:[eE][+-]?\d+)?)\s*(?:pm\b|±|\+-)\s*([\d.]+(?:[eE][+-]?\d+)?)(%?)\s*\)/g

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
    else if (c === 'p' && /^pm\b/.test(src.slice(i)) && (i === 0 || !/\w/.test(src[i - 1]))) len = 2
    if (len) return [src.slice(0, i).trim(), src.slice(i + len).trim()]
  }
  return null
}

// ---------------------------------------------------------------------------
// LaTeX helpers
// ---------------------------------------------------------------------------

/** Names written as Greek letters: `theta` → θ. */
const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta',
  'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau',
  'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda',
  'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
])

/** One part of a name, as LaTeX: Greek letters, single letters and digits as they are, words upright. */
function namePart(s: string): string {
  if (GREEK.has(s)) return `\\${s}`
  if (s.length === 1 || /^\d+$/.test(s)) return s
  return `\\mathrm{${s}}`
}

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
  const stat = /^(.+?)_(avg|mean|std|sem|count)$/.exec(name)
  if (stat) {
    const base = symbolTex(stat[1])
    if (stat[2] === 'std') return `\\sigma_{${base}}`
    if (stat[2] === 'sem') return `\\sigma_{\\bar{${base}}}`
    if (stat[2] === 'count') return `n_{${base}}`
    return `\\bar{${base}}`
  }
  const trailingDigits = /^([A-Za-z]+?)(\d+)$/.exec(name)
  if (trailingDigits) return `${namePart(trailingDigits[1])}_{${trailingDigits[2]}}`
  // More than one subscript (`F_net_x`, a component) reads F_{net,x}.
  const [base, ...rest] = name.split('_')
  const subs = rest.filter(Boolean)
  return subs.length ? `${namePart(base)}_{${subs.map(namePart).join(',')}}` : namePart(base)
}

/** `1.235e+8` → 1.235 \times 10^{8} */
export function numberTex(s: string): string {
  const m = /^(-?[\d.]+)e([+-]?\d+)$/i.exec(s)
  return m ? `${m[1]} \\times 10^{${Number(m[2])}}` : s
}

/** `(kg m) / s^2` or `m/s^2` → \mathrm{kg}\cdot\mathrm{m}/\mathrm{s}^{2} */
export function unitTex(s: string): string {
  // Brackets matter in a denominator (J/(mol·K)), but not around a numerator.
  const norm = s.trim()
    .replace(/\s*\/\s*/g, '/')
    .replace(/^\(([^()]*)\)\//, '$1/')
    .replace(/\(\s*/g, '(').replace(/\s*\)/g, ')')
    .replace(/\s*[*·]\s*|\s+/g, '*')
  return norm.replace(/[A-Za-z]+|\^(-?[\d.]+)|\*/g, (tok, pow) => {
    if (tok === '*') return '\\cdot '
    if (pow !== undefined) return `^{${pow}}`
    if (tok === 'deg') return '^{\\circ}'
    if (tok === 'ohm') return '\\Omega'
    if (tok === 'angstrom' || tok === 'angstroms') return '\\text{\\AA}'
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
  !!n && isFunctionNode(n) && n.fn.name === 'unit' && isConstantNode(n.args[0])

/** The unit inside unit("kg"). */
const unitCallText = (n: FunctionNode) => String((n.args[0] as math.ConstantNode).value)

/** A number kept as typed: lit("2.00"). */
const isLitCall = (n: MathNode | undefined): n is FunctionNode =>
  !!n && isFunctionNode(n) && n.fn.name === 'lit' && isConstantNode(n.args[0])

/** A node without any brackets around it. */
function unwrap(n: MathNode): MathNode {
  return isParenthesisNode(n) ? unwrap(n.content) : n
}

/** A bare number or quantity such as `2.0 kg` or `-3`, with nothing to compute. */
function isLiteral(n: MathNode): boolean {
  n = unwrap(n)
  if (isConstantNode(n) || isLitCall(n)) return true
  if (isOperatorNode(n) && n.fn === 'unaryMinus') return isLiteral(n.args[0])
  if (isOperatorNode(n) && n.fn === 'multiply' && isUnitCall(n.args[1])) return isLiteral(n.args[0])
  return false
}

/** A vector of typed values: `<3.0, 4.0> N`, `<1.0 m, 2.0 m>`. */
function isVectorLiteral(n: MathNode): boolean {
  n = unwrap(n)
  if (isOperatorNode(n) && n.fn === 'multiply' && isUnitCall(n.args[1])) n = unwrap(n.args[0])
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
const isConversion = (n: MathNode) => isOperatorNode(n) && n.fn === 'to'

// ---------------------------------------------------------------------------
// Unit normalisation
// ---------------------------------------------------------------------------

/** Derived SI units preferred over base-unit combinations (kg m/s^2 → N). */
const DERIVED_UNITS = ['N', 'J', 'W', 'Pa', 'C', 'V', 'ohm', 'F', 'T', 'Wb', 'H'].map((u) => math.unit(u))

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
 */
class Scope<T = unknown> extends Map<string, T> {
  readonly parent: Scope<T> | undefined

  constructor(parent?: Scope<T>) {
    super()
    this.parent = parent
  }

  get(key: string): T | undefined {
    return super.has(key) ? super.get(key) : this.parent?.get(key)
  }

  has(key: string): boolean {
    return super.has(key) || (this.parent?.has(key) ?? false)
  }
}

/** All the parallel scopes for one level: values plus per-variable metadata. */
interface ScopeSet {
  scope: Scope
  sigs: Scope<number>
  uncs: Scope<Contributions>
  uncSfs: Scope<number | undefined>
  declared: Scope<boolean | undefined>
  notations: Scope<Notation | undefined>
  vectors: Scope<VectorStyle | undefined>
  shown: Scope<string | undefined>
  defs: Scope<MathNode | undefined>
  aggs: Scope<Aggregate | undefined>
}

/** What's needed to replay a multi-line function's body to show its working. */
interface UserFunction {
  params: string[]
  /** Each parameter's cast unit (`m to kg` → 'kg'), if it has one. */
  casts: (string | undefined)[]
  /** Body lines as source text: `x = a + b`, and the return expression `x`. */
  statements: { kind: 'assign' | 'return'; text: string; note?: string; command?: LineCommand; multiline?: boolean }[]
  definedIn: ScopeSet
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
}

/** Whether a unit measures angles. */
const isAngleUnit = (unit: string) => {
  try {
    return math.unit(unit).equalBase(math.unit('rad'))
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
    if (isAngleUnit(unit)) return math.unit(value, 'rad').to(unit)
    throw new Error(`${formatted(value)} has no unit, so it can't be shown in ${unit} `
      + '(only an angle in radians, from atan or asin for example, can be given a unit this way).')
  }
  throw new Error(`This value can't be shown in ${unit}.`)
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
  return values.map((v, i) => ({ name: `${name}_${AXES[i]}`, value: v }))
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
  for (const spec of m[2].slice(1).split(':')) {
    if (spec === EXACT_SETTING) out.sf = EXACT_SETTING
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


/** Internal result of evaluating a line, with the pieces of its equation. */
interface LineResult extends CalcResult {
  parts?: EquationParts
  /** Sig figs of the result. */
  sf?: number
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
}

/** `… to percent` at the end of a line. */
const TO_PERCENT = /\s+to\s+percent\s*$/

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

/** A function parameter: `m`, or `m to kg` (cast to kg on the way in). */
function parseParam(spec: string): { name: string; unit?: string } | null {
  const m = new RegExp(String.raw`^(${NAME})(?:\s+to\s+(\S+))?$`).exec(spec.trim())
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
  isOperatorNode(n) && n.fn === 'multiply' && isUnitCall(n.args[1])

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
  sf: number
  /** Uncertainty contributions (none: no uncertainty). */
  contributions?: Contributions
  uncSf?: number
  /** Its sig figs were declared, so they beat the global setting. */
  declared?: boolean
  notation?: Notation
  vector?: VectorStyle
  /** How to show it in substitutions, if not as its value. */
  shown?: string
  /** Its defining expression, for ΔX working. */
  def?: MathNode
  agg?: Aggregate
}

/** Evaluates a sheet line by line, keeping its variables, their sig figs and uncertainties, and the functions it defines. */
export class Calculator {
  private readonly root = new Scope()
  private scope = this.root
  /** Significant figures of each variable, scoped alongside the values. */
  private readonly sigsRoot = new Scope<number>()
  private sigs = this.sigsRoot
  /** Uncertainty contributions of each variable (empty map: no uncertainty). */
  private readonly uncsRoot = new Scope<Contributions>()
  private uncs = this.uncsRoot
  /** Sig figs of uncertainties as typed in a declaration (`pm 0.1` → 1), kept for display. */
  private uncSfs = new Scope<number | undefined>()
  /** Whether a variable's sig figs were declared (`m:3 = …`); then they beat the global setting. */
  private declared = new Scope<boolean | undefined>()
  /** A variable's declared notation (`x:sci = …`), used wherever its value is shown. */
  private notations = new Scope<Notation | undefined>()
  /** Notation numbers are being formatted in right now (see inNotation). */
  private notation: Notation | undefined
  /** How a variable holding a vector is shown (⟨…⟩, or with unit vectors), wherever its value appears. */
  private vectors = new Scope<VectorStyle | undefined>()
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
  /**
   * How to show a variable in substitution steps when its value is made only of
   * numbers and built-in constants (`theta = pi/4` shows as π/4, not 0.785).
   */
  private shown = new Scope<string | undefined>()
  /** Defining expression of each computed variable, for showing ΔX working. */
  private defs = new Scope<MathNode | undefined>()
  /** Names currently standing for a series aggregate (undefined once assigned explicitly). */
  private aggs = new Scope<Aggregate | undefined>()
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
    this.scope.set(name, v.value)
    this.sigs.set(name, v.sf)
    this.uncs.set(name, v.contributions ?? new Map())
    this.uncSfs.set(name, v.uncSf)
    this.declared.set(name, v.declared || undefined)
    this.notations.set(name, v.notation)
    this.vectors.set(name, v.vector)
    this.shown.set(name, v.shown)
    this.defs.set(name, v.def)
    this.aggs.set(name, v.agg)
  }

  /**
   * How an expression's result is shown if it's a vector: with unit vectors if
   * any vector in it is (`F:ijk`), else ⟨…⟩ if it has a vector in it at all
   * (`<…>`, a variable holding one, a function returning one); undefined if
   * it has none (a plain tuple).
   */
  private vectorStyleOf(node: MathNode): VectorStyle | undefined {
    const styles = node.filter((n) => isSymbolNode(n) || isFunctionNode(n)).map((n) => {
      if (isSymbolNode(n)) return this.vectors.get(n.name)
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
      if (isOperatorNode(alias) && alias.fn === 'unaryMinus') {
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
    const shown = this.shown.get(name)
    if (shown) return rawNode(shown)
    return this.inNotation(this.notations.get(name), () => this.inVectorStyle(this.vectors.get(name),
      () => this.valueNode(this.scope.get(name), this.sigs.get(name) ?? EXACT, this.declared.get(name) === true)))
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
    const bare = isSymbolNode(n) || isFunctionNode(n) || (isOperatorNode(n) && n.fn === 'divide')
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
    if (!parts.unit) return rawNode(parts.num.startsWith('-') ? `\\left(${numTex}\\right)` : numTex)
    const unit = new math.FunctionNode(new math.SymbolNode('unit'), [new math.ConstantNode(parts.unit)])
    return new math.ParenthesisNode(new math.OperatorNode('*', 'multiply', [rawNode(numTex), unit]))
  }

  private toTex(node: MathNode, literals: Map<number, string>): string {
    // Leading spaces keep mathjs output such as `\cdot` from running into a name.
    const handler = (n: MathNode, options: object): string | undefined => {
      if (isConstantNode(n) && typeof n.value === 'number') {
        return ` ${numberTex(literals.get(n.value) ?? math.format(n.value, this.format))}`
      }
      if (isUnitCall(n)) return ` ${unitTex(unitCallText(n))}`
      if (isLitCall(n)) return ` ${numberTex(unitCallText(n))}`
      if (isOperatorNode(n) && n.fn === 'multiply' && isUnitCall(n.args[1])) {
        return attachUnit(n.args[0].toTex(options), unitTex(unitCallText(n.args[1])))
      }
      // -2.0 m, not -(2.0 m)
      if (isOperatorNode(n) && n.fn === 'unaryMinus' && (isNumberWithUnit(unwrap(n.args[0])) || isLiteral(n.args[0]))) {
        return ` -${unwrap(n.args[0]).toTex(options).trim()}`
      }
      if (isSymbolNode(n)) {
        if (n.name.startsWith(RAW)) return ` ${n.name.slice(1)}`
        return ` ${symbolTex(n.name)}`
      }
      if (isFunctionNode(n) && n.fn.name === 'tuple') {
        return `\\left(${n.args.map((a) => a.toTex(options).trim()).join(', ')}\\right)`
      }
      if (isFunctionNode(n) && n.fn.name === VECTOR_FUNCTION) {
        return `\\left\\langle ${n.args.map((a) => a.toTex(options).trim()).join(', ')}\\right\\rangle`
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
    if (isSymbolNode(node)) return this.sigs.get(node.name) ?? EXACT
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
      if (node.fn === 'multiply' && isUnitCall(node.args[1])) return this.sigFigsOf(node.args[0], literals, true)
      if (node.fn === 'unaryMinus' || node.fn === 'unaryPlus') return this.sigFigsOf(node.args[0], literals, measured)
      if (node.fn === 'add' || node.fn === 'subtract') {
        const terms = node.args.map((a) => ({ sf: this.sigFigsOf(a, literals, false), x: this.magnitude(a) }))
        const total = this.magnitude(node)
        if (Number.isNaN(total) || terms.some((t) => Number.isNaN(t.x))) return Math.min(...terms.map((t) => t.sf))
        const sf = sigFigsFromPlace(total, Math.max(...terms.map((t) => lastPlace(t.x, t.sf))))
        if (sf < 1) this.precisionLost = true
        return Math.max(1, sf)
      }
      // An exponent written as plain numbers (^0.5, ^(3/2), ^(-0.5)) is part of the
      // formula, not a measurement, so only the base limits the sig figs.
      if (node.fn === 'pow' && isPureNumber(node.args[1])) return this.sigFigsOf(node.args[0], literals, false)
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
      } else if (isOperatorNode(n) && n.fn === 'multiply' && isUnitCall(n.args[1])) {
        visit(n.args[0], true)
      } else if (isOperatorNode(n) && n.fn === 'unaryMinus') {
        visit(n.args[0], measured)
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
    return this.total(this.uncs.get(name), this.scope.get(name))
  }

  private uncertainInputs(expr: MathNode): string[] {
    const names = expr.filter((n, path) => this.isValueSymbol(n, path)).map((n) => (n as SymbolNode).name)
    return [...new Set(names)].filter((n) => this.uncs.get(n)?.size)
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
    const sources = new Set(inputs.flatMap((n) => [...this.uncs.get(n)!.keys()]))
    for (const source of sources) {
      const plus = new Scope(this.scope)
      const minus = new Scope(this.scope)
      for (const n of inputs) {
        const d = this.uncs.get(n)!.get(source)
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
      this.scope.set(hidden, unc)
      this.uncs.set(hidden, new Map())
      this.uncSfs.set(hidden, undefined)
      this.defs.set(hidden, undefined)
      this.sigs.set(hidden, uncertaintySigFigs(this.split(unc, EXACT)?.x ?? 0))
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
    const def = this.defs.get(name)
    if (!def) return []
    const inputs = this.uncertainInputs(def).filter((n) => !isUncertaintyName(n))
    if (!inputs.length) return []
    const sources = inputs.map((n) => new Set(this.uncs.get(n)!.keys()))
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
        (isOperatorNode(d) && ['add', 'subtract', 'unaryMinus'].includes(d.fn) ? `\\left(${tex}\\right)` : tex)
      steps.push(sqrt(inputs.map((n, i) =>
        term(wrap(derivs[i], this.toTex(derivs[i], new Map())), uncOf(n)))))
      if (this.options.showSubstitution) {
        steps.push(sqrt(inputs.map((n, i) => {
          const sub = derivs[i].transform((m, path) => (this.isValueSymbol(m, path)
            ? this.variableNode(m.name)
            : m))
          return term(
            wrap(derivs[i], this.toTex(sub, new Map())),
            this.uncertaintyTex(this.totalUncertainty(n), this.scope.get(n), this.uncSfs.get(n)),
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
    const re = new RegExp(`^${escapeRegExp(base)}_?(\\d+)$`)
    const found = new Map<string, number>()
    for (let s: Scope | undefined = this.scope; s; s = s.parent) {
      // Map.prototype.keys only sees this level's own names.
      for (const name of s.keys()) {
        const m = re.exec(name)
        if (!m || found.has(name) || isUncertaintyName(name) || this.aggs.get(name)) continue
        if (typeof this.scope.get(name) === 'function') continue
        found.set(name, Number(m[1]))
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
    for (const m of line.matchAll(/(?<![\w\\.])([A-Za-z][A-Za-z0-9_]*)(?![\w(])/g)) {
      const name = m[1]
      if (name === skip || (this.scope.has(name) && !this.aggs.get(name))) continue
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
      case 'count':
        value = n
        break
      case 'sum':
        value = total
        contributions = this.mergedContributions(agg.members)
        sf = this.seriesSigFigs(agg.members, total)
        break
      case 'mean':
        value = math.divide(total as MathType, n)
        sf = this.seriesSigFigs(agg.members, total)
        // Standard error σ/√n, as one source shared by every use of this mean.
        if (n >= 2) contributions = new Map([[this.aggregateSource(agg.base), this.standardError(values)]])
        else contributions = this.mergedContributions(agg.members)
        break
      case 'std':
      case 'sem':
        if (n < 2) throw new Error('a standard deviation needs at least two values.')
        value = agg.kind === 'std' ? this.stdDev(values) : this.standardError(values)
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
      for (const [source, c] of this.uncs.get(m) ?? []) {
        out.set(source, out.has(source) ? math.add(out.get(source) as MathType, c as MathType) : c)
      }
    }
    return out
  }

  /** Sig figs of a series total by the addition rule (least precise decimal place). */
  private seriesSigFigs(members: string[], total: unknown): number {
    const place = Math.max(...members.map((m) =>
      lastPlace(magnitudeOf(this.scope.get(m)), this.sigs.get(m) ?? EXACT)))
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
    if (n === 1 && agg.kind !== 'count') return [symbolTex(agg.members[0])]
    const list = (f: (m: string) => string) => {
      const items = agg.members.map(f)
      return (n > 6 ? [...items.slice(0, 2), '\\cdots', items[n - 1]] : items).join(' + ')
    }
    const names = list(symbolTex)
    const values = list((m) => this.toTex(this.variableNode(m), new Map()))
    const baseTex = symbolTex(agg.base)
    const ith = agg.base.includes('_') ? `\\left(${baseTex}\\right)_{i}` : `${baseTex}_{i}`
    const sum = (body: string) => `\\sum_{i=1}^{${n}} ${body}`
    const sub = this.options.showSubstitution
    switch (agg.kind) {
      case 'sum':
        return [sum(ith), names, ...(sub ? [values] : [])]
      case 'mean':
        return [`\\frac{1}{${n}}${sum(ith)}`, `\\frac{${names}}{${n}}`, ...(sub ? [`\\frac{${values}}{${n}}`] : [])]
      case 'std':
        return [`\\sqrt{\\frac{1}{${n}-1}${sum(`\\left(${ith}-\\bar{${baseTex}}\\right)^{2}`)}}`]
      case 'sem':
        return this.standardErrorWorking(agg)
      case 'count':
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

  defineConstant(input: string): CalcResult {
    const name = ASSIGNMENT.exec(input)?.[1]
    if (!name) return { tex: '', error: 'Inside @constants, each line is "name = value".' }
    this.pushScope()
    try {
      const result = this.evaluate(input)
      if (!result.error && this.scope.has(name)) {
        this.customConstants.set(name, {
          value: this.scope.get(name),
          sf: this.sigs.get(name) ?? EXACT,
          contributions: this.uncs.get(name) ?? new Map(),
          uncSf: this.uncSfs.get(name),
          declared: this.declared.get(name) === true,
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
      this.scope.set(hidden, exact ? full : this.roundTo(full, digits))
      // `:exact` shows every digit of the value; that many sig figs is more than any
      // measurement has, so it never limits a result.
      const allDigits = custom ? custom.sf : countSigFigs(String(builtin.value))
      this.sigs.set(hidden, exact ? allDigits : digits)
      this.uncs.set(hidden, custom ? custom.contributions : new Map())
      this.uncSfs.set(hidden, custom?.uncSf)
      // An explicit precision (`@c:4`, a sheet-wide `@c:4` line, `rho:2 = …`) beats the global setting.
      this.declared.set(hidden, spec !== undefined || this.constantPrecision.has(name) || custom?.declared || undefined)
      this.defs.set(hidden, undefined)
      this.aggs.set(hidden, undefined)
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
    type Statement =
      // `unit`: a display unit on the name (`th:deg = …`), which the value keeps.
      | { kind: 'assign'; name: string; code: math.EvalFunction; unit?: string; components?: boolean }
      | { kind: 'unpack'; targets: TupleName[]; code: math.EvalFunction }
      | { kind: 'return'; code: math.EvalFunction }
    const statements: Statement[] = []
    const sources: UserFunction['statements'] = []

    const duplicate = params.find((p, i) => params.indexOf(p) !== i)
    if (duplicate) return { signature, body, error: `The parameter "${duplicate}" is listed twice.` }

    for (const { line, text, note, command, multiline: lineMultiline } of lines) {
      const ret = /^return\s+(.+)$/.exec(text)
      // `x = …`, or with display settings: `x:3 = …`, `theta:deg = …`.
      const assign = ASSIGNMENT_WITH_VALUE.exec(text)
      // `tuple(a, b) = …` unpacks a tuple (checked first: it also looks like an assignment).
      const unpack = UNPACK.exec(text)
      const unpackNames = unpack?.[1].split(',').map((n) => n.trim())
      const source = ret?.[1] ?? unpack?.[2] ?? assign?.[2]
      if (!source) {
        return { signature, body, error: `Line ${line}: inside a function, each line is "name = …", "tuple(a, b) = …" or "return …".` }
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
          statements.push({ kind: 'unpack', targets: targets!, code })
          sources.push({ kind: 'assign', text, note, command, multiline: lineMultiline })
          const names = targets!.map((t) => symbolTex(t.name)).join(', ')
          body.push({ tex: `\\left(${names}\\right) = ${this.toTex(node, literals)}`, note, line })
        } else if (ret) {
          statements.push({ kind: 'return', code })
          sources.push({ kind: 'return', text: source, note, command, multiline: lineMultiline })
          body.push({ tex: `${signature} = ${this.toTex(node, literals)}`, note, line })
        } else {
          const declared = parseDeclaration(text)
          const unit = declared && !('error' in declared) && declared.unit !== PERCENT ? declared.unit : undefined
          const components = declared && !('error' in declared) ? declared.components : undefined
          statements.push({ kind: 'assign', name: assign![1], code, unit, components })
          // Keep the line as written, so a declared `x:3 =` applies when its working is shown.
          sources.push({ kind: 'assign', text, note, command, multiline: lineMultiline })
          body.push({ tex: `${symbolTex(assign![1])} = ${this.toTex(node, literals)}`, note, line })
        }
      } catch (e) {
        return { signature, body, error: `Line ${line}: ${(e as Error).message}` }
      }
    }
    // No `return`: like Python, the function gives no value. Called on a line of
    // its own, it just shows its working; used in a calculation, it's an error.
    const returns = statements.some((s) => s.kind === 'return')

    const definedIn = this.scope
    const fn = (...args: unknown[]) => {
      if (args.length !== params.length) {
        throw new Error(`${name} takes ${params.length} argument${params.length === 1 ? '' : 's'}, `
          + `but was given ${args.length}.`)
      }
      const local = new Scope(definedIn)
      params.forEach((p, i) => local.set(p, castArgument(p, casts[i], args[i])))
      for (const s of statements) {
        const v = s.code.evaluate(local)
        if (s.kind === 'return') return returnUnit ? toDisplayUnit(v, returnUnit) : v
        if (s.kind === 'unpack') {
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
      params, casts, statements: sources, definedIn: this.currentScopes(), multiline, returns, returnSf, returnNotation, returnVector, returnUnit,
    })
    this.scope.set(name, fn)
    this.uncs.set(name, new Map())
    this.defs.set(name, undefined)
    this.aggs.set(name, undefined)
    return { signature, body }
  }

  private currentScopes(): ScopeSet {
    return {
      scope: this.scope, sigs: this.sigs, uncs: this.uncs, uncSfs: this.uncSfs,
      declared: this.declared, notations: this.notations, vectors: this.vectors, shown: this.shown, defs: this.defs, aggs: this.aggs,
    }
  }

  private restoreScopes(s: ScopeSet): void {
    this.scope = s.scope
    this.sigs = s.sigs
    this.uncs = s.uncs
    this.uncSfs = s.uncSfs
    this.declared = s.declared
    this.notations = s.notations
    this.vectors = s.vectors
    this.shown = s.shown
    this.defs = s.defs
    this.aggs = s.aggs
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
    const traced = ctx.mode === 'val' ? null : this.traceCall(call, ctx.literals, ctx.mode, ctx.explicit)
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
          ? this.shown.get((unwrap(a) as SymbolNode).name) ?? this.constantForm(a, literals)
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
    const caller = this.currentScopes()
    const d = def.definedIn
    this.restoreScopes({
      scope: new Scope(d.scope), sigs: new Scope(d.sigs), uncs: new Scope(d.uncs),
      uncSfs: new Scope(d.uncSfs), declared: new Scope(d.declared), notations: new Scope(d.notations), vectors: new Scope(d.vectors), shown: new Scope(d.shown),
      defs: new Scope(d.defs), aggs: new Scope(d.aggs),
    })
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
      for (const s of def.statements) {
        const own = s.command && s.command !== 'hide' ? s.command : undefined
        // The function's own #multiline (or the body line's) lays out its working too.
        const outerMultiline = this.multiline
        this.multiline = outerMultiline || def.multiline || !!s.multiline
        let r: LineResult
        try {
          r = this.evaluateLine(s.text, own ?? mode, explicit || !!own)
        } finally {
          this.multiline = outerMultiline
        }
        const hidden = s.command === 'hide' && !r.error
        if (!hidden) lines.push(...(r.trace ?? []))
        if (s.kind === 'return') {
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
      this.restoreScopes(caller)
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
    const conversion = /^to\s+(.+)$/.exec(tail)?.[1]
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
      const f = new math.OperatorNode('-', 'subtract', [lhs, new math.ParenthesisNode(rhs)])
      const poly = solver.polynomial(f, x)
      if (poly) {
        candidates = poly.solutions
        quadratic = poly.kind === 'quadratic'
      }
    }

    /** The solution, converted with `to unit` if one was given. */
    const convert = (expr: MathNode, value: unknown): MathNode => {
      let shown = expr
      if (conversion) {
        const unitNode = (math.parse(preprocess(`1 to ${conversion}`, () => false).text) as math.OperatorNode).args[1]
        // Angles from asin/acos/atan come out as plain numbers in radians.
        const targetUnit = unitNode.compile().evaluate({})
        if (typeof value === 'number' && math.isUnit(targetUnit) && (targetUnit as Unit).equalBase(math.unit('rad'))) {
          shown = new math.OperatorNode('*', 'multiply', [
            new math.ParenthesisNode(shown),
            new math.FunctionNode(new math.SymbolNode('unit'), [new math.ConstantNode('rad')]),
          ])
        }
        shown = new math.OperatorNode('to', 'to', [shown, unitNode])
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
    const F = new math.OperatorNode('-', 'subtract', [lhs, new math.ParenthesisNode(rhs)])
    const code = F.compile()
    const residual = (s: number) => {
      const scope = new Scope(this.scope)
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
    const caller = this.currentScopes()
    this.restoreScopes({ ...caller, scope: new Scope(caller.scope), sigs: new Scope(caller.sigs), uncs: new Scope(caller.uncs) })
    let contributions: Contributions = new Map()
    let sf: number
    try {
      this.scope.set(x, value)
      this.sigs.set(x, EXACT)
      this.uncs.set(x, new Map())
      const h = Math.abs(s1) * SOLVER.slopeStep || SOLVER.slopeStepAtZero
      const slope = (residual(s1 + h) - residual(s1 - h)) / (2 * h)
      if (slope !== 0 && Number.isFinite(slope)) {
        for (const [source, c] of this.propagate(F)) {
          contributions.set(source, withMagnitude(value, -magnitudeOf(c) / slope))
        }
      }
      sf = this.sigFigsOf(F, literals, false)
    } finally {
      this.restoreScopes(caller)
    }

    // Hold the answer in a hidden variable, shown as x itself.
    const hidden = solvedName(x)
    this.scope.set(hidden, value)
    this.sigs.set(hidden, sf)
    this.uncs.set(hidden, contributions)
    this.uncSfs.set(hidden, undefined)
    this.defs.set(hidden, undefined)
    this.aggs.set(hidden, undefined)
    return finish(new math.SymbolNode(hidden), value)
  }

  // -------------------------------------------------------------------------
  // Evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate one line. `explicit` says the mode was asked for with a command
   * (on the line or its block), so it isn't overridden by a called function's
   * return-line command.
   */
  evaluate(input: string, mode: DisplayMode = 'full', explicit = false, multiline = false): CalcResult {
    this.multiline = multiline
    try {
      const { tex, error, warning, info, trace, returnNote } = this.evaluateLine(input, mode, explicit)
      return { tex, error, warning, info, returnNote, trace: trace?.length ? trace : undefined }
    } finally {
      this.multiline = false
    }
  }

  /** `#multiline` on the line being evaluated: each `=` (and in a call's working too) on its own row. */
  private multiline = false

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

    const hidden = `${UNPACKED}${this.nextUnpack++}`
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
    const sf = this.sigs.get(hidden) ?? EXACT
    for (const m of [this.scope, this.sigs, this.uncs, this.uncSfs, this.declared, this.notations, this.vectors, this.shown, this.defs, this.aggs]) {
      m.delete(hidden)
    }
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

  private evaluateLine(input: string, requestedMode: DisplayMode, explicit = false): LineResult {
    // `tuple(a, b, c) = …` unpacks a tuple. (Before one-line functions: it looks like one.)
    const unpack = UNPACK.exec(input.trim())
    if (unpack) return this.evaluateUnpack(unpack[1], unpack[2], requestedMode, explicit)

    // `f(x, y) = …` is a one-line function, the same as a `def` whose body is just the return.
    const oneLiner = ONE_LINE_FUNCTION.exec(input.trim())
    const params = oneLiner?.[2].split(',').map((p) => p.trim()).filter(Boolean)
    // (Bad parameters, like `g(x y)`, get defineFunction's error rather than mathjs's.)
    if (oneLiner) {
      // `f(x):3:deg = …`: settings for what the function gives back.
      const result = this.defineFunction(oneLiner[1], params!, [{ line: 0, text: `return ${oneLiner[4]}` }], this.multiline, oneLiner[3])
      return {
        tex: result.body[0]?.tex ?? result.signature,
        error: result.error?.replace(/^Line 0: /, ''),
      }
    }

    // `m:3 = …`, `phi:3:deg = …` set how what's assigned is shown; take them off the name.
    const declaration = parseDeclaration(input.trim())
    if (declaration && 'error' in declaration) return { tex: '', error: declaration.error }
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
      notation: declaration?.notation, vector: declaration?.vector,
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
    const sf = this.sigs.get(name) ?? EXACT
    const declared = this.declared.get(name) === true
    const notation = this.notations.get(name)
    // Each at the vector's sig figs, or for a typed vector, as typed.
    const typed = declared ? undefined : this.typedSfs.get(this.scope.get(name) as object)
    const sfs = components.map((_, i) => typed?.[i] ?? sf)
    components.forEach((c, i) => this.store(c.name, { value: c.value, sf: sfs[i], declared, notation }))
    if (mode === 'sym') return result
    const rows = components.map((c, i) =>
      `${symbolTex(c.name)} &= ${this.inNotation(notation, () => this.valueTex(c.value, sfs[i], undefined, undefined, declared))}`)
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
    const lhsTex = override ?? (assigned ? symbolTex(assigned) : ctx.lhs)
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
    const trace: TraceLine[] = mode === 'val' ? [] : [...(ctx.prelude ?? [])]
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
      if (mode !== 'val') {
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
      const meanOf = this.aggs.get(uncRef.of)
      steps.push(...(meanOf?.kind === 'mean'
        ? this.standardErrorWorking(meanOf)
        : this.deltaWorking(uncRef.of, uncRef.letter)))
    }
    // `a`, `a_avg`, …: show how the series is combined.
    const agg = isSymbolNode(bare) ? this.aggs.get(bare.name) : undefined
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
        : isFunctionNode(rhs) && rhs.fn.name === 'tuple'
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
      value = normalise(expr.compile().evaluate(this.scope), isConversion(expr) || isLiteral(expr) || declaresUnit)
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
        : (e as Error).message
      return { tex: layoutEquation('full', parts(), multiline), error: message, warning, trace, info: ctx.info }
    }
    if (ctx.asPercent && math.isUnit(value)) {
      const u = value as Unit
      if (!u.equalBase(math.unit('m/m'))) {
        return {
          tex: layoutEquation('full', parts(), multiline), warning, trace, info: ctx.info,
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
          contributions = new Map([...contributions].map(([k, c]) => [k, math.unit(c as number, 'rad')]))
        }
      } catch (e) {
        return { tex: layoutEquation('full', parts(), multiline), warning, trace, info: ctx.info, error: (e as Error).message }
      }
    }
    const unc = this.total(contributions, value)
    // A declared `2.0 kg pm 0.1 kg` keeps the uncertainty's sig figs as typed.
    const declaredUncSf = uncNode && !percent && isLiteral(expr) ? this.literalSigFigs(uncNode, literals) : undefined
    let shownSf = unc !== undefined ? (this.uncertainParts(value, unc, declaredUncSf)?.sf ?? sf) : sf

    // Declared sig figs (`m:3 = …`) replace the counted ones, and beat the global
    // setting, unless the value has an uncertainty, which sets its precision instead.
    let declaredSf: number | undefined
    if (ctx.declaredSf !== undefined && assigned) {
      if (unc !== undefined) {
        const ignored = `:${ctx.declaredSf} is ignored because ${assigned} has an uncertainty, which sets its precision.`
        warning = warning ? `${warning} ${ignored}` : ignored
      } else {
        declaredSf = ctx.declaredSf === EXACT_SETTING ? EXACT : ctx.declaredSf
        shownSf = declaredSf
        // A typed value shows at the declared precision: m:4 = 2 kg → 2.000 kg.
        if (isLiteral(expr) && Number.isFinite(declaredSf) && !ctx.notation) {
          exprTex = this.valueTex(value, declaredSf, undefined, undefined, true)
        }
      }
    }

    // `x:sci = …`, `x:dec = …`: the notation the result is shown in. Otherwise a
    // variable shown on its own (`x`, `x to km`, `delta x`) keeps its own, and a
    // call keeps its function's (`f(x):sci = …`).
    const callee = isFunctionNode(bare) ? this.scope.get(bare.fn.name) : undefined
    const notation = ctx.notation
      ?? (deltaOf ? this.notations.get(deltaOf) : undefined)
      ?? (isSymbolNode(bare) ? this.notations.get(bare.name) : undefined)
      ?? (typeof callee === 'function' ? this.userFunctions.get(callee)?.returnNotation : undefined)
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
    if (ctx.notation && isLiteral(expr) && value !== undefined) {
      exprTex = this.inNotation(notation, () => (declaredSf !== undefined
        ? this.valueTex(value, declaredSf, undefined, undefined, true)
        : this.valueTex(value, shownSf, unc, declaredUncSf)))
    }

    if (assigned) {
      // Defined with #sym (on the line or its block): later substitutions keep the
      // symbol instead of the value. Otherwise, constant-only values stay symbolic.
      const keepSymbol = ctx.mode === 'sym' && explicit
      this.store(assigned, {
        value, sf: shownSf, contributions, uncSf: declaredUncSf, declared: declaredSf !== undefined, notation, vector,
        shown: keepSymbol ? symbolTex(assigned) : this.constantForm(expr, literals),
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
        ? this.uncertaintyTex(value, this.scope.get(deltaOf), this.uncSfs.get(deltaOf))
        // A bare variable keeps its declared uncertainty precision: `m` → (2.0 ± 0.1) kg.
        : declaredSf !== undefined
          ? this.valueTex(value, declaredSf, undefined, undefined, true)
          : this.valueTex(value, sf, unc, isSymbolNode(bare) ? this.uncSfs.get(bare.name) : undefined,
            isSymbolNode(bare) && this.declared.get(bare.name) === true)
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
      info: ctx.info, sf: shownSf,
    }
  }

  /** Sig figs of each component of a typed vector (`<0.50, -9.81> m/s^2` → 2, 3). */
  private componentSigFigs(node: MathNode, literals: Map<number, string>): number[] {
    let n = unwrap(node)
    if (isOperatorNode(n) && n.fn === 'multiply') n = unwrap(n.args[0])
    return (n as FunctionNode).args.map((a) => {
      const c = unwrap(a)
      return this.literalSigFigs(isOperatorNode(c) && c.fn === 'unaryMinus' ? c.args[0] : c, literals) ?? EXACT
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
    this.scope = new Scope(this.scope)
    this.sigs = new Scope(this.sigs)
    this.uncs = new Scope(this.uncs)
    this.uncSfs = new Scope(this.uncSfs)
    this.declared = new Scope(this.declared)
    this.notations = new Scope(this.notations)
    this.vectors = new Scope(this.vectors)
    this.shown = new Scope(this.shown)
    this.defs = new Scope(this.defs)
    this.aggs = new Scope(this.aggs)
  }

  /** Leave the current block, returning the variables it defined. */
  popScope(): Variable[] {
    const locals = this.describe(this.scope, this.sigs, this.uncs, this.uncSfs, this.aggs, this.declared)
    this.scope = this.scope.parent ?? this.root
    this.sigs = this.sigs.parent ?? this.sigsRoot
    this.uncs = this.uncs.parent ?? this.uncsRoot
    this.uncSfs = this.uncSfs.parent ?? this.uncSfs
    this.declared = this.declared.parent ?? this.declared
    this.notations = this.notations.parent ?? this.notations
    this.vectors = this.vectors.parent ?? this.vectors
    this.shown = this.shown.parent ?? this.shown
    this.defs = this.defs.parent ?? this.defs
    this.aggs = this.aggs.parent ?? this.aggs
    return locals
  }

  /** Top-level variables (call after every block has been closed). */
  variables(): Variable[] {
    return this.describe(this.root, this.sigsRoot, this.uncsRoot, this.uncSfs, this.aggs, this.declared)
  }

  /** Variables defined directly in `scope`, not inherited ones. */
  private describe(
    scope: Scope,
    sigs: Scope<number>,
    uncs: Scope<Contributions>,
    uncSfs: Scope<number | undefined>,
    aggs: Scope<Aggregate | undefined>,
    declared: Scope<boolean | undefined>,
  ): Variable[] {
    // Map.prototype.entries only sees this scope's own entries. Uncertainty
    // references and series aggregates are derived on demand, so not listed.
    return [...scope.entries()]
      .filter(([name, v]) => typeof v !== 'function' && !isHiddenName(name) && !aggs.get(name))
      .map(([name, v]) => {
        const sf = sigs.get(name) ?? EXACT
        const unc = this.total(uncs.get(name), v)
        const tex = this.valueTex(v, sf, unc, uncSfs.get(name), declared.get(name) === true)
        return { name, sf, tex: `${symbolTex(name)} = ${tex}` }
      })
  }
}
