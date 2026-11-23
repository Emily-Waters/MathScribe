/** A call over several lines (the tree's continued lines): worked out as it is written on one. */
import { describe, expect, it } from 'vitest'
import { lineAt, lines, value } from '../test/helpers.ts'

/** Three readings of t and x, as series. */
const DATA = 't = [0.10 s, 0.20 s, 0.30 s]\nx = [0.012 m, 0.047 m, 0.106 m]\n'

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
    same('val = [1234, 5678]\nw = val[2]', 'val = [\n    1234,\n    5678\n]\nw = val[2]')
    expect(value('val = [\n    1234,\n    5678\n]\nw = val[2]')).toBe('5678')
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

  it('picks rows by a condition', () => {
    same(`${DATA}a = [...x[t >= 0.15 s and t <= 0.35 s], 0 m]\nn = a.count`, `${DATA}a = [\n    ...x[t >= 0.15 s and t <= 0.35 s],\n    0 m\n]\nn = a.count`)
  })

  it('works out any call, and brackets in brackets', () => {
    same('y = max(1, 2, 3)', 'y = max(\n    1,\n    2,\n    3\n)')
    same('m = [(1 + 2) kg, max(3, 4) kg]', 'm = [\n    (1 + 2) kg,\n    max(3, 4) kg\n]')
  })

  it('takes its note from any of its lines', () => {
    same('y = max(1, 2)  // the larger', 'y = max(  // the larger\n    1,\n    2\n)')
    same('y = max(1, 2)  // the larger one', 'y = max(  // the larger\n    1,\n    2\n)  // one')
  })

  it('takes a trailing comma before its closing bracket, in any call', () => {
    same('val = [1234, 5678]\nw = val[2]', 'val = [\n    1234,\n    5678,\n]\nw = val[2]')
    same(`${DATA}@table(t, x)`, `${DATA}@table(\n    t,\n    x,\n)`)
    same('y = max(1, 2)  // the larger', 'y = max(\n    1,\n    2,  // the larger\n)')
    same('m = [1 kg, 2 kg]', 'm = [\n    1 kg,\n    2 kg,\n]')
  })

  it('keeps a comma that isn’t before a closing bracket', () => {
    same('y = max(1, 2)', 'y = max(1,\n    2\n)')
  })

  it('takes in a value at the wrong indentation', () => {
    same('Box {\n    v = [1 N, 2 N, 3 N]\n    w = v[1]\n}', 'Box {\n    v = [\n1 N,\n        2 N,\n        3 N\n    ]\n    w = v[1]\n}')
  })

  it('is where its first line is, and the lines after it are where they are', () => {
    const source = 'val = [\n    1234,\n    5678\n]\nw = val[2]'
    expect(lines(source).map((l) => l.line)).toEqual([1, 5])
    expect(lineAt(source, 5).tex).toContain('5678')
  })
})
