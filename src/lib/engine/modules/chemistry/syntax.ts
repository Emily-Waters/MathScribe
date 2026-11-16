/**
 * The chemistry module's syntax: its namespace and members, the patterns its
 * lines are read with, and the inside names of its functions. (MathScribe's
 * own syntax is in src/lib/syntax.ts, which this builds on.)
 */
import { NAME, NAME_CHAR } from '../../../syntax.ts'
import { memberName } from '../../../names.ts'

/** Its namespace under @: `@chem.mm.Na`. */
export const CHEM_NAMESPACE = 'chem'

/**
 * The functions in @chem:
 *   `@chem.mm({CuSO4*5H2O})`                  the molar mass of a compound, in g/mol
 *   `@chem.total(n_Na, n_Cl)`                 the sum of amounts of different species, as plain amounts
 *   `r = @chem.reaction({2 H2 + O2 -> 2 H2O})` a balanced reaction (a line of its own)
 * `mm` also holds each element's molar mass, as a constant: `@chem.mm.Na`.
 */
export const CHEM_FUNCTION = { molarMass: 'mm', total: 'total', reaction: 'reaction' } as const

/**
 * A reaction, named, on a line of its own: `r = @chem.reaction({2 H2 + O2 -> 2 H2O})`.
 * Its species' coefficients are its members, as amounts: r.H2O is 2 mol H2O
 * (1: the name, 2: the reaction).
 */
export const REACTION_DEFINITION = new RegExp(
  String.raw`^(${NAME})\s*=\s*@${CHEM_NAMESPACE}\.${CHEM_FUNCTION.reaction}\(\s*\{(.+)\}\s*\)\s*$`)

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
const SPECIES_DISPLAY_SETTING = String.raw`(?::(${SPECIES_DISPLAYS.join('|')}))?`

/** A species' name, as declared: `dietzeite = {7Ca(IO3)2*8CaCrO4}`, `edta:formula = {EDTA^4-}` (1: name, 2: how it's shown, 3: the formula). */
export const SPECIES_ENTRY = new RegExp(String.raw`^(${NAME})${SPECIES_DISPLAY_SETTING}\s*=\s*\{([^{}]+)\}\s*$`)

/** The opener of an `@chem.species { }` block. */
export const SPECIES_OPENER = new RegExp(String.raw`^@${CHEM_NAMESPACE}\.${SPECIES_BLOCK}\s*\{$`)

/** One species named on a line of its own: `@chem.species dietzeite = {7Ca(IO3)2*8CaCrO4}` (1–3 as SPECIES_ENTRY). */
export const SPECIES_LINE = new RegExp(String.raw`^@${CHEM_NAMESPACE}\.${SPECIES_BLOCK}\s+(${NAME})${SPECIES_DISPLAY_SETTING}\s*=\s*\{([^{}]+)\}\s*$`)

/** `@chem.species` at the current position (for the editor's tokenizer). */
export const SPECIES_TOKEN = new RegExp(String.raw`@${CHEM_NAMESPACE}\.${SPECIES_BLOCK}(?!${NAME_CHAR})`)

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
