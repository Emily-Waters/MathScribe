import { useCallback, useEffect, useMemo, useState } from 'react'
import { canLinkFiles, loadDraft } from './lib/files.ts'
import { useSheetFile, type SaveState } from './useSheetFile.ts'
import { EditorPane } from './components/EditorPane.tsx'
import { PreviewPane } from './components/PreviewPane.tsx'
import { SplitPane } from './components/SplitPane.tsx'
import { collectDefinitions, collectDiagnostics, collectSymbols, evaluateSheet } from './lib/document.ts'
import type { CalcOptions } from './lib/engine.ts'
import {
  DEFAULT_SYNTAX_THEME, customPalette, loadCustomSyntax, loadSyntaxTheme, saveCustomSyntax, saveSyntaxTheme,
  type CustomSyntax, type SyntaxThemeId,
} from './editor/themes.ts'
import { SyntaxOptions } from './components/SyntaxOptions.tsx'
import { applyAppTheme, loadAppTheme, saveAppTheme, useAppearance, watchSystemTheme, type AppThemeId } from './appTheme.ts'
import { ThemeMenu } from './components/ThemeMenu.tsx'
import './App.css'

const SAMPLE = `# Block sliding down a ramp
> A block is released from rest on a frictionless incline.

m = 2.00 kg              # mass of block
g = 9.81 m/s^2           # gravitational acceleration
theta = 30.0 deg pm 0.5 deg  # incline angle, measured
d = 3.50 m pm 0.02 m     # length of ramp, measured

## Forces
F_g = m * g              # weight
F_par = F_g * sin(theta) # component along the ramp
a = F_par / m            # acceleration

## Motion
v_f = sqrt(2 * a * d)    # speed at the bottom
t = v_f / a              # time on the ramp
E_k = 1/2 * m * v_f^2    # kinetic energy at the bottom
v_f to km/h

## Uncertainty
> Values with pm carry an uncertainty; results combine them in quadrature.
delta v_f =              # how the uncertainty in v_f is worked out
delta v_f / v_f          # relative uncertainty

## Repeated measurements
> Numbered variables form a series: t is their sum, t_avg the mean ± σ/√n.
t_1 = 1.21 s
t_2 = 1.17 s
t_3 = 1.24 s
t_4 = 1.19 s
t_avg                    # mean time down the ramp
t_count
a_exp = 2 * d / t_avg^2  # measured acceleration, with uncertainty

## Functions
> Define a function with def and an indented body; values and uncertainties flow through it.
def KE(mass, speed)
    E = 1/2 * mass * speed^2   # local to the function
    return E
E_bottom = KE(m, v_f)    # same as E_k above
> A one-line function can be written the way it is in maths.
p(mass, speed) = mass * speed
p_bottom = p(m, v_f)

## Constants
> Built-in constants start with @ (3 sig figs unless you write @name:n or @name:exact).
@constants {
    rho_w = 998 kg/m^3   # water at 20 °C
}
P_water = @rho_w * @g * 0.250 m to kPa   # pressure 25 cm under water
E_photon = @h * @c / 532 nm to eV        # green laser photon

## Solving
> solve(equation, unknown) rearranges the equation and evaluates the result.
d_stop = solve(v_f^2 = 2*a*d_stop, d_stop)     # ramp length needed to reach v_f
h0 = 2.00 m
t_fall = solve(h0 = 1/2*@g*t_fall^2 + v_f*t_fall, t_fall)   # quadratic: positive root

## What if?
> Variables assigned inside a block are local to it, like a scoped block in code.
Steeper ramp {           # outer values are readable, and can be shadowed
  theta = 45 deg         # 2 sig figs, so results here have 2
  a = g * sin(theta)
  v_f = sqrt(2 * a * d)
}
v_f                      # unchanged outside the block
`

/** Pick up where you left off: the browser's copy, or the example sheet the first time. */
const draft = loadDraft()

const SAVE_LABELS: Record<SaveState, string> = {
  saved: 'saved',
  unsaved: 'unsaved changes',
  saving: 'saving…',
  error: 'not saved',
}

