import { APP_THEMES, type AppThemeId } from '../appTheme.ts'
import { Dropdown } from './Dropdown.tsx'

interface ThemeMenuProps {
  theme: AppThemeId
  onChange: (id: AppThemeId) => void
}

/** The app's colour theme, in the top bar: each choice shown with a small swatch. */
export function ThemeMenu({ theme, onChange }: ThemeMenuProps) {
  return (
    <Dropdown label="Theme" panelLabel="App theme">
      <div role="radiogroup" aria-label="App theme">
        {APP_THEMES.map((t) => (
          <label key={t.id} className="theme-choice">
            <input
              type="radio"
              name="app-theme"
              checked={theme === t.id}
              onChange={() => onChange(t.id)}
            />
            <span
              className="theme-choice__swatch"
              aria-hidden="true"
              style={t.swatch
                ? { background: `linear-gradient(135deg, ${t.swatch[0]} 50%, ${t.swatch[1]} 50%)`, borderColor: t.swatch[2] }
                : undefined}
            />
            <span className="theme-choice__text">
              <span className="theme-choice__name">{t.name}</span>
              <span className="options__help">{t.description}</span>
            </span>
          </label>
        ))}
      </div>
    </Dropdown>
  )
}
