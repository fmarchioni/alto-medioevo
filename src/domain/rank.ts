/** Fine anno del giocatore ("proximus"): righe 1960-2100. */
import { INT } from './economy';
import type { Player, Scalars } from './types';
import { OPIFICIO_MULT, workFactor } from './gabelle';
import { COSTS } from './investments';

export const TITLES_M = ['messere', 'conte', 'duca', 'granduca', 'principe'] as const;
export const TITLES_F = ['madonna', 'contessa', 'duchessa', 'granduchessa', 'principessa'] as const;
/**
 * Città dei feudi, da nord a sud: ogni fazione ha almeno una città "di casa"
 * (pesi in src/domain/fazioni.ts). Nell'originale i feudi erano Bugella, Genua,
 * Roma, Venetia, Neapolis, Florentia, Eporediae, Taurinum e Mediolanum.
 */
export const FEUDI = ['Taurinum', 'Mediolanum', 'Verona', 'Ravenna', 'Roma', 'Beneventum', 'Neapolis', 'Barium', 'Panormus'] as const;

/** Soglie di ka (righe 2020-2070) e condizione di vittoria (riga 2080). */
export const RANK_THRESHOLDS = [10000, 50000, 95000, 160000] as const;
export const VICTORY_THRESHOLD = 367000;
export const TRIBUTE_PER_RANK = 100;

export function titleName(title: number): string {
  return title > 5 ? TITLES_F[title - 6] : TITLES_M[title - 1];
}

/** Rango 1..5 indipendente dal genere (righe 2083-2085). */
export function rankOf(p: Player): number {
  return p.title > 5 ? p.title - 5 : p.title;
}

/** Riga 1960: base di rendita dei mercati. */
export function marketBase(p: Player): number {
  return INT((p.mercato - 1) * p.servi);
}

/**
 * Righe 1965-1980: base di rendita degli opifici.
 * s1 arriva come "servi prima del nutrimento"; diventa variazione + 2.
 * k = (1 - parte frazionaria di sqrt(|servi/s1|)) * segno: sempre in [-1,1].
 */
export function opificioBase(p: Player, sc: Scalars): number {
  let s1 = p.servi - sc.s1 + 2;
  if (s1 === 0) s1 = 1e-20;
  sc.s1 = s1;
  let k = p.servi / s1;
  const k1 = Math.sign(k);
  k = Math.sqrt(Math.abs(k));
  k = (1 - (k - INT(k))) * k1;
  // riforma delle gabelle: la resa dipende dall'umore degli artigiani, non dalla crescita dei servi
  if (p.umore !== undefined) return INT(OPIFICIO_MULT * (p.opificio - 1) * p.servi * workFactor(p.umore));
  return INT((3 * p.opificio - 3) * p.servi * k);
}

/** Riga 1970: interessi sul debito. */
export function applyUsury(p: Player, usura: number): void {
  if (p.scudi < 0) p.scudi = p.scudi + INT((usura / 100) * p.scudi);
}

/** Riga 2000: indice di ricchezza ka. */
export function wealthIndex(p: Player): number {
  return (p.mercato - 1) * 2000 + (p.opificio - 1) * 5000 + ((p.acri - 500) / 25) * 500 + p.palazzo * 10000 + p.scudi + (p.prestigio ?? 0) + (p.granai ?? 0) * COSTS.granaio;
}

/**
 * Righe 2020-2070: il titolo diventa quello dell'ultima soglia superata.
 * Sotto 10000 resta invariato (quindi può anche scendere, ma non a messere).
 */
export function updateTitle(p: Player, ka: number): void {
  RANK_THRESHOLDS.forEach((th, i) => {
    if (ka > th) p.title = i + 1 + p.gender;
  });
}

/**
 * Righe 2083-2090: il giocatore `a` riscuote 100 scudi per grado di
 * differenza da ogni giocatore di rango inferiore. I pagatori perdono gli
 * scudi subito; il beneficiario li accumula in `vassalli`.
 */
export function calculateVassalTribute(players: Player[], a: number): { from: number; amount: number }[] {
  const lord = players[a];
  lord.vassalli = 0;
  const pj = rankOf(lord);
  const paid: { from: number; amount: number }[] = [];
  players.forEach((y, i) => {
    const dy = pj - rankOf(y);
    if (dy > 0) {
      lord.vassalli += TRIBUTE_PER_RANK * dy;
      y.scudi -= TRIBUTE_PER_RANK * dy;
      paid.push({ from: i, amount: TRIBUTE_PER_RANK * dy });
    }
  });
  return paid;
}

export interface YearEndResult {
  won: boolean;
  /** scudi pagati agli usurai (positivo) */
  usury: number;
  tribute: { from: number; amount: number }[];
}

/** Righe 1960-2090 in ordine. */
export function endOfPlayerYear(players: Player[], a: number, sc: Scalars, usuryScale = 1): YearEndResult {
  const p = players[a];
  p.baseMercati = marketBase(p);
  // riga 1970: gli interessi si applicano fra il calcolo di k e quello di v(a), ma non lo influenzano
  const base = opificioBase(p, sc);
  const beforeUsury = p.scudi;
  applyUsury(p, sc.usura * usuryScale);
  p.baseOpifici = base;
  const usury = beforeUsury - p.scudi;
  const ka = wealthIndex(p);
  updateTitle(p, ka);
  if (ka > VICTORY_THRESHOLD) return { won: true, usury, tribute: [] };
  return { won: false, usury, tribute: calculateVassalTribute(players, a) };
}
