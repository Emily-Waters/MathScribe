/**
 * The chemistry module's syntax: its namespace and members, the patterns its
 * lines are read with, and the inside names of its functions. (MathScribe's
 * own syntax is in src/lib/syntax.ts, which this builds on.)
 */
import {
  ASSIGN, blockOpener, CURLY_BRACKETS, MEMBER_DOT, ROUND_BRACKETS, SETTING_MARK, SIGIL, SQUARE_BRACKETS, SUBSCRIPT, inClass, lit, memberName, NAME,
  named, oneOf, regex, src, texCommand,
} from '../../lib/plugin.ts'

/** Around a species or a formula, as typed: `2.0 mol {Na^+}`, `{Na^+}` in text. */
export const SPECIES_BRACES = CURLY_BRACKETS

/** A species' opening and closing braces, in a pattern. */
export const BRACE_OPEN = lit(SPECIES_BRACES.open)
export const BRACE_CLOSE = lit(SPECIES_BRACES.close)

/** What's in a species' braces: a formula, anything but a brace. */
export const SPECIES_INSIDE = src`[^${inClass(SPECIES_BRACES.open, SPECIES_BRACES.close)}]+`

/** A species in its braces, `{Na^+}` (its group: the formula inside). */
export const BRACED_SPECIES = src`${BRACE_OPEN}(${SPECIES_INSIDE})${BRACE_CLOSE}`

/** `=` between a name and its value, with any spaces. */
const ASSIGNED = src`\s*${ASSIGN}\s*`

/**
 * A formula in text, `{Na^+}`: single braces, not a value's `{{…}}`, nor a
 * subscript's `_{…}` (its group: formula). The one definition the tree (a
 * formula token), the outputs and the editor go by.
 */
const FORMULA_IN_TEXT_SOURCE = src`(?<![${inClass(SPECIES_BRACES.open, SUBSCRIPT)}])${BRACE_OPEN}${named('formula', SPECIES_INSIDE)}${BRACE_CLOSE}(?!${BRACE_CLOSE})`

/** Every formula in some text. */
export const FORMULA_IN_TEXT = regex(FORMULA_IN_TEXT_SOURCE, 'g')

/** A formula in text at a position (for the tree's text rule). */
export const FORMULA_AT = regex(FORMULA_IN_TEXT_SOURCE, 'y')

/** Its namespace under @: `@chem.mm.Na`. */
export const CHEM_NAMESPACE = 'chem'

/**
 * The functions in @chem:
 *   `H2SO4 = @chem.substance({H2SO4})`        a substance, whose members are its molar mass, amount and mass
 *   `@chem.total(n_Na, n_Cl)`                 the sum of amounts of different species, as plain amounts
 *   `r = @chem.reaction({2 H2 + O2 -> 2 H2O})` a balanced reaction (a line of its own)
 * `mm` holds each element's molar mass, `@chem.mm.Na`: the module's own (a
 * substance's molar mass is worked out from them), not typed in a sheet.
 */
export const CHEM_FUNCTION = { substance: 'substance', molarMass: 'mm', total: 'total', reaction: 'reaction' } as const

/** What starts a member of @chem, as typed: `@chem.`. */
export const CHEM_PREFIX = src`${SIGIL}${CHEM_NAMESPACE}${lit(MEMBER_DOT)}`

/**
 * A reaction, named, on a line of its own: `r = @chem.reaction({2 H2 + O2 -> 2 H2O})`.
 * Its species' coefficients are its members, as amounts: r.H2O is 2 mol H2O
 * (1: the name, 2: the reaction).
 */
export const REACTION_DEFINITION = regex(
  src`^(${NAME})${ASSIGNED}${CHEM_PREFIX}${CHEM_FUNCTION.reaction}${lit(ROUND_BRACKETS.open)}\s*${BRACE_OPEN}(.+)${BRACE_CLOSE}\s*${lit(ROUND_BRACKETS.close)}\s*$`)

// ---------------------------------------------------------------------------
// Species names: `@chem.species { dietzeite = {7Ca(IO3)2*8CaCrO4} }`
// ---------------------------------------------------------------------------

/** The block in @chem that names species: `@chem.species { dietzeite = {7Ca(IO3)2*8CaCrO4} }`. */
export const SPECIES_BLOCK = 'species'

