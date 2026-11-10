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
 *   `#` after a line's text   → display commands
 *   `\` and a letter's name   → Greek letters (`\Delta` → Δ; see greek.ts)
 *   a name                    → variables, functions, series names, keywords
 *
 * A suggestion is accepted with Tab (or Enter too, if the setting says so), so
 * by default Enter at the end of a line always starts a new one.
 */
import {
  acceptCompletion, autocompletion, completionKeymap, snippetCompletion,
  type Completion, type CompletionContext, type CompletionResult,
} from '@codemirror/autocomplete'
import { Compartment, Prec, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state'
import { EditorView, hoverTooltip, keymap, type Command } from '@codemirror/view'
import katex from 'katex'
import { BUILTIN_CONSTANTS } from '../lib/constants.ts'
import type { SheetSymbol } from '../lib/document.ts'
import { describeUnit, isUnitName, numberTex, symbolTex, unitNames, unitTex } from '../lib/engine.ts'
import { STORAGE_KEYS } from '../config.ts'
import { readStored, writeStored } from '../lib/storage.ts'
import { GREEK_CHARS, NAME, NAME_CHAR, PERCENT, SETTINGS } from '../lib/syntax.ts'
import { BUILTIN_FUNCTIONS, COMMANDS, KEYWORDS, MATH_CONSTANTS, SERIES_SUFFIXES, SETTING_WORDS } from './vocabulary.ts'
import { inDataBlock, inNote, inTextBlock, isProseLine } from './language.ts'
import { greekCompletions, greekOnSpace } from './greek.ts'

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
function visibleAt(state: EditorState, n: number): Map<string, SheetSymbol> {
  const out = new Map<string, SheetSymbol>()
  const symbols = [...state.field(symbolsField)].sort((a, b) => a.line - b.line)
  for (const s of symbols) if (s.from <= n && n <= s.to) out.set(s.name, s)
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

/** A built-in constant's value, as LaTeX: c = 299792458 m/s. */
const constantTex = (name: string) => {
  const c = BUILTIN_CONSTANTS[name]
  return `${c.tex} = ${numberTex(String(c.value).replace('e+', 'e'))}${c.unit ? `\\,${unitTex(c.unit)}` : ''}`
}

/** Where a name is defined, for its information panel. */
const where = (s: SheetSymbol) => `Defined on line ${s.line}`

/** The information panel for a name the sheet defines. */
function symbolInfo(s: SheetSymbol): HTMLElement {
  switch (s.kind) {
    case 'variable':
      return infoNode(s.tex, s.tex ? `${where(s)}; value at the end of its scope` : where(s))
    case 'parameter':
      return infoNode(undefined, `Parameter of the function on line ${s.line}`)
    case 'function':
      return infoNode(s.tex, `${s.name}(${s.params ?? ''})`, `${where(s)}. Ctrl+Click a call to go there.`)
    case 'constant':
      return infoNode(s.tex, `Your constant, ${where(s).toLowerCase()}`)
  }
}

// ---------------------------------------------------------------------------
// Completions
// ---------------------------------------------------------------------------

// A display setting being typed after a `:` (`phi:3:de`), 1: what's typed of it so far:
/** …on the name being assigned. */
const SETTING_ON_NAME = new RegExp(String.raw`^\s*${NAME}${SETTINGS}:([A-Za-z]*)$`)
/** …on a name being unpacked: `tuple(r:3, theta:de`. */
const SETTING_ON_UNPACKED = new RegExp(String.raw`^\s*tuple\s*\((?:[^()=]*,)?\s*${NAME}(?::[^:=\s,()]+)*:([A-Za-z]*)$`)
/** …on a function's result: `f(x):3:de`, `def polar(x, y):de`. */
const SETTING_ON_RESULT = new RegExp(String.raw`^\s*(?:def\s+)?${NAME}\s*\([^()]*\)${SETTINGS}:([A-Za-z]*)$`)

/**
 * `t_1`, `t2`: a numbered member of a series (1: the series' name). The name
 * matches lazily (`${NAME}?` ends in `\w*?`), so the digits all go to the number.
 */
const SERIES_MEMBER = new RegExp(String.raw`^(${NAME}?)_?(\d+)$`)

/** A subscript n, for a series' members in the suggestion list: tₙ. */
const SUBSCRIPT_N = String.fromCodePoint(0x2099)

/** Every unit, as a suggestion with what it is (1 N = 1 kg m/s^2). */
const unitOptions: Completion[] = unitNames().map((name) => ({
  label: name,
  type: 'unit',
  detail: describeUnit(name)?.replace(`1 ${name} = `, '= ') ?? undefined,
}))

/** Suggestions for what’s being typed, from where the cursor is on the line. */
export function complete(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos)
  const before = line.text.slice(0, ctx.pos - line.from)
  if (isProseLine(before) || inTextBlock(ctx.state.doc, line.number) || inDataBlock(ctx.state.doc, line.number)) return null

  // `#…` after the line's text: display commands.
  const command = /(?:^|\s)(#\w*)$/.exec(before)
  if (command && before.trim() !== command[1]) {
    return {
      from: ctx.pos - command[1].length,
      options: COMMANDS.map((c) => ({ label: c.name, type: 'keyword', detail: c.description })),
      validFor: /^#\w*$/,
    }
  }
  if (inNote(before)) return null

  // `\…`: a Greek letter, typed as its character.
  const greek = greekCompletions(before, ctx.pos)
  if (greek) return greek

  // `@…`: constants.
  const at = /@\w*$/.exec(before)
  if (at) {
    const custom = [...visibleAt(ctx.state, line.number).values()].filter((s) => s.kind === 'constant')
    return {
      from: ctx.pos - at[0].length,
      options: [
        ...Object.entries(BUILTIN_CONSTANTS).map(([name, c]): Completion => ({
          label: `@${name}`, type: 'constant', detail: c.description, info: () => infoNode(constantTex(name)),
        })),
        ...custom.map((s): Completion => ({ label: s.name, type: 'constant', detail: 'your constant', info: () => symbolInfo(s) })),
      ],
      validFor: /^@\w*$/,
    }
  }

  // After a `:` on the name being assigned (`phi:3:de`): a display unit, `exact`, `sci` or `dec`.
  // (…on a name being unpacked, or on a function's result.)
  const spec = SETTING_ON_NAME.exec(before) ?? SETTING_ON_UNPACKED.exec(before) ?? SETTING_ON_RESULT.exec(before)
  if (spec && (spec[1] || ctx.explicit)) {
    return {
      from: ctx.pos - spec[1].length,
      options: [
        ...SETTING_WORDS.map((s): Completion => ({ label: s.name, type: s.name === PERCENT ? 'unit' : 'keyword', detail: s.description })),
        ...unitOptions,
      ],
      validFor: /^[A-Za-z]*$/,
    }
  }

  // After a number or `to`: a unit.
  const unit = /(?:\d\.?|\bto)\s+([A-Za-z]*)$/.exec(before)
  if (unit && (unit[1] || ctx.explicit)) {
    const afterTo = /\bto\s+[A-Za-z]*$/.test(before)
    return {
      from: ctx.pos - unit[1].length,
      options: afterTo
        ? [{ label: PERCENT, type: 'unit', detail: SETTING_WORDS.find((s) => s.name === PERCENT)!.description }, ...unitOptions]
        : unitOptions,
      validFor: /^[A-Za-z]*$/,
    }
  }

  // A name.
  const word = ctx.matchBefore(WORD)
  if (!word || (word.from === word.to && !ctx.explicit)) return null
  // Part of a number like 1e5.
  if (/[\d.]$/.test(line.text.slice(0, word.from - line.from))) return null

  const visible = [...visibleAt(ctx.state, line.number).values()].filter((s) => s.kind !== 'constant')
  const names = new Set(visible.map((s) => s.name))

  // Series: t_1, t_2, … (or t1, t2, …) make t, t_avg, t_count, …: how many each
  // has, and its first and last numbers.
  const series = new Map<string, { count: number; first: number; last: number }>()
  for (const s of visible) {
    const m = SERIES_MEMBER.exec(s.name)
    if (s.kind !== 'variable' || !m) continue
    const n = Number(m[2])
    const known = series.get(m[1])
    series.set(m[1], known
      ? { count: known.count + (s.members ?? 1), first: Math.min(known.first, n), last: Math.max(known.last, n) }
      : { count: s.members ?? 1, first: n, last: n })
  }
  // One numbered name isn't really a series (psi_200 alone shouldn't suggest psi_avg).
  const isSeries = (base: string) => (series.get(base)?.count ?? 0) >= 2

  // A series' members aren't listed one by one (an imported column can have
  // thousands); the series offers tₙ for them instead, below.
  const options: Completion[] = visible
    .filter((s) => { const m = SERIES_MEMBER.exec(s.name); return !(s.kind === 'variable' && m && isSeries(m[1])) })
    .map((s) => (s.kind === 'function'
      ? snippetCompletion(`${s.name}(\${})`, {
        label: s.name, type: 'function', detail: `(${s.params ?? ''})`, info: () => symbolInfo(s), boost: 2,
      })
      : { label: s.name, type: 'variable', detail: s.kind === 'parameter' ? 'parameter' : undefined, info: () => symbolInfo(s), boost: 3 }))

  for (const [base, { count, first, last }] of series) {
    if (!isSeries(base)) continue
    const detail = `series (${count})`
    // tₙ: one of its values; accepting it types the name, ready for the number.
    options.push(snippetCompletion(`${base}\${n}`, {
      label: `${base}${SUBSCRIPT_N}`, type: 'variable', detail, boost: 2,
      info: () => infoNode(`${symbolTex(`${base}_${first}`)} \\ldots ${symbolTex(`${base}_${last}`)}`,
        `One of the series' ${count} values: type its number after the name, ${base}${first} (or ${base}_${first}).`),
    }))
    for (const { suffix, description } of SERIES_SUFFIXES) {
      if (names.has(base + suffix)) continue
      options.push({ label: base + suffix, type: 'variable', detail, info: description, boost: 1 })
    }
  }

  for (const f of BUILTIN_FUNCTIONS) {
    if (names.has(f.name)) continue
    options.push(snippetCompletion(`${f.name}(\${})`, { label: f.name, type: 'function', detail: f.signature, info: f.description }))
  }
  for (const c of MATH_CONSTANTS) {
    if (!names.has(c.name)) options.push({ label: c.name, type: 'constant', detail: c.description })
  }
  for (const k of KEYWORDS) options.push({ label: k.name, type: 'keyword', detail: k.description, boost: -1 })

  return { from: word.from, options, validFor: WORD_SO_FAR }
}

/** A name being typed (Greek letters included), and what may follow while the list stays open. */
const WORD = new RegExp(`[A-Za-z_${GREEK_CHARS}]${NAME_CHAR}*`)
const WORD_SO_FAR = new RegExp(`^${NAME_CHAR}*$`)

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

/** Hover information: what a name, unit, constant, command or keyword is. */
const hoverInfo = hoverTooltip((view, pos) => {
  const { state } = view
  const line = state.doc.lineAt(pos)
  if (isProseLine(line.text) || inTextBlock(state.doc, line.number) || inDataBlock(state.doc, line.number)) return null
  const word = state.wordAt(pos)
  if (!word) return null
  const before = line.text.slice(0, word.from - line.from)
  if (inNote(before)) return null
  const name = state.sliceDoc(word.from, word.to)
  const show = (from: number, dom: HTMLElement) => ({ pos: from, end: word.to, above: true, create: () => ({ dom }) })

  // `#command`
  if (before.endsWith('#')) {
    const c = COMMANDS.find((x) => x.name === `#${name}`)
    return c ? show(word.from - 1, infoNode(undefined, c.name, c.description)) : null
  }
  // `@constant`
  if (before.endsWith('@')) {
    if (BUILTIN_CONSTANTS[name]) {
      return show(word.from - 1, infoNode(constantTex(name), BUILTIN_CONSTANTS[name].description))
    }
    const own = visibleAt(state, line.number).get(`@${name}`)
    return own ? show(word.from - 1, symbolInfo(own)) : null
  }
  // A unit: after a number or `to`, or inside a compound unit (m/s^2).
  const unitPlace = /(?:\d\.?|\bto)\s+$|[A-Za-z][/*]$/.test(before)
  if (unitPlace && isUnitName(name)) {
    return show(word.from, infoNode(unitTex(name), describeUnit(name) ?? `${name} (an SI unit)`))
  }

  const symbol = visibleAt(state, line.number).get(name)
  if (symbol) return show(word.from, symbolInfo(symbol))
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
