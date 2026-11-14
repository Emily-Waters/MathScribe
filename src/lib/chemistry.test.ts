/** Chemistry: molarity, species as units, formulas in text, reactions, and display names. */
import { describe, expect, it } from 'vitest'
import { last, lines, readable, sheet, value } from '../test/helpers.ts'
import { BLOCK_KIND, type Block } from './blocks.ts'
import { DEFAULT_LATEX_OPTIONS, toLatexDocument } from './latex.ts'
import { docxParts } from './docx.ts'
import { formulaTex, withFormulas } from './chemistry.ts'

const blocksOf = (source: string, kind: Block['kind']) => sheet(source).blocks.filter((b) => b.kind === kind)

describe('molarity', () => {
  it('is a unit, M (with mM and µM), and leaves MPa as megapascals', () => {
    expect(value('c = 0.100 M')).toBe('0.100 M')
    expect(value('c = 2.5 mM')).toBe('2.5 mM')
    expect(value('p = 5 MPa')).toBe('5 MPa')
  })

  it('is how a worked-out concentration is shown, not mol/m³', () => {
    expect(value('c = 0.100 mol/L\nd = c * 2')).toBe('0.200 M')
    expect(value('n = 0.00250 mol\nV = 25.00 mL\nc = n / V')).toBe('0.100 M')
  })
})

describe('species', () => {
  const data = 'n_EDTA = 2.755e-4 mol {EDTA}\n'

  it('go with an amount, and cancel like units: mol EDTA × (mol X / mol EDTA) is mol X', () => {
    expect(value(`${data}n_X = n_EDTA * (1 mol {X}) / (1 mol {EDTA})`)).toBe('0.0002755 mol X')
    expect(value('c = 0.100 M {NaOH}\nn = c * 17.10 mL')).toBe('0.00171 mol NaOH')
    expect(value('m = 5.00 g {NaOH}\nn = m / (40.00 g/mol)')).toBe('0.125 mol NaOH')
  })

  it('count a whole number of a species as exact (a coefficient), but not one with a decimal point', () => {
    expect(value(`${data}n_Ca = n_EDTA * (1 mol {Ca^2+}) / (6 mol {EDTA})`)).toBe('0.00004592 mol Ca^2+')
    expect(value('n = 1.0 mol {Na}\nm = n * 2')).toBe('2.0 mol Na')
  })

  it('can’t be added to a different species', () => {
    expect(last(`${data}n_X = 1.0e-4 mol {X}\nt = n_EDTA + n_X`).error).toMatch(/different species/)
  })

  it('stay with an amount converted to another unit', () => {
    expect(value('n = 0.00171 mol {NaOH}\nm = n to mmol')).toBe('1.71 mmol NaOH')
  })

  it('show as chemistry: mol EDTA, and a mole ratio as mol X/mol EDTA', () => {
    expect(last(data).tex).toContain('\\mathrm{mol}\\,\\ce{EDTA}')
    expect(last('r = (1 mol {X}) / (1 mol {EDTA})').tex).toContain('= 1\\,\\mathrm{mol}\\,\\ce{X}/\\mathrm{mol}\\,\\ce{EDTA}')
  })
})

describe('formulas', () => {
  it('in braces are chemistry: {Ca^2+} → \\ce{Ca^2+}, and {{…}} is still a value', () => {
    expect(formulaTex(' Ca^2+ ')).toBe('\\ce{Ca^2+}')
    expect(withFormulas('The {Na^+} and {{x}} and $a_{b}$')).toBe('The $\\ce{Na^+}$ and {{x}} and $a_{b}$')
  })

  it('work in text and headings, beside values', () => {
    const [text] = blocksOf('c = 0.100 M\n> The {Na^+} concentration was {{c}}.', BLOCK_KIND.text)
    expect(text).toMatchObject({ text: 'The $\\ce{Na^+}$ concentration was $0.100\\,\\mathrm{M}$.' })
    expect(blocksOf('## Moles of {Mg^2+}', BLOCK_KIND.heading)[0]).toMatchObject({ text: 'Moles of $\\ce{Mg^2+}$' })
    // A subscript in a heading is still a subscript.
    expect(blocksOf('## Orbital 2p_{z}', BLOCK_KIND.heading)[0]).toMatchObject({ text: 'Orbital 2p_{z}' })
  })

  it('on a line of their own are a reaction, displayed', () => {
    expect(blocksOf('{OH^-(aq) + H3O^+(aq) -> 2 H2O(l)}', BLOCK_KIND.latex)[0])
      .toMatchObject({ latex: '\\ce{OH^-(aq) + H3O^+(aq) -> 2 H2O(l)}' })
  })

  it('bring mhchem into the LaTeX export only when there are some, and go into Word', () => {
    expect(toLatexDocument(sheet('x = 1').blocks)).not.toContain('mhchem')
    const blocks = sheet('> The {Na^+} ion\n{Na^+ + Cl^- -> NaCl}').blocks
    expect(toLatexDocument(blocks, DEFAULT_LATEX_OPTIONS)).toContain('\\usepackage[version=4]{mhchem}')
    expect(docxParts(blocks, DEFAULT_LATEX_OPTIONS)['word/document.xml']).toContain('<m:t xml:space="preserve">Na</m:t>')
  })
})

