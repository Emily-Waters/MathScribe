/** Names, numbers and units as LaTeX. */
import { AGGREGATE_KIND } from '../../sheet/values.ts'
import { builtinConstant } from '../../builtins.ts'
import { GREEK_BY_CHAR, GREEK_BY_NAME, GREEK_CHARS, IS_DIGITS, SCIENTIFIC, SERIES_SUFFIXES, inClass, lit, regex, src } from '../../syntax.ts'
import {
  ENDS_IN_SUBSCRIPT, SUBSCRIPT_TAIL, TEX_GROUP, TEX_LIST, TEX_SUPERSCRIPT, TEX_THIN_SPACE, TEX_TIE,
} from '../../latex/syntax.ts'
import { JOIN, parseConstantRefName, parseMemberName, parseNumberedName, parseSeriesStatName, parseSliceName, typedSlice, describedName, parseHeldName, parseUncertaintyName } from '../../sheet/names.ts'
import {
  FN, UNIT_LOOKS, isCall, isConstant, quantity, unitParts, type CallExpr, type ConstantExpr, type Expr,
} from '../../maths/library/index.ts'
import { isLabelUnit, labelUnitTex, moduleMemberTex, moduleNameSubscriptTex } from './module.ts'

/** In unitTex: between a unit and the label unit after it (mol EDTA), a space rather than a dot. */
export const LABEL_GAP = TEX_TIE

// ---------------------------------------------------------------------------
// LaTeX helpers
// ---------------------------------------------------------------------------

/** A Greek letter in a name, as a piece of its own (to split `ΔE` into Δ and E). */
export const GREEK_LETTER = regex(src`([${GREEK_CHARS}])`)

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
  if (s.length === 1 || IS_DIGITS.test(s)) return s
  return `\\mathrm{${s}}`
}

/** A name of letters then digits, `a2`, `ω1` (1: the letters, 2: the digits), which reads a₂. */
export const TRAILING_DIGITS = regex(src`^([A-Za-z${GREEK_CHARS}]+?)(\d+)$`)

/**
 * How a name is shown in place of its symbol, if it is: its display name
 * (`a:"Acceleration"`, a series' `t:"Time"`), as LaTeX; undefined if it has none.
 */
export type ShownName = (name: string) => string | undefined

/**
 * `v_0` → v_{0}, `F_net` → F_{\mathrm{net}}, `F_net_x` → F_{\mathrm{net},x}, `theta` → \theta, `a2` → a_{2}.
 * A name made from another, its uncertainty or a series' statistic, is made from
 * the other as `shown` shows it, if it does: `delta a` → δ Acceleration, `t.avg` → Time with a bar.
 */
