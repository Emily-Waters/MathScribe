import { useEffect, useRef, useState, type ReactNode } from 'react'

interface DropdownProps {
  label: string
  /** Accessible name for the panel, e.g. "Editor options". */
  panelLabel: string
  children: ReactNode
  /** Hidden (but keeping its space, so things beside it don't shift). */
  hidden?: boolean
}

/** A button that opens a panel of settings. Closes on Escape or a click outside. */
export function Dropdown({ label, panelLabel, children, hidden }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="options" ref={root} style={hidden ? { visibility: 'hidden' } : undefined}>
      <button
        className="options__toggle"
        aria-haspopup="true"
        aria-expanded={open && !hidden}
        onClick={() => setOpen((o) => !o)}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && !hidden && (
        <div className="options__panel" role="group" aria-label={panelLabel}>
          {children}
        </div>
      )}
    </div>
  )
}
