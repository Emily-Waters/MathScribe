/** Chemistry: molarity, species as units, formulas in text, reactions, and display names. */
import { describe, expect, it } from 'vitest'
import { last, lines, readable, sheet, value } from '../../../../test/helpers.ts'
import { BLOCK_KIND, type Block } from '../../../blocks.ts'
import { DEFAULT_LATEX_OPTIONS, toLatexDocument } from '../../../latex.ts'
import { docxParts } from '../../../docx.ts'
import { formulaTex, withFormulas } from './chemistry.ts'
import { SYMBOL_KIND, collectSymbols } from '../../../document.ts'

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
    expect(value('m = 5.00 g {NaOH}\nn = m / (40.00 g / 1 mol) {NaOH}')).toBe('0.125 mol NaOH')
  })

  it('qualify a mass or an amount as the unit says: a molar mass is a mass of it per amount of it', () => {
    expect(value('m = 5.00 g {NaOH}')).toBe('5.00 g NaOH')
    expect(value('M = (40.00 g / 1 mol) {NaOH}')).toBe('40.00 \\fracg NaOHmol NaOH')
    expect(value('M = 40.00 g/mol {NaOH}')).toBe('40.00 \\fracg NaOHmol NaOH')
    expect(value('rho = 2.0 g/L {NaOH}')).toBe('2.0 g NaOH/L')
    expect(last('d = 5.0 m {NaOH}').error).toMatch(/says what a mass or an amount is of, but this is neither/)
  })

  it('can follow a bracket or a name, and are shown after it', () => {
    expect(value('n_1 = 2.0 mol\nn = n_1 {H2O}')).toBe('2.0 mol H2O')
    expect(last('M = (18.02 g / 1 mol) {H2O}').tex).toMatch(/\\right\)\\,\\ce\{H2O\}/)
    expect(value('M = (18.02 g / 1 mol) {H2O}')).toBe('18.02 \\fracg H2Omol H2O')
    expect(last('n = 2.0 mol {H2O}\nm = n {NaCl}').error).toMatch(/already of a species/)
  })

  it('are strict: a mass, amount or molar mass without one doesn’t mix with one with one', () => {
    const strict = /something here has none/
    expect(last('m = 5.00 g {NaOH}\nn = m / (40.00 g/mol)').error).toMatch(strict)
    expect(last('NaOH = @chem.substance({NaOH})\nn = 5.00 g / NaOH.M').error).toMatch(strict)
    expect(last('n = 0.125 mol {NaOH}\nm = n * (40.00 g/mol)').error).toMatch(strict)
    // (Without species anywhere, nothing changes.)
    expect(value('n = 5.00 g / (40.00 g/mol)')).toBe('0.125 mol')
  })

  it('don’t mix: a mass of one species over the molar mass of another is an error', () => {
    expect(last('NaOH = @chem.substance({NaOH})\nm = 5.00 g {HCl}\nn = m / NaOH.M').error)
      .toMatch(/This mixes species: it has HCl per NaOH and an amount of NaOH\. .*\(1 mol \{HCl\}\) \/ \(1 mol \{NaOH\}\)/)
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

  it('can have subscripts, as names and headings do; \\_ is a plain underscore', () => {
    expect(lines('m:"Mass of m_ball" = 0.50 kg')[0].tex).toMatch(/^\\text\{Mass of \}\\text\{m\}_\{\\text\{ball\}\} = /)
    expect(lines('x:"Largest x_{max}" = 2 m')[0].tex).toMatch(/^\\text\{Largest \}\\text\{x\}_\{\\text\{max\}\} = /)
    expect(lines('F:"Force F_net_x" = 2 N')[0].tex).toMatch(/^\\text\{Force \}\\text\{F\}_\{\\text\{net\},\\text\{x\}\} = /)
    expect(lines('f:"file\\_name" = 2')[0].tex).toMatch(/^\\text\{file\\_name\} = /)
    expect(lines('n:"Moles of {Na^+} in V_2" = 2 mol')[0].tex).toContain('\\ce{Na^+}')
  })

  it('draw a subscript that starts with a capital as a formula, braced or not', () => {
    expect(lines('m:"Mass of m_{H2O}" = 18 g')[0].tex).toMatch(/^\\text\{Mass of \}\\text\{m\}_\{\\ce\{H2O\}\} = /)
    expect(lines('c:"c_{Na^+}" = 0.10 M')[0].tex).toMatch(/^\\text\{c\}_\{\\ce\{Na\^\+\}\} = /)
    expect(lines('m:"m_H2O" = 18 g')[0].tex).toContain('_{\\ce{H2O}}')
    expect(lines('x:"x_{max}" = 2 m')[0].tex).toContain('_{\\text{max}}')
  })

  it('can come from a template: words with {{x}} where each argument goes', () => {
    const source = 'massName(x) = "m_{{x}}"\nm_w:massName(H2O) = 18.02 g\nconc(ion, where) = "[{{{ion}}}] in {{where}}"\nc:conc(Na^+, the flask) = 0.10 M'
    const [definition, mass, , concentration] = lines(source)
    expect(definition.error).toBeUndefined()
    expect(definition.tex).toMatch(/^\\mathrm\{massName\}\\left\(x\\right\) = \\text\{m\}_\{\\text\{x\}\}$/)
    expect(mass.tex).toMatch(/^\\text\{m\}_\{\\ce\{H2O\}\} = /)
    expect(concentration.tex).toMatch(/^\\text\{\[\}\\ce\{Na\^\+\}\\text\{\] in the flask\} = /)
    expect(last(`${source}\ny = 2 * m_w`).tex).toContain('\\text{m}_{\\ce{H2O}}')
  })

  it('from a template, combine with other settings, and explain a missing template or a wrong count', () => {
    expect(lines('massName(x) = "m_{{x}}"\nm:3:massName(Na) = 22.9898 g')[1].tex).toMatch(/= 23\.0\\,\\mathrm\{g\}$/)
    expect(last('m:nope(H2O) = 1 g').error).toBe('nope( ) isn\'t a display-name template: define one first, as nope(x) = "…{{x}}…".')
    expect(last('massName(x) = "m_{{x}}"\nm:massName(a, b) = 1 g').error).toBe('massName takes 1 argument (x), not 2.')
  })

  it('draw a formula subscript in headings and block titles too, in both exports', () => {
    const source = '## Mass of m_{H2O}\nMoles of n_{Na^+} {\n    x = 1\n}'
    const tex = toLatexDocument(sheet(source).blocks, DEFAULT_LATEX_OPTIONS)
    expect(tex).toContain('Mass of m${}_{\\ce{H2O}}$')
    expect(tex).toContain('\\usepackage[version=4]{mhchem}')
    expect(tex).toContain('{}_{\\ce{Na^+}}')
    const doc = docxParts(sheet(source).blocks, DEFAULT_LATEX_OPTIONS)['word/document.xml']
    expect(doc).toMatch(/Mass of m.*<m:sSub>/)
  })

  it('combine with other settings, and explain a value that can’t be worked out', () => {
    expect(readable(last('n:3:"Moles":sci = 2.0 mol').tex)).toContain('2.00')
    expect(last('n:"Moles in {{V_x}}" = 2.0 mol').error).toBe('In its display name, {{V_x}}: Undefined symbol V_x')
  })
})

