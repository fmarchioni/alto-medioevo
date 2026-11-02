/**
 * Espansione "Mercanti e Usurai": economia fra signori. Solo regole, nessuna
 * interfaccia (la vista è in view.ts).
 *
 * - Fondaco: ogni signore può mettere in vendita grano a un prezzo che sceglie;
 *   gli altri lo comprano nel proprio turno e pagano direttamente il venditore.
 *   Il grano invenduto torna al venditore all'inizio del suo turno, meno un
 *   quinto trattenuto per la custodia.
 * - Banco: un signore offre un prestito (somma, interesse, durata). Chi lo
 *   accetta lo restituisce alla scadenza, a fine anno; se non può, il creditore
 *   pignora terre, mercati, opifici e piani di palazzo.
 * - Fiera: ogni tre anni, nel feudo con più mercati, si mette all'asta un bene
 *   raro con offerte segrete. Chi ospita la fiera incassa un quinto del prezzo.
 * - Contrabbando: la gabella della macina si riscuote per intero sul grano fino
 *   al doppio della domanda, e oltre solo per un quarto: il resto finisce ai
 *   mercanti di frodo. Comprare tutto il raccolto per distribuirlo rende molto
 *   meno che nel gioco base.
 * - Sensali: ogni anno si presenta a ciascun signore, a caso, uno di tre
 *   esperti di piazza. Pagato per l'anno (più caro ai ranghi alti), dice se le
 *   gabelle che si stanno scegliendo sono basse, eque o inique per il popolo e
 *   per i mercanti (umore e fiducia restano nascosti). Il più caro sbaglia di
 *   meno: 5, 7 o 10 punti al più.
 * - Lombardi: chi a fine anno deve agli usurai più di 5000 scudi subisce il
 *   pignoramento dei beni per la parte eccedente.
 */
import { INT } from '../../domain/economy';
import type { BotCtx, ExpansionRules } from '../../domain/expansion';
import { acriPerBotteghe, COSTS, MAX_ACRI, MAX_PALAZZO, roomFor } from '../../domain/investments';
import type { Game } from '../../domain/turn';
import { fiduciaOf, LIVELLO_MIN, MOOD_DRIFT, nextFiducia, nextUmore, tolleranzaMercanti, tolleranzaServi } from '../../domain/gabelle';
import { rankOf } from '../../domain/rank';
import { Mulberry32 } from '../../domain/rng';
import type { ActionResult, EventOutcome, Player } from '../../domain/types';

export const ID = 'mercanti-usurai';

/** Prezzo massimo per mille misure al fondaco. */
export const LOT_MAX_PRICE = 99;
/** Parte del grano invenduto trattenuta dal fondaco quando torna al venditore. */
export const LOT_CUSTODY = 0.2;
/** La macina conta per intero il grano distribuito fino a questo multiplo della domanda... */
export const MACINA_CAP_FACTOR = 2;
/** ...e oltre solo per questa quota: il resto finisce ai mercanti di frodo. */
export const MACINA_BEYOND = 0.25;
/** Oltre questo debito, a fine anno, i Lombardi pignorano i beni per la differenza. */
export const LOMBARD_LIMIT = 5000;
export const LOAN_MIN = 500;
export const LOAN_MAX_RATE = 60;
export const LOAN_MAX_YEARS = 3;
/** Terre che il pignoramento lascia comunque al debitore. */
export const MIN_ACRI = 250;
/** La fiera si tiene negli anni 902, 905, 908... */
export const FAIR_EVERY = 3;
export const FAIR_MIN_BID = 500;
export const FAIR_HOST_SHARE = 0.2;

/**
 * I tre sensali: ogni anno a ciascun signore se ne presenta uno, a caso.
 * Chi sbaglia meno costa di più. Il compenso è quello per un messere,
 * moltiplicato per il rango (SENSALE_RANK).
 */
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

