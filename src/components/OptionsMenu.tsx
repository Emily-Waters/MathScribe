import { AUTO_PRECISION, UNCERTAINTY_WORKING, type CalcOptions, type UncertaintyWorking } from '../lib/engine/index.ts'
import { Dropdown } from './Dropdown.tsx'

interface OptionsMenuProps {
  options: CalcOptions
  onChange: (options: CalcOptions) => void
}

/** The output's display settings: how results are rounded, then how their working is written (in each, menus, then checkboxes). */
export function OptionsMenu({ options, onChange }: OptionsMenuProps) {
  return (
    <Dropdown label="Output options" icon="options" panelLabel="Output options">
      <div className="options__section">Results</div>
      <label className="options__row" title="Auto works out each result’s sig figs from the values used to compute it.">
        <span>Sig figs</span>
        <select
          value={String(options.precision)}
          onChange={(e) => {
            const v = e.target.value
            onChange({ ...options, precision: v === AUTO_PRECISION ? AUTO_PRECISION : Number(v) })
          }}
        >
          <option value="auto">Auto</option>
          {[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label
        className="options__row"
        title="Off: ≈ only when every input is exact (1/3 ≈ 0.333). Measured results use =, since their sig figs already show the rounding."
      >
        <span>Use ≈ for every rounded result</span>
        <input
          type="checkbox"
          checked={!!options.approxRounded}
          onChange={(e) => onChange({ ...options, approxRounded: e.target.checked })}
        />
      </label>

      <div className="options__section">Working</div>
      <label
        className="options__row"
        title={'How δF is worked out on the page; the result is the same. Relative: products and quotients as '
          + 'δY = Y√((δA/A)² + (δB/B)²), sums as δY = √(δA² + δB²); any other formula by derivatives.'}
      >
        <span>Uncertainty working</span>
        <select
          value={options.uncertaintyWorking ?? UNCERTAINTY_WORKING.derivatives}
          onChange={(e) => onChange({ ...options, uncertaintyWorking: e.target.value as UncertaintyWorking })}
        >
          <option value={UNCERTAINTY_WORKING.derivatives}>Partial derivatives</option>
          <option value={UNCERTAINTY_WORKING.relative}>Relative</option>
        </select>
      </label>
      <label className="options__row" title="Include the step with values put in for the variables.">
        <span>Show substitution</span>
        <input
          type="checkbox"
          checked={options.showSubstitution}
          onChange={(e) => onChange({ ...options, showSubstitution: e.target.checked })}
        />
      </label>
      <label
        className="options__row"
        title="Off: products are written as in a textbook (ma, ½mv²), with × only where a number comes next or a unit ends a factor (2.0 kg × 9.81 m/s²)."
      >
        <span>Show · in every product</span>
        <input
          type="checkbox"
          checked={!!options.productDots}
          onChange={(e) => onChange({ ...options, productDots: e.target.checked })}
        />
      </label>
    </Dropdown>
  )
}
