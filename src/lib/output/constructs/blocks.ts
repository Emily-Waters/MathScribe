/**
 * The constructs for blocks over several lines that aren't layouts: a card
 * (`@constants { }`, species' names), imported data, and a scoped `Title { }` block.
 */
import {
  BLOCK_KIND, HEADING_LEVEL, type Block, type CardBlock, type CustomBlock, type GroupBlock, type ImportBlock, type HeadingLevel,
} from '../../sheet/blocks.ts'
import { DISPLAY } from '../../syntax.ts'
import { errorComment, gather, heading as latexHeading, titleToLatex, titled as latexTitled, type Equation } from '../latexKit.ts'
import { moduleBlockKind } from '../../engine/index.ts'
import { equation, heading as docxHeading, run, titled as docxTitled, type Ctx, type Item } from '../docxKit.ts'
import { EM_SPACE } from '../syntax.ts'
import { Construct, type DocxOut, type LatexOut } from './construct.ts'

/** The LaTeX counter a block titled as a heading takes its number from, by level (none for a bold paragraph's). */
const SECTION_COUNTER: Record<HeadingLevel, string | undefined> = {
  [HEADING_LEVEL.section]: 'section',
  [HEADING_LEVEL.subsection]: 'subsection',
  [HEADING_LEVEL.paragraph]: undefined,
}

/**
 * A card of equations under its title: `@constants { … }`, a module's
 * (chemistry's species' names). One on a line of its own is its equation, without the card.
 */
export class CardConstruct extends Construct<CardBlock> {
  readonly kind = BLOCK_KIND.card

  latex(b: CardBlock, out: LatexOut): string {
    if (b.hidden && !b.error && !b.entries.some((e) => e.error)) return ''
    const shown = b.entries.filter((e) => !e.error)
    const errors = b.entries.filter((e) => e.error).map((e) => errorComment(e.line, e.source, e.error!))
    const body = [...errors, ...(shown.length ? [gather(shown, out.share)] : [])].join('\n')
    return b.single ? body : latexTitled(out.o, latexHeading(b.title, b.note), body)
  }

  docx(b: CardBlock, ctx: Ctx): Item[] {
    if (b.hidden && !b.error) return []
    const shown = b.entries.filter((e) => !e.error)
    if (!shown.length) return []
    const equations = (inner: Ctx) => shown.map((e) => equation(inner, e.tex, e.note))
    return b.single ? equations(ctx) : docxTitled(ctx, docxHeading(b.title, b.note), equations)
  }

  notes(b: CardBlock): string[] {
    return b.entries.map((e) => e.note).filter((n): n is string => !!n)
  }
}

/** `@import("run1.csv")` with its rows: it only defines variables, so it isn't part of the document. */
export class ImportConstruct extends Construct<ImportBlock> {
  readonly kind = BLOCK_KIND.import

  latex(): string {
    return ''
  }

  docx(): Item[] {
    return []
  }
}

/** `Title { … }`: a block that scopes its variables, as a card. */
export class GroupConstruct extends Construct<GroupBlock> {
  readonly kind = BLOCK_KIND.group

  latex(b: GroupBlock, out: LatexOut): string {
    if (b.display === DISPLAY.hidden) return ''
    const title = b.title && titleToLatex(b.title)
    // A title written as a heading (`# Kinematics {`) takes the next section's (or
    // subsection's) number, so LaTeX's count goes on from it as from a heading.
    const counter = out.o.numberSections && b.section ? SECTION_COUNTER[b.section.level] : undefined
    const card = latexTitled(out.o, latexHeading(counter ? `\\the${counter}\\quad ${title}` : title, b.note), out.join(b.children))
    return counter ? `\\refstepcounter{${counter}}\n${card}` : card
  }

  docx(b: GroupBlock, ctx: Ctx, out: DocxOut): Item[] {
    if (b.display === DISPLAY.hidden) return []
    const number = ctx.o.numberSections && b.section?.number ? run(`${b.section.number}${EM_SPACE}`, { bold: true }) : ''
    return docxTitled(ctx, number + docxHeading(b.title, b.note), (inner) => out.blocks(b.children, inner))
  }

  notes(b: GroupBlock, notesOf: (blocks: Block[]) => string[]): string[] {
    return notesOf(b.children)
  }
}

/** What's said of a block of a module's kind when no module installed has that kind. */
const unknownKind = (type: string) => `No module installed has the kind of block ${type}.`

/**
 * A block of a module's own kind: written by the construct its module gives for
 * its `type` (EngineModule.blockKinds).
 */
export class CustomConstruct extends Construct<CustomBlock> {
  readonly kind = BLOCK_KIND.custom

  latex(b: CustomBlock, out: LatexOut): string {
    const kind = moduleBlockKind(b.type)
    return kind ? kind.construct.latex(b, out) : errorComment(b.line, b.type, unknownKind(b.type))
  }

  docx(b: CustomBlock, ctx: Ctx, out: DocxOut): Item[] {
    return moduleBlockKind(b.type)?.construct.docx(b, ctx, out) ?? []
  }

  override equation(b: CustomBlock): Equation | null {
    return moduleBlockKind(b.type)?.construct.equation(b) ?? null
  }

  override latexItem(b: CustomBlock, out: LatexOut): string {
    return moduleBlockKind(b.type)?.construct.latexItem(b, out) ?? this.latex(b, out)
  }

  override notes(b: CustomBlock, notesOf: (blocks: Block[]) => string[]): string[] {
    return moduleBlockKind(b.type)?.construct.notes(b, notesOf) ?? []
  }
}
