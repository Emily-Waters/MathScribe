/** Series statistics (`t.avg`, `t.std`, …), as their names are read. */
import type { AggregateKind } from '../../sheet/values.ts'
import { SERIES_SUFFIXES } from '../../syntax.ts'
import { parseSeriesStatName } from '../../sheet/names.ts'

// ---------------------------------------------------------------------------
// Series aggregates
//
// Given a series a (a[1], a[2], a[3], as a__1, a__2, a__3):
//   a.sum     sum of the series
//   a.avg     mean, ± the standard error σ/√n
//   a.std     sample standard deviation σ (n − 1)
//   a.sem     standard error of the mean, σ/√n
//   a.count   number of values
// ---------------------------------------------------------------------------

/** What a name asks of a series: `t.avg` (t__avg) → t's mean (null if it asks nothing of one). */
export function parseAggregateName(name: string): { base: string; kind: AggregateKind } | null {
  const stat = parseSeriesStatName(name)
  return stat ? { base: stat.base, kind: SERIES_SUFFIXES[stat.suffix] } : null
}
