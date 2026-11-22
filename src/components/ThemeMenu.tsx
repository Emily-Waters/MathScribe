import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { APP_THEMES, type AppThemeId } from '../appTheme.ts'
import { closeOnPressOutside } from '../editor/popover.ts'
import { Dropdown } from './Dropdown.tsx'

interface ThemeMenuProps {
  theme: AppThemeId
  onChange: (id: AppThemeId) => void
  /** The editor's settings, under the app's theme: its colours, its results, how suggestions are accepted. */
  editor: ReactNode
}

/** The app's look, in the top bar: its colour theme (a menu of them, each with a small swatch), then the editor's. */
export function ThemeMenu({ theme, onChange, editor }: ThemeMenuProps) {
  return (
    <Dropdown label="Theme and editor" icon="theme" panelLabel="Theme and editor">
      <div className="options__section">App</div>
      <div className="options__row" title={APP_THEMES.find((t) => t.id === theme)?.description}>
        <span id="app-theme-label">Theme</span>
        <ThemeChoice theme={theme} onChange={onChange} />
      </div>
      <div className="options__section">Editor</div>
      {editor}
    </Dropdown>
  )
}

/** A theme's swatch: its colours, split corner to corner, with its border (System's is drawn by its class). */
function swatchStyle(t: (typeof APP_THEMES)[number]): CSSProperties | undefined {
  return t.swatch
    ? { background: `linear-gradient(135deg, ${t.swatch[0]} 50%, ${t.swatch[1]} 50%)`, borderColor: t.swatch[2] }
    : undefined
}

/**
 * The theme, as a menu like a select's (which can't show a swatch): a button
 * with the chosen one's swatch and name, opening a list of them all, each with
 * its own; chosen by a click, or the arrow keys and Enter.
 */
function ThemeChoice({ theme, onChange }: { theme: AppThemeId; onChange: (id: AppThemeId) => void }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(theme)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const chosen = APP_THEMES.find((t) => t.id === theme) ?? APP_THEMES[0]

  useEffect(() => {
    if (!open) return
    setActive(theme)
    return closeOnPressOutside((t) => !!root.current?.contains(t), () => setOpen(false))
  }, [open, theme])

  const choose = (id: AppThemeId) => {
    onChange(id)
    setOpen(false)
    button.current?.focus()
  }
  const onKey = (e: KeyboardEvent) => {
    const at = APP_THEMES.findIndex((t) => t.id === active)
    const move = (by: number) => {
      e.preventDefault()
      if (!open) setOpen(true)
      else setActive(APP_THEMES[(at + by + APP_THEMES.length) % APP_THEMES.length].id)
    }
    if (e.key === 'ArrowDown') move(1)
    else if (e.key === 'ArrowUp') move(-1)
    else if (e.key === 'Enter' && open) {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'Escape' && open) {
      // (Closes the list, not the menu it's in.)
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="swatch-select" ref={root} onKeyDown={onKey}>
      <button
        ref={button}
        className="swatch-select__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="app-theme-label"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="theme-choice__swatch" style={swatchStyle(chosen)} aria-hidden="true" />
        <span className="swatch-select__name">{chosen.name}</span>
        <span className="swatch-select__caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="swatch-select__list" role="listbox" aria-labelledby="app-theme-label">
          {APP_THEMES.map((t) => (
            <li
              key={t.id}
              role="option"
              aria-selected={t.id === theme}
              className={`swatch-select__option${t.id === active ? ' swatch-select__option--active' : ''}`}
              title={t.description}
              onMouseEnter={() => setActive(t.id)}
              onClick={() => choose(t.id)}
            >
              <span className="theme-choice__swatch" style={swatchStyle(t)} aria-hidden="true" />
              <span>{t.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
