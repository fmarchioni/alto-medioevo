/**
 * "Lo reame" disegnato: una veduta del feudo generata dallo stato del signore.
 * - magazzini proporzionali al grano, un banco per mercato, un mulino per opificio, un granaio per granaio
 * - palazzo che cresce con i piani, campi proporzionali agli acri
 * - una casetta ogni 100 servi (oltre 600 case, ogni casa vale di più)
 * - ogni 5 edifici uguali se ne disegna uno più grande, ogni 10 uno ancora più grande: così entrano tutti
 * - aspetto in rovina con i debiti, florido con le casse piene
 * La disposizione usa un generatore locale seminato dal feudo: stabile tra un
 * anno e l'altro e indipendente dalla sequenza casuale della partita.
 */
import { Mulberry32 } from '../domain/rng';
import { FEUDI, titleName } from '../domain/rank';
import type { Player } from '../domain/types';
import { honorific } from './advisor';
import { pick } from './speaker';

export type RealmCondition = 'rovina' | 'modesto' | 'florido';

export const SERVI_PER_CASA = 100;
export const MAX_CASE = 600;
export const GRANO_PER_MAGAZZINO = 4000;
export const MAX_MAGAZZINI = 8;

export function realmCondition(p: Player): RealmCondition {
  if (p.scudi < 0) return 'rovina';
  if (p.scudi >= 5000) return 'florido';
  return 'modesto';
}

export interface RealmCounts {
  case: number;
  serviPerCasa: number;
  magazzini: number;
  mercati: number;
  opifici: number;
  granai: number;
  campi: number;
  piani: number;
}

export function realmCounts(p: Player): RealmCounts {
  const servi = Math.max(0, p.servi);
  const serviPerCasa = Math.max(SERVI_PER_CASA, Math.ceil(servi / MAX_CASE / 50) * 50);
  return {
    case: Math.min(MAX_CASE, Math.round(servi / serviPerCasa)),
    serviPerCasa,
    magazzini: p.grano > 0 ? Math.min(MAX_MAGAZZINI, Math.ceil(p.grano / GRANO_PER_MAGAZZINO)) : 0,
    mercati: p.mercato - 1,
    opifici: p.opificio - 1,
    granai: p.granai ?? 0,
    campi: Math.min(24, Math.round(p.acri / 100)),
    piani: p.palazzo,
  };
}

/** Edifici da disegnare: uno grande (3) ogni 10, uno medio (2) ogni 5, poi i piccoli (1). */
export function tiers(n: number): (1 | 2 | 3)[] {
  const big = Math.floor(n / 10), mid = Math.floor((n % 10) / 5), small = n % 5;
  return [...Array<3>(big).fill(3), ...Array<2>(mid).fill(2), ...Array<1>(small).fill(1)];
}
const TIER_SCALE = { 1: 1, 2: 1.3, 3: 1.65 } as const;

// ---------------------------------------------------------------- palette

interface Palette { sky: [string, string]; hill: string; hill2: string; ground: string; wall: string; roof: string; stone: string; field: string }
const PALETTE: Record<RealmCondition, Palette> = {
  florido: { sky: ['#6fb3e8', '#d9eefb'], hill: '#7fb05a', hill2: '#6a9a48', ground: '#8cbf63', wall: '#efdcae', roof: '#b8402c', stone: '#b9b1a0', field: '#d9b84a' },
  modesto: { sky: ['#93aec4', '#dfe6e8'], hill: '#8fa463', hill2: '#7a8f52', ground: '#94a868', wall: '#d9c49a', roof: '#8b5a3c', stone: '#a39a88', field: '#c9a95a' },
  rovina: { sky: ['#5d6068', '#a9a49a'], hill: '#7d7a5a', hill2: '#6b6848', ground: '#857d5a', wall: '#a8987a', roof: '#5a4a3e', stone: '#8a8274', field: '#8f8058' },
};

// ---------------------------------------------------------------- elementi

