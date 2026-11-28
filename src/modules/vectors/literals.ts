/** Vectors typed `<3.0, 4.0> N`: where one opens and closes (the lexer reads them by this: grammar.ts). */
import { CLOSING_BRACKETS, OPENING_BRACKETS, SEPARATOR } from '../../lib/plugin.ts'
import { ANGLE_BRACKETS as ANGLE } from './syntax.ts'

/** Characters after which a `<` opens a vector rather than comparing: the start, `=`, `(`, `[`, `,`, an operator. */
export const VECTOR_OPENS_AFTER = /(?:^|[=([,+\-*/^<])\s*$/

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
    if (OPENING_BRACKETS.has(c)) depth++
    else if (CLOSING_BRACKETS.has(c)) {
      if (--depth < 0) return -1
    } else if (c === ANGLE.open && depth === 0) {
      const inner = vectorEnd(src, i)
      if (inner < 0) return -1
      i = inner
    } else if (c === SEPARATOR && depth === 0) comma = true
    else if (c === ANGLE.close && depth === 0) return comma ? i : -1
  }
  return -1
}

/**
 * Whether the `<` at `start` could still open a vector once more text follows:
 * vectorEnd hasn't been decided by what's there (no `>` at its depth yet, and
 * no bracket closed below it), so a later line's `>` can close it. (As
 * vectorEnd reads, but undecided at the end rather than not a vector; whether
 * what's before it lets it open one is left to vectorEnd, as it's what's before.)
 */
export function vectorPending(src: string, start: number): boolean {
  return vectorDecidedBy(src, start) === UNDECIDED
}

/** vectorEnd's reading of a `<`, from its `>` on: where it closes, -1 if it can't, or undecided by the end of src. */
const UNDECIDED = -2
function vectorDecidedBy(src: string, start: number): number {
  let depth = 0
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i]
    if (OPENING_BRACKETS.has(c)) depth++
    else if (CLOSING_BRACKETS.has(c)) {
      if (--depth < 0) return -1
    } else if (c === ANGLE.open && depth === 0) {
      const inner = vectorDecidedBy(src, i)
      if (inner < 0) return inner
      i = inner
    } else if (c === ANGLE.close && depth === 0) return i
  }
  return UNDECIDED
}
