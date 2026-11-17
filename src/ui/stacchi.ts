/**
 * Quale traccia breve suona sopra la musica di base (musica.ts) nella schermata del momento.
 * Tracce: requiem (morte, peste, rovina), scongiuro (sfortuna non tragica), festa (fortuna),
 * battaglia (prima dello scontro: poi festa o scongiuro secondo l'esito), sorpresa (l'inatteso),
 * gloria (incoronazione, titolo, vittoria) e intrigo (tradimenti, morti sospette, arresti).
 */
import type { FattoId } from '../domain/fatti';
import { FUGA_EVENT, RIOT_EVENT } from '../domain/gabelle';
import type { Game } from '../domain/turn';
import type { Stacco } from './musica';

/** Più tracce nella stessa schermata: suona la più forte. */
export const PRIORITA: readonly Stacco[] = ['requiem', 'sin', 'battaglia', 'intrigo', 'gloria', 'alleluia', 'scongiuro', 'sorpresa', 'festa'];

/** Dopo la distribuzione del grano: oltre questi nati suona l'alleluia; se muore qualcuno di fame, sempre il sin. */
export const ALLELUIA_NATI = 50;
export const piuForte = (xs: (Stacco | null | undefined)[]): Stacco | null =>
  PRIORITA.find(t => xs.includes(t)) ?? null;

/** Gli imprevisti, per numero: festa, sfortuna, tragedia... (le scelte e le fazioni a parte). */
const EVENTO: Record<number, Stacco> = {
  2: 'festa', // doni saraceni
  3: 'requiem', // peste
  4: 'festa', // campagna vittoriosa
  5: 'scongiuro', // alluvione
  6: 'scongiuro', // cloaca romana
  8: 'intrigo', // ciambellano infedele
  [RIOT_EVENT]: 'battaglia',
  [FUGA_EVENT]: 'scongiuro',
};

/** I fatti del reame. */
const FATTO: Record<FattoId, Stacco> = {
  piogge: 'festa', eredita: 'festa', reliquia: 'festa',
  mulino: 'sorpresa', immigrati: 'sorpresa', visitaRe: 'sorpresa', decima: 'sorpresa',
  incendio: 'scongiuro', cavallette: 'scongiuro', mulinoGuasto: 'scongiuro', muffa: 'scongiuro',
  ciambellano: 'intrigo',
};

/** Esito con il segno: guadagno o perdita. */
const segno = (o: { scudi: number; servi: number }): Stacco => (o.scudi + o.servi * 10 >= 0 ? 'festa' : 'scongiuro');

/**
 * La traccia della schermata (null: nessuna). `key` distingue i momenti: la stessa schermata ridisegnata
 * non la fa ripartire. `avviso`: la traccia dell'avviso aperto (lutto, investitura, corona...);
 * `dispacci`: quella delle notizie d'inizio turno dell'espansione.
 */
export function staccoDi(g: Game, avviso: Stacco | null = null, dispacci: Stacco | null = null): { tipo: Stacco; key: string } | null {
  const st = g.state, ph = st.phase, base = `${st.q}-${st.current}-${ph.kind}`;
  if (avviso) return { tipo: avviso, key: `${base}-avviso-${avviso}` };
  switch (ph.kind) {
    case 'evento': {
      // fazioni, tributo longobardo e briganti (pugna o riscatto): prima la battaglia, poi l'esito
      if (ph.faction || ph.eventId === 1 || ph.eventId === 7) {
        if (ph.awaitingChoice) return { tipo: 'battaglia', key: `${base}-${ph.eventId}-prima` };
        const o = ph.outcome;
        if (!o) return null;
        if ((o.pacts ?? []).some(x => x.kind === 'clausole')) return { tipo: 'intrigo', key: `${base}-${ph.eventId}-esito` };
        return { tipo: o.win === true ? 'festa' : o.win === false ? 'scongiuro' : segno(o), key: `${base}-${ph.eventId}-esito` };
      }
      const fisso = EVENTO[ph.eventId];
      if (fisso) return { tipo: fisso, key: `${base}-${ph.eventId}` };
      // imprese e carte delle espansioni: l'inatteso; le scelte (il tributo) prima sorpresa, poi l'esito
      if (ph.awaitingChoice) return { tipo: 'sorpresa', key: `${base}-${ph.eventId}-prima` };
      return ph.outcome && (ph.outcome.scudi || ph.outcome.servi)
        ? { tipo: segno(ph.outcome), key: `${base}-${ph.eventId}-esito` }
        : { tipo: 'sorpresa', key: `${base}-${ph.eventId}` };
    }
    case 'fatto':
      return { tipo: FATTO[ph.id], key: `${base}-${ph.id}` };
    case 'impresa':
      return { tipo: ph.esito === 'riuscita' ? 'festa' : 'intrigo', key: `${base}-${ph.id}` };
    case 'successione':
      return { tipo: ph.s.causa === 'faida' ? 'intrigo' : 'requiem', key: base };
    case 'arresto':
      return { tipo: ph.motivo === 'debiti' ? 'requiem' : 'intrigo', key: base };
    case 'fine':
      return { tipo: st.players[ph.winner] && !st.players[ph.winner].bot ? 'gloria' : 'requiem', key: base };
    case 'esitoNutrimento': {
      const n = st.scalars.natiMorti;
      return n < 0 ? { tipo: 'sin', key: base } : n > ALLELUIA_NATI ? { tipo: 'alleluia', key: base } : null;
    }
    case 'commercio':
      return dispacci ? { tipo: dispacci, key: `${base}-dispacci` } : null;
    default:
      return null;
  }
}
