/**
 * The calculation rules, checked through whole sheets the way they're used:
 * units, sig figs, uncertainty, = vs ≈, percentages, constants, functions and
 * solving. Several of these pin down bugs found and fixed earlier.
 */
import { describe, expect, it } from 'vitest'
import { last, lineAt, lines, readable, sheet, shown, value } from '../test/helpers.ts'
import { UNCERTAINTY_WORKING, bareTuple, symbolTex } from './engine/index.ts'

describe('basic calculation', () => {
  it('substitutes values and tidies the unit', () => {
    expect(shown('m = 2.00 kg\nF = m * 9.81 m/s^2')).toBe('F = m\\times 9.81 m/s^2 = 2.00 kg\\times 9.81 m/s^2 = 19.6 N')
  })

  it('brackets a negative value it substitutes, so its sign doesn’t read as an operator', () => {
    expect(shown('a = 3.5e3 J\nb = -1.9e3 J\nW = a + b')).toBe('W = a+ b = 3.5e3 J+ (-1.9e3 J) = 1.6 kJ')
    expect(shown('g = -9.81 m/s^2\nF = g * 2.0 kg')).toBe('F = g\\times 2.0 kg = (-9.81 m/s^2)\\times 2.0 kg = -20. N')
    expect(shown('k = -2.0\nz = k * 3')).toBe('z = k\\times 3 = (-2.0)\\times 3 = -6.0')
  })

  it('converts with to', () => {
    expect(shown('v = 25.0 m/s\nv to km/h')).toBe('v = 90.0 km/h')
  })

  it('reads a unit after a number as a unit, and warns when a variable was likely meant', () => {
    const l = last('m = 2.0 kg\nE = 1/2 m v^2')
    expect(l.warning).toMatch(/"m" after a number is read as a unit/)
  })
})

describe('Greek letters in names', () => {
  it('are shown as the letter, in front of the rest of the name', () => {
    expect(shown('E_f = 5.0 J\nE_i = 2.0 J\nΔE = E_f - E_i')).toBe('\\Delta E = E_f- E_i = 5.0 J- 2.0 J = 3.0 J')
    expect(last('Δv_x = 2.0 m/s').tex).toMatch(/^\\Delta v_\{x\} = /)
    expect(last('ω1 = 2.0').tex).toMatch(/^\\omega_\{1\} = /)
    expect(last('Δforce = 2.0 N').tex).toMatch(/^\\Delta \\mathrm\{force\} = /)
  })

  it('work like any name: in products, series and functions', () => {
    expect(value('ΔE = 3.0 J\nx = 2ΔE')).toBe('6.0 J')
    expect(value('Δt = [1.0 s, 1.2 s]\nΔt.avg')).toBe('(1.10 ± 0.10) s')
    expect(value('f(ω) = 2 * ω\ny = f(3.0)')).toBe('6.0')
    // A function named with a Greek letter, called with several arguments (not a bracketed list).
    const call = last('λ(L, n) = 2 * L / n\nL = 300.0 nm\nn1 = 2\nλ_1 = λ(L, n1)')
    expect(call.error).toBeUndefined()
    expect(call.tex).toMatch(/^\\lambda_\{1\} = /)
    expect(value('Λ(a, b) = a * b\nk = Λ(2.0, 3.0)')).toBe('6.0')
  })

  it('keep a spelled-out Delta with a space as an uncertainty', () => {
    expect(readable(last('E = 2.0 J pm 0.1 J\nDelta E =').tex)).toBe('\\Delta E = 0.1 J')
  })
})

describe('products', () => {
  const src = 'm = 2.00 kg\nv = 4.0 m/s\ntheta = 30. deg\nr = 2.0 m\nFn = 3.0\n'

  it('are written as in a textbook, with no dot between symbols', () => {
    expect(readable(last(`${src}E = 1/2 * m * v^2`).tex).split(' = ')[1]).toBe('\\frac12 m v^2') // ½mv²
    expect(readable(last(`${src}N = m * @g * cos(theta)`).tex).split(' = ')[1]).toBe('m g \\cos(\\theta)')
    expect(readable(last(`${src}C = 2 * pi * r`).tex).split(' = ')[1]).toBe('2 \\pi r')
    // Beside a word-like name, a dot, so words don't read as a phrase; after a number, a thin space.
    expect(last(`${src}G = Fn * m`).tex).toMatch(/^G = \\mathrm\{Fn\}\\cdot m =/)
    expect(last(`${src}H = 2 * Fn`).tex).toMatch(/^H = 2\\,\\mathrm\{Fn\} =/)
  })

  it('put × before a number, so numbers don’t run together or read as a mixed fraction', () => {
    // Substituted values: ½ × 2.00 kg × (4.0 m/s)².
    expect(shown(`${src}E = 1/2 * m * v^2`)).toBe('E = \\frac12 m v^2 = \\frac12\\times 2.00 kg\\times (4.0 m/s)^2 = 16 J')
    expect(readable(last(`${src}x = m * 2`).tex).split(' = ')[1]).toBe('m\\times 2')
    expect(readable(last(`${src}x = 2 * (1/3)`).tex).split(/ = | ≈ /)[1]).toBe('2\\times \\frac13')
  })

  it('bracket a sum or a negative factor', () => {
    expect(readable(last(`${src}y = m * (v + v)`).tex).split(' = ')[1]).toBe('m (v+ v)')
    expect(readable(last(`${src}z = m * -v`).tex).split(' = ')[1]).toBe('m (- v)')
  })

  it('show a dot between every factor with the dots option on', () => {
    expect(readable(last(`${src}E = 1/2 * m * v^2`, { productDots: true }).tex).split(' = ')[1]).toBe('\\frac12· m· v^2')
  })

  it('bracket only a value that needs it (in scientific notation, or raised to a power), with × before it', () => {
    // 8 × (9.11 × 10⁻³¹ kg) × (1.0 × 10⁻⁹ m)², not 8 × 9.11 × 10⁻³¹ kg × …
    expect(shown('m_e = 9.11e-31 kg\nL = 1.0e-9 m\nE = 8 * m_e * L^2').split(' = ')[2])
      .toBe('8\\times (9.11e-31 kg)\\times (1.0e-9 m)^2')
    expect(shown('r = 0.400 angstrom\np = 0.688 angstrom^-1.5\nP = 4 * pi * r^2 * p^2').split(' = ')[2])
      .toBe('4 \\pi\\times (0.400 Å)^2\\times (0.688 Å^-1.5)^2')
    // A value with a unit isn't, unless it's raised to a power: 9.81 m/s² × (2.0 s)², 4π × 250.0 Å.
    expect(shown('a = 9.81 m/s^2\nt = 2.0 s\nd = a * t^2').split(' = ')[2]).toBe('9.81 m/s^2\\times (2.0 s)^2')
    expect(shown('n = 4\nx = 250.0 angstrom\ny = n * pi * x').split(' = ')[2]).toBe('4 \\pi\\times 250.0 Å')
    // × before Euler's number, which would read as scientific notation after a number.
    expect(shown('s = 5.67\ny = s * e^2').split(' = ')[2]).toBe('5.67\\times e^2')
  })

  it('bracket a squared negative value in scientific notation once', () => {
    expect(last('p:sci = -0.0707 angstrom^-0.5\np^2').tex).toMatch(/= \{\\left\(-7\.07 \\times 10\^\{-2\}[^()]*\\right\)\}\^\{2\} =/)
  })

  it('end a negated value with a unit in its unit, so × follows it', () => {
    expect(shown('F = 500. N\ntheta = 30. deg\ny = -F * sin(theta)').split(' = ')[2]).toBe('-500. N\\times \\sin(30.°)')
  })

  it('nest brackets as ( ) inside [ ] inside ( ), never { }, and keep a call’s round', () => {
    const src = 'a = 1.0\nb = 2.0\nc = 3.0\n'
    expect(shown(`${src}y = ((a + b) * c)^2`).split(' = ')[1]).toBe('[(a+ b) c]^2')
    expect(shown(`${src}y = (((a + b) * c)^2 * a)^2`).split(' = ')[1]).toBe('([(a+ b) c]^2 a)^2')
    expect(shown(`${src}y = sin((a + b) * c)`).split(' = ')[1]).toBe('\\sin((a+ b) c)')
  })
})

