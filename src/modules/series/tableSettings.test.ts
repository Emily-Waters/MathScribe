/** A table's settings: read from, and written back to, the text of its line. */
import { describe, expect, it } from 'vitest'
import { formatTableSettings, parseTableSettings, splitCallArgs, withSettingsText, withTableSettings } from './tableSettings.ts'

describe('table settings', () => {
  it('splits the columns from the settings at the first semicolon outside brackets', () => {
    expect(splitCallArgs('t, x; rows 1-5')).toEqual({ columns: 't, x', settings: ' rows 1-5' })
    expect(splitCallArgs('t, f(a; b)')).toEqual({ columns: 't, f(a; b)' })
  })

  it('writes settings into a call over several lines, its closing bracket kept on its own line', () => {
    const write = (inside: string, text: string) => withSettingsText(inside, { from: 0, to: inside.length }, text)
    expect(write('\n    t,\n    x;\n    rows 2-3\n', 'lines grid')).toBe('\n    t,\n    x; lines grid\n')
    expect(write('\n    t,\n    x\n', 'lines grid')).toBe('\n    t,\n    x; lines grid\n')
    expect(write('\n    t,\n    x; rows 2-3\n', '')).toBe('\n    t,\n    x\n')
  })

  it('reads and writes them, leaving out the defaults', () => {
    const { settings } = parseTableSettings('rows 5-, lines none, numbers off, all rows')
    expect(settings).toEqual({ from: 5, to: undefined, lines: 'none', numbers: false, allRows: true })
    expect(formatTableSettings(settings)).toBe('rows 5-, lines none, numbers off, all rows')
    expect(formatTableSettings(parseTableSettings('lines grid, numbers on').settings)).toBe('')
    expect(formatTableSettings(parseTableSettings('lines header').settings)).toBe('lines header')
    expect(formatTableSettings(parseTableSettings('rows 7').settings)).toBe('rows 7')
  })

  it('rewrites a table line with new settings, or takes them out', () => {
    const line = '    @table(t, x; lines header)   # run 1'
    const inner = { from: line.indexOf('(') + 1, to: line.lastIndexOf(')') }
    expect(withTableSettings(line, inner, { lines: 'grid', numbers: true, allRows: false, from: 2, to: 9 }))
      .toBe('    @table(t, x; rows 2-9)   # run 1')
    expect(withTableSettings(line, inner, { lines: 'grid', numbers: true, allRows: false }))
      .toBe('    @table(t, x)   # run 1')
  })
})
