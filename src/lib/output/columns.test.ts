/**
 * `@layout.column`: lines side by side in columns, split at blank lines and at
 * the blocks inside, and how each export sets them.
 */
import { describe, expect, it } from 'vitest'
import { BLOCK_KIND, type Block, type LayoutBlock } from '../sheet/blocks.ts'
import { columnGrid, columnParts } from './constructs/columns.ts'
import { DEFAULT_LATEX_OPTIONS, toLatexDocument } from './latex.ts'
import { docxParts } from './docx.ts'
import { LAYOUT_SYNTAX } from '../syntax.ts'
import { sheet } from '../../test/helpers.ts'

/** The sheet's first block, a column block. */
const columnsOf = (source: string) => sheet(source).blocks[0] as LayoutBlock

/** Each column's lines, by line number, row by row. */
const linesOf = (b: LayoutBlock) => columnGrid(b).rows.map((row) => row.map((cell) => cell.map((c: Block) => c.line)))

describe('the opener', () => {
  it('takes how many columns a row has, or none', () => {
    expect(LAYOUT_SYNTAX.read('@layout.column {')).toMatchObject({ columns: { breaks: [] }, title: '' })
    expect(LAYOUT_SYNTAX.read('@layout.column {')!.columns!.count).toBeUndefined()
    expect(LAYOUT_SYNTAX.read('@layout.column(3).list Steps {')).toMatchObject({ columns: { count: 3 }, style: 'list', title: 'Steps', members: ['column(3)', 'list'] })
  })

  it('keeps the count from 2 to 4, saying so', () => {
    expect(LAYOUT_SYNTAX.read('@layout.column(6) {')).toMatchObject({ columns: { count: 4 }, warning: expect.stringContaining('6 is set as 4') })
    expect(LAYOUT_SYNTAX.read('@layout.column(2.6) {')!.columns!.count).toBe(3)
    expect(LAYOUT_SYNTAX.read('@layout.column(1) {')!.columns!.count).toBe(2)
  })

  it('says what’s wrong with a count that isn’t a number, or brackets on another member', () => {
    expect(LAYOUT_SYNTAX.read('@layout.column(two) {')!.error).toContain('isn\'t a number')
    expect(LAYOUT_SYNTAX.read('@layout.center(2) {')!.error).toContain('.center takes nothing in brackets')
  })
})

describe('columns', () => {
  it('start at each blank line', () => {
    const b = columnsOf('@layout.column {\n  a = 1\n  b = 2\n\n  c = 3\n\n\n  d = 4\n}')
    expect(b.kind).toBe(BLOCK_KIND.layout)
    expect(linesOf(b)).toEqual([[[2, 3], [5], [8]]])
    // (No gap is left in a column: a blank line is a break there, however many.)
    expect(b.children.some((c) => c.kind === BLOCK_KIND.spacer)).toBe(false)
  })

  it('are each block inside, whatever blank lines are in it', () => {
    const b = columnsOf('@layout.column {\n  Given {\n    a = 1\n\n    b = 2\n  }\n  Found {\n    c = a + b\n  }\n}')
    expect(linesOf(b)).toEqual([[[2], [7]]])
  })

  it('without breaks, share the lines out evenly: column(n) of them, or 2', () => {
    expect(linesOf(columnsOf('@layout.column {\n  a = 1\n  b = 2\n  c = 3\n}'))).toEqual([[[2, 3], [4]]])
    expect(linesOf(columnsOf('@layout.column(3) {\n  a = 1\n  b = 2\n  c = 3\n}'))).toEqual([[[2], [3], [4]]])
  })

  it('wrap to another row after a row’s worth', () => {
    const src = '@layout.column(2) {\n  a = 1\n\n  b = 2\n\n  c = 3\n}'
    expect(columnGrid(columnsOf(src))).toMatchObject({ perRow: 2 })
    expect(linesOf(columnsOf(src))).toEqual([[[2], [4]], [[6]]])
    // Unsaid, a row has as many as there are, up to 4.
    const five = `@layout.column {\n${['a', 'b', 'c', 'd', 'e'].map((x) => `  ${x} = 1`).join('\n\n')}\n}`
    expect(columnGrid(columnsOf(five)).rows.map((r) => r.length)).toEqual([4, 1])
  })

  it('leave out a column with nothing shown, and keep a hidden line with the one before it', () => {
    expect(linesOf(columnsOf('@layout.column {\n  a = 1\n\n  h = 2  #hide\n\n  c = 3\n}'))).toEqual([[[2], [6]]])
  })

  it('of prose start at two blank lines (one starts a paragraph)', () => {
    const b = columnsOf('@layout.column.text {\n  One\n\n  Two\n\n\n  Three\n}')
    expect(linesOf(b)).toEqual([[[2, 4], [7]]])
  })

  it('lay each column out as the block says, a numbered list’s count carrying on', () => {
    const src = '@layout.column.list(1) Steps {\n  a = 1\n  b = 2\n\n  c = 3\n}'
    expect(columnParts(columnsOf(src)).rows[0].map((p) => p.firstNumber)).toEqual([1, 3])
    const tex = toLatexDocument(sheet(src).blocks, DEFAULT_LATEX_OPTIONS)
    expect(tex.match(/\\begin\{enumerate\}/g)).toHaveLength(2)
    expect(tex).toContain('\\begin{enumerate}\n\\setcounter{enumi}{2}\n\\item')
    expect(docxParts(sheet(src).blocks, DEFAULT_LATEX_OPTIONS)['word/numbering.xml']).toContain('<w:lvlOverride w:ilvl="0"><w:startOverride w:val="3"/>')
  })
})

describe('exports', () => {
  const src = '@layout.column Results {\n  a = 1\n\n  b = 2\n\n  c = 3\n}'

  it('are minipages in LaTeX, side by side, as wide as a row’s share', () => {
    const tex = toLatexDocument(sheet(src).blocks, DEFAULT_LATEX_OPTIONS)
    // (The title on a line of its own, above them: a \paragraph would run into the first.)
    expect(tex).toContain('\\paragraph{Results}\\mbox{}\\par\\nobreak\\vspace{-\\baselineskip}\n\\noindent\n\\begin{minipage}')
    expect(tex.match(/\\begin\{minipage\}\[t\]\{\\dimexpr\(\\linewidth-2\\columnsep\)\/3\\relax\}\\vspace\{0pt\}/g)).toHaveLength(3)
    expect(tex).toContain('\\end{minipage}%\n\\hspace{\\columnsep}%\n\\begin{minipage}')
  })

  it('fit their equations to a column: one that fits the page might not fit there', () => {
    const line = 'F = 2.00 kg * 9.81 m/s^2 * sin(30 deg)'
    const page = toLatexDocument(sheet(line).blocks, DEFAULT_LATEX_OPTIONS)
    const column = toLatexDocument(sheet(`@layout.column {\n  ${line}\n\n  x = 1\n}`).blocks, DEFAULT_LATEX_OPTIONS)
    expect(page.slice(page.indexOf('\\begin{document}'))).not.toContain('\\msfit{')
    expect(column).toContain('\\msfit{F = ')
  })

  it('are a borderless table in Word, a cell a column', () => {
    const xml = docxParts(sheet(src).blocks, DEFAULT_LATEX_OPTIONS)['word/document.xml']
    const table = xml.slice(xml.indexOf('<w:tbl>'), xml.indexOf('</w:tbl>'))
    expect(table.match(/<w:gridCol /g)).toHaveLength(3)
    expect(table.match(/<w:tc>/g)).toHaveLength(3)
    expect(table).not.toContain('tblBorders')
  })
})
