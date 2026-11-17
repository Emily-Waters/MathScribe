/**
 * Series as an engine module: series shown in a table (`@table(t, x)`), plotted
 * with best-fit lines (`@plot(t, x; fit linear)`), and selected by condition
 * (`a = @select(t, x; t from 0.2 to 0.8)`). Series themselves (t_1, t_2, …,
 * t_avg) and imported data are the core's; this builds on them through the
 * ModuleHost.
 */
import { EngineModule, type Extension, type LineForm, LineFormMember, type Member, type ModuleGrammar } from '../../lib/plugin.ts'
import { SERIES_GRAMMAR } from './grammar.ts'
import { SERIES_CALL } from './syntax.ts'
import { PlotForm } from './plot.ts'
import { SelectForm } from './select.ts'
import { TableForm } from './table.ts'
import { tableMenu } from './tableMenu.ts'

export class SeriesModule extends EngineModule {
  override readonly lineForms: readonly LineForm[] = [new TableForm(), new PlotForm(), new SelectForm()]

  /** Its part of a sheet's tree: a call's settings after its `;`, as one token. */
  override grammar(): ModuleGrammar {
    return SERIES_GRAMMAR
  }

  /** A ⚙ after a table or plot in the editor, whose panel edits its settings. */
  override editorExtensions(): readonly Extension[] {
    return [tableMenu]
  }

  override builtinMembers(): Member[] {
    return [
      new LineFormMember(SERIES_CALL.table, 't, x, v = x / t',
        'Series side by side, one row per number; name = … works out a column row by row', '@table(t, x, v = x / t)'),
      new LineFormMember(SERIES_CALL.plot, 't, x; fit linear',
        'Graph series against another, with error bars; fit linear adds a best-fit line (p.slope, p.intercept)', 'p = @plot(t, x; fit linear)'),
      new LineFormMember(SERIES_CALL.select, 't, x; t from 0.2 to 0.8',
        'The rows where conditions hold, as new series a.t, a.x numbered from 1', 'a = @select(t, x; t from 0.2 to 0.8)'),
    ]
  }
}
