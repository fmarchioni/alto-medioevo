/**
 * Espansione "Le vie dei mercanti": economia commerciale fra signori. Solo
 * regole, nessuna interfaccia (la vista è in view.ts).
 *
 * - Banco: un signore offre un prestito (somma, interesse, durata). Chi lo
 *   accetta lo restituisce alla scadenza, a fine anno; se non può, il creditore
 *   pignora terre, mercati, opifici e piani di palazzo al loro prezzo.
 *
 * - Merci (merci.ts): vigneti e vino, manufatti degli opifici, mercanti di
 *   passaggio e fondaco fra signori, con le carovane.
 * - Specialità dei feudi e tempi di viaggio (geografia.ts), imprevisti delle
 *   carovane (carovane.ts).
 * - Prestigio mercantile (prestigio.ts): l'affidabilità di chi commercia.
 *
 * - Fiera triennale dei mercanti forestieri (fiera.ts): contratti a gara al
 *   ribasso, consegne con le carovane alle piazze.
 * - Imprese dell'espansione (imprese.ts): vino annacquato, contrabbando,
 *   console comprato, mercante fallito. Le imprese del gioco base non escono.
 * - Consumi di prestigio (consumi.ts): banchetti, feste per i titoli, arredi
 *   del palazzo e richieste speciali dal mazzo degli imprevisti.
 * Il sensale e i pignoramenti degli usurai sono ora nel gioco base.
 */
import { INT } from '../../domain/economy';
import type { BotCtx, ExpansionRules } from '../../domain/expansion';
import type { BotLevel } from '../../domain/types';
import { acriPerBotteghe, ACRI_PER_ACQUISTO, COSTS, MAX_ACRI, MAX_PALAZZO, roomFor } from '../../domain/investments';
import { FORECLOSURE_MIN_ACRI } from '../../domain/pignoramenti';
import { victoryRule, wealthIndex } from '../../domain/rank';
import type { Game } from '../../domain/turn';
import type { ActionResult, Player } from '../../domain/types';
import {
  buyLot as buyLotOf, emptyCantina, yearlyOutput, PREZZO_PASSAGGIO, MERCI, maxVigneti, passingPrices, plantVineyard, postLot as postLotOf, produce, sellToPassing, settleCaravans, spoilWine, UNITA, VIGNETO_COST,
  sellerShare, withdrawLot as withdrawLotOf, type Merce,
} from './merci';
import { bonusOf } from './geografia';
import { late, type EventoViaggio } from './carovane';
import { addPrestige, marketPrestige, PRESTIGIO } from './prestigio';
import { Mulberry32 } from '../../domain/rng';
import {
  arrivals, bidOf, bribeConsole, committed, CONSOLE_COSTO, FASCE, SPECIALE, deadlines, fairOpen, isFairYear, joinFair as joinFairOf, makeFair, placeBid, promised, QUOTE, resolveFair, ship,
  impegniOf, visibleTo, type FairCtx, type FieraDispatch, type FieraState,
} from './fiera';
import { travelYears } from './geografia';
import {
  BANCHETTI, BANCHETTI_ID, banchettoFatto, drawRequest, expireRequests, festaDi, festaOf, FESTA_PRESTIGIO_MERCANTILE, fulfil, holdBanquet, holdFeast, offerFeast,
  palaceNeeds, RICHIESTA_EVENT, RICHIESTA_PESO, RICHIESTE, RICHIESTE_ID, richiestaOfEvent, richiesteOf, type Banchetto, type ConsumiState, type RichiestaId,
} from './consumi';
import {
  buyBankrupt, cardOf as impresaCard, CONTRABBANDO_MAX, CONTRABBANDO_MIN, drawImpresa, expireImprese, IMPRESA_MERC_EVENT, IMPRESA_PESO, impresaMercOfEvent, impreseOf,
  IMPRESE_MERC, settleImprese, smuggle, waterWine, discard, type ImpresaDispatch, type ImpreseState,
} from './imprese';

export const ID = 'vie-mercanti';

export const LOAN_MIN = 500;
export const LOAN_MAX_RATE = 60;
export const LOAN_MAX_YEARS = 3;

export interface LoanOffer { id: number; lender: number; amount: number; rate: number; years: number }
export interface Loan { id: number; lender: number; debtor: number; principal: number; due: number; dueQ: number }

/** Notizie per un signore, lette all'inizio del suo turno. */
export type Dispatch =
  | { k: 'offerTaken'; debtor: number; amount: number; due: number; dueQ: number }
  | { k: 'offerBack'; amount: number }
  | { k: 'repaid'; debtor: number; amount: number }
  | { k: 'seized'; debtor: number; cash: number; acri: number; mercati: number; opifici: number; palazzo: number; unpaid: number }
  /** al debitore: prestito reso */
  | { k: 'paid'; lender: number; amount: number }
  /** al debitore: beni pignorati dal creditore */
  | { k: 'seizedFrom'; lender: number; cash: number; acri: number; mercati: number; opifici: number; palazzo: number; unpaid: number }
  /** al venditore: merce comprata al fondaco, il denaro arriva con la carovana */
  | { k: 'lotSold'; buyer: number; good: Merce; qty: number; gain: number; arrive: number }
  /** merce invenduta tornata dal fondaco */
  | { k: 'lotBack'; good: Merce; qty: number }
  /** carovane arrivate: merce ricevuta (al compratore) o denaro incassato (al venditore) */
  | { k: 'caravanIn'; from: number; good: Merce; qty: number; perse: number; refund: number; evento?: EventoViaggio }
  | { k: 'caravanPaid'; to: number; good: Merce; qty: number; gain: number; perse: number; evento?: EventoViaggio; prestigio: number }
  /** prestigio mercantile perduto per un pignoramento */
  | { k: 'disonore'; prestigio: number }
  | FieraDispatch
  | ImpresaDispatch
  /** si può celebrare il nuovo titolo */
  | { k: 'festaTitolo'; rango: number };

