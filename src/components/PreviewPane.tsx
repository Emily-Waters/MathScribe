/**
 * The Output pane: the Rendered tab (each block drawn by its kind's view,
 * blocks/), the Library and the Reference.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Sheet } from '../lib/sheet/document.ts'
import { lineNumbering } from '../lib/sheet/sheetIndex.ts'
import type { CalcOptions } from '../lib/engine/index.ts'
import { RenderedBlock } from './blocks/index.tsx'
import { CaptionNumbers, ImportFile, LineLink, LineNumbers } from './blocks/context.ts'
import { captionNumbers } from './blocks/captions.ts'
import { ReferencePane } from './ReferencePane.tsx'
import { OptionsMenu } from './OptionsMenu.tsx'
import { LibraryPane } from './LibraryPane.tsx'

/** The Output pane’s tabs. */
type Tab = 'rendered' | 'library' | 'reference'

interface PreviewPaneProps {
  sheet: Sheet
  options: CalcOptions
  onOptionsChange: (options: CalcOptions) => void
  /** The editor's cursor line; its output is highlighted. */
  activeLine: number | null
  /** Changes when the active line was clicked in the editor, to centre its output. */
  centerRequest: number
  /** Clicking output moves the editor cursor to that source line. */
  onJump: (line: number) => void
  /** Put text into the sheet at the editor's cursor (from the Library tab). */
  onInsert: (text: string) => void
  /** Remove the `@import(…)` on a line, and its data. */
  onRemoveImport: (line: number) => void
}

/** The Output pane: the rendered sheet, the equation library and the reference. (Exports are the Export dialog's.) */
export function PreviewPane({
  sheet, options, onOptionsChange, activeLine, centerRequest, onJump, onInsert, onRemoveImport,
}: PreviewPaneProps) {
  const [tab, setTab] = useState<Tab>('rendered')
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
  }, [activeLine, centerRequest, tab])

  return (
    <section className="pane">
      <header className="pane__header">
        <h2>Output</h2>
        <div className="toolbar">
          {/* The Reference tab uses fixed settings, so the options don't apply there. */}
          <OptionsMenu options={options} onChange={onOptionsChange} hidden={tab === 'reference' || tab === 'library'} />
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'rendered'} onClick={() => setTab('rendered')}>
              Rendered
            </button>
            <button role="tab" aria-selected={tab === 'library'} onClick={() => setTab('library')}>
              Library
            </button>
            <button role="tab" aria-selected={tab === 'reference'} onClick={() => setTab('reference')}>
              Reference
            </button>
          </div>
        </div>
      </header>
      {tab === 'reference' ? (
        <ReferencePane />
      ) : tab === 'library' ? (
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
