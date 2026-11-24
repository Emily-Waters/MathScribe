/** Settings on an assigned name (`m:3:deg`, display names), and names being unpacked. */
import { type MathType, type Unit } from 'mathjs'
import { EXACT_SETTING, NOTATION, PERCENT, LABEL_QUOTE, TEMPLATE_USE, type Notation, type Precision } from '../../syntax.ts'
import { NODE_KIND } from '../../tree/nodes.ts'
import { assignedOf, lineShape } from '../../tree/shapes.ts'
import { UNIT } from '../../maths/library/index.ts'
import { SETTING_PLACE, isModuleLineSetting, moduleSettingProblem } from './module.ts'
import { math } from './math.ts'
import { BRIEF_DIGITS, isValidUnit } from './numbers.ts'

/**
 * Display settings on the name being assigned (`name:3 =`, `name:deg =`,
 * `phi:3:deg =`), each after a `:` and in any order: sig figs (`3`, `exact`),
 * a unit, a notation (`sci`, `dec`), a display name, and modules' own (`F:ijk`).
 */
export interface Declaration {
  name: string
  sf?: Precision
  /** Show the value in this unit (or `percent`). */
  unit?: string
  /** Always scientific (`sci`) or always decimal (`dec`) notation. */
  notation?: Notation
  /** `n_Na:"Moles of {Na^+}"`: shown as this instead of its name (as typed: text, {{values}}, {formulas}). */
  label?: string
  /** `m_w:massName(H2O)`: shown as the display name a template makes from these arguments. */
  template?: { name: string; args: string[] }
  /** Settings that are a module's (see EngineModule.lineSettings): `m:formula = 5.00 g {dietzeite}`. */
  moduleSettings?: string[]
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

/** A name in `@tuple(a, b:3, c:deg) = …`, with its display settings. */
export interface TupleName {
  name: string
  sf?: Precision
  unit?: string
  notation?: Notation
}

/** One name of an unpacking, `theta:3:deg`; or an error saying what's wrong with it. */
export function parseTupleName(entry: string): TupleName | { error: string } {
  const target = assignedOf(entry)
  if (!target) {
    return { error: `"${entry}" isn't a variable name: write @tuple(a, b, c) = …, optionally with settings like b:3 or c:deg.` }
  }
  const { name, settings } = target
  if (!settings.length) return { name }
  const d = declarationOf(name, settings)
  if ('error' in d) return d
  if (d.unit === PERCENT) return { error: `${name}:percent isn't available when unpacking; show it as a percentage on a line of its own.` }
  for (const setting of d.moduleSettings ?? []) {
    const problem = moduleSettingProblem(name, setting, SETTING_PLACE.unpacked)
    if (problem) return { error: problem }
  }
  return { name, sf: d.sf, unit: d.unit, notation: d.notation }
}

/** Whether a setting is a notation (`sci`, `dec`). */
export const isNotation = (s: string): s is Notation => NOTATION.has(s)

/** The display settings on a line's assigned name (the line's shape: tree/shapes.ts), or an error if one isn't understood; null if it has none. */
export function parseDeclaration(line: string): Declaration | { error: string } | null {
  const { target } = lineShape(line)
  if (target?.kind !== NODE_KIND.assigned || !target.settings.length) return null
  return declarationOf(target.name, target.settings)
}

/** A name's display settings (each as typed, without its `:`), read, or an error if one isn't understood. */
export function declarationOf(name: string, specs: readonly string[]): Declaration | { error: string } {
  const out: Declaration = { name }
  for (const spec of specs) {
    const template = TEMPLATE_USE.exec(spec)?.groups
    if (spec.startsWith(LABEL_QUOTE)) out.label = spec.slice(1, -1)
    else if (template) out.template = { name: template.template, args: template.arguments.split(',').map((a) => a.trim()) }
    else if (isModuleLineSetting(spec)) (out.moduleSettings ??= []).push(spec)
    else if (spec === EXACT_SETTING) out.sf = EXACT_SETTING
    else if (isNotation(spec)) {
      if (out.notation && out.notation !== spec) return { error: `${name} can't be both :${NOTATION.sci} and :${NOTATION.dec}.` }
      out.notation = spec
    } else if (/^\d+$/.test(spec)) {
      if (Number(spec) === 0) return { error: `${name}:0 isn't valid; use at least 1 sig fig, or :exact.` }
      out.sf = Number(spec)
    } else if (spec === PERCENT || isValidUnit(spec)) out.unit = spec
    else return { error: `In ${name}:${spec}, "${spec}" isn't a number of sig figs, a unit, or a setting like sci or ijk.` }
  }
  return out
}
