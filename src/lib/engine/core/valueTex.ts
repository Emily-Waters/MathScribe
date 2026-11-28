/**
 * Values as the Calculator shows them: a number to its sig figs, in the
 * notation in effect (`:sci`, `:dec`); a quantity in its display unit; a value
 * with its uncertainty, rounded by the uncertainty convention; a tuple, in the
 * look a module gives it (a vector); and each as LaTeX. The notation and look
 * in effect are set for a while by whoever's showing something (inNotation,
 * inLook). (Typesetting an expression, the working, is the Calculator's.)
 */
import { EXACT, MAX_DIGITS, formatExact, formatSigFigs, formatWithUncertainty } from '../../maths/sigfigs.ts'
import { VALUE_THEN_UNIT, type Notation } from '../../syntax.ts'
import {
  exprTex, formatValue, isQuantity, isValueMatrix, magnitude, parse, valuesOf, type Quantity, type ValueMatrix,
} from '../../maths/library/index.ts'
import { isTuple } from './math.ts'
import type { EngineModule, TupleLook } from './module.ts'
import { AUTO_PRECISION, FIXED_UNCERTAINTY_SIG_FIGS, type CalcOptions } from './results.ts'
import { attachUnit, numberTex, unitTex } from './tex.ts'
import { stringTex } from './text.ts'
import { displayUnit, magnitudeOf } from './normalise.ts'
import { EXACT_DISPLAY_DIGITS, FIXED_FORMAT, FLOAT_NOISE, TINY } from './numbers.ts'

/** What showing values needs of the Calculator: its options (precision), and its modules (their looks and notation). */
export interface ValueTexHost {
  options(): CalcOptions
  modules(): readonly EngineModule[]
}

export class ValueTex {
  private readonly host: ValueTexHost
  /** Notation numbers are being formatted in right now (see inNotation). */
  notation: Notation | undefined
  /** The look tuples are being shown in right now (undefined: as a plain tuple, (…)); see inLook. */
  tupleLook: TupleLook | undefined
  /**
   * The sig figs of each value of a typed tuple, as typed (a vector, `<0.50, -9.81>` → 2, 3),
   * keyed by the value itself: a copy (`b = a`) shows the same, while anything
   * worked out from it is a new value, at the fewest sig figs of its inputs.
   */
  readonly typedSfs = new WeakMap<object, number[]>()

  constructor(host: ValueTexHost) {
    this.host = host
  }

  get autoSigFigs() {
    return this.host.options().precision === AUTO_PRECISION
  }

  /** How the maths library formats values without a sig-fig count (exact values, matrices). */
  get format() {
    const p = this.host.options().precision
    return { ...FIXED_FORMAT, precision: p === AUTO_PRECISION ? EXACT_DISPLAY_DIGITS : p }
  }

  /** Whether showing `value` at `sf` sig figs drops digits (ignoring floating-point noise). */
  isRounded(value: unknown, sf: number, forced = false): boolean {
    const p = this.split(value, sf, forced)
    if (!p) return false
    const shown = Number(p.num)
    return Number.isFinite(shown) && Math.abs(shown - p.x) > FLOAT_NOISE * Math.max(Math.abs(p.x), TINY)
  }

  /**
   * `x` to `sf` sig figs, in the current notation. `forced`: the sig figs were
   * declared (`m:3 = …`), so they apply even with a fixed sig-fig setting.
   */
  formatNumber(x: number, sf: number, forced = false): string {
    if ((this.autoSigFigs || forced) && Number.isFinite(sf)) return formatSigFigs(x, sf, this.notation)
    if (this.notation) return formatExact(x, this.format.precision, this.notation)
    return formatValue(x, this.format)
  }

  /** Run `fn` with numbers formatted in `notation` (undefined: the default). */
  inNotation<T>(notation: Notation | undefined, fn: () => T): T {
    const saved = this.notation
    this.notation = notation
    try {
      return fn()
    } finally {
      this.notation = saved
    }
  }

  /** Run `fn` with tuples shown in `look` (undefined: as plain tuples). */
  inLook<T>(look: TupleLook | undefined, fn: () => T): T {
    const saved = this.tupleLook
    this.tupleLook = look
    try {
      return fn()
    } finally {
      this.tupleLook = saved
    }
  }

