/** Formatting a sheet: only whitespace and trailing commas change, never what it says. */
import { describe, expect, it } from 'vitest'
import { SAMPLE } from '../content/sample.ts'
import { REFERENCE } from '../content/reference.ts'
import { LIBRARY } from '../content/library.ts'
import { NODE_KIND, encode, formatSheet, isBlockKind, isToken, splitLines, type SyntaxNode } from './index.ts'
import { lines } from '../../test/helpers.ts'

/** Sheets as written: the sample, every Reference example and every Library entry. */
const SHEETS: string[] = [
  SAMPLE,
  ...REFERENCE.flatMap((s) => s.examples.map((e) => e.source)),
  ...LIBRARY.flatMap((t) => t.entries.map((e) => e.source)),
]

/**
 * A tree's shape: each node's kind, by depth (a block's lines, a continued
 * line's), its continuation lines left out (formatting can put what's in a call
 * on more lines of it, which are read as one).
 */
function shape(nodes: readonly SyntaxNode[], depth = 0): string[] {
  return nodes.flatMap((n) => {
    if (n.kind === NODE_KIND.continuation) return []
    const children = isBlockKind(n.kind) ? n.parts.filter((p): p is SyntaxNode => !isToken(p)) : []
    return [`${depth} ${n.kind}`, ...shape(children, depth + 1)]
  })
}

/** What a sheet works out to, line by line (each line's result, not where it is: a call over more lines moves those after it). */
const results = (source: string) => lines(source).map(({ source: _source, line: _line, ...result }) => result)

/**
 * Formatting keeps what a text says: its tree's shape, its line endings (a new
 * line ends as its call's first does), and formatting it again changes nothing.
 */
function keepsMeaning(source: string): string {
  const formatted = formatSheet(source)
  expect(formatSheet(formatted)).toBe(formatted)
  expect(shape(encode(formatted).body)).toEqual(shape(encode(source).body))
  const endings = new Set(splitLines(source).map((l) => l.eol))
  expect(splitLines(formatted).every((l) => endings.has(l.eol))).toBe(true)
  return formatted
}

/** Formatting a sheet keeps what it works out to. */
function worksOutTheSame(source: string): string {
  const formatted = keepsMeaning(source)
  expect(results(formatted)).toEqual(results(source))
  return formatted
}

/** Characters that tend to break things, brackets and commas among them. */
const TRICKY = ['\n', '\r\n', '\t', ' ', '    ', '{', '}', '(', ')', '[', ']', ',', '#', '//', '@', 'x', '=', '"', '> ', '@series', '@latex {', '@import("a.csv")', '1']

/** A small seeded random number generator (mulberry32), so a failing case can be found again. */
function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

