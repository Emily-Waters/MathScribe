/**
 * A substance, `H2SO4 = @chem.substance({H2SO4})`: a formula, and an amount
 * of it, whose members are what follows from the two.
 *
 *   H2SO4.M        its molar mass, the sum of its elements': 2 M_H + M_S + 4 M_O
 *   H2SO4.n        its amount: 1 mol, until one is set
 *   H2SO4.m        its mass, n × M
 *   H2SO4.H.n      an element's amount in it: 2 mol H for each mol of it
 *   H2SO4.H.m      that element's mass, H.n × H.M
 *   H2SO4.H.M      the element's molar mass
 *   H2SO4.H.w      the element's mass fraction, H.m / m
 *
 * Any amount or mass can be set (`H2SO4.n = 2.00 mol`, `H2SO4.m = 5.00 g`,
 * `H2SO4.H.m = 0.10 g`): the substance's amount follows from it, and every
 * member from that, from that line on (a sheet is read top to bottom, as a
 * variable assigned again is). A member on a line of its own shows how it's
 * worked out, back to what was set.
 *
 * Members are variables under the substance's name (H2SO4__H__n), worked out
 * by lines the module writes for the engine, so sig figs, uncertainty and
 * species units are the core's, as on any line.
 */
import { DISPLAY_MODE, MEMBER_DOT, NAME, NUMBER, SIGIL } from '../../../syntax.ts'
import type { Unit } from 'mathjs'
import { JOIN, memberName } from '../../../names.ts'
import { expandDots } from '../../core/memberAccess.ts'
import { UNIT } from '../../../mathjsNames.ts'
import { lexExpression } from '../../../tree/lexer.ts'
import { NODE_KIND, isToken } from '../../../tree/nodes.ts'
import { math } from '../../core/math.ts'
import { LINE_STAGE, LineForm, type FormLine, type ModuleHost } from '../../core/module.ts'
import type { LineResult } from '../../core/results.ts'
import { formulaTex, isSpeciesUnit, molarMassSum, parseFormula, speciesKey, splitCoefficient, type AtomCounts } from './chemistry.ts'
import { CHEM_FUNCTION, CHEM_NAMESPACE, SPECIES_FUNCTION } from './syntax.ts'
import type { ElementSymbol } from './elements.ts'

/** A substance's own members: its amount, mass and molar mass. */
export const SUBSTANCE_MEMBER = { amount: 'n', mass: 'm', molarMass: 'M' } as const
/** Each of its elements' members: the element's amount and mass in it, its molar mass, and its mass fraction. */
export const ELEMENT_MEMBER = { amount: 'n', mass: 'm', molarMass: 'M', massFraction: 'w' } as const

/** The amount a substance has until one is set: 1 mol, exact. */
const DEFAULT_AMOUNT = '1'

/** `H2SO4 = @chem.substance({H2SO4})` (1: the name, 2: what's in the brackets, the formula in braces). */
export const SUBSTANCE_DEFINITION = new RegExp(
  String.raw`^(${NAME})\s*=\s*@${CHEM_NAMESPACE}\.${CHEM_FUNCTION.substance}\((.*)\)\s*$`)

/** A formula in braces, as the whole of what's in the brackets: `{CuSO4*5H2O}` (1: the formula). */
const FORMULA_ARGUMENT = /^\s*\{([^{}]+)\}\s*$/

/** A member of a substance, set or on its own: `H2SO4.H.m = 0.10 g`, `H2SO4.m` (1: the name, 2: the path, dots first, 3: what it's set to). */
const MEMBER_LINE = new RegExp(String.raw`^(${NAME})((?:\.${NAME}){1,2})\s*(?:=(?!=)\s*(.*))?$`)

/** A plain number, which a set amount or mass is read as mol or g of. */
const PLAIN_NUMBER = new RegExp(`^${NUMBER}$`)

/** The unit a set value with none is read in: mol for an amount, g for a mass. */
const UNIT_OF = { [SUBSTANCE_MEMBER.amount]: UNIT.mole, [SUBSTANCE_MEMBER.mass]: 'g' } as Record<string, string>

/** A substance, as defined: its formula, and its atoms. */
interface Substance {
  readonly formula: string
  readonly atoms: AtomCounts
}

/** The sheet's substances, by name. */
export class Substances {
  private readonly byName = new Map<string, Substance>()

  define(name: string, s: Substance): void {
    this.byName.set(name, s)
  }

  /** A substance by name, if it's one here (defined, and its members in scope). */
  get(name: string, host: ModuleHost): Substance | undefined {
    const s = this.byName.get(name)
    return s && host.has(memberName(name, SUBSTANCE_MEMBER.molarMass)) ? s : undefined
  }
}

/** A member's inside name: H2SO4, [H, n] → H2SO4__H__n. */
const inside = (name: string, ...path: string[]) => memberName(name, path.join(JOIN))

