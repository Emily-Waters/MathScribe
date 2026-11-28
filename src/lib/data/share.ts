/**
 * Sharing a sheet by link: its name and text compressed into the link's `#`
 * part, so nothing is uploaded and no server is needed. Opening the link opens
 * the sheet in a new tab (App.tsx), and the `#` part is taken off the address.
 *
 * The text is compressed with the browser's own deflate (CompressionStream)
 * and written in base64url, which links carry as it is.
 */

import { BASE64_PADDING, BASE64_URL, FRAGMENT_MARK, LEADING_FRAGMENT_MARK, PART_ASSIGN, PART_SEPARATOR } from './syntax.ts'

/** What starts a shared sheet in a link's `#` part, with the version of how it's written: `#sheet1=…`. */
const SHARED = { sheet: 'sheet1', name: 'name' } as const

/** How the text is compressed (the browser's, and Node's, CompressionStream). */
const COMPRESSION: CompressionFormat = 'deflate-raw'

/**
 * The longest link that's offered: longer ones are cut off by some messaging
 * apps and email programs, so a sheet that long is better sent as its file.
 */
export const MAX_SHARE_LINK = 32_000

/** Bytes as base64url: base64 with - and _ for + and /, and no padding. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  let text = btoa(binary)
  for (const [base64, url] of Object.entries(BASE64_URL)) text = text.replaceAll(base64, url)
  return text.replace(BASE64_PADDING, '')
}

/** base64url back into bytes. */
function fromBase64Url(text: string): Uint8Array {
  let base64 = text
  for (const [inBase64, url] of Object.entries(BASE64_URL)) base64 = base64.replaceAll(url, inBase64)
  const binary = atob(base64)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/** Bytes put through a compression or decompression stream. */
async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/** A sheet's name and text as the `#` part of a link to it (without the `#`). */
export async function shareFragment(name: string, text: string): Promise<string> {
  const compressed = await through(new TextEncoder().encode(text), new CompressionStream(COMPRESSION))
  return [`${SHARED.sheet}${PART_ASSIGN}${toBase64Url(compressed)}`, `${SHARED.name}${PART_ASSIGN}${encodeURIComponent(name)}`].join(PART_SEPARATOR)
}

/** A link to a sheet: the app's address (without its own `#` part), and the sheet after `#`. */
export async function shareLink(base: string, name: string, text: string): Promise<string> {
  return `${base.split(FRAGMENT_MARK)[0]}${FRAGMENT_MARK}${await shareFragment(name, text)}`
}

/** The sheet in a link's `#` part (with or without the `#`), or null if it has none, or one that can't be read. */
export async function sharedSheet(fragment: string): Promise<{ name: string; text: string } | null> {
  const parts = new URLSearchParams(fragment.replace(LEADING_FRAGMENT_MARK, ''))
  const data = parts.get(SHARED.sheet)
  if (!data) return null
  try {
    const bytes = await through(fromBase64Url(data), new DecompressionStream(COMPRESSION))
    return { name: parts.get(SHARED.name) || '', text: new TextDecoder().decode(bytes) }
  } catch {
    return null
  }
}