export interface MercantiState extends FieraState, ConsumiState, ImpreseState {
  /** anno (q) dell'ultimo pignoramento degli usurai già punito nel prestigio */
  disonore?: number[];
  /** stato del generatore dell'espansione (viaggi delle carovane) */
  rng: number[];
  offers: LoanOffer[];
  loans: Loan[];
  /** notizie non ancora consegnate */
  mail: { to: number; d: Dispatch }[];
  /** notizie consegnate al signore di turno */
  inbox: Dispatch[];
  nextId: number;
}

export const ms = (g: Game): MercantiState => g.state.ext as MercantiState;

const isInt = (n: number) => Number.isInteger(n);
const note = (g: Game, player: number, kind: string, data: Record<string, number>) => g.note(player, { t: 'ext', kind, data });
const send = (st: MercantiState, to: number, d: Dispatch) => st.mail.push({ to, d });

/** Caso dell'espansione: un generatore proprio salvato nello stato (la sequenza RND del gioco non cambia). */
function roll(st: MercantiState): () => number {
  const r = new Mulberry32(st.rng[0]);
  return () => {
    const v = r.next();
    st.rng = r.getState();
    return v;
  };
}

/** Prestigio mercantile del signore `i`. */
export const prestigeOf = (g: Game, i = g.state.current) => ms(g).prestigio[i] ?? 0;
/** Varia il prestigio del signore `i` (con il bonus di Roma sui guadagni); ritorna la variazione effettiva. */
export const changePrestige = (g: Game, i: number, delta: number) => addPrestige(ms(g).prestigio, i, g.state.players[i].feudo, delta);

/** Il banco dei prestiti è aperto fra signori (chiuso il mercato del grano) e nei dispendimenti, quando le rendite sono in cassa. */
function bankGuard(g: Game): ActionResult | null {
  const k = g.state.phase.kind;
  return k === 'signori' || k === 'investimenti' ? null : { ok: false, reason: 'il banco è aperto fra signori e nei dispendimenti' };
}

export const loanDue = (amount: number, rate: number) => amount + INT((amount * rate) / 100);

// ---------------------------------------------------------------- banco

export function postLoan(g: Game, amount: number, rate: number, years: number): ActionResult {
  const no = bankGuard(g);
  if (no) return no;
  const st = ms(g), me = g.state.current, p = g.player;
  if (!isInt(amount) || amount < LOAN_MIN) return { ok: false, reason: `si prestano almeno ${LOAN_MIN} scudi` };
  if (!isInt(rate) || rate < 0 || rate > LOAN_MAX_RATE) return { ok: false, reason: `interesse fra 0 e ${LOAN_MAX_RATE}%` };
  if (!isInt(years) || years < 1 || years > LOAN_MAX_YEARS) return { ok: false, reason: `durata da 1 a ${LOAN_MAX_YEARS} anni` };
  if (p.scudi < amount) return { ok: false, reason: 'si presta solo denaro che si possiede' };
  if (st.offers.some(o => o.lender === me)) return { ok: false, reason: 'avete già un prestito offerto al banco' };
  p.scudi -= amount;
  st.offers.push({ id: st.nextId++, lender: me, amount, rate, years });
  note(g, me, 'loanOffer', { amount, rate, years });
  return { ok: true };
}

export function withdrawLoan(g: Game): ActionResult {
  const no = bankGuard(g);
  if (no) return no;
  const st = ms(g), me = g.state.current;
  const o = st.offers.find(x => x.lender === me);
  if (!o) return { ok: false, reason: 'non avete prestiti offerti' };
  g.player.scudi += o.amount;
  st.offers = st.offers.filter(x => x !== o);
  return { ok: true };
}

export function takeLoan(g: Game, offerId: number): ActionResult {
  const no = bankGuard(g);
  if (no) return no;
  const st = ms(g), me = g.state.current;
  const o = st.offers.find(x => x.id === offerId);
  if (!o) return { ok: false, reason: 'quel prestito non è più offerto' };
  if (o.lender === me) return { ok: false, reason: 'non si prende in prestito il proprio denaro' };
  const due = loanDue(o.amount, o.rate);
  const dueQ = g.state.q + o.years - 1;
  g.player.scudi += o.amount;
  st.offers = st.offers.filter(x => x !== o);
  st.loans.push({ id: st.nextId++, lender: o.lender, debtor: me, principal: o.amount, due, dueQ });
  send(st, o.lender, { k: 'offerTaken', debtor: me, amount: o.amount, due, dueQ });
  note(g, me, 'loanTake', { lender: o.lender, amount: o.amount, due, years: o.years });
  return { ok: true };
}

export interface Seizure { acri: number; mercati: number; opifici: number; palazzo: number; unpaid: number }

