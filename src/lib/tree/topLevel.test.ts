/** An expression's top level, as the tree reads it (topLevel.ts). */
import { describe, expect, it } from 'vitest'
import { TOKEN_KIND } from './nodes.ts'
import { lexExpression, isTokenOf } from './lexer.ts'
import { closingBracketAt, levelled, splitTopLevel, topLevelAt } from './topLevel.ts'

describe('the top level', () => {
  it('places every part where it is in the text, at its depth', () => {
    const text = 'a = (b + c) * f(x, y)'
    const parts = levelled(lexExpression(text))
    for (const { part, at } of parts) {
      const typed = 'text' in part ? part.text : undefined
      if (typed) expect(text.slice(at, at + typed.length)).toBe(typed)
    }
    const b = parts.find(({ part }) => isTokenOf(part, TOKEN_KIND.symbol, 'b'))!
    const open = parts.find(({ part }) => isTokenOf(part, TOKEN_KIND.delimiter, '('))!
    expect([b.depth, open.depth]).toEqual([1, 0])
  })

  it('splits text at a delimiter outside brackets, nodes and quotes', () => {
    expect(splitTopLevel('f(a, b), [1, 2], c', ',')).toEqual(['f(a, b)', ' [1, 2]', ' c'])
    expect(splitTopLevel('<3.0, 4.0> N, x', ',')).toEqual(['<3.0, 4.0> N', ' x'])
    expect(splitTopLevel('"KBr, solid", 2', ',')).toEqual(['"KBr, solid"', ' 2'])
    expect(splitTopLevel('x^2 = 4', '=')).toEqual(['x^2 ', ' 4'])
    expect(splitTopLevel('x <= 4', '=')).toEqual(['x <= 4'])
    expect(splitTopLevel('', ',')).toEqual([''])
  })

  it('finds the first top-level part a test picks', () => {
    const isEquals = (p: Parameters<Parameters<typeof topLevelAt>[1]>[0]) => isTokenOf(p, TOKEN_KIND.delimiter, '=')
    expect(topLevelAt('f(a = 1) = 2', isEquals)).toBe(9)
    expect(topLevelAt('a <= b', isEquals)).toBe(-1)
  })

  it('finds where a bracket closes, as the tree reads it', () => {
    expect(closingBracketAt('f(a, (b), "c)") + 1', 1)).toBe(14)
    expect(closingBracketAt('(a + [b]) * c', 0)).toBe(8)
    expect(closingBracketAt('(a + b', 0)).toBe(-1)
    expect(closingBracketAt('a + b', 2)).toBe(-1)
    expect(closingBracketAt('"(" + (x)', 1)).toBe(-1)
  })
})
