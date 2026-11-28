/**
 * The sum or mean of values listed in a formula, without naming them as a
 * series first: `x = [1, 2, 3, 4, 5].sum`, `[1.52 s, 1.48 s].avg`. Written with
 * the sum sign over the values as typed, then added up:
 * `\sum[1, 2, 3, 4, 5] = 1 + 2 + 3 + 4 + 5 = 15`.
 *
 * One value that uses series is a rule, worked out row by row as `m = [F / g]`
 * is, then added up: `[(t - t.avg)^2].sum` is written `\sum_{i=1}^{n} (t_i - \bar{t})^2`.
 *
 * A step at the `settings` stage, after the core's, as `max(t)`'s is (so a
 * slice, a member and a statistic are names by then, t__2, t__avg): each list
 * followed by `.sum` or `.avg` is written as the call that stands for it
 * (LIST_STAT_FUNCTION) around its values added up,
 * `builtin__listSum((1) + (2) + (3))`, a mean's divided by how many, so units,
 * sig figs (the addition rule) and uncertainty are the core's, as a sum
 * written out would have them. A rule's call has its text first, for the
 * LaTeX: `builtin__listSum("t_i * 2", (t__1 * 2) + (t__2 * 2))`. The call
 * gives the sum; it's written as `\sum[…]` (listStatTex), and as the sum itself
 * in the working's step of names (namedListStats). A mean's uncertainty is its
 * values' carried through, not the standard error a named series' `t.avg` has.
 */
import {
  LINE_STAGE, type LineInProgress, type LineResult, LineStep, MEMBER_DOT, MEMBER_INDEX, OP, ROUND_BRACKETS, SEPARATOR, SLICE_COLON,
  SERIES_STAT_SUFFIX, TOKEN_KIND, closesBracket, constant, isCall, isConstant, isOp, isOperator, isParen, lexExpression, lineTokens,
  NODE_KIND, SETTING_MARK, SUBSCRIPT, lineShape, operator, paren, parseSliceName, symbolsIn, transform, typedName, whereOf,
  type ModuleHost, closingIndex, splitWithin,
  type CallExpr, type Expr,
} from '../../lib/plugin.ts'
import { LIST_STAT_FUNCTION, SPREAD, type ListStat } from './syntax.ts'
import { seriesUsedIn, sharedRows, withRowValues } from './columns.ts'
import { ROW_INDEX } from './series.ts'

/** Which statistic a function stands for, by its name: builtin__listSum → sum. */
const STAT_OF: ReadonlyMap<string, ListStat> = new Map(
  (Object.keys(LIST_STAT_FUNCTION) as ListStat[]).map((s) => [LIST_STAT_FUNCTION[s], s]))

/** The functions that stand for a list's sum or mean, for the maths library: each gives the sum inside it (after a rule's text, if it has one). */
export const LIST_STAT_FUNCTIONS: Readonly<Record<string, (value: unknown) => unknown>> =
  Object.fromEntries([...STAT_OF.keys()].map((f) => [f, (...args: unknown[]) => args.at(-1)]))

/** Most rows a rule's working writes out, (t₁ − t̄)² + (t₂ − t̄)² + …: more, with their values, wouldn't fit on a page's line. */
const ROWS_WRITTEN_OUT = 3

/** Between a list's values as LaTeX, as a series line shows them. */
const LIST_SEPARATOR_TEX = ',\\ '

/** A token of a line's expression. */
type Token = ReturnType<typeof lineTokens>[number]['token']

const isDelimiter = (t: Token | undefined, text: string) => t?.t === TOKEN_KIND.delimiter && t.text === text

/** Tokens after which `[` is a member's number (t[2], f(x)[1], t[2:3][1]), not a list's. */
const isIndexed = (t: Token | undefined) =>
  t !== undefined && (t.t === TOKEN_KIND.symbol || t.t === TOKEN_KIND.number || (t.t === TOKEN_KIND.delimiter && closesBracket(t.text)))

/**
 * A function's parameters, if the line defines one: `f(x, y:m) = …` → x, y. In its
 * definition they're not series, whatever the sheet has of the same name; given
 * one when it's called, the body is worked out again with each its series.
 */
