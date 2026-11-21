/** Settings, declared: each kind read and written back, and a call's settings read, written and listed in their error. */
import { describe, expect, it } from 'vitest'
import {
  ChoiceSetting, FlagSetting, NameSetting, RowsSetting, SettingsSpec, SwitchSetting, TitleSetting,
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
  new RowsSetting('Which rows.'),
  new ChoiceSetting<Demo, Demo['shade']>('shade', 'shade', [{ value: 'light', means: 'pale' }, { value: 'dark', means: 'deep' }], 'dark', 'How it’s shaded.'),
  new SwitchSetting('marks', 'marks', 'Its marks.'),
  new FlagSetting('every row', 'every', 'Every row.'),
  new NameSetting('key', 'key', 'salts', 'A series down the side.'),
  new TitleSetting('Its title.'),
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
    expect(DEMO.settings[1].values).toEqual([{ value: 'light', means: 'pale' }, { value: 'dark', means: 'deep' }])
    expect(DEMO.settings[2].values).toBeUndefined()
  })
})