/** Beni pignorabili, in ordine: unità sottratta, valore e quanto se ne può prendere e tenere. */
const ASSETS: {
  key: Exclude<keyof Seizure, 'unpaid'>;
  unit: number;
  value: number;
  avail: (d: Player) => number;
  room: (l: Player) => number;
  add: (p: Player, units: number) => void;
}[] = [
  {
    key: 'acri', unit: ACRI_PER_ACQUISTO, value: COSTS.terre,
    // al debitore restano le terre minime e quelle che servono per i mercati e gli opifici che conserva
    avail: d => Math.floor((d.acri - Math.max(FORECLOSURE_MIN_ACRI, acriPerBotteghe(d))) / ACRI_PER_ACQUISTO),
    room: l => Math.floor((MAX_ACRI - l.acri) / ACRI_PER_ACQUISTO),
    add: (p, u) => { p.acri += u * ACRI_PER_ACQUISTO; },
  },
  { key: 'mercati', unit: 1, value: COSTS.mercato, avail: d => d.mercato - 1, room: l => roomFor(l, 'mercato'), add: (p, u) => { p.mercato += u; } },
  { key: 'opifici', unit: 1, value: COSTS.opificio, avail: d => d.opificio - 1, room: l => roomFor(l, 'opificio'), add: (p, u) => { p.opificio += u; } },
  { key: 'palazzo', unit: 1, value: COSTS.palazzo, avail: d => d.palazzo, room: l => MAX_PALAZZO - l.palazzo, add: (p, u) => { p.palazzo += u; } },
];

/**
 * Pignoramento del creditore: terre (25 acri ogni 500 scudi), poi mercati,
 * opifici e piani di palazzo al loro prezzo, finché il debito è coperto. Il
 * creditore prende solo ciò che può tenere.
 */
export function seize(debtor: Player, lender: Player, rest: number): Seizure {
  const out: Seizure = { acri: 0, mercati: 0, opifici: 0, palazzo: 0, unpaid: 0 };
  for (const a of ASSETS) {
    if (rest <= 0) break;
    const u = Math.max(0, Math.min(Math.ceil(rest / a.value), a.avail(debtor), a.room(lender)));
    a.add(debtor, -u);
    a.add(lender, u);
    out[a.key] = u * a.unit;
    rest -= u * a.value;
  }
  out.unpaid = Math.max(0, rest);
  return out;
}

/** Restituzione dei prestiti scaduti del signore di turno. */
function settleLoans(g: Game): void {
  const st = ms(g), me = g.state.current, p = g.player;
  for (const loan of st.loans.filter(l => l.debtor === me && l.dueQ <= g.state.q)) {
    const lender = g.state.players[loan.lender];
    if (p.scudi >= loan.due) {
      p.scudi -= loan.due;
      lender.scudi += loan.due;
      send(st, loan.lender, { k: 'repaid', debtor: me, amount: loan.due });
      send(st, me, { k: 'paid', lender: loan.lender, amount: loan.due });
      note(g, me, 'loanRepay', { lender: loan.lender, amount: loan.due });
      changePrestige(g, me, PRESTIGIO.prestitoReso);
    } else {
      const cash = Math.max(0, INT(p.scudi));
      p.scudi -= cash;
      lender.scudi += cash;
      const s = seize(p, lender, loan.due - cash);
      send(st, loan.lender, { k: 'seized', debtor: me, cash, ...s });
      send(st, me, { k: 'seizedFrom', lender: loan.lender, cash, ...s });
      note(g, me, 'seize', { lender: loan.lender, cash, ...s });
      changePrestige(g, me, PRESTIGIO.pignoramento);
    }
    st.loans = st.loans.filter(l => l !== loan);
  }
}

// ---------------------------------------------------------------- merci

export const cantinaOf = (g: Game, i = g.state.current) => ms(g).cantine[i];

/** Pianta un vigneto nei dispendimenti. */
export function plant(g: Game): ActionResult {
  const r = plantVineyard(g, cantinaOf(g));
  if (r.ok) note(g, g.state.current, 'vineyard', { n: cantinaOf(g).vigneti });
  return r;
}

/** Vende ai mercanti di passaggio. */
export function sellPassing(g: Game, good: Merce, qty: number): ActionResult & { gain?: number } {
  const r = sellToPassing(g, cantinaOf(g), good, qty);
  if (r.ok) note(g, g.state.current, 'passing', { good: MERCI.indexOf(good), qty, gain: r.gain! });
  return r;
}

export function postLot(g: Game, good: Merce, qty: number, price: number): ActionResult {
  const r = postLotOf(g, ms(g), good, qty, price);
  if (r.ok) note(g, g.state.current, 'lotPost', { good: MERCI.indexOf(good), qty, price });
  return r;
}

export const withdrawLot = (g: Game, good: Merce) => withdrawLotOf(g, ms(g), good);

export function buyLot(g: Game, lotId: number, qty: number): ActionResult {
  const st = ms(g), me = g.state.current;
  const lot = st.lots.find(l => l.id === lotId);
  const r = buyLotOf(g, st, lotId, qty, roll(st));
  if (r.ok && lot && r.caravan) {
    const c = r.caravan;
    send(st, c.seller, { k: 'lotSold', buyer: me, good: c.good, qty: c.qty, gain: c.paid, arrive: c.arrive });
    note(g, me, 'lotBuy', { seller: c.seller, good: MERCI.indexOf(c.good), qty: c.qty, price: lot.price, arrive: 900 + c.arrive });
  }
  return r;
}

// ---------------------------------------------------------------- fiera

/** Contesto della fiera: caso, prestigio e notizie dell'espansione. */
function fairCtx(g: Game): FairCtx {
  const st = ms(g);
  return {
    g, st, rnd: roll(st),
    prestige: (i, delta) => changePrestige(g, i, delta),
    tell: (i, d) => send(st, i, d),
    note: (i, kind, data) => note(g, i, kind, data),
  };
}

