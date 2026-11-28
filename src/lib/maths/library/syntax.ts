/**
 * The maths library's text, as the adapter (mathjs.ts) writes and reads it:
 * the symbol each operator is written with, the units with a look of their own,
 * and how mathjs words the errors MathScribe tells apart. Written out once,
 * here, so the adapter's code names them; nothing outside the adapter reads
 * this file but through the library's interface (index.ts).
 */
import { regex, src } from '../../syntax/patterns.ts'
import type { Op } from './mathjs.ts'

/** The symbol each operator is written with (an OperatorExpr needs both, and the library's types check they match). */
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

/** Units with a look of their own, as LaTeX and as plain text (others are their name, upright). */
export const UNIT_LOOKS: Readonly<Record<string, { tex: string; text: string }>> = {
  deg: { tex: '^{\\circ}', text: '°' },
  ohm: { tex: '\\Omega', text: 'Ω' },
  angstrom: { tex: '\\text{\\AA}', text: 'Å' },
  angstroms: { tex: '\\text{\\AA}', text: 'Å' },
}

/** mathjs's wording of each error MathScribe tells apart (its messages are the only way it says which). */
export const MATHJS_SAYS = {
  undefinedName: regex(src`^Undefined symbol (\S+)$`),
  undefinedFunction: regex(src`^Undefined function (\S+)$`),
  unitsDiffer: regex(src`^Units do not match$`),
  cannotConvert: regex(src`^Units do not match \('(.+)' != '[-+\d.e]+\s*(.*)'\)$`),
} as const