export type GoodId = 'sementi' | 'destrieri' | 'privilegio' | 'reliquia';
/** Beni rari in ordine di fiera: sementi d'oltremare, destrieri arabi, privilegio dei Lombardi, reliquia. */
export const GOODS: GoodId[] = ['sementi', 'destrieri', 'privilegio', 'reliquia'];
/** Le sementi aumentano il raccolto di un quarto. */
export const SEMENTI_BONUS = 0.25;

export interface Lot { id: number; seller: number; qty: number; price: number }
export interface LoanOffer { id: number; lender: number; amount: number; rate: number; years: number }
export interface Loan { id: number; lender: number; debtor: number; principal: number; due: number; dueQ: number }
export interface FairResult { q: number; good: GoodId; host: number; winner: number | null; bid: number }

/** Notizie per un signore, lette all'inizio del suo turno. */
export type Dispatch =
  | { k: 'lotSold'; buyer: number; qty: number; gain: number }
  | { k: 'lotBack'; qty: number; lost: number }
  | { k: 'offerTaken'; debtor: number; amount: number; due: number; dueQ: number }
  | { k: 'offerBack'; amount: number }
  | { k: 'repaid'; debtor: number; amount: number }
  | { k: 'seized'; debtor: number; cash: number; acri: number; mercati: number; opifici: number; palazzo: number; unpaid: number }
  /** al debitore: prestito reso */
  | { k: 'paid'; lender: number; amount: number }
  /** al debitore: beni pignorati da un signore o dai Lombardi (lender = -1) */
  | { k: 'seizedFrom'; lender: number; cash: number; acri: number; mercati: number; opifici: number; palazzo: number; unpaid: number }
  | { k: 'fairWon'; good: GoodId; bid: number }
  | { k: 'fairLost'; good: GoodId; winner: number; bid: number }
  | { k: 'fairFee'; good: GoodId; winner: number; amount: number };

export interface MercantiState {
  lots: Lot[];
  offers: LoanOffer[];
  loans: Loan[];
  /** fiera dell'anno in corso, se c'è */
  fair: { good: GoodId; host: number } | null;
  /** offerte segrete alla fiera dell'anno (0 = nessuna) */
  bids: number[];
  /** beni rari posseduti da ciascun signore */
  goods: GoodId[][];
  /** notizie non ancora consegnate */
  mail: { to: number; d: Dispatch }[];
  /** notizie consegnate al signore di turno */
  inbox: Dispatch[];
  fairs: FairResult[];
  nextId: number;
  /** sensale assoldato da ciascun signore: anno (q) e scarti della sua stima (assente nei salvataggi vecchi) */
  sensale?: ({ q: number; errU: number; errF: number; who?: SensaleId } | null)[];
}

export const ms = (g: Game): MercantiState => g.state.ext as MercantiState;
export const isFairYear = (q: number) => q % FAIR_EVERY === FAIR_EVERY - 1;
export const fairGood = (q: number): GoodId => GOODS[Math.floor(q / FAIR_EVERY) % GOODS.length];
export const owns = (st: MercantiState, player: number, good: GoodId) => st.goods[player]?.includes(good) ?? false;

/** Ospita la fiera il signore con più mercati (a parità, il primo). */
export function fairHost(players: Player[]): number {
  return players.reduce((best, p, i) => (p.mercato > players[best].mercato ? i : best), 0);
}

const isInt = (n: number) => Number.isInteger(n);
const note = (g: Game, player: number, kind: string, data: Record<string, number>) => g.note(player, { t: 'ext', kind, data });
const send = (st: MercantiState, to: number, d: Dispatch) => st.mail.push({ to, d });

function guard(g: Game): ActionResult | null {
  return g.state.phase.kind === 'commercio' ? null : { ok: false, reason: 'si tratta solo durante la delibera' };
}

// ---------------------------------------------------------------- sensale

/**
 * Il sensale che si presenta quest'anno al signore di turno: sorteggiato da
 * anno, signore e partita, quindi ricaricando non cambia.
 */
