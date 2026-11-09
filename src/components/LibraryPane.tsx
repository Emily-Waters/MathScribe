import { useMemo, useRef, useState } from 'react'
import { evaluateSheet } from '../lib/document.ts'
import { symbolTex } from '../lib/engine.ts'
import { LIBRARY, searchLibrary, type LibraryEntry } from '../lib/library.ts'
import { RenderedBlock, Tex } from './PreviewPane.tsx'

/** Fixed settings, so the library looks the same whatever the toolbar says. */
const OPTIONS = { precision: 'auto', showSubstitution: true } as const

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
  const [done, setDone] = useState<{ id: string; what: 'Inserted' | 'Copied' } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const flash = (id: string, what: 'Inserted' | 'Copied') => {
    setDone({ id, what })
    setTimeout(() => setDone((d) => (d?.id === id ? null : d)), 1500)
  }
  const copy = async (e: LibraryEntry) => {
    try {
      await navigator.clipboard.writeText(e.source)
      flash(e.id, 'Copied')
    } catch {
      /* clipboard blocked */
    }
  }
  const jump = (id: string) =>
    scroller.current?.querySelector(`#lib-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

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
        {!query && LIBRARY.map((t) => <button key={t.id} onClick={() => jump(t.id)}>{t.title}</button>)}
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
              done={done?.id === e.id ? done.what : null}
              onInsert={() => {
                onInsert(e.source)
                flash(e.id, 'Inserted')
              }}
              onCopy={() => void copy(e)}
            />
          ))}
        </section>
      ))}
    </div>
  )
}

function Entry({ entry: e, done, onInsert, onCopy }: {
  entry: LibraryEntry
  done: 'Inserted' | 'Copied' | null
  onInsert: () => void
  onCopy: () => void
}) {
  // The function and its example, evaluated together as one small sheet.
  const blocks = useMemo(() => evaluateSheet(`${e.source}\n${e.example}`, OPTIONS).blocks, [e])
  return (
    <div className="ref__example lib__entry">
      <div className="lib__head">
        <strong>{e.title}</strong>
        <span className="lib__actions">
          {done && <span className="lib__done">{done}</span>}
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
          {blocks.slice(0, 1).map((b) => <RenderedBlock key={`${b.line}-${b.kind}`} block={b} />)}
          <div className="lib__example-label">Example</div>
          {blocks.slice(1).map((b) => <RenderedBlock key={`${b.line}-${b.kind}`} block={b} />)}
        </div>
      </div>
    </div>
  )
}
