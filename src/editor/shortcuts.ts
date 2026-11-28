/**
 * MathScribe's keyboard shortcuts: the keys, named once (as CodeMirror names
 * them: `Mod` is Ctrl, or ⌘ on a Mac), which the editor binds and the
 * Reference lists (its Keyboard shortcuts), so the list is the keys as they're bound.
 */
import { FORMAT_KEY } from './format.ts'
import { BETWEEN_KEY_PARTS, KEY_JOIN, KEY_LABEL } from './syntax.ts'

/** The keys MathScribe binds, and CodeMirror's own that the list shows. */
export const EDITOR_KEY = {
  save: 'Mod-s',
  saveAs: 'Mod-Shift-s',
  open: 'Mod-o',
  format: FORMAT_KEY,
  find: 'Mod-f',
  suggest: 'Mod-Space',
  rename: 'F2',
  definition: 'F12',
  comment: 'Mod-/',
  moveUp: 'Alt-ArrowUp',
  moveDown: 'Alt-ArrowDown',
  duplicateUp: 'Shift-Alt-ArrowUp',
  duplicateDown: 'Shift-Alt-ArrowDown',
  deleteLine: 'Shift-Mod-k',
  indent: 'Tab',
  dedent: 'Shift-Tab',
  undo: 'Mod-z',
  redo: 'Mod-y',
} as const

/** A shortcut, as the list shows it: its keys (or what to do), and what it does. */
export interface Shortcut {
  readonly keys: readonly string[]
  /** Something done with the mouse, or a key's condition, shown after the keys (`Ctrl+Click`, `nothing selected`). */
  readonly also?: string
  readonly does: string
}

/** The shortcuts, in the order the list shows them. */
export const SHORTCUTS: readonly Shortcut[] = [
  { keys: [EDITOR_KEY.save, EDITOR_KEY.saveAs], does: 'Save / save as (formats the sheet first)' },
  { keys: [EDITOR_KEY.open], does: 'Open' },
  { keys: [EDITOR_KEY.format], does: 'Format the sheet, without saving' },
  { keys: [EDITOR_KEY.find], does: 'Find and replace' },
  { keys: [EDITOR_KEY.suggest], does: 'Show suggestions' },
  { keys: [EDITOR_KEY.rename], does: 'Rename a variable or function everywhere in scope' },
  { keys: [EDITOR_KEY.definition], also: 'Ctrl+Click', does: 'Go to where a name is defined' },
  { keys: [EDITOR_KEY.comment], does: 'Comment or uncomment' },
  { keys: ['Mod-x', 'Mod-c'], also: 'nothing selected', does: 'Cut / copy the whole line' },
  { keys: [EDITOR_KEY.moveUp, EDITOR_KEY.moveDown], does: 'Move the line up / down' },
  { keys: [EDITOR_KEY.duplicateUp, EDITOR_KEY.duplicateDown], does: 'Duplicate the line' },
  { keys: [EDITOR_KEY.deleteLine], does: 'Delete the line' },
  { keys: [EDITOR_KEY.indent, EDITOR_KEY.dedent], does: 'Indent / dedent' },
  { keys: [EDITOR_KEY.undo, EDITOR_KEY.redo], does: 'Undo / redo' },
]

// (How a key's parts are shown, and joined, are the editor's vocabulary: syntax.ts.)
const JOIN = KEY_JOIN

/** A key, as CodeMirror names it (`Mod-Shift-f`), as a person reads it: `Ctrl+Shift+F`, or `⌘⇧F` on a Mac. */
export function keyLabel(key: string, mac: boolean): string {
  // (Split at each `-` between parts: `Mod-/`'s last part is `/`, and a `-` key's is `-`.)
  const parts = key.split(BETWEEN_KEY_PARTS)
  const shown = parts.map((part) => {
    const label = KEY_LABEL[part]
    if (label) return mac ? label.mac : label.other
    return part.length === 1 ? part.toUpperCase() : part
  })
  return shown.join(mac ? JOIN.mac : JOIN.other)
}
