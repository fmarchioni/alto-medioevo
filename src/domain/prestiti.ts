/**
 * Prestiti di casata (Dinastia, con un'espansione). La casata madre e i suoi rami cadetti, finché il
 * vincolo tiene, si chiedono a vicenda un prestito senza interesse, da rendere entro PRESTITO_ANNI anni:
 * scudi, e i beni dell'espansione (vino e manufatti nelle Vie dei mercanti, soldati in Spade e castelli).
 *
 * - Si chiede al più due anni della propria produzione (gli scudi: due anni di rendita), e non più di
 *   quanto l'altro ha; un prestito solo per vincolo, e una richiesta l'anno.
 * - Chi presta risponde nel suo turno (il computer subito): se chi chiede gioca prima, la risposta arriva
 *   nell'anno stesso; se gioca dopo, all'inizio dell'anno seguente.
 * - Ogni rifiuto rischia di rompere il vincolo: 25% al primo, 50% al secondo, 75% al terzo, sempre al
 *   quarto. Un prestito concesso fa dimenticare due rifiuti (mai sotto zero).
 * - Alla scadenza il prestito si rende da solo, all'inizio del turno del debitore. Se non basta, il
 *   vincolo si rompe.
 * - Rompere il vincolo: il ramo esce dalla casata (non è più parente, il suo prestigio non va più alla
 *   casata madre) e l'offeso ha un casus belli, come per un ripudio: in Spade e castelli vale un assalto subito.
 */
import { casaMadre, dinastiaRandom, ramiDi, type DinastiaState } from './dinastia';
import { CASUS_ANNI } from './famiglia';
import type { Game } from './turn';
import type { BotLevel, GameState } from './types';

export type BeneCasata = 'scudi' | 'vino' | 'manufatti' | 'soldati';
export const PRESTITO_ANNI = 3;
/** il limite di una richiesta: anni della produzione (o della rendita) di chi chiede */
export const ANNI_LIMITE = 2;
export const SCUDI_LIMITE_MIN = 500;
/** probabilità che un rifiuto rompa il vincolo, per ogni rifiuto nel conto */
export const ROTTURA_RIFIUTO = 0.25;
/** rifiuti dimenticati con un prestito concesso */
export const RIFIUTI_PERDONATI = 2;

export interface PrestitoCasata { id: number; da: number; a: number; bene: BeneCasata; qty: number; dal: number; entro: number }
export interface RichiestaCasata { id: number; da: number; a: number; bene: BeneCasata; qty: number; q: number }

/** Notizie dei prestiti di casata, consegnate con i dispacci dell'espansione. `con`: l'altra casata. */
export type DispaccioCasata =
  | { k: 'concesso'; con: number; bene: BeneCasata; qty: number; entro: number }
  | { k: 'negato'; con: number; bene: BeneCasata; qty: number; rotto: boolean }
  /** debitore: chi lo legge è chi ha reso */
  | { k: 'reso'; con: number; bene: BeneCasata; qty: number; debitore: boolean }
  | { k: 'mancato'; con: number; bene: BeneCasata; qty: number; resi: number; debitore: boolean };

/** Quello che l'espansione presta oltre agli scudi (ExpansionRules.prestiti). */
export interface BeniCasata {
  beni: readonly BeneCasata[];
  /** quanto ne ha il signore i (da prestare, o da rendere) */
  ha(g: Game, i: number, bene: BeneCasata): number;
  /** il massimo che `chi` può chiedere ad `a` (prima di guardare quanto `a` ne ha) */
  limite(g: Game, chi: number, a: number, bene: BeneCasata): number;
  sposta(g: Game, da: number, a: number, bene: BeneCasata, qty: number): void;
  /** notizia per il signore `to`, all'inizio del suo turno */
  dispaccio(g: Game, to: number, d: DispaccioCasata): void;
  /** signori del computer: che cosa manca al signore i (null: niente) */
  bisogno?(g: Game, i: number): { bene: BeneCasata; qty: number } | null;
}

