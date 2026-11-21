/**
 * Il saldo dei cittadini (opzione `migrazioni`): a fine anno, secondo come va il feudo, nuove
 * famiglie arrivano in città o se ne vanno. Il saldo va da −MIGRAZIONI.massimo a +MIGRAZIONI.massimo
 * servi e non usa numeri a sorte (la sequenza RND del motore non cambia).
 *
 * Ogni voce dà dei punti fra −peso e +peso; il saldo è la somma dei punti divisa per la somma dei
 * pesi delle voci in gioco, per MIGRAZIONI.massimo. Così con tutte le voci al meglio arrivano
 * MIGRAZIONI.massimo servi, con tutte al peggio ne partono altrettanti, qualunque siano le espansioni.
 *
 * - umore del popolo (peso 2): da −2 con l'umore a 0 a +2 con l'umore a 100;
 * - annata (peso 1): +1 buona, −1 carestia;
 * - le espansioni aggiungono le loro voci (ExpansionRules.migrazione): la fiducia dei mercanti con
 *   le Vie dei mercanti, gli assalti subiti e gli anni di pace con Spade e Castelli.
 */
import type { Player, Scalars } from './types';

export const MIGRAZIONI = {
  /** servi che arrivano (o partono) a fine anno con tutte le voci al meglio (o al peggio) */
  massimo: 100,
};

export interface VoceMigrazione {
  /** nome della voce, per il giocatore */
  voce: string;
  /** punti della voce, fra −peso e +peso */
  punti: number;
  /** peso della voce: il massimo dei punti che può dare */
  peso: number;
}

/** Da un valore 0..100 (umore, fiducia) a punti fra −peso e +peso: 50 vale zero. */
export const daCento = (v: number, peso: number) => (peso * (Math.max(0, Math.min(100, v)) - 50)) / 50;

/** Le voci del gioco base: umore del popolo e annata. */
export function vociBase(p: Player, sc: Scalars): VoceMigrazione[] {
  const voci: VoceMigrazione[] = [];
  if (p.umore !== undefined) voci.push({ voce: 'umore del popolo', punti: daCento(p.umore, 2), peso: 2 });
  if (sc.annata !== undefined) voci.push({ voce: sc.annata === 'buona' ? 'annata buona' : sc.annata === 'carestia' ? 'carestia' : 'annata media', punti: sc.annata === 'buona' ? 1 : sc.annata === 'carestia' ? -1 : 0, peso: 1 });
  return voci;
}

/** Il saldo dei cittadini: servi che arrivano (positivo) o partono (negativo). */
export function saldoMigratorio(voci: VoceMigrazione[]): number {
  const pesi = voci.reduce((a, v) => a + v.peso, 0);
  if (!pesi) return 0;
  return Math.round((MIGRAZIONI.massimo * voci.reduce((a, v) => a + v.punti, 0)) / pesi);
}
