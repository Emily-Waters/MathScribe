/**
 * The constructs for single lines of a sheet: headings, prose, raw LaTeX, gaps,
 * and calculations.
 */
import { BLOCK_KIND, type CalcBlock, type HeadingBlock, type LatexBlock, type RuleBlock, type SpacerBlock, type TextBlock } from '../../sheet/blocks.ts'
import { moduleFigureKind } from '../../engine/index.ts'
import { centredEquation, errorComment, gather, titleToLatex, type Equation } from '../latexKit.ts'
import { PARA_BORDER, SPACING, baseProps, equation, fontSizeOf, picture, run, titleRuns, type Ctx, type Item } from '../docxKit.ts'
import { EM_SPACE } from '../syntax.ts'
import { TEX_UNNUMBERED } from '../../latex/syntax.ts'
import { Construct, type LatexOut } from './construct.ts'

/** `# Title`, `## Title`, `### Title`: a section, a subsection, a bold heading. */
export class HeadingConstruct extends Construct<HeadingBlock> {
  readonly kind = BLOCK_KIND.heading

  latex(b: HeadingBlock, out: LatexOut): string {
    const text = titleToLatex(b.text)
    const star = out.o.numberSections ? '' : TEX_UNNUMBERED
    if (b.level === 1) return `\\section${star}{${text}}`
    if (b.level === 2) return `\\subsection${star}{${text}}`
    return `\\noindent\\textbf{${text}}`
  }

  docx(b: HeadingBlock, ctx: Ctx): Item[] {
    const number = ctx.o.numberSections && b.level < 3 && b.number ? run(`${b.number}${EM_SPACE}`) : ''
    return [{ props: { style: `Heading${b.level}` }, content: number + titleRuns(b.text) }]
  }
}

/**
 * A text block's own headings, by level (1 the largest): not numbered, and
 * smaller than the sheet's. LaTeX: each one's font, on a line of its own, with
 * a little room above and below. Word: how much larger than the text (in
 * half-points), and whether italic.
 */
const TEXT_HEADINGS = {
  1: { latex: '\\large\\bfseries', sizeStep: 4, italic: false },
  2: { latex: '\\bfseries', sizeStep: 0, italic: false },
  3: { latex: '\\bfseries\\itshape', sizeStep: 0, italic: true },
} as const
type TextHeadingLevel = keyof typeof TEXT_HEADINGS

/** How far in a text block's quote is set (twips: half an inch). */
const QUOTE_INDENT = 720

/** LaTeX's environment for a quote. */
const QUOTE_ENVIRONMENT = 'quote'

/**
 * `> Prose`, and a paragraph of an @layout.text block: text with `$…$` maths;
 * in a text block, also a heading of its own (not numbered) or a quote.
 */
export class TextConstruct extends Construct<TextBlock> {
  readonly kind = BLOCK_KIND.text

  latex(b: TextBlock): string {
    // (As in a title: a name's subscript, v_0, and `$…$` as maths.)
    const text = titleToLatex(b.text)
    if (b.heading) {
      const { latex } = TEXT_HEADINGS[b.heading as TextHeadingLevel]
      return `\\par\\medskip\\noindent{${latex} ${text}\\par}\\nobreak\\smallskip`
    }
    return b.quote ? `\\begin{${QUOTE_ENVIRONMENT}}\n${text}\n\\end{${QUOTE_ENVIRONMENT}}` : text
  }

  docx(b: TextBlock, ctx: Ctx): Item[] {
    if (b.heading) {
      const { sizeStep, italic } = TEXT_HEADINGS[b.heading as TextHeadingLevel]
      const size = sizeStep ? fontSizeOf(ctx.o) + sizeStep : undefined
      return [{ props: { ...baseProps(ctx), keepNext: true, ...SPACING.title }, content: titleRuns(b.text, { bold: true, italic, size }) }]
    }
    if (b.quote) {
      return [{ props: { ...baseProps(ctx), indent: ctx.indent + QUOTE_INDENT, border: PARA_BORDER.left }, content: titleRuns(b.text) }]
    }
    return [{ props: baseProps(ctx), content: titleRuns(b.text) }]
  }
}

