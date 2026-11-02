/**
 * Vignette animate per gli imprevisti: scene SVG originali animate via CSS
 * (classi .a-*), didascalia da fumetto, onomatopea e battuta di un personaggio.
 * Solo presentazione: gli effetti restano in src/domain/events.ts.
 */
import type { EventOutcome, Player } from '../domain/types';
import { honorific } from './advisor';
import { pick } from './speaker';

const n = (v: number) => Math.abs(Math.floor(v)).toLocaleString('it-IT');

// ------------------------------------------------------------ elementi grafici

/** Figura umana stilizzata; `extra` è disegnato sopra (armi, cappelli...). */
export function person(x: number, y: number, body: string, extra = '', head = '#f0c9a0'): string {
  return `<g transform="translate(${x} ${y})">
    <path d="M-5 0 l-3 12 M5 0 l3 12" stroke="#3e2617" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M-8 -22 h16 l3 22 h-22z" fill="${body}"/>
    <circle cx="0" cy="-29" r="7" fill="${head}"/>
    ${extra}
  </g>`;
}
export const spear = `<path d="M10 -40 v44" stroke="#6b4a2c" stroke-width="2.5"/><path d="M10 -48 l-3 8 h6z" fill="#b8b8b8"/>`;
export const shield = (c: string) => `<circle cx="-9" cy="-12" r="7" fill="${c}" stroke="#3e2617" stroke-width="1.5"/>`;
export const helmet = `<path d="M-7.5 -31 a7.5 7.5 0 0 1 15 0z" fill="#8a8a8a"/>`;
export const hood = (c: string) => `<path d="M-9 -27 C-9 -42 9 -42 9 -27 L7 -22 H-7z" fill="${c}"/><circle cx="-2.5" cy="-29" r="1.3" fill="#fff"/><circle cx="2.5" cy="-29" r="1.3" fill="#fff"/>`;
const turban = `<path d="M-8 -32 C-8 -42 8 -42 8 -32z" fill="#f3f0e6" stroke="#c9b48a"/><circle cx="0" cy="-38" r="2" fill="#8b2a1e"/>`;
const sack = `<g transform="translate(14 -26)"><path d="M-7 0 C-12 0 -12 16 0 16 C12 16 12 0 7 0z" fill="#a8844f" stroke="#5a3d26"/><path d="M-4 0 q4 -5 8 0" stroke="#5a3d26" stroke-width="2" fill="none"/><text x="0" y="12" font-size="8" text-anchor="middle" fill="#5a3d26">$</text></g>`;
export const coin = (x: number, y: number, cls = '', delay = 0) =>
  `<circle class="${cls}" style="animation-delay:${delay}s" cx="${x}" cy="${y}" r="4" fill="#e3bb4f" stroke="#a8801f"/>`;
export const house = (x: number, y: number, w = 40, roof = '#8b2a1e') =>
  `<g transform="translate(${x} ${y})"><rect x="0" y="-${w * 0.7}" width="${w}" height="${w * 0.7}" fill="#d9c49a" stroke="#6b5a47"/><path d="M-4 -${w * 0.7} L${w / 2} -${w * 1.15} L${w + 4} -${w * 0.7}z" fill="${roof}"/><rect x="${w / 2 - 5}" y="-14" width="10" height="14" fill="#6b4a2c"/></g>`;
export const castle = (x: number, y: number) =>
  `<g transform="translate(${x} ${y})"><rect x="0" y="-60" width="70" height="60" fill="#a39a88" stroke="#5f584c"/>
   <rect x="-10" y="-80" width="22" height="80" fill="#968d7b" stroke="#5f584c"/><rect x="58" y="-80" width="22" height="80" fill="#968d7b" stroke="#5f584c"/>
   ${[-10, -3, 4, 58, 65, 72].map(cx => `<rect x="${cx}" y="-86" width="5" height="7" fill="#968d7b"/>`).join('')}
   <path d="M25 0 v-22 a10 10 0 0 1 20 0 v22z" fill="#4a3424"/><path d="M1 -80 v-16 l12 5 -12 5" fill="#8b2a1e" stroke="#3e2617"/></g>`;
