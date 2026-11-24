/**
 * The maths library's adapter, as mathjs: the only file that imports mathjs.
 * Everything else uses the interface (index.ts), MathScribe's own names for
 * what's here, so changing library means writing this file again.
 *
 * What an expression is (an `Expr`: a call's `fn` and `args`, a symbol's
 * `name`, an operator's `fn` and `op`) is mathjs's node's shape, kept as
 * MathScribe's contract: another library would be read into that shape here.
 *
 * (While the code moves behind the interface, the engine's math.ts reaches the
 * instance, `math`, directly: see "Maths library behind one interface" in TODO.md.)
 */
import {
  all, create, isAssignmentNode, isConditionalNode, isConstantNode, isFunctionAssignmentNode, isFunctionNode, isMatrix,
  isOperatorNode, isParenthesisNode, isRelationalNode, isSymbolNode, isUnit,
  type AssignmentNode, type ConditionalNode, type ConstantNode, type EvalFunction, type FormatOptions, type FunctionAssignmentNode,
  type FunctionNode, type MathNode, type MathType, type Matrix, type OperatorNode, type ParenthesisNode,
  type SymbolNode, type Unit,
} from 'mathjs'
import { words } from '../../syntax/patterns.ts'

/** The library's instance: the one every sheet works with, so units and functions added to it work everywhere. */
export const math = create(all)

// ---------------------------------------------------------------------------
// MathScribe's names for the library's kinds
// ---------------------------------------------------------------------------

/** Anything an expression gives: a number, a quantity, a tuple, text. */
export type Value = MathType
/** A number with a unit: `9.81 m/s^2`. */
export type Quantity = Unit
/** A matrix (a one-dimensional one is a tuple: isTuple). */
export type ValueMatrix = Matrix
/** A parsed expression. */
export type Expr = MathNode
/** A call: `sqrt(x)`, its `fn` (with its `name`) and `args`. */
export type CallExpr = FunctionNode
/** A name: `x`, its `name`. */
export type SymbolExpr = SymbolNode
/** An operator and what it works on: `a * b`, its `fn` (OP), `op` (OP_SYMBOL) and `args`. */
export type OperatorExpr = OperatorNode
/** A number written in it: its `value`. */
export type ConstantExpr = ConstantNode
/** Brackets around an expression: its `content`. */
export type ParenExpr = ParenthesisNode
/** `x = …`: its `name` and `value`. */
export type AssignExpr = AssignmentNode
/** `f(x) = …`: its `name`, `params` and `expr`. */
export type FunctionAssignExpr = FunctionAssignmentNode
/** `c ? a : b`: its `condition`, `trueExpr` and `falseExpr`. */
export type ConditionalExpr = ConditionalNode
/** An expression made ready to evaluate, again and again: `evaluate(scope)`. */
export type CompiledExpr = EvalFunction

// ---------------------------------------------------------------------------
// What each is
// ---------------------------------------------------------------------------

export const isCall = isFunctionNode
export const isSymbol = isSymbolNode
export const isOperator = isOperatorNode
export const isConstant = isConstantNode
export const isParen = isParenthesisNode
export const isAssign = isAssignmentNode
export const isFunctionAssign = isFunctionAssignmentNode
export const isConditional = isConditionalNode
/** A chain of comparisons: `a < b <= c`. */
export const isComparisonChain = isRelationalNode
export const isQuantity = isUnit
export const isValueMatrix = isMatrix

// ---------------------------------------------------------------------------
// The library's names for what MathScribe works with
// ---------------------------------------------------------------------------

/** Each operator's name in the library: an OperatorExpr's `fn` (`2 * x` is `multiply`). */
export const OP = {
  add: 'add',
  subtract: 'subtract',
  multiply: 'multiply',
  divide: 'divide',
  pow: 'pow',
  unaryMinus: 'unaryMinus',
  unaryPlus: 'unaryPlus',
  /** A conversion, `2 m to cm`. */
  to: 'to',
} as const
export type Op = (typeof OP)[keyof typeof OP]

