/**
 * What MathScribe keeps in the browser (localStorage), read and written safely:
 * storage can be blocked (private windows, strict settings) or full, and then
 * reads give nothing and writes are skipped, rather than the app failing.
 * The keys are in config.ts (STORAGE_KEYS).
 */

/** The text kept under `key`, or null if there's none (or storage is blocked). */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Keep `value` under `key`. Returns whether it was kept. */
export function writeStored(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** A value kept as JSON under `key`, or null if there's none or it can't be read. */
export function readStoredJson<T>(key: string): T | null {
  const raw = readStored(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Keep `value` as JSON under `key`. Returns whether it was kept. */
export const writeStoredJson = (key: string, value: unknown): boolean => writeStored(key, JSON.stringify(value))
