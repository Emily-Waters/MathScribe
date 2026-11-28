/**
 * IntelliSense for the sheet editor: completions as you type, and information
 * when you hover over a name.
 *
 * What it knows comes from the evaluated sheet (collectSymbols): the variables
 * defined above the cursor and in scope (with their values), function
 * parameters, your functions (with their signatures) and `@constants`; plus the
 * fixed vocabulary (vocabulary.ts), built-in constants and mathjs's units.
 *
 * Completions depend on what's being typed:
 *   after `@`                 → constants
 *   after a number, or `to`   → units (and `percent` after `to`)
 *   `\` and a letter's name   → Greek letters (`\Delta` → Δ; see greek.ts)
 *   a name                    → variables, functions, series names, keywords
 *
 * A suggestion is accepted with Tab (or Enter too, if the setting says so), so
 * by default Enter at the end of a line always starts a new one.
 */
import {
  acceptCompletion, autocompletion, completionKeymap, snippetCompletion, startCompletion,
  type Completion, type CompletionContext, type CompletionResult,
} from '@codemirror/autocomplete'
import { Compartment, Prec, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state'
import { EditorView, hoverTooltip, keymap, type Command } from '@codemirror/view'
import katex from '../lib/output/katex.ts'
import { isNamespaceConstant, type BuiltinConstant, type NamespaceConstant } from '../lib/constants.ts'
import {
  BUILTINS, BlockMember, ConstantMember, FunctionMember, Namespace as BuiltinNamespace, type Member,
} from '../lib/builtins.ts'
import { SYMBOL_KIND, type SheetSymbol } from '../lib/sheet/sheetIndex.ts'
import { describeUnit, isUnitName, numberTex, symbolTex, unitNames, unitTex } from '../lib/engine/index.ts'
import { STORAGE_KEYS } from '../config.ts'
import { readStored, writeStored } from '../lib/data/storage.ts'
import {
  CURLY_BRACKETS, GREEK_CHARS, KEYWORD, MEMBER_DOT, MEMBER_INDEX, NAME, NAME_CHAR, PERCENT, ROUND_BRACKETS, SERIES_STAT_SUFFIX, SIGIL, VALUE_BRACES,
  inClass, lit, regex, src,
} from '../lib/syntax.ts'
import { memberName, parseMemberName, parseNumberedName, seriesMemberName, typedName } from '../lib/sheet/names.ts'
import { BUILTIN_FUNCTIONS, KEYWORDS, MATH_CONSTANTS, SERIES_SUFFIXES, SETTING_WORDS } from './vocabulary.ts'
import { inNote, inValue, isProseLine } from './language.ts'
import { inDataBlock, inNamelessBlock, readAs } from './sheetLines.ts'
import { TYPING, typingAt, typingInValue } from './typing.ts'
import { greekCompletions, greekOnSpace } from './greek.ts'
import { LETTERS_SO_FAR, WORD_CHARS_SO_FAR } from './syntax.ts'

// ---------------------------------------------------------------------------
// What the sheet defines
// ---------------------------------------------------------------------------

/** Replaces what the sheet defines (after each evaluation of the sheet). */
export const setSymbols = StateEffect.define<SheetSymbol[]>()

/** What the sheet defines, for suggestions and hover information. */
const symbolsField = StateField.define<SheetSymbol[]>({
  create: () => [],
  update: (value, tr) => {
    for (const e of tr.effects) if (e.is(setSymbols)) return e.value
    return value
  },
})

/** The names usable on line `n`: for each, the latest definition above it that's in scope. */
export function visibleAt(state: EditorState, n: number): Map<string, SheetSymbol> {
  const out = new Map<string, SheetSymbol>()
  const symbols = [...state.field(symbolsField)].sort((a, b) => a.line - b.line)
  for (const s of symbols) {
    if ((s.line === n || s.from <= n) && n <= s.to) out.set(s.name, s)
  }
  return out
}

// ---------------------------------------------------------------------------
// Showing information: typeset maths plus a line of text
// ---------------------------------------------------------------------------

/** The panel beside a suggestion or under a hover: typeset maths, then lines of text. */
function infoNode(tex: string | undefined, ...lines: (string | undefined)[]): HTMLElement {
  const el = document.createElement('div')
  el.className = 'cm-ms-info'
  if (tex) {
    const math = document.createElement('div')
    math.className = 'cm-ms-info__math'
    math.innerHTML = katex.renderToString(tex, { throwOnError: false, strict: 'ignore' })
    el.append(math)
  }
  for (const text of lines) {
    if (!text) continue
    const p = document.createElement('div')
    p.className = 'cm-ms-info__text'
    p.textContent = text
    el.append(p)
  }
  return el
}

// ---------------------------------------------------------------------------
// Built-in members, `@…` (see builtins.ts): suggested and described from the tree
// ---------------------------------------------------------------------------

/** A built-in constant's value, as LaTeX: c = 299792458 m/s, M_Na = 22.990 g/mol. */
const constantTex = (c: BuiltinConstant | NamespaceConstant) => {
  const digits = isNamespaceConstant(c) ? c.written : String(c.value).replace('e+', 'e')
  return `${c.tex} = ${numberTex(digits)}${c.unit ? `\\,${unitTex(c.unit)}` : ''}`
}

/** `@` and any namespaces with their dots, just before a word: the `@chem.mm.` of `@chem.mm.Na` (1: the namespaces and dots). */
const BUILTIN_BEFORE = regex(src`${SIGIL}((?:\w+${lit(MEMBER_DOT)})*)$`)

/** A member's brackets and what's in them, `(3)` of `column(3)`. */
const MEMBER_BRACKETS = regex(src`${lit(ROUND_BRACKETS.open)}[^${inClass(ROUND_BRACKETS.open, ROUND_BRACKETS.close)}\n]*${lit(ROUND_BRACKETS.close)}`, 'g')

/** Namespaces as typed, each with its dot, as a path of names: `chem.mm.` → chem, mm. */
const pathOf = (dotted: string) => dotted.replace(MEMBER_BRACKETS, '').split(MEMBER_DOT).filter(Boolean) // (a member's brackets, `column(3)`, aren't its name)

/**
 * The namespace whose members come after a path: chem, mm → @chem.mm. In a
 * chained namespace, the members already chosen are part of the path:
 * layout, val → @layout. Undefined if the path doesn't lead to one.
 */
function namespaceAt(path: readonly string[]): BuiltinNamespace | undefined {
  let ns = BUILTINS
  for (const name of path) {
    if (ns.chained) {
      if (!ns.member(name)) return undefined
      continue
    }
    const next = ns.member(name)
    if (!(next instanceof BuiltinNamespace)) return undefined
    ns = next
  }
  return ns
}

/** A suggestion that goes into a namespace: its name and dot, then its members are suggested straight away. */
const enterNamespace = (label: string, ns: BuiltinNamespace): Completion => ({
  label: `${label}${MEMBER_DOT}`, type: 'namespace', detail: ns.description,
  apply: (view, _completion, from, to) => {
    const insert = `${label}${MEMBER_DOT}`
    view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } })
    startCompletion(view)
  },
})

