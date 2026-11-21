/**
 * Il sensale di piazza (opzione `sensale`, con la riforma delle gabelle):
 * ogni anno si presenta al signore uno di tre esperti, sorteggiato. Assoldato
 * alle rendite per un compenso che raddoppia a ogni rango, alle rendite
 * dice se le gabelle in bozza sono basse, eque o inique per il popolo (bevere
 * e macina) e per i mercanti (commerzio). Il più caro sbaglia di meno.
 */
import {
  fiduciaOf, fiduciaTarget, LIVELLO_MIN, MOOD_DRIFT, nextFiducia, nextUmore, tolleranzaMercanti, tolleranzaServi, umoreTarget,
} from './gabelle';
import { rankOf } from './rank';
import { RATE_SUM_CAP, yieldPerPoint, type Rates } from './strategy';
import { Mulberry32 } from './rng';
import type { Game } from './turn';
import type { ActionResult, Player } from './types';

export type SensaleId = 'baldo' | 'cecco' | 'taddeo';
export const SENSALI: Record<SensaleId, { name: string; err: number; cost: number }> = {
  baldo: { name: 'Baldo Orecchiofine', err: 5, cost: 100 },
  cecco: { name: 'Cecco il Mormoratore', err: 7, cost: 75 },
  taddeo: { name: 'Taddeo Linguasciolta', err: 10, cost: 50 },
};
export const SENSALE_IDS = Object.keys(SENSALI) as SensaleId[];
/**
 * Moltiplicatore del compenso per rango (messere, conte, duca, granduca, principe):
 * il compenso raddoppia a ogni passaggio di rango, non cresce con gli anni.
 */
export const SENSALE_RANK = [1, 2, 4, 8, 16] as const;

/** Sensale al servizio di un signore per l'anno q, con lo scarto (fisso per l'anno) delle sue stime. */
export interface SensaleHire {
  q: number;
  who: SensaleId;
  errU: number;
  errF: number;
}

/** Il sensale serve solo con la riforma delle gabelle (umore e fiducia nascosti) e con l'opzione. */
export const sensaleUseful = (g: Game, p: Player = g.player) => !!g.state.options.sensale && p.fiducia !== undefined;

/** Hash della partita per i sorteggi del sensale: ricaricando non cambiano. */
function seed(g: Game, ...salt: number[]): number {
  let h = 2166136261;
  for (const v of [...g.state.players.map(p => p.feudo * 31 + p.name.length), ...salt]) h = Math.imul(h ^ v, 16777619) >>> 0;
  return h;
}

/** Il sensale che si presenta quest'anno al signore `i`. */
export function sensaleOfTurn(g: Game, i = g.state.current): SensaleId {
  return SENSALE_IDS[Math.floor(new Mulberry32(seed(g, g.state.q, i, 0x5e75a1e)).next() * SENSALE_IDS.length)];
}

export const sensaleCost = (p: Player, who: SensaleId) => SENSALI[who].cost * SENSALE_RANK[rankOf(p) - 1];
const hireOf = (g: Game, i: number) => {
  const s = g.state.sensale?.[i];
  return s && s.q === g.state.q ? s : null;
};
export const hasSensale = (g: Game, i = g.state.current) => hireOf(g, i) !== null;
/** Il sensale di quest'anno: quello assoldato o quello che si presenta. */
export const sensaleNow = (g: Game, i = g.state.current): SensaleId => hireOf(g, i)?.who ?? sensaleOfTurn(g, i);

/** Si assolda per l'anno in corso, alle rendite, mentre si fissano le gabelle: il compenso si paga subito. */
export function hireSensale(g: Game): ActionResult {
  const p = g.player, me = g.state.current;
  if (g.state.phase.kind !== 'rendite') return { ok: false, reason: 'il sensale si assolda alle rendite' };
  if (!sensaleUseful(g)) return { ok: false, reason: "senza la riforma delle gabelle non c'è nulla da indovinare" };
  if (hasSensale(g)) return { ok: false, reason: "il sensale è già al vostro servizio quest'anno" };
  const who = sensaleOfTurn(g), cost = sensaleCost(p, who);
  if (p.scudi - cost < -p.credito) return { ok: false, reason: 'tesoro e credito insufficienti' };
  p.scudi -= cost;
  // lo scarto della stima è fisso per l'anno: muovendo i cursori non cambia idea
  const r = new Mulberry32(seed(g, g.state.q, me, 0x5a1e5));
  const err = () => Math.round((r.next() * 2 - 1) * SENSALI[who].err);
  (g.state.sensale ??= g.state.players.map(() => null))[me] = { q: g.state.q, who, errU: err(), errF: err() };
  g.note(me, { t: 'sensale', who, cost });
  return { ok: true };
}

