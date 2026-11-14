/**
 * The LaTeX export: the whole sheet as a compilable `.tex` document, laid out
 * like the Rendered tab (equations flush left with notes on the right, compact
 * spacing, function working indented under its line, blocks as cards), with
 * options for the page and the look.
 */
import { STORAGE_KEYS } from '../config.ts'
import { TITLE_SEGMENT, isOmitted, listItems, splitInlineMath, titleSegments } from './document.ts'
import { BLOCK_KIND, isContainer, type Block } from './blocks.ts'
import { ALIGN } from './alignment.ts'
import { usesFormulas } from './chemistry.ts'
import { LAYOUT_STYLE, LINE_COMMAND, builtinOpenerText } from './syntax.ts'
import { symbolTex, unitTex } from './engine.ts'
import type { PlotData, PlotName } from './plot.ts'
import { readStoredJson, writeStoredJson } from './storage.ts'

/** The Document options: how an exported document (LaTeX or Word) looks. */
export interface LatexOptions {
  /** Equations flush left (like the Rendered tab), or centered (LaTeX's usual). */
  align: typeof ALIGN.left | typeof ALIGN.center
  fontSize: '10pt' | '11pt' | '12pt'
  paper: 'a4paper' | 'letterpaper'
  margins: 'narrow' | 'normal' | 'wide'
  /** Tighter space around equations, and paragraphs spaced instead of indented. */
  compact: boolean
  /** Blocks, functions and constants as cards with a bar on the left (mdframed). */
  cards: boolean
  /** Number sections 1, 1.1, … as the Rendered tab does. */
  numberSections: boolean
  /** An optional title block. */
  title: string
  author: string
  /** Today's date under the title. */
  date: boolean
}

/** The Document options until they’re changed. */
export const DEFAULT_LATEX_OPTIONS: LatexOptions = {
  align: ALIGN.left,
  fontSize: '11pt',
  paper: 'a4paper',
  margins: 'normal',
  compact: true,
  cards: true,
  numberSections: true,
  title: '',
  author: '',
  date: true,
}

/** Page margins, in cm (the Word export uses them too). */
export const MARGIN_CM: Record<LatexOptions['margins'], number> = { narrow: 1.5, normal: 2.5, wide: 3.5 }

/** The Document options set last time in this browser (any missing ones at their defaults). */
export function loadLatexOptions(): LatexOptions {
  return { ...DEFAULT_LATEX_OPTIONS, ...readStoredJson<Partial<LatexOptions>>(STORAGE_KEYS.latexOptions) }
}

/** Remember the Document options (if storage is blocked, they last until reload). */
export function saveLatexOptions(options: LatexOptions): void {
  writeStoredJson(STORAGE_KEYS.latexOptions, options)
}

// ---------------------------------------------------------------------------
// Text and equations
// ---------------------------------------------------------------------------

