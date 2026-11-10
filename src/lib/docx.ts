/**
 * The Word export: the whole sheet as a `.docx`, laid out like the Rendered
 * tab, with real (editable) Word equations. It uses the same Document options
 * as the LaTeX export: page size, margins, font size, title, numbered
 * sections, equation alignment, and blocks as cards.
 *
 * A .docx is a zip of XML files; this writes the few it needs by hand.
 * Opened in Google Docs (upload, then Open with Google Docs), the equations
 * become Google Docs equations.
 */
import { strToU8, zipSync } from 'fflate'
import { listItems, isOmitted, splitInlineMath, titleSegments, type Block } from './document.ts'
import { MARGIN_CM, type LatexOptions } from './latex.ts'
import { PLOT_SIZE, type PlotData } from './plot.ts'
import { EM_SPACE, texToMath, texToOmml, xmlEscape } from './omml.ts'

// ---------------------------------------------------------------------------
// The document's look
//
// Word measures lengths in twentieths of a point ("twips"; 1 cm = 567), font
// sizes in half-points, and borders in eighths of a point. Colours are hex RGB.
// ---------------------------------------------------------------------------

const TWIPS_PER_CM = 567

/** An em, in twips, at a font size in half-points (half-points × 10 = twips). */
const TWIPS_PER_EM_PER_HALF_POINT = 10

const PAPER: Record<LatexOptions['paper'], { w: number; h: number }> = {
  a4paper: { w: 11906, h: 16838 },
  letterpaper: { w: 12240, h: 15840 },
}

/** The body text's size in half-points, from the Document option ("11pt" → 22). */
const fontSizeOf = (o: LatexOptions) => parseInt(o.fontSize, 10) * 2

const FONTS = { text: 'Calibri', math: 'Cambria Math' }

/** The document's language (spelling, and how the date is written). */
const LANGUAGE = 'en-GB'

const COLORS = {
  /** Notes beside equations. */
  note: '6B6B6B',
  /** A card's bar on the left, its title bar, and the line under the title. */
  cardBar: 'BFBFBF',
  cardShade: 'F2F2F2',
  cardRule: 'D9D9D9',
}

const CARD = {
  /** The bar on the left, in eighths of a point (2 pt). */
  bar: 16,
  /** The line under the title, in eighths of a point. */
  rule: 4,
  /** Space between the bar and the text. */
  padding: 170,
}

/** Indent for the working inside a function call, and for an untitled block's body. */
const INDENT = 425

/** The working inside a function call is set this much smaller (in half-points). */
const WORKING_SIZE_STEP = 2

/** Space above and below paragraphs, in twips. */
const SPACING = {
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
}

/** Heading sizes, in half-points above the body text's (sections, subsections, the rest), and the title's. */
const HEADING_SIZE_STEP = [10, 4, 0]
const TITLE_SIZE_STEP = 18

/** A list level's indent, in twips: the marker's hanging width, and the gap before it. */
const LIST_INDENT = { hanging: 360, gap: 60 }

/** Wrapped display equations continue indented this far (an inch). */
const MATH_WRAP_INDENT = 1440

/** The column notes go in, as a share of the text width: limits, and its share when centering. */
const NOTE_COLUMN = { min: 0.2, max: 0.4, centered: 0.3, ceiling: 0.45 }

/** A note's estimated width per character, in ems (italic text is about half an em), plus some room. */
const NOTE_CHAR_EMS = 0.5
const NOTE_PADDING = 200

// ---------------------------------------------------------------------------
// Paragraphs
// ---------------------------------------------------------------------------

/** A paragraph's properties (Word's pPr). */
interface ParaProps {
  style?: string
  keepNext?: boolean
  /** A list: which numbering, and how deep. */
  num?: { id: number; level: number }
  tabs?: { kind: 'left' | 'center' | 'right'; pos: number }[]
  before?: number
  after?: number
  indent?: number
  jc?: 'left' | 'center' | 'right'
}

/** A paragraph (whose properties can still change, e.g. to make it a list item) or finished XML (a table). */
type Item = { props: ParaProps; content: string } | { xml: string }

