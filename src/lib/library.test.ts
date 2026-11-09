import { describe, expect, it } from 'vitest'
import { lines, readable } from '../test/helpers.ts'
import { LIBRARY, entryName, searchLibrary } from './library.ts'

const entries = LIBRARY.flatMap((t) => t.entries)

describe('the equation library', () => {
  it.each(entries.map((e) => [e.id, e] as const))('%s works, with its example, without errors or warnings', (_, e) => {
    const shown = lines(`${e.source}\n${e.example}`)
    for (const l of shown) {
      expect(l.error, `${l.source}: ${l.error}`).toBeUndefined()
      expect(l.warning, `${l.source}: ${l.warning}`).toBeUndefined()
    }
  })

  it('has a distinct name and id for every entry', () => {
    const names = entries.map(entryName)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length)
  })

  it('gives the right answers', () => {
    const result = (e: string) => readable(lines(`${entries.find((x) => x.id === e)!.source}\n${entries.find((x) => x.id === e)!.example}`).at(-1)!.tex).split(' = ').at(-1)
    expect(result('velocity')).toBe('24.5 m/s')
    expect(result('snell')).toBe('22.1°')
    expect(result('pressure')).toBe('124 kPa')
    expect(result('pH')).toMatch(/^3\.49/)
    expect(result('conc')).toBe('0.600 mol/L')
    expect(result('photon')).toMatch(/^2\.33 eV/)
  })

  it('finds entries by any of their words', () => {
    expect(searchLibrary('ideal gas').flatMap((t) => t.entries.map((e) => e.id))).toEqual(['pressure', 'gasmoles'])
    expect(searchLibrary('').length).toBe(LIBRARY.length)
    expect(searchLibrary('nothing like this')).toEqual([])
  })
})