/**
 * A member as suggestions after its namespace's dot (at the top, after `@`,
 * with `prefix` @): a function, called; a namespace, called (if it can be) and
 * gone into; a constant, with its value; a block, with its braces; a layout or display setting.
 */
function memberOptions(m: Member, prefix: string): Completion[] {
  const label = `${prefix}${m.name}`
  const detail = m.description
  if (m instanceof FunctionMember) return [snippetCompletion(`${label}(\${})`, { label, type: 'function', detail })]
  if (m instanceof BuiltinNamespace) {
    return [
      ...(m.call ? [snippetCompletion(`${label}(\${})`, { label, type: 'function', detail: m.call.description })] : []),
      enterNamespace(label, m),
    ]
  }
  if (m instanceof ConstantMember) return [{ label, type: 'constant', detail, info: () => infoNode(constantTex(m.constant)) }]
  if (m instanceof BlockMember) return [snippetCompletion(`${label} {\n\t\${}\n}`, { label, type: 'keyword', detail })]
  return [{ label, type: 'keyword', detail }]
}

/** What a built-in member is, for its hover: a constant's value, a function's call, a block's braces. */
function memberInfo(m: Member): HTMLElement {
  if (m instanceof ConstantMember) return infoNode(constantTex(m.constant), m.description)
  if (m instanceof FunctionMember) return infoNode(undefined, m.signature, m.description)
  if (m instanceof BuiltinNamespace) return infoNode(undefined, m.typed, m.description, m.call && `${m.call.signature}: ${m.call.description}`)
  return infoNode(undefined, `${m.typed} { }`, m.description)
}

