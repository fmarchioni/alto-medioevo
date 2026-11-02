/**
 * Pignoramenti (non nel listato): chi chiude l'anno con un debito oltre il
 * credito concesso dagli usurai (le rendite dell'anno, e almeno 1000 scudi) perde i beni. I
 * creditori prendono terre, mercati, opifici e piani di palazzo pagandoli
 * metà del loro prezzo, finché il debito è saldato o non resta nulla da prendere.
 */
import { acriPerBotteghe, ACRI_PER_ACQUISTO, COSTS } from './investments';
import type { Player } from './types';

/** Parte del prezzo che i creditori riconoscono per un bene pignorato. */
export const FORECLOSURE_SHARE = 0.5;
/** Sotto questo debito i creditori non pignorano, anche se il credito è più basso (rendite quasi nulle). */
export const FORECLOSURE_MIN_DEBT = 1000;
/** Terre che il pignoramento lascia comunque al signore. */
export const FORECLOSURE_MIN_ACRI = 250;

export interface Foreclosure {
  /** debito prima del pignoramento (positivo) */
  debt: number;
  acri: number;
  mercati: number;
  opifici: number;
  palazzo: number;
  /** scudi riconosciuti per i beni presi */
  paid: number;
  /** debito che resta dopo il pignoramento (0: saldato) */
  unpaid: number;
}

/** Beni pignorabili, in ordine: unità sottratta, prezzo pieno e quante unità si possono prendere. */
const ASSETS: { key: 'acri' | 'mercati' | 'opifici' | 'palazzo'; unit: number; value: number; avail: (p: Player) => number; take: (p: Player, u: number) => void }[] = [
  {
    key: 'acri', unit: ACRI_PER_ACQUISTO, value: COSTS.terre,
    // restano le terre minime e quelle che servono per i mercati e gli opifici del feudo
    avail: p => Math.floor((p.acri - Math.max(FORECLOSURE_MIN_ACRI, acriPerBotteghe(p))) / ACRI_PER_ACQUISTO),
    take: (p, u) => { p.acri -= u * ACRI_PER_ACQUISTO; },
  },
  { key: 'mercati', unit: 1, value: COSTS.mercato, avail: p => p.mercato - 1, take: (p, u) => { p.mercato -= u; } },
  { key: 'opifici', unit: 1, value: COSTS.opificio, avail: p => p.opificio - 1, take: (p, u) => { p.opificio -= u; } },
  { key: 'palazzo', unit: 1, value: COSTS.palazzo, avail: p => p.palazzo, take: (p, u) => { p.palazzo -= u; } },
];

/** Soglia del pignoramento: il credito concesso dagli usurai, ma mai meno di FORECLOSURE_MIN_DEBT. */
export const foreclosureLimit = (p: Player) => Math.max(FORECLOSURE_MIN_DEBT, p.credito);

/** Il debito supera la soglia: a fine anno scatterebbe il pignoramento. */
export const overCredit = (p: Player, scudi = p.scudi) => -scudi > foreclosureLimit(p);

/**
 * Pignora i beni del signore se il debito supera il credito concesso.
 * Più passate: prendere mercati e opifici libera terre che servivano a tenerli.
 */
export function foreclose(p: Player): Foreclosure | null {
  if (!overCredit(p)) return null;
  const out: Foreclosure = { debt: -p.scudi, acri: 0, mercati: 0, opifici: 0, palazzo: 0, paid: 0, unpaid: 0 };
  let taken = true;
  while (p.scudi < 0 && taken) {
    taken = false;
    for (const a of ASSETS) {
      if (p.scudi >= 0) break;
      const price = a.value * FORECLOSURE_SHARE;
      const u = Math.max(0, Math.min(Math.ceil(-p.scudi / price), a.avail(p)));
      if (!u) continue;
      a.take(p, u);
      p.scudi += u * price;
      out[a.key] += u * a.unit;
      out.paid += u * price;
      taken = true;
    }
  }
  if (!out.paid) return null;
  out.unpaid = Math.max(0, -p.scudi);
  return out;
}
