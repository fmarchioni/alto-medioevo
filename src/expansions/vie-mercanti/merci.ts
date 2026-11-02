/**
 * Le vie dei mercanti: vino e manufatti.
 *
 * - Vigneti: si piantano nei dispendimenti su 25 acri del feudo, che smettono
 *   di dare grano al raccolto. Ogni anno danno vino, più nelle annate buone.
 *   Il vino non sfama e in magazzino ne va perduto un poco ogni anno.
 * - Opifici: oltre alla gabella sul commerzio, producono manufatti, più se gli
 *   artigiani sono contenti. I manufatti non si guastano.
 * - Mercanti di passaggio: ogni anno comprano qualunque quantità, pagando
 *   subito ma poco (il prezzo cambia di anno in anno).
 * - Fondaco: ogni signore mette in vendita vino o manufatti al prezzo che
 *   vuole. Chi compra paga subito; la merce parte con una carovana e il
 *   venditore incassa solo quando la carovana arriva.
 */
import { INT } from '../../domain/economy';
import { livelloMid, livelloOf, umoreOf, workFactor } from '../../domain/gabelle';
import { ACRI_PER_ACQUISTO, COSTS } from '../../domain/investments';
import { Mulberry32 } from '../../domain/rng';
import type { Game } from '../../domain/turn';
import type { ActionResult, Player } from '../../domain/types';
import { rollJourney, type EventoViaggio } from './carovane';
import { bonusOf, travelYears } from './geografia';

export type Merce = 'vino' | 'manufatti';
export const MERCI: Merce[] = ['vino', 'manufatti'];
export const UNITA: Record<Merce, [string, string]> = { vino: ['botte', 'botti'], manufatti: ['pezzo', 'pezzi'] };

/** Un vigneto: 25 acri piantati a vite, al prezzo di 25 acri di terra. */
export const VIGNETO_ACRI = ACRI_PER_ACQUISTO;
export const VIGNETO_COST = COSTS.terre;
/** Acri che restano comunque a grano. */
export const ACRI_GRANO_MIN = 250;
/** Botti di vino di un vigneto in un'annata media. */
export const VINO_PER_VIGNETO = 40;
/** Pezzi di manufatti di un opificio in un anno, con gli artigiani contenti. */
export const MANUFATTI_PER_OPIFICIO = 120;
/** Vino che si guasta in magazzino ogni anno. */
export const VINO_GUASTO = 0.02;
/** Prezzi dei mercanti di passaggio (scudi l'unità): da min a max, secondo l'anno. */
export const PREZZO_PASSAGGIO: Record<Merce, { min: number; max: number }> = { vino: { min: 4, max: 6 }, manufatti: { min: 4, max: 6 } };
/** Prezzo massimo al fondaco (scudi l'unità). */
export const LOT_MAX_PRICE: Record<Merce, number> = { vino: 60, manufatti: 60 };

export interface Cantina {
  vino: number;
  manufatti: number;
  vigneti: number;
  /** produzione dell'ultimo anno (per i resoconti) */
  prodotto?: { q: number; vino: number; manufatti: number };
}

export interface Lot { id: number; seller: number; good: Merce; qty: number; price: number }

/** Una carovana del fondaco: la merce arriva al compratore, il denaro al venditore, nell'anno `arrive`. */
export interface Carovana {
  id: number;
  seller: number;
  buyer: number;
  good: Merce;
  qty: number;
  /** scudi pagati dal compratore, che il venditore incassa all'arrivo */
  paid: number;
  /** anno (q) dell'arrivo */
  arrive: number;
  /** anni di viaggio previsti alla partenza (l'imprevisto si scopre all'arrivo) */
  previsti: number;
  /** unità perdute per strada e imprevisto del viaggio */
  perse: number;
  evento?: EventoViaggio;
  /** merce già consegnata al compratore / denaro già consegnato al venditore */
  consegnata?: boolean;
  pagata?: boolean;
}

/** Lo stato delle merci dentro lo stato dell'espansione. */
export interface MerciState {
  cantine: Cantina[];
  lots: Lot[];
  carovane: Carovana[];
  nextId: number;
}

export const emptyCantina = (): Cantina => ({ vino: 0, manufatti: 0, vigneti: 0 });

/** Vigneti che il feudo può avere: devono restare ACRI_GRANO_MIN acri a grano. */
export const maxVigneti = (p: Player) => Math.max(0, Math.floor((p.acri - ACRI_GRANO_MIN) / VIGNETO_ACRI));

