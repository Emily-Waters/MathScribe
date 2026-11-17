/**
 * The Greek letters, by their LaTeX names: written in a name either spelled out
 * (`theta`, `Delta`) or as the character itself (`ΔE`), which the editor types
 * for `\Delta` followed by Tab or a space. Capitals that look like Latin ones
 * (Α, Β, …) have no LaTeX name and are left out.
 */
export const GREEK_LETTERS = [
  ['alpha', 'α'], ['beta', 'β'], ['gamma', 'γ'], ['delta', 'δ'], ['epsilon', 'ϵ'], ['varepsilon', 'ε'],
  ['zeta', 'ζ'], ['eta', 'η'], ['theta', 'θ'], ['vartheta', 'ϑ'], ['iota', 'ι'], ['kappa', 'κ'],
  ['lambda', 'λ'], ['mu', 'μ'], ['nu', 'ν'], ['xi', 'ξ'], ['pi', 'π'], ['rho', 'ρ'], ['varrho', 'ϱ'],
  ['sigma', 'σ'], ['varsigma', 'ς'], ['tau', 'τ'], ['upsilon', 'υ'], ['phi', 'ϕ'], ['varphi', 'φ'],
  ['chi', 'χ'], ['psi', 'ψ'], ['omega', 'ω'],
  ['Gamma', 'Γ'], ['Delta', 'Δ'], ['Theta', 'Θ'], ['Lambda', 'Λ'], ['Xi', 'Ξ'], ['Pi', 'Π'], ['Sigma', 'Σ'],
  ['Upsilon', 'Υ'], ['Phi', 'Φ'], ['Psi', 'Ψ'], ['Omega', 'Ω'],
] as const

/** A Greek letter's character, by its LaTeX name: `Delta` → Δ. */
export const GREEK_BY_NAME: ReadonlyMap<string, string> = new Map(GREEK_LETTERS)

/** A Greek letter's LaTeX name, by its character: Δ → `Delta`. */
export const GREEK_BY_CHAR: ReadonlyMap<string, string> = new Map(GREEK_LETTERS.map(([name, char]) => [char, name]))
