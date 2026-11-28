/**
 * `@plot(t, x, y)`: series plotted against the first one, a point per row
 * (columns as in @table(), so `@plot(t, v = x / t)` works too). Values are
 * converted to one unit per axis; uncertainties become error bars. With `fit
 * linear` in the settings, each series gets a best-fit line, and its slope
 * and intercept (with their uncertainties) become variables: x.slope,
 * x.intercept. The line's text is the fits' equations. `p = @plot(…)` names it:
 * p.t and p.x are the rows it draws, and p.slope its fit's. Datasets with x
 * values of their own each go in brackets, `@plot((t1, x1), (t2, x2))` (see
 * `plotDatasets`), sharing the axes. A function of the
 * sheet's, by its name (`@plot(L, T, T_model)`, with `T_model(L) = …`), is a
 * curve across the x axis beside the data: see `curvePoints`.
 */
import {
  baseMagnitude, type Definition, EXACT, fixPrefix, type FormLine, IS_NAME, isDimensionless, isQuantity, JOIN, LineForm, type LineResult,
  magnitude, magnitudeOf, memberName, type ModuleHost, normalise, parseMemberName, quantity, type Quantity, sameDimension, unitParts,
  parseSliceName, RESERVED_NAMESPACES, whereOf, seriesDefinitions, splitArgs, SUBSCRIPT, symbolTex,
} from '../../lib/plugin.ts'
import { linearFit, plotScales, type LinearFit, type PlotData, type PlotName, type PlotPoint, type PlotSeries } from './plotGraph.ts'
import { SERIES_FIGURE } from './tableData.ts'
import { splitCallArgs } from './tableSettings.ts'
import { PLOT_FIT, parsePlotSettings } from './plotSettings.ts'
import { rowErrors, seriesColumns, type SeriesColumn } from './columns.ts'
import { FIT, PLOT_CALL } from './syntax.ts'

/** The digits a fit's R² is shown to, and its reduced χ²'s sig figs. */
const FIT_DIGITS = { r2: 4, chi2: 2 } as const

/** What a series plotted with no name is called where its fit is named: y1, y2, … */
const UNNAMED_SERIES = 'y'

/** How many pieces a function's curve is drawn in, across the x axis: enough to look smooth. */
const CURVE_PIECES = 200

/** A dataset of a plot, as written: its x, and what's plotted against it. */
interface DatasetArgs {
  x: string
  ys: string[]
}

/** The brackets around a dataset of its own, `(t2, x2)`. */
const DATASET = { open: '(', close: ')' } as const

/** A dataset written in brackets, `(t2, x2)`, as its parts (x first); null if it's anything else, `(x / t)` too. */
function bracketedDataset(arg: string): string[] | null {
  if (!arg.startsWith(DATASET.open) || !arg.endsWith(DATASET.close)) return null
  // (Its first bracket closes at its end: not `(a + b) / (c + d)`.)
  let depth = 0
  for (let i = 0; i < arg.length - 1; i++) {
    if (arg[i] === DATASET.open) depth++
    else if (arg[i] === DATASET.close && --depth === 0) return null
  }
  const parts = splitArgs(arg.slice(1, -1)).map((a) => a.trim()).filter(Boolean)
  return parts.length >= 2 ? parts : null
}

/**
 * A plot's datasets, from its arguments: `@plot(t, x, y)` is one (x and y
 * against t); a dataset in brackets, `(t2, x2)`, is one with an x of its own,
 * and what follows it, up to the next, goes with it: `@plot((t1, x1), (t2, x2, y2))`.
 */
function plotDatasets(args: string[]): DatasetArgs[] | { error: string } {
  const sets: DatasetArgs[] = []
  for (const arg of args) {
    const bracketed = bracketedDataset(arg)
    const last = sets.at(-1)
    if (bracketed) sets.push({ x: bracketed[0], ys: bracketed.slice(1) })
    else if (last) last.ys.push(arg)
    else sets.push({ x: arg, ys: [] })
  }
  if (!sets.length || sets.some((s) => !s.ys.length)) {
    return {
      error: 'Give the x series, then what to plot against it: @plot(t, x), or @plot(t, x, y); or datasets with '
        + 'their own x, each in brackets: @plot((t1, x1), (t2, x2)).',
    }
  }
  return sets
}

