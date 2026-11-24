/** Numerical settings (digits shown, tolerances) and function parameters. */
import { NAME, KEYWORD } from '../../syntax.ts'
import { convert, formatValue, isQuantity, quantity } from '../../maths/library/index.ts'

// ---------------------------------------------------------------------------
// Numerical settings: digits shown, and the tolerances comparisons allow
// ---------------------------------------------------------------------------

/** Significant digits a value is quoted with in a message or a unit's description. */
export const MESSAGE_DIGITS = 6

/** Fewer, for a value mentioned in passing inside a sentence. */
export const BRIEF_DIGITS = 4

/** Digits for a value that has no sig-fig count (an exact value, a matrix), with sig figs on Auto. */
export const EXACT_DISPLAY_DIGITS = 6

/** Plain digits from 10⁻³ up to 10⁶; scientific notation outside that (the library's format bounds). */
export const FIXED_FORMAT = { lowerExp: -3, upperExp: 6 }

/** Two values this close, relative to their size, are the same value. */
export const SAME_VALUE_TOLERANCE = 1e-9

/** A relative difference this small is floating-point noise, not rounding. */
export const FLOAT_NOISE = 1e-12

/** Keeps a relative tolerance meaningful (and finite) for values at or near zero. */
export const TINY = 1e-300

/** `… to percent` and `pm 5%`: a fraction as a percentage. */
export const PERCENT_SCALE = 100

/**
 * Remember how a number was typed, keyed by its value. Numbers typed with extra
 * precision (1.00, 2.0e3) are already kept as lit("1.00") calls, so they mustn't
 * replace a plain `1` on the same line, which would then count as measured.
 */
export function addLiteral(literals: Map<number, string>, text: string): void {
  const value = Number(text)
  if (String(value) === text || !literals.has(value)) literals.set(value, text)
}

/** A function parameter: `m`, or `m to kg` (cast to kg on the way in) (1: the name, 2: the unit). */
export const PARAMETER = new RegExp(String.raw`^(${NAME})(?:\s+${KEYWORD.to}\s+(\S+))?$`)

/** A function parameter's name and unit (null if it isn't one). */
export function parseParam(spec: string): { name: string; unit?: string } | null {
  const m = PARAMETER.exec(spec.trim())
  return m ? { name: m[1], unit: m[2] } : null
}

/** Whether the maths library reads some text as a unit. */
export function isValidUnit(text: string): boolean {
  try {
    return isQuantity(quantity(text))
  } catch {
    return false
  }
}

/** A cast parameter's argument, converted to its unit; errors say what didn't fit. */
export function castArgument(param: string, unit: string | undefined, value: unknown): unknown {
  if (unit === undefined) return value
  if (!isQuantity(value)) {
    throw new Error(`${param} is cast to ${unit}, so it needs a value with a unit, `
      + `but was given ${formatValue(value, { precision: MESSAGE_DIGITS })}.`)
  }
  try {
    return convert(value, unit)
  } catch {
    throw new Error(`${param} is cast to ${unit}, but was given `
      + `${formatValue(value, { precision: MESSAGE_DIGITS })}, which can't be converted to ${unit}.`)
  }
}