/** A brace on its own, not a value's `{{`. */
const SINGLE_BRACE = src`(?<!${lit(CURLY_BRACKETS.open)})${lit(CURLY_BRACKETS.open)}`
/** A character that isn't a brace. */
const NO_BRACES = src`[^${inClass(CURLY_BRACKETS.open, CURLY_BRACKETS.close)}]`

/**
 * In single braces, where a formula starts (just after the brace, or after a
 * space or coefficient), what's typed of a name: `{dietz`, `{2 dietz` (1: what's typed).
 */
const BRACED_SO_FAR = regex(src`${SINGLE_BRACE}(?:${NO_BRACES}*[\s\d])?([a-z]\w*|)$`)

/** A name in braces just before a word, for its hover: the `{` of `{dietzeite}`. */
const IN_BRACES = regex(src`${SINGLE_BRACE}(?:${NO_BRACES}*[\s\d])?$`)

/** Where a name is defined, for its information panel. */
const where = (s: SheetSymbol) => `Defined on line ${s.line}`

/** The information panel for a name the sheet defines. */
function symbolInfo(s: SheetSymbol): HTMLElement {
  switch (s.kind) {
    case SYMBOL_KIND.variable:
      // (Its value as its line left it: the definition visible where it's hovered, so its value there.)
      // (A series says how many values it has, and shows its first and last.)
      if (s.about) return infoNode(s.tex, `${s.about}, ${where(s).toLowerCase()}`)
      return infoNode(s.tex, s.tex ? `${where(s)}; its value from there` : where(s))
    case SYMBOL_KIND.parameter:
      return infoNode(undefined, `Parameter of the function on line ${s.line}`)
    case SYMBOL_KIND.function:
      return infoNode(s.tex, `${s.name}(${s.params ?? ''})`, `${where(s)}. Ctrl+Click a call to go there.`)
    case SYMBOL_KIND.constant:
      return infoNode(s.tex, `Your constant, ${where(s).toLowerCase()}`)
    case SYMBOL_KIND.braced:
      return infoNode(s.tex, s.about ?? where(s))
    case SYMBOL_KIND.namespace:
      return infoNode(undefined, s.about, where(s))
  }
}

// ---------------------------------------------------------------------------
// Completions
// ---------------------------------------------------------------------------

/** Where a unit goes, for hovering one: after a number or `to`, or inside a compound unit (m/s^2). */
const UNIT_PLACE = regex(src`(?:\d\.?|\b${KEYWORD.to})\s+$|[A-Za-z][/*]$`)

/** A series' member, as the suggestion list shows it: t[n]. */
const MEMBER_N = `${MEMBER_INDEX.open}n${MEMBER_INDEX.close}`

/** Every unit, as a suggestion with what it is (1 N = 1 kg m/s^2). */
const unitOptions: Completion[] = unitNames().map((name) => ({
  label: name,
  type: 'unit',
  detail: describeUnit(name)?.replace(`1 ${name} = `, '= ') ?? undefined,
}))

