/** Tuples: what isn't one (a bare bracketed list), and how one is bracketed in a substitution. */
import { CLOSING_BRACKETS, NAME_CHAR, ROUND_BRACKETS, SEPARATOR, SQUARE_BRACKETS, inClass, regex, src } from '../../syntax.ts'
import { TEX_ROUND, TEX_SIZED } from '../../latex/syntax.ts'
import { isTokenOf, lexExpression } from '../../tree/lexer.ts'
import { levelled, matchesDelimiter, splitParts } from '../../tree/topLevel.ts'
import { TOKEN_KIND, isToken, type Part } from '../../tree/nodes.ts'

/** Text ending where a bracket would start a call's arguments: after a name (`f`, `λ`) or a closing bracket. */
export const CALL_BEFORE = regex(src`(?:${NAME_CHAR}|[${inClass(ROUND_BRACKETS.close, SQUARE_BRACKETS.close)}])$`)

/**
 * The first bracketed list with commas, `(a, b)`, that isn't a function call's
 * argument list (it doesn't follow a name or a closing bracket); null if none.
 * It isn't a value: tuples are written @tuple(a, b). Read from the tree's parts,
 * at every level (a node's too: `f((a, b))`), so a comma in a vector, a species
 * or a label in quotes isn't a list's.
 */
export function bareTuple(text: string): string | null {
  const atLevel = (parts: readonly Part[], start: number): string | null => {
    const placed = levelled(parts, start)
    for (let i = 0; i < placed.length; i++) {
      const { part, at, depth } = placed[i]
      if (!isToken(part)) {
        const inner = atLevel(part.parts, at)
        if (inner) return inner
        continue
      }
      // (A call's own brackets, f(a, b), λ(a, b), @solve(…), or (x)(y), aren't a list's.)
      if (!isTokenOf(part, TOKEN_KIND.delimiter, ROUND_BRACKETS.open) || CALL_BEFORE.test(text.slice(0, at).trimEnd())) continue
      const close = placed.findIndex((q, j) => j > i && q.depth === depth && isToken(q.part) && CLOSING_BRACKETS.has(q.part.text))
      if (close < 0) continue
      if (splitParts(parts.slice(i + 1, close), matchesDelimiter(SEPARATOR)).length > 1) return text.slice(at, placed[close].at + 1)
    }
    return null
  }
  return atLevel(lexExpression(text), 0)
}

/** A tuple's TeX, bracketed if it isn't already (a module's look may not bracket it), to drop into a substitution. */
export const bracketed = (tex: string) =>
  (tex.startsWith(TEX_SIZED.open) || tex.startsWith(TEX_ROUND.open) ? tex : `${TEX_ROUND.open}${tex}${TEX_ROUND.close}`)
