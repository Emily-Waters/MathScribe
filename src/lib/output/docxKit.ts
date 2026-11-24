/**
 * The Word export's toolkit: the document's look, paragraphs and runs,
 * equations with their notes, cards and pictures, as WordprocessingML. These
 * are the pieces each kind of block writes itself with (see constructs/); none
 * of them knows about blocks, so a construct can use them without the export
 * (docx.ts) being involved.
 */
import { TITLE_SEGMENT, titleSegments } from './textSegments.ts'
import { ALIGN, type Align } from './alignment.ts'
import { CAPTION_KIND, type CaptionKind } from '../sheet/blocks.ts'

// (How a paragraph lines up, for a module's constructs: ALIGN.center.)
export { ALIGN, type Align }
import type { LatexOptions } from './latex.ts'
import { texToMath, texToOmml, xmlEscape } from './omml.ts'
import type { ListMarker } from '../syntax.ts'

// ---------------------------------------------------------------------------
// The document's look
//
// Word measures lengths in twentieths of a point ("twips"; 1 cm = 567), font
// sizes in half-points, and borders in eighths of a point. Colours are hex RGB.
// ---------------------------------------------------------------------------

export const TWIPS_PER_CM = 567

/** An em, in twips, at a font size in half-points (half-points × 10 = twips). */
export const TWIPS_PER_EM_PER_HALF_POINT = 10

export const PAPER: Record<LatexOptions['paper'], { w: number; h: number }> = {
  a4paper: { w: 11906, h: 16838 },
  letterpaper: { w: 12240, h: 15840 },
}

/** The body text's size in half-points, from the Document option ("11pt" → 22). */
export const fontSizeOf = (o: LatexOptions) => parseInt(o.fontSize, 10) * 2

export const FONTS = { text: 'Calibri', math: 'Cambria Math' }

/** The document's language (spelling, and how the date is written). */
export const LANGUAGE = 'en-GB'

export const COLORS = {
  /** Notes beside equations. */
  note: '6B6B6B',
  /** A card's bar on the left, its title bar, and the line under the title. */
  cardBar: 'BFBFBF',
  cardShade: 'F2F2F2',
  cardRule: 'D9D9D9',
}

export const CARD = {
  /** The bar on the left, in eighths of a point (2 pt). */
  bar: 16,
  /** The line under the title, in eighths of a point. */
  rule: 4,
  /** Space between the bar and the text. */
  padding: 170,
}

/** Indent for the working inside a function call, and for an untitled block's body. */
export const INDENT = 425

/** The working inside a function call is set this much smaller (in half-points). */
export const WORKING_SIZE_STEP = 2

/** Space above and below paragraphs, in twips. */
export const SPACING = {
  equation: 30,
  title: { before: 120, after: 40 },
  cardTitle: 60,
  author: 40,
  /** Below the date, before the document starts. */
  date: 240,
  heading: { after: 80, before: [360, 280, 200] },
  /** Between paragraphs, and the line height (240 = single spacing). */
  paragraph: { after: 100, line: 264 },
  pageHeader: 709,
  /** Above a title page's title, to set it a way down the page (two inches). */
  titlePage: 2880,
  /** Around a caption: a little room above, less between it and its table. */
  caption: { before: 120, after: 60 },
}

/** Word's style for a document's title. */
export const TITLE_STYLE = 'Title'

/** Word's style for a caption (a table's): Word lists these in a table of tables. */
export const CAPTION_STYLE = 'Caption'

/** A paragraph that starts a new page. */
export const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'

/** Heading sizes, in half-points above the body text's (sections, subsections, the rest), and the title's. */
export const HEADING_SIZE_STEP = [10, 4, 0]
export const TITLE_SIZE_STEP = 18

/**
 * A title page's title, in half-points above the body text's: 6 pt larger (17 pt
 * over 11 pt text), and bold, as a lab report's title usually is; LaTeX's \LARGE.
 */
export const TITLE_PAGE_SIZE_STEP = 12

/** A list level's indent, in twips: the marker's hanging width, and the gap before it. */
export const LIST_INDENT = { hanging: 360, gap: 60 }

/** Wrapped display equations continue indented this far (an inch). */
export const MATH_WRAP_INDENT = 1440

/** The column notes go in, as a share of the text width: limits, and its share when centering. */
export const NOTE_COLUMN = { min: 0.2, max: 0.4, centered: 0.3, ceiling: 0.45 }

