/**
 * The visual check: a sheet with every kind of block (showcase.txt), exported
 * as the app exports it, to LaTeX and to Word, each compiled to a PDF and its
 * pages to pictures, for looking at. It isn't one of the tests (`npm test`
 * doesn't run it): run it with `npm run visual` when what the exports look like
 * may have changed, then look at visual/out/latex-*.png and word-*.png.
 *
 * It uses what's on this computer, and says what it couldn't do without:
 *   pdflatex (TeX Live or MiKTeX)   the LaTeX to a PDF (run twice, for references)
 *   Chrome                          each plot as a picture, for the Word file (as the app's canvas does)
 *   Word                            the Word file to a PDF (by PowerShell, Windows only)
 *   pdftoppm (comes with TeX Live)  each PDF's pages to PNGs
 */
import { expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { EXAMPLE_CALC_OPTIONS } from '../src/config.ts'
import { evaluateSheetSafely } from '../src/lib/sheet/document.ts'
import { collectDiagnostics } from '../src/lib/sheet/sheetIndex.ts'
import { DEFAULT_LATEX_OPTIONS, toLatexDocument } from '../src/lib/output/latex.ts'
import { toDocx, type PlotImages } from '../src/lib/output/docx.ts'
import { PLOT_SIZE, PRINT_PALETTE, plotSvg } from '../src/lib/output/plot.ts'
import { plotsOf } from '../src/lib/output/plotImage.ts'

/** Where it all is: the sheet beside this file, what's made in out/. */
const HERE = resolve(import.meta.dirname)
const OUT = join(HERE, 'out')
const SHEET = join(HERE, 'showcase.txt')

/** What the files are called: showcase.tex, showcase.pdf, showcase.docx, word.pdf, and their pages. */
const NAME = { tex: 'showcase.tex', latexPdf: 'showcase.pdf', docx: 'showcase.docx', wordPdf: 'word.pdf', latexPages: 'latex', wordPages: 'word' } as const

/** How sharp the pages' pictures are (dots per inch): enough to read a subscript. */
const PAGE_DPI = 80

/** Pixels per drawing unit for a plot's picture, as the app draws them (plotImage.ts). */
const PLOT_SCALE = 2.5

/** Where Chrome usually is. */
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

/** Run a program; its output, or why it didn't run. */
function run(program: string, args: string[], cwd = OUT): { ok: boolean; output: string } {
  const r = spawnSync(program, args, { cwd, encoding: 'utf8', timeout: 240_000, windowsHide: true })
  if (r.error) return { ok: false, output: r.error.message }
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** What was done and what wasn't, said at the end. */
const report: string[] = []

/** The LaTeX to a PDF, with pdflatex (twice, so captions and references settle); the log's errors if it fails. */
function compileLatex(): boolean {
  for (let pass = 1; pass <= 2; pass++) {
    const r = run('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', NAME.tex])
    if (!r.ok) {
      const log = existsSync(join(OUT, 'showcase.log')) ? readFileSync(join(OUT, 'showcase.log'), 'utf8') : r.output
      const errors = log.split('\n').filter((l) => l.startsWith('!') || /^l\.\d+/.test(l)).slice(0, 10)
      report.push(`LaTeX didn't compile (pass ${pass}):\n  ${errors.join('\n  ') || r.output.slice(-800)}`)
      return false
    }
  }
  report.push(`LaTeX compiled: ${NAME.latexPdf}`)
  return true
}

/** Each plot as a PNG, as the app makes them: its SVG in print colours, drawn by Chrome at the app's size. */
function plotPictures(plots: ReturnType<typeof plotsOf>): PlotImages {
  const images: PlotImages = new Map()
  const chrome = CHROME.find((c) => existsSync(c))
  if (!chrome) {
    report.push('No Chrome: the Word file has no plots.')
    return images
  }
  const width = PLOT_SIZE.width * PLOT_SCALE
  const height = PLOT_SIZE.height * PLOT_SCALE
  plots.forEach((plot, i) => {
    const page = join(OUT, `plot${i + 1}.html`)
    const png = join(OUT, `plot${i + 1}.png`)
    const svg = plotSvg(plot, PRINT_PALETTE).replace('<svg ', `<svg width="${width}" height="${height}" `)
    writeFileSync(page, `<!doctype html><html><body style="margin:0;background:${PRINT_PALETTE.background}">${svg}</body></html>`)
    run(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${width},${height}`, `--screenshot=${png}`, `file:///${page.replaceAll('\\', '/')}`])
    if (existsSync(png)) images.set(plot, new Uint8Array(readFileSync(png)))
    else report.push(`Plot ${i + 1} couldn't be drawn.`)
  })
  return images
}

/** The Word file to a PDF, by Word itself (Windows: PowerShell and Word's COM). */
function wordToPdf(): boolean {
  if (process.platform !== 'win32') {
    report.push('Not Windows: the Word file is made, but not turned into a PDF (open it in Word to look).')
    return false
  }
  const docx = join(OUT, NAME.docx)
  const pdf = join(OUT, NAME.wordPdf)
  // (Format 17 is a PDF. Word is closed again whatever happens.)
  const script = [
    '$w = New-Object -ComObject Word.Application',
    '$w.Visible = $false',
    'try {',
    `  $d = $w.Documents.Open('${docx}', $false, $true)`,
    `  $d.ExportAsFixedFormat('${pdf}', 17)`,
    '  $d.Close($false)',
    '} finally { $w.Quit() }',
  ].join('\n')
  const r = run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script])
  if (!r.ok || !existsSync(pdf)) {
    report.push(`Word didn't make a PDF: ${r.output.trim().slice(0, 400) || 'is Word installed?'}`)
    return false
  }
  report.push(`Word made a PDF: ${NAME.wordPdf}`)
  return true
}

