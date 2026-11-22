import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { canLinkFiles, chooseDataFile } from './lib/data/files.ts'
import { withImportedData, withoutImport } from './lib/data/csv.ts'
import { useSheets, type SaveState } from './useSheets.ts'
import { SheetTabs } from './components/SheetTabs.tsx'
import { EditorPane } from './components/EditorPane.tsx'
import { PreviewPane } from './components/PreviewPane.tsx'
import { SplitPane } from './components/SplitPane.tsx'
import { evaluateSheetTimed } from './lib/sheet/document.ts'
import { collectDefinitions, collectDiagnostics, collectResults, collectSymbols } from './lib/sheet/sheetIndex.ts'
import { loadInlineResultsShown, saveInlineResultsShown } from './editor/inlineResults.ts'
import type { LineValue } from './lib/engine/index.ts'

/** No inline results (turned off): one empty map, so the editor isn't told again on each evaluation. */
const NO_RESULTS: ReadonlyMap<number, LineValue> = new Map()
import type { CalcOptions } from './lib/engine/index.ts'
import {
  DEFAULT_SYNTAX_THEME, customPalette, loadCustomSyntax, loadSyntaxTheme, saveCustomSyntax, saveSyntaxTheme,
  type CustomSyntax, type SyntaxThemeId,
} from './editor/themes.ts'
import { SyntaxOptions } from './components/SyntaxOptions.tsx'
import { SuggestionOptions } from './components/SuggestionOptions.tsx'
import { ShortcutOptions } from './components/ShortcutOptions.tsx'
import { TemplateMenu } from './components/TemplateMenu.tsx'
import { loadAcceptKeys, saveAcceptKeys, type AcceptKeys } from './editor/intellisense.ts'
import { applyAppTheme, loadAppTheme, saveAppTheme, useAppearance, watchSystemTheme, type AppThemeId } from './appTheme.ts'
import { ThemeMenu } from './components/ThemeMenu.tsx'
import { CreateDialog } from './components/CreateDialog.tsx'
import { ExportDialog } from './components/ExportDialog.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { EVALUATION, PANE, loadCalcOptions, saveCalcOptions, type Pane } from './config.ts'
import { useNarrow } from './useNarrow.ts'
import { Dropdown } from './components/Dropdown.tsx'
import { Icon, IconLabel } from './components/icons.tsx'
import { useSettled } from './useSettled.ts'
import { copyText, useFlash } from './useFlash.ts'
import { MAX_SHARE_LINK, shareLink, sharedSheet } from './lib/data/share.ts'
import './App.css'

/** How the save state reads in the top bar. */
const SAVE_LABELS: Record<SaveState, string> = {
  saved: 'saved',
  unsaved: 'unsaved changes',
  saving: 'saving…',
  error: 'not saved',
}