/** The library's names for comparisons: `<`, `<=`, `>`, `>=`, `==`, `!=`. */
export const COMPARISONS: ReadonlySet<string> = new Set(['smaller', 'smallerEq', 'larger', 'largerEq', 'equal', 'unequal'])

/** The symbol each is written with (an OperatorExpr needs both, and the library's types check they match). */
export const OP_SYMBOL = {
  add: '+',
  subtract: '-',
  multiply: '*',
  divide: '/',
  pow: '^',
  unaryMinus: '-',
  unaryPlus: '+',
  to: 'to',
} as const satisfies Record<Op, string>

/**
 * Functions the engine calls by name in the text it gives the library (a
 * CallExpr's `fn.name`): `9.81 m/s^2` is read as 9.81 * unit("m/s^2").
 */
export const FN = {
  unit: 'unit',
  /** A number kept as typed, so 2.00 keeps its sig figs: lit("2.00") (the engine adds it). */
  literal: 'lit',
  /** The library's own functions that @solve(…) undoes, and the engine treats specially. */
  sqrt: 'sqrt',
  cbrt: 'cbrt',
  exp: 'exp',
  log: 'log',
  log10: 'log10',
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  asin: 'asin',
  acos: 'acos',
  atan: 'atan',
  abs: 'abs',
} as const

/** The library's built-in constants the engine uses by name. */
export const MATH_CONSTANT = { pi: 'pi', e: 'e' } as const

/** The library's other word for a conversion, besides `to`: `2 m in cm`. */
export const LIBRARY_IN = 'in'

/** Units the engine works with by name. */
export const UNIT = {
  /** Angles are worked out in radians. */
  radian: 'rad',
  mole: 'mol',
  gram: 'g',
  litre: 'L',
  /** Molarity, mol/L: made by the engine (the library doesn't have it). */
  molar: 'M',
} as const

/** The library's names for the base dimensions the engine reads. */
export const BASE_DIMENSION = { mass: 'MASS', amount: 'AMOUNT_OF_SUBSTANCE' } as const

/** Units with a look of their own, as LaTeX and as plain text (others are their name, upright). */
export const UNIT_LOOKS: Readonly<Record<string, { tex: string; text: string }>> = {
  deg: { tex: '^{\\circ}', text: '°' },
  ohm: { tex: '\\Omega', text: 'Ω' },
  angstrom: { tex: '\\text{\\AA}', text: 'Å' },
  angstroms: { tex: '\\text{\\AA}', text: 'Å' },
}

// ---------------------------------------------------------------------------
// Values: quantities, tuples and arithmetic
// ---------------------------------------------------------------------------

/** A one-dimensional matrix: a tuple like (x, y, z). */
export const isTuple = (v: unknown): v is ValueMatrix => isMatrix(v) && (v as Matrix).size().length === 1

/** A quantity: a number in a unit, `quantity(9.81, 'm/s^2')`, or a unit's text alone, `quantity('m/s^2')` (one of it). */
export function quantity(value: number | string, unit?: string): Quantity {
  return unit === undefined ? math.unit(value as string) : math.unit(value as number, unit)
}

/** A quantity's number in a unit (`magnitude(q, 'cm')`), or in its own (no unit given; '' for a unitless one). */
export const magnitude = (q: Quantity, unit?: string): number => q.toNumber(unit)

/** A quantity's number in its unit's base, the SI units its dimension is made of (null if it has none). */
export const baseMagnitude = (q: Quantity): number | null => q.value

/** A quantity in another unit of its kind, by its text or as another quantity's. */
export const convert = (q: Quantity, unit: string | Quantity): Quantity => q.to(unit as string)

/** A quantity's unit, as text: `m/s^2`. */
export const unitText = (q: Quantity): string => q.formatUnits()

/** Whether two quantities are of one kind (a length and a length), whatever their units. */
export const sameDimension = (a: Quantity, b: Quantity): boolean => a.equalBase(b)

/**
 * One unit of a quantity's, with its power: `m` and `s`, -2, of m/s^2; its
 * prefix (`k` of km, '' for none); `offset`: one with a zero of its own (°C).
 */
