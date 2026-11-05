/**
 * Fazioni storiche regionali: Franchi, Ungari, Longobardi, Bizantini e
 * Saraceni prendono il posto dell'unico tributo longobardo del listato.
 *
 * Ogni anno, fra gli imprevisti, c'è una probabilità di attacco (di base 4
 * caselle su 32, circa 12%). La fazione che attacca si sceglie con pesi
 * geografici: dipende dalla città del signore. Ogni fazione colpisce una
 * parte diversa dell'economia e offre scelte proprie; alcune scelte lasciano
 * un patto che dura da 3 a 8 anni e cambia rendite, raccolto e probabilità di
 * nuovi attacchi (un tributo li richiama, un protettorato li allontana).
 */
import { INT } from './economy';
import { MAX_PALAZZO } from './investments';
import type { Rng } from './rng';
import type { EventOutcome, Player } from './types';

export type FactionId = 'franchi' | 'ungari' | 'longobardi' | 'bizantini' | 'saraceni';
export const FACTIONS: FactionId[] = ['franchi', 'ungari', 'longobardi', 'bizantini', 'saraceni'];

/** Identificativo d'imprevisto di ciascuna fazione (dopo gli 8 del listato e la rivolta). */
export const FACTION_EVENT: Record<FactionId, number> = { franchi: 10, ungari: 11, longobardi: 12, bizantini: 13, saraceni: 14 };
export const factionOfEvent = (id: number): FactionId | undefined => FACTIONS.find(f => FACTION_EVENT[f] === id);

/**
 * Pesi geografici (in ordine FACTIONS) per città, nello stesso ordine di FEUDI:
 * Taurinum, Mediolanum, Verona, Ravenna, Roma, Beneventum, Neapolis, Barium, Panormus.
 */
export const CITY_WEIGHTS: readonly (readonly number[])[] = [
  [55, 20, 10, 5, 10], // Taurinum: Franchi, e i Saraceni di Frassineto dalle Alpi
  [50, 30, 10, 5, 5], // Mediolanum
  [35, 45, 10, 5, 5], // Verona
  [15, 40, 15, 20, 10], // Ravenna: Ungari dalla pianura, Bizantini dall'esarcato
  [20, 15, 25, 15, 25], // Roma: un po' di tutti
  [5, 5, 55, 20, 15], // Beneventum
  [5, 5, 25, 25, 40], // Neapolis
  [5, 5, 10, 50, 30], // Barium
  [5, 0, 5, 30, 60], // Panormus
];

/** Scelte di ciascuna fazione, nell'ordine in cui si presentano. */
export const FACTION_OPTIONS = {
  franchi: ['combattere', 'tributo', 'matrimonio'],
  ungari: ['affrontare', 'mura', 'passaggio'],
  longobardi: ['combattere', 'tributo', 'vassallo'],
  bizantini: ['rifiutare', 'protettorato', 'corrompere'],
  saraceni: ['difendere', 'riscatto', 'saccheggio', 'accordi'],
} as const satisfies Record<FactionId, readonly string[]>;
export type FactionOption = (typeof FACTION_OPTIONS)[FactionId][number];

/** Scelte che portano alla battaglia. */
export const BATTLE_OPTIONS: readonly FactionOption[] = ['combattere', 'affrontare', 'rifiutare', 'difendere'];

// ---------------------------------------------------------------- orde e difesa

/**
 * Uomini di un'orda: crescono del 16% l'anno, così da tenere il passo con
 * i feudi che crescono. Ogni fazione ha la sua forza (gli Ungari arrivano in
 * massa, i Saraceni con poche navi), e ogni orda varia del ±20%.
 */
export const HORDE_BASE = 450;
export const HORDE_GROWTH = 1.16;
export const FACTION_STRENGTH: Record<FactionId, number> = { franchi: 1.1, ungari: 1.25, longobardi: 1, bizantini: 1.05, saraceni: 0.9 };
/** un servo armato alla meglio vale mezzo soldato nemico */
export const SERVO_VALUE = 0.5;
/** probabilità di vittoria mai sotto il 5% né sopra il 95%: la fortuna conta sempre un poco */
export const MIN_WIN = 0.05;
export const MAX_WIN = 0.95;