export type Giudizio = 'bassa' | 'equa' | 'iniqua';

/**
 * Margine oltre il quale le gabelle sono "basse": anche se il sensale sbaglia
 * per eccesso del massimo e la deriva casuale dell'anno va tutta in peggio,
 * popolo e mercanti restano almeno contenti. Rivolte e fughe sono impossibili.
 */
export const sensaleSafe = (who: SensaleId) => SENSALI[who].err + MOOD_DRIFT;

/** Il giudizio sulle gabelle di un gruppo e l'avviso che l'anno prossimo sarà ancora scontento. */
export interface Verdetto {
  popolo: Giudizio;
  mercanti: Giudizio;
  /** l'umore del popolo resterà basso l'anno prossimo anche con queste gabelle (risale piano) */
  popoloAncora: boolean;
  mercantiAncora: boolean;
}

/**
 * Giudizio del sensale sulle gabelle in bozza: guarda dove porteranno popolo
 * (bevere e macina) e mercanti (commerzio) se restano così, non dove saranno
 * l'anno prossimo. Umore e fiducia si muovono piano verso quel punto: con il
 * popolo infuriato nemmeno le gabelle a zero lo rendono contento in un anno, e
 * giudicarle "inique" non avrebbe senso.
 *
 * - iniqua: a lungo andare popolo o mercanti scenderanno sotto "buono";
 * - equa: resteranno contenti, ma con la stima sbagliata può ancora andar male;
 * - bassa: resteranno contenti comunque.
 *
 * A parte, l'avviso "ancora": secondo la sua stima l'anno prossimo saranno
 * ancora vicini o sotto "buono" (rivolte e fughe possibili), qualunque sia il
 * giudizio. Tiene conto del grano dato e venduto quest'anno.
 */
export function sensaleVerdict(g: Game, r: { bevere: number; macina: number; commerzio: number }): Verdetto | null {
  const s = hireOf(g, g.state.current);
  const p = g.player, sc = g.state.scalars;
  if (!s || !sensaleUseful(g)) return null;
  const q = { ...p, rateBevere: r.bevere, rateMacina: r.macina, rateCommerzio: r.commerzio };
  const domanda = sc.domandaAnno ?? sc.domanda;
  const tu = tolleranzaServi(sc.nutrito ?? 0, domanda), tf = tolleranzaMercanti(sc.venduto ?? 0, domanda);
  const safe = sensaleSafe(s.who), buono = LIVELLO_MIN.buono;
  const judge = (v: number): Giudizio => (v >= buono + safe ? 'bassa' : v >= buono ? 'equa' : 'iniqua');
  // dove tendono, con queste gabelle (e il capriccio che il sensale sente in piazza)
  const meta = (t: number, capriccio = 0, err = 0) => Math.min(100, Math.max(0, Math.round(t + capriccio + err)));
  const mu = meta(umoreTarget(r.bevere, r.macina, tu), p.capriccioU, s.errU);
  const mf = meta(fiduciaTarget(r.commerzio, tf), p.capriccioF, s.errF);
  // e l'anno prossimo
  const u = nextUmore(q, tu) + s.errU;
  const f = nextFiducia({ ...q, fiducia: fiduciaOf(p) }, tf) + s.errF;
  return { popolo: judge(mu), mercanti: judge(mf), popoloAncora: u < buono + safe, mercantiAncora: f < buono + safe };
}

// ---------------------------------------------------------------- il consiglio del sensale

/** Le gabelle che il sensale consiglia: le più alte che giudica eque, e quelle per far risalire in fretta l'umore. */
export interface Consiglio {
  ideali: Rates;
  /** gabelle più miti per tornare contenti già l'anno prossimo (null se non serve) */
  rapide: Rates | null;
  /** chi è scontento: il popolo, i mercanti o entrambi */
  popolo: boolean;
  mercanti: boolean;
}

