/**
 * `@chem`: the chemistry module's members of the `@` tree.
 *
 *   @chem
 *   ├─ substance   a substance, H2SO4 = @chem.substance({H2SO4}): H2SO4.M, .n, .m, .H.n, …
 *   ├─ mm          the module's own (not typed in a sheet):
 *   │  └─ H, He, … each element's molar mass, which a substance's is worked out from
 *   ├─ total       amounts of different species added, @chem.total(n_Na, n_Cl)
 *   ├─ reaction    a balanced reaction, r = @chem.reaction({2 H2 + O2 -> 2 H2O})
 *   └─ species     the block naming species, @chem.species { … }
 */
import { BlockMember, ConstantMember, FunctionMember, LineFormMember, Namespace, type Expansion } from '../../../builtins.ts'
import { SIGIL } from '../../../syntax.ts'
import { splitArgs } from '../../../maths/solve.ts'
import { ANY_SPECIES_FUNCTION, CHEM_FUNCTION, CHEM_NAMESPACE, SPECIES_BLOCK } from './syntax.ts'
import { ELEMENTS, MOLAR_MASS_UNIT, elementDescription, type ElementSymbol } from './elements.ts'
import { formulaTex } from './chemistry.ts'

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
  tex: `M_{${formulaTex(symbol)}}`,
  description: elementDescription(symbol),
  species: symbol,
}))

/** What to write instead of `@chem.mm`, which is the module's own. */
const MOLAR_MASS_INSTEAD = 'a molar mass is a substance’s: H2O = @chem.substance({H2O}), then H2O.M (and an element’s, H2O.H.M).'

/** `@chem`, made fresh (a member belongs to one tree). */
export const chemNamespace = () => new Namespace(CHEM_NAMESPACE, 'Substances (@chem.substance), total( ), reactions and species names', [
  new LineFormMember(CHEM_FUNCTION.substance, '{formula}',
    'A substance: H2SO4 = @chem.substance({H2SO4}), then H2SO4.M, .n, .m, and each element’s, H2SO4.H.n, .m, .M, .w',
    `H2SO4 = ${SIGIL}${CHEM_NAMESPACE}.${CHEM_FUNCTION.substance}({H2SO4})`),
  new Namespace(CHEM_FUNCTION.molarMass, 'Each element’s molar mass, which a substance’s is worked out from', elementMembers(), { internal: MOLAR_MASS_INSTEAD }),
  new TotalFunction(),
  new ReactionFunction(),
  new BlockMember(SPECIES_BLOCK, 'Names for species, usable wherever braces take a formula: dietzeite = {7Ca(IO3)2*8CaCrO4}, then {dietzeite}'),
])
