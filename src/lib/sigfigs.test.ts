import { describe, expect, it } from 'vitest'
import {
  EXACT, countSigFigs, formatSigFigs, formatWithUncertainty, hasAmbiguousZeros, isMeasuredLiteral,
  lastPlace, sigFigsFromPlace, uncertaintySigFigs,
} from './sigfigs.ts'

describe('countSigFigs', () => {
  it.each([
    ['2.00', 3], ['0.0250', 3], ['1.2e3', 2], ['3.00e2', 3], ['300', 1], ['300.', 3],
    ['1005', 4], ['-4.50', 3], ['0.5', 1], ['7', 1],
  ])('%s has %i', (literal, expected) => {
    expect(countSigFigs(literal)).toBe(expected)
  })

  it('counts a zero by its decimal places', () => {
    expect(countSigFigs('0')).toBe(1)
    expect(countSigFigs('0.00')).toBe(2)
  })
})

describe('formatSigFigs', () => {
  it('keeps trailing zeros', () => {
    expect(formatSigFigs(2, 3)).toBe('2.00')
    expect(formatSigFigs(19.62, 3)).toBe('19.6')
  })

  it('uses scientific notation when plain digits would misstate the precision', () => {
    expect(formatSigFigs(19.62, 2)).toBe('2.0e+1')
    expect(formatSigFigs(19620, 3)).toBe('1.96e+4')
  })

  it('shows a zero with as many decimal places as it was counted with', () => {
    expect(formatSigFigs(0, 2)).toBe('0.00')
    expect(formatSigFigs(0, 1)).toBe('0')
  })
})

describe('uncertainties', () => {
  it('quotes an uncertainty to 1 sig fig, or 2 when it starts with a 1', () => {
    expect(uncertaintySigFigs(0.07)).toBe(1)
    expect(uncertaintySigFigs(0.14)).toBe(2)
  })

  it('rounds the value to the uncertainty’s decimal place', () => {
    expect(formatWithUncertainty(2.8925, 0.0712)).toMatchObject({ num: '2.89', unc: '0.07' })
    expect(formatWithUncertainty(19.62, 1.04)).toMatchObject({ num: '19.6', unc: '1.0' })
  })

  it('shares a power of ten for very large values', () => {
    expect(formatWithUncertainty(19620, 300)).toMatchObject({ num: '19600', unc: '300' })
    expect(formatWithUncertainty(1.96e6, 3e4)).toMatchObject({ num: '1.96', unc: '0.03', exp: 6 })
  })
})

describe('decimal places', () => {
  it('finds the place of the last significant digit', () => {
    expect(lastPlace(12.52, 4)).toBe(-2)
    expect(lastPlace(300, 1)).toBe(2)
    expect(lastPlace(5, EXACT)).toBe(-Infinity)
  })

  it('turns a place back into sig figs', () => {
    expect(sigFigsFromPlace(15.62, -1)).toBe(3)
    expect(sigFigsFromPlace(0.02, -1)).toBe(0)
  })
})

describe('literals', () => {
  it('treats numbers with a decimal point or exponent as measured', () => {
    expect(isMeasuredLiteral('2.0')).toBe(true)
    expect(isMeasuredLiteral('1e3')).toBe(true)
    expect(isMeasuredLiteral('2')).toBe(false)
  })

  it('spots whole numbers whose trailing zeros are ambiguous', () => {
    expect(hasAmbiguousZeros('300')).toBe(true)
    expect(hasAmbiguousZeros('300.')).toBe(false)
    expect(hasAmbiguousZeros('305')).toBe(false)
  })
})
