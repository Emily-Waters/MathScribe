/**
 * The editor's MathScribe language: how each line is coloured (which must match
 * how the engine reads it), indentation and folding.
 */
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { codeFolding, ensureSyntaxTree, foldEffect, foldable, getIndentation } from '@codemirror/language'
import { insertNewlineAndIndent } from '@codemirror/commands'
import { highlightTree, tagHighlighter, tags as t } from '@lezer/highlight'
import { inTextBlock, mathscribeFolding, mathscribeIndent, mathscribeLanguage } from './language.ts'

const names = tagHighlighter([
  { tag: t.number, class: 'num' }, { tag: t.unit, class: 'unit' }, { tag: t.variableName, class: 'var' },
  { tag: t.function(t.variableName), class: 'fn' }, { tag: t.definition(t.function(t.variableName)), class: 'def' },
  { tag: t.constant(t.variableName), class: 'const' }, { tag: t.keyword, class: 'kw' },
  { tag: t.processingInstruction, class: 'cmd' }, { tag: t.lineComment, class: 'note' }, { tag: t.heading, class: 'head' },
  { tag: t.content, class: 'text' }, { tag: t.quote, class: 'quote' }, { tag: t.special(t.string), class: 'latex' },
  { tag: t.labelName, class: 'title' }, { tag: t.brace, class: 'brace' },
  { tag: t.comment, class: 'comment' }, { tag: t.special(t.variableName), class: 'value' }, { tag: t.atom, class: 'formula' },
])

/** The coloured tokens of a one-line sheet, as `text:kind` (operators and brackets left out). */
function tokens(line: string): string[] {
  const state = EditorState.create({ doc: line, extensions: [mathscribeLanguage] })
  const tree = ensureSyntaxTree(state, line.length, 5000)!
  const out: string[] = []
  highlightTree(tree, names, (from, to, cls) => out.push(`${line.slice(from, to)}:${cls}`))
  return out
}

describe('comments and values in text', () => {
  it('colours a // line as a comment, whatever it holds', () => {
    expect(tokens('// m = 2 kg # not a calculation')).toEqual(['// m = 2 kg # not a calculation:comment'])
    expect(tokens('    // indented')).toEqual(['// indented:comment'])
  })

  it('sets a {{value}} off from the prose around it', () => {
    expect(tokens('> about {{c_Na:3}} in all')).toContain('{{c_Na:3}}:value')
  })

  it('colours a formula as chemistry: in prose, a species after a unit, and a reaction line', () => {
    expect(tokens('> the {Na^+} ion')).toContain('{Na^+}:formula')
    expect(tokens('n = 2.0 mol {EDTA}')).toEqual(['n:var', '2.0:num', 'mol:unit', '{EDTA}:formula'])
    expect(tokens('{Na^+ + Cl^- -> NaCl}')).toEqual(['{Na^+ + Cl^- -> NaCl}:formula'])
  })
})

