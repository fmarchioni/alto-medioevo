/**
 * I volti dipinti della Dinastia (public/sprites/volti, da tools/ritaglia-volti.mjs): dieci persone,
 * ciascuna da bambino, da giovane e da adulto. A ognuno tocca a caso, ma sempre lo stesso, uno dei
 * dieci volti, e con gli anni il volto cresce: fino a 11 anni bambino, fino a 17 giovane, poi adulto.
 */
import { etaP, signoreP, type Persona } from '../domain/famiglia';
import type { Gender, GameState } from '../domain/types';

const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
export const VOLTI = 10;

/** Il foglio dei volti per sesso ed età. */
export function fascia(gender: Gender, eta: number): string {
  if (eta <= 11) return gender === 1 ? 'bimbo' : 'bimba';
  if (eta <= 17) return gender === 1 ? 'uomo-giovane' : 'donna-giovane';
  return gender === 1 ? 'uomo-adulto' : 'donna-adulta';
}

/** Un numero fisso per ogni seme (mescolato, perché fratelli con id vicini non abbiano volti in fila). */
export function voltoN(seme: number): number {
  let h = Math.imul(seme ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) % VOLTI + 1;
}

const hashOf = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

export const voltoSrc = (gender: Gender, eta: number, seme: number) => `${BASE}sprites/volti/${fascia(gender, eta)}-${voltoN(seme)}.png`;

/** Il volto di una persona della Dinastia, all'età che aveva (da morta: l'ultima). */
export const voltoPersona = (x: Persona, q: number) => voltoSrc(x.gender, etaP(x, x.morto ?? q), x.id);

/** Il volto del signore in gioco: con la Dinastia è il suo, senza un volto adulto fisso per nome e feudo. */
export function voltoSignore(st: GameState, i: number): string {
  const d = st.dinastia, p = st.players[i];
  if (d?.persone?.length && d.casate[i]?.generazioni.at(-1)?.persona !== undefined) return voltoPersona(signoreP(d, i), st.q);
  return voltoSrc(p.gender, 30, hashOf(`${p.name}/${p.feudo}`));
}
