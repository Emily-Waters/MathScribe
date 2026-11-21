/**
 * Inline results: each line's result, faint, at the end of the line in the
 * editor (`F = m * a      = 19.6 N`), so a value can be checked without
 * looking across at the Rendered tab. The results are the evaluated sheet's
 * (sheetIndex.ts collectResults), told to the editor as they change; a line
 * that works nothing out (a value typed as it is) shows none. The editor's
 * Options turn them off.
 */
import { Facet, StateEffect, StateField, type Extension, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import katex from 'katex'
import type { LineValue } from '../lib/engine/index.ts'
import { readStored, writeStored } from '../lib/data/storage.ts'
import { STORAGE_KEYS } from '../config.ts'

/** The results, by line number, as the evaluated sheet has them. */
export const setInlineResults = StateEffect.define<ReadonlyMap<number, LineValue>>()

/**
 * Whether the editor shows its faint hints: each line's result after it, and
 * what modules add of the same kind (a series' members' names before its
 * values). The editor's Options turn them off; shown unless the app says not.
 */
export const inlineHintsShown = Facet.define<boolean, boolean>({ combine: (values) => values.at(-1) ?? true })

/** What goes before a result: `=`, or `≈` for a rounded one. */
const RELATION = { equals: '=', approx: '\\approx' } as const

/** A line's result, typeset, at the end of the line. */
class ResultWidget extends WidgetType {
  readonly value: LineValue
  constructor(value: LineValue) {
    super()
    this.value = value
  }
  eq(other: ResultWidget) {
    return other.value.tex === this.value.tex && other.value.approx === this.value.approx
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-ms-inline-result'
    el.setAttribute('aria-hidden', 'true')
    const relation = this.value.approx ? RELATION.approx : RELATION.equals
    el.innerHTML = katex.renderToString(`${relation} ${this.value.tex}`, { throwOnError: false, strict: 'ignore' })
    return el
  }
  ignoreEvent() {
    return true
  }
}

/** The results as decorations at their lines' ends (a line since deleted is left out). */
function decorations(results: ReadonlyMap<number, LineValue>, doc: EditorView['state']['doc']): DecorationSet {
  const marks: Range<Decoration>[] = []
  for (const [n, value] of [...results].sort(([a], [b]) => a - b)) {
    if (n < 1 || n > doc.lines) continue
    marks.push(Decoration.widget({ widget: new ResultWidget(value), side: 1 }).range(doc.line(n).to))
  }
  return Decoration.set(marks)
}

/** The results shown: set from the evaluated sheet, and moved with the text as it's edited until the next. */
const resultsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(set, tr) {
    for (const e of tr.effects) if (e.is(setInlineResults)) return decorations(e.value, tr.state.doc)
    return set.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f),
})

/** Inline results in the editor. */
export const inlineResults: Extension = [
  resultsField,
  EditorView.baseTheme({
    '.cm-ms-inline-result': {
      // (The gap inside it, not a margin: the cursor at the line's end goes at the widget's edge, so its edge is the text's end.)
      paddingLeft: '2.5em',
      color: 'var(--muted)',
      opacity: '0.75',
      fontSize: '0.85em',
      pointerEvents: 'none',
      userSelect: 'none',
    },
    '.cm-ms-inline-result .katex': { fontSize: '1em' },
  }),
]

/** Whether inline results are shown: as set last time in this browser, on unless turned off. */
export const loadInlineResultsShown = (): boolean => readStored(STORAGE_KEYS.inlineResults) !== String(false)

/** Remember whether inline results are shown. */
export const saveInlineResultsShown = (shown: boolean): void => {
  writeStored(STORAGE_KEYS.inlineResults, String(shown))
}
