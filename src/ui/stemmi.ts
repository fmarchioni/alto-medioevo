/**
 * Stemmi delle città dei feudi (FEUDI, src/domain/rank.ts): scudi semplici, disegnati in SVG, con i colori
 * e una figura per città. Servono all'annuncio del turno (src/ui/turno.ts).
 */

/** Il contorno dello scudo, in un riquadro 100 × 120. */
const SCUDO = 'M8 6 H92 V58 C92 92 50 114 50 114 C50 114 8 92 8 58 Z';

const ORO = '#d9a93a', ROSSO = '#b3261e', AZZURRO = '#2b5aa8', ARGENTO = '#f2efe6', VERDE = '#3f7a3a', NERO = '#2a221c';

/** Il campo e le figure di ciascuna città, nell'ordine di FEUDI. */
const CAMPI: readonly string[] = [
  // Taurinum: d'azzurro, la testa di toro d'oro
  `<rect width="100" height="120" fill="${AZZURRO}"/>
   <path d="M30 40 C22 34 20 26 24 20 C28 30 34 34 40 36 M70 40 C78 34 80 26 76 20 C72 30 66 34 60 36" fill="none" stroke="${ORO}" stroke-width="5" stroke-linecap="round"/>
   <path d="M36 38 H64 L60 70 C58 80 54 84 50 84 C46 84 42 80 40 70 Z" fill="${ORO}"/>
   <path d="M36 40 L28 46 L38 48 M64 40 L72 46 L62 48" fill="${ORO}"/>
   <circle cx="43" cy="52" r="2.6" fill="${NERO}"/><circle cx="57" cy="52" r="2.6" fill="${NERO}"/>
   <ellipse cx="50" cy="76" rx="7" ry="4" fill="#b8862a"/>`,
  // Mediolanum: d'argento, la croce rossa
  `<rect width="100" height="120" fill="${ARGENTO}"/><rect x="41" y="0" width="18" height="120" fill="${ROSSO}"/><rect x="0" y="40" width="100" height="18" fill="${ROSSO}"/>`,
  // Verona: d'azzurro, la croce d'oro
  `<rect width="100" height="120" fill="${AZZURRO}"/><rect x="41" y="0" width="18" height="120" fill="${ORO}"/><rect x="0" y="40" width="100" height="18" fill="${ORO}"/>`,
  // Ravenna: d'azzurro, la torre d'argento sul mare
  `<rect width="100" height="120" fill="${AZZURRO}"/>
   <path d="M36 30 H40 V24 H46 V30 H54 V24 H60 V30 H64 V84 H36 Z" fill="${ARGENTO}" stroke="${NERO}" stroke-width="1.5"/>
   <path d="M46 84 V70 A4 4 0 0 1 54 70 V84 Z" fill="${NERO}"/><rect x="47" y="44" width="6" height="9" fill="${NERO}"/>
   <path d="M0 86 Q12 80 25 86 T50 86 T75 86 T100 86 V120 H0 Z" fill="#1d3f78"/>
   <path d="M0 96 Q12 90 25 96 T50 96 T75 96 T100 96" fill="none" stroke="${ARGENTO}" stroke-width="2.5"/>`,
  // Roma: di rosso, la banda d'oro con le lettere
  `<rect width="100" height="120" fill="${ROSSO}"/>
   <g transform="rotate(45 50 56)"><rect x="-30" y="44" width="160" height="24" fill="${ORO}"/>
   <text x="50" y="62" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="16" letter-spacing="1" fill="${ROSSO}">SPQR</text></g>`,
  // Beneventum: bandato d'oro e di rosso
  `<rect width="100" height="120" fill="${ORO}"/>
   ${[-60, -20, 20, 60, 100].map(x => `<path d="M${x} 0 L${x + 20} 0 L${x + 140} 120 L${x + 120} 120 Z" fill="${ROSSO}"/>`).join('')}`,
  // Neapolis: partito d'oro e di rosso
  `<rect width="50" height="120" fill="${ORO}"/><rect x="50" width="50" height="120" fill="${ROSSO}"/>`,
  // Barium: troncato d'argento e di rosso, con la stella
  `<rect width="100" height="60" fill="${ARGENTO}"/><rect y="60" width="100" height="60" fill="${ROSSO}"/>
   <path d="M50 22 L54.7 35.5 L69 35.8 L57.6 44.5 L61.8 58 L50 50 L38.2 58 L42.4 44.5 L31 35.8 L45.3 35.5 Z" fill="${ROSSO}"/>`,
  // Panormus: d'oro, l'aquila nera
  `<rect width="100" height="120" fill="${ORO}"/>
   <g fill="${NERO}">${[1, -1].map(k => `<path transform="translate(${k === 1 ? 0 : 100} 0) scale(${k} 1)" d="M45 48 C40 36 30 26 16 24 L22 31 L12 33 L21 38 L11 42 L21 45 L13 51 L24 51 L18 57 L30 55 C36 54 41 55 45 60 Z"/>`).join('')}
   <ellipse cx="50" cy="58" rx="7" ry="15"/><circle cx="50" cy="38" r="6.5"/>
   <path d="M44 38 L37 41 L44 42 Z"/><path d="M45 70 L38 88 L44 84 L50 92 L56 84 L62 88 L55 70 Z"/>
   <path d="M45 66 L40 76 M55 66 L60 76" stroke="${NERO}" stroke-width="3" stroke-linecap="round"/></g>
   <circle cx="48" cy="37" r="1.3" fill="${ORO}"/>`,
];

/** Lo stemma della città del feudo `feudo` (indice in FEUDI). */
export function stemma(feudo: number, label = ''): string {
  const campo = CAMPI[feudo] ?? `<rect width="100" height="120" fill="${VERDE}"/>`;
  const id = `stemma-${feudo}`;
  return `<svg class="stemma" viewBox="0 0 100 120" role="img" aria-label="${label ? `stemma di ${label}` : 'stemma'}">
    <defs><clipPath id="${id}"><path d="${SCUDO}"/></clipPath>
      <linearGradient id="${id}-luce" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs>
    <g clip-path="url(#${id})">${campo}<path d="${SCUDO}" fill="url(#${id}-luce)"/></g>
    <path d="${SCUDO}" fill="none" stroke="#7a5a1c" stroke-width="5"/><path d="${SCUDO}" fill="none" stroke="${ORO}" stroke-width="2.5"/>
  </svg>`;
}
