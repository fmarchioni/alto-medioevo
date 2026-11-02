/**
 * Le vie dei mercanti: le imprese dell'espansione. Arrivano fra gli
 * imprevisti (con il mazzo) al posto delle imprese del gioco base, si tengono
 * in mano (una per tipo: se esce una carta che si ha già, quell'anno non c'è
 * imprevisto) e si giocano entro IMPRESA_DURATA anni.
 *
 * - Il vino annacquato: il vino in magazzino cresce della metà (al più 600
 *   botti). Per tre anni ogni consegna di vino alla fiera può essere scoperta
 *   (fiera.ts): niente pagamento, multa, prestigio perduto, fuori dalla fiera.
 * - Il contrabbando del Corno d'Oro: manufatti imbarcati per Costantinopoli
 *   senza dogana; dopo due anni rendono da 3 a 5 volte il prezzo di fiera,
 *   ma la nave può essere fermata, e il signore arrestato (meno con un porto).
 * - Il console comprato: alla fiera un contratto è vostro al prezzo base,
 *   qualunque cosa offrano gli altri; ma si può sapere (fiera.ts).
 * - Il fondaco del mercante fallito: vino e manufatti a 5 scudi l'unità, con
 *   una carovana da Pisa; una parte si scopre guasta all'arrivo.
 */
import { INT } from '../../domain/economy';
import { registerEvents } from '../../domain/events';
import type { Game } from '../../domain/turn';
import type { ActionResult } from '../../domain/types';
import { hasPort, travelYears } from './geografia';
import type { MerciState } from './merci';

export type ImpresaMercId = 'annacquato' | 'contrabbando' | 'console' | 'fallito';
export const IMPRESE_MERC: ImpresaMercId[] = ['annacquato', 'contrabbando', 'console', 'fallito'];
/** Identificativi degli imprevisti che portano le carte (dopo le richieste). */
export const IMPRESA_MERC_EVENT: Record<ImpresaMercId, number> = { annacquato: 121, contrabbando: 122, console: 123, fallito: 124 };
export const impresaMercOfEvent = (id: number) => IMPRESE_MERC.find(x => IMPRESA_MERC_EVENT[x] === id);

registerEvents([
  { id: IMPRESA_MERC_EVENT.annacquato, title: 'Il vino annacquato', description: 'Un oste compiacente offre di allungare il vostro vino.', effect: { kind: 'carta' } },
  { id: IMPRESA_MERC_EVENT.contrabbando, title: "Il contrabbando del Corno d'Oro", description: 'Un capitano bizantino imbarca merci senza dogana.', effect: { kind: 'carta' } },
  { id: IMPRESA_MERC_EVENT.console, title: 'Il console comprato', description: 'Il console dei mercanti forestieri si lascia comprare.', effect: { kind: 'carta' } },
  { id: IMPRESA_MERC_EVENT.fallito, title: 'Il mercante fallito', description: 'Un mercante di Pisa è fallito e svende il suo fondaco.', effect: { kind: 'carta' } },
]);

/** Anni, dopo quello in cui arriva, in cui una carta si può ancora giocare. */
export const IMPRESA_DURATA = 5;
export const IMPRESA_PESO = 1;

/** Vino annacquato: quanto ne cresce il vino, al più, e per quanti anni le consegne sono a rischio. */
export const ANNACQUA_QUOTA = 0.5;
export const ANNACQUA_MAX = 600;
export const ANNACQUA_ANNI = 3;

/** Contrabbando: manufatti imbarcati, anni di viaggio, prezzo di fiera e moltiplicatore, rischi. */
export const CONTRABBANDO_MIN = 100;
export const CONTRABBANDO_MAX = 500;
export const CONTRABBANDO_ANNI = 2;
export const CONTRABBANDO_PREZZO = 45;
export const CONTRABBANDO_MULT: [number, number] = [3, 5];
/** probabilità che la nave sia fermata (compreso l'arresto) e che il signore sia arrestato; con un porto l'arresto è a metà */
export const CONTRABBANDO_FERMATA = 0.3;
export const CONTRABBANDO_ARRESTO = 0.1;
export const CONTRABBANDO_PRESTIGIO = -20;

