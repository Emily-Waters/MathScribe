/**
 * Names with a dot, `a.x_1`, `H2SO4.H.n`, and a series' members, `t[3]`, as
 * the inside names they stand for (a__x_1, t__3), read from the line's tokens (the lexer's, tree/lexer.ts), so what
 * a dot is (a member's, not a number's, not in a label) is the lexer's to say.
 */
import { ROUND_BRACKETS, lexExpression } from '../../tree/lexer.ts'
import { SEPARATOR } from '../../tree/shapes.ts'
import { TOKEN_KIND, isCallKind, isToken, type Part, type Token } from '../../tree/nodes.ts'
import { MEMBER_DOT, MEMBER_INDEX, SIGIL } from '../../syntax.ts'
import { JOIN, RESERVED_NAMESPACES, SLICE_COLON, type SliceSpec, memberName, seriesMemberName, sliceName } from '../../sheet/names.ts'

/** A token of a line, and whether it's what a call calls (`f` in `f(x)`, `@chem.mm` in `@chem.mm({H2O})`). */
export interface LineToken {
  token: Token
  callee: boolean
}

/** A line's tokens in order, each node's in its place. */
export function lineTokens(parts: readonly Part[], out: LineToken[] = [], calls = false): LineToken[] {
  parts.forEach((p, i) => {
    if (isToken(p)) out.push({ token: p, callee: calls && i === 0 })
    else lineTokens(p.parts, out, isCallKind(p.kind))
  })
  return out
}

/**
 * The names a line's maths uses, as the tree reads them: its symbols, not a
 * unit (`5.52 V`, though there's a series V), a call's name, or a label.
 */
export const symbolsIn = (text: string): string[] =>
  lineTokens(lexExpression(text)).filter((l) => l.token.t === TOKEN_KIND.symbol && !l.callee).map((l) => l.token.text)

/** The names a line's maths calls, as the tree reads them: `f` and `sqrt` in `f(x) + sqrt(2)`. */
export const calleesIn = (text: string): string[] =>
  lineTokens(lexExpression(text)).filter((l) => l.token.t === TOKEN_KIND.symbol && l.callee).map((l) => l.token.text)

/**
 * The names a line passes whole to a call, as the tree reads them, with what each
 * call calls: `f(t, 2 * d)` → f is given t (and something that isn't a name).
 */
export function namesPassed(text: string): { callee: string; name: string }[] {
  const out: { callee: string; name: string }[] = []
  const visit = (parts: readonly Part[]) => {
    for (const p of parts) {
      if (isToken(p)) continue
      visit(p.parts)
      const [callee] = p.parts
      if (!isCallKind(p.kind) || !isToken(callee) || callee.t !== TOKEN_KIND.symbol) continue
      // Its arguments, between its brackets, split at each comma at their top level.
      const open = p.parts.findIndex((q) => isToken(q) && q.t === TOKEN_KIND.delimiter && q.text === ROUND_BRACKETS.open)
      let argument: Part[] = []
      const take = () => {
        const said = argument.filter((q) => !isToken(q) || q.t !== TOKEN_KIND.space)
        if (said.length === 1 && isToken(said[0]) && said[0].t === TOKEN_KIND.symbol) out.push({ callee: callee.text, name: said[0].text })
        argument = []
      }
      for (const q of p.parts.slice(open + 1, -1)) {
        if (isToken(q) && q.t === TOKEN_KIND.delimiter && q.text === SEPARATOR) take()
        else argument.push(q)
      }
      take()
    }
  }
  visit(lexExpression(text))
  return out
}

/** Whether a token is a member's dot. */
const isDot = (t: Token | undefined) => t?.t === TOKEN_KIND.delimiter && t.text === MEMBER_DOT

/** Whether a token is this bracket of a member's number, `[` or `]`. */
const isIndex = (t: Token | undefined, bracket: string) => t?.t === TOKEN_KIND.delimiter && t.text === bracket

