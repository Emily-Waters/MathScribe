/**
 * The LaTeX export: the whole sheet as a compilable `.tex` document, laid out
 * like the Rendered tab (equations flush left with notes on the right, compact
 * spacing, function working indented under its line, blocks as cards), with
 * options for the page and the look.
 */
import { STORAGE_KEYS } from '../config.ts'
import { isOmitted } from './document.ts'
import { BLOCK_KIND, isContainer, type Block } from './blocks.ts'
import { ALIGN } from './alignment.ts'
import { usesFormulas } from './chemistry.ts'
import { readStoredJson, writeStoredJson } from './storage.ts'
import { escapeTex, gather, type Equation } from './latexKit.ts'
import { constructOf, type LatexOut } from './constructs/index.ts'

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
// Blocks: each kind's construct writes it (constructs/); this joins them up
// ---------------------------------------------------------------------------

/** LaTeX for a list of blocks, leaving out hidden ones, with equations in a row gathered together. */
function joinBlocks(blocks: Block[], o: LatexOptions): string {
  const out: string[] = []
  let run: Equation[] = []
  const flush = () => {
    if (run.length) out.push(gather(run))
    run = []
  }
  for (const b of blocks) {
    const eq = constructOf(b).equation(b)
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

/** What a construct asks of the export, for the blocks inside it. */
const writer = (o: LatexOptions): LatexOut => ({
  o,
  block: (b) => blockToLatex(b, o),
  join: (blocks) => joinBlocks(blocks, o),
  item: (b) => constructOf(b).latexItem(b, writer(o)),
})

/** One block as LaTeX, as its construct writes it. */
const blockToLatex = (b: Block, o: LatexOptions): string => constructOf(b).latex(b, writer(o))

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
