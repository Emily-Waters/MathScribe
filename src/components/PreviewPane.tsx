import katex from '../lib/katex.ts'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  DIAGNOSTIC_KIND, TITLE_SEGMENT, lineNumbering, listItems, splitInlineMath, titleSegments, type DiagnosticKind, type Sheet,
} from '../lib/document.ts'
import { BLOCK_KIND, isContainer, type Block, type ImportBlock } from '../lib/blocks.ts'
import { LAYOUT_STYLE, LINE_COMMAND } from '../lib/syntax.ts'
import { loadLatexOptions, saveLatexOptions, toLatexDocument, type LatexOptions } from '../lib/latex.ts'
import { symbolTex, unitTex, type CalcOptions } from '../lib/engine.ts'
import { THEME_PALETTE, plotSvg, type PlotData } from '../lib/plot.ts'
import { ReferencePane } from './ReferencePane.tsx'
import { OptionsMenu } from './OptionsMenu.tsx'
import { LatexOptionsMenu } from './LatexOptionsMenu.tsx'
import { LibraryPane } from './LibraryPane.tsx'
import { downloadFile, splitExtension } from '../lib/files.ts'
import { copyText, useFlash } from '../useFlash.ts'

/** LaTeX as KaTeX HTML; a mistake shows in red rather than failing. */
const render = (latex: string, displayMode: boolean) =>
  katex.renderToString(latex, { displayMode, throwOnError: false, strict: 'ignore' })

/** LaTeX typeset inline, or as a display (its own centred line). */
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
      {titleSegments(text).map((s, i) => (s.kind === TITLE_SEGMENT.math
        ? <Tex key={i} latex={s.value} />
        : s.kind === TITLE_SEGMENT.sub ? <sub key={i}>{s.value}</sub> : <span key={i}>{s.value}</span>))}
    </>
  )
}

/** Whether a block or anything inside it has an error (so a hidden block still shows it). */
const hasError = (b: Block): boolean =>
  ((b.kind === BLOCK_KIND.calc || b.kind === BLOCK_KIND.function || b.kind === BLOCK_KIND.import) && !!b.error)
  || (b.kind === BLOCK_KIND.constants && (!!b.error || b.entries.some((e) => e.error)))
  || (isContainer(b) && (!!b.error || b.children.some(hasError)))

/** Linking between output and source lines: which line the cursor is on, and how to jump to one. */
const LineLink = createContext<{ activeLine: number | null; onJump: (line: number) => void }>({
  activeLine: null,
  onJump: () => {},
})

/** A `plot(…)` line's plot, drawn in the app's colours (it follows the theme). */
function PlotView({ plot }: { plot: PlotData }) {
  const svg = useMemo(() => plotSvg(plot, THEME_PALETTE), [plot])
  return <div className="plot" dangerouslySetInnerHTML={{ __html: svg }} />
}

/** Line numbers as the editor shows them, for messages (an import's data rows count as part of its line). */
const LineNumbers = createContext<(line: number) => number>((line) => line)

/**
 * A message about a line, "Line 12: …", numbered as the editor shows it. A
 * message that names a line itself (a function body's) gives that line.
 */
function LineMessage({ kind, line, text }: { kind: DiagnosticKind; line: number; text: string }) {
  const shown = useContext(LineNumbers)
  const own = /^Line (\d+): ([\s\S]*)$/.exec(text)
  return <p className={`calc__msg calc__msg--${kind}`}>Line {shown(own ? Number(own[1]) : line)}: {own ? own[2] : text}</p>
}

/** Removing an import and its data (the Remove button on its summary). */
const ImportFile = createContext<((line: number) => void) | undefined>(undefined)

/**
 * An import's summary, in place of its rows: the file, and for each column the
 * variables it made and the range of its values. A button chooses the file
 * (or another one).
 */
