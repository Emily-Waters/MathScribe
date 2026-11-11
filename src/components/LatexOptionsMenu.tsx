import { DEFAULT_LATEX_OPTIONS, MARGIN_CM, type LatexOptions } from '../lib/latex.ts'
import { Dropdown } from './Dropdown.tsx'
import { ALIGN } from '../lib/alignment.ts'

interface LatexOptionsMenuProps {
  options: LatexOptions
  onChange: (options: LatexOptions) => void
}

/** How the exported LaTeX and Word documents look: page, layout, and an optional title. */
export function LatexOptionsMenu({ options, onChange }: LatexOptionsMenuProps) {
  const set = <K extends keyof LatexOptions>(key: K, value: LatexOptions[K]) => onChange({ ...options, [key]: value })
  const check = (key: 'compact' | 'cards' | 'numberSections' | 'date', label: string, help: string) => (
    <>
      <label className="options__row">
        <input type="checkbox" checked={options[key]} onChange={(e) => set(key, e.target.checked)} />
        <span>{label}</span>
      </label>
      <p className="options__help">{help}</p>
    </>
  )

  return (
    <Dropdown label="Document" panelLabel="Document options, for both the .tex and the .docx">
      <p className="options__help">These apply to both the LaTeX and the Word (.docx) export.</p>
      <label className="options__row">
        <span>Equations</span>
        <select value={options.align} onChange={(e) => set('align', e.target.value as LatexOptions['align'])}>
          <option value={ALIGN.left}>Left, like the output</option>
          <option value={ALIGN.center}>Centered</option>
        </select>
      </label>
      <p className="options__help">Left aligns every equation flush left, with notes on the right.</p>

      {check('compact', 'Compact spacing', 'Less space around equations; paragraphs spaced instead of indented. (LaTeX only.)')}
      {check('cards', 'Blocks as cards', 'Blocks, functions and constants with a bar on the left and a shaded title (LaTeX uses the mdframed package).')}
      {check('numberSections', 'Number sections', 'Sections and subsections numbered 1, 1.1, … as in the output.')}

      <div className="options__grid">
        <label className="options__row">
          <span>Font size</span>
          <select value={options.fontSize} onChange={(e) => set('fontSize', e.target.value as LatexOptions['fontSize'])}>
            <option value="10pt">10 pt</option>
            <option value="11pt">11 pt</option>
            <option value="12pt">12 pt</option>
          </select>
        </label>
        <label className="options__row">
          <span>Paper</span>
          <select value={options.paper} onChange={(e) => set('paper', e.target.value as LatexOptions['paper'])}>
            <option value="a4paper">A4</option>
            <option value="letterpaper">Letter</option>
          </select>
        </label>
        <label className="options__row">
          <span>Margins</span>
          <select value={options.margins} onChange={(e) => set('margins', e.target.value as LatexOptions['margins'])}>
            <option value="narrow">Narrow ({MARGIN_CM.narrow} cm)</option>
            <option value="normal">Normal ({MARGIN_CM.normal} cm)</option>
            <option value="wide">Wide ({MARGIN_CM.wide} cm)</option>
          </select>
        </label>
      </div>

      <div className="options__section">Title (optional)</div>
      <label className="options__field">
        <span>Title</span>
        <input type="text" value={options.title} placeholder="e.g. Lab 3: Hydrogen orbitals"
          onChange={(e) => set('title', e.target.value)} />
      </label>
      <label className="options__field">
        <span>Author</span>
        <input type="text" value={options.author} onChange={(e) => set('author', e.target.value)} />
      </label>
      {check('date', 'Today’s date', 'Shown under the title.')}

      <button className="options__reset" onClick={() => onChange(DEFAULT_LATEX_OPTIONS)}>Reset to defaults</button>
    </Dropdown>
  )
}
