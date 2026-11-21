import { useMemo, useRef, type RefObject } from 'react'
import { EXAMPLE_CALC_OPTIONS } from '../config.ts'
import { evaluateSheetSafely } from '../lib/sheet/document.ts'
import { BUILTIN_CONSTANTS } from '../lib/constants.ts'
import { languageTopics, moduleSettingsDescriptions } from '../lib/engine/index.ts'
import { settingsCallExample, valuesText } from '../lib/language/reference.ts'
import { SIGIL } from '../lib/syntax.ts'
import { copyText, useFlash } from '../useFlash.ts'
import { RenderedBlock, Tex } from './blocks/index.tsx'

/** The id of the built-in constants list, for the section links. */
const BUILTINS_ID = 'builtins'

/** The id of the settings section, for the section links. */
const SETTINGS_ID = 'settings'

/**
 * The Reference tab: the language tree (lib/language/tree.ts), each topic's
 * entries with their rules, and each example's source beside its live output.
 * Clicking a source copies it, ready to paste into the sheet.
 */
export function ReferencePane() {
  // Evaluated once, when the tab is first opened.
  const rendered = useMemo(() => languageTopics().map((topic) => ({
    ...topic,
    entries: topic.entries.map((entry) => ({
      ...entry,
      examples: entry.examples.map((ex) => ({ ...ex, blocks: evaluateSheetSafely(ex.source, EXAMPLE_CALC_OPTIONS).blocks })),
    })),
  })), [])
  // Tables' and plots' settings, listed from their declarations (lib/language: the same the AI primer lists).
  const settings = useMemo(() => moduleSettingsDescriptions(), [])
  const [flash, showFlash] = useFlash<string>()
  const scroller = useRef<HTMLDivElement>(null)

  const copy = async (source: string) => {
    if (await copyText(source)) showFlash(source, 'Copied')
  }

  return (
    <div className="ref" ref={scroller}>
      <nav className="ref__nav" aria-label="Reference sections">
        <SectionLinks scroller={scroller} prefix="ref" sections={[...rendered, { id: SETTINGS_ID, title: 'Settings' }, { id: BUILTINS_ID, title: 'Constant list' }]} />
      </nav>

      {rendered.map((s) => (
        <section key={s.id} id={`ref-${s.id}`} className="ref__section">
          <h3 className="doc__heading doc__heading--section">{s.title}</h3>
          {s.entries.map((entry) => (
            <div key={entry.explain} className="ref__example">
              <p className="ref__explain">{entry.explain}</p>
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
                  {ex.blocks.map((b) => <RenderedBlock key={`${b.line}-${b.kind}`} block={b} />)}
                </div>
              </div>
              ))}
            </div>
          ))}
        </section>
      ))}

      <section id={`ref-${SETTINGS_ID}`} className="ref__section">
        <h3 className="doc__heading doc__heading--section">Settings</h3>
        {settings.map((d) => (
          <div key={d.call} className="ref__example">
            <p className="ref__explain">
              <code>{`${SIGIL}${d.call}(…)`}</code>’s settings go after a semicolon in its brackets, separated by commas:{' '}
              <code>{settingsCallExample(d)}</code>. Its ⚙ in the editor sets them too.
            </p>
            <table className="ref__table">
              <tbody>
                {d.settings.map((s) => (
                  <tr key={s.label}>
                    <td>{s.examples.map((e) => <code key={e} className="ref__setting">{e}</code>)}</td>
                    <td>
                      {s.summary}
                      {s.values && <> {valuesText(s, (v) => v)}.</>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section id={`ref-${BUILTINS_ID}`} className="ref__section">
        <h3 className="doc__heading doc__heading--section">Built-in constants</h3>
        <p className="ref__explain">Write @name (3 sig figs), @name:n, or @name:exact.</p>
        <table className="ref__table">
          <tbody>
            {Object.entries(BUILTIN_CONSTANTS).map(([name, c]) => (
              <tr key={name}>
                <td><code>@{name}</code></td>
                <td><Tex latex={c.tex} /></td>
                <td>{c.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

/**
 * Buttons that scroll `scroller` to each of a tab's sections (whose ids are
 * `${prefix}-${section id}`). Used by the Reference and Library tabs.
 */
export function SectionLinks({ sections, scroller, prefix }: {
  sections: { id: string; title: string }[]
  scroller: RefObject<HTMLDivElement | null>
  prefix: string
}) {
  const jump = (id: string) =>
    scroller.current?.querySelector(`#${prefix}-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <>
      {sections.map((s) => <button key={s.id} onClick={() => jump(s.id)}>{s.title}</button>)}
    </>
  )
}