function ImportSummary({ block }: { block: ImportBlock }) {
  const link = useLineLink()
  const removeImport = useContext(ImportFile)
  const remove = (e: MouseEvent) => {
    e.stopPropagation()
    removeImport?.(block.line)
  }
  const loaded = block.columns.length > 0
  return (
    <section className={`group group--import${block.error ? ' group--error' : ''}`}>
      <header className="group__header" {...link(block.line)}>
        <span className="group__title">
          <span className="group__kind">Data</span>
          {block.file ?? 'no file chosen yet: choose one in the import line'}
          {block.name && <span className="import__rows"> as <strong>{block.name}</strong></span>}
          {loaded && <span className="import__rows"> · {block.rows} row{block.rows === 1 ? '' : 's'}</span>}
        </span>
        {block.note && <span className="calc__note">{block.note}</span>}
        {removeImport && (
          <span className="import__actions">
            <button className="import__choose" onClick={remove} title="Remove this import and its data from the sheet">Remove</button>
          </span>
        )}
      </header>
      {loaded && (
        <table className="import__columns" {...link(block.line)}>
          <tbody>
            {block.columns.map((c) => (
              <tr key={c.name}>
                <td>
                  <Tex latex={symbolTex(c.name)} />{c.unit && <> <Tex latex={`\\left[${unitTex(c.unit)}\\right]`} /></>}
                  {c.uncertainty && <span className="import__unc" title={`Each value's uncertainty is in column ${c.uncertainty}`}> ± {c.uncertainty}</span>}
                </td>
                <td>{c.count
                  ? <Tex latex={c.count === 1 ? symbolTex(`${c.name}_${c.first}`) : `${symbolTex(`${c.name}_${c.first}`)} \\ldots ${symbolTex(`${c.name}_${c.last}`)}`} />
                  : 'no values'}</td>
                <td>{c.min !== undefined && <Tex latex={c.min === c.max ? c.min : `${c.min} \\text{ to } ${c.max}`} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {block.error && <LineMessage kind={DIAGNOSTIC_KIND.error} line={block.line} text={block.error} />}
    </section>
  )
}

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

/** One block of the sheet as it appears in the Rendered tab. */
export function RenderedBlock({ block }: { block: Block }) {
  const link = useLineLink()
  switch (block.kind) {
    case BLOCK_KIND.heading: {
      const number = block.number && <span className="doc__heading-number">{block.number}</span>
      const text = <Title text={block.text} />
      // (A value in it that couldn't be worked out is explained under it.)
      const error = block.error && <LineMessage kind={DIAGNOSTIC_KIND.error} line={block.line} text={block.error} />
      if (block.level === 1) return <>{<h3 className="doc__heading doc__heading--section" {...link(block.line)}>{number}{text}</h3>}{error}</>
      if (block.level === 2) return <>{<h4 className="doc__heading doc__heading--subsection" {...link(block.line)}>{number}{text}</h4>}{error}</>
      return <><p className="doc__heading doc__heading--bold" {...link(block.line)}>{text}</p>{error}</>
    }
    case BLOCK_KIND.text:
      return (
        <>
          <p className="doc__text" {...link(block.line)}>
            {splitInlineMath(block.text).map((seg, i) =>
              seg.math ? <Tex key={i} latex={seg.value} /> : <span key={i}>{seg.value}</span>,
            )}
          </p>
          {block.error && <LineMessage kind={DIAGNOSTIC_KIND.error} line={block.line} text={block.error} />}
        </>
      )
    case BLOCK_KIND.latex:
      return <div className="calc" {...link(block.line)}><Tex latex={block.latex} display /></div>
    case BLOCK_KIND.spacer:
      return <div className="doc__spacer" aria-hidden="true" />
    case BLOCK_KIND.constants:
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
                {e.error && <LineMessage kind={DIAGNOSTIC_KIND.error} line={e.line} text={e.error} />}
                {e.warning && <LineMessage kind={DIAGNOSTIC_KIND.warning} line={e.line} text={e.warning} />}
                {e.info && <p className="calc__msg calc__msg--info">{e.info}</p>}
              </div>
            ))}
          </div>
          {block.error && <p className="calc__msg calc__msg--error">{block.error}</p>}
        </section>
      )
    case BLOCK_KIND.import:
      if (block.hidden && !block.error) return null
      return <ImportSummary block={block} />
    case BLOCK_KIND.calc:
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
          {block.plot && <PlotView plot={block.plot} />}
          {(block.tex || !block.plot) && (
            <div className="calc__row">
              {block.tex
                ? <Tex latex={block.tex} display />
                : <code className="calc__source">{block.source}</code>}
              {block.note && <span className="calc__note">{block.note}</span>}
            </div>
          )}
          {block.error && <LineMessage kind={DIAGNOSTIC_KIND.error} line={block.line} text={block.error} />}
          {block.warning && <LineMessage kind={DIAGNOSTIC_KIND.warning} line={block.line} text={block.warning} />}
          {block.info && (
            <p className="calc__msg calc__msg--info">
              {splitInlineMath(block.info).map((seg, i) =>
                seg.math ? <Tex key={i} latex={seg.value} /> : <span key={i}>{seg.value}</span>)}
            </p>
          )}
        </div>
      )
    case BLOCK_KIND.function:
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
          {block.error && <LineMessage kind={DIAGNOSTIC_KIND.error} line={block.line} text={block.error} />}
        </section>
      )
    case BLOCK_KIND.layout: {
      if (block.command === LINE_COMMAND.hide && !hasError(block)) return null
      const title = (block.title || block.note) && (
        <p className="layout__title" {...link(block.line)}>
          <Title text={block.title} />
          {block.note && <span className="calc__note">{block.note}</span>}
        </p>
      )
      const error = block.error && <LineMessage kind={DIAGNOSTIC_KIND.error} line={block.line} text={block.error} />
      if (block.style === LAYOUT_STYLE.list || block.style === LAYOUT_STYLE.numbered) {
        const List = block.style === LAYOUT_STYLE.numbered ? 'ol' : 'ul'
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
    case BLOCK_KIND.group:
      if (block.command === LINE_COMMAND.hide && !hasError(block)) return null
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
        </section>
      )
  }
}

/** The Output pane’s tabs. */
type Tab = 'rendered' | 'latex' | 'library' | 'reference'

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
  /** The sheet's file name, for the downloaded .tex file. */
  fileName: string
  /** Put text into the sheet at the editor's cursor (from the Library tab). */
  onInsert: (text: string) => void
  /** Remove the `import(…)` on a line, and its data. */
  onRemoveImport: (line: number) => void
}

