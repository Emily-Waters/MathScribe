import { ACCEPT_KEYS, type AcceptKeys } from '../editor/intellisense.ts'

interface SuggestionOptionsProps {
  acceptKeys: AcceptKeys
  onAcceptKeysChange: (keys: AcceptKeys) => void
}

/** The editor's suggestion settings: which keys accept a suggestion. */
export function SuggestionOptions({ acceptKeys, onAcceptKeysChange }: SuggestionOptionsProps) {
  return (
    <>
      <label className="options__row">
        <span>Accept suggestions with</span>
        <select value={acceptKeys} onChange={(e) => onAcceptKeysChange(e.target.value as AcceptKeys)}>
          {ACCEPT_KEYS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
      </label>
      <p className="options__help">
        {ACCEPT_KEYS.find((k) => k.id === acceptKeys)?.description} Type a Greek letter
        with its name: \Delta, then Tab or a space, gives Δ.
      </p>
    </>
  )
}