/** `---` in an @layout.text block: a rule across the page. */
export class RuleConstruct extends Construct<RuleBlock> {
  readonly kind = BLOCK_KIND.rule

  latex(): string {
    return '\\par\\noindent\\rule{\\linewidth}{0.4pt}\\par'
  }

  docx(_b: RuleBlock, ctx: Ctx): Item[] {
    // (An empty paragraph with a line along its bottom.)
    return [{ props: { ...baseProps(ctx), border: PARA_BORDER.bottom }, content: '' }]
  }
}

/** `@latex { … }`, or a reaction on its own line: LaTeX displayed, not worked out. */
export class LatexConstruct extends Construct<LatexBlock> {
  readonly kind = BLOCK_KIND.latex

  latex(b: LatexBlock): string {
    if (b.error) return errorComment(b.line, b.latex, b.error)
    return gather([{ tex: b.latex }])
  }

  docx(b: LatexBlock, ctx: Ctx): Item[] {
    // (Errors stay out of the document, as for calculations.)
    return b.error ? [] : [equation(ctx, b.latex)]
  }

  equation(b: LatexBlock): Equation | null {
    return b.error ? null : { tex: b.latex }
  }

  latexItem(b: LatexBlock): string {
    return b.error ? this.latex(b) : `$\\displaystyle ${b.latex}$`
  }
}

/** Two or more blank lines: a gap of one line. */
export class SpacerConstruct extends Construct<SpacerBlock> {
  readonly kind = BLOCK_KIND.spacer

  latex(): string {
    return '\\vspace{\\baselineskip}'
  }

  docx(): Item[] {
    return [{ props: { after: 0 }, content: '' }]
  }
}

/** What's said of a figure of a kind no module installed has. */
const unknownFigure = (type: string) => `No module installed has the kind of figure ${type}.`

/** A calculation: its equation (with any working inside function calls above it), and any figure a module makes of it (a plot). */
export class CalcConstruct extends Construct<CalcBlock> {
  readonly kind = BLOCK_KIND.calc

  latex(b: CalcBlock, out: LatexOut): string {
    if (b.error) return errorComment(b.line, b.source, b.error)
    if (b.hidden) return ''
    // A figure (a plot), as its module writes it, then the line's equations (a fit's, if any), centred under it as it is.
    if (b.figure) {
      const figure = moduleFigureKind(b.figure.type)?.latex(b.figure.data) ?? errorComment(b.line, b.source, unknownFigure(b.figure.type))
      return [figure, b.tex ? centredEquation({ tex: b.tex, note: b.note }) : ''].filter(Boolean).join('\n')
    }
    // The working inside a function call: indented and a little smaller, above the line.
    const working = b.trace?.length ? ['\\begin{msworking}', gather(b.trace, out.share), '\\end{msworking}'].join('\n') : ''
    return [working, gather([{ tex: b.tex, note: b.note }], out.share)].filter(Boolean).join('\n')
  }

  docx(b: CalcBlock, ctx: Ctx): Item[] {
    // Errors stay out of the document, as in the LaTeX export.
    if (b.error || b.hidden) return []
    // A figure (a plot): its picture (if it was drawn), then the line's equations.
    if (b.figure) {
      const image = ctx.images.get(b.figure.data)
      return [...(image ? [picture(ctx, image)] : []), ...(b.tex ? [equation({ ...ctx, center: true }, b.tex, b.note)] : [])]
    }
    return [
      ...(b.trace ?? []).map((t) => equation(ctx, t.tex, t.note, true)),
      equation(ctx, b.tex, b.note),
    ]
  }

  equation(b: CalcBlock): Equation | null {
    return !b.error && !b.hidden && !b.trace?.length && !b.figure ? { tex: b.tex, note: b.note } : null
  }

  latexItem(b: CalcBlock, out: LatexOut): string {
    if (b.error || b.trace?.length) return this.latex(b, out)
    return `$\\displaystyle ${b.tex}$${b.note ? ` \\hfill ${titleToLatex(b.note)}` : ''}`
  }

  notes(b: CalcBlock): string[] {
    return [b.note, ...(b.trace ?? []).map((t) => t.note)].filter((n): n is string => !!n)
  }
}
