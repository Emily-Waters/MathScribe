/**
 * The views of single lines of a sheet in the Rendered tab: headings, prose,
 * raw LaTeX, gaps, and calculations (the app's side of lib/output/constructs/lines.ts).
 */
import { useMemo } from 'react'
import type { CalcBlock, HeadingBlock, LatexBlock, TextBlock } from '../../lib/sheet/blocks.ts'
import { splitInlineMath } from '../../lib/syntax.ts'
import { THEME_PALETTE, plotSvg, type PlotData } from '../../lib/output/plot.ts'
import { BlockMessages, Tex, Title } from './shared.tsx'
import { useLineLink } from './context.ts'

/** `# Title`: a section, subsection or bold heading, numbered as in the exports. */
export function HeadingView({ block }: { block: HeadingBlock }) {
  const link = useLineLink()
  const number = block.number && <span className="doc__heading-number">{block.number}</span>
  const text = <Title text={block.text} />
  // (A value in it that couldn't be worked out is explained under it.)
  const error = <BlockMessages line={block.line} error={block.error} />
  if (block.level === 1) return <><h3 className="doc__heading doc__heading--section" {...link(block.line)}>{number}{text}</h3>{error}</>
  if (block.level === 2) return <><h4 className="doc__heading doc__heading--subsection" {...link(block.line)}>{number}{text}</h4>{error}</>
  return <><p className="doc__heading doc__heading--bold" {...link(block.line)}>{text}</p>{error}</>
}

/** Prose, with `$…$` maths. */
export function TextView({ block }: { block: TextBlock }) {
  const link = useLineLink()
  return (
    <>
      <p className="doc__text" {...link(block.line)}>
        <Title text={block.text} />
      </p>
      <BlockMessages line={block.line} error={block.error} />
    </>
  )
}

/** `@latex { … }`, or a reaction: displayed LaTeX. */
export function LatexView({ block }: { block: LatexBlock }) {
  const link = useLineLink()
  return (
    <div className="calc" {...link(block.line)}>
      {block.latex && <Tex latex={block.latex} display />}
      <BlockMessages line={block.line} error={block.error} />
    </div>
  )
}

/** A gap of one line. */
export function SpacerView() {
  return <div className="doc__spacer" aria-hidden="true" />
}

/** A `@plot(…)` line's plot, drawn in the app's colours (it follows the theme). */
function PlotView({ plot }: { plot: PlotData }) {
  const svg = useMemo(() => plotSvg(plot, THEME_PALETTE), [plot])
  return <div className="plot" dangerouslySetInnerHTML={{ __html: svg }} />
}

/** A calculation: the working inside function calls, a plot, its equation, and anything to say about it. */
export function CalcView({ block }: { block: CalcBlock }) {
  const link = useLineLink()
  // `#hide` lines stay hidden unless something went wrong.
  if (block.hidden && !block.error) return null
  return (
    <div className={`calc${block.error ? ' calc--error' : ''}`} {...link(block.line)}>
      {block.trace && (
        <div className="calc__trace" title="Working inside the function">
          {block.trace.map((t, i) => (
            <div className="calc__row" key={i}>
              <Tex latex={t.tex} display />
              {t.note && <span className="calc__note"><Title text={t.note} /></span>}
            </div>
          ))}
        </div>
      )}
      {block.plot && <PlotView plot={block.plot} />}
      {(block.tex || !block.plot) && (
        // (A plot's fit equations are centred under it, as the plot is.)
        <div className={`calc__row${block.plot ? ' calc__row--centred' : ''}`}>
          {block.tex
            ? <Tex latex={block.tex} display />
            : <code className="calc__source">{block.source}</code>}
          {block.note && <span className="calc__note"><Title text={block.note} /></span>}
        </div>
      )}
      <BlockMessages line={block.line} error={block.error} warning={block.warning} />
      {block.info && (
        <p className="calc__msg calc__msg--info">
          {splitInlineMath(block.info).map((seg, i) =>
            seg.math ? <Tex key={i} latex={seg.value} /> : <span key={i}>{seg.value}</span>)}
        </p>
      )}
    </div>
  )
}
