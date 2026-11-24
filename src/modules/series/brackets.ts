/**
 * Square brackets left in a line's maths once its members are read (`t[2]` is
 * t__2 by then): a list, `x = 2 * [1, 2]`, which only a series' own line can
 * be (series.ts). Said plainly, at the `check` stage, rather than left to
 * mathjs, which would read it as a matrix.
 */
import { LINE_STAGE, type LineInProgress, type LineResult, LineStep, MEMBER_INDEX, TOKEN_KIND, lexExpression, lineTokens } from '../../lib/plugin.ts'

/** What's said of a list in a line's maths. */
const LIST_IN_MATHS = 'Square brackets make a series, on a line that names it: t = [1.0 s, 2.0 s]. '
  + 'In a formula, use one of its values, t[2], or a statistic of them, t.avg.'

/** Whether a line's maths has square brackets left in it once its members are read: a list. */
const hasBracketList = (text: string): boolean =>
  text.includes(MEMBER_INDEX.open)
  && lineTokens(lexExpression(text)).some((l) => l.token.t === TOKEN_KIND.delimiter && l.token.text === MEMBER_INDEX.open)

export class StrayBracketsStep extends LineStep {
  readonly stage = LINE_STAGE.check

  run(line: LineInProgress): LineResult | undefined {
    return hasBracketList(line.text) ? { tex: '', error: LIST_IN_MATHS } : undefined
  }
}
