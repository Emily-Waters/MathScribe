/** Sections and subsections in the editor: their lines highlighted, and folded up to the next of their level or above. */
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { codeFolding, foldable } from '@codemirror/language'
import { mathscribeFolding, mathscribeLanguage } from './language.ts'
import { headingLines } from './headings.ts'

/** A document's editor state, as the editor reads it. */
const stateOf = (doc: string) => EditorState.create({ doc, extensions: [mathscribeLanguage, mathscribeFolding, codeFolding()] })

/** Each line that folds: its number, and the number of the last line it folds. */
function folds(doc: string): [number, number][] {
  const state = stateOf(doc)
  const out: [number, number][] = []
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    const range = foldable(state, line.from, line.to)
    if (range) out.push([n, state.doc.lineAt(range.to).number])
  }
  return out
}

describe('a section’s fold', () => {
  it('runs up to the next heading of its level or above, leaving out blank lines at its end', () => {
    const doc = ['# A', 'x = 1', '## B', 'y = 2', '', '## C', 'z = 3', '# D', 'w = 4', ''].join('\n')
    expect(folds(doc)).toEqual([[1, 7], [3, 4], [6, 7], [8, 9]])
  })

  it('ends at its block’s end, and at a block titled as a section', () => {
    const doc = ['Box {', '    ## E', '    q = 1', '}', '# F', 'r = 2', '# G {', '    s = 3', '}'].join('\n')
    // (The block, E to the block's last line, F up to G, and G as the block it is.)
    expect(folds(doc)).toEqual([[1, 3], [2, 3], [5, 6], [7, 8]])
  })

  it('needs something in it to fold', () => {
    expect(folds('# A\n# B\nx = 1')).toEqual([[2, 3]])
  })
})

describe('a section’s line', () => {
  it('is highlighted, a subsection’s more lightly, and not a deeper heading’s or a # in prose', () => {
    const state = stateOf(['# A', '## B', '### C', 'x = 1  # a note', '@layout.text Notes {', '# not a heading', '}', '# D {', '}'].join('\n'))
    const classes: [number, string][] = []
    headingLines(state).between(0, state.doc.length, (from, _to, deco) => {
      classes.push([state.doc.lineAt(from).number, deco.spec.class as string])
    })
    expect(classes).toEqual([[1, 'cm-ms-section'], [2, 'cm-ms-subsection'], [8, 'cm-ms-section']])
  })
})