export default function App() {
  const [source, setSource] = useState(draft?.text ?? SAMPLE)
  const [options, setOptions] = useState<CalcOptions>({ precision: 'auto', showSubstitution: true, approxRounded: false })
  const file = useSheetFile(source, setSource, draft?.name)
  const [syntaxTheme, setSyntaxTheme] = useState<SyntaxThemeId>(loadSyntaxTheme)
  const [appTheme, setAppTheme] = useState<AppThemeId>(loadAppTheme)
  useEffect(() => {
    applyAppTheme(appTheme)
    return watchSystemTheme(appTheme)
  }, [appTheme])
  const changeAppTheme = (id: AppThemeId) => {
    setAppTheme(id)
    saveAppTheme(id)
  }
  // Custom colours: until any are set, Custom starts from the theme chosen before it.
  const [customSyntax, setCustomSyntax] = useState<CustomSyntax | null>(loadCustomSyntax)
  const changeCustomSyntax = (c: CustomSyntax) => {
    setCustomSyntax(c)
    saveCustomSyntax(c)
  }
  const appearance = useAppearance()
  // Worked out on every render (it's cheap): a preset's colours depend on the app
  // theme as well as light/dark (Minimal uses the text colour, for instance).
  const activeCustom = customSyntax ?? { base: DEFAULT_SYNTAX_THEME }
  const syntaxPalette = syntaxTheme === 'custom' ? customPalette(activeCustom, appearance.mode) : null
  const changeSyntaxTheme = (id: SyntaxThemeId) => {
    if (id === 'custom') {
      const untouched = !customSyntax
        || !Object.keys({ ...customSyntax.light, ...customSyntax.dark }).length
      if (untouched) {
        changeCustomSyntax({ base: syntaxTheme === 'custom' ? DEFAULT_SYNTAX_THEME : syntaxTheme })
      }
    }
    setSyntaxTheme(id)
    saveSyntaxTheme(id)
  }

  const newSheet = () => {
    // The file itself is safe if it's linked and saved; otherwise check first.
    if (source.trim() && file.state !== 'saved'
      && !window.confirm('Start a new sheet? Changes not saved to a file will be lost.')) return
    file.newSheet()
  }

  // Ctrl/⌘+S saves, Ctrl/⌘+Shift+S saves as, Ctrl/⌘+O opens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        void (e.shiftKey ? file.saveAs() : file.save())
      } else if (key === 'o') {
        e.preventDefault()
        void file.open()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [file])
  const sheet = useMemo(() => evaluateSheet(source, options), [source, options])
  const diagnostics = useMemo(() => collectDiagnostics(sheet.blocks), [sheet.blocks])
  const definitions = useMemo(() => collectDefinitions(sheet.blocks), [sheet.blocks])
  const symbols = useMemo(() => collectSymbols(sheet, source), [sheet, source])

  // Linking: the editor's cursor line highlights its output; clicking output
  // moves the cursor to that line.
  const [activeLine, setActiveLine] = useState<number | null>(null)
  const [jump, setJump] = useState<{ line: number; n: number } | null>(null)
  const jumpTo = useCallback((line: number) => {
    setActiveLine(line)
    setJump((j) => ({ line, n: (j?.n ?? 0) + 1 }))
  }, [])

  return (
    <div className="app">
      <header className="app__bar">
        <h1>MathScribe</h1>
        <span className="app__tagline">plain-text calculations, typeset</span>
        <div className="filebar">
          <span
            className={`filebar__status filebar__status--${file.state}`}
            title={file.error ?? (file.linked
              ? 'Changes are saved to this file automatically.'
              : canLinkFiles
                ? 'Kept in this browser. Save to a file to auto-save there too.'
                : 'Kept in this browser. Save downloads a copy of the file.')}
          >
            <span className="filebar__name">{file.name}</span>
            {' · '}
            {file.linked || file.state === 'saved' ? SAVE_LABELS[file.state] : 'in this browser'}
            {file.linked && file.state !== 'error' && <span className="filebar__auto"> (auto-save on)</span>}
          </span>
          <button onClick={newSheet} title="Start an empty sheet">New</button>
          <button onClick={() => void file.open()} title="Open a sheet (Ctrl+O)">Open</button>
          <button onClick={() => void file.save()} title={canLinkFiles ? 'Save (Ctrl+S)' : 'Download the sheet (Ctrl+S)'}>
            Save
          </button>
          <button onClick={() => void file.saveAs()} title="Save to a new file (Ctrl+Shift+S)">Save as</button>
        </div>
        <ThemeMenu theme={appTheme} onChange={changeAppTheme} />
      </header>
      {file.error && <div className="app__error" role="alert">{file.error}</div>}
      {!file.draftKept && (
        <div className="app__error" role="alert">
          This browser isn't letting MathScribe keep a copy of your work. Save to a file to keep it.
        </div>
      )}
      <main className="app__main">
        <SplitPane
          left={
            <EditorPane
              value={source}
              onChange={setSource}
              jump={jump}
              onCursorLine={setActiveLine}
              diagnostics={diagnostics}
              definitions={definitions}
              symbols={symbols}
              theme={syntaxTheme}
              dark={appearance.mode === 'dark'}
              customPalette={syntaxPalette}
              options={
                <SyntaxOptions
                  theme={syntaxTheme}
                  onThemeChange={changeSyntaxTheme}
                  custom={activeCustom}
                  palette={syntaxPalette}
                  mode={appearance.mode}
                  onCustomChange={changeCustomSyntax}
                />
              }
            />
          }
          right={
            <PreviewPane
              sheet={sheet}
              options={options}
              onOptionsChange={setOptions}
              activeLine={activeLine}
              onJump={jumpTo}
            />
          }
        />
      </main>
    </div>
  )
}
