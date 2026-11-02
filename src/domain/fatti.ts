/**
 * Fatti del reame: ogni anno, all'inizio del turno, in una delle città accade
 * un fatto notevole (piogge, cavallette, un'eredità, la visita del re...).
 * Si aggiunge agli imprevisti del listato, che restano, tranne il ciambellano
 * infedele: qui diventa un fatto con una scelta.
 *
 * Quanti fatti per anno dipende da quanto il signore "teme la sorte":
 * - poco: un anno su due, un fatto;
 * - normale: un fatto l'anno;
 * - molto: due fatti l'anno (a signori diversi).
 * Chi ha avuto un fatto l'anno prima ha un terzo della probabilità di riaverlo.
 * La sorte dei fatti ha un generatore proprio salvato nella partita: la
 * sequenza RND del motore non cambia.
 */
import { INT } from './economy';
import { ACRI_PER_ACQUISTO, COSTS, MAX_ACRI, roomFor } from './investments';
import { wealthIndex } from './rank';
import { Mulberry32 } from './rng';
import type { GameState, Player } from './types';

export type Sorte = 'poco' | 'normale' | 'molto';

export type FattoId =
  | 'piogge' | 'mulino' | 'immigrati' | 'eredita' | 'incendio' | 'cavallette'
  | 'ciambellano' | 'reliquia' | 'visitaRe' | 'mulinoGuasto' | 'muffa' | 'decima';

export const FATTI: FattoId[] = [
  'piogge', 'mulino', 'immigrati', 'eredita', 'reliquia', 'visitaRe',
  'incendio', 'cavallette', 'ciambellano', 'mulinoGuasto', 'muffa', 'decima',
];

/** Scelte dei fatti che ne hanno; gli altri hanno effetto immediato. */
export const FATTO_OPTIONS: Partial<Record<FattoId, readonly string[]>> = {
  mulino: ['finanziare', 'rifiutare'],
  immigrati: ['accogliere', 'respingere'],
  incendio: ['ricostruire', 'attendere'],
  ciambellano: ['processare', 'occhio'],
  visitaRe: ['sontuosa', 'modesta'],
};

/** Effetti che durano alcuni anni. */
export type EffettoKind = 'mulino' | 'reliquia' | 'ciambellano' | 'sdegno' | 'mulinoGuasto' | 'decima';
export interface Effetto {
  kind: EffettoKind;
  /** ultimo anno (q) in cui vale */
  until: number;
}

// ---------------------------------------------------------------- numeri

export const PIOGGE_BONUS = 0.2;
export const CAVALLETTE_LOSS = 0.2;
export const CAVALLETTE_PRICE = 0.2;
export const MULINO_BONUS = 0.1;
export const MULINO_YEARS = 5;
export const IMMIGRANT_FOOD = 3;
export const IMMIGRANT_SICK = 0.1;
export const RELIQUIA_YEARS = 5;
export const RELIQUIA_MOOD = 10;
export const CIAMBELLANO_BONUS = 0.05;
export const CIAMBELLANO_THEFT_CHANCE = 0.2;
export const CIAMBELLANO_YEARS = 10;
export const PROCESSO_COST = 500;
export const SDEGNO_MALUS = 0.05;
export const SDEGNO_YEARS = 5;
export const DECIMA = 0.05;
export const MUFFA = 0.2;

const share = (scudi: number, pct: number, min: number) => Math.max(min, INT(Math.max(0, scudi) * pct));
export const mulinoCost = (p: Player) => share(p.scudi, 0.1, 1000);
export const immigrantCount = (p: Player, r: number) => Math.max(1, INT(p.servi * (0.03 + 0.07 * r)));
export const visitCost = (p: Player) => share(p.scudi, 0.15, 1000);
export const theftAmount = (p: Player, r: number) => (p.scudi > 0 ? INT(p.scudi * (0.05 + 0.05 * r)) : 0);

/** Cosa brucia nell'incendio: un mercato, se ce n'è, altrimenti un opificio, altrimenti il grano. */
export const fireTarget = (p: Player): 'mercato' | 'opificio' | 'grano' => (p.mercato > 1 ? 'mercato' : p.opificio > 1 ? 'opificio' : 'grano');
export const rebuildCost = (p: Player) => {
  const t = fireTarget(p);
  return t === 'grano' ? 0 : COSTS[t] / 2;
};

// ---------------------------------------------------------------- stato

export interface FattiState {
  sorte: Sorte;
  /** stato del generatore dei fatti */
  rng: number;
  /** anno (q) a cui si riferiscono i bersagli */
  q: number;
  /** signori colpiti quest'anno, con il fatto che li attende (null: già avvenuto) */
  targets: number[];
  /** signori colpiti l'anno prima */
  last: number[];
}

export function initFatti(state: GameState, sorte: Sorte): FattiState {
  let h = 2166136261;
  for (const v of [...state.rngState, state.players.length, 0xfa77]) h = Math.imul(h ^ v, 16777619) >>> 0;
  return { sorte, rng: h, q: -1, targets: [], last: [] };
}