/** Uomini dell'orda di `f` nell'anno 900 + q (r: numero casuale in [0,1)). */
export const hordeSize = (f: FactionId, q: number, r: number) =>
  Math.max(50, Math.round(HORDE_BASE * HORDE_GROWTH ** q * FACTION_STRENGTH[f] * (0.8 + 0.4 * r)));

/** Forze del signore: i servi (mezzo nemico ciascuno), più soldati e mura delle espansioni. */
export interface Defense {
  /** forza dei servi */
  servi: number;
  /** forza dei soldati (espansioni) */
  soldati: number;
  /** moltiplicatore delle mura (1: nessuna) */
  mura: number;
  /** forza totale */
  total: number;
}

export function defenseFrom(p: Player, soldati = 0, mura = 1): Defense {
  const servi = INT(Math.max(0, p.servi) * SERVO_VALUE);
  return { servi, soldati, mura, total: INT((servi + soldati) * mura) };
}

/**
 * Probabilità di vittoria: D² / (D² + A²). Alla pari 50%, con forze doppie
 * 80%, con metà forze 20%.
 */
export function winChance(defense: number, horde: number): number {
  const d = defense ** 2, a = horde ** 2;
  return Math.min(MAX_WIN, Math.max(MIN_WIN, d + a > 0 ? d / (d + a) : 0.5));
}

// ---------------------------------------------------------------- patti

export type PactKind =
  | 'respinti' // vittoria: la fazione torna meno spesso
  | 'tributari' // tributo pagato: la fazione torna più spesso, e gli attacchi in genere
  | 'matrimonio' // Franchi: nessun attacco franco
  | 'vassallo' // Longobardi: nessun attacco longobardo, meno attacchi, ma tassa sul raccolto
  | 'protettorato' // Bizantini: quasi nessun attacco, commercio più ricco, tributo annuo
  | 'corrotti' // Bizantini: il governatore chiude un occhio
  | 'accordi' // Saraceni: mercati più ricchi, ma più incursioni saracene
  | 'devastati' // Ungari: campi devastati, raccolto ridotto
  | 'parentela' // Dinastia: nozze con una casata della fazione, che non attacca più; le sue rivali vengono più spesso
  | 'vendetta'; // Dinastia: la fazione si vendica di un ripudio

export interface Pact {
  faction: FactionId;
  kind: PactKind;
  /** ultimo anno (q) in cui vale */
  until: number;
}

export const PACT_YEARS: Record<PactKind, number> = {
  respinti: 6, tributari: 5, matrimonio: 8, vassallo: 8, protettorato: 8, corrotti: 4, accordi: 8, devastati: 3, parentela: 999, vendetta: 7,
};

/** Dinastia: le rivali di una fazione imparentata con il signore, che vengono più spesso, e di quanto. */
export const RIVALI: Partial<Record<FactionId, FactionId[]>> = { franchi: ['ungari'], longobardi: ['bizantini'], bizantini: ['saraceni', 'longobardi'] };
export const RIVALI_PESO = 1.5;
/** vendetta per un ripudio: peso della fazione e caselle d'attacco in più */
export const VENDETTA_PESO = 3;
export const VENDETTA_SLOTS = 2;

/** Effetto dei patti sul peso della fazione nella scelta di chi attacca. */
const WEIGHT_MOD: Record<PactKind, number> = {
  respinti: 0.4, tributari: 1.6, matrimonio: 0, vassallo: 0, protettorato: 0, corrotti: 0.3, accordi: 2, devastati: 1, parentela: 0, vendetta: VENDETTA_PESO,
};

export const BASE_ATTACK_SLOTS = 4;
export const MAX_ATTACK_SLOTS = 13;
/** il protettorato bizantino tiene lontane quasi tutte le fazioni, il vassallaggio longobardo metà */
export const PROTETTORATO_SHIELD = 0.25;
export const VASSALLO_SHIELD = 0.5;

/** Tassa del duca longobardo sul raccolto, e raccolto perduto nei campi devastati dagli Ungari. */
export const VASSALLO_HARVEST_TAX = 0.15;
export const DEVASTATION_HARVEST_LOSS = 0.3;
/** Protettorato: tributo sulla rendita e bonus del commercio (mercati e opifici). */
export const PROTETTORATO_TRIBUTE = 0.1;
export const PROTETTORATO_TRADE_BONUS = 0.25;
/** Accordi saraceni: bonus dei mercati. */
export const ACCORDI_MARKET_BONUS = 0.3;

