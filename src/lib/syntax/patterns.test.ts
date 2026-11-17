/** How patterns and word lists are written (patterns.ts). */
import { describe, expect, it } from 'vitest'
import { named, oneOf, optional, regex, src, words } from './patterns.ts'

describe('patterns', () => {
  it('are written as they read, other patterns taken in as they are', () => {
    const digits = /\d+/
    expect(src`^${digits}\.${'[a-z]'}$`).toBe('^\\d+\\.[a-z]$')
    expect(regex(src`^${named('n', digits)}${optional(src`:${named('unit', '\\w+')}`)}$`).exec('12:kg')?.groups).toEqual({ n: '12', unit: 'kg' })
    expect(regex(oneOf(['a', /b+/]), 'g').source).toBe('(?:a|b+)')
  })
})

describe('word lists', () => {
  const MODE = words({ full: 'full', sym: 'sym' })

  it('are their words by name, and know their list, each word, and their alternation', () => {
    expect(MODE.sym).toBe('sym')
    expect(MODE.words).toEqual(['full', 'sym'])
    expect(MODE.has('sym')).toBe(true)
    expect(MODE.has('val')).toBe(false)
    expect(MODE.alternation).toBe('full|sym')
  })

  it('show only their words when listed or spread', () => {
    expect(Object.values(MODE)).toEqual(['full', 'sym'])
    expect({ ...MODE }).toEqual({ full: 'full', sym: 'sym' })
  })

  it('can’t have a word named as what they know', () => {
    expect(() => words({ words: 'words' })).toThrow('named words')
  })
})
