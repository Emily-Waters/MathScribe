/**
 * Parameter hints: while a call is typed, what the function takes, the
 * parameter being typed in bold. `E_k(1, ` shows `E_k(n, m [kg], L [m])` with
 * `m [kg]` bold; `@table(t, x; ` shows its settings bold. (Typing a call's `(`,
 * `,` or `;` opens one; moving away, or Escape, closes it: see hintField.)
 *
 * The call is the innermost one still open before the cursor, read from the
 * tokens of what the statement has said so far (an open call, tree/lexer.ts;
 * on a line carrying a call on, the lines above it too, as the tree keeps
 * them): its callee names the function, and the commas directly in it (not in
 * brackets or quotes inside it) say which parameter is being typed. What a
 * function takes comes from where the editor knows it from already: a
 * function of the sheet's (its parameters, as written), one of MathScribe's own
 * (`@table`: builtins.ts), or one of mathjs's (vocabulary.ts).
 */
import { StateEffect, StateField, type EditorState, type Transaction } from '@codemirror/state'
import { EditorView, keymap, showTooltip, type Tooltip } from '@codemirror/view'
import { MEMBER_DOT, ROUND_BRACKETS, ROW_SEPARATOR, SEPARATOR, SIGIL } from '../lib/syntax.ts'
import { NODE_KIND, TOKEN_KIND, isCallKind, isToken, type Part, type SyntaxNode } from '../lib/tree/index.ts'
import { closesBracket, lexExpression, opensBracket } from '../lib/tree/lexer.ts'
import { builtinFunction } from '../lib/builtins.ts'
import { SYMBOL_KIND } from '../lib/sheet/blocks.ts'
import { BUILTIN_FUNCTIONS } from './vocabulary.ts'
import { visibleAt } from './intellisense.ts'
import { isProseLine } from './language.ts'
import { inDataBlock, inNamelessBlock, sheetLine } from './sheetLines.ts'

/** Between a call's arguments, and between its arguments and its settings (a module's: `@table(t, x; rows 2-3)`). */
const BETWEEN = { argument: SEPARATOR, settings: ROW_SEPARATOR } as const

/** What a function takes, for its hint: what it's called, its parameters, and its settings (after a `;`), if it has any. */
export interface Signature {
  readonly name: string
  readonly params: readonly string[]
  readonly settings?: string
}

/** Where the cursor is in a call: what's called, and which of its arguments is being typed (from 0), or its settings. */
export interface CallPlace {
  readonly callee: string
  readonly argument: number
  readonly inSettings: boolean
}

/** A function's parameters, as written (`n, m [kg]; rows 2-3`), split: at top-level commas, and its settings after a `;`. */
export function splitParameters(text: string): { params: string[]; settings?: string } {
  const [positional, settings] = text.split(BETWEEN.settings)
  const params = positional.split(BETWEEN.argument).map((p) => p.trim()).filter(Boolean)
  return { params, settings: settings?.trim() || undefined }
}

/** The innermost call still open at the end of some parts (its bracket not closed), if there is one. */
function openCallAtEnd(parts: readonly Part[]): SyntaxNode | undefined {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    if (isToken(p)) {
      if (p.t === TOKEN_KIND.space) continue
      return undefined
    }
    // (An open call may have one open inside it; a closed call is done with.)
    if (p.kind === NODE_KIND.openCall) return openCallAtEnd(p.parts.slice(1)) ?? p
    if (isCallKind(p.kind)) return undefined
    return openCallAtEnd(p.parts)
  }
  return undefined
}

/** Where the cursor is in a call, from what's said before it (`E_k(1, `), or undefined if it isn't in one. */
export function callPlace(before: string): CallPlace | undefined {
  const call = openCallAtEnd(lexExpression(before))
  if (!call) return undefined
  const [head, ...rest] = call.parts
  if (!isToken(head)) return undefined
  // (The commas directly in the call: a closed call's inside it are in its node; a bracket's, counted by depth.)
  let argument = 0
  let inSettings = false
  let depth = 0
  for (const p of rest.slice(rest.findIndex((r) => isToken(r) && r.text === ROUND_BRACKETS.open) + 1)) {
    if (!isToken(p) || p.t !== TOKEN_KIND.delimiter) continue
    if (opensBracket(p.text)) depth++
    else if (closesBracket(p.text)) depth--
    else if (depth > 0) continue
    else if (p.text === BETWEEN.argument && !inSettings) argument++
    else if (p.text === BETWEEN.settings) inSettings = true
  }
  return { callee: head.text, argument, inSettings }
}

/** What a function called `callee` takes, as the editor knows it at line `n`; undefined if it doesn't. */
export function signatureOf(state: EditorState, n: number, callee: string): Signature | undefined {
  if (callee.startsWith(SIGIL)) {
    const f = builtinFunction(callee.slice(SIGIL.length).split(MEMBER_DOT))
    return 'error' in f ? undefined : { name: f.typed, ...splitParameters(f.parameters) }
  }
  const own = visibleAt(state, n).get(callee)
  if (own?.kind === SYMBOL_KIND.function) return { name: callee, ...splitParameters(own.params ?? '') }
  const builtin = BUILTIN_FUNCTIONS.find((f) => f.name === callee)
  if (builtin) {
    const inside = builtin.signature.slice(builtin.signature.indexOf(ROUND_BRACKETS.open) + 1, builtin.signature.lastIndexOf(ROUND_BRACKETS.close))
    return { name: callee, ...splitParameters(inside) }
  }
  return undefined
}