/** Nuvoletta di dialogo dentro la scena. */
export function bubble(x: number, y: number, text: string, tailX: number, tailY: number): string {
  if (!text) return '';
  // il font C64 ha glifi quadrati: ogni carattere è largo quanto il corpo (8px)
  const w = text.length * 8 + 18;
  const bx = Math.max(4, Math.min(x, 316 - w));
  const tx = Math.max(bx + 10, Math.min(tailX, bx + w - 10));
  return `<g class="a-pop" style="animation-delay:.6s">
    <path d="M${tx - 8} ${y + 20} L${tailX} ${tailY} L${tx + 8} ${y + 20}z" fill="#fff" stroke="#2b2118" stroke-width="1.5"/>
    <rect x="${bx}" y="${y}" width="${w}" height="22" rx="11" fill="#fff" stroke="#2b2118" stroke-width="1.5"/>
    <rect x="${tx - 7}" y="${y + 18}" width="14" height="4" fill="#fff"/>
    <text x="${bx + w / 2}" y="${y + 14.5}" text-anchor="middle" class="bubble-text" fill="#2b2118">${text}</text></g>`;
}

export const sky = (top: string, bottom: string, id: string) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
   <rect width="320" height="180" fill="url(#${id})"/>`;
export const ground = (c: string) => `<path d="M0 150 Q80 140 160 148 T320 146 V180 H0z" fill="${c}"/>`;

// ------------------------------------------------------------ scene

interface Comic {
  sound: string[];
  captions: (h: string) => string[];
  scene: (line: string) => string;
  lines: string[];
}

export const COMICS: Record<number, Comic> = {
  // Longobardi di Patavium
  1: {
    sound: ['ALL\'ARMI!', 'TUM TUM TUM!'],
    lines: ['Tributo o fuoco!', 'Pagate, o bruceremo i campi!', 'Patavium esige il suo!'],
    captions: h => [
      `All'alba, ${h}, le sentinelle avvistano le insegne dei Longobardi di Patavium. Vogliono un tributo.`,
      `Polvere sulla strada di Patavium: un drappello longobardo marcia verso il castello e reclama il suo tributo.`,
    ],
    scene: line => `${sky('#f2b880', '#f6dfb0', 'sk1')}<path d="M0 150 Q60 110 130 140 T260 120 L320 130 V180 H0z" fill="#b8a36a"/>${ground('#9a8a4e')}
      ${castle(220, 150)}
      <g class="a-march">${[0, 28, 56].map((dx, i) => `<g class="a-bob" style="animation-delay:${i * 0.15}s">${person(20 + dx, 140, '#5b6b8a', helmet + spear + shield('#8b2a1e'))}</g>`).join('')}
        <path d="M100 98 v44" stroke="#5a3d26" stroke-width="2"/><path class="a-flag" d="M100 98 h22 l-6 7 6 7 h-22z" fill="#2f4f8a"/></g>
      ${bubble(10, 30, line, 50, 104)}`,
  },
  // principe saraceno
  2: {
    sound: ['DLIN DLIN!', 'OHHH!'],
    lines: ['Omaggi dal mio signore!', 'Doni d\'oriente per voi!', 'Pace e oro tra noi!'],
    captions: h => [
      `Un principe saraceno giunge con il suo seguito e depone ai vostri piedi una regalia di 500 scudi, ${h}.`,
      `Sete, spezie e un forziere colmo: il principe saraceno porta i suoi omaggi al feudo.`,
    ],
    scene: line => `${sky('#f7c96a', '#fbe6b3', 'sk2')}${ground('#d9b86a')}
      <circle cx="270" cy="40" r="18" fill="#fff3c4" class="a-glow"/>
      ${person(70, 140, '#2f6b6b', turban + '<path d="M-10 -22 h20 l6 22 h-32z" fill="#3f8a8a" opacity=".6"/>', '#c98f62')}
      ${person(110, 140, '#7a5a3a', turban, '#b07a52')}
      <g transform="translate(140 138)"><rect x="0" y="-18" width="34" height="20" fill="#8b5a2b" stroke="#3e2617"/>
        <g class="a-lid"><path d="M0 -18 q17 -14 34 0z" fill="#a8703a" stroke="#3e2617"/></g>
        ${[6, 14, 22, 30].map((x, i) => coin(x, -22, 'a-sparkle', i * 0.25)).join('')}</g>
      ${bubble(20, 34, line, 70, 104)}`,
  },
  // peste
  3: {
    sound: ['DON... DON...', 'AHIMÈ!'],
    lines: ['Chiudete le porte!', 'Il morbo è nel borgo!', 'Pregate, pregate!'],
    captions: h => [
      `Un morbo nero scende sul borgo, ${h}. Le campane suonano a morto: la peste si porta via quattro servi su dieci.`,
      `Miasmi verdastri strisciano tra le case. Quando passano, il feudo ha perso il 40% dei suoi servi.`,
    ],
    scene: line => `${sky('#5c6a4e', '#a8ad86', 'sk3')}${ground('#6b6a4a')}
      ${house(30, 150)}${house(90, 150, 36, '#6b4a2c')}${house(240, 150, 44)}
      <g transform="translate(160 150)"><rect x="-12" y="-70" width="24" height="70" fill="#8a8274"/><path d="M-16 -70 L0 -92 L16 -70z" fill="#5f584c"/>
        <g class="a-swing"><path d="M-6 -66 q6 -10 12 0 v8 h-12z" fill="#c99a2e"/></g></g>
      ${[0, 1, 2].map(i => `<g class="a-drift" style="animation-delay:${i * 1.2}s"><ellipse cx="${40 + i * 90}" cy="${110 - i * 8}" rx="40" ry="12" fill="#7c9a4a" opacity=".45"/></g>`).join('')}
      ${[200, 214, 228].map((x, i) => `<g class="a-pop" style="animation-delay:${0.8 + i * 0.4}s"><path d="M${x} 166 v-14 M${x - 5} 157 h10" stroke="#3e2617" stroke-width="2.5"/></g>`).join('')}
      ${bubble(20, 26, line, 60, 96)}${person(60, 150, '#6e4a2f', hood('#4a3424'))}`,
  },
  // campagna fortunata
  4: {
    sound: ['VITTORIA!', 'EVVIVA!'],
    lines: ['Il bottino è nostro!', 'Viva il nostro signore!', 'Tornano i prodi!'],
    captions: h => [
      `Le vostre schiere tornano trionfanti, ${h}: il nemico è in fuga e il bottino vale 1000 scudi.`,
      `Fortunata campagna! I carri rientrano carichi d'oro nemico: 1000 scudi per il tesoro.`,
    ],
    scene: line => `${sky('#8fc0e8', '#dbeefa', 'sk4')}<path d="M0 150 Q90 120 170 145 T320 135 V180 H0z" fill="#7aa35a"/>${ground('#6f8f4e')}
      <g class="a-march-in">
        ${[0, 30].map((dx, i) => `<g class="a-bob" style="animation-delay:${i * 0.2}s">${person(190 + dx, 142, '#8b2a1e', helmet + spear + shield('#d6b25a'))}</g>`).join('')}
        <path d="M262 96 v46" stroke="#5a3d26" stroke-width="2"/><path class="a-flag" d="M262 96 h24 l-6 7 6 7 h-24z" fill="#8b2a1e"/>
        <g transform="translate(110 142)"><rect x="0" y="-20" width="50" height="18" fill="#8a6b3e"/><circle cx="10" cy="0" r="7" fill="#4a3424"/><circle cx="40" cy="0" r="7" fill="#4a3424"/>
          ${[8, 18, 28, 38].map((x, i) => coin(x, -24, 'a-bounce', i * 0.18)).join('')}</g>
      </g>
      ${bubble(150, 30, line, 205, 102)}`,
  },
  // alluvione
  5: {
    sound: ['SPLASH!', 'GLU GLU!'],
    lines: ['Salvate i bambini!', 'L\'argine cede!', 'Sui tetti, presto!'],
    captions: h => [
      `Piogge senza fine: il fiume rompe gli argini e trascina via le case dei villici, ${h}. Un servo su dieci annega.`,
      `Nella notte l'acqua sale e sale. All'alba il 10% dei villici non c'è più.`,
    ],
    scene: line => `${sky('#5f6f80', '#a7b4bf', 'sk5')}
      ${[...Array(14)].map((_, i) => `<path class="a-rain" style="animation-delay:${(i % 7) * 0.12}s" d="M${10 + i * 23} 0 l-6 16" stroke="#dfe8ef" stroke-width="1.5" opacity=".8"/>`).join('')}
      ${ground('#6b6a4a')}${house(40, 150)}${house(200, 150, 48, '#6b4a2c')}
      ${person(222, 84, '#5b6b8a')}
      <g class="a-rise"><path class="a-wave" d="M-20 128 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 V200 H-20z" fill="#4f7fa8" opacity=".85"/>
        <g class="a-bob"><rect x="120" y="118" width="18" height="14" rx="3" fill="#8a6b3e"/></g></g>
      ${bubble(150, 24, line, 222, 50)}`,
  },
  // cloaca romana
  6: {
    sound: ['PUZZA!', 'BLEAH!'],
    lines: ['Che fetore, Messere!', 'Ci vogliono altri scudi!', 'Qui sotto c\'è Roma!'],
    captions: h => [
      `La vecchia cloaca romana è crollata e il borgo è invaso dal fetore, ${h}. Ripararla costa 2000 scudi.`,
      `Gli antichi condotti dei Romani cedono: maestri muratori e badili costano al tesoro 2000 scudi.`,
    ],
    scene: line => `${sky('#b8b49a', '#e2dcc0', 'sk6')}<rect y="140" width="320" height="40" fill="#8a8274"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<rect x="${i * 40}" y="140" width="38" height="12" fill="#a39a88" stroke="#6b6458"/>`).join('')}
      <path d="M120 152 a40 26 0 0 1 80 0z" fill="#2b2118"/>
      ${[0, 1, 2].map(i => `<path class="a-stink" style="animation-delay:${i * 0.5}s" d="M${145 + i * 15} 140 q-6 -10 0 -20 t0 -20" stroke="#7c9a4a" stroke-width="3" fill="none"/>`).join('')}
      <g class="a-dig" style="transform-origin:90px 140px">${person(90, 140, '#8a6b3e', '<path d="M8 -20 l18 26" stroke="#6b4a2c" stroke-width="3"/><path d="M24 4 l6 6 -8 2z" fill="#8a8a8a"/>')}</g>
      ${person(250, 140, '#6e4a2f', '')}
      <g transform="translate(262 112)">${[0, 1, 2].map(i => coin(0, 0, 'a-fall', i * 0.4)).join('')}</g>
      ${bubble(20, 30, line, 88, 100)}`,
  },
  // briganti
  7: {
    sound: ['FERMI TUTTI!', 'TOC TOC TOC!'],
    lines: ['La borsa o la vita!', 'Aprite, o sfondiamo!', 'Ci serve il vostro oro!'],
    captions: h => [
      `Una banda di briganti si raduna alle porte del palazzo, ${h}. Reclamano oro: combattere o pagare?`,
      `Fiaccole nella notte: i briganti battono sulle porte del palazzo. Cosa ordinate, ${h}?`,
    ],
    scene: line => `${sky('#1f2440', '#4a4670', 'sk7')}<circle cx="40" cy="36" r="14" fill="#f3ecc8"/>${ground('#3e3a2e')}
      ${castle(200, 150)}
      <g class="a-sneak">${[0, 30, 60].map((dx, i) => `<g class="a-bob" style="animation-delay:${i * 0.2}s">${person(60 + dx, 142, '#3e3a2e', hood('#2b2118') + '<path d="M8 -22 l10 -12" stroke="#6b4a2c" stroke-width="4" stroke-linecap="round"/>')}</g>`).join('')}
        <g transform="translate(150 142)"><path d="M0 0 v-34" stroke="#6b4a2c" stroke-width="3"/><path class="a-flicker" d="M0 -34 q-7 -8 0 -18 q7 10 0 18z" fill="#f2a33a"/></g></g>
      ${bubble(14, 64, line, 70, 104)}`,
  },
  // rivolta del popolo (riforma delle gabelle)
  9: {
    sound: ['ABBASSO LE GABELLE!', 'VAI! VAI!'],
    lines: ['Il grano è nostro!', 'Basta gabelle!', 'Ai granai!'],
    captions: h => [
      `Il popolo non ne può più della gabella sul bere, ${h}: armati di forconi, i servi assaltano i granai.`,
      `Rivolta! Una folla inferocita sfonda le porte dei granai e si porta via il grano, ${h}.`,
    ],
    scene: line => `${sky('#e08a4a', '#f2c890', 'sk9')}${ground('#8a6a3e')}
      <g transform="translate(200 150)"><rect x="0" y="-56" width="80" height="56" fill="#b08a5a" stroke="#5a3d26"/><path d="M-6 -56 L40 -84 L86 -56z" fill="#7a4a2a"/>
        <rect x="28" y="-30" width="24" height="30" fill="#3e2617"/><path class="a-flicker" d="M70 -84 q-8 -10 0 -22 q8 12 0 22z" fill="#f2a33a"/></g>
      ${[0, 1, 2].map(i => `<g class="a-bob" style="animation-delay:${i * 0.25}s">${person(60 + i * 34, 142, ['#6e4a2f', '#5b6b3a', '#7a3a2a'][i], '<path d="M8 -20 l8 -26 M12 -46 l4 -6 M16 -46 l2 -6" stroke="#6b4a2c" stroke-width="2.5"/>')}</g>`).join('')}
      <g transform="translate(182 120)"><path d="M-7 0 C-12 0 -12 16 0 16 C12 16 12 0 7 0z" fill="#d6b25a" stroke="#a8801f" class="a-bounce"/></g>
      ${bubble(14, 30, line, 80, 100)}`,
  },
  // ciambellano infedele
  8: {
    sound: ['AL LADRO!', 'TLIN TLIN!'],
    lines: ['Addio, signoria!', 'Fermatelo!', 'Al ladro, al ladro!'],
    captions: h => [
      `Nella notte il ciambellano ha forzato lo scrigno e fugge con 950 scudi, ${h}. Le guardie arrivano troppo tardi.`,
      `Il fidato ciambellano non era poi così fidato: scappa dal palazzo con 950 scudi del tesoro.`,
    ],
    scene: line => `${sky('#1c2238', '#3d4a6e', 'sk8')}<circle cx="270" cy="34" r="16" fill="#f3ecc8"/>
      ${[30, 80, 140, 200].map((x, i) => `<circle cx="${x}" cy="${20 + (i % 2) * 14}" r="1.5" fill="#fff" class="a-twinkle" style="animation-delay:${i * 0.3}s"/>`).join('')}
      ${ground('#3e3a2e')}${castle(10, 150)}
      <g class="a-run">${person(150, 142, '#6b2a6b', '<path d="M-8 -36 h16 l-3 -6 h-10z" fill="#3e2617"/>' + sack)}
        ${[0, 1, 2, 3].map(i => coin(150 - 12 - i * 14, 116, 'a-fall', i * 0.35)).join('')}</g>
      <g class="a-chase">${person(70, 142, '#5b6b8a', helmet + spear)}</g>
      ${bubble(20, 36, line, 66, 104)}`,
  },
  // imprese temerarie: le decime dell'abate corrotto
  15: {
    sound: ['PSST...', 'SSST!'],
    lines: ['Ci serve un complice...', 'Passa al guado, a luna nuova.', 'Metà a voi, metà a noi.'],
    captions: h => [
      `Un brigante incappucciato vi avvicina, ${h}. Un abate corrotto porta ogni anno le decime di decine di villaggi, e loro conoscono la strada. Cercano un complice.`,
      `Nella taverna, ${h}, un uomo nell'ombra vi sussurra del carro delle decime dell'abate: un colpo da migliaia di scudi, se avete il fegato.`,
    ],
    scene: line => `${sky('#2a2440', '#6a5a7e', 'sk15')}<circle cx="40" cy="30" r="12" fill="#f3ecc8"/>
      ${ground('#4a4434')}<path d="M0 150 Q120 132 320 140" stroke="#6b5a47" stroke-width="10" fill="none" opacity=".6"/>
      <g class="a-march"><g transform="translate(200 122)">
        <rect x="0" y="-10" width="70" height="26" fill="#6b4a2c" stroke="#3e2617"/>
        ${[8, 26, 44].map(x => `<path d="M${x} -10 C${x - 4} -26 ${x + 18} -26 ${x + 14} -10z" fill="#a8844f" stroke="#5a3d26"/>`).join('')}
        <circle cx="14" cy="18" r="9" fill="#3e2617"/><circle cx="56" cy="18" r="9" fill="#3e2617"/>
        <path d="M0 4 h-16" stroke="#3e2617" stroke-width="3"/></g>
        ${person(180, 140, '#5a3d26', '<circle cx="0" cy="-33" r="4" fill="#d9b48a"/><path d="M-9 -12 h18" stroke="#e3bb4f" stroke-width="2"/>', '#f0c9a0')}</g>
      ${person(70, 142, '#2b2118', hood('#1c1814'))}
      ${person(104, 142, '#2f5b3a', '<path d="M-8 -36 h16 l-3 -6 h-10z" fill="#8b2a1e"/>')}
      ${bubble(10, 40, line, 70, 104)}`,
  },
  // imprese temerarie: il commercio segreto
  16: {
    sound: ['PSST...', 'TLIN!'],
    lines: ['Nessuna dogana, nessuna gabella...', 'Un affare tra gentiluomini.', 'Le galee partono a luna nuova.'],
    captions: h => [
      `Due mercanti forestieri chiedono udienza a porte chiuse, ${h}. Offrono di partecipare a un lucroso commercio segreto, lontano dagli occhi delle dogane.`,
      `Nel retrobottega, ${h}, mercanti senza scrupoli srotolano una mappa di rotte segrete: sale, spezie e armi, e una parte del guadagno per voi.`,
    ],
    scene: line => `${sky('#3a2a20', '#7a5a3e', 'sk16')}<rect x="0" y="0" width="320" height="180" fill="#5a4030" opacity=".5"/>
      <rect x="0" y="146" width="320" height="34" fill="#4a3424"/>
      <g transform="translate(110 120)"><rect x="0" y="0" width="110" height="10" fill="#6b4a2c" stroke="#3e2617"/>
        <path d="M10 26 v-16 M100 26 v-16" stroke="#3e2617" stroke-width="4"/>
        <rect x="18" y="-6" width="56" height="8" fill="#e8dcc0" stroke="#a8844f" transform="rotate(-4 46 -2)"/>
        <path d="M24 -2 q14 -6 28 0 t20 -2" stroke="#8b2a1e" stroke-width="1.5" fill="none"/></g>
      ${coin(196, 114, 'a-toss', 0)}${coin(204, 114, 'a-toss', 0.3)}
      ${person(80, 146, '#2f5b3a', '<path d="M-8 -36 h16 l-3 -6 h-10z" fill="#8b2a1e"/>')}
      ${person(250, 146, '#6b2a6b', '<path d="M-9 -34 h18 l-2 -6 h-14z" fill="#3e2617"/>')}
      ${person(282, 146, '#7a5a2a', '<path d="M-8 -32 C-8 -42 8 -42 8 -32z" fill="#f3f0e6" stroke="#c9b48a"/>')}
      ${bubble(120, 26, line, 250, 104)}`,
  },
};

/** Vignetta dell'esito di pugna o riscatto. */
function outcomeScene(o: EventOutcome, line: string): string {
  if (o.choice === 'riscatto') {
    return `${sky('#e8d3a0', '#f6e9c8', 'sko')}${ground('#b8a36a')}
      ${person(90, 140, '#2f5b3a', '<path d="M-8 -36 h16 l-3 -6 h-10z" fill="#8b2a1e"/>')}
      ${person(230, 140, '#3e3a2e', hood('#2b2118'))}
      <g>${[0, 1, 2, 3, 4].map(i => coin(110 + i * 4, 112, 'a-toss', i * 0.25)).join('')}</g>
      ${bubble(150, 30, line, 230, 100)}`;
  }
  const won = o.scudi >= 0;
  return `${sky(won ? '#f2b880' : '#7a5a5a', won ? '#f6dfb0' : '#b89a8a', 'skp')}${ground('#8a7a4e')}
    <g class="a-clash-l">${person(120, 142, '#8b2a1e', helmet + shield('#d6b25a') + '<path d="M8 -20 l24 -18" stroke="#c8c8c8" stroke-width="3"/>')}</g>
    <g class="a-clash-r">${person(200, 142, '#3e3a2e', hood('#2b2118') + '<path d="M-8 -20 l-24 -18" stroke="#c8c8c8" stroke-width="3"/>')}</g>
    <g class="a-pop" style="animation-delay:.5s"><path d="M160 92 l6 -14 4 12 12 -8 -6 13 14 2 -13 6 8 12 -13 -5 -2 14 -6 -12 -10 9 3 -14 -13 -4 13 -5 -8 -11z" fill="#fff3a0" stroke="#d98a1e"/></g>
    ${bubble(14, 26, line, 120, 100)}`;
}

// ------------------------------------------------------------ vista

export function panel(svg: string, sound: string, caption: string, label: string): string {
  return `
  <figure class="comic">
    <figcaption class="comic-caption">${caption}</figcaption>
    <svg viewBox="0 0 320 180" class="comic-scene" role="img" aria-label="${label}">${svg}</svg>
    <div class="comic-sound" aria-hidden="true">${sound}</div>
  </figure>`;
}

export interface ComicText {
  caption: string;
  sound: string;
  line: string;
}

/** Testi scelti una volta per evento (restano fissi ai ridisegni). */
export function comicText(eventId: number, p: Player): ComicText {
  const c = COMICS[eventId];
  return { caption: pick(c.captions(honorific(p))), sound: pick(c.sound), line: pick(c.lines) };
}

export function outcomeText(o: EventOutcome, p: Player): ComicText {
  const h = honorific(p);
  if (o.choice === 'riscatto') {
    return {
      sound: pick(['TLIN TLIN!', 'SOB!']),
      line: pick(['Ecco il vostro oro...', 'Prendete e andatevene!']),
      caption: pick([`Avete scelto di pagare, ${h}: ${n(o.scudi)} scudi lasciano il tesoro, ma nessuno si fa male.`, `Il riscatto è consegnato: ${n(o.scudi)} scudi e il nemico se ne va.`]),
    };
  }
  const won = o.scudi >= 0;
  const servi = o.servi > 0 ? `si sono uniti a voi ${n(o.servi)} uomini` : o.servi < 0 ? `sono caduti ${n(o.servi)} servi` : 'nessun servo è caduto';
  return {
    sound: won ? pick(['ZAC! SBANG!', 'CLANG!']) : pick(['AHI!', 'CRAC!']),
    line: won ? pick(['Fuggite, codardi!', 'Per il feudo!']) : pick(['Ritirata!', 'Sono troppi!']),
    caption: won
      ? `Pugna vittoriosa, ${h}! Bottino di ${n(o.scudi)} scudi, e ${servi}.`
      : `La pugna va male, ${h}: spese di guerra per ${n(o.scudi)} scudi, e ${servi}.`,
  };
}

export function effectBadges(o: EventOutcome): string {
  const b = (v: number, unit: string) =>
    v === 0 ? '' : `<span class="badge ${v > 0 ? 'gain' : 'loss'}">${v > 0 ? '+' : '−'}${n(v)} ${unit}</span>`;
  const all = b(o.scudi, 'scudi') + b(o.servi, 'servi') + b(o.grano ?? 0, 'grano');
  return `<div class="badges">${all || '<span class="badge">nessun effetto</span>'}</div>`;
}

export function renderEventComic(eventId: number, title: string, t: ComicText): string {
  return panel(COMICS[eventId].scene(t.line), t.sound, t.caption, title);
}

export function renderOutcomeComic(o: EventOutcome, t: ComicText): string {
  return panel(outcomeScene(o, t.line), t.sound, t.caption, o.choice === 'riscatto' ? 'riscatto pagato' : 'esito della pugna');
}

/**
 * Miniatura statica di un imprevisto (per il libro delle cronache): la scena
 * senza nuvoletta, didascalia né onomatopea. Le animazioni sono spente dal CSS del libro.
 */
export function eventMiniature(eventId: number, outcome?: EventOutcome): string {
  const svg = outcome?.choice ? outcomeScene(outcome, '') : COMICS[eventId].scene('');
  return `<svg viewBox="0 0 320 180" class="mini-art" role="img" aria-label="miniatura dell'imprevisto">${svg}</svg>`;
}
