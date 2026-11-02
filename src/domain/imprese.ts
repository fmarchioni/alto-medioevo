/**
 * Imprese temerarie: carte che arrivano fra gli imprevisti, si tengono in
 * serbo e si giocano quando si vuole, come la carta "uscite di prigione".
 *
 * Per ora due, con le stesse regole: le decime dell'abate corrotto (i
 * briganti cercano un complice per assaltare il carro) e il commercio
 * segreto (mercanti senza scrupoli cercano un socio). Chi accetta ha una
 * possibilità su due: riesce e incassa da 2000 a 5000 scudi, o viene
 * arrestato ed esce dalla partita. Per i dieci anni seguenti, ogni anno un
 * complice può parlare: si paga il doppio del bottino, o si finisce in ceppi.
 */
import { INT } from './economy';
import type { Player } from './types';

export type ImpresaId = 'decime' | 'commercio';

/**
 * Le carte: identificativo d'imprevisto (dopo le fazioni) e casella
 * dell'estrazione (riga 780). Le rivolte arrivano al più alla 20 e gli
 * attacchi delle fazioni, con tutti i patti possibili, alla 26: le caselle
 * 31 e 32 erano sempre vuote. Le regole sono le stesse per tutte.
 */
export const IMPRESE: Record<ImpresaId, { event: number; slot: number }> = {
  decime: { event: 15, slot: 32 },
  commercio: { event: 16, slot: 31 },
};

/** Carta portata da un imprevisto, se lo è. */
export const impresaOfEvent = (eventId: number): ImpresaId | undefined =>
  (Object.keys(IMPRESE) as ImpresaId[]).find(id => IMPRESE[id].event === eventId);

/** Carta che si estrae con la casella `kj`, se c'è. */
export const impresaOfSlot = (kj: number): ImpresaId | undefined =>
  (Object.keys(IMPRESE) as ImpresaId[]).find(id => IMPRESE[id].slot === kj);
/** Anni, dopo quello in cui arriva, in cui la carta si può ancora giocare. */
export const IMPRESA_DURATA = 5;
export const IMPRESA_SUCCESSO = 0.5;
export const BOTTINO_MIN = 2000;
export const BOTTINO_MAX = 5000;
/** Anni dopo l'impresa in cui un complice può parlare, e probabilità annua. */
export const COMPLICE_ANNI = 10;
export const COMPLICE_CHANCE = 0.1;
/** Chi viene scoperto paga questo multiplo del bottino. */
export const MULTA_FATTORE = 2;

export interface Impresa {
  id: ImpresaId;
  /** anno (q) in cui la carta è arrivata */
  dal: number;
  /** anno (q) in cui è stata giocata con successo */
  usata?: number;
  /** scudi presi */
  bottino?: number;
}

/** riuscita / fallita: la carta giocata; multa / arresto: un complice ha parlato */
export type EsitoImpresa = 'riuscita' | 'fallita' | 'multa' | 'arresto';

/** Ultimo anno (q) in cui la carta si può giocare. */
export const scadenza = (i: Impresa) => i.dal + IMPRESA_DURATA;

/** Il signore ha la carta in mano e può ancora giocarla. */
export const cartaInMano = (p: Player, q: number) => !!p.impresa && p.impresa.usata === undefined && q <= scadenza(p.impresa);

/** Ultimo anno (q) in cui un complice può ancora parlare. */
export const silenzioDal = (i: Impresa) => (i.usata ?? 0) + COMPLICE_ANNI;

/** Bottino da 2000 a 5000 scudi, a centinaia. */
export const bottino = (r: number) => BOTTINO_MIN + 100 * INT(r * ((BOTTINO_MAX - BOTTINO_MIN) / 100 + 1));

export const multa = (i: Impresa) => MULTA_FATTORE * (i.bottino ?? 0);
