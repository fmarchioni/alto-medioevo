/**
 * Carte di guerra di "Spade e Castelli": il mazzo dell'espansione. Arrivano
 * fra gli imprevisti (solo con il mazzo degli imprevisti), si tengono in mano
 * (una per tipo, anche tutte e tre) e se ne gioca al più una per turno, entro
 * CARTA_DURATA anni da quello in cui arrivano.
 *
 * - Mercenari: da 300 a 1000 uomini, pagati quando si assoldano. Restano nel
 *   fortino a difesa, o partono con l'esercito; le spie non li vedono. Dopo la
 *   loro prima battaglia se ne vanno, e se non combattono se ne vanno alla
 *   scadenza della carta.
 * - Il traditore: aprirà una porta del feudo nemico al prossimo assalto di un
 *   vostro esercito (in marcia o all'assedio): il nemico combatte con
 *   TRADITORE_MURA cerchie in meno. Ma una volta su quattro fa il doppio gioco:
 *   le porte nemiche restano chiuse e, al primo assalto al vostro feudo, apre
 *   le vostre. Non lo si sa finché non succede.
 * - Tregua di Dio: per l'anno in cui la si invoca nessuno combatte contro il
 *   vostro feudo. Gli eserciti in arrivo si fermano un anno, l'assedio non dà
 *   l'assalto (ma il campo continua ad ammalarsi).
 *
 * Solo stato e regole delle carte; battaglie e assedi le applicano in rules.ts.
 */
import { INT } from '../../domain/economy';
import { registerEvents } from '../../domain/events';
import type { Game } from '../../domain/turn';
import type { SpadeState } from './rules';

export type CartaId = 'mercenari' | 'traditore' | 'tregua';

/** Identificativi degli imprevisti che portano le carte (dopo quelli del gioco base). */
export const CARTA_EVENT: Record<CartaId, number> = { mercenari: 101, traditore: 102, tregua: 103 };
export const CARTE_ID: CartaId[] = ['mercenari', 'traditore', 'tregua'];
export const cartaOfEvent = (id: number) => CARTE_ID.find(c => CARTA_EVENT[c] === id);

registerEvents([
  { id: CARTA_EVENT.mercenari, title: 'Mercenari', description: 'Una compagnia di ventura offre le sue spade.', effect: { kind: 'carta' } },
  { id: CARTA_EVENT.traditore, title: 'Il traditore', description: 'Un uomo di un feudo nemico offre di aprire una porta.', effect: { kind: 'carta' } },
  { id: CARTA_EVENT.tregua, title: 'Tregua di Dio', description: 'Il vescovo è pronto a imporre la pace di Dio.', effect: { kind: 'carta' } },
]);

/** Anni, dopo quello in cui arriva, in cui una carta si può ancora giocare. */
export const CARTA_DURATA = 5;
/** Peso di ciascuna carta nel mazzo (come un imprevisto semplice). */
export const CARTA_PESO = 1;
export const MERC_MIN = 300;
export const MERC_MAX = 1000;
/** Paga di un mercenario, scudi, versata quando la compagnia si assolda. */
export const MERC_PAGA = 3;
/** Cerchie di mura che il traditore apre (al nemico, o a voi se fa il doppio gioco). */
export const TRADITORE_MURA = 2;
/** Probabilità che il traditore faccia il doppio gioco. */
export const DOPPIO_GIOCO = 0.25;

export interface CartaGuerra {
  id: CartaId;
  /** anno (q) in cui è arrivata */
  dal: number;
  /** mercenari: uomini della compagnia */
  n?: number;
  /** traditore: fa il doppio gioco (segreto) */
  doppio?: boolean;
}

/** Ultimo anno (q) in cui la carta si può giocare. */
export const scadenzaCarta = (c: CartaGuerra) => c.dal + CARTA_DURATA;

export const handOf = (st: SpadeState, i: number): CartaGuerra[] => st.carte?.[i] ?? [];
export const cardOf = (st: SpadeState, i: number, id: CartaId) => handOf(st, i).find(c => c.id === id);

/** Il signore ha già giocato una carta quest'anno. */
export const playedThisYear = (g: Game, st: SpadeState, i: number) => st.giocata?.[i] === g.state.q;

/** Mercenari nel fortino del signore `i` (0 se non ne ha o se ne sono andati). */
export const mercsOf = (g: Game, st: SpadeState, i: number) => {
  const m = st.mercenari?.[i];
  return m && m.until >= g.state.q ? m.n : 0;
};

/** Il signore `i` ha invocato la tregua di Dio per l'anno in corso. */
export const truceOn = (g: Game, st: SpadeState, i: number) => st.tregue?.[i] === g.state.q;

/** Mette in mano la carta; il traditore decide subito, in segreto, se farà il doppio gioco. */
export function drawCard(g: Game, st: SpadeState, i: number, id: CartaId, rnd: () => number): CartaGuerra {
  const c: CartaGuerra = { id, dal: g.state.q };
  if (id === 'mercenari') c.n = MERC_MIN + 10 * INT(rnd() * ((MERC_MAX - MERC_MIN) / 10 + 1));
  if (id === 'traditore') c.doppio = rnd() < DOPPIO_GIOCO;
  const all = (st.carte ??= g.state.players.map(() => []));
  all[i] = [...(all[i] ?? []).filter(x => x.id !== id), c];
  // il doppiogiochista è già al lavoro: aprirà le porte al primo assalto, finché la carta vale
  if (c.doppio) (st.serpi ??= []).push({ owner: i, until: scadenzaCarta(c) });
  return c;
}

/** Toglie la carta dalla mano (giocata o scaduta). */
export function discard(st: SpadeState, i: number, id: CartaId): void {
  if (st.carte?.[i]) st.carte[i] = st.carte[i].filter(c => c.id !== id);
}

/** Inizio del turno: le carte scadute si perdono, i mercenari a fine ingaggio se ne vanno. */
export function expireCards(g: Game, st: SpadeState, i: number): CartaId[] {
  const q = g.state.q;
  const gone = handOf(st, i).filter(c => q > scadenzaCarta(c)).map(c => c.id);
  for (const id of gone) discard(st, i, id);
  if (st.mercenari?.[i] && st.mercenari[i]!.until < q) st.mercenari[i] = null;
  if (st.serpi) st.serpi = st.serpi.filter(s => s.until >= q);
  return gone;
}

/**
 * Traditori in gioco per un assalto di `attacker` al feudo di `target`:
 * quello giocato da chi attacca (consumato; aiuta solo se non fa il doppio gioco)
 * e il doppiogiochista di chi difende (consumato: apre le porte).
 */
export function traitorsAt(g: Game, st: SpadeState, attacker: number, target: number): { help: boolean; played: boolean; betrayed: boolean } {
  const t = (st.traditori ?? []).find(x => x.owner === attacker && x.target === target);
  if (t) st.traditori = st.traditori!.filter(x => x !== t);
  const s = (st.serpi ?? []).find(x => x.owner === target && x.until >= g.state.q);
  if (s) {
    st.serpi = st.serpi!.filter(x => x !== s);
    // svelato: il traditore non è più nella mano di chi lo teneva
    discard(st, target, 'traditore');
    st.traditori = (st.traditori ?? []).filter(x => x.owner !== target);
  }
  return { help: !!t && !t.doppio, played: !!t, betrayed: !!s };
}
