/**
 * Vocazioni (solo in Dinastia, docs/vocazioni.md): ogni signore è mercante o guerriero. Le due espansioni sono sempre caricate
 * insieme dall'espansione composta (src/expansions/vocazioni/); la vocazione decide che cosa si può fare.
 *
 * | | Mercante | Guerriero |
 * |---|---|---|
 * | Vigneti, opifici, cantina, mercanti di passaggio, fondaco | sì | sì |
 * | Fiera e contratti per i forestieri, imprese mercantili | sì | no |
 * | Soldati, mura e torri | sì (milizia: non lascia il feudo) | sì |
 * | Marciare, assediare, saccheggiare, catapulte | no | sì |
 *
 * Lo stato dell'espansione composta tiene separati gli stati delle due espansioni (le chiavi `mail`, `inbox` e `rng` ci sono in
 * tutte e due): ciascuna li vede come se fosse sola (vedi `con` in src/expansions/vocazioni/rules.ts).
 */
import { FEUDI } from './rank';
import type { GameState, Player } from './types';

export type Vocazione = 'mercante' | 'guerriero';
export const VOCAZIONI: readonly Vocazione[] = ['mercante', 'guerriero'];

/** Identificativo dell'espansione composta, salvato nella partita. */
export const VOCAZIONI_ID = 'vocazioni';
export const VIE_ID = 'vie-mercanti';
export const SPADE_ID = 'spade-castelli';

/** Lo stato dell'espansione composta: lo stato di ciascuna espansione, sotto il suo identificativo. */
export interface VocazioniExt {
  [VIE_ID]: unknown;
  [SPADE_ID]: unknown;
}

/**
 * Lo stato dell'espansione `id` (Vie dei mercanti o Spade e Castelli) nella partita, sia che si giochi con quella sola sia con
 * le vocazioni; undefined se la partita non la usa.
 */
export function subExt<T>(st: GameState, id: string): T | undefined {
  if (!st.ext) return undefined;
  if (st.expansion === id) return st.ext as T;
  if (st.expansion === VOCAZIONI_ID) return (st.ext as Record<string, unknown>)[id] as T | undefined;
  return undefined;
}

/** La partita usa l'espansione `id`, da sola o con le vocazioni. */
export const usaEspansione = (st: GameState, id: string) => st.expansion === id || st.expansion === VOCAZIONI_ID;

export const vocazioneOf = (p: Player | undefined): Vocazione | undefined => p?.vocazione;

/** Feudi sul mare: la loro vocazione naturale è il commercio (per chi la lascia alla sorte). */
const SUL_MARE = new Set(['Ravenna', 'Roma', 'Neapolis', 'Barium', 'Panormus']);
export const vocazioneDelFeudo = (feudo: number): Vocazione => (SUL_MARE.has(FEUDI[feudo] ?? '') ? 'mercante' : 'guerriero');

export type Divieto = 'fiera' | 'imprese' | 'marcia' | 'catapulte';

/** Che cosa la vocazione del signore vieta (null: si può). Fuori dalle vocazioni non vieta nulla. */
export function vietato(p: Player | undefined, cosa: Divieto): string | null {
  const v = p?.vocazione;
  if (!v) return null;
  if (v === 'guerriero' && cosa === 'fiera') return 'un signore guerriero non tratta con i mercanti forestieri: la fiera è dei mercanti';
  if (v === 'guerriero' && cosa === 'imprese') return 'le imprese mercantili sono dei mercanti';
  if (v === 'mercante' && cosa === 'marcia') return 'la milizia di un signore mercante difende la città, ma non lascia il feudo';
  if (v === 'mercante' && cosa === 'catapulte') return 'un signore mercante non costruisce macchine da assedio';
  return null;
}
