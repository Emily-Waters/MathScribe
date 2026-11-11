/** Awkward and malformed sheets: each gives errors on its lines, never an exception. */
import { describe, expect, it } from 'vitest'
import { sheet } from '../test/helpers.ts'
import { collectDefinitions, collectDiagnostics, collectSymbols, evaluateSheetSafely, lineNumbering } from './document.ts'
import { DEFAULT_LATEX_OPTIONS, toLatexDocument } from './latex.ts'
import { docxParts } from './docx.ts'
import { EXAMPLE_CALC_OPTIONS } from '../config.ts'

const AWKWARD = [
  '', ' ', '\n\n\n', '=', '= 3', 'x =', 'x = =', 'x == 3', '((', '))', 'x = (2 + ', 'x = 2 +* 3',
  '{', '}', '}}', '{{', '{}', '{{}}', '> {{', '> {{}}', '> {{x', '> {', '> {}', '## {{nope}} {Na^+',
  'x:"unclosed = 3', 'x:"" = 3', 'x::: = 3', 'x:0 = 3', 'x:"{{x}}" = 3', 'x:sci:dec = 3',
  'def', 'def f', 'def f(', 'def f(a,)\n    return', 'f(x) = f(x)\ny = f(1)', 'f(x) =', 'return 3',
  'import(', 'import("x.csv")', 'import("x.csv")\n    a, a\n    1, 2', 'r = import("x.csv")\n    t (zz)\n    1',
  'table(', 'table()', 'table(;)', 'table(t; rows -)', 'plot()', 'plot(t)', 'plot(t, x; fit cubic)', 'p = plot(;;)',
  'a = select()', 'a = select(;)', 'a = select(t; t from)', 'a.b', 'a.b.c = 1', '.x = 1', 'x. = 1',
  'x = 1 mol {', 'x = 1 mol {}', 'x = 1 mol {Na^+} + 1 mol {Cl^-}', 'x = 1 M M', 'x = 2 to', 'x = 2 m to s', 'x = to m',
  'x = 1 pm', 'x = pm 1', 'x = 1 pm 1 pm 1', 'x = (1 pm) m', 'delta', 'delta x', 'x = 1/0', 'x = 0/0', 'x = sqrt(-1)',
  'x = <1, 2', 'x = <>', 'x = <1,>', 'tuple(a, b) = 3', 'tuple() = tuple()', 'x = solve()', 'x = solve(x = x, x)',
  'x = solve(1 = 2, y)', '@', '@nope', '@c:0', '@constants {', '@constants {\n  x = y\n}', 'T:  #text', 'T:  #list\n',
  'T {\n  x = 1', 'x = 1  #nope #sym #val #hide #multiline', '// only a comment', '$', '$ \\frac{', '#', '####',
  'x = "text"', 'x = [1, 2; 3]', 'x = 1e999', 'x = 1e-999 m', 'x_1 = 1\nx_2 = 2 m\nx_avg', 'e1 = 1\ne', 'π = 3',
  'x = 10^10^10', 'x = 5 %', 'x = 5 to percent', 'x = 1 m\ny = x to percent', 'Δ = 1\nΔ x', 'x = 1\n{{x}}',
]

describe('awkward input', () => {
  it('never throws: reading, the editor’s information, and both exports', () => {
    for (const source of AWKWARD) {
      const run = () => {
        const s = sheet(source)
        collectDiagnostics(s.blocks)
        collectDefinitions(s.blocks)
        collectSymbols(s, source).forEach((symbol) => symbol.tex)
        lineNumbering(s.blocks)
        s.variables.forEach((v) => v.tex)
        toLatexDocument(s.blocks, DEFAULT_LATEX_OPTIONS)
        docxParts(s.blocks, DEFAULT_LATEX_OPTIONS)
      }
      expect(run, JSON.stringify(source)).not.toThrow()
    }
  })

  it('never throws on any two of them together', () => {
    for (const [i, a] of AWKWARD.entries()) {
      const b = AWKWARD[(i * 7 + 3) % AWKWARD.length]
      expect(() => sheet(`${a}\n${b}\n${a}`), JSON.stringify([a, b])).not.toThrow()
    }
  })
})

describe('evaluateSheetSafely', () => {
  it('gives the sheet as usual', () => {
    expect(evaluateSheetSafely('x = 2', EXAMPLE_CALC_OPTIONS).variables.map((v) => v.name)).toEqual(['x'])
  })
})
