/** Text from outside the editor (the sheet formatted, a table's grid editor's), put into it as the changes from what it has. */
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { changesTo } from './EditorPane.tsx'

/** The editor's text after the changes to `value`. */
const applied = (doc: string, value: string) => {
  const state = EditorState.create({ doc })
  return state.update({ changes: changesTo(state.doc, value) }).state.doc.toString()
}

describe('text from outside the editor', () => {
  const cases: [string, string, string][] = [
    ['changes a line in place', 'a\nb\nc', 'a\nB\nc'],
    ['adds a line between two', 'a\n}\nd', 'a\nnew\n}\nd'],
    ['adds lines after the last', 'a\nb', 'a\nb\nc\nd'],
    ['adds lines before the first', 'b\nc', 'a\nb\nc'],
    ['takes away a line between two', 'a\nx\nb', 'a\nb'],
    ['takes away the last lines', 'a\nb\nc', 'a'],
    ['takes away the first line', 'x\na\nb', 'a\nb'],
    ['replaces lines with more', 'a\nx\nb', 'a\ny\nz\nb'],
    ['replaces lines with fewer', 'a\nx\ny\nb', 'a\nz\nb'],
  ]
  it.each(cases)('%s', (_, doc, value) => {
    expect(applied(doc, value)).toBe(value)
  })
})
