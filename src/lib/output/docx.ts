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
import { isOmitted } from '../sheet/blocks.ts'
import { BLOCK_KIND, type Block } from '../sheet/blocks.ts'
import { ALIGN } from './alignment.ts'
import { MARGIN_CM, type LatexOptions } from './latex.ts'
import { xmlEscape } from './omml.ts'
import { LIST_MARKER, type ListMarker } from '../syntax.ts'
import {
  CAPTION_STYLE, FONTS, HEADING_SIZE_STEP, LANGUAGE, LIST_INDENT, MATH_WRAP_INDENT, NOTE_CHAR_EMS, NOTE_COLUMN, NOTE_PADDING, PAPER, SPACING,
  TITLE_SIZE_STEP, TITLE_STYLE, TWIPS_PER_CM, TWIPS_PER_EM_PER_HALF_POINT, WORKING_SIZE_STEP, fontSizeOf, imageRel, itemXml, run,
  type Ctx, type FigureImages, type Item,
} from './docxKit.ts'
import { constructOf, type DocxOut } from './constructs/index.ts'

export type { FigureImage, FigureImages } from './docxKit.ts'

// ---------------------------------------------------------------------------
// Blocks: each kind's construct writes it (constructs/); this joins them up
// ---------------------------------------------------------------------------

/** Blocks as paragraphs and tables, leaving out hidden ones. */
function blocks(list: Block[], ctx: Ctx): Item[] {
  return list.flatMap((b) => (b.kind !== BLOCK_KIND.spacer && isOmitted(b) ? [] : block(b, ctx)))
}

/** What a construct asks of the export, for the blocks inside it. */
const WRITER: DocxOut = { block: (b, ctx) => block(b, ctx), blocks: (list, ctx) => blocks(list, ctx) }

/** One block as paragraphs and tables, as its construct writes it. */
const block = (b: Block, ctx: Ctx): Item[] => constructOf(b).docx(b, ctx, WRITER)

/** Every note in the sheet, for sizing the note column. */
const notesOf = (list: Block[]): string[] => list.flatMap((b) => constructOf(b).notes(b, notesOf))

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
    + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONTS.text}" w:hAnsi="${FONTS.text}" w:eastAsia="${FONTS.text}" w:cs="${FONTS.text}"/>`
    + `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="${LANGUAGE}"/></w:rPr></w:rPrDefault>`
    + `<w:pPrDefault><w:pPr><w:spacing w:after="${SPACING.paragraph.after}" w:line="${SPACING.paragraph.line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + [1, 2, 3].map((level, i) => heading(level, size + HEADING_SIZE_STEP[i], SPACING.heading.before[i])).join('')
    + `<w:style w:type="paragraph" w:styleId="${TITLE_STYLE}"><w:name w:val="${TITLE_STYLE}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>`
    + `<w:pPr><w:jc w:val="center"/><w:spacing w:after="${SPACING.title.before}"/></w:pPr><w:rPr><w:sz w:val="${size + TITLE_SIZE_STEP}"/><w:szCs w:val="${size + TITLE_SIZE_STEP}"/></w:rPr></w:style>`
    + '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>'
    // (Word's own name for it, `caption`, so Word knows these as captions.)
    + `<w:style w:type="paragraph" w:styleId="${CAPTION_STYLE}"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>`
    + `<w:pPr><w:keepNext/><w:spacing w:before="${SPACING.caption.before}" w:after="${SPACING.caption.after}"/></w:pPr></w:style>`
    + '</w:styles>'
}

/** How Word numbers a list with each marker (LIST_MARKER). */
const WORD_NUMBERING: Readonly<Record<ListMarker, string>> = {
  [LIST_MARKER.number]: 'decimal',
  [LIST_MARKER.lowerLetter]: 'lowerLetter',
  [LIST_MARKER.upperLetter]: 'upperLetter',
  [LIST_MARKER.lowerRoman]: 'lowerRoman',
  [LIST_MARKER.upperRoman]: 'upperRoman',
}

/**
 * Bullets and numbering: a style for bullets and one for each marker (every
 * level of it with that marker: a sub-list is a list of its own, with its own
 * marker), and an instance for each list.
 */
