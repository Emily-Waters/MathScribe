/**
 * The sheet's structure: blocks and scope, layout blocks, headings and titles,
 * the LaTeX export, and what the editor is told (diagnostics, definitions,
 * symbols).
 */
import { describe, expect, it } from 'vitest'
import {
  DIAGNOSTIC_KIND, SYMBOL_KIND, TITLE_SEGMENT, collectDefinitions, collectDiagnostics, collectSymbols, titleSegments,
} from './document.ts'
import { LAYOUT_STYLE } from './syntax.ts'
import { BLOCK_KIND, type Block, type LayoutBlock } from './blocks.ts'
import { last, lines, sheet } from '../test/helpers.ts'
import { toLatexDocument } from './latex.ts'

/** A compact outline of the blocks: kinds, titles, styles and lines. */
function outline(blocks: Block[], depth = 0): string[] {
  return blocks.flatMap((b) => {
    const pad = '  '.repeat(depth)
    switch (b.kind) {
      case BLOCK_KIND.layout:
        return [`${pad}layout ${b.style ?? 'plain'} "${b.title}"${b.nested ? ' nested' : ''}${b.error ? ' ERROR' : ''}`,
          ...outline(b.children, depth + 1)]
      case BLOCK_KIND.group:
        return [`${pad}group "${b.title}" locals=${b.locals.map((v) => v.name).join(',')}`, ...outline(b.children, depth + 1)]
      case BLOCK_KIND.calc:
        return [`${pad}calc ${b.line}${b.hidden ? ' hidden' : ''}${b.error ? ' ERROR' : ''}`]
      case BLOCK_KIND.text:
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
    expect(s.blocks[0]).toMatchObject({ kind: BLOCK_KIND.group, error: expect.stringMatching(/missing its closing }/) })
  })
})

describe('layout blocks', () => {
  const src = [
    '@layout.list Assumptions {', // 1
    '    > one', // 2
    '    > two', // 3
    '        > nested a', // 4
    '        > nested b', // 5
    '    > three', // 6
    '}', // 7
    '@layout.numbered Steps {  # the 1s orbital', // 8
    '    Z = 1', // 9
    '    sigma = Z * 2', // 10
    '}', // 11
    'after = sigma * 2', // 12
    'E = 2.00 kg * 9.81 m/s^2   #center', // 13
    '@layout.list Empty {', // 14
    '}', // 15
    'x = 1', // 16
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
      'calc 16',
    ])
  })

  it('end at their closing brace, a sub-list too', () => {
    const s = sheet('@layout.list {\n    > a\n        > b\n}\nx = 1')
    expect(outline(s.blocks)).toEqual(['layout list ""', '  text 2', '  layout list "" nested', '    text 3', 'calc 5'])
    expect((s.blocks[0] as LayoutBlock).endLine).toBe(4)
  })

  it('nest in a { } block, and close before it', () => {
    expect(outline(sheet('Q1 {\n    @layout.center {\n        y = 2\n    }\n    z = 3\n}').blocks))
      .toEqual(['group "Q1" locals=y,z', '  layout center ""', '    calc 3', '  calc 5'])
  })

  it('say when one is missing its closing brace', () => {
    expect(sheet('@layout.numbered Steps {\n    a = 1').blocks[0])
      .toMatchObject({ kind: BLOCK_KIND.layout, error: '@layout.numbered Steps { on line 1 is missing its closing }.' })
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
    expect(tex).toMatch(/% Line 14: @layout.list Empty \{\n% Error: @layout.list Empty \{ is empty/)
    expect(tex).not.toMatch(/\\begin\{itemize\}\s*\\end\{itemize\}/)
  })

  it('leave hidden lines out of lists', () => {
    const s = sheet('@layout.numbered Results {  #val\n    F = 2.00 kg * 9.81 m/s^2\n    h = 5   #hide\n}')
    const tex = toLatexDocument(s.blocks)
    expect(tex.match(/\\item/g)).toHaveLength(1)
    expect((s.blocks[0] as LayoutBlock).command).toBe('val')
  })
})

