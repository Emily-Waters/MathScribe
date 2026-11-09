import { useCallback, useEffect, useRef, useState } from 'react'
import {
  canLinkFiles, chooseSaveFile, downloadFile, loadDrafts, openFiles, saveDrafts, uniqueName, writeFile,
  type FileHandle,
} from './lib/files.ts'
import { SHEET_FILE, TIMING } from './config.ts'
import { SAMPLE } from './lib/sample.ts'

/** Whether a sheet's latest text has been saved (to its file, or the browser). */
export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

/** One open sheet: a tab. */
export interface Sheet {
  id: string
  name: string
  text: string
  /** The linked file (Chrome, Edge), which saves and auto-saves write to. */
  handle: FileHandle | null
  /** The text as last read from or written to a file (null: never saved to one). */
  savedText: string | null
  saving: boolean
  error: string | null
}

/** A new, unique id for a sheet (the time, and a count for sheets made in the same millisecond). */
let nextId = 1
const newId = () => `sheet-${Date.now().toString(36)}-${nextId++}`

/** A new sheet, with no file. */
const blank = (name: string, text = ''): Sheet =>
  ({ id: newId(), name, text, handle: null, savedText: null, saving: false, error: null })

/** The sheets open last time, from the browser's copy; or the example sheet the first time. */
function initialSheets(): { sheets: Sheet[]; active: string } {
  const drafts = loadDrafts()
  if (!drafts) {
    const first = blank(SHEET_FILE.defaultName, SAMPLE)
    return { sheets: [first], active: first.id }
  }
  const sheets = drafts.sheets.map((d) => ({ ...blank(d.name, d.text), id: d.id }))
  const active = sheets.some((s) => s.id === drafts.active) ? drafts.active : sheets[0].id
  return { sheets, active }
}

/** Whether a sheet's latest text is saved: to its linked file if it has one, else in the browser. */
export function saveStateOf(sheet: Sheet): SaveState {
  if (sheet.error) return 'error'
  if (sheet.saving) return 'saving'
  return sheet.text === sheet.savedText ? 'saved' : 'unsaved'
}

/** Whether closing the sheet would lose work that isn't in a file. */
const hasUnsavedWork = (s: Sheet) => s.text.trim() !== '' && s.text !== s.savedText

/**
 * The open sheets (tabs) and the active one. Every sheet is kept in the
 * browser on every edit; a sheet opened or saved through the system dialog
 * (Chrome, Edge) also auto-saves back to its file shortly after each edit.
 */