/** A PDF's pages as PNGs, `stem-1.png`, `stem-2.png`, …; their names. */
function pages(pdf: string, stem: string): string[] {
  const r = run('pdftoppm', ['-png', '-r', String(PAGE_DPI), pdf, stem])
  if (!r.ok) {
    report.push(`pdftoppm couldn't make pictures of ${pdf}: ${r.output.trim().slice(0, 200)}`)
    return []
  }
  return readdirSync(OUT).filter((f) => f.startsWith(`${stem}-`) && f.endsWith('.png')).sort()
}

it('exports the showcase sheet to LaTeX and Word, compiled, and their pages as pictures', () => {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const sheet = evaluateSheetSafely(readFileSync(SHEET, 'utf8'), EXAMPLE_CALC_OPTIONS)
  // (The sheet itself must work out: an error in it would show in both exports.)
  const problems = collectDiagnostics(sheet.blocks)
  report.push(Object.keys(problems).length ? `The sheet has errors or warnings: ${JSON.stringify(problems)}` : 'The sheet works out without errors.')

  writeFileSync(join(OUT, NAME.tex), toLatexDocument(sheet.blocks, DEFAULT_LATEX_OPTIONS))
  const latexPages = compileLatex() ? pages(NAME.latexPdf, NAME.latexPages) : []

  writeFileSync(join(OUT, NAME.docx), toDocx(sheet.blocks, DEFAULT_LATEX_OPTIONS, plotPictures(plotsOf(sheet.blocks))))
  const wordPages = wordToPdf() ? pages(NAME.wordPdf, NAME.wordPages) : []

  report.push(`Pages to look at, in ${OUT}:`, `  LaTeX: ${latexPages.join(', ') || 'none'}`, `  Word: ${wordPages.join(', ') || 'none'}`)
  writeFileSync(join(OUT, 'report.txt'), `${report.join('\n')}\n`)
  console.log(report.join('\n'))
  expect(latexPages.length + wordPages.length).toBeGreaterThan(0)
}, 600_000)
