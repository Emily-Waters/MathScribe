import { useMemo, useRef, useState } from 'react'
import { EXAMPLE_CALC_OPTIONS } from '../config.ts'
import { evaluateSheetSafely } from '../lib/document.ts'
import { symbolTex } from '../lib/engine.ts'
import { LIBRARY, searchLibrary, type LibraryEntry } from '../lib/library.ts'
import { copyText, useFlash } from '../useFlash.ts'
import { RenderedBlock, Tex } from './PreviewPane.tsx'
import { SectionLinks } from './ReferencePane.tsx'

interface LibraryPaneProps {
  /** Put an entry's function into the sheet, at the editor's cursor. */
  onInsert: (text: string) => void
}

/**
 * The Library tab: common equations, each a one-line function with a worked
 * example, to insert at the cursor (or copy).
 */
export function LibraryPane({ onInsert }: LibraryPaneProps) {
  const [query, setQuery] = useState('')
  const topics = useMemo(() => searchLibrary(query), [query])
  const [flash, showFlash] = useFlash<string>()
  const scroller = useRef<HTMLDivElement>(null)

  const copy = async (e: LibraryEntry) => {
    if (await copyText(e.source)) showFlash(e.id, 'Copied')
  }

  return (
    <div className="ref" ref={scroller}>
      <div className="ref__nav lib__bar">
        <input
          className="lib__search"
          type="search"
          value={query}
          placeholder="Search: ideal gas, momentum, half-life…"
          aria-label="Search the equation library"
          onChange={(e) => setQuery(e.target.value)}
        />
        {!query && <SectionLinks scroller={scroller} prefix="lib" sections={LIBRARY} />}
      </div>
      <p className="ref__explain lib__intro">
        Insert puts the function on the line with the cursor (or just below it), ready to call: rename it or
        change it as you like. Its working shows in the output like any other line.
      </p>

      {!topics.length && <p className="doc__empty">No equations match “{query}”.</p>}
      {topics.map((t) => (
        <section key={t.id} id={`lib-${t.id}`} className="ref__section">
          <h3 className="doc__heading doc__heading--section">
            {t.title} <span className="lib__subject">{t.subject}</span>
          </h3>
          {t.entries.map((e) => (
            <Entry
              key={e.id}
              entry={e}
              message={flash?.key === e.id ? flash.message : null}
              onInsert={() => {
                onInsert(e.source)
                showFlash(e.id, 'Inserted')
              }}
              onCopy={() => void copy(e)}
            />
          ))}
        </section>
      ))}
    </div>
  )
}

/** One equation: its title, when it applies, its source and symbols, and its example's output. */
function Entry({ entry: e, message, onInsert, onCopy }: {
  entry: LibraryEntry
  /** "Copied" or "Inserted", just after either. */
  message: string | null
  onInsert: () => void
  onCopy: () => void
}) {
  // The function and its example, evaluated together as one small sheet.
  const blocks = useMemo(() => evaluateSheetSafely(`${e.source}\n${e.example}`, EXAMPLE_CALC_OPTIONS).blocks, [e])
  return (
    <div className="ref__example lib__entry">
      <div className="lib__head">
        <strong>{e.title}</strong>
        <span className="lib__actions">
          {message && <span className="lib__done">{message}</span>}
          <button className="source__button" onClick={onCopy} title="Copy the function to the clipboard">Copy</button>
          <button className="source__button lib__insert" onClick={onInsert} title="Insert the function at the cursor">
            Insert
          </button>
        </span>
      </div>
      {e.note && <p className="ref__explain">{e.note}</p>}
      <div className="ref__pair">
        <div>
          <pre className="lib__source">{e.source}</pre>
          <ul className="lib__symbols">
            {e.symbols.map((x) => (
              <li key={x.name}>
                <Tex latex={symbolTex(x.name)} /> {x.meaning}{x.unit && <span className="lib__unit"> ({x.unit})</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="ref__output">
          {/* The first block is the function; the rest is its example. */}
          {blocks.slice(0, 1).map((b) => <RenderedBlock key={`${b.line}-${b.kind}`} block={b} />)}
          <div className="lib__example-label">Example</div>
          {blocks.slice(1).map((b) => <RenderedBlock key={`${b.line}-${b.kind}`} block={b} />)}
        </div>
      </div>
    </div>
  )
}
