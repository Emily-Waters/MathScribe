/** Words in display names and text, as LaTeX. */
import { SUBSCRIPT_BASE, TEXT_SUBSCRIPT, subscriptOf, unescapeUnderscores } from '../../syntax.ts'
import { formulaTex, isFormulaSubscript } from '../../chemistry.ts'

/** Words as upright LaTeX text, `\_` as a plain underscore. */
export const plainTextTex = (text: string) => (text ? `\\text{${escapeText(unescapeUnderscores(text))}}` : '')

/** A subscript in words as LaTeX: a formula (`H2O`) as chemistry, anything else as upright text. */
export const subscriptTex = (subscript: string) => (isFormulaSubscript(subscript) ? formulaTex(subscript) : plainTextTex(subscript))

/**
 * Words in a display name as LaTeX, with subscripts as in names and headings:
 * `Mass of m_ball` → \text{Mass of }\text{m}_{\text{ball}}, `F_net_x` → F with
 * net,x below (the subscript is attached to the letters right before it), and
 * `m_{H2O}` → m with H₂O below, drawn as chemistry.
 */
export function wordsTex(text: string): string {
  let out = ''
  let last = 0
  /** The subscripts of the word being written, joined with commas when there are several. */
  let subs: string[] = []
  const endSubs = () => {
    if (subs.length) out += `_{${subs.map(subscriptTex).join(',')}}`
    subs = []
  }
  for (const m of text.matchAll(TEXT_SUBSCRIPT)) {
    const between = text.slice(last, m.index)
    if (between || !subs.length) {
      endSubs()
      const base = SUBSCRIPT_BASE.exec(between)?.[0] ?? ''
      out += plainTextTex(between.slice(0, between.length - base.length)) + plainTextTex(base)
    }
    subs.push(subscriptOf(m[1]))
    last = m.index + m[0].length
  }
  endSubs()
  return out + plainTextTex(text.slice(last))
}

/** LaTeX's special characters, escaped for `\text{…}` (a display name's words). */
export const TEXT_ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', $: '\\$', '&': '\\&', '#': '\\#', '%': '\\%', _: '\\_', '^': '\\^{}', '~': '\\~{}',
}
export const escapeText = (s: string) => s.replace(/[\\{}$&#%_^~]/g, (c) => TEXT_ESCAPES[c])
