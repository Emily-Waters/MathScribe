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
 *   a name                    → variables, functions, series names, keywords
 */
import {
  acceptCompletion, autocompletion, snippetCompletion,
  type Completion, type CompletionContext, type CompletionResult,
} from '@codemirror/autocomplete'
import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state'
import { EditorView, hoverTooltip, type Command } from '@codemirror/view'
import katex from 'katex'
import { BUILTIN_CONSTANTS } from '../lib/constants.ts'
import type { SheetSymbol } from '../lib/document.ts'
import { describeUnit, isUnitName, numberTex, unitNames, unitTex } from '../lib/engine.ts'
import { BUILTIN_FUNCTIONS, COMMANDS, KEYWORDS, MATH_CONSTANTS, SERIES_SUFFIXES } from './vocabulary.ts'
import { inTextBlock } from './language.ts'

// ---------------------------------------------------------------------------
// What the sheet defines
// ---------------------------------------------------------------------------

export const setSymbols = StateEffect.define<SheetSymbol[]>()

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

const constantTex = (name: string) => {
  const c = BUILTIN_CONSTANTS[name]
  return `${c.tex} = ${numberTex(String(c.value).replace('e+', 'e'))}${c.unit ? `\\,${unitTex(c.unit)}` : ''}`
}

const where = (s: SheetSymbol) => `Defined on line ${s.line}`

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

/** Text kinds where nothing is suggested: headings, prose, raw LaTeX. */
const isProseLine = (before: string) => /^\s*[#>$]/.test(before)
/** A `#` note has started earlier on the line (not one of the commands). */
const inNote = (before: string) =>
  /(?:^|\s)#/.test(before.replace(/(?:^|\s)#(?:sym|val|full|hide|multiline|center|list|numbered)(?=\s)/g, ' '))

const unitOptions: Completion[] = unitNames().map((name) => ({
  label: name,
  type: 'unit',
  detail: describeUnit(name)?.replace(`1 ${name} = `, '= ') ?? undefined,
}))

export function complete(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos)
  const before = line.text.slice(0, ctx.pos - line.from)
  if (isProseLine(before) || inTextBlock(ctx.state.doc, line.number)) return null

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

  // After a number or `to`: a unit.
  const unit = /(?:\d\.?|\bto)\s+([A-Za-z]*)$/.exec(before)
  if (unit && (unit[1] || ctx.explicit)) {
    const afterTo = /\bto\s+[A-Za-z]*$/.test(before)
    return {
      from: ctx.pos - unit[1].length,
      options: afterTo
        ? [{ label: 'percent', type: 'unit', detail: 'a unitless result ×100, with %' }, ...unitOptions]
        : unitOptions,
      validFor: /^[A-Za-z]*$/,
    }
  }

  // A name.
  const word = ctx.matchBefore(/[A-Za-z_]\w*/)
  if (!word || (word.from === word.to && !ctx.explicit)) return null
  // Part of a number like 1e5.
  if (/[\d.]$/.test(line.text.slice(0, word.from - line.from))) return null

  const visible = [...visibleAt(ctx.state, line.number).values()].filter((s) => s.kind !== 'constant')
  const names = new Set(visible.map((s) => s.name))
  const options: Completion[] = visible.map((s) => (s.kind === 'function'
    ? snippetCompletion(`${s.name}(\${})`, {
      label: s.name, type: 'function', detail: `(${s.params ?? ''})`, info: () => symbolInfo(s), boost: 2,
    })
    : { label: s.name, type: 'variable', detail: s.kind === 'parameter' ? 'parameter' : undefined, info: () => symbolInfo(s), boost: 3 }))

  // Series: t_1, t_2, … make t, t_avg, t_count, ….
  const series = new Map<string, number>()
  for (const s of visible) {
    const m = /^([A-Za-z]\w*?)_?(\d+)$/.exec(s.name)
    if (s.kind === 'variable' && m) series.set(m[1], (series.get(m[1]) ?? 0) + 1)
  }
  for (const [base, count] of series) {
    // One numbered name isn't really a series (psi_200 alone shouldn't suggest psi_avg).
    if (count < 2) continue
    for (const { suffix, description } of SERIES_SUFFIXES) {
      if (names.has(base + suffix)) continue
      options.push({ label: base + suffix, type: 'variable', detail: `series (${count})`, info: description, boost: 1 })
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

  return { from: word.from, options, validFor: /^\w*$/ }
}

/** Tab accepts a suggestion when the list is open (Enter does too). */
export const acceptOnTab: Command = acceptCompletion

// ---------------------------------------------------------------------------
// Hover information
// ---------------------------------------------------------------------------

const hoverInfo = hoverTooltip((view, pos) => {
  const { state } = view
  const line = state.doc.lineAt(pos)
  if (isProseLine(line.text) || inTextBlock(state.doc, line.number)) return null
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

export const intellisense: Extension = [
  symbolsField,
  autocompletion({ override: [complete], icons: true }),
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
