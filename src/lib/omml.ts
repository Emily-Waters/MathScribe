/**
 * LaTeX → OMML (Office Math Markup Language), the XML Word keeps its equations
 * in, so the Word export has real, editable equations rather than pictures.
 *
 * KaTeX turns the LaTeX into MathML; this turns that MathML into OMML. It
 * covers what MathScribe's output uses (fractions, powers and subscripts,
 * roots, brackets, accents, sums, aligned rows, units in upright text), and
 * falls back to plain runs of text for anything else.
 */
import katex from 'katex'

// ---------------------------------------------------------------------------
// A small XML reader, enough for KaTeX's MathML (no DOM needed, so it runs in tests too)
// ---------------------------------------------------------------------------

export interface XmlNode {
  tag: string
  attrs: Record<string, string>
  children: XmlNode[]
  /** Text content, for the text nodes (tag '#text'). */
  text?: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    return ENTITIES[e] ?? m
  })
}

/** Parse well-formed XML into a tree; throws on a mismatched tag. Returns a root holding the top-level nodes. */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: '#root', attrs: {}, children: [] }
  const stack = [root]
  const token = /<\?[^>]*\?>|<!--[\s\S]*?-->|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g
  for (const m of xml.matchAll(token)) {
    const [, close, tag, attrText, selfClose, text] = m
    const top = stack[stack.length - 1]
    if (text !== undefined) {
      top.children.push({ tag: '#text', attrs: {}, children: [], text: decode(text) })
    } else if (close) {
      if (top.tag !== tag) throw new Error(`Mismatched </${tag}> (expected </${top.tag}>)`)
      stack.pop()
    } else if (tag) {
      const attrs: Record<string, string> = {}
      for (const a of (attrText ?? '').matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = decode(a[2])
      const node: XmlNode = { tag, attrs, children: [] }
      top.children.push(node)
      if (!selfClose) stack.push(node)
    }
  }
  if (stack.length !== 1) throw new Error(`Unclosed <${stack[stack.length - 1].tag}>`)
  return root
}

// ---------------------------------------------------------------------------
// MathML → OMML
// ---------------------------------------------------------------------------

/** Escape text for XML. */
export const xmlEscape = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    // Characters XML can't hold at all.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

/** How a run of maths is set: italic (a variable), upright, bold, or ordinary text. */
type RunStyle = 'i' | 'p' | 'b' | 'text'

/** Output so far: runs (merged with their neighbours when styled alike) and finished XML. */
type Piece = { run: string; style: RunStyle } | { xml: string }

interface Ctx {
  /** Font size for every run, in half-points (the working is set smaller). */
  size?: number
}

/** Accents on a letter (`\hat x`): KaTeX's character → the combining character Word uses. */
const ACCENTS: Record<string, string> = {
  '^': '̂', 'ˆ': '̂', '~': '̃', '˜': '̃', '˙': '̇', '¨': '̈',
  '→': '⃗', '⃗': '⃗', 'ˇ': '̌', '´': '́', '`': '̀',
}
const BARS = new Set(['ˉ', '¯', '‾', '_', '̅'])

/** Big operators that take limits and a body: ∑ᵢ tᵢ. */
const NARY = new Set(['∑', '∏', '∐', '∫', '∬', '∭', '∮', '⋃', '⋂', '⋁', '⋀'])

const textOf = (n: XmlNode): string => (n.tag === '#text' ? n.text ?? '' : n.children.map(textOf).join(''))
const elements = (n: XmlNode) => n.children.filter((c) => c.tag !== '#text')

function runXml(text: string, style: RunStyle, ctx: Ctx): string {
  const mrPr = style === 'text' ? '<m:rPr><m:nor/></m:rPr>'
    : style === 'p' ? '<m:rPr><m:sty m:val="p"/></m:rPr>'
      : style === 'b' ? '<m:rPr><m:sty m:val="b"/></m:rPr>'
        : ''
  const wrPr = ctx.size ? `<w:rPr><w:sz w:val="${ctx.size}"/><w:szCs w:val="${ctx.size}"/></w:rPr>` : ''
  return `<m:r>${mrPr}${wrPr}<m:t xml:space="preserve">${xmlEscape(text)}</m:t></m:r>`
}