/** What each member is worked out from, as the engine reads it. */
function definitions(name: string, s: Substance): Map<string, string> {
  const n = inside(name, SUBSTANCE_MEMBER.amount)
  const m = inside(name, SUBSTANCE_MEMBER.mass)
  const M = inside(name, SUBSTANCE_MEMBER.molarMass)
  const out = new Map<string, string>([
    // It's a molar mass of the substance: a mass of it per amount of it, g H2SO4 / mol H2SO4.
    [M, `${SPECIES_FUNCTION.quiet}(${molarMassSum(s.atoms)}, "${s.formula}")`],
    [m, `${n} * ${M}`],
  ])
  for (const [element, count] of s.atoms) {
    const at = (member: string) => inside(name, element, member)
    out.set(at(ELEMENT_MEMBER.molarMass), `${SIGIL}${[CHEM_NAMESPACE, CHEM_FUNCTION.molarMass, element].join(MEMBER_DOT)}`)
    // (Its count, as a mole ratio: 2 mol H for each mol of H2SO4.)
    out.set(at(ELEMENT_MEMBER.amount), `${n} * (${ratio(element, count, s.formula)})`)
    out.set(at(ELEMENT_MEMBER.mass), `${at(ELEMENT_MEMBER.amount)} * ${at(ELEMENT_MEMBER.molarMass)}`)
    out.set(at(ELEMENT_MEMBER.massFraction), `${SPECIES_FUNCTION.plain}(${at(ELEMENT_MEMBER.mass)}) / ${SPECIES_FUNCTION.plain}(${m})`)
  }
  return out
}

/** An element's count in a substance, as a mole ratio: `2 mol {H} / 1 mol {H2SO4}`. */
const ratio = (element: ElementSymbol, count: number, formula: string) =>
  `${count} ${UNIT.mole} {${element}} / 1 ${UNIT.mole} {${formula}}`

/**
 * A value as set, with the unit it's read in if it has none, and the species
 * it's of: `5.00` → 5.00 g {H2SO4}, `5.00 g` → 5.00 g {H2SO4} (the species
 * after its unit), `m_1 / 2` → (m_1 / 2) {H2SO4}.
 */
function setValue(value: string, member: string, species: string, host: ModuleHost): string {
  if (PLAIN_NUMBER.test(value)) return `${value} ${UNIT_OF[member]} {${species}}`
  // (Already of a species, `5.00 g {H2SO4}`, or worked out as one, `H2.n * r.H2O / r.H2`: as written.)
  if (hasSpecies(value, host)) return value
  const parts = lexExpression(value)
  const quantity = parts.length === 1 && !isToken(parts[0]) && parts[0].kind === NODE_KIND.quantity
  return quantity ? `${value} {${species}}` : `(${value}) {${species}}`
}

/** Whether a value, as typed, is of a species already (if it can be worked out here: otherwise its line explains it). */
function hasSpecies(value: string, host: ModuleHost): boolean {
  if (value.includes('{')) return true
  try {
    const v = host.evaluateExpression(expandDots(value))
    return math.isUnit(v) && (v as Unit).units.some((u) => isSpeciesUnit(u.unit.name))
  } catch {
    return false
  }
}

/**
 * The line form for substances: their definitions, a member set, and a member
 * on its own (shown with how it's worked out).
 */
export class SubstanceForm extends LineForm {
  /** (As written: `@chem.substance` isn't a namespace's member to read, nor are its members inside names yet.) */
  override readonly stage = LINE_STAGE.raw
  private readonly substances: Substances

  constructor(substances: Substances) {
    super()
    this.substances = substances
  }

  evaluate(line: FormLine, host: ModuleHost): LineResult | undefined {
    const definition = SUBSTANCE_DEFINITION.exec(line.text)
    if (definition) return this.define(definition[1], definition[2], line, host)
    const member = MEMBER_LINE.exec(line.text)
    if (!member) return undefined
    const [, name, typedPath, value] = member
    const s = this.substances.get(name, host)
    if (!s) return undefined
    const path = typedPath.slice(MEMBER_DOT.length).split(MEMBER_DOT)
    return value?.trim() ? this.set(name, s, path, value.trim(), line, host) : this.show(name, s, path, line, host)
  }

