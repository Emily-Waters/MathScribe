/**
 * Line commands that keep imported data in one piece. An `import(…)` line and
 * the rows under it move, delete, cut and copy as a unit, so other lines can't
 * end up among the rows and the rows can't be left behind without their import:
 *
 * - Alt+↑ / Alt+↓ move a line past a whole data block in one step; moving the
 *   import line takes its rows along. Rows of an open block can be reordered
 *   among themselves, but not moved out of it.
 * - Delete line (Ctrl+Shift+K) on an import line deletes its rows too.
 * - Cut and copy with nothing selected (which take the whole line) take the
 *   whole block when the cursor is on an import line.
 * - Deleting any of an import line removes the whole block; typing that would
 *   break it is refused, and so is typing into folded rows (see guardImports).
 * - A × after an import line removes it and its data, and the file chooser
 *   sits between its brackets: "Choose a CSV file…", or the file's name.
 *
 * Lines that don't involve a data block are left to the usual commands.
 */
import { EditorSelection, EditorState, Facet, type Extension, type StateEffect } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, keymap, type Command, type KeyBinding } from '@codemirror/view'
import { foldEffect, foldable, foldedRanges } from '@codemirror/language'
import { dataBlocks, isImport } from './language.ts'

/** A data block's lines: its import line, then its rows (1-based, inclusive). */
interface Unit {
  start: number
  end: number
}

const blocksOf = (state: EditorState): Unit[] =>
  dataBlocks(state.doc).map((b) => ({ start: b.line, end: b.rows?.last ?? b.header }))

/** The lines the main selection covers (a selection ending at a line's start doesn't take that line). */
function selectedLines(state: EditorState): { first: number; last: number } {
  const { from, to } = state.selection.main
  const first = state.doc.lineAt(from).number
  let last = state.doc.lineAt(to).number
  if (to > from && state.doc.lineAt(to).from === to) last--
  return { first, last: Math.max(first, last) }
}

/** The selected lines, widened to take in whole any data block they touch. */
function widened(lines: { first: number; last: number }, blocks: Unit[]): { first: number; last: number } {
  let { first, last } = lines
  for (const b of blocks) {
    if (b.end >= first && b.start <= last) {
      first = Math.min(first, b.start)
      last = Math.max(last, b.end)
    }
  }
  return { first, last }
}

/** Whether a block's rows are folded away. */
function isFolded(state: EditorState, b: Unit): boolean {
  let folded = false
  foldedRanges(state).between(state.doc.line(b.start).to, state.doc.line(b.end).to, () => { folded = true })
  return folded
}

/** Alt+↑ (dir −1) or Alt+↓ (+1): move the selected lines, stepping over data blocks whole. */
const moveLines = (dir: -1 | 1): Command => (view) => {
  const { state } = view
  const blocks = blocksOf(state)
  if (!blocks.length || state.selection.ranges.length > 1) return false
  const selected = selectedLines(state)

  // Rows of an open block move among its data rows only (the usual command does
  // that); the header stays first, and nothing leaves the block.
  const inside = blocks.find((b) => selected.first > b.start && selected.last <= b.end)
  if (inside) {
    const header = inside.start + 1
    const target = dir < 0 ? selected.first - 1 : selected.last + 1
    return selected.first === header || target <= header || target > inside.end
  }

  const moving = widened(selected, blocks)
  const neighbour = dir < 0 ? moving.first - 1 : moving.last + 1
  if (neighbour < 1 || neighbour > state.doc.lines) return true
  const block = blocks.find((b) => neighbour >= b.start && neighbour <= b.end)
  const past = block ?? { start: neighbour, end: neighbour }
  // Nothing here involves a data block: the usual command.
  if (!block && moving.first === selected.first && moving.last === selected.last) return false

  const { doc } = state
  const text = (u: Unit) => doc.sliceString(doc.line(u.start).from, doc.line(u.end).to)
  const movingText = text({ start: moving.first, end: moving.last })
  const pastText = text(past)
  const from = doc.line(Math.min(moving.first, past.start)).from
  const to = doc.line(Math.max(moving.last, past.end)).to
  const shift = (pastText.length + 1) * dir
  // Blocks folded before the move are folded again after it.
  const folded = blocks.filter((b) => isFolded(state, b))
  view.dispatch({
    changes: { from, to, insert: dir < 0 ? `${movingText}\n${pastText}` : `${pastText}\n${movingText}` },
    selection: EditorSelection.range(state.selection.main.anchor + shift, state.selection.main.head + shift),
    scrollIntoView: true,
    userEvent: 'move.line',
  })
  refold(view, folded.length)
  return true
}