function house(x: number, y: number, s: number, c: RealmCondition, pal: Palette, smoke: boolean): string {
  const w = 14 * s, h = 9 * s;
  const roof = c === 'rovina'
    ? `<path d="M${x - 2} ${y - h} L${x + w * 0.35} ${y - h - 7 * s} L${x + w * 0.5} ${y - h - 3 * s} M${x + w * 0.62} ${y - h - 5 * s} L${x + w + 2} ${y - h}" fill="none" stroke="${pal.roof}" stroke-width="${2.2 * s}"/>
       <path d="M${x + w * 0.35} ${y - h - 7 * s} L${x + w * 0.5} ${y - h - 3 * s} L${x + w * 0.62} ${y - h - 5 * s}" stroke="#2b2118" stroke-width="1" fill="none"/>`
    : `<path d="M${x - 2} ${y - h} L${x + w / 2} ${y - h - 7 * s} L${x + w + 2} ${y - h}z" fill="${pal.roof}"/>`;
  const crack = c === 'rovina' ? `<path d="M${x + 3} ${y - h + 2} l3 3 -2 3" stroke="#4a3e30" stroke-width="1" fill="none"/>` : '';
  const chimney = smoke
    ? `<rect x="${x + w * 0.7}" y="${y - h - 6 * s}" width="${2.5 * s}" height="${5 * s}" fill="#6b5a47"/><path class="r-smoke" d="M${x + w * 0.75} ${y - h - 7 * s} q-3 -5 0 -9 t0 -8" stroke="#e6e2da" stroke-width="2" fill="none" opacity=".7"/>`
    : '';
  return `<g>${chimney}<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="${pal.wall}" stroke="#6b5a47" stroke-width=".8"/>${roof}${crack}
    <rect x="${x + w / 2 - 2 * s}" y="${y - 5 * s}" width="${4 * s}" height="${5 * s}" fill="#5a3d26"/></g>`;
}

function granary(x: number, y: number, full: number, c: RealmCondition, pal: Palette): string {
  const sacks = Math.max(0, Math.min(3, Math.round(full * 3)));
  const roof = c === 'rovina'
    ? `<path d="M${x - 3} ${y - 22} L${x + 8} ${y - 34} M${x + 18} ${y - 32} L${x + 31} ${y - 22}" stroke="${pal.roof}" stroke-width="4"/>`
    : `<path d="M${x - 3} ${y - 22} L${x + 14} ${y - 36} L${x + 31} ${y - 22}z" fill="${pal.roof}"/>`;
  return `<g><rect x="${x}" y="${y - 22}" width="28" height="22" fill="#a8844f" stroke="#5a3d26"/>
    <path d="M${x} ${y - 15} h28 M${x} ${y - 8} h28" stroke="#8a6b3e"/>${roof}
    <rect x="${x + 10}" y="${y - 13}" width="8" height="13" fill="#4a3424"/>
    ${[...Array(sacks)].map((_, i) => `<ellipse cx="${x + 3 + i * 7}" cy="${y + 3}" rx="4" ry="3.5" fill="#d6b25a" stroke="#8a6b3e"/>`).join('')}</g>`;
}

function stall(x: number, y: number, c: RealmCondition): string {
  const awning = c === 'rovina' ? '#7a6a5a' : c === 'florido' ? '#c94a2e' : '#a8603a';
  const torn = c === 'rovina' ? `<path d="M${x + 14} ${y - 22} l3 6 -4 3" stroke="#2b2118" fill="none"/>` : '';
  return `<g><path d="M${x} ${y - 20} h28 l-3 -6 h-22z" fill="${awning}"/>
    <path d="M${x} ${y - 20} q3.5 4 7 0 q3.5 4 7 0 q3.5 4 7 0 q3.5 4 7 0" fill="#e3c070"/>${torn}
    <path d="M${x + 2} ${y - 20} v20 M${x + 26} ${y - 20} v20" stroke="#5a3d26" stroke-width="2"/>
    <rect x="${x + 3}" y="${y - 9}" width="22" height="6" fill="#8a6b3e"/>
    ${c !== 'rovina' ? `<circle cx="${x + 8}" cy="${y - 11}" r="2" fill="#c94a2e"/><circle cx="${x + 14}" cy="${y - 11}" r="2" fill="#e3bb4f"/><circle cx="${x + 20}" cy="${y - 11}" r="2" fill="#6f8f4e"/>` : ''}</g>`;
}

function mill(x: number, y: number, pal: Palette, c: RealmCondition): string {
  return `<g><rect x="${x}" y="${y - 20}" width="22" height="20" fill="${pal.wall}" stroke="#6b5a47"/>
    <path d="M${x - 3} ${y - 20} L${x + 11} ${y - 31} L${x + 25} ${y - 20}z" fill="${pal.roof}"/>
    <g transform="translate(${x + 27} ${y - 8})"><g class="${c === 'rovina' ? '' : 'wheel'}"><circle r="9" fill="none" stroke="#6b4a2c" stroke-width="2.5"/>
      <path d="M0 -9 v18 M-9 0 h18 M-6.4 -6.4 l12.8 12.8 M-6.4 6.4 l12.8 -12.8" stroke="#6b4a2c" stroke-width="1.6"/></g></g></g>`;
}