export interface UnitPart {
  readonly name: string
  readonly prefix: string
  readonly power: number
  readonly offset: boolean
}

/** A quantity's units, each with its power. */
export const unitParts = (q: Quantity): UnitPart[] => q.units.map((p) => ({
  name: p.unit.name,
  // (mathjs's types call `prefix` a string; at runtime it's a { name } object.)
  prefix: (p.prefix as unknown as { name?: string } | undefined)?.name ?? '',
  power: p.power,
  offset: !!p.unit.offset,
}))

/** A copy of a quantity with another number in its unit's base (baseMagnitude). */
export function withBaseMagnitude(q: Quantity, base: number): Quantity {
  const u = q.clone()
  u.value = base
  return u
}

/** A quantity in SI units. */
export const inSI = (q: Quantity): Quantity => q.toSI()

/** A copy of a quantity, to change without changing it. */
export const copyQuantity = (q: Quantity): Quantity => q.clone()

/** Whether a quantity keeps the prefix it has (5.0 mm stays in mm), rather than the library choosing one. */
export const hasFixedPrefix = (q: Quantity): boolean => q.fixPrefix

/** Keep a quantity's prefix as it is, from now on: this quantity, not a copy. */
export function fixPrefix(q: Quantity): void {
  q.fixPrefix = true
}

/** A copy of a quantity that keeps the prefix it has. */
export function withFixedPrefix(q: Quantity): Quantity {
  const u = q.clone()
  u.fixPrefix = true
  return u
}

/** Keep a quantity's units as they're given, from now on (mol EDTA stays so, not simplified): this quantity, not a copy. */
export function keepUnitsAsGiven(q: Quantity): Quantity {
  q.skipAutomaticSimplification = true
  return q
}

/** The prefix the library would choose for a quantity's value (k for 1500 m), if any. */
export const bestPrefix = (q: Quantity): string | undefined =>
  (q.clone() as unknown as { _bestPrefix?: () => { name: string } | undefined })._bestPrefix?.()?.name

/** Every unit the library knows, by name. */
export const unitNames = (): string[] => Object.keys(math.Unit.UNITS)

/** Whether a unit's name is one the library knows without a number (a unit of its own, `m`, not `mm`'s prefix). */
export const isValuelessUnit = (name: string): boolean => math.Unit.isValuelessUnit(name)

/** How a value is written as text: its significant digits, its notation. */
export type ValueFormat = FormatOptions

/** A value as text, `9.81 m / s^2`, as the library writes it. */
export const formatValue = (v: unknown, format?: ValueFormat | number): string => math.format(v as MathType, format as FormatOptions)

/** A tuple of values. */
export const tupleOf = (values: readonly Value[]): ValueMatrix => math.matrix(values as never)

/** A matrix's values, in order. */
export const valuesOf = (m: ValueMatrix): Value[] => m.toArray() as Value[]

/** A matrix with each value changed. */
export const mapValues = (m: ValueMatrix, fn: (v: Value) => Value): ValueMatrix => math.map(m, fn as never) as ValueMatrix

export const add = (a: Value, b: Value): Value => math.add(a as never, b as never) as Value
export const subtract = (a: Value, b: Value): Value => math.subtract(a as never, b as never) as Value
export const multiply = (a: Value, b: Value): Value => math.multiply(a as never, b as never) as Value
export const divide = (a: Value, b: Value): Value => math.divide(a as never, b as never) as Value
export const abs = (v: Value): Value => math.abs(v as never) as Value
export const sqrt = (v: Value): Value => math.sqrt(v as never) as Value
export const isZero = (v: Value): boolean => math.isZero(v as never) as boolean
export const larger = (a: Value, b: Value): boolean => math.larger(a as never, b as never) as boolean
export const smaller = (a: Value, b: Value): boolean => math.smaller(a as never, b as never) as boolean

// ---------------------------------------------------------------------------
// Adding to the library: units and functions
// ---------------------------------------------------------------------------

/** A function as the library holds it: what it does, and how it's written in LaTeX, if it says. */
export type LibraryFunction = ((...args: never[]) => unknown) & { toTex?: unknown }

