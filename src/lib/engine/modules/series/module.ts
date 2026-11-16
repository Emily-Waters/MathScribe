/**
 * Series as an engine module: series shown in a table (`table(t, x)`), plotted
 * with best-fit lines (`plot(t, x; fit linear)`), and selected by condition
 * (`a = select(t, x; t from 0.2 to 0.8)`). Series themselves (t_1, t_2, …,
 * t_avg) and imported data are the core's; this builds on them through the
 * ModuleHost.
 */
import { EngineModule, type LineForm } from '../../core/module.ts'
import { PlotForm } from './plot.ts'
import { SelectForm } from './select.ts'
import { TableForm } from './table.ts'

export class SeriesModule extends EngineModule {
  override readonly lineForms: readonly LineForm[] = [new TableForm(), new PlotForm(), new SelectForm()]
}
