/**
 * Geografia schematica del regno: posizione di ogni feudo sulla carta (stesse
 * coordinate della "Carta del regno") e confini fra i feudi in gioco.
 * Le posizioni rispettano l'ordine nord-sud e ovest-est, non sono geografiche.
 */
export const FEUDO_POS: readonly [number, number][] = [
  [120, 320], // Taurinum
  [340, 160], // Mediolanum
  [590, 110], // Verona
  [820, 240], // Ravenna
  [580, 400], // Roma
  [800, 470], // Beneventum
  [760, 630], // Neapolis
  [985, 610], // Barium
  [460, 640], // Panormus (in Sicilia)
];

const dist = (a: number, b: number) => Math.hypot(FEUDO_POS[a][0] - FEUDO_POS[b][0], FEUDO_POS[a][1] - FEUDO_POS[b][1]);

/**
 * Confini fra i feudi in gioco: ciascuno confina con i due più vicini fra
 * quelli presenti, e il confine vale nei due sensi. Ritorna, per ogni feudo
 * presente, l'elenco dei feudi confinanti.
 */
export function borders(feudi: number[], nearest = 2): Map<number, number[]> {
  const out = new Map<number, Set<number>>(feudi.map(f => [f, new Set<number>()]));
  for (const f of feudi) {
    const near = feudi.filter(x => x !== f).sort((a, b) => dist(f, a) - dist(f, b)).slice(0, nearest);
    for (const x of near) {
      out.get(f)!.add(x);
      out.get(x)!.add(f);
    }
  }
  return new Map([...out].map(([f, s]) => [f, [...s].sort((a, b) => a - b)]));
}
