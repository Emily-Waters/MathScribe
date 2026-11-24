/**
 * The formula module's reader, for its block (its grammar.ts): `@formula { }`,
 * a card of formulas, each typeset and not worked out. See ReadsLines.
 */
import {
  BLOCK_CLOSE, BLOCK_KIND, bodyLines, type CardEntry, NodeReader, type SheetReader, SIGIL, type TreeItem,
} from '../../lib/plugin.ts'
import { FORMULA_NODE } from './grammar.ts'
import { FORMULA_BLOCK } from './syntax.ts'

/** An `@formula { }` block's title, on its card. */
export const FORMULA_TITLE = 'Formulas'

/** `@formula { F = m * a }`: each line a formula, its names symbols (Calculator.formulaTex), read where it's written. */
export class FormulaReader extends NodeReader {
  readonly kinds = [FORMULA_NODE.block]

  read(item: TreeItem, sheet: SheetReader): void {
    const { line } = item
    const entries = bodyLines(item).filter((l) => l.parts.body).map(({ number, parts }): CardEntry => (
      { line: number, source: parts.body, note: parts.note, ...sheet.calc.formulaTex(parts.body) }
    ))
    sheet.add({
      kind: BLOCK_KIND.card, title: FORMULA_TITLE, line: line.number, endLine: item.last + 1, note: line.parts.note, entries, defines: [],
      error: item.closer ? undefined : `The ${SIGIL}${FORMULA_BLOCK} block on line ${line.number} is missing its closing ${BLOCK_CLOSE}.`,
    })
  }
}
