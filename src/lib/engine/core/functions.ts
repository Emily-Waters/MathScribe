/** What's kept about the sheet's functions and constants. */
import { type Contributions } from '../../sheet/values.ts'
import { type Notation } from '../../syntax.ts'
import type { TupleLook } from './module.ts'
import type { ParameterDelta } from './propagation.ts'
import { type Variables } from './scope.ts'

/** What's kept about a function the sheet defines, `f(x) = …`, to show its working. */
export interface UserFunction {
  params: string[]
  /** Each parameter's cast unit (`m to kg` → 'kg'), if it has one. */
  casts: (string | undefined)[]
  /** What it works out, as typed: `a * b + 1`. */
  expression: string
  definedIn: Variables
  /** Defined with #multiline: every line that calls it is laid out one = per row. */
  multiline: boolean
  /** Sig figs declared for the result (`f(x):3 = …`), which every call's result has. */
  returnSf?: number
  /** Notation declared for the result (`f(x):sci = …`). */
  returnNotation?: Notation
  /** The look of a tuple it returns: declared (`f(x):ijk = …`), or from how its body is written (a vector typed in it). */
  returnLook?: TupleLook
  /** Unit declared for the result (`f(x):mol/L = …`), which every call's result is shown in. */
  returnUnit?: string
  /** Its parameters' uncertainties its body uses (`delta A`), which a call is given after its arguments. */
  deltas: readonly ParameterDelta[]
}

/** A constant defined in an `@constants { }` block. */
export interface CustomConstant {
  value: unknown
  /** Its sig figs were declared (`rho:2 = …`). */
  declared?: boolean
  /** Sig figs as typed (Infinity for an exact integer). */
  sf: number
  contributions: Contributions
  uncSf?: number
}

/** How deep to show working for functions that call functions. */
export const MAX_TRACE_DEPTH = 6
