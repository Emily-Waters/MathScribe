/**
 * The constructs for single lines of a sheet: headings, prose, raw LaTeX, gaps,
 * and calculations.
 */
import { BLOCK_KIND, type CalcBlock, type HeadingBlock, type LatexBlock, type SpacerBlock, type TextBlock } from '../blocks.ts'
import { errorComment, gather, plotToLatex, titleToLatex, type Equation } from '../latexKit.ts'
import { baseProps, equation, picture, run, titleRuns, type Ctx, type Item } from '../docxKit.ts'
import { EM_SPACE } from '../omml.ts'
import { Construct, type LatexOut } from './construct.ts'

/** `# Title`, `## Title`, `### Title`: a section, a subsection, a bold heading. */
export class HeadingConstruct extends Construct<HeadingBlock> {
  readonly kind = BLOCK_KIND.heading

  latex(b: HeadingBlock, out: LatexOut): string {
    const text = titleToLatex(b.text)
    const star = out.o.numberSections ? '' : '*'
    if (b.level === 1) return `\\section${star}{${text}}`
    if (b.level === 2) return `\\subsection${star}{${text}}`
    return `\\noindent\\textbf{${text}}`
  }

  docx(b: HeadingBlock, ctx: Ctx): Item[] {
    const number = ctx.o.numberSections && b.level < 3 && b.number ? run(`${b.number}${EM_SPACE}`) : ''
    return [{ props: { style: `Heading${b.level}` }, content: number + titleRuns(b.text) }]
  }
}

/** `> Prose`, and a paragraph of an @layout.text block: text with `$…$` maths. */
export class TextConstruct extends Construct<TextBlock> {
  readonly kind = BLOCK_KIND.text

  latex(b: TextBlock): string {
    // (As in a title: a name's subscript, t_avg, and `$…$` as maths.)
    return titleToLatex(b.text)
  }

  docx(b: TextBlock, ctx: Ctx): Item[] {
    return [{ props: baseProps(ctx), content: titleRuns(b.text) }]
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

/** A calculation: its equation (with any working inside function calls above it), or a plot. */
export class CalcConstruct extends Construct<CalcBlock> {
  readonly kind = BLOCK_KIND.calc

  latex(b: CalcBlock, out: LatexOut): string {
    if (b.error) return errorComment(b.line, b.source, b.error)
    if (b.hidden) return ''
    // A plot, as a pgfplots graph, then its fits' equations (if any).
    if (b.plot) return [plotToLatex(b.plot), b.tex ? gather([{ tex: b.tex, note: b.note }], out.share) : ''].filter(Boolean).join('\n')
    // The working inside a function call: indented and a little smaller, above the line.
    const working = b.trace?.length ? ['\\begin{msworking}', gather(b.trace, out.share), '\\end{msworking}'].join('\n') : ''
    return [working, gather([{ tex: b.tex, note: b.note }], out.share)].filter(Boolean).join('\n')
  }

  docx(b: CalcBlock, ctx: Ctx): Item[] {
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
  }

  equation(b: CalcBlock): Equation | null {
    return !b.error && !b.hidden && !b.trace?.length && !b.plot ? { tex: b.tex, note: b.note } : null
  }

  latexItem(b: CalcBlock, out: LatexOut): string {
    if (b.error || b.trace?.length) return this.latex(b, out)
    return `$\\displaystyle ${b.tex}$${b.note ? ` \\hfill ${titleToLatex(b.note)}` : ''}`
  }

  notes(b: CalcBlock): string[] {
    return [b.note, ...(b.trace ?? []).map((t) => t.note)].filter((n): n is string => !!n)
  }
}
