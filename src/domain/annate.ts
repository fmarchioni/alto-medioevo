/**
 * Annate: ogni signore vive cicli di 30 anni con 10 annate abbondanti,
 * 10 medie e 10 di carestia, in ordine casuale ma mai più di 3 uguali di
 * fila (anche a cavallo fra due cicli). Dentro l'annata il raccolto e il
 * prezzo restano estratti dal generatore di gioco, ma in una fascia propria.
 *
 * La sequenza delle annate usa un generatore suo, salvato nella partita,
 * quindi il numero di chiamate a RND del motore non cambia.
 */
import { Mulberry32 } from './rng';
import type { AnnataKind, GameState } from './types';

export const CYCLE_YEARS = 30;
export const MAX_RUN = 3;

const KINDS: AnnataKind[] = ['buona', 'media', 'carestia'];
const CODE: Record<AnnataKind, string> = { buona: 'b', media: 'm', carestia: 'c' };
const KIND_OF: Record<string, AnnataKind> = { b: 'buona', m: 'media', c: 'carestia' };

/** Fascia di prezzo (scudi ogni mille misure) di ogni annata. */
export const PRICE_BAND: Record<AnnataKind, { min: number; max: number }> = {
  buona: { min: 1, max: 15 },
  media: { min: 16, max: 40 },
  carestia: { min: 41, max: 60 },
};

export const ANNATA_LABEL: Record<AnnataKind, string> = {
  buona: 'anno abbondante',
  media: 'anno medio',
  carestia: 'anno di carestia',
};

export interface AnnateState {
  /** stato del generatore delle sequenze */
  rng: number;
  /** annate di ogni signore, una lettera per anno (b, m, c) a partire dal 900 */
  seq: string[];
}

export function initAnnate(state: GameState): AnnateState {
  let h = 2166136261;
  for (const v of [...state.rngState, state.players.length, 0xa22a7e]) h = Math.imul(h ^ v, 16777619) >>> 0;
  return { rng: h, seq: state.players.map(() => '') };
}

/** Lunghezza della serie più lunga di lettere uguali. */
export function longestRun(s: string): number {
  let best = 0, run = 0;
  for (let i = 0; i < s.length; i++) {
    run = i > 0 && s[i] === s[i - 1] ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/** Un ciclo di 30 annate che, accodato a `tail`, non crea serie oltre MAX_RUN. */
export function makeCycle(rnd: () => number, tail = ''): string {
  const per = CYCLE_YEARS / KINDS.length;
  const bag = KINDS.flatMap(k => Array<string>(per).fill(CODE[k]));
  const prev = tail.slice(-MAX_RUN);
  for (;;) {
    // mescolamento di Fisher-Yates, ripetuto finché le serie rispettano il limite
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    const s = bag.join('');
    if (longestRun(prev + s) <= MAX_RUN) return s;
  }
}

/** Annata del signore `player` nell'anno 900 + q; estende la sequenza se serve. */
export function annataOf(a: AnnateState, player: number, q: number): AnnataKind {
  const gen = new Mulberry32(a.rng);
  while (a.seq.length <= player) a.seq.push('');
  while (a.seq[player].length <= q) a.seq[player] += makeCycle(() => gen.next(), a.seq[player]);
  a.rng = gen.getState()[0];
  return KIND_OF[a.seq[player][q]];
}
