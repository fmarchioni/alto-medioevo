/**
 * Carta del regno: una carta antica d'Italia (public/mappa-italia.jpg) con un
 * punto su ogni feudo e, di lato, un medaglione con il signore, il suo titolo
 * e il tesoro. Per ora il medaglione mostra la veduta del reame: lì andrà la
 * faccia del personaggio.
 */
import { FEUDI, titleName, wealthIndex } from '../domain/rank';
import type { Player } from '../domain/types';
import { realmScene } from './realm';

/** Stesse proporzioni dell'immagine (1600x1195). */
const W = 1200, H = 896;
const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
export const MAP_IMAGE = `${BASE}mappa-italia.jpg`;
export const MAP_SIZE = { w: W, h: H };

/**
 * Dove sta ogni feudo sulla carta antica (solo disegno: le distanze di gioco
 * restano quelle di `FEUDO_POS` in domain/geography).
 */
export const MAP_POS: readonly [number, number][] = [
  [211, 255], // Taurinum
  [293, 206], // Mediolanum
  [450, 179], // Verona
  [548, 271], // Ravenna
  [602, 455], // Roma
  [759, 499], // Beneventum
  [727, 548], // Neapolis
  [916, 493], // Barium
  [672, 843], // Panormus
];

/** Dove va il medaglione rispetto al punto, per non coprire i vicini (verso il mare quando si può). */
const SIDE: readonly [number, number][] = [
  [-95, 45], [-65, -125], [25, -120], [125, -10], [-135, 20], [95, -150], [-125, 75], [115, 70], [-175, -95],
];
const R = 44;
/** Dove si appoggiano i segni delle espansioni (spade, briganti): in alto a destra del medaglione. */
export const markerPos = (feudo: number): [number, number] => {
  const [x, y] = MAP_POS[feudo], [dx, dy] = SIDE[feudo];
  return [x + dx + R * 0.8, y + dy - R * 0.8];
};

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const n = (v: number) => Math.floor(v).toLocaleString('it-IT');

/** Testo che non supera la larghezza: con il font C64 ogni carattere è largo quanto il corpo. */
function fitText(x: number, y: number, text: string, size: number, maxW: number, cls: string): string {
  const fit = text.length * size > maxW ? ` textLength="${maxW}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="${x}" y="${y}" text-anchor="middle" class="${cls}" font-size="${size}"${fit}>${text}</text>`;
}

/** Sfondo della carta, comune alla carta del regno e a quella dei confini. */
export const mapBackground = () => `<image href="${MAP_IMAGE}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`;

const cityDot = (x: number, y: number, r = 7) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#8b2a1e" stroke="#f6ead0" stroke-width="2.5"/><circle cx="${x}" cy="${y}" r="${r + 2.5}" fill="none" stroke="#2b2118" stroke-width="1.5"/>`;