/** How a named species is shown: by its name (dietzeite), or its formula (7Ca(IO₃)₂·8CaCrO₄). */
export const SPECIES_DISPLAY = { name: 'name', formula: 'formula' } as const
export type SpeciesDisplay = (typeof SPECIES_DISPLAY)[keyof typeof SPECIES_DISPLAY]
export const SPECIES_DISPLAYS: readonly SpeciesDisplay[] = Object.values(SPECIES_DISPLAY)

/** How a species name is shown, as a setting on it or on a line: `dietzeite:formula = {…}`, `m:name = …`. */
const SPECIES_DISPLAY_SETTING = src`(?:${SETTING_MARK}(${SPECIES_DISPLAYS.join('|')}))?`

/** A species named, after its name: its display setting, `=`, and its formula in braces. */
const NAMED_SPECIES = src`${SPECIES_DISPLAY_SETTING}${ASSIGNED}${BRACED_SPECIES}\s*$`

/** A species' name, as declared: `dietzeite = {7Ca(IO3)2*8CaCrO4}`, `edta:formula = {EDTA^4-}` (1: name, 2: how it's shown, 3: the formula). */
export const SPECIES_ENTRY = regex(src`^(${NAME})${NAMED_SPECIES}`)

/** The opener of an `@chem.species { }` block. */
export const SPECIES_OPENER = blockOpener(src`${CHEM_NAMESPACE}${lit(MEMBER_DOT)}${SPECIES_BLOCK}`)

/** One species named on a line of its own: `@chem.species dietzeite = {7Ca(IO3)2*8CaCrO4}` (1–3 as SPECIES_ENTRY). */
export const SPECIES_LINE = regex(src`^${CHEM_PREFIX}${SPECIES_BLOCK}\s+(${NAME})${NAMED_SPECIES}`)

// ---------------------------------------------------------------------------
// Formulas: what's written in a species' braces, `{7Ca(IO3)2*8CaCrO4}`, `{SO4^2-}`
// ---------------------------------------------------------------------------

/** A formula's marks: between a salt and its water (`CuSO4*5H2O`, or `·`), before a charge's size (`^2+`), a charge's signs, and a coefficient's fraction bar (`1/2 O2`). */
export const FORMULA_MARK = { hydrate: ['*', '·'], charge: '^', plus: '+', minus: '-', fraction: '/' } as const

/** Brackets a group of atoms can be written in, `Ca(OH)2`, `K4[Fe(CN)6]`: each opener's closer. */
export const GROUP_BRACKETS: Readonly<Record<string, string>> = {
  [ROUND_BRACKETS.open]: ROUND_BRACKETS.close, [SQUARE_BRACKETS.open]: SQUARE_BRACKETS.close,
}

/** The states a formula can end with, in brackets: `(aq)`, `(s)`, `(l)`, `(g)`. */
export const STATES = ['aq', 's', 'l', 'g'] as const

/** The arrows between a reaction's sides, as mhchem writes them (longest first): `<=>`, `<->`, `->`, `=`. */
export const REACTION_ARROWS = ['<=>', '<->', '->', '='] as const

/** An electron, as written in a half-reaction: `e^-`. */
export const ELECTRON = 'e'

/** mhchem's command, which draws a formula: `\ce{Ca^2+}`. */
export const CE_COMMAND = texCommand('ce')

/** An element's symbol starts with a capital, then a small letter or none; a formula's count is digits. */
const CAPITAL = src`[A-Z]`
const SMALL = src`[a-z]`
const ELEMENT_SYMBOL = src`${CAPITAL}${SMALL}?`

/** A charge's sign. */
const CHARGE_SIGN = src`[${inClass(FORMULA_MARK.plus, FORMULA_MARK.minus)}]`

/** What a formula starts with: an element's capital, or a group's bracket. */
const FORMULA_START = src`[A-Z${inClass(ROUND_BRACKETS.open, SQUARE_BRACKETS.open)}]`

/**
 * A subscript in words that's a formula: it starts with a capital, as every
 * element does (`m_{H2O}`, `c_{Na^+}`, `m_H2O`), so it's drawn as chemistry, H₂O.
 * Subscripts of words (`x_{max}`, `F_net`) start with a small letter or a digit;
 * a capitalised word with no digits or charge (`m_Ball`) looks the same either way.
 */
export const FORMULA_SUBSCRIPT = regex(src`^${CAPITAL}`)

