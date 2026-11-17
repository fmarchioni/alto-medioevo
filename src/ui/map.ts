/**
 * Carta del regno: una carta antica d'Italia (public/mappa-italia.jpg) con un
 * punto su ogni feudo e, di lato, un medaglione con il signore, il suo titolo
 * e il tesoro. Nel medaglione c'è il volto dipinto del signore (ui/volti); senza
 * volto, la veduta del reame.
 */
import { FEUDI, titleName, wealthIndex } from '../domain/rank';
import type { Player } from '../domain/types';
import { realmScene } from './realm';

/** Stesse proporzioni dell'immagine (1600x1073, dalla carta di grafica/mappa-italia-2.jpeg). */
const W = 1200, H = 805;
const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
export const MAP_IMAGE = `${BASE}mappa-italia.jpg`;
export const MAP_SIZE = { w: W, h: H };

/**
 * Dove sta ogni feudo sulla carta antica (solo disegno: le distanze di gioco
 * restano quelle di `FEUDO_POS` in domain/geography).
 */
export const MAP_POS: readonly [number, number][] = [
  [215, 225], // Taurinum
  [330, 200], // Mediolanum
  [440, 180], // Verona
  [527, 235], // Ravenna
  [600, 395], // Roma
  [790, 445], // Beneventum
  [725, 470], // Neapolis
  [870, 430], // Barium
  [625, 730], // Panormus
];

/** Dove va il medaglione rispetto al punto, per non coprire i vicini (verso il mare quando si può). */
const SIDE: readonly [number, number][] = [
  [-105, 105], [-80, -110], [15, -110], [113, 15], [-130, 65], [10, -115], [-105, 110], [130, -80], [-155, -60],
];
const R = 44;
/** Larghezza del cartiglio sotto il medaglione (nome e tesoro). */
const LABEL_W = 190;
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

/**
 * `markers`: SVG aggiunto sopra i reami (pedine e segni delle espansioni);
 * `idx`: indice in partita di ciascun signore (per il suo colore); `routes`: SVG sotto i medaglioni (rotte delle carovane);
 * `volti`: il volto dipinto di ciascun signore.
 */
export function renderRealmMap(players: Player[], markers = '', idx: number[] = players.map((_, k) => k), routes = '', volti: string[] = []): string {
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
    const LW = LABEL_W, ly = cy + R + 6;
    return `<g class="map-realm">
      <path d="M${px} ${py} L${cx} ${cy}" stroke="#2b2118" stroke-width="2"/>
      ${cityDot(px, py)}
      <clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>
      <circle cx="${cx}" cy="${cy}" r="${R + 5}" fill="#f6ead0" stroke="#5a3d26" stroke-width="2"/>
      <g clip-path="url(#${clip})">${volti[k]
        ? `<rect x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" fill="#2c4f96"/><image href="${volti[k]}" x="${cx - R * 1.24}" y="${cy - R * 1.24}" width="${2.48 * R}" height="${2.48 * R}"><title>${esc(p.name)}</title></image>`
        : realmScene(p, `reame di ${esc(p.name)}`, { x: cx - 100, y: cy - R, width: 200, height: 2 * R })}</g>
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
export const PLAYER_COLORS = ['#1f4e9c', '#b3202a', '#2e7d32', '#6a2c91', '#d2691e', '#00838f', '#c2185b', '#3b3b3b', '#9e9d24'];
export const playerColor = (i: number) => PLAYER_COLORS[i % PLAYER_COLORS.length];

