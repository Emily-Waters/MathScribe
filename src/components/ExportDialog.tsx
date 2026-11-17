/**
 * Export: the sheet as a document to download, Word or LaTeX, with the
 * document's options (page, layout, title). The format chosen is remembered.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { STORAGE_KEYS } from '../config.ts'
import type { Block } from '../lib/blocks.ts'
import { downloadFile, splitExtension } from '../lib/files.ts'
import { loadLatexOptions, saveLatexOptions, toLatexDocument, type LatexOptions } from '../lib/latex.ts'
import { readStored, writeStored } from '../lib/storage.ts'
import { copyText, useFlash } from '../useFlash.ts'
import { DocumentOptions } from './DocumentOptions.tsx'

/** The formats a sheet exports to. */
export const EXPORT_FORMAT = { docx: 'docx', tex: 'tex' } as const
export type ExportFormat = (typeof EXPORT_FORMAT)[keyof typeof EXPORT_FORMAT]

/** Each format, as the dialog offers it. */
const FORMAT_INFO: Record<ExportFormat, { name: string; description: string; extension: string }> = {
  [EXPORT_FORMAT.docx]: {
    name: 'Word',
    description: 'A .docx with editable equations: opens in Word and Google Docs',
    extension: '.docx',
  },
  [EXPORT_FORMAT.tex]: {
    name: 'LaTeX',
    description: 'A .tex to compile, in Overleaf or a LaTeX install',
    extension: '.tex',
  },
}

const FORMATS = Object.values(EXPORT_FORMAT)
const isFormat = (s: string | null): s is ExportFormat => FORMATS.includes(s as ExportFormat)

interface Props {
  open: boolean
  onClose: () => void
  /** The sheet, worked out: what's exported. */
  blocks: Block[]
  /** The sheet's file name, which the download is named after. */
  fileName: string
}

export function ExportDialog({ open, onClose, blocks, fileName }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [format, setFormat] = useState<ExportFormat>(() => {
    const kept = readStored(STORAGE_KEYS.exportFormat)
    return isFormat(kept) ? kept : EXPORT_FORMAT.docx
  })
  const [options, setOptions] = useState<LatexOptions>(loadLatexOptions)
  const [busy, setBusy] = useState(false)
  const [flash, showFlash] = useFlash<'copy' | 'error'>()

  // Shown as a modal while open (the browser keeps focus in it, and Esc closes it).
  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const choose = (f: ExportFormat) => {
    setFormat(f)
    writeStored(STORAGE_KEYS.exportFormat, f)
  }
  const changeOptions = (o: LatexOptions) => {
    setOptions(o)
    saveLatexOptions(o)
  }

  const info = FORMAT_INFO[format]
  const fileStem = splitExtension(fileName).stem
  // (Written only while the dialog shows LaTeX: the sheet changes with every keystroke.)
  const latex = useMemo(() => (open && format === EXPORT_FORMAT.tex ? toLatexDocument(blocks, options) : ''), [open, format, blocks, options])

  const download = async () => {
    if (format === EXPORT_FORMAT.tex) {
      downloadFile(`${fileStem}${info.extension}`, latex)
      return
    }
    setBusy(true)
    try {
      // The Word writer loads only when it's first used.
      const [{ toDocx, DOCX_TYPE }, { plotImages }] = await Promise.all([import('../lib/docx.ts'), import('../lib/plotImage.ts')])
      const images = await plotImages(blocks)
      downloadFile(`${fileStem}${info.extension}`, toDocx(blocks, options, images) as Uint8Array<ArrayBuffer>, DOCX_TYPE)
    } catch (e) {
      showFlash('error', `The Word document couldn’t be made: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const preview = useRef<HTMLDetailsElement>(null)
  const copy = async () => {
    if (await copyText(latex)) {
      showFlash('copy', 'Copied')
      return
    }
    // The browser can refuse: show the LaTeX, selected, for copying by hand.
    const details = preview.current
    const text = details?.querySelector('pre')
    if (details && text) {
      details.open = true
      window.getSelection()?.selectAllChildren(text)
    }
    showFlash('copy', 'The browser didn’t allow copying: the LaTeX is selected below, so press Ctrl+C')
  }

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} aria-labelledby="export-title">
      <header className="dialog__header">
        <h2 id="export-title">Export</h2>
        <button className="dialog__close" onClick={onClose} aria-label="Close">×</button>
      </header>

      <section className="dialog__step">
        <h3>1. Format</h3>
        <div className="dialog__choices" role="radiogroup" aria-label="Format">
          {FORMATS.map((f) => (
            <button
              key={f}
              role="radio"
              aria-checked={format === f}
              className={`dialog__choice${format === f ? ' dialog__choice--chosen' : ''}`}
              onClick={() => choose(f)}
            >
              <strong>{FORMAT_INFO[f].name}</strong>
              <span>{FORMAT_INFO[f].description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="dialog__step">
        <h3>2. Document</h3>
        <DocumentOptions options={options} onChange={changeOptions} />
      </section>

      <section className="dialog__step">
        <div className="dialog__actions">
          <button className="dialog__primary" onClick={() => void download()} disabled={busy}>
            {busy ? 'Making the document…' : `Download ${fileStem}${info.extension}`}
          </button>
          {format === EXPORT_FORMAT.tex && <button className="source__button" onClick={() => void copy()}>Copy the LaTeX</button>}
          {flash && <span className="dialog__flash" role="status">{flash.message}</span>}
        </div>
        {format === EXPORT_FORMAT.tex && (
          <details className="dialog__preview" ref={preview}>
            <summary>Show the LaTeX</summary>
            <pre>{latex}</pre>
          </details>
        )}
      </section>
    </dialog>
  )
}
