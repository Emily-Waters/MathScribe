/**
 * Significant-figure helpers, following the usual textbook rules:
 *   - leading zeros never count; zeros between digits always count
 *   - trailing zeros count only when there is a decimal point (`2.50`, `300.`)
 *   - scientific notation counts the mantissa (`3.00e2` → 3)
 */

/** Sig figs of an exact number (a counting number or formula coefficient). */
export const EXACT = Infinity

/** Count the significant figures in a number as typed, e.g. "0.0250" → 3. */
export function countSigFigs(literal: string): number {
  const mantissa = literal.trim().replace(/^[+-]/, '').split(/[eE]/)[0]
  const hasPoint = mantissa.includes('.')
  const digits = mantissa.replace('.', '').replace(/^0+/, '')
  if (!digits) {
    // All zeros: "0" → 1, "0.00" → 2
    return Math.max(1, hasPoint ? mantissa.split('.')[1].length : 0)
  }
  return hasPoint ? digits.length : digits.replace(/0+$/, '').length
}

/** True for whole numbers like "300" whose trailing zeros are ambiguous. */
export function hasAmbiguousZeros(literal: string): boolean {
  return /^[+-]?\d*[1-9]0+$/.test(literal.trim())
}

/**
 * Decimal place of the last significant digit: 0 for units, -2 for hundredths,
 * 2 for hundreds. Exact values have no last place (-Infinity).
 */
export function lastPlace(x: number, sf: number): number {
  if (!Number.isFinite(sf) || !Number.isFinite(x) || x === 0) return -Infinity
  return Math.floor(Math.log10(Math.abs(x))) - sf + 1
}

/**
 * Sig figs a value has when its last significant digit is at `place`.
 * Zero or less means the value is smaller than its own uncertainty, as when
 * subtracting nearly equal measurements (12.52 − 12.5).
 */
export function sigFigsFromPlace(x: number, place: number): number {
  if (place === -Infinity) return EXACT
  if (!Number.isFinite(x) || x === 0) return 0
  return Math.floor(Math.log10(Math.abs(x))) - place + 1
}

/**
 * Format to exactly `sf` significant figures, keeping trailing zeros ("2.0").
 * When plain digits would misstate the precision, a trailing decimal point marks
 * zeros that count (19.62 at 2 s.f. → "20.", 90 → "90."), and where that can't
 * (19620 at 3 s.f.), scientific notation does: "1.96e+4".
 */
export function formatSigFigs(x: number, sf: number, notation?: Notation): string {
  const digits = Math.min(Math.max(Math.round(sf), 1), 15)
  // A zero's "sig figs" are its decimal places (see countSigFigs): 0.00 → 2 → "0.00".
  if (x === 0) return digits === 1 ? '0' : (0).toFixed(digits)
  if (!Number.isFinite(x)) return String(x)
  // (× 10⁰ goes without saying.)
  if (notation === 'sci') return x.toExponential(digits - 1).replace(/e\+0$/, '')
  if (notation === 'dec') return decimal(x, digits)
  const plain = x.toPrecision(digits)
  if (!/e/i.test(plain) && x !== 0 && countSigFigs(plain) !== digits) {
    // Trailing zeros that count, as typed: 90 to 2 sig figs is "90.", the same
    // notation as input (`300.` is 3 sig figs). Where a decimal point can't say it
    // (1500 to 3 sig figs), scientific notation does: 1.50e+3.
    if (!plain.includes('.') && countSigFigs(`${plain}.`) === digits) return `${plain}.`
    return x.toExponential(digits - 1)
  }
  return plain
}

/**
 * How a variable's numbers are written (`x:sci =`, `x:dec =`): always in
 * scientific notation, or always as plain decimal digits. Unset, MathScribe
 * picks: plain digits, with scientific notation for very large or small values
 * and where plain digits can't show the precision.
 */
export type Notation = 'sci' | 'dec'

