/** Comments (`// …`), and values in text (`{{c_Na}}`). */
import { describe, expect, it } from 'vitest'
import { lines, sheet } from '../test/helpers.ts'
import { collectDiagnostics } from './document.ts'
import { BLOCK_KIND, isContainer, type Block } from './blocks.ts'
import { toLatexDocument, DEFAULT_LATEX_OPTIONS } from './latex.ts'
import { docxParts } from './docx.ts'

/** The sheet's blocks of a kind, at any depth. */
function blocksOf<K extends Block['kind']>(source: string, kind: K): Extract<Block, { kind: K }>[] {
  const out: Block[] = []
  const visit = (b: Block) => {
    if (b.kind === kind) out.push(b)
    if (isContainer(b)) b.children.forEach(visit)
  }
  sheet(source).blocks.forEach(visit)
  return out as Extract<Block, { kind: K }>[]
}

describe('comments', () => {
  it('are left out entirely, wherever they are', () => {
    const source = [
      '// The data, from the lab book',
      'm = 2.0 kg',
      '    // indented, between calculations',
      'F = m * 9.81 m/s^2',
      'def KE(m, v)',
      '    // inside a function',
      '    return 1/2 * m * v^2',
      'K = KE(m, 3.0 m/s)',
    ].join('\n')
    expect(lines(source).map((l) => l.source)).toEqual(['m = 2.0 kg', 'F = m * 9.81 m/s^2', 'K = KE(m, 3.0 m/s)'])
    expect([...collectDiagnostics(sheet(source).blocks)]).toEqual([])
  })

  it('don’t end a #text block or split its paragraph, even indented less', () => {
    const texts = blocksOf('Discussion:  #text\n    The first line\n// 1: connect the purpose to the results\n    and the second.', BLOCK_KIND.text)
    expect(texts.map((t) => t.text)).toEqual(['The first line and the second.'])
  })

  it('don’t break up blank lines (two blank lines still leave a gap)', () => {
    expect(blocksOf('a = 1\n\n// a note to self\n\nb = 2', BLOCK_KIND.spacer)).toHaveLength(1)
  })
})

describe('values in text', () => {
  const data = 'V1 = 27.55 mL\nV2 = 27.10 mL\nc_Na = 0.4662 mol/L\n'

  it('show a value as it is at that point, with its unit and sig figs', () => {
    const [text] = blocksOf(`${data}> The concentration was {{c_Na}}, from {{V_avg}}.`, BLOCK_KIND.text)
    expect(text.text).toBe('The concentration was $0.4662\\,\\mathrm{mol}/\\mathrm{L}$, from $\\left(27.3 \\pm 0.2\\right)\\,\\mathrm{mL}$.')
  })

  it('take settings on the name, and conversions', () => {
    const [text] = blocksOf(`${data}> {{V1:3}} or {{V1 to L}}`, BLOCK_KIND.text)
    expect(text.text).toBe('$27.6\\,\\mathrm{mL}$ or $0.02755\\,\\mathrm{L}$')
  })

  it('work in headings, #text paragraphs and block titles', () => {
    expect(blocksOf(`${data}## Moles in {{V1}}`, BLOCK_KIND.heading)[0].text).toBe('Moles in $27.55\\,\\mathrm{mL}$')
    expect(blocksOf(`${data}Discussion:  #text\n    It took {{V2}}.`, BLOCK_KIND.text)[0].text).toBe('It took $27.10\\,\\mathrm{mL}$.')
    expect(blocksOf(`${data}Flask 1, {{V1}} {\n    x = 1\n}`, BLOCK_KIND.group)[0].title).toBe('Flask 1, $27.55\\,\\mathrm{mL}$')
  })

  it('are worked out where they are: a later value isn’t seen yet', () => {
    const source = '> early: {{x}}\nx = 3.0 m\n> late: {{x}}'
    const texts = blocksOf(source, BLOCK_KIND.text)
    expect(texts[0].error).toBe('{{x}}: Undefined symbol x')
    expect(texts[0].text).toBe('early: {{x}}')
    expect(texts[1].text).toBe('late: $3.0\\,\\mathrm{m}$')
    expect(collectDiagnostics(sheet(source).blocks).get(1)?.message).toBe('{{x}}: Undefined symbol x')
  })

  it('leave $…$ maths alone, and don’t become variables', () => {
    expect(blocksOf(`${data}> $a = {{b}}$ and {{V1}}`, BLOCK_KIND.text)[0].text).toBe('$a = {{b}}$ and $27.55\\,\\mathrm{mL}$')
    expect(sheet(`${data}> {{V1}}`).variables.map((v) => v.name)).not.toContain('inline__value')
  })

  it('go into the LaTeX and Word exports as inline maths', () => {
    const blocks = sheet(`${data}> It was {{c_Na}}.`).blocks
    expect(toLatexDocument(blocks, DEFAULT_LATEX_OPTIONS)).toContain('It was $0.4662\\,\\mathrm{mol}/\\mathrm{L}$.')
    expect(docxParts(blocks, DEFAULT_LATEX_OPTIONS)['word/document.xml']).toContain('<m:oMath>')
  })
})
