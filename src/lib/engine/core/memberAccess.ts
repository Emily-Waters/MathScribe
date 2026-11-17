/**
 * Names with a dot, `a.x_1`, `H2SO4.H.n`, as the inside names they stand for
 * (a__x_1), read from the line's tokens (the lexer's, tree/lexer.ts), so what
 * a dot is (a member's, not a number's, not in a label) is the lexer's to say.
 */
import { lexExpression } from '../../tree/lexer.ts'
import { NODE_KIND, TOKEN_KIND, isToken, type Part, type Token } from '../../tree/nodes.ts'
import { MEMBER_DOT, SIGIL } from '../../syntax.ts'
import { JOIN, RESERVED_NAMESPACES, memberName } from '../../names.ts'

/** A token of a line, and whether it's what a call calls (`f` in `f(x)`, `@chem.mm` in `@chem.mm({H2O})`). */
export interface LineToken {
  token: Token
  callee: boolean
}

/** A line's tokens in order, each node's in its place. */
export function lineTokens(parts: readonly Part[], out: LineToken[] = [], calls = false): LineToken[] {
  parts.forEach((p, i) => {
    if (isToken(p)) out.push({ token: p, callee: calls && i === 0 })
    else lineTokens(p.parts, out, p.kind === NODE_KIND.call)
  })
  return out
}

/** Whether a token is a member's dot. */
const isDot = (t: Token | undefined) => t?.t === TOKEN_KIND.delimiter && t.text === MEMBER_DOT

/** A name and its members as its inside name, unless its namespace is one of MathScribe's own (`delta`): a, [x_1] → a__x_1. */
const insideName = (namespace: string, members: readonly string[]) =>
  (RESERVED_NAMESPACES.has(namespace) ? [namespace, ...members].join(MEMBER_DOT) : memberName(namespace, members.join(JOIN)))

/** A precision written after a constant, `:4`, at the end of a built-in's token. */
const PRECISION_END = /:[^:]*$/

/**
 * Text with each `a.x_1` as its inside name, a__x_1 (a member's member too:
 * H2SO4.H.n → H2SO4__H__n), leaving labels in quotes alone. A numbered member
 * is kept as written (a.x1 → a__x1): t1 and t_1 are the same variable, inside
 * a namespace too. A built-in's dots are read the same way: `@chem.mm.Na` →
 * `@chem__mm__Na` (see constantKey, which takes either).
 */
export function expandDots(text: string): string {
  if (!text.includes(MEMBER_DOT)) return text
  const tokens = lineTokens(lexExpression(text)).map((l) => l.token)
  let out = ''
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.t === TOKEN_KIND.symbol) {
      // A name, then each `.member` straight after it.
      const members: string[] = []
      let end = i
      while (isDot(tokens[end + 1]) && tokens[end + 2]?.t === TOKEN_KIND.symbol) {
        members.push(tokens[end + 2].text)
        end += 2
      }
      if (members.length) {
        out += insideName(t.text, members)
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
