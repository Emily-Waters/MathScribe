/** A value split at its uncertainty's `pm`, as the tree reads it (uncertainty.ts). */
import { describe, expect, it } from 'vitest'
import { splitPm } from './uncertainty.ts'

describe('splitPm', () => {
  it('splits at the first pm at the top level', () => {
    expect(splitPm(' 2.0 kg pm 0.1 kg')).toEqual(['2.0 kg', '0.1 kg'])
    expect(splitPm(' 2.0 kg pm 5%')).toEqual(['2.0 kg', '5%'])
    // (Straight after a bare number too: `pm` is the uncertainty's word, not picometres.)
    expect(splitPm(' 0.120 pm 0.005')).toEqual(['0.120', '0.005'])
    expect(splitPm(' 1 pm 1 pm 1')).toEqual(['1', '1 pm 1'])
  })

  it('leaves a pm in brackets, a name that starts with pm, and a label alone', () => {
    expect(splitPm(' f(a pm b)')).toBeNull()
    expect(splitPm(' pmax + 1')).toBeNull()
    expect(splitPm(' "x pm y"')).toBeNull()
  })
})
