/**
 * Il sensale di piazza (opzione `sensale`, con la riforma delle gabelle):
 * ogni anno si presenta al signore uno di tre esperti, sorteggiato. Assoldato
 * durante la Delibera per un compenso che cresce con il rango, alle rendite
 * dice se le gabelle in bozza sono basse, eque o inique per il popolo (bevere
 * e macina) e per i mercanti (commerzio). Il più caro sbaglia di meno.
 */
import { fiduciaOf, LIVELLO_MIN, MOOD_DRIFT, nextFiducia, nextUmore, tolleranzaMercanti, tolleranzaServi } from './gabelle';
import { rankOf } from './rank';
import { Mulberry32 } from './rng';
import type { Game } from './turn';
import type { ActionResult, Player } from './types';

export type SensaleId = 'baldo' | 'cecco' | 'taddeo';
export const SENSALI: Record<SensaleId, { name: string; err: number; cost: number }> = {
  baldo: { name: 'Baldo Orecchiofine', err: 5, cost: 150 },
  cecco: { name: 'Cecco il Mormoratore', err: 7, cost: 100 },
  taddeo: { name: 'Taddeo Linguasciolta', err: 10, cost: 75 },
};
export const SENSALE_IDS = Object.keys(SENSALI) as SensaleId[];
/**
 * Moltiplicatore del compenso per rango (messere, conte, duca, granduca, principe).
 * La rendita media cresce da circa 900 a 50.000 scudi l'anno: il sensale pesa
 * di più sui poveri, ma una rivolta costa da un quarto a metà del grano e il
 * 3-8% del tesoro, e se ne evita una ogni 8-10 anni si ripaga.
 */
export const SENSALE_RANK = [1, 3, 6, 10, 15] as const;

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

/** Si assolda per l'anno in corso, durante la Delibera: il compenso si paga subito. */
export function hireSensale(g: Game): ActionResult {
  const p = g.player, me = g.state.current;
  if (g.state.phase.kind !== 'commercio') return { ok: false, reason: 'il sensale si assolda durante la Delibera' };
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

/**
 * Giudizio del sensale sulle gabelle in bozza, secondo la sua stima del
 * prossimo anno: iniqua se popolo (bevere e macina) o mercanti (commerzio)
 * scenderanno sotto "buono"; equa se resteranno contenti, ma con la stima
 * sbagliata e un anno sfortunato può ancora andar male; bassa se resteranno
 * contenti comunque. Tiene conto del grano dato e venduto quest'anno.
 */
export function sensaleVerdict(g: Game, r: { bevere: number; macina: number; commerzio: number }): { popolo: Giudizio; mercanti: Giudizio } | null {
  const s = hireOf(g, g.state.current);
  const p = g.player, sc = g.state.scalars;
  if (!s || !sensaleUseful(g)) return null;
  const q = { ...p, rateBevere: r.bevere, rateMacina: r.macina, rateCommerzio: r.commerzio };
  const domanda = sc.domandaAnno ?? sc.domanda;
  const u = nextUmore(q, tolleranzaServi(sc.nutrito ?? 0, domanda)) + s.errU;
  const f = nextFiducia({ ...q, fiducia: fiduciaOf(p) }, tolleranzaMercanti(sc.venduto ?? 0, domanda)) + s.errF;
  const safe = sensaleSafe(s.who);
  const judge = (v: number): Giudizio => (v >= LIVELLO_MIN.buono + safe ? 'bassa' : v >= LIVELLO_MIN.buono ? 'equa' : 'iniqua');
  return { popolo: judge(u), mercanti: judge(f) };
}
