/**
 * Le vie dei mercanti: la fiera biennale dei mercanti forestieri.
 *
 * - Ogni due anni (902, 904, …) i mercanti delle piazze (Venezia, Genova,
 *   Pisa, Amalfi, Messina, Costantinopoli) cercano vino e manufatti. I
 *   contratti sono uguali per tutti; chi investe di più alla fiera ne vede di
 *   più: 300 scudi il primo, 850 i primi 3, 3.000 i primi 6, 10.000 tutti
 *   e 10. Le quote alte mostrano i contratti più ricchi: quelli della loggia
 *   pagano molto di più l'unità, i grandi e lo speciale del palazzo ancora di più.
 * - Gara al ribasso, a buste chiuse: ogni signore offre un prezzo l'unità.
 *   Conta per il 90% la convenienza del prezzo e per il 10% il prestigio
 *   mercantile. Al prezzo base l'offerta è sempre accettata; sopra il prezzo
 *   base i mercanti accettano di rado, e mai oltre la metà in più.
 * - Il vincitore spedisce la merce entro uno o due anni (alla fine dell'anno
 *   di scadenza la carovana parte da sola con quello che c'è in magazzino).
 *   Si incassa all'arrivo: chi arriva in ritardo è pagato un decimo in meno,
 *   la merce perduta non si paga, e chi non consegna paga una penale.
 */
import { INT } from '../../domain/economy';
import type { Game } from '../../domain/turn';
import type { ActionResult } from '../../domain/types';
import { late, rollJourney, type EventoViaggio } from './carovane';
import { PIAZZE, travelYears, type PiazzaId } from './geografia';
import { MERCI, type Merce, type MerciState } from './merci';

/** La prima fiera e ogni quanti anni si tiene. */
export const FIERA_DAL = 2;
export const FIERA_OGNI = 2;
export const isFairYear = (q: number) => q >= FIERA_DAL && (q - FIERA_DAL) % FIERA_OGNI === 0;
export const nextFair = (q: number) => (q < FIERA_DAL ? FIERA_DAL : q + ((FIERA_OGNI - ((q - FIERA_DAL) % FIERA_OGNI)) % FIERA_OGNI));

/** Quote d'ingresso alla fiera: quanto costa e quanti contratti si vedono (le quote alte mostrano i contratti più ricchi). */
export const QUOTE = [
  { fee: 300, n: 1, name: 'un banco' },
  { fee: 850, n: 3, name: 'una bottega' },
  { fee: 3000, n: 6, name: 'una loggia' },
  { fee: 10000, n: 10, name: 'un palazzo' },
] as const;

/** Le tre fasce di contratti: quantità, prezzo base l'unità e anni per spedire. */
export const FASCE = [
  { n: 3, qty: [80, 240], base: [32, 41], tempo: 1 },
  { n: 3, qty: [240, 600], base: [50, 60], tempo: 1 },
  { n: 3, qty: [600, 1300], base: [68, 80], tempo: 2 },
] as const;
/** Il contratto speciale (l'ultimo, solo per chi prende un palazzo alla fiera). */
export const SPECIALE = { qty: [1200, 2200], base: [95, 110], tempo: 2 } as const;
/** I manufatti si pagano più del vino. */
export const PREZZO_MERCE: Record<Merce, number> = { vino: 1, manufatti: 1.15 };

/** Peso del prezzo e del prestigio nel punteggio delle offerte. */
export const PESO_PREZZO = 0.9;
export const PESO_PRESTIGIO = 0.1;
/** Prezzo massimo che si può offrire, rispetto al prezzo base. */
export const OFFERTA_MAX = 1.5;
/** Probabilità che un'offerta appena sopra il prezzo base sia accettata (cala fino a 0 a OFFERTA_MAX). */
export const SOPRA_BASE = 0.3;
/** Pagamento di una consegna in ritardo, penale sulla merce non consegnata. */
export const PAGA_RITARDO = 0.9;
export const PENALE = 0.2;