export const joinFair = (g: Game, tier: number) => joinFairOf(fairCtx(g), tier);
export const bid = (g: Game, contract: number, price: number) => placeBid(fairCtx(g), contract, price);
export const shipContract = (g: Game, id: number, qty: number) => ship(fairCtx(g), id, qty);

// ---------------------------------------------------------------- consumi

export function banquet(g: Game, kind: Banchetto): ActionResult & { prestigio?: number; umore?: number } {
  const r = holdBanquet(g, ms(g), kind);
  if (r.ok) note(g, g.state.current, 'banquet', { kind: BANCHETTI_ID.indexOf(kind), vino: BANCHETTI[kind].vino, prestigio: r.prestigio!, umore: r.umore ?? 0 });
  return r;
}

export function feast(g: Game): ActionResult & { prestigio?: number } {
  const st = ms(g), me = g.state.current, f = festaDi(g, st, me);
  const r = holdFeast(g, st);
  if (r.ok && f) {
    const mercantile = changePrestige(g, me, FESTA_PRESTIGIO_MERCANTILE);
    note(g, me, 'feast', { rango: f.rango, ...festaOf(f.rango), prestigio: r.prestigio!, mercantile });
  }
  return r;
}

export function fulfilRequest(g: Game, id: RichiestaId): ActionResult & { prestigio?: number } {
  const me = g.state.current;
  const r = fulfil(g, ms(g), id);
  if (r.ok) {
    const x = RICHIESTE[id];
    const mercantile = x.mercantile ? changePrestige(g, me, x.mercantile) : 0;
    note(g, me, 'request', { req: RICHIESTE_ID.indexOf(id), prestigio: r.prestigio!, mercantile, umore: r.umore ?? 0 });
  }
  return r;
}

// ---------------------------------------------------------------- imprese

export function playWater(g: Game): ActionResult & { added?: number } {
  const r = waterWine(g, ms(g));
  if (r.ok) note(g, g.state.current, 'wineWatered', { added: r.added! });
  return r;
}

export function playSmuggle(g: Game, qty: number): ActionResult {
  const r = smuggle(g, ms(g), qty);
  if (r.ok) note(g, g.state.current, 'smuggleOut', { qty });
  return r;
}

/** Il console comprato: si gioca nell'anno della fiera, su un contratto che si vede. */
export function playConsole(g: Game, contract: number): ActionResult {
  const st = ms(g);
  if (!impresaCard(g, st, 'console')) return { ok: false, reason: 'non avete la carta' };
  const r = bribeConsole(fairCtx(g), contract);
  if (r.ok) {
    discard(g, st, 'console');
    note(g, g.state.current, 'consoleBought', { cost: CONSOLE_COSTO });
  }
  return r;
}

export function playBankrupt(g: Game): ActionResult & { cost?: number; arrive?: number } {
  const card = impresaCard(g, ms(g), 'fallito');
  const r = buyBankrupt(g, ms(g));
  if (r.ok && card) note(g, g.state.current, 'bankruptBuy', { vino: card.vino ?? 0, manufatti: card.manufatti ?? 0, cost: r.cost!, arrive: 900 + r.arrive! });
  return r;
}

// ---------------------------------------------------------------- signori del computer

const round50 = (v: number) => Math.floor(v / 50) * 50;

function botBorrow(c: BotCtx): void {
  const { g, level, rnd } = c;
  const st = ms(g), me = g.state.current, p = g.player, usura = g.state.scalars.usura;
  if (p.scudi >= 0) return;
  const offers = st.offers.filter(o => o.lender !== me).sort((a, b) => a.rate / a.years - b.rate / b.years);
  for (const o of offers) {
    const yearly = o.rate / o.years;
    const ok = level === 'difficile' ? yearly < usura : level === 'medio' ? yearly < usura + 5 : rnd() < 0.4;
    if (ok && o.amount <= -p.scudi + 2000 && takeLoan(g, o.id).ok) {
      c.log.push(`prende in prestito ${o.amount} scudi da ${g.state.players[o.lender].name} al ${o.rate}%`);
      return;
    }
  }
}

/** Vende le merci: il difficile ne porta una parte al fondaco a un prezzo migliore, il resto ai mercanti di passaggio. */
function botSell(c: BotCtx, afterFair = false): void {
  const { g, level, rnd, log } = c;
  const st = ms(g), me = g.state.current, cant = cantinaOf(g), prices = passingPrices(g.state.q);
  const rivals = g.state.players.some((x, i) => i !== me && x.caduto === undefined);
  const f = fairOpen(st, g.state.q);
  // l'anno prima della fiera si riempiono i magazzini, se le casse lo permettono; nell'anno della fiera si vende dopo le offerte
  // vicino al trono non si accumula più per la fiera: la merce diventa prestigio, che conta nella ricchezza
  const hoard = level !== 'facile' && g.player.scudi > 0 && !nearThrone(g) && (isFairYear(g.state.q + 1) || (!!f && !afterFair));
  botConsume(c, hoard);
  if (hoard) return;
  for (const good of MERCI) {
    // si tiene la merce promessa ai mercanti forestieri (contratti vinti e offerte alla fiera)
    const bids = f ? f.offerte.filter(o => o.player === me).reduce((a, o) => {
      const k = f.contratti.find(x => x.id === o.contract);
      return a + (k?.good === good ? k.qty : 0);
    }, 0) : 0;
    const free = cant[good] - promised(st, me, good) - bids;
    if (free <= 0) continue;
    // all'asta del fondaco va metà, a un prezzo più alto di quello dei mercanti di passaggio
    if (rivals && level !== 'facile' && free >= 40 && !st.lots.some(l => l.seller === me && l.good === good)) {
      const qty = Math.floor(free / 2), price = prices[good] + (level === 'difficile' ? 2 : 1);
      if (postLot(g, good, qty, price).ok) log.push(`porta al fondaco ${qty} ${UNITA[good][1]} di ${good} a ${price} scudi`);
    }
    const left = cant[good] - promised(st, me, good) - bids;
    const sell = level === 'facile' ? Math.floor(left * rnd()) : left;
    if (sell > 0) {
      const r = sellPassing(g, good, sell);
      if (r.ok) log.push(`vende ${sell} ${UNITA[good][1]} di ${good} ai mercanti di passaggio per ${r.gain} scudi`);
    }
  }
}

