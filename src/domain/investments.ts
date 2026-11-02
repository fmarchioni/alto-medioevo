/** Investimenti ("dispendimenti"): righe 1700-1840. */
import type { ActionResult, Player } from './types';

export type InvestmentKind = 'terre' | 'mercato' | 'opificio' | 'palazzo' | 'granaio';

export const COSTS: Record<InvestmentKind, number> = {
  terre: 500,
  mercato: 2000,
  opificio: 5000,
  palazzo: 10000,
  // commercio del grano: ogni granaio allarga i granai del feudo (src/domain/gabelle.ts)
  granaio: 1000,
};

/** Granai che si possono costruire (solo con l'opzione `commercio`). */
export const MAX_GRANAI = 20;

export const ACRI_PER_ACQUISTO = 25;
export const MAX_ACRI = 2000;
export const MAX_PALAZZO = 11;
/** Acquisto rapido di terre: tanti acri in una volta (quattro fondi da 25). */
export const ACRI_IN_BLOCCO = 100;

/** Riga 1700: in% = INT(te-500)/500 assegnato a intero (troncamento). */
export function landBonus(p: Player): number {
  return Math.trunc(Math.floor(p.acri - 500) / 500);
}

/** Con il limite dalle terre (`Player.botteghe`): acri per ogni mercato e per ogni opificio. */
export const ACRI_PER_BOTTEGA = 100;

/**
 * Mercati (e, separatamente, opifici) che il feudo può avere. Con il limite
 * dalle terre: uno ogni 100 acri. Nel listato: 19 + in%, quindi 19 già con i
 * 500 acri iniziali e uno in più ogni 500 acri.
 */
export function maxBotteghe(p: Player): number {
  return p.botteghe ? Math.floor(p.acri / ACRI_PER_BOTTEGA) : 19 + landBonus(p);
}

/** Acri che servono per tenere i mercati e gli opifici posseduti. */
export function acriPerBotteghe(p: Player): number {
  const most = Math.max(p.mercato, p.opificio) - 1;
  return p.botteghe ? most * ACRI_PER_BOTTEGA : 500 + 500 * Math.max(0, most - 19);
}

/** Spazio per altri mercati o opifici (può essere negativo dopo un pignoramento di terre). */
export const roomFor = (p: Player, kind: 'mercato' | 'opificio') => maxBotteghe(p) - ((kind === 'mercato' ? p.mercato : p.opificio) - 1);

/**
 * Limiti delle righe 1725-1820. Nel listato mercato e opificio si bloccano
 * quando il livello è *uguale* a 20 + in% (confronto di uguaglianza): chi
 * perde terre e resta sopra il limite non trova più alcun limite. Con il
 * limite dalle terre si confronta con "almeno".
 */
export function canInvest(p: Player, kind: InvestmentKind): ActionResult {
  const inBonus = landBonus(p);
  if (p.scudi - COSTS[kind] < -p.credito) return { ok: false, reason: 'tesoro e credito insufficienti' };
  switch (kind) {
    case 'terre':
      if (p.acri === MAX_ACRI) return { ok: false, reason: `massimo ${MAX_ACRI} acri` };
      break;
    case 'mercato':
      if (p.botteghe ? roomFor(p, kind) <= 0 : p.mercato === 20 + inBonus) return { ok: false, reason: 'servono più terre per altri mercati' };
      break;
    case 'opificio':
      if (p.botteghe ? roomFor(p, kind) <= 0 : p.opificio === 20 + inBonus) return { ok: false, reason: 'servono più terre per altri opifici' };
      break;
    case 'palazzo':
      if (p.palazzo === MAX_PALAZZO) return { ok: false, reason: 'palazzo completo' };
      break;
    case 'granaio':
      if (p.granai === undefined) return { ok: false, reason: 'in questa partita non si costruiscono granai' };
      if (p.granai >= MAX_GRANAI) return { ok: false, reason: `al più ${MAX_GRANAI} granai` };
      break;
  }
  return { ok: true };
}

export function invest(p: Player, kind: InvestmentKind): ActionResult {
  const check = canInvest(p, kind);
  if (!check.ok) return check;
  p.scudi -= COSTS[kind];
  if (kind === 'terre') p.acri += ACRI_PER_ACQUISTO;
  else if (kind === 'mercato') p.mercato += 1;
  else if (kind === 'opificio') p.opificio += 1;
  else if (kind === 'granaio') p.granai = (p.granai ?? 0) + 1;
  else p.palazzo += 1;
  return { ok: true };
}

/**
 * Più acquisti dello stesso bene in una volta (per ora le terre a blocchi):
 * tutti o nessuno, entro i limiti del bene (al più MAX_ACRI) e il credito.
 */
export function canInvestTimes(p: Player, kind: InvestmentKind, times: number): ActionResult {
  const one = canInvest(p, kind);
  if (!one.ok) return one;
  if (kind === 'terre' && p.acri + times * ACRI_PER_ACQUISTO > MAX_ACRI) return { ok: false, reason: `si arriva al più a ${MAX_ACRI} acri` };
  if (p.scudi - times * COSTS[kind] < -p.credito) return { ok: false, reason: 'tesoro e credito insufficienti' };
  return { ok: true };
}