/** The library's function of a name, as it is now (to wrap it, or call it as it was). */
export const libraryFunction = (name: string): LibraryFunction => math[name as keyof typeof math] as unknown as LibraryFunction

/** Whether the library has a function of a name (`sqrt`), its own or one added to it. */
export const isLibraryFunction = (name: string): boolean => typeof (math as unknown as Record<string, unknown>)[name] === 'function'

/** Add functions to the library, by name; `replace`: in place of its own of those names. */
export function defineFunctions(functions: Readonly<Record<string, unknown>>, replace = false): void {
  math.import(functions as never, replace ? { override: true } : {})
}

/** Add a unit to the library: its name, what it is in others (`1 mol/L`), and whether prefixes go before it (mM). */
export function defineUnit(name: string, definition: string, prefixes: boolean): void {
  math.createUnit(name, { definition, prefixes: prefixes ? 'short' : 'none' })
}

// ---------------------------------------------------------------------------
// What went wrong, as MathScribe reads it
// ---------------------------------------------------------------------------

/** Each kind of problem the library reports that MathScribe says something of its own about. */
export const MATHS_ERROR = words({
  /** A name there's nothing of: `x` with no value. */
  undefinedName: 'undefinedName',
  /** A call to a function there's none of: `table(t)`. */
  undefinedFunction: 'undefinedFunction',
  /** Values in different units added, subtracted or compared (or one with a unit and one without). */
  unitsDiffer: 'unitsDiffer',
  /** A value converted to a unit of another kind: `2 m to s` (`to`: the unit asked for; `from`: the value's, '' for none). */
  cannotConvert: 'cannotConvert',
  /** Anything else: its message, as the library says it. */
  other: 'other',
})

/** A problem the library reported, by kind, with what MathScribe needs to say of it. */
export type MathsError =
  | { readonly kind: typeof MATHS_ERROR.undefinedName; readonly name: string }
  | { readonly kind: typeof MATHS_ERROR.undefinedFunction; readonly name: string }
  | { readonly kind: typeof MATHS_ERROR.unitsDiffer }
  | { readonly kind: typeof MATHS_ERROR.cannotConvert; readonly to: string; readonly from: string }
  | { readonly kind: typeof MATHS_ERROR.other; readonly message: string }

/** mathjs's wording of each (its messages are the only way it says which). */
const MATHJS_SAYS = {
  undefinedName: /^Undefined symbol (\S+)$/,
  undefinedFunction: /^Undefined function (\S+)$/,
  unitsDiffer: /^Units do not match$/,
  cannotConvert: /^Units do not match \('(.+)' != '[-+\d.e]+\s*(.*)'\)$/,
} as const

/**
 * A problem the library reported, by its kind: from the error it threw, or a
 * message that is (or was) its message as it stands, whose names MathScribe may
 * have written as the sheet does already (`Undefined symbol p.slope`).
 */
export function mathsError(problem: unknown): MathsError {
  const message = problem instanceof Error ? problem.message : String(problem)
  const name = MATHJS_SAYS.undefinedName.exec(message)?.[1]
  if (name !== undefined) return { kind: MATHS_ERROR.undefinedName, name }
  const fn = MATHJS_SAYS.undefinedFunction.exec(message)?.[1]
  if (fn !== undefined) return { kind: MATHS_ERROR.undefinedFunction, name: fn }
  if (MATHJS_SAYS.unitsDiffer.test(message)) return { kind: MATHS_ERROR.unitsDiffer }
  const conversion = MATHJS_SAYS.cannotConvert.exec(message)
  if (conversion) return { kind: MATHS_ERROR.cannotConvert, to: conversion[1], from: conversion[2] }
  return { kind: MATHS_ERROR.other, message }
}

/** Whether an expression is one of these operators: `isOp(n, OP.add, OP.subtract)`. */
export function isOp(n: Expr, ...ops: Op[]): n is OperatorExpr {
  return isOperatorNode(n) && (ops as string[]).includes(n.fn)
}
