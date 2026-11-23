/**
 * The chemistry module's readers, for its kinds of node (its grammar.ts): species'
 * names (`@chem.species { }`, or one on a line of its own) and a reaction on a
 * line of its own (`{2 H2 + O2 -> 2 H2O}`). See ReadsLines.
 */
import {
  BLOCK_CLOSE, BLOCK_KIND, bodyLines, type CardBlock, type CardEntry, type DefinedName, NodeReader,
  type SheetReader, SheetWideReader, SIGIL, SYMBOL_KIND, type TreeItem,
} from '../../lib/plugin.ts'
import { REACTION_LINE, formulaTex, setSpeciesNames, type SpeciesNames } from './chemistry.ts'
import { CHEM_NODE } from './grammar.ts'
import { CHEM_NAMESPACE, SPECIES_BLOCK, SPECIES_DISPLAY, SPECIES_ENTRY, SPECIES_LINE, type SpeciesDisplay } from './syntax.ts'

/** An `@chem.species { }` block's title, on its card. */
const SPECIES_TITLE = 'Species'

/** A species' name and its formula, as LaTeX: dietzeite = 7Ca(IO₃)₂·8CaCrO₄. */
const speciesEntryTex = (species: string, formula: string) => `\\mathrm{${species}} = ${formulaTex(formula)}`

/**
 * Species' names, `@chem.species { dietzeite = {…} }`, or one on a line of its
 * own: they apply to the whole sheet, so they're read first, and `{dietzeite}`
 * then works anywhere braces take a formula, above the block too.
 */
export class SpeciesReader extends SheetWideReader<CardBlock> {
  readonly kinds = [CHEM_NODE.species, CHEM_NODE.speciesLine]
  private readonly names: SpeciesNames

  constructor(names: SpeciesNames) {
    super()
    this.names = names
  }

  override prepare(sheet: SheetReader): void {
    const names = this.names
    setSpeciesNames(names)
    /** The names the block defines: each species' that's defined, usable anywhere in braces, `{dietzeite}`. */
    let defines: DefinedName[] = []
    /** A species named: its line on the card, `dietzeite = 7Ca(IO₃)₂·8CaCrO₄`. */
    const name = (line: number, source: string, note: string | undefined, species: string, display: string | undefined, formula: string): CardEntry => {
      const shownAs = (display as SpeciesDisplay | undefined) ?? SPECIES_DISPLAY.name
      const error = names.define(species, formula, shownAs)
      if (!error) {
        defines.push({
          name: species, kind: SYMBOL_KIND.braced, line, tex: formulaTex(formula), detail: 'your species',
          about: `Your species ${species}, named on line ${line}: {${species}} is this formula`,
        })
      }
      return { line, source, tex: speciesEntryTex(species, formula), note, error }
    }
    for (const item of sheet.allItems()) {
      const { line } = item
      const opener = line.parts
      if (item.node.kind === CHEM_NODE.speciesLine) {
        const single = SPECIES_LINE.exec(opener.body)!
        defines = []
        const entry = name(line.number, opener.body, opener.note, single[1], single[2], single[3])
        this.prepared.set(item, {
          kind: BLOCK_KIND.card, title: SPECIES_TITLE, line: line.number, endLine: line.number, entries: [entry], defines, single: true,
        })
        continue
      }
      if (item.node.kind !== CHEM_NODE.species) continue
      defines = []
      // (Each line's body and note as the tree read them.)
      const entries = bodyLines(item).filter((l) => l.trimmed).map(({ number, parts }): CardEntry => {
        const m = SPECIES_ENTRY.exec(parts.body)
        return m
          ? name(number, parts.body, parts.note, m[1], m[2], m[3])
          : { line: number, source: parts.body, tex: '', note: parts.note, error: `Inside ${SIGIL}${CHEM_NAMESPACE}.${SPECIES_BLOCK}, each line names a species: dietzeite = {7Ca(IO3)2*8CaCrO4}.` }
      })
      this.prepared.set(item, {
        kind: BLOCK_KIND.card, title: SPECIES_TITLE, line: line.number, endLine: item.last + 1, note: opener.note, entries, defines,
        error: item.closer ? undefined : `The ${SIGIL}${CHEM_NAMESPACE}.${SPECIES_BLOCK} block on line ${line.number} is missing its closing ${BLOCK_CLOSE}.`,
      })
    }
  }
}

/** `{OH^- + H3O^+ -> 2 H2O}`: a formula on its own, a reaction, displayed (not worked out). */
export class ReactionLineReader extends NodeReader {
  readonly kinds = [CHEM_NODE.reaction]
  private readonly names: SpeciesNames

  constructor(names: SpeciesNames) {
    super()
    this.names = names
  }

  read({ line }: TreeItem, sheet: SheetReader): void {
    const reaction = REACTION_LINE.exec(line.parts.body)!
    // (A species' name in it is its formula: a reaction is drawn atom by atom.)
    sheet.add({ kind: BLOCK_KIND.latex, line: line.number, latex: formulaTex(this.names.expandFormula(reaction[1])) })
  }
}
