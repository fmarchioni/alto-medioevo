/**
 * Siparietto di fine anno: quando tutti i signori hanno chiuso l'anno, cala
 * il sipario e un giullare proclama la cronaca dell'anno trascorso.
 * Solo presentazione: confronta un'istantanea di inizio anno con lo stato attuale.
 */
import { FEUDI, titleName, wealthIndex } from '../domain/rank';
import type { GameState, Player } from '../domain/types';
import { renderRealmMap } from './map';
import { pick } from './speaker';

export interface PlayerSnapshot {
  scudi: number;
  servi: number;
  grano: number;
  acri: number;
  mercato: number;
  opificio: number;
  palazzo: number;
  title: number;
  ka: number;
}

export interface YearSnapshot {
  q: number;
  players: PlayerSnapshot[];
}

export interface PlayerChronicle {
  name: string;
  delta: { scudi: number; servi: number; grano: number; acri: number; ka: number };
  built: string[];
  events: string[];
  promotedTo: string | null;
}

export interface Interlude {
  year: number;
  nextYear: number;
  proclamation: string;
  players: PlayerChronicle[];
  /** carta del regno con tutti i reami a fine anno (SVG già pronto) */
  map: string;
  closing: boolean;
}

const n = (v: number) => Math.abs(Math.floor(v)).toLocaleString('it-IT');

export function snapshot(state: GameState): YearSnapshot {
  return {
    q: state.q,
    players: state.players.map(p => ({
      scudi: p.scudi, servi: p.servi, grano: p.grano, acri: p.acri,
      mercato: p.mercato, opificio: p.opificio, palazzo: p.palazzo, title: p.title, ka: wealthIndex(p),
    })),
  };
}

/** Imprevisti dell'anno, ricavati dal registro delle cronache ("900 · nome: evento: Peste"). */
function eventsOf(log: string[], year: number, name: string): string[] {
  const prefix = `${year} · ${name}: evento: `;
  return log.filter(l => l.startsWith(prefix)).map(l => l.slice(prefix.length));
}

function fullName(p: Player): string {
  return `${titleName(p.title)} ${p.name} da ${FEUDI[p.feudo]}`;
}

export function buildInterlude(before: YearSnapshot, state: GameState, mapMarkers = ''): Interlude {
  const year = 900 + before.q;
  const players = state.players.map((p, i): PlayerChronicle => {
    const b = before.players[i];
    const built: string[] = [];
    if (p.acri > b.acri) built.push(`${n(p.acri - b.acri)} acri`);
    if (p.mercato > b.mercato) built.push(`${p.mercato - b.mercato} ${p.mercato - b.mercato === 1 ? 'mercato' : 'mercati'}`);
    if (p.opificio > b.opificio) built.push(`${p.opificio - b.opificio} ${p.opificio - b.opificio === 1 ? 'opificio' : 'opifici'}`);
    if (p.palazzo > b.palazzo) built.push(`${p.palazzo - b.palazzo} ${p.palazzo - b.palazzo === 1 ? 'piano' : 'piani'} di palazzo`);
    return {
      name: fullName(p),
      delta: { scudi: p.scudi - b.scudi, servi: p.servi - b.servi, grano: p.grano - b.grano, acri: p.acri - b.acri, ka: wealthIndex(p) - b.ka },
      built,
      events: eventsOf(state.log, year, p.name),
      promotedTo: p.title !== b.title ? titleName(p.title) : null,
    };
  });
  return { year, nextYear: year + 1, proclamation: proclaim(year, players), players, map: renderRealmMap(state.players, year, mapMarkers), closing: false };
}

function proclaim(year: number, players: PlayerChronicle[]): string {
  const lines = [pick([
    `Udite, udite! Si chiude l'anno del Signore ${year}!`,
    `Genti del feudo, ascoltate: l'anno ${year} è giunto al termine!`,
    `Suonino le campane: l'anno ${year} se ne va, e la neve copre i campi!`,
  ])];
  if (players.length > 1) {
    const best = players.reduce((a, b) => (b.delta.ka > a.delta.ka ? b : a));
    lines.push(pick([
      `Il più accorto fra i signori è stato ${best.name}, che ha accresciuto la sua ricchezza di ${n(best.delta.ka)}.`,
      `Lode a ${best.name}: nessuno quest'anno ha fatto fruttare il proprio feudo con tanta saggezza.`,
    ]));
  } else {
    const p = players[0];
    lines.push(Math.floor(p.delta.ka) === 0
      ? pick(['Né guadagni né perdite: il feudo ha tenuto, e non è poco.', 'Un anno quieto: la ricchezza del feudo è rimasta quella che era.'])
      : p.delta.ka > 0
      ? pick([`Il feudo prospera: la ricchezza è cresciuta di ${n(p.delta.ka)}.`, `Anno buono per il vostro casato: ${n(p.delta.ka)} di ricchezza in più.`])
      : pick([`Anno amaro: la ricchezza è calata di ${n(p.delta.ka)}.`, `Il feudo ha patito: ${n(p.delta.ka)} di ricchezza perduta.`]));
  }
  const promoted = players.filter(p => p.promotedTo);
  if (promoted.length) lines.push(`Onore e gloria: ${promoted.map(p => p.name).join(', ')} ${promoted.length === 1 ? 'sale' : 'salgono'} di rango!`);
  const plague = players.some(p => p.events.includes('Peste'));
  if (plague) lines.push('Preghiamo per le anime portate via dal morbo.');
  lines.push(pick([
    `Che l'anno ${year + 1} porti raccolti abbondanti e nemici lontani!`,
    `E ora, signori, riposate: l'anno ${year + 1} vi attende con nuove sfide.`,
    `Brindiamo al ${year + 1}, e che la Provvidenza vegli sui vostri granai!`,
  ]));
  return lines.join(' ');
}

