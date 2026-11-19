/**
 * Le ere (opzione `ere`, docs/vocazioni.md). Come nei giochi di strategia a ere:
 *
 * - Ogni era ha un tetto di botteghe: al più ERE.tetto[era] mercati e altrettanti opifici.
 * - Per passare all'era seguente servono le botteghe dell'era quasi al completo (ERE.requisito
 *   botteghe in tutto, mercati più opifici), poi si paga l'opera dell'era in scudi e grano.
 * - L'opera apre l'era nuova: più botteghe, il suo vantaggio, e il rango che sblocca. Si diventa
 *   conte solo con la prima opera, duca con la seconda, granduca con la terza, principe con la
 *   quarta; il trono le vuole tutte.
 * - Chi perde un titolo non perde le opere.
 *
 * I numeri stanno in ERE (modificabile solo dalla taratura, tools/taratura).
 */
import type { Player } from './types';

export type OperaId = 'mulino' | 'rotazione' | 'strade' | 'scriptorium';

export interface Opera {
  id: OperaId;
  nome: string;
  /** il vantaggio, per il giocatore */
  vantaggio: string;
}

export const OPERE: readonly Opera[] = [
  { id: 'mulino', nome: 'Mulino ad acqua', vantaggio: 'la macina rende un decimo in più' },
  { id: 'rotazione', nome: 'Rotazione delle colture', vantaggio: 'i campi vogliono un decimo di contadini in meno' },
  { id: 'strade', nome: 'Strade e ponti', vantaggio: 'la manutenzione degli edifici costa la metà' },
  { id: 'scriptorium', nome: 'Scriptorium e notai', vantaggio: 'i servizi della città costano un decimo in meno' },
];

/** Era più alta: tutte le opere costruite. */
export const ERA_MAX = OPERE.length;

export const ERE = {
  /** mercati (e altrettanti opifici) che si possono avere in ciascuna era, dalla prima (0) all'ultima */
  tetto: [3, 6, 10, 14, 17],
  /** botteghe (mercati più opifici) che servono nell'era per costruirne l'opera */
  requisito: [3, 10, 17, 25],
  /** costo di ciascuna opera: scudi e misure di grano */
  scudi: [1000, 8000, 40000, 120000],
  grano: [1000, 4000, 12000, 25000],
  /** vantaggi delle opere (leggeri: vantaggi più forti riaccendono la crescita esponenziale) */
  macina: 1.1,
  contadini: 0.9,
  manutenzione: 0.5,
  servizi: 0.9,
};

/** Era del signore (0 senza opere); undefined se la partita non ha le ere. */
export const eraOf = (p: Player) => p.era;
export const haEre = (p: Player) => p.era !== undefined;
/** Il signore ha costruito l'opera? (senza le ere: no) */
export const haOpera = (p: Player, id: OperaId) => p.era !== undefined && p.era > OPERE.findIndex(o => o.id === id);

/** Mercati (o opifici) che il signore può avere nella sua era; Infinity senza le ere. */
export const tettoBotteghe = (p: Player) => (p.era === undefined ? Infinity : ERE.tetto[Math.min(p.era, ERE.tetto.length - 1)]);

/** Rango massimo che l'era consente (1 messere .. 5 principe); 5 senza le ere. */
export const rangoMassimo = (p: Player) => (p.era === undefined ? 5 : Math.min(5, p.era + 1));

/** La prossima opera da costruire, o null se sono tutte fatte (o la partita non ha le ere). */
export function prossimaOpera(p: Player): (Opera & { scudi: number; grano: number; requisito: number }) | null {
  if (p.era === undefined || p.era >= ERA_MAX) return null;
  return { ...OPERE[p.era], scudi: ERE.scudi[p.era], grano: ERE.grano[p.era], requisito: ERE.requisito[p.era] };
}

/** Botteghe del signore: mercati più opifici. */
export const botteghe = (p: Player) => Math.max(0, p.mercato - 1) + Math.max(0, p.opificio - 1);

/** Si può costruire la prossima opera? Mancano botteghe, scudi o grano: il motivo. */
export function puoCostruireOpera(p: Player): { ok: true } | { ok: false; reason: string } {
  const o = prossimaOpera(p);
  if (!o) return { ok: false, reason: p.era === undefined ? 'in questa partita non ci sono le ere' : 'tutte le opere sono costruite' };
  if (botteghe(p) < o.requisito) return { ok: false, reason: `servono ${o.requisito} botteghe fra mercati e opifici (ne avete ${botteghe(p)})` };
  if (p.scudi - o.scudi < -p.credito) return { ok: false, reason: 'tesoro e credito insufficienti' };
  if (p.grano < o.grano) return { ok: false, reason: `servono ${o.grano.toLocaleString('it-IT')} misure di grano` };
  return { ok: true };
}

/** Costruisce la prossima opera: paga scudi e grano e apre l'era seguente. */
export function costruisciOpera(p: Player): { ok: true; opera: Opera } | { ok: false; reason: string } {
  const c = puoCostruireOpera(p);
  if (!c.ok) return c;
  const o = prossimaOpera(p)!;
  p.scudi -= o.scudi;
  p.grano -= o.grano;
  p.era = p.era! + 1;
  return { ok: true, opera: OPERE[p.era - 1] };
}

/** Scudi spesi nelle opere: contano nella ricchezza come gli altri dispendimenti. */
export const valoreOpere = (p: Player) => (p.era ? ERE.scudi.slice(0, p.era).reduce((a, b) => a + b, 0) : 0);

/** Vantaggi delle opere sui conti della città e della macina. */
export const fattoreMacinaOpere = (p: Player) => (haOpera(p, 'mulino') ? ERE.macina : 1);
export const fattoreContadini = (p: Player) => (haOpera(p, 'rotazione') ? ERE.contadini : 1);
export const fattoreManutenzione = (p: Player) => (haOpera(p, 'strade') ? ERE.manutenzione : 1);
export const fattoreServizi = (p: Player) => (haOpera(p, 'scriptorium') ? ERE.servizi : 1);
