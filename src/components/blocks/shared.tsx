/**
 * What every block's view draws with: LaTeX, text with its markup, and a
 * line's messages. (What the Output pane gives them is in context.ts.)
 */
import { Fragment, useContext, useMemo } from 'react'
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

/** Maths set bold, as in bold text (KaTeX's maths doesn't take the text's weight). */
const boldMaths = (tex: string) => `\\boldsymbol{${tex}}`

/**
 * A heading, block title, note or line of text, with `p_z` subscripts, `$…$`
 * maths, `**bold**` or `*italic*` emphasis and links; `bold`, its maths bold
 * too (in bold text), as is maths in bold emphasis.
 */
export function Title({ text, bold = false }: { text: string; bold?: boolean }) {
  return (
    <>
      {titleSegments(text).map((s, i) => {
        const piece = s.kind === TITLE_SEGMENT.math
          ? <Tex latex={bold || s.bold ? boldMaths(s.value) : s.value} />
          : s.kind === TITLE_SEGMENT.sub ? <sub>{s.value}</sub> : <span>{s.value}</span>
        const italic = s.italic ? <em>{piece}</em> : piece
        const emphasised = s.bold ? <strong>{italic}</strong> : italic
        // (Only web and mail addresses make a link: see TEXT_LINK.)
        return <Fragment key={i}>{s.href === undefined ? emphasised : <a href={s.href} target="_blank" rel="noreferrer">{emphasised}</a>}</Fragment>
      })}
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
