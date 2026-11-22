/**
 * The Output pane: the sheet (each block drawn by its kind's view, blocks/),
 * or, in its place while the top bar's button for it is on, the Library or the
 * Reference (OUTPUT_VIEW).
 */
import { useEffect, useMemo, useRef } from 'react'
import { OUTPUT_VIEW, type OutputView } from '../config.ts'
import type { Sheet } from '../lib/sheet/document.ts'
import { lineNumbering } from '../lib/sheet/sheetIndex.ts'
import type { CalcOptions } from '../lib/engine/index.ts'
import { RenderedBlock } from './blocks/index.tsx'
import { CaptionNumbers, ImportFile, LineLink, LineNumbers } from './blocks/context.ts'
import { captionNumbers } from './blocks/captions.ts'
import { ReferencePane } from './ReferencePane.tsx'
import { OptionsMenu } from './OptionsMenu.tsx'
import { LibraryPane } from './LibraryPane.tsx'

/** What the pane's header says it's showing, for the Library and the Reference. */
const VIEW_TITLE: Record<Exclude<OutputView, typeof OUTPUT_VIEW.sheet>, string> = {
  [OUTPUT_VIEW.library]: 'Library',
  [OUTPUT_VIEW.reference]: 'Reference',
}

interface PreviewPaneProps {
  sheet: Sheet
  /** What it shows: the sheet, the Library or the Reference. */
  view: OutputView
  /** Back to the sheet, from the Library or the Reference. */
  onCloseView: () => void
  options: CalcOptions
  onOptionsChange: (options: CalcOptions) => void
  /** The editor's cursor line; its output is highlighted. */
  activeLine: number | null
  /** Changes when the active line was clicked in the editor, to centre its output. */
  centerRequest: number
  /** Clicking output moves the editor cursor to that source line. */
  onJump: (line: number) => void
  /** Put text into the sheet at the editor's cursor (from the Library). */
  onInsert: (text: string) => void
  /** Remove the `@import(…)` on a line, and its data. */
  onRemoveImport: (line: number) => void
}

/** The Output pane: the rendered sheet, or the equation library or the reference. (Exports are the Export dialog's.) */
export function PreviewPane({
  sheet, view, onCloseView, options, onOptionsChange, activeLine, centerRequest, onJump, onInsert, onRemoveImport,
}: PreviewPaneProps) {
  const docRef = useRef<HTMLDivElement>(null)
  const link = useMemo(() => ({ activeLine, onJump }), [activeLine, onJump])
  const numbering = useMemo(() => lineNumbering(sheet.blocks), [sheet.blocks])
  // (Each captioned block's number, `Table 2`, as the exports number it.)
  const captions = useMemo(() => captionNumbers(sheet.blocks), [sheet.blocks])

  // Keep the output for the cursor's line in view: centred after a click in the
  // editor; while typing or moving with the keys, scrolled only as far as needed.
  const centered = useRef(centerRequest)
  useEffect(() => {
    const block: ScrollLogicalPosition = centered.current === centerRequest ? 'nearest' : 'center'
    centered.current = centerRequest
    docRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block })
  }, [activeLine, centerRequest, view])

  return (
    <section className="pane">
      <header className="pane__header">
        {view === OUTPUT_VIEW.sheet ? (
          <>
            <h2>Output</h2>
            <OptionsMenu options={options} onChange={onOptionsChange} />
          </>
        ) : (
          <>
            <h2>{VIEW_TITLE[view]}</h2>
            <button className="pane__close" onClick={onCloseView} title="Back to the output" aria-label="Back to the output">×</button>
          </>
        )}
      </header>
      {view === OUTPUT_VIEW.reference ? (
        <ReferencePane />
      ) : view === OUTPUT_VIEW.library ? (
        <LibraryPane onInsert={onInsert} />
      ) : (
        <div className="doc" ref={docRef}>
          <LineLink.Provider value={link}>
          <LineNumbers.Provider value={numbering}>
          <ImportFile.Provider value={onRemoveImport}>
          <CaptionNumbers.Provider value={captions}>
            {sheet.blocks.length === 0
              ? <p className="doc__empty">Start typing on the left.</p>
              : sheet.blocks.map((b) => <RenderedBlock key={`${b.line}-${b.kind}`} block={b} />)}
          </CaptionNumbers.Provider>
          </ImportFile.Provider>
          </LineNumbers.Provider>
          </LineLink.Provider>
        </div>
      )}
    </section>
  )
}
