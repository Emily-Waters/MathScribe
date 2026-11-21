/**
 * The language, described from its declarations: what the reference, the AI
 * primer and (to come) docs/REFERENCE.md say about it is made here, from what
 * the core and the modules declare, so none of it is written by hand or can be
 * out of date with what's read. (See "One source for the language" in TODO.md.)
 */
import { SIGIL } from '../syntax.ts'
import type { SettingDescription, SettingsDescription } from './settings.ts'

/** Code, in Markdown. */
const md = (text: string) => `\`${text}\``

/** A call's settings as written in it, after a semicolon: `@plot(…; fit linear, legend top right)`. */
export const settingsCallExample = (d: SettingsDescription): string =>
  `${SIGIL}${d.call}(…; ${d.settings.slice(1, 3).map((s) => s.examples[0]).join(', ')})`

/**
 * A choice's values, each with what it means: `points`: each row a point;
 * `lines`: …. Values that say what they mean themselves (colours) are listed:
 * one of `black`, `grey`, ….
 */
export function valuesText(s: SettingDescription, code: (text: string) => string = md): string {
  const values = s.values ?? []
  if (values.every((v) => v.means === v.value)) return `One of ${values.map((v) => code(v.value)).join(', ')}`
  return values.map((v) => `${code(v.value)}: ${v.means}`).join('; ')
}

/** A call's settings, in Markdown: what they're written after, then each, how it's written, what it does, and its values. */
export function settingsMarkdown(d: SettingsDescription, heading = '###'): string {
  const lines = [
    `${heading} Settings of ${md(`${SIGIL}${d.call}(…)`)}`,
    '',
    `After a semicolon in its brackets, separated by commas: ${md(settingsCallExample(d))}. Leave out any as it is by itself.`,
    '',
    ...d.settings.map((s) => {
      const values = s.values ? ` ${valuesText(s)}.` : ''
      return `- ${s.examples.map(md).join(', ')}: ${s.summary}${values}`
    }),
  ]
  return lines.join('\n')
}
