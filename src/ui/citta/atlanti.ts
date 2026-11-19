/**
 * Vista moderna: personaggi in 8 direzioni × 6 passi (fogli da 48 fotogrammi, ritagliati da tools/ritaglia-48.mjs in
 * public/sprites/persone48/<atlante>.png). Righe dell'atlante: sud, sud-ovest, ovest, nord-ovest, nord, nord-est, est, sud-est;
 * colonne: i sei passi. Ogni cella ha la figura con il piede più basso a BASE px dal fondo e il centro della riga al centro.
 * Chi non ha l'atlante resta con lo sprite di prima (fronte, spalle, due passi).
 */

/** Sprite delle persone (walkers.ts) → atlante che lo sostituisce. */
export const ATLANTI: Readonly<Record<string, string>> = {
  contadino: 'villico',
  contadina: 'contadina',
  soldato: 'guerriero',
  'mercante-asino': 'viandante-asino',
  // il carretto del mercante col mulo: ha preso il posto del carro coi buoi, del carro del vino e della carovana (2026-11-19)
  carretto: 'carretto',
  'carretto-vuoto': 'carretto-vuoto',
};

/** Ingrandimento al disegno: l'atlante resta leggero e il gioco lo porta alla misura giusta (il carretto alto circa 40 px, un po' meno di una casa piccola). */
export const ATLANTE_SCALA: Readonly<Record<string, number>> = { carretto: 1.27, 'carretto-vuoto': 1.27 };

/** Distanza fra la linea di terra dell'atlante e il fondo della cella (tools/ritaglia-48.mjs). */
export const ATLANTE_BASE = 3;
export const ATLANTE_COLONNE = 6;
export const ATLANTE_RIGHE = 8;

/**
 * Riga dell'atlante per un passo sulla griglia (dx lungo gx, dy lungo gy). Sullo schermo isometrico x = dx − dy e
 * y = (dx + dy) / 2; l'angolo si arrotonda all'ottante più vicino (0° = est, in senso orario: est, sud-est, sud...).
 */
export function rigaAtlante(dx: number, dy: number): number {
  const sx = dx - dy, sy = (dx + dy) / 2;
  if (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) return 0;
  const k = ((Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) % 8) + 8) % 8;
  return (k + 6) % 8;
}

/**
 * Tessere per passo negli atlanti: più lunghe dei due fotogrammi di prima, perché sei fotogrammi su un passo corto fanno
 * sbattere mani e piedi (2026-11-19). Le bestie fanno passi ancora più lunghi.
 */
export const PASSO_PERSONA = 0.38;
export const PASSO_BESTIA = 0.62;

/** Passo (colonna) secondo la strada fatta: sei fotogrammi per due passi; `lungo` = tessere per passo. */
export function passoAtlante(pos: number, lungo: number, sfasa = 0): number {
  return Math.floor(Math.abs(pos) / ((lungo * 2) / ATLANTE_COLONNE) + sfasa * 3) % ATLANTE_COLONNE;
}
