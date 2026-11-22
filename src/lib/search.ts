/**
 * The search boxes' matching (the Library and Reference tabs): what's typed is
 * split into words, and a thing matches if its text has every one of them,
 * whatever the case and order.
 */
import { regex, src } from './syntax/patterns.ts'

/** Between the words typed. */
const BETWEEN_WORDS = regex(src`\s+`)

/** The words of a search, lower case; none if it's blank. */
export const searchWords = (query: string): string[] =>
  query.toLowerCase().split(BETWEEN_WORDS).filter(Boolean)

/** Whether a thing's texts, together, have every one of the words. */
export const matchesWords = (texts: readonly string[], words: readonly string[]): boolean => {
  const hay = texts.join(' ').toLowerCase()
  return words.every((w) => hay.includes(w))
}
