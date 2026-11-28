/**
 * A sheet's tables as text: where the ⚙ of a table or a plot goes (its call,
 * found from the sheet's tree, on one line or over several; a typed table's
 * opener), and a table read into the grid and written back.
 */
import { describe, expect, it } from 'vitest'
import { sheet } from '../../test/helpers.ts'
import { BLOCK_KIND, type CustomBlock } from '../../lib/sheet/blocks.ts'
import type { TableData } from './tableData.ts'
import { readSeriesTable, readTypedTable, settingsCalls, sheetTables, writeSeriesTable, writeTypedTable } from './tableText.ts'

/** Each call found: which, and what's between its brackets. */
const found = (text: string) => settingsCalls(text).map((c) => [c.kind, text.slice(c.from, c.to)])

describe('the ⚙ of a table or a plot', () => {
  it('finds a table or a plot on a line of its own, named or not', () => {
    expect(found('@table(t, x)\np = @plot(t, x; fit linear)')).toEqual([['table', 't, x'], ['plot', 't, x; fit linear']])
  })

  it('finds one over several lines, up to the bracket closing it', () => {
    const text = 'Box {\n    @table(\n        t,\n        f(x);\n        rows 2-3\n    )\n}'
    expect(found(text)).toEqual([['table', '\n        t,\n        f(x);\n        rows 2-3\n    ']])
  })

  it('finds none in the middle of a line, or one never closed', () => {
    expect(found('y = 2 * @table(t)\n@plot(t, x')).toEqual([])
    // (Nor one whose bracket a later statement closes: the call ends at the blank line.)
    expect(found('@table(t,\n\nx = f(1)')).toEqual([])
  })
})

describe('the tables the grid edits', () => {
  const text = 'Box {\n    @table {\n        a | b\n    }\n}\n@table(t, x)\n@table {\n    c\n'

  it('are typed tables (closed ones) and tables of series, in order, each where its text is', () => {
    const tables = sheetTables(text)
    expect(tables.map((t) => [t.kind, t.line, t.indent, text.slice(t.start, t.end)])).toEqual([
      ['typed', 2, '    ', '    @table {\n        a | b\n    }'],
      ['series', 6, '', '@table(t, x)'],
    ])
    // (The ⚙ goes after a typed table's { and a table of series' ).)
    expect(tables.map((t) => text.slice(t.button - 1, t.button))).toEqual(['{', ')'])
  })
})

describe('a typed table in the grid', () => {
  it('is read as its settings, its note, and its rows, each as many cells', () => {
    expect(readTypedTable('@table(title "Runs") {  // the first\n    a | b | c\n    1\n    // a comment\n\n    2 | | $|x|$\n}')).toEqual({
      settings: 'title "Runs"', note: '// the first', rows: [['a', 'b', 'c'], ['1', '', ''], ['2', '', '$|x|$']],
    })
  })

  it('is written back a row a line, a level in, its columns lined up, a | of a cell’s own as maths', () => {
    const written = writeTypedTable({ settings: 'lines header', rows: [['Trial', 'Mass $m$', 'Note'], ['1', '12.3 g ', 'a|b'], ['2', '', '']] }, '  ')
    expect(written).toBe([
      '  @table(lines header) {',
      '      Trial | Mass $m$ | Note',
      '      1     | 12.3 g   | a$|$b',
      '      2     |          |',
      '  }',
    ].join('\n'))
  })

  it('reads back as it was written, and as the sheet reads it', () => {
    const model = { settings: 'title "Mass (g)"', rows: [['Trial', 'Colour'], ['1', 'pale blue'], ['2', '']] }
    const written = writeTypedTable(model, '')
    expect(readTypedTable(written)).toEqual({ ...model, note: undefined })
    const block = sheet(written).blocks.find((b): b is CustomBlock => b.kind === BLOCK_KIND.custom)!
    expect((block.data as TableData).rows).toEqual([['1', 'pale blue'], ['2', '']])
  })
})

describe('a table of series in the grid', () => {
  it('is read as its columns and its settings', () => {
    expect(readSeriesTable('@table(t, x, v = x / t; lines header)')).toEqual({ columns: ['t', 'x', 'v = x / t'], settings: 'lines header', multiline: false })
  })

  it('is written back on one line, or over several as it was, its empty columns left out', () => {
    expect(writeSeriesTable({ columns: ['t', '', 'f(x)'], settings: 'rows 2-3', multiline: false }, '')).toBe('@table(t, f(x); rows 2-3)')
    expect(writeSeriesTable({ columns: ['t', 'f(x)'], settings: 'rows 2-3', multiline: true }, '    ')).toBe('@table(\n        t,\n        f(x);\n        rows 2-3\n    )')
    expect(writeSeriesTable({ columns: ['t', 'x'], settings: '', multiline: true }, '')).toBe('@table(\n    t,\n    x\n)')
  })
})
