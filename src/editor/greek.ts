/**
 * Typing Greek letters in the editor: `\Delta` followed by Tab or a space
 * becomes Δ, as in many LaTeX tools. The letter is then part of the name, so
 * `ΔE` is a variable of its own (shown ΔE), unlike `Delta E` (with a space),
 * which is E's uncertainty.
 *
 * It only happens where names are typed: not in headings, prose, raw LaTeX,
 * notes, or `$…$` maths in a title, where `\Delta` is LaTeX and stays as typed.
 */
import type { Completion, CompletionResult } from '@codemirror/autocomplete'
import type { EditorState } from '@codemirror/state'
import { EditorView, type Command } from '@codemirror/view'
import { GREEK_BY_NAME, GREEK_LETTERS, MATHS_MARK } from '../lib/syntax.ts'
import { EVERY_GREEK_TYPED, GREEK_BEING_TYPED, GREEK_ESCAPE, GREEK_SO_FAR, GREEK_TYPED } from './syntax.ts'
import { inNote, isProseLine } from './language.ts'
import { inNamelessBlock } from './sheetLines.ts'

// (How a Greek letter's name is typed, `\delta`, is the editor's vocabulary: syntax.ts.)
const BEING_TYPED = GREEK_BEING_TYPED
const TYPED = GREEK_TYPED
const EVERY_TYPED = EVERY_GREEK_TYPED

/** Text with each Greek letter's name after a backslash as the letter: `\Delta E` → `ΔE` (any other `\word` stays). */
export const withGreekLetters = (text: string): string =>
  text.replace(EVERY_TYPED, (typed, name: string) => GREEK_BY_NAME.get(name) ?? typed)

/**
 * In a text box (the rename panel's), Space or Tab right after a Greek letter's
 * name types the letter, as in the editor: `\delta` then Space gives δ. Whether
 * it did (and so the key's own typing is to be left out).
 */
export function typeGreekInBox(input: HTMLInputElement): boolean {
  const at = input.selectionStart ?? input.value.length
  if (at !== input.selectionEnd) return false
  const m = TYPED.exec(input.value.slice(0, at))
  const char = m && GREEK_BY_NAME.get(m[1])
  if (!m || !char) return false
  input.setRangeText(char, at - m[0].length, at, 'end')
  return true
}

/** Whether the text before the cursor is inside `$…$` maths. */
const inInlineMaths = (before: string) => (before.split(MATHS_MARK).length - 1) % 2 === 1

/** Every Greek letter as a suggestion: `\Delta`, which types Δ. */
const OPTIONS: Completion[] = GREEK_LETTERS.map(([name, char]) => ({ label: `${GREEK_ESCAPE}${name}`, apply: char, type: 'text', detail: char }))

/** Greek letters to suggest while `\…` is typed (`before`: the line up to the cursor). */
export function greekCompletions(before: string, pos: number): CompletionResult | null {
  const m = BEING_TYPED.exec(before)
  if (!m || inInlineMaths(before)) return null
  return { from: pos - m[0].length, options: OPTIONS, validFor: GREEK_SO_FAR }
}

/**
 * The Greek letter whose name was just typed before `pos` (`\Delta`), and
 * where its name starts; null if there isn't one, or names aren't typed there.
 */
function greekBefore(state: EditorState, pos: number): { from: number; char: string } | null {
  const line = state.doc.lineAt(pos)
  const before = line.text.slice(0, pos - line.from)
  const m = TYPED.exec(before)
  const char = m && GREEK_BY_NAME.get(m[1])
  if (!m || !char) return null
  if (isProseLine(before) || inNamelessBlock(state.doc, line.number) || inNote(before) || inInlineMaths(before)) return null
  return { from: pos - m[0].length, char }
}

/** Replace the letter's name before the cursor with the letter. */
function typeLetter(view: EditorView, at: number): boolean {
  const greek = greekBefore(view.state, at)
  if (!greek) return false
  view.dispatch({ changes: { from: greek.from, to: at, insert: greek.char }, userEvent: 'input.complete' })
  return true
}

/** Tab after `\Delta`, when no suggestion list is open: type Δ. */
export const typeGreek: Command = (view) => {
  const { head, empty } = view.state.selection.main
  return empty && typeLetter(view, head)
}

/**
 * A space after `\Delta` types Δ, and the space ends the name, as in LaTeX:
 * `\Delta E` makes ΔE. (Type another space for a space.)
 */
export const greekOnSpace = EditorView.inputHandler.of((view, from, to, text) =>
  text === ' ' && from === to && typeLetter(view, from))