/** Something wrong with a curve, said as the plot's error. */
class CurveError extends Error {}

/**
 * A function's curve: its value at points evenly spread from `from` to `to`
 * (evenly on a log scale, if x is one), each x in x's unit and each value
 * turned into a number in y's by `toY` (which throws if the units differ).
 * A point the function can't be worked out at is left out; if none can be,
 * it's a CurveError, saying why.
 */
function curvePoints(
  fn: (x: unknown) => unknown, name: string, from: number, to: number, log: boolean, xUnit: string | undefined,
  toY: (value: unknown) => number,
): PlotPoint[] {
  const points: PlotPoint[] = []
  let failure: string | undefined
  for (let k = 0; k <= CURVE_PIECES; k++) {
    const x = log ? from * (to / from) ** (k / CURVE_PIECES) : from + (to - from) * (k / CURVE_PIECES)
    let value: unknown
    try {
      value = fn(xUnit ? quantity(x, xUnit) : x)
    } catch (e) {
      failure ??= e instanceof Error ? e.message : String(e)
      continue
    }
    const y = toY(value)
    if (Number.isFinite(y)) points.push({ n: k, x, y })
  }
  if (!points.length && failure) throw new CurveError(`${name} couldn't be worked out across the x axis: ${failure}`)
  return points
}

/**
 * A series' best-fit line as an equation, y = (a ± δa) x + (b ± δb), R² = …;
 * and its slope and intercept as variables, with their uncertainties, for
 * later lines to use, named by `target` (p.slope, or y.slope; none if undefined).
 * Its y and x are shown as the plot shows them: by their display names, if they have them.
 */
