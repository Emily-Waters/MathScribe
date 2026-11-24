/**
 * The maths library's adapter: what it reads of the library. These run the
 * library itself, so a new version that words its messages differently fails
 * here, not as a quietly unexplained message in a sheet.
 */
import { describe, expect, it } from 'vitest'
import { math } from './mathjs.ts'
import { MATHS_ERROR, mathsError } from './index.ts'

/** What evaluating some text throws. */
function thrownBy(text: string): unknown {
  try {
    math.evaluate(text)
  } catch (e) {
    return e
  }
  throw new Error(`${text} threw nothing`)
}

describe('the library\'s problems, by kind', () => {
  it('reads a name there\'s nothing of, and a function there\'s none of', () => {
    expect(mathsError(thrownBy('x + 1'))).toEqual({ kind: MATHS_ERROR.undefinedName, name: 'x' })
    expect(mathsError(thrownBy('table(2)'))).toEqual({ kind: MATHS_ERROR.undefinedFunction, name: 'table' })
  })

  it('reads values in different units, and a conversion to a unit of another kind', () => {
    expect(mathsError(thrownBy('2 m + 3 s'))).toEqual({ kind: MATHS_ERROR.unitsDiffer })
    expect(mathsError(thrownBy('2 m to s'))).toEqual({ kind: MATHS_ERROR.cannotConvert, to: 's', from: 'm' })
  })

  it('reads a message whose names are as typed already, and leaves anything else as it says it', () => {
    expect(mathsError('Undefined symbol p.slope')).toEqual({ kind: MATHS_ERROR.undefinedName, name: 'p.slope' })
    expect(mathsError(new Error('Something else'))).toEqual({ kind: MATHS_ERROR.other, message: 'Something else' })
  })
})
