/**
 * The sheet's structure: blocks and scope, layout blocks, headings and titles,
 * the LaTeX export, and what the editor is told (diagnostics, definitions,
 * symbols).
 */
import { describe, expect, it } from 'vitest'
import {
  collectDefinitions, collectDiagnostics, collectSymbols, titleSegments,
  type Block, type LayoutBlock,
} from './document.ts'
import { last, lines, sheet } from '../test/helpers.ts'
import { toLatexDocument } from './latex.ts'

/** A compact outline of the blocks: kinds, titles, styles and lines. */
function outline(blocks: Block[], depth = 0): string[] {
  return blocks.flatMap((b) => {
    const pad = '  '.repeat(depth)
    switch (b.kind) {
      case 'layout':
        return [`${pad}layout ${b.style ?? 'plain'} "${b.title}"${b.nested ? ' nested' : ''}${b.error ? ' ERROR' : ''}`,
          ...outline(b.children, depth + 1)]
      case 'group':
        return [`${pad}group "${b.title}" locals=${b.locals.map((v) => v.name).join(',')}`, ...outline(b.children, depth + 1)]
      case 'calc':
        return [`${pad}calc ${b.line}${b.hidden ? ' hidden' : ''}${b.error ? ' ERROR' : ''}`]
      case 'text':
        return [`${pad}text ${b.line}`]
      default:
        return [`${pad}${b.kind} ${b.line}`]
    }
  })
}

describe('{ } blocks', () => {
  it('scope their variables', () => {
    const src = 'theta = 30.0 deg\nSteeper ramp {\n  theta = 45.0 deg\n}\nx = theta'
    const s = sheet(src)
    expect(outline(s.blocks)).toEqual(['calc 1', 'group "Steeper ramp" locals=theta', '  calc 3', 'calc 5'])
    expect(last(src).tex).toContain('30.0')
  })

  it('report a missing closing brace', () => {
    const s = sheet('Open {\n  x = 1')
    expect(s.blocks[0]).toMatchObject({ kind: 'group', error: expect.stringMatching(/missing its closing }/) })
  })
})

describe('layout blocks', () => {
  const src = [
    'Assumptions:   #list',
    '    > one',
    '    > two',
    '        > nested a',
    '        > nested b',
    '    > three',
    '',
    'Steps:   #numbered  # the 1s orbital',
    '    Z = 1',
    '    sigma = Z * 2',
    '',
    'after = sigma * 2',
    'E = 2.00 kg * 9.81 m/s^2   #center',
    'Empty:   #list',
    'x = 1',
  ].join('\n')

  it('build lists, sub-lists and single centered lines', () => {
    expect(outline(sheet(src).blocks)).toEqual([
      'layout list "Assumptions"',
      '  text 2',
      '  text 3',
      '  layout list "" nested',
      '    text 4',
      '    text 5',
      '  text 6',
      'layout numbered "Steps"',
      '  calc 9',
      '  calc 10',
      'calc 12',
      'layout center ""',
      '  calc 13',
      'layout list "Empty" ERROR',
      'calc 15',
    ])
  })

  it('don’t scope their variables', () => {
    expect(lines(src).find((l) => l.line === 12)?.error).toBeUndefined()
  })

  it('export to itemize, enumerate and center', () => {
    const tex = toLatexDocument(sheet(src).blocks)
    expect(tex).toContain('\\paragraph{Assumptions}\n\\begin{itemize}\n\\item one\n\\item two\n\\begin{itemize}\n\\item nested a')
    expect(tex).toContain('\\paragraph{Steps --- the 1s orbital}\n\\begin{enumerate}\n\\item $\\displaystyle Z = 1$')
    expect(tex).toContain('\\begin{center}')
    // An empty list would not compile, so it's left as a comment.
    expect(tex).toMatch(/% Line 14: Empty:\n% Error: Nothing is indented/)
    expect(tex).not.toMatch(/\\begin\{itemize\}\s*\\end\{itemize\}/)
  })

  it('leave hidden lines out of lists', () => {
    const s = sheet('Results:   #numbered #val\n    F = 2.00 kg * 9.81 m/s^2\n    h = 5   #hide')
    const tex = toLatexDocument(s.blocks)
    expect(tex.match(/\\item/g)).toHaveLength(1)
    expect((s.blocks[0] as LayoutBlock).command).toBe('val')
  })
})