/** Fold again the data blocks that were folded before a change moved them. */
function refold(view: EditorView, count: number): void {
  if (!count) return
  const effects: StateEffect<unknown>[] = []
  for (const b of blocksOf(view.state)) {
    const line = view.state.doc.line(b.start)
    const range = foldable(view.state, line.from, line.to)
    if (range && !isFolded(view.state, b)) effects.push(foldEffect.of(range))
  }
  if (effects.length) view.dispatch({ effects })
}

/** Ctrl+Shift+K on an import line: delete the line and its rows. */
const deleteLines: Command = (view) => {
  const { state } = view
  const blocks = blocksOf(state)
  if (!blocks.length || state.selection.ranges.length > 1) return false
  const selected = selectedLines(state)
  const lines = widened(selected, blocks)
  if (lines.first === selected.first && lines.last === selected.last) return false
  view.dispatch(removeLines(state, { start: lines.first, end: lines.last }, 'delete.line'))
  return true
}

/** Removing whole lines, with the line break after them (or before them, at the end of the sheet). */
function removeLines(state: EditorState, u: Unit, userEvent: string) {
  const { doc } = state
  const from = u.end < doc.lines ? doc.line(u.start).from : Math.max(0, doc.line(u.start).from - 1)
  const to = u.end < doc.lines ? doc.line(u.end + 1).from : doc.line(u.end).to
  return { changes: { from, to }, selection: { anchor: from }, userEvent, scrollIntoView: true }
}

/**
 * Edits to an import line (or to a folded block's hidden rows) keep the data
 * whole:
 *
 * - Deleting any of an import line (or, folded, any of what it hides: a
 *   backspace just after the "…" reaches into the last row) removes the whole
 *   block, import line and rows.
 * - Typing that would leave the import line no longer an import is refused
 *   (a note after it is fine), and so is typing into folded rows.
 *
 * Edits that take in the whole block (a selection deleted or pasted over), and
 * changes not made by typing (choosing a file, undo, moving lines), pass.
 * With the block open, its rows can be edited freely.
 */
const guardImports = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr
  const deleting = tr.isUserEvent('delete')
  if (!deleting && !tr.isUserEvent('input')) return tr
  const state = tr.startState
  for (const b of blocksOf(state)) {
    const importLine = state.doc.line(b.start)
    const lastRow = state.doc.line(b.end)
    const folded = isFolded(state, b)
    let wholeBlock = false
    let touchesImport = false
    let touchesHidden = false
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      if (fromA <= importLine.from && toA >= lastRow.to) {
        wholeBlock = true
        return
      }
      // The import line, and the line break before it (joining it to the line above).
      const lineStart = Math.max(0, importLine.from - 1)
      if (fromA === toA ? fromA > lineStart && fromA <= importLine.to : fromA < importLine.to && toA > lineStart) touchesImport = true
      // Folded, the rows; but a new line started after them (Enter at the end) is fine.
      const newLineAfter = fromA === toA && fromA === lastRow.to && /^\r?\n/.test(inserted.sliceString(0, 2))
      if (folded && !newLineAfter && (fromA === toA ? fromA > importLine.to && fromA <= lastRow.to : fromA < lastRow.to && toA > importLine.to)) {
        touchesHidden = true
      }
    })
    if (wholeBlock || (!touchesImport && !touchesHidden)) continue
    if (deleting) return removeLines(state, b, 'delete.import')
    if (touchesHidden) return []
    // Typing on the import line: fine while it's still an import (a note after it, say).
    const line = tr.newDoc.lineAt(tr.changes.mapPos(importLine.from, 1))
    if (!isImport(line.text)) return []
  }
  return tr
})

/** A small × after an import line, which removes the import and its data. */
class RemoveImport extends WidgetType {
  eq() {
    return true
  }
  toDOM(view: EditorView) {
    const button = document.createElement('button')
    button.className = 'cm-ms-import-button cm-ms-remove-import'
    button.textContent = '×'
    button.title = 'Remove this import and its data'
    button.setAttribute('aria-label', button.title)
    button.addEventListener('mousedown', (e) => e.preventDefault())
    button.addEventListener('click', (e) => {
      e.preventDefault()
      const n = view.state.doc.lineAt(view.posAtDOM(button)).number
      const block = blocksOf(view.state).find((b) => b.start === n)
      if (block) view.dispatch(removeLines(view.state, block, 'delete.import'))
    })
    return button
  }
  ignoreEvent() {
    return true
  }
}

// (Before a folded block's "…", which starts at the end of the line.)
const removeButton = Decoration.widget({ widget: new RemoveImport(), side: -1 })

/**
 * What the editor can't do itself: choosing a file opens the system dialog and
 * puts the file's rows into the sheet, which the app does.
 */
