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
import { SAMPLE } from './lib/sample.ts'


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