export function useSheets() {
  const [initial] = useState(initialSheets)
  const [sheets, setSheets] = useState<Sheet[]>(initial.sheets)
  const [activeId, setActiveId] = useState(initial.active)
  const [draftKept, setDraftKept] = useState(true)
  const active = sheets.find((s) => s.id === activeId) ?? sheets[0]

  // The latest sheets, for saving from timers and async code.
  const latest = useRef(sheets)
  useEffect(() => {
    latest.current = sheets
  }, [sheets])
  const writing = useRef(new Set<string>())

  const update = useCallback((id: string, patch: Partial<Sheet>) => {
    setSheets((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }, [])

  // The browser's copy of every open sheet, so nothing is lost on refresh or closing the tab.
  useEffect(() => {
    const t = setTimeout(() => setDraftKept(saveDrafts({
      sheets: sheets.map(({ id, name, text }) => ({ id, name, text })),
      active: active.id,
    })), TIMING.draftSaveMs)
    return () => clearTimeout(t)
  }, [sheets, active.id])

  const write = useCallback(async (id: string, target?: FileHandle) => {
    const sheet = latest.current.find((s) => s.id === id)
    const handle = target ?? sheet?.handle
    if (!sheet || !handle || writing.current.has(id)) return
    writing.current.add(id)
    const text = sheet.text
    update(id, { saving: true })
    try {
      await writeFile(handle, text)
      update(id, { savedText: text, saving: false, error: null })
    } catch (e) {
      update(id, {
        saving: false,
        error: e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Auto-save needs permission to write to the file. Press Save to allow it.'
          : `Couldn't save: ${(e as Error).message}`,
      })
    } finally {
      writing.current.delete(id)
    }
  }, [update])

  // Auto-save linked sheets shortly after the last edit.
  useEffect(() => {
    const pending = sheets.filter((s) => s.handle && s.text !== s.savedText && !s.error && !s.saving)
    if (!pending.length) return
    const t = setTimeout(() => pending.forEach((s) => void write(s.id)), TIMING.autosaveMs)
    return () => clearTimeout(t)
  }, [sheets, write])

  const setText = useCallback((text: string) => update(activeId, { text }), [activeId, update])

  const saveAs = useCallback(async () => {
    const sheet = active
    const target = await chooseSaveFile(sheet.name).catch((e: Error) => {
      update(sheet.id, { error: `Couldn't save: ${e.message}` })
      return null
    })
    if (target) {
      update(sheet.id, { handle: target, name: target.name, error: null })
      await write(sheet.id, target)
    } else if (!canLinkFiles) {
      downloadFile(sheet.name, sheet.text)
      update(sheet.id, { savedText: sheet.text })
    }
  }, [active, update, write])

  const save = useCallback(async () => {
    const sheet = active
    if (sheet.handle) {
      // A click counts as permission, so this also un-pauses a blocked auto-save.
      update(sheet.id, { error: null })
      await sheet.handle.requestPermission?.({ mode: 'readwrite' }).catch(() => undefined)
      await write(sheet.id)
    } else {
      await saveAs()
    }
  }, [active, update, write, saveAs])

  /** Open one or more files, each in its own tab (or switch to it, if it's already open). */
  const open = useCallback(async () => {
    let files
    try {
      files = await openFiles()
    } catch (e) {
      update(activeId, { error: `Couldn't open the file: ${(e as Error).message}` })
      return
    }
    if (!files.length) return
    const current = latest.current
    const added: Sheet[] = []
    let focus: string | undefined
    for (const file of files) {
      // Already open (same file)? Just switch to it.
      let existing: Sheet | undefined
      if (file.handle?.isSameEntry) {
        for (const s of current) {
          if (s.handle && await file.handle.isSameEntry(s.handle).catch(() => false)) existing = s
        }
      }
      if (existing) {
        focus = existing.id
        continue
      }
      const sheet = { ...blank(file.name, file.text), handle: file.handle ?? null, savedText: file.text }
      added.push(sheet)
      focus = sheet.id
    }
    setSheets((all) => {
      // An empty, never-saved tab is replaced by the first file opened, as in VS Code.
      const replace = all.length === 1 && !all[0].text.trim() && !all[0].handle && added.length
      return replace ? added : [...all, ...added]
    })
    if (focus) setActiveId(focus)
  }, [activeId, update])

  /** A new, empty sheet in its own tab. */
  const newSheet = useCallback(() => {
    const sheet = blank(uniqueName(SHEET_FILE.defaultName, latest.current.map((s) => s.name)))
    setSheets((all) => [...all, sheet])
    setActiveId(sheet.id)
  }, [])

  /** Close a tab, after checking if it has work that isn't saved to a file. */
  const close = useCallback((id: string) => {
    const all = latest.current
    const sheet = all.find((s) => s.id === id)
    if (!sheet) return
    if (hasUnsavedWork(sheet)
      && !window.confirm(`Close ${sheet.name}? Changes not saved to a file will be lost.`)) return
    const index = all.indexOf(sheet)
    const rest = all.filter((s) => s.id !== id)
    if (!rest.length) {
      // Always keep one tab open.
      const fresh = blank(SHEET_FILE.defaultName)
      setSheets([fresh])
      setActiveId(fresh.id)
      return
    }
    setSheets(rest)
    if (id === activeId) setActiveId(rest[Math.min(index, rest.length - 1)].id)
  }, [activeId])

  return {
    sheets,
    active,
    /** The active sheet's save state. */
    state: saveStateOf(active),
    /** The browser's copy is being kept (false if storage is unavailable). */
    draftKept,
    select: setActiveId,
    setText,
    open,
    save,
    saveAs,
    newSheet,
    close,
  }
}
