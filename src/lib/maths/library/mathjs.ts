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
  type AssignmentNode, type ConditionalNode, type ConstantNode, type EvalFunction, type FunctionAssignmentNode,
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
