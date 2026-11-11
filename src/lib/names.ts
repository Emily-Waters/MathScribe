/**
 * Inside names: the variables MathScribe makes for itself, and how each kind is
 * named, built and read back. Every kind is built and parsed here and nowhere
 * else, so the two can't drift apart.
 *
 *   delta__F          F's uncertainty, `delta F` (δF; Delta__F is ΔF)
 *   at__c__5          the constant @c at 5 sig figs (at__c__x: @c:exact)
 *   solved__x         an unknown worked out by solve(…)
 *   unpacked__3       a tuple while `tuple(a, b) = …` unpacks it
 *   unpacked__column2_5   row 5 of a table's unnamed column 2
 *   a__x_1            a namespace's member, `a.x_1` (a selection, named import or plot)
 *
 * A series' members are its name, `_`, and a number (t_1), and its statistics
 * its name, `_`, and a suffix (t_avg); a named plot's fit is p.slope, p.intercept,
 * p.r2 and p.chi2.
 */
import {
  DOT_ACCESS, EXACT_SETTING, IS_NAME, MEMBER_DOT, NAME, SERIES_SUFFIXES, SUBSCRIPT, UNCERTAINTY_WORDS,
  type Precision, type SeriesSuffix, type UncertaintyWord,
} from './syntax.ts'

/** Between the parts of an inside name. */
export const JOIN = '__'

/** The first part of each kind of hidden name (besides uncertainties, which start with the word typed). */
export const HIDDEN_PREFIX = {
  constant: 'at',
  solved: 'solved',
  unpacked: 'unpacked',
  /** A value put into text, `{{c_Na}}`, while it's worked out. */
  inline: 'inline',
} as const

/** A constant held at full precision: `@c:exact` → at__c__x. */
const EXACT_MARK = 'x'

/** The rows of a table's unnamed column: unpacked__column2_5. */
const COLUMN = 'column'

/** Words that start hidden names, so they can't name a namespace (delta.x would read as δx's). */
export const RESERVED_NAMESPACES: ReadonlySet<string> = new Set<string>([...UNCERTAINTY_WORDS, ...Object.values(HIDDEN_PREFIX)])

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/** F's uncertainty, as typed: `delta F` → delta__F, `Delta F` → Delta__F. */
export const uncertaintyName = (letter: UncertaintyWord, of: string) => `${letter}${JOIN}${of}`

/** The constant @name at a precision: `@c:5` → at__c__5. */
export const constantRefName = (name: string, digits: Precision) =>
  `${HIDDEN_PREFIX.constant}${JOIN}${name}${JOIN}${digits === EXACT_SETTING ? EXACT_MARK : digits}`

/** An unknown solve(…) worked out: x → solved__x. */
export const solvedName = (x: string) => `${HIDDEN_PREFIX.solved}${JOIN}${x}`

/** A tuple being unpacked (the `id`th). */
export const unpackedName = (id: number) => `${HIDDEN_PREFIX.unpacked}${JOIN}${id}`

/** Row `row` of a table's unnamed column `column`. */
export const unpackedColumnName = (column: number, row: number) =>
  seriesMemberName(`${HIDDEN_PREFIX.unpacked}${JOIN}${COLUMN}${column}`, row)

/** A value in text while it's worked out (there's only ever one at a time). */
export const INLINE_VALUE_NAME = `${HIDDEN_PREFIX.inline}${JOIN}value`

/** A namespace's member: `a.x_1` → a__x_1. */
export const memberName = (namespace: string, member: string) => `${namespace}${JOIN}${member}`

/** Member `n` of a series: t, 3 → t_3. */
export const seriesMemberName = (base: string, n: number) => `${base}${SUBSCRIPT}${n}`

/** A series' statistic: t, avg → t_avg. */
export const seriesStatName = (base: string, suffix: SeriesSuffix) => `${base}${SUBSCRIPT}${suffix}`

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const UNCERTAINTY_NAME = new RegExp(`^(${UNCERTAINTY_WORDS.join('|')})${JOIN}(.+)$`)
const CONSTANT_NAME = new RegExp(String.raw`^${HIDDEN_PREFIX.constant}${JOIN}(.+)${JOIN}(?:\d+|${EXACT_MARK})$`)
const SOLVED_NAME = new RegExp(`^${HIDDEN_PREFIX.solved}${JOIN}(.+)$`)
const UNPACKED_START = `${HIDDEN_PREFIX.unpacked}${JOIN}`

