import katex from 'katex'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { listItems, splitInlineMath, titleSegments, type Block, type Sheet } from '../lib/document.ts'
import { loadLatexOptions, saveLatexOptions, toLatexDocument, type LatexOptions } from '../lib/latex.ts'
import type { CalcOptions } from '../lib/engine.ts'
import { ReferencePane } from './ReferencePane.tsx'
import { OptionsMenu } from './OptionsMenu.tsx'
import { LatexOptionsMenu } from './LatexOptionsMenu.tsx'
import { downloadFile } from '../lib/files.ts'

const render = (latex: string, displayMode: boolean) =>
  katex.renderToString(latex, { displayMode, throwOnError: false, strict: 'ignore' })

export function Tex({ latex, display = false }: { latex: string; display?: boolean }) {
  const html = useMemo(() => render(latex, display), [latex, display])
  return display
    ? <div className="math" dangerouslySetInnerHTML={{ __html: html }} />
    : <span dangerouslySetInnerHTML={{ __html: html }} />
}

/** A heading or block title, with `p_z` subscripts and `$…$` maths. */
function Title({ text }: { text: string }) {
  return (
    <>
      {titleSegments(text).map((s, i) => (s.kind === 'math'
        ? <Tex key={i} latex={s.value} />
        : s.kind === 'sub' ? <sub key={i}>{s.value}</sub> : <span key={i}>{s.value}</span>))}
    </>
  )
}

/** Whether a block or anything inside it has an error (so a hidden block still shows it). */
const hasError = (b: Block): boolean =>
  ((b.kind === 'calc' || b.kind === 'function') && !!b.error)
  || (b.kind === 'constants' && (!!b.error || b.entries.some((e) => e.error)))
  || ((b.kind === 'group' || b.kind === 'layout') && (!!b.error || b.children.some(hasError)))

/** Linking between output and source lines: which line the cursor is on, and how to jump to one. */
const LineLink = createContext<{ activeLine: number | null; onJump: (line: number) => void }>({
  activeLine: null,
  onJump: () => {},
})

/** Props that tie an element to a source line: highlight when active, jump to it on click. */
function useLineLink() {
  const { activeLine, onJump } = useContext(LineLink)
  return (line: number) => ({
    'data-line': line,
    'data-active': line === activeLine ? 'true' : undefined,
    onClick: (e: MouseEvent) => {
      // Don't jump when the click ends a text selection in the output.
      if (window.getSelection()?.toString()) return
      e.stopPropagation()
      onJump(line)
    },
  })
}

