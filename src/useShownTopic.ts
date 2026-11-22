/**
 * Which of a tab's topics is shown (the Library's and the Reference's topic
 * menu, components/TopicSearch.tsx), remembered in the browser.
 */
import { useEffect, useState, type RefObject } from 'react'
import { readStored, writeStored } from './lib/data/storage.ts'

/** The menu's choice of every topic at once. */
export const ALL_TOPICS = 'all'

/** A topic, as the menu lists it. */
export interface TopicChoice {
  readonly id: string
  readonly title: string
}

/** Topics listed together in the menu, under a heading if they have one (Physics, Chemistry). */
export interface TopicGroup {
  readonly label?: string
  readonly topics: readonly TopicChoice[]
}

/**
 * The topic shown, and a way to change it: the one chosen last time in this
 * browser (kept under `storageKey`), if it's still one of `ids`; at first, the
 * first. A new topic starts at the top of `scroller`.
 */
export function useShownTopic(
  storageKey: string,
  ids: readonly string[],
  scroller: RefObject<HTMLElement | null>,
): [string, (id: string) => void] {
  const [shown, setShown] = useState(() => {
    const kept = readStored(storageKey)
    return kept !== null && (kept === ALL_TOPICS || ids.includes(kept)) ? kept : ids[0]
  })
  useEffect(() => {
    writeStored(storageKey, shown)
    scroller.current?.scrollTo({ top: 0 })
  }, [storageKey, shown, scroller])
  return [shown, setShown]
}

/** Whether a topic is among those shown. */
export const isShown = (shown: string, id: string) => shown === ALL_TOPICS || shown === id
