/**
 * `@plot(t, x, y)`: series plotted against the first one, a point per row
 * (columns as in @table(), so `@plot(t, v = x / t)` works too). Values are
 * converted to one unit per axis; uncertainties become error bars. With `fit
 * linear` in the settings, each series gets a best-fit line, and its slope
 * and intercept (with their uncertainties) become variables: x_slope,
 * x_intercept. The line's text is the fits' equations. `p = @plot(…)` names it:
 * p.t and p.x are the rows it draws, and p.slope its fit's.
 */
import type { Unit } from 'mathjs'
import {
  type Definition, EXACT, FIT, type FormLine, JOIN, linearFit, type LinearFit, LineForm, type LineResult, magnitudeOf,
  math, memberName, type ModuleHost, normalise, parseMemberName, type PlotData, type PlotPoint, type PlotSeries,
  RESERVED_NAMESPACES, seriesDefinitions, splitArgs, SUBSCRIPT, symbolTex,
} from '../../lib/plugin.ts'
import { splitCallArgs } from './tableSettings.ts'
import { PLOT_FIT, parsePlotSettings } from './plotSettings.ts'
import { rowErrors, seriesColumns, type SeriesColumn } from './columns.ts'
import { PLOT_CALL } from './syntax.ts'

/** The digits a fit's R² is shown to, and its reduced χ²'s sig figs. */
const FIT_DIGITS = { r2: 4, chi2: 2 } as const

/** What a series plotted with no name is called where its fit is named: y1, y2, … */
const UNNAMED_SERIES = 'y'

/**
 * A series' best-fit line as an equation, y = (a ± δa) x + (b ± δb), R² = …;
 * and its slope and intercept as variables, with their uncertainties, for
 * later lines to use, named by `target` (p.slope, or y_slope; none if undefined).
 */
function fitTex(
  host: ModuleHost, s: PlotSeries, fit: LinearFit, xName: string | undefined, xUnit: string | undefined, yUnit: string | undefined,
  target: (suffix: string) => string | undefined,
): string {
  // The slope's unit is simplified (m/s, not m/s… as a ratio); the intercept stays in y's unit.
  const slopeQuantity = (v: number, unit: string | undefined) => (unit ? normalise(math.unit(v, unit), false) : v)
  const interceptQuantity = (v: number) => {
    if (!yUnit) return v
    const u = math.unit(v, yUnit)
    u.fixPrefix = true
    return u
  }
  const slopeUnit = yUnit && xUnit ? `(${yUnit}) / (${xUnit})` : yUnit ?? (xUnit ? `(${xUnit})^-1` : undefined)
  const parts = [
    { value: slopeQuantity(fit.slope, slopeUnit), unc: slopeQuantity(fit.slopeUnc, slopeUnit), suffix: FIT.slope },
    { value: interceptQuantity(fit.intercept), unc: interceptQuantity(fit.interceptUnc), suffix: FIT.intercept },
  ].map((p) => {
    const sf = host.uncertainParts(p.value, p.unc)?.sf ?? EXACT
    // Each is a measured result: its uncertainty is a source of its own.
    const to = target(p.suffix)
    if (to) host.store(to, { value: p.value, sf, contributions: new Map([[host.newSource(), p.unc]]) })
    return host.valueTex(p.value, sf, fit.slopeUnc || fit.interceptUnc ? p.unc : undefined)
  })
  const y = symbolTex(s.name ?? UNNAMED_SERIES)
  const x = xName ? symbolTex(xName) : 'x'
  // The slope in brackets with its unit, so the unit doesn't run into x: [(0.50 ± 0.01) m/s] t.
  const line = `${y} = \\left(${parts[0]}\\right) ${x} + ${parts[1]}`
  const r2 = `R^{2} = ${fit.r2.toFixed(FIT_DIGITS.r2)}`
  if (!fit.weighted) return `${line},\\quad ${r2}`
  // A weighted fit says so, with its reduced χ² (how well the line matches the
  // error bars), on a line of its own under the equation so it isn't too wide.
  const chi2 = fit.chi2 !== undefined ? `,\\quad \\chi^{2}_{\\nu} = ${Number(fit.chi2.toPrecision(FIT_DIGITS.chi2))}` : ''
  return `${line} \\\\ ${r2}${chi2}\\quad \\text{(weighted by }\\delta ${symbolTex(s.name ?? UNNAMED_SERIES)}\\text{)}`
}