/** Prestigio mercantile dei contratti. */
export const PRESTIGIO_FIERA = {
  /** consegna intera e puntuale, per fascia (l'ultimo è lo speciale) */
  consegna: [3, 5, 8, 12],
  ritardo: -3,
  perdita: -2,
  /** consegnata solo una parte */
  parziale: -6,
  /** nulla consegnato */
  mancato: -15,
} as const;

export interface Contratto {
  id: number;
  /** posizione nella fiera: le quote mostrano i primi n */
  idx: number;
  fascia: 0 | 1 | 2;
  speciale?: boolean;
  good: Merce;
  qty: number;
  piazza: PiazzaId;
  /** prezzo base l'unità */
  base: number;
  /** anni per spedire dopo la fiera */
  tempo: number;
  /** quale dei committenti della piazza (per i testi) */
  chi: number;
}

export interface Offerta { player: number; contract: number; price: number }

export interface Fiera {
  /** anno (q) della fiera */
  q: number;
  contratti: Contratto[];
  /** quota pagata da ciascun signore (-1: nessuna) */
  quote: number[];
  /** offerte a buste chiuse */
  offerte: Offerta[];
}

/** Un contratto vinto: la merce da spedire, poi la carovana verso la piazza. */
export interface Impegno {
  id: number;
  player: number;
  c: Contratto;
  /** prezzo pattuito l'unità */
  price: number;
  /** ultimo anno (q) per spedire */
  entro: number;
  /** la carovana partita */
  spedito?: { q: number; qty: number; arrive: number; previsti: number; perse: number; evento?: EventoViaggio };
}

export interface FieraState extends MerciState {
  prestigio: number[];
  fiera?: Fiera;
  impegni: Impegno[];
}

/** Notizie della fiera per un signore. */
export type FieraDispatch =
  | { k: 'fieraAperta'; q: number; n: number }
  | { k: 'fieraVinta'; c: Contratto; price: number; entro: number; rivali: number }
  | { k: 'fieraPersa'; c: Contratto; price: number; winner: number; winPrice: number }
  | { k: 'fieraRifiutata'; c: Contratto; price: number }
  | { k: 'fieraSpedita'; c: Contratto; qty: number; arrive: number }
  | { k: 'fieraPagata'; c: Contratto; qty: number; perse: number; gain: number; ritardo: boolean; evento?: EventoViaggio; prestigio: number }
  | { k: 'fieraMancata'; c: Contratto; manca: number; penale: number; prestigio: number };

/** Ciò che la fiera chiede alle regole dell'espansione. */
export interface FairCtx {
  g: Game;
  st: FieraState;
  rnd: () => number;
  /** varia il prestigio del signore i; ritorna la variazione effettiva */
  prestige(i: number, delta: number): number;
  tell(i: number, d: FieraDispatch): void;
  note(i: number, kind: string, data: Record<string, number>): void;
}

const between = (rnd: () => number, [a, b]: readonly [number, number], step = 1) => a + step * Math.floor((rnd() * (b - a + step)) / step);

/** I dieci contratti di una fiera, sorteggiati con il caso dell'espansione. */
export function makeFair(rnd: () => number, q: number, nextId: () => number, players: number): Fiera {
  const contratti: Contratto[] = [];
  const add = (fascia: 0 | 1 | 2, f: { qty: readonly [number, number]; base: readonly [number, number]; tempo: number }, speciale = false) => {
    const piazza = speciale && rnd() < 0.5 ? 'costantinopoli' : PIAZZE[Math.floor(rnd() * PIAZZE.length)].id;
    const good = MERCI[Math.floor(rnd() * MERCI.length)];
    contratti.push({
      id: nextId(), idx: contratti.length, fascia, ...(speciale ? { speciale } : {}),
      good, qty: between(rnd, f.qty, 10), piazza,
      base: Math.round(between(rnd, f.base) * PREZZO_MERCE[good]), tempo: f.tempo, chi: Math.floor(rnd() * 2),
    });
  };
  FASCE.forEach((f, i) => { for (let k = 0; k < f.n; k++) add(i as 0 | 1 | 2, f); });
  add(2, SPECIALE, true);
  return { q, contratti, quote: Array.from({ length: players }, () => -1), offerte: [] };
}