/** Text, with the characters LaTeX treats specially escaped. */
const escapeTex = (s: string) =>
  s.replace(/[\\{}#%&_^~$]/g, (c) =>
    c === '\\' ? '\\textbackslash{}' : c === '^' ? '\\^{}' : c === '~' ? '\\~{}' : `\\${c}`)

/** A heading or block title in LaTeX: `2p_z` → 2p\textsubscript{z}. */
function titleToLatex(text: string): string {
  return titleSegments(text).map((s) => (s.kind === TITLE_SEGMENT.math
    ? `$${s.value}$`
    : s.kind === TITLE_SEGMENT.sub ? `\\textsubscript{${escapeTex(s.value)}}` : escapeTex(s.value))).join('')
}

/** Title and note of a block, as one heading. */
const heading = (title: string, note?: string) =>
  [title, note && escapeTex(note)].filter(Boolean).join(' --- ')

/** An equation to display, with its note (set at the right margin). */
interface Equation {
  tex: string
  note?: string
}

/**
 * Equations in a row, as one `gather*`: they sit as close together as in the
 * Rendered tab (separate displays would each get a paragraph's spacing), each
 * with its note on the right.
 */
function gather(eqs: Equation[]): string {
  const rows = eqs.map((e) => `  ${e.tex}${e.note ? ` \\tag*{${escapeTex(e.note)}}` : ''}`)
  return ['\\begin{gather*}', rows.join(' \\\\\n'), '\\end{gather*}'].join('\n')
}

/** A line that's just an equation, so it can join the equations around it. */
function simpleEquation(b: Block): Equation | null {
  if (b.kind === BLOCK_KIND.calc && !b.error && !b.hidden && !b.trace?.length && !b.plot) return { tex: b.tex, note: b.note }
  if (b.kind === BLOCK_KIND.latex) return { tex: b.latex }
  return null
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/** A block with a title: a card (with cards on), else a paragraph heading and an indented body. */
function titled(o: LatexOptions, title: string, body: string): string {
  if (o.cards) {
    return [`\\begin{mdframed}[style=msblock${title ? `, frametitle={${title}}` : ''}]`, body, '\\end{mdframed}'].join('\n')
  }
  return [title ? `\\paragraph{${title}}` : '', '\\begin{quote}', body, '\\end{quote}'].filter(Boolean).join('\n')
}

/** LaTeX for a list of blocks, leaving out hidden ones, with equations in a row gathered together. */
function joinBlocks(blocks: Block[], o: LatexOptions): string {
  const out: string[] = []
  let run: Equation[] = []
  const flush = () => {
    if (run.length) out.push(gather(run))
    run = []
  }
  for (const b of blocks) {
    const eq = simpleEquation(b)
    if (eq) {
      run.push(eq)
      continue
    }
    // A hidden line doesn't interrupt a run of equations; a gap (spacer) does.
    if (b.kind !== BLOCK_KIND.spacer && isOmitted(b)) continue
    flush()
    const tex = blockToLatex(b, o)
    if (tex) out.push(tex)
  }
  flush()
  return out.join('\n\n')
}

/** A line with an error, as a LaTeX comment (so it doesn’t stop the document compiling). */
const errorComment = (line: number, what: string, error: string) => `% Line ${line}: ${what}\n% Error: ${error}`

/** One block as LaTeX. */
function blockToLatex(b: Block, o: LatexOptions): string {
  switch (b.kind) {
    case BLOCK_KIND.heading: {
      const text = titleToLatex(b.text)
      const star = o.numberSections ? '' : '*'
      if (b.level === 1) return `\\section${star}{${text}}`
      if (b.level === 2) return `\\subsection${star}{${text}}`
      return `\\noindent\\textbf{${text}}`
    }
    case BLOCK_KIND.spacer:
      return '\\vspace{\\baselineskip}'
    case BLOCK_KIND.import:
      // Imported data only defines variables; it isn't part of the document.
      return ''
    case BLOCK_KIND.constants: {
      if (b.hidden && !b.error && !b.entries.some((e) => e.error)) return ''
      const shown = b.entries.filter((e) => !e.error)
      const errors = b.entries.filter((e) => e.error).map((e) => errorComment(e.line, e.source, e.error!))
      return titled(o, heading('Constants', b.note), [...errors, ...(shown.length ? [gather(shown)] : [])].join('\n'))
    }
    case BLOCK_KIND.text:
      return splitInlineMath(b.text)
        .map((seg) => (seg.math ? `$${seg.value}$` : escapeTex(seg.value)))
        .join('')
    case BLOCK_KIND.latex:
      return gather([{ tex: b.latex }])
    case BLOCK_KIND.calc: {
      if (b.error) return errorComment(b.line, b.source, b.error)
      if (b.hidden) return ''
      // A plot, as a pgfplots graph, then its fits' equations (if any).
      if (b.plot) return [plotToLatex(b.plot), b.tex ? gather([{ tex: b.tex, note: b.note }]) : ''].filter(Boolean).join('\n')
      // The working inside a function call: indented and a little smaller, above the line.
      const working = b.trace?.length ? ['\\begin{msworking}', gather(b.trace), '\\end{msworking}'].join('\n') : ''
      return [working, gather([{ tex: b.tex, note: b.note }])].filter(Boolean).join('\n')
    }
    case BLOCK_KIND.function: {
      if (b.error) return errorComment(b.line, `function ${b.name}`, b.error)
      if (b.hidden) return ''
      return titled(o, heading(`Function $${b.signature}$`, b.note), gather(b.body))
    }
    case BLOCK_KIND.layout: {
      if (b.error && !b.children.length) return errorComment(b.line, builtinOpenerText(b.style ?? LAYOUT_STYLE.list, b.title), b.error)
      if (b.command === LINE_COMMAND.hide) return ''
      const title = heading(b.title && titleToLatex(b.title), b.note)
      // A text block: its paragraphs, under the title.
      if (b.style === LAYOUT_STYLE.text) {
        return [title ? `\\paragraph{${title}}` : '', joinBlocks(b.children, o)].filter(Boolean).join('\n')
      }
      const env = b.style === LAYOUT_STYLE.center ? 'center' : b.style === LAYOUT_STYLE.list ? 'itemize' : b.style === LAYOUT_STYLE.numbered ? 'enumerate' : 'quote'
      const body = env === 'itemize' || env === 'enumerate'
        ? listItems(b.children).map(({ item, subs }) =>
          [`\\item ${itemLatex(item, o)}`, ...subs.map((s) => blockToLatex(s, o))].filter(Boolean).join('\n')).join('\n')
        : joinBlocks(b.children, o)
      return [
        title ? `\\paragraph{${title}}` : '',
        `\\begin{${env}}`,
        body,
        `\\end{${env}}`,
      ].filter(Boolean).join('\n')
    }
    case BLOCK_KIND.group: {
      if (b.command === LINE_COMMAND.hide) return ''
      return titled(o, heading(b.title && titleToLatex(b.title), b.note), joinBlocks(b.children, o))
    }
  }
}

/** A block as the content of `\item`: inline display maths, so it sits beside the marker. */
function itemLatex(b: Block, o: LatexOptions): string {
  if (b.kind === BLOCK_KIND.calc && !b.error && !b.trace?.length) {
    return `$\\displaystyle ${b.tex}$${b.note ? ` \\hfill ${escapeTex(b.note)}` : ''}`
  }
  if (b.kind === BLOCK_KIND.latex) return `$\\displaystyle ${b.latex}$`
  return blockToLatex(b, o)
}

// ---------------------------------------------------------------------------
// Plots (pgfplots)
// ---------------------------------------------------------------------------

/** Each series' colour, in order (xcolor names, as pgfplots loads xcolor). */
const PLOT_COLOURS = ['blue', 'orange', 'teal', 'violet', 'brown', 'cyan']

/** A number for pgfplots: plain, without float noise. */
const plotNumber = (v: number) => String(Number(v.toPrecision(10)))

/** An axis's or series' name and unit as LaTeX: `$t\,[\mathrm{s}]$`. */
function plotLabel(p: PlotName & { unit?: string }): string {
  const name = p.name ? symbolTex(p.name) : p.expr ? `\\text{${escapeTex(p.expr)}}` : ''
  const unit = p.unit ? `\\left[${unitTex(p.unit)}\\right]` : ''
  return `$${[name, unit].filter(Boolean).join('\\,')}$`
}

/**
 * A plot as a pgfplots graph: its points (with error bars for uncertainties),
 * lines between them if its style says so, and its fits as dashed lines.
 */
function plotToLatex(plot: PlotData): string {
  const { settings } = plot
  const xs = plot.series.flatMap((s) => s.points.map((p) => p.x))
  const options = [
    'width=0.8\\linewidth', 'height=0.5\\linewidth', 'grid=major',
    `xlabel={${plotLabel(plot.x)}}`, `ylabel={${plotLabel(plot.y)}}`,
    ...(settings.title ? [`title={${escapeTex(settings.title)}}`] : []),
    ...(settings.x.log ? ['xmode=log'] : []),
    ...(settings.y.log ? ['ymode=log'] : []),
    ...(settings.x.from !== undefined ? [`xmin=${settings.x.from}`] : []),
    ...(settings.x.to !== undefined ? [`xmax=${settings.x.to}`] : []),
    ...(settings.y.from !== undefined ? [`ymin=${settings.y.from}`] : []),
    ...(settings.y.to !== undefined ? [`ymax=${settings.y.to}`] : []),
    ...(plot.series.length > 1 ? ['legend pos=north west'] : []),
  ]
  const lines = ['\\begin{center}', '\\begin{tikzpicture}', `\\begin{axis}[${options.join(', ')}]`]
  plot.series.forEach((s, i) => {
    const colour = PLOT_COLOURS[i % PLOT_COLOURS.length]
    const errors = s.points.some((p) => p.dx || p.dy)
    const style = [
      `color=${colour}`,
      settings.style === 'lines' ? 'no markers' : 'mark=*',
      ...(settings.style === 'points' ? ['only marks'] : []),
      ...(errors ? ['error bars/.cd', 'x dir=both', 'x explicit', 'y dir=both', 'y explicit'] : []),
    ]
    const coordinates = [...s.points].sort((a, b) => a.x - b.x).map((p) => `(${plotNumber(p.x)}, ${plotNumber(p.y)})`
      + (errors ? ` +- (${plotNumber(p.dx ?? 0)}, ${plotNumber(p.dy ?? 0)})` : ''))
    lines.push(`\\addplot[${style.join(', ')}] coordinates {${coordinates.join(' ')}};`)
    if (plot.series.length > 1) lines.push(`\\addlegendentry{${plotLabel(s)}}`)
    if (s.fit && xs.length) {
      const domain = `${plotNumber(Math.min(...xs))}:${plotNumber(Math.max(...xs))}`
      lines.push(`\\addplot[color=${colour}, dashed, no markers, domain=${domain}, samples=${settings.x.log ? 50 : 2}, forget plot] {${plotNumber(s.fit.slope)}*x + ${plotNumber(s.fit.intercept)}};`)
    }
  })
  lines.push('\\end{axis}', '\\end{tikzpicture}', '\\end{center}')
  return lines.join('\n')
}

/** Whether any block, at any depth, is a plot (so the preamble loads pgfplots). */
const hasPlot = (blocks: Block[]): boolean => blocks.some((b) =>
  (b.kind === BLOCK_KIND.calc && !!b.plot && !b.hidden) || (isContainer(b) && hasPlot(b.children)))

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

/** The document's preamble: its class, packages and settings, from the Document options. */
function preamble(o: LatexOptions, plots = false, formulas = false): string[] {
  const left = o.align === ALIGN.left
  return [
    `\\documentclass[${[o.fontSize, o.paper, ...(left ? ['fleqn'] : [])].join(',')}]{article}`,
    `\\usepackage[margin=${MARGIN_CM[o.margins]}cm]{geometry}`,
    '\\usepackage{amsmath, amssymb}',
    ...(plots ? ['% Plots.', '\\usepackage{pgfplots}', '\\pgfplotsset{compat=1.18}'] : []),
    ...(formulas ? ['% Chemical formulas, \\ce{…}.', '\\usepackage[version=4]{mhchem}'] : []),
    '% Long runs of equations may break across pages.',
    '\\allowdisplaybreaks',
    ...(o.compact ? [
      '\\usepackage{parskip}',
      '\\usepackage{etoolbox}',
      '% Less space around equations (re-applied whenever the font size changes).',
      '\\newcommand{\\compactdisplays}{%',
      '  \\setlength{\\abovedisplayskip}{4pt plus 2pt}%',
      '  \\setlength{\\belowdisplayskip}{4pt plus 2pt}%',
      '  \\setlength{\\abovedisplayshortskip}{0pt plus 2pt}%',
      '  \\setlength{\\belowdisplayshortskip}{4pt plus 2pt}}',
      '\\appto{\\normalsize}{\\compactdisplays}',
      '\\appto{\\small}{\\compactdisplays}',
      '\\compactdisplays',
    ] : []),
    ...(left ? ['\\setlength{\\mathindent}{1em}'] : []),
    ...(o.cards ? [
      // xcolor before mdframed: mdframed only loads `color`, which doesn't know gray!50.
      '\\usepackage{xcolor}',
      '\\usepackage{mdframed}',
      '% Blocks, functions and constants: a card with a bar on the left, as in MathScribe.',
      '\\mdfdefinestyle{msblock}{linewidth=2pt, linecolor=gray!50, topline=false, rightline=false,',
      '  bottomline=false, leftmargin=0pt, rightmargin=0pt, innerleftmargin=10pt, innerrightmargin=0pt,',
      '  innertopmargin=4pt, innerbottommargin=6pt, skipabove=10pt, skipbelow=10pt,',
      '  frametitlefont=\\bfseries, frametitleaboveskip=4pt, frametitlebelowskip=0pt}',
    ] : []),
    '% The working inside a function call: indented and a little smaller.',
    left
      ? '\\newenvironment{msworking}{\\par\\small\\addtolength{\\mathindent}{1.5em}}{\\par}'
      : '\\newenvironment{msworking}{\\par\\small}{\\par}',
    ...(o.title.trim() ? [
      '',
      `\\title{${escapeTex(o.title.trim())}}`,
      `\\author{${escapeTex(o.author.trim())}}`,
      `\\date{${o.date ? '\\today' : ''}}`,
    ] : []),
  ]
}

/** Full, compilable LaTeX source for the sheet. */
export function toLatexDocument(blocks: Block[], options: LatexOptions = DEFAULT_LATEX_OPTIONS): string {
  const body = joinBlocks(blocks, options)
  return [
    '% Made with MathScribe',
    ...preamble(options, hasPlot(blocks), usesFormulas(body)),
    '',
    '\\begin{document}',
    ...(options.title.trim() ? ['\\maketitle'] : []),
    '',
    body,
    '',
    '\\end{document}',
    '',
  ].join('\n')
}
