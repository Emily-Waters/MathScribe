/**
 * Chemistry as an engine module: species as units (`5.00 g {H2O}`), their
 * rules, a sheet's species names, and reactions (`r = @chem.reaction({…})`).
 * What it does is in chemistry.ts and species.ts; this is where the engine
 * meets it, through EngineModule's hooks.
 */
import { isConstantNode, isSymbolNode, type FunctionNode, type MathNode, type MathType, type Unit } from 'mathjs'
import type { Namespace } from '../../../builtins.ts'
import type { BuiltinConstant, NamespaceConstant } from '../../../constants.ts'
import { memberName } from '../../../names.ts'
import { UNIT } from '../../../mathjsNames.ts'
import { EXACT } from '../../../sigfigs.ts'
import { math } from '../../core/math.ts'
import { EngineModule, type ModuleHost, type ReadUnit } from '../../core/module.ts'
import type { LineResult } from '../../core/results.ts'
import { isLitCall, symbolTex } from '../../core/tex.ts'
import { unwrap } from '../../core/nodes.ts'
import {
  SPECIES_AFTER_UNIT, SPECIES_KIND, SpeciesNames, formulaTex, isFormulaSubscript, isSpeciesUnit,
  parseReaction, reactionImbalance, reactionMemberName, readableSpecies, setSpeciesNames, showSpeciesOnLine, speciesOf,
  speciesTex, withFormulas, type ReactionTerm,
} from './chemistry.ts'
import {
  SPECIES_RATIO_UNIT, expandSpeciesAfterValues, isOneMole, isSpeciesCount, speciesOfConstant, speciesProblem,
  speciesUnitName, speciesUnits, withSpecies, withoutSpecies, withoutSpeciesUnits,
} from './species.ts'
import { chemNamespace } from './namespace.ts'
import {
  ANY_SPECIES_FUNCTION, REACTION_DEFINITION, SPECIES_DISPLAYS, SPECIES_FUNCTION, type SpeciesDisplay,
} from './syntax.ts'

/** Whether a setting on an assigned name says how its line's named species are shown (`m:formula`). */
const isSpeciesDisplay = (setting: string): setting is SpeciesDisplay => (SPECIES_DISPLAYS as readonly string[]).includes(setting)

export class ChemistryModule extends EngineModule {
  readonly name = 'chemistry'

  /** The species the sheet names (`@chem.species { dietzeite = {…} }`), named before anything else is worked out. */
  readonly names = new SpeciesNames()

  // -------------------------------------------------------------------------
  // Shared
  // -------------------------------------------------------------------------

  override install(): void {
    math.import({
      [SPECIES_FUNCTION.shown]: withSpecies,
      [SPECIES_FUNCTION.quiet]: withSpecies,
      [ANY_SPECIES_FUNCTION]: withoutSpecies,
      [SPECIES_FUNCTION.plain]: withoutSpecies,
    })
  }

  /** `@chem`: molar masses, @chem.total, @chem.reaction and the @chem.species block. */
  override namespace(): Namespace {
    return chemNamespace()
  }

  override isLabelUnit(unitName: string): boolean {
    return isSpeciesUnit(unitName)
  }

  override labelUnitTex(unitName: string, alone: boolean): string | undefined {
    const species = speciesOf(unitName)
    if (!species) return undefined
    // A ratio of species alone: mol X / mol EDTA, or g Cl / g AgCl.
    // (A named species is shown by its name, or its formula, as its declaration or the line says: speciesTex.)
    return alone ? `\\mathrm{${SPECIES_RATIO_UNIT[species.kind]}}\\,${speciesTex(species.formula)}` : speciesTex(species.formula)
  }

  /** The species after a unit: `mol {EDTA}` (an amount), `g {NaOH}` (a mass), `g/mol {H2O}` (a molar mass). */
  override readAfterUnit(src: string, unit: ReadUnit): ReadUnit | undefined {
    const species = SPECIES_AFTER_UNIT.exec(src.slice(unit.end))
    if (!species) return undefined
    // Each species beside the unit it qualifies, as mathjs writes them: (g H2O) / (mol H2O).
    const u = math.unit(1, unit.text)
    return {
      text: (math.multiply(u, math.unit(1, speciesUnits(u.dimensions, species[1]))) as Unit).formatUnits(),
      end: unit.end + species[0].length,
    }
  }

  override rewriteExpression(src: string): string {
    return expandSpeciesAfterValues(src)
  }

  /** Giving or taking a species isn't written, only what it's given to. */
  override readonly unwrittenFunctions: readonly string[] = [ANY_SPECIES_FUNCTION, SPECIES_FUNCTION.quiet, SPECIES_FUNCTION.plain]

  override subscriptTex(subscript: string): string | undefined {
    return isFormulaSubscript(subscript) ? formulaTex(subscript) : undefined
  }

  override markupText(text: string): string {
    return withFormulas(text)
  }

  override readableMessage(message: string): string {
    return readableSpecies(message)
  }

  override readonly unitMismatchNote = 'That includes amounts of different species (mol {Na^+} and mol {Cl^-}).'

  override readonly lineSettings: readonly string[] = SPECIES_DISPLAYS

  // -------------------------------------------------------------------------
  // Per calculator
  // -------------------------------------------------------------------------

