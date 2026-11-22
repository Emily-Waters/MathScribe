/** The language, described from its declarations: a call's settings in Markdown, as the AI primer and the reference list them. */
import { describe, expect, it } from 'vitest'
import { ChoiceSetting, RowsSetting, SettingsSpec, SwitchSetting } from './settings.ts'
import { referenceMarkdown, settingsCallExample, settingsTopic, valuesText } from './reference.ts'
import { languageTopics } from '../engine/index.ts'
import { BUILTIN_CONSTANTS } from '../constants.ts'

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
  it('are a topic of the tree: how they’re written in the call, then each, with its values and a sheet using it', () => {
    expect(settingsCallExample(DEMO.describe())).toBe('@demo(…; shade dark, marks off)')
    const topic = settingsTopic(DEMO.describe(), { id: 'demo-settings', title: 'Demo settings', after: 'basics' }, (settings) => `@demo(x; ${settings})`)
    expect(topic.entries.map((e) => [e.syntax, e.explain, e.examples[0].source])).toEqual([
      [undefined, '@demo(…)\'s settings go after a semicolon in its brackets, separated by commas: @demo(…; shade dark, marks off). '
        + 'Leave out any as it is by itself. Its ⚙ in the editor sets them too.', '@demo(x; shade dark, marks off)'],
      [['rows 5-20'], 'Which rows.', '@demo(x; rows 5-20)'],
      [['shade dark'], 'How it’s shaded. light: pale; dark: deep.', '@demo(x; shade dark)'],
      [['marks off'], 'Its marks.', '@demo(x; marks off)'],
    ])
  })

  it('list values that say what they mean as they are', () => {
    const colours = { label: 'Colour', summary: 'A colour.', examples: ['colour red'], values: [{ value: 'red', label: 'red', means: 'red' }, { value: 'blue', label: 'blue', means: 'blue' }] }
    expect(valuesText(colours)).toBe('One of `red`, `blue`')
  })
})

describe('docs/REFERENCE.md', () => {
  // (Written again by `npx vitest run -u` after the tree changes; a test fails until it is.)
  it('is the language tree, as it is now', async () => {
    const constants = Object.entries(BUILTIN_CONSTANTS).map(([name, c]) => ({ name, description: c.description }))
    await expect(referenceMarkdown(languageTopics(), constants)).toMatchFileSnapshot('../../../docs/REFERENCE.md')
  })
})
