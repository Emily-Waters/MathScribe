/**
 * The controls a call's settings are set with, as DOM elements: what each kind
 * of setting asks for (SettingsPanel, lib/language/settings.ts), for the plot's
 * ⚙ panel (tableMenu.ts) and a table's grid editor (tableEditor.tsx).
 */
import type { SettingsPanel } from '../../lib/plugin.ts'

/** A labelled row of the panel. */
function row(label: string, ...controls: (HTMLElement | string)[]): HTMLElement {
  const el = document.createElement('label')
  el.className = 'options__row'
  const span = document.createElement('span')
  span.textContent = label
  const box = document.createElement('span')
  box.className = 'cm-ms-table-menu__rows'
  box.append(...controls)
  el.append(span, controls.length === 1 && typeof controls[0] !== 'string' ? controls[0] : box)
  return el
}

/** A number box; `whole` for row numbers (1 or more), otherwise any number. Empty means "not set". */
function numberBox(value: number | undefined, placeholder: string, whole: boolean, set: (v: number | undefined) => void) {
  const input = document.createElement('input')
  input.type = 'number'
  if (whole) input.min = '1'
  else input.step = 'any'
  input.placeholder = placeholder
  input.value = value === undefined ? '' : String(value)
  input.addEventListener('change', () => {
    if (!input.value || !Number.isFinite(Number(input.value))) return set(undefined)
    set(whole ? Math.max(1, Math.round(Number(input.value))) : Number(input.value))
  })
  return input
}

function checkBox(value: boolean, set: (v: boolean) => void) {
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = value
  input.addEventListener('change', () => set(input.checked))
  return input
}

function choice(options: readonly { readonly value: string; readonly label: string }[], value: string, set: (value: string) => void) {
  const select = document.createElement('select')
  for (const o of options) select.add(new Option(o.label, o.value, false, value === o.value))
  select.addEventListener('change', () => set(select.value))
  return select
}

/** A group's heading. */
function section(title: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'options__section'
  el.textContent = title
  return el
}

/** A row with a tooltip (a setting's help, on hover). */
function withTip(row: HTMLElement, text: string) {
  row.title = text
  return row
}

/** A text box (empty for none). */
function textBox(value: string | undefined, placeholder: string, set: (text: string | undefined) => void): HTMLInputElement {
  const box = document.createElement('input')
  box.type = 'text'
  box.placeholder = placeholder
  box.value = value ?? ''
  box.addEventListener('change', () => set(box.value.trim() || undefined))
  return box
}

/** The panel's controls, as the settings' declarations ask for them (SettingsPanel). */
export const DOM_PANEL: SettingsPanel<HTMLElement> = { section, row, checkBox, choice, numberBox, textBox, withTip }