/** Valore medio (al prezzo base) dei contratti che una quota fa vedere: si conosce prima di pagare. */
export function quotaValue(tier: number): number {
  const mid = (r: readonly [number, number]) => (r[0] + r[1]) / 2;
  const all = [...FASCE.flatMap(x => Array.from({ length: x.n }, () => x)), SPECIALE];
  return Math.round(all.slice(0, QUOTE[tier].n).reduce((a, x) => a + mid(x.qty) * mid(x.base), 0));
}

export const fairOpen = (st: FieraState, q: number) => (st.fiera?.q === q ? st.fiera : null);
/** Contratti che il signore i vede alla fiera dell'anno. */
export function visibleTo(f: Fiera, i: number): Contratto[] {
  const t = f.quote[i] ?? -1;
  return t < 0 ? [] : f.contratti.slice(0, QUOTE[t].n);
}
export const bidOf = (f: Fiera, i: number, contract: number) => f.offerte.find(o => o.player === i && o.contract === contract);

const fairPhase = (g: Game): ActionResult | null => {
  const k = g.state.phase.kind;
  return k === 'commercio' || k === 'investimenti' ? null : { ok: false, reason: 'la fiera è aperta nella Delibera e nei dispendimenti' };
};

/** Entra alla fiera con la quota `tier` (o sale a una quota più alta pagando la differenza). */
export function joinFair(c: FairCtx, tier: number): ActionResult & { fee?: number } {
  const { g, st } = c, me = g.state.current, p = g.player;
  const no = fairPhase(g);
  if (no) return no;
  const f = fairOpen(st, g.state.q);
  if (!f) return { ok: false, reason: `la prossima fiera si tiene nel ${900 + nextFair(g.state.q)}` };
  if (!Number.isInteger(tier) || tier < 0 || tier >= QUOTE.length) return { ok: false, reason: 'quota non valida' };
  const had = f.quote[me] ?? -1;
  if (tier <= had) return { ok: false, reason: 'avete già questa quota' };
  const fee = QUOTE[tier].fee - (had >= 0 ? QUOTE[had].fee : 0);
  if (p.scudi - fee < -p.credito) return { ok: false, reason: 'tesoro e credito insufficienti' };
  p.scudi -= fee;
  f.quote[me] = tier;
  c.note(me, 'fairJoin', { tier, fee });
  return { ok: true, fee };
}

/** Offre (o cambia l'offerta) per un contratto; prezzo 0 ritira l'offerta. */
export function placeBid(c: FairCtx, contract: number, price: number): ActionResult {
  const { g, st } = c, me = g.state.current;
  const no = fairPhase(g);
  if (no) return no;
  const f = fairOpen(st, g.state.q);
  if (!f) return { ok: false, reason: 'non è anno di fiera' };
  const k = visibleTo(f, me).find(x => x.id === contract);
  if (!k) return { ok: false, reason: 'contratto non disponibile alla vostra quota' };
  f.offerte = f.offerte.filter(o => !(o.player === me && o.contract === contract));
  if (price === 0) return { ok: true };
  const max = Math.floor(k.base * OFFERTA_MAX);
  if (!Number.isInteger(price) || price < 1 || price > max) return { ok: false, reason: `prezzo fra 1 e ${max} scudi l'unità` };
  f.offerte.push({ player: me, contract, price });
  return { ok: true };
}

/** Punteggio di un'offerta: 90% convenienza del prezzo (rispetto all'offerta più bassa), 10% prestigio. */
export const bidScore = (price: number, minPrice: number, prestigio: number) => PESO_PREZZO * (minPrice / price) + PESO_PRESTIGIO * (prestigio / 100);
/** Probabilità che i mercanti accettino un prezzo sopra il base. */
export const acceptAbove = (price: number, base: number) => (price <= base ? 1 : Math.max(0, SOPRA_BASE * (1 - (price - base) / (base * (OFFERTA_MAX - 1)))));