export const pactsOf = (p: Player): Pact[] => p.patti ?? [];
export const hasPact = (p: Player, kind: PactKind, faction?: FactionId) =>
  pactsOf(p).some(x => x.kind === kind && (!faction || x.faction === faction));

/** Aggiunge un patto (o ne rinnova la durata). */
export function addPact(p: Player, faction: FactionId, kind: PactKind, q: number): Pact {
  const pact: Pact = { faction, kind, until: q + PACT_YEARS[kind] };
  p.patti = [...pactsOf(p).filter(x => !(x.faction === faction && x.kind === kind)), pact];
  return pact;
}

/** Toglie i patti scaduti prima dell'anno q. */
export function expirePacts(p: Player, q: number): Pact[] {
  const gone = pactsOf(p).filter(x => x.until < q);
  if (gone.length) p.patti = pactsOf(p).filter(x => x.until >= q);
  return gone;
}

/** Caselle (su 32) che diventano un attacco: dipendono dai patti in vigore. */
export function attackSlots(p: Player): number {
  const ps = pactsOf(p);
  const extra = Math.min(2, ps.filter(x => x.kind === 'tributari').length) + (hasPact(p, 'accordi') ? 1 : 0) + (hasPact(p, 'vendetta') ? VENDETTA_SLOTS : 0);
  let scale = 1;
  if (hasPact(p, 'protettorato')) scale *= PROTETTORATO_SHIELD;
  if (hasPact(p, 'vassallo')) scale *= VASSALLO_SHIELD;
  return Math.max(0, Math.min(MAX_ATTACK_SLOTS, Math.round((BASE_ATTACK_SLOTS + extra) * scale)));
}

/** Peso di ogni fazione per il feudo del signore, corretto dai patti. */
export function factionWeights(p: Player): Record<FactionId, number> {
  const base = CITY_WEIGHTS[p.feudo] ?? CITY_WEIGHTS[4];
  const w = Object.fromEntries(FACTIONS.map((f, i) => [f, base[i]])) as Record<FactionId, number>;
  for (const x of pactsOf(p)) w[x.faction] *= WEIGHT_MOD[x.kind];
  for (const x of pactsOf(p).filter(y => y.kind === 'parentela')) for (const r of RIVALI[x.faction] ?? []) w[r] *= RIVALI_PESO;
  return w;
}

/** Sceglie la fazione che attacca (null se nessuna può). Consuma 1 RND. */
export function pickFaction(p: Player, r: number): FactionId | null {
  const w = factionWeights(p);
  const tot = FACTIONS.reduce((a, f) => a + w[f], 0);
  if (tot <= 0) return null;
  let x = r * tot;
  for (const f of FACTIONS) {
    x -= w[f];
    if (x < 0) return f;
  }
  return FACTIONS.filter(f => w[f] > 0).pop()!;
}

// ---------------------------------------------------------------- costi delle scelte

const share = (scudi: number, pct: number, min: number) => Math.max(min, INT(Math.max(0, scudi) * pct));

/** Dote del matrimonio dinastico con una casata franca. */
export const marriageCost = (p: Player) => share(p.scudi, 0.2, 5000);
export const tributeCost = (p: Player, f: FactionId) => share(p.scudi, f === 'franchi' ? 0.12 : 0.1, f === 'longobardi' ? 300 : 400);
export const bribeCost = (p: Player) => share(p.scudi, 0.25, 1500);

/** Una scelta può essere preclusa (la dote si paga in contanti). */
export function optionAvailable(p: Player, opt: FactionOption): boolean {
  if (opt === 'matrimonio') return p.scudi >= marriageCost(p);
  return true;
}

// ---------------------------------------------------------------- esito

export interface FactionOutcome extends EventOutcome {
  faction: FactionId;
  option: FactionOption;
  /** esito della battaglia, se c'è stata */
  win?: boolean;
  mercati?: number;
  opifici?: number;
  palazzo?: number;
  /** patti nati dalla scelta */
  pacts?: Pact[];
}

/**
 * Applica la scelta. Le battaglie consumano 2 RND (esito ed entità), le altre
 * scelte nessuno. `chance` è la probabilità di vittoria (da winChance).
 */