/** Mercante fallito: quantità di ciascuna merce, prezzo l'unità, merce guasta all'arrivo. */
export const FALLITO_QTY: [number, number] = [300, 800];
export const FALLITO_PREZZO = 5;
export const FALLITO_GUASTO: [number, number] = [0.1, 0.4];

export interface CartaMerc {
  id: ImpresaMercId;
  /** anno (q) in cui è arrivata */
  dal: number;
  /** mercante fallito: merce in vendita */
  vino?: number;
  manufatti?: number;
}

export interface Contrabbando { player: number; qty: number; arrive: number }
export interface Fallimento { player: number; vino: number; manufatti: number; arrive: number }

/** Notizie delle imprese per un signore. */
export type ImpresaDispatch =
  | { k: 'contrabbandoOk'; qty: number; gain: number }
  | { k: 'contrabbandoPreso'; qty: number; prestigio: number }
  | { k: 'fallitoArrivo'; vino: number; manufatti: number; guastoVino: number; guastoManufatti: number };

export interface ImpreseState extends MerciState {
  imprese?: CartaMerc[][];
  contrabbandi?: Contrabbando[];
  fallimenti?: Fallimento[];
  annacqua?: number[];
  /** ultimo arresto per contrabbando: chi e con quanti manufatti (per il racconto) */
  arresto?: { player: number; qty: number; q: number };
}

export const scadenzaImpresa = (c: CartaMerc) => c.dal + IMPRESA_DURATA;
export const impreseOf = (st: ImpreseState, i: number) => st.imprese?.[i] ?? [];
export const cardOf = (g: Game, st: ImpreseState, id: ImpresaMercId) => impreseOf(st, g.state.current).find(c => c.id === id && g.state.q <= scadenzaImpresa(c));

const between = (rnd: () => number, [a, b]: [number, number], step = 10) => a + step * Math.floor((rnd() * (b - a + step)) / step);

/** La carta arriva in mano (al più una per tipo). */
export function drawImpresa(g: Game, st: ImpreseState, i: number, id: ImpresaMercId, rnd: () => number): CartaMerc | null {
  const hand = (st.imprese ??= g.state.players.map(() => []))[i];
  if (hand.some(c => c.id === id)) return null;
  const c: CartaMerc = { id, dal: g.state.q, ...(id === 'fallito' ? { vino: between(rnd, FALLITO_QTY), manufatti: between(rnd, FALLITO_QTY) } : {}) };
  hand.push(c);
  return c;
}

/** Carte scadute, tolte dalla mano. */
export function expireImprese(g: Game, st: ImpreseState, i: number): ImpresaMercId[] {
  const hand = impreseOf(st, i);
  const gone = hand.filter(c => g.state.q > scadenzaImpresa(c));
  if (gone.length) st.imprese![i] = hand.filter(c => !gone.includes(c));
  return gone.map(c => c.id);
}

const open = (g: Game): ActionResult | null => {
  const k = g.state.phase.kind;
  return k === 'signori' || k === 'investimenti' ? null : { ok: false, reason: 'si gioca fra signori o nei dispendimenti' };
};

/** Toglie la carta giocata dalla mano. */
export const discard = (g: Game, st: ImpreseState, id: ImpresaMercId) => {
  const me = g.state.current;
  st.imprese![me] = impreseOf(st, me).filter(c => c.id !== id);
};

/** Il vino annacquato. */
export function waterWine(g: Game, st: ImpreseState): ActionResult & { added?: number } {
  const no = open(g);
  if (no) return no;
  if (!cardOf(g, st, 'annacquato')) return { ok: false, reason: 'non avete la carta' };
  const me = g.state.current, c = st.cantine[me];
  const added = Math.min(ANNACQUA_MAX, INT(c.vino * ANNACQUA_QUOTA));
  if (added < 1) return { ok: false, reason: 'non avete vino da allungare' };
  c.vino += added;
  (st.annacqua ??= g.state.players.map(() => -1))[me] = g.state.q + ANNACQUA_ANNI;
  discard(g, st, 'annacquato');
  return { ok: true, added };
}