function parametersOf(text: string): ReadonlySet<string> {
  const { target } = lineShape(text)
  if (target?.kind !== NODE_KIND.functionHead) return new Set()
  return new Set((target.entries ?? []).map((e) => e.split(SETTING_MARK)[0].trim()))
}

/**
 * Text with each list followed by `.sum` or `.avg` written as the call that
 * stands for it (lists in its values too); the text as it was if it has none.
 * (`params`: a function's being defined, which aren't series here: parametersOf.)
 */
export function writeListStats(text: string, host: ModuleHost, params: ReadonlySet<string> = new Set()): string | { error: string } {
  // (A function's body, worked out for a call: its rules are lists again, over the series it's given now.)
  if (!params.size) text = definedRulesAsLists(text)
  if (!text.includes(MEMBER_INDEX.open)) return text
  const tokens = lineTokens(lexExpression(text)).map((l) => l.token)
  let out = ''
  let before: Token | undefined
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const list = isDelimiter(t, MEMBER_INDEX.open) && !isIndexed(before) ? listAt(tokens, i) : undefined
    if (!list) {
      out += t.text
      if (t.t !== TOKEN_KIND.space) before = t
      continue
    }
    const values: string[] = []
    for (const v of list.values) {
      const written = writeListStats(v, host, params)
      if (typeof written !== 'string') return written
      values.push(written)
    }
    const rows = values.length === 1 ? rowsOf(values[0], host, params) : undefined
    if (rows && 'error' in rows) return rows
    const terms = rows?.values ?? values
    const added = terms.map((v) => `${ROUND_BRACKETS.open}${v}${ROUND_BRACKETS.close}`).join(' + ')
    // (A mean over rows not known yet, in a function's definition, is left to its calls: SOME_ROWS.)
    const divides = list.stat === SERIES_STAT_SUFFIX.avg && rows?.count !== SOME_ROWS
    const inside = divides ? `${ROUND_BRACKETS.open}${added}${ROUND_BRACKETS.close} / ${terms.length}` : added
    const rule = rows ? `${JSON.stringify(rows.rule)}${SEPARATOR} ${rows.count}${SEPARATOR} ` : ''
    out += `${LIST_STAT_FUNCTION[list.stat]}${ROUND_BRACKETS.open}${rule}${inside}${ROUND_BRACKETS.close}`
    i = list.end
    before = tokens[i]
  }
  return out
}

/** The rows of a rule in a function's definition: as many as the series its call is given has, not known yet. */
const SOME_ROWS = 0

/**
 * Text with each rule written in a function's definition (its rows not known,
 * SOME_ROWS) as the list it was: `builtin__listSum("x_i", 0, (x))` → `[x].sum`.
 * A function keeps its body as its definition wrote it; worked out for a call, its
 * parameters are series, and the list is worked out row by row over them.
 */
function definedRulesAsLists(text: string): string {
  if (![...STAT_OF.keys()].some((f) => text.includes(f))) return text
  const tokens = lineTokens(lexExpression(text)).map((l) => l.token)
  let out = ''
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const stat = t.t === TOKEN_KIND.symbol ? STAT_OF.get(t.text) : undefined
    const call = stat && isDelimiter(tokens[i + 1], ROUND_BRACKETS.open) ? argumentsAt(tokens, i + 1) : undefined
    const [, count, value] = call?.args ?? []
    if (!stat || !call || call.args.length !== 3 || count !== String(SOME_ROWS)) {
      out += t.text
      continue
    }
    // (The value is in the brackets the list put round it.)
    const bare = value.startsWith(ROUND_BRACKETS.open) && value.endsWith(ROUND_BRACKETS.close) ? value.slice(1, -1) : value
    out += `${MEMBER_INDEX.open}${definedRulesAsLists(bare)}${MEMBER_INDEX.close}${MEMBER_DOT}${stat}`
    i = call.close
  }
  return out
}

