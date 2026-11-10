/** Line commands keep an import line and its rows together. */
import { describe, expect, it } from 'vitest'
import { EditorState, type TransactionSpec } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { codeFolding, foldEffect, foldable } from '@codemirror/language'
import { dataBlockGuard, dataBlockKeys } from './dataBlockLines.ts'
import { mathscribeFolding, mathscribeLanguage } from './language.ts'

const DOC = 'a = 1\nimport("r.csv")\n    t\n    1\n    2\nT'

/** Run the command bound to `key` with the cursor at the start of line `line`: whether it acted, and the text after. */
function press(key: string, line: number, doc = DOC): { handled: boolean; text: string } {
  let state = EditorState.create({ doc, extensions: [mathscribeLanguage, mathscribeFolding, codeFolding()] })
  state = state.update({ selection: { anchor: state.doc.line(line).from } }).state
  const view = {
    get state() { return state },
    dispatch(spec: TransactionSpec) { state = state.update(spec).state },
  } as unknown as EditorView
  const binding = dataBlockKeys.find((b) => b.key === key)!
  const handled = binding.run!(view)
  return { handled, text: state.doc.toString() }
}

describe('moving lines past imported data', () => {
  it('moves a line past the whole block', () => {
    expect(press('Alt-ArrowUp', 6).text).toBe('a = 1\nT\nimport("r.csv")\n    t\n    1\n    2')
    expect(press('Alt-ArrowDown', 1).text).toBe('import("r.csv")\n    t\n    1\n    2\na = 1\nT')
  })

  it('moves the import line with its rows', () => {
    expect(press('Alt-ArrowUp', 2).text).toBe('import("r.csv")\n    t\n    1\n    2\na = 1\nT')
    expect(press('Alt-ArrowDown', 2).text).toBe('a = 1\nT\nimport("r.csv")\n    t\n    1\n    2')
  })

  it('keeps an open block’s rows inside it, below the header', () => {
    // The first row can't go above the header, nor the last below the block.
    expect(press('Alt-ArrowUp', 4)).toEqual({ handled: true, text: DOC })
    expect(press('Alt-ArrowDown', 5)).toEqual({ handled: true, text: DOC })
    // Between rows, the usual command does the swap.
    expect(press('Alt-ArrowUp', 5).handled).toBe(false)
  })

  it('leaves lines away from any data to the usual command', () => {
    expect(press('Alt-ArrowUp', 2, 'a = 1\nb = 2').handled).toBe(false)
  })
})

describe('deleting an import line', () => {
  it('deletes its rows too', () => {
    expect(press('Shift-Mod-k', 2).text).toBe('a = 1\nT')
    expect(press('Shift-Mod-k', 1).handled).toBe(false)
  })
})

describe('editing an import line', () => {
  /** The text after applying `spec` (a user edit) to DOC, with the block folded or open. */
  function edit(make: (state: EditorState) => TransactionSpec, folded: boolean): string {
    let state = EditorState.create({ doc: DOC, extensions: [mathscribeLanguage, mathscribeFolding, codeFolding(), dataBlockGuard] })
    if (folded) {
      const line = state.doc.line(2)
      state = state.update({ effects: foldEffect.of(foldable(state, line.from, line.to)!) }).state
    }
    return state.update(make(state)).state.doc.toString()
  }
  const lastRowEnd = (s: EditorState) => s.doc.line(5).to
  const importEnd = (s: EditorState) => s.doc.line(2).to

  it('removes the whole block when any of the import line is deleted', () => {
    // Backspace just after the folded "…" (really the end of the last row).
    expect(edit((s) => ({ changes: { from: lastRowEnd(s) - 1, to: lastRowEnd(s) }, userEvent: 'delete.backward' }), true)).toBe('a = 1\nT')
    // A character inside import("…"), folded or open.
    expect(edit((s) => ({ changes: { from: importEnd(s) - 2, to: importEnd(s) - 1 }, userEvent: 'delete.backward' }), false)).toBe('a = 1\nT')
  })

  it('refuses typing that would break the import line, or that goes into folded rows', () => {
    expect(edit((s) => ({ changes: { from: s.doc.line(2).from + 3, insert: 'x' }, userEvent: 'input.type' }), false)).toBe(DOC)
    expect(edit((s) => ({ changes: { from: lastRowEnd(s), insert: '5' }, userEvent: 'input.type' }), true)).toBe(DOC)
  })

  it('allows a note after the import, a new line after a folded block, and editing open rows', () => {
    expect(edit((s) => ({ changes: { from: importEnd(s), insert: '   # run 1' }, userEvent: 'input.type' }), false))
      .toBe(DOC.replace('import("r.csv")', 'import("r.csv")   # run 1'))
    expect(edit((s) => ({ changes: { from: lastRowEnd(s), insert: '\n' }, userEvent: 'input' }), true))
      .toBe(DOC.replace('    2\nT', '    2\n\nT'))
    expect(edit((s) => ({ changes: { from: lastRowEnd(s), insert: '5' }, userEvent: 'input.type' }), false))
      .toBe(DOC.replace('    2\nT', '    25\nT'))
  })
})
