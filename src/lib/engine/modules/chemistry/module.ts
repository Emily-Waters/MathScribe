/**
 * Chemistry as an engine module: species as units (`5.00 g {H2O}`), their
 * rules, a sheet's species names, and reactions (`r = @chem.reaction({…})`).
 * What it does is in chemistry.ts and species.ts; this is where the engine
 * meets it, through EngineModule's hooks.
 */
import { isConstantNode, isSymbolNode, type FunctionNode, type MathNode, type MathType, type Unit } from 'mathjs'
import type { Namespace } from '../../../builtins.ts'
import type { BuiltinConstant, NamespaceConstant } from '../../../constants.ts'

import { math } from '../../core/math.ts'
import { EngineModule, type LineForm, type ReadUnit } from '../../core/module.ts'

import { isLitCall } from '../../core/tex.ts'
import { unwrap } from '../../core/nodes.ts'
import { SPECIES_AFTER_UNIT, SpeciesNames, formulaTex, isFormulaSubscript, isSpeciesUnit, readableSpecies, setSpeciesNames, showSpeciesOnLine, speciesOf, speciesTex, withFormulas } from './chemistry.ts'
import { SPECIES_RATIO_UNIT, expandSpeciesAfterValues, isOneMole, isSpeciesCount, speciesOfConstant, speciesProblem, speciesUnits, withSpecies, withoutSpecies, withoutSpeciesUnits } from './species.ts'
import { chemNamespace } from './namespace.ts'
import { ReactionForm } from './reaction.ts'
import { ReactionLineReader, SpeciesReader } from './readers.ts'
import type { LineReader, ReadsLines } from '../../../reading/reader.ts'
import { ANY_SPECIES_FUNCTION, SPECIES_DISPLAYS, SPECIES_FUNCTION, type SpeciesDisplay } from './syntax.ts'

/** Whether a setting on an assigned name says how its line's named species are shown (`m:formula`). */
const isSpeciesDisplay = (setting: string): setting is SpeciesDisplay => (SPECIES_DISPLAYS as readonly string[]).includes(setting)

export class ChemistryModule extends EngineModule implements ReadsLines {
  /** The species the sheet names (`@chem.species { dietzeite = {…} }`), named before anything else is worked out. */
  readonly names = new SpeciesNames()

  /** A named reaction, `r = @chem.reaction({2 H2 + O2 -> 2 H2O})`. */
  override readonly lineForms: readonly LineForm[] = [new ReactionForm(this.names)]

  /** Its lines of a sheet: species' names, and a reaction on a line of its own (see ReadsLines). */
  lineReaders(): LineReader[] {
    return [new SpeciesReader(this.names), new ReactionLineReader(this.names)]
  }

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

  override functionTex(n: FunctionNode, tex: (n: MathNode) => string): string | undefined {
    switch (n.fn.name) {
      // Taking a species off (in `@chem.total(…)`) isn't written: n_Na + n_Cl.
      case ANY_SPECIES_FUNCTION:
        return ` ${tex(n.args[0])}`
      // An element's term in a compound's molar mass, without its species (15.999 g/mol, not g O/mol O).
      case SPECIES_FUNCTION.plain:
        return ` ${tex(withoutSpeciesUnits(n.args[0]))}`
      // @chem.mm's compound as just its value (its species shows in its unit).
      case SPECIES_FUNCTION.quiet:
        return ` ${tex(n.args[0])}`
      // A value given its species: `(18.02 g / 1 mol) {H2O}` as the value then the formula.
      case SPECIES_FUNCTION.shown: {
        if (!isConstantNode(n.args[1])) return undefined
        const of = unwrap(n.args[0])
        const value = tex(of)
        const bracketed = isSymbolNode(of) || isConstantNode(of) || isLitCall(of) ? value : `\\left(${value}\\right)`
        return ` ${bracketed}\\,${formulaTex(String(n.args[1].value))}`
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
}
