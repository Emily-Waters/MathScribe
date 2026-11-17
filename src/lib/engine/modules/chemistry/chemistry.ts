/**
 * Chemistry: formulas, written as MathScribe writes them, and species as part
 * of a unit.
 *
 * A formula goes in single braces, in text, headings, titles, notes and
 * display names, and on a line of its own as a reaction:
 *
 *   > The {Na^+} concentration was {{c_Na}}.       ({{…}}, two braces, is a value)
 *   {OH^-(aq) + H3O^+(aq) -> 2 H2O(l)}
 *
 * Inside: counts as digits (H2O), a charge after ^ (Ca^2+, OH^-; Na+ too), a
 * state in brackets ((aq)), a coefficient before (2 H2O), arrows (->, <=>), a
 * hydrate's dot as * (CuSO4*5H2O). It's drawn with mhchem (\ce{…}), whose
 * notation this is, so LaTeX and Word get proper chemistry.
 *
 * After a unit, a formula is the species the amount is of: `2.0 mol {EDTA}`,
 * `0.100 M {NaOH}`, `5.00 g {NaOH}`. Each species is a unit of its own (see
 * speciesUnit), so mol EDTA ÷ mol EDTA cancels, `(1 mol {X}) / (1 mol {EDTA})`
 * is a mole ratio, and adding mol Na⁺ to mol Cl⁻ is an error, as adding metres
 * to seconds is.
 *
 * A compound's molar mass is `@chem.mm({CuSO4*5H2O})` (see parseFormula), and
 * an element's `@chem.mm.Na` (see elements.ts).
 */
import { isElement, type ElementSymbol } from './elements.ts'
import { MEMBER_DOT, SIGIL } from '../../../syntax.ts'
import { CHEM_FUNCTION, CHEM_NAMESPACE, SPECIES_DISPLAY, SPECIES_FUNCTION, type SpeciesDisplay } from './syntax.ts'
import { ExplainedError } from '../../core/results.ts'
import { outsideMaths } from '../../core/text.ts'

/** A formula in text, `{Na^+}`: single braces, not a value's `{{…}}`, nor a subscript's `_{…}` (1: the formula). */
export const FORMULA_IN_TEXT = /(?<![{_])\{([^{}]+)\}(?!\})/g