/** Palazzo che cresce con i piani (0-11). */
function palace(cx: number, base: number, levels: number, c: RealmCondition, pal: Palette): string {
  const bodyW = 64 + Math.min(levels, 6) * 6;
  const bodyH = 28 + levels * 6;
  const x = cx - bodyW / 2, top = base - bodyH;
  const merlons = (x0: number, w: number, y: number) =>
    [...Array(Math.floor(w / 9))].map((_, i) => (c === 'rovina' && i % 3 === 1 ? '' : `<rect x="${x0 + i * 9}" y="${y - 6}" width="5" height="6" fill="${pal.stone}" stroke="#5f584c" stroke-width=".6"/>`)).join('');
  const windows = [...Array(Math.max(1, Math.floor(levels / 2) + 1))].map((_, row) =>
    [0, 1, 2].map(col => {
      const wx = x + 12 + col * ((bodyW - 30) / 2), wy = top + 10 + row * 12;
      if (wy > base - 22) return '';
      const lit = c === 'rovina' ? '#2b2118' : '#ffd36a';
      return `<path d="M${wx} ${wy + 8} v-5 a3 3 0 0 1 6 0 v5z" fill="${lit}"/>`;
    }).join('')).join('');
  const tower = (tx: number, h: number) => `<rect x="${tx}" y="${base - h}" width="20" height="${h}" fill="${pal.stone}" stroke="#5f584c"/>${merlons(tx, 22, base - h)}
    <path d="M${tx - 2} ${base - h - 6} L${tx + 10} ${base - h - 22} L${tx + 22} ${base - h - 6}z" fill="${c === 'rovina' ? '#4a4038' : pal.roof}"/>`;
  const flag = (fx: number, fy: number) => (c === 'rovina' ? '' : `<path d="M${fx} ${fy} v-16" stroke="#3e2617" stroke-width="1.5"/><path class="a-flag" d="M${fx} ${fy - 16} h14 l-4 4 4 4 h-14z" fill="${c === 'florido' ? '#c94a2e' : '#8a6b3e'}"/>`);
  const cracks = c === 'rovina' ? `<path d="M${x + 10} ${top + 6} l6 10 -4 8 6 10 M${x + bodyW - 14} ${top + 12} l-5 9 4 7" stroke="#3e352c" stroke-width="1.3" fill="none"/>
    <path d="M${x - 10} ${base} l6 -5 5 2 4 -4 6 7z" fill="#8a8274"/>` : '';
  return `<g>
    ${levels >= 3 ? tower(x - 18, bodyH + 14) : ''}${levels >= 6 ? tower(x + bodyW - 2, bodyH + 14) : ''}
    <rect x="${x}" y="${top}" width="${bodyW}" height="${bodyH}" fill="${pal.stone}" stroke="#5f584c"/>${merlons(x, bodyW, top)}
    ${windows}
    <path d="M${cx - 8} ${base} v-14 a8 8 0 0 1 16 0 v14z" fill="#4a3424"/>
    ${levels >= 9 ? `<rect x="${cx - 9}" y="${top - 26}" width="18" height="26" fill="${pal.stone}" stroke="#5f584c"/><path d="M${cx - 12} ${top - 26} L${cx} ${top - 46} L${cx + 12} ${top - 26}z" fill="${c === 'rovina' ? '#4a4038' : levels >= 11 ? '#d6b25a' : pal.roof}"/>` : ''}
    ${flag(cx, levels >= 9 ? top - 46 : top - 6)}${levels >= 3 ? flag(x - 8, base - bodyH - 36) : ''}${levels >= 6 ? flag(x + bodyW + 8, base - bodyH - 36) : ''}
    ${cracks}</g>`;
}

// ---------------------------------------------------------------- scena

/** Riquadro in cui annidare la veduta dentro un altro SVG (mappa del regno). */
export interface SceneBox { x: number; y: number; width: number; height: number }