/** A note's estimated width per character, in ems (italic text is about half an em), plus some room. */
export const NOTE_CHAR_EMS = 0.5
export const NOTE_PADDING = 200

// ---------------------------------------------------------------------------
// Paragraphs
// ---------------------------------------------------------------------------

/** A paragraph's properties (Word's pPr). */
export interface ParaProps {
  style?: string
  keepNext?: boolean
  /** A list: which numbering, and how deep. */
  num?: { id: number; level: number }
  tabs?: { kind: Align; pos: number }[]
  before?: number
  after?: number
  indent?: number
  jc?: Align
}

/** A paragraph (whose properties can still change, e.g. to make it a list item) or finished XML (a table). */
export type Item = { props: ParaProps; content: string } | { xml: string }

/** A paragraph as XML, its properties in the order Word expects. */
export function paraXml({ props: p, content }: { props: ParaProps; content: string }): string {
  const pPr = [
    p.style && `<w:pStyle w:val="${p.style}"/>`,
    p.keepNext && '<w:keepNext/>',
    p.num && `<w:numPr><w:ilvl w:val="${p.num.level}"/><w:numId w:val="${p.num.id}"/></w:numPr>`,
    p.tabs?.length && `<w:tabs>${p.tabs.map((t) => `<w:tab w:val="${t.kind}" w:pos="${t.pos}"/>`).join('')}</w:tabs>`,
    (p.before !== undefined || p.after !== undefined)
      && `<w:spacing${p.before !== undefined ? ` w:before="${p.before}"` : ''}${p.after !== undefined ? ` w:after="${p.after}"` : ''}/>`,
    p.indent && `<w:ind w:left="${p.indent}"/>`,
    p.jc && `<w:jc w:val="${p.jc}"/>`,
  ].filter(Boolean).join('')
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${content}</w:p>`
}

/** A paragraph or table, as XML. */
export const itemXml = (it: Item) => ('xml' in it ? it.xml : paraXml(it))

/** How a run of text looks. */
export interface RunFormat {
  bold?: boolean
  italic?: boolean
  color?: string
  size?: number
  sub?: boolean
}

/** A run of text, as XML. */
export function run(text: string, f: RunFormat = {}): string {
  const rPr = [
    f.bold && '<w:b/>',
    f.italic && '<w:i/>',
    f.color && `<w:color w:val="${f.color}"/>`,
    f.size && `<w:sz w:val="${f.size}"/><w:szCs w:val="${f.size}"/>`,
    f.sub && '<w:vertAlign w:val="subscript"/>',
  ].filter(Boolean).join('')
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`
}

/** A tab, as a run. */
export const tab = '<w:r><w:tab/></w:r>'

/** A heading, block title, note or line of text: `2p_z` → 2p with a subscript z, `$…$` as maths (bold, in bold text). */
export const titleRuns = (text: string, f: RunFormat = {}) =>
  titleSegments(text).map((s) => (s.kind === TITLE_SEGMENT.math
    ? texToOmml(s.value, f.size, f.bold)
    : run(s.value, { ...f, sub: s.kind === TITLE_SEGMENT.sub }))).join('')

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------

/** Where a block is being written: the room there, and the document so far. */
export interface Ctx {
  o: LatexOptions
  /** Width available for text here, for the note's tab stop. */
  width: number
  /** Left indent of paragraphs here. */
  indent: number
  center: boolean
  /** Font size of the working inside function calls. */
  small: number
  /** Width of the column notes go in: enough for the longest, within limits. */
  noteWidth: number
  /** Inside a bulleted or numbered list. */
  inList?: boolean
  /** List numbering instances made so far, each with its list's marker (none: bulleted): each list restarts its count. */
  nums: { marker?: ListMarker; start?: number }[]
  /** Figures' pictures (plots'), drawn beforehand (figures.ts, in the browser). */
  images: FigureImages
  /** The pictures placed so far: each is a file in word/media. */
  media: Uint8Array[]
  /** How many captions of each kind there are so far (Table: tables), to number the next. */
  captions: Map<string, number>
}

// (What a caption names its kind with, `Table 1: …`: the blocks' own, sheet/blocks.ts.)
export { CAPTION_KIND, type CaptionKind }

/**
 * A caption, `Table 2: Runs`, as Word writes one: in its Caption style, its
 * number a SEQ field (so Word numbers it, and lists it in a table of tables),
 * counted here so it shows the right number before Word updates its fields.
 */