describe('title pages', () => {
  const src = [
    '@layout.titlepage {', // 1
    '    Lab 3: Motion on a ramp', // 2
    '    Emily Waters', // 3
    '    PHYS 101, Section B', // 4
    '', // 5
    '    m = 2 kg is just text here, with {{V}}', // 6
    '}', // 7
    '# Method', // 8
  ].join('\n')

  it('are prose: the first line is the title, and each line after it stays a line of its own', () => {
    const blocks = sheet(`V = 2.0 L\n${src}`).blocks
    expect(outline(blocks)).toEqual(['calc 1', 'layout titlepage "Lab 3: Motion on a ramp"', '  text 4', '  text 5', '  spacer 7', '  text 7', 'heading 9'])
    const page = blocks[1] as LayoutBlock
    expect(page.children.map((b) => (b.kind === BLOCK_KIND.text ? b.text : ''))).toEqual(
      ['Emily Waters', 'PHYS 101, Section B', '', 'm = 2 kg is just text here, with $2.0\\,\\mathrm{L}$'])
  })

  it('take the opener’s title instead, if it has one', () => {
    const page = sheet('@layout.titlepage Lab 3 {\n    Emily Waters\n}').blocks[0] as LayoutBlock
    expect(page.title).toBe('Lab 3')
    expect(page.children).toHaveLength(1)
  })

  it('can be just a title, but not empty', () => {
    expect((sheet('@layout.titlepage {\n    Lab 3\n}').blocks[0] as LayoutBlock).error).toBeUndefined()
    expect(sheet('@layout.titlepage {\n}').blocks[0]).toMatchObject({ error: '@layout.titlepage { is empty: put the text that belongs to it before its }.' })
  })

  it('export to a LaTeX titlepage, the title bold and \\LARGE, and each line centered', () => {
    const tex = toLatexDocument(sheet(src).blocks)
    expect(tex).toContain('\\begin{titlepage}\n\\centering\n\\vspace*{\\fill}\n{\\LARGE\\bfseries Lab 3: Motion on a ramp\\par}')
    expect(tex).toMatch(/Emily Waters\n\nPHYS 101, Section B[\s\S]*\\end\{titlepage\}/)
  })
})

describe('the @layout namespace', () => {
  it('is how layout blocks are opened; the old names aren’t blocks', () => {
    expect(outline(sheet('@layout.center {\n    x = 1\n}').blocks)).toEqual(['layout center ""', '  calc 2'])
    expect(sheet('@center {\n    x = 1\n}').blocks[0].kind).not.toBe(BLOCK_KIND.layout)
  })

  it('names a member it doesn’t have', () => {
    expect(sheet('@layout.bold {\n    x = 1\n}').blocks[0]).toMatchObject({
      kind: BLOCK_KIND.layout, error: expect.stringMatching(/^@layout has no bold; its members are text, list, .*hidden, full, sym, val/),
    })
  })
})