/** Prezzi dei mercanti di passaggio nell'anno q: uguali per tutti, sorteggiati dall'anno. */
export function passingPrices(q: number): Record<Merce, number> {
  const r = new Mulberry32(((q + 1) * 2654435761) ^ 0x7e1a);
  const pick = (m: Merce) => PREZZO_PASSAGGIO[m].min + Math.floor(r.next() * (PREZZO_PASSAGGIO[m].max - PREZZO_PASSAGGIO[m].min + 1));
  return { vino: pick('vino'), manufatti: pick('manufatti') };
}

/** Abbondanza dell'annata per la vite: da 0,5 a 1,5 (raccolto rispetto al massimo possibile). */
export const vineYear = (raccolto: number, acri: number) => 0.5 + Math.min(1, Math.max(0, raccolto / Math.max(1, acri * 75)));

/** Botti di vino dell'anno. */
export function wineOf(p: Player, c: Cantina, abundance: number): number {
  return INT(c.vigneti * VINO_PER_VIGNETO * abundance * bonusOf(p.feudo, 'vino'));
}

/** Pezzi di manufatti dell'anno: gli artigiani scontenti lavorano meno. */
export function goodsOf(p: Player): number {
  const mood = p.umore === undefined ? 1 : workFactor(livelloMid(livelloOf(umoreOf(p))));
  return INT((p.opificio - 1) * MANUFATTI_PER_OPIFICIO * mood * bonusOf(p.feudo, 'manufatti'));
}

/** Produzione attesa in un anno medio, per merce. */
export const yearlyOutput = (p: Player, c: Cantina): Record<Merce, number> => ({ vino: wineOf(p, c, 1), manufatti: goodsOf(p) });

/**
 * Inizio del turno: i vigneti tolgono grano al raccolto (e i campi di Neapolis
 * ne danno di più), poi la vendemmia e il lavoro degli opifici.
 * Se il feudo ha perso terre, le vigne in eccesso tornano a grano.
 */
export function produce(g: Game, c: Cantina): void {
  const p = g.player, sc = g.state.scalars;
  const keep = Math.min(c.vigneti, maxVigneti(p));
  if (keep < c.vigneti) {
    p.beni = Math.max(0, (p.beni ?? 0) - (c.vigneti - keep) * VIGNETO_COST);
    c.vigneti = keep;
  }
  const abundance = vineYear(sc.raccolto, p.acri);
  const vineAcri = c.vigneti * VIGNETO_ACRI;
  sc.raccolto = INT(sc.raccolto * ((p.acri - vineAcri) / Math.max(1, p.acri)) * bonusOf(p.feudo, 'grano'));
  const vino = wineOf(p, c, abundance), manufatti = goodsOf(p);
  c.vino += vino;
  c.manufatti += manufatti;
  c.prodotto = { q: g.state.q, vino, manufatti };
}

/** Fine anno: in magazzino un po' di vino si guasta. */
export function spoilWine(c: Cantina): number {
  const lost = Math.ceil(c.vino * VINO_GUASTO);
  c.vino -= lost;
  return lost;
}

const isCount = (n: number) => Number.isInteger(n) && n > 0;
const canSpend = (p: Player, cost: number) => p.scudi - cost >= -p.credito;

/** Pianta un vigneto: costa come 25 acri, e i 25 acri smettono di dare grano. */
export function plantVineyard(g: Game, c: Cantina): ActionResult {
  const p = g.player;
  if (g.state.phase.kind !== 'investimenti') return { ok: false, reason: 'si pianta nei dispendimenti' };
  if (c.vigneti >= maxVigneti(p)) return { ok: false, reason: `servono più terre: ${ACRI_GRANO_MIN} acri restano a grano` };
  if (!canSpend(p, VIGNETO_COST)) return { ok: false, reason: 'tesoro e credito insufficienti' };
  p.scudi -= VIGNETO_COST;
  // il vigneto conta nella ricchezza quanto è costato, come gli altri beni
  p.beni = (p.beni ?? 0) + VIGNETO_COST;
  c.vigneti += 1;
  return { ok: true };
}

/** Vende ai mercanti di passaggio: pagano subito, al prezzo dell'anno. */
export function sellToPassing(g: Game, c: Cantina, good: Merce, qty: number): ActionResult & { gain?: number } {
  const k = g.state.phase.kind;
  if (k !== 'signori' && k !== 'investimenti') return { ok: false, reason: 'si vende fra signori o nei dispendimenti' };
  if (!isCount(qty)) return { ok: false, reason: 'quantità non valida' };
  if (qty > c[good]) return { ok: false, reason: `non avete tante ${UNITA[good][1]}` };
  const gain = qty * passingPrices(g.state.q)[good];
  c[good] -= qty;
  g.player.scudi += gain;
  return { ok: true, gain };
}

// ---------------------------------------------------------------- fondaco

const fondacoOpen = (g: Game): ActionResult | null => {
  const k = g.state.phase.kind;
  return k === 'signori' || k === 'investimenti' ? null : { ok: false, reason: 'il fondaco è aperto fra signori e nei dispendimenti' };
};

