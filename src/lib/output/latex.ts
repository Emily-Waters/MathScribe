/**
 * The LaTeX export: the whole sheet as a compilable `.tex` document, laid out
 * like the Rendered tab (equations flush left with notes on the right, compact
 * spacing, function working indented under its line, blocks as cards), with
 * options for the page and the look.
 */
import { STORAGE_KEYS } from '../../config.ts'
import { flowing, isOmitted } from '../sheet/blocks.ts'
import { moduleFigureKind, modulePreamble } from '../engine/index.ts'
import { BLOCK_KIND, isContainer, type Block } from '../sheet/blocks.ts'
import { ALIGN } from './alignment.ts'
import { readStoredJson, writeStoredJson } from '../data/storage.ts'
import { escapeTex, fitMacroDefinition, gather, noteMacroDefinition, type Equation } from './latexKit.ts'
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

/** The share of the line's width blocks have outside columns: all of it. */
const FULL_WIDTH = 1

/** LaTeX for a list of blocks, leaving out hidden ones, with equations in a row gathered together. */
function joinBlocks(blocks: Block[], o: LatexOptions, share: number): string {
  const out: string[] = []
  let run: Equation[] = []
  const flush = () => {
    if (run.length) out.push(gather(run, share))
    run = []
  }
  // (A block that only sets how its lines are shown doesn't interrupt a run either: its lines are in it.)
  for (const b of flowing(blocks)) {
    const eq = constructOf(b).equation(b)
    if (eq) {
      run.push(eq)
      continue
    }
    // A hidden line doesn't interrupt a run of equations; a gap (spacer) does.
    if (b.kind !== BLOCK_KIND.spacer && isOmitted(b)) continue
    flush()
    const tex = blockToLatex(b, o, share)
    if (tex) out.push(tex)
  }
  flush()
  return out.join('\n\n')
}

/** What a construct asks of the export, for the blocks inside it (with `share` of the line's width). */
const writer = (o: LatexOptions, share = FULL_WIDTH): LatexOut => ({
  o,
  share,
  within: (part) => writer(o, share * part),
  block: (b) => blockToLatex(b, o, share),
  join: (blocks) => joinBlocks(blocks, o, share),
  item: (b) => constructOf(b).latexItem(b, writer(o, share)),
})

/** One block as LaTeX, as its construct writes it. */
const blockToLatex = (b: Block, o: LatexOptions, share = FULL_WIDTH): string => constructOf(b).latex(b, writer(o, share))

/** What the figures shown, at any depth, need in the preamble (a plot: pgfplots), each kind's once. */
function figurePreamble(blocks: Block[]): string[] {
  const types = new Set<string>()
  const visit = (bs: Block[]) => bs.forEach((b) => {
    if (b.kind === BLOCK_KIND.calc && b.figure && !b.hidden) types.add(b.figure.type)
    else if (isContainer(b)) visit(b.children)
  })
  visit(blocks)
  return [...types].flatMap((type) => [...(moduleFigureKind(type)?.preamble ?? [])])
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

/** The document's preamble: its class, packages and settings, from the Document options. */
function preamble(o: LatexOptions, figures: readonly string[] = [], modules: readonly string[] = []): string[] {
  const left = o.align === ALIGN.left
  return [
    `\\documentclass[${[o.fontSize, o.paper, ...(left ? ['fleqn'] : [])].join(',')}]{article}`,
    `\\usepackage[margin=${MARGIN_CM[o.margins]}cm]{geometry}`,
    '\\usepackage{amsmath, amssymb}',
    // (What the figures need: a plot, pgfplots.)
    ...figures,
    // (What the modules' notation needs: chemistry's formulas, mhchem.)
    ...modules,
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
    ...fitMacroDefinition(left),
    ...noteMacroDefinition(left),
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
  const body = joinBlocks(blocks, options, FULL_WIDTH)
  return [
    '% Made with MathScribe',
    ...preamble(options, figurePreamble(blocks), modulePreamble(body)),
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
