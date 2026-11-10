/**
 * Opening and saving sheets as plain-text files.
 *
 * Where the browser supports the File System Access API (Chrome, Edge), files
 * are opened and saved through the system dialogs and stay linked, so later
 * saves (and auto-saves) write straight back to the same file. Elsewhere,
 * Open uses a file input and Save downloads the file.
 */
import { DATA_FILE, SHEET_FILE, STORAGE_KEYS, TIMING } from '../config.ts'
import { readStoredJson, writeStoredJson } from './storage.ts'

/** The parts of a file handle used here (the API isn't in TypeScript's DOM types). */
export interface FileHandle {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  queryPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>
  /** Whether two handles are the same file (so it isn't opened twice). */
  isSameEntry?(other: FileHandle): Promise<boolean>
}

/** The browser's file dialogs, where it has them (they aren't in TypeScript's DOM types). */
interface PickerWindow {
  showOpenFilePicker?(options?: object): Promise<FileHandle[]>
  showSaveFilePicker?(options?: object): Promise<FileHandle>
}

// (Outside a browser, as in tests, there's no window and no file pickers.)
const picker = (typeof window === 'undefined' ? {} : window) as unknown as PickerWindow
/** Sheets, as the Open and Save dialogs describe and filter them. */
const FILE_TYPES = [{ description: SHEET_FILE.description, accept: { [SHEET_FILE.mimeType]: [SHEET_FILE.extension] } }]

/** Whether files can stay linked for saving back (and auto-saving). */
export const canLinkFiles = typeof picker.showOpenFilePicker === 'function'
  && typeof picker.showSaveFilePicker === 'function'

/** Whether an error is just the dialog being cancelled. */
const isCancel = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/** A file that was opened: its text and name, and its handle if it can stay linked. */
export interface OpenedFile {
  text: string
  name: string
  handle?: FileHandle
}

/**
 * Ask for a data file (CSV) to import, and read it. Resolves to null if the
 * dialog is cancelled. (Its text goes into the sheet, so no handle is kept.)
 */
export function chooseDataFile(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = DATA_FILE.accept
    input.onchange = async () => {
      const file = input.files?.[0]
      resolve(file ? { name: file.name, text: await file.text() } : null)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** Ask for one or more files to open. Resolves to [] if the dialog is cancelled. */
export async function openFiles(): Promise<OpenedFile[]> {
  if (canLinkFiles) {
    try {
      const handles = await picker.showOpenFilePicker!({ types: FILE_TYPES, multiple: true })
      return await Promise.all(handles.map(async (handle) => {
        const file = await handle.getFile()
        // Ask now, while the click still counts as a user action, so auto-save can write later.
        await handle.requestPermission?.({ mode: 'readwrite' }).catch(() => undefined)
        return { text: await file.text(), name: file.name, handle }
      }))
    } catch (e) {
      if (isCancel(e)) return []
      throw e
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = `${SHEET_FILE.extension},${SHEET_FILE.mimeType}`
    input.multiple = true
    input.onchange = async () => {
      const files = [...(input.files ?? [])]
      resolve(await Promise.all(files.map(async (file) => ({ text: await file.text(), name: file.name }))))
    }
    input.oncancel = () => resolve([])
    input.click()
  })
}

/** Ask where to save. Null if cancelled, or if files can't be linked in this browser. */
export async function chooseSaveFile(suggestedName: string): Promise<FileHandle | null> {
  if (!canLinkFiles) return null
  try {
    return await picker.showSaveFilePicker!({ suggestedName, types: FILE_TYPES })
  } catch (e) {
    if (isCancel(e)) return null
    throw e
  }
}

/** Write a sheet to a linked file. */
export async function writeFile(handle: FileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

/** Save by downloading (for browsers that can't write to files directly, and for exports). */
export function downloadFile(name: string, text: string | Uint8Array<ArrayBuffer>, type: string = SHEET_FILE.mimeType): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), TIMING.downloadLinkMs)
}

// ---------------------------------------------------------------------------
// The browser's own copy of every open sheet: kept on every edit, restored on load.
// ---------------------------------------------------------------------------

/** An open sheet as kept in the browser (file links can't be kept, only the text). */
export interface DraftSheet {
  id: string
  name: string
  text: string
}

/** Every open sheet, and which one is showing. */
export interface Drafts {
  sheets: DraftSheet[]
  active: string
}

/** The id the sheet carried over from before tabs gets. */
const LEGACY_SHEET_ID = 'sheet-1'

/** The sheets kept last time in this browser, or null to start fresh. */
export function loadDrafts(): Drafts | null {
  const drafts = readStoredJson<Drafts>(STORAGE_KEYS.drafts)
  if (drafts && Array.isArray(drafts.sheets) && drafts.sheets.length) return drafts
  const old = readStoredJson<{ text: string; name?: string }>(STORAGE_KEYS.legacyDraft)
  if (old && typeof old.text === 'string') {
    return { sheets: [{ id: LEGACY_SHEET_ID, name: old.name ?? SHEET_FILE.defaultName, text: old.text }], active: LEGACY_SHEET_ID }
  }
  return null
}

/** Keep the open sheets in the browser. Returns whether they were kept. */
export const saveDrafts = (drafts: Drafts): boolean => writeStoredJson(STORAGE_KEYS.drafts, drafts)

/** A file name's stem and extension: `lab 3.txt` → `lab 3` and `.txt` (a leading dot isn't an extension). */
export function splitExtension(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? { stem: name.slice(0, dot), ext: name.slice(dot) } : { stem: name, ext: '' }
}

/** `name`, or `name-2.txt`, `name-3.txt`, … if a sheet with that name is already open. */
export function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name
  const { stem, ext } = splitExtension(name)
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`
    if (!taken.includes(candidate)) return candidate
  }
}
