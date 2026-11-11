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
 */

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