/** Join pieces into XML, merging neighbouring runs of the same style (k, g → kg). */
function render(pieces: Piece[], ctx: Ctx): string {
  let out = ''
  let pending: { run: string; style: RunStyle } | null = null
  const flush = () => {
    if (pending) out += runXml(pending.run, pending.style, ctx)
    pending = null
  }
  for (const p of pieces) {
    if ('xml' in p) {
      flush()
      out += p.xml
    } else if (pending && pending.style === p.style) {
      pending.run += p.run
    } else {
      flush()
      pending = { ...p }
    }
  }
  flush()
  return out
}

/** OMML for a node, as an argument (`<m:e>` and friends need some content). */
const arg = (n: XmlNode | undefined, ctx: Ctx) => (n ? render(convert(n, ctx), ctx) : '')

/** The operator character of a big-operator base (∑), if it is one. */
function naryChar(n: XmlNode): string | null {
  const base = ['msubsup', 'munderover', 'msub', 'munder', 'msup', 'mover'].includes(n.tag) ? elements(n)[0] : n
  if (base?.tag !== 'mo') return null
  const c = textOf(base).trim()
  return NARY.has(c) ? c : null
}

/** `∑_{i=1}^{n} tᵢ`: the operator with its limits, and the next item as its body. */
function nary(op: XmlNode, body: XmlNode | undefined, ctx: Ctx): string {
  const chr = naryChar(op)!
  const kids = elements(op)
  let sub: XmlNode | undefined
  let sup: XmlNode | undefined
  if (op.tag === 'msubsup' || op.tag === 'munderover') [, sub, sup] = kids
  else if (op.tag === 'msub' || op.tag === 'munder') [, sub] = kids
  else if (op.tag === 'msup' || op.tag === 'mover') [, sup] = kids
  const limLoc = op.tag.startsWith('mu') || op.tag === 'mover' ? 'undOvr' : 'subSup'
  return `<m:nary><m:naryPr><m:chr m:val="${xmlEscape(chr)}"/><m:limLoc m:val="${limLoc}"/>`
    + `${sub ? '' : '<m:subHide m:val="1"/>'}${sup ? '' : '<m:supHide m:val="1"/>'}</m:naryPr>`
    + `<m:sub>${arg(sub, ctx)}</m:sub><m:sup>${arg(sup, ctx)}</m:sup><m:e>${arg(body, ctx)}</m:e></m:nary>`
}

/** A row of nodes, with brackets and big operators picked out. */
function sequence(nodes: XmlNode[], ctx: Ctx): Piece[] {
  const kids = nodes.filter((c) => c.tag !== '#text' && c.tag !== 'annotation')
  // \left( … \right): one bracket pair that grows with what's inside.
  const first = kids[0]
  const last = kids[kids.length - 1]
  if (kids.length >= 2 && first.tag === 'mo' && last.tag === 'mo' && first.attrs.fence === 'true' && last.attrs.fence === 'true') {
    const inner = render(sequence(kids.slice(1, -1), ctx), ctx)
    const beg = textOf(first).trim()
    const end = textOf(last).trim()
    return [{
      xml: `<m:d><m:dPr><m:begChr m:val="${xmlEscape(beg)}"/><m:endChr m:val="${xmlEscape(end)}"/></m:dPr>`
        + `<m:e>${inner}</m:e></m:d>`,
    }]
  }
  const out: Piece[] = []
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i]
    if (naryChar(k)) {
      out.push({ xml: nary(k, kids[i + 1], ctx) })
      i++
      continue
    }
    out.push(...convert(k, ctx))
  }
  return out
}

