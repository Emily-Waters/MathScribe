/**
 * Built-in physical constants, referenced as `@name` (3 sig figs), `@name:n`
 * (n sig figs) or `@name:exact` (full precision). Values are CODATA 2018; those
 * marked exact are exact by definition in the 2019 SI.
 *
 * Namespaces hold more, written with a dot: `@chem.Na` is sodium's molar mass
 * (elements.ts), and has the digits IUPAC gives unless written with `:n`.
 */
import { ELEMENTS, MOLAR_MASS_UNIT, elementDescription, type ElementSymbol } from './elements.ts'
import { memberName } from './names.ts'
import { NAMESPACE } from './syntax.ts'
export interface BuiltinConstant {
  value: number
  /** mathjs unit string; empty for dimensionless. */
  unit: string
  /** How the symbol is typeset. */
  tex: string
  description: string
}

/** The built-in constants, used as `@name` (CODATA 2018 values). */
export const BUILTIN_CONSTANTS: Record<string, BuiltinConstant> = {
  c: { value: 299792458, unit: 'm/s', tex: 'c', description: 'speed of light in vacuum (exact)' },
  h: { value: 6.62607015e-34, unit: 'J s', tex: 'h', description: 'Planck constant (exact)' },
  hbar: { value: 1.054571817e-34, unit: 'J s', tex: '\\hbar', description: 'reduced Planck constant' },
  e: { value: 1.602176634e-19, unit: 'C', tex: 'e', description: 'elementary charge (exact)' },
  k_B: { value: 1.380649e-23, unit: 'J/K', tex: 'k_{\\mathrm{B}}', description: 'Boltzmann constant (exact)' },
  N_A: { value: 6.02214076e23, unit: 'mol^-1', tex: 'N_{\\mathrm{A}}', description: 'Avogadro constant (exact)' },
  R: { value: 8.314462618, unit: 'J/mol/K', tex: 'R', description: 'molar gas constant' },
  F: { value: 96485.33212, unit: 'C/mol', tex: 'F', description: 'Faraday constant' },
  G: { value: 6.6743e-11, unit: 'N m^2/kg^2', tex: 'G', description: 'gravitational constant' },
  g: { value: 9.80665, unit: 'm/s^2', tex: 'g', description: 'standard gravity (exact)' },
  k_e: { value: 8.9875517923e9, unit: 'N m^2/C^2', tex: 'k_{\\mathrm{e}}', description: 'Coulomb constant' },
  epsilon_0: { value: 8.8541878128e-12, unit: 'F/m', tex: '\\varepsilon_0', description: 'vacuum permittivity' },
  mu_0: { value: 1.25663706212e-6, unit: 'N/A^2', tex: '\\mu_0', description: 'vacuum permeability' },
  m_e: { value: 9.1093837015e-31, unit: 'kg', tex: 'm_{\\mathrm{e}}', description: 'electron mass' },
  m_p: { value: 1.67262192369e-27, unit: 'kg', tex: 'm_{\\mathrm{p}}', description: 'proton mass' },
  m_n: { value: 1.67492749804e-27, unit: 'kg', tex: 'm_{\\mathrm{n}}', description: 'neutron mass' },
  u: { value: 1.6605390666e-27, unit: 'kg', tex: 'u', description: 'atomic mass unit' },
  a_0: { value: 5.29177210903e-11, unit: 'm', tex: 'a_0', description: 'Bohr radius' },
  sigma: { value: 5.670374419e-8, unit: 'W/m^2/K^4', tex: '\\sigma', description: 'Stefan–Boltzmann constant' },
  atm: { value: 101325, unit: 'Pa', tex: 'P_{\\mathrm{atm}}', description: 'standard atmosphere (exact)' },
  V_m: { value: 22.41396954, unit: 'L/mol', tex: 'V_{\\mathrm{m}}', description: 'molar volume of an ideal gas at 0 °C, 1 atm' },
}

/** Sig figs used for a built-in constant written without `:n`. */
export const DEFAULT_CONSTANT_SIG_FIGS = 3

/**
 * A constant in a namespace: `@chem.Na`. Its value as written (`22.990`) holds
 * its sig figs, which a use without `:n` gets, rather than DEFAULT_CONSTANT_SIG_FIGS.
 */
export interface NamespaceConstant extends BuiltinConstant {
  written: string
}

/** Each element's molar mass, `@chem.Na`, by its inside name (chem__Na; see names.ts). */
export const CHEM_CONSTANTS: Readonly<Record<string, NamespaceConstant>> = Object.fromEntries(
  (Object.keys(ELEMENTS) as ElementSymbol[]).map((symbol) => [memberName(NAMESPACE.chem, symbol), {
    value: Number(ELEMENTS[symbol].weight),
    written: ELEMENTS[symbol].weight,
    unit: MOLAR_MASS_UNIT,
    tex: `M_{\\mathrm{${symbol}}}`,
    description: elementDescription(symbol),
  }]),
)

/** A built-in constant by its inside name (`c`, `chem__Na`), or undefined if there's none. */
export const builtinConstant = (name: string): BuiltinConstant | NamespaceConstant | undefined =>
  (Object.hasOwn(BUILTIN_CONSTANTS, name) ? BUILTIN_CONSTANTS[name] : undefined)
  ?? (Object.hasOwn(CHEM_CONSTANTS, name) ? CHEM_CONSTANTS[name] : undefined)

/** Whether a built-in constant is a namespace's, with its value as written. */
export const isNamespaceConstant = (c: BuiltinConstant): c is NamespaceConstant => 'written' in c

/** Every built-in constant's inside name, the namespaces' too. */
export const BUILTIN_CONSTANT_KEYS: readonly string[] = [...Object.keys(BUILTIN_CONSTANTS), ...Object.keys(CHEM_CONSTANTS)]

/** How many single-letter edits turn `a` into `b` (Levenshtein distance), for suggesting a constant. */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]
}

/** How many edits apart a mistyped constant can be and still be suggested. */
const MAX_SUGGESTION_DISTANCE = 2

/** The known constant name closest to a mistyped one, if any is close: `kb` → `k_B`. */
export function suggestConstant(name: string, known: Iterable<string>): string | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/_/g, '')
  let best: string | undefined
  let bestScore = Infinity
  for (const k of known) {
    const score = norm(k) === norm(name) ? 0 : editDistance(norm(k), norm(name))
    if (score < bestScore) {
      best = k
      bestScore = score
    }
  }
  return bestScore <= MAX_SUGGESTION_DISTANCE ? best : undefined
}
