/**
 * The constructs for blocks over several lines that aren't layouts: an
 * `@constants { }` block, a `def` function, imported data, and a scoped
 * `Title { }` block.
 */
import {
  BLOCK_KIND, type Block, type ConstantsBlock, type FunctionBlock, type GroupBlock, type ImportBlock, type SpeciesBlock,
  type SpeciesEntry,
} from '../blocks.ts'
import { formulaTex } from '../chemistry.ts'
import { LINE_COMMAND } from '../syntax.ts'
import { errorComment, gather, heading as latexHeading, titleToLatex, titled as latexTitled } from '../latexKit.ts'
import { equation, heading as docxHeading, run, titled as docxTitled, type Ctx, type Item } from '../docxKit.ts'
import { texToOmml } from '../omml.ts'
import { Construct, type DocxOut, type LatexOut } from './construct.ts'

/** The title of an `@constants { }` block, in the exports. */
const CONSTANTS_TITLE = 'Constants'

/** The words before a function's signature, in the exports' titles. */
const FUNCTION_TITLE = 'Function'

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

/** `def f(a, b)` with its body: its working, as a card titled with its signature. */
export class FunctionConstruct extends Construct<FunctionBlock> {
  readonly kind = BLOCK_KIND.function

  latex(b: FunctionBlock, out: LatexOut): string {
    if (b.error) return errorComment(b.line, `function ${b.name}`, b.error)
    if (b.hidden) return ''
    return latexTitled(out.o, latexHeading(`${FUNCTION_TITLE} $${b.signature}$`, b.note), gather(b.body))
  }

  docx(b: FunctionBlock, ctx: Ctx): Item[] {
    if (b.error || b.hidden) return []
    const title = `${run(`${FUNCTION_TITLE} `, { bold: true })}${texToOmml(b.signature)}${b.note ? run(` — ${b.note}`, { bold: true }) : ''}`
    return docxTitled(ctx, title, (inner) => b.body.map((l) => equation(inner, l.tex, l.note)))
  }

  notes(b: FunctionBlock): string[] {
    return b.body.map((l) => l.note).filter((n): n is string => !!n)
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

/** `import("run1.csv")` with its rows: it only defines variables, so it isn't part of the document. */
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
    return latexTitled(out.o, latexHeading(b.title && titleToLatex(b.title), b.note), out.join(b.children))
  }

  docx(b: GroupBlock, ctx: Ctx, out: DocxOut): Item[] {
    if (b.command === LINE_COMMAND.hide) return []
    return docxTitled(ctx, docxHeading(b.title, b.note), (inner) => out.blocks(b.children, inner))
  }

  notes(b: GroupBlock, notesOf: (blocks: Block[]) => string[]): string[] {
    return notesOf(b.children)
  }
}