function convert(n: XmlNode, ctx: Ctx): Piece[] {
  const kids = elements(n)
  const a = (i: number) => arg(kids[i], ctx)
  switch (n.tag) {
    case 'mi': {
      const t = textOf(n)
      const v = n.attrs.mathvariant
      // A single letter is a variable (italic); \mathrm and names like sin are upright.
      const style: RunStyle = v === 'bold' || v === 'bold-italic' ? 'b' : v === 'normal' || [...t].length > 1 ? 'p' : 'i'
      return [{ run: t, style }]
    }
    case 'mn':
      return [{ run: textOf(n), style: 'p' }]
    case 'mo': {
      // Function application (sin⁡x) is invisible.
      const t = textOf(n).replace(/⁡/g, '')
      return t ? [{ run: t, style: 'p' }] : []
    }
    case 'mtext':
      return [{ run: textOf(n), style: 'text' }]
    case 'mspace': {
      const em = parseFloat(n.attrs.width ?? '0')
      return em > 0 ? [{ run: em >= 0.9 ? ' ' : ' ', style: 'text' }] : []
    }
    case 'mfrac': {
      const noBar = n.attrs.linethickness !== undefined && parseFloat(n.attrs.linethickness) === 0
      return [{
        xml: `<m:f>${noBar ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : ''}<m:num>${a(0)}</m:num><m:den>${a(1)}</m:den></m:f>`,
      }]
    }
    case 'msqrt':
      return [{
        xml: `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${render(sequence(n.children, ctx), ctx)}</m:e></m:rad>`,
      }]
    case 'mroot':
      return [{ xml: `<m:rad><m:deg>${a(1)}</m:deg><m:e>${a(0)}</m:e></m:rad>` }]
    case 'msup':
      return [{ xml: `<m:sSup><m:e>${a(0)}</m:e><m:sup>${a(1)}</m:sup></m:sSup>` }]
    case 'msub':
      return [{ xml: `<m:sSub><m:e>${a(0)}</m:e><m:sub>${a(1)}</m:sub></m:sSub>` }]
    case 'msubsup':
      return [{ xml: `<m:sSubSup><m:e>${a(0)}</m:e><m:sub>${a(1)}</m:sub><m:sup>${a(2)}</m:sup></m:sSubSup>` }]
    case 'mover': {
      const mark = kids[1] ? textOf(kids[1]).trim() : ''
      if (n.attrs.accent === 'true' && BARS.has(mark)) {
        return [{ xml: `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${a(0)}</m:e></m:bar>` }]
      }
      if (n.attrs.accent === 'true' && [...mark].length === 1) {
        return [{ xml: `<m:acc><m:accPr><m:chr m:val="${xmlEscape(ACCENTS[mark] ?? mark)}"/></m:accPr><m:e>${a(0)}</m:e></m:acc>` }]
      }
      return [{ xml: `<m:limUpp><m:e>${a(0)}</m:e><m:lim>${a(1)}</m:lim></m:limUpp>` }]
    }
    case 'munder':
      return [{ xml: `<m:limLow><m:e>${a(0)}</m:e><m:lim>${a(1)}</m:lim></m:limLow>` }]
    case 'munderover':
      return [{
        xml: `<m:limUpp><m:e><m:limLow><m:e>${a(0)}</m:e><m:lim>${a(1)}</m:lim></m:limLow></m:e><m:lim>${a(2)}</m:lim></m:limUpp>`,
      }]
    case 'mtable':
      return [{ xml: table(n, ctx) }]
    case 'annotation':
    case 'mphantom':
      return []
    default:
      // math, semantics, mrow, mstyle, mpadded, menclose, …: just their contents.
      return sequence(n.children, ctx)
  }
}

/**
 * `aligned` rows (#multiline) as a matrix whose columns are justified like the
 * LaTeX (right, then left), so the = signs line up.
 */
function table(n: XmlNode, ctx: Ctx): string {
  const rows = elements(n).filter((r) => r.tag === 'mtr' || r.tag === 'mlabeledtr')
  const cols = Math.max(1, ...rows.map((r) => elements(r).length))
  const aligns = (n.attrs.columnalign ?? '').split(/\s+/).filter(Boolean)
  const jc = (i: number) => {
    const al = aligns[Math.min(i, aligns.length - 1)] ?? 'center'
    return al === 'right' ? 'right' : al === 'left' ? 'left' : 'center'
  }
  const mcs = Array.from({ length: cols }, (_, i) =>
    `<m:mc><m:mcPr><m:count m:val="1"/><m:mcJc m:val="${jc(i)}"/></m:mcPr></m:mc>`).join('')
  const body = rows.map((r) => {
    const cells = elements(r)
    const es = Array.from({ length: cols }, (_, i) => `<m:e>${cells[i] ? render(sequence(cells[i].children, ctx), ctx) : ''}</m:e>`)
    return `<m:mr>${es.join('')}</m:mr>`
  }).join('')
  return `<m:m><m:mPr><m:plcHide m:val="1"/><m:cGpRule m:val="0"/><m:mcs>${mcs}</m:mcs></m:mPr>${body}</m:m>`
}