export function sensaleOfTurn(g: Game, i = g.state.current): SensaleId {
  let h = 2166136261;
  const salt = g.state.players.map(p => p.feudo * 31 + p.name.length).concat(g.state.q, i, 0x5e75a1e);
  for (const v of salt) h = Math.imul(h ^ v, 16777619) >>> 0;
  return SENSALE_IDS[Math.floor(new Mulberry32(h).next() * SENSALE_IDS.length)];
}
export const sensaleCost = (p: Player, who: SensaleId) => SENSALI[who].cost * SENSALE_RANK[rankOf(p) - 1];
export const hasSensale = (g: Game, i = g.state.current) => ms(g).sensale?.[i]?.q === g.state.q;
/** sensale al servizio del signore quest'anno (null se non assoldato) */
export const hiredSensale = (g: Game, i = g.state.current): SensaleId | null => (hasSensale(g, i) ? ms(g).sensale![i]!.who ?? 'cecco' : null);
/** il sensale serve solo con la riforma delle gabelle (umore e fiducia nascosti) */
export const sensaleUseful = (p: Player) => p.fiducia !== undefined;

/** Si assolda per l'anno in corso, durante la delibera: il compenso si paga subito. */
export function hireSensale(g: Game): ActionResult {
  const no = guard(g);
  if (no) return no;
  const p = g.player, st = ms(g), me = g.state.current;
  if (!sensaleUseful(p)) return { ok: false, reason: "senza la riforma delle gabelle non c'è nulla da indovinare" };
  if (hasSensale(g)) return { ok: false, reason: "il sensale è già al vostro servizio quest'anno" };
  const who = sensaleOfTurn(g), cost = sensaleCost(p, who);
  if (!canPay(p, cost)) return { ok: false, reason: 'tesoro e credito insufficienti' };
  p.scudi -= cost;
  // lo scarto della stima è fisso per l'anno: muovendo i cursori non cambia idea
  const r = new Mulberry32(((g.state.q + 1) * 7919) ^ ((me + 1) * 104729) ^ (st.nextId++ * 2654435761));
  const err = () => Math.round((r.next() * 2 - 1) * SENSALI[who].err);
  st.sensale ??= g.state.players.map(() => null);
  st.sensale[me] = { q: g.state.q, errU: err(), errF: err(), who };
  note(g, me, 'sensale', { cost, who: SENSALE_IDS.indexOf(who) });
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
  const s = ms(g).sensale?.[g.state.current];
  const p = g.player, sc = g.state.scalars;
  if (!s || s.q !== g.state.q || !sensaleUseful(p)) return null;
  const q = { ...p, rateBevere: r.bevere, rateMacina: r.macina, rateCommerzio: r.commerzio };
  const domanda = sc.domandaAnno ?? sc.domanda;
  const u = nextUmore(q, tolleranzaServi(sc.nutrito ?? 0, domanda)) + s.errU;
  const f = nextFiducia({ ...q, fiducia: fiduciaOf(p) }, tolleranzaMercanti(sc.venduto ?? 0, domanda)) + s.errF;
  const safe = sensaleSafe(s.who ?? 'cecco');
  const judge = (v: number): Giudizio => (v >= LIVELLO_MIN.buono + safe ? 'bassa' : v >= LIVELLO_MIN.buono ? 'equa' : 'iniqua');
  return { popolo: judge(u), mercanti: judge(f) };
}

/** Il banco dei prestiti è aperto anche durante i dispendimenti, quando le rendite sono in cassa. */
function bankGuard(g: Game): ActionResult | null {
  const k = g.state.phase.kind;
  return k === 'commercio' || k === 'investimenti' ? null : { ok: false, reason: 'il banco è aperto durante la delibera e i dispendimenti' };
}

/** Stesso limite di spesa dell'acquisto dal raccolto (righe 475-490). */
export function canPay(p: Player, cost: number): boolean {
  return p.scudi >= -p.credito && INT(p.scudi - cost) >= -p.credito;
}

export const lotCost = (qty: number, price: number) => (qty * price) / 1000;
export const loanDue = (amount: number, rate: number) => amount + INT((amount * rate) / 100);

