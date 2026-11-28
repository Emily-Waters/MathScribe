/**
 * Settings, declared: what can be written after a semicolon in a call's
 * brackets, `@plot(t, x; fit linear, legend top right)`, each setting declared
 * once, with how it's written, what it means, and what it sets.
 *
 * From the declarations come reading a call's settings text into its settings
 * (SettingsSpec.parse), writing them back as text (format), and the error for
 * a setting that isn't one, which lists what is. They're the first part of
 * MathScribe's language described once, in a tree (see "One source for the
 * language" in CHANGELOG.md): the ⚙ menus and the reference are to be made from
 * them too.
 *
 * A kind of setting is a class extending Setting (a switch, a choice, a range
 * of rows, …); a module declares its calls' settings as a list of them, and
 * may add kinds of its own (a plot's axes, its colours).
 */
import { inClass, regex, src } from '../syntax/patterns.ts'
import { QUOTE, SEPARATOR } from '../syntax/punctuation.ts'

/** Text in quotes, as a setting's value: `"Run 1"` (its group: what's inside). */
const QUOTED = src`${QUOTE}([^${inClass(QUOTE)}]*)${QUOTE}`

// ---------------------------------------------------------------------------
// Settings text: its parts, and the pieces several kinds of setting share
// ---------------------------------------------------------------------------

/** Between settings: `rows 5-20, lines grid`. */
export const SETTINGS_SEPARATOR = SEPARATOR

// (A setting's value is quoted, QUOTE, when it can hold commas: `title "Run 1, cart"`.)

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
const ROWS = regex(src`^${SETTING_WORD.rows}\s+(?:(\d*)\s*${RANGE_DASH}\s*(\d*)|(\d+))$`)

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
const TITLE = regex(src`^${SETTING_WORD.title}\s+${QUOTED}$`)

/** A title setting's title (`title "Run 1"` → Run 1), or undefined if `part` isn't one. */
export const parseTitle = (part: string): string | undefined => TITLE.exec(part)?.[1]

/** A title as a setting: `title "Run 1"`. (A title can't hold a quote mark: it ends the title.) */
export const titleSetting = (title: string) => `${SETTING_WORD.title} ${QUOTE}${title.replaceAll(QUOTE, '')}${QUOTE}`

// ---------------------------------------------------------------------------
// A setting, and its kinds
// ---------------------------------------------------------------------------

/** The keys of `S` whose values are `V` (or, if optional, `V` or undefined). */
export type KeysOf<S, V> = { [K in keyof S]-?: NonNullable<S[K]> extends V ? (V extends NonNullable<S[K]> ? K : never) : never }[keyof S]

/** One value a setting can take: as it's written, as the ⚙ menu names it, and what it means (`top right`: the plot's top right corner). */
export interface SettingValue<V extends string = string> {
  readonly value: V
  readonly label: string
  readonly means: string
}

/** What's said about a setting: its name in the ⚙ menu, what it does, and anything the menu says under it. */
export interface SettingAbout {
  /** Its name in the ⚙ menu: `Show uncertainty`. */
  readonly label: string
  /** What it does, in a sentence. */
  readonly summary: string
  /** Its control's tooltip in the ⚙ menu, if there's more to say there than its summary: how to leave it to the data. */
  readonly help?: string
}

/**
 * What a setting's control in the ⚙ menu is made of, as the menu makes it
 * (`C`: an element), so a setting says what its control is without the page:
 * a labelled row of controls (and words between them), a checkbox, a choice,
 * number and text boxes (empty for none), and a tooltip on a row.
 */
export interface SettingsPanel<C> {
  /** A heading over the rows of a group of settings (SettingsSpec's `groups`). */
  section(title: string): C
  row(label: string, ...controls: (C | string)[]): C
  checkBox(value: boolean, set: (on: boolean) => void): C
  choice(options: readonly { readonly value: string; readonly label: string }[], value: string, set: (value: string) => void): C
  /** `whole`: a row number (1 or more); otherwise any number. */
  numberBox(value: number | undefined, placeholder: string, whole: boolean, set: (value: number | undefined) => void): C
  textBox(value: string | undefined, placeholder: string, set: (text: string | undefined) => void): C
  /** A row with a tooltip, shown on hover (so the panel itself stays short). */
  withTip(row: C, text: string): C
}

/**
 * The settings a control changes: as they are now (each control reads them as
 * it's used), setting new ones (which are saved), and the defaults.
 */
export interface SettingsState<S> {
  readonly current: () => S
  readonly set: (next: S) => void
  readonly defaults: S
}

/** Set a field of a settings object (each kind of setting knows its field's type: see KeysOf). */
const put = <S>(into: S, key: keyof S, value: unknown) => {
  (into as Record<keyof S, unknown>)[key] = value
}

/** Settings with a field changed (a copy, as a control sets them). */
const changed = <S>(s: S, key: keyof S, value: unknown): S => ({ ...s, [key]: value })

