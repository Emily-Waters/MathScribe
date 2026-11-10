/**
 * mathjs's names for its operators: an OperatorNode's `fn` (`2 * x` is
 * `multiply`) and the symbol it's written with. mathjs types `fn` as any
 * string, so these are named once here, and code asks `isOp(n, OP.multiply)`
 * rather than comparing with text TypeScript can't check.
 */
import { isOperatorNode, type MathNode, type OperatorNode } from 'mathjs'

/** Each operator's mathjs name. */
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

/** The symbol each is written with (an OperatorNode needs both, and mathjs's types check they match). */
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
 * Functions the engine calls by name in the text it gives mathjs (a
 * FunctionNode's `fn.name`): `9.81 m/s^2` is read as 9.81 * unit("m/s^2").
 */
export const FN = {
  unit: 'unit',
  /** A number kept as typed, so 2.00 keeps its sig figs: lit("2.00") (the engine adds it). */
  literal: 'lit',
  tuple: 'tuple',
} as const

/** mathjs's other word for a conversion, besides `to`: `2 m in cm`. */
export const MATHJS_IN = 'in'

/** Units the engine works with by name. */
export const UNIT = {
  /** Angles are worked out in radians. */
  radian: 'rad',
} as const

/** Units with a look of their own, as LaTeX and as plain text (others are their name, upright). */
export const UNIT_LOOKS: Readonly<Record<string, { tex: string; text: string }>> = {
  deg: { tex: '^{\\circ}', text: '°' },
  ohm: { tex: '\\Omega', text: 'Ω' },
  angstrom: { tex: '\\text{\\AA}', text: 'Å' },
  angstroms: { tex: '\\text{\\AA}', text: 'Å' },
}

/** Whether a node is one of these operators: `isOp(n, OP.add, OP.subtract)`. */
export function isOp(n: MathNode, ...ops: Op[]): n is OperatorNode {
  return isOperatorNode(n) && (ops as string[]).includes(n.fn)
}