export function realmScene(p: Player, label = 'veduta del reame', box?: SceneBox): string {
  const c = realmCondition(p);
  const pal = PALETTE[c];
  const k = realmCounts(p);
  const rnd = new Mulberry32(p.feudo * 7919 + 17);
  const r = () => rnd.next();

  // cielo e atmosfera
  const sky = `<defs><linearGradient id="rs-sky-${c}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.sky[0]}"/><stop offset="1" stop-color="${pal.sky[1]}"/></linearGradient></defs>
    <rect width="640" height="300" fill="url(#rs-sky-${c})"/>`;
  const weather = c === 'rovina'
    ? [60, 250, 470].map((x, i) => `<g class="r-cloud" style="animation-delay:${i * 1.3}s"><ellipse cx="${x}" cy="${30 + i * 8}" rx="60" ry="16" fill="#6e6c70"/><ellipse cx="${x + 40}" cy="${24 + i * 8}" rx="40" ry="14" fill="#7a787c"/></g>`).join('')
      + [0, 1, 2].map(i => `<path class="r-crow" style="animation-delay:${i * 0.8}s" d="M${380 + i * 40} ${50 + i * 12} q5 -5 10 0 q5 -5 10 0" stroke="#1e1a18" stroke-width="2" fill="none"/>`).join('')
    : `<circle cx="560" cy="48" r="${c === 'florido' ? 24 : 18}" fill="${c === 'florido' ? '#ffe680' : '#f3ecc8'}" class="${c === 'florido' ? 'a-glow' : ''}"/>`
      + (c === 'modesto' ? `<ellipse cx="160" cy="40" rx="50" ry="13" fill="#eef2f4"/><ellipse cx="420" cy="58" rx="40" ry="10" fill="#eef2f4"/>` : '');

  // colline e campi (uno ogni 100 acri)
  const hills = `<path d="M0 135 Q120 98 240 126 T480 118 T640 124 V300 H0z" fill="${pal.hill}"/>
    <path d="M0 160 Q160 140 320 158 T640 150 V300 H0z" fill="${pal.hill2}"/>`;
  const fieldSlots: [number, number][] = [];
  for (let i = 0; i < 24; i++) {
    const side = i % 2 === 0 ? 0 : 1;
    const col = Math.floor(i / 2) % 6, row = Math.floor(i / 12);
    fieldSlots.push([side === 0 ? 20 + col * 36 : 410 + col * 36, 124 + row * 13 + (side ? -4 : 0)]);
  }
  const fields = fieldSlots.slice(0, k.campi).map(([x, y], i) =>
    `<path d="M${x} ${y} l30 -2 l2 10 l-30 2z" fill="${i % 3 === 0 ? pal.field : i % 3 === 1 ? pal.hill2 : '#b59a4a'}" stroke="#6b5a47" stroke-width=".5" opacity="${c === 'rovina' ? 0.7 : 0.95}"/>`).join('');

  // fiume con i mulini (uno per opificio)
  const river = `<path d="M430 300 C470 260 540 250 640 226 V246 C560 268 500 278 470 300z" fill="${c === 'rovina' ? '#6c7f8a' : '#5b93c2'}"/>`;
  const millSlots: [number, number][] = [[452, 270], [500, 256], [548, 246], [596, 236], [470, 296], [520, 284], [570, 274], [616, 262]];
  const mills = tiers(k.opifici).slice(0, millSlots.length).map((t, i) => {
    const [x, y] = millSlots[i], s = TIER_SCALE[t];
    return `<g transform="translate(${x - 20} ${y - 4}) scale(${s})">${mill(0, 0, pal, c)}</g>`;
  }).join('');

  // magazzini a sinistra (uno ogni 4000 misure), mercati a destra
  const granaries = [...Array(k.magazzini)].map((_, i) => {
    const full = i < k.magazzini - 1 ? 1 : ((p.grano - 1) % GRANO_PER_MAGAZZINO) / GRANO_PER_MAGAZZINO + 0.01;
    return `<g transform="translate(${12 + i * 29} 200) scale(.82)">${granary(0, 0, full, c, pal)}</g>`;
  }).join('');
  // mercati: in fila da sinistra, i grandi per primi; si va a capo quando la fila è piena
  let mx = 420, my = 200;
  const markets = tiers(k.mercati).map(t => {
    const s = TIER_SCALE[t];
    if (mx + 30 * s > 636) { mx = 420; my += 24; }
    const out = `<g transform="translate(${mx} ${my}) scale(${s})">${stall(0, 0, c)}</g>`;
    mx += 32 * s;
    return out;
  }).join('');
  // granai costruiti (commercio del grano): sopra i magazzini
  let gx = 14;
  const barns = tiers(k.granai).map(t => {
    const s = TIER_SCALE[t] * 0.9;
    const out = `<g transform="translate(${gx} 178) scale(${s})">${granary(0, 0, 1, c, pal)}</g>`;
    gx += 34 * s;
    return out;
  }).join('');

  // case dei servi: griglia irregolare nella piana
  const houses: string[] = [];
  const houseTiers = tiers(k.case);
  const cols = 15;
  let slot = 0;
  for (const t of houseTiers) {
    let x = 0, y = 0;
    // posto libero nella piana, lontano dal fiume
    for (;;) {
      const row = Math.floor(slot / cols), col = slot % cols;
      x = 14 + col * 27 + (row % 2) * 12 + r() * 6;
      y = 238 + row * 17 + r() * 4;
      slot++;
      if (x <= 420 - (y - 230) * 0.6 || row > 4) break;
    }
    if (y > 300) { x = 180 + (slot % 8) * 26; y = 222; }
    houses.push(house(x, y, (0.9 + r() * 0.2) * TIER_SCALE[t], c, pal, c === 'florido' && r() < 0.35));
  }

  const ruinExtras = c === 'rovina'
    ? `<path d="M250 210 l8 -6 6 3 5 -5 7 8z M330 286 l7 -5 5 2 6 -6 6 9z" fill="#7a7266"/>`
    : '';
  const prosperity = c === 'florido'
    ? [120, 300, 520].map(x => `<g><path d="M${x} 166 v-18" stroke="#5a3d26" stroke-width="1.5"/><path class="a-flag" d="M${x} 148 h12 l-3 3 3 3 h-12z" fill="#d6b25a"/></g>`).join('')
    : '';

  const outer = box
    ? `<svg x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" viewBox="0 0 640 300" class="realm-thumb" role="img" aria-label="${label}">`
    : `<svg viewBox="0 0 640 300" class="realm-scene" role="img" aria-label="${label}">`;
  return `${outer}
    ${sky}${weather}${hills}${fields}
    ${palace(320, 176, k.piani, c, pal)}
    ${prosperity}${river}${barns}${granaries}${markets}${mills}${houses.join('')}${ruinExtras}
  </svg>`;
}

