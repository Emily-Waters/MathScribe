/**
 * Helpers for tests: evaluate a sheet, find a line's result, and turn the
 * engine's LaTeX into short readable text, so a test can say
 * `expect(value('F = 2.00 kg * 9.81 m/s^2')).toBe('19.6 N')`.
 */
import { evaluateSheet, type Sheet } from '../lib/sheet/document.ts'
import { BLOCK_KIND, isContainer, type Block, type CalcBlock } from '../lib/sheet/blocks.ts'
import { moduleBlockKind, type CalcOptions } from '../lib/engine/index.ts'
import { SERIES_BLOCK, SERIES_FIGURE, tableTex, type PlotData, type TableData } from '../modules/series/public.ts'
import { EXAMPLE_CALC_OPTIONS } from '../config.ts'
import { CONSTANTS_TITLE } from '../lib/reading/readers.ts'
import { FORMULA_TITLE } from '../modules/formula/public.ts'

/** The cards whose entries are lines of their own: constants, and formulas. */
const LINE_CARDS: ReadonlySet<string> = new Set([CONSTANTS_TITLE, FORMULA_TITLE])

/** The settings tests evaluate with. */
export const OPTIONS: CalcOptions = EXAMPLE_CALC_OPTIONS

/** One shown line of a sheet: a calculation, or a `@constants` entry. */
export interface Line {
  line: number
  source: string
  tex: string
  error?: string
  warning?: string
  info?: string
  hidden?: boolean
  trace?: { tex: string }[]
  /** A @plot() line's graph (its figure's data). */
  plot?: PlotData
}

/** A calculation as a Line: a plot's figure as its `plot`. */
const lineOf = (b: CalcBlock): Line =>
  (b.figure?.type === SERIES_FIGURE.plot ? { ...b, plot: b.figure.data as PlotData } : b)

/** A sheet, evaluated. */
export function sheet(source: string, options: Partial<CalcOptions> = {}): Sheet {
  return evaluateSheet(source, { ...OPTIONS, ...options })
}

/**
 * Every calculation, constant and formula (an `@constants` or `@formula` card's entry) in the sheet, in
 * order, from inside blocks too; and every line a module shows as a block of its
 * own: a table, with its `array` as its LaTeX (another, any equation it is).
 */
export function lines(source: string, options: Partial<CalcOptions> = {}): Line[] {
  const out: Line[] = []
  const visit = (b: Block) => {
    if (b.kind === BLOCK_KIND.calc) out.push(lineOf(b))
    else if (b.kind === BLOCK_KIND.custom && b.source !== undefined) {
      const { line, source: text, error, warning, info, hidden } = b
      const tex = b.type === SERIES_BLOCK.table ? tableTex(b.data as TableData) : moduleBlockKind(b.type)?.construct.equation(b)?.tex ?? ''
      out.push({ line, source: text, tex, error, warning, info, hidden })
    } else if (b.kind === BLOCK_KIND.card && LINE_CARDS.has(b.title)) out.push(...b.entries)
    else if (isContainer(b)) b.children.forEach(visit)
  }
  sheet(source, options).blocks.forEach(visit)
  return out
}

/** The line on source line `n` (1-based). */
export function lineAt(source: string, n: number, options: Partial<CalcOptions> = {}): Line {
  const found = lines(source, options).find((l) => l.line === n)
  if (!found) throw new Error(`No calculation on line ${n}`)
  return found
}

/** The last line of the sheet (the one under test). */
export function last(source: string, options: Partial<CalcOptions> = {}): Line {
  return lines(source, options).at(-1)!
}

/**
 * Engine LaTeX as readable text: `19.6\,\mathrm{N}` → `19.6 N`,
 * `6.03 \times 10^{-18}` → `6.03e-18`, `\left(2.0 \pm 0.1\right)` → `(2.0 ± 0.1)`.
 */
export function readable(tex: string): string {
  return tex
    .replace(/\\begin\{aligned\}|\\end\{aligned\}/g, '')
    .replace(/\s*\\\\\s*/g, ' ')
    .replace(/&/g, '')
    .replace(/\\text\{\\AA\}/g, 'Å')
    // A formula as typed: \ce{Ca^2+} → Ca^2+.
    .replace(/\\ce\{([^{}]*)\}/g, '$1')
    .replace(/\\mathrm\{([^{}]*)\}/g, '$1')
    .replace(/\s*\\times\s*10\^\{(-?\d+)\}/g, 'e$1')
    .replace(/\^\{\\circ\}/g, '°')
    .replace(/\\left\(|\\right\)/g, (m) => (m === '\\left(' ? '(' : ')'))
    // Brackets by nesting: [ ] as they are, and { } as ❴ ❵ (plain braces are taken out below).
    .replace(/\\left\[|\\right\]/g, (m) => (m === '\\left[' ? '[' : ']'))
    .replace(/\\left\\\{|\\right\\\}/g, (m) => (m === '\\left\\{' ? '❴' : '❵'))
    .replace(/\\left\\langle\s*|\\right\\rangle/g, (m) => (m.startsWith('\\left') ? '⟨' : '⟩'))
    .replace(/\\hat\{\\imath\}/g, 'î').replace(/\\hat\{\\jmath\}/g, 'ĵ').replace(/\\hat\{k\}/g, 'k̂')
    .replace(/\\pm/g, '±')
    .replace(/\\approx/g, '≈')
    .replace(/\\cdot/g, '·')
    .replace(/\\%/g, '%')
    .replace(/\\,/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The final result of a line: what follows its last `=` or `≈`, readable. */
export function resultOf(tex: string): string {
  const parts = readable(tex).split(/ = | ≈ /)
  return parts[parts.length - 1]
}

/** The result of the last line of `source`. */
export function value(source: string, options: Partial<CalcOptions> = {}): string {
  return resultOf(last(source, options).tex)
}

/** The whole last line, readable. */
export function shown(source: string, options: Partial<CalcOptions> = {}): string {
  return readable(last(source, options).tex)
}
