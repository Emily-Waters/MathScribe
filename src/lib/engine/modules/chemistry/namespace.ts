/**
 * `@chem`: the chemistry module's members of the `@` tree.
 *
 *   @chem
 *   ├─ mm          a compound's molar mass, @chem.mm({H2O}); and a namespace:
 *   │  └─ H, He, … each element's molar mass, @chem.mm.Na
 *   ├─ total       amounts of different species added, @chem.total(n_Na, n_Cl)
 *   ├─ reaction    a balanced reaction, r = @chem.reaction({2 H2 + O2 -> 2 H2O})
 *   └─ species     the block naming species, @chem.species { … }
 */
import { BlockMember, ConstantMember, FunctionMember, Namespace, type Expansion } from '../../../builtins.ts'
import { splitArgs } from '../../../solve.ts'
import { ANY_SPECIES_FUNCTION, CHEM_FUNCTION, CHEM_NAMESPACE, SPECIES_BLOCK, SPECIES_FUNCTION } from './syntax.ts'
import { ELEMENTS, MOLAR_MASS_UNIT, elementDescription, type ElementSymbol } from './elements.ts'
import { molarMassSum, parseFormula, speciesKey, splitCoefficient } from './chemistry.ts'

/** A formula in braces, as the whole of an argument: `{CuSO4*5H2O}` (1: the formula). */
const FORMULA_ARGUMENT = /^\{([^{}]+)\}$/

/** `@chem.mm({CuSO4*5H2O})`: a compound's molar mass, as the sum of its elements' (`@chem.mm.Cu + …`). */
class MolarMassFunction extends FunctionMember {
  readonly parameters = '{formula}'

  constructor() {
    super(CHEM_FUNCTION.molarMass, 'Molar mass of a compound, in g/mol: @chem.mm({CuSO4*5H2O})')
  }

  expand(args: string): Expansion {
    const formula = FORMULA_ARGUMENT.exec(args.trim())
    if (!formula) return { error: `${this.typed} takes one formula, in braces: ${this.typed}({CuSO4*5H2O}).` }
    // A coefficient, as in a balanced equation (`2 H2O`, `1/2 O2`), multiplies the compound's molar mass.
    const { coefficient, compound } = splitCoefficient(formula[1])
    const atoms = parseFormula(compound)
    if ('error' in atoms) return atoms
    const sum = molarMassSum(atoms)
    // It's a molar mass of the compound: a mass of it per amount of it, g H2O / mol H2O.
    const total = coefficient ? `(${coefficient}) * ${sum}` : sum
    return { text: `${SPECIES_FUNCTION.quiet}(${total}, "${speciesKey(compound)}")` }
  }
}

/** `@chem.total(n_Na, n_Cl)`: amounts of different species added, each with its species taken off. */
class TotalFunction extends FunctionMember {
  readonly parameters = 'n_1, n_2, …'

  constructor() {
    super(CHEM_FUNCTION.total, 'Amounts of different species added, as plain amounts')
  }

  expand(args: string): Expansion {
    const amounts = splitArgs(args).filter(Boolean)
    if (!amounts.length) return { error: `${this.typed} needs the amounts to add: ${this.typed}(n_Na, n_Cl).` }
    return { text: `(${amounts.map((a) => `${ANY_SPECIES_FUNCTION}(${a})`).join(' + ')})` }
  }
}

/**
 * `r = @chem.reaction({2 H2 + O2 -> 2 H2O})`: a balanced reaction, whose
 * coefficients are its members as amounts (r.H2O is 2 mol H2O), for mole ratios.
 * It's a line of its own (ChemistryModule reads it whole), so as part of an expression it's explained.
 */
class ReactionFunction extends FunctionMember {
  readonly parameters = '{reaction}'

  constructor() {
    super(CHEM_FUNCTION.reaction, 'A balanced reaction, named: r = @chem.reaction({2 H2 + O2 -> 2 H2O}); r.H2O / r.H2 is a mole ratio')
  }

  expand(): Expansion {
    return { error: `${this.typed}({…}) is written on a line of its own, with a name: r = ${this.typed}({2 H2 + O2 -> 2 H2O}). Then r.H2O / r.H2 is a mole ratio.` }
  }
}

/** Each element's molar mass, `@chem.mm.Na`: its weight as IUPAC writes it, in g/mol. */
const elementMembers = () => (Object.keys(ELEMENTS) as ElementSymbol[]).map((symbol) => new ConstantMember(symbol, {
  value: Number(ELEMENTS[symbol].weight),
  written: ELEMENTS[symbol].weight,
  unit: MOLAR_MASS_UNIT,
  tex: `M_{\\mathrm{${symbol}}}`,
  description: elementDescription(symbol),
  species: symbol,
}))

/** `@chem`, made fresh (a member belongs to one tree). */
export const chemNamespace = () => new Namespace(CHEM_NAMESPACE, 'The elements’ molar masses (@chem.mm.Na), mm( ) and total( )', [
  new Namespace(CHEM_FUNCTION.molarMass, 'An element’s molar mass: @chem.mm.Na', elementMembers(), { call: new MolarMassFunction() }),
  new TotalFunction(),
  new ReactionFunction(),
  new BlockMember(SPECIES_BLOCK, 'Names for species, usable wherever braces take a formula: dietzeite = {7Ca(IO3)2*8CaCrO4}, then {dietzeite}'),
])
