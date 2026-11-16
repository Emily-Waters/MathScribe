import { useEffect, useState } from 'react'

/** A settled value, kept: the value, and what it's for (a sheet), so another's is never taken for it. */
export interface Settled<T> {
  readonly value: T
  readonly key: unknown
}

/**
 * What's shown now, and the settled value to keep (the same object if it
 * needn't change). With no delay, or for a different key (another sheet), the
 * value is settled at once: so a switch to waiting starts from the latest value
 * rather than an older one (which, worked out, could switch the waiting off
 * again, and on, without end), and a sheet switched to is never shown as
 * another one was.
 */
export function settle<T>(settled: Settled<T>, value: T, delayMs: number, key: unknown): { shown: T; next: Settled<T> } {
  if (delayMs > 0 && key === settled.key) return { shown: settled.value, next: settled }
  const next = settled.value === value && settled.key === key ? settled : { value, key }
  return { shown: value, next }
}

/**
 * A value once it has stopped changing for `delayMs`: while it keeps changing
 * (someone typing), the last settled value. With a delay of 0 or less, or for
 * a different `key` (another sheet), the value itself, straight away.
 */
export function useSettled<T>(value: T, delayMs: number, key?: unknown): T {
  const [settled, setSettled] = useState<Settled<T>>({ value, key })
  const { shown, next } = settle(settled, value, delayMs, key)
  // (State that follows the props, adjusted while rendering, as React allows: one more render, then it's steady.)
  if (next !== settled) setSettled(next)
  useEffect(() => {
    if (delayMs <= 0) return
    const timer = setTimeout(() => setSettled((s) => (s.value === value && s.key === key ? s : { value, key })), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs, key])
  return shown
}
