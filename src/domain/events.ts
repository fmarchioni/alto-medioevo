/**
 * Eventi casuali: righe 780-799 e tabella kj$ (righe 2800-2950).
 * Le descrizioni sono parafrasi moderne, non i testi originali; gli effetti
 * sono quelli codificati in coda alle stringhe originali.
 */
import { INT } from './economy';
import type { EventOutcome, Options, Player } from './types';
import type { Rng } from './rng';
import { applyRiot, RIOT_EVENT } from './gabelle';
import { impresaOfSlot, IMPRESE } from './imprese';

export type EventEffect =
  | { kind: 'scudi'; amount: number } // stringa terminata da "+" o "-"
  | { kind: 'serviPercent'; percent: number } // stringa terminata da "%"
  | { kind: 'scelta' } // stringa terminata da "?": pugna o riscatto
  | { kind: 'rivolta' } // riforma delle gabelle: solo con l'umore del popolo basso
  | { kind: 'fazione' } // fazioni storiche: la scelta dipende dalla fazione
  | { kind: 'impresa' }; // imprese temerarie: una carta da giocare quando si vuole

export interface RandomEvent {
  id: number;
  title: string;
  description: string;
  effect: EventEffect;
}

export const EVENTS: readonly RandomEvent[] = [
  { id: 1, title: 'Tributo longobardo', description: 'I Longobardi di Patavium pretendono un tributo.', effect: { kind: 'scelta' } },
  { id: 2, title: 'Doni saraceni', description: 'Un principe saraceno porta omaggi e una regalia.', effect: { kind: 'scudi', amount: 500 } },
  { id: 3, title: 'Peste', description: 'La peste colpisce i servi del feudo.', effect: { kind: 'serviPercent', percent: 40 } },
  { id: 4, title: 'Campagna vittoriosa', description: 'Una spedizione contro i nemici frutta un bottino.', effect: { kind: 'scudi', amount: 1000 } },
  { id: 5, title: 'Alluvione', description: 'Il fiume rompe gli argini e annega parte dei villici.', effect: { kind: 'serviPercent', percent: 10 } },
  { id: 6, title: 'Cloaca romana', description: 'La vecchia cloaca va riparata a spese del feudo.', effect: { kind: 'scudi', amount: -2000 } },
  { id: 7, title: 'Briganti', description: 'Una banda di briganti assedia il palazzo.', effect: { kind: 'scelta' } },
  { id: 8, title: 'Ciambellano infedele', description: 'Il ciambellano fugge con parte del tesoro.', effect: { kind: 'scudi', amount: -950 } },
  { id: RIOT_EVENT, title: 'Rivolta', description: 'Il popolo, stremato dalle gabelle, assalta i granai.', effect: { kind: 'rivolta' } },
  { id: 10, title: 'Franchi', description: 'Un conte franco reclama la vostra obbedienza.', effect: { kind: 'fazione' } },
  { id: 11, title: 'Ungari', description: 'Cavalieri ungari devastano le campagne.', effect: { kind: 'fazione' } },
  { id: 12, title: 'Longobardi', description: 'Il duca longobardo pretende fedeltà.', effect: { kind: 'fazione' } },
  { id: 13, title: 'Bizantini', description: 'Un governatore imperiale rivendica il territorio.', effect: { kind: 'fazione' } },
  { id: 14, title: 'Saraceni', description: "Vele saracene compaiono all'orizzonte.", effect: { kind: 'fazione' } },
  { id: IMPRESE.decime.event, title: "Le decime dell'abate", description: 'I briganti cercano un complice per assaltare il carro delle decime.', effect: { kind: 'impresa' } },
  { id: IMPRESE.commercio.event, title: 'Il commercio segreto', description: 'Mercanti senza scrupoli offrono di partecipare a un lucroso commercio segreto.', effect: { kind: 'impresa' } },
];

/** Segnaposto dell'estrazione: un attacco di una fazione (quale, lo decide il motore). */
export const ATTACK: RandomEvent = { id: 0, title: 'Attacco', description: 'Una fazione straniera si presenta ai confini.', effect: { kind: 'fazione' } };
/** Prima casella delle fazioni oltre la prima (la 1, che era dei Longobardi). */
export const ATTACK_FIRST_SLOT = 21;

/**
 * Riga 780: estrae l'indice 1..eventSlots. Consuma 1 RND. Ritorna l'evento o null (slot vuoto).
 * Con `riotSlots` > 0 le prime caselle vuote (dalla 9) diventano rivolta.
 * Con `attackSlots` (>= 0: fazioni in gioco) la casella 1 del tributo longobardo
 * e le caselle dalla 21 in poi diventano attacchi delle fazioni.
 * Con `impresa` (il signore può ricevere un'impresa temeraria) le caselle 31 e 32 le portano.
 */
export function rollEvent(rng: Rng, options: Options, riotSlots = 0, attackSlots = -1, impresa = false): RandomEvent | null {
  const kj = INT(rng.next() * options.eventSlots + 1);
  if (kj >= RIOT_EVENT && kj < RIOT_EVENT + riotSlots) return EVENTS.find(e => e.id === RIOT_EVENT)!;
  if (attackSlots >= 0) {
    if (kj === 1) return attackSlots >= 1 ? ATTACK : null;
    if (kj >= ATTACK_FIRST_SLOT && kj < ATTACK_FIRST_SLOT + attackSlots - 1) return ATTACK;
  }
  const card = impresa ? impresaOfSlot(kj) : undefined;
  if (card) return EVENTS.find(e => e.id === IMPRESE[card].event)!;
  // con i fatti del reame il ciambellano infedele diventa un fatto con una scelta: la sua casella resta vuota
  if (options.fatti && kj === 8) return null;
  return EVENTS.find(e => e.id === kj && e.effect.kind !== 'rivolta' && e.effect.kind !== 'fazione' && e.effect.kind !== 'impresa') ?? null;
}

/** Righe 785-788: effetti immediati degli eventi senza scelta. */
export function applyFixedEvent(p: Player, ev: RandomEvent): EventOutcome {
  if (ev.effect.kind === 'scudi') {
    p.scudi += ev.effect.amount;
    return { scudi: ev.effect.amount, servi: 0 };
  }
  if (ev.effect.kind === 'serviPercent') {
    const de = INT((ev.effect.percent * p.servi) / 100);
    p.servi -= de;
    return { scudi: 0, servi: -de };
  }
  if (ev.effect.kind === 'rivolta') return applyRiot(p);
  throw new Error('evento con scelta: usare resolveChoice');
}

/** Righe 790-796: pugna o riscatto. Consuma 2 RND in entrambi i casi. */
export function resolveChoice(p: Player, choice: 'pugna' | 'riscatto', rng: Rng, options: Options): EventOutcome {
  let bottino = INT(rng.next() * 1600 + 1 - 800); // -799..800
  const de = INT(rng.next() * 100 + 1 - 50); // -49..50
  if (choice === 'riscatto') {
    bottino = Math.abs(bottino);
    p.scudi -= bottino;
    return { scudi: -bottino, servi: 0, choice };
  }
  p.scudi += bottino;
  p.servi += de;
  if (options.clampServants && p.servi < 0) p.servi = 0;
  return { scudi: bottino, servi: de, choice };
}