/** A call's arguments as typed, from its `(` at token `open`, and its `)`. */
function argumentsAt(tokens: readonly Token[], open: number): { args: string[]; close: number } | undefined {
  const close = closingIndex(tokens, open)
  if (close < 0) return undefined
  return { args: splitWithin(tokens, open, close, isSeparator).map(typedText), close }
}

/** Whether a token is a `,` between values, or a spread or range's mark (which makes a list more than its values). */
const isSeparator = (t: Token) => isDelimiter(t, SEPARATOR)
const isSpreadOrRange = (t: Token) => isDelimiter(t, SPREAD) || isDelimiter(t, SLICE_COLON)

/** Some tokens' text, as typed, trimmed. */
const typedText = (tokens: readonly Token[]) => tokens.map((t) => t.text).join('').trim()

/** A rule's series, each as its value in row i: x → x_i (a slice's or condition's as its series': F[2:4] → F_i). */
const inRowI = (ids: Iterable<string>) =>
  new Map([...ids].map((id) => [id, new Map([[0, `${parseSliceName(id)?.of ?? whereOf(id) ?? id}${SUBSCRIPT}${ROW_INDEX}`]])]))

/**
 * A list's one value, if it uses series: worked out row by row, as `m = [F / g]`
 * is, over the rows they all have (each row's value, x__1 - x__avg, …), and the
 * rule with each series as its value in row i, for the LaTeX: x_i - x__avg. In a
 * function's definition, a value using its parameters is a rule over the series
 * a call will give them, its rows not known yet (SOME_ROWS): it stays as it is.
 * Undefined if it uses neither; what's wrong if the series have no rows in common.
 */
function rowsOf(value: string, host: ModuleHost, params: ReadonlySet<string>):
  { values: string[]; rule: string; count: number } | { error: string } | undefined {
  const given = symbolsIn(value).filter((id) => params.has(id))
  if (given.length) return { values: [value], rule: withRowValues(value, inRowI(given), 0), count: SOME_ROWS }
  const used = new Map([...seriesUsedIn(host, value)].filter(([id]) => !params.has(id)))
  if (!used.size) return undefined
  const rows = sharedRows(used)
  if (!rows.length) return { error: `${[...used.keys()].map(typedName).join(' and ')} have no rows in common to add up.` }
  return { values: rows.map((n) => withRowValues(value, used, n)), rule: withRowValues(value, inRowI(used.keys()), 0), count: rows.length }
}

/**
 * The list whose `[` is token `open`, if `.sum` or `.avg` follows its `]`: its
 * values as typed, which statistic, and its last token. Not a list with a
 * spread or a range in it (`[...x].sum`, `[0:5].sum`), nor one with a value missing.
 */
function listAt(tokens: readonly Token[], open: number): { values: string[]; stat: ListStat; end: number } | undefined {
  const close = closingIndex(tokens, open)
  if (close < 0 || !isDelimiter(tokens[close], MEMBER_INDEX.close)) return undefined
  if (splitWithin(tokens, open, close, isSpreadOrRange).length > 1) return undefined
  const trimmed = splitWithin(tokens, open, close, isSeparator).map(typedText)
  if (trimmed.some((v) => !v)) return undefined
  // `].sum`: the dot, then the statistic's name, right after the bracket.
  const [dot, name] = [tokens[close + 1], tokens[close + 2]]
  if (!isDelimiter(dot, MEMBER_DOT) || name?.t !== TOKEN_KIND.symbol || !(name.text in LIST_STAT_FUNCTION)) return undefined
  return { values: trimmed, stat: name.text as ListStat, end: close + 2 }
}

/**
 * The step, at its stage: `settings` for every line but a function's definition,
 * which the core takes whole before then (at `shape`), so a definition's lists
 * are written at `members`, just before.
 */
export class ListStatStep extends LineStep {
  readonly stage: typeof LINE_STAGE.members | typeof LINE_STAGE.settings
  constructor(stage: typeof LINE_STAGE.members | typeof LINE_STAGE.settings) {
    super()
    this.stage = stage
  }

  run(line: LineInProgress, host: ModuleHost): LineResult | undefined {
    const params = parametersOf(line.text)
    if ((this.stage === LINE_STAGE.members) !== (params.size > 0)) return undefined
    const written = writeListStats(line.text, host, params)
    if (typeof written !== 'string') return { tex: '', error: written.error }
    line.text = written
    return undefined
  }
}

