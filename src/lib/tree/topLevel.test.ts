/** An expression's top level, as the tree reads it (topLevel.ts). */
import { describe, expect, it } from 'vitest'
import { TOKEN_KIND } from './nodes.ts'
import { lexExpression, isTokenOf } from './lexer.ts'
import { closingBracketAt, closingIndex, levelled, openingIndex, splitArgs, splitEquation, splitTopLevel, splitWithin, topLevelAt } from './topLevel.ts'
import { lineTokens } from '../engine/core/memberAccess.ts'

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

  it('splits a call\'s arguments, and an equation at its one = (which a scan of the text got wrong)', () => {
    expect(splitArgs('a, f(b, c), "d, e"')).toEqual(['a', 'f(b, c)', '"d, e"'])
    expect(splitArgs('<3.0, 4.0> N, x')).toEqual(['<3.0, 4.0> N', 'x'])
    expect(splitArgs('n_1, 2.0 mol {Na^+}')).toEqual(['n_1', '2.0 mol {Na^+}'])
    expect(splitEquation('x^2 = 4')).toEqual(['x^2', '4'])
    expect(splitEquation('a == b')).toEqual(['a', 'b'])
    expect(splitEquation('f(x = 1) = 2')).toEqual(['f(x = 1)', '2'])
    expect(splitEquation('"a = b" = c')).toEqual(['"a = b"', 'c'])
    expect(splitEquation('a <= b')).toBeNull()
    expect(splitEquation('a = b = c')).toBeNull()
  })

  it('finds the first top-level part a test picks', () => {
    const isEquals = (p: Parameters<Parameters<typeof topLevelAt>[1]>[0]) => isTokenOf(p, TOKEN_KIND.delimiter, '=')
    expect(topLevelAt('f(a = 1) = 2', isEquals)).toBe(9)
    expect(topLevelAt('a <= b', isEquals)).toBe(-1)
  })

  it('reads a flat list of tokens: a bracket\'s close, its opening, and what\'s directly in it', () => {
    const tokens = lineTokens(lexExpression('f(a, [b, c], d) + (e)')).map((l) => l.token)
    const at = (text: string, from = 0) => tokens.findIndex((t, i) => i >= from && t.text === text)
    const open = at('(')
    expect(tokens[closingIndex(tokens, open)].text).toBe(')')
    expect(closingIndex(tokens, at('a'))).toBe(-1)
    expect(openingIndex(tokens, closingIndex(tokens, open))).toBe(open)
    const isComma = (t: { t: string; text: string }) => t.t === TOKEN_KIND.delimiter && t.text === ','
    const values = splitWithin(tokens, open, closingIndex(tokens, open), isComma).map((ts) => ts.map((t) => t.text).join('').trim())
    expect(values).toEqual(['a', '[b, c]', 'd'])
    // (One still open: to the list's end.)
    const unclosed = lineTokens(lexExpression('[1, 2')).map((l) => l.token)
    expect(splitWithin(unclosed, 0, unclosed.length, isComma).length).toBe(2)
  })

  it('finds where a bracket closes, as the tree reads it', () => {
    expect(closingBracketAt('f(a, (b), "c)") + 1', 1)).toBe(14)
    expect(closingBracketAt('(a + [b]) * c', 0)).toBe(8)
    expect(closingBracketAt('(a + b', 0)).toBe(-1)
    expect(closingBracketAt('a + b', 2)).toBe(-1)
    expect(closingBracketAt('"(" + (x)', 1)).toBe(-1)
  })
})