/** Sceglie i signori colpiti nell'anno q (una volta per anno). */
export function rollTargets(st: GameState, f: FattiState): void {
  if (f.q === st.q) return;
  const r = new Mulberry32(f.rng);
  f.last = f.q === st.q - 1 ? f.targets : [];
  const n = st.players.length;
  const count = f.sorte === 'poco' ? (r.next() < 0.5 ? 1 : 0) : f.sorte === 'normale' ? 1 : 2;
  const pool = [...Array(n).keys()];
  const targets: number[] = [];
  for (let k = 0; k < Math.min(count, n); k++) {
    const w = pool.map(i => (targets.includes(i) || st.players[i].caduto !== undefined ? 0 : f.last.includes(i) ? 1 / 3 : 1));
    let x = r.next() * w.reduce((a, b) => a + b, 0);
    const pick = pool.find(i => (x -= w[i]) < 0) ?? pool.find(i => w[i] > 0)!;
    targets.push(pick);
  }
  f.targets = targets;
  f.q = st.q;
  f.rng = r.getState()[0];
}

/** Sceglie il fatto per il signore `who`: la decima colpisce più spesso chi è in testa. */
export function pickFatto(st: GameState, f: FattiState, who: number): FattoId {
  const r = new Mulberry32(f.rng);
  const ps = st.players;
  const leader = ps.reduce((a, _, i) => (wealthIndex(ps[i]) > wealthIndex(ps[a]) ? i : a), 0);
  const w = FATTI.map(id => (id === 'decima' && ps.length > 1 && who === leader ? 3 : 1));
  let x = r.next() * w.reduce((a, b) => a + b, 0);
  const id = FATTI.find((_, i) => (x -= w[i]) < 0) ?? FATTI[FATTI.length - 1];
  f.rng = r.getState()[0];
  return id;
}

/** Numero casuale dal generatore dei fatti (per l'entità degli effetti). */
export function fattiRandom(f: FattiState): number {
  const r = new Mulberry32(f.rng);
  const v = r.next();
  f.rng = r.getState()[0];
  return v;
}

// ---------------------------------------------------------------- effetti

export const effettiOf = (p: Player): Effetto[] => p.effetti ?? [];
export const hasEffetto = (p: Player, kind: EffettoKind) => effettiOf(p).some(e => e.kind === kind);

export function addEffetto(p: Player, kind: EffettoKind, until: number): void {
  p.effetti = [...effettiOf(p).filter(e => e.kind !== kind), { kind, until }];
}

export function expireEffetti(p: Player, q: number): void {
  if (p.effetti?.some(e => e.until < q)) p.effetti = p.effetti.filter(e => e.until >= q);
}

/** Moltiplicatore del raccolto per gli effetti in corso (mulino nuovo). */
export const fattiHarvestFactor = (p: Player) => (hasEffetto(p, 'mulino') ? 1 + MULINO_BONUS : 1);

/** Moltiplicatore della macina (mulino guasto quest'anno). */
export const fattiMacinaFactor = (p: Player) => (hasEffetto(p, 'mulinoGuasto') ? 0.5 : 1);

/** Moltiplicatore della rendita totale: ciambellano abile, sdegno del re. */
export function fattiIncomeFactor(p: Player): number {
  let k = 1;
  if (hasEffetto(p, 'ciambellano')) k += CIAMBELLANO_BONUS;
  if (hasEffetto(p, 'sdegno')) k -= SDEGNO_MALUS;
  return k;
}

/** Entrate dei pellegrini (reliquia): 1 scudo ogni 10 servi. */
export const pilgrimIncome = (p: Player) => (hasEffetto(p, 'reliquia') ? INT(p.servi / 10) : 0);

// ---------------------------------------------------------------- esito

export interface FattoOutcome {
  id: FattoId;
  option?: string;
  scudi: number;
  servi: number;
  grano: number;
  acri?: number;
  mercati?: number;
  opifici?: number;
  /** variazione del raccolto in vendita quest'anno */
  raccolto?: number;
  prezzo?: number;
  umore?: number;
  prestigio?: number;
  effetto?: EffettoKind;
  /** il ciambellano ha rubato */
  furto?: number;
}

/** Un fatto può avere opzioni non praticabili (mancano scudi o grano). */
export function fattoOptionOk(p: Player, id: FattoId, opt: string): boolean {
  if (id === 'mulino' && opt === 'finanziare') return p.scudi - mulinoCost(p) >= -p.credito;
  if (id === 'immigrati' && opt === 'accogliere') return p.grano >= IMMIGRANT_FOOD * immigrantCount(p, 1);
  if (id === 'incendio' && opt === 'ricostruire') return p.scudi - rebuildCost(p) >= -p.credito;
  if (id === 'visitaRe' && opt === 'sontuosa') return p.scudi >= visitCost(p);
  return true;
}

