import { useMemo, useRef, useState } from 'react'
import { EXAMPLE_CALC_OPTIONS, STORAGE_KEYS } from '../config.ts'
import { evaluateSheetSafely } from '../lib/sheet/document.ts'
import { BUILTIN_CONSTANTS } from '../lib/constants.ts'
import { SHORTCUTS, keyLabel, type Shortcut } from '../editor/shortcuts.ts'
import { languageTopics } from '../lib/engine/index.ts'
import { entryMatches, termShown } from '../lib/language/tree.ts'
import { matchesWords, searchWords } from '../lib/search.ts'
import { copyText, useFlash } from '../useFlash.ts'
import { ALL_TOPICS, isShown, useShownTopic } from '../useShownTopic.ts'
import { RenderedBlock, Tex } from './blocks/index.tsx'
import { OtherMatches, TopicBar } from './TopicSearch.tsx'

/** The topic menu's choice of the built-in constants' list. */
const BUILTINS_ID = 'builtins'

/** The built-in constants' list, as the topic menu names it. */
const BUILTINS_TITLE = 'Built-in constants'

/** The topic menu's choice of the editor's keyboard shortcuts, and its title. */
const SHORTCUTS_ID = 'shortcuts'
const SHORTCUTS_TITLE = 'Keyboard shortcuts'

/** Whether the app is on a Mac, where Ctrl is ⌘ (and the keys are shown so). */
const ON_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** A shortcut's keys as shown: each key or pair named for this computer, with what goes with them (Ctrl+Click). */
const keysShown = (s: Shortcut) => `${s.keys.map((k) => keyLabel(k, ON_MAC)).join(' / ')}${s.also ? ` · ${s.also}` : ''}`

/**
 * Each example's output, worked out the first time it's shown and kept (with
 * fixed settings, so it never changes): a topic opens without working out the
 * whole tree.
 */
const evaluated = new Map<string, ReturnType<typeof evaluateSheetSafely>['blocks']>()
const blocksOf = (source: string) => {
  let blocks = evaluated.get(source)
  if (!blocks) evaluated.set(source, blocks = evaluateSheetSafely(source, EXAMPLE_CALC_OPTIONS).blocks)
  return blocks
}

/**
 * The Reference tab: the language tree (lib/language/tree.ts), each topic's
 * entries with their rules, and each example's source beside its live output.
 * Clicking a source copies it, ready to paste into the sheet. A menu picks the
 * topic shown (or all of them), and a search box narrows it to the entries
 * with every word typed.
 */
export function ReferencePane() {
  const topics = useMemo(() => languageTopics(), [])
  const scroller = useRef<HTMLDivElement>(null)
  const ids = useMemo(() => [...topics.map((t) => t.id), BUILTINS_ID, SHORTCUTS_ID], [topics])
  const [shown, setShown] = useShownTopic(STORAGE_KEYS.referenceTopic, ids, scroller)
  const [query, setQuery] = useState('')
  const words = useMemo(() => searchWords(query), [query])

  // The entries that match, in every topic (not only the one shown, so a search can say how many match elsewhere).
  const matching = useMemo(() => topics.map((topic) => ({
    ...topic,
    entries: topic.entries.filter((entry) => entryMatches(topic, entry, words)),
  })).filter((t) => t.entries.length), [topics, words])
  const inShown = (id: string) => isShown(shown, id)
  const visible = matching.filter((t) => inShown(t.id))
  const constants = Object.entries(BUILTIN_CONSTANTS)
    .filter(([name, c]) => matchesWords([BUILTINS_TITLE, `@${name}`, c.description], words))
  const showsConstants = inShown(BUILTINS_ID) && constants.length > 0
  const shortcuts = SHORTCUTS.filter((sc) => matchesWords([SHORTCUTS_TITLE, keysShown(sc), sc.does], words))
  const showsShortcuts = inShown(SHORTCUTS_ID) && shortcuts.length > 0
  const elsewhere = matching.reduce((n, t) => n + (inShown(t.id) ? 0 : t.entries.length), 0)
    + (inShown(BUILTINS_ID) ? 0 : constants.length) + (inShown(SHORTCUTS_ID) ? 0 : shortcuts.length)

  const [flash, showFlash] = useFlash<string>()

  const copy = async (source: string) => {
    if (await copyText(source)) showFlash(source, 'Copied')
  }

  return (
    <div className="ref" ref={scroller}>
      <TopicBar
        groups={[{ topics }, { topics: [{ id: BUILTINS_ID, title: BUILTINS_TITLE }, { id: SHORTCUTS_ID, title: SHORTCUTS_TITLE }] }]}
        shown={shown}
        onShow={setShown}
        query={query}
        onQuery={setQuery}
        placeholder="Search: units, uncertainty, plot…"
        searchLabel="Search the reference"
      />

      {visible.map((s) => (
        <section key={s.id} id={`ref-${s.id}`} className="ref__section">
          <h3 className="doc__heading doc__heading--section">{s.title}</h3>
          {s.entries.map((entry) => (
            <div key={entry.explain} className="ref__example">
              <p className="ref__explain">
                {/* (How it's written, if it's one thing to write: a setting.) */}
                {entry.syntax?.map((written) => <code key={written} className="ref__syntax">{written}</code>)}
                {entry.explain}
              </p>
              {entry.terms && (
                <table className="ref__table ref__terms">
                  <tbody>
                    {entry.terms.map((t) => (
                      <tr key={t.name}>
                        <td><code>{termShown(t)}</code></td>
                        <td>{t.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {entry.rules && (
                <ul className="ref__rules">
                  {entry.rules.map((rule) => <li key={rule}>{rule}</li>)}
                </ul>
              )}
              {entry.examples.map((ex) => (
              <div key={ex.source} className="ref__pair">
                <button
                  className="ref__source"
                  title="Copy to clipboard"
                  onClick={() => void copy(ex.source)}
                >
                  <pre>{ex.source}</pre>
                  <span className="ref__copied">{flash?.key === ex.source ? flash.message : 'Copy'}</span>
                </button>
                <div className="ref__output">
                  {blocksOf(ex.source).map((b) => <RenderedBlock key={`${b.line}-${b.kind}`} block={b} />)}
                </div>
              </div>
              ))}
            </div>
          ))}
        </section>
      ))}

      {showsConstants && (
      <section className="ref__section">
        <h3 className="doc__heading doc__heading--section">{BUILTINS_TITLE}</h3>
        <p className="ref__explain">Write @name (3 sig figs), @name:n, or @name:exact.</p>
        <table className="ref__table">
          <tbody>
            {constants.map(([name, c]) => (
              <tr key={name}>
                <td><code>@{name}</code></td>
                <td><Tex latex={c.tex} /></td>
                <td>{c.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      )}

      {showsShortcuts && (
      <section className="ref__section">
        <h3 className="doc__heading doc__heading--section">{SHORTCUTS_TITLE}</h3>
        <p className="ref__explain">In the editor, as it binds them (Ctrl is ⌘ on a Mac).</p>
        <table className="ref__table ref__shortcuts">
          <tbody>
            {shortcuts.map((sc) => (
              <tr key={sc.does}>
                <td><code>{keysShown(sc)}</code></td>
                <td>{sc.does}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      )}

      <OtherMatches
        query={query}
        foundHere={visible.length > 0 || showsConstants || showsShortcuts}
        elsewhere={elsewhere}
        onShowAll={() => setShown(ALL_TOPICS)}
      />
    </div>
  )
}