  /** A species' name in braces is its formula: `{dietzeite}` is `{7Ca(IO3)2*8CaCrO4}`. */
  override rewriteLine(text: string): string {
    return this.names.expand(text)
  }

  /** Units and messages show a named species by its name (see speciesTex). */
  override beginLine(): void {
    setSpeciesNames(this.names)
  }

  /** `m:formula = …` / `m:name = …`: how the named species on this line are shown. */
  override useLineSettings(settings: readonly string[]): void {
    showSpeciesOnLine(settings.find(isSpeciesDisplay))
  }

  override endLine(): void {
    showSpeciesOnLine(undefined)
  }

  /** `r = @chem.reaction({2 H2 + O2 -> 2 H2O})`: a balanced reaction, whose coefficients are its members. */
  override evaluateLine(input: string, host: ModuleHost): LineResult | undefined {
    const reaction = REACTION_DEFINITION.exec(input.trim())
    return reaction ? this.evaluateReaction(reaction[1], reaction[2], host) : undefined
  }

  override functionTex(n: FunctionNode, tex: (n: MathNode) => string): string | undefined {
    switch (n.fn.name) {
      // Taking a species off (in `@chem.total(…)`) isn't written: n_Na + n_Cl.
      case ANY_SPECIES_FUNCTION:
        return tex(n.args[0])
      // An element's term in a compound's molar mass, without its species (15.999 g/mol, not g O/mol O).
      case SPECIES_FUNCTION.plain:
        return tex(withoutSpeciesUnits(n.args[0]))
      // @chem.mm's compound as just its value (its species shows in its unit).
      case SPECIES_FUNCTION.quiet:
        return tex(n.args[0])
      // A value given its species: `(18.02 g / 1 mol) {H2O}` as the value then the formula.
      case SPECIES_FUNCTION.shown: {
        if (!isConstantNode(n.args[1])) return undefined
        const of = unwrap(n.args[0])
        const value = tex(of)
        const bracketed = isSymbolNode(of) || isConstantNode(of) || isLitCall(of) ? value : `\\left(${value}\\right)`
        return `${bracketed}\\,${formulaTex(String(n.args[1].value))}`
      }
      default:
        return undefined
    }
  }

  /** `1 mol` (per one mole, as in a molar mass), and a whole number of a species (`2 mol {H2O}`, a coefficient) are exact. */
  override isExactCount(number: MathNode, unit: MathNode, literals: Map<number, string>): boolean {
    return isSpeciesCount(number, unit, literals) || isOneMole(number, unit, literals)
  }

  /** A built-in constant of a species (@chem.mm.Na) is given it once rounded. */
  override constantValue(value: unknown, constant: BuiltinConstant | NamespaceConstant | undefined): unknown {
    return speciesOfConstant(value as MathType, constant)
  }

  /** A value with species follows their rules, whatever it was worked out from. */
  override valueProblem(value: unknown): string | undefined {
    return speciesProblem(value)
  }

  /**
   * A named reaction, `r = @chem.reaction({2 H2 + O2 -> 2 H2O})`: checked to
   * balance (each element's atoms, and the charge), then each species'
   * coefficient is a member, an exact amount of it: r.H2 is 2 mol H2, r.H2O
   * 2 mol H2O, so r.H2O / r.H2 is the mole ratio from H2 to H2O. A formula
   * that isn't a name (Ca(OH)2, Na^+) is a member by its letters and digits:
   * r.CaOH2, r.Na.
   */
  private evaluateReaction(name: string, written: string, host: ModuleHost): LineResult {
    const tex = `${symbolTex(name)}:\\quad ${formulaTex(written)}`
    const parsed = parseReaction(written)
    if ('error' in parsed) return { tex, error: parsed.error }
    const imbalance = reactionImbalance(parsed)
    if (imbalance) return { tex, error: `{${written.trim()}}: ${imbalance}` }
    const terms = [...parsed.reactants, ...parsed.products]
    const members = new Map<string, ReactionTerm>()
    for (const t of terms) {
      // A named species is a member by its name: r.dietzeite.
      const member = this.names.nameOf(t.formula)?.name ?? reactionMemberName(t.formula)
      const other = members.get(member)
      if (other && other.formula !== t.formula) {
        return { tex, error: `${other.formula} and ${t.formula} would both be ${name}.${member}: write one of them differently.` }
      }
      members.set(member, t)
    }
    for (const [member, t] of members) {
      host.store(memberName(name, member), {
        value: math.unit(t.coefficient, `${UNIT.mole} ${speciesUnitName(t.formula, SPECIES_KIND.amount)}`),
        sf: EXACT,
        // r.H2O is written r with H₂O below.
        symbol: `${symbolTex(name)}_{${formulaTex(t.formula)}}`,
      })
    }
    const listed = [...members].map(([member, t]) => `${name}.${member} = ${t.coefficient} mol ${t.formula}`).join(', ')
    return {
      tex,
      info: `Balanced. Each species' coefficient is an amount of it: ${listed}. A mole ratio is one over another, as in ${name}.${[...members.keys()].at(-1)} / ${name}.${[...members.keys()][0]}.`,
      defines: [...members.keys()].map((member) => ({ name: memberName(name, member) })),
    }
  }
}
