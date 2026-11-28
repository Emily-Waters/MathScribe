/**
 * The sheet's constants, as the Calculator uses them: its own (`@constants { }`),
 * the sheet-wide precision and unit of any (`@c:4`, `@a_0:3 to angstrom`), and
 * each `@name` in a line written out as a hidden variable holding the
 * constant at the precision asked for. (The built-in constants themselves are
 * in constants.ts and the `@` tree, builtins.ts.)
 */
import { convert, formatValue, isQuantity, quantity } from '../../maths/library/index.ts'
import { MAX_DIGITS, countSigFigs } from '../../maths/sigfigs.ts'
import type { VariableFields } from '../../sheet/values.ts'
import { DEFAULT_CONSTANT_SIG_FIGS, isNamespaceConstant, suggestConstant, type BuiltinConstant, type NamespaceConstant } from '../../constants.ts'
import { builtinConstant, builtinConstantKeys } from '../../builtins.ts'
import { CONSTANTS_BLOCK, CONSTANT_WRITTEN, EXACT_SETTING, SIGIL, VALUE_THEN_UNIT, type Precision } from '../../syntax.ts'
import { constantKey, constantRefName, typedConstant } from '../../sheet/names.ts'
import { TOKEN_KIND } from '../../tree/nodes.ts'
import { lexExpression } from '../../tree/lexer.ts'
import { lineTokens } from './memberAccess.ts'
import { expandNamespaceCalls } from './builtinCalls.ts'
import type { CustomConstant } from './functions.ts'

/** What the constants need of the Calculator they're the sheet's of. */
export interface ConstantsHost {
  /** Keep a value as a (hidden) variable. */
  store(name: string, fields: VariableFields): void
  /** A built-in constant's value as the modules give it (a species' molar mass, with its species). */
  constantValue(value: unknown, builtin: BuiltinConstant | NamespaceConstant | undefined): unknown
}

/** A number or quantity rounded to `digits` sig figs, in its own display unit. */
export function roundTo(value: unknown, digits: number): unknown {
  if (typeof value === 'number') return Number(value.toPrecision(digits))
  if (!isQuantity(value)) return value
  const m = VALUE_THEN_UNIT.exec(formatValue(value, { precision: MAX_DIGITS }))
  return m ? convert(quantity(Number(Number(m[1]).toPrecision(digits)), m[2]), m[2]) : value
}

export class SheetConstants {
  private readonly host: ConstantsHost
  /** The sheet's own constants, from `@constants { }`, by name. */
  private readonly custom = new Map<string, CustomConstant>()
  /** Sig figs for every `@name` in the sheet that doesn't give its own (`@c:4` on a line of its own). */
  private readonly precision = new Map<string, Precision>()
  /** The unit every `@name` in the sheet is shown in (`@a_0:3 to angstrom`). */
  private readonly unit = new Map<string, string>()

  constructor(host: ConstantsHost) {
    this.host = host
  }

  /** Use `digits` sig figs for every `@name` in the sheet that doesn't give its own. */
  declarePrecision(name: string, digits: Precision): void {
    this.precision.set(name, digits)
  }

  /** Show every `@name` in the sheet in `unit` (from a line like `@a_0:3 to angstrom`). */
  declareUnit(name: string, unit: string): void {
    this.unit.set(name, unit)
  }

  /** Keep one of the sheet's own constants, worked out from its `@constants { }` line. */
  define(name: string, constant: CustomConstant): void {
    this.custom.set(name, constant)
  }

  /**
   * A line with `@name`, `@name:n` and `@name:exact` written as hidden variables
   * holding the constant rounded to that many sig figs. Built-ins default to 3
   * sig figs; the sheet's own constants to the precision they were written with.
   * `:exact` gives full precision and doesn't limit sig figs.
   */
  expand(line: string): { text: string; error?: string } {
    // `@chem.mm({H2O})` is a sum of `@chem.mm.H`s and `@chem.mm.O`s, worked out below.
    const calls = expandNamespaceCalls(line)
    if (calls.error) return calls
    let error: string | undefined
    /** A constant as written, `@c:4` (its name as typed, and its precision if it has one), as the hidden variable that holds it. */
    const use = (match: string, typed: string, spec?: string): string => {
      // `@chem.mm.Na` is chem__mm__Na inside (with its first dot read already, or not).
      const name = constantKey(typed)
      const custom = this.custom.get(name)
      const builtin = builtinConstant(name)
      if (!custom && !builtin) {
        const known = [...builtinConstantKeys(), ...this.custom.keys()]
        const guess = suggestConstant(name, known)
        error ??= `Unknown constant ${SIGIL}${typedConstant(name)}.`
          + (guess ? ` Did you mean ${SIGIL}${typedConstant(guess)}?` : ` Define it in an ${SIGIL}${CONSTANTS_BLOCK} { } block.`)
        return match
      }
      // Precedence: this use's own :n, then the sheet's declaration, then the default.
      // A namespace's constant, `@chem.mm.Na`, has the digits it's written with (22.990), unless asked for others.
      const writtenSf = builtin && isNamespaceConstant(builtin) ? countSigFigs(builtin.written) : undefined
      const digits: Precision = spec === EXACT_SETTING
        ? EXACT_SETTING
        : spec !== undefined
          ? Number(spec)
          : this.precision.get(name) ?? (custom ? custom.sf : writtenSf ?? DEFAULT_CONSTANT_SIG_FIGS)
      if (digits === 0) {
        error ??= `${SIGIL}${typedConstant(name)}:0 isn't valid; use at least 1 sig fig, or :exact.`
        return match
      }
      // Built-ins stay in their own unit (1.602e-19 C, not 160.2 zC).
      let full = custom
        ? custom.value
        : builtin!.unit ? convert(quantity(builtin!.value, builtin!.unit), builtin!.unit) : builtin!.value
      // A sheet-wide `@name to unit` converts before rounding, so `@a_0:3 to angstrom` is 0.529 Å.
      // (If the unit doesn't fit, the declaration line itself reports the error.)
      const unit = this.unit.get(name)
      if (unit && isQuantity(full)) {
        try {
          full = convert(full, unit)
        } catch { /* reported on the declaration line */ }
      }
      const exact = digits === EXACT_SETTING || !Number.isFinite(digits)
      const hidden = constantRefName(name, exact ? EXACT_SETTING : digits)
      // `:exact` shows every digit of the value; that many sig figs is more than any
      // measurement has, so it never limits a result.
      const allDigits = custom ? custom.sf : writtenSf ?? countSigFigs(String(builtin!.value))
      this.host.store(hidden, {
        // (A built-in constant of a species, @chem.mm.Na, is given it once rounded.)
        value: this.host.constantValue(exact ? full : roundTo(full, digits), builtin),
        sf: exact ? allDigits : digits,
        contributions: custom?.contributions,
        uncSf: custom?.uncSf,
        // An explicit precision (`@c:4`, a sheet-wide `@c:4` line, `rho:2 = …`) beats the global setting.
        declared: spec !== undefined || this.precision.has(name) || custom?.declared || undefined,
      })
      return hidden
    }
    // Each constant is a built-in's token that isn't called (`@chem.mm(…)` is a call), as the lexer reads it
    // (tree/lexer.ts): not one in a label's quotes, and with its precision, `@c:4`.
    const text = lineTokens(lexExpression(calls.text)).map(({ token, callee }) => {
      if (token.t !== TOKEN_KIND.builtin || callee) return token.text
      const written = CONSTANT_WRITTEN.exec(token.text)?.groups
      return written ? use(token.text, written.name, written.precision) : token.text
    }).join('')
    return { text, error }
  }
}