/** Each element symbol in a formula without brackets or charge, with its count: `H2O` → H2, O (1: the symbol). */
export const ELEMENT_COUNT = regex(src`(${ELEMENT_SYMBOL})\d*`, 'g')

/** A formula of element symbols and counts alone: `H2O`, `NaCl`. */
export const PLAIN_FORMULA = regex(src`^(?:${ELEMENT_SYMBOL}\d*)+$`)

/** Between a salt and its water of crystallization. */
export const HYDRATE_DOT = regex(src`[${inClass(...FORMULA_MARK.hydrate)}]`)

/** A state after a formula, which says nothing about its mass: `(aq)`, `(s)`, `(l)`, `(g)`. */
export const STATE_SUFFIX = regex(src`${lit(ROUND_BRACKETS.open)}${oneOf(STATES)}${lit(ROUND_BRACKETS.close)}$`)

/** A charge after a formula, which doesn't change its molar mass (an electron's mass is negligible): `^2+`, `^-`, `+`. */
export const CHARGE_SUFFIX = regex(src`(?:${lit(FORMULA_MARK.charge)}[\d${inClass(FORMULA_MARK.plus, FORMULA_MARK.minus)}]+|${CHARGE_SIGN}+)$`)

/** A charge as written after a formula (1: its size, if written; 2 or 3: its sign): `^2+`, `^-`, `+`. */
export const CHARGE = regex(src`(?:${lit(FORMULA_MARK.charge)}(\d*)(${CHARGE_SIGN})|(${CHARGE_SIGN}))$`)

/** An element's symbol, at the start: a capital, then any small letters. */
export const SYMBOL = regex(src`^${CAPITAL}${SMALL}*`)

/** A count after a symbol or group, `2`, or a multiplier before a hydrate's water, `5H2O`, at the start. */
export const COUNT = regex(src`^\d+`)

/**
 * A coefficient before a formula, as in a balanced equation: `2 H2O`, `2H2O`,
 * `1/2 O2` (1: the coefficient, a whole number or a fraction; 2: any space after
 * it; 3: the formula, which starts with an element, a group, or an electron).
 */
export const COEFFICIENT = regex(
  src`^\s*(\d+(?:${lit(FORMULA_MARK.fraction)}\d+)?)(\s*)(${FORMULA_START}.*|${ELECTRON}(?:${lit(FORMULA_MARK.charge)}?${CHARGE_SIGN}).*)$`,
  's',
)

/** The arrow between a reaction's sides, with any spaces around it. */
export const REACTION_ARROW = regex(src`\s*${oneOf(REACTION_ARROWS.map(lit))}\s*`)

/** Between a side's species: a `+` with space around it (a charge's `+`, `Na^+`, has none after it). */
export const BETWEEN_SPECIES = regex(src`\s+${lit(FORMULA_MARK.plus)}\s+`)

/** What can follow a species' name in a formula: a space, a charge, a group, a sign. */
export const AFTER_A_NAME = src`[\s${inClass(FORMULA_MARK.charge, ROUND_BRACKETS.open, FORMULA_MARK.plus, FORMULA_MARK.minus)}]`

/** Characters a formula has that a name can't: brackets, charges, a hydrate's dot. */
export const NOT_IN_A_NAME = regex(src`[^A-Za-z0-9]`, 'g')

// ---------------------------------------------------------------------------
// Inside names
// ---------------------------------------------------------------------------

/**
 * The function `@chem.total(a, b)` puts around each amount, which takes its
 * species off (mol Na⁺ → mol), so amounts of different species add. It's
 * shown as just its argument.
 */
export const ANY_SPECIES_FUNCTION = memberName(CHEM_NAMESPACE, 'anySpecies')

/**
 * The functions a value's species is given with, when `{X}` follows something
 * other than a unit: `(18.02 g / 1 mol) {H2O}`, `n_1 {H2O}`. `shown` is written
 * as the value then its formula; `quiet` (how @chem.mm gives a compound's molar
 * mass its species) is written as just the value, as the species shows in its unit.
 */
export const SPECIES_FUNCTION = {
  shown: memberName(CHEM_NAMESPACE, 'of'),
  quiet: memberName(CHEM_NAMESPACE, 'ofCompound'),
  /** Takes a value's species off and shows it without them: each element's term in a compound's molar mass. */
  plain: memberName(CHEM_NAMESPACE, 'plain'),
} as const
