/**
 * Golden tests: whole sheets whose complete output is recorded in
 * __snapshots__/golden.test.ts.snap and compared on every run. If a change
 * alters the output on purpose, check the difference, then update the
 * recording with `npx vitest run -u`.
 */
import { describe, expect, it } from 'vitest'
import { REFERENCE } from './reference.ts'
import { SAMPLE } from './sample.ts'
import { toLatexDocument } from './document.ts'
import { lines, readable, sheet } from '../test/helpers.ts'

/** Each line's output as readable text, with any error, warning or note. */
function render(source: string): string {
  return lines(source).map((l) => [
    `${l.line}: ${readable(l.tex)}`,
    ...(l.trace ?? []).map((t) => `     ↳ ${readable(t.tex)}`),
    l.error && `     ERROR ${l.error}`,
    l.warning && `     WARNING ${l.warning}`,
    l.info && `     INFO ${l.info}`,
  ].filter(Boolean).join('\n')).join('\n')
}

/** Hydrogen orbitals: functions, casts, sheet-wide constants, ≈, %, Å and #multiline. */
const ORBITALS = `@a_0:3 to angstrom

psi_prob(r, psi) = 4 * pi * r^2 * psi^2   # radial probability density
sigma(Z, r to angstrom) = Z*r/@a_0

Hydrogen 1s orbital {
    Z = 1
    r = 0.400 angstrom
    s = sigma(Z, r)
    psi = pi^(-(0.5)) * (Z/@a_0)^(3/2) * e^(-s)
    P = psi_prob(r, psi)
    shell = P * 0.010 angstrom to percent
}

Hydrogen 2s orbital {
    Z = 1
    r = 3.500 angstrom
    s = sigma(Z, r)
    psi_200 = (32pi)^(-0.5) * (Z/@a_0)^(3/2) * (2 - s) * e^(-s/2)
    P = psi_prob(r, psi_200)
}

Hydrogen 2p_z orbital {
    Z = 1
    r = 3.000 angstrom
    s = sigma(Z, r)
    theta = 0.00 deg
    psi_210 = (32pi)^(-(1/2)) * (Z/@a_0)^(3/2) * s * e^(-(s/2)) * cos(theta)   #multiline
    P = psi_prob(r, psi_210)
}
`

describe('golden sheets', () => {
  it('hydrogen orbitals', () => {
    expect(render(ORBITALS)).toMatchSnapshot()
  })

  it('the sample sheet', () => {
    expect(render(SAMPLE)).toMatchSnapshot()
  })

  it('the sample sheet’s LaTeX export', () => {
    expect(toLatexDocument(sheet(SAMPLE).blocks)).toMatchSnapshot()
  })
})

describe('the Reference tab’s examples', () => {
  for (const section of REFERENCE) {
    for (const example of section.examples) {
      it(`${section.title}: ${example.source.split('\n')[0]}`, () => {
        const out = render(example.source)
        expect(out).not.toMatch(/ERROR/)
        expect(out).toMatchSnapshot()
      })
    }
  }
})
