/**
 * The calculation rules, checked through whole sheets the way they're used:
 * units, sig figs, uncertainty, = vs ≈, percentages, constants, functions and
 * solving. Several of these pin down bugs found and fixed earlier.
 */
import { describe, expect, it } from 'vitest'
import { last, lineAt, lines, readable, shown, value } from '../test/helpers.ts'
import { rewriteTuples } from './engine.ts'

describe('basic calculation', () => {
  it('substitutes values and tidies the unit', () => {
    expect(shown('m = 2.00 kg\nF = m * 9.81 m/s^2')).toBe('F = m· 9.81 m/s^2 = 2.00 kg· 9.81 m/s^2 = 19.6 N')
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
    expect(shown('f(x) = 2.0 m * x\nz = f(-2.0)')).toBe('z = 2.0 m· (- 2.0) = -4.0 m')
  })

  it('runs def bodies', () => {
    expect(value('def KE(mass, speed)\n    E = 1/2 * mass * speed^2\n    return E\nE_k = KE(2.00 kg, 3.00 m/s)')).toBe('9.00 J')
  })

  it('returns a def’s last line when it has no return', () => {
    const src = 'def steps(a, b)\n    s = a + b\n    p = s * 2\nr = steps(1.0, 2.0)'
    expect(shown(src)).toBe('r = p = 6.0')
    expect(last(src).trace?.map((t) => readable(t.tex))).toEqual(['s = 1.0+ 2.0 = 3.0', 'p = s· 2 = 3.0· 2 = 6.0'])
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
    expect(last('bad:zz = 1').error).toMatch(/"zz" isn't a number of sig figs or a unit/)
    expect(last('bad:0 = 1').error).toMatch(/at least 1 sig fig/)
  })
})

describe('tuples', () => {
  const src = 'x = 1.00 m\ny = 2.00 m\nz = 3.00 m\nr = (x, y, z)\ns = 2 * r\nt = r + r\nd = norm(r)\nrc = r to cm'

  it('show a shared unit once, after the bracket', () => {
    expect(shown(src.split('\n').slice(0, 4).join('\n'))).toBe('r = (x, y, z) = (1.00 m, 2.00 m, 3.00 m) = (1.00, 2.00, 3.00) m')
    expect(shown('q = (1.0 m, 2.0 s)')).toBe('q = (1.0 m, 2.0 s)')
  })

  it('calculate: scaling, adding, length and conversion', () => {
    expect(resultOfLine(src, 5)).toBe('(2.00, 4.00, 6.00) m')
    expect(resultOfLine(src, 6)).toBe('(2.00, 4.00, 6.00) m')
    expect(resultOfLine(src, 7)).toBe('3.74 m')
    expect(resultOfLine(src, 8)).toBe('(1.00e2, 2.00e2, 3.00e2) cm')
  })

  it('can be a function’s result', () => {
    expect(value('to_cart(rr, th to rad) = (rr * cos(th), rr * sin(th))\nP = to_cart(2.00 m, 30.0 deg)')).toBe('(1.73, 1.00) m')
    const polar = 'def polar(px, py)\n    rr = sqrt(px^2 + py^2)\n    th:deg = atan2(py, px)\n    return (rr, th)\nQ = polar(1.00 m, 1.00 m)'
    expect(value(polar)).toBe('(1.41 m, 45.0°)') // the body's :deg applies to what's returned
  })

  it('leave function calls and ordinary brackets alone', () => {
    expect(value('f(a, b) = a + b\nk = f(1, 2)')).toBe('3')
    expect(value('n = (1 + 2) * 3')).toBe('9')
    expect(value('m = max(1, (2))')).toBe('2')
  })
})

describe('rewriteTuples', () => {
  it('turns bracketed lists into tuples, and nothing else', () => {
    expect(rewriteTuples('r = (x, y, z)')).toBe('r = tuple(x, y, z)')
    expect(rewriteTuples('f(a, b) + (1, (2, 3))')).toBe('f(a, b) + tuple(1, tuple(2, 3))')
    expect(rewriteTuples('(1 + 2) * max(3, 4) + [1, 2]')).toBe('(1 + 2) * max(3, 4) + [1, 2]')
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
