/**
 * What the Output pane gives every block's view: the link between output and
 * source lines, line numbers as the editor shows them, and removing an import.
 * (Kept apart from the views, so editing a view reloads it in place.)
 */
import { createContext, useContext, type MouseEvent } from 'react'
import type { Block } from '../../lib/sheet/blocks.ts'

/** Linking between output and source lines: which line the cursor is on, and how to jump to one. */
export const LineLink = createContext<{ activeLine: number | null; onJump: (line: number) => void }>({
  activeLine: null,
  onJump: () => {},
})

/** Props that tie an element to a source line: highlight when active, jump to it on click. */
export function useLineLink() {
  const { activeLine, onJump } = useContext(LineLink)
  return (line: number) => ({
    'data-line': line,
    'data-active': line === activeLine ? 'true' : undefined,
    onClick: (e: MouseEvent) => {
      // Don't jump when the click ends a text selection in the output.
      if (window.getSelection()?.toString()) return
      e.stopPropagation()
      onJump(line)
    },
  })
}

/** Line numbers as the editor shows them, for messages (an import's data rows count as part of its line). */
export const LineNumbers = createContext<(line: number) => number>((line) => line)

/** Each captioned block's number among its kind's in the sheet (blocks/captions.ts captionNumbers). */
export const CaptionNumbers = createContext<ReadonlyMap<Block, number>>(new Map())

/** A captioned block's number (`Table 2`), as the exports number it; undefined for a block with no caption. */
export const useCaptionNumber = (block: Block): number | undefined => useContext(CaptionNumbers).get(block)

/** Removing an import and its data (the Remove button on its summary). */
export const ImportFile = createContext<((line: number) => void) | undefined>(undefined)