const NOMI: Record<BeneCasata, [string, string]> = {
  scudi: ['scudo', 'scudi'], vino: ['botte di vino', 'botti di vino'], manufatti: ['manufatto', 'manufatti'], soldati: ['soldato', 'soldati'],
};
export const quantoBene = (bene: BeneCasata, qty: number) => `${Math.round(qty).toLocaleString('it-IT')} ${NOMI[bene][qty === 1 ? 0 : 1]}`;
export const nomeBene = (bene: BeneCasata) => NOMI[bene][1];

// ---------------------------------------------------------------- il vincolo

/** Il legame fra i e j: il ramo cadetto, se uno è ramo dell'altro e il vincolo tiene. */
function ramoFra(d: DinastiaState, i: number, j: number) {
  if (casaMadre(d, i) === j) return d.casate[i].ramo!;
  if (casaMadre(d, j) === i) return d.casate[j].ramo!;
  return null;
}

/** Le casate legate a i dal vincolo e ancora in gioco: la casata madre, poi i rami. */
export function casateDelVincolo(st: GameState, i: number): number[] {
  const d = st.dinastia;
  if (!d) return [];
  const madre = casaMadre(d, i);
  return [...(madre !== null ? [madre] : []), ...ramiDi(d, i)].filter(j => st.players[j]?.caduto === undefined);
}

/** Rifiuti nel conto del vincolo fra i e j. */
export const rifiutiFra = (d: DinastiaState, i: number, j: number) => ramoFra(d, i, j)?.rifiuti ?? 0;
/** Probabilità che il prossimo rifiuto rompa il vincolo. */
export const rischioRottura = (d: DinastiaState, i: number, j: number) => Math.min(1, ROTTURA_RIFIUTO * (rifiutiFra(d, i, j) + 1));

/**
 * Rompe il vincolo fra il ramo e la casata madre: il ramo esce dalla casata, e `offeso` ha un casus
 * belli contro `offensore` (in Spade e castelli conta come un assalto subito).
 */
export function rompiVincolo(g: Game, offeso: number, offensore: number): void {
  const st = g.state, d = st.dinastia!, r = ramoFra(d, offeso, offensore);
  if (!r) return;
  r.rotto = st.q;
  (d.casus ??= []).push({ da: offeso, contro: offensore, fino: st.q + CASUS_ANNI - 1 });
  d.richiesteCasata = (d.richiesteCasata ?? []).filter(x => !((x.da === offeso && x.a === offensore) || (x.da === offensore && x.a === offeso)));
  g.note(offeso, { t: 'famiglia', k: 'vincolo', chi: st.players[offensore].name, casa: offensore, esito: 'offeso' });
  g.note(offensore, { t: 'famiglia', k: 'vincolo', chi: st.players[offeso].name, casa: offeso, esito: 'offensore' });
}

// ---------------------------------------------------------------- beni e limiti

/** I beni che si possono chiedere in prestito (nessuno: niente prestiti di casata). */
export function beniCasata(g: Game): BeneCasata[] {
  const h = g.rules?.prestiti;
  return g.state.dinastia?.persone && h ? ['scudi', ...h.beni] : [];
}

export function haBene(g: Game, i: number, bene: BeneCasata): number {
  if (bene === 'scudi') return Math.max(0, Math.floor(g.state.players[i].scudi));
  return Math.max(0, Math.floor(g.rules?.prestiti?.ha(g, i, bene) ?? 0));
}

/** Quanto il signore i può rendere: gli scudi si prelevano anche a credito, come ogni spesa; merci e soldati solo se ci sono. */
function daRendere(g: Game, i: number, bene: BeneCasata): number {
  const p = g.state.players[i];
  return bene === 'scudi' ? Math.max(0, Math.floor(p.scudi + (p.credito ?? 0))) : haBene(g, i, bene);
}

/** Rendita dell'ultimo anno incassato dal signore i (0 se non ne ha ancora). */
function ultimaRendita(st: GameState, i: number): number {
  const e = [...(st.chronicle ?? [])].reverse().find(x => x.player === i && x.fact.t === 'income');
  return e?.fact.t === 'income' ? Math.max(0, e.fact.amount) : 0;
}

