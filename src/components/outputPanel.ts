/**
 * A module's panel in the Output pane's place: something it draws to edit what
 * the sheet says another way than typing (the series module's grid for a
 * table, opened from its ⚙). One at a time; the pane shows it, with its title
 * and a × back to the output, until it's closed or another sheet is shown.
 *
 * The panel edits the sheet's text, so the text is always what's shown: it's
 * given the text as it is now and a way to replace it, and the blocks the
 * sheet was read into (a table's worked-out cells).
 */
import { useSyncExternalStore, type ReactNode } from 'react'
import type { CustomBlock } from '../lib/sheet/blocks.ts'

/** What a panel is drawn with. */
export interface OutputPanelProps {
  /** The sheet's text, as it is now. */
  readonly source: string
  /** Replace the sheet's text (as typing would: it can be undone). */
  readonly setSource: (text: string) => void
  /** The block of a module's own kind a line made, if any (a table's, with its worked-out cells). */
  readonly customBlockAt: (line: number) => CustomBlock | undefined
  /** Close it, back to the output. */
  readonly close: () => void
}

/** A module's panel: its title in the pane's header, and how it's drawn. */
export interface OutputPanel {
  readonly title: string
  /** What opened it (a table's place among the sheet's), so its button can tell whether it's its own that's open. */
  readonly key: string
  readonly view: (props: OutputPanelProps) => ReactNode
}

let shown: OutputPanel | null = null
const listeners = new Set<() => void>()

/** Show a panel in the Output pane's place (`null`: back to the output). */
export function showOutputPanel(panel: OutputPanel | null): void {
  if (panel === shown) return
  shown = panel
  for (const l of listeners) l()
}

/** The panel shown now, if any. */
export const outputPanel = (): OutputPanel | null => shown

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The panel shown now, if any, for a component that redraws when it changes. */
export const useOutputPanel = (): OutputPanel | null => useSyncExternalStore(subscribe, outputPanel, outputPanel)
