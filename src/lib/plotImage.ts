/**
 * Plots as pictures, for the Word export: each plot's SVG (in print colours)
 * drawn onto a canvas and saved as a PNG. Browser only.
 */
import { BLOCK_KIND, isContainer, type Block } from './blocks.ts'
import { LINE_COMMAND } from './syntax.ts'
import { PLOT_SIZE, PRINT_PALETTE, plotSvg, type PlotData } from './plot.ts'
import type { PlotImages } from './docx.ts'

/** Pixels per drawing unit: twice the drawing's size, so the picture stays sharp in print. */
const SCALE = 2.5

/** The plots shown in the sheet, at any depth. */
function plotsOf(blocks: Block[]): PlotData[] {
  return blocks.flatMap((b) => {
    if (b.kind === BLOCK_KIND.calc) return b.plot && !b.hidden && !b.error ? [b.plot] : []
    if (isContainer(b)) return b.command === LINE_COMMAND.hide ? [] : plotsOf(b.children)
    return []
  })
}

/** A plot as a PNG file. */
async function plotPng(plot: PlotData): Promise<Uint8Array> {
  const svg = plotSvg(plot, PRINT_PALETTE)
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = PLOT_SIZE.width * SCALE
    canvas.height = PLOT_SIZE.height * SCALE
    const g = canvas.getContext('2d')
    if (!g) throw new Error('No canvas to draw the plot on.')
    g.fillStyle = PRINT_PALETTE.background
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('The plot could not be saved as a picture.')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Every plot in the sheet as a picture. One that can't be drawn is left out of the export. */
export async function plotImages(blocks: Block[]): Promise<PlotImages> {
  const images: PlotImages = new Map()
  for (const plot of plotsOf(blocks)) {
    try {
      images.set(plot, await plotPng(plot))
    } catch (e) {
      console.warn('A plot was left out of the Word file:', e)
    }
  }
  return images
}
