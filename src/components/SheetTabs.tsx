import { saveStateOf, type Sheet } from '../useSheets.ts'

interface SheetTabsProps {
  sheets: Sheet[]
  activeId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

/**
 * The open sheets, as tabs: click to switch, × (or a middle-click) to close,
 * + for a new sheet. A dot marks changes not yet saved to a file.
 */
export function SheetTabs({ sheets, activeId, onSelect, onClose, onNew }: SheetTabsProps) {
  return (
    <div className="sheet-tabs" role="tablist" aria-label="Open sheets">
      {sheets.map((s) => {
        const state = saveStateOf(s)
        const selected = s.id === activeId
        return (
          <div
            key={s.id}
            className={`sheet-tab${selected ? ' sheet-tab--active' : ''}`}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            title={s.handle ? `${s.name}: linked to a file` : `${s.name}: kept in this browser`}
            onClick={() => onSelect(s.id)}
            onAuxClick={(e) => {
              if (e.button === 1) onClose(s.id)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(s.id)
            }}
          >
            <span className="sheet-tab__name">{s.name}</span>
            {(state === 'unsaved' || state === 'error') && s.text.trim() && (
              <span className={`sheet-tab__dot sheet-tab__dot--${state}`} aria-label={state === 'error' ? 'not saved' : 'unsaved changes'} />
            )}
            <button
              className="sheet-tab__close"
              aria-label={`Close ${s.name}`}
              title="Close"
              onClick={(e) => {
                e.stopPropagation()
                onClose(s.id)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
      <button className="sheet-tabs__new" onClick={onNew} aria-label="New sheet" title="New sheet">+</button>
    </div>
  )
}