describe('highlighting', () => {
  it('reads a unit after a number as a unit, as the engine does', () => {
    expect(tokens('g = 9.81 m/s^2   # gravity')).toEqual(['g:var', '9.81:num', 'm/s^2:unit', '# gravity:note'])
    // A space ends a unit: here m is the variable.
    expect(tokens('q = 5 kg * m')).toEqual(['q:var', '5:num', 'kg:unit', 'm:var'])
  })

  it('knows constants, keywords, conversions and uncertainties', () => {
    expect(tokens('@a_0:3 to angstrom')).toEqual(['@a_0:3:const', 'to:kw', 'angstrom:unit'])
    expect(tokens('d = 3.50 m pm 0.02 m')).toEqual(['d:var', '3.50:num', 'm:unit', 'pm:kw', '0.02:num', 'm:unit'])
  })

  it('colours a display unit on the assigned name as a unit', () => {
    expect(tokens('phi:3:deg = atan(y/x)')).toEqual(['phi:var', '3:num', 'deg:unit', 'atan:fn', 'y:var', 'x:var'])
  })

  it('colours a function’s result unit as a unit, and still sees a definition', () => {
    expect(tokens('ang(y, x):3:deg = atan(y/x)').slice(0, 5)).toEqual(['ang:def', 'y:var', 'x:var', '3:num', 'deg:unit'])
    expect(tokens('def polar(x, y):deg')).toEqual(['def:kw', 'polar:def', 'x:var', 'y:var', 'deg:unit'])
  })

  it('colours tuple(a, b) = … as unpacking, not a function definition', () => {
    expect(tokens('tuple(a, b) = polar(x, y)')).toEqual(['tuple:fn', 'a:var', 'b:var', 'polar:fn', 'x:var', 'y:var'])
    expect(tokens('tuple(r:3, theta:deg) = p')).toEqual(['tuple:fn', 'r:var', '3:num', 'theta:var', 'deg:unit', 'p:var'])
  })

  it('reads Greek letters as part of a name', () => {
    expect(tokens('ΔE = 2 * ω_0')).toEqual(['ΔE:var', '2:num', 'ω_0:var'])
  })

  it('reads µ or μ before a unit as the micro prefix', () => {
    expect(tokens('d = 3.0 µm')).toEqual(['d:var', '3.0:num', 'µm:unit'])
    expect(tokens('d = 3.0 μm')).toEqual(['d:var', '3.0:num', 'μm:unit'])
  })

  it('colours #sci and #dec as commands', () => {
    expect(tokens('p^2   #sci   # density')).toEqual(['p:var', '2:num', '#sci:cmd', '# density:note'])
  })

  it('reads a unit after a vector as a unit, but not after a comparison', () => {
    expect(tokens('F = <3.0, 4.0> N')).toEqual(['F:var', '3.0:num', '4.0:num', 'N:unit'])
    expect(tokens('q = a > m')).toEqual(['q:var', 'a:var', 'm:var'])
  })

  it('tells definitions from calls', () => {
    expect(tokens('E_k(n, m to kg) = n * m')[0]).toBe('E_k:def')
    expect(tokens('def KE(mass)').slice(0, 2)).toEqual(['def:kw', 'KE:def'])
    expect(tokens('s = sin(30.0 deg)')).toEqual(['s:var', 'sin:fn', '30.0:num', 'deg:unit'])
  })

  it('separates commands from notes', () => {
    expect(tokens('F = m * a   #multiline #val  # weight')).toEqual(
      ['F:var', 'm:var', 'a:var', '#multiline:cmd', '#val:cmd', '# weight:note'])
  })

  it('colours headings, prose, LaTeX and block openers', () => {
    expect(tokens('## Forces')).toEqual(['## Forces:head'])
    expect(tokens('> Prose with $E = mc^2$ inline')).toEqual(
      ['>:quote', 'Prose with :text', '$E = mc^2$:latex', 'inline:text'])
    expect(tokens('@layout.numbered Steps {  # the 1s orbital')).toEqual(
      ['@layout.numbered:kw', 'Steps:title', '{  :brace', '# the 1s orbital:note'])
    expect(tokens('@constants {')).toEqual(['@constants:kw', '{:brace'])
    expect(tokens('What if {')).toEqual(['What if:title', '{:brace'])
  })

  it('colours @chem’s constants and functions', () => {
    expect(tokens('M = @chem.mm.Na:3')).toEqual(['M:var', '@chem.mm.Na:3:const'])
    expect(tokens('M = @chem.mm({H2O})')[1]).toBe('@chem.mm:fn')
  })
})

describe('text blocks', () => {
  /** Tokens of each line of a multi-line sheet. */
  const tokensByLine = (doc: string) => {
    const state = EditorState.create({ doc, extensions: [mathscribeLanguage] })
    const tree = ensureSyntaxTree(state, doc.length, 5000)!
    const out: string[][] = Array.from({ length: state.doc.lines }, () => [])
    highlightTree(tree, names, (from, to, cls) => out[state.doc.lineAt(from).number - 1].push(`${doc.slice(from, to)}:${cls}`))
    return out
  }

  it('colour the lines of an @layout.text block as prose, up to its closing brace', () => {
    const lines = tokensByLine('@layout.text Notes {\n    m = 2 kg is prose here, with $x^2$\n\nResults:\n}\ny = 2.0 m')
    expect(lines[0]).toEqual(['@layout.text:kw', 'Notes:title', '{:brace'])
    expect(lines[1]).toEqual(['m = 2 kg is prose here, with :text', '$x^2$:latex'])
    expect(lines[3]).toEqual(['Results::text'])
    expect(lines[5]).toEqual(['y:var', '2.0:num', 'm:unit'])
  })

  it('colour a chained opener as one name, and read its prose layout among the members', () => {
    const lines = tokensByLine('@layout.hidden.text Notes {\n    m = 2 kg\n}\n@layout.val.multiline {\n    y = 2.0 m\n}')
    expect(lines[0]).toEqual(['@layout.hidden.text:kw', 'Notes:title', '{:brace'])
    expect(lines[1]).toEqual(['m = 2 kg:text'])
    expect(lines[3]).toEqual(['@layout.val.multiline:kw', '{:brace'])
    expect(lines[4]).toEqual(['y:var', '2.0:num', 'm:unit'])
  })

  it('colour a title page’s lines as prose too', () => {
    const lines = tokensByLine('@layout.titlepage {\n    Lab 3: Motion on a ramp\n}\ny = 2.0 m')
    expect(lines[1]).toEqual(['Lab 3: Motion on a ramp:text'])
    expect(lines[3]).toEqual(['y:var', '2.0:num', 'm:unit'])
  })

  it('are recognised for the editor’s suggestions', () => {
    const doc = EditorState.create({ doc: '@layout.text Notes {\n    prose\n\n    more\n}\nx = 1\n@layout.numbered Steps {\n    a = 1\n}' }).doc
    expect([1, 2, 4, 5, 6, 8].map((n) => inTextBlock(doc, n))).toEqual([false, true, true, false, false, false])
  })
})

