import { DEFAULT_LATEX_OPTIONS, MARGIN_CM, type LatexOptions } from '../lib/output/latex.ts'
import { ALIGN } from '../lib/output/alignment.ts'

interface DocumentOptionsProps {
  options: LatexOptions
  onChange: (options: LatexOptions) => void
}

/**
 * How an exported document looks, Word or LaTeX (in the Export dialog): its
 * page, how its blocks and equations are laid out, and an optional title.
 */
export function DocumentOptions({ options, onChange }: DocumentOptionsProps) {
  const set = <K extends keyof LatexOptions>(key: K, value: LatexOptions[K]) => onChange({ ...options, [key]: value })
  const check = (key: 'compact' | 'cards' | 'numberSections' | 'date', label: string, help: string) => (
    <label className="options__row" title={help}>
      <span>{label}</span>
      <input type="checkbox" checked={options[key]} onChange={(e) => set(key, e.target.checked)} />
    </label>
  )
  const text = (key: 'title' | 'author', label: string, placeholder = '') => (
    <label className="options__row">
      <span>{label}</span>
      <input type="text" value={options[key]} placeholder={placeholder} onChange={(e) => set(key, e.target.value)} />
    </label>
  )

  return (
    <div className="document-options">
      <div className="options__section">Page</div>
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
      <label className="options__row">
        <span>Font size</span>
        <select value={options.fontSize} onChange={(e) => set('fontSize', e.target.value as LatexOptions['fontSize'])}>
          <option value="10pt">10 pt</option>
          <option value="11pt">11 pt</option>
          <option value="12pt">12 pt</option>
        </select>
      </label>

      <div className="options__section">Layout</div>
      <label className="options__row" title="Left aligns every equation flush left, with notes on the right.">
        <span>Equations</span>
        <select value={options.align} onChange={(e) => set('align', e.target.value as LatexOptions['align'])}>
          <option value={ALIGN.left}>Left, like the output</option>
          <option value={ALIGN.center}>Centered</option>
        </select>
      </label>
      {check('numberSections', 'Number sections', 'Sections and subsections numbered 1, 1.1, … as in the output.')}
      {check('cards', 'Blocks as cards', 'Blocks and constants with a bar on the left and a shaded title (LaTeX uses the mdframed package).')}
      {check('compact', 'Compact spacing', 'Less space around equations; paragraphs spaced instead of indented. (LaTeX only.)')}

      <div className="options__section">Title (optional)</div>
      {text('title', 'Title', 'e.g. Lab 3: Hydrogen orbitals')}
      {text('author', 'Author')}
      {check('date', 'Today’s date', 'Shown under the title.')}

      <button className="options__reset" onClick={() => onChange(DEFAULT_LATEX_OPTIONS)}>Reset to defaults</button>
    </div>
  )
}
