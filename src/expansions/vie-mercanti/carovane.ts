/**
 * Le vie dei mercanti: imprevisti delle carovane. Si sorteggiano alla
 * partenza e si scoprono all'arrivo. Le perdite restano contenute (al più un
 * decimo del carico) e i ritardi di un anno: danno varietà senza scoraggiare
 * il commercio. Chi spedisce perde prestigio per ritardi e merce perduta.
 */
import { INT } from '../../domain/economy';

export type EventoViaggio = 'briganti' | 'rotture' | 'temporali' | 'ponte' | 'rapido';

/** Probabilità di ciascun imprevisto; nel resto dei casi il viaggio va liscio. */
export const VIAGGIO: Record<EventoViaggio, { p: number; perdita?: [number, number]; anni?: number }> = {
  briganti: { p: 0.1, perdita: [0.05, 0.1] },
  rotture: { p: 0.08, perdita: [0.03, 0.08] },
  temporali: { p: 0.08, anni: 1 },
  ponte: { p: 0.07, anni: 1 },
  rapido: { p: 0.07, anni: -1 },
};
export const EVENTI_VIAGGIO = Object.keys(VIAGGIO) as EventoViaggio[];

export interface Viaggio {
  /** anni effettivi del viaggio */
  anni: number;
  /** unità perdute per strada */
  perse: number;
  evento?: EventoViaggio;
}

/**
 * Sorteggia il viaggio di `qty` unità previsto in `anni` anni. Il viaggio
 * rapido accorcia solo i viaggi di almeno due anni.
 */
export function rollJourney(rnd: () => number, anni: number, qty: number): Viaggio {
  let x = rnd();
  const evento = EVENTI_VIAGGIO.find(e => (x -= VIAGGIO[e].p) < 0);
  if (!evento || (evento === 'rapido' && anni < 2)) return { anni, perse: 0 };
  const v = VIAGGIO[evento];
  const perse = v.perdita ? Math.max(1, Math.min(qty, INT(qty * (v.perdita[0] + rnd() * (v.perdita[1] - v.perdita[0]))))) : 0;
  return { anni: anni + (v.anni ?? 0), perse, evento };
}

/** La carovana è arrivata in ritardo, o con merce in meno: il venditore perde prestigio. */
export const late = (v: { evento?: EventoViaggio }) => v.evento === 'temporali' || v.evento === 'ponte';
