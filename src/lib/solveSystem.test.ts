/** Systems of equations: `tuple(x, y) = solve(eq, eq)`, solved by substitution. */
import { describe, expect, it } from 'vitest'
import { lines, readable, value } from '../test/helpers.ts'

const solved = (source: string) => lines(source).find((l) => l.source.startsWith('tuple'))!
const answer = (source: string) => readable(solved(source).tex).split(' = ').at(-1)

describe('systems of equations', () => {
  it('solves two linear equations, and three', () => {
    expect(answer('tuple(x, y) = solve(2 * x + 3 * y = 12, x - y = 1)')).toBe('(3,\\ 2)')
    expect(answer('tuple(a, b, c) = solve(a + b + c = 6, a - b = 1, b - c = 1)')).toBe('(3,\\ 2,\\ 1)')
  })

  it('carries units and sig figs: an elastic collision, an Atwood machine', () => {
    const collision = 'm_1 = 2.00 kg\nm_2 = 4.00 kg\nu = 6.00 m/s\n'
      + 'tuple(v_1, v_2) = solve(m_1 * u = m_1 * v_1 + m_2 * v_2, u = v_2 - v_1)\n'
    expect(value(`${collision}w = v_2`)).toBe('4.00 m/s')
    expect(value(`${collision}w = v_1`)).toBe('-2.0 m/s')
    const atwood = 'm_1 = 3.00 kg\nm_2 = 5.00 kg\ntuple(T, a) = solve(T - m_1 * @g = m_1 * a, m_2 * @g - T = m_2 * a)\n'
    expect(value(`${atwood}w = a`)).toBe('2.45 m/s^2')
    expect(value(`${atwood}w = T`)).toBe('36.8 N')
  })

  it('carries uncertainty, and takes settings on the names', () => {
    const source = 'p = 10.0 kg*m/s pm 0.2 kg*m/s\nm = 2.00 kg\ntuple(v, K) = solve(p = m * v, K = 1/2 * m * v^2)\n'
    expect(value(`${source}w = v`)).toBe('(5.0 ± 0.1) m/s')
    expect(value(`${source}w = K`)).toBe('(25 ± 1) J')
    expect(value('tuple(x:3, y) = solve(3 * x = 1, y = 2 * x)\nw = x')).toBe('0.333')
  })

  it('shows the equations, then each unknown worked out in turn', () => {
    const trace = solved('tuple(x, y) = solve(2 * x + 3 * y = 12, x - y = 1)').trace!.map((t) => readable(t.tex))
    expect(trace).toHaveLength(4)
    expect(trace[2]).toBe('y = 2')
    expect(trace[3]).toMatch(/^x = .* = 3$/)
  })

  it('explains what it can’t solve', () => {
    expect(solved('tuple(x, y) = solve(x + y = 2)').error).toMatch(/2 unknowns need 2 equations/)
    expect(solved('tuple(x, y) = solve(x + y = 2, x + y = 3)').error).toMatch(/contradict each other or say the same thing/)
    expect(solved('tuple(x, y) = solve(x = 2, x = 3)').error).toBe("y doesn't appear in any of the equations.")
    expect(solved('tuple(x, y) = solve(sin(x) + x * y = 2, cos(y) * x + y = 3)').error).toMatch(/can't be solved for .* by substitution/)
    expect(solved('tuple(x, y) = solve(x + y, x = 3)').error).toMatch(/isn't an equation/)
  })
})
