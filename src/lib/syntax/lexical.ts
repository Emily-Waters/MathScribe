/**
 * What names, numbers and the sheet's own words look like: the pieces every
 * other pattern is built from, so a change to what a name looks like is made
 * once, here.
 */
import { named, regex, src, words, type WordOf } from './patterns.ts'

/** Greek letters (the Greek and Coptic block, U+0370 to U+03FF), which names can contain: `ΔE`, `ω_0`. */
export const GREEK_CHARS = `${String.fromCodePoint(0x370)}-${String.fromCodePoint(0x3ff)}`

/** A character that can continue a name: a letter, digit, underscore or Greek letter. */
export const NAME_CHAR = src`[\w${GREEK_CHARS}]`

/** A name: a letter (Latin or Greek), then letters, digits or underscores (`m`, `v_0`, `E_k`, `ΔE`). */
export const NAME = src`[A-Za-z${GREEK_CHARS}]${NAME_CHAR}*`

/** Exactly a name. */
export const IS_NAME = regex(src`^${NAME}$`)

/** A number as typed: `2`, `2.`, `.5`, `2.50`, `6.02e23`. */
export const NUMBER = src`(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`

/** Words with a meaning of their own in a line: a conversion, `2.0 m to cm`; an uncertainty, `2.0 kg pm 0.1 kg`. */
export const KEYWORD = words({ to: 'to', pm: 'pm' })
export type Keyword = WordOf<typeof KEYWORD>

/**
 * What starts everything built in rather than written in the sheet: constants
 * (`@c`), functions (`@tuple(…)`, `@table(…)`), namespaces (`@chem.total(…)`,
 * `@layout.text Title {`) and the `@constants { }` block.
 * MathScribe's own functions are written with it; mathjs's maths isn't (sin, sqrt, norm).
 */
export const SIGIL = '@'

/**
 * Calls with a meaning of their own, besides mathjs's functions: `@import(…)`,
 * the core's built-in `@tuple(…)`, and `@inv(x)`, 1/x written as its fraction
 * flipped (m/V as V/m). (A module's are its own: `@table`, `@solve`, `@vector`.)
 */
export const CALL = words({ import: 'import', tuple: 'tuple', inv: 'inv' })

/** MathScribe's namespaces under @, whose members are written with a dot: `@layout.list`. (An engine module adds its own: `@chem`.) */
export const NAMESPACE = words({ layout: 'layout' })

/** A call by name, up to its opening bracket: `import (`. */
const opening = (call: string) => src`${call}\s*\(`

/** A built-in call, up to its opening bracket: `@table (` (for building patterns). */
export const builtinOpening = (call: string) => opening(`${SIGIL}${call}`)

/** `name = ` before a call that can be named: `p = @plot(…)` (its group: name). */
export const NAMED = src`(?:${named('name', NAME)}\s*=\s*)`

/** Between a namespace and its member, as typed: a.x_1. */
export const MEMBER_DOT = '.'

/** Between a series' name and a member's number: t_1. */
export const SUBSCRIPT = '_'

/**
 * A name with a dot: a selection's, named import's or named plot's member,
 * `a.x_1`, or a member's member, a substance's element's, `H2SO4.H.n` (its
 * groups: namespace, and members, each with its dot before it). Not after a
 * digit, so 2.5 isn't one. (How it's held inside, a__x_1, is in names.ts.)
 */
export const DOT_ACCESS = regex(src`(?<![\w.${GREEK_CHARS}])${named('namespace', NAME)}${named('members', src`(?:\.${NAME})+`)}`, 'g')
