/** A typed table, `@table { … }`: its rows' cells as text, its values filled in, and it written to LaTeX. */
import { describe, expect, it } from 'vitest'
import { sheet } from '../../test/helpers.ts'
import { DEFAULT_LATEX_OPTIONS, toLatexDocument } from '../../lib/output/latex.ts'
import { docxParts } from '../../lib/output/docx.ts'
import { BLOCK_KIND, type CustomBlock } from '../../lib/sheet/blocks.ts'
import type { TableData } from './tableData.ts'

/** The first table block in a sheet. */
const tableIn = (source: string) => sheet(source).blocks.find((b): b is CustomBlock => b.kind === BLOCK_KIND.custom)!

describe('a typed table', () => {
  it('has its first row as its header, each cell text, an empty cell empty, short rows filled out', () => {
    const block = tableIn('@table {\n    Trial | Colour | Note\n    1 | pale blue |\n    2 |  | $|x|$\n    3\n}')
    expect(block.error).toBeUndefined()
    const data = block.data as TableData
    expect(data.text).toBe(true)
    expect(data.header).toEqual(['Trial', 'Colour', 'Note'])
    expect(data.rows).toEqual([['1', 'pale blue', ''], ['2', '', '$|x|$'], ['3', '', '']])
  })

  it('fills in each {{value}} as it is at that point in the sheet', () => {
    const data = tableIn('m = 12.3 g\n@table {\n    Mass\n    {{m}}\n}').data as TableData
    expect(data.rows[0][0]).toMatch(/^\$12\.3.*g.*\$$/)
  })

  it('warns of a value it can’t work out, and is still shown', () => {
    const block = tableIn('@table {\n    Mass\n    {{nope}}\n}')
    expect(block.error).toBeUndefined()
    expect(block.warning).toContain('{{nope}}')
  })

  it('reads its settings from its brackets, a title in quotes holding brackets too', () => {
    const data = tableIn('@table(title "Mass (g)", lines header) {\n    a | b\n}').data as TableData
    expect(data.title).toBe('Mass (g)')
    expect(data.lines).toBe('header')
  })

  it('says what’s wrong with a setting that isn’t one, and with no rows', () => {
    expect(tableIn('@table(numbers off) {\n    a\n}').error).toContain('"numbers off" isn\'t a typed table setting')
    expect(tableIn('@table {\n}').error).toContain('needs at least its header')
  })

  it('is written to LaTeX as text: its header bold, its cells as they are', () => {
    const doc = toLatexDocument(sheet('@table(lines none) {\n    Trial | Mass $m$\n    1 | 12.3 g\n}').blocks)
    expect(doc).toContain('\\textbf{\\boldmath Trial} & \\textbf{\\boldmath Mass $m$} \\\\')
    expect(doc).toContain('1 & 12.3 g \\\\')
  })

  it('has a header over two rows when an empty cell in its first row joins the filled one before it', () => {
    const data = tableIn('@table {\n    Salt | Mass (g) | |\n    | 1 | 2 | 3\n    KCl | 2.51 | 2.49 | 2.50\n}').data as TableData
    expect(data.groups).toEqual([{ text: 'Salt', span: 1 }, { text: 'Mass (g)', span: 3 }])
    expect(data.header).toEqual(['', '1', '2', '3'])
    expect(data.rows).toEqual([['KCl', '2.51', '2.49', '2.50']])
    // (A leading empty cell is a blank corner, not a span; with no span, one header row.)
    expect((tableIn('@table {\n    | a\n    1 | 2\n}').data as TableData).groups).toBeUndefined()
  })

  it('writes a header over two rows: its spans over columns, a rule under each, one header down both rows', () => {
    const source = '@table(lines header) {\n    Salt | Mass (g) | |\n    | 1 | 2 | 3\n    KCl | 2.51 | 2.49 | 2.50\n}'
    const doc = toLatexDocument(sheet(source).blocks)
    expect(doc).toContain(' & \\multicolumn{3}{c}{\\textbf{\\boldmath Mass (g)}} \\\\\n\t\t\\cline{2-4}\n'
      + '\t\t\\textbf{\\boldmath Salt} & \\textbf{\\boldmath 1} & \\textbf{\\boldmath 2} & \\textbf{\\boldmath 3} \\\\\n\t\t\\hline')
    const grid = toLatexDocument(sheet(source.replace('lines header', 'lines grid')).blocks)
    expect(grid).toContain('\\multicolumn{3}{c|}{')
    const word = docxParts(sheet(source).blocks, DEFAULT_LATEX_OPTIONS, new Date(2026, 0, 1))['word/document.xml']
    expect(word).toContain('<w:gridSpan w:val="3"/>')
    expect(word).toContain('<w:vMerge w:val="restart"/>')
    expect(word).toContain('<w:vMerge w:val="continue"/>')
    expect(word.match(/<w:tblHeader\/>/g)).toHaveLength(2)
  })

  it('shades its empty cells in LaTeX (with colortbl in the preamble) and in Word', () => {
    const blocks = sheet('@table {\n    Trial | Mass\n    1 |\n}').blocks
    const doc = toLatexDocument(blocks)
    expect(doc).toContain('1 & \\cellcolor{gray!15} \\\\')
    expect(doc).toContain('\\usepackage{colortbl}')
    expect(toLatexDocument(sheet('@table {\n    a | b\n    1 | 2\n}').blocks)).not.toContain('colortbl')
    const word = docxParts(blocks, DEFAULT_LATEX_OPTIONS, new Date(2026, 0, 1))['word/document.xml']
    expect(word.match(/<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"\/>/g)).toHaveLength(1)
  })
})
