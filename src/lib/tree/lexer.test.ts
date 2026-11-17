/** The expression lexer: what an expression says, as tokens and nodes (and nothing lost). */
import { describe, expect, it } from 'vitest'
import { isToken, NODE_KIND, TOKEN_KIND, type Part } from './nodes.ts'
import { encode, textOf } from './codec.ts'
import { declaredLexRules, lexExpression, LEXER_CORE } from './lexer.ts'
import { VECTOR_NODE } from '../../modules/vectors/grammar.ts'
import { VectorModule } from '../../modules/vectors/module.ts'
import { SERIES_TOKEN } from '../../modules/series/grammar.ts'
import { CHEM_TOKEN } from '../../modules/chemistry/grammar.ts'
// (Installs the modules, whose rules the lexer reads by.)
import '../engine/index.ts'

/** Parts as a short line to compare: `kind:text` for a token, `kind(…)` for a node; spaces left out. */
const shape = (parts: readonly Part[]): string =>
  parts
    .filter((p) => !(isToken(p) && p.t === TOKEN_KIND.space))
    .map((p) => (isToken(p) ? `${p.t}:${p.text}` : `${p.kind}(${shape(p.parts)})`))
    .join(' ')

const lexed = (text: string) => shape(lexExpression(text))

describe('the expression lexer', () => {
  it('reads names, numbers and mathjs’s delimiters', () => {
    expect(lexed('F = m * a')).toBe(
      `${TOKEN_KIND.symbol}:F ${TOKEN_KIND.delimiter}:= ${TOKEN_KIND.symbol}:m ${TOKEN_KIND.delimiter}:* ${TOKEN_KIND.symbol}:a`,
    )
    expect(lexed('x^2 >= 1.5e-3')).toBe(
      `${TOKEN_KIND.symbol}:x ${TOKEN_KIND.delimiter}:^ ${TOKEN_KIND.number}:2 ${TOKEN_KIND.delimiter}:>= ${TOKEN_KIND.number}:1.5e-3`,
    )
  })

  it('reads a number with a unit after it as a quantity', () => {
    expect(lexed('2.0 kg')).toBe(`${NODE_KIND.quantity}(${TOKEN_KIND.number}:2.0 ${TOKEN_KIND.unit}:kg)`)
    expect(lexed('9.81 m/s^2')).toBe(
      `${NODE_KIND.quantity}(${TOKEN_KIND.number}:9.81 ${TOKEN_KIND.unit}:m/s^2)`,
    )
  })

  it('reads a unit after `to`, and after `:` on the left of the `=`', () => {
    expect(lexed('v to km/h')).toBe(`${TOKEN_KIND.symbol}:v ${TOKEN_KIND.keyword}:to ${TOKEN_KIND.unit}:km/h`)
    expect(lexed('v:km/h = d / t')).toBe(
      `${TOKEN_KIND.symbol}:v ${TOKEN_KIND.delimiter}:: ${TOKEN_KIND.unit}:km/h ${TOKEN_KIND.delimiter}:= ${TOKEN_KIND.symbol}:d ${TOKEN_KIND.delimiter}:/ ${TOKEN_KIND.symbol}:t`,
    )
  })

  it('reads a call as a node: its name, its brackets and what is between them', () => {
    expect(lexed('sqrt(x + 1)')).toBe(
      `${NODE_KIND.call}(${TOKEN_KIND.symbol}:sqrt ${TOKEN_KIND.delimiter}:( ${TOKEN_KIND.symbol}:x ${TOKEN_KIND.delimiter}:+ ${TOKEN_KIND.number}:1 ${TOKEN_KIND.delimiter}:))`,
    )
  })

  it('reads an @ function as a call, and an @ constant with its precision', () => {
    expect(lexed('@a_0:4')).toBe(`${TOKEN_KIND.builtin}:@a_0:4`)
    expect(lexed('@tuple(r:3, theta:deg) = p')).toBe(
      `${NODE_KIND.call}(${TOKEN_KIND.builtin}:@tuple ${TOKEN_KIND.delimiter}:( ${TOKEN_KIND.symbol}:r ${TOKEN_KIND.delimiter}:: ${TOKEN_KIND.number}:3 ${TOKEN_KIND.delimiter}:, ${TOKEN_KIND.symbol}:theta ${TOKEN_KIND.delimiter}:: ${TOKEN_KIND.unit}:deg ${TOKEN_KIND.delimiter}:)) ${TOKEN_KIND.delimiter}:= ${TOKEN_KIND.symbol}:p`,
    )
  })

  it('reads keywords, strings, ± and what it doesn’t know', () => {
    expect(lexed('a mod b')).toBe(`${TOKEN_KIND.symbol}:a ${TOKEN_KIND.keyword}:mod ${TOKEN_KIND.symbol}:b`)
    expect(lexed('x ± 1')).toBe(`${TOKEN_KIND.symbol}:x ${TOKEN_KIND.keyword}:± ${TOKEN_KIND.number}:1`)
    expect(lexed('"hi there"')).toBe(`${TOKEN_KIND.string}:"hi there"`)
    expect(lexed('x $ y')).toBe(`${TOKEN_KIND.symbol}:x ${TOKEN_KIND.unknown}:$ ${TOKEN_KIND.symbol}:y`)
  })

  describe('with the modules’ rules', () => {
    it('reads a vector as a node, and with a unit, as a quantity (vectors)', () => {
      expect(lexed('<3.0, 4.0> N')).toBe(
        `${NODE_KIND.quantity}(${VECTOR_NODE.vector}(${TOKEN_KIND.delimiter}:< ${TOKEN_KIND.number}:3.0 ${TOKEN_KIND.delimiter}:, ${TOKEN_KIND.number}:4.0 ${TOKEN_KIND.delimiter}:>) ${TOKEN_KIND.unit}:N)`,
      )
      // (Where no value can start, < is a comparison.)
      expect(lexed('a < b')).toBe(`${TOKEN_KIND.symbol}:a ${TOKEN_KIND.delimiter}:< ${TOKEN_KIND.symbol}:b`)
    })

    it('reads a species in braces as one token (chemistry)', () => {
      expect(lexed('M({H2O})')).toContain(`${CHEM_TOKEN.species}:{H2O}`)
    })

    it('reads the settings after a ; in a series call as one token (series)', () => {
      expect(lexed('@plot(t, x; fit linear, x from 0 to 2)')).toBe(
        `${NODE_KIND.call}(${TOKEN_KIND.builtin}:@plot ${TOKEN_KIND.delimiter}:( ${TOKEN_KIND.symbol}:t ${TOKEN_KIND.delimiter}:, ${TOKEN_KIND.symbol}:x ${TOKEN_KIND.delimiter}:; ${SERIES_TOKEN.settings}:fit linear, x from 0 to 2 ${TOKEN_KIND.delimiter}:))`,
      )
      // (Anywhere else, ; is mathjs's.)
      expect(lexed('a = 1; b = 2')).not.toContain(SERIES_TOKEN.settings)
    })

    it('lists each rule with its owner, the modules’ before the core’s', () => {
      const owners = declaredLexRules().map((r) => r.owner)
      expect(owners).toContain(LEXER_CORE)
      expect(owners).toContain(VectorModule.name)
      expect(owners.indexOf(LEXER_CORE)).toBeGreaterThan(owners.lastIndexOf(VectorModule.name))
    })
  })

  it('reads a value in text as a node holding its expression (not one in $…$ maths)', () => {
    const line = (text: string) => shape(encode(text).body[0].parts)
    expect(line('> V is {{V:4 to mL}}, $x_{{1}}$.')).toBe(
      // (The shape's parts are joined with a space, after the text's own.)
      `${TOKEN_KIND.marker}:> ${TOKEN_KIND.text}:V is  ${NODE_KIND.value}(${TOKEN_KIND.delimiter}:{{ ${TOKEN_KIND.symbol}:V ${TOKEN_KIND.delimiter}:: ${TOKEN_KIND.number}:4 ${TOKEN_KIND.keyword}:to ${TOKEN_KIND.unit}:mL ${TOKEN_KIND.delimiter}:}}) ${TOKEN_KIND.text}:,  ${TOKEN_KIND.maths}:$x_{{1}}$ ${TOKEN_KIND.text}:.`,
    )
    // (A formula in text is a module's markup: chemistry's. `$$` is just text, and so is `x_{max}`'s brace.)
    expect(line('> Add {Na^+} to x_{max} for $$5')).toBe(
      `${TOKEN_KIND.marker}:> ${TOKEN_KIND.text}:Add  ${CHEM_TOKEN.formula}:{Na^+} ${TOKEN_KIND.text}: to x_{max} for $$5`,
    )
    expect(line('## Run {{n}}')).toBe(
      `${TOKEN_KIND.marks}:## ${TOKEN_KIND.text}:Run  ${NODE_KIND.value}(${TOKEN_KIND.delimiter}:{{ ${TOKEN_KIND.symbol}:n ${TOKEN_KIND.delimiter}:}})`,
    )
  })

  it('loses nothing: every expression reads back to its text', () => {
    for (const text of [
      'F = m * a', '  v:km/h = d / t  ', '@tuple(r:3, theta:deg) = p', '<3.0, 4.0> N + <1, 2> N', 'M({H2O}) to g/mol',
      '@table(t, x; fit linear)', 'x ± 1', '"a" $ ¿', 'f(g(h(1)), [1, 2; 3, 4])', 'sqrt(', '<1, 2', '9.81 m/s^2 to ft/s^2',
      // A rule reading past the end of a call's brackets (a `{species}` taking the call's `)`) read it twice.
      'h({)}', 'f({a) + 1}', '2.0 mol ({EDTA)}',
    ]) {
      expect(lexExpression(text).map(textOf).join('')).toBe(text)
    }
  })
})
