/** A call over several lines (the tree's continued lines): worked out as it is written on one. */
import { describe, expect, it } from 'vitest'
import { lineAt, lines, value } from '../test/helpers.ts'

/** Three readings of t and x, as series. */
const DATA = 't1 = 0.10 s\nt2 = 0.20 s\nt3 = 0.30 s\nx1 = 0.012 m\nx2 = 0.047 m\nx3 = 0.106 m\n'

/** A sheet's lines as worked out, without where each is (a line over several moves those after it down). */
const results = (source: string) => lines(source).map(({ line: _line, source: _source, ...result }) => result)

/** A sheet written with a call on one line gives what it gives with the call over several. */
const same = (oneLine: string, multiline: string) => {
  const one = results(oneLine)
  expect(one.length).toBeGreaterThan(0)
  expect(one.map((r) => r.error).filter(Boolean)).toEqual([])
  expect(results(multiline)).toEqual(one)
}

describe('a call over several lines', () => {
  it('makes a listed series', () => {
    same('val = @series(1234, 5678)\nw = val_2', 'val = @series(\n    1234,\n    5678\n)\nw = val_2')
    expect(value('val = @series(\n    1234,\n    5678\n)\nw = val_2')).toBe('5678')
  })

  it('makes a table, its columns and its settings', () => {
    same(`${DATA}@table(t, x, v = x / t; rows 2-3, lines grid)`, `${DATA}@table(\n    t,\n    x,\n    v = x / t;\n    rows 2-3, lines grid\n)`)
  })

  it('makes a plot, named, with its fit and a title with a comma in it', () => {
    same(
      `${DATA}p = @plot(t, x; fit linear, title "Run 1, 2")\nv = p.slope`,
      `${DATA}p = @plot(\n    t,\n    x;\n    fit linear, title "Run 1, 2"\n)\nv = p.slope`,
    )
  })

  it('makes a selection', () => {
    same(`${DATA}a = @select(t, x; t from 0.15 to 0.35)\nn = a.t_count`, `${DATA}a = @select(\n    t, x;\n    t from 0.15 to 0.35\n)\nn = a.t_count`)
  })

  it('works out any call, and brackets in brackets', () => {
    same('y = max(1, 2, 3)', 'y = max(\n    1,\n    2,\n    3\n)')
    same('M = [[1, 2], [3, 4]]', 'M = [\n    [1, 2],\n    [3, 4]\n]')
  })

  it('takes its #commands and note from any of its lines', () => {
    same('y = max(1, 2)  #val  # the larger', 'y = max(  # the larger\n    1,\n    2\n)  #val')
  })

  it('takes a trailing comma before its closing bracket, in any call', () => {
    same('val = @series(1234, 5678)\nw = val_2', 'val = @series(\n    1234,\n    5678,\n)\nw = val_2')
    same(`${DATA}@table(t, x)`, `${DATA}@table(\n    t,\n    x,\n)`)
    same('y = max(1, 2)  # the larger', 'y = max(\n    1,\n    2,  # the larger\n)')
    same('M = [[1, 2], [3, 4]]', 'M = [\n    [1, 2],\n    [3, 4],\n]')
  })

  it('keeps a comma that isn’t before a closing bracket', () => {
    same('y = max(1, 2)', 'y = max(1,\n    2\n)')
  })

  it('takes in a value at the wrong indentation', () => {
    same('Box {\n    v = @series(1 N, 2 N, 3 N)\n    w = v_1\n}', 'Box {\n    v = @series(\n1 N,\n        2 N,\n        3 N\n    )\n    w = v_1\n}')
  })

  it('is where its first line is, and the lines after it are where they are', () => {
    const source = 'val = @series(\n    1234,\n    5678\n)\nw = val_2'
    expect(lines(source).map((l) => l.line)).toEqual([1, 5])
    expect(lineAt(source, 5).tex).toContain('5678')
  })
})
