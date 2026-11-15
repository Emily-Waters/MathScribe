/** Vectors written `<3.0, 4.0> N`, and tuples. */
import { NAME_CHAR, VECTOR_FUNCTION } from '../../syntax.ts'
import { FN } from '../../mathjsNames.ts'
import { readUnit } from './literals.ts'

/** Characters after which a `<` opens a vector rather than comparing: the start, `=`, `(`, `[`, `,`, an operator. */
export const VECTOR_OPENS_AFTER = /(?:^|[=([,+\-*/^<]|\breturn)\s*$/

/**
 * Where the vector opened by the `<` at `start` closes: the index of its `>`,
 * or -1 if `<` there doesn't open a vector (it's a comparison, or nothing
 * closes it, or there's no comma inside). Brackets and vectors may nest.
 */
export function vectorEnd(src: string, start: number): number {
  if (!VECTOR_OPENS_AFTER.test(src.slice(0, start))) return -1
  let depth = 0
  let comma = false
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      if (--depth < 0) return -1
    } else if (c === '<' && depth === 0) {
      const inner = vectorEnd(src, i)
      if (inner < 0) return -1
      i = inner
    } else if (c === ',' && depth === 0) comma = true
    else if (c === '>' && depth === 0) return comma ? i : -1
  }
  return -1
}

/**
 * `<3.0, 4.0> N` → `(vector(3.0, 4.0) * N)`. A unit right after the `>` applies
 * to every component; other `<` and `>` (comparisons) are left alone.
 */
export function expandVectors(src: string): string {
  let out = ''
  let last = 0
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '<') continue
    const end = vectorEnd(src, i)
    if (end < 0) continue
    const inside = expandVectors(src.slice(i + 1, end))
    const unit = readUnit(src, end + 1)
    out += src.slice(last, i)
    out += unit
      ? `(${VECTOR_FUNCTION}(${inside}) * ${FN.unit}("${unit.text}"))`
      : `${VECTOR_FUNCTION}(${inside})`
    last = unit ? unit.end : end + 1
    i = last - 1
  }
  return out + src.slice(last)
}

/** Whether the `>` at `end` closes a vector (so a unit can follow it), for the editor. */
export function closesVector(src: string, end: number): boolean {
  for (let i = end - 1; i >= 0; i--) if (src[i] === '<' && vectorEnd(src, i) === end) return true
  return false
}

/** Text ending where a bracket would start a call's arguments: after a name (`f`, `λ`) or a closing bracket. */
export const CALL_BEFORE = new RegExp(String.raw`(?:${NAME_CHAR}|[)\]])$`)

/** The vector products, written as operators: dot(a, b) → a · b, cross(a, b) → a × b. */
export const VECTOR_PRODUCTS = { dot: '\\cdot', cross: '\\times' } as const

/** Whether some text has a vector written `<…>` or `vector(…)` in it. */
export const hasVector = (src: string) =>
  expandVectors(src) !== src || new RegExp(`\\b${VECTOR_FUNCTION}\\s*\\(`).test(src)

/**
 * The first bracketed list with commas, `(a, b)`, that isn't a function call's
 * argument list (it doesn't follow a name or a closing bracket); null if none.
 * It isn't a value: tuples are written tuple(a, b).
 */
export function bareTuple(src: string): string | null {
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '(') continue
    const before = src.slice(0, i).trimEnd()
    if (CALL_BEFORE.test(before)) continue // a call: f(a, b), λ(a, b), solve(…), or (x)(y)
    let depth = 0
    let comma = false
    let j = i
    for (; j < src.length; j++) {
      const c = src[j]
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')' || c === ']' || c === '}') {
        depth--
        if (depth === 0) break
      } else if (c === ',' && depth === 1) comma = true
    }
    if (comma) return src.slice(i, j + 1)
  }
  return null
}