/**
 * A list's call, and what's in it: its values (as the terms of their sum, a rule's rows),
 * and if it's a rule's, its text and how many rows (SOME_ROWS in a definition).
 */
function listCall(node: Expr): { stat: ListStat; values: Expr[]; rule?: string; count?: number } | undefined {
  if (!isCall(node)) return undefined
  const stat = STAT_OF.get(node.fn.name)
  if (!stat) return undefined
  const [first, second, third] = node.args
  const isRule = third && isConstant(first) && typeof first.value === 'string' && isConstant(second)
  let added = isRule ? third : first
  // A mean's sum is in brackets, divided by how many.
  if (isOp(added, OP.divide) && isParen(added.args[0]) && isConstant(added.args[1])) added = added.args[0].content
  return isRule
    ? { stat, values: terms(added), rule: String(first.value), count: Number(second.value) }
    : { stat, values: terms(added) }
}

/** The values a list's sum adds, each in the brackets it was written in: (1) + (2) + (3) → (1), (2), (3). */
const terms = (added: Expr): Expr[] => (isOp(added, OP.add) ? added.args.flatMap(terms) : [added])

/** A value in the brackets its list put round it, with its own lists written out too (the LaTeX keeps only the brackets it needs). */
const named = (value: Expr): Expr => namedListStats(value) ?? value

/**
 * A list's sum or mean as LaTeX, its values as typed: `\sum[1, 2, 3]`, and a mean
 * over how many, `\frac{\sum[1, 2, 3]}{3}` (not ⅓ before it, which after a number,
 * 2 ⅓ Σ…, would read as a mixed number).
 */
export function listStatTex(node: CallExpr, tex: (n: Expr) => string, host: ModuleHost): string | undefined {
  const call = listCall(node)
  if (!call) return undefined
  // (A rule in a definition is over however many rows its series will have: Σᵢ, over n.)
  const unknown = call.count === SOME_ROWS
  const n = unknown ? ROW_COUNT : call.values.length
  const listed = call.rule === undefined
    ? `\\sum\\left[${call.values.map((v) => tex(isParen(v) ? v.content : v)).join(LIST_SEPARATOR_TEX)}\\right]`
    : `\\sum_{${ROW_INDEX}${unknown ? '' : `=1`}}${unknown ? '' : `^{${n}}`} ${ruleTex(call.rule, host)}`
  return ` ${call.stat === SERIES_STAT_SUFFIX.avg ? `\\frac{${listed}}{${n}}` : listed}`
}

/** How many rows a rule in a definition is over, as written: n. */
const ROW_COUNT = 'n'

/** A rule as LaTeX, in brackets if it's a sum (which Σ would otherwise take only the first term of). */
function ruleTex(rule: string, host: ModuleHost): string {
  const tex = host.expressionTex(host.expandConstants(rule).text)
  return isOp(host.parse(rule), OP.add, OP.subtract) ? `\\left(${tex}\\right)` : tex
}

/**
 * An expression with each list's call as its sum written out, `1 + 2 + 3`
 * (a mean's over how many), for the working's step of names; undefined if it
 * has none. In brackets inside an operation: 2 (1 + 2 + 3).
 */
export function namedListStats(node: Expr): Expr | undefined {
  let found = false
  const written = transform(node, (n, _path, parent) => {
    const call = listCall(n)
    // (A rule over many rows stays Σ: its rows written out would be too long to read; and one in a definition, its rows not known.)
    if (!call || (call.rule !== undefined && (call.count === SOME_ROWS || call.values.length > ROWS_WRITTEN_OUT))) return n
    found = true
    const [first, ...rest] = call.values.map(named)
    const added = rest.reduce((sum, v) => operator(OP.add, [sum, v]), first)
    const whole = call.stat === SERIES_STAT_SUFFIX.avg ? operator(OP.divide, [added, constant(call.values.length)]) : added
    return parent && isOperator(parent) ? paren(whole) : whole
  })
  return found ? written : undefined
}
