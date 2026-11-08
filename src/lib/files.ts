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
}

interface PickerWindow {
  showOpenFilePicker?(options?: object): Promise<FileHandle[]>
  showSaveFilePicker?(options?: object): Promise<FileHandle>
}

const picker = window as unknown as PickerWindow
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

/** Ask for a file to open. Resolves to null if the dialog is cancelled. */
export async function openFile(): Promise<OpenedFile | null> {
  if (canLinkFiles) {
    try {
      const [handle] = await picker.showOpenFilePicker!({ types: FILE_TYPES, multiple: false })
      const file = await handle.getFile()
      // Ask now, while the click still counts as a user action, so auto-save can write later.
      await handle.requestPermission?.({ mode: 'readwrite' }).catch(() => undefined)
      return { text: await file.text(), name: file.name, handle }
    } catch (e) {
      if (isCancel(e)) return null
      throw e
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,text/plain'
    input.onchange = async () => {
      const file = input.files?.[0]
      resolve(file ? { text: await file.text(), name: file.name } : null)
    }
    input.oncancel = () => resolve(null)
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
export function downloadFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------------------------------------------------------------------------
// The browser's own copy: kept on every edit, restored on load.
// ---------------------------------------------------------------------------

const DRAFT_KEY = 'mathscribe:draft'

export function loadDraft(): { text: string; name?: string } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as { text: string; name?: string }) : null
  } catch {
    return null
  }
}

export function saveDraft(text: string, name?: string): boolean {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, name }))
    return true
  } catch {
    return false
  }
}
