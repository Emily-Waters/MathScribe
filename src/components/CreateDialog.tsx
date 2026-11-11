/**
 * Create: make a prompt for an AI model to write a sheet (a test, an
 * assignment, …), copy it, and open the AI's answer as a new sheet. Nothing is
 * sent anywhere: the prompt goes to the clipboard, for pasting into any AI.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { STORAGE_KEYS } from '../config.ts'
import { readStoredJson, writeStoredJson } from '../lib/storage.ts'
import {
  CREATE_KINDS, CREATE_KIND_INFO, buildPrompt, defaultChoices, sheetFromAnswer, sheetName, type CreateKind,
} from '../lib/aiPrompt.ts'
import { copyText, useFlash } from '../useFlash.ts'

/** What's kept between visits: the kind chosen, and each kind's request and tickboxes. */
interface Remembered {
  kind: CreateKind | null
  requests: Partial<Record<CreateKind, string>>
  choices: Partial<Record<CreateKind, Record<string, boolean>>>
}

const FORGOTTEN: Remembered = { kind: null, requests: {}, choices: {} }

/** A new sheet's name when the answer has no heading to name it by. */
const FALLBACK_NAME = 'created'

interface Props {
  open: boolean
  onClose: () => void
  /** Open `text` as a new sheet named `name`. */
  onCreate: (name: string, text: string) => void
}

export function CreateDialog({ open, onClose, onCreate }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [saved, setSaved] = useState<Remembered>(() => ({ ...FORGOTTEN, ...readStoredJson<Remembered>(STORAGE_KEYS.create) }))
  const [answer, setAnswer] = useState('')
  const [flash, showFlash] = useFlash<'copy'>()

  // Shown as a modal while open (the browser keeps focus in it, and Esc closes it).
  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const remember = (next: Remembered) => {
    setSaved(next)
    writeStoredJson(STORAGE_KEYS.create, next)
  }

  const { kind } = saved
  const info = kind ? CREATE_KIND_INFO[kind] : null
  const request = kind ? saved.requests[kind] ?? '' : ''
  const choices = kind ? { ...defaultChoices(kind), ...saved.choices[kind] } : {}
  // (Quick to build: a few thousand characters of text.)
  const prompt = kind ? buildPrompt(kind, request, choices) : ''

  const preview = useRef<HTMLDetailsElement>(null)
  const copy = async () => {
    if (await copyText(prompt)) {
      showFlash('copy', 'Copied: paste it into any AI')
      return
    }
    // The browser can refuse: show the prompt, selected, for copying by hand.
    const details = preview.current
    const text = details?.querySelector('pre')
    if (details && text) {
      details.open = true
      window.getSelection()?.selectAllChildren(text)
      text.scrollIntoView({ block: 'nearest' })
    }
    showFlash('copy', 'The browser didn’t allow copying: the prompt is selected below, so press Ctrl+C')
  }
  const onRequestKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void copy()
    }
  }
  const openAnswer = () => {
    const sheet = sheetFromAnswer(answer)
    onCreate(sheetName(sheet, FALLBACK_NAME), sheet)
    setAnswer('')
    onClose()
  }

  return (
    <dialog ref={dialog} className="create" onClose={onClose} aria-labelledby="create-title">
      <header className="create__header">
        <h2 id="create-title">Create with AI</h2>
        <button className="create__close" onClick={onClose} aria-label="Close">×</button>
      </header>

      <section className="create__step">
        <h3>1. What do you want to make?</h3>
        <div className="create__kinds" role="radiogroup" aria-label="What to make">
          {CREATE_KINDS.map((k) => (
            <button
              key={k}
              role="radio"
              aria-checked={kind === k}
              className={`create__kind${kind === k ? ' create__kind--chosen' : ''}`}
              onClick={() => remember({ ...saved, kind: k })}
            >
              <strong>{CREATE_KIND_INFO[k].name}</strong>
              <span>{CREATE_KIND_INFO[k].description}</span>
            </button>
          ))}
        </div>
      </section>

      {kind && info && (
        <>
          <section className="create__step">
            <h3>2. Describe it, then copy the prompt</h3>
            <textarea
              className="create__text"
              rows={3}
              value={request}
              placeholder={info.placeholder}
              onChange={(e) => remember({ ...saved, requests: { ...saved.requests, [kind]: e.target.value } })}
              onKeyDown={onRequestKey}
              aria-label="What to make"
            />
            <div className="create__options">
              {info.options.map((o) => (
                <label key={o.id} className="options__row">
                  <input
                    type="checkbox"
                    checked={choices[o.id]}
                    onChange={(e) => remember({ ...saved, choices: { ...saved.choices, [kind]: { ...choices, [o.id]: e.target.checked } } })}
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
            <div className="create__actions">
              <button className="create__primary" onClick={() => void copy()} title="Copy the prompt (Ctrl+Enter)">Copy prompt</button>
              {flash && <span className="create__flash" role="status">{flash.message}</span>}
            </div>
            <p className="options__help">
              The prompt has your request and MathScribe’s rules. Paste it into any AI (ChatGPT, Claude,
              Gemini, …). Nothing is sent from MathScribe.
            </p>
            <details className="create__preview" ref={preview}>
              <summary>Show the whole prompt</summary>
              <pre>{prompt}</pre>
            </details>
          </section>

          <section className="create__step">
            <h3>3. Paste the AI’s answer</h3>
            <textarea
              className="create__text create__answer"
              rows={5}
              value={answer}
              placeholder="Paste the whole answer: the sheet is taken out of its code block."
              onChange={(e) => setAnswer(e.target.value)}
              aria-label="The AI’s answer"
            />
            <div className="create__actions">
              <button className="create__primary" onClick={openAnswer} disabled={!answer.trim()}>Open as a new sheet</button>
            </div>
          </section>
        </>
      )}
    </dialog>
  )
}