/** Piazze dei mercanti sulla carta antica; Costantinopoli è oltremare: un cartello sul bordo a oriente. */
export const PIAZZA_POS: Record<string, [number, number]> = {
  venezia: [540, 138], genova: [350, 282], pisa: [425, 300], amalfi: [760, 505], messina: [845, 690], costantinopoli: [1122, 462],
};
const PIAZZA_NOME: Record<string, string> = {
  venezia: 'Venezia', genova: 'Genova', pisa: 'Pisa', amalfi: 'Amalfi', messina: 'Messina', costantinopoli: 'Costantinopoli',
};
/** Dove sta il cartello col nome della piazza rispetto al suo punto (verso il mare, lontano dai feudi). */
const PIAZZA_LABEL: Record<string, [number, number, 'start' | 'end' | 'middle']> = {
  venezia: [12, -10, 'start'], genova: [0, 26, 'middle'], pisa: [-12, 22, 'end'], amalfi: [-6, 26, 'end'],
  messina: [14, 18, 'start'], costantinopoli: [-12, 28, 'end'],
};

/** Gli ingombri di una piazza: il segno e il cartiglio col nome. */
function piazzaBoxes(id: string): Box[] {
  const [x, y] = PIAZZA_POS[id], [lx, ly, anchor] = PIAZZA_LABEL[id], w = (PIAZZA_NOME[id] ?? id).length * 10 + 10;
  const rx = anchor === 'start' ? x + lx - 5 : anchor === 'end' ? x + lx - w + 5 : x + lx - w / 2;
  return [[x - 12, y - 12, x + 12, y + 12], [rx, y + ly - 11, rx + w, y + ly + 4]];
}

/** Il segno di una piazza della fiera: un'ancora su un tondo chiaro e il nome in un cartiglio. */
function piazzaMark(id: string): string {
  const [x, y] = PIAZZA_POS[id], [lx, ly, anchor] = PIAZZA_LABEL[id], name = PIAZZA_NOME[id] ?? id;
  const w = name.length * 10 + 10, rx = anchor === 'start' ? x + lx - 5 : anchor === 'end' ? x + lx - w + 5 : x + lx - w / 2;
  const arrow = id === 'costantinopoli' ? `<path d="M${x + 12} ${y - 9} l12 9 l-12 9z" fill="#5a3d26"/>` : '';
  return `<g class="map-piazza">
    <circle cx="${x}" cy="${y}" r="9" fill="#fff8e6" stroke="#5a3d26" stroke-width="2"/>
    <path d="M${x} ${y - 5} v10 M${x - 4} ${y - 2} h8 M${x - 5} ${y + 2} q5 5 10 0" fill="none" stroke="#2b2118" stroke-width="1.6"/>${arrow}
    <rect x="${rx}" y="${y + ly - 11}" width="${w}" height="15" rx="3" fill="#fff8e6" fill-opacity=".95" stroke="#5a3d26" stroke-width="1.2"/>
    <text x="${x + lx}" y="${y + ly}" text-anchor="${anchor}" font-size="10" class="map-name">${name}</text>
  </g>`;
}

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
  return { d: `M${a[0]} ${a[1]} Q${c[0]} ${c[1]} ${b[0]} ${b[1]}`, at, c };
}

/** Punta di freccia colorata all'arrivo, appena prima del punto (la direzione è quella della curva in fondo). */
function arrowHead(c: [number, number], b: [number, number], color: string, back = 11): string {
  const [dx, dy] = [b[0] - c[0], b[1] - c[1]], len = Math.hypot(dx, dy) || 1, [ux, uy] = [dx / len, dy / len];
  const tip = [b[0] - ux * back, b[1] - uy * back], base = [tip[0] - ux * 14, tip[1] - uy * 14];
  const p = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  return `<path d="M${p(tip[0], tip[1])} L${p(base[0] - uy * 7, base[1] + ux * 7)} L${p(base[0] + uy * 7, base[1] - ux * 7)}z" fill="${color}" stroke="#fff8e6" stroke-width="1.5"/>`;
}

/**
 * Una carovana in viaggio sulla carta. `t`: a che punto della rotta (0 partenza, 1 arrivo);
 * `piazza`: la piazza della fiera a cui va, che sulla carta riceve il suo segno col nome.
 */