/** Il limite di una richiesta di `chi` ad `a`: due anni della sua produzione o della sua rendita. */
export function limiteRichiesta(g: Game, chi: number, a: number, bene: BeneCasata): number {
  if (bene === 'scudi') return Math.max(SCUDI_LIMITE_MIN, ANNI_LIMITE * ultimaRendita(g.state, chi));
  return Math.max(0, Math.floor(g.rules?.prestiti?.limite(g, chi, a, bene) ?? 0));
}

/** Quanto `chi` può chiedere ad `a`: il limite, se `a` ne ha abbastanza. */
export const massimoRichiesta = (g: Game, chi: number, a: number, bene: BeneCasata) => Math.min(limiteRichiesta(g, chi, a, bene), haBene(g, a, bene));

function sposta(g: Game, da: number, a: number, bene: BeneCasata, qty: number): void {
  if (!qty) return;
  if (bene === 'scudi') {
    g.state.players[da].scudi -= qty;
    g.state.players[a].scudi += qty;
  } else g.rules!.prestiti!.sposta(g, da, a, bene, qty);
}

/** La notizia va a un giocatore; chi la riceve nel suo turno l'ha già vista sulla pagina. */
function avvisa(g: Game, to: number, d: DispaccioCasata, ancheDiTurno = false): void {
  if (g.state.players[to].bot || (to === g.state.current && !ancheDiTurno)) return;
  g.rules?.prestiti?.dispaccio(g, to, d);
}

// ---------------------------------------------------------------- richieste

export const prestitoFra = (d: DinastiaState, i: number, j: number) => (d.prestiti ?? []).find(x => (x.da === i && x.a === j) || (x.da === j && x.a === i));
export const richiestaFra = (d: DinastiaState, i: number, j: number) => (d.richiesteCasata ?? []).find(x => (x.da === i && x.a === j) || (x.da === j && x.a === i));
/** Scudi che il signore i deve rendere alla casata madre o a un ramo. */
export const debitoCasata = (st: GameState, i: number) => (st.dinastia?.prestiti ?? []).filter(x => x.a === i && x.bene === 'scudi').reduce((s, x) => s + x.qty, 0);
export const richiesteA = (d: DinastiaState, i: number) => (d.richiesteCasata ?? []).filter(x => x.a === i);

/** Perché `chi` non può chiedere ad `a` qty di bene (null: può). */
export function bloccoRichiesta(g: Game, chi: number, a: number, bene: BeneCasata, qty: number): string | null {
  const st = g.state, d = st.dinastia;
  if (!d || !beniCasata(g).includes(bene)) return 'questo non si chiede in prestito';
  const r = ramoFra(d, chi, a);
  if (!r || st.players[a]?.caduto !== undefined) return 'si chiede solo fra casata madre e rami cadetti, finché il vincolo tiene';
  if (prestitoFra(d, chi, a)) return "c'è già un prestito fra voi: prima va reso";
  if (richiestaFra(d, chi, a)) return "c'è già una richiesta in attesa di risposta";
  if (r.chiesto === st.q) return "quest'anno fra voi si è già chiesto un prestito";
  const max = massimoRichiesta(g, chi, a, bene);
  if (max <= 0) return limiteRichiesta(g, chi, a, bene) <= 0 ? `non producete ${nomeBene(bene)}: non potreste renderli` : `${st.players[a].name} non ha ${nomeBene(bene)} da prestare`;
  if (!Number.isInteger(qty) || qty <= 0) return 'scrivete quanto chiedete';
  if (qty > max) return `potete chiedere al più ${quantoBene(bene, max)}`;
  return null;
}

export interface EsitoRichiesta { answered: boolean; accepted?: boolean; rotto?: boolean }

