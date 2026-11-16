/** User functions' bodies: statements, branches, and what's kept about a function. */
import { type Contributions } from '../../values.ts'
import { type LineCommand, type Notation } from '../../syntax.ts'
import type { TupleLook } from './module.ts'
import { type Variables } from './scope.ts'

/** Each kind of line in a function's body: `x = …`, `tuple(a, b) = …`, `return …`. */
export const STATEMENT_KIND = { assign: 'assign', unpack: 'unpack', return: 'return', branch: 'branch' } as const

/**
 * Where a body line is among the function's branches. A line under an `if` or
 * `else` runs only if that branch is taken (and the branches around it): its
 * guards. A branch line (`if`, `else if`, `else`) has an id, the chain it's part
 * of (the id of its `if`), and its condition (none for `else`); it's taken if
 * no earlier branch of its chain was and its condition holds.
 */
export interface Guarded {
  guards: number[]
  branch?: { id: number; chain: number; code?: math.EvalFunction }
}

/** Which body lines run, as a call goes through them in order. */
export class BranchRun {
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
export function holds(value: unknown, what: string): boolean {
  if (typeof value === 'boolean') return value
  throw new Error(`${what} isn't a condition: it should compare values, like v > 0 m/s.`)
}

/** What's needed to replay a multi-line function's body to show its working. */
export interface UserFunction {
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
  /** The look of a tuple it returns: declared (`f(x):ijk = …`), or from how its body is written (a vector typed in it). */
  returnLook?: TupleLook
  /** Unit declared for the result (`f(x):mol/L = …`), which every call's result is shown in. */
  returnUnit?: string
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
