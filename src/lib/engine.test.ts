/**
 * The calculation rules, checked through whole sheets the way they're used:
 * units, sig figs, uncertainty, = vs ≈, percentages, constants, functions and
 * solving. Several of these pin down bugs found and fixed earlier.
 */
import { describe, expect, it } from 'vitest'
import { last, lineAt, lines, readable, sheet, shown, value } from '../test/helpers.ts'
import { bareTuple, expandVectors } from './engine.ts'

describe('basic calculation', () => {
  it('substitutes values and tidies the unit', () => {
    expect(shown('m = 2.00 kg\nF = m * 9.81 m/s^2')).toBe('F = m· 9.81 m/s^2 = 2.00 kg· 9.81 m/s^2 = 19.6 N')
  })

  it('brackets a negative value it substitutes, so its sign doesn’t read as an operator', () => {
    expect(shown('a = 3.5e3 J\nb = -1.9e3 J\nW = a + b')).toBe('W = a+ b = 3.5e3 J+ (-1.9e3 J) = 1.6 kJ')
    expect(shown('g = -9.81 m/s^2\nF = g * 2.0 kg')).toBe('F = g· 2.0 kg = (-9.81 m/s^2)· 2.0 kg = -20. N')
    expect(shown('k = -2.0\nz = k * 3')).toBe('z = k· 3 = (-2.0)· 3 = -6.0')
  })

  it('converts with to', () => {
    expect(shown('v = 25.0 m/s\nv to km/h')).toBe('v = 90.0 km/h')
  })

  it('reads a unit after a number as a unit, and warns when a variable was likely meant', () => {
    const l = last('m = 2.0 kg\nE = 1/2 m v^2')
    expect(l.warning).toMatch(/"m" after a number is read as a unit/)
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
    expect(shown('y = 1 * 1.00 m')).toBe('y = 1· 1.00 m = 1.00 m')
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
})

describe('= or ≈', () => {
  const src = 'a = 1/3\nb = 2 * 3\nc = pi / 4\ns = sin(pi/6)\nF = 2.00 kg * 9.81 m/s^2'

  it('uses ≈ only for rounded results of exact inputs, by default', () => {
    const shownLines = lines(src).map((l) => readable(l.tex))
    expect(shownLines[0]).toContain('≈ 0.333333')
    expect(shownLines[1]).toBe('b = 2· 3 = 6')
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
    expect(value('g = (0.120 ± 0.005) to percent')).toBe('(12.0 ± 0.5) %')
  })
})

describe('unit display', () => {
  it('keeps a typed value in its own unit, never an obscure prefix', () => {
    const src = 'm = 9.11e-31 kg\nm\nx = 2 * m\nL = 1.00e-10 m\nL'
    expect(lines(src).map((l) => readable(l.tex))).toEqual([
      'm = 9.11e-31 kg',
      'm = 9.11e-31 kg', // not 0.911 rg
      'x = 2· m = 2· 9.11e-31 kg = 1.82e-30 kg',
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
    expect(shown('area(r) = pi * r^2\nr_1 = 2.0 cm\nA = area(r_1)')).toBe('A = \\pi·r_1^2 = \\pi·(2.0 cm)^2 = 13 cm^2')
  })

  it('shows a number argument once, and a negative one in brackets', () => {
    expect(shown('f(x) = 2.0 m * x\ny = f(3.0)')).toBe('y = 2.0 m· 3.0 = 6.0 m')
    expect(shown('f(x) = 2.0 m * x\nz = f(-2.0)')).toBe('z = 2.0 m· (-2.0) = -4.0 m')
  })

  it('runs def bodies', () => {
    expect(value('def KE(mass, speed)\n    E = 1/2 * mass * speed^2\n    return E\nE_k = KE(2.00 kg, 3.00 m/s)')).toBe('9.00 J')
  })

  it('give a call inside a bigger expression the sig figs of its measured numbers', () => {
    const src = 'hyd(n) = -13.6 eV / n^2\ndE = hyd(3) - hyd(2)'
    expect(value(src)).toBe('1.89 eV')
    expect(value(`${src}   #val`)).toBe('1.89 eV')
  })

  describe('settings for the result', () => {
    it('give every call’s result those sig figs and unit, on an inline function', () => {
      const src = 'ang(y, x):3:deg = atan(y/x)\nphi = ang(1.0, 2.0)\nphi\ns = sin(ang(1.00, 2.00))'
      expect(readable(lineAt(src, 1).tex)).toBe('ang(y, x)\\to[°] = \\tan^-1(\\fracyx)')
      expect(resultOfLine(src, 2)).toBe('26.6°') // 3 sig figs, though the inputs have 2
      expect(resultOfLine(src, 3)).toBe('26.6°') // phi keeps the unit
      expect(resultOfLine(src, 4)).toBe('0.447')
    })

    it('work on a def, including a tuple result', () => {
      const polar = 'def polar(px, py):3\n    rr = sqrt(px^2 + py^2)\n    th = atan2(py, px)\n    return tuple(rr, th)\nQ = polar(1.0 m, 1.0 m)'
      expect(value(polar)).toBe('(1.41 m, 0.785)')
      expect(value('def h(px, py):deg\n    th = atan2(py, px)\n    return th\nd = h(1.00 m, 1.00 m)')).toBe('45.0°')
    })

    it('give way to settings on the calling line', () => {
      expect(value('def h(px, py):deg\n    th = atan2(py, px)\n    return th\nw:2 = h(1.00 m, 1.00 m)')).toBe('45°')
    })

    it('carry the uncertainty', () => {
      expect(value('x = 2.00 m pm 0.05 m\ny = 1.00 m pm 0.05 m\nang(y, x):deg = atan(y/x)\nphi = ang(y, x)')).toBe('(26.6 ± 1.3)°')
    })

    it('keep a compound unit, not SI', () => {
      expect(value('conc(n, V):mol/L = n / V\nc = conc(0.150 mol, 250. mL)')).toBe('0.600 mol/L')
    })

    it('still allow a plain trailing colon on a def', () => {
      expect(value('def f(x):\n    return 2*x\ny = f(1.5)')).toBe('3.0')
    })

    it('explain what doesn’t fit', () => {
      const [g, h] = lines('g(x):zz = x\nh(x):percent = x')
      expect(g.error).toMatch(/"zz" isn't a number of sig figs, a unit, or a setting like sci or ijk/)
      expect(h.error).toMatch(/isn't available on a function/)
      expect(last('m(x):kg = 2.0 m\nk = m(1)').error).toMatch(/can't be shown in kg/)
    })
  })

  describe('a def without return', () => {
    const def = 'def steps(a, b)\n    s = a + b\n    p = s * 2\n'

    it('shows its working when called on a line of its own', () => {
      const call = last(`${def}steps(1.0, 2.0)`)
      expect(call.error).toBeUndefined()
      expect(readable(call.tex)).toBe('steps(1.0, 2.0)')
      expect(call.trace?.map((t) => readable(t.tex))).toEqual(['s = 1.0+ 2.0 = 3.0', 'p = s· 2 = 3.0· 2 = 6.0'])
    })

    it('can’t be used in a calculation, since it gives no value', () => {
      expect(last(`${def}r = steps(1.0, 2.0)`).error).toMatch(/steps has no return line, so it doesn't give a value to store in r/)
      expect(last(`${def}2 * steps(1.0, 2.0)`).error).toMatch(/doesn't give a value to calculate with/)
    })

    it('still reports a mistake in the call', () => {
      expect(last('def show(m to kg)\n    w = m * 9.81 m/s^2\nshow(2.0 m)').error).toMatch(/can't be converted to kg/)
    })
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

  it('lays out every call of a #multiline function one = per row', () => {
    expect(last('area(r) = pi * r^2   #multiline\nr_1 = 2.0 cm\nA = area(r_1)').tex).toContain('\\begin{aligned}')
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
    expect(value('r:sci = tuple(100., 2000.)')).toBe('(1.00e2, 2.00e3)')
    expect(resultOfLine('tuple(a:sci, b) = tuple(150., 2.0)\na', 2)).toBe('1.5e2') // a tuple's values share its sig figs
    expect(value('f(x):sci = 2 * x\ny = f(150.)')).toBe('3.00e2')
  })
})

describe('#sci and #dec', () => {
  it('show a line’s result in that notation, named or not', () => {
    expect(shown('p = 0.0707\np^2   #sci')).toBe('p^2 = 0.0707^2 = 5.00e-3')
    expect(shown('p:sci = 0.0707\np^2   #dec')).toBe('p^2 = (7.07e-2)^2 = 0.00500')
    expect(shown('a = 12000. m   #sci')).toBe('a = 1.2000e4 m') // a typed value too
    expect(value('p = 0.0707\np^2   #val #sci')).toBe('5.00e-3') // combines with other commands
  })

  it('only change how the line is shown: the variable doesn’t keep it', () => {
    expect(value('q = 0.0707 * 2   #sci\nq')).toBe('0.141')
  })

  it('apply to every line in a block, below a name’s or a variable’s own notation', () => {
    const src = 'p:dec = 2.5e-3\nQ {   #sci\n    a = 0.0707 * 2\n    b:dec = 0.0707 * 2\n    p\n    c = 0.0707 * 3   #dec\n}'
    expect(resultOfLine(src, 3)).toBe('1.41e-1')
    expect(resultOfLine(src, 4)).toBe('0.141') // the name's :dec
    expect(resultOfLine(src, 5)).toBe('0.0025') // p keeps its own :dec
    expect(resultOfLine(src, 6)).toBe('0.212') // the line's own command
  })

  it('aren’t taken into the note', () => {
    expect(last('x = 2.0   #sci   # a note').tex).toBe('x = 2.0')
  })
})

describe('expandVectors', () => {
  it('reads <…> as a vector where a value can start, with any unit after it', () => {
    expect(expandVectors('F = <3.0, 4.0> N')).toBe('F = (vector(3.0, 4.0) * unit("N"))')
    expect(expandVectors('c = cross(<1, 0, 0>, <0, 1, 0>)')).toBe('c = cross(vector(1, 0, 0), vector(0, 1, 0))')
    expect(expandVectors('r = <max(1, 2), <1, 2>>')).toBe('r = vector(max(1, 2), vector(1, 2))')
  })

  it('leaves comparisons alone', () => {
    expect(expandVectors('q = a < b')).toBe('q = a < b')
    expect(expandVectors('q = (a < b) and (c > d)')).toBe('q = (a < b) and (c > d)')
  })
})

describe('vectors', () => {
  it('are written <…>, shown ⟨…⟩, with a unit after the > for every component', () => {
    expect(shown('F = <3.0, 4.0> N')).toBe('F = ⟨3.0, 4.0⟩ N')
    expect(shown('r = <1.00 m, 2.00 m>')).toBe('r = ⟨1.00 m, 2.00 m⟩ = ⟨1.00, 2.00⟩ m')
    // A typed value keeps its unit: N, not kN.
    expect(shown('P = <3000., 4000.> N')).toBe('P = ⟨3000., 4000.⟩ N')
  })

  it('keep each typed component’s sig figs', () => {
    expect(shown('a = <0.50, -9.81> m/s^2')).toBe('a = ⟨0.50, -9.81⟩ m/s^2')
    expect(shown('a = <0.50, -9.81> m/s^2\nb = a')).toBe('b = a = ⟨0.50, -9.81⟩ m/s^2')
  })

  it('calculate as tuples do, and what’s worked out from one is a vector too', () => {
    const src = 'F = <3.0, 4.0> N\nG = 2 * F + <1.0, -1.0> N\nn = norm(F)\nd = dot(F, F)\nc = cross(<1, 0, 0>, <0, 1, 0>)'
    expect(resultOfLine(src, 2)).toBe('⟨7.0, 7.0⟩ N')
    expect(resultOfLine(src, 3)).toBe('5.0 N')
    expect(resultOfLine(src, 4)).toBe('25 N^2')
    expect(resultOfLine(src, 5)).toBe('⟨0, 0, 1⟩')
    // A plain tuple stays a tuple.
    expect(value('p = 2 * tuple(1.0, 2.0)')).toBe('(2.0, 4.0)')
  })

  it('come back from a function as vectors', () => {
    expect(value('f(x) = <x, 2 * x>\ng = f(3.0)')).toBe('⟨3.0, 6.0⟩')
    expect(value('def push(m, a)\n    F = m * a\n    return F\nk = push(2.0 kg, <1.0, 2.0> m/s^2)')).toBe('⟨2.0, 4.0⟩ N')
  })

  it('show with unit vectors with :ijk, and so does what’s worked out from them', () => {
    expect(shown('v:ijk = <2.0, -1.5, 4.0> m/s')).toBe('v = (2.0 î - 1.5 ĵ + 4.0 k̂) m/s')
    expect(shown('v:ijk = <2.0, -1.5, 4.0> m/s\nw = 2 * v')).toBe('w = 2· v = 2· (2.0 î - 1.5 ĵ + 4.0 k̂) m/s = (4.0 î - 3.0 ĵ + 8.0 k̂) m/s')
    // Unitless, and a substitution brackets the sum.
    expect(shown('u:ijk = <1, 2>\nw = 3 * u')).toBe('w = 3· u = 3· (1 î + 2 ĵ) = 3 î + 6 ĵ')
    expect(last('z:ijk = 3').warning).toBe(':ijk is ignored because the result isn’t a vector.'.replace('’', '\''))
  })

  it('break into components with :xyz, each a variable of its own', () => {
    const src = 'a:xyz = <0.50, -9.81> m/s^2\nt = 2.0 s\nd_y = 1/2 * a_y * t^2'
    expect(readable(lineAt(src, 1).tex)).toBe('a = ⟨0.50, -9.81⟩ m/s^2 a_x = 0.50 m/s^2 a_y = -9.81 m/s^2')
    expect(lineAt(src, 1).tex).toMatch(/^\\begin\{aligned\}a &= .* \\\\ a_\{x\} &= .* \\\\ a_\{y\} &= .*\\end\{aligned\}$/)
    expect(value(src)).toBe('-20. m')
    // Combined with :ijk, on a name with a subscript already.
    expect(readable(last('F_net:ijk:xyz = <3.0, 4.0, 1.5> N').tex))
      .toBe('F_net = (3.0 î + 4.0 ĵ + 1.5 k̂) N F_net,x = 3.0 N F_net,y = 4.0 N F_net,z = 1.5 N')
    // #sym shows only the equation (the components are still made).
    expect(shown('v:xyz = <1.0, 2.0> m   #sym\nw = v_y')).toBe('w = v_y = 2.0 m')
  })

  it('add the components as rows under a #multiline line', () => {
    const tex = last('F = <3.0, 4.0> N\nG:xyz = F + 2 * F   #multiline').tex
    expect(tex).toMatch(/^\\begin\{aligned\}G &= F\+ 2\\cdot F \\\\ &= .* \\\\ G_\{x\} &= 9\.0\\,\\mathrm\{N\} \\\\ G_\{y\} &= 12\\,\\mathrm\{N\}\\end\{aligned\}$/)
  })

  it('make components inside a function, too', () => {
    expect(value('def fx(m, a)\n    F:xyz = m * a\n    return F_x\nk = fx(2.0 kg, <1.0, 2.0> m/s^2)')).toBe('2.0 N')
  })

  it('explain settings that don’t fit', () => {
    expect(last('bad:xyz = 3').error).toBe('bad:xyz needs a vector of 2 or 3 values, like <3.0, 4.0> N.')
    expect(last('tuple(a:ijk, b) = <1, 2>').error).toMatch(/a:ijk is for a vector/)
    expect(last('f(x):xyz = <x, x>').error).toMatch(/isn't available on a function/)
  })
})

describe('tuples', () => {
  const src = 'x = 1.00 m\ny = 2.00 m\nz = 3.00 m\nr = tuple(x, y, z)\ns = 2 * r\nt = r + r\nd = norm(r)\nrc = r to cm'

  it('show a shared unit once, after the bracket', () => {
    expect(shown(src.split('\n').slice(0, 4).join('\n'))).toBe('r = (x, y, z) = (1.00 m, 2.00 m, 3.00 m) = (1.00, 2.00, 3.00) m')
    expect(shown('q = tuple(1.0 m, 2.0 s)')).toBe('q = (1.0 m, 2.0 s)')
  })

  it('calculate: scaling, adding, length and conversion', () => {
    expect(resultOfLine(src, 5)).toBe('(2.00, 4.00, 6.00) m')
    expect(resultOfLine(src, 6)).toBe('(2.00, 4.00, 6.00) m')
    expect(resultOfLine(src, 7)).toBe('3.74 m')
    expect(resultOfLine(src, 8)).toBe('(100., 200., 300.) cm')
  })

  it('can be a function’s result', () => {
    expect(value('to_cart(rr, th to rad) = tuple(rr * cos(th), rr * sin(th))\nP = to_cart(2.00 m, 30.0 deg)')).toBe('(1.73, 1.00) m')
    const polar = 'def polar(px, py)\n    rr = sqrt(px^2 + py^2)\n    th:deg = atan2(py, px)\n    return tuple(rr, th)\nQ = polar(1.00 m, 1.00 m)'
    expect(value(polar)).toBe('(1.41 m, 45.0°)') // the body's :deg applies to what's returned
  })

  it('must be written tuple(…): a bracketed list with commas is an error', () => {
    expect(last('r = (1.0, 2.0)').error).toBe("A bracketed list with commas, (1.0, 2.0), isn't a value: for a vector, write <1.0, 2.0>; for other coordinates, tuple(1.0, 2.0).")
    expect(value('f(a, b) = a + b\nk = f(1, 2)')).toBe('3')
    expect(value('n = (1 + 2) * 3')).toBe('9')
    expect(value('m = max(1, (2))')).toBe('2')
  })
})

describe('bareTuple', () => {
  it('finds a bracketed list with commas, but not calls, grouping or matrices', () => {
    expect(bareTuple('r = (x, y, z)')).toBe('(x, y, z)')
    expect(bareTuple('f(a, b) + 2 * (1, (2, 3))')).toBe('(1, (2, 3))')
    expect(bareTuple('(1 + 2) * max(3, 4) + [1, 2] + tuple(5, 6)')).toBeNull()
  })
})

describe('unpacking a tuple', () => {
  it('stores each value as a variable of its own', () => {
    const src = 'x = 1.00 m\ny = 2.00 m\nz = 3.00 m\ntuple(a, b, c) = tuple(x, y, z)\nd = a + b + c'
    expect(readable(lineAt(src, 4).tex)).toBe('(a, b, c) = (x, y, z) = (1.00 m, 2.00 m, 3.00 m) = (1.00, 2.00, 3.00) m')
    expect(value(src)).toBe('6.00 m')
  })

  it('takes a function’s result, and keeps each value’s unit', () => {
    const src = 'def polar(px, py)\n    rr = sqrt(px^2 + py^2)\n    th:deg = atan2(py, px)\n    return tuple(rr, th)\n'
      + 'tuple(r, theta) = polar(1.00 m, 1.00 m)\nx2 = r * cos(theta)'
    const call = lineAt(src, 5)
    expect(readable(call.tex)).toBe('(r, \\theta) = (rr, th) = (1.41 m, 45.0°)')
    // The function's own working keeps its own names.
    expect(call.trace?.map((t) => readable(t.tex).split(' = ')[0])).toEqual(['rr', 'th'])
    expect(value(src)).toBe('1.00 m')
  })

  it('works inside a function', () => {
    expect(value('def f(p)\n    tuple(u, v) = p\n    return u + v\nk = f(tuple(1.0, 2.0))')).toBe('3.0')
  })

  it('takes sig figs and a unit on each name, as a single assignment does', () => {
    const src = 'def polar(px, py)\n    rr = sqrt(px^2 + py^2)\n    th = atan2(py, px)\n    return tuple(rr, th)\n'
      + 'tuple(r:3, theta:deg) = polar(1.00 m, 1.00 m)\ntheta\nx2 = r * cos(theta)'
    expect(readable(lineAt(src, 5).tex)).toBe('(r, \\theta) = (rr, th) = (1.41 m, 0.785) = (1.41 m, 45.0°)')
    expect(resultOfLine(src, 6)).toBe('45.0°') // theta keeps the unit
    expect(value(src)).toBe('1.00 m')
    expect(value('tuple(a:km, b:2) = tuple(1500. m, 2.345 s)\nb')).toBe('2.3 s') // b keeps its sig figs
  })

  it('doesn’t warn about trailing zeros in a value whose name declares its sig figs', () => {
    expect(last('tuple(r, theta:2:deg, phi:2:deg) = tuple(1, 45 deg, 90 deg)').warning).toBeUndefined()
    expect(last('tuple(r, phi) = tuple(1, 90 deg)').warning).toMatch(/Trailing zeros in 90/)
    // Only the values whose names don't declare sig figs are checked.
    expect(last('tuple(a:2, b) = tuple(300 m, 400 m)').warning).toMatch(/Trailing zeros in 400 aren't/)
  })

  it('applies a name’s unit inside a function too', () => {
    expect(value('def f(p)\n    tuple(u:cm, v) = p\n    return u\nk = f(tuple(1.00 m, 2.00))')).toBe('100. cm')
  })

  it('explains a setting that doesn’t fit', () => {
    expect(last('tuple(a:deg, b) = tuple(1.0 m, 2.0)').error).toMatch(/can't be shown in deg/)
    expect(last('tuple(a:zz, b) = tuple(1, 2)').error).toMatch(/"zz" isn't a number of sig figs, a unit, or a setting like sci or ijk/)
    expect(last('tuple(a:percent, b) = tuple(1, 2)').error).toMatch(/isn't available when unpacking/)
  })

  it('explains what doesn’t fit', () => {
    expect(last('tuple(a, b) = 5').error).toMatch(/isn't a tuple, so it can't be unpacked into a, b/)
    expect(last('tuple(a, b) = tuple(1, 2, 3)').error).toMatch(/has 3 values, but 2 names are given/)
    expect(last('tuple(a, 2) = tuple(1, 2)').error).toMatch(/"2" isn't a variable name/)
    expect(last('tuple(a, a) = tuple(1, 2)').error).toMatch(/a is listed twice/)
  })

  it('doesn’t leave its working variable behind', () => {
    expect(sheet('tuple(a, b) = tuple(1, 2)').variables.map((v) => v.name)).toEqual(['a', 'b'])
  })
})

describe('atan2', () => {
  it('takes coordinates with matching units', () => {
    expect(value('g = atan2(1.0 m, 2.0 m)')).toBe('0.46')
    expect(value('g = atan2(1.0 m, 100. cm)')).toBe('0.79') // different units, read in x's; 2 sig figs
    expect(last('h = atan2(1.0 m, 2.0 s)').error).toMatch(/Units do not match/)
  })
})

describe('display commands', () => {
  const src = 'm = 2.00 kg\nF = m * 9.81 m/s^2   #multiline\nG = m * 9.81 m/s^2   #val\nH = m * 9.81 m/s^2   #sym'

  it('shows the right parts', () => {
    expect(lineAt(src, 2).tex).toContain('\\begin{aligned}F &= ')
    expect(readable(lineAt(src, 3).tex)).toBe('G = 19.6 N')
    expect(readable(lineAt(src, 4).tex)).toBe('H = m· 9.81 m/s^2')
  })
})

describe('solving and series', () => {
  it('rearranges and evaluates', () => {
    expect(value('v = 5.00 m/s\na = 2.00 m/s^2\nd = solve(v^2 = 2*a*d, d)')).toBe('6.25 m')
  })

  it('makes means, counts and sums of numbered variables', () => {
    const src = 't_1 = 1.21 s\nt_2 = 1.17 s\nt_3 = 1.24 s\nt_avg\nt_count\nt'
    expect(resultOfLine(src, 4)).toBe('(1.21 ± 0.02) s')
    expect(resultOfLine(src, 5)).toBe('3')
    expect(resultOfLine(src, 6)).toBe('3.62 s')
  })
})

function resultOfLine(source: string, n: number): string {
  const parts = readable(lineAt(source, n).tex).split(/ = | ≈ /)
  return parts[parts.length - 1]
}
