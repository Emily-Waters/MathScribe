/**
 * Series as an engine module: series made on one line (`t = [1.52 s, 1.48 s]`,
 * `m = [F / g]`, `t = [0 s:2 s:0.1 s]`, `z = m[2:4]`), shown in a table (`@table(t, x)`), plotted
 * with best-fit lines (`@plot(t, x; fit linear)`), picked by condition
 * (`x[t > 0.2 s]`, where.ts), and shown on a line of their own
 * (`t`). Series themselves (t[1], t[2], …, t.avg) and imported data are the core's; this builds on them through the
 * ModuleHost.
 */
import {
  EngineModule, type Extension, type LineForm, type LineStep, LineFormMember, type Member, type ModuleBlockKind, type ModuleFigureKind, type ModuleGrammar,
} from '../../lib/plugin.ts'
import { PLOT_FIGURE } from './plotFigure.ts'
import { fitMemberTex, fitMessage } from './fitNames.ts'
import { StrayBracketsStep } from './brackets.ts'
import { SERIES_GRAMMAR } from './grammar.ts'
import { TABLE_PREAMBLE, TableConstruct, usesTables } from './tableBlock.ts'
import { SERIES_BLOCK, SERIES_FIGURE, TABLE_CAPTION, type TableData } from './tableData.ts'
import { TableView } from './tableView.tsx'
import { SERIES_CALL } from './syntax.ts'
import { PlotForm } from './plot.ts'
import { SeriesForm, SeriesShownForm, UnpackedSeriesForm } from './series.ts'
import { TableForm } from './table.ts'
import { WhereStep } from './where.ts'
import { ExtremeStep, PICKED_FUNCTIONS, namedPicks, pickedTex } from './extremes.ts'
import { tableMenu } from './tableMenu.ts'
import { memberLabelsExtension } from './memberLabels.ts'
import { SERIES_TOPICS } from './language.ts'
import { math, type ModuleHost, type PlacedTopic } from '../../lib/plugin.ts'
import type { FunctionNode, MathNode } from 'mathjs'

/** The series module's kinds of block (one object, as blockKinds asks). */
const SERIES_BLOCK_KINDS: Readonly<Record<string, ModuleBlockKind>> = {
  [SERIES_BLOCK.table]: {
    construct: new TableConstruct(),
    view: TableView,
    // (A table with a title has a numbered caption: `Table 2: Runs`.)
    caption: (block) => ((block.data as TableData).title === undefined ? undefined : TABLE_CAPTION),
  },
}

/** The series module's kinds of figure (one object, as figureKinds asks). */
const SERIES_FIGURE_KINDS: Readonly<Record<string, ModuleFigureKind>> = { [SERIES_FIGURE.plot]: PLOT_FIGURE }

export class SeriesModule extends EngineModule {
  /** Its topics of the language tree: what's said about its features, with examples the tests check (language.ts). */
  override languageTopics(): readonly PlacedTopic[] {
    return SERIES_TOPICS
  }

  /**
   * The rows of a series where a condition holds, `x[t > 0.2 s]`, read as the series they make (where.ts);
   * the largest or smallest of a series' values, `max(t)`, as the member it is (extremes.ts); and a list's
   * square brackets in a line's maths, said plainly (brackets.ts).
   */
  override readonly lineSteps: readonly LineStep[] = [new WhereStep(), new ExtremeStep(), new StrayBracketsStep()]

  /** The functions `max(t)` and `min(t)` stand for once they've picked their member (extremes.ts). */
  override install(): void {
    math.import(PICKED_FUNCTIONS)
  }

  /** `max(t)` written as it was typed, though it stands for the member it picked. */
  override functionTex(node: FunctionNode): string | undefined {
    return pickedTex(node)
  }

  /** In the working, `max(t)` is the member it picked, t_3, before its value goes in. */
  override namedWorking(node: MathNode, host: ModuleHost): MathNode | undefined {
    return namedPicks(node, host)
  }

  override readonly lineForms: readonly LineForm[] = [new TableForm(), new PlotForm(), new SeriesForm(), new UnpackedSeriesForm(), new SeriesShownForm()]

  /** Its part of a sheet's tree: a call's settings after its `;`, as one token. */
  override grammar(): ModuleGrammar {
    return SERIES_GRAMMAR
  }

  /** A ⚙ after a table or plot in the editor, whose panel edits its settings. */
  override editorExtensions(): readonly Extension[] {
    // (A table's and plot's ⚙, and a series' members' names before its values.)
    return [tableMenu, memberLabelsExtension]
  }

  /** A table, `@table(…)`, as a block of its own (tableBlock.ts). */
  override blockKinds(): Readonly<Record<string, ModuleBlockKind>> {
    return SERIES_BLOCK_KINDS
  }

  /** A plot, `@plot(…)`, as a figure above its line's equations (plotFigure.ts). */
  override figureKinds(): Readonly<Record<string, ModuleFigureKind>> {
    return SERIES_FIGURE_KINDS
  }

  /** A named plot's missing p.slope explained: a plot has one only with a fit (fitNames.ts). */
  override explainMessage(message: string): string | undefined {
    return fitMessage(message)
  }

  /** A named plot's R² and χ² as written by hand, p.r2 → R²_p (fitNames.ts). */
  override memberTex(member: string, ns: string): string | undefined {
    return fitMemberTex(member, ns)
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
    ]
  }
}
