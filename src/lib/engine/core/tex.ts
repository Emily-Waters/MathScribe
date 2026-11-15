/** Names, numbers and units as LaTeX. */
import { isConstantNode, isFunctionNode, type FunctionNode, type MathNode } from 'mathjs'
import { AGGREGATE_KIND } from '../../values.ts'
import { builtinConstant } from '../../builtins.ts'
import { GREEK_BY_CHAR, GREEK_BY_NAME, GREEK_CHARS, SERIES_SUFFIXES } from '../../syntax.ts'
import { FIT, parseConstantRefName, parseMemberName, parseSeriesStatName, parseSolvedName, parseUncertaintyName } from '../../names.ts'
import { FN, UNIT_LOOKS } from '../../mathjsNames.ts'
import { isSpeciesUnit, speciesTex, speciesOf } from '../../chemistry.ts'
import { math } from './math.ts'
import { SPECIES_GAP, SPECIES_RATIO_UNIT } from './species.ts'

// ---------------------------------------------------------------------------
// LaTeX helpers
// ---------------------------------------------------------------------------

/** A Greek letter in a name, as a piece of its own (to split `ΔE` into Δ and E). */
export const GREEK_LETTER = new RegExp(`([${GREEK_CHARS}])`)

/**
 * One part of a name, as LaTeX: Greek letters (spelled out, `theta`, or typed,
 * θ) as their commands, single letters and digits as they are, words upright.
 * A typed Greek letter goes in front of the rest: `ΔE` → \Delta E, `Δforce` →
 * \Delta \mathrm{force}.
 */
export function namePart(s: string): string {
  if (GREEK_BY_NAME.has(s)) return `\\${s}`
  if (GREEK_LETTER.test(s)) {
    return s.split(GREEK_LETTER).filter(Boolean).map((piece) => {
      if (!GREEK_LETTER.test(piece)) return namePart(piece)
      const name = GREEK_BY_CHAR.get(piece)
      return name ? `\\${name}` : piece
    }).join(' ')
  }
  if (s.length === 1 || /^\d+$/.test(s)) return s
  return `\\mathrm{${s}}`
}

/** A name of letters then digits, `a2`, `ω1` (1: the letters, 2: the digits), which reads a₂. */
export const TRAILING_DIGITS = new RegExp(String.raw`^([A-Za-z${GREEK_CHARS}]+?)(\d+)$`)

/** `v_0` → v_{0}, `F_net` → F_{\mathrm{net}}, `F_net_x` → F_{\mathrm{net},x}, `theta` → \theta, `a2` → a_{2} */
export function symbolTex(name: string): string {
  if (name === 'Infinity') return '\\infty'
  const unc = parseUncertaintyName(name)
  if (unc) return `\\${unc.letter} ${symbolTex(unc.of)}`
  const constant = parseConstantRefName(name)
  if (constant) return builtinConstant(constant)?.tex ?? symbolTex(constant)
  const solved = parseSolvedName(name)
  if (solved) return symbolTex(solved)
  // Statistics of a series: a_avg → ā, a_std → σ_a, a_sem → σ_ā, a_count → n_a
  const stat = parseSeriesStatName(name)
  if (stat) {
    const base = symbolTex(stat.base)
    switch (SERIES_SUFFIXES[stat.suffix]) {
      case AGGREGATE_KIND.std: return `\\sigma_{${base}}`
      case AGGREGATE_KIND.sem: return `\\sigma_{\\bar{${base}}}`
      case AGGREGATE_KIND.count: return `n_{${base}}`
      case AGGREGATE_KIND.mean: {
        // A namespace's series keeps its subscript outside the bar: a.x_avg → x̄_a.
        const sub = parseMemberName(stat.base) ? /^(.*?)(_\{.*\})$/.exec(base) : null
        return sub ? `\\bar{${sub[1]}}${sub[2]}` : `\\bar{${base}}`
      }
    }
  }
  // A namespace's member, a.x_1: the namespace goes first in the subscript, x_{a,1}.
  const member = parseMemberName(name)
  if (member) {
    const ns = namePart(member.namespace)
    // A named plot's fit: p.r2 → R²_p, p.chi2 → χ²_ν,p.
    if (member.member === FIT.r2) return `R^{2}_{${ns}}`
    if (member.member === FIT.chi2) return `\\chi^{2}_{\\nu,${ns}}`
    const tex = symbolTex(member.member)
    const sub = /^(.*?)_\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}$/.exec(tex)
    return sub ? `${sub[1]}_{${ns},${sub[2]}}` : `${tex}_{${ns}}`
  }
  const trailingDigits = TRAILING_DIGITS.exec(name)
  if (trailingDigits) return `${namePart(trailingDigits[1])}_{${trailingDigits[2]}}`
  // A letter, a number, then letters, `v1x`: v with 1x as its subscript.
  const numberedLabel = NUMBERED_LABEL.exec(name)
  if (numberedLabel) return `${namePart(numberedLabel[1])}_{${subscriptPart(numberedLabel[2])}}`
  // More than one subscript (`F_net_x`, a component) reads F_{net,x}.
  const [base, ...rest] = name.split('_')
  const subs = rest.filter(Boolean)
  return subs.length ? `${namePart(base)}_{${subs.map(subscriptPart).join(',')}}` : namePart(base)
}