export function symbolTex(name: string, shown?: ShownName): string {
  if (name === 'Infinity') return '\\infty'
  const unc = parseUncertaintyName(name)
  if (unc) return `\\${unc.letter} ${shown?.(unc.of) ?? symbolTex(unc.of, shown)}`
  const constant = parseConstantRefName(name)
  if (constant) return builtinConstant(constant)?.tex ?? symbolTex(constant)
  // A value a module holds for itself, shown as the name it stands for (@solve's answer, held__x → x).
  const held = parseHeldName(name)
  if (held) return symbolTex(held)
  // A name made for something written another way (the rows where a condition holds), as it said it's typeset.
  const said = describedName(name)
  if (said) return said.tex
  // A slice of a series, t[2:4] → t_{2:4}, after any subscript the series has (a.x[2:] → x_{a,2:}).
  const slice = parseSliceName(name)
  if (slice) {
    const base = symbolTex(slice.of)
    const part = typedSlice(slice.spec)
    const sub = ENDS_IN_SUBSCRIPT.exec(base)
    return sub ? `${sub[1]}_{${sub[2]}${TEX_LIST}${part}}` : `${base}_{${part}}`
  }
  // A series' member, t[3] → t₃: its number after any subscript the series has (a.x[3] → x_{a,3}, v_0[2] → v_{0,2}).
  const numbered = parseNumberedName(name)
  if (numbered) {
    const base = symbolTex(numbered.base)
    const sub = ENDS_IN_SUBSCRIPT.exec(base)
    return sub ? `${sub[1]}_{${sub[2]}${TEX_LIST}${numbered.n}}` : `${base}_{${numbered.n}}`
  }
  // Statistics of a series: a.avg → ā, a.std → σ_a, a.sem → σ_ā, a.count → n_a, a.sum → Σa
  const stat = parseSeriesStatName(name)
  if (stat) {
    // A series with a display name: its statistics are made from it, the mean's bar over the whole of it.
    const named = shown?.(stat.base)
    if (named !== undefined) {
      switch (SERIES_SUFFIXES[stat.suffix]) {
        case AGGREGATE_KIND.std: return `\\sigma_{${named}}`
        case AGGREGATE_KIND.sem: return `\\sigma_{\\overline{${named}}}`
        case AGGREGATE_KIND.count: return `n_{${named}}`
        case AGGREGATE_KIND.sum: return `\\Sigma ${named}`
        case AGGREGATE_KIND.mean: return `\\overline{${named}}`
      }
    }
    const base = symbolTex(stat.base)
    switch (SERIES_SUFFIXES[stat.suffix]) {
      case AGGREGATE_KIND.std: return `\\sigma_{${base}}`
      case AGGREGATE_KIND.sem: return `\\sigma_{\\bar{${base}}}`
      case AGGREGATE_KIND.count: return `n_{${base}}`
      case AGGREGATE_KIND.sum: return `\\Sigma ${base}`
      case AGGREGATE_KIND.mean: {
        // A series with a subscript keeps it outside the bar: t_down.avg → t̄_down, a.x.avg → x̄_a.
        const sub = SUBSCRIPT_TAIL.exec(base)
        return sub ? `\\bar{${sub[1]}}${sub[2]}` : `\\bar{${base}}`
      }
    }
  }
  // A namespace's member, a.x_1: the namespace goes first in the subscript, x_{a,1}.
  const member = parseMemberName(name)
  if (member) {
    // (A namespace in a module's notation is drawn as it: a substance's, H2SO4.m, as m with H₂SO₄ below.)
    const ns = moduleNameSubscriptTex(member.namespace, true) ?? namePart(member.namespace)
    // A member a module typesets its own way (a named plot's fit: p.r2 → R²_p).
    const own = moduleMemberTex(member.member, ns)
    if (own !== undefined) return own
    // A member's member, H2SO4.H.n: the last part, with the others below it, innermost first (n with H, H₂SO₄).
    const inner = member.member.split(JOIN)
    if (inner.length > 1) {
      const last = inner.pop()!
      const parts = inner.reverse().map((p) => moduleNameSubscriptTex(p, true) ?? namePart(p))
      return `${symbolTex(last)}_{${[...parts, ns].join(TEX_LIST)}}`
    }
    const tex = symbolTex(member.member)
    const sub = ENDS_IN_SUBSCRIPT.exec(tex)
    return sub ? `${sub[1]}_{${ns}${TEX_LIST}${sub[2]}}` : `${tex}_{${ns}}`
  }
  const trailingDigits = TRAILING_DIGITS.exec(name)
  if (trailingDigits) return `${namePart(trailingDigits[1])}_{${trailingDigits[2]}}`
  // A letter, a number, then letters, `v1x`: v with 1x as its subscript.
  const numberedLabel = NUMBERED_LABEL.exec(name)
  if (numberedLabel) return `${namePart(numberedLabel[1])}_{${subscriptPart(numberedLabel[2])}}`
  // More than one subscript (`F_net_x`, a component) reads F_{net,x}.
  const [base, ...rest] = name.split('_')
  const subs = rest.filter(Boolean)
  // (A module's notation first: a formula, `n_H2O`, drawn as chemistry.)
  const sub = (s: string) => moduleNameSubscriptTex(s) ?? subscriptPart(s)
  return subs.length ? `${namePart(base)}_{${subs.map(sub).join(TEX_LIST)}}` : namePart(base)
}

/** One letter, then a number and letters, without an underscore: `v1x` (1: the letter, 2: the rest). */
export const NUMBERED_LABEL = regex(src`^([A-Za-z${GREEK_CHARS}])(\d+[A-Za-z]+)$`)

/**
 * A short subscript made of labels rather than a word: a number and a letter
 * (`1x`, `x1`), a letter and a component (`fx`, `tx`), a capital and initial or
 * final (`Ai`, `Bf`), or two capitals (`AB`). Words (`net`, `max`, `cm`, `eq`)
 * aren't, and nor are element symbols (`Na`, `Ca`, `Mg`), which stay upright.
 */
export const LABELS = regex(src`^(?:\d+[A-Za-z]|[A-Za-z]\d+|[A-Za-z][xyz]|[A-Z][if]|[A-Z]{2})$`)

/** A subscript as LaTeX: labels each as itself (`fx` → f x, letters italic), a word upright (`net`). */
export const subscriptPart = (s: string) => (LABELS.test(s) ? [...s].map(namePart).join('') : namePart(s))

/** `1.235e+8` → 1.235 \times 10^{8} */
export function numberTex(s: string): string {
  const m = SCIENTIFIC.exec(s)
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
      const parts = unitParts(quantity(1, name))
      micro = parts.length === 1 && parts[0].prefix === 'u'
    } catch {
      micro = false
    }
    microUnits.set(name, micro)
  }
  return micro
}

/** A denominator of one unit and its label, in brackets at the end: `/(mol~H2O)` (1: what's in them). */
const LABELLED_DENOMINATOR = regex(src`\/\(([A-Za-z]+${lit(LABEL_GAP)}[a-z]+)\)$`)

/** One piece of a unit, as unitTex draws it: a unit's name, a power (1: its number), a `*`, or a label's gap. */
const UNIT_PIECE = regex(src`[A-Za-z]+|\^(-?[\d.]+)|\*|${lit(LABEL_GAP)}`, 'g')