/** A line that's a formula on its own, a reaction: `{OH^- + H3O^+ -> 2 H2O}` (1: the formula). */
export const REACTION_LINE = /^\{(?!\{)([^{}]+)\}$/

/** A formula as LaTeX, drawn by mhchem: `Ca^2+` → \ce{Ca^2+}. */
export const formulaTex = (formula: string) => `\\ce{${formula.trim()}}`

/**
 * A subscript in words that's a formula: it starts with a capital, as every
 * element does (`m_{H2O}`, `c_{Na^+}`, `m_H2O`), so it's drawn as chemistry, H₂O.
 * Subscripts of words (`x_{max}`, `F_net`) start with a small letter or a digit;
 * a capitalised word with no digits or charge (`m_Ball`) looks the same either way.
 */
const FORMULA_SUBSCRIPT = /^[A-Z]/

/** Whether a subscript in words is a formula (see FORMULA_SUBSCRIPT). */
export const isFormulaSubscript = (subscript: string) => FORMULA_SUBSCRIPT.test(subscript.trim())

/** Each element symbol in a formula without brackets or charge, with its count: `H2O` → H2, O (1: the symbol). */
const ELEMENT_COUNT = /([A-Z][a-z]?)\d*/g
/** A formula of element symbols and counts alone: `H2O`, `NaCl`. */
const PLAIN_FORMULA = /^(?:[A-Z][a-z]?\d*)+$/

/**
 * Whether a subscript of a variable's name is a formula: two or more
 * characters of element symbols and counts (`n_H2`, `n_H2O`, `c_NaCl`, `m_Na`).
 * A single letter (`F_N`, `T_C`) or labels that aren't elements (`v_AB`) stay
 * as the physics they usually are.
 */
export function isNameFormula(subscript: string): boolean {
  if (subscript.length < 2 || !PLAIN_FORMULA.test(subscript)) return false
  return [...subscript.matchAll(ELEMENT_COUNT)].every((m) => isElement(m[1]))
}

/** Text with each formula, `{Na^+}`, as inline maths: $\ce{Na^+}$. */
export const withFormulas = (text: string) =>
  outsideMaths(text, (part) => part.replace(FORMULA_IN_TEXT, (_, inside: string) => {
    // A species' name on its own is shown as its declaration (or the line) says: as the word, or its formula.
    const named = activeSpeciesNames?.named(inside.trim())
    if (named && (lineSpeciesDisplay ?? named.display) === SPECIES_DISPLAY.name) return named.name
    return `$${formulaTex(activeSpeciesNames?.expandFormula(inside) ?? inside)}$`
  }))

/** Whether LaTeX uses a formula (so a LaTeX document needs mhchem). */
export const usesFormulas = (tex: string) => tex.includes('\\ce{')

// ---------------------------------------------------------------------------
// Species as units
// ---------------------------------------------------------------------------

/**
 * What a species qualifies: an amount of it (mol, M) or a mass of it (g, g/L).
 * Each formula has a unit of each kind, so a molar mass, g H2O / mol H2O,
 * doesn't cancel to g/mol: a mass of H2O over an amount of H2O.
 */
export const SPECIES_KIND = { amount: 'amount', mass: 'mass' } as const
export type SpeciesKind = (typeof SPECIES_KIND)[keyof typeof SPECIES_KIND]
export const SPECIES_KINDS: readonly SpeciesKind[] = Object.values(SPECIES_KIND)

/** The start of each kind of species unit's name (mathjs's unit names are letters): amountofa, massofa. */
const SPECIES_UNIT_PREFIX: Record<SpeciesKind, string> = { amount: 'amountof', mass: 'massof' }

/** Something wrong with a value's species, explained as it should be shown. */
export class SpeciesError extends ExplainedError {}

/** A species unit: the formula it's of, and what it qualifies. */
export interface SpeciesUnit {
  formula: string
  kind: SpeciesKind
}

/** Each species unit's name by its kind and formula, and back. */
const unitByFormula: Record<SpeciesKind, Map<string, string>> = { amount: new Map(), mass: new Map() }
const speciesByUnit = new Map<string, SpeciesUnit>()

/** Letters for the nth species unit: a, b, …, z, aa, ab, … */
function letters(n: number): string {
  let s = ''
  for (let k = n + 1; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(97 + ((k - 1) % 26)) + s
  return s
}

/** A formula as a species is known by: spaces don't matter (`Na^+` and `Na ^+` are one species). */
export const speciesKey = (formula: string) => formula.replace(/\s+/g, '')

/**
 * The unit a species is measured in, by what it qualifies and its formula;
 * and whether it's new, so the caller creates it in mathjs.
 */
export function speciesUnit(formula: string, kind: SpeciesKind): { name: string; isNew: boolean } {
  const key = speciesKey(formula)
  const known = unitByFormula[kind].get(key)
  if (known) return { name: known, isNew: false }
  const name = `${SPECIES_UNIT_PREFIX[kind]}${letters(unitByFormula[kind].size)}`
  unitByFormula[kind].set(key, name)
  speciesByUnit.set(name, { formula: key, kind })
  return { name, isNew: true }
}

/** The species a unit stands for: its formula and kind (undefined if it isn't one). */
export const speciesOf = (unitName: string): SpeciesUnit | undefined => speciesByUnit.get(unitName)

/** The formula a species unit stands for (undefined if it isn't one). */
export const formulaOf = (unitName: string): string | undefined => speciesByUnit.get(unitName)?.formula

/** Whether a unit's name is a species'. */
export const isSpeciesUnit = (unitName: string) => speciesByUnit.has(unitName)

/** A species unit's name, anywhere in some text. */
const SPECIES_UNIT_NAME = new RegExp(String.raw`\b(?:${Object.values(SPECIES_UNIT_PREFIX).join('|')})[a-z]+\b`, 'g')

/** Text with species units written as their formulas: `mol amountofa` → mol EDTA. */
export const readableSpecies = (text: string) =>
  text.replace(SPECIES_UNIT_NAME, (name) => { const f = formulaOf(name); return f === undefined ? name : speciesText(f) })

/**
 * Which kinds a species qualifies, and how many times, in a value whose unit has
 * these powers of mass and of amount: `{H2O}` on g is a mass of H2O; on mol or M,
 * an amount; on g/mol, a molar mass (a mass of H2O per amount of H2O); on g/L, a
 * mass concentration. A unit with neither (`5.0 m {H2O}`) can't be of a species.
 *
 *   unit's mass, amount powers   →   the species' mass, amount powers
 */
export function speciesPowers(massPower: number, amountPower: number): Record<SpeciesKind, number> | null {
  if (!massPower && !amountPower) return null
  return { mass: massPower, amount: amountPower }
}

// ---------------------------------------------------------------------------
// Molar mass from a formula: `@chem.mm({CuSO4*5H2O})`
// ---------------------------------------------------------------------------

/** Brackets a group of atoms can be written in, `Ca(OH)2`, `K4[Fe(CN)6]`: each opener's closer. */
const GROUP_BRACKETS = { '(': ')', '[': ']' } as const
type GroupOpener = keyof typeof GROUP_BRACKETS

/** Between a salt and its water of crystallization: `CuSO4*5H2O` (as typed in formulas), or `·`. */
const HYDRATE_DOT = /[*·]/

/** A state after a formula, which says nothing about its mass: `(aq)`, `(s)`, `(l)`, `(g)`. */
const STATE_SUFFIX = /\((?:aq|s|l|g)\)$/

/** A charge after a formula, which doesn't change its molar mass (an electron's mass is negligible): `^2+`, `^-`, `+`. */
const CHARGE_SUFFIX = /(?:\^[\d+-]+|[+-]+)$/

/** An element's symbol: a capital, then any small letters. */
const SYMBOL = /^[A-Z][a-z]*/

/** A count after a symbol or group, `2`, or a multiplier before a hydrate's water, `5H2O`. */
const COUNT = /^\d+/

/** How many of each element a formula has, in the order they first appear. */
export type AtomCounts = Map<ElementSymbol, number>

/** Add `times` of each atom in `from` to `into`. */
function addAtoms(into: AtomCounts, from: AtomCounts, times: number): void {
  for (const [symbol, n] of from) into.set(symbol, (into.get(symbol) ?? 0) + n * times)
}

/** One part of a formula (no hydrate dots), its atoms counted: `Ca(OH)2` → Ca 1, O 2, H 2. */
function countPart(part: string, formula: string): AtomCounts | { error: string } {
  /** Each group open at this point: its atoms, and the bracket that closes it. */
  const open: { atoms: AtomCounts; closer: string }[] = [{ atoms: new Map(), closer: '' }]
  let i = 0
  const readCount = () => {
    const m = COUNT.exec(part.slice(i))
    if (!m) return 1
    i += m[0].length
    return Number(m[0])
  }
  while (i < part.length) {
    const c = part[i]
    if (Object.hasOwn(GROUP_BRACKETS, c)) {
      open.push({ atoms: new Map(), closer: GROUP_BRACKETS[c as GroupOpener] })
      i++
    } else if (open.length > 1 && c === open.at(-1)!.closer) {
      i++
      const group = open.pop()!
      addAtoms(open.at(-1)!.atoms, group.atoms, readCount())
    } else if (SYMBOL.test(part.slice(i))) {
      const symbol = SYMBOL.exec(part.slice(i))![0]
      if (!isElement(symbol)) return { error: `{${formula}} has ${symbol}, which isn't an element. (Symbols are case-sensitive: Co is cobalt, CO is carbon and oxygen.)` }
      i += symbol.length
      addAtoms(open.at(-1)!.atoms, new Map([[symbol, 1]]), readCount())
    } else {
      return { error: `{${formula}}: "${c}" can't be read as part of a formula.` }
    }
  }
  if (open.length > 1) return { error: `{${formula}} is missing a closing ${open.at(-1)!.closer}.` }
  return open[0].atoms
}

/**
 * A coefficient before a formula, as in a balanced equation: `2 H2O`, `2H2O`,
 * `1/2 O2` (1: the coefficient, a whole number or a fraction; 2: any space after
 * it; 3: the formula).
 */
const COEFFICIENT = /^\s*(\d+(?:\/\d+)?)(\s*)([A-Z([].*|e(?:\^?[+-]).*)$/s

/**
 * A formula's coefficient, if it has one (`2 H2O` → 2 and H2O); otherwise the
 * formula as it is. In a formula of parts joined by a dot, a number written
 * against the first part is that part's count, as the one after each dot is:
 * `7Ca(IO3)2*8CaCrO4` is 7 Ca(IO3)2 and 8 CaCrO4 (dietzeite). With a space, it's
 * a coefficient of the whole: `2 CuSO4*5H2O`.
 */
export function splitCoefficient(formula: string): { coefficient?: string; compound: string } {
  const m = COEFFICIENT.exec(formula)
  if (!m || (!m[2] && HYDRATE_DOT.test(m[3]))) return { compound: formula }
  return { coefficient: m[1], compound: m[3] }
}

/**
 * The atoms in a compound's formula, as MathScribe writes formulas: counts as
 * digits (`H2O`), groups in brackets (`Ca(OH)2`, `K4[Fe(CN)6]`), a hydrate's dot
 * as `*` (`CuSO4*5H2O`). A charge (`SO4^2-`) and state (`(aq)`) are left out, as
 * they don't change the molar mass. A coefficient (`2 H2O`) is taken off first
 * (splitCoefficient), so here one is an error.
 */
export function parseFormula(formula: string): AtomCounts | { error: string } {
  const compact = formula.replace(/\s+/g, '').replace(STATE_SUFFIX, '').replace(CHARGE_SUFFIX, '')
  if (!compact) return { error: 'The formula is empty: write one in the braces, as in {H2O}.' }
  const parts = compact.split(HYDRATE_DOT)
  // (A formula of one part can't start with a number: that's a coefficient, which splitCoefficient takes off.)
  if (parts.length === 1 && COUNT.test(compact)) {
    return { error: `{${formula.trim()}} starts with a coefficient. Give the formula of one compound and multiply in the calculation: 2 * @chem.mm({H2O}).` }
  }
  const atoms: AtomCounts = new Map()
  for (const raw of parts) {
    if (!raw) return { error: `{${formula.trim()}} has a hydrate's * with nothing on one side.` }
    // In a formula of parts, a number before a part is how many of it: 5H2O, and 7Ca(IO3)2 in 7Ca(IO3)2*8CaCrO4.
    const multiplier = COUNT.exec(raw)?.[0]
    const part = multiplier ? raw.slice(multiplier.length) : raw
    const counted = countPart(part, formula.trim())
    if ('error' in counted) return counted
    addAtoms(atoms, counted, multiplier ? Number(multiplier) : 1)
  }
  return atoms
}

/**
 * A compound's molar mass as a sum of its elements' (`@chem.mm.Ca + 2 * @chem.mm.O + 2 * @chem.mm.H`),
 * in brackets, for the engine to work out: so the sum is shown as working, and
 * the sig figs follow from the atomic weights by the addition rule.
 */
export function molarMassSum(atoms: AtomCounts): string {
  const term = ([symbol, n]: [ElementSymbol, number]) => {
    // Each element's molar mass is of the element (@chem.mm.Na); in a compound's, they're
    // added as plain molar masses, and the sum is given the compound's species.
    const element = `${SIGIL}${[CHEM_NAMESPACE, CHEM_FUNCTION.molarMass, symbol].join(MEMBER_DOT)}`
    return `${SPECIES_FUNCTION.plain}(${n === 1 ? element : `${n} * ${element}`})`
  }
  return `(${[...atoms].map(term).join(' + ')})`
}

// ---------------------------------------------------------------------------
// Reactions: `r = @chem.reaction({2 H2 + O2 -> 2 H2O})`
// ---------------------------------------------------------------------------

/** The arrows between a reaction's sides: `->`, `<=>`, `<->`, `=` (as mhchem writes them). */
const REACTION_ARROW = /\s*(?:<=>|<->|->|=)\s*/

/** Between a side's species: a `+` with space around it (a charge's `+`, `Na^+`, has none after it). */
const BETWEEN_SPECIES = /\s+\+\s+/

/** A charge as written after a formula (1: its size, if written; 2: its sign): `^2+`, `^-`, `+`. */
const CHARGE = /(?:\^(\d*)([+-])|([+-]))$/

/** One species of a reaction, with its coefficient. */
export interface ReactionTerm {
  /** How many of it, from the balanced equation (1 if none is written). */
  coefficient: number
  /** Its formula, as its species is known (with its charge and state, as written). */
  formula: string
  atoms: AtomCounts
  /** Its charge: Na^+ is 1, SO4^2- is −2. */
  charge: number
}

/** A reaction: what reacts, and what it makes. */
export interface Reaction {
  reactants: ReactionTerm[]
  products: ReactionTerm[]
}

/** An electron, as written in a half-reaction: `e^-`. */
const ELECTRON = 'e'

/** Characters a formula has that a name can't: brackets, charges, a hydrate's dot. */
const NOT_IN_A_NAME = /[^A-Za-z0-9]/g

/** A reaction's species as a member name, by its letters and digits: H2O → H2O, Ca(OH)2 → CaOH2, Na^+ → Na. */
export const reactionMemberName = (formula: string) => formula.replace(STATE_SUFFIX, '').replace(NOT_IN_A_NAME, '')

/** A coefficient's value: `2` → 2, `1/2` → 0.5. */
function coefficientValue(text: string): number {
  const [top, bottom] = text.split('/').map(Number)
  return bottom ? top / bottom : top
}

/** A formula's charge: Na^+ → 1, SO4^2- → −2, Cl- → −1, H2O → 0. */
function chargeOf(formula: string): number {
  const m = CHARGE.exec(formula.replace(STATE_SUFFIX, '').trim())
  if (!m) return 0
  const sign = (m[2] ?? m[3]) === '-' ? -1 : 1
  return sign * (m[1] ? Number(m[1]) : 1)
}

/** A reaction as written, `2 H2 + O2 -> 2 H2O`, read into its species and their coefficients. */
export function parseReaction(text: string): Reaction | { error: string } {
  const sides = text.split(REACTION_ARROW)
  if (sides.length !== 2 || !sides[0].trim() || !sides[1].trim()) {
    return { error: `{${text.trim()}} isn't a reaction: write what reacts, an arrow, and what it makes, as in {2 H2 + O2 -> 2 H2O}.` }
  }
  const side = (part: string): ReactionTerm[] | { error: string } => {
    const terms: ReactionTerm[] = []
    for (const written of part.trim().split(BETWEEN_SPECIES)) {
      const { coefficient, compound } = splitCoefficient(written)
      // An electron, in a half-reaction: no atoms, a charge of −1.
      const electron = compound.replace(CHARGE_SUFFIX, '').trim() === ELECTRON
      const atoms: AtomCounts | { error: string } = electron ? new Map() : parseFormula(compound)
      if ('error' in atoms) return atoms
      terms.push({ coefficient: coefficient ? coefficientValue(coefficient) : 1, formula: speciesKey(compound), atoms, charge: chargeOf(compound) })
    }
    return terms
  }
  const reactants = side(sides[0])
  if ('error' in reactants) return reactants
  const products = side(sides[1])
  if ('error' in products) return products
  return { reactants, products }
}

/** Each element's atoms on one side of a reaction, coefficients included. */
function atomsOnSide(terms: ReactionTerm[]): AtomCounts {
  const out: AtomCounts = new Map()
  for (const t of terms) addAtoms(out, t.atoms, t.coefficient)
  return out
}

/** A number of atoms, or a charge, as it's shown: whole numbers as they are, others to a few places. */
const countText = (n: number) => String(Number(n.toPrecision(6)))

/**
 * What doesn't balance in a reaction, or undefined if it balances: each
 * element's atoms, and the total charge, the same on both sides.
 */
export function reactionImbalance(r: Reaction): string | undefined {
  const left = atomsOnSide(r.reactants)
  const right = atomsOnSide(r.products)
  const problems: string[] = []
  for (const symbol of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(symbol) ?? 0
    const b = right.get(symbol) ?? 0
    if (Math.abs(a - b) > BALANCE_TOLERANCE) problems.push(`${symbol} has ${countText(a)} on the left and ${countText(b)} on the right`)
  }
  const charge = (terms: ReactionTerm[]) => terms.reduce((sum, t) => sum + t.coefficient * t.charge, 0)
  const [qa, qb] = [charge(r.reactants), charge(r.products)]
  if (Math.abs(qa - qb) > BALANCE_TOLERANCE) problems.push(`the charge is ${countText(qa)} on the left and ${countText(qb)} on the right`)
  return problems.length ? `It isn't balanced: ${problems.join('; ')}.` : undefined
}

/** How far apart two counts can be and still balance (fractional coefficients, 1/2 O2). */
const BALANCE_TOLERANCE = 1e-9

// ---------------------------------------------------------------------------
// Species names: `@chem.species { dietzeite = {7Ca(IO3)2*8CaCrO4} }`
// ---------------------------------------------------------------------------

/** A species' name, as declared: the formula it stands for, and how it's shown unless a value says otherwise. */
export interface SpeciesName {
  name: string
  formula: string
  display: SpeciesDisplay
}

/** Words that can't name a species, as they mean something in braces already: an electron, and the states. */
const RESERVED_SPECIES_NAMES: ReadonlySet<string> = new Set([ELECTRON, 'aq', 's', 'l', 'g'])

/**
 * The species a sheet names, by name and by formula. A name stands for its
 * formula wherever braces take one, `{dietzeite}` is `{7Ca(IO3)2*8CaCrO4}`,
 * so they're the same species; it's only shown differently.
 */
export class SpeciesNames {
  private readonly byName = new Map<string, SpeciesName>()
  private readonly byFormula = new Map<string, SpeciesName>()

  /** Name a species: or what's wrong with the name or its formula. */
  define(name: string, formula: string, display: SpeciesDisplay): string | undefined {
    if (RESERVED_SPECIES_NAMES.has(name)) return `${name} means something in a formula already, so it can't name a species.`
    if (!('error' in parseFormula(name))) return `{${name}} is a formula already, so it can't name a species: choose a name that isn't one (a lowercase word, as in dietzeite).`
    const own = this.byName.get(name)
    if (own) return `${name} is already the name of {${own.formula}}.`
    // (What it names needn't be a formula: a species can be any label in braces, {EDTA}, {X}.
    // @chem.mm reads its atoms when it's asked for a molar mass.)
    const entry = { name, formula: speciesKey(formula), display }
    this.byName.set(name, entry)
    this.byFormula.set(entry.formula, entry)
    return undefined
  }

  /** A name's species. */
  named(name: string): SpeciesName | undefined {
    return this.byName.get(name)
  }

  /** The name a formula has, if it has one. */
  nameOf(formula: string): SpeciesName | undefined {
    return this.byFormula.get(speciesKey(formula))
  }

  /** Every named species, in the order they were named. */
  get all(): SpeciesName[] {
    return [...this.byName.values()]
  }

  /**
   * Text with each name in braces as its formula: `5.00 g {dietzeite}` →
   * `5.00 g {7Ca(IO3)2*8CaCrO4}`, and in a reaction, `{2 dietzeite -> …}`. A name
   * counts where a formula would start: at the start of the braces, or after a
   * space or a coefficient. (A value in braces, `{{x}}`, is left alone.)
   */
  expand(text: string): string {
    if (!this.byName.size || !text.includes('{')) return text
    return text.replace(BRACED, (_whole: string, inside: string) => `{${this.expandFormula(inside)}}`)
  }

  /** What's inside a pair of braces, each name in it as its formula: `2 dietzeite` → `2 7Ca(IO3)2*8CaCrO4`. */
  expandFormula(inside: string): string {
    if (!this.byName.size) return inside
    return inside.replace(this.pattern(), (_m, lead: string, name: string) => `${lead}${this.byName.get(name)!.formula}`)
  }

  /** A name where a formula would start (1: what's before it, 2: the name). */
  private pattern(): RegExp {
    // (Names are letters, digits and underscores, so they need no escaping; longest first, so one doesn't cut another short.)
    const names = [...this.byName.keys()].sort((a, b) => b.length - a.length)
    return new RegExp(String.raw`(^|\s|\d)(${names.join('|')})(?=$|[\s^(+-])`, 'g')
  }
}

/** A formula in single braces, not a value's `{{…}}` (1: what's inside). */
const BRACED = /(?<!\{)\{([^{}]+)\}(?!\})/g

/** The sheet's species names while it's worked out and drawn: units and messages show a named species by its name. */
let activeSpeciesNames: SpeciesNames | undefined

/** How named species are shown on the line being worked out, if it says (`m:formula = …`). */
let lineSpeciesDisplay: SpeciesDisplay | undefined

/** Use a sheet's species names, for showing units and messages. */
export const setSpeciesNames = (names: SpeciesNames | undefined) => {
  activeSpeciesNames = names
}

/** Show the line being worked out's species as it says (or, with none, as each name's declaration says). */
export const showSpeciesOnLine = (display: SpeciesDisplay | undefined) => {
  lineSpeciesDisplay = display
}

/** A species as it's shown, as LaTeX: its name, upright, if it has one and is shown by it; else its formula. */
export function speciesTex(formula: string): string {
  const named = activeSpeciesNames?.nameOf(formula)
  const display = lineSpeciesDisplay ?? named?.display
  return named && display === SPECIES_DISPLAY.name ? `\\mathrm{${named.name}}` : formulaTex(formula)
}

/** A species as it's written in a message: its name, if it has one and is shown by it; else its formula. */
function speciesText(formula: string): string {
  const named = activeSpeciesNames?.nameOf(formula)
  const display = lineSpeciesDisplay ?? named?.display
  return named && display === SPECIES_DISPLAY.name ? named.name : formula
}
