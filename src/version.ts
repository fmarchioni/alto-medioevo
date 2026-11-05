/**
 * Versione del gioco (x.y.z) e data del commit, mostrate nella pagina
 * iniziale. Tenere VERSION uguale a "version" in package.json: a ogni commit
 * si sale di z per una piccola aggiunta, di y (z a 0) per una modifica
 * corposa, e si aggiorna la data.
 */
export const VERSION = '1.3.0';
/** data del commit (AAAA-MM-GG) */
export const VERSION_DATE = '2026-11-05';

/** "3 novembre 2026" */
export const versionDateText = () => {
  const [y, m, d] = VERSION_DATE.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
};
