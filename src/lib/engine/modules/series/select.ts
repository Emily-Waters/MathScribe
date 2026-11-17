/**
 * `a = @select(t, x; t from 0.2 to 0.8)`: the rows of series where every
 * condition holds, as new series under the name a: a.t, a.x, numbered from 1
 * (a.x_1 is the first row that matched). Each value keeps its sig figs and
 * uncertainty (the same source, so a slice and its data stay correlated).
 *
 * Conditions, after the semicolon, all of which must hold:
 *   rows 5-20                 by row number
 *   t from 0.2 to 0.8         a series' values in a range (either end can be left off);
 *                             a bare number is in the series' unit, or give one: 200 ms
 */
import type { Unit } from 'mathjs'
import { IS_NAME, NAME } from '../../../syntax.ts'
import { RESERVED_NAMESPACES, memberName, parseMemberName, readableMembers } from '../../../sheet/names.ts'
import { EXACT } from '../../../maths/sigfigs.ts'
import { SETTING, parseRowRange, settingParts, splitCallArgs } from '../../../tableSettings.ts'
import { splitArgs } from '../../../maths/solve.ts'
import { math } from '../../core/math.ts'
import { LineForm, type FormLine, type ModuleHost } from '../../core/module.ts'
import { readableUnitError, seriesDefinitions, type LineResult } from '../../core/results.ts'
import { symbolTex } from '../../core/tex.ts'
import { SELECT_CALL } from './syntax.ts'

/** A condition on a series' values: `t from 0.2 to 0.8`, `t from 0.2`, `t to 0.8` (1: the series, 2: from, 3: to). */
const SELECT_RANGE = new RegExp(String.raw`^(${NAME})\s+(?:${SETTING.from}\s+(.+?))?\s*(?:\b${SETTING.to}\s+(.+))?$`)

export class SelectForm extends LineForm {
  evaluate(line: FormLine, host: ModuleHost): LineResult | undefined {
    const select = SELECT_CALL.exec(line.text)
    if (!select) return undefined
    const [, name, argsText] = select
    if (RESERVED_NAMESPACES.has(name)) return { tex: '', error: `${name} is a reserved word: choose another name for the selection.` }
    const parts = splitCallArgs(argsText)
    const args = splitArgs(parts.columns).map((a) => a.trim()).filter(Boolean)
    if (!args.length) return { tex: '', error: 'Give the series to select from: a = @select(t, x; t from 0.2 to 0.8).' }
    const notSeries = args.find((a) => !IS_NAME.test(a))
    if (notSeries) return { tex: '', error: `${notSeries} isn't a series name: select takes series, like @select(t, x; …).` }
    const columns = args.map((arg) => ({ arg, rows: host.seriesRows(arg) }))
    const missing = columns.find((c) => !c.rows.size)
    if (missing) return { tex: '', error: `${missing.arg} isn't a series: define ${missing.arg}_1, ${missing.arg}_2, … (or import them) to select from it.` }

    // The conditions.
    const tests: ((n: number) => boolean)[] = []
    const shown: string[] = []
    for (const part of settingParts(parts.settings)) {
      const rows = parseRowRange(part)
      if (rows) {
        const { from, to } = rows
        tests.push((n) => (from === undefined || n >= from) && (to === undefined || n <= to))
        shown.push(`\\text{${SETTING.rows} } ${from ?? 1}\\text{–}${to ?? '\\text{end}'}`)
        continue
      }
      const range = SELECT_RANGE.exec(part)
      if (!range || (!range[2] && !range[3])) {
        return { tex: '', error: `"${readableMembers(part)}" isn't a condition: use t from 0.2 to 0.8 (either end can be left off), or rows 5-20.` }
      }
      // A name is one of the series selected first (t for run1.t), then any series.
      const chosen = columns.find((c) => (parseMemberName(c.arg)?.member ?? c.arg) === range[1])
      const series = chosen?.rows ?? host.seriesRows(range[1])
      if (!series.size) return { tex: '', error: `${range[1]} isn't a series, so it can't choose rows.` }
      const unit = host.split(host.value([...series.values()][0]), EXACT)?.unit
      const bound = (text: string | undefined) => {
        if (text === undefined) return undefined
        let q = host.evaluateExpression(text)
        if (typeof q === 'number' && unit) q = math.unit(q, unit)
        const fits = unit ? math.isUnit(q) && (q as Unit).equalBase(math.unit(unit)) : typeof q === 'number'
        if (!fits) throw new Error(`${text} isn't in units of ${range[1]}${unit ? ` (${unit})` : ' (it has none)'}.`)
        return q
      }
      let lo: unknown
      let hi: unknown
      try {
        lo = bound(range[2])
        hi = bound(range[3])
      } catch (e) {
        return { tex: '', error: readableUnitError((e as Error).message) }
      }
      // Compared as plain numbers, in SI (a Unit's value is held in SI), not through
      // mathjs, which is slow over thousands of rows. (Units were checked above.)
      const si = (q: unknown) => (math.isUnit(q) ? ((q as Unit).value as number) : typeof q === 'number' ? q : NaN)
      const low = lo === undefined ? -Infinity : si(lo)
      const high = hi === undefined ? Infinity : si(hi)
      tests.push((n) => {
        const member = series.get(n)
        if (!member) return false
        const v = si(host.value(member))
        return v >= low && v <= high
      })
      const ends = [lo !== undefined ? `${host.valueTex(lo)} \\le ` : '', symbolTex(chosen?.arg ?? range[1]), hi !== undefined ? ` \\le ${host.valueTex(hi)}` : '']
      shown.push(ends.join(''))
    }

    // The rows every series has, and every condition keeps.
    const all = [...columns[0].rows.keys()].filter((n) => columns.every((c) => c.rows.has(n))).sort((a, b) => a - b)
    const kept = all.filter((n) => tests.every((t) => t(n)))

    // Each series is a lookup into the variables it picks (see Views); a selection
    // of the same name before is replaced (a sheet can redo one).
    host.clearViews(name)
    const names: string[] = []
    for (const c of columns) {
      const short = parseMemberName(c.arg)?.member ?? c.arg
      const base = memberName(name, short)
      names.push(base)
      host.setView(base, kept.map((n) => c.rows.get(n)!))
    }

    const conditions = shown.length ? `\\quad \\left(${shown.join(',\\ ')}\\right)` : ''
    return {
      tex: `${names.map(symbolTex).join(',\\ ')}${conditions}:\\ ${kept.length} \\text{ of } ${all.length} \\text{ rows}`,
      info: kept.length ? undefined : 'No rows match, so the selection is empty.',
      defines: names.flatMap((base) => seriesDefinitions(base, kept.length)),
    }
  }
}