/** A symbol under another name (its value and information kept). */
const renamed = (s: SheetSymbol, name: string): SheetSymbol =>
  Object.defineProperty({ ...s, name }, 'tex', { get: () => s.tex, enumerable: false }) as SheetSymbol

/** The members of namespace `ns`, named as written after the dot: run1__x_1 → x_1. */
function membersOf(symbols: SheetSymbol[], ns: string): SheetSymbol[] {
  return symbols.flatMap((s) => {
    const m = parseMemberName(s.name)
    return m?.namespace === ns ? [renamed(s, m.member)] : []
  })
}

/** Each namespace, and what's in it (series by name: x, not x[1] … x[40]). */
function namespaces(symbols: SheetSymbol[]): Map<string, string[]> {
  const out = new Map<string, Set<string>>()
  for (const s of symbols) {
    const m = parseMemberName(s.name)
    if (!m) continue
    const set = out.get(m.namespace) ?? new Set<string>()
    set.add(parseNumberedName(m.member)?.base ?? m.member)
    out.set(m.namespace, set)
  }
  return new Map([...out].map(([ns, set]) => [ns, [...set]]))
}

/**
 * Suggestions for names the sheet defines: variables, parameters and
 * functions, with a series offered as itself (t) and as t[n] for its
 * members (t__1, t__2, …), rather than member by member; its statistics are
 * offered after its name and a dot (seriesStatOptions).
 */
function nameOptions(visible: SheetSymbol[]): Completion[] {
  // Each series: how many members it has, and its first and last numbers.
  const series = new Map<string, { count: number; first: number; last: number }>()
  for (const s of visible) {
    const m = parseNumberedName(s.name)
    if (s.kind !== SYMBOL_KIND.variable || !m) continue
    const known = series.get(m.base)
    series.set(m.base, known
      ? { count: known.count + (s.members ?? 1), first: Math.min(known.first, m.n), last: Math.max(known.last, m.n) }
      : { count: s.members ?? 1, first: m.n, last: m.n })
  }

  // A series' members aren't listed one by one (an imported column can have
  // thousands); the series offers t[n] for them instead, below.
  const options: Completion[] = visible
    // (Nor is a namespace, `p` of `p.slope`: its members are, as p.slope.)
    .filter((s) => s.kind !== SYMBOL_KIND.namespace)
    .filter((s) => !(s.kind === SYMBOL_KIND.variable && parseNumberedName(s.name)))
    .map((s) => (s.kind === SYMBOL_KIND.function
      ? snippetCompletion(`${s.name}(\${})`, {
        label: s.name, type: 'function', detail: `(${s.params ?? ''})`, info: () => symbolInfo(s), boost: 2,
      })
      : { label: s.name, type: 'variable', detail: s.kind === SYMBOL_KIND.parameter ? 'parameter' : undefined, info: () => symbolInfo(s), boost: 3 }))

  for (const [base, { count, first, last }] of series) {
    const typed = typedName(base)
    const detail = `series (${count})`
    const range = `${symbolTex(seriesMemberName(base, first))} \\ldots ${symbolTex(seriesMemberName(base, last))}`
    // The series itself: what @table and @plot take, and a series can be made of, and a line of its own shows.
    options.push({
      label: typed, type: 'variable', detail, boost: 3,
      info: () => infoNode(range, `A series of ${count} values: ${typed}${MEMBER_DOT} for its statistics (${typed}${MEMBER_DOT}${SERIES_STAT_SUFFIX.avg}), `
        + `${typed}${MEMBER_INDEX.open}${first}${MEMBER_INDEX.close} for one of them.`),
    })
    // t[n]: one of its values; accepting it types the brackets, ready for the number.
    options.push(snippetCompletion(`${typed}${MEMBER_INDEX.open}\${n}${MEMBER_INDEX.close}`, {
      label: `${typed}${MEMBER_N}`, type: 'variable', detail, boost: 2,
      info: () => infoNode(range, `One of the series' ${count} values: its number in brackets, ${typed}${MEMBER_INDEX.open}${first}${MEMBER_INDEX.close}.`),
    }))
  }
  return options
}

