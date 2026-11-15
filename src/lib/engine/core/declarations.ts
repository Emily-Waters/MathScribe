/** Settings on an assigned name (`m:3:deg`, display names), and names being unpacked. */
import { type MathType, type Unit } from 'mathjs'
import { COMPONENTS_SETTING, DECLARED, EXACT_SETTING, LEADING_NAME, NAME_WITH_SETTINGS, NOTATIONS, PERCENT, UNIT_VECTOR_SETTING, EACH_SETTING, LABEL_QUOTE, TEMPLATE_USE, type Notation, type Precision, type VectorStyle } from '../../syntax.ts'
import { UNIT } from '../../mathjsNames.ts'
import { SPECIES_DISPLAYS, type SpeciesDisplay } from '../../chemistry.ts'
import { math } from './math.ts'
import { BRIEF_DIGITS, isValidUnit } from './numbers.ts'

/**
 * Display settings on the name being assigned (`name:3 =`, `name:deg =`,
 * `phi:3:deg =`), each after a `:` and in any order: sig figs (`3`, `exact`),
 * a unit, a notation (`sci`, `dec`), and for a vector `ijk` and `xyz`.
 */
export interface Declaration {
  name: string
  /** The `name:… =` part of the line. */
  length: number
  sf?: Precision
  /** Show the value in this unit (or `percent`). */
  unit?: string
  /** Always scientific (`sci`) or always decimal (`dec`) notation. */
  notation?: Notation
  /** `F:ijk`: show the vector with unit vectors. */
  vector?: VectorStyle
  /** `F:xyz`: also store (and show) each component as a variable, F_x, F_y, F_z. */
  components?: boolean
  /** `n_Na:"Moles of {Na^+}"`: shown as this instead of its name (as typed: text, {{values}}, {formulas}). */
  label?: string
  /** `m_w:massName(H2O)`: shown as the display name a template makes from these arguments. */
  template?: { name: string; args: string[] }
  /** `m:formula = 5.00 g {dietzeite}`: named species on this line shown by their formula (or `:name`, by their name). */
  speciesDisplay?: SpeciesDisplay
}

/** Whether a unit measures angles. */
export const isAngleUnit = (unit: string) => {
  try {
    return math.unit(unit).equalBase(math.unit(UNIT.radian))
  } catch {
    return false
  }
}

/** A value in brief, for an error message. */
export const formatted = (v: unknown) => math.format(v as MathType, { precision: BRIEF_DIGITS })

/**
 * `value` in `unit`, for `phi:deg = …`. A unitless value can only be shown in an
 * angle unit, as radians (atan, asin and acos give plain numbers in radians).
 * Tuples are converted element by element.
 */
export function toDisplayUnit(value: unknown, unit: string): unknown {
  if (math.isMatrix(value)) return math.map(value, (v: MathType) => toDisplayUnit(v, unit) as MathType)
  if (math.isUnit(value)) {
    try {
      return (value as Unit).to(unit)
    } catch {
      throw new Error(`${formatted(value)} can't be shown in ${unit}: the units don't match.`)
    }
  }
  if (typeof value === 'number') {
    if (isAngleUnit(unit)) return math.unit(value, UNIT.radian).to(unit)
    throw new Error(`${formatted(value)} has no unit, so it can't be shown in ${unit} `
      + '(only an angle in radians, from atan or asin for example, can be given a unit this way).')
  }
  throw new Error(`This value can't be shown in ${unit}.`)
}

/** A name in `tuple(a, b:3, c:deg) = …`, with its display settings. */
export interface TupleName {
  name: string
  sf?: Precision
  unit?: string
  notation?: Notation
}

/** One name of an unpacking, `theta:3:deg`; or an error saying what's wrong with it. */
export function parseTupleName(entry: string): TupleName | { error: string } {
  const name = LEADING_NAME.exec(entry)?.[0]
  if (!name || !NAME_WITH_SETTINGS.test(entry)) {
    return { error: `"${entry}" isn't a variable name: write tuple(a, b, c) = …, optionally with settings like b:3 or c:deg.` }
  }
  if (entry === name) return { name }
  const d = parseDeclaration(`${entry} = 0`)
  if (!d) return { name }
  if ('error' in d) return d
  if (d.unit === PERCENT) return { error: `${name}:percent isn't available when unpacking; show it as a percentage on a line of its own.` }
  if (d.vector || d.components) {
    return { error: `${name}:${d.vector ?? COMPONENTS_SETTING} is for a vector, but an unpacked name gets a single value.` }
  }
  return { name, sf: d.sf, unit: d.unit, notation: d.notation }
}

/** Whether a setting is a notation (`sci`, `dec`). */
export const isNotation = (s: string): s is Notation => (NOTATIONS as readonly string[]).includes(s)

/** The display settings on a line's assigned name, or an error if one isn't understood. */
export function parseDeclaration(line: string): Declaration | { error: string } | null {
  const m = DECLARED.exec(line)
  if (!m) return null
  const out: Declaration = { name: m[1], length: m[0].length }
  for (const [, spec] of m[2].matchAll(EACH_SETTING)) {
    const template = TEMPLATE_USE.exec(spec)
    if (spec.startsWith(LABEL_QUOTE)) out.label = spec.slice(1, -1)
    else if (template) out.template = { name: template[1], args: template[2].split(',').map((a) => a.trim()) }
    else if ((SPECIES_DISPLAYS as readonly string[]).includes(spec)) out.speciesDisplay = spec as SpeciesDisplay
    else if (spec === EXACT_SETTING) out.sf = EXACT_SETTING
    else if (isNotation(spec)) {
      if (out.notation && out.notation !== spec) return { error: `${m[1]} can't be both :${NOTATIONS[0]} and :${NOTATIONS[1]}.` }
      out.notation = spec
    } else if (spec === UNIT_VECTOR_SETTING) out.vector = UNIT_VECTOR_SETTING
    else if (spec === COMPONENTS_SETTING) out.components = true
    else if (/^\d+$/.test(spec)) {
      if (Number(spec) === 0) return { error: `${m[1]}:0 isn't valid; use at least 1 sig fig, or :exact.` }
      out.sf = Number(spec)
    } else if (spec === PERCENT || isValidUnit(spec)) out.unit = spec
    else return { error: `In ${m[1]}:${spec}, "${spec}" isn't a number of sig figs, a unit, or a setting like sci or ijk.` }
  }
  return out
}
