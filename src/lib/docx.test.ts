import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { sheet } from '../test/helpers.ts'
import { docxParts, toDocx } from './docx.ts'
import { DEFAULT_LATEX_OPTIONS, type LatexOptions } from './latex.ts'
import { parseXml, texToOmml } from './omml.ts'
import { SAMPLE } from './sample.ts'
import { REFERENCE } from './reference.ts'

describe('plots', () => {
  const source = 't1 = 0.10 s\nt2 = 0.20 s\nt3 = 0.30 s\nx1 = 0.05 m\nx2 = 0.10 m\nx3 = 0.16 m\nplot(t, x; fit linear)'

  it('are pictures, drawn beforehand, with their fit equations under them', () => {
    const blocks = sheet(source).blocks
    const plot = blocks.flatMap((b) => (b.kind === 'calc' && b.plot ? [b.plot] : []))[0]
    const png = new Uint8Array([137, 80, 78, 71])
    const files = unzipSync(toDocx(blocks, DEFAULT_LATEX_OPTIONS, new Map([[plot, png]])))
    expect(files['word/media/plot1.png']).toEqual(png)
    expect(strFromU8(files['word/_rels/document.xml.rels'])).toContain('Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/plot1.png"')
    const document = strFromU8(files['word/document.xml'])
    expect(document).toContain('<a:blip r:embed="rId4"/>')
    expect(document).toContain('R')
    expect(parseXml(document)).toBeTruthy()
  })

  it('are left out without a picture, keeping the equation', () => {
    const document = docxParts(sheet(source).blocks, DEFAULT_LATEX_OPTIONS)['word/document.xml']
    expect(document).not.toContain('<w:drawing>')
    expect(document).toContain('<m:oMath>')
  })
})

describe('LaTeX to Word equations (OMML)', () => {
  it('builds fractions, powers and subscripts', () => {
    const x = texToOmml('a = \\frac{F_{\\mathrm{par}}}{m^{2}}')
    expect(x).toMatch(/^<m:oMath>.*<\/m:oMath>$/)
    expect(x).toContain('<m:f><m:num><m:sSub><m:e><m:r><m:t xml:space="preserve">F</m:t></m:r></m:e>')
    expect(x).toContain('<m:sub><m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t xml:space="preserve">par</m:t></m:r></m:sub>')
    expect(x).toContain('<m:sSup>')
  })

  it('keeps units upright and in one run, and numbers upright', () => {
    const x = texToOmml('2.00\\,\\mathrm{kg}')
    expect(x).toContain('<m:sty m:val="p"/></m:rPr><m:t xml:space="preserve">2.00</m:t>')
    expect(x).toContain('<m:t xml:space="preserve">kg</m:t>')
  })

  it('makes \\left( \\right) a growing bracket pair', () => {
    expect(texToOmml('\\left(4.91 \\pm 0.07\\right)')).toContain('<m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr><m:e>')
  })

  it('turns sums, bars, accents and roots into their Word forms', () => {
    const x = texToOmml('\\bar{t} = \\frac{1}{n}\\sum_{i=1}^{n} t_{i} + \\hat{x} + \\sqrt{2} + \\sqrt[3]{x}')
    expect(x).toContain('<m:bar>')
    expect(x).toMatch(/<m:nary><m:naryPr><m:chr m:val="∑"\/>.*<m:e><m:sSub>/)
    expect(x).toContain('<m:acc><m:accPr><m:chr m:val="\u0302"/>')
    expect(x).toContain('<m:degHide m:val="1"/>')
    expect(x).toContain('<m:deg><m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t xml:space="preserve">3</m:t>')
  })

  it('lines up #multiline rows in a matrix justified right, then left', () => {
    const x = texToOmml('\\begin{aligned}F &= m\\cdot a \\\\ &\\approx 19.6\\end{aligned}')
    expect(x).toContain('<m:mcJc m:val="right"/>')
    expect(x).toContain('<m:mcJc m:val="left"/>')
    expect(x.match(/<m:mr>/g)).toHaveLength(2)
  })

  it('keeps LaTeX it can’t read as text', () => {
    expect(texToOmml('\\frac{')).toContain('<m:nor/>')
  })

  it('sets a font size on every run when asked', () => {
    expect(texToOmml('x + 1', 20)).toContain('<w:sz w:val="20"/>')
  })
})

const exportOf = (src: string, o: Partial<LatexOptions> = {}) =>
  docxParts(sheet(src).blocks, { ...DEFAULT_LATEX_OPTIONS, ...o }, new Date(2026, 10, 8))

