/**
 * Sections and subsections stand out in the editor: each `#` line (a section,
 * or a block titled as one, `# Kinematics {`) a light highlight across the
 * line, each `##` line (a subsection) a lighter one. Read from the sheet's tree
 * (sheetLines.ts), so a `#` in prose or a note isn't one. Their folds, up to the
 * next heading of their level or above, are sheetLines' too.
 */
import { type EditorState, type Extension, type Range } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import { headingLevel, sheetLines } from './sheetLines.ts'

/** The levels of heading that are highlighted, and each one's line class (its colour, App.css's --section-line). */
const HEADING_LINE: Readonly<Record<number, Decoration>> = {
  1: Decoration.line({ class: 'cm-ms-section' }),
  2: Decoration.line({ class: 'cm-ms-subsection' }),
}

/** A highlight on each section's and subsection's line. */
export function headingLines(state: EditorState) {
  const marks: Range<Decoration>[] = []
  sheetLines(state.doc).forEach((line, i) => {
    const level = headingLevel(line.step)
    const deco = level === undefined ? undefined : HEADING_LINE[level]
    if (deco) marks.push(deco.range(state.doc.line(i + 1).from))
  })
  return Decoration.set(marks)
}

/** Section and subsection lines highlighted. */
export const headingHighlight: Extension = [
  EditorView.decorations.compute(['doc'], headingLines),
  EditorView.baseTheme({
    '.cm-ms-section': { backgroundColor: 'var(--section-line)' },
    '.cm-ms-subsection': { backgroundColor: 'var(--subsection-line)' },
  }),
]
