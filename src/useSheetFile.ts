import { useCallback, useEffect, useRef, useState } from 'react'
import {
  canLinkFiles,
  chooseSaveFile,
  downloadFile,
  openFile,
  saveDraft,
  writeFile,
  type FileHandle,
} from './lib/files.ts'

const DEFAULT_NAME = 'sheet.txt'
/** How long after the last edit to write a linked file. */
const AUTOSAVE_DELAY = 1000
/** How long after the last edit to update the browser's copy. */
const DRAFT_DELAY = 300

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

/**
 * Keeps the sheet saved: a copy in the browser on every edit, plus, for a file
 * opened or saved through the system dialog (Chrome, Edge), auto-save back to
 * that file shortly after each edit.
 */
export function useSheetFile(source: string, setSource: (text: string) => void, initialName?: string) {
  const [handle, setHandle] = useState<FileHandle | null>(null)
  const [name, setName] = useState(initialName ?? DEFAULT_NAME)
  /** The text as last read from or written to the file (null: never saved to a file). */
  const [savedText, setSavedText] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftKept, setDraftKept] = useState(true)
  const writing = useRef(false)

  // The browser's copy, so nothing is lost on refresh or closing the tab.
  useEffect(() => {
    const t = setTimeout(() => setDraftKept(saveDraft(source, name)), DRAFT_DELAY)
    return () => clearTimeout(t)
  }, [source, name])

  const write = useCallback(async (target: FileHandle, text: string) => {
    if (writing.current) return
    writing.current = true
    setSaving(true)
    try {
      await writeFile(target, text)
      setSavedText(text)
      setError(null)
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Auto-save needs permission to write to the file. Press Save to allow it.'
        : `Couldn't save: ${(e as Error).message}`)
    } finally {
      writing.current = false
      setSaving(false)
    }
  }, [])

  // Auto-save to the linked file shortly after the last edit.
  useEffect(() => {
    if (!handle || source === savedText || error) return
    const t = setTimeout(() => void write(handle, source), AUTOSAVE_DELAY)
    return () => clearTimeout(t)
  }, [handle, source, savedText, error, write])

  const saveAs = useCallback(async () => {
    const target = await chooseSaveFile(name).catch((e: Error) => {
      setError(`Couldn't save: ${e.message}`)
      return null
    })
    if (target) {
      setHandle(target)
      setName(target.name)
      setError(null)
      await write(target, source)
    } else if (!canLinkFiles) {
      downloadFile(name, source)
      setSavedText(source)
    }
  }, [name, source, write])

  const save = useCallback(async () => {
    if (handle) {
      // A click counts as permission, so this also un-pauses a blocked auto-save.
      setError(null)
      await handle.requestPermission?.({ mode: 'readwrite' }).catch(() => undefined)
      await write(handle, source)
    } else {
      await saveAs()
    }
  }, [handle, source, write, saveAs])

  const open = useCallback(async () => {
    try {
      const file = await openFile()
      if (!file) return
      setSource(file.text)
      setName(file.name)
      setHandle(file.handle ?? null)
      setSavedText(file.text)
      setError(null)
    } catch (e) {
      setError(`Couldn't open the file: ${(e as Error).message}`)
    }
  }, [setSource])

  const newSheet = useCallback(() => {
    setSource('')
    setName(DEFAULT_NAME)
    setHandle(null)
    setSavedText(null)
    setError(null)
  }, [setSource])

  const state: SaveState = error ? 'error' : saving ? 'saving' : source === savedText ? 'saved' : 'unsaved'

  return {
    name,
    /** A file is linked, so saves and auto-saves write straight to it. */
    linked: handle !== null,
    state,
    error,
    /** The browser's copy is being kept (false if storage is unavailable). */
    draftKept,
    open,
    save,
    saveAs,
    newSheet,
  }
}