/** Il signore di turno chiede un prestito ad `a`: il computer risponde subito, un giocatore nel suo turno. */
export function chiediPrestito(g: Game, a: number, bene: BeneCasata, qty: number): { ok: false; reason: string } | ({ ok: true } & EsitoRichiesta) {
  const st = g.state, d = st.dinastia!, me = st.current;
  const b = bloccoRichiesta(g, me, a, bene, qty);
  if (b) return { ok: false, reason: b };
  ramoFra(d, me, a)!.chiesto = st.q;
  const req: RichiestaCasata = { id: (d.nextId = (d.nextId ?? 0) + 1), da: me, a, bene, qty, q: st.q };
  const lender = st.players[a];
  if (!lender.bot) {
    (d.richiesteCasata ??= []).push(req);
    return { ok: true, answered: false };
  }
  const si = accettaBot(g, req, lender.bot);
  return { ok: true, ...esito(g, req, si) };
}

/** Il signore di turno risponde a una richiesta ricevuta. */
export function rispondiPrestito(g: Game, id: number, si: boolean): { ok: false; reason: string } | ({ ok: true } & EsitoRichiesta) {
  const d = g.state.dinastia!, req = (d.richiesteCasata ?? []).find(x => x.id === id && x.a === g.state.current);
  if (!req) return { ok: false, reason: 'nessuna richiesta di prestito' };
  if (si && haBene(g, req.a, req.bene) < req.qty) return { ok: false, reason: `non avete ${quantoBene(req.bene, req.qty)} da prestare` };
  return { ok: true, ...esito(g, req, si) };
}

function esito(g: Game, req: RichiestaCasata, si: boolean): EsitoRichiesta {
  const st = g.state, d = st.dinastia!, q = st.q;
  d.richiesteCasata = (d.richiesteCasata ?? []).filter(x => x.id !== req.id);
  const r = ramoFra(d, req.da, req.a);
  if (!r || st.players[req.da].caduto !== undefined || st.players[req.a].caduto !== undefined) return { answered: true, accepted: false };
  if (si && haBene(g, req.a, req.bene) >= req.qty) {
    sposta(g, req.a, req.da, req.bene, req.qty);
    const p: PrestitoCasata = { id: req.id, da: req.a, a: req.da, bene: req.bene, qty: req.qty, dal: q, entro: q + PRESTITO_ANNI };
    (d.prestiti ??= []).push(p);
    r.rifiuti = Math.max(0, (r.rifiuti ?? 0) - RIFIUTI_PERDONATI);
    g.note(req.da, { t: 'famiglia', k: 'prestito', chi: st.players[req.a].name, casa: req.a, bene: req.bene, qty: req.qty, esito: 'concesso' });
    g.note(req.a, { t: 'famiglia', k: 'prestito', chi: st.players[req.da].name, casa: req.da, bene: req.bene, qty: req.qty, esito: 'prestato' });
    avvisa(g, req.da, { k: 'concesso', con: req.a, bene: req.bene, qty: req.qty, entro: p.entro });
    return { answered: true, accepted: true };
  }
  const prob = rischioRottura(d, req.da, req.a);
  r.rifiuti = (r.rifiuti ?? 0) + 1;
  const rotto = dinastiaRandom(d) < prob;
  g.note(req.da, { t: 'famiglia', k: 'prestito', chi: st.players[req.a].name, casa: req.a, bene: req.bene, qty: req.qty, esito: 'negato' });
  if (rotto) rompiVincolo(g, req.da, req.a);
  avvisa(g, req.da, { k: 'negato', con: req.a, bene: req.bene, qty: req.qty, rotto });
  return { answered: true, accepted: false, rotto };
}

// ---------------------------------------------------------------- scadenze

/**
 * Inizio del turno: i prestiti del signore di turno arrivati a scadenza si rendono da soli, con quello
 * che c'è. Se non basta, il vincolo si rompe e chi ha prestato tiene quanto ha avuto.
 */
