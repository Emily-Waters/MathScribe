/**
 * The largest or smallest of a series' values, `max(t)`, `min(t)`: the member
 * that is, picked by its value, so the line carries that member's own sig figs
 * and uncertainty, and its working says which it is: `\max(t) = t_3 = 1.55 s`.
 * (mathjs's max and min, given values, `max(a, b)`, are as they are.)
 *
 * A step at the `settings` stage, after the core's, so a slice or a condition,
 * `max(x[t > 0.2 s])`, is a series' name by then: each `max(t)` whose only
 * argument is a series is written as the call that stands for the member it
 * picks (PICKED_FUNCTION), `builtin__seriesMax(t__3)`. That gives the member's
 * value, is written as `\max(t)`, and as the member in the working's step of
 * names (EngineModule.namedWorking).
 */
import {
  IS_NAME, LINE_STAGE, type LineInProgress, type LineResult, LineStep, type ModuleHost,
  ROUND_BRACKETS, TOKEN_KIND, isCall, isQuantity, isSymbol, isTuple, larger, lexExpression, lineTokens, parseNumberedName, smaller, symbol,
  symbolTex, transform, typedName, type CallExpr, type Expr, type SymbolExpr, type Value,
} from '../../lib/plugin.ts'
import { PICKED_FUNCTION, SERIES_EXTREME, type SeriesExtreme } from './syntax.ts'

/** Which extreme a function stands for, by its name: builtin__seriesMax → max. */
const EXTREME_OF: ReadonlyMap<string, SeriesExtreme> = new Map(SERIES_EXTREME.words.map((w) => [PICKED_FUNCTION[w], w]))

/** The functions that stand for a picked member, for the maths library: each gives the member's value as it is. */
export const PICKED_FUNCTIONS: Readonly<Record<string, (value: unknown) => unknown>> =
  Object.fromEntries(SERIES_EXTREME.words.map((w) => [PICKED_FUNCTION[w], (value: unknown) => value]))

/** A call standing for a picked member, and the member, `builtin__seriesMax(t__3)`; undefined if it isn't one. */
function picked(node: Expr): { extreme: SeriesExtreme; member: SymbolExpr } | undefined {
  if (!isCall(node)) return undefined
  const extreme = EXTREME_OF.get(node.fn.name)
  const member = node.args[0]
  return extreme && isSymbol(member) ? { extreme, member } : undefined
}

/** `max(t)` as LaTeX, as the call was typed (with the series' name, of the member it picked). */
export function pickedTex(node: CallExpr): string | undefined {
  const call = picked(node)
  const series = call && parseNumberedName(call.member.name)
  return series ? ` \\${call.extreme}\\left(${symbolTex(series.base)}\\right)` : undefined
}

/**
 * An expression with each picked member's call as the member: `\max(t) - \min(t)`
 * as t_3 - t_2 (undefined if there's none). A slice's or a condition's member is
 * the series' own it looks up: max(t[2:3]) is t_3.
 */
export function namedPicks(node: Expr, host: ModuleHost): Expr | undefined {
  let found = false
  const named = transform(node, (n) => {
    const call = picked(n)
    if (!call) return n
    found = true
    const looked = host.lookedUp(call.member.name)
    return looked ? symbol(looked) : call.member
  })
  return found ? named : undefined
}

export class ExtremeStep extends LineStep {
  readonly stage = LINE_STAGE.settings

  run(line: LineInProgress, host: ModuleHost): LineResult | undefined {
    if (!SERIES_EXTREME.words.some((w) => line.text.includes(w))) return undefined
    // Without the spaces, so `max( t )` is a call of one name too.
    const tokens = lineTokens(lexExpression(line.text)).map((l) => l.token)
    const solid = tokens.filter((t) => t.t !== TOKEN_KIND.space)
    let out = ''
    let changed = false
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      const call = this.seriesCall(t, solid, host)
      if (!call) {
        out += t.text
        continue
      }
      const member = pick(call.extreme, call.base, call.rows, host)
      if ('error' in member) return { tex: '', error: member.error }
      out += `${PICKED_FUNCTION[call.extreme]}${ROUND_BRACKETS.open}${member.name}${ROUND_BRACKETS.close}`
      i = tokens.indexOf(call.close)
      changed = true
    }
    if (changed) line.text = out
    return undefined
  }

  /** `max(t)` starting at token `t`, given a series on its own (not the sheet's own max): which, the series, and its `)`. */
  private seriesCall(t: Token, solid: readonly Token[], host: ModuleHost) {
    if (t.t !== TOKEN_KIND.symbol || !SERIES_EXTREME.has(t.text) || host.isUserFunction(t.text)) return undefined
    // The function, its bracket, one name, and its bracket (spaces aside: `max( t )`).
    const at = solid.indexOf(t)
    const [open, arg, close] = solid.slice(at + 1, at + 4)
    if (open?.text !== ROUND_BRACKETS.open || arg?.t !== TOKEN_KIND.symbol || close?.text !== ROUND_BRACKETS.close) return undefined
    if (!IS_NAME.test(arg.text) || host.has(arg.text)) return undefined
    const rows = host.seriesRows(arg.text)
    return rows.size ? { extreme: t.text, base: arg.text, rows, close } : undefined
  }
}

/** A token of a line's expression. */
type Token = ReturnType<typeof lineTokens>[number]['token']

/** The member of a series with the largest (or smallest) value, the first if two share it; or what's wrong. */
function pick(extreme: SeriesExtreme, base: string, rows: Map<number, string>, host: ModuleHost): { name: string } | { error: string } {
  const typed = `${extreme}${ROUND_BRACKETS.open}${typedName(base)}${ROUND_BRACKETS.close}`
  const members = [...rows].sort((a, b) => a[0] - b[0]).map(([, name]) => name)
  const values = members.map((m) => host.value(m))
  if (values.some((v) => (typeof v !== 'number' && !isQuantity(v)) || isTuple(v))) {
    return { error: `${typed} picks one of ${typedName(base)}'s values by size, so they have to be numbers or quantities.` }
  }
  const beats = extreme === SERIES_EXTREME.max ? larger : smaller
  try {
    let best = 0
    values.forEach((v, i) => {
      if (beats(v as Value, values[best] as Value)) best = i
    })
    return { name: members[best] }
  } catch {
    return { error: `${typedName(base)}'s values don't all have the same units, so ${typed} can't compare them.` }
  }
}
