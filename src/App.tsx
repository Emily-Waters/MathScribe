import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { canLinkFiles, chooseDataFile } from './lib/files.ts'
import { withImportedData, withoutImport } from './lib/csv.ts'
import { useSheets, type SaveState } from './useSheets.ts'
import { SheetTabs } from './components/SheetTabs.tsx'
import { EditorPane } from './components/EditorPane.tsx'
import { PreviewPane } from './components/PreviewPane.tsx'
import { SplitPane } from './components/SplitPane.tsx'
import { collectDefinitions, collectDiagnostics, collectSymbols, evaluateSheetTimed } from './lib/document.ts'
import type { CalcOptions } from './lib/engine.ts'
import {
  DEFAULT_SYNTAX_THEME, customPalette, loadCustomSyntax, loadSyntaxTheme, saveCustomSyntax, saveSyntaxTheme,
  type CustomSyntax, type SyntaxThemeId,
} from './editor/themes.ts'
import { SyntaxOptions } from './components/SyntaxOptions.tsx'
import { SuggestionOptions } from './components/SuggestionOptions.tsx'
import { loadAcceptKeys, saveAcceptKeys, type AcceptKeys } from './editor/intellisense.ts'
import { applyAppTheme, loadAppTheme, saveAppTheme, useAppearance, watchSystemTheme, type AppThemeId } from './appTheme.ts'
import { ThemeMenu } from './components/ThemeMenu.tsx'
import { CreateDialog } from './components/CreateDialog.tsx'
import { DEFAULT_CALC_OPTIONS, EVALUATION } from './config.ts'
import { useSettled } from './useSettled.ts'
import './App.css'

/** How the save state reads in the top bar. */
const SAVE_LABELS: Record<SaveState, string> = {
  saved: 'saved',
  unsaved: 'unsaved changes',
  saving: 'saving…',
  error: 'not saved',
}

