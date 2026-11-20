/**
 * Captions' numbers in the Rendered tab, as the exports number them: `Table 2:
 * Runs`. (Kept apart from context.ts, which the module API shares, since this
 * reads the modules' kinds of block.)
 */
import { moduleBlockKind } from '../../lib/engine/index.ts'
import { BLOCK_KIND, isContainer, type Block, type CaptionKind } from '../../lib/sheet/blocks.ts'

/**
 * Each block's number among its kind of caption's in the sheet, in the order
 * they're written (blocks inside others too), as the exports number them: a
 * block of a module's own kind has one if its kind says (ModuleBlockKind's
 * `caption`); hidden and wrong ones, which the exports leave out, aren't counted.
 */
export function captionNumbers(blocks: readonly Block[]): Map<Block, number> {
  const numbers = new Map<Block, number>()
  const counts = new Map<CaptionKind, number>()
  const visit = (b: Block) => {
    if (isContainer(b)) b.children.forEach(visit)
    else if (b.kind === BLOCK_KIND.custom && !b.hidden && !b.error) {
      const kind = moduleBlockKind(b.type)?.caption?.(b)
      if (kind === undefined) return
      const n = (counts.get(kind) ?? 0) + 1
      counts.set(kind, n)
      numbers.set(b, n)
    }
  }
  blocks.forEach(visit)
  return numbers
}
