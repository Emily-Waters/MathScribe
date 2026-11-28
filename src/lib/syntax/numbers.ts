/**
 * How a number is written: as typed in a sheet (`2.50`, `-3e8`, `300.`), and as
 * JavaScript and the library write one back (`1.96e+4`). Its parts are named
 * here, and the patterns that count its figures or tidy its digits are built
 * from them (maths/sigfigs.ts, the outputs, imported data).
 */
import { inClass, lit, regex, src } from './patterns.ts'

// ---------------------------------------------------------------------------
// A number's parts
// ---------------------------------------------------------------------------

/** Between a number's whole part and its fraction: `2.50`. */
export const DECIMAL_POINT = '.'

/** Before a number's power of ten: `6.02e23` (typed `E` too; JavaScript writes `e`). */
export const EXPONENT_MARK = 'e'

/** A number's or a power's sign: `-2.5`, `1e+3`. */
export const SIGN = { plus: '+', minus: '-' } as const

/** The digit that pads a number: leading (`0.025`) and trailing (`2.50`) zeros. */
export const ZERO = '0'

/** The exponent's mark, either case, in a pattern. */
const EXPONENT = src`[${EXPONENT_MARK}${EXPONENT_MARK.toUpperCase()}]`

/** A sign, in a pattern. */
const SIGNS = src`[${inClass(SIGN.plus, SIGN.minus)}]`

// ---------------------------------------------------------------------------
// Numbers as typed
// ---------------------------------------------------------------------------

/** A number as typed: `2`, `2.`, `.5`, `2.50`, `6.02e23`. */
export const NUMBER = src`(?:\d+(?:${lit(DECIMAL_POINT)}\d*)?|${lit(DECIMAL_POINT)}\d+)(?:${EXPONENT}${SIGNS}?\d+)?`

/** A number with any sign before it: `-2.5`, `+3e8`, `0.1` (a setting's, a series' value read as it's typed). */
export const SIGNED_NUMBER = src`${SIGNS}?${NUMBER}`

/**
 * Digits and points, with any power of ten: a number as a bracketed value with
 * its uncertainty is picked out, `(2.0 pm 0.1)`, before mathjs reads it (and
 * says what's wrong with one like `1.2.3`). With a sign, LOOSE_SIGNED_NUMBER.
 */
export const LOOSE_NUMBER = src`[\d${inClass(DECIMAL_POINT)}]+(?:${EXPONENT}${SIGNS}?\d+)?`
export const LOOSE_SIGNED_NUMBER = src`${SIGNS}?${LOOSE_NUMBER}`

/** Exactly a number, sign and all. */
export const IS_SIGNED_NUMBER = regex(src`^${SIGNED_NUMBER}$`)

/** A number's sign, at its start. */
export const LEADING_SIGN = regex(src`^${SIGNS}`)

/** A minus sign at the start of some text, or of a number. */
export const LEADING_MINUS = regex(src`^${lit(SIGN.minus)}`)

/** A plus sign at the start of some text, or of a number. */
export const LEADING_PLUS = regex(src`^${lit(SIGN.plus)}`)

/** Its exponent's mark, either case: where a number's mantissa ends. */
export const EXPONENT_AT = regex(EXPONENT)

/** Anything that makes a number more than digits: a decimal point or an exponent. */
export const NOT_JUST_DIGITS = regex(src`[${inClass(DECIMAL_POINT)}${EXPONENT_MARK}${EXPONENT_MARK.toUpperCase()}]`)

/** Digits only: a whole number with no sign, `12`. */
export const IS_DIGITS = regex(src`^\d+$`)

/** A whole number ending in a 0 (not 0 itself), whose 0s count as typed in a range: `10`, `-200`. */
export const WHOLE_ENDING_IN_ZERO = regex(src`^${lit(SIGN.minus)}?[1-9]\d*${ZERO}$`)

/** A value as written with its unit after it: `9.81 m/s^2` (1: the number, 2: the unit). */
export const VALUE_THEN_UNIT = regex(src`^(\S+)\s+(.+)$`)

/** A number that starts with a digit, perhaps after a minus: `2.5`, `-3` (not `x`, not `(`). */
export const STARTS_WITH_DIGIT = regex(src`^${lit(SIGN.minus)}?\d`)

// ---------------------------------------------------------------------------
// Counting and tidying figures
// ---------------------------------------------------------------------------

/** A number's leading zeros, and its trailing ones. */
export const LEADING_ZEROS = regex(src`^${ZERO}+`)
export const TRAILING_ZEROS = regex(src`${ZERO}+$`)

/** A whole number whose trailing zeros might or might not count: `300`, `-1500`. */
export const AMBIGUOUS_ZEROS = regex(src`^${SIGNS}?\d*[1-9]${ZERO}+$`)

/** A power of ten that says nothing, as JavaScript writes it: the `e+0` of `2.5e+0`. */
export const ZERO_POWER = regex(src`${EXPONENT_MARK}${lit(SIGN.plus)}${ZERO}$`)

/** Zeros (and a point left alone) before a power of ten: the `.00` of `2.00e3`. */
export const ZEROS_BEFORE_POWER = regex(src`${lit(DECIMAL_POINT)}?${ZERO}+${EXPONENT_MARK}`)

/** Zeros (and a point left alone) at a number's end: the `.00` of `2.00`, the `0` of `2.50`. */
export const TRAILING_FRACTION_ZEROS = regex(src`${lit(DECIMAL_POINT)}?${ZERO}+$`)

/** A decimal point at a number's end: `300.`. */
export const TRAILING_POINT = regex(src`${lit(DECIMAL_POINT)}$`)

/** A number as JavaScript writes it in scientific notation (1: the mantissa, 2: the power): `1.235e+8`. */
export const SCIENTIFIC = regex(src`^(${lit(SIGN.minus)}?[\d${inClass(DECIMAL_POINT)}]+)${EXPONENT_MARK}(${SIGNS}?\d+)$`, 'i')
