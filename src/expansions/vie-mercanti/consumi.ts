/**
 * Le vie dei mercanti: i consumi di prestigio. Vino e manufatti si possono
 * vendere per denaro, o consumare per prestigio (che conta nella ricchezza,
 * come la visita del re, ma non frutta come il denaro). Nulla di questo è
 * obbligatorio: chi non ha merci non resta mai bloccato.
 *
 * - Banchetto (vino): una volta l'anno, piccolo, grande o sontuoso. Prestigio
 *   e buonumore del popolo.
 * - Festa per il nuovo titolo (vino e manufatti): l'anno dopo aver salito di
 *   rango si può celebrare il titolo, con più merci a ogni titolo.
 * - Palazzo (manufatti): ogni piano chiede manufatti per arredi e decori, di
 *   più a ogni piano; quelli che mancano si comprano dagli artigiani, cari.
 * - Richieste (eventi speciali, nel mazzo degli imprevisti): nozze in
 *   famiglia, la cattedrale del vescovo, il legato dell'imperatore. Chiedono
 *   merci entro qualche anno e danno prestigio.
 */
import { registerEvents } from '../../domain/events';
import type { Game } from '../../domain/turn';
import type { ActionResult, Player } from '../../domain/types';
import type { Cantina, Merce } from './merci';

/** Prestigio di ogni unità consumata in un banchetto (le feste e le richieste rendono di più). */
export const PRESTIGIO_BANCHETTO = 20;
export const PRESTIGIO_FESTA = 25;

export type Banchetto = 'piccolo' | 'grande' | 'sontuoso';
export const BANCHETTI: Record<Banchetto, { vino: number; umore: number }> = {
  piccolo: { vino: 100, umore: 4 },
  grande: { vino: 300, umore: 8 },
  sontuoso: { vino: 600, umore: 12 },
};
export const BANCHETTI_ID = Object.keys(BANCHETTI) as Banchetto[];

/** Merci della festa per un titolo (rango 1 = conte, fino a 4 = principe). */
export const festaOf = (rango: number) => ({ vino: 150 * rango, manufatti: 100 * rango });
/** Prestigio mercantile di una festa per il titolo (i mercanti vengono a vedere). */
export const FESTA_PRESTIGIO_MERCANTILE = 5;

/** Manufatti per il piano n di palazzo (1..11) e prezzo di quelli comprati dagli artigiani. */
export const manufattiPiano = (piano: number) => 40 * piano;
export const PREZZO_ARTIGIANI = 15;

export type RichiestaId = 'nozze' | 'cattedrale' | 'legato';
/** Identificativi degli imprevisti che portano le richieste (dopo quelli di Spade e Castelli). */
export const RICHIESTA_EVENT: Record<RichiestaId, number> = { nozze: 111, cattedrale: 112, legato: 113 };
export const RICHIESTE_ID: RichiestaId[] = ['nozze', 'cattedrale', 'legato'];
export const richiestaOfEvent = (id: number) => RICHIESTE_ID.find(r => RICHIESTA_EVENT[r] === id);
export const RICHIESTE: Record<RichiestaId, { vino: number; manufatti: number; prestigio: number; umore?: number; mercantile?: number }> = {
  nozze: { vino: 200, manufatti: 0, prestigio: 6000, umore: 8 },
  cattedrale: { vino: 0, manufatti: 300, prestigio: 9000 },
  legato: { vino: 150, manufatti: 150, prestigio: 9000, mercantile: 5 },
};
/** Anni, dopo quello in cui arriva, in cui una richiesta si può ancora soddisfare. */
export const RICHIESTA_DURATA = 3;
export const RICHIESTA_PESO = 1;

registerEvents([
  { id: RICHIESTA_EVENT.nozze, title: 'Nozze in famiglia', description: 'Si sposa un vostro congiunto: servirà vino per il banchetto nuziale.', effect: { kind: 'carta' } },
  { id: RICHIESTA_EVENT.cattedrale, title: 'La cattedrale', description: 'Il vescovo chiede arredi per la nuova cattedrale.', effect: { kind: 'carta' } },
  { id: RICHIESTA_EVENT.legato, title: "Il legato dell'imperatore", description: "Un legato dell'imperatore annuncia la sua visita.", effect: { kind: 'carta' } },
]);

export interface Richiesta { id: RichiestaId; dal: number }

/** Lo stato dei consumi dentro lo stato dell'espansione. */
export interface ConsumiState {
  cantine: Cantina[];
  /** anno (q) dell'ultimo banchetto di ciascun signore */
  banchetti?: number[];
  /** festa per il titolo da celebrare: rango e anno (q) in cui si può */
  feste?: ({ rango: number; q: number } | null)[];
  /** richieste in mano */
  richieste?: Richiesta[][];
}

export const scadenzaRichiesta = (r: Richiesta) => r.dal + RICHIESTA_DURATA;
export const richiesteOf = (st: ConsumiState, i: number) => st.richieste?.[i] ?? [];
export const banchettoFatto = (g: Game, st: ConsumiState, i: number) => st.banchetti?.[i] === g.state.q;
export const festaDi = (g: Game, st: ConsumiState, i: number) => {
  const f = st.feste?.[i];
  return f && f.q === g.state.q ? f : null;
};

