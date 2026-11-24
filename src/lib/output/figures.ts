/**
 * Figures as pictures, for the Word export: each figure (a plot) as its
 * module draws it (ModuleFigureKind.picture: an SVG), drawn onto a canvas and
 * saved as a PNG. Browser only.
 */
import { moduleFigureKind, type FigurePicture, type ResultBlock } from '../engine/index.ts'
import { BLOCK_KIND, isContainer, type Block } from '../sheet/blocks.ts'
import { DISPLAY } from '../syntax.ts'
import type { FigureImage, FigureImages } from './docx.ts'

/** Pixels per drawing unit: twice the drawing's size and more, so the picture stays sharp in print. */
export const PICTURE_SCALE = 2.5

/** The figures shown in the sheet, at any depth (the visual check draws them too: visual/render.check.ts). */
export function figuresOf(blocks: Block[]): ResultBlock[] {
  return blocks.flatMap((b) => {
    if (b.kind === BLOCK_KIND.calc) return b.figure && !b.hidden && !b.error ? [b.figure] : []
    if (isContainer(b)) return b.display === DISPLAY.hidden ? [] : figuresOf(b.children)
    return []
  })
}

/** A figure as its module draws it for a picture (undefined if no module installed has its kind). */
export const figurePicture = (figure: ResultBlock): FigurePicture | undefined => moduleFigureKind(figure.type)?.picture(figure.data)

/** A drawing as a PNG file. */
async function pictureImage({ svg, width, height, background }: FigurePicture): Promise<FigureImage> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = width * PICTURE_SCALE
    canvas.height = height * PICTURE_SCALE
    const g = canvas.getContext('2d')
    if (!g) throw new Error('No canvas to draw the figure on.')
    g.fillStyle = background
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('The figure could not be saved as a picture.')
    return { png: new Uint8Array(await blob.arrayBuffer()), width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Every figure in the sheet as a picture. One that can't be drawn is left out of the export. */
export async function figureImages(blocks: Block[]): Promise<FigureImages> {
  const images: FigureImages = new Map()
  for (const figure of figuresOf(blocks)) {
    try {
      const drawn = figurePicture(figure)
      if (drawn) images.set(figure.data, await pictureImage(drawn))
    } catch (e) {
      console.warn('A figure was left out of the Word file:', e)
    }
  }
  return images
}
