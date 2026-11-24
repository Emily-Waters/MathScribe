import { describe, expect, it } from 'vitest'
import { BLOCK_KIND, type CardBlock } from '../../lib/plugin.ts'
import { sheet, value } from '../../test/helpers.ts'

/** The first card a sheet makes. */
const cardOf = (source: string): CardBlock =>
  sheet(source).blocks.find((b): b is CardBlock => b.kind === BLOCK_KIND.card)!

/** Each formula's TeX, or its error. */
const formulas = (...lines: string[]) =>
  cardOf(['@formula {', ...lines.map((l) => `    ${l}`), '}'].join('\n')).entries.map((e) => e.error ?? e.tex)

describe('@formula { }', () => {
  it('typesets each line, its names symbols, without working anything out', () => {
    expect(formulas('F = m * a')).toEqual(['F = m a'])
    expect(cardOf('@formula {\n    F = m * a\n}')).toMatchObject({ title: 'Formulas', error: undefined })
  })

  it('reads a name after a number as a symbol, never a unit', () => {
    const [tex] = formulas('E_k = 1/2 m v^2')
    expect(tex).not.toMatch(/mathrm/)
    expect(tex).toMatch(/^E_\{k\} = /)
  })

  it('sets each side of every = apart', () => {
    expect(formulas('p V = n R T')).toEqual(['p V = n R T'])
    expect(formulas('a = v / t = 2 * d / t^2')[0].split(' = ')).toHaveLength(3)
  })

  it('says what is wrong with a formula that has nothing on one side', () => {
    expect(formulas('F =')[0]).toMatch(/something on each side/)
  })

  it('defines nothing: a later line still needs values', () => {
    const source = '@formula {\n    F = m * a\n}\nm = 2.0 kg\na = 3.0 m/s^2\nF = m * a'
    expect(value(source)).toBe('6.0 N')
  })

  it('says when its } is missing', () => {
    expect(cardOf('@formula {\n    F = m * a').error).toMatch(/missing its closing \}/)
  })
})
