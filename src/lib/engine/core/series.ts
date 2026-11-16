/** Series aggregates (`t_avg`, `t_std`, …). */
import { AGGREGATE_KIND, type AggregateKind } from '../../values.ts'
import { SERIES_SUFFIXES } from '../../syntax.ts'
import { parseSeriesStatName } from '../../names.ts'

// ---------------------------------------------------------------------------
// Series aggregates
//
// Given a1, a2, a3 (or a_1, a_2, a_3) and no variable called `a`:
//   a         sum of the series
//   a_avg     mean (also a_mean), ± the standard error σ/√n
//   a_std     sample standard deviation σ (n − 1)
//   a_sem     standard error of the mean, σ/√n
//   a_count   number of values
// ---------------------------------------------------------------------------

/** What a name asks of a series: `t_avg` → t's mean; a name without a suffix, the sum. */
export function parseAggregateName(name: string): { base: string; kind: AggregateKind } {
  const stat = parseSeriesStatName(name)
  return stat ? { base: stat.base, kind: SERIES_SUFFIXES[stat.suffix] } : { base: name, kind: AGGREGATE_KIND.sum }
}

/** Text, escaped to match literally in a regular expression. */
export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