function fitTex(
  host: ModuleHost, s: PlotSeries, fit: LinearFit, xOf: PlotName | undefined, xUnit: string | undefined, yUnit: string | undefined,
  target: (suffix: string) => string | undefined,
): string {
  // The slope's unit is y's over x's, as the series give them (N/m, not kg/s², for N against m),
  // unless they cancel (m against mm: a number); the intercept stays in y's unit.
  const slopeQuantity = (v: number, unit: string | undefined) => {
    if (!unit) return v
    const u = quantity(v, unit)
    if (isDimensionless(u)) return normalise(u, false)
    fixPrefix(u)
    return u
  }
  const interceptQuantity = (v: number) => {
    if (!yUnit) return v
    const u = quantity(v, yUnit)
    fixPrefix(u)
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
  const y = s.label?.tex ?? symbolTex(s.name ?? UNNAMED_SERIES)
  const x = xOf?.label?.tex ?? (xOf?.name ? symbolTex(xOf.name) : 'x')
  // The slope in brackets with its unit, so the unit doesn't run into x: [(0.50 ± 0.01) m/s] t.
  const line = `${y} = \\left(${parts[0]}\\right) ${x} + ${parts[1]}`
  const r2 = `R^{2} = ${fit.r2.toFixed(FIT_DIGITS.r2)}`
  if (!fit.weighted) return `${line},\\quad ${r2}`
  // A weighted fit says so, with its reduced χ² (how well the line matches the
  // error bars), on a line of its own under the equation so it isn't too wide.
  const chi2 = fit.chi2 !== undefined ? `,\\quad \\chi^{2}_{\\nu} = ${Number(fit.chi2.toPrecision(FIT_DIGITS.chi2))}` : ''
  // (By δy, and by δx too where the points had x uncertainties: see linearFit.)
  const by = fit.xWeighted ? `\\delta ${y}\\text{ and }\\delta ${x}` : `\\delta ${y}`
  return `${line} \\\\ ${r2}${chi2}\\quad \\text{(weighted by }${by}\\text{)}`
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
    const found = plotDatasets(splitArgs(parts.columns).map((a) => a.trim()).filter(Boolean))
    if ('error' in found) return { tex: '', error: found.error }
    // A function of the sheet's, by its name, is a curve; everything else a series (or a column worked out from them).
    const isCurve = (arg: string) => IS_NAME.test(arg) && host.isUserFunction(arg) && !host.seriesRows(arg).size
    const curveX = found.find((d) => isCurve(d.x))?.x
    if (curveX) {
      return { tex: '', error: `${curveX} is a function: give the x series first, and the function after it, @plot(t, x, ${curveX}).` }
    }
    // Every dataset's series, worked out together (so the columns worked out row by row keep apart).
    const made = seriesColumns(host, found.flatMap((d) => [d.x, ...d.ys.filter((a) => !isCurve(a))]), 'plot it')
    if ('error' in made) return { tex: '', error: made.error }
    const { columns, errors, hidden } = made
    // Each dataset: its x column, and what's plotted against it, in order (a series, or a function's curve).
    let nextColumn = 0
    const datasets = found.map((d) => ({
      x: columns[nextColumn++],
      plotted: d.ys.map((a) => (isCurve(a) ? { curve: a } : { column: columns[nextColumn++] })),
    }))
    const xColumns = datasets.map((d) => d.x)
    const yColumns = datasets.flatMap((d) => d.plotted.flatMap((p) => (p.column ? [p.column] : [])))
    const inRange = (n: number) => (settings.from === undefined || n >= settings.from) && (settings.to === undefined || n <= settings.to)
    const onAxis = (v: number, a: { from?: number; to?: number }) => (a.from === undefined || v >= a.from) && (a.to === undefined || v <= a.to)

    // Each axis's unit (its first value's), and every value (and uncertainty) as a number in it.
    const unitOf = (c: SeriesColumn) => host.split(host.value([...c.rows.values()][0]), EXACT)?.unit
    // Each unit's size in SI, worked out once: a value in it is then its SI value
    // over that, rather than a conversion by the maths library for each of thousands of points.
    // (A unit with an offset, like degC, is converted by the library.)
    const scales = new Map<string, { one: Quantity; scale?: number }>()
    const scaleOf = (unit: string) => {
      let s = scales.get(unit)
      if (!s) {
        const one = quantity(1, unit)
        scales.set(unit, s = { one, scale: unitParts(one).some((p) => p.offset) ? undefined : (baseMagnitude(one) as number) })
      }
      return s
    }
    const numbers = (name: string, unit: string | undefined): { v: number; d?: number } => {
      const value = host.value(name)
      const contributions = host.variable(name)?.contributions
      let sumSq = 0
      if (contributions) for (const c of contributions.values()) sumSq += magnitudeOf(c) ** 2
      if (!isQuantity(value)) {
        if (unit) throw new Error('no unit') // (caught: the series don't share a unit)
        return { v: Number(value), d: Math.sqrt(sumSq) || undefined }
      }
      const u = value
      const s = scaleOf(unit ?? '')
      if (!sameDimension(u, s.one)) throw new Error('units differ') // (caught: the series don't share a unit)
      if (s.scale === undefined) return { v: magnitude(u, unit ?? ''), d: Math.sqrt(sumSq) / ((baseMagnitude(s.one) as number) || 1) || undefined }
      return { v: (baseMagnitude(u) as number) / s.scale, d: Math.sqrt(sumSq) / s.scale || undefined }
    }
    // A function's value as a number in y's unit (as `numbers` does a variable's).
    const inUnit = (value: unknown, unit: string | undefined): number => {
      if (!isQuantity(value)) {
        if (unit) throw new Error('no unit') // (caught: the series don't share a unit)
        return Number(value)
      }
      if (!unit) throw new Error('units differ')
      const u = value
      const s = scaleOf(unit)
      if (!sameDimension(u, s.one)) throw new Error('units differ') // (caught: the series don't share a unit)
      return s.scale === undefined ? magnitude(u, unit) : (baseMagnitude(u) as number) / s.scale
    }
    // The function each curve draws (as the sheet defines it).
    const functionOf = (name: string) => host.evaluateExpression(name) as (x: unknown) => unknown
    // x's unit: the first dataset's x's (every other x is converted to it).
    const xUnit = unitOf(xColumns[0])
    // y's unit: the first series', or with only functions, the first one's value's at the first x.
    const firstX = [...xColumns[0].rows.values()][0]
    const firstCurve = datasets.flatMap((d) => d.plotted).find((p) => p.curve)?.curve
    let yUnit: string | undefined
    try {
      yUnit = yColumns.length
        ? unitOf(yColumns[0])
        : host.split(functionOf(firstCurve!)(host.value(firstX)), EXACT)?.unit
    } catch (e) {
      for (const name of hidden) host.forget(name)
      return { tex: '', error: `${firstCurve} couldn't be worked out at ${xColumns[0].name ?? 'x'}'s first value: ${e instanceof Error ? e.message : e}` }
    }
    // The series drawn, each dataset's in turn, in the order they're given; and each one's x (for its fit's equation).
    const series: PlotSeries[] = []
    const xOf = new Map<PlotSeries, SeriesColumn>()
    // Each column of data's series.
    const seriesOf = new Map<SeriesColumn, PlotSeries>()
    try {
      // Each series of data: a point for each row it and its dataset's x both have.
      for (const { x: xColumn, plotted } of datasets) {
        for (const { column: c } of plotted) {
          if (!c) continue
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
          const s: PlotSeries = { name: c.name, expr: c.expr, label: c.label, points }
          seriesOf.set(c, s)
          xOf.set(s, xColumn)
        }
      }

      // The curves, across the x axis: as wide as the data make it (or the settings' range), or with
      // no data plotted, from the x's least value to its greatest.
      const dataSoFar = [...seriesOf.values()]
      let from = NaN
      let to = NaN
      if (firstCurve) {
        if (dataSoFar.some((s) => s.points.length)) {
          ({ from, to } = plotScales({ x: { unit: xUnit }, y: { unit: yUnit }, series: dataSoFar, settings }).x)
        } else {
          // (On a log axis, only above 0, as its scale would be.)
          const fits = (v: number | undefined) => (v !== undefined && (!settings.x.log || v > 0) ? v : undefined)
          const xs = xColumns.flatMap((c) => [...c.rows].filter(([n]) => inRange(n)).map(([, name]) => numbers(name, xUnit).v))
            .filter((v) => fits(v) !== undefined)
          from = fits(settings.x.from) ?? Math.min(...xs)
          to = fits(settings.x.to) ?? Math.max(...xs)
        }
      }
      for (const { plotted } of datasets) {
        for (const p of plotted) {
          if (p.column) {
            series.push(seriesOf.get(p.column)!)
            continue
          }
          const name = p.curve
          const toY = (v: unknown) => {
            try {
              return inUnit(v, yUnit)
            } catch {
              const own = host.split(v, EXACT)?.unit
              throw new CurveError(`${name}'s values are in ${own ?? 'plain numbers'}, but the y axis is in `
                + `${yUnit ?? 'plain numbers'}: a curve shares the y axis with the data, so its units must convert.`)
            }
          }
          const points = Number.isFinite(from) && Number.isFinite(to)
            ? curvePoints(functionOf(name), name, from, to, settings.x.log, xUnit, toY)
            : []
          series.push({ name, points: points.filter((pt) => onAxis(pt.y, settings.y)), curve: true })
        }
      }
    } catch (e) {
      for (const name of hidden) host.forget(name)
      if (e instanceof CurveError) return { tex: '', error: e.message }
      return {
        tex: '',
        error: datasets.length > 1
          ? 'The datasets have different units, so they can\'t share the axes: each x must convert to the first x\'s unit, and each y to the first y\'s.'
          : 'The series plotted against x have different units, so they can\'t share the y axis: plot them separately.',
      }
    }
    for (const name of hidden) host.forget(name)

    // The series of data: not the curves, which have no rows, and no fit.
    const data = series.filter((s) => !s.curve)

    // A named plot holds the series it plots, p.t and p.x: the rows it draws (in its dataset), numbered from 1.
    const defines: Definition[] = []
    if (plotName) {
      const drawnIn = datasets.map((d) => [...new Set(d.plotted.flatMap((p) =>
        (p.column ? seriesOf.get(p.column)!.points.map((pt) => pt.n) : [])))].sort((a, b) => a - b))
      const named = datasets.flatMap((d, i) => [d.x, ...d.plotted.flatMap((p) => (p.column ? [p.column] : []))]
        .filter((c) => c.name).map((c) => ({ c, drawn: drawnIn[i] })))
      // (A series in two datasets, the same x for both, is held once.)
      const once = named.filter((n, i) => named.findIndex((m) => m.c.name === n.c.name) === i)
      // (A slice's or condition's rows, x[2:4] or x[t > 0.2 s], are named for their series: p.x.)
      const plain = once.map(({ c }) => parseSliceName(c.name!)?.of ?? whereOf(c.name!) ?? c.name!)
      const shorts = plain.map((name) => parseMemberName(name)?.member ?? name)
      once.forEach(({ c, drawn }, i) => {
        // Two with the same name (run1.x, run2.x) keep their namespaces apart: p.run1_x, p.run2_x.
        const clash = shorts.filter((s) => s === shorts[i]).length > 1
        const base = memberName(plotName, clash ? plain[i].replace(JOIN, SUBSCRIPT) : shorts[i])
        // A lookup into the variables drawn, not a copy (see Views).
        const picked = drawn.map((n) => c.rows.get(n))
        host.setView(base, picked)
        defines.push(...seriesDefinitions(base, picked.length))
      })
    }

    // Best-fit lines, and their slopes and intercepts as variables.
    const fits: string[] = []
    if (settings.fit === PLOT_FIT.linear) {
      // What each series' fit is named by: its own name (x in run1.x), or the whole of it if two share one (run1_x).
      const owns = data.map((s, i) => parseMemberName(s.name ?? '')?.member ?? s.name ?? `${UNNAMED_SERIES}${i + 1}`)
      for (const [i, s] of data.entries()) {
        const fit = linearFit(s.points)
        if (!fit) {
          errors.push(`A line needs two or more points with different x values${s.name ? ` (${s.name})` : ''}.`)
          continue
        }
        s.fit = fit
        // Where the fit's numbers go: p.slope for a named plot (p.x.slope when it
        // has several series); x.slope for an unnamed plot's named series.
        const own = owns.filter((o) => o === owns[i]).length > 1 && s.name ? s.name.replace(JOIN, SUBSCRIPT) : owns[i]
        const target = (suffix: string) => (plotName
          ? memberName(plotName, data.length === 1 ? suffix : memberName(own, suffix))
          : s.name ? memberName(s.name, suffix) : undefined)
        fits.push(fitTex(host, s, fit, xOf.get(s), xUnit, yUnit, target))
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
      // The x axis is named for its x, if every dataset has the same one; otherwise just its unit.
      x: xColumns.every((c) => c.name === xColumns[0].name && c.expr === xColumns[0].expr)
        ? { name: xColumns[0].name, expr: xColumns[0].expr, label: xColumns[0].label, unit: xUnit }
        : { unit: xUnit },
      // One series names the y axis; several share it, named in the legend.
      y: series.length === 1 ? { name: series[0].name, expr: series[0].expr, label: series[0].label, unit: yUnit } : { unit: yUnit },
      series,
      settings,
    }
    // (A weighted fit is two rows already, so it's gathered even on its own. With `equation off`, none is shown.)
    const shown = settings.equation ? fits : []
    return {
      tex: shown.length > 1 || shown[0]?.includes('\\\\') ? `\\begin{gathered}${shown.join(' \\\\ ')}\\end{gathered}` : shown[0] ?? '',
      figure: { type: SERIES_FIGURE.plot, data: plot },
      error: rowErrors(errors, (n) => `${n} more`),
      info: points ? undefined : 'Nothing to plot: no row has both an x and a y value.',
      defines: defines.length ? defines : undefined,
    }
  }
}
