/**
 * The app's icons: small line drawings on a 24-unit square, drawn in the
 * text's colour, for the buttons and tabs that would otherwise crowd the top
 * bar and the panes' headers with words. Each is named here once; a button
 * shows one with `<Icon>` and keeps its words for screen readers and its
 * tooltip (`IconLabel`, and a `title`).
 */
import type { ReactNode } from 'react'

/** Every icon, by name: the SVG shapes inside a 24 × 24 box, stroked (or, where marked, filled) in currentColor. */
const ICON = {
  /** A page with a plus: a new sheet. */
  newSheet: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M12 12v6M9 15h6" />
    </>
  ),
  /** Sparkles: have an AI write a sheet. */
  create: (
    <>
      <path d="M10 4l1.6 4.4L16 10l-4.4 1.6L10 16l-1.6-4.4L4 10l4.4-1.6z" />
      <path d="M18 14v6M15 17h6" />
    </>
  ),
  /** A folder: open a file. */
  open: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  /** A floppy disk: save. */
  save: (
    <>
      <path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M7 3v5h8V3M7 21v-7h10v7" />
    </>
  ),
  /** A floppy disk being written on: save to a new file. */
  saveAs: (
    <>
      <path d="M11 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v3" />
      <path d="M7 3v5h8V3M7 21v-7h5" />
      <path d="M19 13.5l2 2-5.5 5.5H13.5v-2z" />
    </>
  ),
  /** An arrow down into a tray: download as a document. */
  exportDocument: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </>
  ),
  /** Two links of a chain: copy a link. */
  share: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </>
  ),
  /** A tick: done (shown for a moment after a click). */
  done: <path d="M5 12l5 5L20 7" />,
  /** A page laid out in panels: new from a template. */
  template: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </>
  ),
  /** A circle half dark: the app's colours. */
  theme: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </>
  ),
  /** Three sliders: options. */
  options: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  /** Three lines: a menu. */
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  /** An eye: the sheet as it looks, typeset. */
  rendered: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  /** Books on a shelf: the equation library. */
  library: (
    <>
      <rect x="4" y="4" width="4" height="16" rx="1" />
      <rect x="10" y="4" width="4" height="16" rx="1" />
      <path d="M16.2 5.6l3-.8 3.6 14.5-3 .8z" />
    </>
  ),
  /** A question mark in a circle: how to write a sheet. */
  reference: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01" />
    </>
  ),
} as const satisfies Record<string, ReactNode>

export type IconName = keyof typeof ICON

/** One of the app's icons, the size of the text around it; decorative, so a button names itself with `IconLabel`. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON[name]}
    </svg>
  )
}

/**
 * An icon button's words: read out by screen readers but not shown, except in a
 * menu (the narrow screen's File menu), where there's room for them beside the icon.
 */
export function IconLabel({ children }: { children: ReactNode }) {
  return <span className="icon-label">{children}</span>
}