// ---------------------------------------------------------------- testi e vista

export function realmComment(p: Player): string {
  const h = honorific(p);
  const c = realmCondition(p);
  if (c === 'rovina') {
    return pick([
      `${h}, i debiti si vedono: tetti sfondati, muri crepati, e i corvi girano sopra il palazzo. Bisogna rimettere in sesto le casse.`,
      `Il reame soffre, ${h}. Gli usurai bussano e il popolo ripara i tetti con la paglia. Un anno di buone rendite rimetterebbe le cose a posto.`,
    ]);
  }
  if (c === 'florido') {
    return pick([
      `Guardate, ${h}: stendardi al vento, comignoli che fumano, granai pieni. Il reame prospera come mai prima!`,
      `Che splendore, ${h}! Le casse piene si vedono da lontano: i mercanti fanno a gara per venire nel vostro feudo.`,
    ]);
  }
  return pick([
    `Ecco il vostro reame, ${h}: dignitoso, ma con qualche scudo in più nelle casse brillerebbe di ben altra luce.`,
    `Il feudo tira avanti, ${h}. Né miseria né splendore: casse un po' più piene farebbero fiorire ogni cosa.`,
  ]);
}

export function realmLegend(p: Player): string {
  const k = realmCounts(p);
  const n = (v: number) => Math.floor(v).toLocaleString('it-IT');
  const items: [string, string][] = [
    ['Case', `${k.case} (1 ogni ${k.serviPerCasa} servi, ${n(Math.max(0, p.servi))} in tutto)`],
    ['Magazzini', `${k.magazzini} (${n(p.grano)} misure di grano)`],
    ...(p.granai !== undefined ? [['Granai', `${k.granai}`] as [string, string]] : []),
    ['Mercati', `${k.mercati}`],
    ['Opifici', `${k.opifici}${k.opifici >= 75 ? ' (ne sono disegnati 70)' : ''}`],
    ['Grandezza', 'medio = 5, grande = 10 edifici'],
    ['Palazzo', `${k.piani} piani su 11`],
    ['Campi', `${n(p.acri)} acri`],
    ['Tesoro', `${n(p.scudi)} scudi`],
  ];
  return `<dl class="realm-legend">${items.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>`;
}

export function realmHeading(p: Player, year: number): string {
  const safe = p.name.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
  return `${titleName(p.title)} ${safe} da ${FEUDI[p.feudo]} · anno ${year}`;
}
