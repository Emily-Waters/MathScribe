import { useEffect, useState } from 'react'
import { NARROW_SCREEN } from './config.ts'

/** Whether the screen is narrow (NARROW_SCREEN: a phone, or a narrow window), kept up to date as it changes. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_SCREEN).matches)
  useEffect(() => {
    const query = window.matchMedia(NARROW_SCREEN)
    const update = () => setNarrow(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return narrow
}