/** Il contrabbando: i manufatti partono per Costantinopoli. */
export function smuggle(g: Game, st: ImpreseState, qty: number): ActionResult {
  const no = open(g);
  if (no) return no;
  if (!cardOf(g, st, 'contrabbando')) return { ok: false, reason: 'non avete la carta' };
  const me = g.state.current, c = st.cantine[me];
  if (!Number.isInteger(qty) || qty < CONTRABBANDO_MIN || qty > CONTRABBANDO_MAX) return { ok: false, reason: `si imbarcano da ${CONTRABBANDO_MIN} a ${CONTRABBANDO_MAX} manufatti` };
  if (qty > c.manufatti) return { ok: false, reason: 'non avete tanti manufatti' };
  c.manufatti -= qty;
  (st.contrabbandi ??= []).push({ player: me, qty, arrive: g.state.q + CONTRABBANDO_ANNI });
  discard(g, st, 'contrabbando');
  return { ok: true };
}

/** Probabilità d'arresto per il contrabbando: a metà per chi ha un porto. */
export const smuggleArrest = (feudo: number) => CONTRABBANDO_ARRESTO * (hasPort(feudo) ? 0.5 : 1);

/** Il mercante fallito: si paga subito, la merce arriva con la carovana da Pisa. */
export function buyBankrupt(g: Game, st: ImpreseState): ActionResult & { cost?: number; arrive?: number } {
  const no = open(g);
  if (no) return no;
  const card = cardOf(g, st, 'fallito');
  if (!card) return { ok: false, reason: 'non avete la carta' };
  const me = g.state.current, p = g.player;
  const vino = card.vino ?? 0, manufatti = card.manufatti ?? 0, cost = (vino + manufatti) * FALLITO_PREZZO;
  if (p.scudi - cost < -p.credito) return { ok: false, reason: 'tesoro e credito insufficienti' };
  p.scudi -= cost;
  const arrive = g.state.q + travelYears(p.feudo, { piazza: 'pisa' });
  (st.fallimenti ??= []).push({ player: me, vino, manufatti, arrive });
  discard(g, st, 'fallito');
  return { ok: true, cost, arrive };
}

/**
 * Inizio del turno: arrivano la merce del mercante fallito (con la parte
 * guasta) e la nave del contrabbando. Ritorna true se il signore è arrestato.
 */
export function settleImprese(g: Game, st: ImpreseState, rnd: () => number, prestige: (delta: number) => number, tell: (d: ImpresaDispatch) => void, note: (kind: string, data: Record<string, number>) => void): boolean {
  const me = g.state.current, q = g.state.q, p = g.player, c = st.cantine[me];
  for (const x of (st.fallimenti ?? []).filter(y => y.player === me && y.arrive <= q)) {
    const rot = () => FALLITO_GUASTO[0] + rnd() * (FALLITO_GUASTO[1] - FALLITO_GUASTO[0]);
    const guastoVino = INT(x.vino * rot()), guastoManufatti = INT(x.manufatti * rot());
    c.vino += x.vino - guastoVino;
    c.manufatti += x.manufatti - guastoManufatti;
    tell({ k: 'fallitoArrivo', vino: x.vino, manufatti: x.manufatti, guastoVino, guastoManufatti });
    note('bankruptIn', { vino: x.vino - guastoVino, manufatti: x.manufatti - guastoManufatti });
  }
  st.fallimenti = (st.fallimenti ?? []).filter(y => !(y.player === me && y.arrive <= q));
  let arrested = false;
  for (const x of (st.contrabbandi ?? []).filter(y => y.player === me && y.arrive <= q)) {
    const r = rnd();
    if (r < smuggleArrest(p.feudo)) {
      arrested = true;
      st.arresto = { player: me, qty: x.qty, q };
      note('smuggleArrest', { qty: x.qty });
    } else if (r < CONTRABBANDO_FERMATA) {
      tell({ k: 'contrabbandoPreso', qty: x.qty, prestigio: prestige(CONTRABBANDO_PRESTIGIO) });
      note('smuggleSeized', { qty: x.qty });
    } else {
      const mult = CONTRABBANDO_MULT[0] + rnd() * (CONTRABBANDO_MULT[1] - CONTRABBANDO_MULT[0]);
      const gain = INT(x.qty * CONTRABBANDO_PREZZO * mult);
      p.scudi += gain;
      tell({ k: 'contrabbandoOk', qty: x.qty, gain });
      note('smuggleOk', { qty: x.qty, gain });
    }
  }
  st.contrabbandi = (st.contrabbandi ?? []).filter(y => !(y.player === me && y.arrive <= q));
  return arrested;
}