export interface Transit { from: [number, number]; to: [number, number]; t: number; color: string; good: string; label?: string; piazza?: string }

/**
 * Le carovane in viaggio: prima tutte le rotte tratteggiate (chiare sotto, colorate sopra, così si
 * leggono su terra e mare), poi i tondi con la merce, cerchiati del colore di chi spedisce.
 * Un tondo che cadrebbe su un altro, su una città o su un medaglione scivola un poco lungo la sua rotta.
 */
export function transitRoutes(list: Transit[], avoid: Box[] = []): string {
  const taken = [...avoid];
  const lines: string[] = [], tokens: string[] = [];
  const piazze = [...new Set(list.map(r => r.piazza).filter((p): p is string => !!p && !!PIAZZA_POS[p]))];
  for (const p of piazze) taken.push(...piazzaBoxes(p));
  // posti possibili lungo la rotta, dal più vicino a quello dell'anno; vince il primo libero, se no il meno coperto
  const steps = Array.from({ length: 20 }, (_, i) => 0.12 + i * 0.04);
  for (const r of list) {
    const k = curve(r.from, r.to);
    lines.push(`<path d="${k.d}" fill="none" stroke="#fff8e6" stroke-width="7" stroke-linecap="round" opacity=".85"/>
      <path d="${k.d}" fill="none" stroke="${r.color}" stroke-width="3.5" stroke-dasharray="10 7" stroke-linecap="round"/>
      ${arrowHead(k.c, r.to, r.color)}`);
    const lw = r.label ? labelWidth(r.label) : 0;
    const box = ([x, y]: [number, number]): Box => [x - Math.max(20, lw / 2) - 3, y - 20, x + Math.max(20, lw / 2) + 3, y + (r.label ? 38 : 20)];
    const cost = (t: number) => taken.reduce((a, b) => a + overlap(box(k.at(t)), b), 0) + Math.abs(t - r.t) * 40;
    const t = [...steps].sort((a, b) => cost(a) - cost(b))[0];
    const [x, y] = k.at(t);
    taken.push(box([x, y]));
    tokens.push(`<g class="map-transit" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
      <circle r="17" fill="#fff8e6" stroke="${r.color}" stroke-width="4"/>${GOOD_ICON[r.good] ?? ''}
      ${r.label ? transitLabel(r.label, r.color) : ''}
    </g>`);
  }
  return `<g class="map-routes">${lines.join('')}${piazze.map(piazzaMark).join('')}${tokens.join('')}</g>`;
}

/** Un ingombro sulla carta: [x0, y0, x1, y1]. */
export type Box = [number, number, number, number];
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/** Larghezza del cartiglio con la quantità (font C64: ogni carattere è largo quanto il corpo). */
const labelWidth = (text: string) => text.length * 10 + 14;
/** Il cartiglio con la quantità sotto il tondo, largo quanto il testo. */
function transitLabel(text: string, color: string): string {
  const w = labelWidth(text);
  return `<rect x="${-w / 2}" y="19" width="${w}" height="16" rx="3" fill="#fff8e6" stroke="${color}" stroke-width="2"/><text y="31" text-anchor="middle" font-size="10" class="map-name">${text}</text>`;
}

/** Cosa i tondi devono scansare: i punti delle città, i medaglioni dei signori in gioco e i loro cartigli. */
export function mapObstacles(feudi: number[]): Box[] {
  return [
    ...MAP_POS.map(([x, y]): Box => [x - 10, y - 10, x + 10, y + 10]),
    ...feudi.flatMap((f): Box[] => {
      const cx = MAP_POS[f][0] + SIDE[f][0], cy = MAP_POS[f][1] + SIDE[f][1];
      return [[cx - R - 5, cy - R - 5, cx + R + 5, cy + R + 5], [cx - LABEL_W / 2, cy + R + 6, cx + LABEL_W / 2, cy + R + 44]];
    }),
  ];
}