export const importActions = Facet.define<{ choose: (line: number) => void }, { choose: (line: number) => void } | undefined>({
  combine: (values) => values[0],
})

/**
 * The button between an import's brackets: "Choose a CSV file…" before a file
 * is chosen, or the file's name, which chooses another one.
 */
class ChooseFile extends WidgetType {
  readonly file: string | undefined
  constructor(file: string | undefined) {
    super()
    this.file = file
  }
  eq(other: ChooseFile) {
    return other.file === this.file
  }
  toDOM(view: EditorView) {
    const button = document.createElement('button')
    button.className = `cm-ms-import-button cm-ms-choose-file${this.file ? '' : ' cm-ms-choose-file--empty'}`
    button.textContent = this.file ?? 'Choose a CSV file…'
    button.title = this.file ? 'Choose another file' : 'Choose a CSV file to import'
    button.addEventListener('mousedown', (e) => e.preventDefault())
    button.addEventListener('click', (e) => {
      e.preventDefault()
      view.state.facet(importActions)?.choose(view.state.doc.lineAt(view.posAtDOM(button)).number)
    })
    return button
  }
  ignoreEvent() {
    return true
  }
}

/** An import line's brackets, `import(` … `)`, with any file's name in quotes (1: the name). */
const IMPORT_CALL = /import\s*\(\s*(?:"([^"]*)")?\s*\)/

/** The buttons on import lines: the file chooser between the brackets, and (with data) the ×. */
function importButtons(state: EditorState) {
  const marks = []
  const withData = new Set(blocksOf(state).map((b) => b.start))
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    if (!isImport(line.text)) continue
    const m = IMPORT_CALL.exec(line.text)
    if (!m) continue
    const open = line.from + m.index + m[0].indexOf('(') + 1
    const close = line.from + m.index + m[0].length - 1
    // The name, in its quotes, shown as the button; or the button in the empty brackets.
    marks.push(m[1] !== undefined
      ? Decoration.replace({ widget: new ChooseFile(m[1]) }).range(open, close)
      : Decoration.widget({ widget: new ChooseFile(undefined), side: 1 }).range(open))
    if (withData.has(n)) marks.push(removeButton.range(line.to))
  }
  return Decoration.set(marks, true)
}

const importButtonDecorations = EditorView.decorations.compute(['doc'], importButtons)

/** Keeping imported data whole: the guard on edits, the file chooser and the × on import lines. */
export const dataBlockGuard: Extension = [
  guardImports,
  importButtonDecorations,
  // The file's name is one piece: the cursor steps over it, rather than into it.
  EditorView.atomicRanges.of((view) => importButtons(view.state)),
  EditorView.baseTheme({
    '.cm-ms-import-button': {
      font: 'inherit', fontSize: '13px', lineHeight: '1.4', cursor: 'pointer', borderRadius: '4px',
      border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', verticalAlign: 'baseline',
    },
    '.cm-ms-import-button:hover': { borderColor: 'var(--accent)' },
    '.cm-ms-choose-file': { padding: '0 8px', margin: '0 2px' },
    '.cm-ms-choose-file--empty': { color: 'var(--accent)' },
    '.cm-ms-remove-import': {
      marginLeft: '10px', minWidth: '24px', padding: '0 6px', fontSize: '16px', fontWeight: '600', lineHeight: '1.25',
    },
    '.cm-ms-remove-import:hover': { color: 'var(--error)', borderColor: 'var(--error)' },
  }),
]

/**
 * Cut or copy with nothing selected takes the whole line: on an import line,
 * select the whole block first, and let the cut or copy go ahead with that.
 */
const selectBlockForClipboard: Command = (view) => {
  const { state } = view
  if (!state.selection.main.empty || state.selection.ranges.length > 1) return false
  const n = state.doc.lineAt(state.selection.main.head).number
  const block = blocksOf(state).find((b) => n === b.start)
  if (!block) return false
  const { doc } = state
  const to = block.end < doc.lines ? doc.line(block.end + 1).from : doc.line(block.end).to
  view.dispatch({ selection: { anchor: doc.line(block.start).from, head: to } })
  return false // (the browser's cut or copy then takes the selection)
}

/** The keys. */
export const dataBlockKeys: KeyBinding[] = [
  { key: 'Alt-ArrowUp', run: moveLines(-1) },
  { key: 'Alt-ArrowDown', run: moveLines(1) },
  { key: 'Shift-Mod-k', run: deleteLines },
  { key: 'Mod-x', run: selectBlockForClipboard },
  { key: 'Mod-c', run: selectBlockForClipboard },
]

/** The keys, to go ahead of the usual ones for the same keys. */
export const dataBlockLines = keymap.of(dataBlockKeys)