/**
 * A setting: how it's written (examples of it), what it does, how it's read
 * from a setting's text into the settings and written back from them, and its
 * control in the ⚙ menu.
 */
export abstract class Setting<S> {
  readonly about: SettingAbout
  constructor(about: SettingAbout) {
    this.about = about
  }

  /** What it does, in a sentence. */
  get summary(): string {
    return this.about.summary
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

  /** Its control in the ⚙ menu: its rows, each with its help (or else its summary) as a tooltip. */
  controls<C>(panel: SettingsPanel<C>, state: SettingsState<S>): C[] {
    return this.rows(panel, state).map((row) => panel.withTip(row, this.about.help ?? this.about.summary))
  }

  /** Its control's rows. */
  protected abstract rows<C>(panel: SettingsPanel<C>, state: SettingsState<S>): C[]
}

/** On or off, `uncertainty off`: a field that's true or false (in the menu, a checkbox). */
export class SwitchSetting<S> extends Setting<S> {
  readonly word: string
  readonly key: KeysOf<S, boolean>
  constructor(word: string, key: KeysOf<S, boolean>, about: SettingAbout) {
    super(about)
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
  protected rows<C>(panel: SettingsPanel<C>, { current, set }: SettingsState<S>): C[] {
    return [panel.row(this.about.label, panel.checkBox(current()[this.key] as boolean, (on) => set(changed(current(), this.key, on))))]
  }
}

/** Said or not, `all rows`: a field that's true when it's written (in the menu, a checkbox). */
export class FlagSetting<S> extends Setting<S> {
  readonly word: string
  readonly key: KeysOf<S, boolean>
  constructor(word: string, key: KeysOf<S, boolean>, about: SettingAbout) {
    super(about)
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
  protected rows<C>(panel: SettingsPanel<C>, { current, set }: SettingsState<S>): C[] {
    return [panel.row(this.about.label, panel.checkBox(current()[this.key] as boolean, (on) => set(changed(current(), this.key, on))))]
  }
}

/** The menu's choice for a setting left as it is by itself (an optional choice's, unset). */
const AUTOMATIC = { value: '', label: 'Auto' } as const

/**
 * One of some values, `style both`: a field that's one of them (in the menu, a
 * choice). If the field is optional, unset is how it is by itself, the menu's Auto.
 */
export class ChoiceSetting<S, V extends string> extends Setting<S> {
  readonly word: string
  readonly key: KeysOf<S, V>
  readonly choices: readonly SettingValue<V>[]
  /** The value its example shows: `style both`. */
  private readonly shown: V
  constructor(word: string, key: KeysOf<S, V>, choices: readonly SettingValue<V>[], shown: V, about: SettingAbout) {
    super(about)
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
  protected rows<C>(panel: SettingsPanel<C>, { current, set, defaults }: SettingsState<S>): C[] {
    // (A field unset by itself, `legend`, has Auto first: unset.)
    const options = defaults[this.key] === undefined ? [AUTOMATIC, ...this.choices] : this.choices
    const value = (current()[this.key] as V | undefined) ?? AUTOMATIC.value
    return [panel.row(this.about.label, panel.choice(options, value,
      (chosen) => set(changed(current(), this.key, chosen === AUTOMATIC.value ? undefined : chosen))))]
  }
}

/** A name, `labels salts`: a field holding one word, a series' name, say (in the menu, a text box). */
export class NameSetting<S> extends Setting<S> {
  readonly word: string
  readonly key: KeysOf<S, string>
  readonly sample: string
  constructor(word: string, key: KeysOf<S, string>, sample: string, about: SettingAbout) {
    super(about)
    this.word = word
    this.key = key
    this.sample = sample
  }
  get examples() {
    return [`${this.word} ${this.sample}`]
  }
  read(part: string, into: S): boolean {
    const m = regex(src`^${this.word}\s+(\S+)$`).exec(part)
    if (!m) return false
    put(into, this.key, m[1])
    return true
  }
  write(s: S): string[] {
    const name = s[this.key] as string | undefined
    return name ? [`${this.word} ${name}`] : []
  }
  protected rows<C>(panel: SettingsPanel<C>, { current, set }: SettingsState<S>): C[] {
    // (A name is one word: what's typed is taken up to its first space.)
    return [panel.row(this.about.label, panel.textBox(current()[this.key] as string | undefined, `e.g. ${this.sample}`,
      (text) => set(changed(current(), this.key, text?.split(/\s+/)[0] || undefined))))]
  }
}

/** Which rows, `rows 5-20` (`rows 5-` from 5 on, `rows -20` up to 20, `rows 7` just 7): the fields `from` and `to` (in the menu, two number boxes). */
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
  protected rows<C>(panel: SettingsPanel<C>, { current, set }: SettingsState<S>): C[] {
    // (Each box sets only its own end, so setting one keeps the other.)
    return [panel.row(this.about.label,
      panel.numberBox(current().from, 'first', true, (from) => set({ ...current(), from })), SETTING_WORD.to,
      panel.numberBox(current().to, 'last', true, (to) => set({ ...current(), to })))]
  }
}

/** A title, quoted so it can hold commas, `title "Run 1"`: the field `title` (in the menu, a text box). */
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
  protected rows<C>(panel: SettingsPanel<C>, { current, set }: SettingsState<S>): C[] {
    return [panel.row(this.about.label, panel.textBox(current().title, 'none', (title) => set({ ...current(), title })))]
  }
}

/** Words, quoted so they can hold commas, `xlabel "Extension"`: a field holding text (in the menu, a text box; empty for none). */
export class TextSetting<S> extends Setting<S> {
  readonly word: string
  readonly key: KeysOf<S, string>
  readonly sample: string
  constructor(word: string, key: KeysOf<S, string>, sample: string, about: SettingAbout) {
    super(about)
    this.word = word
    this.key = key
    this.sample = sample
  }
  get examples() {
    return [`${this.word} ${QUOTE}${this.sample}${QUOTE}`]
  }
  read(part: string, into: S): boolean {
    const m = regex(src`^${this.word}\s+${QUOTED}$`).exec(part)
    if (!m) return false
    put(into, this.key, m[1] || undefined)
    return true
  }
  write(s: S): string[] {
    const text = s[this.key] as string | undefined
    // (Text can't hold a quote mark: it ends the text.)
    return text ? [`${this.word} ${QUOTE}${text.replaceAll(QUOTE, '')}${QUOTE}`] : []
  }
  protected rows<C>(panel: SettingsPanel<C>, { current, set }: SettingsState<S>): C[] {
    return [panel.row(this.about.label, panel.textBox(current()[this.key] as string | undefined, 'auto',
      (text) => set(changed(current(), this.key, text))))]
  }
}

// ---------------------------------------------------------------------------
// A call's settings
// ---------------------------------------------------------------------------

/** A setting as it's described (in the reference, the AI primer): how it's written, what it does, and its values, if it's a choice. */
export interface SettingDescription {
  readonly label: string
  readonly summary: string
  readonly help?: string
  readonly examples: readonly string[]
  readonly values?: readonly SettingValue[]
}

/** A call's settings as they're described: the call they're for (`plot`: `@plot(…)`), and each setting, in order. */
export interface SettingsDescription {
  readonly call: string
  readonly settings: readonly SettingDescription[]
}

/** A group of settings in the ⚙ menu, under a heading: its settings by their labels, in the menu's order. */
export interface SettingsGroup {
  readonly title: string
  readonly labels: readonly string[]
}

/**
 * A call's settings, declared: what they're for (`plot`, in their error), their
 * defaults, and each setting, in the order they're written back; and, for the
 * ⚙ menu, the groups they're shown in (each setting in one: a test checks), in
 * the order that reads best there, which needn't be the order they're written.
 */
export class SettingsSpec<S> {
  readonly what: string
  readonly defaults: () => S
  readonly settings: readonly Setting<S>[]
  readonly groups: readonly SettingsGroup[]
  constructor(what: string, defaults: () => S, settings: readonly Setting<S>[], groups: readonly SettingsGroup[] = []) {
    this.what = what
    this.defaults = defaults
    this.settings = settings
    this.groups = groups
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

  /**
   * The ⚙ menu's controls for these settings, read from their text: each
   * group's heading and its settings' controls (or, without groups, each
   * setting's, in the order declared); `save` writes their text back as each changes.
   */
  controls<C>(panel: SettingsPanel<C>, text: string | undefined, save: (text: string) => void): C[] {
    let settings = this.parse(text).settings
    const state: SettingsState<S> = {
      current: () => settings,
      set: (next) => {
        settings = next
        save(this.format(settings))
      },
      defaults: this.defaults(),
    }
    if (!this.groups.length) return this.settings.flatMap((s) => s.controls(panel, state))
    return this.groups.flatMap((g) => [
      panel.section(g.title),
      ...g.labels.flatMap((label) => this.settings.filter((s) => s.about.label === label).flatMap((s) => s.controls(panel, state))),
    ])
  }

  /** These settings as they're described, for the reference and the AI primer (lib/language/reference.ts). */
  describe(): SettingsDescription {
    return {
      call: this.what,
      settings: this.settings.map((s) => ({ ...s.about, examples: s.examples, ...(s.values ? { values: s.values } : {}) })),
    }
  }

  /** What's said of a part that isn't one of these settings: what is, each as an example. */
  notOne(part: string): string {
    const examples = this.settings.flatMap((s) => s.examples)
    return `"${part}" isn't a ${this.what} setting: use ${examples.slice(0, -1).join(', ')}, or ${examples.at(-1)}. `
      + `The ${this.what}'s ⚙ button sets them.`
  }
}