export function caption(ctx: Ctx, kind: CaptionKind, title: string): Item {
  const n = (ctx.captions.get(kind) ?? 0) + 1
  ctx.captions.set(kind, n)
  const number = `<w:fldSimple w:instr=" SEQ ${kind} \\* ARABIC ">${run(String(n))}</w:fldSimple>`
  return { props: { style: CAPTION_STYLE, keepNext: true, jc: ALIGN.center }, content: `${run(`${kind} `)}${number}${run(': ')}${titleRuns(title)}` }
}

/**
 * Maths alone in its paragraph (a table's cell), lined up as `jc`: Word lines up
 * maths alone in a paragraph by its own setting, not the paragraph's. `bold`: all
 * of it bold (a header).
 */
export const alignedMath = (tex: string, jc: Align, bold = false) =>
  `<m:oMathPara><m:oMathParaPr><m:jc m:val="${jc}"/></m:oMathParaPr>${texToOmml(tex, undefined, bold)}</m:oMathPara>`

/** A figure's picture: a PNG file, and the drawing's size (its proportions). */
export interface FigureImage {
  readonly png: Uint8Array
  readonly width: number
  readonly height: number
}

/** Figures' pictures (a plot's), by the figure's data (CalcBlock.figure). */
export type FigureImages = Map<unknown, FigureImage>

/** A figure's picture: as wide as FIGURE_WIDTH of the text, at the drawing's proportions. */
export const FIGURE_WIDTH = 0.85
/** EMUs (Word's drawing unit) per twip. */
export const EMU_PER_TWIP = 635

/** A picture (the `n`th in word/media), as a paragraph: an inline drawing. */
export function picture(ctx: Ctx, image: FigureImage): Item {
  ctx.media.push(image.png)
  const n = ctx.media.length
  const cx = Math.round(ctx.width * FIGURE_WIDTH * EMU_PER_TWIP)
  const cy = Math.round((cx * image.height) / image.width)
  const name = `Figure ${n}`
  const pic = '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + `<pic:nvPicPr><pic:cNvPr id="${n}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${imageRel(n)}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + '</pic:pic>'
  const drawing = '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
    + `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="${name}"/>`
    + '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    + `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">${pic}</a:graphicData></a:graphic>`
    + '</wp:inline></w:drawing></w:r>'
  return { props: { jc: ALIGN.center, keepNext: true }, content: drawing }
}

/** The relationship id of the `n`th picture (after the document's three parts). */
export const imageRel = (n: number) => `rId${3 + n}`

export const NOTE: RunFormat = { italic: true, color: COLORS.note }

/** How much smaller a line's note is than its line, in half-points: one point. */
export const NOTE_SIZE_STEP = 2

/**
 * One equation on its own line, with its note at the right margin.
 *
 * Word shows an equation full size (as displayed maths) only when it's alone
 * in its paragraph; sharing a line with text shrinks its fractions. So a noted
 * equation is a borderless row of two cells, the equation and its note. (In a
 * list, where a row can't carry the bullet, the two share a line, held apart
 * by a tab stop.)
 */
