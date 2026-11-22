import { useMemo, useRef, useState } from 'react'
import { EXAMPLE_CALC_OPTIONS, STORAGE_KEYS } from '../config.ts'
import { evaluateSheetSafely } from '../lib/sheet/document.ts'
import { symbolTex } from '../lib/engine/index.ts'
import { LIBRARY, searchLibrary, type LibraryEntry } from '../lib/content/library.ts'
import { copyText, useFlash } from '../useFlash.ts'
import { RenderedBlock, Tex } from './blocks/index.tsx'
import { ALL_TOPICS, isShown, useShownTopic, type TopicGroup } from '../useShownTopic.ts'
import { OtherMatches, TopicBar } from './TopicSearch.tsx'

/** The topic menu: the library's topics under their subjects (Physics, Chemistry), in the library's order. */
const TOPIC_GROUPS: TopicGroup[] = [...new Set(LIBRARY.map((t) => t.subject))]
  .map((subject) => ({ label: subject, topics: LIBRARY.filter((t) => t.subject === subject) }))

/** Every topic's id, for the menu. */
const TOPIC_IDS = LIBRARY.map((t) => t.id)

interface LibraryPaneProps {
  /** Put an entry's function into the sheet, at the editor's cursor. */
  onInsert: (text: string) => void
}

/**
 * The Library tab: common equations, each a one-line function with a worked
 * example, to insert at the cursor (or copy). A menu picks the topic shown (or
 * all of them), and a search box narrows it to the equations with every word typed.
 */
export function LibraryPane({ onInsert }: LibraryPaneProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useShownTopic(STORAGE_KEYS.libraryTopic, TOPIC_IDS, scroller)
  const [query, setQuery] = useState('')
  // The equations that match, in every topic (not only the one shown, so a search can say how many match elsewhere).
  const matching = useMemo(() => searchLibrary(query), [query])
  const topics = matching.filter((t) => isShown(shown, t.id))
  const elsewhere = matching.reduce((n, t) => n + (isShown(shown, t.id) ? 0 : t.entries.length), 0)
  const [flash, showFlash] = useFlash<string>()

  const copy = async (e: LibraryEntry) => {
    if (await copyText(e.source)) showFlash(e.id, 'Copied')
  }

  return (
    <div className="ref" ref={scroller}>
      <TopicBar
        groups={TOPIC_GROUPS}
        shown={shown}
        onShow={setShown}
        query={query}
        onQuery={setQuery}
        placeholder="Search: ideal gas, momentum, half-life…"
        searchLabel="Search the equation library"
      />

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
      <OtherMatches query={query} foundHere={topics.length > 0} elsewhere={elsewhere} onShowAll={() => setShown(ALL_TOPICS)} />
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
          <button className="source__button lib__insert" onClick={onInsert} title={'Insert the function on the line with the cursor (or just below it), ready to call: rename it or '
            + 'change it as you like. Its working shows in the output like any other line.'}>
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
