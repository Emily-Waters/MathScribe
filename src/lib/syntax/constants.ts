/**
 * Constants: the `@constants { }` block of your own, a constant as written in
 * a line (`@c`, `@c:4`, `@chem.mm.Na:5`), and a line that sets one sheet-wide
 * (`@a_0:3 to angstrom`).
 */
import { KEYWORD, NAME, NAME_CHAR, SIGIL } from './lexical.ts'
import { EXACT_SETTING } from './settings.ts'
import { named, optional, regex, src } from './patterns.ts'

/** `@constants { … }`: the block of your own constants, usable anywhere as `@name`. */
export const CONSTANTS_BLOCK = 'constants'

/** The opener of an `@constants { }` block. */
export const CONSTANTS_OPENER = regex(src`^${SIGIL}${CONSTANTS_BLOCK}\s*\{$`)

/** A constant's name, optionally in namespaces: `c`, `chem.mm.Na` (or chem__mm.Na, once the first dot is read). */
const CONSTANT_NAME = src`${NAME}(?:\.${NAME})*`

/** A precision, as written after a constant: sig figs, or `exact`. */
const PRECISION = src`\d+|${EXACT_SETTING}`

/** The precision written after a constant: `:4` or `:exact` (its group: precision). */
export const CONSTANT_PRECISION = optional(src`:${named('precision', PRECISION)}\b`)

/**
 * Every constant in a line: `@c`, `@c:4`, `@c:exact`, `@chem.mm.Na:5` (its
 * groups: name, with any namespace, and precision). Not a call, `@chem.mm(…)`.
 */
export const CONSTANT_REF = regex(src`${SIGIL}${named('name', CONSTANT_NAME)}(?!${NAME_CHAR}|\.|\s*\()${CONSTANT_PRECISION}`, 'g')

/**
 * A line that only sets a constant sheet-wide: `@c:4`, `@a_0 to angstrom`,
 * `@a_0:3 to angstrom`, `@chem.mm.Cl:3` (its groups: name, precision, unit).
 */
export const CONSTANT_DECLARATION = regex(
  src`^${SIGIL}${named('name', CONSTANT_NAME)}${optional(src`:${named('precision', PRECISION)}`)}${optional(src`\s+${KEYWORD.to}\s+${named('unit', src`\S.*?`)}`)}\s*$`,
)
