import { useEffect, useState } from 'react'

/**
 * A value once it has stopped changing for `delayMs`: while it keeps changing
 * (someone typing), the last settled value. With a delay of 0 or less, the
 * value itself, straight away.
 */
export function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    // (Kept up to date with no delay too, so a switch to waiting starts from the latest value.)
    const timer = setTimeout(() => setSettled(value), Math.max(delayMs, 0))
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return delayMs > 0 ? settled : value
}
