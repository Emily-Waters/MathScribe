import { useMemo, useRef, useState } from 'react'
import { evaluateSheet } from '../lib/document.ts'
import { BUILTIN_CONSTANTS } from '../lib/constants.ts'
import { REFERENCE } from '../lib/reference.ts'
import { RenderedBlock, Tex } from './PreviewPane.tsx'

/** Fixed settings, so the reference looks the same whatever the toolbar says. */
const OPTIONS = { precision: 'auto', showSubstitution: true } as const

/**
 * The Reference tab: each example's source beside its live output.
 * Clicking a source copies it, ready to paste into the sheet.
 */
export function ReferencePane() {
  // Evaluated once, when the tab is first opened.
  const rendered = useMemo(() => REFERENCE.map((section) => ({
    ...section,
    examples: section.examples.map((ex) => ({ ...ex, blocks: evaluateSheet(ex.source, OPTIONS).blocks })),
  })), [])
  const [copied, setCopied] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const copy = async (source: string) => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(source)
      setTimeout(() => setCopied((c) => (c === source ? null : c)), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  const jump = (id: string) =>
    scroller.current?.querySelector(`#ref-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="ref" ref={scroller}>
      <nav className="ref__nav" aria-label="Reference sections">
        {rendered.map((s) => <button key={s.id} onClick={() => jump(s.id)}>{s.title}</button>)}
        <button onClick={() => jump('builtins')}>Constant list</button>
      </nav>

      {rendered.map((s) => (
        <section key={s.id} id={`ref-${s.id}`} className="ref__section">
          <h3 className="doc__heading doc__heading--section">{s.title}</h3>
          {s.examples.map((ex) => (
            <div key={ex.source} className="ref__example">
              <p className="ref__explain">{ex.explain}</p>
              <div className="ref__pair">
                <button
                  className="ref__source"
                  title="Copy to clipboard"
                  onClick={() => copy(ex.source)}
                >
                  <pre>{ex.source}</pre>
                  <span className="ref__copied">{copied === ex.source ? 'Copied' : 'Copy'}</span>
                </button>
                <div className="ref__output">
                  {ex.blocks.map((b) => <RenderedBlock key={`${b.line}-${b.kind}`} block={b} />)}
                </div>
              </div>
            </div>
          ))}
        </section>
      ))}

      <section id="ref-builtins" className="ref__section">
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
