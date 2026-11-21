/** The language, described from its declarations: a call's settings in Markdown, as the AI primer and the reference list them. */
import { describe, expect, it } from 'vitest'
import { ChoiceSetting, RowsSetting, SettingsSpec, SwitchSetting } from './settings.ts'
import { settingsCallExample, settingsMarkdown, valuesText } from './reference.ts'

interface Demo {
  from?: number
  to?: number
  shade: 'light' | 'dark'
  marks: boolean
}

const DEMO = new SettingsSpec<Demo>('demo', () => ({ shade: 'light', marks: true }), [
  new RowsSetting({ label: 'Rows', summary: 'Which rows.' }),
  new ChoiceSetting<Demo, Demo['shade']>('shade', 'shade', [
    { value: 'light', label: 'Light', means: 'pale' },
    { value: 'dark', label: 'Dark', means: 'deep' },
  ], 'dark', { label: 'Shade', summary: 'How it’s shaded.', help: 'Only in the menu.' }),
  new SwitchSetting('marks', 'marks', { label: 'Show marks', summary: 'Its marks.' }),
])

describe('a call’s settings, described', () => {
  it('list each as it’s written, what it does and its values, after how they’re written in the call', () => {
    expect(settingsCallExample(DEMO.describe())).toBe('@demo(…; shade dark, marks off)')
    expect(settingsMarkdown(DEMO.describe())).toBe([
      '### Settings of `@demo(…)`',
      '',
      'After a semicolon in its brackets, separated by commas: `@demo(…; shade dark, marks off)`. Leave out any as it is by itself.',
      '',
      '- `rows 5-20`: Which rows.',
      '- `shade dark`: How it’s shaded. `light`: pale; `dark`: deep.',
      '- `marks off`: Its marks.',
    ].join('\n'))
  })

  it('list values that say what they mean as they are', () => {
    const colours = { label: 'Colour', summary: 'A colour.', examples: ['colour red'], values: [{ value: 'red', label: 'red', means: 'red' }, { value: 'blue', label: 'blue', means: 'blue' }] }
    expect(valuesText(colours)).toBe('One of `red`, `blue`')
  })
})