  /** `H2SO4 = @chem.substance({H2SO4})`: its molar mass worked out, an amount of 1 mol, and every member. */
  private define(name: string, argument: string, line: FormLine, host: ModuleHost): LineResult {
    const usage = `${name} = ${SIGIL}${CHEM_NAMESPACE}.${CHEM_FUNCTION.substance}({H2SO4})`
    const written = FORMULA_ARGUMENT.exec(argument)?.[1]
    if (written === undefined) return { tex: '', error: `A substance is one formula, in braces: ${usage}.` }
    const { coefficient, compound } = splitCoefficient(written.trim())
    const tex = formulaTex(written)
    if (coefficient) return { tex, error: `A substance is one formula, without a count: ${name} = @${CHEM_NAMESPACE}.${CHEM_FUNCTION.substance}({${compound}}).` }
    const atoms = parseFormula(compound)
    if ('error' in atoms) return { tex, error: atoms.error }
    const s: Substance = { formula: speciesKey(compound), atoms }
    this.substances.define(name, s)
    const defs = definitions(name, s)
    const M = inside(name, SUBSTANCE_MEMBER.molarMass)
    const shown = host.evaluateLine(`${M} = ${defs.get(M)}`, line.mode)
    if (shown.error) return { tex, error: shown.error }
    const error = this.setAmount(name, `${DEFAULT_AMOUNT} ${UNIT.mole} {${s.formula}}`, host) ?? this.recompute(name, s, host, [M])
    const elements = [...atoms.keys()]
    return {
      tex: `${formulaTex(s.formula)}:\\quad ${shown.tex}`,
      error,
      info: `${name} is 1 mol of ${s.formula} until its amount is set (${name}.n = …, or ${name}.m = …). `
        + `Its members: ${name}.M, .n, .m, and each element's, as ${name}.${elements[0]}.n, .m, .M and .w (its mass fraction).`,
      defines: [...defs.keys(), inside(name, SUBSTANCE_MEMBER.amount)].map((d) => ({ name: d })),
    }
  }

  /** `H2SO4.m = 5.00 g`: that member as set, the substance's amount from it, and every other member from that. */
  private set(name: string, s: Substance, path: string[], value: string, line: FormLine, host: ModuleHost): LineResult {
    const [first, second] = path
    const element = second === undefined ? undefined : first as ElementSymbol
    const member = second ?? first
    const settable = member === SUBSTANCE_MEMBER.amount || member === SUBSTANCE_MEMBER.mass
    if (!settable || (element !== undefined && !s.atoms.has(element))) {
      return { tex: '', error: this.unknownMember(name, s, path, true) }
    }
    const target = inside(name, ...path)
    const shown = host.evaluateLine(`${target} = ${setValue(value, member, element ?? s.formula, host)}`, line.mode)
    if (shown.error) return shown
    // The substance's amount, from what was set.
    const n = inside(name, SUBSTANCE_MEMBER.amount)
    let amount: string | undefined
    if (element === undefined) amount = member === SUBSTANCE_MEMBER.mass ? `${target} / ${inside(name, SUBSTANCE_MEMBER.molarMass)}` : undefined
    else {
      const elementAmount = member === SUBSTANCE_MEMBER.mass ? `${target} / ${inside(name, element, ELEMENT_MEMBER.molarMass)}` : target
      amount = `(${elementAmount}) / (${ratio(element, s.atoms.get(element)!, s.formula)})`
    }
    const error = (amount ? this.setAmount(name, amount, host) : undefined) ?? this.recompute(name, s, host, [target, n])
    return { ...shown, error }
  }

  /** `H2SO4.m` on its own: how it's worked out, `m = n × M = …`. (Its amount, as set, is shown as any variable is.) */
  private show(name: string, s: Substance, path: string[], line: FormLine, host: ModuleHost): LineResult | undefined {
    const target = inside(name, ...path)
    const definition = definitions(name, s).get(target)
    if (definition === undefined) {
      if (target === inside(name, SUBSTANCE_MEMBER.amount)) return undefined
      return { tex: '', error: this.unknownMember(name, s, path, false) }
    }
    return host.evaluateLine(`${target} = ${definition}`, line.mode)
  }

  /** The substance's amount, worked out from `amount` (an expression of its members, or a value). */
  private setAmount(name: string, amount: string, host: ModuleHost): string | undefined {
    const result = host.evaluateLine(`${inside(name, SUBSTANCE_MEMBER.amount)} = ${amount}`, DISPLAY_MODE.full)
    return result.error ? `${name}.n: ${result.error}` : undefined
  }

  /** Every member worked out again from the substance's amount (but those in `keep`, set already). */
  private recompute(name: string, s: Substance, host: ModuleHost, keep: string[]): string | undefined {
    for (const [member, definition] of definitions(name, s)) {
      if (keep.includes(member)) continue
      const result = host.evaluateLine(`${member} = ${definition}`, DISPLAY_MODE.full)
      if (result.error) return result.error
    }
    return undefined
  }

  /** What a substance's members are, for a member it doesn't have (or one that can't be set). */
  private unknownMember(name: string, s: Substance, path: string[], setting: boolean): string {
    const element = [...s.atoms.keys()][0]
    const typed = `${name}.${path.join('.')}`
    if (setting) {
      return `${typed} can't be set: set ${name}'s amount or mass (${name}.n, ${name}.m), or an element's (${name}.${element}.n, ${name}.${element}.m); `
        + 'the rest follow from it.'
    }
    return `${typed} isn't one of ${name}'s members: ${name}.M, .n, .m, and each element's, as ${name}.${element}.n, .m, .M and .w.`
  }
}
