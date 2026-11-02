/**
 * Le vie dei mercanti: prestigio mercantile, l'affidabilità commerciale di un
 * signore, da 0 a 100. Parte da 0; sale con le consegne puntuali, i prestiti
 * resi e i molti mercati; scende con ritardi, merce perduta e pignoramenti.
 * Alla fiera pesa sulla scelta dei mercanti forestieri.
 */
import { bonusOf } from './geografia';

export const PRESTIGIO_MAX = 100;

/** Variazioni del prestigio mercantile. */
export const PRESTIGIO = {
  /** carovana del fondaco arrivata intatta e in orario (al venditore) */
  consegna: 1,
  /** prestito del banco reso alla scadenza */
  prestitoReso: 2,
  /** ogni anno, per ogni MERCATI_PER_PUNTO mercati (al più MERCATI_MAX) */
  mercati: 1,
  /** carovana in ritardo / merce perduta per strada (al venditore) */
  ritardo: -2,
  perdita: -2,
  /** beni pignorati dagli usurai o da un creditore del banco */
  pignoramento: -10,
} as const;
export const MERCATI_PER_PUNTO = 4;
export const MERCATI_MAX = 3;

/** Variazione con la specialità del feudo: a Roma ogni guadagno vale il 10% in più. */
export const prestigeGain = (feudo: number, delta: number) => (delta > 0 ? delta * bonusOf(feudo, 'prestigio') : delta);

/** Applica una variazione al prestigio di un signore (resta fra 0 e 100); ritorna quella effettiva. */
export function addPrestige(list: number[], i: number, feudo: number, delta: number): number {
  const before = list[i] ?? 0;
  const after = Math.max(0, Math.min(PRESTIGIO_MAX, before + prestigeGain(feudo, delta)));
  list[i] = Math.round(after * 10) / 10;
  return list[i] - before;
}

/** Prestigio annuo dei mercati: +1 ogni 4 mercati, al più +3. */
export const marketPrestige = (mercato: number) => Math.min(MERCATI_MAX, Math.floor((mercato - 1) / MERCATI_PER_PUNTO)) * PRESTIGIO.mercati;

/** Nome del livello di prestigio, per i testi. */
export function prestigeName(v: number): string {
  if (v >= 80) return 'leggendario';
  if (v >= 60) return 'rinomato';
  if (v >= 40) return 'stimato';
  if (v >= 20) return 'conosciuto';
  if (v > 0) return 'agli inizi';
  return 'sconosciuto';
}
