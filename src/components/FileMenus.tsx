/**
 * The top bar's file buttons, gathered into two menus, each a small bar of
 * icons under its own button: New (an empty sheet, one from a template, one an
 * AI writes) and Save (save, save as, export, share). Open stays a button of its
 * own. Each icon's words are its tooltip's first line and what a screen reader
 * reads (on a narrow screen, they show under it).
 */
import { useState, type MouseEvent } from 'react'
import { TEMPLATES } from '../lib/content/templates.ts'
import { Dropdown } from './Dropdown.tsx'
import { Icon, IconLabel } from './icons.tsx'

interface NewMenuProps {
  /** Open a new sheet: empty, or with this name and text. */
  onNew: (name?: string, text?: string) => void
  /** Open the Create dialog. */
  onCreate: () => void
}

/** New: an empty sheet, one from a template (the templates listed under the bar), or one an AI writes (Create). */
export function NewMenu({ onNew, onCreate }: NewMenuProps) {
  const [templates, setTemplates] = useState(false)
  // (Templates shows the list in the menu rather than choosing: its click stops here, so the menu stays open.)
  const showTemplates = (e: MouseEvent) => {
    e.stopPropagation()
    setTemplates((shown) => !shown)
  }
  return (
    <Dropdown label="New" icon="newSheet" panelLabel="New" closeOnChoose row>
      <div className="icon-bar">
        <button onClick={() => onNew()} title={'New\nA new, empty sheet in its own tab'}>
          <Icon name="newSheet" /><IconLabel>New</IconLabel>
        </button>
        <button onClick={showTemplates} aria-pressed={templates} title={'From a template\nA lab report or problem set, with a little of each section filled in'}>
          <Icon name="template" /><IconLabel>Template</IconLabel>
        </button>
        <button onClick={onCreate} title={'Create\nHave an AI write a test, assignment, worked examples or a lab write-up'}>
          <Icon name="create" /><IconLabel>Create</IconLabel>
        </button>
      </div>
      {templates && (
        <div className="icon-bar__more">
          {TEMPLATES.map((t) => (
            <button key={t.name} className="template-choice" onClick={() => onNew(t.name, t.source)}>
              <span className="template-choice__name">{t.name}</span>
              <span className="template-choice__about">{t.description}</span>
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  )
}

interface SaveMenuProps {
  onSave: () => void
  onSaveAs: () => void
  onExport: () => void
  onShare: () => void
  /** Save's tooltip: where it saves (a linked file, or a download). */
  saveTitle: string
  /** Share's link was just copied: its icon is a tick. */
  shared: boolean
}

/** Save: save, save as, export as a document, share as a link. */
export function SaveMenu({ onSave, onSaveAs, onExport, onShare, saveTitle, shared }: SaveMenuProps) {
  return (
    <Dropdown label="Save, export or share" icon="save" panelLabel="Save, export or share" closeOnChoose row>
      <div className="icon-bar">
        <button onClick={onSave} title={saveTitle}>
          <Icon name="save" /><IconLabel>Save</IconLabel>
        </button>
        <button onClick={onSaveAs} title={'Save as (Ctrl+Shift+S)\nTo a new file'}>
          <Icon name="saveAs" /><IconLabel>Save as</IconLabel>
        </button>
        <button onClick={onExport} title={'Export\nDownload the sheet as a Word or LaTeX document'}>
          <Icon name="exportDocument" /><IconLabel>Export</IconLabel>
        </button>
        <button onClick={onShare} title={"Share\nCopy a link that opens this sheet: it's all in the link, so nothing is uploaded"}>
          <Icon name={shared ? 'done' : 'share'} /><IconLabel>Share</IconLabel>
        </button>
      </div>
    </Dropdown>
  )
}