  /** Split a value into its number (in display units), formatted number, and unit. */
  split(value: unknown, sf: number, forced = false): { x: number; num: string; unit?: string } | null {
    if (typeof value === 'number') return { x: value, num: this.formatNumber(value, sf, forced) }
    if (isQuantity(value)) {
      // Full precision first (the library picks the unit prefix), then round ourselves.
      const s = formatValue(displayUnit(value), { precision: MAX_DIGITS })
      const m = VALUE_THEN_UNIT.exec(s)
      if (!m) return null
      const x = Number(m[1])
      return { x, num: this.formatNumber(x, sf, forced), unit: m[2] }
    }
    return null
  }

  /** An uncertainty expressed in the same display unit as its value. */
  private inDisplayUnits(value: unknown, unc: unknown, x: number, unit?: string): number {
    if (!isQuantity(value)) return Math.abs(Number(unc))
    const si = magnitudeOf(value)
    if (si) return Math.abs((magnitudeOf(unc) * x) / si)
    try {
      return Math.abs(magnitude(unc as Quantity, unit ?? ''))
    } catch {
      return Math.abs(magnitudeOf(unc))
    }
  }

  /** Sig figs to quote an uncertainty with: as declared, else the convention (auto) or 2 (fixed). */
  private uncSigFigs(declared?: number): number | undefined {
    return declared ?? (this.autoSigFigs ? undefined : FIXED_UNCERTAINTY_SIG_FIGS)
  }

  /** Formatted pieces of `value ± unc`, rounded by the uncertainty convention. */
  uncertainParts(value: unknown, unc: unknown, uncSf?: number) {
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
  uncertaintyTex(unc: unknown, like?: unknown, uncSf?: number): string {
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

  valueTex(value: unknown, sf: number = EXACT, unc?: unknown, uncSf?: number, forced = false): string {
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
    if (typeof value === 'string') return stringTex(value, (text) => this.host.modules().reduce((t, m) => m.markupText(t), text))
    if (isTuple(value)) return this.tupleTex(value, sf, forced)
    if (isValueMatrix(value) || Array.isArray(value)) {
      try {
        return exprTex(parse(formatValue(value, this.format)))
      } catch {
        /* fall through */
      }
    }
    return `\\text{${formatValue(value, this.format)}}`
  }

  /**
   * A tuple as (1.0, 2.0, 3.0) m: each value at `sf` sig figs, with a unit
   * they all share written once after the bracket, or each with its own.
   */
  private tupleTex(tuple: ValueMatrix, sf: number, forced: boolean): string {
    const values = valuesOf(tuple) as unknown[]
    // A typed tuple shows each value as typed (unless sig figs were declared).
    const typed = forced ? undefined : this.typedSfs.get(tuple)
    return this.valuesTex(values, values.map((_, i) => ({ sf: typed?.[i] ?? sf, forced, notation: this.notation })), this.tupleLook)
  }

  /**
   * Values in a tuple's brackets, each at its own sig figs and notation (as
   * unpacked names can declare). In a module's `look`, as it draws it: a vector,
   * ⟨3.0, 4.0⟩ N, or with unit vectors, (3.0 î + 4.0 ĵ) N.
   */
  valuesTex(values: unknown[], shown: { sf: number; forced: boolean; notation?: Notation }[], look?: TupleLook): string {
    const parts = values.map((v, i) => this.inNotation(shown[i].notation, () => this.split(v, shown[i].sf, shown[i].forced)))
    const unit = parts[0]?.unit
    const shared = values.length > 0 && parts.every((p) => p && p.unit === unit)
    // Each value on its own; with a shared unit, the unit is written once instead.
    const each = values.map((v, i) => (shared
      ? numberTex(parts[i]!.num)
      : this.inNotation(shown[i].notation, () => this.valueTex(v, shown[i].sf, undefined, undefined, shown[i].forced))))
    const sharedUnit = shared && unit ? unitTex(unit) : ''
    // A tuple with a look is drawn by the module that gave it (a vector, ⟨3.0, 4.0⟩ N).
    if (look !== undefined) {
      for (const m of this.host.modules()) {
        const tex = m.tupleTex(each, sharedUnit, look)
        if (tex !== undefined) return tex
      }
    }
    return attachUnit(`\\left(${each.join(', ')}\\right)`, sharedUnit)
  }
}
