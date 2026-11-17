/**
 * Quale effetto sonoro (suoni.ts) accompagna la schermata del momento: l'incendio crepita, l'alluvione
 * scroscia, gli Ungari arrivano al galoppo... Suona all'apertura della schermata, insieme alla traccia
 * breve della musica (stacchi.ts). La stessa schermata ridisegnata non lo fa ripartire (`key`).
 */
import type { FattoId } from '../domain/fatti';
import type { FactionId } from '../domain/fazioni';
import { FUGA_EVENT, RIOT_EVENT } from '../domain/gabelle';
import type { Game } from '../domain/turn';
import type { Suono } from './suoni';

/** Gli imprevisti, per numero. */
const EVENTO: Record<number, Suono> = {
  3: 'tosse', // peste
  5: 'alluvione',
  6: 'crollo', // cloaca romana
  7: 'colpi', // briganti alle porte del palazzo
  8: 'porta', // il ciambellano fugge
  [RIOT_EVENT]: 'folla',
  [FUGA_EVENT]: 'porta',
};

/** Le fazioni arrivano: i Franchi, i Longobardi e i Bizantini col corno, gli Ungari al galoppo, i Saraceni dal mare. */
const FAZIONE: Record<FactionId, Suono> = { franchi: 'corno', longobardi: 'corno', bizantini: 'corno', ungari: 'cavalli', saraceni: 'onde' };

/** I fatti del reame. */
const FATTO: Partial<Record<FattoId, Suono>> = {
  incendio: 'fuoco', piogge: 'pioggia', cavallette: 'mosche', muffa: 'mosche',
  mulino: 'mulino', mulinoGuasto: 'mulino', reliquia: 'campane', visitaRe: 'corno',
};

/** L'effetto della schermata (null: nessuno). */
export function effettoDi(g: Game): { suono: Suono; key: string } | null {
  const st = g.state, ph = st.phase, base = `${st.q}-${st.current}-${ph.kind}`;
  switch (ph.kind) {
    case 'evento': {
      if (ph.faction) {
        // prima l'arrivo; poi, se si è combattuto, le spade
        if (ph.awaitingChoice) return { suono: FAZIONE[ph.faction] ?? 'corno', key: `${base}-${ph.eventId}-prima` };
        return ph.outcome?.win !== undefined ? { suono: 'spade', key: `${base}-${ph.eventId}-esito` } : null;
      }
      if (ph.eventId === 7 && !ph.awaitingChoice) return ph.outcome?.win !== undefined ? { suono: 'spade', key: `${base}-7-esito` } : null;
      const s = EVENTO[ph.eventId];
      return s ? { suono: s, key: `${base}-${ph.eventId}${ph.awaitingChoice ? '-prima' : ''}` } : null;
    }
    case 'fatto': {
      const s = FATTO[ph.id];
      return s ? { suono: s, key: `${base}-${ph.id}` } : null;
    }
    case 'successione':
      return { suono: 'campane', key: base };
    case 'arresto':
      return { suono: 'metallo', key: base };
    default:
      return null;
  }
}