function numberingXml(nums: Ctx['nums']): string {
  const BULLETS = ['•', '◦', '▪']
  const lvl = (i: number, marker: ListMarker | undefined) =>
    `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${marker ? WORD_NUMBERING[marker] : 'bullet'}"/>`
    + `<w:lvlText w:val="${marker ? `%${i + 1}${i === 0 ? '.' : ')'}` : BULLETS[i]}"/><w:lvlJc w:val="left"/>`
    + `<w:pPr><w:ind w:left="${LIST_INDENT.hanging * (i + 1) + LIST_INDENT.gap}" w:hanging="${LIST_INDENT.hanging}"/></w:pPr></w:lvl>`
  // (Bullets are style 0; each marker the style after.)
  const styles = [undefined, ...LIST_MARKER.words]
  const styleOf = (marker: ListMarker | undefined) => styles.indexOf(marker)
  const abstract = (marker: ListMarker | undefined) =>
    `<w:abstractNum w:abstractNumId="${styleOf(marker)}"><w:multiLevelType w:val="hybridMultilevel"/>${[0, 1, 2].map((i) => lvl(i, marker)).join('')}</w:abstractNum>`
  // Every list is its own instance, restarting at 1 (or where the column before it left off).
  const instances = nums.map((n, i) =>
    `<w:num w:numId="${i + 1}"><w:abstractNumId w:val="${styleOf(n.marker)}"/>`
    + [0, 1, 2].map((l) => `<w:lvlOverride w:ilvl="${l}"><w:startOverride w:val="${l === 0 ? n.start ?? 1 : 1}"/></w:lvlOverride>`).join('')
    + '</w:num>').join('')
  return `${HEAD}<w:numbering ${W}>${styles.map(abstract).join('')}${instances}</w:numbering>`
}

/**
 * The version of Word the document is made for: 15, the current one (2013 and
 * after). Without it, Word takes the document for an older version's and opens
 * it in Compatibility Mode.
 */
const WORD_COMPATIBILITY_MODE = 15

/**
 * The document's settings: the version of Word it's made for, and how Word sets
 * equations (the font, alignment from the Document options, and line breaking).
 */
const settingsXml = (o: LatexOptions) =>
  `${HEAD}<w:settings ${W} ${M}>`
  + `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="${WORD_COMPATIBILITY_MODE}"/></w:compat>`
  + `<m:mathPr><m:mathFont m:val="${FONTS.math}"/><m:brkBin m:val="before"/>`
  + `<m:brkBinSub m:val="--"/><m:smallFrac m:val="0"/><m:dispDef/><m:lMargin m:val="0"/><m:rMargin m:val="0"/>`
  + `<m:defJc m:val="${o.align === ALIGN.center ? 'centerGroup' : ALIGN.left}"/><m:wrapIndent m:val="${MATH_WRAP_INDENT}"/>`
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
const mediaPath = (n: number) => `media/figure${n}.png`

/** The document's relationships: its styles, numbering and settings, and its pictures. */
const docRels = (pictures: number) => `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
  + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
  + Array.from({ length: pictures }, (_, i) => `<Relationship Id="${imageRel(i + 1)}" `
    + `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${mediaPath(i + 1)}"/>`).join('')
  + '</Relationships>'

/** The document's parts, as XML text by path in the zip. (Exported for tests.) */
export function docxParts(sheetBlocks: Block[], o: LatexOptions, today = new Date(), images: FigureImages = new Map()): Record<string, string> {
  return docxPackage(sheetBlocks, o, today, images).parts
}

/** The document's XML parts, and its pictures' files (by path in the zip). */
function docxPackage(sheetBlocks: Block[], o: LatexOptions, today: Date, images: FigureImages) {
  const page = PAPER[o.paper]
  const margin = Math.round(MARGIN_CM[o.margins] * TWIPS_PER_CM)
  const width = page.w - 2 * margin
  // About half an em per character of italic text (an em is the size in half-points × 10 twips).
  const longest = Math.max(0, ...notesOf(sheetBlocks).map((n) => n.length))
  const noteWidth = Math.round(Math.min(width * NOTE_COLUMN.max, Math.max(width * NOTE_COLUMN.min,
    longest * NOTE_CHAR_EMS * fontSizeOf(o) * TWIPS_PER_EM_PER_HALF_POINT + NOTE_PADDING)))
  const ctx: Ctx = {
    o, width, indent: 0, center: false, nums: [], small: fontSizeOf(o) - WORKING_SIZE_STEP, noteWidth,
    images, media: [], captions: new Map(),
  }
  const title: Item[] = o.title.trim() ? [
    { props: { style: TITLE_STYLE }, content: run(o.title.trim()) },
    ...(o.author.trim() ? [{ props: { jc: ALIGN.center, after: SPACING.author }, content: run(o.author.trim()) }] : []),
    ...(o.date ? [{
      props: { jc: ALIGN.center, after: SPACING.date },
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
 * The sheet as a .docx file. Figures (plots) are pictures, drawn beforehand
 * (see figures.ts: figureImages); one without a picture is left out, though its
 * line's equations stay.
 */
export function toDocx(sheetBlocks: Block[], o: LatexOptions, images: FigureImages = new Map()): Uint8Array {
  const { parts, media } = docxPackage(sheetBlocks, o, new Date(), images)
  return zipSync({
    ...Object.fromEntries(Object.entries(parts).map(([path, xml]) => [path, strToU8(xml)])),
    // (PNGs are compressed already.)
    ...Object.fromEntries(Object.entries(media).map(([path, png]) => [path, [png, { level: 0 }] as [Uint8Array, { level: 0 }]])),
  })
}
