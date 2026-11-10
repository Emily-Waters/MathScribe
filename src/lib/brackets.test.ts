/** Brackets by nesting: ( ) innermost, then [ ], then { }. */
import { describe, expect, it } from 'vitest'
import { nestBrackets } from './brackets.ts'

const L = (s: string) => `\\left(${s}\\right)`

describe('nestBrackets', () => {
  it('uses square brackets around round ones, and braces around those', () => {
    expect(nestBrackets(`${L(`${L('a + b')} c`)}^{2}`)).toBe(`\\left[${L('a + b')} c\\right]^{2}`)
    expect(nestBrackets(L(`x ${L(`y ${L('z + 1')}`)}`)))
      .toBe(`\\left\\{x \\left[y ${L('z + 1')}\\right]\\right\\}`)
  })

  it('goes back to round brackets after braces', () => {
    expect(nestBrackets(L(L(L(L('a')))))).toBe(`\\left(\\left\\{\\left[${L('a')}\\right]\\right\\}\\right)`)
  })

  it('leaves a group with nothing nested inside it round', () => {
    expect(nestBrackets(`2 ${L('a + b')} ${L('c + d')}`)).toBe(`2 ${L('a + b')} ${L('c + d')}`)
  })

  it('keeps a call’s and a tuple’s brackets round, and doesn’t count them', () => {
    // sin((a + b)c): the call's brackets stay, the group inside them is the only level.
    expect(nestBrackets(`\\sin${L(`${L('a + b')} c`)}`)).toBe(`\\sin${L(`${L('a + b')} c`)}`)
    expect(nestBrackets(L(`2 \\sin${L(L('a + b'))}`))).toBe(`\\left[2 \\sin${L(L('a + b'))}\\right]`)
    expect(nestBrackets(`f_{n}${L(`${L('a')} b`)}`)).toBe(`f_{n}${L(`${L('a')} b`)}`)
    expect(nestBrackets(L(`${L('1.0, 2.0')}`))).toBe(L(L('1.0, 2.0')))
    // A thin space (\,) before a unit isn't a tuple's comma.
    expect(nestBrackets(L(`${L('1.21\\,\\mathrm{s}')}^{2} x`))).toBe(`\\left[${L('1.21\\,\\mathrm{s}')}^{2} x\\right]`)
  })

  it('leaves other delimiters, and unbalanced LaTeX, alone', () => {
    expect(nestBrackets(`\\left\\langle ${L('a')}, b\\right\\rangle`)).toBe(`\\left\\langle ${L('a')}, b\\right\\rangle`)
    expect(nestBrackets(`\\left( a`)).toBe('\\left( a')
  })
})