describe('text blocks', () => {
  const src = [
    'x = 2', // 1
    'Discussion:   #text', // 2
    '    The result is lower than expected,', // 3
    '    because x = 5 isn’t calculated here.', // 4
    '', // 5
    '    # Not a heading, and $E = mc^2$ is maths.', // 6
    'y = x * 3', // 7
    ':   #text', // 8
    'z = 1', // 9
  ].join('\n')
  const blocks = sheet(src).blocks
  const block = blocks[1] as LayoutBlock

  it('join lines into paragraphs, split by blank lines, without calculating anything', () => {
    expect(block).toMatchObject({ kind: 'layout', style: 'text', title: 'Discussion', endLine: 6 })
    expect(block.children).toEqual([
      { kind: 'text', line: 3, text: 'The result is lower than expected, because x = 5 isn’t calculated here.' },
      { kind: 'text', line: 6, text: '# Not a heading, and $E = mc^2$ is maths.' },
    ])
  })

  it('end at the first line indented no further than the opener', () => {
    expect(outline(blocks)).toEqual(['calc 1', 'layout text "Discussion"', '  text 3', '  text 6', 'calc 7', 'layout text "" ERROR', 'calc 9'])
    expect(lines(src).find((l) => l.line === 4)).toBeUndefined() // not evaluated
  })

  it('export as plain paragraphs under the title', () => {
    const tex = toLatexDocument(blocks)
    expect(tex).toContain('\\paragraph{Discussion}\nThe result is lower than expected, because x = 5 isn’t calculated here.\n\n'
      + '\\# Not a heading, and $E = mc^2$ is maths.')
  })
})

describe('headings and titles', () => {
  it('make subscripts and inline maths', () => {
    expect(titleSegments('Hydrogen 2p_z orbital')).toEqual([
      { kind: 'text', value: 'Hydrogen 2p' }, { kind: 'sub', value: 'z' }, { kind: 'text', value: ' orbital' },
    ])
    expect(titleSegments('x_{max}')).toEqual([{ kind: 'text', value: 'x' }, { kind: 'sub', value: 'max' }])
    expect(titleSegments('Energy $E_n$ eV')).toEqual([
      { kind: 'text', value: 'Energy ' }, { kind: 'math', value: 'E_n' }, { kind: 'text', value: ' eV' },
    ])
    expect(titleSegments('my\\_block')).toEqual([{ kind: 'text', value: 'my_block' }])
  })

  it('export subscripts with \\textsubscript', () => {
    const tex = toLatexDocument(sheet('# The 2p_z orbital\nHydrogen 2p_z orbital {\n  Z = 1\n}').blocks)
    expect(tex).toContain('\\section{The 2p\\textsubscript{z} orbital}')
    expect(tex).toContain('frametitle={Hydrogen 2p\\textsubscript{z} orbital}')
  })

  it('number sections like LaTeX', () => {
    const s = sheet('# A\n## a\n## b\n# B\n## c')
    expect(s.blocks.map((b) => (b.kind === 'heading' ? b.number : ''))).toEqual(['1', '1.1', '1.2', '2', '2.1'])
  })
})

describe('constant declarations', () => {
  it('apply sheet-wide, and warn about a second one', () => {
    const src = '@a_0:3 to angstrom\nr = 2 * @a_0\n@a_0:4'
    const [decl, , second] = lines(src)
    expect(decl.info).toMatch(/Every @a_0 in this sheet uses this value, to 3 sig figs, in angstrom/)
    expect(second.warning).toMatch(/already declared on line 1/)
  })
})

describe('editor information', () => {
  const src = [
    'f(x) = x^2', // 1
    'S:  #numbered', // 2
    '    g(t) = 2*t', // 3
    'W {', // 4
    '    def h(a, b to m)', // 5
    '        return a', // 6
    '    local = 3', // 7
    '}', // 8
    'f(x) = x^3', // 9
    'y = 2.0 m', // 10
    'z = undefined_thing', // 11
  ].join('\n')

  it('finds every function definition, in order', () => {
    expect([...collectDefinitions(sheet(src).blocks)]).toEqual([['f', [1, 9]], ['g', [3]], ['h', [5]]])
  })

  it('collects symbols with their scope', () => {
    const symbols = collectSymbols(sheet(src), src)
    const find = (name: string) => symbols.filter((s) => s.name === name)
    expect(find('local')).toEqual([expect.objectContaining({ kind: 'variable', line: 7, from: 8, to: 8 })])
    expect(find('b')).toEqual([expect.objectContaining({ kind: 'parameter', from: 6, to: 6 })])
    expect(find('h')[0]).toMatchObject({ kind: 'function', params: 'a, b to m', to: 8 })
    expect(find('y')[0]).toMatchObject({ kind: 'variable', from: 11, tex: expect.stringContaining('2.0') })
  })

  it('collects the names a tuple is unpacked into', () => {
    const unpackSrc = 'r = tuple(1.0, 2.0)\ntuple(a, b:2) = r'
    const names = collectSymbols(sheet(unpackSrc), unpackSrc).map((s) => `${s.name}@${s.from}`)
    expect(names).toEqual(['r@2', 'a@3', 'b@3'])
  })

  it('marks errors by line', () => {
    const d = collectDiagnostics(sheet(src).blocks)
    expect(d.get(11)).toMatchObject({ kind: 'error' })
    expect(d.size).toBe(1)
  })
})
