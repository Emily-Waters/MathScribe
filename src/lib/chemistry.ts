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
 * an element's `@chem.Na` (see elements.ts).
 */
import { isElement, type ElementSymbol } from './elements.ts'
import { MEMBER_DOT, NAMESPACE, SIGIL } from './syntax.ts'

/** A formula in text, `{Na^+}`: single braces, not a value's `{{…}}`, nor a subscript's `_{…}` (1: the formula). */
export const FORMULA_IN_TEXT = /(?<![{_])\{([^{}]+)\}(?!\})/g

/** A line that's a formula on its own, a reaction: `{OH^- + H3O^+ -> 2 H2O}` (1: the formula). */
export const REACTION_LINE = /^\{(?!\{)([^{}]+)\}$/

/** A species after a unit, `{EDTA}`, with any space before it (1: the formula). */
export const SPECIES_AFTER_UNIT = /^[ \t]*\{([^{}]+)\}/

/** A formula as LaTeX, drawn by mhchem: `Ca^2+` → \ce{Ca^2+}. */
export const formulaTex = (formula: string) => `\\ce{${formula.trim()}}`

/** Text with `fix` applied to its parts outside `$…$` (inline maths is left alone). */
export const outsideMaths = (text: string, fix: (part: string) => string) =>
  text.split(/(\$[^$]*\$)/).map((part, i) => (i % 2 ? part : fix(part))).join('')

/** Text with each formula, `{Na^+}`, as inline maths: $\ce{Na^+}$. */
export const withFormulas = (text: string) =>
  outsideMaths(text, (part) => part.replace(FORMULA_IN_TEXT, (_, formula: string) => `$${formulaTex(formula)}$`))

/** Whether LaTeX uses a formula (so a LaTeX document needs mhchem). */
export const usesFormulas = (tex: string) => tex.includes('\\ce{')

// ---------------------------------------------------------------------------
// Species as units
// ---------------------------------------------------------------------------

/** The start of each species unit's name (mathjs's unit names are letters). */
const SPECIES_UNIT_PREFIX = 'species'

/** Each species' unit name by its formula, and back. */
const unitByFormula = new Map<string, string>()
const formulaByUnit = new Map<string, string>()

/** Letters for the nth species unit: a, b, …, z, aa, ab, … */
function letters(n: number): string {
  let s = ''
  for (let k = n + 1; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(97 + ((k - 1) % 26)) + s
  return s
}

/**
 * The unit a species is measured in, by its formula (spaces don't matter:
 * `Na^+` and `Na ^+` are one species); and whether it's new, so the caller
 * creates it in mathjs.
 */
export function speciesUnit(formula: string): { name: string; isNew: boolean } {
  const key = formula.replace(/\s+/g, '')
  const known = unitByFormula.get(key)
  if (known) return { name: known, isNew: false }
  const name = `${SPECIES_UNIT_PREFIX}${letters(unitByFormula.size)}`
  unitByFormula.set(key, name)
  formulaByUnit.set(name, key)
  return { name, isNew: true }
}

/** The formula a species unit stands for (undefined if it isn't one). */
export const formulaOf = (unitName: string): string | undefined => formulaByUnit.get(unitName)

/** Whether a unit's name is a species'. */
export const isSpeciesUnit = (unitName: string) => formulaByUnit.has(unitName)

/** Text with species units written as their formulas: `mol speciesa` → mol EDTA. */
export const readableSpecies = (text: string) =>
  text.replace(new RegExp(`\\b${SPECIES_UNIT_PREFIX}[a-z]+\\b`, 'g'), (name) => formulaOf(name) ?? name)

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
 * The atoms in a compound's formula, as MathScribe writes formulas: counts as
 * digits (`H2O`), groups in brackets (`Ca(OH)2`, `K4[Fe(CN)6]`), a hydrate's dot
 * as `*` (`CuSO4*5H2O`). A charge (`SO4^2-`) and state (`(aq)`) are left out, as
 * they don't change the molar mass. A coefficient (`2 H2O`) isn't one compound,
 * so it's an error: multiply by it in the calculation instead.
 */
export function parseFormula(formula: string): AtomCounts | { error: string } {
  const compact = formula.replace(/\s+/g, '').replace(STATE_SUFFIX, '').replace(CHARGE_SUFFIX, '')
  if (!compact) return { error: 'The formula is empty: write one in the braces, as in {H2O}.' }
  if (COUNT.test(compact)) {
    return { error: `{${formula.trim()}} starts with a coefficient. Give the formula of one compound and multiply in the calculation: 2 * @chem.mm({H2O}).` }
  }
  const atoms: AtomCounts = new Map()
  for (const [k, raw] of compact.split(HYDRATE_DOT).entries()) {
    if (!raw) return { error: `{${formula.trim()}} has a hydrate's * with nothing on one side.` }
    // After a hydrate's dot, a number is how many of what follows: 5H2O.
    const multiplier = k > 0 ? COUNT.exec(raw)?.[0] : undefined
    const part = multiplier ? raw.slice(multiplier.length) : raw
    const counted = countPart(part, formula.trim())
    if ('error' in counted) return counted
    addAtoms(atoms, counted, multiplier ? Number(multiplier) : 1)
  }
  return atoms
}

/**
 * A compound's molar mass as a sum of its elements' (`@chem.Ca + 2 * @chem.O + 2 * @chem.H`),
 * in brackets, for the engine to work out: so the sum is shown as working, and
 * the sig figs follow from the atomic weights by the addition rule.
 */
export function molarMassSum(atoms: AtomCounts): string {
  const term = ([symbol, n]: [ElementSymbol, number]) => {
    const element = `${SIGIL}${NAMESPACE.chem}${MEMBER_DOT}${symbol}`
    return n === 1 ? element : `${n} * ${element}`
  }
  return `(${[...atoms].map(term).join(' + ')})`
}