// ---------------------------------------------------------------- vista

const winterScene = `
<svg viewBox="0 0 320 150" class="interlude-scene" role="img" aria-label="notte d'inverno al castello, un giullare fa il giocoliere">
  <defs><linearGradient id="iw-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#141a3a"/><stop offset="1" stop-color="#3d4a7a"/></linearGradient></defs>
  <rect width="320" height="150" fill="url(#iw-sky)"/>
  <circle cx="270" cy="28" r="13" fill="#f3ecc8"/><circle cx="276" cy="24" r="12" fill="#141a3a" opacity=".25"/>
  ${[20, 60, 110, 150, 205, 235, 300].map((x, i) => `<circle class="a-twinkle" style="animation-delay:${i * 0.27}s" cx="${x}" cy="${12 + (i % 3) * 11}" r="1.4" fill="#fff"/>`).join('')}
  <path d="M0 120 Q80 108 160 116 T320 112 V150 H0z" fill="#e8eef5"/>
  <g transform="translate(176 118)">
    <rect x="0" y="-52" width="70" height="52" fill="#7a7f96"/><rect x="-12" y="-72" width="22" height="72" fill="#6c7088"/><rect x="60" y="-72" width="22" height="72" fill="#6c7088"/>
    ${[-12, -5, 2, 60, 67, 74].map(x => `<rect x="${x}" y="-78" width="5" height="7" fill="#6c7088"/>`).join('')}
    <path d="M-14 -72 h26 M58 -72 h26" stroke="#fff" stroke-width="3"/>
    ${[[-4, -56], [66, -56], [14, -36], [48, -36]].map(([x, y], i) => `<rect class="a-flicker" style="animation-delay:${i * 0.1}s" x="${x}" y="${y}" width="6" height="9" fill="#ffcf5a"/>`).join('')}
    <path d="M27 0 v-18 a8 8 0 0 1 16 0 v18z" fill="#3a2a1e"/>
    <g transform="translate(-1 -72)"><path d="M0 0 v-14" stroke="#3e2617" stroke-width="1.5"/><g class="a-swing"><path d="M-4 -12 q4 -7 8 0 v5 h-8z" fill="#d6b25a"/></g></g>
  </g>
  <g transform="translate(120 124)">
    <path d="M-12 0 l24 0 M-10 -3 l20 6 M-10 3 l20 -6" stroke="#5a3d26" stroke-width="3"/>
    <path class="a-flicker" d="M-9 -2 q-2 -14 9 -24 q-2 10 9 14 q3 6 -9 12z" fill="#f2a33a"/>
    <path class="a-flicker" style="animation-delay:.09s" d="M-4 -2 q0 -9 5 -14 q1 7 4 9 q1 4 -9 5z" fill="#ffe14d"/>
  </g>
  <g transform="translate(64 128)">
    <path d="M-5 0 l-3 12 M5 0 l3 12" stroke="#3e2617" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M-9 -24 h9 v24 h-12z" fill="#8b2a1e"/><path d="M0 -24 h9 l3 24 h-12z" fill="#d6b25a"/>
    <circle cx="0" cy="-31" r="7" fill="#f0c9a0"/>
    <path d="M-8 -34 q-6 -14 -14 -6 M8 -34 q6 -14 14 -6 M0 -37 q0 -14 2 -16" stroke="#8b2a1e" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="-22" cy="-40" r="2.5" fill="#d6b25a"/><circle cx="22" cy="-40" r="2.5" fill="#d6b25a"/><circle cx="2" cy="-54" r="2.5" fill="#d6b25a"/>
    <path d="M-3 -29 q3 3 6 0" stroke="#5a3d26" stroke-width="1.5" fill="none"/>
    <path d="M-9 -20 l-9 -10 M9 -20 l9 -10" stroke="#f0c9a0" stroke-width="3" stroke-linecap="round"/>
    ${['#e05a4a', '#4f7fa8', '#6f8f4e'].map((c, i) => `<circle class="a-juggle" style="animation-delay:${-i * 0.4}s" cx="0" cy="-38" r="3.5" fill="${c}"/>`).join('')}
  </g>
  ${[...Array(18)].map((_, i) => `<circle class="a-snow" style="animation-delay:${(i * 0.37) % 3}s;animation-duration:${3 + (i % 4) * 0.6}s" cx="${8 + i * 18}" cy="-4" r="${1 + (i % 3) * 0.6}" fill="#fff" opacity=".85"/>`).join('')}
</svg>`;

export function renderInterlude(it: Interlude): string {
  return `
  <div class="interlude ${it.closing ? 'closing' : ''}" role="dialog" aria-modal="true" aria-label="Fine dell'anno ${it.year}">
    <div class="curtain left" aria-hidden="true"></div>
    <div class="curtain right" aria-hidden="true"></div>
    <div class="valance" aria-hidden="true"></div>
    <div class="stage">
      <div class="stage-title"><span>Fine dell'anno del Signore</span><b>${it.year}</b></div>
      ${winterScene}
      <div class="scroll"><p class="herald"><span class="herald-name">Il giullare di corte proclama:</span> ${it.proclamation}</p></div>
      <div class="map-frame">${it.map}</div>
      <button data-act="interludeClose" class="primary">Leggi la cronaca dell'anno</button>
    </div>
  </div>`;
}
