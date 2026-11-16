/**
 * The value model: what kinds of value a sheet works with, and the Variable
 * that holds one under a name with everything kept about it.
 *
 *   Variable           a name's value, its sig figs, uncertainty, display settings, …
 *   └─ value, one of:
 *      quantity        a number, with or without a unit: 2.0 kg, 0.5, 3.00e8 m/s
 *      tuple           values in order: tuple(1.0, 2.0) m (a vector is a tuple
 *                      with a look of its own: <3.0, 4.0> N)
 *      condition       true or false: x > 2
 *      callable        a function: f(x) = x^2, def g(a)
 *
 * Every variable is stored the same way, whatever its value's kind, and asked
 * the same questions; what's particular to a kind is decided from its kind.
 */
import { isMatrix, isUnit, type MathNode, type Matrix } from 'mathjs'
import type { Notation } from './syntax.ts'
import { SERIES_STAT } from './syntax.ts'

// ---------------------------------------------------------------------------
// Kinds of value
// ---------------------------------------------------------------------------

/** Each kind of value a variable can hold. */
export const VALUE_KIND = {
  quantity: 'quantity',
  tuple: 'tuple',
  condition: 'condition',
  callable: 'callable',
} as const
export type ValueKind = (typeof VALUE_KIND)[keyof typeof VALUE_KIND]

/** What kind of value something is (a vector is a tuple with a look: see Variable.look). */
export function valueKind(value: unknown): ValueKind {
  if (typeof value === 'function') return VALUE_KIND.callable
  if (typeof value === 'boolean') return VALUE_KIND.condition
  if (isMatrix(value as Matrix)) return VALUE_KIND.tuple
  return VALUE_KIND.quantity
}

/** Whether a value is a quantity with a unit (not a plain number). */
export const hasUnit = (value: unknown) => isUnit(value)

// ---------------------------------------------------------------------------
// What's kept about a value
// ---------------------------------------------------------------------------

/**
 * A value's uncertainty, broken down by where it came from: each `pm`
 * declaration is a source, mapped to the signed amount it moves this value.
 * Keeping sources separate means correlated quantities combine correctly,
 * e.g. F = m * a, then F / m doesn't count m's uncertainty twice.
 */
export type Contributions = Map<number, unknown>

/** What a series name works out: the sum (a name on its own), or one of the suffixed names' statistics. */
export const AGGREGATE_KIND = { sum: 'sum', ...SERIES_STAT } as const
export type AggregateKind = (typeof AGGREGATE_KIND)[keyof typeof AGGREGATE_KIND]

/** A name worked out from a series, and the variables it uses. */
export interface Aggregate {
  kind: AggregateKind
  base: string
  /** Member variable names, in index order. */
  members: string[]
}

/** Everything kept about a variable, as it's given when the variable is stored. */
export interface VariableFields {
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
  /** The look of the tuple it holds, if a module gives it one (a vector: see TupleLook). */
  look?: string
  /** How to show it in substitutions, if not as its value (`theta = pi/4` as π/4). */
  shown?: string
  /** Its defining expression, for ΔX working. */
  def?: MathNode
  /** The series statistic it stands for, if it's one (t_avg). */
  agg?: Aggregate
  /** Its display name, as LaTeX (`n_Na:"Moles of {Na^+}"`), shown instead of its name. */
  label?: string
  /** How its name is typeset, if not by the usual rules (not a display name): a reaction's member, r.H2O, as r with H₂O below. */
  symbol?: string
}

/** A variable: a value, and everything kept about it. One record, replaced whole when the name is assigned again. */
export class Variable implements VariableFields {
  declare readonly value: unknown
  declare readonly sf: number
  declare readonly contributions?: Contributions
  declare readonly uncSf?: number
  declare readonly declared?: boolean
  declare readonly notation?: Notation
  declare readonly look?: string
  declare readonly shown?: string
  declare readonly def?: MathNode
  declare readonly agg?: Aggregate
  declare readonly label?: string
  declare readonly symbol?: string

  constructor(fields: VariableFields) {
    Object.assign(this, fields)
  }

  /** The kind of value it holds. (A vector is a tuple with a look: see look.) */
  get kind(): ValueKind {
    return valueKind(this.value)
  }

  /** Whether it carries an uncertainty. */
  get uncertain(): boolean {
    return !!this.contributions?.size
  }
}

/** A variable as the sheet lists it (for the editor): its name, value as LaTeX, and sig figs. */
export interface VariableSummary {
  name: string
  tex: string
  /** Significant figures (Infinity for exact values). */
  sf: number
}