describe('@layout display settings', () => {
  /** The first layout block of a sheet. */
  const layoutOf = (src: string) => sheet(src).blocks.find((b) => b.kind === BLOCK_KIND.layout) as LayoutBlock

  it('.hidden works the lines out without showing them, and they stay usable', () => {
    const src = '@layout.hidden {\n    m = 2.00 kg\n    g_0 = 9.81 m/s^2\n}\nF = m * g_0'
    const s = sheet(src)
    expect(s.blocks[0]).toMatchObject({ kind: BLOCK_KIND.layout, style: undefined, command: 'hide' })
    expect(last(src).error).toBeUndefined()
    expect(toLatexDocument(s.blocks.slice(0, 1))).not.toContain('2.00')
  })

  it('.sym, .val and .full show every line inside that way, unless a line has its own command', () => {
    const lns = lines('@layout.val {\n    F = 2.00 kg * 9.81 m/s^2\n    p = 2.00 kg * 3.00 m/s   #full\n}')
    expect(lns[0].tex).not.toContain('\\cdot')
    expect(lns[0].tex.split('=')).toHaveLength(2)
    expect(lns[1].tex.split('=').length).toBeGreaterThan(2)
  })

  it('combine with each other and with a layout', () => {
    expect(layoutOf('@layout.val.multiline {\n    x = 1\n}')).toMatchObject({ style: undefined, command: 'val', multiline: true })
    expect(layoutOf('@layout.numbered.sym.sci Steps {\n    x = 1\n}')).toMatchObject({ style: 'numbered', command: 'sym', notation: 'sci', title: 'Steps' })
    expect(layoutOf('@layout.hidden.val {\n    x = 1\n}')).toMatchObject({ command: 'hide' })
  })

  it('win over the #commands on the opener', () => {
    expect(layoutOf('@layout.val {  #sym\n    x = 1\n}')).toMatchObject({ command: 'val' })
  })

  it('warn when two can’t both apply, and use the first layout and the last of the rest', () => {
    expect(layoutOf('@layout.sym.val {\n    x = 1\n}')).toMatchObject({
      command: 'val', warning: '@layout.sym.val has more than one of .full, .sym, .val; the last, .val, is used.',
    })
    expect(layoutOf('@layout.list.center {\n    x = 1\n}')).toMatchObject({
      style: 'list', warning: '@layout.list.center has more than one layout; it\'s laid out as .list.',
    })
    expect(layoutOf('@layout.sci.dec {\n    x = 1\n}').warning).toMatch(/has both \.sci and \.dec; the last, \.dec, is used/)
    expect(layoutOf('@layout.text.sym {\n    Some prose.\n}')).toMatchObject({
      style: 'text', warning: 'Nothing in @layout.text is worked out, so .sym does nothing there.',
    })
    expect(layoutOf('@layout.text.hidden {\n    Some prose.\n}')).toMatchObject({ command: 'hide', warning: undefined })
  })

  it('put the warning in the editor’s diagnostics', () => {
    expect(collectDiagnostics(sheet('@layout.sym.val {\n    x = 1\n}').blocks).get(1)).toMatchObject({ kind: DIAGNOSTIC_KIND.warning })
  })
})