/** Massima quantità di un lotto che il signore può pagare. */
export function maxLotBuy(p: Player, lot: Lot): number {
  if (p.scudi < -p.credito) return 0;
  let q = Math.min(lot.qty, Math.floor(((p.scudi + p.credito + 1) * 1000) / lot.price));
  while (q > 0 && !canPay(p, lotCost(q, lot.price))) q--;
  return Math.max(0, q);
}

// ---------------------------------------------------------------- fondaco

export function postLot(g: Game, qty: number, price: number): ActionResult {
  const no = guard(g);
  if (no) return no;
  const st = ms(g), me = g.state.current, p = g.player;
  if (!isInt(qty) || qty <= 0) return { ok: false, reason: 'quantità non valida' };
  if (!isInt(price) || price < 1 || price > LOT_MAX_PRICE) return { ok: false, reason: `prezzo fra 1 e ${LOT_MAX_PRICE} scudi ogni mille` };
  if (qty > p.grano) return { ok: false, reason: 'non possedete tanto grano' };
  if (st.lots.some(l => l.seller === me)) return { ok: false, reason: 'avete già un banco al fondaco' };
  p.grano -= qty;
  st.lots.push({ id: st.nextId++, seller: me, qty, price });
  note(g, me, 'lotPost', { qty, price });
  return { ok: true };
}

/** Ritira il proprio grano dal fondaco: nel proprio turno senza spese di custodia. */
export function withdrawLot(g: Game): ActionResult {
  const no = guard(g);
  if (no) return no;
  const st = ms(g), me = g.state.current;
  const lot = st.lots.find(l => l.seller === me);
  if (!lot) return { ok: false, reason: 'non avete grano al fondaco' };
  g.player.grano += lot.qty;
  st.lots = st.lots.filter(l => l !== lot);
  return { ok: true };
}

export function buyLot(g: Game, lotId: number, qty: number): ActionResult {
  const no = guard(g);
  if (no) return no;
  const st = ms(g), me = g.state.current, p = g.player;
  const lot = st.lots.find(l => l.id === lotId);
  if (!lot) return { ok: false, reason: 'quel grano non è più in vendita' };
  if (lot.seller === me) return { ok: false, reason: 'non si compra il proprio grano' };
  if (!isInt(qty) || qty <= 0) return { ok: false, reason: 'quantità non valida' };
  if (qty > lot.qty) return { ok: false, reason: 'il banco non ha tanto grano' };
  const cost = lotCost(qty, lot.price);
  if (!canPay(p, cost)) return { ok: false, reason: 'spesa oltre il credito concesso' };
  p.scudi = INT(p.scudi - cost);
  p.grano += qty;
  g.state.players[lot.seller].scudi += cost;
  lot.qty -= qty;
  if (lot.qty === 0) st.lots = st.lots.filter(l => l !== lot);
  send(st, lot.seller, { k: 'lotSold', buyer: me, qty, gain: cost });
  note(g, me, 'lotBuy', { seller: lot.seller, qty, price: lot.price });
  return { ok: true };
}

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
    key: 'acri', unit: 25, value: COSTS.terre,
    // al debitore restano le terre minime e quelle che servono per i mercati e gli opifici che conserva
    avail: d => Math.floor((d.acri - Math.max(MIN_ACRI, acriPerBotteghe(d))) / 25),
    room: l => Math.floor((MAX_ACRI - l.acri) / 25),
    add: (p, u) => { p.acri += u * 25; },
  },
  { key: 'mercati', unit: 1, value: COSTS.mercato, avail: d => d.mercato - 1, room: l => roomFor(l, 'mercato'), add: (p, u) => { p.mercato += u; } },
  { key: 'opifici', unit: 1, value: COSTS.opificio, avail: d => d.opificio - 1, room: l => roomFor(l, 'opificio'), add: (p, u) => { p.opificio += u; } },
  { key: 'palazzo', unit: 1, value: COSTS.palazzo, avail: d => d.palazzo, room: l => MAX_PALAZZO - l.palazzo, add: (p, u) => { p.palazzo += u; } },
];

