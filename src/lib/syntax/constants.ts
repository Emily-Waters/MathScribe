/**
 * Constants: the `@constants { }` block of your own, a constant as written in
 * a line (`@c`, `@c:4`, `@chem.mm.Na:5`), and a line that sets one sheet-wide
 * (`@a_0:3 to angstrom`).
 */
import { DOTTED_NAME, KEYWORD, SIGIL } from './lexical.ts'
import { blockOpener } from './blocks.ts'
import { EXACT_SETTING } from './settings.ts'
import { named, optional, regex, src } from './patterns.ts'
import { SETTING_MARK } from './punctuation.ts'

/** `@constants { … }`: the block of your own constants, usable anywhere as `@name`. */
export const CONSTANTS_BLOCK = 'constants'

/** The opener of an `@constants { }` block. */
export const CONSTANTS_OPENER = blockOpener(CONSTANTS_BLOCK)

/** A constant's name, optionally in namespaces: `c`, `chem.mm.Na` (or chem__mm.Na, once the first dot is read). */
const CONSTANT_NAME = DOTTED_NAME

/** A precision, as written after a constant: sig figs, or `exact`. */
const PRECISION = src`\d+|${EXACT_SETTING}`

/** The precision written after a constant: `:4` or `:exact` (its group: precision). */
export const CONSTANT_PRECISION = optional(src`${SETTING_MARK}${named('precision', PRECISION)}\b`)

/**
 * A constant as the lexer reads one, its token: `@c`, `@c:4`, `@c:exact`,
 * `@chem.mm.Na:5` (its groups: name, with any namespace, and precision). The
 * lexer says which are constants and which are calls (`@chem.mm(…)`).
 */
export const CONSTANT_WRITTEN = regex(src`^${SIGIL}${named('name', CONSTANT_NAME)}${CONSTANT_PRECISION}$`)

/**
 * A line that only sets a constant sheet-wide: `@c:4`, `@a_0 to angstrom`,
 * `@a_0:3 to angstrom`, `@chem.mm.Cl:3` (its groups: name, precision, unit).
 */
export const CONSTANT_DECLARATION = regex(
  src`^${SIGIL}${named('name', CONSTANT_NAME)}${optional(src`${SETTING_MARK}${named('precision', PRECISION)}`)}${optional(src`\s+${KEYWORD.to}\s+${named('unit', src`\S.*?`)}`)}\s*$`,
)