export function scadenzePrestiti(g: Game): void {
  const st = g.state, d = st.dinastia, me = st.current;
  if (!d?.prestiti?.length) return;
  // chi è uscito di scena non rende e non riscuote
  d.prestiti = d.prestiti.filter(x => st.players[x.da]?.caduto === undefined && st.players[x.a]?.caduto === undefined);
  for (const x of d.prestiti.filter(y => y.a === me && y.entro <= st.q)) {
    d.prestiti = d.prestiti.filter(y => y !== x);
    const resi = Math.min(x.qty, daRendere(g, me, x.bene));
    sposta(g, me, x.da, x.bene, resi);
    if (resi === x.qty) {
      g.note(me, { t: 'famiglia', k: 'prestito', chi: st.players[x.da].name, casa: x.da, bene: x.bene, qty: x.qty, esito: 'reso' });
      avvisa(g, me, { k: 'reso', con: x.da, bene: x.bene, qty: x.qty, debitore: true }, true);
      avvisa(g, x.da, { k: 'reso', con: me, bene: x.bene, qty: x.qty, debitore: false });
      continue;
    }
    g.note(me, { t: 'famiglia', k: 'prestito', chi: st.players[x.da].name, casa: x.da, bene: x.bene, qty: x.qty, esito: 'mancato' });
    rompiVincolo(g, x.da, me);
    avvisa(g, me, { k: 'mancato', con: x.da, bene: x.bene, qty: x.qty, resi, debitore: true }, true);
    avvisa(g, x.da, { k: 'mancato', con: me, bene: x.bene, qty: x.qty, resi, debitore: false });
  }
}

// ---------------------------------------------------------------- signori del computer

/**
 * Un signore del computer davanti a una richiesta: dice di no se non ha il bene. Il facile presta quasi
 * sempre; il medio volentieri; il difficile aiuta i suoi rami (il loro prestigio è suo), meno la casata
 * madre. Più rifiuti ci sono nel conto, più si teme di rompere il vincolo.
 */
export function accettaBot(g: Game, req: RichiestaCasata, level: BotLevel): boolean {
  const d = g.state.dinastia!;
  if (haBene(g, req.a, req.bene) < req.qty) return false;
  const base = level === 'facile' ? 0.85 : level === 'medio' ? 0.65 : casaMadre(d, req.da) === req.a ? 0.7 : 0.4;
  return dinastiaRandom(d) < Math.min(0.95, base + 0.1 * rifiutiFra(d, req.da, req.a));
}

/** Il signore del computer di turno chiede un prestito, se gli manca qualcosa. */
export function botPrestiti(g: Game, level: BotLevel): string | null {
  const st = g.state, d = st.dinastia, me = st.current, p = st.players[me];
  if (!d || !beniCasata(g).length) return null;
  // richieste rimaste in attesa (es. da un salvataggio in cui il signore era di un giocatore): risponde subito
  for (const req of richiesteA(d, me)) esito(g, req, accettaBot(g, req, level));
  const kin = casateDelVincolo(st, me);
  if (!kin.length) return null;
  // scudi solo per un debito ancora dentro il credito (e che la rendita di un anno ripaga): si renderanno alla scadenza
  const debito = p.scudi < 0 && -p.scudi <= Math.min(p.credito ?? 0, ultimaRendita(st, me)) ? { bene: 'scudi' as const, qty: Math.ceil(-p.scudi) } : null;
  const need = debito ?? g.rules?.prestiti?.bisogno?.(g, me) ?? null;
  if (!need || dinastiaRandom(d) > (level === 'facile' ? 0.3 : level === 'medio' ? 0.5 : 0.6)) return null;
  for (const a of kin) {
    const qty = Math.min(need.qty, massimoRichiesta(g, me, a, need.bene));
    if (qty <= 0 || bloccoRichiesta(g, me, a, need.bene, qty)) continue;
    const r = chiediPrestito(g, a, need.bene, qty);
    if (r.ok) return `chiede in prestito ${quantoBene(need.bene, qty)} a ${st.players[a].name}${r.answered ? (r.accepted ? '' : ' (negato)') : ' (in attesa)'}`;
  }
  return null;
}