/** A series' statistics, offered after its name and a dot (`t.`): avg, count, std, …, each as its member's name. */
const seriesStatOptions = (count: number): Completion[] =>
  SERIES_SUFFIXES.map(({ suffix, description }) => ({
    label: suffix.slice(MEMBER_DOT.length), type: 'variable', detail: `series (${count})`, info: description, boost: 1,
  }))

/** Suggestions for what’s being typed, from where the cursor is on the line. */
export function complete(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos)
  const before = line.text.slice(0, ctx.pos - line.from)
  if (inDataBlock(ctx.state.doc, line.number)) return null
  // Prose has no names, except in a value being typed: `{{c_`.
  const value = inValue(before)
  // `{dietz…`: the names the sheet defines to write in braces (chemistry's species'), where one starts (in prose too).
  const bracedSoFar = BRACED_SO_FAR.exec(before)
  if (bracedSoFar) {
    const named = [...visibleAt(ctx.state, line.number).values()].filter((s) => s.kind === SYMBOL_KIND.braced)
    if (named.length) {
      return {
        from: ctx.pos - bracedSoFar[1].length,
        options: named.map((s): Completion => ({ label: s.name, type: 'variable', detail: s.detail, info: () => symbolInfo(s) })),
        validFor: WORD_CHARS_SO_FAR,
      }
    }
  }
  if (!value && (isProseLine(before) || inNamelessBlock(ctx.state.doc, line.number))) return null

  // What's being typed, from the tokens of the line so far, read in its place
  // (or of the value being typed in text, `{{c_`).
  const typing = value
    ? typingInValue(before.slice(before.lastIndexOf(VALUE_BRACES.open) + VALUE_BRACES.open.length))
    : typingAt(readAs(ctx.state.doc, line.number, before).node.parts)
  const from = ctx.pos - (typing?.typed.length ?? 0)

  if (typing?.kind === TYPING.note) return null

  // `\…`: a Greek letter, typed as its character.
  const greek = greekCompletions(before, ctx.pos)
  if (greek) return greek
  if (!typing) return null

  switch (typing.kind) {
    // `@…`, `@chem.…`, `@layout.val.…`: the members of the namespace being typed in. Blocks, and
    // anything in @layout, only at the start of a line, where blocks open; in a chained
    // namespace, the members not chosen yet.
    case TYPING.builtin: {
      const { path, lineStart } = typing
      const ns = namespaceAt(path)
      if (!ns || (ns.atLineStart && !lineStart)) return null
      const top = ns === BUILTINS
      const chosen = new Set(path)
      const members = ns.members.filter((m) => (lineStart || !m.atLineStart) && !(ns.chained && chosen.has(m.name)))
      const custom = top ? [...visibleAt(ctx.state, line.number).values()].filter((s) => s.kind === SYMBOL_KIND.constant) : []
      return {
        from,
        options: [
          ...members.flatMap((m) => memberOptions(m, top ? SIGIL : '')),
          ...custom.map((s): Completion => ({ label: s.name, type: 'constant', detail: 'your constant', info: () => symbolInfo(s) })),
        ],
        validFor: top ? BUILTIN_SO_FAR : WORD_CHARS_SO_FAR,
      }
    }

    // After a `:` on the name being assigned (`phi:3:de`): a display unit, `exact`, `sci` or `dec`.
    // (…on a name being unpacked, or on a function's result.)
    case TYPING.setting:
      if (!typing.typed && !ctx.explicit) return null
      return {
        from,
        options: [
          ...SETTING_WORDS.map((s): Completion => ({ label: s.name, type: s.name === PERCENT ? 'unit' : 'keyword', detail: s.description })),
          ...unitOptions,
        ],
        validFor: LETTERS_SO_FAR,
      }

    // After a number or `to`, or in a compound unit (`m/s`): a unit.
    case TYPING.unit:
      if (!typing.typed && !ctx.explicit) return null
      return {
        from,
        options: typing.afterTo
          ? [{ label: PERCENT, type: 'unit', detail: SETTING_WORDS.find((s) => s.name === PERCENT)!.description }, ...unitOptions]
          : unitOptions,
        validFor: LETTERS_SO_FAR,
      }

    // `a.`: a namespace's members (a slice's series, a named import's columns, a named plot's fit);
    // `t.`: a series' statistics (and anything else it holds: x.slope, from a plot's fit).
    case TYPING.member: {
      const visible = visibleNames(ctx.state, line.number)
      const members = membersOf(visible, typing.namespace)
      const count = visible.reduce((n, s) => n + (parseNumberedName(s.name)?.base === typing.namespace ? (s.members ?? 1) : 0), 0)
      const options = [...nameOptions(members.filter((m) => !parseNumberedName(m.name))), ...(count ? seriesStatOptions(count) : [])]
      if (!options.length) return null
      return { from, options, validFor: WORD_SO_FAR }
    }

    case TYPING.name:
      return { from, options: allNameOptions(visibleNames(ctx.state, line.number)), validFor: WORD_SO_FAR }
  }
}

