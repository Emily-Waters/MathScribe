/** Go to definition and rename: for a series', a table's and a plot's names as for any other. */
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { mathscribeLanguage } from './language.ts'
import { definitionAt, gotoDefinition, renameChanges, setDefinitions, setNavigationSymbols } from './gotoDefinition.ts'
import { collectDefinitions, collectSymbols } from '../lib/sheet/sheetIndex.ts'
import { sheet } from '../test/helpers.ts'

/** A sheet's editor state, told what the sheet defines, as the app tells it after each evaluation. */
function stateOf(doc: string): EditorState {
  const evaluated = sheet(doc)
  return EditorState.create({ doc, extensions: [mathscribeLanguage, gotoDefinition] }).update({
    effects: [setNavigationSymbols.of(collectSymbols(evaluated, doc)), setDefinitions.of(collectDefinitions(evaluated.blocks))],
  }).state
}

/** The text after renaming the name at `at` (the nth occurrence of `name`) to `to`. */
function renamed(doc: string, name: string, to: string, nth = 0): string {
  const state = stateOf(doc)
  let at = -1
  for (let i = 0; i <= nth; i++) at = doc.indexOf(name, at + 1)
  return state.update({ changes: renameChanges(state, at, to) }).state.doc.toString()
}

const SERIES = 't = [\n    1.0 s,\n    2.0 s,\n    3.0 s\n]\nx = [1.0 m, 2.0 m, 3.0 m]\n'

describe('going to a definition', () => {
  it('goes from a use of a series, in a table, a plot or a sum, to its name where it’s made', () => {
    const doc = `${SERIES}@table(\n    t,\n    x\n)\np = @plot(t, x; fit linear)\ny = t.avg + p.slope`
    const state = stateOf(doc)
    const tInTable = doc.indexOf('t,\n    x\n)')
    expect(definitionAt(state, tInTable)).toEqual({ from: 0, to: 1 })
    expect(definitionAt(state, doc.indexOf('x; fit'))).toEqual({ from: doc.indexOf('x = ['), to: doc.indexOf('x = [') + 1 })
    expect(definitionAt(state, doc.indexOf('p.slope'))).toEqual({ from: doc.indexOf('p = @'), to: doc.indexOf('p = @') + 1 })
  })
})

describe('renaming', () => {
  it('renames a series where it’s made and used, with its members and statistics', () => {
    const doc = `${SERIES}@table(t, x)\ny = t.avg + t[1] + t.sum\nz = [2 * t]`
    expect(renamed(doc, 't', 'time')).toBe(
      'time = [\n    1.0 s,\n    2.0 s,\n    3.0 s\n]\nx = [1.0 m, 2.0 m, 3.0 m]\n'
      + '@table(time, x)\ny = time.avg + time[1] + time.sum\nz = [2 * time]',
    )
  })

  it('renames a named plot, its members with it, from a use on a line of its own', () => {
    const doc = `${SERIES}p = @plot(\n    t,\n    x;\n    fit linear\n)\nk = p.slope`
    expect(renamed(doc, 'p.slope', 'fit')).toBe(`${SERIES}fit = @plot(\n    t,\n    x;\n    fit linear\n)\nk = fit.slope`)
  })

  it('leaves names that only start with it', () => {
    const doc = `${SERIES}tt = 2\nt_1 = 3 s\ny = tt + t.avg + t_1`
    expect(renamed(doc, 't', 'time')).toBe(`${SERIES.replace(/^t /, 'time ')}tt = 2\nt_1 = 3 s\ny = tt + time.avg + t_1`)
  })
})

describe('what a series’ or a plot’s own name says, hovered', () => {
  it('is how many values a series has, and its first and last; a plot’s members', () => {
    const doc = `${SERIES}p = @plot(t, x; fit linear)`
    const symbols = collectSymbols(sheet(doc), doc)
    const t = symbols.find((s) => s.name === 't')!
    expect(t.about).toBe('A series of 3 values')
    expect(t.tex).toMatch(/^t_\{1\} = .*\\ldots.*t_\{3\} = /)
    expect(symbols.find((s) => s.name === 'p')!.about).toMatch(/^Its members: p\.t, p\.x, .*p\.slope/)
  })
})