/** `markers`: SVG aggiunto sopra i reami (pedine e segni delle espansioni). */
/** `idx`: indice in partita di ciascun signore (per il suo colore); `routes`: SVG sotto i medaglioni (rotte delle carovane). */
export function renderRealmMap(players: Player[], markers = '', idx: number[] = players.map((_, k) => k), routes = ''): string {
  const leader = players.reduce((a, b) => (wealthIndex(b) > wealthIndex(a) ? b : a), players[0]);
  const used = new Set(players.map(p => p.feudo));
  const empty = MAP_POS.map(([x, y], i) => (used.has(i) ? '' : `<g class="map-empty">${cityDot(x, y, 5)}</g>`)).join('');
  const realms = players.map((p, k) => {
    const color = playerColor(idx[k] ?? k);
    const [px, py] = MAP_POS[p.feudo], [dx, dy] = SIDE[p.feudo];
    const cx = px + dx, cy = py + dy;
    const clip = `mm-clip-${p.feudo}`;
    const crown = p === leader && players.length > 1
      ? `<path d="M${cx - 16} ${cy - R - 2} l4 -14 6 8 6 -12 6 12 6 -8 4 14z" fill="#e3bb4f" stroke="#8a6420" stroke-width="1.5"/>` : '';
    const money = `${n(p.scudi)} scudi`;
    const LW = 190, ly = cy + R + 6;
    return `<g class="map-realm">
      <path d="M${px} ${py} L${cx} ${cy}" stroke="#2b2118" stroke-width="2"/>
      ${cityDot(px, py)}
      <clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>
      <circle cx="${cx}" cy="${cy}" r="${R + 5}" fill="#f6ead0" stroke="#5a3d26" stroke-width="2"/>
      <g clip-path="url(#${clip})">${realmScene(p, `reame di ${esc(p.name)}`, { x: cx - 100, y: cy - R, width: 200, height: 2 * R })}</g>
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${color}" stroke-width="5"/>
      <rect x="${cx - LW / 2}" y="${ly}" width="${LW}" height="38" rx="4" fill="#f6ead0" fill-opacity=".92" stroke="#5a3d26" stroke-width="1.5"/>
      ${fitText(cx, ly + 16, `${titleName(p.title)} ${esc(p.name)}`, 12, LW - 8, 'map-name')}
      ${fitText(cx, ly + 32, `${FEUDI[p.feudo]} - ${money}`, 11, LW - 8, p.scudi < 0 ? 'map-money debt' : 'map-money')}
      ${crown}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="realm-map" role="img" aria-label="carta del regno con i reami di tutti i signori">
    ${mapBackground()}
    ${routes}${empty}${realms}${markers}
  </svg>`;
}

// ---------------------------------------------------------------- colori e rotte

/** Un colore per signore (per indice in partita): il medaglione e la merce che viaggia hanno lo stesso anello. */
export const PLAYER_COLORS = ['#1f4e9c', '#b3202a', '#2e7d32', '#6a2c91', '#d2691e', '#00838f', '#c2185b', '#3b3b3b'];
export const playerColor = (i: number) => PLAYER_COLORS[i % PLAYER_COLORS.length];

/** Piazze dei mercanti sulla carta antica; Costantinopoli è oltremare, fuori dal bordo a oriente. */
export const PIAZZA_POS: Record<string, [number, number]> = {
  venezia: [552, 146], genova: [360, 300], pisa: [432, 358], amalfi: [752, 596], messina: [838, 782], costantinopoli: [1168, 600],
};

/** Disegni della merce, centrati sull'origine e larghi circa 22. */
const GOOD_ICON: Record<string, string> = {
  vino: `<ellipse cx="0" cy="0" rx="8" ry="10" fill="#8a5a2b" stroke="#3e2617" stroke-width="1.5"/>
    <path d="M-8 -4 h16 M-8 4 h16" stroke="#2b2118" stroke-width="2"/><ellipse cx="0" cy="0" rx="2.6" ry="3" fill="#7a1f3d"/>`,
  manufatti: `<rect x="-9" y="-7" width="18" height="14" rx="2" fill="#c9a46a" stroke="#3e2617" stroke-width="1.5"/>
    <path d="M-9 -1 h18 M0 -7 v14" stroke="#3e2617" stroke-width="1.5"/><path d="M-5 -10 h10 l-2 3 h-6z" fill="#4f7fa8"/>`,
};

/** Punto della curva (quadratica, un po' arcuata) fra a e b al tempo t. */
function curve(a: [number, number], b: [number, number]) {
  const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const c: [number, number] = [mx - dy * 0.18, my + dx * 0.18];
  const at = (t: number): [number, number] => [
    (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t ** 2 * b[0],
    (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t ** 2 * b[1],
  ];
  return { d: `M${a[0]} ${a[1]} Q${c[0]} ${c[1]} ${b[0]} ${b[1]}`, at };
}

/** Una carovana in viaggio sulla carta. `t`: a che punto della rotta (0 partenza, 1 arrivo). */
export interface Transit { from: [number, number]; to: [number, number]; t: number; color: string; good: string; label?: string }

/**
 * Le carovane in viaggio: prima tutte le rotte tratteggiate (chiare sotto, colorate sopra, così si
 * leggono su terra e mare), poi i tondi con la merce, cerchiati del colore di chi spedisce.
 * Un tondo che cadrebbe su un altro, su una città o su un medaglione scivola un poco lungo la sua rotta.
 */
export function transitRoutes(list: Transit[], avoid: [number, number, number][] = []): string {
  const taken = [...avoid];
  const free = (x: number, y: number) => taken.every(([ax, ay, r]) => Math.hypot(ax - x, ay - y) > r + 24);
  const lines: string[] = [], tokens: string[] = [];
  for (const r of list) {
    const k = curve(r.from, r.to);
    lines.push(`<path d="${k.d}" fill="none" stroke="#fff8e6" stroke-width="6" stroke-linecap="round" opacity=".85"/>
      <path d="${k.d}" fill="none" stroke="${r.color}" stroke-width="3" stroke-dasharray="10 7" stroke-linecap="round"/>`);
    const tries = [0, 0.07, -0.07, 0.14, -0.14, 0.21, -0.21].map(d => Math.min(0.9, Math.max(0.1, r.t + d)));
    const [x, y] = k.at(tries.find(t => free(...k.at(t))) ?? r.t);
    taken.push([x, y, 26]);
    tokens.push(`<g class="map-transit" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
      <circle r="17" fill="#fff8e6" stroke="${r.color}" stroke-width="4"/>${GOOD_ICON[r.good] ?? ''}
      ${r.label ? `<rect x="-26" y="19" width="52" height="15" rx="3" fill="#fff8e6" stroke="${r.color}" stroke-width="1.5"/><text y="30" text-anchor="middle" font-size="10" class="map-name">${r.label}</text>` : ''}
    </g>`);
  }
  return `<g class="map-routes">${lines.join('')}${tokens.join('')}</g>`;
}

/** Cosa i tondi devono scansare: i punti delle città e i medaglioni dei signori in gioco. */
export function mapObstacles(feudi: number[]): [number, number, number][] {
  return [
    ...MAP_POS.map(([x, y]): [number, number, number] => [x, y, 10]),
    ...feudi.map((f): [number, number, number] => [MAP_POS[f][0] + SIDE[f][0], MAP_POS[f][1] + SIDE[f][1] + 20, R + 22]),
  ];
}
