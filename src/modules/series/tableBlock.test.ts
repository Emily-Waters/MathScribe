/** A table in LaTeX: a table as one is written by hand (tabularx, a caption, bold header and row numbers). */
import { describe, expect, it } from 'vitest'
import { sheet } from '../../test/helpers.ts'
import { DEFAULT_LATEX_OPTIONS, toLatexDocument } from '../../lib/output/latex.ts'
import { docxParts } from '../../lib/output/docx.ts'
import { parseXml } from '../../lib/output/omml.ts'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RenderedBlock } from '../../components/blocks/index.tsx'
import { formatTableSettings, parseTableSettings } from './tableSettings.ts'

const DATA = 't1 = 0.10 s\nt2 = 0.20 s\nx1 = 0.012 m\nx2 = 0.047 m\n'

/** A sheet's LaTeX document. */
const latex = (source: string) => toLatexDocument(sheet(source).blocks)
/** The table in a sheet's LaTeX document: from its \begin to its \end. */
const tableOf = (source: string, around = 'table') => {
  const doc = latex(source)
  const begin = doc.indexOf(`\\begin{${around}}`)
  return doc.slice(begin, doc.indexOf(`\\end{${around}}`, begin) + `\\end{${around}}`.length)
}

describe('a table in LaTeX', () => {
  it('is a table float, full width, its caption its title, its header and row numbers bold, a rule after every row in a grid', () => {
    expect(tableOf(`${DATA}@table(t, x; lines grid, title "Runs, timed")`)).toBe([
      '\\begin{table}[H]',
      '\t\\caption{Runs, timed}',
      '\t\\centering',
      '\t\\begin{tabularx}{\\linewidth}{|l|*{2}{>{\\centering\\arraybackslash}X|}}',
      '\t\t\\hline',
      '\t\t & $\\boldsymbol{t\\,\\left[\\mathrm{s}\\right]}$ & $\\boldsymbol{x\\,\\left[\\mathrm{m}\\right]}$ \\\\',
      '\t\t\\hline',
      '\t\t\\textbf{\\boldmath 1} & $0.10$ & $0.012$ \\\\',
      '\t\t\\hline',
      '\t\t\\textbf{\\boldmath 2} & $0.20$ & $0.047$ \\\\',
      '\t\t\\hline',
      '\t\\end{tabularx}',
      '\\end{table}',
    ].join('\n'))
  })

  it('is a grid unless its settings say otherwise: under the header and after the row numbers, or none', () => {
    expect(tableOf(`${DATA}@table(t, x)`)).toBe(tableOf(`${DATA}@table(t, x; lines grid)`))
    const header = tableOf(`${DATA}@table(t, x; lines header)`)
    expect(header).toContain('{l|*{2}{>{\\centering\\arraybackslash}X}}')
    expect(header.match(/\\hline/g)).toHaveLength(1)
    expect(header).not.toContain('\\caption')
    const none = tableOf(`${DATA}@table(t, x; lines none)`)
    expect(none).toContain('{l*{2}{>{\\centering\\arraybackslash}X}}')
    expect(none).not.toContain('\\hline')
    expect(tableOf(`${DATA}@table(t, x; numbers off)`)).toContain('{|*{2}{>{\\centering\\arraybackslash}X|}}')
    expect(tableOf(`${DATA}@table(t, x; numbers off, lines header)`)).toContain('{*{2}{>{\\centering\\arraybackslash}X}}')
  })

  it('shows a long table’s gap, and its note under it', () => {
    const many = Array.from({ length: 70 }, (_, i) => `d${i + 1} = ${i + 1}.0 m`).join('\n')
    expect(tableOf(`${many}\n@table(d)`)).toContain('\t\t$\\vdots$ & $\\vdots$ \\\\\n\t\t\\hline\n\t\t\\textbf{\\boldmath 66}')
    expect(tableOf(`${DATA}@table(t)  # the times`)).toContain('\t\\par\\smallskip\\textit{the times}\n\\end{table}')
  })

  it('is centred where it is in a list, where a float can’t go, its caption by \\captionof', () => {
    const inList = tableOf(`${DATA}@layout.list Steps {\n    @table(t; title "Times")\n}`, 'center')
    expect(inList).toContain('\t\\captionof{table}{Times}')
    expect(inList).not.toContain('\\begin{table}')
  })

  it('asks for tabularx, float and caption in the preamble, only when there is a table', () => {
    expect(latex(`${DATA}@table(t)`)).toMatch(/\\usepackage\{tabularx\}\n\\usepackage\{float\}\n\\usepackage\{caption\}/)
    expect(latex('x = 1')).not.toContain('tabularx')
  })
})