/** A series' statistic, `t_avg` (1: the series, 2: the suffix). */
export const SERIES_STAT_NAME = new RegExp(`^(.+?)${SUBSCRIPT}(${Object.keys(SERIES_SUFFIXES).join('|')})$`)

/** A series' member, `t_1` or `t1` (1: the series, 2: the number: all the digits at the end). */
const NUMBERED_NAME = new RegExp(String.raw`^(.+?)${SUBSCRIPT}?(\d+)$`)

/** A series' member's series and number: t_1 and t1 → t, 1; run1__x_12 → run1__x, 12 (null if it isn't numbered). */
export function parseNumberedName(name: string): { base: string; n: number } | null {
  const m = NUMBERED_NAME.exec(name)
  return m ? { base: m[1], n: Number(m[2]) } : null
}

/** Whose uncertainty a hidden name holds, and the word it was asked for with (null if it isn't one). */
export function parseUncertaintyName(name: string): { letter: UncertaintyWord; of: string } | null {
  const m = UNCERTAINTY_NAME.exec(name)
  return m ? { letter: m[1] as UncertaintyWord, of: m[2] } : null
}

export const isUncertaintyName = (name: string) => parseUncertaintyName(name) !== null

/** The constant a hidden name holds (null if it isn't one). */
export const parseConstantRefName = (name: string): string | null => CONSTANT_NAME.exec(name)?.[1] ?? null

/** The unknown a hidden name holds (null if it isn't one). */
export const parseSolvedName = (name: string): string | null => SOLVED_NAME.exec(name)?.[1] ?? null

export const isUnpackedName = (name: string) => name.startsWith(UNPACKED_START)

/** A series' statistic's series and suffix: t_avg → t, avg (null if it isn't one). */
export function parseSeriesStatName(name: string): { base: string; suffix: SeriesSuffix } | null {
  const m = SERIES_STAT_NAME.exec(name)
  return m ? { base: m[1], suffix: m[2] as SeriesSuffix } : null
}

/** Hidden variables: made for the sheet's own use, not listed as its variables. */
export const isHiddenName = (name: string) =>
  isUncertaintyName(name) || parseConstantRefName(name) !== null || parseSolvedName(name) !== null || isUnpackedName(name)
  || name === INLINE_VALUE_NAME

/** A namespace's member's namespace and member: a__x_1 → a, x_1 (null if it isn't one). */
export function parseMemberName(name: string): { namespace: string; member: string } | null {
  const at = name.indexOf(JOIN)
  if (at <= 0) return null
  const namespace = name.slice(0, at)
  const member = name.slice(at + JOIN.length)
  if (RESERVED_NAMESPACES.has(namespace) || !IS_NAME.test(namespace) || !IS_NAME.test(member)) return null
  return { namespace, member }
}

// ---------------------------------------------------------------------------
// Members as typed, a.x_1
// ---------------------------------------------------------------------------

/**
 * Text with each `a.x_1` as its inside name, a__x_1, leaving quoted text
 * alone. A numbered member is kept as written (a.x1 → a__x1): t1 and t_1 are
 * the same variable, inside a namespace too.
 */
export function expandDots(text: string): string {
  if (!text.includes(MEMBER_DOT)) return text
  return text.split(/("[^"]*")/).map((part, i) => (i % 2 ? part : part.replace(DOT_ACCESS, (typed: string, ns: string, member: string) =>
    RESERVED_NAMESPACES.has(ns) ? typed : memberName(ns, member)))).join('')
}

/** A member as typed: a__x_1 → a.x_1 (other names as they are). */
export function typedName(name: string): string {
  const m = parseMemberName(name)
  return m ? `${m.namespace}${MEMBER_DOT}${m.member}` : name
}

/** Inside names in a message written back as typed: a__x_1 → a.x_1. */
export const readableMembers = (text: string) => text.replace(new RegExp(String.raw`\b${NAME}`, 'g'), typedName)

// ---------------------------------------------------------------------------
// A named plot's fit
// ---------------------------------------------------------------------------

/** What a named plot's fit holds: p.slope, p.intercept, p.r2, p.chi2 (a weighted fit's). */
export const FIT = {
  slope: 'slope',
  intercept: 'intercept',
  r2: 'r2',
  chi2: 'chi2',
} as const
export type FitMember = (typeof FIT)[keyof typeof FIT]
