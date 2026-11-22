/**
 * Sharing a sheet by link: its name and text compressed into the link's `#`
 * part, so nothing is uploaded and no server is needed. Opening the link opens
 * the sheet in a new tab (App.tsx), and the `#` part is taken off the address.
 *
 * The text is compressed with the browser's own deflate (CompressionStream)
 * and written in base64url, which links carry as it is.
 */

/** What starts a shared sheet in a link's `#` part, with the version of how it's written: `#sheet1=…`. */
const SHARED = { sheet: 'sheet1', name: 'name' } as const

/** Between the parts after the `#`. */
const PART_SEPARATOR = '&'

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
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** base64url back into bytes. */
function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'))
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
  return [`${SHARED.sheet}=${toBase64Url(compressed)}`, `${SHARED.name}=${encodeURIComponent(name)}`].join(PART_SEPARATOR)
}

/** A link to a sheet: the app's address (without its own `#` part), and the sheet after `#`. */
export async function shareLink(base: string, name: string, text: string): Promise<string> {
  return `${base.split('#')[0]}#${await shareFragment(name, text)}`
}

/** The sheet in a link's `#` part (with or without the `#`), or null if it has none, or one that can't be read. */
export async function sharedSheet(fragment: string): Promise<{ name: string; text: string } | null> {
  const parts = new URLSearchParams(fragment.replace(/^#/, ''))
  const data = parts.get(SHARED.sheet)
  if (!data) return null
  try {
    const bytes = await through(fromBase64Url(data), new DecompressionStream(COMPRESSION))
    return { name: parts.get(SHARED.name) || '', text: new TextDecoder().decode(bytes) }
  } catch {
    return null
  }
}
