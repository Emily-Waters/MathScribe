/**
 * A plot as the series module's kind of figure (ModuleFigureKind): drawn above
 * its `@plot(…)` line's equations, a fit's, in the Rendered tab (plotView.tsx,
 * in the app's colours), as a pgfplots graph in LaTeX (plotLatex.ts), and as a
 * picture in Word (in print colours).
 */
import type { ModuleFigureKind } from '../../lib/plugin.ts'
import { PLOT_SIZE, PRINT_PALETTE, plotSvg, type PlotData } from './plotGraph.ts'
import { PLOT_PREAMBLE, plotToLatex } from './plotLatex.ts'
import { PlotView } from './plotView.tsx'

/** A plot, in each output. */
export const PLOT_FIGURE: ModuleFigureKind = {
  view: PlotView,
  latex: (data) => plotToLatex(data as PlotData),
  preamble: PLOT_PREAMBLE,
  picture: (data) => ({ svg: plotSvg(data as PlotData, PRINT_PALETTE), ...PLOT_SIZE, background: PRINT_PALETTE.background }),
}