/** The names usable on line `n` that are suggested as names (constants are suggested after @, and braced names in braces). */
const visibleNames = (state: EditorState, n: number) =>
  [...visibleAt(state, n).values()].filter((s) => s.kind !== SYMBOL_KIND.constant && s.kind !== SYMBOL_KIND.braced)

/** Every name that can be typed: the sheet's, its namespaces, mathjs's functions and constants, and keywords. */
function allNameOptions(visible: SheetSymbol[]): Completion[] {
  // A namespace's members are offered after its name and a dot, not here; it's offered itself.
  const own = visible.filter((s) => !parseMemberName(s.name))
  const names = new Set(own.map((s) => s.name))
  // (A series is offered as itself already, x, even when it holds more: x.slope.)
  for (const s of own) {
    const series = parseNumberedName(s.name)?.base
    if (series) names.add(series)
  }
  const options = nameOptions(own)
  for (const [ns, members] of namespaces(visible)) {
    if (names.has(ns)) continue
    options.push({
      label: ns, type: 'namespace', detail: members.map((m) => `.${m}`).join(' '), boost: 3,
      info: () => infoNode(undefined, `Holds ${members.map((m) => `${ns}.${m}`).join(', ')}: type a dot after it for them.`),
    })
  }

  for (const f of BUILTIN_FUNCTIONS) {
    if (names.has(f.name)) continue
    options.push(snippetCompletion(`${f.name}(\${})`, { label: f.name, type: 'function', detail: f.signature, info: f.description }))
  }
  for (const c of MATH_CONSTANTS) {
    if (!names.has(c.name)) options.push({ label: c.name, type: 'constant', detail: c.description })
  }
  for (const k of KEYWORDS) options.push({ label: k.name, type: 'keyword', detail: k.description, boost: -1 })

  return options
}

/** What may follow a name being typed while the list stays open (Greek letters included). */
const WORD_SO_FAR = regex(src`^${NAME_CHAR}*$`)

/** What may follow `@` being typed while the list of built-ins stays open. */
const BUILTIN_SO_FAR = regex(src`^${SIGIL}\w*$`)

/** Tab accepts a suggestion when the list is open. */
export const acceptOnTab: Command = acceptCompletion

// ---------------------------------------------------------------------------
// Which keys accept a suggestion
// ---------------------------------------------------------------------------

