/**
 * Carta del regno: tutti i reami disegnati sulla penisola, ciascuno nella
 * posizione (schematica) del proprio feudo, con titolo, nome e tesoro.
 */
import { FEUDO_POS } from '../domain/geography';
import { FEUDI, titleName, wealthIndex } from '../domain/rank';
import type { Player } from '../domain/types';
import { realmScene } from './realm';

const W = 1100, H = 760;
const THUMB_W = 200, THUMB_H = 94;

/** Posizioni dei feudi (centro della miniatura), dal dominio. */
const POS = FEUDO_POS;
export const MAP_SIZE = { w: W, h: H };
export const THUMB = { w: THUMB_W, h: THUMB_H };

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const n = (v: number) => Math.floor(v).toLocaleString('it-IT');

/** Testo che non supera la larghezza: con il font C64 ogni carattere è largo quanto il corpo. */
function fitText(x: number, y: number, text: string, size: number, maxW: number, cls: string): string {
  const fit = text.length * size > maxW ? ` textLength="${maxW}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="${x}" y="${y}" text-anchor="middle" class="${cls}" font-size="${size}"${fit}>${text}</text>`;
}

export const LAND_PATH = `M0 0 H1100 V190 L980 230 L900 300 L860 420 L1000 560 L1100 650 V760 H900 L820 720 L760 640 L640 560 L560 470 L470 400 L400 410 L300 420 L200 430 L120 470 L0 480 Z M330 600 L600 585 L640 610 L560 720 L470 700 L360 680 Z`;

function compass(x: number, y: number): string {
  return `<g transform="translate(${x} ${y})" class="map-compass">
    <circle r="34" fill="none" stroke="#8a6b3e" stroke-width="2"/>
    <path d="M0 -42 L7 0 L0 42 L-7 0z" fill="#8b2a1e"/><path d="M-42 0 L0 -7 L42 0 L0 7z" fill="#5a3d26"/>
    <text y="-48" text-anchor="middle" font-size="14" class="map-sea">N</text></g>`;
}

/** `markers`: SVG aggiunto sopra i reami (pedine e segni delle espansioni). */
export function renderRealmMap(players: Player[], year: number, markers = ''): string {
  const leader = players.reduce((a, b) => (wealthIndex(b) > wealthIndex(a) ? b : a), players[0]);
  const used = new Set(players.map(p => p.feudo));
  const empty = POS.map(([x, y], i) => (used.has(i) ? '' : `<g class="map-empty"><circle cx="${x}" cy="${y}" r="7" fill="#8a6b3e"/>
    <text x="${x}" y="${y + 24}" text-anchor="middle" font-size="12" class="map-city">${FEUDI[i]}</text></g>`)).join('');
  const realms = players.map(p => {
    const [cx, cy] = POS[p.feudo];
    const x = cx - THUMB_W / 2, y = cy - THUMB_H / 2;
    const crown = p === leader && players.length > 1
      ? `<path d="M${cx - 16} ${y - 4} l4 -14 6 8 6 -12 6 12 6 -8 4 14z" fill="#e3bb4f" stroke="#8a6420" stroke-width="1.5"/>` : '';
    const money = `${n(p.scudi)} scudi`;
    return `<g class="map-realm">
      <rect x="${x - 4}" y="${y - 4}" width="${THUMB_W + 8}" height="${THUMB_H + 46}" rx="4" fill="#f6ead0" stroke="#5a3d26" stroke-width="2"/>
      ${realmScene(p, `reame di ${esc(p.name)}`, { x, y, width: THUMB_W, height: THUMB_H })}
      <rect x="${x}" y="${y}" width="${THUMB_W}" height="${THUMB_H}" fill="none" stroke="#2b2118" stroke-width="1.5"/>
      ${fitText(cx, y + THUMB_H + 17, `${titleName(p.title)} ${esc(p.name)}`, 12, THUMB_W - 6, 'map-name')}
      ${fitText(cx, y + THUMB_H + 34, `${FEUDI[p.feudo]} - ${money}`, 11, THUMB_W - 6, p.scudi < 0 ? 'map-money debt' : 'map-money')}
      ${crown}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="realm-map" role="img" aria-label="carta del regno con i reami di tutti i signori">
    <rect width="${W}" height="${H}" fill="#7fa9c9"/>
    ${[...Array(10)].map((_, i) => `<path d="M${40 + i * 110} ${560 + (i % 3) * 50} q12 -8 24 0 t24 0" stroke="#a9c8de" stroke-width="2" fill="none"/>`).join('')}
    <path d="${LAND_PATH}" fill="#e9dcb4" stroke="#8a6b3e" stroke-width="3"/>
    ${[...Array(14)].map((_, i) => `<path d="M${20 + i * 80} 34 l18 -26 18 26z" fill="#c9bfa4" stroke="#8a7f68"/><path d="M${32 + i * 80} 16 l6 -8 6 8z" fill="#fff"/>`).join('')}
    <text x="250" y="505" text-anchor="middle" font-size="22" class="map-sea">MARE TYRRHENUM</text>
    <text x="1000" y="330" text-anchor="middle" font-size="18" class="map-sea">MARE</text>
    <text x="1000" y="352" text-anchor="middle" font-size="18" class="map-sea">ADRIATICUM</text>
    ${compass(80, 680)}
    <g transform="translate(250 560)"><rect x="-170" y="-34" width="340" height="52" rx="6" fill="#f6ead0" stroke="#8b2a1e" stroke-width="3"/>
      <text text-anchor="middle" font-size="20" y="-4" class="map-title">CARTA DEL REGNO</text>
      <text text-anchor="middle" font-size="13" y="12" class="map-sub">anno del Signore ${year}</text></g>
    ${empty}${realms}${markers}
  </svg>`;
}
