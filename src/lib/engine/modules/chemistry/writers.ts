/**
 * How chemistry's parts of an expression are written as mathjs reads them
 * (core/writer.ts): a species gives a value its species.
 *  - After a unit, it's part of the unit: `2.0 mol {EDTA}` → (2.0 * unit("mol molEDTA")),
 *    in a quantity (the lexer reads it into one), or after `to` (`to mol {EDTA}`).
 *  - After a value (a name, a number, a call, a bracket), it's given to it:
 *    `n_1 {H2O}` → of(n_1, "H2O"), `(18.02 g / 1 mol) {H2O}` → of((…), "H2O").
 *  - After nothing it can be given to, it's left for mathjs to explain.
 */
import type { Unit } from 'mathjs'
import { GREEK_CHARS } from '../../../syntax.ts'
import { NODE_KIND, TOKEN_KIND, isToken, type Part } from '../../../tree/nodes.ts'
import { textOf } from '../../../tree/codec.ts'
import { math } from '../../core/math.ts'
import {
  isConversionUnit, isTokenOf, partBefore, quantitySource, unitCallSource, unitSource, type PartWriter,
} from '../../core/writer.ts'
import { CHEM_TOKEN } from './grammar.ts'
import { speciesUnits } from './species.ts'
import { SPECIES_FUNCTION } from './syntax.ts'

/** A species' formula, from its token: `{H2O}` → H2O. */
const formulaOf = (part: Part) => textOf(part).slice(1, -1)

/** A unit with a species, as mathjs writes it: mol and EDTA → `mol molEDTA` (each species beside the unit it qualifies). */
function speciesUnitSource(unit: string, formula: string): string {
  const u = math.unit(1, unit)
  return (math.multiply(u, math.unit(1, speciesUnits(u.dimensions, formula))) as Unit).formatUnits()
}

/** A token that runs on into the value before it, with no space between: a name's, a number's, a member's dot. */
const RUNS_ON = new RegExp(String.raw`^[\w.${GREEK_CHARS}]+$`)

/** Whether a part is a value a species can be given to (or a bracket closing one). */
const isValue = (part: Part) =>
  !isToken(part) || part.t === TOKEN_KIND.symbol || part.t === TOKEN_KIND.number || part.t === TOKEN_KIND.builtin
  || isTokenOf(part, TOKEN_KIND.delimiter, CLOSE)

const OPEN = '('
const CLOSE = ')'

/** Where the value ending at `last` starts: back to its bracket, and over what runs on into it (`r.H2O`, `2(x)`); -1 if it isn't one. */
function valueStart(parts: readonly Part[], last: number): number {
  if (!isValue(parts[last])) return -1
  let start = last
  if (isTokenOf(parts[last], TOKEN_KIND.delimiter, CLOSE)) {
    let depth = 0
    for (; start >= 0; start--) {
      if (isTokenOf(parts[start], TOKEN_KIND.delimiter, CLOSE)) depth++
      else if (isTokenOf(parts[start], TOKEN_KIND.delimiter, OPEN) && --depth === 0) break
    }
    if (start < 0) return -1
  }
  while (start > 0 && isToken(parts[start - 1]) && RUNS_ON.test(textOf(parts[start - 1]))) start--
  return start
}

export const CHEM_WRITERS: Readonly<Record<string, PartWriter>> = {
  /** A quantity of a species: `2.0 mol {EDTA}` → (2.0 * unit("mol molEDTA")). (Without one, the core's.) */
  [NODE_KIND.quantity]: ({ part, write }) => {
    if (isToken(part) || !part.parts.some((p) => isTokenOf(p, CHEM_TOKEN.species))) return undefined
    const unit = part.parts.find((p) => isTokenOf(p, TOKEN_KIND.unit))!
    const species = part.parts.filter((p) => isTokenOf(p, CHEM_TOKEN.species))
    const source = species.reduce((u, s) => speciesUnitSource(u, formulaOf(s)), unitSource(textOf(unit)))
    return { text: quantitySource(write([part.parts[0]]), source) }
  },
  /** A species after `to`'s unit, or after a value; after neither, as typed. */
  [CHEM_TOKEN.species]: ({ part, parts, index, written }) => {
    const before = partBefore(parts, index)
    if (before < 0) return undefined
    if (isTokenOf(parts[before], TOKEN_KIND.unit) && isConversionUnit(parts, before)) {
      return { text: unitCallSource(speciesUnitSource(unitSource(textOf(parts[before])), formulaOf(part))), from: before }
    }
    const start = valueStart(parts, before)
    if (start < 0) return undefined
    return { text: `${SPECIES_FUNCTION.shown}(${written.slice(start, before + 1).join('')}, "${formulaOf(part)}")`, from: start }
  },
}