/** A whole number, as a member's is written: t[3]. */
const WHOLE_NUMBER = /^\d+$/

/**
 * What's in a series' brackets, from token `at` (after the `[`): one member's
 * number, `3`, or a slice, `2:4`, `2:10:2`, `::2`, `3:` (any part left out);
 * and where its `]` is. Undefined if it's anything else.
 */
function readIndex(tokens: readonly Token[], at: number): { at: number | SliceSpec; close: number } | undefined {
  const parts: (number | undefined)[] = []
  let current: number | undefined
  let i = at
  for (; i < tokens.length; i++) {
    const t = tokens[i]
    if (isIndex(t, MEMBER_INDEX.close)) break
    if (t.t === TOKEN_KIND.number && WHOLE_NUMBER.test(t.text) && current === undefined) current = Number(t.text)
    else if (t.t === TOKEN_KIND.delimiter && t.text === SLICE_COLON && parts.length < 2) {
      parts.push(current)
      current = undefined
    } else if (t.t !== TOKEN_KIND.space) return undefined
  }
  if (i >= tokens.length) return undefined
  parts.push(current)
  if (parts.length === 1) return parts[0] === undefined ? undefined : { at: parts[0], close: i }
  const [from, to, step] = parts
  // (Every 0th member is nothing to take.)
  if (step === 0) return undefined
  return { at: { from, to, step }, close: i }
}

/** A name and its members as its inside name, unless its namespace is one of MathScribe's own (`delta`): a, [x_1] → a__x_1. */
const insideName = (namespace: string, members: readonly string[]) =>
  (RESERVED_NAMESPACES.has(namespace) ? [namespace, ...members].join(MEMBER_DOT) : memberName(namespace, members.join(JOIN)))

/** A precision written after a constant, `:4`, at the end of a built-in's token. */
const PRECISION_END = /:[^:]*$/

/**
 * Text with each `a.x_1` as its inside name, a__x_1 (a member's member too:
 * H2SO4.H.n → H2SO4__H__n), each series' member, `t[3]`, as its, t__3
 * (a.x[3] → a__x__3; a statistic, `t.avg`, is a member like any other), and
 * each slice of a series, `t[2:4]`, as the series it is (t__slice_f2_t4, sliceName),
 * leaving labels in quotes alone. A built-in's dots are read the same way:
 * `@chem.mm.Na` → `@chem__mm__Na` (see constantKey, which takes either).
 */
export function expandDots(text: string): string {
  if (!text.includes(MEMBER_DOT) && !text.includes(MEMBER_INDEX.open)) return text
  const tokens = lineTokens(lexExpression(text)).map((l) => l.token)
  let out = ''
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.t === TOKEN_KIND.symbol) {
      // A name, then each `.member`, `[3]` or `[2:4]` straight after it, in turn.
      let name = t.text
      let members: string[] = []
      const flush = () => {
        if (members.length) name = insideName(name, members)
        members = []
      }
      let end = i
      for (;;) {
        if (isDot(tokens[end + 1]) && tokens[end + 2]?.t === TOKEN_KIND.symbol) {
          members.push(tokens[end + 2].text)
          end += 2
          continue
        }
        const index = isIndex(tokens[end + 1], MEMBER_INDEX.open) ? readIndex(tokens, end + 2) : undefined
        if (!index) break
        flush()
        name = typeof index.at === 'number' ? seriesMemberName(name, index.at) : sliceName(name, index.at)
        end = index.close
      }
      flush()
      if (end > i) {
        out += name
        i = end
        continue
      }
    }
    if (t.t === TOKEN_KIND.builtin && t.text.includes(MEMBER_DOT)) {
      const precision = PRECISION_END.exec(t.text)?.[0] ?? ''
      const [namespace, ...members] = t.text.slice(SIGIL.length, t.text.length - precision.length).split(MEMBER_DOT)
      out += `${SIGIL}${insideName(namespace, members)}${precision}`
      continue
    }
    out += t.text
  }
  return out
}