export function resolveFaction(p: Player, f: FactionId, opt: FactionOption, rng: Rng, q: number, chance = 0.5): FactionOutcome {
  const out: FactionOutcome = { faction: f, option: opt, scudi: 0, servi: 0 };
  const scudi = (v: number) => { v = INT(v); p.scudi += v; out.scudi += v; };
  const servi = (pct: number) => {
    const v = Math.min(p.servi, INT(p.servi * pct));
    p.servi -= v;
    out.servi -= v;
  };
  const grano = (pct: number) => {
    const v = INT(p.grano * pct);
    p.grano -= v;
    out.grano = (out.grano ?? 0) - v;
  };
  const lose = (k: 'mercato' | 'opificio' | 'palazzo') => {
    const floor = k === 'palazzo' ? 0 : 1;
    if (p[k] <= floor) return false;
    p[k] -= 1;
    const key = k === 'mercato' ? 'mercati' : k === 'opificio' ? 'opifici' : 'palazzo';
    out[key] = (out[key] ?? 0) - 1;
    return true;
  };
  const pact = (kind: PactKind) => (out.pacts ??= []).push(addPact(p, f, kind, q));

  if (BATTLE_OPTIONS.includes(opt)) {
    out.choice = 'pugna';
    out.win = rng.next() < chance;
    const m = rng.next();
    if (out.win) {
      const loot = { franchi: [400, 1200], ungari: [600, 1500], longobardi: [300, 1000], bizantini: [500, 1200], saraceni: [400, 1200] }[f];
      scudi(loot[0] + (loot[1] - loot[0]) * m);
      servi(0.01 + 0.02 * m);
      pact('respinti');
      return out;
    }
    if (f === 'franchi') {
      scudi(-share(p.scudi, 0.15, 300));
      servi(0.03 + 0.03 * m);
      lose('palazzo');
    } else if (f === 'ungari') {
      servi(0.08 + 0.06 * m);
      grano(0.3);
      pact('devastati');
    } else if (f === 'longobardi') {
      scudi(-(300 + 500 * m));
      servi(0.02 + 0.03 * m);
    } else if (f === 'bizantini') {
      lose('mercato');
      lose('opificio');
      servi(0.02 + 0.02 * m);
    } else {
      // i Saraceni portano via i servi come schiavi
      servi(0.05 + 0.05 * m);
      lose('mercato');
    }
    return out;
  }

  switch (opt) {
    case 'tributo':
      scudi(-tributeCost(p, f));
      pact('tributari');
      break;
    case 'matrimonio':
      scudi(-marriageCost(p));
      if (p.palazzo < MAX_PALAZZO) {
        p.palazzo += 1;
        out.palazzo = 1;
      }
      pact('matrimonio');
      break;
    case 'mura':
      grano(0.4);
      pact('devastati');
      break;
    case 'passaggio':
      grano(0.25);
      pact('tributari');
      break;
    case 'vassallo':
      pact('vassallo');
      break;
    case 'protettorato':
      pact('protettorato');
      break;
    case 'corrompere':
      scudi(-bribeCost(p));
      pact('corrotti');
      break;
    case 'riscatto': {
      // si paga in denaro se il tesoro basta, altrimenti in grano
      const cost = tributeCost(p, f);
      if (p.scudi >= cost) scudi(-cost);
      else grano(0.25);
      pact('tributari');
      break;
    }
    case 'saccheggio': {
      const a = lose('mercato'), b = lose('opificio');
      if (!a && !b) grano(0.3);
      break;
    }
    case 'accordi':
      pact('accordi');
      break;
  }
  return out;
}

// ---------------------------------------------------------------- effetti dei patti

/** Quota del raccolto che resta dopo tassa longobarda e devastazioni. */
export function harvestFactor(p: Player): number {
  let k = 1;
  if (hasPact(p, 'vassallo')) k *= 1 - VASSALLO_HARVEST_TAX;
  if (hasPact(p, 'devastati')) k *= 1 - DEVASTATION_HARVEST_LOSS;
  return k;
}

/** Moltiplicatori della rendita di mercati e opifici dovuti ai patti. */
export function tradeFactors(p: Player): { mercati: number; opifici: number } {
  let m = 1, o = 1;
  if (hasPact(p, 'protettorato')) {
    m += PROTETTORATO_TRADE_BONUS;
    o += PROTETTORATO_TRADE_BONUS;
  }
  if (hasPact(p, 'accordi')) m += ACCORDI_MARKET_BONUS;
  return { mercati: m, opifici: o };
}