export default function App() {
  const [options, setOptions] = useState<CalcOptions>(DEFAULT_CALC_OPTIONS)
  // The open sheets (tabs); everything below works on the active one.
  const file = useSheets()
  const source = file.active.text
  const linked = file.active.handle !== null
  const error = file.active.error
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
  // Which keys accept a suggestion in the editor (Tab, or Tab and Enter).
  const [acceptKeys, setAcceptKeys] = useState<AcceptKeys>(loadAcceptKeys)
  const changeAcceptKeys = (keys: AcceptKeys) => {
    setAcceptKeys(keys)
    saveAcceptKeys(keys)
  }
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
  // The Create dialog (a prompt for an AI to write a sheet, and its answer opened).
  const [creating, setCreating] = useState(false)

  // The sheet, worked out on every keystroke if that's quick; if the last time
  // was slow, once typing pauses (see EVALUATION), so the editor never waits.
  const [slow, setSlow] = useState(false)
  const evaluated = useSettled(source, slow ? EVALUATION.pauseMs : 0)
  const evaluation = useMemo(() => evaluateSheetTimed(evaluated, options), [evaluated, options])
  // (Kept from the last evaluation: React re-renders straight away when it changes.)
  const nowSlow = evaluation.ms >= EVALUATION.instantBelowMs
  if (nowSlow !== slow) setSlow(nowSlow)
  const { sheet } = evaluation
  const diagnostics = useMemo(() => collectDiagnostics(sheet.blocks), [sheet.blocks])
  const definitions = useMemo(() => collectDefinitions(sheet.blocks), [sheet.blocks])
  const symbols = useMemo(() => collectSymbols(sheet, evaluated), [sheet, evaluated])

  // Linking: the editor's cursor line highlights its output; clicking output
  // moves the cursor to that line.
  const [activeLine, setActiveLine] = useState<number | null>(null)
  const [jump, setJump] = useState<{ line: number; n: number } | null>(null)
  // Text from the Library tab, put in at the editor's cursor; `n` makes repeats distinct.
  const [insert, setInsert] = useState<{ text: string; n: number } | null>(null)
  const insertText = useCallback((text: string) => setInsert((i) => ({ text, n: (i?.n ?? 0) + 1 })), [])
  // A click in the editor centres that line's output; `n` makes repeat clicks distinct.
  const [centerOutput, setCenterOutput] = useState(0)
  const followCursor = useCallback((line: number, clicked: boolean) => {
    setActiveLine(line)
    if (clicked) setCenterOutput((n) => n + 1)
  }, [])
  // `import()`: choose a CSV file and put its rows into the sheet under that line.
  const latestSource = useRef(source)
  useEffect(() => {
    latestSource.current = source
  }, [source])
  const setText = file.setText
  const importFile = useCallback(async (line: number) => {
    const chosen = await chooseDataFile()
    if (chosen) setText(withImportedData(latestSource.current, line, chosen.name, chosen.text))
  }, [setText])
  const chooseImportFile = useCallback((line: number) => void importFile(line), [importFile])
  const removeImport = useCallback((line: number) => setText(withoutImport(latestSource.current, line)), [setText])
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
            title={error ?? (linked
              ? 'Changes are saved to this file automatically.'
              : canLinkFiles
                ? 'Kept in this browser. Save to a file to auto-save there too.'
                : 'Kept in this browser. Save downloads a copy of the file.')}
          >
            <span className="filebar__name">{file.active.name}</span>
            {' · '}
            {linked || file.state === 'saved' ? SAVE_LABELS[file.state] : 'in this browser'}
            {linked && file.state !== 'error' && <span className="filebar__auto"> (auto-save on)</span>}
          </span>
          <button onClick={() => file.newSheet()} title="A new, empty sheet in its own tab">New</button>
          <button onClick={() => setCreating(true)} title="Have an AI write a test, assignment, worked examples or a lab write-up">
            Create
          </button>
          <button onClick={() => void file.open()} title="Open one or more sheets, each in its own tab (Ctrl+O)">Open</button>
          <button onClick={() => void file.save()} title={canLinkFiles ? 'Save (Ctrl+S)' : 'Download the sheet (Ctrl+S)'}>
            Save
          </button>
          <button onClick={() => void file.saveAs()} title="Save to a new file (Ctrl+Shift+S)">Save as</button>
        </div>
        <ThemeMenu theme={appTheme} onChange={changeAppTheme} />
      </header>
      <CreateDialog open={creating} onClose={() => setCreating(false)} onCreate={file.newSheet} />
      {error && <div className="app__error" role="alert">{error}</div>}
      {!file.draftKept && (
        <div className="app__error" role="alert">
          This browser isn't letting MathScribe keep a copy of your work. Save to a file to keep it.
        </div>
      )}
      <SheetTabs
        sheets={file.sheets}
        activeId={file.active.id}
        onSelect={file.select}
        onClose={file.close}
        onNew={file.newSheet}
      />
      <main className="app__main">
        <SplitPane
          left={
            <EditorPane
              value={source}
              onChange={file.setText}
              docId={file.active.id}
              openIds={file.sheets.map((s) => s.id)}
              jump={jump}
              insert={insert}
              onCursorLine={followCursor}
              diagnostics={diagnostics}
              definitions={definitions}
              symbols={symbols}
              theme={syntaxTheme}
              dark={appearance.mode === 'dark'}
              customPalette={syntaxPalette}
              acceptKeys={acceptKeys}
              onChooseImport={chooseImportFile}
              options={
                <>
                  <SyntaxOptions
                    theme={syntaxTheme}
                    onThemeChange={changeSyntaxTheme}
                    custom={activeCustom}
                    palette={syntaxPalette}
                    mode={appearance.mode}
                    onCustomChange={changeCustomSyntax}
                  />
                  <SuggestionOptions acceptKeys={acceptKeys} onAcceptKeysChange={changeAcceptKeys} />
                </>
              }
            />
          }
          right={
            <PreviewPane
              sheet={sheet}
              options={options}
              onOptionsChange={setOptions}
              activeLine={activeLine}
              centerRequest={centerOutput}
              onJump={jumpTo}
              fileName={file.active.name}
              onInsert={insertText}
              onRemoveImport={removeImport}
            />
          }
        />
      </main>
    </div>
  )
}
