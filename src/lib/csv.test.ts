/** Imported data: reading the rows, and putting a file's rows into the sheet. */
import { describe, expect, it } from 'vitest'
import { alignColumns, parseCsv, withImportedData, withoutImport } from './csv.ts'
import { lines, sheet, value } from '../test/helpers.ts'
import { lineNumbering } from './document.ts'
import type { ImportBlock } from './blocks.ts'

describe('parseCsv', () => {
  it('reads the column names, units and values as typed', () => {
    const csv = parseCsv(['t (s), x [m], n', '0.10, 0.012, 1', '0.20, 0.047, 2'])
    expect(csv.rows).toBe(2)
    expect(csv.columns.map((c) => [c.name, c.unit])).toEqual([['t', 's'], ['x', 'm'], ['n', undefined]])
    expect(csv.columns[0].values).toEqual([{ row: 1, text: '0.10' }, { row: 2, text: '0.20' }])
  })

  it('reads tab- and semicolon-separated rows, and quoted values', () => {
    expect(parseCsv(['a\tb', '1\t2']).columns[1].values[0].text).toBe('2')
    expect(parseCsv(['a;b', '1;2']).columns[1].values[0].text).toBe('2')
    expect(parseCsv(['"a","b"', '"1","2"']).columns.map((c) => c.name)).toEqual(['a', 'b'])
  })

  it('skips empty cells, so a column can be shorter', () => {
    expect(parseCsv(['a, b', '1, 2', '3,']).columns[1].values).toEqual([{ row: 1, text: '2' }])
  })

  it('explains what doesn’t fit', () => {
    expect(parseCsv(['Time step, x', '1, 2']).error).toMatch(/"Time step", isn't a variable name/)
    expect(parseCsv(['a, a', '1, 2']).error).toBe('Two columns are named a.')
    expect(parseCsv(['a, b', '1, two']).error).toBe('Row 1, column b: "two" isn\'t a number.')
    expect(parseCsv(['a', '1, 2']).error).toMatch(/Row 1 has 2 values, but there are 1 columns/)
  })
})

describe('uncertainty columns', () => {
  const data = (header: string, ...rows: string[]) => `import("run.csv")\n    ${header}\n${rows.map((r) => `    ${r}`).join('\n')}\n`

  it('fold dx into x, by any of its names, but only when there is an x', () => {
    for (const name of ['dx', 'δx', 'σx', 'delta_x', 'sigma_x', 'x_unc', 'x_err']) {
      const csv = parseCsv([`x (m), ${name} (m)`, '1.0, 0.1'])
      expect(csv.columns.map((c) => c.name)).toEqual(['x'])
      expect(csv.columns[0].unc).toMatchObject({ column: name, unit: 'm', percent: false })
    }
    expect(parseCsv(['t, dx', '1, 2']).columns.map((c) => c.name)).toEqual(['t', 'dx'])
    expect(parseCsv(['x, dx, x_err', '1, 2, 3']).error).toBe('Columns dx and x_err are both uncertainties of x: keep one.')
  })

  it('give each value its row’s uncertainty, as pm would', () => {
    const src = data('t (s), x (m), dx (m)', '0.10, 0.051, 0.004', '0.20, 0.098, 0.004', '0.30, 0.152,')
    expect(value(`${src}a = x_1`)).toBe('(0.051 ± 0.004) m')
    expect(value(`${src}a = delta x_2`)).toBe('0.004 m')
    expect(value(`${src}a = x_3`)).toBe('0.152 m') // no uncertainty in its row
    expect(lines(`${src}a = dx_1`).at(-1)!.error).toMatch(/Undefined symbol/) // the column isn't variables of its own
  })

  it('take x’s unit when they have none, convert one that differs, and read % as relative', () => {
    expect(value(`${data('x (m), dx', '0.051, 0.004')}a = x_1`)).toBe('(0.051 ± 0.004) m')
    expect(value(`${data('x (m), dx (mm)', '0.051, 4')}a = x_1`)).toBe('(0.051 ± 0.004) m')
    expect(value(`${data('x (m), dx (%)', '0.050, 10')}a = x_1`)).toBe('(0.050 ± 0.005) m')
  })

  it('say what’s wrong with a unit that doesn’t fit', () => {
    const block = (src: string) => sheet(src).blocks[0] as ImportBlock
    expect(block(data('x (m), dx (s)', '1, 2')).error).toMatch(/is in s, which doesn't convert to x's m/)
    expect(block(data('x, dx (m)', '1, 2')).error).toMatch(/has a unit \(m\) but x doesn't/)
  })

  it('show as error bars on a plot', () => {
    const src = data('t (s), x (m), dx (m)', '0.10, 0.051, 0.004', '0.20, 0.098, 0.006')
    const plot = lines(`${src}plot(t, x)`).at(-1)!.plot!
    expect(plot.series[0].points.map((p) => p.dy)).toEqual([0.004, 0.006])
  })
})

describe('withImportedData', () => {
  it('names the file and puts its rows under the import line, indented', () => {
    expect(withImportedData('m = 2\nimport()   # run 1\ny = 3', 2, 'run1.csv', 't (s)\r\n0.10\r\n\r\n'))
      .toBe('m = 2\nimport("run1.csv")   # run 1\n    t (s)\n     0.10\ny = 3')
  })

  it('lays the rows out as a table, right-aligned, whatever separated them', () => {
    expect(alignColumns(['t (s),x (m)', '0.10,0.012', '12.5,1.45'])).toEqual([
      't (s),  x (m)',
      ' 0.10,  0.012',
      ' 12.5,   1.45',
    ])
    expect(alignColumns(['a\tb', '1\t22'])).toEqual(['a,   b', '1,  22'])
    // Still read the same way.
    expect(parseCsv(alignColumns(['t (s),x (m)', '0.10,0.012'])).columns[1].values[0].text).toBe('0.012')
  })

  it('replaces the rows of a file chosen before', () => {
    const before = 'import("old.csv")\n    a\n    1\n\nb = 2'
    expect(withImportedData(before, 1, 'new.csv', 'a\n5')).toBe('import("new.csv")\n    a\n    5\n\nb = 2')
  })

  it('removes an import and its rows (the Remove button)', () => {
    expect(withoutImport('m = 2\nimport("a.csv")\n    a\n    1\n\nb = 2', 2)).toBe('m = 2\n\nb = 2')
  })
})

describe('importing into a sheet', () => {
  const src = 'import("run1.csv")\n    t (s), d (m)\n    1.21, 3.50\n    1.17, 3.48\n    1.24, 3.52\n'

  it('makes a variable of each value, with its unit and sig figs', () => {
    expect(value(`${src}x = t_2`)).toBe('1.17 s')
    expect(value(`${src}t_avg`)).toBe('(1.21 ± 0.02) s')
    expect(value(`${src}t_count`)).toBe('3')
  })

  it('shows a summary of the columns, not the rows', () => {
    const block = sheet(src).blocks[0] as ImportBlock
    expect(block.kind).toBe('import')
    expect(block.file).toBe('run1.csv')
    expect(block.rows).toBe(3)
    expect(block.columns.map((c) => [c.name, c.unit, c.count, c.first, c.last])).toEqual([['t', 's', 3, 1, 3], ['d', 'm', 3, 1, 3]])
    expect(block.columns[0].min).toBe('1.17\\,\\mathrm{s}')
    expect(block.columns[0].max).toBe('1.24\\,\\mathrm{s}')
    // None of the rows is a calculation of its own.
    expect(lines(src)).toEqual([])
  })

  it('waits for a file, and says what’s wrong with the data', () => {
    const empty = sheet('import()').blocks[0] as ImportBlock
    expect(empty.file).toBeUndefined()
    expect(empty.error).toBeUndefined()
    expect((sheet('import("a.csv")').blocks[0] as ImportBlock).error).toMatch(/missing: choose the file again/)
    expect((sheet('import("a.csv")\n    x (zz)\n    1').blocks[0] as ImportBlock).error).toMatch(/"zz" isn't a unit/)
  })

  it('numbers the lines after it on from the import line, as the editor does', () => {
    const blocks = sheet(`m = 2\n${src}y = 3\nz = 4`).blocks
    const numbered = lineNumbering(blocks)
    // The import is line 2 and its rows take lines 3–6, so y (line 7 of the file) is line 3.
    expect([numbered(1), numbered(2), numbered(7), numbered(8)]).toEqual([1, 2, 3, 4])
  })

  it('ends its rows at a blank line, so an indented line below isn’t data', () => {
    const block = sheet(`${src}\n    y = 2`).blocks[0] as ImportBlock
    expect(block.rows).toBe(3)
    expect(lines(`${src}\n    y = 2`).at(-1)!.tex).toBe('y = 2')
  })

  it('answers to t1 as well as t_1, as a typed series does', () => {
    expect(value(`${src}y = t1`)).toBe('1.21 s')
    expect(value(`${src}y = d2`)).toBe('3.48 m')
    // And a series typed t1, t2 answers to t_1.
    expect(value('t1 = 1.0 s\nt2 = 2.0 s\ny = t_2')).toBe('2.0 s')
    // A name defined in both spellings keeps each.
    expect(value('a1 = 1.0\na_1 = 5.0\ny = a1')).toBe('1.0')
  })
})
