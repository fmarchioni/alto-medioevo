/**
 * Calcoli di supporto alle decisioni: usati dai consiglieri (UI) e dai signori
 * guidati dal computer. Non modificano lo stato di gioco.
 */
import { computeRendite, type RateKind } from './economy';
import type { Player, RenditePreview, Scalars } from './types';

export type Rates = Record<RateKind, number>;
export const KINDS: RateKind[] = ['bevere', 'macina', 'commerzio'];
/** Soglia della riga 940: oltre, le gabelle vengono ridotte in proporzione. */
export const RATE_SUM_CAP = 180;

export const currentRates = (p: Player): Rates => ({ bevere: p.rateBevere, macina: p.rateMacina, commerzio: p.rateCommerzio });

/** Rendita con una bozza di gabelle, senza toccare lo stato di gioco. */
export function previewRates(p: Player, sc: Scalars, r: Rates): RenditePreview {
  const pc: Player = { ...p, rateBevere: r.bevere, rateMacina: r.macina, rateCommerzio: r.commerzio };
  return computeRendite(pc, { ...sc });
}

/** Scudi resi da un punto percentuale di ciascuna voce (prima del correttivo). */
export function yieldPerPoint(p: Player, sc: Scalars): Rates {
  return {
    bevere: p.servi / 500,
    macina: p.servi > 0 ? (2 * sc.s) / p.servi : 0,
    commerzio: (Math.max(0, p.baseMercati) + Math.max(0, p.baseOpifici)) / 500,
  };
}

/**
 * Ripartizione più fruttuosa: le voci più redditizie si riempiono fino a 99
 * finché la somma arriva a 180 (oltre, il correttivo annulla il guadagno).
 * Si provano tutti gli ordini e si valuta ciascuno con le formule esatte.
 */
export function bestRates(p: Player, sc: Scalars): Rates {
  const y = yieldPerPoint(p, sc);
  const orders: RateKind[][] = [
    ['bevere', 'macina', 'commerzio'], ['bevere', 'commerzio', 'macina'], ['macina', 'bevere', 'commerzio'],
    ['macina', 'commerzio', 'bevere'], ['commerzio', 'bevere', 'macina'], ['commerzio', 'macina', 'bevere'],
  ];
  let best: Rates = { bevere: 0, macina: 0, commerzio: 0 };
  let bestTot = previewRates(p, sc, best).totale;
  for (const order of orders) {
    let rem = RATE_SUM_CAP;
    const r: Rates = { bevere: 0, macina: 0, commerzio: 0 };
    for (const k of order) {
      if (y[k] <= 0) continue;
      r[k] = Math.min(99, rem);
      rem -= r[k];
    }
    const tot = previewRates(p, sc, r).totale;
    const sum = (x: Rates) => x.bevere + x.macina + x.commerzio;
    if (tot > bestTot || (tot === bestTot && sum(r) < sum(best))) {
      best = r;
      bestTot = tot;
    }
  }
  return best;
}

/** Massimo grano acquistabile (righe 475-490): limite del raccolto e del credito. */
export function maxBuyable(p: Player, sc: Scalars): number {
  if (p.scudi < -p.credito || sc.prezzo <= 0) return 0;
  const ok = (q: number) => Math.floor(p.scudi - (q * sc.prezzo) / 1000) >= -p.credito;
  let q = Math.min(sc.raccolto, Math.floor(((p.scudi + p.credito + 1) * 1000) / sc.prezzo));
  while (q > 0 && !ok(q)) q--;
  return Math.max(0, q);
}
