/** Inline results: each line that works something out shows its result at its end; one typed as it is, none. */
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView, type DecorationSet } from '@codemirror/view'
import { collectResults } from '../lib/sheet/sheetIndex.ts'
import { sheet } from '../test/helpers.ts'
import { inlineResults, setInlineResults } from './inlineResults.ts'

const SOURCE = 'm = 2.00 kg\nF = m * 9.81 m/s^2\nx = 1/3\nbad = nope\nBox {\n    E = F * 2.00 m\n}'

describe('inline results', () => {
  it('are the results of the lines that work one out, not values typed as they are or lines gone wrong', () => {
    const results = collectResults(sheet(SOURCE).blocks)
    expect([...results.keys()]).toEqual([2, 3, 6])
    expect(results.get(2)).toEqual({ tex: expect.stringContaining('19.6'), approx: false })
    // (1/3 is rounded, so it follows ≈.)
    expect(results.get(3)?.approx).toBe(true)
  })

  it('go at the end of their lines in the editor', () => {
    let state = EditorState.create({ doc: SOURCE, extensions: [inlineResults] })
    state = state.update({ effects: setInlineResults.of(collectResults(sheet(SOURCE).blocks)) }).state
    const places: number[] = []
    for (const set of state.facet(EditorView.decorations)) {
      if (typeof set === 'function') continue
      ;(set as DecorationSet).between(0, state.doc.length, (from) => { places.push(state.doc.lineAt(from).number) })
    }
    expect(places).toEqual([2, 3, 6])
  })
})
