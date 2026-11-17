/**
 * A named reaction, `r = @chem.reaction({2 H2 + O2 -> 2 H2O})`: checked to
 * balance (each element's atoms, and the charge), then each species'
 * coefficient is a member, an exact amount of it: r.H2 is 2 mol H2, r.H2O
 * 2 mol H2O, so r.H2O / r.H2 is the mole ratio from H2 to H2O. A formula
 * that isn't a name (Ca(OH)2, Na^+) is a member by its letters and digits:
 * r.CaOH2, r.Na.
 */
import { memberName } from '../../../sheet/names.ts'
import { UNIT } from '../../../maths/mathjsNames.ts'
import { EXACT } from '../../../maths/sigfigs.ts'
import { math } from '../../core/math.ts'
import { LINE_STAGE, LineForm, type FormLine, type ModuleHost } from '../../core/module.ts'
import type { LineResult } from '../../core/results.ts'
import { symbolTex } from '../../core/tex.ts'
import {
  SPECIES_KIND, formulaTex, parseReaction, reactionImbalance, reactionMemberName, type ReactionTerm, type SpeciesNames,
} from './chemistry.ts'
import { speciesUnitName } from './species.ts'
import { REACTION_DEFINITION } from './syntax.ts'

export class ReactionForm extends LineForm {
  /** (As written: `@chem.reaction` isn't a namespace's member to read as an inside name.) */
  override readonly stage = LINE_STAGE.raw
  /** The sheet's species names: a named species is a member by its name (r.dietzeite). */
  private readonly names: SpeciesNames

  constructor(names: SpeciesNames) {
    super()
    this.names = names
  }

  evaluate(line: FormLine, host: ModuleHost): LineResult | undefined {
    const reaction = REACTION_DEFINITION.exec(line.text)
    if (!reaction) return undefined
    const [, name, written] = reaction
    const tex = `${symbolTex(name)}:\\quad ${formulaTex(written)}`
    const parsed = parseReaction(written)
    if ('error' in parsed) return { tex, error: parsed.error }
    const imbalance = reactionImbalance(parsed)
    if (imbalance) return { tex, error: `{${written.trim()}}: ${imbalance}` }
    const terms = [...parsed.reactants, ...parsed.products]
    const members = new Map<string, ReactionTerm>()
    for (const t of terms) {
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
