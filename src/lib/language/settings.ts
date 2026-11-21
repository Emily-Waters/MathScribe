/**
 * Settings, declared: what can be written after a semicolon in a call's
 * brackets, `@plot(t, x; fit linear, legend top right)`, each setting declared
 * once, with how it's written, what it means, and what it sets.
 *
 * From the declarations come reading a call's settings text into its settings
 * (SettingsSpec.parse), writing them back as text (format), and the error for
 * a setting that isn't one, which lists what is. They're the first part of
 * MathScribe's language described once, in a tree (see "One source for the
 * language" in TODO.md): the ⚙ menus and the reference are to be made from
 * them too.
 *
 * A kind of setting is a class extending Setting (a switch, a choice, a range
 * of rows, …); a module declares its calls' settings as a list of them, and
 * may add kinds of its own (a plot's axes, its colours).
 */

// ---------------------------------------------------------------------------
// Settings text: its parts, and the pieces several kinds of setting share
// ---------------------------------------------------------------------------

/** Between settings: `rows 5-20, lines grid`. */
export const SETTINGS_SEPARATOR = ','

/** A setting's value is quoted when it can hold commas: `title "Run 1, cart"`. */
const QUOTE = '"'

/** Between a range's ends: `rows 5-20`. */
const RANGE_DASH = '-'

/** The words settings share: a switch's `on` and `off`, a range's `from` and `to`. */
export const SETTING_WORD = { on: 'on', off: 'off', from: 'from', to: 'to', rows: 'rows', title: 'title' } as const

/** A setting as typed, tidied: trimmed, with single spaces inside. */
export const tidySetting = (part: string) => part.trim().replace(/\s+/g, ' ')

/** Settings text split into its settings, tidied (and empty ones left out), but not at a comma inside a quoted value. */
export function settingParts(text: string | undefined): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  for (const c of text ?? '') {
    if (c === QUOTE) quoted = !quoted
    if (c === SETTINGS_SEPARATOR && !quoted) {
      parts.push(current)
      current = ''
    } else current += c
  }
  parts.push(current)
  return parts.map(tidySetting).filter(Boolean)
}

/** Settings joined into their text. */
export const joinSettings = (parts: readonly string[]) => parts.join(`${SETTINGS_SEPARATOR} `)

/** `rows 5-20`, `rows 5-`, `rows -20` (1: from, 2: to); or one row, `rows 7` (3). */
const ROWS = new RegExp(String.raw`^${SETTING_WORD.rows}\s+(?:(\d*)\s*${RANGE_DASH}\s*(\d*)|(\d+))$`)

/** A row range setting's rows (either end may be open), or null if `part` isn't one. */
export function parseRowRange(part: string): { from?: number; to?: number } | null {
  const m = ROWS.exec(part)
  if (!m || (!m[1] && !m[2] && !m[3])) return null
  if (m[3]) return { from: Number(m[3]), to: Number(m[3]) }
  return { from: m[1] ? Number(m[1]) : undefined, to: m[2] ? Number(m[2]) : undefined }
}

/** A row range as a setting: `rows 5-20`, `rows 7` (undefined if it's open at both ends). */
export function formatRowRange(from: number | undefined, to: number | undefined): string | undefined {
  if (from === undefined && to === undefined) return undefined
  return from !== undefined && from === to ? `${SETTING_WORD.rows} ${from}` : `${SETTING_WORD.rows} ${from ?? ''}${RANGE_DASH}${to ?? ''}`
}

/** `title "Run 1"` (1: the title). */
const TITLE = new RegExp(`^${SETTING_WORD.title}\\s+${QUOTE}([^${QUOTE}]*)${QUOTE}$`)

/** A title setting's title (`title "Run 1"` → Run 1), or undefined if `part` isn't one. */
export const parseTitle = (part: string): string | undefined => TITLE.exec(part)?.[1]