describe('formatting a sheet', () => {
  it('lays out a call over several lines: its lines a level in, its bracket under its first, no trailing comma', () => {
    expect(keepsMeaning('val = @series(\n  1234,\n  5678,\n  )')).toBe('val = @series(\n    1234,\n    5678\n)')
    expect(keepsMeaning('Box {\n  val = @series(\n      1,\n      2,  # two\n  )\n}')).toBe(
      'Box {\n    val = @series(\n        1,\n        2  # two\n    )\n}',
    )
  })

  it('puts every line of a call at the same level, whatever it was', () => {
    const values = ['0.23100 N pm 0.00410 N', '0.30000 N pm 0.00280 N', '0.36900 N pm 0.00390 N']
    expect(keepsMeaning(`Fs = @series(\n    ${values[0]},\n        ${values[1]},\n    ${values[2]}\n)`))
      .toBe(`Fs = @series(\n    ${values[0]},\n    ${values[1]},\n    ${values[2]}\n)`)
  })

  it('puts everything in a call over several lines on a line of its own, if any of it is on another line', () => {
    const values = ['0.23100 N pm 0.00410 N', '0.30000 N pm 0.00280 N', '0.83300 N pm 0.00250 N']
    expect(worksOutTheSame(`Fs = @series( ${values[0]},\n     ${values[1]},\n     ${values[2]})\nF = Fs_avg`))
      .toBe(`Fs = @series(\n    ${values[0]},\n    ${values[1]},\n    ${values[2]}\n)\nF = Fs_avg`)
    expect(worksOutTheSame('y = max(1,\n  2)')).toBe('y = max(\n    1,\n    2\n)')
    expect(worksOutTheSame('y = max(1, 2,\n  3)  #val  # the most')).toBe('y = max(\n    1,\n    2,\n    3\n)  #val  # the most')
  })

  it('brings a value at the wrong indentation back into its call', () => {
    const values = ['0.23100 N pm 0.00410 N', '0.30000 N pm 0.00280 N', '0.83300 N pm 0.00250 N']
    const call = (first: string) => `Box {\n    Fs = @series(\n${first}${values[0]},\n        ${values[1]},\n        ${values[2]}\n    )\n    F = Fs_avg\n}`
    expect(worksOutTheSame(call(''))).toBe(call('        '))
    expect(worksOutTheSame(call('    '))).toBe(call('        '))
  })

  it('keeps its settings together, and a note with what it’s after', () => {
    const DATA = 't1 = 0.10 s\nt2 = 0.20 s\nx1 = 0.012 m\nx2 = 0.047 m\n'
    expect(worksOutTheSame(`${DATA}@table(t, x;\n  rows 1-2, lines grid)`)).toBe(`${DATA}@table(\n    t,\n    x;\n    rows 1-2, lines grid\n)`)
    expect(worksOutTheSame('v = @series(1,  # first\n  2)')).toBe('v = @series(\n    1,  # first\n    2\n)')
  })

  it('leaves a bracket on one line as it is, and lays out one over several in it', () => {
    expect(worksOutTheSame('M = [[1, 2],\n  [3, 4]]')).toBe('M = [\n    [1, 2],\n    [3, 4]\n]')
    expect(worksOutTheSame('M = [1, 2;\n  3, 4]')).toBe('M = [\n    1, 2;\n    3, 4\n]')
    expect(keepsMeaning('y = f(a, g(\n      b,\n  c\n  ),\n  d\n)')).toBe('y = f(\n    a,\n    g(\n        b,\n        c\n    ),\n    d\n)')
    expect(worksOutTheSame('@table(t, x)\ny = max(1, 2, 3)')).toBe('@table(t, x)\ny = max(1, 2, 3)')
  })

  it('spaces a line as maths is written: around =, after a comma, between a number and its unit', () => {
    expect(worksOutTheSame('x= 5kg')).toBe('x = 5 kg')
    expect(worksOutTheSame('m =2.00kg\nF  =  m * 9.81 m/s^2')).toBe('m = 2.00 kg\nF = m * 9.81 m/s^2')
    expect(worksOutTheSame('x1 = 1\nx2 = 2\nx3 = 3\ny = max(x1,x2 ,  x3)')).toBe('x1 = 1\nx2 = 2\nx3 = 3\ny = max(x1, x2, x3)')
    expect(worksOutTheSame('M = [1,2;3,4]')).toBe('M = [1, 2; 3, 4]')
  })

  it('spaces a condition’s ? and : , but not a setting’s :', () => {
    expect(worksOutTheSame('a = 2\nr = a > 1 ? "AGREE":"NO"')).toBe('a = 2\nr = a > 1 ? "AGREE" : "NO"')
    expect(worksOutTheSame('a = 2\nr = a>1?1:a>0?2:3')).toBe('a = 2\nr = a>1 ? 1 : a>0 ? 2 : 3')
    expect(worksOutTheSame('x:3 = 2.0')).toBe('x:3 = 2.0')
  })

  it('leaves spacing in strings, notes, comments, prose’s values, a == and a comma before a bracket as they are', () => {
    const source = 'label = "a,b=c"  # x=1,y=2\n// a=b\n> The mass is {{m=2}}.\ny = 1==1\nz = f(1,)'
    expect(keepsMeaning(source)).toBe(source)
  })

  it('never puts two spaces in one gap, nor takes anything but a space out of it', () => {
    // (A comma's space after and an `=`'s before are one gap: `[,=(` once lost its `=` this way.)
    expect(keepsMeaning('y = [,=(]')).toBe('y = [, = (]')
    expect(keepsMeaning('y = [, = (]')).toBe('y = [, = (]')
  })

  it('keeps a comma whose line would be blank without it, and a command after one', () => {
    expect(keepsMeaning('f(a {,\n)')).toBe('f(\n    a {\n)')
    expect(keepsMeaning('f(a\n  ,\n)')).toBe('f(\n    a\n    ,\n)')
    expect(keepsMeaning('f(,\n)')).toBe('f(,\n)')
    expect(keepsMeaning('f(a,,\n)')).toBe('f(\n    a,,\n)')
    expect(keepsMeaning('f(\n  a,#val\n)')).toBe('f(\n    a #val\n)')
    // (A line break only ever takes the place of spaces: a #command between two things stays.)
    expect(keepsMeaning('v = @series(  #val 1 N,\n  2 N)')).toBe('v = @series(  #val 1 N,\n    2 N\n)')
  })

  it('indents each line by the blocks it’s in, closing braces under their openers', () => {
    expect(keepsMeaning('A {\nx = 1\n  B {\n   y = 2\n      }\n}\n  z = 3')).toBe('A {\n    x = 1\n    B {\n        y = 2\n    }\n}\nz = 3')
  })

  it('keeps a list’s sub-lists', () => {
    expect(keepsMeaning('@layout.list Steps {\n  a = 1\n    b = 2\n  c = 3\n}')).toBe('@layout.list Steps {\n    a = 1\n      b = 2\n    c = 3\n}')
  })

  it('moves imported data’s rows with their import', () => {
    expect(keepsMeaning('Box {\n@import("run.csv")\n    t, x\n    1, 2\n}')).toBe('Box {\n    @import("run.csv")\n        t, x\n        1, 2\n}')
  })

  it('keeps prose, raw LaTeX, comments and strings as written', () => {
    const source = '@layout.text Notes {\n  see (a, )\n   more\n}\n@latex {\n  \\left(a,\n  b\\right)\n}\n// f(a, )\nt = "(a, )"'
    expect(keepsMeaning(source)).toBe(source)
  })

  it('keeps everything after a bracket never closed', () => {
    const source = 'x = (1 + 2\ny = 3\nz = 4'
    expect(keepsMeaning(source)).toBe(source)
  })

  it('keeps every sheet’s meaning: its tree, and what it works out to', () => {
    for (const source of SHEETS) worksOutTheSame(source)
  }, 30_000)

  it('keeps any text’s meaning, and changes only whitespace and commas in it', () => {
    const next = random(20261119)
    const strip = (text: string) => text.replace(/[ \t\r\n,]/g, '')
    for (let n = 0; n < 500; n++) {
      const length = Math.floor(next() * 40)
      const source = Array.from({ length }, () => TRICKY[Math.floor(next() * TRICKY.length)]).join('')
      expect(strip(keepsMeaning(source))).toBe(strip(source))
    }
  })
})
