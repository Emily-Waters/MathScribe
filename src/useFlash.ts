import { useCallback, useState } from 'react'
import { TIMING } from './config.ts'

/**
 * A short message ("Copied", "Inserted") shown beside one item for a moment
 * after an action on it. Returns the message showing now (with the item it's
 * for) and a function to show one.
 */
export function useFlash<K>() {
  const [flash, setFlash] = useState<{ key: K; message: string } | null>(null)
  const show = useCallback((key: K, message: string) => {
    setFlash({ key, message })
    // Clear it later, unless another message has replaced it by then.
    setTimeout(() => setFlash((f) => (f?.key === key && f.message === message ? null : f)), TIMING.feedbackMs)
  }, [])
  return [flash, show] as const
}

/** Put text on the clipboard. Returns whether it worked (the browser can refuse). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
