import {
  PRESET_THEMES, SYNTAX_THEMES, SYNTAX_TOKENS,
  type ColorMode, type CustomSyntax, type Palette, type PresetThemeId, type SyntaxThemeId, type SyntaxToken,
} from '../editor/themes.ts'

interface SyntaxOptionsProps {
  theme: SyntaxThemeId
  onThemeChange: (id: SyntaxThemeId) => void
  /** The Custom theme's settings, and its colours in the current mode. */
  custom: CustomSyntax | null
  palette: Palette | null
  mode: ColorMode
  onCustomChange: (custom: CustomSyntax) => void
}

/**
 * The editor's colour settings: a theme, and for Custom, a colour picker for
 * each kind of text, with a sample in its colour.
 */
export function SyntaxOptions({ theme, onThemeChange, custom, palette, mode, onCustomChange }: SyntaxOptionsProps) {
  const setColor = (token: SyntaxToken, color: string) => {
    if (!custom) return
    onCustomChange({ ...custom, [mode]: { ...custom[mode], [token]: color } })
  }
  const changed = (token: SyntaxToken) => custom?.[mode]?.[token] !== undefined
  const anyChanged = SYNTAX_TOKENS.some((t) => changed(t.id))
  const baseName = PRESET_THEMES.find((t) => t.id === custom?.base)?.name ?? 'preset'

  return (
    <>
      <label className="options__row">
        <span>Colours</span>
        <select value={theme} onChange={(e) => onThemeChange(e.target.value as SyntaxThemeId)}>
          {SYNTAX_THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <p className="options__help">{SYNTAX_THEMES.find((t) => t.id === theme)?.description}.</p>

      {theme === 'custom' && custom && palette && (
        <div className="syntax-custom">
          <label className="options__row">
            <span>Start from</span>
            <select
              value={custom.base}
              onChange={(e) => onCustomChange({ ...custom, base: e.target.value as PresetThemeId })}
            >
              {PRESET_THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <p className="options__help">
            Colours you haven’t changed follow this theme. You’re editing the
            {' '}<strong>{mode}</strong> colours; light and dark are kept separately, so
            switch the app theme to edit the other set.
          </p>

          <div className="syntax-custom__list">
            {SYNTAX_TOKENS.map((t) => (
              <div className="syntax-custom__row" key={t.id}>
                <input
                  type="color"
                  value={palette[t.id]}
                  aria-label={`${t.name} colour`}
                  onChange={(e) => setColor(t.id, e.target.value)}
                />
                <span className="syntax-custom__name">{t.name}</span>
                <code className="syntax-custom__sample" style={{ color: palette[t.id] }}>{t.sample}</code>
                {changed(t.id) && (
                  <button
                    className="syntax-custom__reset"
                    title={`Back to the ${baseName} colour`}
                    aria-label={`Reset ${t.name} colour`}
                    onClick={() => {
                      const rest = { ...custom[mode] }
                      delete rest[t.id]
                      onCustomChange({ ...custom, [mode]: rest })
                    }}
                  >
                    ↺
                  </button>
                )}
              </div>
            ))}
          </div>

          {anyChanged && (
            <button className="syntax-custom__reset-all" onClick={() => onCustomChange({ ...custom, [mode]: {} })}>
              Reset all {mode} colours
            </button>
          )}
        </div>
      )}
    </>
  )
}
