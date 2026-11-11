/**
 * How something lines up across the page: the Document option for equations,
 * a Word paragraph or tab stop, an equation's columns.
 */
export const ALIGN = { left: 'left', center: 'center', right: 'right' } as const
export type Align = (typeof ALIGN)[keyof typeof ALIGN]
