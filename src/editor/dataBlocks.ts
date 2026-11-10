/**
 * Imported data in the editor: the rows under an `import("run1.csv")` line.
 *
 * - They're folded away when they first appear (when the sheet opens, or a
 *   file is chosen), so the sheet reads as calculations. Unfold them from the
 *   gutter as usual; a block you've unfolded stays open.
 * - Instead of line numbers they show their row numbers, in their own colour:
 *   row 3 is the row whose values are t_3, x_3, …. The header row shows a dash.
 * - They count as part of the import's line, so the sheet's numbering goes on
 *   from it: after a 27-row import on line 1 comes line 2. (The output's
 *   messages are numbered the same way; see lineNumbering in document.ts.)
 * - They look like a table: the header in bold, the commas faint, the rows on
 *   a shaded band.
 */
import { RangeSet, type EditorState, type Extension, type Range, type StateEffect, type Text } from '@codemirror/state'
import {
  Decoration, EditorView, GutterMarker, ViewPlugin, lineNumberMarkers, type DecorationSet, type ViewUpdate,
} from '@codemirror/view'
import { foldEffect, foldedRanges, foldable } from '@codemirror/language'
import { dataBlocks, isImport } from './language.ts'

/** A data row's number (or the header's dash), shown in place of its line number. */
class RowNumber extends GutterMarker {
  readonly label: string
  constructor(label: string) {
    super()
    this.label = label
  }
  eq(other: RowNumber) {
    return other.label === this.label
  }
  toDOM() {
    return document.createTextNode(this.label)
  }
  elementClass = 'cm-ms-data-row'
}

/** The header row's mark. */
const HEADER_MARK = '–'

/** Row numbers for every data row in the sheet. */
const rowNumbers = lineNumberMarkers.compute(['doc'], (state) => {
  // (If anything goes wrong, no row numbers rather than no gutter: a gutter
  // that fails switches off every gutter, line numbers and all.)
  try {
    const marks = []
    for (const block of dataBlocks(state.doc)) {
      marks.push(new RowNumber(HEADER_MARK).range(state.doc.line(block.header).from))
      if (!block.rows) continue
      let row = 0
      for (let n = block.rows.first; n <= block.rows.last; n++) {
        const line = state.doc.line(n)
        if (line.text.trim()) marks.push(new RowNumber(String(++row)).range(line.from))
      }
    }
    return RangeSet.of(marks)
  } catch (e) {
    console.error('MathScribe: data row numbers', e)
    return RangeSet.empty
  }
})

/** A block's identity across edits: its import line's text and how many rows it has. */
const keyOf = (text: string, rows: number) => `${text.trim()}|${rows}`

/** Folds each data block the first time it's seen. */
const foldNewBlocks = ViewPlugin.fromClass(class {
  seen = new Set<string>()

  constructor(view: EditorView) {
    this.foldNew(view)
  }

  update(u: ViewUpdate) {
    if (u.docChanged) this.foldNew(u.view)
  }

  foldNew(view: EditorView) {
    const { state } = view
    const effects: StateEffect<unknown>[] = []
    for (const block of dataBlocks(state.doc)) {
      const line = state.doc.line(block.line)
      const key = keyOf(line.text, (block.rows?.last ?? block.header) - block.line)
      if (this.seen.has(key)) continue
      this.seen.add(key)
      const range = foldable(state, line.from, line.to)
      let folded = false
      if (range) foldedRanges(state).between(range.from, range.to, () => { folded = true })
      if (range && !folded) effects.push(foldEffect.of(range))
    }
    // (Not while the view is updating.)
    if (effects.length) queueMicrotask(() => view.dispatch({ effects }))
  }
})

/** Each document's data blocks, as lines they take up after their import line (worked out once per document). */
const hiddenLines = new WeakMap<Text, { after: number; count: number }[]>()

/**
 * Line `n`'s number as the sheet shows it: an import's data rows count as part
 * of its line, so the lines after it carry on from the import's number.
 */
export function sheetLineNumber(state: EditorState | undefined, n: number): number {
  // (Without a state, or if anything goes wrong, the plain line number: the gutter must always draw.)
  if (!state) return n
  try {
    let hidden = hiddenLines.get(state.doc)
    if (!hidden) {
      hidden = dataBlocks(state.doc).map((b) => {
        const last = b.rows?.last ?? b.header
        return { after: last, count: last - b.line }
      })
      hiddenLines.set(state.doc, hidden)
    }
    return n - hidden.reduce((sum, h) => sum + (h.after < n ? h.count : 0), 0)
  } catch {
    return n
  }
}

const headerLine = Decoration.line({ class: 'cm-ms-data-header' })
const rowLine = Decoration.line({ class: 'cm-ms-data-line' })
const separator = Decoration.mark({ class: 'cm-ms-data-sep' })

/** The table look for the data rows in view: a shaded band, the header in bold, faint commas. */
const tableLook = ViewPlugin.fromClass(class {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = this.build(view)
  }

  update(u: ViewUpdate) {
    if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view)
  }

  build(view: EditorView): DecorationSet {
    const { doc } = view.state
    const marks: Range<Decoration>[] = []
    const blocks = dataBlocks(doc)
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = doc.lineAt(pos)
        const block = blocks.find((b) => line.number >= b.header && line.number <= (b.rows?.last ?? b.header))
        if (block && line.text.trim()) {
          marks.push((line.number === block.header ? headerLine : rowLine).range(line.from))
          for (const m of line.text.matchAll(/[,;\t]/g)) marks.push(separator.range(line.from + m.index, line.from + m.index + 1))
        }
        pos = line.to + 1
      }
    }
    return Decoration.set(marks, true)
  }
}, { decorations: (p) => p.decorations })

/**
 * Folding's settings for the editor: a folded block shows "…" (click to
 * unfold), except imported data, whose ▼ button after the import line does that.
 */
export const foldingSettings = {
  preparePlaceholder: (state: EditorState, range: { from: number }) => isImport(state.doc.lineAt(range.from).text),
  placeholderDOM: (view: EditorView, onclick: (event: Event) => void, isData: boolean) => {
    const el = document.createElement('span')
    if (isData) return el
    el.className = 'cm-foldPlaceholder'
    el.textContent = '…'
    el.title = view.state.phrase('unfold')
    el.setAttribute('aria-label', view.state.phrase('folded code'))
    el.onclick = onclick
    return el
  },
}

/** Imported data in the editor: folded on arrival, with row numbers in the gutter and a table look. */
export const dataBlocksExtension: Extension = [
  rowNumbers,
  foldNewBlocks,
  tableLook,
  EditorView.baseTheme({
    '.cm-lineNumbers .cm-gutterElement.cm-ms-data-row': { color: 'var(--accent)', fontStyle: 'italic' },
    '.cm-ms-data-header, .cm-ms-data-line': { backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)' },
    '.cm-ms-data-header': { fontWeight: '700', borderBottom: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)' },
    '.cm-ms-data-sep': { opacity: '0.35' },
  }),
]