export default function App() {
  // The output options, as set last time in this browser, and remembered as they change.
  const [options, setOptionsState] = useState<CalcOptions>(loadCalcOptions)
  const setOptions = useCallback((next: CalcOptions) => {
    setOptionsState(next)
    saveCalcOptions(next)
  }, [])
  // The open sheets (tabs); everything below works on the active one.
  const file = useSheets()
  const source = file.active.text
  const linked = file.active.handle !== null
  const error = file.active.error

  // Sharing by link: the sheet is all in the link's # part (lib/data/share.ts). Opening one opens its sheet in a
  // new tab, then takes the # part off the address, so a reload doesn't open it again; on load, and when a link
  // is pasted into this tab's address bar.
  const newSheet = file.newSheet
  /** The # part last opened (so one isn't opened twice, as React's strict mode runs the effect twice in development). */
  const openedShare = useRef<string | null>(null)
  useEffect(() => {
    const openShared = () => {
      const fragment = window.location.hash
      if (!fragment || fragment === openedShare.current) return
      openedShare.current = fragment
      void sharedSheet(fragment).then((shared) => {
        if (!shared) return
        newSheet(shared.name || undefined, shared.text)
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      })
    }
    openShared()
    window.addEventListener('hashchange', openShared)
    return () => window.removeEventListener('hashchange', openShared)
  }, [newSheet])
  const [shareFlash, showShareFlash] = useFlash<'share'>()
  const share = async () => {
    const link = await shareLink(window.location.href, file.active.name, source)
    if (link.length > MAX_SHARE_LINK) return showShareFlash('share', 'Too long for a link: send the file')
    showShareFlash('share', (await copyText(link)) ? 'Link copied' : 'Couldn’t copy the link')
  }
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
  // Each line's result at its end in the editor, unless turned off (and remembered).
  const [inlineShown, setInlineShown] = useState(loadInlineResultsShown)
  const changeInlineShown = (shown: boolean) => {
    setInlineShown(shown)
    saveInlineResultsShown(shown)
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
  // The Export dialog (the sheet as a Word or LaTeX document).
  const [exporting, setExporting] = useState(false)

  // The sheet, worked out on every keystroke if that's quick; if the last time
  // was slow, once typing pauses (see EVALUATION), so the editor never waits.
  // (A sheet switched to is worked out at once: useSettled's key.)
  const [slow, setSlow] = useState(false)
  const evaluated = useSettled(source, slow ? EVALUATION.pauseMs : 0, file.active.id)
  const evaluation = useMemo(() => evaluateSheetTimed(evaluated, options), [evaluated, options])
  // (Kept from the last evaluation: React re-renders straight away when it changes.)
  const nowSlow = evaluation.ms >= EVALUATION.instantBelowMs
  if (nowSlow !== slow) setSlow(nowSlow)
  const { sheet } = evaluation
  const diagnostics = useMemo(() => collectDiagnostics(sheet.blocks), [sheet.blocks])
  const results = useMemo(() => (inlineShown ? collectResults(sheet.blocks) : NO_RESULTS), [sheet.blocks, inlineShown])
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
  // `@import()`: choose a CSV file and put its rows into the sheet under that line.
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
  // A narrow screen (a phone) shows Input or Output, with a switch between them; tapping the output goes to its
  // line in the input, and switching to the output scrolls it to the cursor's line.
  const narrow = useNarrow()
  const [pane, setPane] = useState<Pane>(PANE.input)
  const showOutput = () => {
    setPane(PANE.output)
    setCenterOutput((n) => n + 1)
  }
  const jumpTo = useCallback((line: number) => {
    setActiveLine(line)
    setJump((j) => ({ line, n: (j?.n ?? 0) + 1 }))
    setPane(PANE.input)
  }, [])

  // The file buttons, as icons: in the top bar, or on a narrow screen in its menu (where their words show too).
  // Each one's words are its tooltip's first line and what a screen reader reads.
  const fileButtons = (
    <>
      <button onClick={() => file.newSheet()} title={'New\nA new, empty sheet in its own tab'}>
        <Icon name="newSheet" /><IconLabel>New</IconLabel>
      </button>
      <button onClick={() => setCreating(true)} title={'Create\nHave an AI write a test, assignment, worked examples or a lab write-up'}>
        <Icon name="create" /><IconLabel>Create</IconLabel>
      </button>
      <button onClick={() => void file.open()} title={'Open (Ctrl+O)\nOne or more sheets, each in its own tab'}>
        <Icon name="open" /><IconLabel>Open</IconLabel>
      </button>
      <button onClick={() => void file.save()} title={canLinkFiles ? 'Save (Ctrl+S)' : 'Save (Ctrl+S)\nDownloads the sheet'}>
        <Icon name="save" /><IconLabel>Save</IconLabel>
      </button>
      <button onClick={() => void file.saveAs()} title={'Save as (Ctrl+Shift+S)\nTo a new file'}>
        <Icon name="saveAs" /><IconLabel>Save as</IconLabel>
      </button>
      <button onClick={() => setExporting(true)} title={'Export\nDownload the sheet as a Word or LaTeX document'}>
        <Icon name="exportDocument" /><IconLabel>Export</IconLabel>
      </button>
      <button
        onClick={() => void share()}
        title={"Share\nCopy a link that opens this sheet: it's all in the link, so nothing is uploaded"}
      >
        <Icon name={shareFlash ? 'done' : 'share'} /><IconLabel>Share</IconLabel>
      </button>
    </>
  )

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
          {/* (Share's "Link copied", which its icon only hints at with a tick.) */}
          {shareFlash && <span className="filebar__flash" role="status">{shareFlash.message}</span>}
          <TemplateMenu onNew={file.newSheet} />
          {narrow
            ? <Dropdown label="File" icon="menu" panelLabel="File" closeOnChoose><div className="file-menu">{fileButtons}</div></Dropdown>
            : fileButtons}
        </div>
        <ThemeMenu theme={appTheme} onChange={changeAppTheme} />
      </header>
      <CreateDialog open={creating} onClose={() => setCreating(false)} onCreate={file.newSheet} />
      <ExportDialog open={exporting} onClose={() => setExporting(false)} blocks={sheet.blocks} fileName={file.active.name} />
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
      {narrow && (
        <div className="pane-switch" role="tablist" aria-label="Show">
          <button role="tab" aria-selected={pane === PANE.input} onClick={() => setPane(PANE.input)}>Input</button>
          <button role="tab" aria-selected={pane === PANE.output} onClick={showOutput}>Output</button>
        </div>
      )}
      <main className="app__main">
        <SplitPane
          only={narrow ? (pane === PANE.input ? 'left' : 'right') : undefined}
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
              results={results}
              hintsShown={inlineShown}
              wrap={narrow}
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
                  <label className="options__row">
                    <input type="checkbox" checked={inlineShown} onChange={(e) => changeInlineShown(e.target.checked)} />
                    <span>Show results in the editor</span>
                  </label>
                  <p className="options__help">Each line's result, faintly, at the end of the line, and a series' members' names (x₁, x₂, …) before its values when it's written over several lines.</p>
                  <ShortcutOptions />
                </>
              }
            />
          }
          right={
            <ErrorBoundary name="The output" resetKey={sheet}>
            <PreviewPane
              sheet={sheet}
              options={options}
              onOptionsChange={setOptions}
              activeLine={activeLine}
              centerRequest={centerOutput}
              onJump={jumpTo}
              onInsert={insertText}
              onRemoveImport={removeImport}
            />
            </ErrorBoundary>
          }
        />
      </main>
    </div>
  )
}