/**
 * `x` to `digits` sig figs as plain decimal digits, however large or small:
 * 0.0000123, 19600 (where trailing zeros can't be marked as counting), 90.
 * Beyond what plain digits can reasonably show (over 1e21, or more than 100
 * decimal places), scientific notation.
 */
function decimal(x: number, digits: number): string {
  const rounded = Number(x.toPrecision(digits))
  const place = Math.floor(Math.log10(Math.abs(rounded))) - digits + 1
  if (Math.abs(rounded) >= 1e21 || -place > 100) return x.toExponential(digits - 1)
  const s = rounded.toFixed(Math.max(0, -place))
  if (!s.includes('.') && countSigFigs(s) !== digits && countSigFigs(`${s}.`) === digits) return `${s}.`
  return s
}

/**
 * A number shown at full precision (an exact value), up to `digits` digits, in
 * the given notation; trailing zeros dropped, since they don't mean anything here.
 */
export function formatExact(x: number, digits: number, notation: Notation): string {
  if (x === 0 || !Number.isFinite(x)) return String(x)
  if (notation === 'sci') {
    return x.toExponential(Math.max(digits - 1, 0)).replace(/\.?0+e/, 'e').replace(/e\+0$/, '')
  }
  const s = decimal(x, digits)
  if (/e/.test(s)) return s.replace(/\.?0+e/, 'e')
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s.replace(/\.$/, '')
}

// ---------------------------------------------------------------------------
// Values with an uncertainty
//
// Lab convention: quote the uncertainty to 1 significant figure, or 2 when it
// starts with a 1 (0.14, not 0.1), and round the value to the same decimal place.
// ---------------------------------------------------------------------------

/** Significant figures used to quote an uncertainty: 1, or 2 if it starts with a 1. */
export function uncertaintySigFigs(dx: number): number {
  if (!(dx > 0) || !Number.isFinite(dx)) return 1
  return dx.toExponential().startsWith('1') ? 2 : 1
}

/**
 * Format `x ± dx` by the convention above, or with the uncertainty to `uncSf`
 * significant figures if given. Very large or small values share a power of
 * ten: (1.96 ± 0.03) × 10^4. `sf` is the number of digits shown for x.
 */
export function formatWithUncertainty(
  x: number,
  dx: number,
  uncSf: number = uncertaintySigFigs(dx),
  notation?: Notation,
): { num: string; unc: string; exp?: number; sf: number } {
  // Decimal place of the uncertainty's last digit, after rounding: 0.96 → 1 (place 0).
  const place = Math.floor(Math.log10(Number(dx.toPrecision(uncSf)))) - (uncSf - 1)
  const round = (v: number) => (place < 0
    ? Math.round(v * 10 ** -place) / 10 ** -place
    : Math.round(v / 10 ** place) * 10 ** place)
  const xr = round(x)
  const dr = round(dx)
  const mag = Math.floor(Math.log10(Math.abs(xr) || dr))
  const sf = Math.max(1, mag - place + 1)
  // A shared power of ten: for very large or small values, or always (except
  // 10⁰) in scientific notation; never in decimal notation.
  const shareExp = notation === 'sci' ? mag !== 0
    : notation === 'dec' ? -place > 100 || mag > 20
      : mag >= 5 || mag <= -4
  if (shareExp) {
    const decimals = Math.max(0, mag - place)
    return { num: (xr / 10 ** mag).toFixed(decimals), unc: (dr / 10 ** mag).toFixed(decimals), exp: mag, sf }
  }
  const decimals = Math.max(0, -place)
  return { num: xr.toFixed(decimals), unc: dr.toFixed(decimals), sf }
}

/**
 * Whether a number as typed is a measurement. Integers without a unit are
 * exact (counts, and coefficients like the 2 in `2 * a`); a decimal point or
 * exponent marks a measured value. Numbers with a unit are always measured.
 */
export function isMeasuredLiteral(literal: string): boolean {
  return /[.eE]/.test(literal)
}