/** Compra al fondaco la merce che costa meno di quanto la pagano i mercanti di passaggio (per rivenderla). */
function botBuyLots(c: BotCtx): void {
  const { g, level, log } = c;
  if (level !== 'difficile') return;
  const st = ms(g), me = g.state.current, p = g.player, prices = passingPrices(g.state.q);
  for (const lot of st.lots.filter(l => l.seller !== me && l.price < prices[l.good])) {
    const qty = Math.min(lot.qty, Math.floor(Math.max(0, p.scudi - 500) / lot.price));
    const seller = g.state.players[lot.seller].name, good = lot.good, price = lot.price;
    if (qty > 0 && buyLot(g, lot.id, qty).ok) log.push(`compra al fondaco ${qty} ${UNITA[good][1]} di ${good} da ${seller} a ${price} scudi`);
  }
}

/** Merce tenuta per i mercanti forestieri: contratti vinti e offerte alla fiera. */
const reserved = (g: Game, good: Merce) => committed(ms(g), g.state.current, good);

/** Il signore è a un passo dal trono: gli manca meno di un quinto della ricchezza. */
const nearThrone = (g: Game) => wealthIndex(g.player) >= victoryRule(g.state.options).threshold * 0.8;

/** Consumi di prestigio con la merce libera: festa per il titolo, richieste, poi un banchetto. */
function botConsume(c: BotCtx, hoard: boolean): void {
  const { g, level, rnd, log } = c;
  const st = ms(g), me = g.state.current, cant = cantinaOf(g);
  if (level === 'facile' && rnd() < 0.6) return;
  const free = (good: Merce) => cant[good] - reserved(g, good);
  const fits = (need: { vino: number; manufatti: number }) => free('vino') >= need.vino && free('manufatti') >= need.manufatti;
  const f = festaDi(g, st, me);
  if (f && fits(festaOf(f.rango)) && feast(g).ok) log.push('celebra il nuovo titolo con una festa');
  for (const r of [...richiesteOf(st, me)]) {
    if (fits(RICHIESTE[r.id]) && fulfilRequest(g, r.id).ok) log.push(`soddisfa la richiesta: ${r.id}`);
  }
  // i banchetti solo con la merce che non si tiene per la fiera
  if (hoard || banchettoFatto(g, st, me)) return;
  const kind = [...BANCHETTI_ID].reverse().find(k => free('vino') >= BANCHETTI[k].vino);
  if (kind && banquet(g, kind).ok) log.push(`dà un banchetto ${kind}`);
}

/** Merce che manca per i contratti: promessa meno magazzino e produzione attesa fino alla scadenza. */
function shortage(g: Game, good: Merce, entro: number): number {
  const st = ms(g), me = g.state.current, p = g.player, cant = cantinaOf(g);
  const out = yearlyOutput(p, cant)[good] * Math.max(0, entro - g.state.q);
  return promised(st, me, good) - cant[good] - out;
}

/**
 * Quota che conviene: guadagno atteso dei contratti che il signore può
 * consegnare (dalle fasce note a tutti, non dai contratti ancora nascosti),
 * meno la quota. Il difficile spera di vincerne di più.
 */
function bestQuota(g: Game, level: BotLevel): number {
  const p = g.player, cant = cantinaOf(g), out = yearlyOutput(p, cant), st = ms(g), me = g.state.current;
  const mid = (r: readonly [number, number]) => (r[0] + r[1]) / 2;
  const win = level === 'difficile' ? 0.45 : 0.3;
  const fasce = [...FASCE.flatMap((x, i) => Array.from({ length: x.n }, () => ({ ...x, i }))), { ...SPECIALE, n: 1, i: 3 }];
  let best = -1, bestGain = 0, seen = 0;
  QUOTE.forEach((t, k) => {
    let gain = -t.fee;
    for (const x of fasce.slice(0, t.n)) {
      const qty = mid(x.qty), price = mid(x.base);
      // si consegna con il vino o con i manufatti: basta una delle due
      const fits = MERCI.some(good => cant[good] - promised(st, me, good) + out[good] * x.tempo >= qty);
      if (fits) gain += qty * (price - PREZZO_PASSAGGIO.vino.max) * win;
    }
    seen = t.n;
    if (gain > bestGain && p.scudi - t.fee >= (level === 'difficile' ? 0 : 1000)) { best = k; bestGain = gain; }
  });
  return seen ? best : -1;
}

