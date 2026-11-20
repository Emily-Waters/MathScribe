import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { placeFixedPanel } from '../editor/popover.ts'

interface DropdownProps {
  label: string
  /** Accessible name for the panel, e.g. "Editor options". */
  panelLabel: string
  children: ReactNode
  /** Hidden (but keeping its space, so things beside it don't shift). */
  hidden?: boolean
  /** A menu of choices rather than settings: closes once a button in it is clicked. */
  closeOnChoose?: boolean
}

/** A button that opens a panel of settings (or a menu: closeOnChoose). Closes on Escape or a click outside. */
export function Dropdown({ label, panelLabel, children, hidden, closeOnChoose = false }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node) && !panel.current?.contains(e.target as Node)) setOpen(false)
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

  useEffect(() => {
    if (!open || !panel.current || !toggle.current) return
    const rect = toggle.current.getBoundingClientRect()
    return placeFixedPanel(panel.current, rect, 'right')
  }, [open])

  return (
    <div className="options" ref={root} style={hidden ? { visibility: 'hidden' } : undefined}>
      <button
        ref={toggle}
        className="options__toggle"
        aria-haspopup="true"
        aria-expanded={open && !hidden}
        onClick={() => setOpen((o) => !o)}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && !hidden && createPortal(
        <div
          ref={panel}
          className="options__panel"
          role="group"
          aria-label={panelLabel}
          onClick={closeOnChoose ? (e) => { if ((e.target as HTMLElement).closest('button')) setOpen(false) } : undefined}
        >
          {children}
        </div>,
        document.body,
      )}
    </div>
  )
}