export function equation(ctx: Ctx, tex: string, note?: string, small = false): Item {
  const size = small ? ctx.small : undefined
  const indent = ctx.indent + (small ? INDENT : 0)
  const spacing = { before: SPACING.equation, after: SPACING.equation }
  const jc = ctx.center || ctx.o.align === ALIGN.center ? ALIGN.center : ALIGN.left
  const { xml: math, ems } = texToMath(tex, size)
  const display = `<m:oMathPara><m:oMathParaPr><m:jc m:val="${jc}"/></m:oMathParaPr>${math}</m:oMathPara>`
  if (!note) return { props: { ...spacing, indent: indent || undefined }, content: display }

  // (A note is a comment on its line: italic, grey, and a point smaller than what it's beside.)
  const noteRuns = titleRuns(note,{ ...NOTE, size: (size ?? fontSizeOf(ctx.o)) - NOTE_SIZE_STEP })
  if (ctx.inList) {
    return { props: { ...spacing, tabs: [{ kind: ALIGN.right, pos: ctx.width - indent }] }, content: `${math}${tab}${noteRuns}` }
  }
  const width = ctx.width - indent
  // Centered: an empty column on the left as wide as the note's, so the
  // equation is centered on the page like the ones without notes.
  const centered = jc === ALIGN.center
  const noteWidth = Math.min(ctx.noteWidth, Math.round(width * (centered ? NOTE_COLUMN.centered : NOTE_COLUMN.ceiling)))
  const mathWidth = width - noteWidth * (centered ? 2 : 1)
  // Too wide to sit beside its note (an em is the font size in half-points × 10 twips):
  // the equation gets the whole width, wrapping at its = signs, and the note goes under it.
  if (ems * (size ?? fontSizeOf(ctx.o)) * TWIPS_PER_EM_PER_HALF_POINT > mathWidth) {
    return {
      xml: paraXml({ props: { before: SPACING.equation, after: 0, indent: indent || undefined, keepNext: true }, content: display })
        + paraXml({ props: { before: 0, after: SPACING.equation, jc: ALIGN.right }, content: noteRuns }),
    }
  }
  const cell = (w: number, content: string) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${content}</w:tc>`
  return {
    xml: `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/>${indent ? `<w:tblInd w:w="${indent}" w:type="dxa"/>` : ''}`
      + '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>'
      + '<w:tblLook w:val="0000"/></w:tblPr>'
      + `<w:tblGrid>${centered ? `<w:gridCol w:w="${noteWidth}"/>` : ''}<w:gridCol w:w="${mathWidth}"/><w:gridCol w:w="${noteWidth}"/></w:tblGrid><w:tr>`
      + (centered ? cell(noteWidth, '<w:p/>') : '')
      + cell(mathWidth, paraXml({ props: spacing, content: display }))
      + cell(noteWidth, paraXml({ props: { ...spacing, jc: ALIGN.right }, content: noteRuns }))
      + '</w:tr></w:tbl>',
  }
}

/** A block with a title: a card (with cards on), else a bold title over an indented body. */
export function titled(ctx: Ctx, title: string, body: (inner: Ctx) => Item[]): Item[] {
  if (!ctx.o.cards) {
    const inner = { ...ctx, indent: ctx.indent + INDENT }
    return [
      ...(title ? [{ props: { keepNext: true, ...SPACING.title, indent: ctx.indent || undefined }, content: title }] : []),
      ...body(inner),
    ]
  }
  const width = ctx.width - ctx.indent
  const cellWidth = width - CARD.padding
  const inner: Ctx = { ...ctx, width: cellWidth, indent: 0 }
  const items = body(inner)
  // A cell has to end with a paragraph.
  if (!items.length || 'xml' in items[items.length - 1]) items.push({ props: { after: 0 }, content: '' })
  const cell = (content: string, header: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${cellWidth}" w:type="dxa"/>`
    + (header ? `<w:tcBorders><w:bottom w:val="single" w:sz="${CARD.rule}" w:space="0" w:color="${COLORS.cardRule}"/></w:tcBorders><w:shd w:val="clear" w:color="auto" w:fill="${COLORS.cardShade}"/>` : '')
    + `</w:tcPr>${content}</w:tc>`
  const header = title
    ? `<w:tr>${cell(paraXml({ props: { keepNext: true, before: SPACING.cardTitle, after: SPACING.cardTitle }, content: title }), true)}</w:tr>`
    : ''
  const table = `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/>${ctx.indent ? `<w:tblInd w:w="${ctx.indent}" w:type="dxa"/>` : ''}`
    + `<w:tblBorders><w:left w:val="single" w:sz="${CARD.bar}" w:space="0" w:color="${COLORS.cardBar}"/></w:tblBorders>`
    + `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="${CARD.padding}" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>`
    + '<w:tblLook w:val="0000"/></w:tblPr>'
    + `<w:tblGrid><w:gridCol w:w="${width}"/></w:tblGrid>`
    + `${header}<w:tr>${cell(items.map(itemXml).join(''), false)}</w:tr></w:tbl>`
  // Space after the card (two tables in a row would otherwise merge).
  return [{ xml: table }, { props: { after: 0 }, content: '' }]
}

/** Title and note of a block, as bold runs. */
export const heading = (title: string, note?: string) =>
  [title && titleRuns(title, { bold: true }), note && titleRuns(` — ${note}`, { bold: true })].filter(Boolean).join('')


/** A paragraph's place here: its indent, and centred if the block it's in is. */
export const baseProps = (ctx: Ctx): ParaProps => ({ indent: ctx.indent || undefined, jc: ctx.center ? ALIGN.center : undefined })