/**
 * Il consiglio del sensale, con la sua stima (scarto compreso), per l'anno.
 *
 * - Ideali: la rendita più alta con gabelle che a lungo andare lasciano popolo
 *   e mercanti almeno "buono" (né bassa né iniqua: il confine dell'equa). Fra
 *   bevere e macina pesa il frutto di ogni punto sull'umore: la macina ne costa metà.
 * - Rapide, se l'umore o la fiducia sono bassi: le gabelle più alte con cui,
 *   secondo lui, l'anno prossimo popolo o mercanti tornano già a "buono"; se
 *   nemmeno a zero basta, tutte a zero, per risalire il più in fretta possibile.
 */
export function sensaleConsiglio(g: Game): Consiglio | null {
  const s = hireOf(g, g.state.current);
  const p = g.player, sc = g.state.scalars;
  if (!s || !sensaleUseful(g)) return null;
  const domanda = sc.domandaAnno ?? sc.domanda;
  const tu = tolleranzaServi(sc.nutrito ?? 0, domanda), tf = tolleranzaMercanti(sc.venduto ?? 0, domanda);
  const buono = LIVELLO_MIN.buono, safe = sensaleSafe(s.who);
  const y = yieldPerPoint(p, sc);
  const metaU = (b: number, m: number) => Math.round(umoreTarget(b, m, tu) + (p.capriccioU ?? 0) + s.errU);
  const metaF = (c: number) => Math.round(fiduciaTarget(c, tf) + (p.capriccioF ?? 0) + s.errF);
  const nextU = (b: number, m: number) => nextUmore({ ...p, rateBevere: b, rateMacina: m }, tu) + s.errU;
  const nextF = (c: number) => nextFiducia({ ...p, fiducia: fiduciaOf(p), rateCommerzio: c }, tf) + s.errF;
  /** bevere e macina più fruttuosi che rispettano `ok` (l'umore cala con entrambi: per ogni bevere, la macina più alta) */
  const popolo = (ok: (b: number, m: number) => boolean) => {
    let best = { bevere: 0, macina: 0 }, top = -1;
    for (let b = 0; b <= 99; b++) {
      if (!ok(b, 0)) break;
      let m = 99;
      while (m > 0 && !ok(b, m)) m--;
      const v = y.bevere * b + y.macina * m;
      if (v > top + 1e-9 || (Math.abs(v - top) <= 1e-9 && b + m < best.bevere + best.macina)) (top = v), (best = { bevere: b, macina: m });
    }
    return best;
  };
  const commerzio = (ok: (c: number) => boolean) => {
    let c = 99;
    while (c > 0 && !ok(c)) c--;
    return c;
  };
  const cap = (r: Rates): Rates => {
    const over = r.bevere + r.macina + r.commerzio - RATE_SUM_CAP;
    return over > 0 ? { ...r, macina: Math.max(0, r.macina - over) } : r;
  };
  const ideali = cap({ ...popolo((b, m) => metaU(b, m) >= buono), commerzio: commerzio(c => metaF(c) >= buono) });
  const tristeU = nextU(ideali.bevere, ideali.macina) < buono + safe;
  const tristeF = nextF(ideali.commerzio) < buono + safe;
  // per risalire: contenti già l'anno prossimo, o tutto a zero se non basta
  const pr = tristeU ? popolo((b, m) => nextU(b, m) >= buono && metaU(b, m) >= buono) : ideali;
  const cr = tristeF ? commerzio(c => nextF(c) >= buono && metaF(c) >= buono) : ideali.commerzio;
  const rapide = cap({ bevere: pr.bevere, macina: pr.macina, commerzio: cr });
  const diverse = rapide.bevere !== ideali.bevere || rapide.macina !== ideali.macina || rapide.commerzio !== ideali.commerzio;
  return {
    ideali,
    rapide: diverse ? rapide : null,
    popolo: diverse && (rapide.bevere !== ideali.bevere || rapide.macina !== ideali.macina),
    mercanti: diverse && rapide.commerzio !== ideali.commerzio,
  };
}
