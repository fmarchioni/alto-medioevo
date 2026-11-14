/**
 * Ricorrenza: un imprevisto o un fatto del reame non torna dallo stesso signore prima di RICORRENZA_ANNI anni.
 * Modulo foglia (solo tipi): fatti.ts lo usa senza importare events.ts, che chiuderebbe il ciclo
 * events → gabelle → economy → fatti → events.
 */
import type { Player } from './types';

/** Anni prima che lo stesso imprevisto (o fatto del reame) possa tornare dallo stesso signore. */
export const RICORRENZA_ANNI = 10;

export const eventKey = (id: number) => `e${id}`;
export const fattoKey = (id: string) => `f:${id}`;

/** Il signore ha avuto questo imprevisto o fatto meno di RICORRENZA_ANNI anni fa? */
export function inPausa(p: Player, key: string, q: number): boolean {
  const last = p.ricorrenze?.[key];
  return last !== undefined && q - last < RICORRENZA_ANNI;
}

export function segnaRicorrenza(p: Player, key: string, q: number): void {
  (p.ricorrenze ??= {})[key] = q;
}
