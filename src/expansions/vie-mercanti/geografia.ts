/**
 * Le vie dei mercanti: zone del regno, specialità di ogni feudo e tempi di
 * viaggio delle carovane. Ogni feudo ha una sola specialità permanente, che
 * spinge il suo signore verso una strada diversa per arricchirsi.
 */
import { FEUDI } from '../../domain/rank';

export type Zona = 'nord' | 'centro' | 'sud' | 'isole';
export const ZONE: Zona[] = ['nord', 'centro', 'sud', 'isole'];
export const ZONA_NOME: Record<Zona, string> = { nord: 'Nord', centro: 'Centro', sud: 'Sud', isole: 'Isole' };

/** Zona di ciascun feudo, nello stesso ordine di FEUDI. */
export const ZONA_FEUDO: readonly Zona[] = ['nord', 'nord', 'nord', 'centro', 'centro', 'sud', 'sud', 'sud', 'isole'];

export type Specialita = 'manufatti' | 'vino' | 'grano' | 'porto' | 'prestigio';

/** Specialità di ciascun feudo, nello stesso ordine di FEUDI, con il suo valore. */
export const SPECIALITA: readonly { kind: Specialita; bonus: number }[] = [
  { kind: 'manufatti', bonus: 0.2 }, // Taurinum: botteghe dei valichi alpini
  { kind: 'manufatti', bonus: 0.2 }, // Mediolanum: armaioli e tessitori
  { kind: 'vino', bonus: 0.2 }, // Verona: colline della Valpolicella
  { kind: 'porto', bonus: 1 }, // Ravenna: porto sull'Adriatico
  { kind: 'prestigio', bonus: 0.1 }, // Roma: la parola di chi tratta a Roma vale di più
  { kind: 'vino', bonus: 0.2 }, // Beneventum: vigne dell'Irpinia
  { kind: 'grano', bonus: 0.15 }, // Neapolis: Campania felix
  { kind: 'porto', bonus: 1 }, // Barium: porto per l'Oriente
  { kind: 'vino', bonus: 0.3 }, // Panormus: vigne di Sicilia, lontane da tutti
];

export const specialitaOf = (feudo: number) => SPECIALITA[feudo];
/** Moltiplicatore di una produzione per il feudo (1 se non è la sua specialità). */
export const bonusOf = (feudo: number, kind: 'manufatti' | 'vino' | 'grano' | 'prestigio') => {
  const s = SPECIALITA[feudo];
  return s.kind === kind ? 1 + s.bonus : 1;
};
export const hasPort = (feudo: number) => SPECIALITA[feudo].kind === 'porto';

/** Città dei mercanti forestieri: destinazioni delle consegne alla fiera (non sono feudi). */
export const PIAZZE = [
  { id: 'venezia', name: 'Venezia', zona: 'nord' as Zona, oltre: 0 },
  { id: 'genova', name: 'Genova', zona: 'nord' as Zona, oltre: 0 },
  { id: 'pisa', name: 'Pisa', zona: 'centro' as Zona, oltre: 0 },
  { id: 'amalfi', name: 'Amalfi', zona: 'sud' as Zona, oltre: 0 },
  { id: 'messina', name: 'Messina', zona: 'isole' as Zona, oltre: 0 },
  // oltremare: come le Isole, più un anno di mare
  { id: 'costantinopoli', name: 'Costantinopoli', zona: 'isole' as Zona, oltre: 1 },
] as const;
export type PiazzaId = (typeof PIAZZE)[number]['id'];

/** Distanza fra due zone: 0 la stessa, 1 vicine, fino a 3 (Nord e Isole). */
export const zoneApart = (a: Zona, b: Zona) => Math.abs(ZONE.indexOf(a) - ZONE.indexOf(b));

/**
 * Anni di viaggio di una carovana: 1 nella stessa zona, 2 in una zona vicina,
 * 3 a due zone, 4 agli estremi del regno; un anno in meno se parte o arriva
 * in un feudo con il porto (mai meno di uno).
 */
export function travelYears(fromFeudo: number, to: { feudo: number } | { piazza: PiazzaId }): number {
  const dest = 'feudo' in to ? { zona: ZONA_FEUDO[to.feudo], oltre: 0 } : PIAZZE.find(x => x.id === to.piazza)!;
  const port = hasPort(fromFeudo) || ('feudo' in to && hasPort(to.feudo));
  return Math.max(1, 1 + zoneApart(ZONA_FEUDO[fromFeudo], dest.zona) + dest.oltre - (port ? 1 : 0));
}

/** Descrizione della specialità di un feudo. */
export function specialitaText(feudo: number): string {
  const s = SPECIALITA[feudo], pct = `+${Math.round(s.bonus * 100)}%`;
  switch (s.kind) {
    case 'manufatti': return `${pct} manufatti dagli opifici`;
    case 'vino': return `${pct} vino dai vigneti`;
    case 'grano': return `${pct} grano nel raccolto`;
    case 'prestigio': return `${pct} prestigio mercantile`;
    case 'porto': return 'porto: le carovane viaggiano un anno in meno';
  }
}

export const feudoName = (feudo: number) => FEUDI[feudo];
