import { SHORTCUTS, keyLabel } from '../editor/shortcuts.ts'

/** Whether the app is on a Mac, where Ctrl is ⌘ (and the keys are shown so). */
const ON_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** The keyboard shortcuts, listed in the editor's Options menu: the keys as they're bound (editor/shortcuts.ts). */
export function ShortcutOptions() {
  return (
    <>
      <div className="options__section">Keyboard shortcuts</div>
      <dl className="options__shortcuts">
        {SHORTCUTS.map((s) => (
          <div key={s.does}>
            <dt>
              {s.keys.map((k) => keyLabel(k, ON_MAC)).join(' / ')}
              {s.also && <span className="options__shortcuts-also">{` · ${s.also}`}</span>}
            </dt>
            <dd>{s.does}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}
