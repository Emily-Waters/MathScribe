/**
 * Inside names: the variables MathScribe makes for itself, and how each kind is
 * named, built and read back. Every kind is built and parsed here and nowhere
 * else, so the two can't drift apart.
 *
 *   delta__F          F's uncertainty, `delta F` (δF; Delta__F is ΔF)
 *   at__c__5          the constant @c at 5 sig figs (at__c__x: @c:exact)
 *   solved__x         an unknown worked out by @solve(…)
 *   unpacked__3       a tuple while `@tuple(a, b) = …` unpacks it
 *   unpacked__column2_5   row 5 of a table's unnamed column 2
 *   argument__3       the uncertainty of an argument a function's body asks for (`delta A`)
 *   a__x_1            a namespace's member, `a.x_1` (a named import or plot)
 *   t__3              a series' member, `t[3]` (a.x[3]: a__x__3)
 *   t__avg            a series' statistic, `t.avg` (as any member is)
 *
 * A series is made by name ([…], @import, a table's column, a condition), never
 * by numbering: t_1 and t1 are names like any other. Its members are its name
 * and a number, t[3], and its statistics members of it, t.avg, t.sum; a
 * named plot's fit is p.slope, p.intercept, p.r2 and p.chi2.
 */
import {
  CALL, EXACT_SETTING, IS_NAME, MEMBER_DOT, MEMBER_INDEX, NAME, SERIES_SUFFIXES, SIGIL, UNCERTAINTY_WORDS,
  type Precision, type SeriesSuffix, type UncertaintyWord,
} from '../syntax.ts'

/** Between the parts of an inside name. */
export const JOIN = '__'