describe('@chem.substance: a substance and its members', () => {
  /** A substance of this formula, X, then a line about it. */
  const of = (formula: string, then: string) => `X = @chem.substance({${formula}})\n${then}`

  it('has a molar mass, its elements’ added up, groups and hydrates included, with sig figs by the addition rule', () => {
    expect(value(of('H2O', 'X.M'))).toBe('18.015 \\fracg H2Omol H2O')
    expect(value(of('NaCl', 'X.M'))).toBe('58.44 \\fracg NaClmol NaCl')
    expect(value(of('Ca(OH)2', 'X.M'))).toBe('74.092 \\fracg Ca(OH)2mol Ca(OH)2')
    expect(value(of('CuSO4*5H2O', 'X.M'))).toBe('249.68 \\fracg CuSO4*5H2Omol CuSO4*5H2O')
    expect(value(of('K4[Fe(CN)6]', 'X.M'))).toBe('368.35 \\fracg K4[Fe(CN)6]mol K4[Fe(CN)6]')
    // Dietzeite: 7 Ca(IO3)2 and 8 CaCrO4 (a number against a part of a formula with a dot is that part's).
    expect(value(of('7Ca(IO3)2*8CaCrO4', 'X.M'))).toBe('3977.7 \\fracg 7Ca(IO3)2*8CaCrO4mol 7Ca(IO3)2*8CaCrO4')
  })

  it('leaves a charge and a state out of the molar mass, but they’re part of the species, as written', () => {
    expect(value(of('SO4^2-', 'X.M'))).toBe('96.06 \\fracg SO4^2-mol SO4^2-')
    expect(value(of('NaCl(aq)', 'X.M'))).toBe('58.44 \\fracg NaCl(aq)mol NaCl(aq)')
  })

  it('shows its molar mass worked out where it’s defined, each element’s term without its species', () => {
    expect(readable(lines(of('H2O', ''))[0].tex))
      .toBe('H2O:\\quad M_X = 2 M_H+ M_O = 2\\times 1.008 g/mol+ 15.999 g/mol = 18.015 \\fracg H2Omol H2O')
    expect(lines(of('H2O', ''))[0].info).toMatch(/1 mol of H2O until its amount is set/)
  })

  it('is 1 mol until an amount is set, so its elements’ members are per mole', () => {
    expect(value(of('H2O', 'X.H.n'))).toBe('2 mol H')
    expect(value(of('H2O', 'X.m'))).toBe('18.015 g H2O')
  })

  it('works out every member from an amount or a mass that’s set, the substance’s or an element’s', () => {
    expect(value(of('H2SO4', 'X.n = 2.00 mol\nX.m'))).toBe('196 g H2SO4')
    expect(value(of('H2SO4', 'X.n = 2.00 mol\nX.H.n'))).toBe('4.00 mol H')
    expect(value(of('H2SO4', 'X.n = 2.00 mol\nX.H.m'))).toBe('4.03 g H')
    expect(value(of('NaOH', 'X.m = 5.00 g\nX.n'))).toBe('0.125 mol NaOH')
    expect(value(of('H2SO4', 'X.O.m = 1.00 g\nX.m'))).toBe('1.53 g H2SO4')
    // A value with no unit is mol (an amount) or g (a mass).
    expect(value(of('H2O', 'X.n = 2\nX.H.n'))).toBe('4 mol H')
  })

  it('has each element’s mass fraction', () => {
    // (At 1 mol, exact, its sig figs are the molar masses': 2.016 g over 98.07 g.)
    expect(value(of('H2SO4', 'X.H.w'))).toBe('0.02056')
    expect(value(of('H2SO4', 'X.n = 2.00 mol\nX.H.w'))).toBe('0.0206')
  })

  it('follows the latest amount set, from that line on, as a variable assigned again does', () => {
    const source = of('H2O', 'X.H.n\nX.n = 2\nX.H.n')
    expect(lines(source).map((l) => l.tex.split(' = ').at(-1))).toEqual([expect.anything(), '2\\,\\mathrm{mol}\\,\\ce{H}', expect.anything(), '4\\,\\mathrm{mol}\\,\\ce{H}'])
  })

  it('shows a member on a line of its own worked out, back to what was set', () => {
    expect(readable(last(of('H2SO4', 'X.n = 2.00 mol\nX.m')).tex)).toMatch(/^m_X = n_X M_X = 2\.00 mol H2SO4\\times 98\.07 /)
  })

  it('is drawn as chemistry, its members too', () => {
    expect(last('H2O = @chem.substance({H2O})\nH2O.H.n').tex).toMatch(/^n_\{\\ce\{H\},\\ce\{H2O\}\} = n_\{\\ce\{H2O\}\} /)
  })

  it('takes a value already of a species as it is, as from a mole ratio', () => {
    const source = [
      'r = @chem.reaction({2 H2 + O2 -> 2 H2O})',
      'H2 = @chem.substance({H2})',
      'H2O = @chem.substance({H2O})',
      'H2.m = 4.00 g',
      'H2O.n = H2.n * r.H2O / r.H2',
      'H2O.m',
    ].join('\n')
    expect(lines(source).map((l) => l.error)).toEqual(Array(6).fill(undefined))
    expect(value(source)).toBe('35.7 g H2O')
  })

  it('explains a member it doesn’t have, or one that can’t be set', () => {
    expect(last(of('H2O', 'X.Q.n')).error).toMatch(/X\.Q\.n isn't one of X's members/)
    expect(last(of('H2O', 'X.M = 3')).error).toMatch(/X\.M can't be set/)
  })

  it('explains an unknown element, a formula without braces, and a count in front', () => {
    expect(last(of('Xy2', '')).error ?? lines(of('Xy2', ''))[0].error).toMatch(/Xy, which isn't an element/)
    expect(lines('X = @chem.substance(H2O)')[0].error).toMatch(/in braces/)
    expect(lines(of('Ca(OH2', ''))[0].error).toMatch(/missing/)
    expect(lines(of('2 H2O', ''))[0].error).toMatch(/one formula, without a count/)
    expect(last('M = @chem.foo(1)').error).toMatch(/@chem has no function foo/)
  })

  it('works its molar mass out from the elements’ own, which a sheet doesn’t write', () => {
    expect(last('M = @chem.mm.Na').error).toMatch(/@chem\.mm\.Na isn't written in a sheet: a molar mass is a substance’s/)
    expect(last('@chem.mm.Na:3').error).toMatch(/isn't written in a sheet/)
  })
})

describe('@chem.reaction: a balanced reaction', () => {
  it('works a stoichiometric calculation through, with mole ratios from its coefficients', () => {
    const source = [
      'r = @chem.reaction({2 H2 + O2 -> 2 H2O})',
      'H2 = @chem.substance({H2})',
      'H2O = @chem.substance({H2O})',
      'n_H2 = 4.00 g {H2} / H2.M',
      'n_H2O = n_H2 * r.H2O / r.H2',
      'm_H2O = n_H2O * H2O.M',
    ].join('\n')
    expect(lines(source).map((l) => l.error)).toEqual(Array(6).fill(undefined))
    expect(value(source)).toBe('35.7 g H2O')
    expect(value(`${source}\nratio = r.H2O / r.H2`)).toBe('1 mol H2O/mol H2')
  })

  it('has each coefficient as an exact amount, and says so', () => {
    expect(value('r = @chem.reaction({2 H2 + O2 -> 2 H2O})\nx = r.O2')).toBe('1 mol O2')
    expect(lines('r = @chem.reaction({2 H2 + O2 -> 2 H2O})')[0].info).toMatch(/^Balanced\. .*r\.H2 = 2 mol H2, r\.O2 = 1 mol O2, r\.H2O = 2 mol H2O/)
  })

  it('says what doesn’t balance: atoms, or charge', () => {
    expect(lines('r = @chem.reaction({H2 + O2 -> H2O})')[0].error)
      .toBe('{H2 + O2 -> H2O}: It isn\'t balanced: O has 2 on the left and 1 on the right.')
    expect(lines('r = @chem.reaction({Fe^3+ + e^- -> Fe})')[0].error).toMatch(/the charge is 2 on the left and 0 on the right/)
    expect(lines('r = @chem.reaction({Fe^3+ + 3 e^- -> Fe})')[0].error).toBeUndefined()
    expect(lines('r = @chem.reaction({Ag^+ + Cl^- -> AgCl})')[0].error).toBeUndefined()
    expect(lines('r = @chem.reaction({Ag^+ + Cl -> AgCl})')[0].error).toMatch(/the charge is 1 on the left and 0 on the right/)
  })

  it('names a species that isn’t a name by its letters and digits', () => {
    expect(value('r = @chem.reaction({Ca(OH)2 + 2 HCl -> CaCl2 + 2 H2O})\nx = r.CaOH2')).toBe('1 mol Ca(OH)2')
  })

  it('is a line of its own: in an expression, it’s explained', () => {
    expect(last('x = 2 * @chem.reaction({H2 -> H2})').error).toMatch(/written on a line of its own, with a name/)
  })
})

describe('@chem.species: names for species', () => {
  const named = '@chem.species {\n    dietzeite = {7Ca(IO3)2*8CaCrO4}\n    edta:formula = {EDTA^4-}\n}\n'

  it('stand for their formula wherever braces take one, so they’re the same species', () => {
    const D = 'D = @chem.substance({dietzeite})\n'
    expect(value(`${named}${D}D.M`)).toBe('3977.7 \\fracg dietzeitemol dietzeite')
    expect(value(`${named}${D}m = 5.00 g {dietzeite}\nn = m / D.M`)).toBe('0.00126 mol dietzeite')
    // The name and the formula are one species: they cancel.
    expect(value(`${named}${D}m = 5.00 g {7Ca(IO3)2*8CaCrO4}\nn = m / D.M`)).toBe('0.00126 mol dietzeite')
  })

  it('can be used above where they’re named', () => {
    expect(value('m = 5.00 g {dietzeite}\n@chem.species dietzeite = {7Ca(IO3)2*8CaCrO4}')).toBe('5.00 g dietzeite')
    expect(lines('m = 5.00 g {dietzeite}\n@chem.species dietzeite = {7Ca(IO3)2*8CaCrO4}')[0].error).toBeUndefined()
  })

  it('are shown by name unless declared :formula, and a line can say either', () => {
    expect(value(`${named}n = 0.10 mol {edta}`)).toBe('0.10 mol EDTA^4-')
    expect(value(`${named}m:formula = 5.00 g {dietzeite}`)).toBe('5.00 g 7Ca(IO3)2*8CaCrO4')
    expect(value(`${named}n:name = 0.10 mol {edta}`)).toBe('0.10 mol edta')
  })

  it('show in prose as the word, or the formula if declared so', () => {
    const texts = sheet(`${named}> A {dietzeite} sample with {edta}.`).blocks.filter((b) => b.kind === BLOCK_KIND.text)
    expect(texts.at(-1)).toMatchObject({ text: 'A dietzeite sample with $\\ce{EDTA^4-}$.' })
  })

  it('work in a reaction, whose member is the name', () => {
    expect(value('@chem.species water = {H2O}\nr = @chem.reaction({2 H2 + O2 -> 2 water})\nx = r.water')).toBe('2 mol water')
  })

  it('can’t be a formula, an electron or a state, and can’t be named twice', () => {
    /** Each named species' error, in order. */
    const errors = (src: string) => sheet(src).blocks.flatMap((b) => (b.kind === BLOCK_KIND.species ? b.entries.map((e) => e.error) : []))
    expect(errors('@chem.species CO = {CO2}')[0]).toMatch(/is a formula already/)
    expect(errors('@chem.species aq = {H2O}')[0]).toMatch(/means something in a formula already/)
    expect(errors('@chem.species {\n    w = {H2O}\n    w = {D2O}\n}')[1]).toMatch(/already the name of \{H2O\}/)
    // (What it names needn't be a formula: a species can be any label, as {EDTA} is.)
    expect(errors('@chem.species edta = {EDTA^4-}')[0]).toBeUndefined()
    expect(errors('@chem.species {\n    not a name\n}')[0]).toMatch(/each line names a species/)
  })

  it('are suggested in the editor’s symbols, with their formula', () => {
    const src = `${named}x = 1`
    const symbols = collectSymbols(sheet(src), src).filter((s) => s.kind === SYMBOL_KIND.species)
    expect(symbols.map((s) => s.name)).toEqual(['dietzeite', 'edta'])
    expect(symbols[0].tex).toBe('\\ce{7Ca(IO3)2*8CaCrO4}')
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
