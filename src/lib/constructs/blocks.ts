/**
 * The constructs for blocks over several lines that aren't layouts: an
 * `@constants { }` block, imported data, and a scoped
 * `Title { }` block.
 */
import {
  BLOCK_KIND, HEADING_LEVEL, type Block, type ConstantsBlock, type GroupBlock, type ImportBlock, type SpeciesBlock,
  type HeadingLevel, type SpeciesEntry,
} from '../blocks.ts'
import { formulaTex } from '../engine/modules/chemistry/chemistry.ts'
import { LINE_COMMAND } from '../syntax.ts'
import { errorComment, gather, heading as latexHeading, titleToLatex, titled as latexTitled } from '../latexKit.ts'
import { equation, heading as docxHeading, run, titled as docxTitled, type Ctx, type Item } from '../docxKit.ts'
import { EM_SPACE } from '../omml.ts'
import { Construct, type DocxOut, type LatexOut } from './construct.ts'

/** The title of an `@constants { }` block, in the exports. */
const CONSTANTS_TITLE = 'Constants'

/** The LaTeX counter a block titled as a heading takes its number from, by level (none for a bold paragraph's). */
const SECTION_COUNTER: Record<HeadingLevel, string | undefined> = {
  [HEADING_LEVEL.section]: 'section',
  [HEADING_LEVEL.subsection]: 'subsection',
  [HEADING_LEVEL.paragraph]: undefined,
}

/** `@constants { … }`: constants usable anywhere as `@name`, shown as a card. */
export class ConstantsConstruct extends Construct<ConstantsBlock> {
  readonly kind = BLOCK_KIND.constants

  latex(b: ConstantsBlock, out: LatexOut): string {
    if (b.hidden && !b.error && !b.entries.some((e) => e.error)) return ''
    const shown = b.entries.filter((e) => !e.error)
    const errors = b.entries.filter((e) => e.error).map((e) => errorComment(e.line, e.source, e.error!))
    return latexTitled(out.o, latexHeading(CONSTANTS_TITLE, b.note), [...errors, ...(shown.length ? [gather(shown)] : [])].join('\n'))
  }

  docx(b: ConstantsBlock, ctx: Ctx): Item[] {
    if (b.hidden && !b.error) return []
    const shown = b.entries.filter((e) => !e.error)
    if (!shown.length) return []
    return docxTitled(ctx, docxHeading(CONSTANTS_TITLE, b.note), (inner) => shown.map((e) => equation(inner, e.tex, e.note)))
  }

  notes(b: ConstantsBlock): string[] {
    return b.entries.map((e) => e.note).filter((n): n is string => !!n)
  }
}

/** The title of an `@chem.species { }` block, in the exports. */
const SPECIES_TITLE = 'Species'

/** A species' name and its formula, as LaTeX: dietzeite = 7Ca(IO₃)₂·8CaCrO₄. */
export const speciesEntryTex = (e: SpeciesEntry) => `\\mathrm{${e.name}} = ${formulaTex(e.formula)}`

/** `@chem.species { … }`: names for species, as a card of name = formula (one on its own line, as an equation). */
export class SpeciesConstruct extends Construct<SpeciesBlock> {
  readonly kind = BLOCK_KIND.species

  latex(b: SpeciesBlock, out: LatexOut): string {
    if (b.hidden && !b.error && !b.entries.some((e) => e.error)) return ''
    const shown = b.entries.filter((e) => !e.error).map((e) => ({ tex: speciesEntryTex(e), note: e.note }))
    const errors = b.entries.filter((e) => e.error).map((e) => errorComment(e.line, e.name, e.error!))
    const body = [...errors, ...(shown.length ? [gather(shown)] : [])].join('\n')
    return b.single ? body : latexTitled(out.o, latexHeading(SPECIES_TITLE, b.note), body)
  }

  docx(b: SpeciesBlock, ctx: Ctx): Item[] {
    if (b.hidden && !b.error) return []
    const shown = b.entries.filter((e) => !e.error)
    if (!shown.length) return []
    const equations = (inner: Ctx) => shown.map((e) => equation(inner, speciesEntryTex(e), e.note))
    return b.single ? equations(ctx) : docxTitled(ctx, docxHeading(SPECIES_TITLE, b.note), equations)
  }

  notes(b: SpeciesBlock): string[] {
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
    if (b.command === LINE_COMMAND.hide) return ''
    const title = b.title && titleToLatex(b.title)
    // A title written as a heading (`# Kinematics {`) takes the next section's (or
    // subsection's) number, so LaTeX's count goes on from it as from a heading.
    const counter = out.o.numberSections && b.section ? SECTION_COUNTER[b.section.level] : undefined
    const card = latexTitled(out.o, latexHeading(counter ? `\\the${counter}\\quad ${title}` : title, b.note), out.join(b.children))
    return counter ? `\\refstepcounter{${counter}}\n${card}` : card
  }

  docx(b: GroupBlock, ctx: Ctx, out: DocxOut): Item[] {
    if (b.command === LINE_COMMAND.hide) return []
    const number = ctx.o.numberSections && b.section?.number ? run(`${b.section.number}${EM_SPACE}`, { bold: true }) : ''
    return docxTitled(ctx, number + docxHeading(b.title, b.note), (inner) => out.blocks(b.children, inner))
  }

  notes(b: GroupBlock, notesOf: (blocks: Block[]) => string[]): string[] {
    return notesOf(b.children)
  }
}
