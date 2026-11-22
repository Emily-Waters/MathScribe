/** A table's settings: read from, and written back to, the text of its line. */
import { describe, expect, it } from 'vitest'
import { TABLE_SETTINGS, formatTableSettings, parseTableSettings, splitCallArgs, withSettingsText, withTableSettings } from './tableSettings.ts'
import { PLOT_SETTINGS } from './plotSettings.ts'
import { formatSheet } from '../../lib/tree/format.ts'

describe('table settings', () => {
  it('splits the columns from the settings at the first semicolon outside brackets', () => {
    expect(splitCallArgs('t, x; rows 1-5')).toEqual({ columns: 't, x', settings: ' rows 1-5' })
    expect(splitCallArgs('t, f(a; b)')).toEqual({ columns: 't, f(a; b)' })
  })

  it('writes settings into a call over several lines on a line of their own, as the formatter lays it out', () => {
    const write = (inside: string, text: string) => withSettingsText(inside, { from: 0, to: inside.length }, text)
    expect(write('\n    t,\n    x;\n    rows 2-3\n', 'lines grid')).toBe('\n    t,\n    x;\n    lines grid\n')
    expect(write('\n    t,\n    x\n', 'lines grid')).toBe('\n    t,\n    x;\n    lines grid\n')
    expect(write('\n    t,\n    x; rows 2-3\n', '')).toBe('\n    t,\n    x\n')
    // In a block, a level in from its closing bracket.
    expect(write('\n        t,\n        x\n    ', 'lines grid')).toBe('\n        t,\n        x;\n        lines grid\n    ')
    // Whatever's written, the formatter leaves as it is.
    for (const sheet of ['@table(\n    t,\n    x\n)', 'Box {\n    p = @plot(\n        t,\n        x;\n        fit linear\n    )\n}']) {
      const open = sheet.indexOf('(') + 1
      const close = sheet.lastIndexOf(')')
      for (const text of ['lines grid', 'rows 2-3, title "A, b"', '']) {
        const written = withSettingsText(sheet, { from: open, to: close }, text)
        expect(formatSheet(written), written).toBe(written)
      }
    }
  })

  it('reads and writes them, leaving out the defaults', () => {
    const { settings } = parseTableSettings('rows 5-, lines none, numbers off, all rows')
    expect(settings).toEqual({ from: 5, to: undefined, lines: 'none', numbers: false, uncertainty: true, allRows: true })
    expect(formatTableSettings(settings)).toBe('rows 5-, lines none, numbers off, all rows')
    expect(formatTableSettings(parseTableSettings('lines grid, numbers on').settings)).toBe('')
    expect(formatTableSettings(parseTableSettings('lines header').settings)).toBe('lines header')
    expect(formatTableSettings(parseTableSettings('rows 7').settings)).toBe('rows 7')
  })

  it('rewrites a table line with new settings, or takes them out', () => {
    const line = '    @table(t, x; lines header)   # run 1'
    const inner = { from: line.indexOf('(') + 1, to: line.lastIndexOf(')') }
    expect(withTableSettings(line, inner, { lines: 'grid', numbers: true, uncertainty: true, allRows: false, from: 2, to: 9 }))
      .toBe('    @table(t, x; rows 2-9)   # run 1')
    expect(withTableSettings(line, inner, { lines: 'grid', numbers: true, uncertainty: true, allRows: false }))
      .toBe('    @table(t, x)   # run 1')
    expect(withTableSettings(line, inner, { lines: 'grid', numbers: true, uncertainty: false, allRows: false }))
      .toBe('    @table(t, x; uncertainty off)   # run 1')
  })
})

describe('the declared settings’ own examples', () => {
  // (What the error lists, and the reference will, is what's read: each example is a setting, written back as itself.)
  it.each([['table', TABLE_SETTINGS], ['plot', PLOT_SETTINGS]] as const)('of a %s are each a setting, written back as typed', (_, spec) => {
    for (const example of spec.settings.flatMap((s) => s.examples)) {
      const { settings, error } = (spec as typeof TABLE_SETTINGS).parse(example)
      expect(error, example).toBeUndefined()
      expect((spec as typeof TABLE_SETTINGS).format(settings), example).toBe(example)
    }
  })

  it('show each setting in the ⚙ menu once, in one of its groups', () => {
    for (const spec of [TABLE_SETTINGS, PLOT_SETTINGS] as const) {
      const grouped = spec.groups.flatMap((g) => g.labels)
      expect([...grouped].sort(), spec.what).toEqual(spec.settings.map((s) => s.about.label).sort())
    }
  })
})