describe('text blocks', () => {
  const src = [
    'x = 2', // 1
    '@layout.text Discussion {', // 2
    '    The result is lower than expected,', // 3
    '    because x = 5 isn’t calculated here.', // 4
    '', // 5
    '    # Not a heading, and $E = mc^2$ is maths.', // 6
    'Results:', // 7 (prose, even ending in a colon, and not indented)
    '}', // 8
    'y = x * 3', // 9
    '@layout.text {', // 10
    '}', // 11
    'z = 1', // 12
  ].join('\n')
  const blocks = sheet(src).blocks
  const block = blocks[1] as LayoutBlock

  it('join lines into paragraphs, split by blank lines, without calculating anything', () => {
    expect(block).toMatchObject({ kind: BLOCK_KIND.layout, style: LAYOUT_STYLE.text, title: 'Discussion', endLine: 8 })
    expect(block.children).toEqual([
      { kind: BLOCK_KIND.text, line: 3, text: 'The result is lower than expected, because x = 5 isn’t calculated here.' },
      { kind: BLOCK_KIND.text, line: 6, text: '# Not a heading, and $E = mc^2$ is maths. Results:' },
    ])
  })

  it('end at their closing brace', () => {
    expect(outline(blocks)).toEqual(['calc 1', 'layout text "Discussion"', '  text 3', '  text 6', 'calc 9', 'layout text "" ERROR', 'calc 12'])
    expect(lines(src).find((l) => l.line === 4)).toBeUndefined() // not evaluated
  })

  it('say when one is missing its closing brace', () => {
    expect(sheet('@layout.text Notes {\n    prose').blocks[0]).toMatchObject({ error: '@layout.text Notes { is missing its closing }.' })
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
      { kind: TITLE_SEGMENT.text, value: 'Hydrogen 2p' }, { kind: TITLE_SEGMENT.sub, value: 'z' }, { kind: TITLE_SEGMENT.text, value: ' orbital' },
    ])
    expect(titleSegments('x_{max}')).toEqual([{ kind: TITLE_SEGMENT.text, value: 'x' }, { kind: TITLE_SEGMENT.sub, value: 'max' }])
    expect(titleSegments('Energy $E_n$ eV')).toEqual([
      { kind: TITLE_SEGMENT.text, value: 'Energy ' }, { kind: TITLE_SEGMENT.math, value: 'E_n' }, { kind: TITLE_SEGMENT.text, value: ' eV' },
    ])
    expect(titleSegments('my\\_block')).toEqual([{ kind: TITLE_SEGMENT.text, value: 'my_block' }])
  })

  it('export subscripts with \\textsubscript', () => {
    const tex = toLatexDocument(sheet('# The 2p_z orbital\nHydrogen 2p_z orbital {\n  Z = 1\n}').blocks)
    expect(tex).toContain('\\section{The 2p\\textsubscript{z} orbital}')
    expect(tex).toContain('frametitle={Hydrogen 2p\\textsubscript{z} orbital}')
  })

  it('number sections like LaTeX', () => {
    const s = sheet('# A\n## a\n## b\n# B\n## c')
    expect(s.blocks.map((b) => (b.kind === BLOCK_KIND.heading ? b.number : ''))).toEqual(['1', '1.1', '1.2', '2', '2.1'])
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
    '@layout.numbered S {', // 2
    '    g(t) = 2*t', // 3
    '}', // 4
    'W {', // 5
    '    def h(a, b to m)', // 6
    '        return a', // 7
    '    local = 3', // 8
    '}', // 9
    'f(x) = x^3', // 10
    'y = 2.0 m', // 11
    'z = undefined_thing', // 12
  ].join('\n')

  it('finds every function definition, in order', () => {
    expect([...collectDefinitions(sheet(src).blocks)]).toEqual([['f', [1, 10]], ['g', [3]], ['h', [6]]])
  })

  it('finds definitions with settings for the result', () => {
    const withSettings = 'ang(y, x):3:deg = atan(y/x)\ndef polar(x, y):3\n    return tuple(x, y)'
    expect([...collectDefinitions(sheet(withSettings).blocks)]).toEqual([['ang', [1]], ['polar', [2]]])
    expect(collectSymbols(sheet(withSettings), withSettings).find((s) => s.name === 'polar')?.params).toBe('x, y')
  })

  it('collects symbols with their scope', () => {
    const symbols = collectSymbols(sheet(src), src)
    const find = (name: string) => symbols.filter((s) => s.name === name)
    expect(find('local')).toEqual([expect.objectContaining({ kind: SYMBOL_KIND.variable, line: 8, from: 9, to: 9 })])
    expect(find('b')).toEqual([expect.objectContaining({ kind: SYMBOL_KIND.parameter, from: 7, to: 7 })])
    expect(find('h')[0]).toMatchObject({ kind: SYMBOL_KIND.function, params: 'a, b to m', to: 9 })
    expect(find('y')[0]).toMatchObject({ kind: SYMBOL_KIND.variable, from: 12, tex: expect.stringContaining('2.0') })
  })

  it('collects the names a tuple is unpacked into', () => {
    const unpackSrc = 'r = tuple(1.0, 2.0)\ntuple(a, b:2) = r'
    const names = collectSymbols(sheet(unpackSrc), unpackSrc).map((s) => `${s.name}@${s.from}`)
    expect(names).toEqual(['r@2', 'a@3', 'b@3'])
  })

  it('marks errors by line', () => {
    const d = collectDiagnostics(sheet(src).blocks)
    expect(d.get(12)).toMatchObject({ kind: DIAGNOSTIC_KIND.error })
    expect(d.size).toBe(1)
  })
})