/** A title as a setting: `title "Run 1"`. (A title can't hold a quote mark: it ends the title.) */
export const titleSetting = (title: string) => `${SETTING_WORD.title} ${QUOTE}${title.replaceAll(QUOTE, '')}${QUOTE}`

// ---------------------------------------------------------------------------
// A setting, and its kinds
// ---------------------------------------------------------------------------

/** The keys of `S` whose values are `V` (or, if optional, `V` or undefined). */
export type KeysOf<S, V> = { [K in keyof S]-?: NonNullable<S[K]> extends V ? (V extends NonNullable<S[K]> ? K : never) : never }[keyof S]

/** One value a setting can take, and what it means: `top right`, the legend in the plot's top right corner. */
export interface SettingValue<V extends string = string> {
  readonly value: V
  readonly means: string
}

/** Set a field of a settings object (each kind of setting knows its field's type: see KeysOf). */
const put = <S>(into: S, key: keyof S, value: unknown) => {
  (into as Record<keyof S, unknown>)[key] = value
}

/**
 * A setting: how it's written (an example of it), what it does, and how it's
 * read from a setting's text into the settings and written back from them.
 */
export abstract class Setting<S> {
  /** What it does, in a sentence. */
  readonly summary: string
  constructor(summary: string) {
    this.summary = summary
  }

  /** How it's written, as examples: `legend top right`; an axis's `x from 0 to 10` and `log x`. */
  abstract readonly examples: readonly string[]

  /** Each value it can take, with what each means, if it's a choice of them. */
  get values(): readonly SettingValue[] | undefined {
    return undefined
  }

  /** Read one setting's text (tidied: settingParts) into `into`, if it's this setting; whether it was. */
  abstract read(part: string, into: S): boolean

  /** It as written for `s`: its parts (none if it's as `defaults` has it). */
  abstract write(s: S, defaults: S): string[]
}

/** On or off, `uncertainty off`: a field that's true or false. */
export class SwitchSetting<S> extends Setting<S> {
  readonly word: string
  readonly key: KeysOf<S, boolean>
  constructor(word: string, key: KeysOf<S, boolean>, summary: string) {
    super(summary)
    this.word = word
    this.key = key
  }
  /** As it's written to turn it from its default: `uncertainty off`. (Its other way, `on`, is read too.) */
  get examples() {
    return [`${this.word} ${SETTING_WORD.off}`]
  }
  read(part: string, into: S): boolean {
    if (part === `${this.word} ${SETTING_WORD.on}`) put(into, this.key, true)
    else if (part === `${this.word} ${SETTING_WORD.off}`) put(into, this.key, false)
    else return false
    return true
  }
  write(s: S, defaults: S): string[] {
    const on = s[this.key] as boolean
    return on === defaults[this.key] ? [] : [`${this.word} ${on ? SETTING_WORD.on : SETTING_WORD.off}`]
  }
}

/** Said or not, `all rows`: a field that's true when it's written. */
export class FlagSetting<S> extends Setting<S> {
  readonly word: string
  readonly key: KeysOf<S, boolean>
  constructor(word: string, key: KeysOf<S, boolean>, summary: string) {
    super(summary)
    this.word = word
    this.key = key
  }
  get examples() {
    return [this.word]
  }
  read(part: string, into: S): boolean {
    if (part !== this.word) return false
    put(into, this.key, true)
    return true
  }
  write(s: S): string[] {
    return s[this.key] ? [this.word] : []
  }
}

/** One of some values, `style both`: a field that's one of them (or, if it's optional, none: as it is by itself). */
export class ChoiceSetting<S, V extends string> extends Setting<S> {
  readonly word: string
  readonly key: KeysOf<S, V>
  readonly choices: readonly SettingValue<V>[]
  /** The value its example shows: `style both`. */
  private readonly shown: V
  constructor(word: string, key: KeysOf<S, V>, choices: readonly SettingValue<V>[], shown: V, summary: string) {
    super(summary)
    this.word = word
    this.key = key
    this.choices = choices
    this.shown = shown
  }
  get examples() {
    return [`${this.word} ${this.shown}`]
  }
  override get values() {
    return this.choices
  }
  read(part: string, into: S): boolean {
    const prefix = `${this.word} `
    if (!part.startsWith(prefix)) return false
    const chosen = this.choices.find((c) => c.value === part.slice(prefix.length))
    if (!chosen) return false
    put(into, this.key, chosen.value)
    return true
  }
  write(s: S, defaults: S): string[] {
    const value = s[this.key] as V | undefined
    return value === undefined || value === defaults[this.key] ? [] : [`${this.word} ${value}`]
  }
}

