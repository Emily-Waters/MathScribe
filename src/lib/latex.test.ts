/**
 * The LaTeX export's layout and its document options. (The golden tests record
 * a whole sheet's export; these check each piece on its own.)
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_LATEX_OPTIONS, toLatexDocument, type LatexOptions } from './latex.ts'
import { sheet } from '../test/helpers.ts'

const exportOf = (source: string, options: Partial<LatexOptions> = {}) =>
  toLatexDocument(sheet(source).blocks, { ...DEFAULT_LATEX_OPTIONS, ...options })

/** The document body, between \begin{document} and \end{document}. */
const body = (tex: string) => tex.slice(tex.indexOf('\\begin{document}'), tex.indexOf('\\end{document}'))

describe('equations', () => {
  it('are flush left by default, centered on request', () => {
    expect(exportOf('x = 1')).toMatch(/^\\documentclass\[11pt,a4paper,fleqn\]\{article\}$/m)
    expect(exportOf('x = 1')).toContain('\\setlength{\\mathindent}{1em}')
    const centered = exportOf('x = 1', { align: 'center' })
    expect(centered).not.toContain('fleqn')
    expect(centered).not.toContain('\\mathindent}{1em}') // \mathindent only exists with fleqn
  })

  it('in a row share one gather*, with notes as tags; a hidden line doesn’t split them', () => {
    const tex = body(exportOf('m = 2.00 kg   # mass\nh = 3   #hide\nF = m * 9.81 m/s^2'))
    expect(tex.match(/\\begin\{gather\*\}/g)).toHaveLength(1)
    expect(tex).toContain('m = 2.00\\,\\mathrm{kg} \\tag*{mass} \\\\\n  F = ')
    expect(tex).not.toContain('h = 3')
  })

  it('are split by a heading, text or a gap', () => {
    const tex = body(exportOf('a = 1\n> words\nb = 2\n\n\nc = 3'))
    expect(tex.match(/\\begin\{gather\*\}/g)).toHaveLength(3)
    expect(tex).toContain('\\vspace{\\baselineskip}')
  })

  it('show a function’s working indented and smaller, above the line', () => {
    const tex = body(exportOf('def KE(mass, speed)\n    E = 1/2 * mass * speed^2\n    return E\nK = KE(2.00 kg, 3.00 m/s)'))
    expect(tex).toMatch(/\\begin\{msworking\}\n\\begin\{gather\*\}\n {2}E = [^\n]*\n\\end\{gather\*\}\n\\end\{msworking\}\n\\begin\{gather\*\}\n {2}K = E/)
    expect(exportOf('x = 1')).toContain('\\newenvironment{msworking}{\\par\\small\\addtolength{\\mathindent}{1.5em}}{\\par}')
  })
})

describe('spacing', () => {
  it('is compact by default', () => {
    const tex = exportOf('x = 1')
    expect(tex).toContain('\\usepackage{parskip}')
    expect(tex).toContain('\\appto{\\small}{\\compactdisplays}')
  })

  it('is LaTeX’s usual with compact off', () => {
    const tex = exportOf('x = 1', { compact: false })
    expect(tex).not.toContain('parskip')
    expect(tex).not.toContain('compactdisplays')
  })
})

describe('blocks', () => {
  const src = 'What if {\n  x = 2\n}\n@constants {\n    rho = 998 kg/m^3\n}\ndef f(a)\n    return a'

  it('are cards by default', () => {
    const tex = exportOf(src)
    // xcolor first: the card's gray!50 needs it, and mdframed only loads `color`.
    expect(tex).toContain('\\usepackage{xcolor}\n\\usepackage{mdframed}')
    expect(tex).toContain('\\begin{mdframed}[style=msblock, frametitle={What if}]')
    expect(tex).toContain('\\begin{mdframed}[style=msblock, frametitle={Constants}]')
    expect(tex).toMatch(/\\begin\{mdframed\}\[style=msblock, frametitle=\{Function \$f\\left\(a\\right\)\$\}\]/)
  })

  it('are headed paragraphs with cards off, with no extra package', () => {
    const tex = exportOf(src, { cards: false })
    expect(tex).not.toContain('mdframed')
    expect(tex).toContain('\\paragraph{What if}\n\\begin{quote}')
  })
})

describe('page and title', () => {
  it('sets the font size, paper and margins', () => {
    const tex = exportOf('x = 1', { fontSize: '12pt', paper: 'letterpaper', margins: 'narrow' })
    expect(tex).toContain('\\documentclass[12pt,letterpaper,fleqn]{article}')
    expect(tex).toContain('\\usepackage[margin=1.5cm]{geometry}')
  })

  it('numbers sections unless asked not to', () => {
    expect(exportOf('# Forces')).toContain('\\section{Forces}')
    expect(exportOf('# Forces', { numberSections: false })).toContain('\\section*{Forces}')
  })

  it('adds a title block only when there’s a title', () => {
    expect(exportOf('x = 1')).not.toContain('\\maketitle')
    const tex = exportOf('x = 1', { title: 'Lab 3: 100% done', author: 'E. Waters', date: false })
    expect(tex).toContain('\\title{Lab 3: 100\\% done}') // escaped
    expect(tex).toContain('\\author{E. Waters}')
    expect(tex).toContain('\\date{}')
    expect(tex).toContain('\\begin{document}\n\\maketitle')
  })
})

describe('plots', () => {
  const data = 't1 = 0.10 s\nt2 = 0.20 s\nt3 = 0.30 s\nx1 = 0.05 m pm 0.01 m\nx2 = 0.10 m pm 0.01 m\nx3 = 0.16 m pm 0.01 m\n'

  it('are pgfplots graphs, with pgfplots loaded only when there is one', () => {
    expect(exportOf('x = 1')).not.toContain('pgfplots')
    const tex = exportOf(`${data}plot(t, x; fit linear, log y)`)
    expect(tex).toContain('\\usepackage{pgfplots}')
    const graph = body(tex)
    expect(graph).toContain('\\begin{axis}[')
    expect(graph).toContain('ymode=log')
    expect(graph).toContain('xlabel={$t\\,\\left[\\mathrm{s}\\right]$}')
    expect(graph).toContain('(0.1, 0.05) +- (0, 0.01)')
    expect(graph).toMatch(/\\addplot\[color=blue, dashed/) // the fit
    expect(graph).toContain('R^{2}')
  })
})