/**
 * Pignoramento: terre (25 acri ogni 500 scudi), poi mercati, opifici e piani
 * di palazzo al loro prezzo, finché il debito è coperto. Un creditore signore
 * prende solo ciò che può tenere; i Lombardi (creditore assente) prendono tutto.
 */
export function seize(debtor: Player, lender: Player | null, rest: number): Seizure {
  const out: Seizure = { acri: 0, mercati: 0, opifici: 0, palazzo: 0, unpaid: 0 };
  for (const a of ASSETS) {
    if (rest <= 0) break;
    const u = Math.max(0, Math.min(Math.ceil(rest / a.value), a.avail(debtor), lender ? a.room(lender) : Infinity));
    a.add(debtor, -u);
    if (lender) a.add(lender, u);
    out[a.key] = u * a.unit;
    rest -= u * a.value;
  }
  out.unpaid = Math.max(0, rest);
  return out;
}

/** I Lombardi pignorano i beni di chi deve loro più di LOMBARD_LIMIT scudi, per la parte eccedente. */
function lombards(g: Game): void {
  const p = g.player;
  const excess = -LOMBARD_LIMIT - p.scudi;
  if (excess <= 0) return;
  const s = seize(p, null, excess);
  const recovered = excess - s.unpaid;
  if (recovered <= 0) return;
  p.scudi += recovered;
  note(g, g.state.current, 'lombards', { ...s, recovered });
  send(ms(g), g.state.current, { k: 'seizedFrom', lender: -1, cash: 0, ...s });
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
    } else {
      const cash = Math.max(0, INT(p.scudi));
      p.scudi -= cash;
      lender.scudi += cash;
      const s = seize(p, lender, loan.due - cash);
      send(st, loan.lender, { k: 'seized', debtor: me, cash, ...s });
      send(st, me, { k: 'seizedFrom', lender: loan.lender, cash, ...s });
      note(g, me, 'seize', { lender: loan.lender, cash, ...s });
    }
    st.loans = st.loans.filter(l => l !== loan);
  }
}

// ---------------------------------------------------------------- fiera

/** Offerta segreta alla fiera dell'anno; 0 la ritira. Si paga solo se si vince. */
export function placeBid(g: Game, amount: number): ActionResult {
  const no = guard(g);
  if (no) return no;
  const st = ms(g), me = g.state.current, p = g.player;
  if (!st.fair) return { ok: false, reason: 'quest\'anno non c\'è fiera' };
  if (owns(st, me, st.fair.good)) return { ok: false, reason: 'possedete già questo bene' };
  if (!isInt(amount) || amount < 0) return { ok: false, reason: 'offerta non valida' };
  if (amount > 0 && amount < FAIR_MIN_BID) return { ok: false, reason: `l'offerta minima è di ${FAIR_MIN_BID} scudi` };
  if (amount > 0 && !canPay(p, amount)) return { ok: false, reason: 'non potreste pagare tanto' };
  st.bids[me] = amount;
  return { ok: true };
}

function closeFair(g: Game): void {
  const st = ms(g);
  if (!st.fair) return;
  const { good, host } = st.fair;
  // vince l'offerta più alta; a parità, chi l'ha fatta per primo nell'ordine dei feudi
  let winner: number | null = null;
  for (let i = 0; i < st.bids.length; i++) {
    if (st.bids[i] > 0 && (winner === null || st.bids[i] > st.bids[winner])) winner = i;
  }
  const bid = winner === null ? 0 : st.bids[winner];
  if (winner !== null) {
    const w = g.state.players[winner];
    w.scudi -= bid;
    st.goods[winner].push(good);
    send(st, winner, { k: 'fairWon', good, bid });
    note(g, winner, 'fairWon', { good: GOODS.indexOf(good), bid, host });
    st.bids.forEach((b, i) => {
      if (b > 0 && i !== winner) send(st, i, { k: 'fairLost', good, winner, bid });
    });
    if (host !== winner) {
      const fee = INT(bid * FAIR_HOST_SHARE);
      g.state.players[host].scudi += fee;
      send(st, host, { k: 'fairFee', good, winner, amount: fee });
    }
  }
  st.fairs.push({ q: g.state.q, good, host, winner, bid });
  st.fair = null;
  st.bids = st.bids.map(() => 0);
}