/**
 * Chiusura della fiera, alla fine dell'anno: ogni contratto va all'offerta con
 * il punteggio più alto che i mercanti accettano. Ritorna gli impegni nuovi.
 */
export function resolveFair(c: FairCtx, nextId: () => number): Impegno[] {
  const { g, st, rnd } = c, f = st.fiera;
  if (!f || f.q !== g.state.q) return [];
  const ps = g.state.players, out: Impegno[] = [];
  for (const k of f.contratti) {
    const bids = f.offerte.filter(o => o.contract === k.id && ps[o.player].caduto === undefined);
    if (!bids.length) continue;
    const min = Math.min(...bids.map(b => b.price));
    const ranked = bids.map(b => ({ b, s: bidScore(b.price, min, st.prestigio[b.player] ?? 0), t: rnd() })).sort((a, b) => b.s - a.s || a.t - b.t);
    let win: Offerta | null = null;
    const refused = new Set<Offerta>();
    for (const { b } of ranked) {
      if (rnd() < acceptAbove(b.price, k.base)) { win = b; break; }
      refused.add(b);
      c.tell(b.player, { k: 'fieraRifiutata', c: k, price: b.price });
    }
    if (!win) continue;
    const imp: Impegno = { id: nextId(), player: win.player, c: k, price: win.price, entro: f.q + k.tempo };
    out.push(imp);
    c.tell(win.player, { k: 'fieraVinta', c: k, price: win.price, entro: imp.entro, rivali: bids.length - 1 });
    c.note(win.player, 'fairWin', { good: MERCI.indexOf(k.good), qty: k.qty, price: win.price, piazza: PIAZZE.findIndex(x => x.id === k.piazza), speciale: k.speciale ? 1 : 0 });
    for (const b of bids) if (b !== win && !refused.has(b)) c.tell(b.player, { k: 'fieraPersa', c: k, price: b.price, winner: win.player, winPrice: win.price });
  }
  st.impegni.push(...out);
  st.fiera = undefined;
  return out;
}

export const impegniOf = (st: FieraState, i: number) => st.impegni.filter(x => x.player === i);
/** Merce promessa e non ancora spedita, per merce. */
export const promised = (st: FieraState, i: number, good: Merce) => impegniOf(st, i).filter(x => !x.spedito && x.c.good === good).reduce((a, x) => a + x.c.qty, 0);

/** Merce impegnata con i mercanti forestieri: promessa nei contratti vinti e offerta alla fiera aperta. */
export function committed(st: FieraState, i: number, good: Merce): number {
  const f = st.fiera;
  const bids = f ? f.offerte.filter(o => o.player === i).reduce((a, o) => {
    const k = f.contratti.find(x => x.id === o.contract);
    return a + (k?.good === good ? k.qty : 0);
  }, 0) : 0;
  return promised(st, i, good) + bids;
}

/** Spedisce la merce di un contratto verso la piazza (una carovana sola: quello che parte è la consegna). */
export function ship(c: FairCtx, id: number, qty: number, auto = false): ActionResult {
  const { g, st, rnd } = c, me = g.state.current;
  if (!auto) {
    const no = fairPhase(g);
    if (no) return no;
  }
  const imp = st.impegni.find(x => x.id === id && x.player === me);
  if (!imp) return { ok: false, reason: 'contratto inesistente' };
  if (imp.spedito) return { ok: false, reason: 'la carovana è già partita' };
  const cant = st.cantine[me];
  if (!Number.isInteger(qty) || qty < 1 || qty > imp.c.qty) return { ok: false, reason: `si spediscono da 1 a ${imp.c.qty} unità` };
  if (qty > cant[imp.c.good]) return { ok: false, reason: 'non avete tanta merce in magazzino' };
  cant[imp.c.good] -= qty;
  const previsti = travelYears(g.player.feudo, { piazza: imp.c.piazza });
  const v = rollJourney(rnd, previsti, qty);
  imp.spedito = { q: g.state.q, qty, arrive: g.state.q + v.anni, previsti, perse: v.perse, ...(v.evento ? { evento: v.evento } : {}) };
  if (auto) c.tell(me, { k: 'fieraSpedita', c: imp.c, qty, arrive: imp.spedito.arrive });
  c.note(me, 'fairShip', { good: MERCI.indexOf(imp.c.good), qty, piazza: PIAZZE.findIndex(x => x.id === imp.c.piazza), arrive: 900 + imp.spedito.arrive });
  if (qty < imp.c.qty) shortfall(c, imp, imp.c.qty - qty, PRESTIGIO_FIERA.parziale);
  return { ok: true };
}

