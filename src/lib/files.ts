/**
 * Opening and saving sheets as plain-text files.
 *
 * Where the browser supports the File System Access API (Chrome, Edge), files
 * are opened and saved through the system dialogs and stay linked, so later
 * saves (and auto-saves) write straight back to the same file. Elsewhere,
 * Open uses a file input and Save downloads the file.
 */

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

interface PickerWindow {
  showOpenFilePicker?(options?: object): Promise<FileHandle[]>
  showSaveFilePicker?(options?: object): Promise<FileHandle>
}

// (Outside a browser, as in tests, there's no window and no file pickers.)
const picker = (typeof window === 'undefined' ? {} : window) as unknown as PickerWindow
const FILE_TYPES = [{ description: 'MathScribe sheet', accept: { 'text/plain': ['.txt'] } }]

/** Whether files can stay linked for saving back (and auto-saving). */
export const canLinkFiles = typeof picker.showOpenFilePicker === 'function'
  && typeof picker.showSaveFilePicker === 'function'

const isCancel = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

export interface OpenedFile {
  text: string
  name: string
  handle?: FileHandle
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
    input.accept = '.txt,text/plain'
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

export async function writeFile(handle: FileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

/** Save by downloading, for browsers that can't write to files directly. */
export function downloadFile(name: string, text: string | Uint8Array<ArrayBuffer>, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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

export interface Drafts {
  sheets: DraftSheet[]
  active: string
}

const DRAFTS_KEY = 'mathscribe:drafts'
/** The single-sheet copy kept before tabs; read once to carry it over. */
const OLD_DRAFT_KEY = 'mathscribe:draft'

export function loadDrafts(): Drafts | null {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY)
    if (raw) {
      const drafts = JSON.parse(raw) as Drafts
      if (Array.isArray(drafts.sheets) && drafts.sheets.length) return drafts
    }
    const old = localStorage.getItem(OLD_DRAFT_KEY)
    if (old) {
      const { text, name } = JSON.parse(old) as { text: string; name?: string }
      return { sheets: [{ id: 'sheet-1', name: name ?? 'sheet.txt', text }], active: 'sheet-1' }
    }
  } catch {
    /* unreadable: start fresh */
  }
  return null
}

export function saveDrafts(drafts: Drafts): boolean {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
    return true
  } catch {
    return false
  }
}

/** `name`, or `name-2.txt`, `name-3.txt`, … if a sheet with that name is already open. */
export function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name
  const dot = name.lastIndexOf('.')
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`
    if (!taken.includes(candidate)) return candidate
  }
}
