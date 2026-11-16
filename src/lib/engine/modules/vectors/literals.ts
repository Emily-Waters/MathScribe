/** Vectors typed `<3.0, 4.0> N`: where one opens and closes (the lexer reads them by this: grammar.ts). */

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