describe('significant figures', () => {
  it('treats whole numbers as exact', () => {
    expect(value('d = 2 * 1.50 m')).toBe('3.00 m')
  })

  it('rounds sums to the least precise decimal place', () => {
    expect(value('x = 12.52 m + 3.1 m')).toBe('15.6 m')
  })

  it('doesn’t let number-only exponents limit the result', () => {
    expect(value('side = (4.00 m^2)^0.5')).toBe('2.00 m')
    expect(value('r = 0.400 angstrom\npsi = 0.688 angstrom^-1.5\nP = 4 * pi * r^2 * psi^2')).toBe('0.952 Å^-1')
  })

  it('shows a measured zero with its decimal places, and doesn’t let it limit a function', () => {
    const [theta, c] = lines('theta = 0.00 deg\nc = cos(theta)')
    expect(readable(theta.tex)).toBe('\\theta = 0.00°')
    expect(readable(c.tex)).toBe('c = \\cos(\\theta) = \\cos(0.00°) = 1')
  })

  it('keeps a plain 1 exact when 1.00 appears on the same line', () => {
    expect(shown('y = 1 * 1.00 m')).toBe('y = 1\\times 1.00 m = 1.00 m')
  })

  it('warns about ambiguous trailing zeros', () => {
    expect(last('L = 300 m').warning).toMatch(/Trailing zeros in 300/)
  })

  it('applies declared sig figs', () => {
    expect(value('third:3 = 1/3')).toBe('0.333')
  })
})

describe('uncertainty', () => {
  it('propagates in quadrature and shows the relative uncertainty', () => {
    const src = 'd = 3.50 m pm 0.02 m\nt = 1.21 s pm 0.03 s\nv = d / t\ndelta v / v'
    expect(resultOfLine(src, 3)).toBe('(2.89 ± 0.07) m/s')
    expect(resultOfLine(src, 4)).toBe('0.03')
  })

  it('accepts a percentage uncertainty', () => {
    expect(shown('m = 2.00 kg pm 2%')).toBe('m = 2.00 kg ± 2%')
  })

  describe('worked relatively, when asked', () => {
    const head = 'A = 2.00 m pm 0.02 m\nB = 3.0 s pm 0.1 s\nC = 4.00 kg pm 0.05 kg\nD = 1.50 m pm 0.03 m\n'
    const relative = { uncertaintyWorking: UNCERTAINTY_WORKING.relative }
    const both = (formula: string) => [shown(`${head}${formula}\ndelta Y`), shown(`${head}${formula}\ndelta Y`, relative)]

    it('writes a product or quotient’s as Y times its inputs’ relative uncertainties, each times its power', () => {
      const [derivatives, worked] = both('Y = A * B / C')
      expect(worked).toBe('\\delta Y = Y \\sqrt(\\frac\\delta AA)^2 + (\\frac\\delta BB)^2 + (\\frac\\delta CC)^2 = 1.50 m· s/kg \\times '
        + '\\sqrt(\\frac0.02 m2.00 m)^2 + (\\frac0.1 s3.0 s)^2 + (\\frac0.05 kg4.00 kg)^2 = 0.06 m· s/kg')
      // (The same result: only the working differs.)
      expect(worked.split(' = ').at(-1)).toBe(derivatives.split(' = ').at(-1))
      expect(shown(`${head}Y = 4 * pi^2 * A / B^2\ndelta Y`, relative)).toContain('(2 \\frac\\delta BB)^2')
      expect(shown(`${head}Y = sqrt(A / C)\ndelta Y`, relative)).toContain('(\\frac12 \\frac\\delta AA)^2')
    })

    it('writes a sum or difference’s as its inputs’ uncertainties in quadrature', () => {
      expect(shown(`${head}Y = A - D + 1.00 m\ndelta Y`, relative)).toBe('\\delta Y = \\sqrt(\\delta A)^2 + (\\delta D)^2 = \\sqrt(0.02 m)^2 + (0.03 m)^2 = 0.04 m')
    })

    it('writes any other formula’s by derivatives', () => {
      const [derivatives, worked] = both('Y = (A + D) / C')
      expect(worked).toBe(derivatives)
      expect(worked).toContain('\\partial')
    })
  })
})

describe('= or ≈', () => {
  const src = 'a = 1/3\nb = 2 * 3\nc = pi / 4\ns = sin(pi/6)\nF = 2.00 kg * 9.81 m/s^2'

  it('uses ≈ only for rounded results of exact inputs, by default', () => {
    const shownLines = lines(src).map((l) => readable(l.tex))
    expect(shownLines[0]).toContain('≈ 0.333333')
    expect(shownLines[1]).toBe('b = 2\\times 3 = 6')
    expect(shownLines[2]).toContain('≈ 0.785398')
    expect(shownLines[3]).toContain('= 0.5') // not ≈: floating-point noise isn't rounding
    expect(shownLines[4]).toContain('= 19.6 N')
  })

  it('uses ≈ for every rounded result with the option on', () => {
    expect(shown('F = 2.00 kg * 9.81 m/s^2', { approxRounded: true })).toContain('≈ 19.6 N')
  })
})

