/**
 * The chemistry module's lines of a sheet: species' names (`@chem.species { }`)
 * and a reaction on a line of its own (`{2 H2 + O2 -> 2 H2O}`). They're offered
 * each line before MathScribe's own readers (see ReadsLines).
 */
import { BLOCK_CLOSE, LINE_COMMAND, SIGIL } from '../../../syntax.ts'
import { BLOCK_KIND, type SpeciesBlock, type SpeciesEntry } from '../../../blocks.ts'
import { splitNote } from '../../../reading/lineSyntax.ts'
import { LineReader, SheetWideReader, type Line } from '../../../reading/reader.ts'
import type { SheetReader } from '../../../reading/sheetReader.ts'
import { REACTION_LINE, formulaTex, setSpeciesNames, type SpeciesNames } from './chemistry.ts'
import {
  CHEM_NAMESPACE, SPECIES_BLOCK, SPECIES_DISPLAY, SPECIES_ENTRY, SPECIES_LINE, SPECIES_OPENER, type SpeciesDisplay,
} from './syntax.ts'

/**
 * Species' names, `@chem.species { dietzeite = {…} }`, or one on a line of its
 * own: they apply to the whole sheet, so they're read first, and `{dietzeite}`
 * then works anywhere braces take a formula, above the block too.
 */
export class SpeciesReader extends SheetWideReader<SpeciesBlock> {
  private readonly names: SpeciesNames

  constructor(names: SpeciesNames) {
    super()
    this.names = names
  }

  override prepare(sheet: SheetReader): void {
    const names = this.names
    setSpeciesNames(names)
    const name = (line: number, written: string, species: string, display: string | undefined, formula: string): SpeciesEntry => {
      const { note } = splitNote(written)
      const shownAs = (display as SpeciesDisplay | undefined) ?? SPECIES_DISPLAY.name
      return { line, name: species, formula, display: shownAs, note, error: names.define(species, formula, shownAs) }
    }
    const { lines } = sheet
    for (let i = 0; i < lines.length; i++) {
      const opener = splitNote(lines[i].trim())
      const single = SPECIES_LINE.exec(opener.body)
      if (single) {
        const entry = name(i + 1, lines[i].trim(), single[1], single[2], single[3])
        this.prepared.set(i, {
          end: i,
          block: { kind: BLOCK_KIND.species, line: i + 1, endLine: i + 1, entries: [entry], single: true, hidden: opener.command === LINE_COMMAND.hide },
        })
        continue
      }
      if (!SPECIES_OPENER.test(opener.body)) continue
      const body = this.body(lines, i)
      const entries = body.lines.filter((l) => l.text).map(({ index, text }): SpeciesEntry => {
        const m = SPECIES_ENTRY.exec(splitNote(text).body)
        return m
          ? name(index + 1, text, m[1], m[2], m[3])
          : { line: index + 1, name: splitNote(text).body, formula: '', display: SPECIES_DISPLAY.name, error: `Inside ${SIGIL}${CHEM_NAMESPACE}.${SPECIES_BLOCK}, each line names a species: dietzeite = {7Ca(IO3)2*8CaCrO4}.` }
      })
      this.prepared.set(i, {
        end: body.end,
        block: {
          kind: BLOCK_KIND.species, line: i + 1, endLine: body.end + 1, note: opener.note, entries, single: false,
          hidden: opener.command === LINE_COMMAND.hide,
          error: body.closed ? undefined : `The ${SIGIL}${CHEM_NAMESPACE}.${SPECIES_BLOCK} block on line ${i + 1} is missing its closing ${BLOCK_CLOSE}.`,
        },
      })
      i = body.end
    }
  }
}

/** `{OH^- + H3O^+ -> 2 H2O}`: a formula on its own, a reaction, displayed (not worked out). */
export class ReactionLineReader extends LineReader {
  private readonly names: SpeciesNames

  constructor(names: SpeciesNames) {
    super()
    this.names = names
  }

  read(line: Line, sheet: SheetReader): boolean {
    const reaction = REACTION_LINE.exec(line.parts.body)
    if (!reaction) return false
    // (A species' name in it is its formula: a reaction is drawn atom by atom.)
    sheet.add({ kind: BLOCK_KIND.latex, line: line.number, latex: formulaTex(this.names.expandFormula(reaction[1])) })
    return true
  }
}
