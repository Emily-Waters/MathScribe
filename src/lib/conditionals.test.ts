/** Conditions: `cond ? a : b`, in a line or a function, nested for more than two cases. */
import { describe, expect, it } from 'vitest'
import { last, value } from '../test/helpers.ts'

/** A function with three cases, by conditions that nest. */
const friction = 'mu = 0.30\nN = 20.0 N\nfriction(v) = v > 0 m/s ? -mu * N : (v < 0 m/s ? mu * N : 0 N)\n'

describe('cond ? a : b', () => {
  it('gives whichever it comes to, with that one’s sig figs', () => {
    expect(value('N = 20.0 N\nF = N > 10 N ? 5.0 N : 0 N')).toBe('5.0 N')
    expect(value('N = 2.0 N\nF = N > 10 N ? 5.0 N : 0.25 N')).toBe('0.25 N')
  })

  it('makes a one-line function piecewise', () => {
    expect(value('ramp(x) = x > 0 ? x : 0\ny = ramp(3.0)')).toBe('3.0')
    expect(value('ramp(x) = x > 0 ? x : 0\ny = ramp(-2)')).toBe('0')
  })
})

describe('conditions that nest', () => {
  it('give the first case whose condition holds, or the last', () => {
    expect(value(`${friction}a = friction(2.0 m/s)`)).toBe('-6.0 N')
    expect(value(`${friction}a = friction(-1.0 m/s)`)).toBe('6.0 N')
    expect(value(`${friction}a = friction(0 m/s)`)).toBe('0 N')
  })
})

describe('limits in conditions', () => {
  it('aren’t measurements, so their trailing zeros don’t warn', () => {
    expect(last('N = 20.0 N\nF = N > 10 N ? 5.0 N : 0 N').warning).toBeUndefined()
    expect(last('x = 250. m\nok = x < 300 m').warning).toBeUndefined()
    expect(last('x = 300 m').warning).toMatch(/Trailing zeros/)
  })
})
