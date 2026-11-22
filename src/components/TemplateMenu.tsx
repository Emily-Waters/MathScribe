import { Dropdown } from './Dropdown.tsx'
import { TEMPLATES } from '../lib/content/templates.ts'

interface TemplateMenuProps {
  /** Open a new sheet with this name and text. */
  onNew: (name: string, text: string) => void
}

/** "New from template": a menu of the templates beside New, each opening a new sheet started from it. */
export function TemplateMenu({ onNew }: TemplateMenuProps) {
  return (
    <Dropdown label="New from a template" icon="template" panelLabel="New from template" closeOnChoose>
      {TEMPLATES.map((t) => (
        <button key={t.name} className="template-choice" onClick={() => onNew(t.name, t.source)}>
          <span className="template-choice__name">{t.name}</span>
          <span className="template-choice__about">{t.description}</span>
        </button>
      ))}
    </Dropdown>
  )
}