// ---------------------------------------------------------------------------
// Width, roughly
// ---------------------------------------------------------------------------

const WIDE_OPERATORS = new Set(['=', '+', '−', '-', '±', '≈', '→', '<', '>', '≤', '≥'])

/**
 * Roughly how wide a node is when displayed, in ems: enough to tell whether an
 * equation fits beside its note.
 */
function width(n: XmlNode): number {
  const kids = elements(n)
  const sum = (ns: XmlNode[]) => ns.reduce((w, c) => w + width(c), 0)
  switch (n.tag) {
    case 'mi':
    case 'mn':
      return [...textOf(n)].length * 0.55
    case 'mo': {
      const t = textOf(n).replace(/⁡/g, '')
      return WIDE_OPERATORS.has(t) ? 1.2 : [...t].length * 0.6
    }
    case 'mtext':
      return [...textOf(n)].reduce((w, c) => w + (/\s/.test(c) ? 0.2 : 0.5), 0)
    case 'mspace':
      return parseFloat(n.attrs.width ?? '0') || 0
    case 'mfrac':
      return Math.max(width(kids[0]), width(kids[1])) + 0.3
    case 'msqrt':
      return sum(kids) + 1
    case 'mroot':
      return width(kids[0]) + 1.3
    case 'msup':
    case 'msub':
      return width(kids[0]) + 0.7 * width(kids[1])
    case 'msubsup':
      return width(kids[0]) + 0.7 * Math.max(width(kids[1]), width(kids[2]))
    case 'mover':
    case 'munder':
      return Math.max(width(kids[0]), 0.7 * width(kids[1]))
    case 'munderover':
      return Math.max(width(kids[0]), 0.7 * width(kids[1]), 0.7 * width(kids[2]))
    case 'mtable':
      return Math.max(0, ...kids.map((row) => sum(elements(row))))
    case 'annotation':
    case 'mphantom':
      return 0
    default: {
      // \left( … \right) brackets
      const fenced = kids.filter((k) => k.tag === 'mo' && k.attrs.fence === 'true').length
      return sum(kids.filter((k) => !(k.tag === 'mo' && k.attrs.fence === 'true'))) + fenced * 0.4
    }
  }
}

/** The `<math>` element of KaTeX's MathML for `tex`, or null if KaTeX can't read it. */
function mathOf(tex: string): XmlNode | null {
  let mathml: string
  try {
    mathml = katex.renderToString(tex, { output: 'mathml', throwOnError: true, strict: 'ignore' })
  } catch {
    return null
  }
  return (function find(n: XmlNode): XmlNode | null {
    if (n.tag === 'math') return n
    for (const c of n.children) {
      const f = find(c)
      if (f) return f
    }
    return null
  })(parseXml(mathml))
}

/**
 * An equation as `<m:oMath>` (editable maths in Word), with roughly how wide
 * it is in ems. `size` (half-points) sets its font size. If KaTeX can't read
 * the LaTeX, the LaTeX is kept as text.
 */
export function texToMath(tex: string, size?: number): { xml: string; ems: number } {
  const ctx: Ctx = { size }
  const math = mathOf(tex)
  if (!math) return { xml: `<m:oMath>${runXml(tex, 'text', ctx)}</m:oMath>`, ems: tex.length * 0.5 }
  return { xml: `<m:oMath>${render(convert(math, ctx), ctx)}</m:oMath>`, ems: width(math) }
}

/** An equation as `<m:oMath>`: editable maths in Word. */
export const texToOmml = (tex: string, size?: number) => texToMath(tex, size).xml