describe('the Word export', () => {
  it('writes well-formed XML for every part, for every example sheet', () => {
    for (const src of [SAMPLE, ...REFERENCE.flatMap((s) => s.examples.map((e) => e.source))]) {
      for (const [path, xml] of Object.entries(exportOf(src))) {
        expect(() => parseXml(xml), `${path} for:\n${src}`).not.toThrow()
      }
    }
  })

  it('is a zip Word can open: content types, relationships and the document', () => {
    const files = unzipSync(toDocx(sheet('F = 2.00 kg * 9.81 m/s^2').blocks, DEFAULT_LATEX_OPTIONS))
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/_rels/document.xml.rels',
      'word/document.xml', 'word/numbering.xml', 'word/settings.xml', 'word/styles.xml',
    ])
    expect(strFromU8(files['word/document.xml'])).toContain('<m:oMath>')
  })

  it('puts a note at the right margin, beside a full-size equation', () => {
    const doc = exportOf('m = 2.00 kg   # mass of the block\nF = m * 9.81 m/s^2')['word/document.xml']
    // A borderless row: the equation displayed in one cell, the note right-aligned in the other.
    expect(doc).toMatch(/<w:tbl>.*<m:oMathPara>.*<\/m:oMathPara><\/w:p><\/w:tc><w:tc>.*<w:jc w:val="right"\/>.*mass of the block.*<\/w:tbl>/)
    // Without a note, just the displayed equation.
    expect(doc.match(/<w:tbl>/g)).toHaveLength(1)
    expect(doc.match(/<m:oMathPara>/g)).toHaveLength(2)
  })

  it('in a list, keeps the note on the item’s line with a tab', () => {
    const doc = exportOf('Steps:   #numbered\n    F = 2.0 N   # weight')['word/document.xml']
    expect(doc).not.toContain('<w:tbl>')
    expect(doc).toMatch(/<w:numId w:val="1"\/>.*<w:tab w:val="right"/)
  })

  it('numbers sections and leaves out hidden lines and errors', () => {
    const doc = exportOf('# Setup\nm = 2.00 kg   #hide\nbad = 1 +\nF = 3.0 N')['word/document.xml']
    expect(doc).toContain('<w:pStyle w:val="Heading1"/>')
    expect(doc).toContain('1\u2003')
    expect(doc.match(/<m:oMath>/g)).toHaveLength(1)
    expect(exportOf('# Setup', { numberSections: false })['word/document.xml']).not.toContain('1\u2003')
  })

  it('makes blocks cards with a shaded title bar, or indented sections without cards', () => {
    const src = 'Steeper ramp {\n  a = 9.81 m/s^2 * sin(45.0 deg)\n}'
    const card = exportOf(src)['word/document.xml']
    expect(card).toContain('<w:tbl>')
    expect(card).toContain('w:fill="F2F2F2"')
    expect(card).toContain('Steeper ramp')
    const plain = exportOf(src, { cards: false })['word/document.xml']
    expect(plain).not.toContain('<w:tbl>')
    expect(plain).toContain('<w:ind w:left="425"/>')
  })

  it('makes lists Word lists, each numbered list starting at 1', () => {
    const parts = exportOf('A:   #numbered\n    > one\n    > two\nB:   #list\n    > three\n        > four')
    expect(parts['word/document.xml'].match(/<w:numId w:val="1"\/>/g)).toHaveLength(2)
    expect(parts['word/document.xml']).toContain('<w:ilvl w:val="1"/><w:numId w:val="3"/>')
    expect(parts['word/numbering.xml']).toContain('<w:num w:numId="3"><w:abstractNumId w:val="0"/>')
    expect(parts['word/numbering.xml']).toContain('<w:startOverride w:val="1"/>')
  })

  it('follows the page, font and title options', () => {
    const parts = exportOf('x = 1', { paper: 'letterpaper', margins: 'narrow', fontSize: '12pt', title: 'Lab 3', author: 'Emily' })
    expect(parts['word/document.xml']).toContain('<w:pgSz w:w="12240" w:h="15840"/>')
    expect(parts['word/document.xml']).toContain('w:left="851"')
    expect(parts['word/document.xml']).toContain('<w:pStyle w:val="Title"/></w:pPr><w:r><w:t xml:space="preserve">Lab 3</w:t>')
    expect(parts['word/document.xml']).toContain('8 November 2026')
    expect(parts['word/styles.xml']).toContain('<w:sz w:val="24"/>')
    expect(parts['docProps/core.xml']).toContain('<dc:creator>Emily</dc:creator>')
  })

  it('centers equations when asked', () => {
    const parts = exportOf('x = 1', { align: 'center' })
    expect(parts['word/document.xml']).toContain('<m:jc m:val="center"/>')
    expect(parts['word/settings.xml']).toContain('<m:defJc m:val="centerGroup"/>')
  })
})