/** Porta merce al fondaco (un banco per merce): resta in vendita fino al prossimo turno. */
export function postLot(g: Game, st: MerciState, good: Merce, qty: number, price: number): ActionResult {
  const no = fondacoOpen(g);
  if (no) return no;
  const me = g.state.current, c = st.cantine[me];
  if (!isCount(qty)) return { ok: false, reason: 'quantità non valida' };
  if (!isCount(price) || price > LOT_MAX_PRICE[good]) return { ok: false, reason: `prezzo fra 1 e ${LOT_MAX_PRICE[good]} scudi l'unità` };
  if (qty > c[good]) return { ok: false, reason: `non avete tante ${UNITA[good][1]}` };
  if (st.lots.some(l => l.seller === me && l.good === good)) return { ok: false, reason: 'avete già un banco per questa merce' };
  c[good] -= qty;
  st.lots.push({ id: st.nextId++, seller: me, good, qty, price });
  return { ok: true };
}

/** Ritira la propria merce dal fondaco. */
export function withdrawLot(g: Game, st: MerciState, good: Merce): ActionResult {
  const no = fondacoOpen(g);
  if (no) return no;
  const me = g.state.current;
  const lot = st.lots.find(l => l.seller === me && l.good === good);
  if (!lot) return { ok: false, reason: 'non avete questa merce al fondaco' };
  st.cantine[me][good] += lot.qty;
  st.lots = st.lots.filter(l => l !== lot);
  return { ok: true };
}

/** Compra al fondaco: si paga subito, la merce arriva con la carovana. */
/** rnd: caso del viaggio (generatore dell'espansione) */
export function buyLot(g: Game, st: MerciState, lotId: number, qty: number, rnd: () => number): ActionResult & { caravan?: Carovana } {
  const no = fondacoOpen(g);
  if (no) return no;
  const me = g.state.current, p = g.player;
  const lot = st.lots.find(l => l.id === lotId);
  if (!lot) return { ok: false, reason: 'quella merce non è più in vendita' };
  if (lot.seller === me) return { ok: false, reason: 'non si compra la propria merce' };
  if (!isCount(qty) || qty > lot.qty) return { ok: false, reason: 'quantità non valida' };
  const cost = qty * lot.price;
  if (!canSpend(p, cost)) return { ok: false, reason: 'spesa oltre il credito concesso' };
  p.scudi -= cost;
  lot.qty -= qty;
  if (lot.qty === 0) st.lots = st.lots.filter(l => l !== lot);
  const ps = g.state.players;
  const previsti = travelYears(ps[lot.seller].feudo, { feudo: p.feudo });
  const v = rollJourney(rnd, previsti, qty);
  const caravan: Carovana = {
    id: st.nextId++, seller: lot.seller, buyer: me, good: lot.good, qty, paid: cost,
    arrive: g.state.q + v.anni, previsti, perse: v.perse, ...(v.evento ? { evento: v.evento } : {}),
  };
  st.carovane.push(caravan);
  return { ok: true, caravan };
}

/** Scudi che il venditore incassa: solo la merce arrivata. */
export const sellerShare = (c: Carovana) => INT((c.paid * (c.qty - c.perse)) / c.qty);

/** Carovane in arrivo per il signore `i` (merce da ricevere) o da incassare. */
export const caravansTo = (st: MerciState, i: number) => st.carovane.filter(c => c.buyer === i && !c.consegnata);
export const caravansFrom = (st: MerciState, i: number) => st.carovane.filter(c => c.seller === i && !c.pagata);

/**
 * Inizio del turno del signore `i`: riceve la merce delle carovane arrivate e
 * incassa quelle vendute; la merce invenduta torna dal fondaco. Per la merce
 * perduta per strada il compratore è rimborsato e il venditore non incassa.
 */
export function settleCaravans(g: Game, st: MerciState, i: number): { received: Carovana[]; cashed: Carovana[]; back: Lot[] } {
  const q = g.state.q, p = g.state.players[i];
  const received = caravansTo(st, i).filter(c => c.arrive <= q);
  for (const c of received) {
    st.cantine[i][c.good] += c.qty - c.perse;
    p.scudi += c.paid - sellerShare(c);
    c.consegnata = true;
  }
  const cashed = caravansFrom(st, i).filter(c => c.arrive <= q);
  for (const c of cashed) {
    p.scudi += sellerShare(c);
    c.pagata = true;
  }
  st.carovane = st.carovane.filter(c => !(c.consegnata && c.pagata));
  const back = st.lots.filter(l => l.seller === i);
  for (const l of back) st.cantine[i][l.good] += l.qty;
  st.lots = st.lots.filter(l => l.seller !== i);
  return { received, cashed, back };
}
