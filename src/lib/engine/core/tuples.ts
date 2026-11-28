/** Tuples: what isn't one (a bare bracketed list), and how one is bracketed in a substitution. */
import { CLOSING_BRACKETS, NAME_CHAR, OPENING_BRACKETS, ROUND_BRACKETS, SEPARATOR, SQUARE_BRACKETS, inClass, regex, src } from '../../syntax.ts'

/** Text ending where a bracket would start a call's arguments: after a name (`f`, `λ`) or a closing bracket. */
export const CALL_BEFORE = regex(src`(?:${NAME_CHAR}|[${inClass(ROUND_BRACKETS.close, SQUARE_BRACKETS.close)}])$`)

/**
 * The first bracketed list with commas, `(a, b)`, that isn't a function call's
 * argument list (it doesn't follow a name or a closing bracket); null if none.
 * It isn't a value: tuples are written @tuple(a, b).
 */
export function bareTuple(src: string): string | null {
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== ROUND_BRACKETS.open) continue
    const before = src.slice(0, i).trimEnd()
    if (CALL_BEFORE.test(before)) continue // a call: f(a, b), λ(a, b), @solve(…), or (x)(y)
    let depth = 0
    let comma = false
    let j = i
    for (; j < src.length; j++) {
      const c = src[j]
      if (OPENING_BRACKETS.has(c)) depth++
      else if (CLOSING_BRACKETS.has(c)) {
        depth--
        if (depth === 0) break
      } else if (c === SEPARATOR && depth === 1) comma = true
    }
    if (comma) return src.slice(i, j + 1)
  }
  return null
}

/** A tuple's TeX, bracketed if it isn't already (a module's look may not bracket it), to drop into a substitution. */
export const bracketed = (tex: string) => (/^(?:\\left|\()/.test(tex) ? tex : `(${tex})`)
