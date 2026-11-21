/** Settings, declared: each kind read and written back, and a call's settings read, written and listed in their error. */
import { describe, expect, it } from 'vitest'
import {
  ChoiceSetting, FlagSetting, NameSetting, RowsSetting, SettingsSpec, SwitchSetting, TitleSetting, type SettingsPanel,
} from './settings.ts'

/** A call's settings, with one of each kind. */
interface Demo {
  from?: number
  to?: number
  shade: 'light' | 'dark'
  marks: boolean
  every: boolean
  key?: string
  title?: string
}

const DEMO = new SettingsSpec<Demo>('demo', () => ({ shade: 'light', marks: true, every: false }), [
  new RowsSetting({ label: 'Rows', summary: 'Which rows.', help: 'Leave a box empty for the first or last.' }),
  new ChoiceSetting<Demo, Demo['shade']>('shade', 'shade', [
    { value: 'light', label: 'Light', means: 'pale' },
    { value: 'dark', label: 'Dark', means: 'deep' },
  ], 'dark', { label: 'Shade', summary: 'How it’s shaded.' }),
  new SwitchSetting('marks', 'marks', { label: 'Show marks', summary: 'Its marks.' }),
  new FlagSetting('every row', 'every', { label: 'Every row', summary: 'Every row.' }),
  new NameSetting('key', 'key', 'salts', { label: 'Key', summary: 'A series down the side.' }),
  new TitleSetting({ label: 'Title', summary: 'Its title.' }),
])

describe('a call’s declared settings', () => {
  it('are read into the settings, each kind its own way, and written back in the order declared, defaults left out', () => {
    const { settings, error } = DEMO.parse('title "A, b",  key salts, marks off, every   row, shade dark, rows 2-')
    expect(error).toBeUndefined()
    expect(settings).toEqual({ from: 2, to: undefined, shade: 'dark', marks: false, every: true, key: 'salts', title: 'A, b' })
    expect(DEMO.format(settings)).toBe('rows 2-, shade dark, marks off, every row, key salts, title "A, b"')
    expect(DEMO.format(DEMO.parse('shade light, marks on').settings)).toBe('')
  })

  it('say what isn’t one, listing each as it’s written', () => {
    expect(DEMO.parse('shade blue').error).toBe('"shade blue" isn\'t a demo setting: use rows 5-20, shade dark, marks off, every row, key salts, '
      + 'or title "…". The demo\'s ⚙ button sets them.')
  })

  it('list a choice’s values with what each means', () => {
    expect(DEMO.settings[1].values?.map((v) => v.means)).toEqual(['pale', 'deep'])
    expect(DEMO.settings[2].values).toBeUndefined()
  })

  it('give the ⚙ menu its controls, in order, with their help on hover, each setting the settings and saving their text', () => {
    // (A panel of text: each control as what it shows, with a way to use it.)
    const uses = new Map<string, (v: never) => void>()
    const panel: SettingsPanel<string> = {
      row: (label, ...controls) => `${label}: ${controls.join(' ')}`,
      checkBox: (on, set) => (uses.set(`check ${uses.size}`, set as never), `[${on ? 'x' : ' '}]`),
      choice: (options, value, set) => (uses.set(`choice ${uses.size}`, set as never), `<${options.map((o) => (o.value === value ? `*${o.label}` : o.label)).join('|')}>`),
      numberBox: (v, placeholder, _whole, set) => (uses.set(`number ${uses.size}`, set as never), `#${v ?? placeholder}`),
      textBox: (v, placeholder, set) => (uses.set(`text ${uses.size}`, set as never), `"${v ?? placeholder}"`),
      withTip: (row, text) => `${row} (${text})`,
    }
    const saved: string[] = []
    const controls = DEMO.controls(panel, 'rows 3-, key salts', (text) => saved.push(text))
    expect(controls).toEqual([
      'Rows: #3 to #last (Leave a box empty for the first or last.)', 'Shade: <*Light|Dark> (How it’s shaded.)', 'Show marks: [x] (Its marks.)',
      'Every row: [ ] (Every row.)', 'Key: "salts" (A series down the side.)', 'Title: "none" (Its title.)',
    ])
    uses.get('number 1')!(8 as never)
    uses.get('choice 2')!('dark' as never)
    uses.get('check 3')!(false as never)
    expect(saved).toEqual(['rows 3-8, key salts', 'rows 3-8, shade dark, key salts', 'rows 3-8, shade dark, marks off, key salts'])
  })
})