/**
 * Applica il fatto (e la scelta, se ce n'è una). `sc` è lo stato del turno:
 * piogge e cavallette cambiano il raccolto in vendita e il prezzo di quest'anno.
 */
export function resolveFatto(
  p: Player, sc: { raccolto: number; prezzo: number; prezzoVendita?: number; prezzoBase?: number },
  id: FattoId, opt: string | undefined, q: number, rnd: () => number,
): FattoOutcome {
  const out: FattoOutcome = { id, ...(opt ? { option: opt } : {}), scudi: 0, servi: 0, grano: 0 };
  const scudi = (v: number) => { v = INT(v); p.scudi += v; out.scudi += v; };
  const grano = (v: number) => { v = INT(v); p.grano += v; out.grano += v; };
  const effetto = (kind: EffettoKind, years: number) => { addEffetto(p, kind, q + years - 1); out.effetto = kind; };
  switch (id) {
    case 'piogge': {
      const extra = INT(sc.raccolto * PIOGGE_BONUS);
      sc.raccolto += extra;
      out.raccolto = extra;
      break;
    }
    case 'cavallette': {
      const lost = INT(sc.raccolto * CAVALLETTE_LOSS);
      sc.raccolto -= lost;
      out.raccolto = -lost;
      const up = (v: number) => Math.round(v * (1 + CAVALLETTE_PRICE));
      const before = sc.prezzo;
      sc.prezzo = up(sc.prezzo);
      if (sc.prezzoVendita !== undefined) sc.prezzoVendita = up(sc.prezzoVendita);
      if (sc.prezzoBase !== undefined) sc.prezzoBase = up(sc.prezzoBase);
      out.prezzo = sc.prezzo - before;
      break;
    }
    case 'mulino':
      if (opt === 'finanziare') {
        scudi(-mulinoCost(p));
        effetto('mulino', MULINO_YEARS);
        const extra = INT(sc.raccolto * MULINO_BONUS);
        sc.raccolto += extra;
        out.raccolto = extra;
      }
      break;
    case 'immigrati':
      if (opt === 'accogliere') {
        const k = immigrantCount(p, rnd());
        grano(-IMMIGRANT_FOOD * k);
        p.servi += k;
        out.servi += k;
        // a volte con i profughi arriva una malattia
        if (rnd() < IMMIGRANT_SICK) {
          const sick = INT(p.servi * 0.05);
          p.servi -= sick;
          out.servi -= sick;
        }
      }
      break;
    case 'eredita': {
      const r = rnd();
      const canM = roomFor(p, 'mercato') > 0, canO = roomFor(p, 'opificio') > 0;
      if (r < 0.25 && p.acri < MAX_ACRI) {
        p.acri = Math.min(MAX_ACRI, p.acri + ACRI_PER_ACQUISTO);
        out.acri = ACRI_PER_ACQUISTO;
      } else if (r < 0.5 && canM) {
        p.mercato += 1;
        out.mercati = 1;
      } else if (r < 0.75 && canO) {
        p.opificio += 1;
        out.opifici = 1;
      } else {
        scudi(share(p.scudi, 0.1, 500));
      }
      break;
    }
    case 'incendio': {
      const t = fireTarget(p);
      if (t === 'grano') grano(-p.grano * MUFFA);
      else if (opt === 'ricostruire') scudi(-rebuildCost(p));
      else if (t === 'mercato') {
        p.mercato -= 1;
        out.mercati = -1;
      } else {
        p.opificio -= 1;
        out.opifici = -1;
      }
      break;
    }
    case 'ciambellano': {
      const stolen = theftAmount(p, rnd());
      scudi(-stolen);
      out.furto = stolen;
      if (opt === 'processare') {
        scudi(-PROCESSO_COST);
        p.effetti = effettiOf(p).filter(e => e.kind !== 'ciambellano');
      } else {
        effetto('ciambellano', CIAMBELLANO_YEARS);
      }
      break;
    }
    case 'reliquia':
      effetto('reliquia', RELIQUIA_YEARS);
      if (p.umore !== undefined) {
        const u = Math.min(100, p.umore + RELIQUIA_MOOD);
        out.umore = u - p.umore;
        p.umore = u;
      }
      break;
    case 'visitaRe':
      if (opt === 'sontuosa') {
        const cost = visitCost(p);
        scudi(-cost);
        p.prestigio = (p.prestigio ?? 0) + 2 * cost;
        out.prestigio = 2 * cost;
      } else {
        effetto('sdegno', SDEGNO_YEARS);
      }
      break;
    case 'mulinoGuasto':
      effetto('mulinoGuasto', 1);
      break;
    case 'muffa':
      grano(-p.grano * MUFFA);
      break;
    case 'decima':
      effetto('decima', 1);
      break;
  }
  return out;
}

/** Le scelte del fatto per questo signore (nessuna se l'effetto è immediato). */
export function fattoOptions(p: Player, id: FattoId): readonly string[] {
  if (id === 'incendio' && fireTarget(p) === 'grano') return [];
  return FATTO_OPTIONS[id] ?? [];
}