/** One letter, then a number and letters, without an underscore: `v1x` (1: the letter, 2: the rest). */
export const NUMBERED_LABEL = new RegExp(String.raw`^([A-Za-z${GREEK_CHARS}])(\d+[A-Za-z]+)$`)

/**
 * A short subscript made of labels rather than a word: a number and a letter
 * (`1x`, `x1`), a letter and a component (`fx`, `tx`), a capital and initial or
 * final (`Ai`, `Bf`), or two capitals (`AB`). Words (`net`, `max`, `cm`, `eq`)
 * aren't, and nor are element symbols (`Na`, `Ca`, `Mg`), which stay upright.
 */
export const LABELS = /^(?:\d+[A-Za-z]|[A-Za-z]\d+|[A-Za-z][xyz]|[A-Z][if]|[A-Z]{2})$/

/** A subscript as LaTeX: labels each as itself (`fx` → f x, letters italic), a word upright (`net`). */
export const subscriptPart = (s: string) => (LABELS.test(s) ? [...s].map(namePart).join('') : namePart(s))

/** `1.235e+8` → 1.235 \times 10^{8} */
export function numberTex(s: string): string {
  const m = /^(-?[\d.]+)e([+-]?\d+)$/i.exec(s)
  return m ? `${m[1]} \\times 10^{${Number(m[2])}}` : s
}

/** `(kg m) / s^2` or `m/s^2` → \mathrm{kg}\cdot\mathrm{m}/\mathrm{s}^{2} */
/** Whether a unit's name is a unit with the micro prefix (um, us, uF), worked out once per name. */
export const microUnits = new Map<string, boolean>()
export function hasMicroPrefix(name: string): boolean {
  if (name.length < 2 || !name.startsWith('u')) return false
  let micro = microUnits.get(name)
  if (micro === undefined) {
    try {
      const parts = math.unit(1, name).units
      micro = parts.length === 1 && (parts[0].prefix as unknown as { name: string }).name === 'u'
    } catch {
      micro = false
    }
    microUnits.set(name, micro)
  }
  return micro
}

export function unitTex(s: string): string {
  // Brackets matter in a denominator (J/(mol·K)), but not around a numerator.
  let norm = s.trim()
    .replace(/\s*\/\s*/g, '/')
    .replace(/^\(([^()]*)\)\//, '$1/')
    .replace(/\(\s*/g, '(').replace(/\s*\)/g, ')')
    .replace(/\s*[*·]\s*|\s+/g, '*')
  // A species goes after its amount with a space, not a dot: mol EDTA, M NaOH.
  // A unit of species alone is a mole ratio, from mol X / mol EDTA: shown that way.
  const words = norm.match(/[A-Za-z]+/g) ?? []
  const onlySpecies = words.length > 0 && words.every(isSpeciesUnit)
  norm = norm.replace(/\*(?=[a-z]+)/g, (star, at: number) => (isSpeciesUnit(/^[a-z]+/.exec(norm.slice(at + 1))![0]) ? SPECIES_GAP : star))
    // A denominator that's one unit and its species needs no brackets: g H2O/mol H2O.
    .replace(/\/\(([A-Za-z]+~[a-z]+)\)$/, '/$1')
  return norm.replace(/[A-Za-z]+|\^(-?[\d.]+)|\*|~/g, (tok, pow) => {
    if (tok === '*') return '\\cdot '
    if (tok === SPECIES_GAP) return '\\,'
    if (pow !== undefined) return `^{${pow}}`
    const species = speciesOf(tok)
    // A ratio of species alone: mol X / mol EDTA, or g Cl / g AgCl.
    // (A named species is shown by its name, or its formula, as its declaration or the line says: speciesTex.)
    if (species) return onlySpecies ? `\\mathrm{${SPECIES_RATIO_UNIT[species.kind]}}\\,${speciesTex(species.formula)}` : speciesTex(species.formula)
    const look = UNIT_LOOKS[tok]
    if (look) return look.tex
    // The micro prefix, u in mathjs, as µ: um → µm.
    if (hasMicroPrefix(tok)) return `\\mu\\mathrm{${tok.slice(1)}}`
    return `\\mathrm{${tok}}`
  })
}

/**
 * Put a unit after a number: a thin space before most units, none before a
 * superscript unit like °. If the number already ends in a superscript
 * (1 × 10^{3}), the ° goes on an empty group to avoid a double superscript.
 */
export function attachUnit(num: string, unit: string): string {
  if (!unit) return num
  if (!unit.startsWith('^')) return `${num}\\,${unit}`
  return /\^\{[^{}]*\}\s*$/.test(num) ? `${num}{}${unit}` : `${num}${unit}`
}

/** A unit as mathjs reads it: unit("kg"). */
export const isUnitCall = (n: MathNode | undefined): n is FunctionNode =>
  !!n && isFunctionNode(n) && n.fn.name === FN.unit && isConstantNode(n.args[0])

/** The unit inside unit("kg"). */
export const unitCallText = (n: FunctionNode) => String((n.args[0] as math.ConstantNode).value)

/** A number kept as typed: lit("2.00"). */
export const isLitCall = (n: MathNode | undefined): n is FunctionNode =>
  !!n && isFunctionNode(n) && n.fn.name === FN.literal && isConstantNode(n.args[0])
