/**
 * Series as an engine module: series made on one line (`t = @series(1.52 s, 1.48 s)`,
 * `m = @series(F / g)`), shown in a table (`@table(t, x)`), plotted
 * with best-fit lines (`@plot(t, x; fit linear)`), and selected by condition
 * (`a = @select(t, x; t from 0.2 to 0.8)`). Series themselves (t_1, t_2, …,
 * t_avg) and imported data are the core's; this builds on them through the
 * ModuleHost.
 */
import {
  CAPTION_KIND, EngineModule, type Extension, type LineForm, LineFormMember, type Member, type ModuleBlockKind, type ModuleGrammar, type SettingsDescription,
} from '../../lib/plugin.ts'
import { SERIES_GRAMMAR } from './grammar.ts'
import { TABLE_PREAMBLE, TableConstruct, usesTables } from './tableBlock.ts'
import { SERIES_BLOCK, type TableData } from './tableData.ts'
import { TableView } from './tableView.tsx'
import { SERIES_CALL } from './syntax.ts'
import { PlotForm } from './plot.ts'
import { SelectForm } from './select.ts'
import { SeriesForm } from './series.ts'
import { TableForm } from './table.ts'
import { tableMenu } from './tableMenu.ts'
import { memberLabelsExtension } from './memberLabels.ts'
import { TABLE_SETTINGS } from './tableSettings.ts'
import { PLOT_SETTINGS } from './plotSettings.ts'
import { SERIES_TOPICS } from './language.ts'
import type { PlacedTopic } from '../../lib/plugin.ts'

/** The series module's kinds of block (one object, as blockKinds asks). */
const SERIES_BLOCK_KINDS: Readonly<Record<string, ModuleBlockKind>> = {
  [SERIES_BLOCK.table]: {
    construct: new TableConstruct(),
    view: TableView,
    // (A table with a title has a numbered caption: `Table 2: Runs`.)
    caption: (block) => ((block.data as TableData).title === undefined ? undefined : CAPTION_KIND.table),
  },
}

export class SeriesModule extends EngineModule {
  /** Its topics of the language tree: what's said about its features, with examples the tests check (language.ts). */
  override languageTopics(): readonly PlacedTopic[] {
    return SERIES_TOPICS
  }

  override readonly lineForms: readonly LineForm[] = [new TableForm(), new PlotForm(), new SelectForm(), new SeriesForm()]

  /** Its part of a sheet's tree: a call's settings after its `;`, as one token. */
  override grammar(): ModuleGrammar {
    return SERIES_GRAMMAR
  }

  /** A ⚙ after a table or plot in the editor, whose panel edits its settings. */
  override editorExtensions(): readonly Extension[] {
    // (A table's and plot's ⚙, and a series' members' names before its values.)
    return [tableMenu, memberLabelsExtension]
  }

  /** A table's and a plot's settings, described for the reference and the AI primer. */
  override settingsDescriptions(): readonly SettingsDescription[] {
    return [TABLE_SETTINGS.describe(), PLOT_SETTINGS.describe()]
  }

  /** A table, `@table(…)`, as a block of its own (tableBlock.ts). */
  override blockKinds(): Readonly<Record<string, ModuleBlockKind>> {
    return SERIES_BLOCK_KINDS
  }

  /** What a document with a table in it needs: tabularx, float and caption. */
  override latexPreamble(tex: string): string[] {
    return usesTables(tex) ? [...TABLE_PREAMBLE] : []
  }

  override builtinMembers(): Member[] {
    return [
      new LineFormMember(SERIES_CALL.table, 't, x, v = x / t',
        'Series side by side, one row per number; name = … works out a column row by row', '@table(t, x, v = x / t)'),
      new LineFormMember(SERIES_CALL.plot, 't, x; fit linear',
        'Graph series against another, with error bars; fit linear adds a best-fit line (p.slope, p.intercept)', 'p = @plot(t, x; fit linear)'),
      new LineFormMember(SERIES_CALL.select, 't, x; t from 0.2 to 0.8',
        'The rows where conditions hold, as new series a.t, a.x numbered from 1', 'a = @select(t, x; t from 0.2 to 0.8)'),
      new LineFormMember(SERIES_CALL.series, 'F / g; rows 5-20',
        'A series on one line: its values listed (t_1, t_2, …), or worked out row by row from other series', 'm = @series(F / g)'),
    ]
  }
}
