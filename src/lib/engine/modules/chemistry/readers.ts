/**
 * The chemistry module's readers, for its kinds of node (its grammar.ts): species'
 * names (`@chem.species { }`, or one on a line of its own) and a reaction on a
 * line of its own (`{2 H2 + O2 -> 2 H2O}`). See ReadsLines.
 */
import { BLOCK_CLOSE, LINE_COMMAND, SIGIL } from '../../../syntax.ts'
import { BLOCK_KIND, type SpeciesBlock, type SpeciesEntry } from '../../../sheet/blocks.ts'
import { NodeReader, SheetWideReader, bodyLines, type TreeItem } from '../../../reading/reader.ts'
import type { SheetReader } from '../../../reading/sheetReader.ts'
import { REACTION_LINE, formulaTex, setSpeciesNames, type SpeciesNames } from './chemistry.ts'
import { CHEM_NODE } from './grammar.ts'
import { CHEM_NAMESPACE, SPECIES_BLOCK, SPECIES_DISPLAY, SPECIES_ENTRY, SPECIES_LINE, type SpeciesDisplay } from './syntax.ts'

/**
 * Species' names, `@chem.species { dietzeite = {…} }`, or one on a line of its
 * own: they apply to the whole sheet, so they're read first, and `{dietzeite}`
 * then works anywhere braces take a formula, above the block too.
 */
export class SpeciesReader extends SheetWideReader<SpeciesBlock> {
  readonly kinds = [CHEM_NODE.species, CHEM_NODE.speciesLine]
  private readonly names: SpeciesNames

  constructor(names: SpeciesNames) {
    super()
    this.names = names
  }

  override prepare(sheet: SheetReader): void {
    const names = this.names
    setSpeciesNames(names)
    const name = (line: number, note: string | undefined, species: string, display: string | undefined, formula: string): SpeciesEntry => {
      const shownAs = (display as SpeciesDisplay | undefined) ?? SPECIES_DISPLAY.name
      return { line, name: species, formula, display: shownAs, note, error: names.define(species, formula, shownAs) }
    }
    for (const item of sheet.allItems()) {
      const { line } = item
      const opener = line.parts
      if (item.node.kind === CHEM_NODE.speciesLine) {
        const single = SPECIES_LINE.exec(opener.body)!
        const entry = name(line.number, opener.note, single[1], single[2], single[3])
        this.prepared.set(item, {
          kind: BLOCK_KIND.species, line: line.number, endLine: line.number, entries: [entry], single: true, hidden: opener.command === LINE_COMMAND.hide,
        })
        continue
      }
      if (item.node.kind !== CHEM_NODE.species) continue
      // (Each line's body and note as the tree read them.)
      const entries = bodyLines(item).filter((l) => l.trimmed).map(({ number, parts }): SpeciesEntry => {
        const m = SPECIES_ENTRY.exec(parts.body)
        return m
          ? name(number, parts.note, m[1], m[2], m[3])
          : { line: number, name: parts.body, formula: '', display: SPECIES_DISPLAY.name, error: `Inside ${SIGIL}${CHEM_NAMESPACE}.${SPECIES_BLOCK}, each line names a species: dietzeite = {7Ca(IO3)2*8CaCrO4}.` }
      })
      this.prepared.set(item, {
        kind: BLOCK_KIND.species, line: line.number, endLine: item.last + 1, note: opener.note, entries, single: false,
        hidden: opener.command === LINE_COMMAND.hide,
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
