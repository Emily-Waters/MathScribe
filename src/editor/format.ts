/**
 * Formatting the sheet in the editor (Ctrl/⌘+Shift+F): the tree's formatting
 * (lib/tree/format.ts) as changes to the editor's text, so the cursor and the
 * selection stay with what they were on, and it undoes in one step.
 */
import type { Command } from '@codemirror/view'
import { formatChanges } from '../lib/tree/index.ts'

/** The key that formats the sheet: Ctrl+Shift+F (⌘+Shift+F on a Mac). */
export const FORMAT_KEY = 'Mod-Shift-f'

/** Format the sheet in the editor. */
export const formatDocument: Command = (view) => {
  const changes = formatChanges(view.state.doc.toString())
  if (changes.length) view.dispatch({ changes, userEvent: 'format' })
  return true
}