// ---------------------------------------------------------------- effetti dei beni rari

/** Dimezza le perdite di un esito (scudi e servi), restituendole al signore. */
function halveLosses(p: Player, o: EventOutcome): void {
  if (o.scudi < 0) {
    const back = INT(-o.scudi / 2);
    p.scudi += back;
    o.scudi += back;
  }
  if (o.servi < 0) {
    const back = INT(-o.servi / 2);
    p.servi += back;
    o.servi += back;
  }
  if (o.grano && o.grano < 0) {
    const back = INT(-o.grano / 2);
    p.grano += back;
    o.grano += back;
  }
}

// ---------------------------------------------------------------- signori del computer

const round50 = (v: number) => Math.floor(v / 50) * 50;

function botBid(c: BotCtx): void {
  const { g, level, rnd } = c;
  const st = ms(g), me = g.state.current, p = g.player;
  if (!st.fair || st.bids[me] || owns(st, me, st.fair.good)) return;
  const worth: Record<GoodId, number> = {
    sementi: p.acri * 4,
    destrieri: 1200,
    privilegio: p.scudi < 0 ? 3000 : 1000,
    reliquia: 1500 + p.servi / 2,
  };
  let value = worth[st.fair.good];
  if (level === 'difficile') value *= 0.8 + rnd() * 0.3;
  else if (level === 'medio') value *= 0.4 + rnd() * 0.5;
  else value = rnd() < 0.6 ? value * rnd() * 1.5 : 0;
  const bid = round50(Math.min(value, Math.max(0, p.scudi) * 0.4));
  if (bid >= FAIR_MIN_BID && placeBid(g, bid).ok) c.log.push(`offre in segreto ${bid} scudi alla fiera`);
}

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

/** Compra al fondaco il grano più conveniente del proprio raccolto, fino al bisogno. */
function botBuyLots(c: BotCtx): void {
  const { g, level, rnd } = c;
  const st = ms(g), me = g.state.current, p = g.player, sc = g.state.scalars;
  // la macina rende per misura 2 × 99 / servi scudi (oltre il limite, solo per la quota che conta)
  const rende = (share: number, price: number) => (share * 2 * 99) / Math.max(1, p.servi) > (price / 1000) * 1.2;
  const { cap, beyond } = g.macinaRule();
  let need =
    level === 'difficile' && rende(1, sc.prezzo) ? (rende(beyond, sc.prezzo) ? Infinity : cap) - p.grano
    : level === 'facile' ? (rnd() < 0.5 ? sc.domanda * rnd() * 1.5 - p.grano : 0)
    : sc.domanda * 1.1 - p.grano;
  // il proprio raccolto non basta: anche il grano caro del fondaco serve
  const scarce = sc.raccolto < need;
  const lots = st.lots.filter(l => l.seller !== me && (l.price < sc.prezzo || scarce)).sort((a, b) => a.price - b.price);
  for (const lot of lots) {
    if (need <= 0) break;
    const affordable = Math.floor((Math.max(0, p.scudi) * 1000) / lot.price);
    const q = Math.min(Math.floor(need), lot.qty, affordable, maxLotBuy(p, lot));
    if (q <= 0) continue;
    const price = lot.price, seller = g.state.players[lot.seller].name;
    if (buyLot(g, lot.id, q).ok) {
      c.log.push(`compra al fondaco ${q} misure da ${seller} a ${price} scudi ogni mille`);
      need -= q;
    }
  }
}