const open = (g: Game): ActionResult | null => {
  const k = g.state.phase.kind;
  return k === 'commercio' || k === 'investimenti' ? null : { ok: false, reason: 'si festeggia nella Delibera o nei dispendimenti' };
};

/** Consuma merci per prestigio (e umore del popolo, se c'è la riforma delle gabelle). */
function consume(p: Player, c: Cantina, need: Record<Merce, number>, prestigio: number, umore = 0): { prestigio: number; umore: number } {
  c.vino -= need.vino;
  c.manufatti -= need.manufatti;
  p.prestigio = (p.prestigio ?? 0) + prestigio;
  let du = 0;
  if (umore && p.umore !== undefined) {
    const u = Math.min(100, p.umore + umore);
    du = u - p.umore;
    p.umore = u;
  }
  return { prestigio, umore: du };
}

const lacks = (c: Cantina, need: Record<Merce, number>) => need.vino > c.vino || need.manufatti > c.manufatti;

/** Banchetto: una volta l'anno. */
export function holdBanquet(g: Game, st: ConsumiState, kind: Banchetto): ActionResult & { prestigio?: number; umore?: number } {
  const no = open(g);
  if (no) return no;
  const me = g.state.current, c = st.cantine[me], b = BANCHETTI[kind];
  if (!b) return { ok: false, reason: 'banchetto sconosciuto' };
  if (banchettoFatto(g, st, me)) return { ok: false, reason: "quest'anno avete già dato un banchetto" };
  if (c.vino < b.vino) return { ok: false, reason: `servono ${b.vino} botti di vino` };
  (st.banchetti ??= g.state.players.map(() => -1))[me] = g.state.q;
  return { ok: true, ...consume(g.player, c, { vino: b.vino, manufatti: 0 }, b.vino * PRESTIGIO_BANCHETTO, b.umore) };
}

/** Rango (1 conte … 4 principe) dal titolo. */
export const rankOf = (title: number) => (title - 1) % 5;

/** Chi è salito di rango alla fine dell'anno scorso può celebrare il titolo quest'anno; ritorna il rango nuovo (0: nessuno). */
export function offerFeast(g: Game, st: ConsumiState, i: number, before: number, after: number): number {
  const r = rankOf(after);
  if (r <= rankOf(before) || r < 1) return 0;
  (st.feste ??= g.state.players.map(() => null))[i] = { rango: r, q: g.state.q };
  return r;
}

/** Festa per il titolo. */
export function holdFeast(g: Game, st: ConsumiState): ActionResult & { prestigio?: number } {
  const no = open(g);
  if (no) return no;
  const me = g.state.current, c = st.cantine[me], f = festaDi(g, st, me);
  if (!f) return { ok: false, reason: 'non c\'è un titolo da celebrare' };
  const need = festaOf(f.rango);
  if (lacks(c, need)) return { ok: false, reason: `servono ${need.vino} botti di vino e ${need.manufatti} pezzi di manufatti` };
  st.feste![me] = null;
  return { ok: true, ...consume(g.player, c, need, (need.vino + need.manufatti) * PRESTIGIO_FESTA) };
}

/** Soddisfa una richiesta in mano. */
export function fulfil(g: Game, st: ConsumiState, id: RichiestaId): ActionResult & { prestigio?: number; umore?: number } {
  const no = open(g);
  if (no) return no;
  const me = g.state.current, c = st.cantine[me];
  const r = richiesteOf(st, me).find(x => x.id === id && g.state.q <= scadenzaRichiesta(x));
  if (!r) return { ok: false, reason: 'richiesta scaduta o inesistente' };
  const x = RICHIESTE[id];
  if (lacks(c, x)) return { ok: false, reason: 'non avete merci abbastanza' };
  st.richieste![me] = richiesteOf(st, me).filter(y => y !== r);
  return { ok: true, ...consume(g.player, c, x, x.prestigio, x.umore) };
}

/** La richiesta arriva in mano (al più una per tipo). */
export function drawRequest(g: Game, st: ConsumiState, i: number, id: RichiestaId): void {
  const hand = (st.richieste ??= g.state.players.map(() => []))[i];
  if (!hand.some(r => r.id === id)) hand.push({ id, dal: g.state.q });
}

/** Richieste scadute, tolte dalla mano. */
export function expireRequests(g: Game, st: ConsumiState, i: number): RichiestaId[] {
  const hand = richiesteOf(st, i);
  const gone = hand.filter(r => g.state.q > scadenzaRichiesta(r));
  if (gone.length) st.richieste![i] = hand.filter(r => !gone.includes(r));
  return gone.map(r => r.id);
}

/**
 * Palazzo: manufatti del prossimo piano; si usano quelli non promessi ai
 * mercanti forestieri (`keep`), quelli che mancano si pagano agli artigiani.
 */
export function palaceNeeds(p: Player, c: Cantina, keep = 0): { manufatti: number; usati: number; comprati: number; scudi: number } {
  const manufatti = manufattiPiano(p.palazzo + 1);
  const usati = Math.min(manufatti, Math.max(0, c.manufatti - keep));
  const comprati = manufatti - usati;
  return { manufatti, usati, comprati, scudi: comprati * PREZZO_ARTIGIANI };
}
