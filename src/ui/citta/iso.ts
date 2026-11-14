/** Vista moderna: dalla griglia allo schermo (isometria 2:1) e ritorno. */

/** tessera a scala di gioco */
export const TW = 64;
export const TH = 32;

/** Vertice in alto della tessera (gx, gy), in coordinate di mondo. */
export const toWorld = (gx: number, gy: number): { x: number; y: number } => ({ x: (gx - gy) * (TW / 2), y: (gx + gy) * (TH / 2) });

/** Punto della griglia (anche frazionario) sotto un punto del mondo. */
export const toGrid = (x: number, y: number): { gx: number; gy: number } => ({ gx: (y / (TH / 2) + x / (TW / 2)) / 2, gy: (y / (TH / 2) - x / (TW / 2)) / 2 });

/** Ordine di disegno: prima ciò che sta in fondo. `size` è il lato dell'impronta. */
export const depthOf = (gx: number, gy: number, size = 1): number => gx + gy + Math.max(1, size);