/** Prestigio di una consegna intera e puntuale. */
export const deliveryPrestige = (k: Contratto) => PRESTIGIO_FIERA.consegna[k.speciale ? 3 : k.fascia];

/** Penale per la merce non spedita. */
export const penaltyOf = (imp: Impegno, manca: number) => INT(manca * imp.price * PENALE);

/** Merce promessa e non spedita: penale e prestigio perduto. */
function shortfall(c: FairCtx, imp: Impegno, manca: number, delta: number): void {
  const me = imp.player, penale = penaltyOf(imp, manca);
  c.g.state.players[me].scudi -= penale;
  const prestigio = c.prestige(me, delta);
  c.tell(me, { k: 'fieraMancata', c: imp.c, manca, penale, prestigio });
  c.note(me, 'fairFail', { good: MERCI.indexOf(imp.c.good), manca, penale });
}

/**
 * Fine anno del signore di turno: alla scadenza parte da sola la carovana con
 * quello che c'è in magazzino; chi non ha nulla paga la penale. La merce non
 * spedita costa la penale anche a chi ne spedisce solo una parte.
 */
export function deadlines(c: FairCtx): void {
  const { g, st } = c, me = g.state.current;
  for (const imp of impegniOf(st, me).filter(x => !x.spedito && x.entro <= g.state.q)) {
    const have = Math.min(imp.c.qty, st.cantine[me][imp.c.good]);
    if (have > 0) ship(c, imp.id, have, true);
    else {
      shortfall(c, imp, imp.c.qty, PRESTIGIO_FIERA.mancato);
      st.impegni = st.impegni.filter(x => x !== imp);
    }
  }
}

/** Inizio del turno: le carovane arrivate alle piazze si fanno pagare. */
export function arrivals(c: FairCtx): void {
  const { g, st } = c, me = g.state.current, p = g.player;
  for (const imp of impegniOf(st, me).filter(x => x.spedito && x.spedito.arrive <= g.state.q)) {
    const s = imp.spedito!;
    const arrived = s.qty - s.perse, ritardo = late(s);
    const gain = INT(arrived * imp.price * (ritardo ? PAGA_RITARDO : 1));
    p.scudi += gain;
    // consegna intera e puntuale: prestigio della fascia; ritardi e perdite lo tolgono (la consegna parziale l'ha già tolto)
    const delta = s.perse ? PRESTIGIO_FIERA.perdita : ritardo ? PRESTIGIO_FIERA.ritardo : s.qty === imp.c.qty ? deliveryPrestige(imp.c) : 0;
    const prestigio = delta ? c.prestige(me, delta) : 0;
    c.tell(me, { k: 'fieraPagata', c: imp.c, qty: s.qty, perse: s.perse, gain, ritardo, ...(s.evento ? { evento: s.evento } : {}), prestigio });
    c.note(me, 'fairPaid', { good: MERCI.indexOf(imp.c.good), qty: arrived, gain, piazza: PIAZZE.findIndex(x => x.id === imp.c.piazza) });
    st.impegni = st.impegni.filter(x => x !== imp);
  }
}
