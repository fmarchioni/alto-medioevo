/**
 * Registro delle espansioni: raccoglie da solo ogni src/expansions/<nome>/index.ts.
 * Per aggiungerne una basta creare la cartella; per toglierla, eliminarla. Quelle con `nascosta` (la Dinastia a
 * vocazioni, src/expansions/vocazioni/) non sono fra le tessere della schermata iniziale.
 */
import type { Expansion } from './types';

const found = import.meta.glob<{ default: Expansion }>('./*/index.ts', { eager: true });

export const EXPANSIONS: Expansion[] = Object.values(found)
  .map(m => m.default)
  .sort((a, b) => a.order - b.order);

export function findExpansion(id: string | null | undefined): Expansion | null {
  return EXPANSIONS.find(e => e.rules.id === id) ?? null;
}