export function RenderedBlock({ block }: { block: Block }) {
  const link = useLineLink()
  switch (block.kind) {
    case 'heading': {
      const number = block.number && <span className="doc__heading-number">{block.number}</span>
      const text = <Title text={block.text} />
      if (block.level === 1) return <h3 className="doc__heading doc__heading--section" {...link(block.line)}>{number}{text}</h3>
      if (block.level === 2) return <h4 className="doc__heading doc__heading--subsection" {...link(block.line)}>{number}{text}</h4>
      return <p className="doc__heading doc__heading--bold" {...link(block.line)}>{text}</p>
    }
    case 'text':
      return (
        <p className="doc__text" {...link(block.line)}>
          {splitInlineMath(block.text).map((seg, i) =>
            seg.math ? <Tex key={i} latex={seg.value} /> : <span key={i}>{seg.value}</span>,
          )}
        </p>
      )
    case 'latex':
      return <div className="calc" {...link(block.line)}><Tex latex={block.latex} display /></div>
    case 'spacer':
      return <div className="doc__spacer" aria-hidden="true" />
    case 'constants':
      if (block.hidden && !hasError(block)) return null
      return (
        <section className={`group group--constants${hasError(block) ? ' group--error' : ''}`}>
          <header className="group__header" {...link(block.line)}>
            <span className="group__title"><span className="group__kind">Constants</span></span>
            {block.note && <span className="calc__note">{block.note}</span>}
          </header>
          <div className="group__body">
            {block.entries.map((e) => (
              <div className={`calc${e.error ? ' calc--error' : ''}`} key={e.line} {...link(e.line)}>
                <div className="calc__row">
                  {e.tex ? <Tex latex={e.tex} display /> : <code className="calc__source">{e.source}</code>}
                  {e.note && <span className="calc__note">{e.note}</span>}
                </div>
                {e.error && <p className="calc__msg calc__msg--error">Line {e.line}: {e.error}</p>}
                {e.warning && <p className="calc__msg calc__msg--warn">Line {e.line}: {e.warning}</p>}
                {e.info && <p className="calc__msg calc__msg--info">{e.info}</p>}
              </div>
            ))}
          </div>
          {block.error && <p className="calc__msg calc__msg--error">{block.error}</p>}
        </section>
      )
    case 'calc':
      // `#hide` lines stay hidden unless something went wrong.
      if (block.hidden && !block.error) return null
      return (
        <div className={`calc${block.error ? ' calc--error' : ''}`} {...link(block.line)}>
          {block.trace && (
            <div className="calc__trace" title="Working inside the function">
              {block.trace.map((t, i) => (
                <div className="calc__row" key={i}>
                  <Tex latex={t.tex} display />
                  {t.note && <span className="calc__note">{t.note}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="calc__row">
            {block.tex
              ? <Tex latex={block.tex} display />
              : <code className="calc__source">{block.source}</code>}
            {block.note && <span className="calc__note">{block.note}</span>}
          </div>
          {block.error && <p className="calc__msg calc__msg--error">Line {block.line}: {block.error}</p>}
          {block.warning && <p className="calc__msg calc__msg--warn">Line {block.line}: {block.warning}</p>}
          {block.info && (
            <p className="calc__msg calc__msg--info">
              {splitInlineMath(block.info).map((seg, i) =>
                seg.math ? <Tex key={i} latex={seg.value} /> : <span key={i}>{seg.value}</span>)}
            </p>
          )}
        </div>
      )
    case 'function':
      if (block.hidden && !block.error) return null
      return (
        <section className={`group group--function${block.error ? ' group--error' : ''}`}>
          <header className="group__header" {...link(block.line)}>
            <span className="group__title">
              <span className="group__kind">Function</span> <Tex latex={block.signature} />
            </span>
            {block.note && <span className="calc__note">{block.note}</span>}
          </header>
          <div className="group__body">
            {block.body.map((s, i) => (
              <div className="calc" key={i} {...link(s.line)}>
                <div className="calc__row">
                  <Tex latex={s.tex} display />
                  {s.note && <span className="calc__note">{s.note}</span>}
                </div>
              </div>
            ))}
          </div>
          {block.error && <p className="calc__msg calc__msg--error">Line {block.line}: {block.error}</p>}
        </section>
      )
    case 'layout': {
      if (block.command === 'hide' && !hasError(block)) return null
      const title = (block.title || block.note) && (
        <p className="layout__title" {...link(block.line)}>
          <Title text={block.title} />
          {block.note && <span className="calc__note">{block.note}</span>}
        </p>
      )
      const error = block.error && <p className="calc__msg calc__msg--error">Line {block.line}: {block.error}</p>
      if (block.style === 'list' || block.style === 'numbered') {
        const List = block.style === 'numbered' ? 'ol' : 'ul'
        const items = listItems(block.children).map(({ item, subs }) => (
          <li key={`${item.line}-${item.kind}`}>
            <RenderedBlock block={item} />
            {subs.map((s) => <RenderedBlock key={`${s.line}-sub`} block={s} />)}
          </li>
        ))
        // A sub-list is just the list, inside its parent's item.
        if (block.nested) return <List className="layout__list">{items}</List>
        return <div className="layout">{title}<List className="layout__list">{items}</List>{error}</div>
      }
      return (
        <div className={`layout layout--${block.style ?? 'plain'}`}>
          {title}
          <div className="layout__body">
            {block.children.map((b) => <RenderedBlock key={`${b.line}-${b.kind}`} block={b} />)}
          </div>
          {error}
        </div>
      )
    }
    case 'group':
      if (block.command === 'hide' && !hasError(block)) return null
      return (
        <section className={`group${block.error ? ' group--error' : ''}`}>
          <header className="group__header" {...link(block.line)}>
            <span className="group__title">{block.title ? <Title text={block.title} /> : 'Block'}</span>
            {block.note && <span className="calc__note">{block.note}</span>}
          </header>
          <div className="group__body">
            {block.children.map((b) => <RenderedBlock key={`${b.line}-${b.kind}`} block={b} />)}
          </div>
          {block.error && <p className="calc__msg calc__msg--error">{block.error}</p>}
          {block.locals.length > 0 && (
            <footer className="group__locals" title="Defined in this block only">
              <span className="vars__label">Local</span>
              {block.locals.map((v) => (
                <span key={v.name} className="vars__item" title={sigFigLabel(v.sf)}><Tex latex={v.tex} /></span>
              ))}
            </footer>
          )}
        </section>
      )
  }
}

const sigFigLabel = (sf: number) =>
  Number.isFinite(sf) ? `${sf} significant figure${sf === 1 ? '' : 's'}` : 'exact'

type Tab = 'rendered' | 'latex' | 'reference'

interface PreviewPaneProps {
  sheet: Sheet
  options: CalcOptions
  onOptionsChange: (options: CalcOptions) => void
  /** The editor's cursor line; its output is highlighted. */
  activeLine: number | null
  /** Clicking output moves the editor cursor to that source line. */
  onJump: (line: number) => void
  /** The sheet's file name, for the downloaded .tex file. */
  fileName: string
}

export function PreviewPane({
  sheet, options, onOptionsChange, activeLine, onJump, fileName,
}: PreviewPaneProps) {
  const [tab, setTab] = useState<Tab>('rendered')
  const [copied, setCopied] = useState(false)
  const [latexOptions, setLatexOptions] = useState<LatexOptions>(loadLatexOptions)
  const changeLatexOptions = (o: LatexOptions) => {
    setLatexOptions(o)
    saveLatexOptions(o)
  }
  const latexSource = useMemo(() => toLatexDocument(sheet.blocks, latexOptions), [sheet.blocks, latexOptions])
  const downloadTex = () => downloadFile(fileName.replace(/\.[^.]*$/, '') + '.tex', latexSource)
  const docRef = useRef<HTMLDivElement>(null)
  const link = useMemo(() => ({ activeLine, onJump }), [activeLine, onJump])

  // Keep the output for the cursor's line in view.
  useEffect(() => {
    docRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeLine, tab])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(latexSource)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <section className="pane">
      <header className="pane__header">
        <h2>Output</h2>
        <div className="toolbar">
          {/* The Reference tab uses fixed settings, so the options don't apply there. */}
          <OptionsMenu options={options} onChange={onOptionsChange} hidden={tab === 'reference'} />
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'rendered'} onClick={() => setTab('rendered')}>
              Rendered
            </button>
            <button role="tab" aria-selected={tab === 'latex'} onClick={() => setTab('latex')}>
              LaTeX
            </button>
            <button role="tab" aria-selected={tab === 'reference'} onClick={() => setTab('reference')}>
              Reference
            </button>
          </div>
        </div>
      </header>
      {tab === 'reference' ? (
        <ReferencePane />
      ) : tab === 'rendered' ? (
        <div className="doc" ref={docRef}>
          <LineLink.Provider value={link}>
            {sheet.blocks.length === 0
              ? <p className="doc__empty">Start typing on the left.</p>
              : sheet.blocks.map((b) => <RenderedBlock key={`${b.line}-${b.kind}`} block={b} />)}
          </LineLink.Provider>
        </div>
      ) : (
        <div className="source">
          <div className="source__bar">
            <LatexOptionsMenu options={latexOptions} onChange={changeLatexOptions} />
            <button className="source__button" onClick={downloadTex} title="Download the LaTeX as a .tex file">
              Download .tex
            </button>
            <button className="source__button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <pre>{latexSource}</pre>
        </div>
      )}
    </section>
  )
}
