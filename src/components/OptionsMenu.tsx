import type { CalcOptions } from '../lib/engine.ts'
import { Dropdown } from './Dropdown.tsx'

interface OptionsMenuProps {
  options: CalcOptions
  onChange: (options: CalcOptions) => void
  /** Hidden (but keeping its space, so the tabs beside it don't shift). */
  hidden?: boolean
}

/** The output's display settings. */
export function OptionsMenu({ options, onChange, hidden }: OptionsMenuProps) {
  return (
    <Dropdown label="Options" panelLabel="Output options" hidden={hidden}>
      <label className="options__row">
        <span>Sig figs</span>
        <select
          value={String(options.precision)}
          onChange={(e) => {
            const v = e.target.value
            onChange({ ...options, precision: v === 'auto' ? 'auto' : Number(v) })
          }}
        >
          <option value="auto">Auto</option>
          {[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <p className="options__help">Auto works out each result’s sig figs from the values used to compute it.</p>

      <label className="options__row">
        <input
          type="checkbox"
          checked={options.showSubstitution}
          onChange={(e) => onChange({ ...options, showSubstitution: e.target.checked })}
        />
        <span>Show substitution</span>
      </label>
      <p className="options__help">Include the step with values put in for the variables.</p>

      <label className="options__row">
        <input
          type="checkbox"
          checked={!!options.approxRounded}
          onChange={(e) => onChange({ ...options, approxRounded: e.target.checked })}
        />
        <span>Use ≈ for every rounded result</span>
      </label>
      <p className="options__help">
        Off: ≈ only when every input is exact (1/3 ≈ 0.333). Measured results use =,
        since their sig figs already show the rounding.
      </p>

      <label className="options__row">
        <input
          type="checkbox"
          checked={!!options.productDots}
          onChange={(e) => onChange({ ...options, productDots: e.target.checked })}
        />
        <span>Show · in every product</span>
      </label>
      <p className="options__help">
        Off: products are written as in a textbook (ma, ½mv²), with a dot only between
        numbers (2.0 kg · 9.81 m/s²).
      </p>
    </Dropdown>
  )
}
