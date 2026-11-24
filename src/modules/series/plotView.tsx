/** A plot in the Rendered tab (plotFigure.ts), drawn in the app's colours: it follows the theme. */
import { useMemo } from 'react'
import { THEME_PALETTE, plotSvg, type PlotData } from './plotGraph.ts'
import './plotView.css'

export function PlotView({ data }: { data: unknown }) {
  const svg = useMemo(() => plotSvg(data as PlotData, THEME_PALETTE), [data])
  return <div className="plot" dangerouslySetInnerHTML={{ __html: svg }} />
}