/** Fiera: entra con la quota che può onorare e offre per i contratti che può consegnare. */
function botFair(c: BotCtx): void {
  const { g, level, rnd, log } = c;
  const st = ms(g), me = g.state.current, p = g.player, cant = cantinaOf(g);
  const f = fairOpen(st, g.state.q);
  if (!f) return;
  const out = yearlyOutput(p, cant);
  const cap = out.vino + out.manufatti + (cant.vino + cant.manufatti) / 2;
  if (f.quote[me] < 0) {
    // il facile prende a caso un banco o una bottega
    const cheap = rnd() < 0.5 ? 0 : 1;
    const want = level === 'facile' ? (rnd() < 0.5 && cap >= 30 && p.scudi >= QUOTE[cheap].fee ? cheap : -1) : bestQuota(g, level);
    if (want < 0 || !joinFair(g, want).ok) return;
    log.push(`entra alla fiera con ${QUOTE[want].name} (${QUOTE[want].fee} scudi)`);
  }
  const committed: Record<Merce, number> = { vino: promised(st, me, 'vino'), manufatti: promised(st, me, 'manufatti') };
  for (const k of [...visibleTo(f, me)].sort((a, b) => b.qty * b.base - a.qty * a.base)) {
    if (bidOf(f, me, k.id)) continue;
    const avail = cant[k.good] - committed[k.good] + out[k.good] * k.tempo;
    // il difficile tiene un margine per le annate cattive
    if (k.qty > avail * (level === 'facile' ? 1.5 : level === 'medio' ? 1.1 : 0.9)) continue;
    const factor = level === 'difficile' ? 0.8 + rnd() * 0.12 : level === 'medio' ? 0.88 + rnd() * 0.12 : 0.85 + rnd() * 0.35;
    const price = Math.max(1, Math.round(k.base * factor));
    if (bid(g, k.id, price).ok) {
      committed[k.good] += k.qty;
      log.push(`offre alla fiera ${k.qty} ${UNITA[k.good][1]} di ${k.good} a ${price} scudi l'unità`);
    }
  }
}

/**
 * Imprese: il mercante fallito conviene sempre (merce a poco); il vino
 * annacquato il difficile lo usa solo vicino al trono, per i banchetti; il
 * contrabbando, che può portare all'arresto, il difficile non lo tenta mai e
 * il medio solo nei debiti o all'ultimo anno della carta.
 */
function botImprese(c: BotCtx): void {
  const { g, level, rnd, log } = c;
  const st = ms(g), p = g.player, cant = cantinaOf(g), q = g.state.q;
  for (const card of [...impreseOf(st, g.state.current)]) {
    const last = q >= card.dal + 5;
    if (card.id === 'fallito') {
      const cost = ((card.vino ?? 0) + (card.manufatti ?? 0)) * 5;
      if ((level !== 'facile' || rnd() < 0.5) && p.scudi - cost >= (level === 'difficile' ? 1000 : 2000) && playBankrupt(g).ok) log.push(`compra il fondaco del mercante fallito per ${cost} scudi`);
    } else if (card.id === 'annacquato') {
      const go = level === 'difficile' ? nearThrone(g) : level === 'medio' ? rnd() < 0.4 || last : rnd() < 0.3;
      if (go && cant.vino >= 200 && playWater(g).ok) log.push('annacqua il vino');
    } else if (card.id === 'contrabbando') {
      const free = cant.manufatti - committed(st, g.state.current, 'manufatti');
      const go = level === 'facile' ? rnd() < 0.3 : level === 'medio' && (p.scudi < 0 || last) && rnd() < 0.5;
      const qty = Math.min(CONTRABBANDO_MAX, free);
      if (go && qty >= CONTRABBANDO_MIN && playSmuggle(g, qty).ok) log.push(`imbarca ${qty} manufatti di contrabbando per Costantinopoli`);
    }
  }
}

/** Il console comprato, dopo le offerte: sul contratto più ricco fra quelli offerti. */
function botConsole(c: BotCtx): void {
  const { g, level, rnd, log } = c;
  const st = ms(g), me = g.state.current, f = fairOpen(st, g.state.q);
  if (!f || !impresaCard(g, st, 'console') || g.player.scudi < CONSOLE_COSTO + 1000) return;
  if (level === 'medio' && rnd() < 0.5) return;
  const mine = f.offerte.filter(o => o.player === me).map(o => f.contratti.find(k => k.id === o.contract)!).sort((a, b) => b.qty * b.base - a.qty * a.base);
  const k = level === 'facile' ? visibleTo(f, me)[Math.floor(rnd() * visibleTo(f, me).length)] : mine[0];
  if (k && playConsole(g, k.id).ok) log.push('compra il console della fiera');
}

/** Spedisce i contratti appena la merce c'è (si incassa prima). */
function botShip(c: BotCtx): void {
  const { g, log } = c;
  const st = ms(g), me = g.state.current, cant = cantinaOf(g);
  for (const imp of impegniOf(st, me).filter(x => !x.spedito && cant[x.c.good] >= x.c.qty)) {
    if (shipContract(g, imp.id, imp.c.qty).ok) log.push(`spedisce ${imp.c.qty} ${UNITA[imp.c.good][1]} di ${imp.c.good} ai mercanti forestieri`);
  }
}

/** Compra al fondaco la merce che manca per un contratto, se arriva in tempo e costa meno del pattuito. */
function botRescue(c: BotCtx): void {
  const { g, level, log } = c;
  if (level === 'facile') return;
  const st = ms(g), me = g.state.current, p = g.player, ps = g.state.players;
  for (const imp of impegniOf(st, me).filter(x => !x.spedito)) {
    let need = shortage(g, imp.c.good, imp.entro);
    for (const lot of st.lots.filter(l => l.seller !== me && l.good === imp.c.good && l.price < imp.price).sort((a, b) => a.price - b.price)) {
      if (need <= 0) break;
      if (g.state.q + travelYears(ps[lot.seller].feudo, { feudo: p.feudo }) > imp.entro) continue;
      const qty = Math.min(lot.qty, need, Math.floor(Math.max(0, p.scudi + p.credito / 2) / lot.price));
      const name = ps[lot.seller].name, price = lot.price;
      if (qty > 0 && buyLot(g, lot.id, qty).ok) {
        need -= qty;
        log.push(`compra al fondaco ${qty} ${UNITA[imp.c.good][1]} di ${imp.c.good} da ${name} a ${price} scudi per un contratto`);
      }
    }
  }
}