describe('to percent', () => {
  const src = 'P = 0.950 angstrom^-1\ndr = 0.010 angstrom\nshell = P * dr to percent\ntwice = 2 * shell\nbad = P to percent'

  it('shows a unitless result as a percentage, but stores the fraction', () => {
    expect(resultOfLine(src, 3)).toBe('0.95 %')
    expect(resultOfLine(src, 4)).toBe('0.019')
  })

  it('refuses a value with units', () => {
    expect(lineAt(src, 5).error).toMatch(/units of angstrom\^-1, so it can't be a percent/)
  })

  it('scales an uncertainty too', () => {
    expect(value('g = (0.120 pm 0.005) to percent')).toBe('(12.0 ± 0.5) %')
  })
})

describe('names with subscripts', () => {
  it('reads a letter, a number and letters as the letter with the rest lowered: v1x', () => {
    expect(symbolTex('v1x')).toBe('v_{1x}')
    expect(symbolTex('m1')).toBe('m_{1}')
  })

  it('shows a short subscript of labels as labels, and a word upright', () => {
    for (const [name, tex] of [['v_fx', 'v_{fx}'], ['p_tx', 'p_{tx}'], ['v_Ai', 'v_{Ai}'], ['F_AB', 'F_{AB}'], ['v_x1', 'v_{x1}']]) {
      expect(symbolTex(name)).toBe(tex)
    }
    for (const [name, tex] of [
      ['v_cm', 'v_{\\mathrm{cm}}'], ['x_eq', 'x_{\\mathrm{eq}}'], ['F_net_x', 'F_{\\mathrm{net},x}'], ['E_thermal', 'E_{\\mathrm{thermal}}'],
      // A formula is drawn as chemistry: c(Na), not c with an italic N and a; n(H₂O).
      ['c_Na', 'c_{\\ce{Na}}'], ['n_Mg', 'n_{\\ce{Mg}}'], ['n_H2', 'n_{\\ce{H2}}'], ['n_H2O', 'n_{\\ce{H2O}}'],
      // …but a single letter, or labels that aren't elements, are the physics they usually are.
      ['F_N', 'F_{N}'], ['T_C', 'T_{C}'],
    ]) {
      expect(symbolTex(name)).toBe(tex)
    }
  })
})

describe('to an angle unit', () => {
  it('reads a plain number as radians, as from asin, acos and atan', () => {
    expect(value('theta = asin(0.50) to deg')).toBe('30.°')
    expect(value('v_x = 3.0 m/s\nv_y = 4.0 m/s\ntheta = atan(v_y / v_x) to deg')).toBe('53°')
    expect(value('v_x = 3.0 m/s\nv_y = 4.0 m/s\ntheta = atan2(v_y, v_x) to deg')).toBe('53°')
    expect(value('theta = atan(0.75)\nphi = theta to deg')).toBe('37°')
    expect(value('p = @tuple(0.50, 1.00) to deg')).toBe('(29, 57)°')
  })

  it('still converts quantities, and explains a number with no unit', () => {
    expect(value('theta = 30.0 deg to rad')).toBe('0.524 rad')
    expect(lines('x = 3.0 to cm').at(-1)!.error).toBe("3 has no unit, so it can't be converted to cm: give it one (3.0 m to cm).")
  })
})

describe('unit display', () => {
  it('explains units that don’t match in plain words', () => {
    expect(last('m = 40. T\na = 9.81 m/s^2\nE = m * a * 2.0 m to J').error)
      .toMatch(/^This is in .*, which can't be converted to J\. Check the units/)
    expect(last('x = 2.0 m + 3.0 s').error).toMatch(/^The units don't match: values in different units/)
  })

  it('writes the micro prefix as µ, typed as u, µ or μ', () => {
    for (const typed of ['5.0 um', '5.0 µm', '5.0 μm']) expect(last(`a = ${typed}`).tex).toBe('a = 5.0\\,\\mu\\mathrm{m}')
    expect(last('g = 1.0 m/μs').tex).toBe('g = 1.0\\,\\mathrm{m}/\\mu\\mathrm{s}')
    expect(value('f = 250. nm to µm')).toBe('0.250 \\mum')
    // μ on its own is still a name (a friction coefficient, say).
    expect(value('μ = 0.40\nh = 2 * μ')).toBe('0.80')
  })

  it('keeps a typed value in its own unit, never an obscure prefix', () => {
    const src = 'm = 9.11e-31 kg\nm\nx = 2 * m\nL = 1.00e-10 m\nL'
    expect(lines(src).map((l) => readable(l.tex))).toEqual([
      'm = 9.11e-31 kg',
      'm = 9.11e-31 kg', // not 0.911 rg
      'x = 2 m = 2\\times (9.11e-31 kg) = 1.82e-30 kg',
      'L = 1.00e-10 m',
      'L = 1.00e-10 m', // not 100 pm
    ])
  })

  it('never gives a computed result an obscure prefix', () => {
    expect(value('x = 2 * 9.11e-31 kg')).toBe('1.82e-30 kg') // not 1.82 rg (ronto-grams)
    expect(value('E = 3 * 2.0e25 J')).toBe('6.0e25 J') // not 60 YJ (yotta-joules)
  })

  it('gives computed results a sensible prefix', () => {
    expect(resultOfLine('y = 1500. m * 2', 1)).toBe('3.000 km')
    expect(value('z = 0.00250 m * 2')).toBe('5.00 mm')
  })

  it('writes negative quantities without brackets', () => {
    expect(shown('x = -2.0 m')).toBe('x = -2.0 m')
    expect(shown('k = (-2.0 m)^2')).toBe('k = (-2.0 m)^2 = 4.0 m^2')
  })

  it('shows angstrom as Å', () => {
    expect(shown('r = 0.400 angstrom')).toBe('r = 0.400 Å')
  })
})

describe('constants', () => {
  it('uses 3 sig figs by default', () => {
    expect(value('E = @h * @c / 532 nm to eV')).toBe('2.33 eV')
  })

  it('takes a sheet-wide precision', () => {
    expect(value('@c:4\nt = 1.000 m / @c')).toBe('3.336e-9 s')
  })

  it('takes a sheet-wide unit', () => {
    const src = '@a_0:3 to angstrom\nr = 2 * @a_0'
    expect(readable(lineAt(src, 1).tex)).toBe('a_0 = 0.529 Å')
    expect(value(src)).toBe('1.06 Å')
  })

  it('supports your own constants', () => {
    expect(value('@constants {\n    rho_w = 998 kg/m^3\n}\nP = @rho_w * @g * 0.250 m to kPa')).toBe('2.45 kPa')
  })
})

describe('functions', () => {
  it('shows working in terms of what was passed in', () => {
    expect(shown('area(r) = pi * r^2\nr_1 = 2.0 cm\nA = area(r_1)')).toBe('A = \\pi r_1^2 = \\pi\\times (2.0 cm)^2 = 13 cm^2')
  })

  it('shows a number argument once, and a negative one in brackets', () => {
    expect(shown('f(x) = 2.0 m * x\ny = f(3.0)')).toBe('y = 2.0 m\\times 3.0 = 6.0 m')
    expect(shown('f(x) = 2.0 m * x\nz = f(-2.0)')).toBe('z = 2.0 m\\times (-2.0) = -4.0 m')
  })

  it('give a call inside a bigger expression the sig figs of its measured numbers', () => {
    const src = 'hyd(n) = -13.6 eV / n^2\ndE = hyd(3) - hyd(2)'
    expect(value(src)).toBe('1.89 eV')
    expect(value(`@layout.val {\n${src}\n}`)).toBe('1.89 eV')
  })

  describe('settings for the result', () => {
    it('give every call’s result those sig figs and unit, on an inline function', () => {
      const src = 'ang(y, x):3:deg = atan(y/x)\nphi = ang(1.0, 2.0)\nphi\ns = sin(ang(1.00, 2.00))'
      expect(readable(lineAt(src, 1).tex)).toBe('ang(y, x) = \\tan^-1(\\fracyx)\\quad\\textin °')
      expect(resultOfLine(src, 2)).toBe('26.6°') // 3 sig figs, though the inputs have 2
      expect(resultOfLine(src, 3)).toBe('26.6°') // phi keeps the unit
      expect(resultOfLine(src, 4)).toBe('0.447')
    })

    it('work on a tuple result too', () => {
      expect(value('polar(px, py):3 = @tuple(sqrt(px^2 + py^2), atan2(py, px))\nQ = polar(1.0 m, 1.0 m)')).toBe('(1.41 m, 0.785)')
      expect(value('h(px, py):deg = atan2(py, px)\nd = h(1.00 m, 1.00 m)')).toBe('45.0°')
    })

    it('give way to settings on the calling line', () => {
      expect(value('h(px, py):deg = atan2(py, px)\nw:2 = h(1.00 m, 1.00 m)')).toBe('45°')
    })

    it('carry the uncertainty', () => {
      expect(value('x = 2.00 m pm 0.05 m\ny = 1.00 m pm 0.05 m\nang(y, x):deg = atan(y/x)\nphi = ang(y, x)')).toBe('(26.6 ± 1.3)°')
    })

    it('keep a compound unit, not SI', () => {
      expect(value('conc(n, V):mol/L = n / V\nc = conc(0.150 mol, 250. mL)')).toBe('0.600 mol/L')
    })

    it('explain what doesn’t fit', () => {
      const [g, h] = lines('g(x):zz = x\nh(x):percent = x')
      expect(g.error).toMatch(/"zz" isn't a number of sig figs, a unit, or a setting like sci or ijk/)
      expect(h.error).toMatch(/isn't available on a function/)
      expect(last('m(x):kg = 2.0 m\nk = m(1)').error).toMatch(/can't be shown in kg/)
    })
  })

  it('reports a mistake in the call', () => {
    expect(last('show(m to kg) = m * 9.81 m/s^2\nshow(2.0 m)').error).toMatch(/can't be converted to kg/)
  })

  it('converts cast parameters on the way in', () => {
    const src = 'E_k(n, m to kg, L to m) = (n^2 * @h^2)/(8*m*L^2)\nm_e = 9.11e-31 kg\nE_1 = E_k(1, m_e, 0.100 nm)'
    expect(readable(lineAt(src, 1).tex)).toMatch(/^E_k\(n, m \[kg\], L \[m\]\)/)
    expect(shown(src)).toContain('(1.00e-10 m)^2') // 0.100 nm, cast to m
    expect(value(src)).toBe('6.03e-18 J')
  })

  it('rejects arguments that don’t fit a cast', () => {
    const head = 'E_k(n, m to kg, L to m) = (n^2 * @h^2)/(8*m*L^2)\n'
    expect(last(`${head}x = E_k(1, 9.11e-31, 0.100 nm)`).error).toMatch(/needs a value with a unit/)
    expect(last(`${head}x = E_k(1, 0.100 nm, 0.100 nm)`).error).toMatch(/can't be converted to kg/)
  })

  it('reports bad definitions clearly', () => {
    const [a, b, c] = lines('g(x y) = x\nbad(x, x) = x\nh(x to furlong) = x')
    expect(a.error).toMatch(/isn't a valid parameter/)
    expect(b.error).toMatch(/listed twice/)
    expect(c.error).toMatch(/isn't a unit MathScribe knows/)
  })

  it('give a body’s delta of a parameter the uncertainty of the argument it was given', () => {
    const head = 'k1 = 6.65 N/m pm 0.08 N/m\nk2 = 6.72 N/m pm 0.09 N/m\n'
      + 'agreement(A, B) = abs(A - B) <= delta A + delta B ? "AGREE" : "DOES NOT AGREE"\n'
    const r = last(`${head}r = agreement(k1, k2)`)
    expect(r.error).toBeUndefined()
    expect(readable(r.tex)).toContain('\\delta k_1+ \\delta k_2')
    expect(readable(r.tex)).toMatch(/= \\text“AGREE”$/)
    expect(value(`${head}far = agreement(k1, 2 * k2)`)).toContain('DOES NOT AGREE')
    // (An argument worked out from variables has theirs; what's built from an uncertainty carries none.)
    expect(value(`${head}rel(A) = delta A / A\nv = rel(2 * k1)`)).toBe('0.012')
  })

  it('lays out every call of a function defined in @layout.multiline one = per row', () => {
    expect(last('@layout.multiline {\n    area(r) = pi * r^2\n}\nr_1 = 2.0 cm\nA = area(r_1)').tex).toContain('\\begin{aligned}')
    expect(last('area(r) = pi * r^2\nr_1 = 2.0 cm\nA = area(r_1)').tex).not.toContain('\\begin{aligned}')
  })
})

describe('display settings on the name', () => {
  it('show a result in a unit, with sig figs, in either order', () => {
    expect(value('y = 1.00\nx = 2.00\nphi:3:deg = atan(y/x)')).toBe('26.6°')
    expect(value('phi:deg:3 = atan(1.00/2.00)')).toBe('26.6°')
    expect(value('d:km = 1500. m * 2')).toBe('3.000 km')
  })

  it('treat a unitless angle as radians, and keep the unit afterwards', () => {
    const src = 'phi:deg = atan(1.00/2.00)\ns = sin(phi)\nphi'
    expect(resultOfLine(src, 2)).toBe('0.447')
    expect(resultOfLine(src, 3)).toBe('26.6°')
  })

  it('convert the uncertainty too', () => {
    expect(value('x = 2.00 m pm 0.05 m\ny = 1.00 m pm 0.05 m\nphi:deg = atan(y/x)')).toBe('(26.6 ± 1.3)°')
  })

  it('can show a percentage', () => {
    expect(value('f:percent = 0.25')).toBe('25 %')
  })

  it('explain what doesn’t fit', () => {
    expect(last('bad:deg = 3.0 m').error).toMatch(/can't be shown in deg: the units don't match/)
    expect(last('bad:kg = 2.0').error).toMatch(/has no unit, so it can't be shown in kg/)
    expect(last('bad:zz = 1').error).toMatch(/"zz" isn't a number of sig figs, a unit, or a setting like sci or ijk/)
    expect(last('bad:0 = 1').error).toMatch(/at least 1 sig fig/)
    expect(last('bad:sci:dec = 1.0').error).toMatch(/can't be both :sci and :dec/)
  })
})

describe('notation on the name', () => {
  it(':sci always shows scientific notation, with sig figs and units', () => {
    expect(value('N:sci = 15.0 * 12.0')).toBe('1.80e2')
    expect(value('E:sci:2:J = 2500. N * 1.00 m')).toBe('2.5e3 J')
  })

  it(':dec always shows plain digits', () => {
    expect(value('L:dec = 5.32e-7 m')).toBe('0.000000532 m')
    expect(value('N:dec = 6.0e3 * 1000')).toBe('6000000')
  })

  it('stays with the variable wherever its value is shown', () => {
    const src = 'N:sci = 15.0 * 12.0\nM = N + 1.0\nN'
    expect(shown(src.split('\n').slice(0, 2).join('\n'))).toBe('M = N+ 1.0 = 1.80e2+ 1.0 = 181')
    expect(resultOfLine(src, 3)).toBe('1.80e2')
  })

  it('applies to uncertainties, tuples, unpacked names and function results', () => {
    expect(value('x:sci = 2.0 m pm 0.1 m\ny = x')).toBe('(2.0 ± 0.1) m')
    expect(value('x = 1500. m pm 20 m\ny:sci = x')).toBe('(1.50 ± 0.02)e3 m')
    expect(value('r:sci = @tuple(100., 2000.)')).toBe('(1.00e2, 2.00e3)')
    expect(resultOfLine('@tuple(a:sci, b) = @tuple(150., 2.0)\na', 2)).toBe('1.5e2') // a tuple's values share its sig figs
    expect(value('f(x):sci = 2 * x\ny = f(150.)')).toBe('3.00e2')
  })
})

describe('@layout.sci and @layout.dec', () => {
  /** A line inside an @layout block with these members. */
  const inLayout = (members: string, line: string, before = '') => `${before}@layout.${members} {\n    ${line}\n}`

  it('show a line’s result in that notation, named or not', () => {
    expect(shown(inLayout('sci', 'p^2', 'p = 0.0707\n'))).toBe('p^2 = 0.0707^2 = 5.00e-3')
    expect(shown(inLayout('sci', 'a = 12000. m'))).toBe('a = 1.2000e4 m') // a typed value too
    expect(value(inLayout('val.sci', 'p^2', 'p = 0.0707\n'))).toBe('5.00e-3') // combines with other members
  })

  it('only change how the line is shown: the variable doesn’t keep it', () => {
    expect(value(`${inLayout('sci', 'q = 0.0707 * 2')}\nq`)).toBe('0.141')
  })

  it('apply to every line in the block, below a name’s or a variable’s own notation, and an inner block’s', () => {
    const src = 'p:dec = 2.5e-3\n@layout.sci {\n    a = 0.0707 * 2\n    b:dec = 0.0707 * 2\n    p\n    @layout.dec {\n        c = 0.0707 * 3\n    }\n}'
    expect(resultOfLine(src, 3)).toBe('1.41e-1')
    expect(resultOfLine(src, 4)).toBe('0.141') // the name's :dec
    expect(resultOfLine(src, 5)).toBe('0.0025') // p keeps its own :dec
    expect(resultOfLine(src, 7)).toBe('0.212') // the inner block's
  })
})

describe('@table()', () => {
  const data = 't = [0.10 s, 0.20 s, 0.30 s]\nx = [0.012 m, 0.047 m, 0.106 m]\n'
  /** A table's rows as readable text, header first. */
  // (Its rows, whatever its lines: a grid's, the default, end with a rule after the last.)
  const rowsOf = (tex: string) => tex.replace(/\\begin\{array\}\{[^}]*\}|\\end\{array\}|\\hline/g, '')
    .split('\\\\').map((row) => row.split('&').map((cell) => readable(cell)).join(' & ')).filter((row) => row.trim())

  it('puts series side by side, one row per number (its header blank), with a shared unit in the header', () => {
    expect(rowsOf(last(`${data}@table(t, x)`).tex)).toEqual([
      ' & t [s] & x [m]', '1 & 0.10 & 0.012', '2 & 0.20 & 0.047', '3 & 0.30 & 0.106',
    ])
  })

  it('works out a named column row by row, and makes it a series', () => {
    expect(rowsOf(last(`${data}@table(t, x, v = x / t)`).tex)[0]).toBe(' & t [s] & x [m] & v [m/s]')
    expect(rowsOf(last(`${data}@table(t, x, v = x / t)`).tex)[2]).toBe('2 & 0.20 & 0.047 & 0.24')
    expect(value(`${data}@table(t, x, v = x / t)\nv.count`)).toBe('3')
    expect(value(`${data}@table(t, x, v = x / t)\nw = v[3]`)).toBe('0.35 m/s')
  })

  it('shows an unnamed column without making a series, and uses other values as they are', () => {
    expect(rowsOf(last(`${data}@table(x / t)`).tex)[0]).toBe(' & \\fracxt [m/s]')
    expect(last(`${data}@table(x / t)\ny = unpacked__table0__1`).error).toMatch(/Undefined symbol/)
    expect(rowsOf(last(`${data}g = 9.81 m/s^2\n@table(h = 1/2 * g * t^2)`).tex)[1]).toBe('1 & 0.049')
  })

  it('shows uncertainties, and a gap where a series has no value', () => {
    expect(rowsOf(last('d = [3.0 m pm 0.1 m, 4.0 m pm 0.1 m]\n@table(d)').tex)[1]).toBe('1 & 3.0 ± 0.1')
    expect(rowsOf(last('a = [1.0, 2.0]\nb = [5.0]\n@table(a, b)').tex)[2]).toBe('2 & 2.0 & \\text—')
  })

  it('shortens a long table to its first and last rows', () => {
    const many = `y = [${Array.from({ length: 80 }, (_, i) => `${i + 1}.0`).join(', ')}]`
    const line = last(`${many}\n@table(y)`)
    expect(line.info).toBe('80 rows: the first 50 and the last 5 are shown (the ⚙ button can show them all).')
    expect(line.tex).toContain('\\vdots')
    expect(line.tex).not.toContain(' 51 & ')
    // Unless the settings ask for all of them.
    expect(last(`${many}\n@table(y; all rows)`).tex).toContain(' 51 & ')
  })

  it('takes settings after a semicolon: rows, lines and the n column', () => {
    const rows = rowsOf(last(`${data}@table(t, x; rows 2-3)`).tex)
    expect(rows.slice(1).map((r) => r.split(' & ')[0])).toEqual(['2', '3'])
    expect(rowsOf(last(`${data}@table(t, x; rows 2)`).tex)).toHaveLength(2)
    expect(rowsOf(last(`${data}@table(t; numbers off)`).tex)[0]).toBe('t [s]')
    expect(last(`${data}@table(t; lines grid)`).tex).toMatch(/^\\begin\{array\}\{\|r\|r\|\} \\hline {2}& t/)
    expect(last(`${data}@table(t; lines none)`).tex).not.toContain('\\hline')
    expect(last(`${data}@table(t; rows 9-12)`).info).toBe('No rows in this range.')
    expect(last(`${data}@table(t; colour red)`).error).toMatch(/^"colour red" isn't a table setting/)
  })

  it('explains what doesn’t fit', () => {
    expect(last('@table()').error).toMatch(/^Name the series to show/)
    expect(last('@table(q)').error).toMatch(/^q isn't a series/)
    expect(last(`${data}@table(2 * t[1])`).error).toMatch(/doesn't use any series/)
    expect(last('a = [1.0, 0]\n@table(r = 1 / a)').error).toBeUndefined()
    expect(last('a = [1.0 m, 2.0 s]\n@table(r = a + 1.0 m)').error).toMatch(/^Row 2: The units don't match/)
  })
})

describe('vectors', () => {
  it('are written <…>, shown ⟨…⟩, with a unit after the > for every component', () => {
    expect(shown('F = <3.0, 4.0> N')).toBe('F⃗ = ⟨3.0, 4.0⟩ N')
    expect(shown('r = <1.00 m, 2.00 m>')).toBe('r⃗ = ⟨1.00 m, 2.00 m⟩ = ⟨1.00, 2.00⟩ m')
    // A typed value keeps its unit: N, not kN.
    expect(shown('P = <3000., 4000.> N')).toBe('P⃗ = ⟨3000., 4000.⟩ N')
  })

  it('have an arrow over their names, wherever they’re shown', () => {
    // Over the letter, not its subscript; a stretching one over a wider name.
    expect(last('F_net = <3.0, 4.0> N').tex).toMatch(/^\\vec\{F\}_\{\\mathrm\{net\}\} =/)
    expect(last('vel = <3.0, 4.0> m/s').tex).toMatch(/^\\overrightarrow\{\\mathrm\{vel\}\} =/)
    expect(last('theta = <1.0, 2.0>').tex).toMatch(/^\\vec\{\\theta\} =/)
    // Where it's used, and on what's worked out from it (the norm, a scalar, has none).
    expect(shown('F = <3.0, 4.0> N\nG = 2 * F')).toBe('G⃗ = 2 F⃗ = 2\\times ⟨3.0, 4.0⟩ N = ⟨6.0, 8.0⟩ N')
    expect(shown('F = <3.0, 4.0> N\nn = norm(F)').startsWith('n = ')).toBe(true)
    // In a function given one, and on a vector a function gives back.
    expect(shown('f(x) = <x, 2 * x>\ng = f(3.0)').startsWith('g⃗ = ')).toBe(true)
    // A plain tuple has none, and a display name is shown as written.
    expect(shown('p = @tuple(1.0, 2.0)').startsWith('p = ')).toBe(true)
    expect(shown('F:"Force" = <3.0, 4.0> N')).not.toContain('⃗')
    // Assigned again as a number, it loses it.
    expect(shown('F = <3.0, 4.0> N\nF = 5.0 N\nG = 2 * F')).toBe('G = 2 F = 2\\times 5.0 N = 10. N')
  })

  it('keep each typed component’s sig figs', () => {
    expect(shown('a = <0.50, -9.81> m/s^2')).toBe('a⃗ = ⟨0.50, -9.81⟩ m/s^2')
    expect(shown('a = <0.50, -9.81> m/s^2\nb = a')).toBe('b⃗ = a⃗ = ⟨0.50, -9.81⟩ m/s^2')
  })

  it('calculate as tuples do, and what’s worked out from one is a vector too', () => {
    const src = 'F = <3.0, 4.0> N\nG = 2 * F + <1.0, -1.0> N\nn = norm(F)\nd = dot(F, F)\nc = cross(<1, 0, 0>, <0, 1, 0>)'
    expect(resultOfLine(src, 2)).toBe('⟨7.0, 7.0⟩ N')
    expect(resultOfLine(src, 3)).toBe('5.0 N')
    expect(resultOfLine(src, 4)).toBe('25 N^2')
    // dot and cross are written as operators, bracketing only what needs it.
    expect(readable(lineAt(src, 4).tex)).toBe('d = F⃗ · F⃗ = ⟨3.0, 4.0⟩ N · ⟨3.0, 4.0⟩ N = 25 N^2')
    expect(readable(lineAt(src, 5).tex)).toBe('c⃗ = ⟨1, 0, 0⟩ \\times ⟨0, 1, 0⟩ = ⟨0, 0, 1⟩')
    expect(readable(last(`${src}\ne = dot(F + F, F)`).tex).split(' = ')[1]).toBe('(F⃗+ F⃗) · F⃗')
    expect(resultOfLine(src, 5)).toBe('⟨0, 0, 1⟩')
    // A plain tuple stays a tuple.
    expect(value('p = 2 * @tuple(1.0, 2.0)')).toBe('(2.0, 4.0)')
  })

  it('come back from a function as vectors', () => {
    expect(value('f(x) = <x, 2 * x>\ng = f(3.0)')).toBe('⟨3.0, 6.0⟩')
    expect(value('push(m, a) = m * a\nk = push(2.0 kg, <1.0, 2.0> m/s^2)')).toBe('⟨2.0, 4.0⟩ N')
  })

  it('show with unit vectors with :ijk, and so does what’s worked out from them', () => {
    expect(shown('v:ijk = <2.0, -1.5, 4.0> m/s')).toBe('v⃗ = (2.0 î - 1.5 ĵ + 4.0 k̂) m/s')
    expect(shown('v:ijk = <2.0, -1.5, 4.0> m/s\nw = 2 * v')).toBe('w⃗ = 2 v⃗ = 2 (2.0 î - 1.5 ĵ + 4.0 k̂) m/s = (4.0 î - 3.0 ĵ + 8.0 k̂) m/s')
    // Unitless, and a substitution brackets the sum.
    expect(shown('u:ijk = <1, 2>\nw = 3 * u')).toBe('w⃗ = 3 u⃗ = 3 (1 î + 2 ĵ) = 3 î + 6 ĵ')
    expect(last('z:ijk = 3').warning).toBe(':ijk is ignored because the result isn’t a vector.'.replace('’', '\''))
  })

  it('break into components with :xyz, each a variable of its own', () => {
    const src = 'a:xyz = <0.50, -9.81> m/s^2\nt = 2.0 s\nd_y = 1/2 * a_y * t^2'
    // (The components are numbers: no arrows.)
    expect(readable(lineAt(src, 1).tex)).toBe('a⃗ = ⟨0.50, -9.81⟩ m/s^2 a_x = 0.50 m/s^2 a_y = -9.81 m/s^2')
    expect(lineAt(src, 1).tex).toMatch(/^\\begin\{aligned\}\\vec\{a\} &= .* \\\\ a_\{x\} &= .* \\\\ a_\{y\} &= .*\\end\{aligned\}$/)
    expect(value(src)).toBe('-20. m')
    // Combined with :ijk, on a name with a subscript already.
    expect(readable(last('F_net:ijk:xyz = <3.0, 4.0, 1.5> N').tex))
      .toBe('F⃗_net = (3.0 î + 4.0 ĵ + 1.5 k̂) N F_net,x = 3.0 N F_net,y = 4.0 N F_net,z = 1.5 N')
    // In @layout.sym, only the equation is shown (the components are still made).
    expect(shown('@layout.sym {\n    v:xyz = <1.0, 2.0> m\n}\nw = v_y')).toBe('w = v_y = 2.0 m')
  })

  it('add the components as rows under a line in @layout.multiline', () => {
    const tex = last('F = <3.0, 4.0> N\n@layout.multiline {\n    G:xyz = F + 2 * F\n}').tex
    expect(tex).toMatch(/^\\begin\{aligned\}\\vec\{G\} &= \\vec\{F\}\+ 2 \\vec\{F\} \\\\ &=.* \\\\ G_\{x\} &= 9\.0\\,\\mathrm\{N\} \\\\ G_\{y\} &= 12\\,\\mathrm\{N\}\\end\{aligned\}$/)
  })

  it('explain settings that don’t fit', () => {
    expect(last('bad:xyz = 3').error).toBe('bad:xyz needs a vector of 2 or 3 values, like <3.0, 4.0> N.')
    expect(last('@tuple(a:ijk, b) = <1, 2>').error).toMatch(/a:ijk is for a vector/)
    expect(last('f(x):xyz = <x, x>').error).toMatch(/isn't available on a function/)
  })
})

describe('tuples', () => {
  const src = 'x = 1.00 m\ny = 2.00 m\nz = 3.00 m\nr = @tuple(x, y, z)\ns = 2 * r\nt = r + r\nd = norm(r)\nrc = r to cm'

  it('show a shared unit once, after the bracket', () => {
    expect(shown(src.split('\n').slice(0, 4).join('\n'))).toBe('r = (x, y, z) = (1.00 m, 2.00 m, 3.00 m) = (1.00, 2.00, 3.00) m')
    expect(shown('q = @tuple(1.0 m, 2.0 s)')).toBe('q = (1.0 m, 2.0 s)')
  })

  it('calculate: scaling, adding, length and conversion', () => {
    expect(resultOfLine(src, 5)).toBe('(2.00, 4.00, 6.00) m')
    expect(resultOfLine(src, 6)).toBe('(2.00, 4.00, 6.00) m')
    expect(resultOfLine(src, 7)).toBe('3.74 m')
    expect(resultOfLine(src, 8)).toBe('(100., 200., 300.) cm')
  })

  it('can be a function’s result', () => {
    expect(value('to_cart(rr, th to rad) = @tuple(rr * cos(th), rr * sin(th))\nP = to_cart(2.00 m, 30.0 deg)')).toBe('(1.73, 1.00) m')
  })

  it('must be written @tuple(…): a bracketed list with commas is an error', () => {
    expect(last('r = (1.0, 2.0)').error).toBe("A bracketed list with commas, (1.0, 2.0), isn't a value: for a vector, write <1.0, 2.0>; for other coordinates, @tuple(1.0, 2.0).")
    expect(value('f(a, b) = a + b\nk = f(1, 2)')).toBe('3')
    expect(value('n = (1 + 2) * 3')).toBe('9')
    expect(value('m = max(1, (2))')).toBe('2')
  })
})

describe('bareTuple', () => {
  it('finds a bracketed list with commas, but not calls, grouping or matrices', () => {
    expect(bareTuple('r = (x, y, z)')).toBe('(x, y, z)')
    expect(bareTuple('f(a, b) + 2 * (1, (2, 3))')).toBe('(1, (2, 3))')
    expect(bareTuple('(1 + 2) * max(3, 4) + [1, 2] + @tuple(5, 6)')).toBeNull()
  })
})

describe('unpacking a tuple', () => {
  it('stores each value as a variable of its own', () => {
    const src = 'x = 1.00 m\ny = 2.00 m\nz = 3.00 m\n@tuple(a, b, c) = @tuple(x, y, z)\nd = a + b + c'
    expect(readable(lineAt(src, 4).tex)).toBe('(a, b, c) = (x, y, z) = (1.00 m, 2.00 m, 3.00 m) = (1.00, 2.00, 3.00) m')
    expect(value(src)).toBe('6.00 m')
  })

  /** A function giving a tuple, to unpack. */
  const polar = 'polar(px, py) = @tuple(sqrt(px^2 + py^2), atan2(py, px))\n'

  it('takes a function’s result', () => {
    const src = `${polar}@tuple(r, theta) = polar(1.00 m, 1.00 m)\nx2 = r * cos(theta)`
    expect(lineAt(src, 2).error).toBeUndefined()
    expect(value(src)).toBe('1.00 m')
  })

  it('takes sig figs and a unit on each name, as a single assignment does', () => {
    const src = `${polar}@tuple(r:3, theta:deg) = polar(1.00 m, 1.00 m)\ntheta\nx2 = r * cos(theta)`
    expect(readable(lineAt(src, 2).tex).split(' = ').at(-1)).toBe('(1.41 m, 45.0°)')
    expect(resultOfLine(src, 3)).toBe('45.0°') // theta keeps the unit
    expect(value(src)).toBe('1.00 m')
    expect(value('@tuple(a:km, b:2) = @tuple(1500. m, 2.345 s)\nb')).toBe('2.3 s') // b keeps its sig figs
  })

  it('doesn’t warn about trailing zeros in a value whose name declares its sig figs', () => {
    expect(last('@tuple(r, theta:2:deg, phi:2:deg) = @tuple(1, 45 deg, 90 deg)').warning).toBeUndefined()
    expect(last('@tuple(r, phi) = @tuple(1, 90 deg)').warning).toMatch(/Trailing zeros in 90/)
    // Only the values whose names don't declare sig figs are checked.
    expect(last('@tuple(a:2, b) = @tuple(300 m, 400 m)').warning).toMatch(/Trailing zeros in 400 aren't/)
  })

  it('explains a setting that doesn’t fit', () => {
    expect(last('@tuple(a:deg, b) = @tuple(1.0 m, 2.0)').error).toMatch(/can't be shown in deg/)
    expect(last('@tuple(a:zz, b) = @tuple(1, 2)').error).toMatch(/"zz" isn't a number of sig figs, a unit, or a setting like sci or ijk/)
    expect(last('@tuple(a:percent, b) = @tuple(1, 2)').error).toMatch(/isn't available when unpacking/)
  })

  it('explains what doesn’t fit', () => {
    expect(last('@tuple(a, b) = 5').error).toMatch(/isn't a tuple, so it can't be unpacked into a, b/)
    expect(last('@tuple(a, b) = @tuple(1, 2, 3)').error).toMatch(/has 3 values, but 2 names are given/)
    expect(last('@tuple(a, 2) = @tuple(1, 2)').error).toMatch(/"2" isn't a variable name/)
    expect(last('@tuple(a, a) = @tuple(1, 2)').error).toMatch(/a is listed twice/)
  })

  it('doesn’t leave its working variable behind', () => {
    expect(sheet('@tuple(a, b) = @tuple(1, 2)').variables.map((v) => v.name)).toEqual(['a', 'b'])
  })
})

describe('atan2', () => {
  it('takes coordinates with matching units', () => {
    expect(value('g = atan2(1.0 m, 2.0 m)')).toBe('0.46')
    expect(value('g = atan2(1.0 m, 100. cm)')).toBe('0.79') // different units, read in x's; 2 sig figs
    expect(last('h = atan2(1.0 m, 2.0 s)').error).toMatch(/can't be converted to s/)
  })
})

describe('display settings on a block', () => {
  const src = [
    'm = 2.00 kg',
    '@layout.multiline {', '    F = m * 9.81 m/s^2', '}',
    '@layout.val {', '    G = m * 9.81 m/s^2', '}',
    '@layout.sym {', '    H = m * 9.81 m/s^2', '}',
  ].join('\n')

  it('shows the right parts', () => {
    expect(lineAt(src, 3).tex).toContain('\\begin{aligned}F &= ')
    expect(readable(lineAt(src, 6).tex)).toBe('G = 19.6 N')
    expect(readable(lineAt(src, 9).tex)).toBe('H = m\\times 9.81 m/s^2')
  })
})

describe('solving and series', () => {
  it('rearranges and evaluates', () => {
    expect(value('v = 5.00 m/s\na = 2.00 m/s^2\nd = @solve(v^2 = 2*a*d, d)')).toBe('6.25 m')
  })

  it('makes means, counts and sums of a series, each a member of it', () => {
    const src = 't = [1.21 s, 1.17 s, 1.24 s]\nt.avg\nt.count\nt.sum\nt'
    expect(resultOfLine(src, 2)).toBe('(1.21 ± 0.02) s')
    expect(resultOfLine(src, 3)).toBe('3')
    expect(resultOfLine(src, 4)).toBe('3.62 s')
    // On a line of its own, the series is its values.
    expect(readable(lineAt(src, 5).tex)).toMatch(/^t = \(1\.21,\\ 1\.17,\\ 1\.24\) s/)
  })

  it('keeps a name with a number or subscript a name of its own, not a series', () => {
    expect(value('V_0 = 9.00 V\nV = [9.00 V, 5.52 V]\nw = V[2]')).toBe('5.52 V')
    expect(value('t1 = 1.0 s\nt_1 = 2.0 s\nw = t1 + t_1')).toBe('3.0 s')
    expect(last('t1 = 1.0 s\nt2 = 2.0 s\nw = t.avg').error).toMatch(/Undefined symbol t\.avg/)
  })

  it('says what to write for a series where a value is wanted', () => {
    expect(last('t = [1.0 s, 2.0 s]\nw = 2 * t').error).toBe(
      't is a series of 2 values: use one of them, t[1], or a statistic of them, t.avg or t.sum; or work out a series from it, [2 * t].')
  })
})

function resultOfLine(source: string, n: number): string {
  const parts = readable(lineAt(source, n).tex).split(/ = | ≈ /)
  return parts[parts.length - 1]
}

describe('MathScribe’s own functions, written with @', () => {
  it('explains one written without its @', () => {
    const data = 't = [1.0 s, 2.0 s]\n'
    expect(last(`${data}table(t)`).error).toBe('There\'s no function table: MathScribe\'s is written with an @, as @table(…).')
    expect(last('r = vector(3, 4)').error).toBe('There\'s no function vector: MathScribe\'s is written with an @, as @vector(…).')
  })

  it('leaves their names free for the sheet’s own', () => {
    expect(value('tuple(a, b) = a + b\nx = tuple(2, 3)')).toBe('5')
    expect(value('r = @tuple(1.0, 2.0) m')).toBe('(1.0, 2.0) m')
  })

  it('explains one that’s a line of its own, written inside an expression', () => {
    expect(last('t = [1.0 s, 2.0 s]\nx = 2 * @table(t)').error).toMatch(/@table\(…\) is written on a line of its own/)
  })
})

describe('names made from a name with a display name', () => {
  const T2 = 'squared.T:"$T^2$" = 4.0 s^2 pm 0.2 s^2\n'

  it('shows its uncertainty as the display name with δ (or Δ) before it', () => {
    expect(last(`${T2}delta squared.T`).tex).toBe('\\delta T^2 = 0.2\\,\\mathrm{s}^{2}')
    expect(last(`${T2}Delta squared.T`).tex).toMatch(/^\\Delta T\^2 = /)
    expect(last(`${T2}q = 2 * delta squared.T`).tex).toMatch(/^q = 2 \\delta T\^2 = /)
  })

  it('shows it so in an uncertainty’s working too', () => {
    expect(last(`${T2}r = squared.T / 2\ndelta r`).tex)
      .toMatch(/^\\delta r = \\sqrt\{\\left\(\\frac\{\\partial r\}\{\\partial T\^2\}\\,\\delta T\^2\\right\)\^\{2\}\}/)
  })
})