/** A paragraph as XML, its properties in the order Word expects. */
function paraXml({ props: p, content }: { props: ParaProps; content: string }): string {
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
const itemXml = (it: Item) => ('xml' in it ? it.xml : paraXml(it))

/** How a run of text looks. */
interface RunFormat {
  bold?: boolean
  italic?: boolean
  color?: string
  size?: number
  sub?: boolean
}

/** A run of text, as XML. */
function run(text: string, f: RunFormat = {}): string {
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
const tab = '<w:r><w:tab/></w:r>'

/** Text with `$…$` inline maths. */
const richText = (text: string, f: RunFormat = {}) =>
  splitInlineMath(text).map((s) => (s.math ? texToOmml(s.value, f.size) : run(s.value, f))).join('')

/** A heading or block title: `2p_z` → 2p with a subscript z, `$…$` as maths. */
const titleRuns = (text: string, f: RunFormat = {}) =>
  titleSegments(text).map((s) => (s.kind === 'math'
    ? texToOmml(s.value, f.size)
    : run(s.value, { ...f, sub: s.kind === 'sub' }))).join('')

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------

/** Where a block is being written: the room there, and the document so far. */
interface Ctx {
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
  /** List numbering instances made so far: each list restarts its count. */
  nums: { abstract: 0 | 1 }[]
  /** Plots' pictures, drawn beforehand (by plotPng, in the browser). */
  images: PlotImages
  /** The pictures placed so far: each is a file in word/media. */
  media: Uint8Array[]
}

/** Plots' pictures as PNG files, by the plot they show. */
export type PlotImages = Map<PlotData, Uint8Array>

/** A plot's picture: as wide as PLOT_WIDTH of the text, at the drawing's proportions. */
const PLOT_WIDTH = 0.85
/** EMUs (Word's drawing unit) per twip. */
const EMU_PER_TWIP = 635

/** A picture (the `n`th in word/media), as a paragraph: an inline drawing. */
function picture(ctx: Ctx, png: Uint8Array): Item {
  ctx.media.push(png)
  const n = ctx.media.length
  const cx = Math.round(ctx.width * PLOT_WIDTH * EMU_PER_TWIP)
  const cy = Math.round((cx * PLOT_SIZE.height) / PLOT_SIZE.width)
  const name = `Plot ${n}`
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
  return { props: { jc: 'center', keepNext: true }, content: drawing }
}

/** The relationship id of the `n`th picture (after the document's three parts). */
const imageRel = (n: number) => `rId${3 + n}`

const NOTE: RunFormat = { italic: true, color: COLORS.note }

/**
 * One equation on its own line, with its note at the right margin.
 *
 * Word shows an equation full size (as displayed maths) only when it's alone
 * in its paragraph; sharing a line with text shrinks its fractions. So a noted
 * equation is a borderless row of two cells, the equation and its note. (In a
 * list, where a row can't carry the bullet, the two share a line, held apart
 * by a tab stop.)
 */
function equation(ctx: Ctx, tex: string, note?: string, small = false): Item {
  const size = small ? ctx.small : undefined
  const indent = ctx.indent + (small ? INDENT : 0)
  const spacing = { before: SPACING.equation, after: SPACING.equation }
  const jc = ctx.center || ctx.o.align === 'center' ? 'center' : 'left'
  const { xml: math, ems } = texToMath(tex, size)
  const display = `<m:oMathPara><m:oMathParaPr><m:jc m:val="${jc}"/></m:oMathParaPr>${math}</m:oMathPara>`
  if (!note) return { props: { ...spacing, indent: indent || undefined }, content: display }

  const noteRuns = run(note, { ...NOTE, size })
  if (ctx.inList) {
    return { props: { ...spacing, tabs: [{ kind: 'right', pos: ctx.width - indent }] }, content: `${math}${tab}${noteRuns}` }
  }
  const width = ctx.width - indent
  // Centered: an empty column on the left as wide as the note's, so the
  // equation is centered on the page like the ones without notes.
  const centered = jc === 'center'
  const noteWidth = Math.min(ctx.noteWidth, Math.round(width * (centered ? NOTE_COLUMN.centered : NOTE_COLUMN.ceiling)))
  const mathWidth = width - noteWidth * (centered ? 2 : 1)
  // Too wide to sit beside its note (an em is the font size in half-points × 10 twips):
  // the equation gets the whole width, wrapping at its = signs, and the note goes under it.
  if (ems * (size ?? fontSizeOf(ctx.o)) * TWIPS_PER_EM_PER_HALF_POINT > mathWidth) {
    return {
      xml: paraXml({ props: { before: SPACING.equation, after: 0, indent: indent || undefined, keepNext: true }, content: display })
        + paraXml({ props: { before: 0, after: SPACING.equation, jc: 'right' }, content: noteRuns }),
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
      + cell(noteWidth, paraXml({ props: { ...spacing, jc: 'right' }, content: noteRuns }))
      + '</w:tr></w:tbl>',
  }
}

/** Every note in the sheet, for sizing the note column. */
function notesOf(list: Block[]): string[] {
  return list.flatMap((b): string[] => {
    switch (b.kind) {
      case 'calc': return [b.note, ...(b.trace ?? []).map((t) => t.note)].filter((n): n is string => !!n)
      case 'constants': return b.entries.map((e) => e.note).filter((n): n is string => !!n)
      case 'function': return b.body.map((l) => l.note).filter((n): n is string => !!n)
      case 'group':
      case 'layout': return notesOf(b.children)
      default: return []
    }
  })
}

/** A block with a title: a card (with cards on), else a bold title over an indented body. */
function titled(ctx: Ctx, title: string, body: (inner: Ctx) => Item[]): Item[] {
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
const heading = (title: string, note?: string) =>
  [title && titleRuns(title, { bold: true }), note && run(` — ${note}`, { bold: true })].filter(Boolean).join('')

/** Blocks as paragraphs and tables, leaving out hidden ones. */
function blocks(list: Block[], ctx: Ctx): Item[] {
  return list.flatMap((b) => (b.kind !== 'spacer' && isOmitted(b) ? [] : block(b, ctx)))
}

function block(b: Block, ctx: Ctx): Item[] {
  const base: ParaProps = { indent: ctx.indent || undefined, jc: ctx.center ? 'center' : undefined }
  switch (b.kind) {
    case 'heading': {
      const number = ctx.o.numberSections && b.level < 3 && b.number ? run(`${b.number}${EM_SPACE}`) : ''
      return [{ props: { style: `Heading${b.level}` }, content: number + titleRuns(b.text) }]
    }
    case 'spacer':
      return [{ props: { after: 0 }, content: '' }]
    case 'import':
      // Imported data only defines variables; it isn't part of the document.
      return []
    case 'text':
      return [{ props: base, content: richText(b.text) }]
    case 'latex':
      return [equation(ctx, b.latex)]
    case 'calc':
      // Errors stay out of the document, as in the LaTeX export.
      if (b.error || b.hidden) return []
      // A plot: its picture (if it was drawn), then its fits' equations.
      if (b.plot) {
        const png = ctx.images.get(b.plot)
        return [...(png ? [picture(ctx, png)] : []), ...(b.tex ? [equation(ctx, b.tex, b.note)] : [])]
      }
      return [
        ...(b.trace ?? []).map((t) => equation(ctx, t.tex, t.note, true)),
        equation(ctx, b.tex, b.note),
      ]
    case 'constants': {
      if (b.hidden && !b.error) return []
      const shown = b.entries.filter((e) => !e.error)
      if (!shown.length) return []
      return titled(ctx, heading('Constants', b.note), (inner) => shown.map((e) => equation(inner, e.tex, e.note)))
    }
    case 'function': {
      if (b.error || b.hidden) return []
      const title = `${run('Function ', { bold: true })}${texToOmml(b.signature)}${b.note ? run(` — ${b.note}`, { bold: true }) : ''}`
      return titled(ctx, title, (inner) => b.body.map((l) => equation(inner, l.tex, l.note)))
    }
    case 'group':
      if (b.command === 'hide') return []
      return titled(ctx, heading(b.title, b.note), (inner) => blocks(b.children, inner))
    case 'layout': {
      if (b.command === 'hide' || (b.error && !b.children.length)) return []
      const title: Item[] = b.title || b.note
        ? [{ props: { ...base, keepNext: true, ...SPACING.title }, content: heading(b.title, b.note) }]
        : []
      if (b.style === 'center') return [...title, ...blocks(b.children, { ...ctx, center: true })]
      if (b.style === 'text') return [...title, ...blocks(b.children, ctx)]
      if (b.style === 'list' || b.style === 'numbered') return [...title, ...list(b, ctx, 0)]
      return [...title, ...blocks(b.children, { ...ctx, indent: ctx.indent + INDENT })]
    }
  }
}

/** A bulleted or numbered list (and the sub-lists indented under its items). */
function list(b: Block & { kind: 'layout' }, ctx: Ctx, level: number): Item[] {
  ctx.nums.push({ abstract: b.style === 'numbered' ? 1 : 0 })
  const id = ctx.nums.length
  // List text starts at the numbering's indent; equations' notes still reach the margin.
  const itemCtx: Ctx = { ...ctx, indent: 0, inList: true }
  return listItems(b.children).flatMap(({ item, subs }) => {
    const own = block(item, itemCtx)
    const first = own[0]
    const marked: Item[] = first && !('xml' in first)
      ? [{ props: { ...first.props, num: { id, level }, indent: undefined }, content: first.content }, ...own.slice(1)]
      : [{ props: { num: { id, level } }, content: '' }, ...own]
    const nested = subs.flatMap((s) => (s.kind === 'layout' && (s.style === 'list' || s.style === 'numbered')
      ? list(s, ctx, Math.min(level + 1, 2))
      : block(s, itemCtx)))
    return [...marked, ...nested]
  })
}

// ---------------------------------------------------------------------------
// The package
// ---------------------------------------------------------------------------

/** XML namespaces: WordprocessingML, and Office Math. */
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const M = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"'
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

/** The document's styles: body text, headings and the title. */
function stylesXml(o: LatexOptions): string {
  const size = fontSizeOf(o)
  const heading = (level: number, sz: number, before: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/>`
    + `<w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="${SPACING.heading.after}"/>`
    + `<w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`
  return `${HEAD}<w:styles ${W}>`
    + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONTS.text}" w:hAnsi="${FONTS.text}" w:eastAsia="${FONTS.text}" w:cs="${FONTS.text}"/>'
    + `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="${LANGUAGE}"/></w:rPr></w:rPrDefault>`
    + `<w:pPrDefault><w:pPr><w:spacing w:after="${SPACING.paragraph.after}" w:line="${SPACING.paragraph.line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + [1, 2, 3].map((level, i) => heading(level, size + HEADING_SIZE_STEP[i], SPACING.heading.before[i])).join('')
    + '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>'
    + `<w:pPr><w:jc w:val="center"/><w:spacing w:after="${SPACING.title.before}"/></w:pPr><w:rPr><w:sz w:val="${size + TITLE_SIZE_STEP}"/><w:szCs w:val="${size + TITLE_SIZE_STEP}"/></w:rPr></w:style>`
    + '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>'
    + '</w:styles>'
}

/** Bullets and numbering: one bulleted and one numbered style, and an instance for each list. */
function numberingXml(nums: Ctx['nums']): string {
  const BULLETS = ['•', '◦', '▪']
  const lvl = (i: number, numbered: boolean) =>
    `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${numbered ? (i === 1 ? 'lowerLetter' : i === 2 ? 'lowerRoman' : 'decimal') : 'bullet'}"/>`
    + `<w:lvlText w:val="${numbered ? `%${i + 1}${i === 0 ? '.' : ')'}` : BULLETS[i]}"/><w:lvlJc w:val="left"/>`
    + `<w:pPr><w:ind w:left="${LIST_INDENT.hanging * (i + 1) + LIST_INDENT.gap}" w:hanging="${LIST_INDENT.hanging}"/></w:pPr></w:lvl>`
  const abstract = (id: number, numbered: boolean) =>
    `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${[0, 1, 2].map((i) => lvl(i, numbered)).join('')}</w:abstractNum>`
  // Every list is its own instance, restarting at 1.
  const instances = nums.map((n, i) =>
    `<w:num w:numId="${i + 1}"><w:abstractNumId w:val="${n.abstract}"/>`
    + [0, 1, 2].map((l) => `<w:lvlOverride w:ilvl="${l}"><w:startOverride w:val="1"/></w:lvlOverride>`).join('')
    + '</w:num>').join('')
  return `${HEAD}<w:numbering ${W}>${abstract(0, false)}${abstract(1, true)}${instances}</w:numbering>`
}

/** How Word sets equations: the font, alignment (from the Document options), and line breaking. */
const settingsXml = (o: LatexOptions) =>
  `${HEAD}<w:settings ${W} ${M}><m:mathPr><m:mathFont m:val="${FONTS.math}"/><m:brkBin m:val="before"/>`
  + `<m:brkBinSub m:val="--"/><m:smallFrac m:val="0"/><m:dispDef/><m:lMargin m:val="0"/><m:rMargin m:val="0"/>`
  + `<m:defJc m:val="${o.align === 'center' ? 'centerGroup' : 'left'}"/><m:wrapIndent m:val="${MATH_WRAP_INDENT}"/>`
  + '<m:intLim m:val="subSup"/><m:naryLim m:val="undOvr"/></m:mathPr></w:settings>'

/** The document's properties: title, author and when it was made. */
function coreXml(o: LatexOptions): string {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  return `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" `
    + 'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
    + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + `<dc:title>${xmlEscape(o.title.trim())}</dc:title><dc:creator>${xmlEscape(o.author.trim() || 'MathScribe')}</dc:creator>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`
}

/** What each part of the package is. */
const CONTENT_TYPES = `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Default Extension="png" ContentType="image/png"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
  + '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
  + '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
  + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
  + '</Types>'

/** The package's relationships: the document, and its properties. */
const ROOT_RELS = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
  + '</Relationships>'

/** Where the `n`th picture is in the zip, and as the document refers to it. */
const mediaPath = (n: number) => `media/plot${n}.png`

/** The document's relationships: its styles, numbering and settings, and its pictures. */
const docRels = (pictures: number) => `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
  + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
  + Array.from({ length: pictures }, (_, i) => `<Relationship Id="${imageRel(i + 1)}" `
    + `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${mediaPath(i + 1)}"/>`).join('')
  + '</Relationships>'

/** The document's parts, as XML text by path in the zip. (Exported for tests.) */
export function docxParts(sheetBlocks: Block[], o: LatexOptions, today = new Date(), images: PlotImages = new Map()): Record<string, string> {
  return docxPackage(sheetBlocks, o, today, images).parts
}

/** The document's XML parts, and its pictures' files (by path in the zip). */
function docxPackage(sheetBlocks: Block[], o: LatexOptions, today: Date, images: PlotImages) {
  const page = PAPER[o.paper]
  const margin = Math.round(MARGIN_CM[o.margins] * TWIPS_PER_CM)
  const width = page.w - 2 * margin
  // About half an em per character of italic text (an em is the size in half-points × 10 twips).
  const longest = Math.max(0, ...notesOf(sheetBlocks).map((n) => n.length))
  const noteWidth = Math.round(Math.min(width * NOTE_COLUMN.max, Math.max(width * NOTE_COLUMN.min,
    longest * NOTE_CHAR_EMS * fontSizeOf(o) * TWIPS_PER_EM_PER_HALF_POINT + NOTE_PADDING)))
  const ctx: Ctx = {
    o, width, indent: 0, center: false, nums: [], small: fontSizeOf(o) - WORKING_SIZE_STEP, noteWidth,
    images, media: [],
  }
  const title: Item[] = o.title.trim() ? [
    { props: { style: 'Title' }, content: run(o.title.trim()) },
    ...(o.author.trim() ? [{ props: { jc: 'center' as const, after: SPACING.author }, content: run(o.author.trim()) }] : []),
    ...(o.date ? [{
      props: { jc: 'center' as const, after: SPACING.date },
      content: run(today.toLocaleDateString(LANGUAGE, { day: 'numeric', month: 'long', year: 'numeric' })),
    }] : []),
  ] : []
  const body = [...title, ...blocks(sheetBlocks, ctx)].map(itemXml).join('')
  const sect = `<w:sectPr><w:pgSz w:w="${page.w}" w:h="${page.h}"/>`
    + `<w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="${SPACING.pageHeader}" w:footer="${SPACING.pageHeader}" w:gutter="0"/></w:sectPr>`
  const document = `${HEAD}<w:document ${W} ${M} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`
    + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'
    + `<w:body>${body}${sect}</w:body></w:document>`
  const parts: Record<string, string> = {
    '[Content_Types].xml': CONTENT_TYPES,
    '_rels/.rels': ROOT_RELS,
    'docProps/core.xml': coreXml(o),
    'word/document.xml': document,
    'word/_rels/document.xml.rels': docRels(ctx.media.length),
    'word/styles.xml': stylesXml(o),
    'word/numbering.xml': numberingXml(ctx.nums),
    'word/settings.xml': settingsXml(o),
  }
  const media = Object.fromEntries(ctx.media.map((png, i) => [`word/${mediaPath(i + 1)}`, png]))
  return { parts, media }
}

/** The file type of a .docx, for downloading it. */
export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * The sheet as a .docx file. Plots are pictures, drawn beforehand (see
 * plotImages); one without a picture is left out, though its fit equations stay.
 */
export function toDocx(sheetBlocks: Block[], o: LatexOptions, images: PlotImages = new Map()): Uint8Array {
  const { parts, media } = docxPackage(sheetBlocks, o, new Date(), images)
  return zipSync({
    ...Object.fromEntries(Object.entries(parts).map(([path, xml]) => [path, strToU8(xml)])),
    // (PNGs are compressed already.)
    ...Object.fromEntries(Object.entries(media).map(([path, png]) => [path, [png, { level: 0 }] as [Uint8Array, { level: 0 }]])),
  })
}
