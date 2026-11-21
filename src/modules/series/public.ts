/**
 * The series module's public face: what the rest of MathScribe uses of it (the
 * editor's ⚙ menus for a table's and a plot's settings, the plot drawn in the
 * outputs). Everything else in the module is its own. It only re-exports the
 * module's leaves (its syntax and settings), so importing it doesn't load the engine.
 */
export {
  TABLE_LINES, formatTableSettings, parseTableSettings, splitCallArgs, withSettingsText,
  type TableLines, type TableSettings,
} from './tableSettings.ts'
export {
  LEGEND_POSITION, LEGEND_POSITIONS, PLOT_COLOURS, PLOT_FITS, PLOT_PART, PLOT_PARTS, PLOT_STYLE, PLOT_STYLES, formatPlotSettings, parsePlotSettings,
  partColour, showsLegend,
  type AxisSettings, type LegendPosition, type PlotColour, type PlotFit, type PlotPart, type PlotSettings, type PlotStyle,
} from './plotSettings.ts'
export { CALLS_WITH_SETTINGS, SERIES_CALL, type CallWithSettings } from './syntax.ts'
export { SERIES_BLOCK, tableTex, type TableData } from './tableData.ts'
