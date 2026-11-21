import { useMemo, useRef, type RefObject } from 'react'
import { EXAMPLE_CALC_OPTIONS } from '../config.ts'
import { evaluateSheetSafely } from '../lib/sheet/document.ts'
import { BUILTIN_CONSTANTS } from '../lib/constants.ts'
import { languageTopics } from '../lib/engine/index.ts'
import { copyText, useFlash } from '../useFlash.ts'
import { RenderedBlock, Tex } from './blocks/index.tsx'

/** The id of the built-in constants list, for the section links. */
const BUILTINS_ID = 'builtins'

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
  const [flash, showFlash] = useFlash<string>()
  const scroller = useRef<HTMLDivElement>(null)

  const copy = async (source: string) => {
    if (await copyText(source)) showFlash(source, 'Copied')
  }

  return (
    <div className="ref" ref={scroller}>
      <nav className="ref__nav" aria-label="Reference sections">
        <SectionLinks scroller={scroller} prefix="ref" sections={[...rendered, { id: BUILTINS_ID, title: 'Constant list' }]} />
      </nav>

      {rendered.map((s) => (
        <section key={s.id} id={`ref-${s.id}`} className="ref__section">
          <h3 className="doc__heading doc__heading--section">{s.title}</h3>
          {s.entries.map((entry) => (
            <div key={entry.explain} className="ref__example">
              <p className="ref__explain">
                {/* (How it's written, if it's one thing to write: a setting.) */}
                {entry.syntax?.map((written) => <code key={written} className="ref__syntax">{written}</code>)}
                {entry.explain}
              </p>
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