/** Tab only (the default, so Enter always starts a new line), or Tab and Enter. */
export const ACCEPT_KEYS = [
  { id: 'tab', name: 'Tab', description: 'Enter always starts a new line, even with suggestions showing.' },
  { id: 'tab-enter', name: 'Tab or Enter', description: 'Enter accepts a suggestion while the list is showing.' },
] as const
export type AcceptKeys = (typeof ACCEPT_KEYS)[number]['id']

/** Which keys accept a suggestion, as chosen last time in this browser. */
export function loadAcceptKeys(): AcceptKeys {
  const saved = readStored(STORAGE_KEYS.acceptKeys)
  return ACCEPT_KEYS.find((k) => k.id === saved)?.id ?? 'tab'
}

/** Remember which keys accept a suggestion (if storage is blocked, until reload). */
export function saveAcceptKeys(keys: AcceptKeys): void {
  writeStored(STORAGE_KEYS.acceptKeys, keys)
}

/** The suggestion list's keys (arrows, Escape, …), with Enter only if it accepts. */
const suggestionKeymap = (keys: AcceptKeys) =>
  Prec.highest(keymap.of(completionKeymap.filter((k) => k.key !== 'Enter' || keys === 'tab-enter')))

/** Holds the suggestion keys, so the setting can change them in a running editor. */
const suggestionKeys = new Compartment()

/** The suggestion keys for a new editor. */
export const acceptKeysSetting = (keys: AcceptKeys): Extension => suggestionKeys.of(suggestionKeymap(keys))

/** Change which keys accept a suggestion, in a running editor. */
export const reconfigureAcceptKeys = (keys: AcceptKeys) => suggestionKeys.reconfigure(suggestionKeymap(keys))

// ---------------------------------------------------------------------------
// Hover information
// ---------------------------------------------------------------------------

/**
 * Information on one of a series' members that isn't listed itself (only a
 * series' first and last are: an imported column can have thousands), from the
 * series' listed member: x[57], run1.x[57], a.x[3].
 */
function seriesMemberInfo(visible: Map<string, SheetSymbol>, name: string): HTMLElement | null {
  const numbered = parseNumberedName(name)
  if (!numbered) return null
  for (const s of visible.values()) {
    if (s.kind !== SYMBOL_KIND.variable || !s.texOf || parseNumberedName(s.name)?.base !== numbered.base) continue
    const tex = s.texOf(name)
    if (tex) return infoNode(tex, `${where(s)}; value at the end of its scope`)
  }
  return null
}