/** Pianta vigneti: di più dove il vino è la specialità del feudo. */
function botPlant(c: BotCtx): void {
  const { g, level, rnd, log } = c;
  const p = g.player, cant = cantinaOf(g);
  const wine = bonusOf(p.feudo, 'vino') > 1;
  const share = level === 'facile' ? (rnd() < 0.3 ? 0.2 : 0) : wine ? 0.5 : level === 'difficile' ? 0.3 : 0.2;
  const target = Math.min(maxVigneti(p), Math.floor((p.acri * share) / 25));
  const reserve = level === 'difficile' ? Math.max(800, (p.acri * 75 * 0.5 * 35) / 1000) : 1500;
  let built = 0;
  while (cant.vigneti < target && p.scudi - VIGNETO_COST >= reserve && built < 6 && plant(g).ok) built++;
  if (built) log.push(`pianta ${built} ${built === 1 ? 'vigneto' : 'vigneti'}`);
  // un opificio in più l'anno per i manufatti della fiera, di più dove sono la specialità del feudo
  if (level === 'facile') return;
  const per = bonusOf(p.feudo, 'manufatti') > 1 ? 2 : 1;
  let made = 0;
  while (made < per && p.scudi - COSTS.opificio >= reserve + 1000 && g.invest('opificio').ok) made++;
  if (made) log.push(`costruisce ${made} ${made === 1 ? 'opificio' : 'opifici'} per i manufatti`);
}

function botLend(c: BotCtx): void {
  const { g, level, rnd } = c;
  const st = ms(g), me = g.state.current, p = g.player;
  if (st.offers.some(o => o.lender === me)) return;
  // si presta solo se c'è chi può chiedere: il difficile aspetta che qualcuno sia in rosso
  const others = g.state.players.filter((x, i) => i !== me && x.caduto === undefined);
  if (!others.length || (level === 'difficile' && !others.some(x => x.scudi < 0))) return;
  let offer: { amount: number; rate: number; years: number } | null = null;
  if (level === 'difficile') {
    // presta un terzo di ciò che avanza oltre la riserva per il grano dell'anno prossimo
    const reserve = Math.max(800, (p.acri * 75 * 0.5 * 35) / 1000);
    if (p.scudi > reserve + 2000) offer = { amount: round50(Math.min(5000, (p.scudi - reserve) / 3)), rate: 15 + Math.floor(rnd() * 10), years: 1 };
  } else if (level === 'medio') {
    if (p.scudi > 4000 && rnd() < 0.5) offer = { amount: round50(1000 + rnd() * 1000), rate: 25, years: 2 };
  } else if (p.scudi > 2000 && rnd() < 0.15) {
    offer = { amount: round50(500 + rnd() * 500), rate: 5 + Math.floor(rnd() * 36), years: 1 + Math.floor(rnd() * 3) };
  }
  if (offer && offer.amount >= LOAN_MIN && postLoan(g, offer.amount, offer.rate, offer.years).ok) {
    c.log.push(`offre al banco un prestito di ${offer.amount} scudi al ${offer.rate}% per ${offer.years} ${offer.years === 1 ? 'anno' : 'anni'}`);
  }
}

// ---------------------------------------------------------------- agganci