describe('display names', () => {
  it('show instead of the name, where it’s defined and wherever it’s used', () => {
    const source = 'n_X:"Moles of X" = 2.755e-4 mol {X}\ny = 2 * n_X'
    expect(lines(source)[0].tex).toMatch(/^\\text\{Moles of X\} = /)
    expect(last(source).tex).toContain('2\\times \\text{Moles of X}')
  })

  it('are set apart with × in a product, being words', () => {
    expect(last('c:"Molarity" = 0.100 M\nV:"Volume" = 25.00 mL\nn = c * V').tex).toContain('\\text{Molarity}\\times \\text{Volume}')
  })

  it('can hold formulas and values, the values as they were when it was defined', () => {
    const source = 'V_s = 25.00 mL\nn:"Moles of {Ca^2+} in {{V_s}}" = 1.0 mol {Ca^2+}\nV_s = 50.00 mL\nc = n / V_s'
    const label = '\\text{Moles of}\\ \\ce{Ca^2+}\\ \\text{in}\\ 25.00\\,\\mathrm{mL}'
    expect(lines(source)[1].tex.startsWith(label)).toBe(true)
    expect(last(source).tex).toContain(label)
  })

  it('combine with other settings, and explain a value that can’t be worked out', () => {
    expect(readable(last('n:3:"Moles":sci = 2.0 mol').tex)).toContain('2.00')
    expect(last('n:"Moles in {{V_x}}" = 2.0 mol').error).toBe('In its display name, {{V_x}}: Undefined symbol V_x')
  })
})

describe('@chem: elements’ molar masses', () => {
  it('are in g/mol, with the digits IUPAC gives unless asked for others', () => {
    expect(value('M = @chem.Na')).toBe('22.990 g/mol')
    expect(value('M = @chem.Cl')).toBe('35.45 g/mol')
    expect(value('M = @chem.Na:3')).toBe('23.0 g/mol')
  })

  it('suggest the element meant, and keep symbols case-sensitive', () => {
    expect(last('M = @chem.Xx').error).toMatch(/Unknown constant @chem\.Xx/)
  })

  it('can be declared sheet-wide, as other constants can', () => {
    expect(value('@chem.Na:3\nM = @chem.Na')).toBe('23.0 g/mol')
  })
})

describe('@chem.mm: a compound’s molar mass', () => {
  it('adds up its elements, groups and hydrates included, with sig figs by the addition rule', () => {
    expect(value('M = @chem.mm({H2O})')).toBe('18.015 g/mol')
    expect(value('M = @chem.mm({NaCl})')).toBe('58.44 g/mol')
    expect(value('M = @chem.mm({Ca(OH)2})')).toBe('74.092 g/mol')
    expect(value('M = @chem.mm({CuSO4*5H2O})')).toBe('249.68 g/mol')
    expect(value('M = @chem.mm({K4[Fe(CN)6]})')).toBe('368.35 g/mol')
  })

  it('leaves out a charge and a state', () => {
    expect(value('M = @chem.mm({SO4^2-})')).toBe(value('M = @chem.mm({SO4})'))
    expect(value('M = @chem.mm({NaCl(aq)})')).toBe('58.44 g/mol')
  })

  it('shows the sum as working', () => {
    expect(readable(last('M = @chem.mm({H2O})').tex)).toContain('M_H')
  })

  it('gives an amount of a species from its mass', () => {
    expect(value('m = 5.00 g {NaOH}\nn = m / @chem.mm({NaOH})')).toBe('0.125 mol NaOH')
  })

  it('explains a coefficient, an unknown element, and a formula without braces', () => {
    expect(last('M = @chem.mm({2 H2O})').error).toMatch(/coefficient/)
    expect(last('M = @chem.mm({Xy2})').error).toMatch(/Xy, which isn't an element/)
    expect(last('M = @chem.mm(H2O)').error).toMatch(/in braces/)
    expect(last('M = @chem.mm({Ca(OH2})').error).toMatch(/missing/)
    expect(last('M = @chem.foo(1)').error).toMatch(/@chem has no function foo/)
  })
})

describe('@chem.total: amounts of different species', () => {
  const data = 'n_Na = 0.100 mol {Na^+}\nn_Cl = 0.200 mol {Cl^-}\n'

  it('adds them as plain amounts', () => {
    expect(value(`${data}n = @chem.total(n_Na, n_Cl)`)).toBe('0.300 mol')
    expect(value(`${data}n = @chem.total(n_Na, 50.0 mmol {K^+})`)).toBe('0.150 mol')
  })

  it('is written as a sum', () => {
    expect(readable(last(`${data}n = @chem.total(n_Na, n_Cl)`).tex)).toBe('n = n_Na+ n_Cl = 0.100 mol Na^++ 0.200 mol Cl^- = 0.300 mol')
  })

  it('still won’t add an amount to a mass', () => {
    expect(last(`${data}n = @chem.total(n_Na, 2.0 g)`).error).toBeDefined()
  })
})