describe('indentation', () => {
  const indentAfter = (text: string) => {
    const doc = `${text}\n`
    const state = EditorState.create({ doc, extensions: [mathscribeLanguage, mathscribeIndent] })
    return getIndentation(state, doc.length)
  }

  it('goes one level deeper after a block opener or def', () => {
    expect(indentAfter('@layout.numbered Steps {')).toBe(4)
    expect(indentAfter('Steps:')).toBe(0)
    expect(indentAfter('What if {')).toBe(4)
    expect(indentAfter('def f(x)')).toBe(4)
    expect(indentAfter('    x = 1')).toBe(4)
    expect(indentAfter('x = 1')).toBe(0)
  })

  it('goes on at an import’s level below a blank line after its rows', () => {
    expect(indentAfter('import("run.csv")\n    t (s)\n    0.10\n')).toBe(0)
    // Straight after a row (the block open), the rows carry on.
    expect(indentAfter('import("run.csv")\n    t (s)\n    0.10')).toBe(4)
  })

  /** What pressing Enter at the end of `doc` adds, as the editor does it. */
  const enter = (doc: string) => {
    let state = EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [mathscribeLanguage, mathscribeIndent] })
    insertNewlineAndIndent({ state, dispatch: (tr) => { state = tr.state } })
    return state.doc.toString().slice(doc.length)
  }

  it('indents when Enter is pressed after a block opener, and not after a line or an import’s rows', () => {
    expect(enter('x = 1\ndef f(x)')).toBe('\n    ')
    expect(enter('@layout.numbered Steps {  # note')).toBe('\n    ')
    expect(enter('a = 1\nBlock {')).toBe('\n    ')
    expect(enter('Block {\n    x = 1')).toBe('\n    ')
    expect(enter('x = 1')).toBe('\n')
    expect(enter('import("a.csv")\n    t\n    1')).toBe('\n    ')
    expect(enter('import("a.csv")\n    t\n    1\n')).toBe('\n')
  })

  it('starts a new line after a folded import at its level, not in its hidden rows', () => {
    const doc = 'import("run.csv")\n    t (s)\n    0.10\n    0.20'
    let state = EditorState.create({
      doc, selection: { anchor: doc.length }, extensions: [mathscribeLanguage, mathscribeIndent, mathscribeFolding, codeFolding()],
    })
    const enter = () => insertNewlineAndIndent({ state, dispatch: (tr) => { state = tr.state } })
    // Open, Enter in the rows carries on with them.
    enter()
    expect(state.doc.toString().endsWith('\n    ')).toBe(true)
    // Folded, the cursor at the end of the import line (after the hidden rows) starts a line of its own.
    state = EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [mathscribeLanguage, mathscribeIndent, mathscribeFolding, codeFolding()] })
    const range = foldable(state, 0, state.doc.line(1).to)!
    state = state.update({ effects: foldEffect.of(range) }).state
    enter()
    expect(state.doc.toString().endsWith('0.20\n')).toBe(true)
  })

  it('dedents a closing brace', () => {
    const doc = 'Block {\n    x = 1\n}'
    const state = EditorState.create({ doc, extensions: [mathscribeLanguage, mathscribeIndent] })
    expect(getIndentation(state, doc.length - 1)).toBe(0)
  })
})

describe('folding', () => {
  const foldsAt = (doc: string, lineNo: number) => {
    const state = EditorState.create({ doc, extensions: [mathscribeLanguage, mathscribeFolding] })
    const line = state.doc.line(lineNo)
    const range = foldable(state, line.from, line.to)
    return range && [state.doc.lineAt(range.from).number, state.doc.lineAt(range.to).number]
  }

  it('folds a def body by indentation', () => {
    expect(foldsAt('def f(x)\n    y = x\n    return y\nz = 1', 1)).toEqual([1, 3])
  })

  it('folds a { } block up to its closing brace, a built-in one too', () => {
    expect(foldsAt('W {\n  a = 1\n  b = 2\n}', 1)).toEqual([1, 3])
    expect(foldsAt('@layout.text Notes {\n    The {Na^+} ion.\n\n    More.\n}\nc = 3', 1)).toEqual([1, 4])
  })

  it('doesn’t fold ordinary lines', () => {
    expect(foldsAt('x = 1\ny = 2', 1)).toBeNull()
  })
})