export class PlotForm extends LineForm {
  override readonly assignsNamespace = true
  evaluate(line: FormLine, host: ModuleHost): LineResult | undefined {
    const call = PLOT_CALL.exec(line.text)
    if (!call) return undefined
    const [, plotName, argsText] = call
    if (plotName && RESERVED_NAMESPACES.has(plotName)) return { tex: '', error: `${plotName} is a reserved word: choose another name for the plot.` }
    // A plot named again forgets what it held (p.slope from a fit since taken off).
    if (plotName) {
      host.clearViews(plotName)
      const prefix = memberName(plotName, '')
      for (const old of [...host.names()]) if (old.startsWith(prefix)) host.forget(old)
    }
    const parts = splitCallArgs(argsText)
    const { settings, error: settingsError } = parsePlotSettings(parts.settings)
    if (settingsError) return { tex: '', error: settingsError }
    const args = splitArgs(parts.columns).map((a) => a.trim()).filter(Boolean)
    if (args.length < 2) return { tex: '', error: 'Give the x series, then what to plot against it: @plot(t, x), or @plot(t, x, y).' }
    const made = seriesColumns(host, args, 'plot it')
    if ('error' in made) return { tex: '', error: made.error }
    const { columns, errors, hidden } = made
    const [xColumn, ...yColumns] = columns
    const inRange = (n: number) => (settings.from === undefined || n >= settings.from) && (settings.to === undefined || n <= settings.to)
    const onAxis = (v: number, a: { from?: number; to?: number }) => (a.from === undefined || v >= a.from) && (a.to === undefined || v <= a.to)

    // Each axis's unit (its first value's), and every value (and uncertainty) as a number in it.
    const unitOf = (c: SeriesColumn) => host.split(host.value([...c.rows.values()][0]), EXACT)?.unit
    // Each unit's size in SI, worked out once: a value in it is then its SI value
    // over that, rather than a mathjs conversion for each of thousands of points.
    // (A unit with an offset, like degC, is converted by mathjs.)
    const scales = new Map<string, { one: Unit; scale?: number }>()
    const scaleOf = (unit: string) => {
      let s = scales.get(unit)
      if (!s) {
        const one = math.unit(1, unit)
        scales.set(unit, s = { one, scale: one.units.some((p) => p.unit.offset) ? undefined : (one.value as number) })
      }
      return s
    }
    const numbers = (name: string, unit: string | undefined): { v: number; d?: number } => {
      const value = host.value(name)
      const contributions = host.variable(name)?.contributions
      let sumSq = 0
      if (contributions) for (const c of contributions.values()) sumSq += magnitudeOf(c) ** 2
      if (!math.isUnit(value)) {
        if (unit) throw new Error('no unit') // (caught: the series don't share a unit)
        return { v: Number(value), d: Math.sqrt(sumSq) || undefined }
      }
      const u = value as Unit
      const s = scaleOf(unit ?? '')
      if (!u.equalBase(s.one)) throw new Error('units differ') // (caught: the series don't share a unit)
      if (s.scale === undefined) return { v: u.toNumber(unit ?? ''), d: Math.sqrt(sumSq) / ((s.one.value as number) || 1) || undefined }
      return { v: (u.value as number) / s.scale, d: Math.sqrt(sumSq) / s.scale || undefined }
    }
    const xUnit = unitOf(xColumn)
    const yUnit = unitOf(yColumns[0])
    const series: PlotSeries[] = []
    try {
      for (const c of yColumns) {
        const points: PlotPoint[] = []
        for (const [n, yName] of c.rows) {
          const xName = xColumn.rows.get(n)
          if (!xName || !inRange(n)) continue
          const x = numbers(xName, xUnit)
          const y = numbers(yName, yUnit)
          // An axis's range is what's on the plot: a point outside it isn't drawn,
          // fitted, or kept in a named plot's series.
          if (!onAxis(x.v, settings.x) || !onAxis(y.v, settings.y)) continue
          points.push({ n, x: x.v, y: y.v, dx: x.d, dy: y.d })
        }
        series.push({ name: c.name, expr: c.expr, points })
      }
    } catch {
      for (const name of hidden) host.forget(name)
      return { tex: '', error: 'The series plotted against x have different units, so they can\'t share the y axis: plot them separately.' }
    }
    for (const name of hidden) host.forget(name)

    // A named plot holds the series it plots, p.t and p.x: the rows it draws, numbered from 1.
    const defines: Definition[] = []
    if (plotName) {
      const drawn = [...new Set(series.flatMap((s) => s.points.map((p) => p.n)))].sort((a, b) => a - b)
      const named = columns.filter((c) => c.name)
      const shorts = named.map((c) => parseMemberName(c.name!)?.member ?? c.name!)
      named.forEach((c, i) => {
        // Two with the same name (run1.x, run2.x) keep their namespaces apart: p.run1_x, p.run2_x.
        const clash = shorts.filter((s) => s === shorts[i]).length > 1
        const base = memberName(plotName, clash ? c.name!.replace(JOIN, SUBSCRIPT) : shorts[i])
        // A lookup into the variables drawn, not a copy (see Views).
        const picked = drawn.map((n) => c.rows.get(n))
        host.setView(base, picked)
        defines.push(...seriesDefinitions(base, picked.length))
      })
    }

    // Best-fit lines, and their slopes and intercepts as variables.
    const fits: string[] = []
    if (settings.fit === PLOT_FIT.linear) {
      for (const [i, s] of series.entries()) {
        const fit = linearFit(s.points)
        if (!fit) {
          errors.push(`A line needs two or more points with different x values${s.name ? ` (${s.name})` : ''}.`)
          continue
        }
        s.fit = fit
        // Where the fit's numbers go: p.slope for a named plot (p.x_slope when it
        // has several series); x_slope for an unnamed plot's named series.
        const own = parseMemberName(s.name ?? '')?.member ?? s.name ?? `${UNNAMED_SERIES}${i + 1}`
        const target = (suffix: string) => (plotName
          ? memberName(plotName, series.length === 1 ? suffix : `${own}${SUBSCRIPT}${suffix}`)
          : s.name ? `${s.name}${SUBSCRIPT}${suffix}` : undefined)
        fits.push(fitTex(host, s, fit, xColumn.name, xUnit, yUnit, target))
        for (const [suffix, v] of [[FIT.r2, fit.r2], [FIT.chi2, fit.chi2]] as const) {
          const to = plotName && v !== undefined ? target(suffix) : undefined
          if (to) host.store(to, { value: v, sf: EXACT })
        }
        if (plotName) {
          for (const suffix of [FIT.slope, FIT.intercept, FIT.r2, ...(fit.chi2 !== undefined ? [FIT.chi2] : [])]) defines.push({ name: target(suffix)! })
        }
      }
    }

    const points = series.reduce((sum, s) => sum + s.points.length, 0)
    const plot: PlotData = {
      x: { name: xColumn.name, expr: xColumn.expr, unit: xUnit },
      // One series names the y axis; several share it, named in the legend.
      y: series.length === 1 ? { name: series[0].name, expr: series[0].expr, unit: yUnit } : { unit: yUnit },
      series,
      settings,
    }
    return {
      // (A weighted fit is two rows already, so it's gathered even on its own.)
      tex: fits.length > 1 || fits[0]?.includes('\\\\') ? `\\begin{gathered}${fits.join(' \\\\ ')}\\end{gathered}` : fits[0] ?? '',
      plot,
      error: rowErrors(errors, (n) => `${n} more`),
      info: points ? undefined : 'Nothing to plot: no row has both an x and a y value.',
      defines: defines.length ? defines : undefined,
    }
  }
}