export function unitTex(s: string): string {
  // Brackets matter in a denominator (J/(mol·K)), but not around a numerator.
  let norm = s.trim()
    .replace(/\s*\/\s*/g, '/')
    .replace(/^\(([^()]*)\)\//, '$1/')
    .replace(/\(\s*/g, '(').replace(/\s*\)/g, ')')
    .replace(/\s*[*·]\s*|\s+/g, '*')
  // A label unit (a species, whose names are small letters) goes after its unit with a space, not a dot: mol EDTA, M NaOH.
  // A unit of labels alone is a ratio of them (mol X / mol EDTA): its module shows it as one.
  const words = norm.match(/[A-Za-z]+/g) ?? []
  const onlyLabels = words.length > 0 && words.every(isLabelUnit)
  norm = norm.replace(/\*(?=[a-z]+)/g, (star, at: number) => (isLabelUnit(/^[a-z]+/.exec(norm.slice(at + 1))![0]) ? LABEL_GAP : star))
    // A denominator that's one unit and its label needs no brackets: g H2O/mol H2O.
    .replace(LABELLED_DENOMINATOR, '/$1')
  const tex = (part: string) => part.replace(UNIT_PIECE, (tok, pow) => {
    if (tok === '*') return '\\cdot '
    if (tok === LABEL_GAP) return '\\,'
    if (pow !== undefined) return `^{${pow}}`
    const label = labelUnitTex(tok, onlyLabels)
    if (label !== undefined) return label
    const look = UNIT_LOOKS[tok]
    if (look) return look.tex
    // The micro prefix, u in the library, as µ: um → µm.
    if (hasMicroPrefix(tok)) return `\\mu\\mathrm{${tok.slice(1)}}`
    return `\\mathrm{${tok}}`
  })
  // With a label above the line and below it (g H2O/mol H2O, grams of water per mole of it), it's stacked,
  // so it reads as said; any other unit keeps its slash.
  const stacked = STACKED_UNIT.exec(norm)
  if (stacked && stacked[1].includes(LABEL_GAP) && stacked[2].includes(LABEL_GAP)) {
    return `\\frac{${tex(stacked[1])}}{${tex(stacked[2].replace(/^\((.*)\)$/, '$1'))}}`
  }
  return tex(norm)
}

/** A unit with one division in it, at the top (1: above the line, 2: below it). */
const STACKED_UNIT = /^([^/()]+)\/([^/]+)$/

/** A unit as the library writes one with one division, either side bracketed or not: `kg / m^3`, `(g H2O) / (mol H2O)` (1: above, 2: below). */
const DIVIDED_UNIT = /^\(?([^/()]+)\)?\/\(?([^/()]+)\)?$/

/** A unit's parts above and below its line, if it has one (`kg / m^3`, `(g H2O) / (mol H2O)`); undefined if not. */
export function splitUnit(s: string): { above: string; below: string } | undefined {
  const m = DIVIDED_UNIT.exec(s.trim().replace(/\s*\/\s*/g, '/'))
  return m ? { above: m[1].trim(), below: m[2].trim() } : undefined
}

/** The words of a piecewise value's cases: `x, if x > 0`, `0, otherwise`. */
export const CASE_WORDS = { if: 'if ', otherwise: 'otherwise' } as const

/** One case of a piecewise value, as the library writes them: its value, then when it applies. */
export const caseTex = (value: string, when: string) => `{${value.trim()}}, &\\quad{${when}}`

/** The words before the unit a function's results are shown in, said after its equation. */
export const RESULT_UNIT_WORDS = 'in '

/** A function's result unit, after its equation: `ang(y, x) = tan⁻¹(y/x)   in °`. */
export const resultUnitTex = (unit: string) => `\\quad\\text{${RESULT_UNIT_WORDS}}{}${unit}`

/**
 * Put a unit after a number: a thin space before most units, none before a
 * superscript unit like °. If the number already ends in a superscript
 * (1 × 10^{3}), the ° goes on an empty group to avoid a double superscript.
 */
export function attachUnit(num: string, unit: string): string {
  if (!unit) return num
  if (!unit.startsWith(TEX_SUPERSCRIPT)) return `${num}${TEX_THIN_SPACE}${unit}`
  return ENDS_IN_SUPERSCRIPT.test(num) ? `${num}${TEX_GROUP.open}${TEX_GROUP.close}${unit}` : `${num}${unit}`
}

/** TeX that ends in a superscript's group, `10^{3}`. */
const ENDS_IN_SUPERSCRIPT = regex(src`${lit(TEX_SUPERSCRIPT)}${lit(TEX_GROUP.open)}[^${inClass(TEX_GROUP.open, TEX_GROUP.close)}]*${lit(TEX_GROUP.close)}\s*$`)

/** A unit as the library reads it: unit("kg"). */
export const isUnitCall = (n: Expr | undefined): n is CallExpr =>
  !!n && isCall(n) && n.fn.name === FN.unit && isConstant(n.args[0])

/** The unit inside unit("kg"). */
export const unitCallText = (n: CallExpr) => String((n.args[0] as ConstantExpr).value)

/** A number kept as typed: lit("2.00"). */
export const isLitCall = (n: Expr | undefined): n is CallExpr =>
  !!n && isCall(n) && n.fn.name === FN.literal && isConstant(n.args[0])
