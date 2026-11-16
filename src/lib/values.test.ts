/** The value model: every variable is a Variable, whatever kind of value it holds. */
import { describe, expect, it } from 'vitest'
import { matrix, unit } from 'mathjs'
import { VALUE_KIND, Variable, valueKind } from './values.ts'

describe('values', () => {
  it('have a kind, decided the same way for every variable', () => {
    expect(valueKind(2)).toBe(VALUE_KIND.quantity)
    expect(valueKind(unit(2, 'kg'))).toBe(VALUE_KIND.quantity)
    expect(valueKind(matrix([1, 2]))).toBe(VALUE_KIND.tuple)
    expect(valueKind(true)).toBe(VALUE_KIND.condition)
    expect(valueKind(() => 1)).toBe(VALUE_KIND.callable)
  })

  it('a vector is a tuple, with a look of its own', () => {
    // (A vector is a tuple with a look: the look is how it's shown, not another kind.)
    expect(new Variable({ value: matrix([3, 4]), sf: 2, look: 'angle' }).kind).toBe(VALUE_KIND.tuple)
    expect(new Variable({ value: matrix([3, 4]), sf: 2 }).kind).toBe(VALUE_KIND.tuple)
  })

  it('keep only what they’re given, and say whether they’re uncertain', () => {
    const v = new Variable({ value: 2, sf: 1 })
    expect(Object.keys(v).sort()).toEqual(['sf', 'value'])
    expect(v.uncertain).toBe(false)
    expect(new Variable({ value: 2, sf: 1, contributions: new Map([[1, 0.1]]) }).uncertain).toBe(true)
  })
})
