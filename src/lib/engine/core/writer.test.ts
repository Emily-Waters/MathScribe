/** An expression written as mathjs reads it, from its tokens: the core's writers, and the modules'. */
import { describe, expect, it } from 'vitest'
import { preprocess } from '../index.ts'
import { VECTOR_FUNCTION } from '../modules/vectors/syntax.ts'
import { SPECIES_FUNCTION } from '../modules/chemistry/syntax.ts'
import { value } from '../../../test/helpers.ts'

/** Variables on the sheet, for the shadowed-unit note. */
const isVariable = (id: string) => ['m', 'v'].includes(id)
const written = (src: string) => preprocess(src, isVariable).text

describe('the core’s writers', () => {
  it('writes a number with a unit as a quantity, the number as typed', () => {
    expect(written('g = 9.81 m/s^2')).toBe('g = (9.81 * unit("m/s^2"))')
    expect(written('m = 2.0 kg')).toBe('m = (lit("2.0") * unit("kg"))')
    expect(written('d = 3.0 µm')).toBe('d = (lit("3.0") * unit("um"))')
  })

  it('writes a unit after `to` as a unit, a micro sign too', () => {
    expect(written('v to km/h')).toBe('v to unit("km/h")')
    expect(written('f = 250. nm to µm')).toBe('f = (lit("250.") * unit("nm")) to unit("um")')
  })

  it('notes a unit that’s also a variable, with more terms after it', () => {
    expect(preprocess('E = 1/2 m v^2', isVariable).shadowed).toEqual(['m'])
    expect(preprocess('x = 5 m to cm', isVariable).shadowed).toEqual([])
    expect(preprocess('x = 5 m', isVariable).shadowed).toEqual([])
  })

  it('leaves a label in quotes as it is', () => {
    expect(written('"2 kg" + x')).toBe('"2 kg" + x')
  })
})

describe('the modules’ writers', () => {
  it('writes <…> as a vector where a value can start, with any unit after it (vectors)', () => {
    const v = VECTOR_FUNCTION
    expect(written('F = <3.0, 4.0> N')).toBe(`F = (${v}(lit("3.0"), lit("4.0")) * unit("N"))`)
    expect(written('c = cross(<1, 0, 0>, <0, 1, 0>)')).toBe(`c = cross(${v}(1, 0, 0), ${v}(0, 1, 0))`)
    expect(written('r = <max(1, 2), <1, 2>>')).toBe(`r = ${v}(max(1, 2), ${v}(1, 2))`)
    // (Comparisons are left alone.)
    expect(written('q = (a < b) and (c > d)')).toBe('q = (a < b) and (c > d)')
  })

  it('gives a value its species, after a unit or a value (chemistry)', () => {
    const of = SPECIES_FUNCTION.shown
    expect(written('n = 2 mol {EDTA}')).not.toContain('{')
    expect(written('m = n_1 {H2O}')).toBe(`m = ${of}(n_1, "H2O")`)
    expect(written('M = (18.02 g / 1 mol) {H2O}')).toBe(`M = ${of}(((18.02 * unit("g")) / (1 * unit("mol"))), "H2O")`)
    expect(written('x = r.H2O {H2O}')).toBe(`x = ${of}(r.H2O, "H2O")`)
    // (After nothing it can be given to, it's left for mathjs to explain.)
    expect(written('x = {H2O}')).toBe('x = {H2O}')
  })

  it('keeps a species with its unit through a bracketed uncertainty (chemistry)', () => {
    expect(value('n = (2.0 pm 0.1) mol {EDTA}')).toBe(value('n = 2.0 mol {EDTA} pm 0.1 mol {EDTA}'))
  })
})