describe('a table in Word', () => {
  /** A sheet's Word document, as its XML. */
  const word = (source: string) => docxParts(sheet(source).blocks, DEFAULT_LATEX_OPTIONS, new Date(2026, 0, 1))['word/document.xml']
  /** Its tables. */
  const tablesOf = (xml: string) => xml.match(/<w:tbl>.*?<\/w:tbl>/gs) ?? []
  /** Its first table ('' if it has none). */
  const firstTable = (xml: string) => tablesOf(xml)[0] ?? ''

  it('is a table, full width, ruled around every cell, its header bold and repeated on each page', () => {
    const xml = word(`${DATA}@table(t, x)`)
    const table = firstTable(xml)
    expect(table).toContain('<w:tblBorders><w:top w:val="single"')
    expect(table).toContain('<w:insideV w:val="single"')
    expect(table.match(/<w:tr>/g)).toHaveLength(3)
    expect(table).toContain('<w:trPr><w:tblHeader/></w:trPr>')
    // (The n column's header and numbers bold text, to the left; the values maths, centred.)
    expect(table).toMatch(/<w:jc w:val="left"\/><\/w:pPr><w:r><w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">2<\/w:t>/)
    expect(table).toContain('<m:oMathPara><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr><m:oMath>')
    // (The header's maths bold: its variable bold italic.)
    expect(table).toContain('<m:sty m:val="bi"/></m:rPr><m:t xml:space="preserve">t</m:t>')
    expect(parseXml(xml).tag).toBeTruthy()
  })

  it('has its title as a numbered caption over it, each table its own number', () => {
    const xml = word(`${DATA}@table(t; title "Times")\n@table(x; title "Distances, measured")`)
    expect(xml).toMatch(/<w:pStyle w:val="Caption"\/>.*?Table .*?SEQ Table .*?>1<.*?: .*?Times/s)
    expect(xml).toMatch(/SEQ Table .*?>2<.*?Distances, measured/s)
    expect(xml.indexOf('Times')).toBeLessThan(xml.indexOf('<w:tbl>'))
  })

  it('draws its lines as its settings say: under the header and after n, or none', () => {
    const header = firstTable(word(`${DATA}@table(t; lines header)`))
    expect(header).not.toContain('<w:tblBorders>')
    expect(header).toContain('<w:tcBorders><w:bottom w:val="single"')
    expect(header).toContain('<w:tcBorders><w:right w:val="single"')
    const none = firstTable(word(`${DATA}@table(t; lines none)`))
    expect(none).not.toContain('Borders>')
  })

  it('has its note under it, and nothing when it’s hidden or wrong', () => {
    const xml = word(`${DATA}@table(t)  # the times`)
    expect(xml.indexOf('the times')).toBeGreaterThan(xml.indexOf('</w:tbl>'))
    expect(tablesOf(word(`${DATA}@table(t)  #hide`))).toHaveLength(0)
    expect(tablesOf(word(`${DATA}@table(t; colour red)`))).toHaveLength(0)
  })
})

describe('a table in the Rendered tab', () => {
  /** A sheet's last block, as the Rendered tab draws it. */
  const rendered = (source: string) => renderToStaticMarkup(createElement(RenderedBlock, { block: sheet(source).blocks.at(-1)! }))

  it('is a table: its title over it, its n column and header bold, a grid unless its settings say otherwise', () => {
    const html = rendered(`${DATA}@table(t, x; title "Runs")  # timed`)
    expect(html).toContain('<p class="ms-table__caption"><span>Runs</span></p>')
    expect(html).toContain('<table class="ms-table__table ms-table--grid">')
    expect(html).toContain('<th class="ms-table__n"></th>')
    expect(html).toContain('<td class="ms-table__n"><span>2</span></td>')
    // (The header's maths bold, its values maths: KaTeX's.)
    expect(html).toMatch(/<th><span><span class="katex">.*?boldsymbol/)
    expect(html.match(/<tr>/g)).toHaveLength(3)
    expect(html).toContain('<p class="ms-table__note"><span>timed</span></p>')
    expect(rendered(`${DATA}@table(t; lines header)`)).toContain('ms-table--header')
  })

  it('shows a long table’s gap in every column, and nothing when it’s hidden', () => {
    const many = Array.from({ length: 70 }, (_, i) => `d${i + 1} = ${i + 1}.0 m`).join('\n')
    const html = rendered(`${many}\n@table(d)`)
    expect(html.match(/<tr>/g)).toHaveLength(1 + 1 + 55)
    expect(html.match(/vdots/g)).toHaveLength(2)
    expect(rendered(`${DATA}@table(t)  #hide`)).toBe('')
    // (In Word too, as maths, not its LaTeX as text.)
    expect(docxParts(sheet(`${many}\n@table(d)`).blocks, DEFAULT_LATEX_OPTIONS)['word/document.xml']).not.toContain('>\\vdots<')
  })
})

describe('a table’s uncertainties', () => {
  const MEASURED = 'x1 = 0.012 m pm 0.001 m\nx2 = 0.047 m pm 0.001 m\n'

  it('are shown with each value, ±, unless its settings say not: then each value alone, to the digits they give it', () => {
    expect(tableOf(`${MEASURED}@table(x)`)).toContain('$0.012 \\pm 0.001$')
    const hidden = tableOf(`${MEASURED}@table(x; uncertainty off)`)
    expect(hidden).toContain('\t\t\\textbf{\\boldmath 1} & $0.012$ \\\\')
    expect(hidden).not.toContain('\\pm')
  })
})

describe('a table’s row labels', () => {
  const SALTS = `${DATA}salts = @series("KCl", "KBr")\n`

  it('go down the side in place of the row numbers, bold text, in LaTeX, Word and the Rendered tab', () => {
    const source = `${SALTS}@table(t, x; labels salts)`
    expect(tableOf(source)).toContain('\t\t\\textbf{\\boldmath KCl} & $0.10$ & $0.012$ \\\\')
    const xml = docxParts(sheet(source).blocks, DEFAULT_LATEX_OPTIONS, new Date(2026, 0, 1))['word/document.xml']
    expect(xml).toMatch(/<w:jc w:val="left"\/><\/w:pPr><w:r><w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">KBr<\/w:t>/)
    const html = renderToStaticMarkup(createElement(RenderedBlock, { block: sheet(source).blocks.at(-1)! }))
    expect(html).toContain('<td class="ms-table__n"><span>KCl</span></td>')
    // (Labels go down the side with the row numbers off too.)
    expect(tableOf(`${SALTS}@table(t; labels salts, numbers off)`)).toContain('\\textbf{\\boldmath KBr} & $0.20$')
  })

  it('are text as a sheet’s is: a formula, maths, and a comma in a label', () => {
    const source = `${DATA}salts = @series("{KCl}", "Potassium bromide, $x_1$")\n@table(t; labels salts)`
    expect(tableOf(source)).toContain('\t\t\\textbf{\\boldmath $\\ce{KCl}$} & $0.10$ \\\\')
    expect(tableOf(source)).toContain('\t\t\\textbf{\\boldmath Potassium bromide, $x_1$} & $0.20$ \\\\')
  })

  it('can be any series: a value is its maths; a row it doesn’t have, blank', () => {
    expect(tableOf(`${DATA}@table(t; labels x)`)).toContain('\t\t\\textbf{\\boldmath $0.012\\,\\mathrm{m}$} & $0.10$ \\\\')
    expect(tableOf(`${DATA}t3 = 0.30 s\nsalts = @series("KCl", "KBr")\n@table(t; labels salts)`)).toContain('\t\t & $0.30$ \\\\')
  })

  it('must be a series', () => {
    expect(sheet(`${DATA}@table(t; labels nope)`).blocks.at(-1)).toMatchObject({ error: expect.stringMatching(/^nope isn't a series, so it can't label the rows/) })
  })

  it('are a setting, read and written', () => {
    const { settings } = parseTableSettings('labels salts, title "Salts"')
    expect(settings).toMatchObject({ labels: 'salts', title: 'Salts' })
    expect(formatTableSettings(settings)).toBe('labels salts, title "Salts"')
  })
})

describe('a table’s title', () => {
  it('is read and written as a setting, a comma in it kept', () => {
    const { settings } = parseTableSettings('lines header, title "Runs, timed"')
    expect(settings).toMatchObject({ lines: 'header', title: 'Runs, timed' })
    expect(formatTableSettings(settings)).toBe('lines header, title "Runs, timed"')
  })
})