/** A parameter that takes any number of values: `…` (`max(a, b, …)`). */
const MORE = '…'

/**
 * Which parameter is being typed: the argument's own, or, past the last, the
 * last if it takes any number of values (`max(a, b, …)`); none otherwise
 * (a list of values past what a function's hint names: `@table(t, x, v`).
 */
export function currentParameter(signature: Signature, place: CallPlace): number | undefined {
  if (place.inSettings) return undefined
  const last = signature.params.length - 1
  if (place.argument <= last) return place.argument
  return signature.params[last]?.includes(MORE) ? last : undefined
}

/** The hint's panel: `name(a, b, c)`, the parameter (or the settings) being typed in bold. */
function hintNode(signature: Signature, place: CallPlace): HTMLElement {
  const el = document.createElement('div')
  el.className = 'cm-ms-param-hint'
  const piece = (text: string, current: boolean) => {
    const span = document.createElement('span')
    span.textContent = text
    if (current) span.className = 'cm-ms-param-hint__current'
    return span
  }
  const current = currentParameter(signature, place)
  el.append(piece(`${signature.name}(`, false))
  signature.params.forEach((p, i) => {
    if (i > 0) el.append(piece(`${BETWEEN.argument} `, false))
    el.append(piece(p, i === current))
  })
  if (signature.settings) el.append(piece(`${BETWEEN.settings} `, false), piece(signature.settings, place.inSettings))
  el.append(piece(ROUND_BRACKETS.close, false))
  return el
}

/** The hint for where the cursor is, or null: in a call whose function the editor knows, on a line that's maths. */
function hintAt(state: EditorState): Tooltip | null {
  const { head, empty } = state.selection.main
  if (!empty) return null
  const line = state.doc.lineAt(head)
  const before = line.text.slice(0, head - line.from)
  if (isProseLine(before) || inNamelessBlock(state.doc, line.number) || inDataBlock(state.doc, line.number)) return null
  // (On a line carrying a call on, what the lines above it said comes first.)
  const said = sheetLine(state.doc, line.number).before.at(-1)?.said
  const place = callPlace(said === undefined ? before : `${said} ${before.trimStart()}`)
  if (!place) return null
  const signature = signatureOf(state, line.number, place.callee)
  if (!signature || (!signature.params.length && !signature.settings)) return null
  return { pos: head, above: true, strictSide: true, arrow: false, create: () => ({ dom: hintNode(signature, place) }) }
}

/** What opens a hint, typed: a call's `(`, or a `,` or `;` in one. */
const OPENS_HINT: ReadonlySet<string> = new Set([ROUND_BRACKETS.open, BETWEEN.argument, BETWEEN.settings])

/** Whether a transaction is typing (not a paste, an undo, or a change from elsewhere) that puts in a character that opens a hint. */
function typesOpener(tr: Transaction): boolean {
  if (!tr.isUserEvent('input.type')) return false
  let opens = false
  tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    if ([...inserted.toString()].some((c) => OPENS_HINT.has(c))) opens = true
  })
  return opens
}

/** Closes the hint (Escape). */
const closeHint = StateEffect.define<null>()

/**
 * The hint, as typing in a call opens it and keeps it (VS Code's way): typing
 * `(`, `,` or `;` in a call opens it; typing on in the call keeps it, worked out
 * again; moving the cursor without typing (a click, an arrow key), or Escape,
 * closes it. So it's there while a call is written, not whenever the cursor is
 * on a line inside one (a long `@table(…)`'s columns, edited).
 */
const hintField = StateField.define<Tooltip | null>({
  create: () => null,
  update: (hint, tr) => {
    if (tr.effects.some((e) => e.is(closeHint))) return null
    if (typesOpener(tr)) return hintAt(tr.state)
    if (hint && tr.docChanged && (tr.isUserEvent('input') || tr.isUserEvent('delete'))) return hintAt(tr.state)
    return tr.docChanged || tr.selection ? null : hint
  },
  provide: (f) => showTooltip.from(f),
})

/** Escape closes an open hint (and only then is it the hint's). */
const closeOnEscape = keymap.of([{
  key: 'Escape',
  run: (view) => {
    if (!view.state.field(hintField)) return false
    view.dispatch({ effects: closeHint.of(null) })
    return true
  },
}])

/** Parameter hints in the editor. */
export const paramHints = [
  hintField,
  closeOnEscape,
  EditorView.baseTheme({
    '.cm-ms-param-hint': { padding: '2px 8px', fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--muted)' },
    '.cm-ms-param-hint__current': { color: 'var(--text)', fontWeight: '700' },
  }),
]