/** The first part of each kind of hidden name (besides uncertainties, which start with the word typed). */
export const HIDDEN_PREFIX = {
  constant: 'at',
  solved: 'solved',
  unpacked: 'unpacked',
  /** A value put into text, `{{c_Na}}`, while it's worked out. */
  inline: 'inline',
  /** A function built in under @, as mathjs holds it: @tuple → builtin__tuple. */
  builtin: 'builtin',
  /** The uncertainty of an argument to a sheet's function whose body asks for it (`delta A`): argument__3. */
  argument: 'argument',
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

/**
 * A function built in under @, as mathjs holds it: `@tuple(…)` → builtin__tuple(…).
 * (A name the sheet can't write, so its own functions never clash with one.)
 */
export const builtinFunctionName = (name: string) => `${HIDDEN_PREFIX.builtin}${JOIN}${name}`

/** The function `@tuple(…)` makes a tuple with. */
export const TUPLE_FUNCTION = builtinFunctionName(CALL.tuple)

/** The function `@inv(x)` works 1/x out with. */
export const INV_FUNCTION = builtinFunctionName(CALL.inv)

/** An unknown @solve(…) worked out: x → solved__x. */
export const solvedName = (x: string) => `${HIDDEN_PREFIX.solved}${JOIN}${x}`

/** A tuple being unpacked (the `id`th). */
export const unpackedName = (id: number) => `${HIDDEN_PREFIX.unpacked}${JOIN}${id}`

/** Row `row` of a table's unnamed column `column`. */
export const unpackedColumnName = (column: number, row: number) =>
  seriesMemberName(`${HIDDEN_PREFIX.unpacked}${JOIN}${COLUMN}${column}`, row)

/** The uncertainty of an argument to a call (the `id`th), as the call is given it: argument__3. */
export const argumentUncertaintyName = (id: number) => `${HIDDEN_PREFIX.argument}${JOIN}${id}`

/** A value in text while it's worked out (there's only ever one at a time). */
export const INLINE_VALUE_NAME = `${HIDDEN_PREFIX.inline}${JOIN}value`

/** A namespace's member: `a.x_1` → a__x_1. */
export const memberName = (namespace: string, member: string) => `${namespace}${JOIN}${member}`

/**
 * A constant's inside name, as typed with or without its namespaces: `c` → c,
 * `chem.mm.Na` → chem__mm__Na (`chem__mm.Na`, with its first dot read already, too).
 */
export const constantKey = (typed: string) => typed.replaceAll(MEMBER_DOT, JOIN)

/** A constant's name as typed, from its inside name: chem__mm__Na → chem.mm.Na. */
export const typedConstant = (key: string) => key.replaceAll(JOIN, MEMBER_DOT)


/** Member `n` of a series, `t[3]`: t, 3 → t__3. */
export const seriesMemberName = (base: string, n: number) => `${base}${JOIN}${n}`

/** A series' statistic, `t.avg`: t, avg → t__avg. */
export const seriesStatName = (base: string, suffix: SeriesSuffix) => memberName(base, suffix)

/**
 * The rows of a series where a condition holds, `x[t > 0.2 s]`, as a series of
 * its own: x__where3 (its number, one per series and condition: see the series
 * module's where.ts, which says how it's written and shown, describeName).
 */
export const whereName = (base: string, id: number) => `${base}${JOIN}${WHERE}${id}`

/** What marks the rows where a condition holds, in their inside name: x__where3. */
const WHERE = 'where'

/** The rows where a condition holds (1: the series): x__where3 → x. */
const WHERE_NAME = new RegExp(String.raw`^(.+)${JOIN}${WHERE}\d+$`)

/** The series a name of the rows where a condition holds is of: x__where3 → x (undefined if it isn't one). */
export const whereOf = (name: string): string | undefined => WHERE_NAME.exec(name)?.[1]

/**
 * Names made for something written in a way a name can't hold (a condition,
 * `x[t > 0.2 s]`), with how each is written and typeset; declared as they're
 * made (describeName), so messages and the output name them as written.
 */
const described = new Map<string, { readonly typed: string; readonly tex: string }>()

/** Say how a made name is written (`x[t > 0.2 s]`) and typeset. */
export const describeName = (name: string, typed: string, tex: string) => {
  described.set(name, { typed, tex })
}

/** How a made name is written and typeset, if it was described (describeName). */
export const describedName = (name: string) => described.get(name)

/** Which of a series' members a slice takes, `t[2:10:2]`: from and to (by number, both kept), and every `step`th; any can be left out. */
export interface SliceSpec {
  readonly from?: number
  readonly to?: number
  readonly step?: number
}

/** A slice's inside name: the series, `slice`, and each part given, marked by its letter: t[2:10:2] → t__slice_f2_t10_s2. */
const SLICE = { word: 'slice', from: 'f', to: 't', step: 's', between: '_' } as const

/** A slice of a series, `t[2:10:2]`, as the series it stands for: t__slice_f2_t10_s2 (t[::2]: t__slice_s2). */
export const sliceName = (base: string, spec: SliceSpec) =>
  `${base}${JOIN}${SLICE.word}${([[SLICE.from, spec.from], [SLICE.to, spec.to], [SLICE.step, spec.step]] as const)
    .map(([mark, n]) => (n === undefined ? '' : `${SLICE.between}${mark}${n}`)).join('')}`

/** A slice's inside name (1: the series; 2, 3, 4: from, to and step, if given). */
const SLICE_NAME = new RegExp(String.raw`^(.+)${JOIN}${SLICE.word}(?:${SLICE.between}${SLICE.from}(\d+))?(?:${SLICE.between}${SLICE.to}(\d+))?(?:${SLICE.between}${SLICE.step}(\d+))?$`)

/** A slice's series and what it takes: t__slice_f2_t10 → t, { from: 2, to: 10 } (null if it isn't one). */
export function parseSliceName(name: string): { of: string; spec: SliceSpec } | null {
  const m = SLICE_NAME.exec(name)
  if (!m) return null
  const n = (s: string | undefined) => (s === undefined ? undefined : Number(s))
  return { of: m[1], spec: { from: n(m[2]), to: n(m[3]), step: n(m[4]) } }
}

/** Whether a name might be a slice's, or one of its members' (a quick test, before parseSliceName). */
export const mayBeSlice = (name: string) => name.includes(`${JOIN}${SLICE.word}`)

/** A slice as typed: t[2:10:2], t[::2], t[3:]. */
export const typedSlice = (spec: SliceSpec) =>
  [spec.from, spec.to, ...(spec.step === undefined ? [] : [spec.step])].map((n) => (n === undefined ? '' : String(n))).join(SLICE_COLON)

/** Between a slice's from, to and step, as typed: t[2:10:2]. */
export const SLICE_COLON = ':'

/**
 * The members a slice takes, of a series' members in order of their numbers
 * (each with its number): those from `from` to `to`, then every `step`th of them.
 */
export function sliceOf<T>(members: readonly (readonly [number, T])[], spec: SliceSpec): T[] {
  const kept = members.filter(([n]) => (spec.from === undefined || n >= spec.from) && (spec.to === undefined || n <= spec.to))
  return kept.filter((_, i) => i % (spec.step ?? 1) === 0).map(([, m]) => m)
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const UNCERTAINTY_NAME = new RegExp(`^(${UNCERTAINTY_WORDS.join('|')})${JOIN}(.+)$`)
const CONSTANT_NAME = new RegExp(String.raw`^${HIDDEN_PREFIX.constant}${JOIN}(.+)${JOIN}(?:\d+|${EXACT_MARK})$`)
const SOLVED_NAME = new RegExp(`^${HIDDEN_PREFIX.solved}${JOIN}(.+)$`)
const UNPACKED_START = `${HIDDEN_PREFIX.unpacked}${JOIN}`

/** A series' statistic, `t.avg` as t__avg (1: the series, 2: the statistic). */
export const SERIES_STAT_NAME = new RegExp(`^(.+)${JOIN}(${Object.keys(SERIES_SUFFIXES).join('|')})$`)

/** A series' member, `t[1]` as t__1 (1: the series, 2: its number). */
const NUMBERED_NAME = new RegExp(String.raw`^(.+)${JOIN}(\d+)$`)

/** A series' member's series and number: t__1 → t, 1; run1__x__12 → run1__x, 12 (null if it isn't one). */
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
  || name === INLINE_VALUE_NAME || isArgumentUncertaintyName(name)

/** Whether a name is an argument's uncertainty, as a call is given it (argument__3). */
export function isArgumentUncertaintyName(name: string): boolean {
  return name.startsWith(`${HIDDEN_PREFIX.argument}${JOIN}`)
}

/** A namespace's member's namespace and member: a__x_1 → a, x_1 (null if it isn't one). */
export function parseMemberName(name: string): { namespace: string; member: string } | null {
  const at = name.indexOf(JOIN)
  if (at <= 0) return null
  const namespace = name.slice(0, at)
  const member = name.slice(at + JOIN.length)
  if (RESERVED_NAMESPACES.has(namespace) || !IS_NAME.test(namespace) || !IS_NAME.test(member)) return null
  return { namespace, member }
}

// (Members as typed, `a.x_1`, are read into their inside names from the line's tokens: engine/core/memberAccess.ts.)

/** A built-in function as typed: builtin__tuple → @tuple. */
const BUILTIN_FUNCTION_NAME = new RegExp(String.raw`^${HIDDEN_PREFIX.builtin}${JOIN}(${NAME})$`)

/** A member as typed: a__x_1 → a.x_1, t__3 → t[3], builtin__tuple → @tuple (other names as they are). */
export function typedName(name: string): string {
  const said = described.get(name)
  if (said) return said.typed
  const slice = parseSliceName(name)
  if (slice) return `${typedName(slice.of)}${MEMBER_INDEX.open}${typedSlice(slice.spec)}${MEMBER_INDEX.close}`
  const numbered = parseNumberedName(name)
  if (numbered) return `${typedName(numbered.base)}${MEMBER_INDEX.open}${numbered.n}${MEMBER_INDEX.close}`
  // (A slice's statistic, t[2:4].avg.)
  const stat = mayBeSlice(name) ? parseSeriesStatName(name) : null
  if (stat && parseSliceName(stat.base)) return `${typedName(stat.base)}${MEMBER_DOT}${stat.suffix}`
  const builtin = BUILTIN_FUNCTION_NAME.exec(name)
  if (builtin) return `${SIGIL}${builtin[1]}`
  const m = parseMemberName(name)
  // (A member's member, H2SO4__H__n, as typed: H2SO4.H.n.)
  return m ? `${m.namespace}${MEMBER_DOT}${m.member.split(JOIN).join(MEMBER_DOT)}` : name
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
