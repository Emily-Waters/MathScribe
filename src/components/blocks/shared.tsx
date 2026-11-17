/**
 * What every block's view draws with: LaTeX, text with its markup, and a
 * line's messages. (What the Output pane gives them is in context.ts.)
 */
import { useContext, useMemo } from 'react'
import { LineNumbers } from './context.ts'
import katex from '../../lib/output/katex.ts'
import { TITLE_SEGMENT, titleSegments } from '../../lib/output/textSegments.ts'
import { DIAGNOSTIC_KIND, type DiagnosticKind } from '../../lib/sheet/sheetIndex.ts'

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

/** A heading, block title, note or line of text, with `p_z` subscripts and `$…$` maths. */
export function Title({ text }: { text: string }) {
  return (
    <>
      {titleSegments(text).map((s, i) => (s.kind === TITLE_SEGMENT.math
        ? <Tex key={i} latex={s.value} />
        : s.kind === TITLE_SEGMENT.sub ? <sub key={i}>{s.value}</sub> : <span key={i}>{s.value}</span>))}
    </>
  )
}

/**
 * A message about a line, "Line 12: …", numbered as the editor shows it. A
 * message that names a line itself (a function body's) gives that line.
 */
export function LineMessage({ kind, line, text }: { kind: DiagnosticKind; line: number; text: string }) {
  const shown = useContext(LineNumbers)
  const own = /^Line (\d+): ([\s\S]*)$/.exec(text)
  return <p className={`calc__msg calc__msg--${kind}`}>Line {shown(own ? Number(own[1]) : line)}: {own ? own[2] : text}</p>
}

/** A block's error and warning, under it. */
export function BlockMessages({ line, error, warning }: { line: number; error?: string; warning?: string }) {
  return (
    <>
      {error && <LineMessage kind={DIAGNOSTIC_KIND.error} line={line} text={error} />}
      {warning && <LineMessage kind={DIAGNOSTIC_KIND.warning} line={line} text={warning} />}
    </>
  )
}