/** Hover information: what a name, unit, constant or keyword is. */
const hoverInfo = hoverTooltip((view, pos) => {
  const { state } = view
  const line = state.doc.lineAt(pos)
  // `{dietzeite}`: a species' name, in braces anywhere (prose too), is its formula.
  const braced = state.wordAt(pos)
  if (braced && IN_BRACES.test(line.text.slice(0, braced.from - line.from))) {
    const named = visibleAt(state, line.number).get(state.sliceDoc(braced.from, braced.to))
    if (named?.kind === SYMBOL_KIND.braced) return { pos: braced.from, end: braced.to, above: true, create: () => ({ dom: symbolInfo(named) }) }
  }
  if (isProseLine(line.text) || inNamelessBlock(state.doc, line.number) || inDataBlock(state.doc, line.number)) return null
  const word = state.wordAt(pos)
  if (!word) return null
  const before = line.text.slice(0, word.from - line.from)
  if (inNote(before)) return null
  const name = state.sliceDoc(word.from, word.to)
  const show = (from: number, dom: HTMLElement) => ({ pos: from, end: word.to, above: true, create: () => ({ dom }) })

  // `@c`, `@chem.mm.Na`, `@layout.val.multiline`, `@constants`: what that built-in member is
  // (or, at the top, a constant of your own).
  const builtinPrefix = BUILTIN_BEFORE.exec(before)
  if (builtinPrefix) {
    const path = pathOf(builtinPrefix[1])
    const member = namespaceAt(path)?.member(name)
    const from = word.from - builtinPrefix[0].length
    if (member) return show(from, memberInfo(member))
    const own = path.length ? undefined : visibleAt(state, line.number).get(`${SIGIL}${name}`)
    return own ? show(from, symbolInfo(own)) : null
  }
  // A unit: after a number or `to`, or inside a compound unit (m/s^2).
  const unitPlace = UNIT_PLACE.test(before)
  if (unitPlace && isUnitName(name)) {
    return show(word.from, infoNode(unitTex(name), describeUnit(name) ?? `${name} (an SI unit)`))
  }

  // A namespace's member, `a.x_1`.
  const visible = visibleAt(state, line.number)
  const ns = regex(src`(?<![\w${inClass(MEMBER_DOT)}${GREEK_CHARS}])(${NAME})${lit(MEMBER_DOT)}$`).exec(before)
  if (ns) {
    const full = memberName(ns[1], name)
    const member = visible.get(full)
    if (member) return show(word.from - ns[0].length, symbolInfo(member))
    const inSeries = seriesMemberInfo(visible, full)
    return inSeries ? show(word.from - ns[0].length, inSeries) : null
  }
  const symbol = visible.get(name)
  if (symbol) return show(word.from, symbolInfo(symbol))
  const inSeries = seriesMemberInfo(visible, name)
  if (inSeries) return show(word.from, inSeries)
  const builtin = BUILTIN_FUNCTIONS.find((f) => f.name === name)
  if (builtin) return show(word.from, infoNode(undefined, builtin.signature, builtin.description))
  const constant = MATH_CONSTANTS.find((c) => c.name === name)
  if (constant) return show(word.from, infoNode(undefined, constant.description))
  const keyword = KEYWORDS.find((k) => k.name === name)
  if (keyword) return show(word.from, infoNode(undefined, keyword.name, keyword.description))
  return null
}, { hoverTime: 400 })

// ---------------------------------------------------------------------------

/** Suggestions as you type, and hover information. */
export const intellisense: Extension = [
  symbolsField,
  // The suggestion keys come from acceptKeysSetting instead of the defaults (whose Enter always accepts).
  autocompletion({ override: [complete], icons: true, defaultKeymap: false }),
  greekOnSpace,
  hoverInfo,
  // A full theme (not a base theme), so it wins over CodeMirror's built-in light
  // tooltip styles; the colours come from the app theme.
  EditorView.theme({
    '.cm-tooltip': {
      backgroundColor: 'var(--surface)',
      color: 'var(--text)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      boxShadow: '0 6px 20px rgb(0 0 0 / 0.18)',
    },
    '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--mono)', fontSize: '13px', maxHeight: '16em' },
    '.cm-tooltip-autocomplete > ul > li': { padding: '2px 8px 2px 4px', lineHeight: '1.5' },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--selection)', color: 'var(--text)' },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li:hover': { backgroundColor: 'var(--selection-match)' },
    '.cm-tooltip .cm-tooltip-arrow:before': { borderTopColor: 'var(--border)', borderBottomColor: 'var(--border)' },
    '.cm-tooltip .cm-tooltip-arrow:after': { borderTopColor: 'var(--surface)', borderBottomColor: 'var(--surface)' },
    '.cm-completionIcon': { color: 'var(--muted)' },
    '.cm-completionDetail': { color: 'var(--muted)', fontStyle: 'normal', fontFamily: 'var(--sans)', fontSize: '12px', marginLeft: '12px' },
    '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '700' },
    '.cm-completionInfo': { padding: '6px 10px', maxWidth: '360px' },
    '.cm-ms-info': { padding: '6px 10px', maxWidth: '420px', fontFamily: 'var(--sans)', fontSize: '13px' },
    '.cm-completionInfo .cm-ms-info': { padding: '0' },
    '.cm-ms-info__math': { fontSize: '15px', marginBottom: '2px', overflowX: 'auto' },
    '.cm-ms-info__text': { color: 'var(--muted)', fontSize: '12px' },
  }),
]