/** The Output pane: the rendered sheet, its LaTeX (and Word) export, the equation library and the reference. */
export function PreviewPane({
  sheet, options, onOptionsChange, activeLine, centerRequest, onJump, fileName, onInsert, onRemoveImport,
}: PreviewPaneProps) {
  const [tab, setTab] = useState<Tab>('rendered')
  const [flash, showFlash] = useFlash<'latex'>()
  const [latexOptions, setLatexOptions] = useState<LatexOptions>(loadLatexOptions)
  const changeLatexOptions = (o: LatexOptions) => {
    setLatexOptions(o)
    saveLatexOptions(o)
  }
  const latexSource = useMemo(() => toLatexDocument(sheet.blocks, latexOptions), [sheet.blocks, latexOptions])
  const { stem: baseName } = splitExtension(fileName)
  const downloadTex = () => downloadFile(`${baseName}.tex`, latexSource)
  // The Word writer loads only when it's first used.
  const downloadDocx = async () => {
    const [{ toDocx, DOCX_TYPE }, { plotImages }] = await Promise.all([import('../lib/docx.ts'), import('../lib/plotImage.ts')])
    const images = await plotImages(sheet.blocks)
    downloadFile(`${baseName}.docx`, toDocx(sheet.blocks, latexOptions, images) as Uint8Array<ArrayBuffer>, DOCX_TYPE)
  }
  const docRef = useRef<HTMLDivElement>(null)
  const link = useMemo(() => ({ activeLine, onJump }), [activeLine, onJump])
  const numbering = useMemo(() => lineNumbering(sheet.blocks), [sheet.blocks])

  // Keep the output for the cursor's line in view: centred after a click in the
  // editor; while typing or moving with the keys, scrolled only as far as needed.
  const centered = useRef(centerRequest)
  useEffect(() => {
    const block: ScrollLogicalPosition = centered.current === centerRequest ? 'nearest' : 'center'
    centered.current = centerRequest
    docRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block })
  }, [activeLine, centerRequest, tab])

  const copy = async () => {
    if (await copyText(latexSource)) showFlash('latex', 'Copied')
  }

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
            <button role="tab" aria-selected={tab === 'latex'} onClick={() => setTab('latex')}>
              LaTeX
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
      ) : tab === 'rendered' ? (
        <div className="doc" ref={docRef}>
          <LineLink.Provider value={link}>
          <LineNumbers.Provider value={numbering}>
          <ImportFile.Provider value={onRemoveImport}>
            {sheet.blocks.length === 0
              ? <p className="doc__empty">Start typing on the left.</p>
              : sheet.blocks.map((b) => <RenderedBlock key={`${b.line}-${b.kind}`} block={b} />)}
          </ImportFile.Provider>
          </LineNumbers.Provider>
          </LineLink.Provider>
        </div>
      ) : (
        <div className="source">
          <div className="source__bar">
            <LatexOptionsMenu options={latexOptions} onChange={changeLatexOptions} />
            <button className="source__button" onClick={downloadTex} title="Download the LaTeX as a .tex file">
              Download .tex
            </button>
            <button className="source__button" onClick={downloadDocx}
              title="Download a Word document with editable equations (opens in Google Docs too)">
              Download .docx
            </button>
            <button className="source__button" onClick={copy}>{flash?.message ?? 'Copy'}</button>
          </div>
          <pre>{latexSource}</pre>
        </div>
      )}
    </section>
  )
}