/** A name, `labels salts`: a field holding one word (a series' name, say). */
export class NameSetting<S> extends Setting<S> {
  readonly word: string
  readonly key: KeysOf<S, string>
  readonly sample: string
  constructor(word: string, key: KeysOf<S, string>, sample: string, summary: string) {
    super(summary)
    this.word = word
    this.key = key
    this.sample = sample
  }
  get examples() {
    return [`${this.word} ${this.sample}`]
  }
  read(part: string, into: S): boolean {
    const m = new RegExp(`^${this.word}\\s+(\\S+)$`).exec(part)
    if (!m) return false
    put(into, this.key, m[1])
    return true
  }
  write(s: S): string[] {
    const name = s[this.key] as string | undefined
    return name ? [`${this.word} ${name}`] : []
  }
}

/** Which rows, `rows 5-20` (`rows 5-` from 5 on, `rows -20` up to 20, `rows 7` just 7): the fields `from` and `to`. */
export class RowsSetting<S extends { from?: number; to?: number }> extends Setting<S> {
  readonly examples = [`${SETTING_WORD.rows} 5-20`]
  read(part: string, into: S): boolean {
    const rows = parseRowRange(part)
    if (!rows) return false
    into.from = rows.from
    into.to = rows.to
    return true
  }
  write(s: S): string[] {
    const rows = formatRowRange(s.from, s.to)
    return rows ? [rows] : []
  }
}

/** A title, quoted so it can hold commas, `title "Run 1"`: the field `title`. */
export class TitleSetting<S extends { title?: string }> extends Setting<S> {
  readonly examples = [`${SETTING_WORD.title} "…"`]
  read(part: string, into: S): boolean {
    const title = parseTitle(part)
    if (title === undefined) return false
    into.title = title
    return true
  }
  write(s: S): string[] {
    return s.title ? [titleSetting(s.title)] : []
  }
}

// ---------------------------------------------------------------------------
// A call's settings
// ---------------------------------------------------------------------------

/**
 * A call's settings, declared: what they're for (`plot`, in their error), their
 * defaults, and each setting, in the order they're written back.
 */
export class SettingsSpec<S> {
  readonly what: string
  readonly defaults: () => S
  readonly settings: readonly Setting<S>[]
  constructor(what: string, defaults: () => S, settings: readonly Setting<S>[]) {
    this.what = what
    this.defaults = defaults
    this.settings = settings
  }

  /** Settings from their text (a call's, after its semicolon), or what's wrong with them: the first that isn't a setting. */
  parse(text: string | undefined): { settings: S; error?: string } {
    const settings = this.defaults()
    for (const part of settingParts(text)) {
      if (!this.settings.some((s) => s.read(part, settings))) return { settings, error: this.notOne(part) }
    }
    return { settings }
  }

  /** Settings as text, in the order they're declared, leaving out the defaults ('' if there's nothing to say). */
  format(s: S): string {
    const defaults = this.defaults()
    return joinSettings(this.settings.flatMap((setting) => setting.write(s, defaults)))
  }

  /** What's said of a part that isn't one of these settings: what is, each as an example. */
  notOne(part: string): string {
    const examples = this.settings.flatMap((s) => s.examples)
    return `"${part}" isn't a ${this.what} setting: use ${examples.slice(0, -1).join(', ')}, or ${examples.at(-1)}. `
      + `The ${this.what}'s ⚙ button sets them.`
  }
}
