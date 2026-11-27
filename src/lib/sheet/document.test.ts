/**
 * The sheet's structure: blocks and scope, layout blocks, headings and titles,
 * the LaTeX export, and what the editor is told (diagnostics, definitions,
 * symbols).
 */
import { describe, expect, it } from 'vitest'
import { DIAGNOSTIC_KIND, SYMBOL_KIND, collectDefinitions, collectDiagnostics, collectSymbols } from './sheetIndex.ts'
import { TITLE_SEGMENT, titleSegments } from '../output/textSegments.ts'
import { LAYOUT_STYLE } from '../syntax.ts'
import { BLOCK_KIND, HEADING_LEVEL, type Block, type LayoutBlock } from './blocks.ts'
import { last, lineAt, lines, readable, sheet, value } from '../../test/helpers.ts'
import { toLatexDocument } from '../output/latex.ts'

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

  it('can be titled as a section or subsection, numbered with the headings', () => {
    const src = '# Setup\n# Kinematics {\n  v = 2.0 m/s\n}\n## Energy {  // at the top\n  E = 1.0 J\n}\n# Results'
    const s = sheet(src)
    const numbered = (b: Block) => (b.kind === BLOCK_KIND.heading ? `${b.number} ${b.text}`
      : b.kind === BLOCK_KIND.group ? `${b.section?.number} ${b.title} {` : b.kind)
    expect(s.blocks.map(numbered)).toEqual(['1 Setup', '2 Kinematics {', '2.1 Energy {', '3 Results'])
    // The block scopes its variables, and takes a note after its `{`, as any does.
    expect(s.blocks[1]).toMatchObject({ section: { level: HEADING_LEVEL.section }, locals: [expect.objectContaining({ name: 'v' })] })
    expect(s.blocks[2]).toMatchObject({ section: { level: HEADING_LEVEL.subsection }, note: 'at the top' })
    // A heading that isn't a block's is just a heading.
    expect(sheet('# The {Na^+} ion').blocks[0]).toMatchObject({ kind: BLOCK_KIND.heading })
  })

  it('titled as a section, take the section’s number in the exports too', () => {
    const tex = toLatexDocument(sheet('# Setup\n# Kinematics {\n  v = 2.0 m/s\n}').blocks)
    expect(tex).toContain('\\refstepcounter{section}')
    expect(tex).toContain('frametitle={\\thesection\\quad Kinematics}')
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
    '@layout.list(1) Steps {  // the 1s orbital', // 8
    '    Z = 1', // 9
    '    sigma = Z * 2', // 10
    '}', // 11
    'after = sigma * 2', // 12
    '@layout.center {', // 13
    '    E = 2.00 kg * 9.81 m/s^2', // 14
    '}', // 15
    '@layout.list Empty {', // 16
    '}', // 17
    'x = 1', // 18
  ].join('\n')

  it('build lists, sub-lists and centered lines', () => {
    expect(outline(sheet(src).blocks)).toEqual([
      'layout list "Assumptions"',
      '  text 2',
      '  text 3',
      '  layout list "" nested',
      '    text 4',
      '    text 5',
      '  text 6',
      'layout list "Steps"',
      '  calc 9',
      '  calc 10',
      'calc 12',
      'layout center ""',
      '  calc 14',
      'layout list "Empty" ERROR',
      'calc 18',
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
    expect(sheet('@layout.list(1) Steps {\n    a = 1').blocks[0])
      .toMatchObject({ kind: BLOCK_KIND.layout, error: '@layout.list(1) Steps { on line 1 is missing its closing }.' })
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
    expect(tex).toMatch(/% Line 16: @layout.list Empty \{\n% Error: @layout.list Empty \{ is empty/)
    expect(tex).not.toMatch(/\\begin\{itemize\}\s*\\end\{itemize\}/)
  })

  it('leave hidden lines out of lists', () => {
    const s = sheet('@layout.list(1).val Results {\n    F = 2.00 kg * 9.81 m/s^2\n    @layout.hidden {\n        h = 5\n    }\n}')
    const tex = toLatexDocument(s.blocks)
    expect(tex.match(/\\item/g)).toHaveLength(1)
    expect((s.blocks[0] as LayoutBlock).display).toBe('val')
  })

  it('make each line of a block that only sets how they’re shown an item of their own', () => {
    const s = sheet('@layout.list(1) Results {\n    a = 1\n    @layout.val {\n        b = 2 * 3\n        c = 4 * 5\n    }\n}')
    expect(toLatexDocument(s.blocks).match(/\\item/g)).toHaveLength(3)
  })
})

describe('@latex blocks', () => {
  it('display raw LaTeX, on one line or up to a } on its own, without working it out', () => {
    const s = sheet('@latex { \\frac{a}{b} }\n@latex {\n    \\begin{aligned}\n      F &= ma\n    \\end{aligned}\n}\nx = 1')
    expect(s.blocks[0]).toMatchObject({ kind: BLOCK_KIND.latex, line: 1, latex: '\\frac{a}{b}' })
    expect(s.blocks[1]).toMatchObject({
      kind: BLOCK_KIND.latex, line: 2, endLine: 6, latex: '\\begin{aligned}\nF &= ma\n\\end{aligned}',
    })
    expect(outline(s.blocks).at(-1)).toBe('calc 7')
    expect(toLatexDocument(s.blocks)).toContain('\\frac{a}{b}')
  })

  it('with an error, are a comment in the LaTeX export, not maths', () => {
    expect(toLatexDocument(sheet('@latex { \\frac{a}{b}').blocks)).toMatch(/% Line 1: \\frac\{a\}\{b\}\n% Error: /)
  })

  it('say when one is missing its closing brace, or is empty', () => {
    expect(sheet('@latex { \\frac{a}{b}').blocks[0]).toMatchObject({ error: expect.stringMatching(/on one line ends with its }/) })
    expect(sheet('@latex {\n    \\frac{a}{b}').blocks[0]).toMatchObject({ error: 'The @latex block on line 1 is missing its closing }.' })
    expect(collectDiagnostics(sheet('@latex {\n}').blocks).get(1)?.message).toMatch(/is empty/)
  })

  it('replace the old $ line, which is no longer raw LaTeX', () => {
    expect(sheet('$ \\frac{a}{b}').blocks[0].kind).toBe(BLOCK_KIND.calc)
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
    expect(s.blocks[0]).toMatchObject({ kind: BLOCK_KIND.layout, style: undefined, display: 'hidden' })
    expect(last(src).error).toBeUndefined()
    expect(toLatexDocument(s.blocks.slice(0, 1))).not.toContain('2.00')
  })

  it('.sym, .val and .full show every line inside that way, unless a block inside says otherwise', () => {
    const lns = lines('@layout.val {\n    F = 2.00 kg * 9.81 m/s^2\n    @layout.full {\n        p = 2.00 kg * 3.00 m/s\n    }\n}')
    expect(lns[0].tex).not.toContain('\\cdot')
    expect(lns[0].tex.split('=')).toHaveLength(2)
    expect(lns[1].tex.split('=').length).toBeGreaterThan(2)
  })

  it('combine with each other and with a layout', () => {
    expect(layoutOf('@layout.val.multiline {\n    x = 1\n}')).toMatchObject({ style: undefined, display: 'val', multiline: true })
    expect(layoutOf('@layout.list(1).sym.sci Steps {\n    x = 1\n}')).toMatchObject({ style: 'list', marker: '1', display: 'sym', notation: 'sci', title: 'Steps' })
    expect(layoutOf('@layout.hidden.val {\n    x = 1\n}')).toMatchObject({ display: 'hidden' })
  })

  it('number a list as its brackets say, its sub-lists 1, a, i in turn; or say what’s wrong with them', () => {
    expect(layoutOf('@layout.list {\n    > one\n}')).toMatchObject({ style: 'list', marker: undefined })
    expect(layoutOf('@layout.list(I) {\n    > one\n}')).toMatchObject({ style: 'list', marker: 'I' })
    expect(layoutOf('@layout.column.list(A) {\n    > one\n}')).toMatchObject({ marker: 'A', columns: { breaks: [] } })
    const nested = layoutOf('@layout.list(A) {\n    > one\n        > two\n            > three\n}')!
    const sub = nested.children[1] as LayoutBlock
    expect(sub).toMatchObject({ nested: true, marker: 'i' })
    expect((sub.children[1] as LayoutBlock).marker).toBe('1')
    expect(layoutOf('@layout.list(b) {\n    > one\n}')!.error).toContain('.list(…) takes how its items are numbered')
    expect(layoutOf('@layout.center(1) {\n    > one\n}')!.error).toContain('.center takes nothing in brackets')
  })

  it('reach the { } blocks inside them, which keep their own variables', () => {
    const src = 'x = 1\n@layout.val {\n    Inner {\n        x = 2 * 3\n    }\n}\ny = x'
    expect(readable(lineAt(src, 4).tex)).toBe('x = 6')
    expect(value(src)).toBe('1')
  })

  it('say a # after a calculation isn’t read, and that a note goes after //', () => {
    expect(last('x = 1  # one').error).toMatch(/^# only starts a heading.*write a note after \/\//)
    expect(last('x = "a#b"').error).toBeUndefined()
  })

  it('warn when two can’t both apply, and use the first layout and the last of the rest', () => {
    expect(layoutOf('@layout.sym.val {\n    x = 1\n}')).toMatchObject({
      display: 'val', warning: '@layout.sym.val has more than one of .full, .sym, .val; the last, .val, is used.',
    })
    expect(layoutOf('@layout.list.center {\n    x = 1\n}')).toMatchObject({
      style: 'list', warning: '@layout.list.center has more than one layout; it\'s laid out as .list.',
    })
    expect(layoutOf('@layout.sci.dec {\n    x = 1\n}').warning).toMatch(/has both \.sci and \.dec; the last, \.dec, is used/)
    expect(layoutOf('@layout.text.sym {\n    Some prose.\n}')).toMatchObject({
      style: 'text', warning: 'Nothing in @layout.text is worked out, so .sym does nothing there.',
    })
    expect(layoutOf('@layout.text.hidden {\n    Some prose.\n}')).toMatchObject({ display: 'hidden', warning: undefined })
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
    '    A second paragraph, and $E = mc^2$ is maths.', // 6
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
      { kind: BLOCK_KIND.text, line: 6, text: 'A second paragraph, and $E = mc^2$ is maths. Results:' },
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
      + 'A second paragraph, and $E = mc^2$ is maths.')
  })
})

describe('text blocks, as Markdown', () => {
  const src = [
    'k = 24.5 N/m', // 1
    '@layout.text {', // 2
    '    # Method', // 3
    '    1. Hang each mass,', // 4
    '       and measure it.', // 5
    '    2. Fit a line:', // 6
    '        - its slope is {{k}}', // 7
    '    - a bullet after a number', // 8
    '', // 9
    '    $$F = k x$$', // 10
    '    $$', // 11
    '    \\frac{a}{b}', // 12
    '    $$', // 13
    '    > Quoted,', // 14
    '    > over two lines.', // 15
    '    ---', // 16
    '    ### Small heading', // 17
    '}', // 18
  ].join('\n')
  const block = sheet(src).blocks[1] as LayoutBlock

  it('reads headings, lists, displayed maths, quotes and rules', () => {
    expect(outline(block.children)).toEqual([
      'text 3',
      'layout list ""', '  text 4', '  text 6', '  layout list "" nested', '    text 7',
      'layout list ""', '  text 8',
      'latex 10', 'latex 11', 'text 14', 'rule 16', 'text 17',
    ])
    const [heading, numbered, bullets, inline, displayed, quote, , small] = block.children
    expect(heading).toMatchObject({ kind: BLOCK_KIND.text, heading: 1, text: 'Method' })
    expect(small).toMatchObject({ heading: 3, text: 'Small heading' })
    expect(inline).toMatchObject({ kind: BLOCK_KIND.latex, latex: 'F = k x' })
    expect(displayed).toMatchObject({ kind: BLOCK_KIND.latex, latex: '\\frac{a}{b}', endLine: 13 })
    expect(quote).toMatchObject({ kind: BLOCK_KIND.text, quote: true, text: 'Quoted, over two lines.' })
    // A numbered list, an item carried on over two lines, a bulleted list inside the second item; then a bulleted list of its own.
    const list = numbered as LayoutBlock
    expect(list).toMatchObject({ marker: '1' })
    expect(list.children.map((c) => (c.kind === BLOCK_KIND.text ? c.text : `list nested=${(c as LayoutBlock).nested}`)))
      .toEqual(['Hang each mass, and measure it.', 'Fit a line:', 'list nested=true'])
    expect(((list.children[2] as LayoutBlock).children[0] as { text: string }).text).toMatch(/^its slope is \$24\.5.*\$$/)
    expect([(bullets as LayoutBlock).marker, (bullets as LayoutBlock).nested]).toEqual([undefined, undefined])
  })

  it('starts a numbered list at its first number, and says what’s wrong with displayed maths', () => {
    expect(sheet('@layout.text {\n    3. third\n    4. fourth\n}').blocks[0]).toMatchObject({ children: [{ firstNumber: 3 }] })
    expect((sheet('@layout.text {\n    $$\\frac{a}{b\n}').blocks[0] as LayoutBlock).children[0])
      .toMatchObject({ kind: BLOCK_KIND.latex, error: expect.stringMatching(/missing its closing \$\$/) })
    expect((sheet('@layout.text {\n    $$\\frac{a}{b$$\n}').blocks[0] as LayoutBlock).children[0])
      .toMatchObject({ error: expect.stringMatching(/without its/) })
  })

  it('exports to LaTeX', () => {
    const tex = toLatexDocument(sheet(`${src}\n> See [the manual](https://example.com/a_b#3).`).blocks)
    expect(tex).toContain('\\par\\medskip\\noindent{\\large\\bfseries Method\\par}\\nobreak\\smallskip')
    expect(tex).toMatch(/\\begin\{enumerate\}\n\\item Hang each mass, and measure it\.\n\\item Fit a line:\n\\begin\{itemize\}/)
    expect(tex).toContain('\\begin{quote}\nQuoted, over two lines.\n\\end{quote}')
    expect(tex).toContain('\\rule{\\linewidth}{0.4pt}')
    expect(tex).toContain('See \\href{https://example.com/a_b\\#3}{the manual}.')
    expect(tex).toContain('{hyperref}')
    // Without a link, no hyperref.
    expect(toLatexDocument(sheet(src).blocks)).not.toContain('hyperref')
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

  it('make emphasis, as Markdown writes it', () => {
    const { text, math, sub } = TITLE_SEGMENT
    expect(titleSegments('a **bold** and *italic* word')).toEqual([
      { kind: text, value: 'a ' }, { kind: text, value: 'bold', bold: true }, { kind: text, value: ' and ' },
      { kind: text, value: 'italic', italic: true }, { kind: text, value: ' word' },
    ])
    expect(titleSegments('***both***')).toEqual([{ kind: text, value: 'both', bold: true, italic: true }])
    // Bold around italic, and maths and subscripts inside.
    expect(titleSegments('**v_0 is *about* $3 m$**')).toEqual([
      { kind: text, value: 'v', bold: true }, { kind: sub, value: '0', bold: true }, { kind: text, value: ' is ', bold: true },
      { kind: text, value: 'about', bold: true, italic: true }, { kind: text, value: ' ', bold: true }, { kind: math, value: '3 m', bold: true },
    ])
  })

  it('leave marks that don’t open or close emphasis as typed', () => {
    const { text } = TITLE_SEGMENT
    // Spaced, unclosed, escaped, or too many.
    expect(titleSegments('2 * 3 = 6')).toEqual([{ kind: text, value: '2 * 3 = 6' }])
    expect(titleSegments('a *b')).toEqual([{ kind: text, value: 'a *b' }])
    expect(titleSegments('\\*not\\*')).toEqual([{ kind: text, value: '*not*' }])
    expect(titleSegments('****')).toEqual([{ kind: text, value: '****' }])
    // A bold closed past an italic left open: the italic's mark is just text.
    expect(titleSegments('**a *b**')).toEqual([{ kind: text, value: 'a *b', bold: true }])
  })

  it('make links, to web and mail addresses only', () => {
    const { text } = TITLE_SEGMENT
    expect(titleSegments('see [the **data**](https://example.com/run_1) now')).toEqual([
      { kind: text, value: 'see ' }, { kind: text, value: 'the ', href: 'https://example.com/run_1' },
      { kind: text, value: 'data', bold: true, href: 'https://example.com/run_1' }, { kind: text, value: ' now' },
    ])
    expect(titleSegments('[run](javascript:alert(1))')).toEqual([{ kind: text, value: '[run](javascript:alert(1))' }])
  })

  it('export emphasis bold and italic', () => {
    const tex = toLatexDocument(sheet('> A **bold** claim, *probably*, and **$x$**.').blocks)
    expect(tex).toContain('A \\textbf{bold} claim, \\textit{probably}, and $\\boldsymbol{x}$.')
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
    '@layout.list(1) S {', // 2
    '    g(t) = 2*t', // 3
    '}', // 4
    'W {', // 5
    '    h(a, b to m) = a', // 6
    '    q = 2', // 7
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
    const withSettings = 'ang(y, x):3:deg = atan(y/x)\npolar(x, y):3 = @tuple(x, y)'
    expect([...collectDefinitions(sheet(withSettings).blocks)]).toEqual([['ang', [1]], ['polar', [2]]])
    expect(collectSymbols(sheet(withSettings), withSettings).find((s) => s.name === 'polar')?.params).toBe('x, y')
  })

  it('collects function parameters as names in the function definition', () => {
    const source = 'h(a, b to m) = a + b'
    const symbols = collectSymbols(sheet(source), source)
    expect(symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'a', kind: SYMBOL_KIND.parameter, line: 1 }),
      expect.objectContaining({ name: 'b', kind: SYMBOL_KIND.parameter, line: 1 }),
    ]))
  })

  it('collects symbols with their scope', () => {
    const symbols = collectSymbols(sheet(src), src)
    const find = (name: string) => symbols.filter((s) => s.name === name)
    expect(find('local')).toEqual([expect.objectContaining({ kind: SYMBOL_KIND.variable, line: 8, from: 9, to: 9 })])
    expect(find('h')[0]).toMatchObject({ kind: SYMBOL_KIND.function, params: 'a, b to m', to: 9 })
    expect(find('y')[0]).toMatchObject({ kind: SYMBOL_KIND.variable, from: 12, tex: expect.stringContaining('2.0') })
  })

  it('keeps each reassignment’s own value for hover and its first line for navigation', () => {
    const source = 'x = 2.0 kg\nq = x\nx = 3.0 kg\nr = x'
    const symbols = collectSymbols(sheet(source), source)
    const assigned = symbols.filter((s) => s.name === 'x')
    expect(assigned).toHaveLength(2)
    expect(assigned[0]).toMatchObject({ line: 1, from: 2 })
    expect(assigned[0].tex).toContain('2.0')
    expect(assigned[1]).toMatchObject({ line: 3, from: 4 })
    expect(assigned[1].tex).toContain('3.0')
  })

  it('collects the names a tuple is unpacked into', () => {
    const unpackSrc = 'r = @tuple(1.0, 2.0)\n@tuple(a, b:2) = r'
    const names = collectSymbols(sheet(unpackSrc), unpackSrc).map((s) => `${s.name}@${s.from}`)
    expect(names).toEqual(['r@2', 'a@3', 'b@3'])
  })

  it('shows each variable’s value as its line left it, not its working, and not its scope’s last', () => {
    const source = 'm = 2.00 kg\nF = m * 9.81 m/s^2\nr = @tuple(1.0, 2.0)\n@tuple(a, b) = r\nr = @tuple(5.0, 6.0)\n@tuple(a, b) = r'
    const symbols = collectSymbols(sheet(source), source)
    // (F's value, not the working that gives it: F = m·g = … .)
    expect(symbols.find((s) => s.name === 'F')?.tex).toMatch(/^F = 19.6/)
    expect(symbols.find((s) => s.name === 'F')?.tex).not.toContain('kg')
    // (Each unpacking's a as that line left it: 1.0, then 5.0.)
    expect(symbols.filter((s) => s.name === 'a').map((s) => s.tex)).toEqual([expect.stringContaining('1.0'), expect.stringContaining('5.0')])
  })

  it('marks errors by line', () => {
    const d = collectDiagnostics(sheet(src).blocks)
    expect(d.get(12)).toMatchObject({ kind: DIAGNOSTIC_KIND.error })
    expect(d.size).toBe(1)
  })
})