export const rules: ExpansionRules = {
  id: ID,
  // chiuso il mercato del grano, la pagina "Fra signori"
  signori: true,
  init: (state): MercantiState => {
    let h = 2166136261;
    for (const v of [...state.rngState, state.players.length, 0x7e1e]) h = Math.imul(h ^ v, 16777619) >>> 0;
    return {
      offers: [], loans: [], mail: [], inbox: [], nextId: 1,
      cantine: state.players.map(() => emptyCantina()), lots: [], carovane: [],
      prestigio: state.players.map(() => 0), rng: [h], impegni: [],
    };
  },

  onTurnStart(g) {
    const st = ms(g), me = g.state.current, p = g.player;
    // le carovane arrivate alle piazze si fanno pagare; la fiera è aperta
    arrivals(fairCtx(g));
    // imprese: merce del mercante fallito e nave del contrabbando (che può costare l'arresto); carte scadute
    const arrested = settleImprese(g, st, roll(st), d => changePrestige(g, me, d), d => send(st, me, d), (kind, data) => note(g, me, kind, data));
    for (const id of expireImprese(g, st, me)) note(g, me, 'impresaLost', { card: IMPRESE_MERC.indexOf(id) });
    if (arrested) g.arrestCurrent();
    if (isFairYear(g.state.q) && st.fiera) send(st, me, { k: 'fieraAperta', q: g.state.q, n: st.fiera.contratti.length });
    st.inbox = st.mail.filter(m => m.to === me).map(m => m.d);
    st.mail = st.mail.filter(m => m.to !== me);
    // il denaro che nessuno ha voluto torna in cassa
    for (const o of st.offers.filter(x => x.lender === me)) {
      p.scudi += o.amount;
      st.inbox.push({ k: 'offerBack', amount: o.amount });
    }
    st.offers = st.offers.filter(x => x.lender !== me);
    // carovane arrivate e merce invenduta del fondaco
    const { received, cashed, back } = settleCaravans(g, st, me);
    for (const c of received) st.inbox.push({ k: 'caravanIn', from: c.seller, good: c.good, qty: c.qty, perse: c.perse, refund: c.paid - sellerShare(c), ...(c.evento ? { evento: c.evento } : {}) });
    for (const c of cashed) {
      // chi spedisce risponde della carovana: puntuale e intatta dà prestigio, ritardi e perdite lo tolgono
      const delta = c.perse ? PRESTIGIO.perdita : late(c) ? PRESTIGIO.ritardo : PRESTIGIO.consegna;
      const prestigio = changePrestige(g, me, delta);
      st.inbox.push({ k: 'caravanPaid', to: c.buyer, good: c.good, qty: c.qty, gain: sellerShare(c), perse: c.perse, prestigio, ...(c.evento ? { evento: c.evento } : {}) });
    }
    // i molti mercati fanno conoscere il signore; un pignoramento degli usurai lo disonora
    changePrestige(g, me, marketPrestige(g.player.mercato));
    const end = [...(g.state.chronicle ?? [])].reverse().find(e => e.player === me && e.fact.t === 'yearEnd')?.fact;
    // salito di rango alla fine dell'anno scorso: quest'anno si può celebrare il titolo
    const lastYear = [...(g.state.chronicle ?? [])].reverse().find(e => e.player === me && e.fact.t === 'yearEnd');
    if (lastYear?.fact.t === 'yearEnd' && lastYear.year === g.year - 1) {
      const r = offerFeast(g, st, me, lastYear.fact.titleBefore, lastYear.fact.titleAfter);
      if (r) st.inbox.push({ k: 'festaTitolo', rango: r });
    }
    for (const id of expireRequests(g, st, me)) note(g, me, 'requestLost', { req: RICHIESTE_ID.indexOf(id) });
    if (end?.t === 'yearEnd' && end.seized && st.disonore?.[me] !== g.state.q - 1) {
      (st.disonore ??= g.state.players.map(() => -1))[me] = g.state.q - 1;
      st.inbox.push({ k: 'disonore', prestigio: changePrestige(g, me, PRESTIGIO.pignoramento) });
    }
    for (const l of back) st.inbox.push({ k: 'lotBack', good: l.good, qty: l.qty });
    // vendemmia e lavoro degli opifici
    produce(g, st.cantine[me]);
  },

  // i prestiti si rendono prima di interessi e pignoramenti degli usurai; in magazzino un po' di vino si guasta
  beforeYearEnd(g) {
    deadlines(fairCtx(g));
    settleLoans(g);
    spoilWine(cantinaOf(g));
  },

  // mazzo dell'espansione: le richieste che il signore non ha già in mano
  // mazzo dell'espansione: richieste e imprese che il signore non ha già in mano (una carta doppia non esce: niente imprevisto)
  deck(g) {
    const st = ms(g), me = g.state.current, hand = richiesteOf(st, me), imp = impreseOf(st, me);
    return [
      ...RICHIESTE_ID.filter(id => !hand.some(r => r.id === id)).map(id => ({ id: RICHIESTA_EVENT[id], w: RICHIESTA_PESO })),
      ...IMPRESE_MERC.filter(id => !imp.some(c => c.id === id)).map(id => ({ id: IMPRESA_MERC_EVENT[id], w: IMPRESA_PESO })),
    ];
  },

  onCard(g, id) {
    const st = ms(g), me = g.state.current;
    const req = richiestaOfEvent(id), imp = impresaMercOfEvent(id);
    if (req) {
      drawRequest(g, st, me, req);
      note(g, me, 'requestDrawn', { req: RICHIESTE_ID.indexOf(req) });
    }
    if (imp && drawImpresa(g, st, me, imp, roll(st))) note(g, me, 'impresaDrawn', { card: IMPRESE_MERC.indexOf(imp) });
  },

  // ogni piano di palazzo chiede manufatti: quelli che mancano si comprano dagli artigiani
  beforeInvest(g, kind) {
    if (kind !== 'palazzo') return { ok: true };
    const p = g.player, c = cantinaOf(g), need = palaceNeeds(p, c, committed(ms(g), g.state.current, 'manufatti'));
    if (p.scudi - COSTS.palazzo - need.scudi < -p.credito) {
      return { ok: false, reason: `il piano chiede ${need.manufatti} manufatti: ne mancano ${need.comprati}, che gli artigiani vendono per ${need.scudi} scudi` };
    }
    c.manufatti -= need.usati;
    p.scudi -= need.scudi;
    note(g, g.state.current, 'palaceGoods', { piano: p.palazzo + 1, manufatti: need.manufatti, comprati: need.comprati, scudi: need.scudi });
    return { ok: true };
  },

  // fine dell'anno di tutti: si chiude la fiera e si bandisce la prossima
  onYearClose(g) {
    const st = ms(g);
    resolveFair(fairCtx(g), () => st.nextId++);
    if (isFairYear(g.state.q + 1)) st.fiera = makeFair(roll(st), g.state.q + 1, () => st.nextId++, g.state.players.length);
  },

  botSignori(c) {
    botImprese(c);
    botBorrow(c);
    botShip(c);
    botRescue(c);
    botBuyLots(c);
    botSell(c);
  },
  // la fiera si fa dopo le rendite, quando le casse sono piene; poi si vende quel che avanza
  botBeforeInvest(c) {
    if (fairOpen(ms(c.g), c.g.state.q)) {
      botFair(c);
      botConsole(c);
      botSell(c, true);
    }
    botPlant(c);
    botLend(c);
  },
};