function botSellSurplus(c: BotCtx, feed: number): void {
  const { g, level, rnd } = c;
  const st = ms(g), me = g.state.current, p = g.player, sc = g.state.scalars;
  if (st.lots.some(l => l.seller === me)) return;
  // raccolto abbondante: si compra a buon mercato per rivendere ai signori che pagano il grano più caro
  if (level !== 'facile' && sc.prezzo <= 15 && sc.raccolto > 0 && p.scudi > 0) {
    const share = level === 'difficile' ? 0.4 : 0.2;
    const q = Math.min(sc.raccolto, Math.floor((p.scudi * share * 1000) / sc.prezzo));
    if (q >= 1000 && g.buy(q).ok) c.log.push(`compra ${q} misure del raccolto per il fondaco`);
  }
  const surplus = p.grano - feed;
  if (surplus < 1000) return;
  const qty = Math.floor(level === 'difficile' ? surplus : level === 'medio' ? surplus * 0.6 : rnd() < 0.4 ? surplus * rnd() : 0);
  const price = Math.min(LOT_MAX_PRICE, Math.max(1,
    level === 'difficile' ? Math.max(sc.prezzo + 8, Math.round(sc.prezzo * 1.6)) : level === 'medio' ? sc.prezzo + 10 : 5 + Math.floor(rnd() * 56)));
  if (qty >= 500 && postLot(g, qty, price).ok) c.log.push(`porta al fondaco ${qty} misure a ${price} scudi ogni mille`);
}

function botLend(c: BotCtx): void {
  const { g, level, rnd } = c;
  const st = ms(g), me = g.state.current, p = g.player;
  if (st.offers.some(o => o.lender === me)) return;
  // si presta solo se c'è chi può chiedere: il difficile aspetta che qualcuno sia in rosso
  const others = g.state.players.filter((_, i) => i !== me);
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
  init: (state): MercantiState => ({
    lots: [],
    offers: [],
    loans: [],
    fair: null,
    bids: state.players.map(() => 0),
    goods: state.players.map(() => []),
    mail: [],
    inbox: [],
    fairs: [],
    nextId: 1,
  }),

  onTurnStart(g) {
    const st = ms(g), me = g.state.current, p = g.player;
    if (me === 0) st.fair = isFairYear(g.state.q) ? { good: fairGood(g.state.q), host: fairHost(g.state.players) } : null;
    st.inbox = st.mail.filter(m => m.to === me).map(m => m.d);
    st.mail = st.mail.filter(m => m.to !== me);
    // il grano invenduto torna dal fondaco, meno la custodia
    for (const lot of st.lots.filter(l => l.seller === me)) {
      const lost = Math.ceil(lot.qty * LOT_CUSTODY);
      p.grano += lot.qty - lost;
      st.inbox.push({ k: 'lotBack', qty: lot.qty - lost, lost });
    }
    st.lots = st.lots.filter(l => l.seller !== me);
    for (const o of st.offers.filter(x => x.lender === me)) {
      p.scudi += o.amount;
      st.inbox.push({ k: 'offerBack', amount: o.amount });
    }
    st.offers = st.offers.filter(x => x.lender !== me);
    if (owns(st, me, 'sementi')) g.state.scalars.raccolto = INT(g.state.scalars.raccolto * (1 + SEMENTI_BONUS));
  },

  macina: g => ({ cap: MACINA_CAP_FACTOR * g.state.scalars.domanda, beyond: MACINA_BEYOND }),

  onEvent(g, _eventId, outcome) {
    const st = ms(g), me = g.state.current;
    if (outcome.choice === 'pugna' && owns(st, me, 'destrieri')) halveLosses(g.player, outcome);
    if (!outcome.choice && owns(st, me, 'reliquia')) halveLosses(g.player, outcome);
  },

  beforeYearEnd(g) {
    settleLoans(g);
    lombards(g);
  },

  usuryScale: g => (owns(ms(g), g.state.current, 'privilegio') ? 0.5 : 1),

  onYearClose: closeFair,

  botBeforeTrade(c) {
    botBid(c);
    botBorrow(c);
    botBuyLots(c);
  },

  botBeforeFeed(c, feed) {
    botSellSurplus(c, feed);
  },

  botBeforeInvest: botLend,
};
