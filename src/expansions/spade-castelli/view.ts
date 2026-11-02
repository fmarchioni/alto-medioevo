/**
 * Vista dell'espansione "Spade e Castelli": il capitano d'armi Ser Ardengo
 * guida mura, esercito, guerra e briganti. Solo presentazione: le regole sono
 * in rules.ts.
 */
import { FEUDO_POS } from '../../domain/geography';
import { FEUDI, wealthIndex } from '../../domain/rank';
import type { Game } from '../../domain/turn';
import type { ActionResult, GameState, Player } from '../../domain/types';
import { helmet, person, shield, spear } from '../../ui/comics';
import { LAND_PATH, MAP_SIZE, THUMB } from '../../ui/map';
import { dispatchScrolls, type ScrollItem } from '../../ui/scrolls';
import { pick, speechBox, type Speaker } from '../../ui/speaker';
import type { ExpansionView, ExtActionResult, ExtCard, ExtUi } from '../types';
import {
  answerPeace, offerPeace, peaceBlock, BOMBARD_KILL, buildCatapults, CATAPULT_COST, CATAPULT_MAX, CATAPULT_UPKEEP, CATAPULTS_PER_RING, catapultsOf, catAwayOf, FALL_SERVI, liftSiege, PEACE_PER_SOLDIER, peacePrice,
  SIEGE_FALL_WINS, SIEGE_KILL, siegesBy, siegesOn, WALL_BONUS, WALL_MEN,
  ARMY_MAX_SHARE, awayOf, campaignsBy, MILITIA, recruitRoom, volunteersOf, warLooms, buildTower, TORRE_COST, TORRI_MAX, torriOf, towerAlerts, type Campaign, MARCH_SICKNESS, travelYears, BRIGAND_BAND, BRIGAND_PAY, BRIGAND_TAX, buildWall, CAMPAIGN_COST, declareWar, defenseOf, disband, driveBrigands,
  LOOT_GRANO, LOOT_SCUDI, maxArmy, moveBrigands, MURA_COST, MURA_MAX, neighbors, payBrigands, RECRUIT_COST, recruit, SOLDIER_VS_HORDE, WALL_VS_HORDE,
  SOLDO, SPY_COST, SPY_YEARS, DESTROY_FROM_Q, hasSpy, hireSpy, knownSoldiers, spyUntil, ss, WALL_EVENT_SHIELD, WAR_MIN, type Dispatch, type SpadeState, type WarGoal, type WarResult,
} from './rules';
import { hireMercs, invokeTruce, mercCost, playTraitor } from './rules';
import { mercsOf, TRADITORE_MURA } from './carte';
import { cardChronicle, cardsAside } from './carte-view';

const n = (v: number) => Math.floor(v).toLocaleString('it-IT');
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const who = (p: Player) => `${esc(p.name)} da ${FEUDI[p.feudo]}`;
const h = (p: Player) => (p.gender === 1 ? 'Messere' : 'Madonna');
const plural = (k: number, one: string, many: string) => `${n(k)} ${k === 1 ? one : many}`;

// ---------------------------------------------------------------- grafica

const ardengoPortrait = `
<svg viewBox="0 0 120 140" class="portrait" role="img" aria-label="Ser Ardengo, il capitano d'armi">
  <rect width="120" height="140" rx="10" fill="#c9c2b0"/>
  <path d="M8 140 C12 104 34 92 60 92 C86 92 108 104 112 140 Z" fill="#8a8a8a"/>
  <path d="M8 140 C12 104 34 92 60 92 C86 92 108 104 112 140" fill="none" stroke="#5f5f5f" stroke-width="2" stroke-dasharray="3 3"/>
  <path d="M44 104 h32 v36 h-32z" fill="#8b2a1e"/><path d="M60 108 v28 M50 118 h20" stroke="#e3bb4f" stroke-width="3"/>
  <ellipse cx="60" cy="66" rx="21" ry="25" fill="#e8bf98"/>
  <path d="M36 62 C36 30 84 30 84 62 L80 62 C78 44 42 44 40 62z" fill="#9a9a9a" stroke="#5f5f5f"/>
  <path d="M57 44 h6 v30 h-6z" fill="#8a8a8a" stroke="#5f5f5f"/>
  <circle cx="50" cy="66" r="2.2" fill="#2b2118"/><circle cx="70" cy="66" r="2.2" fill="#2b2118"/>
  <path d="M44 60 l10 2 M76 60 l-10 2" stroke="#4a3424" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M42 74 C42 98 78 98 78 74 C72 86 48 86 42 74z" fill="#6b4a2c"/>
  <path d="M52 82 q8 3 16 0" stroke="#3e2617" stroke-width="2" fill="none" stroke-linecap="round"/>
</svg>`;

export const ARDENGO: Speaker = { name: 'Ser Ardengo', role: "capitano d'armi", portrait: ardengoPortrait };

const svg = (body: string, label: string, cls = 'card-art') => `<svg viewBox="0 0 64 48" class="${cls}" aria-hidden="true" data-label="${label}">${body}</svg>`;

/** Illustrazioni del pannello dell'esercito, accanto ad arruolare e costruire. */
const soldiersArt = `<svg viewBox="0 -14 64 62" class="ext-art" aria-hidden="true" data-label="soldati"><path d="M0 47 h64" stroke="#6b4a2c" stroke-width="2"/>
  ${person(12, 34, '#8b2a1e', helmet + spear)}${person(26, 35, '#2e5fa3', helmet + spear + shield('#e3bb4f'))}${person(40, 34, '#8b2a1e', helmet + spear + shield('#a39a88'))}${person(54, 35, '#2e5fa3', helmet + spear)}</svg>`;
const catapultArt = svg(`<path d="M2 46 h60" stroke="#6b4a2c" stroke-width="2"/>
  <path d="M22 33 L31 14 L40 33" stroke="#6b4a2c" stroke-width="3" fill="none" stroke-linejoin="round"/>
  <path d="M12 31 L54 9" stroke="#8b5e34" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M49 5 q3 9 11 2" fill="#6b4a2c" stroke="#3e2617" stroke-width="1"/><circle cx="55" cy="4" r="3.2" fill="#8a8a8a" stroke="#5f584c"/>
  <path d="M31 16 L16 32" stroke="#c9b48a" stroke-width="1.2"/>
  <rect x="6" y="31" width="50" height="6" rx="1" fill="#8b5e34" stroke="#4a3424"/>
  <circle cx="15" cy="40" r="5.5" fill="#4a3424" stroke="#2b1d12" stroke-width="1.5"/><circle cx="15" cy="40" r="1.5" fill="#c9b48a"/>
  <circle cx="47" cy="40" r="5.5" fill="#4a3424" stroke="#2b1d12" stroke-width="1.5"/><circle cx="47" cy="40" r="1.5" fill="#c9b48a"/>`, 'catapulta', 'ext-art');

/** Icone della seconda riga della barra delle risorse (stesso formato di quelle del gioco base). */
const barIcon = (body: string, label: string) => `<svg viewBox="0 0 32 32" class="ico" role="img" aria-label="${label}">${body}</svg>`;
const barIcons = {
  mura: barIcon(
    `<path d="M2 28 V14 h4 v-3 h3 v3 h4 v-3 h3 v3 h4 v-3 h3 v3 h4 v-3 h3 v17z" fill="#b5a387" stroke="#5b4a36"/>
     <path d="M2 19 h28 M2 24 h28 M9 14 v5 M17 19 v5 M24 14 v5 M12 24 v4 M21 24 v4" stroke="#8a7a62" stroke-width="1"/>
     <path d="M13 28 v-4 a3 3 0 0 1 6 0 v4z" fill="#4a3424"/>`, 'mura'),
  soldati: barIcon(
    `<path d="M24 3 v26" stroke="#6b4a2c" stroke-width="2"/><path d="M24 1 l-3 6 h6z" fill="#b9b9c4" stroke="#55555f"/>
     <path d="M3 29 c0-8 3-12 8-12 s8 4 8 12z" fill="#8b2a1e"/><circle cx="11" cy="11" r="4.5" fill="#d9a77a"/>
     <path d="M6 10 a5 5 0 0 1 10 0z" fill="#8a8a96" stroke="#55555f"/>
     <path d="M15 19 h8 v5 c0 3-4 5-4 5 s-4-2-4-5z" fill="#e3bb4f" stroke="#a8801f"/>`, 'soldati'),
  torri: barIcon(
    `<path d="M9 29 V11 h14 v18z" fill="#9b8a72" stroke="#5b4a36"/>
     <path d="M7 11 V5 h3 v3 h4.5 V5 h3 v3 h4.5 V5 h3 V11 z" fill="#b5a387" stroke="#5b4a36"/>
     <path d="M13.5 29 v-6 a2.5 2.5 0 0 1 5 0 v6z" fill="#4a3424"/><rect x="14.5" y="13" width="3" height="5" fill="#2b1d12"/>`, 'torri'),
  catapulte: barIcon(
    `<path d="M2 28 h28" stroke="#6b4a2c" stroke-width="2"/>
     <path d="M5 22 h21 l-3-5 h-15z" fill="#8b5e34" stroke="#4a3424"/>
     <path d="M12 19 L26 5" stroke="#6b4a2c" stroke-width="2.5" stroke-linecap="round"/><circle cx="26" cy="5" r="2.8" fill="#8a8a8a" stroke="#3a3a3a"/>
     <circle cx="9" cy="25" r="3.2" fill="#4a3424"/><circle cx="22" cy="25" r="3.2" fill="#4a3424"/>`, 'catapulte'),
};

const art = {
  torri: svg(`<path d="M2 46 h60" stroke="#6b4a2c" stroke-width="2"/>
    <rect x="24" y="14" width="16" height="32" fill="#a39a88" stroke="#5f584c"/>
    ${[22, 28, 34, 40].map(x => `<rect x="${x}" y="9" width="4" height="6" fill="#a39a88" stroke="#5f584c"/>`).join('')}
    <path d="M30 22 h4 v6 h-4z" fill="#2b2118"/><path d="M28 46 v-8 a4 4 0 0 1 8 0 v8z" fill="#4a3424"/>
    <circle cx="32" cy="5" r="3" fill="#f0c9a0"/><path d="M35 4 l14 -2 M35 6 l14 2" stroke="#e3bb4f" stroke-width="1.2" stroke-dasharray="2 2"/>
    <g fill="#8b2a1e"><circle cx="54" cy="40" r="2"/><circle cx="58" cy="41" r="2"/><circle cx="50" cy="41" r="2"/></g>`, 'torri di guardia'),
  mura: svg(`<rect x="4" y="18" width="56" height="26" fill="#a39a88" stroke="#5f584c"/>
    ${[4, 14, 24, 34, 44, 54].map(x => `<rect x="${x}" y="12" width="6" height="7" fill="#a39a88" stroke="#5f584c"/>`).join('')}
    <path d="M8 26 h48 M8 34 h48" stroke="#8a8270"/><path d="M26 44 v-12 a6 6 0 0 1 12 0 v12z" fill="#4a3424"/>`, 'mura'),
  esercito: svg(`${person(16, 40, '#8b2a1e', helmet + spear)}${person(32, 40, '#2e5fa3', helmet + spear + shield('#e3bb4f'))}${person(48, 40, '#8b2a1e', helmet + spear)}`, 'esercito'),
  guerra: svg(`<path d="M14 40 L46 8 M18 8 L50 40" stroke="#b8b8b8" stroke-width="4" stroke-linecap="round"/>
    <path d="M10 36 l8 8 M46 36 l8 8" stroke="#6b4a2c" stroke-width="5" stroke-linecap="round"/>
    <path d="M12 42 l6 -6 M52 42 l-6 -6" stroke="#e3bb4f" stroke-width="3"/>
    <path d="M28 4 v14 l4 -3 4 3 v-14" fill="#8b2a1e"/>`, 'guerra'),
  briganti: svg(`${person(22, 40, '#3e3a2e', '<path d="M-9 -27 C-9 -42 9 -42 9 -27 L7 -22 H-7z" fill="#2b2a24"/><circle cx="-2.5" cy="-29" r="1.3" fill="#fff"/><circle cx="2.5" cy="-29" r="1.3" fill="#fff"/><path d="M10 -20 l10 -12" stroke="#b8b8b8" stroke-width="2.5"/>', '#d9b48a')}
    <path d="M36 44 C30 44 30 28 42 28 C54 28 54 44 48 44z" fill="#a8844f" stroke="#5a3d26"/><text x="42" y="40" font-size="9" text-anchor="middle" fill="#5a3d26">$</text>`, 'briganti'),
};

/** Pedina dei briganti (coordinate locali, centro in 0,0). */
const brigandToken = (x: number, y: number, r = 22) => `<g transform="translate(${x} ${y})" class="brigand-token">
  <circle r="${r}" fill="#2b2a24" stroke="#e3bb4f" stroke-width="3"/>
  <g transform="scale(${r / 22})"><path d="M-9 4 C-9 -14 9 -14 9 4 L7 9 H-7z" fill="#5a5648"/><circle cx="-3" cy="-2" r="1.8" fill="#fff"/><circle cx="3" cy="-2" r="1.8" fill="#fff"/>
  <path d="M-12 14 l24 -24" stroke="#b8b8b8" stroke-width="2.5"/></g></g>`;

/** Spade incrociate (segno di battaglia sulla carta). */
const swords = (x: number, y: number) => `<g transform="translate(${x} ${y})"><circle r="17" fill="#f6ead0" stroke="#8b2a1e" stroke-width="2"/>
  <path d="M-9 9 L9 -9 M-9 -9 L9 9" stroke="#5f584c" stroke-width="3.5" stroke-linecap="round"/></g>`;

/** Miniatura della tessera: castello con spade incrociate e una banda nel bosco. */
const miniature = `<svg viewBox="0 0 160 110" class="exp-mini" role="img" aria-label="miniatura: spade e castelli">
  <rect width="160" height="110" fill="#e9d7a8"/>
  <path d="M0 90 Q50 76 100 88 T160 84 V110 H0z" fill="#6f8f4e"/>
  <rect x="58" y="42" width="44" height="48" fill="#a39a88" stroke="#5f584c"/>
  <rect x="46" y="30" width="16" height="60" fill="#968d7b" stroke="#5f584c"/><rect x="98" y="30" width="16" height="60" fill="#968d7b" stroke="#5f584c"/>
  ${[46, 52, 58, 98, 104, 110].map(x => `<rect x="${x}" y="25" width="4" height="6" fill="#968d7b"/>`).join('')}
  <path d="M74 90 v-14 a6 6 0 0 1 12 0 v14z" fill="#4a3424"/>
  <path d="M52 30 v-14 l10 4 -10 4" fill="#8b2a1e" stroke="#3e2617"/>
  <g transform="translate(80 18)"><path d="M-14 14 L14 -14 M-14 -14 L14 14" stroke="#8a8a8a" stroke-width="4" stroke-linecap="round"/></g>
  <g fill="#2e4a22"><circle cx="16" cy="70" r="12"/><circle cx="30" cy="64" r="11"/><circle cx="140" cy="68" r="12"/></g>
  ${person(26, 92, '#3e3a2e', '<path d="M-9 -27 C-9 -42 9 -42 9 -27 L7 -22 H-7z" fill="#2b2a24"/>')}
  ${person(136, 94, '#2e5fa3', helmet + spear)}
</svg>`;

/**
 * Carta schematica del regno: i feudi in gioco, i confini del signore di
 * turno, la pedina dei briganti. `pick` rende cliccabili alcuni feudi.
 */
function miniMap(g: Game, opts: { highlight?: number[] } = {}): string {
  const st = ss(g), ps = g.state.players, me = g.state.current;
  const near = neighbors(g, me);
  const lines = near.map(i => {
    const [x1, y1] = FEUDO_POS[ps[me].feudo], [x2, y2] = FEUDO_POS[ps[i].feudo];
    return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#8b2a1e" stroke-width="5" stroke-dasharray="14 10"/>`;
  }).join('');
  const dots = ps.map((p, i) => {
    const [x, y] = FEUDO_POS[p.feudo];
    const cls = i === me ? 'mm-me' : near.includes(i) ? 'mm-near' : 'mm-far';
    const mark = opts.highlight?.includes(i) ? `<circle cx="${x}" cy="${y}" r="34" fill="none" stroke="#e3bb4f" stroke-width="6"/>` : '';
    // un feudo caduto resta sulla carta, grigio e sbarrato
    const fallen = p.caduto !== undefined ? `<path d="M${x - 16} ${y - 16} L${x + 16} ${y + 16} M${x - 16} ${y + 16} L${x + 16} ${y - 16}" stroke="#2b2118" stroke-width="5"/>` : '';
    const besieged = siegesOn(st, i).length ? swords(x - 30, y - 30) : '';
    return `<g class="${cls}">${mark}<circle cx="${x}" cy="${y}" r="20" fill="${p.caduto !== undefined ? '#8a8a8a' : i === me ? '#2e5fa3' : near.includes(i) ? '#8b2a1e' : '#8a6b3e'}" stroke="#2b2118" stroke-width="3"/>${fallen}${besieged}
      <text x="${x}" y="${y + 52}" text-anchor="middle" font-size="30" fill="#2b2118">${FEUDI[p.feudo]}</text></g>`;
  }).join('');
  const band = st.brigands !== null ? brigandToken(FEUDO_POS[ps[st.brigands].feudo][0] + 30, FEUDO_POS[ps[st.brigands].feudo][1] - 30, 24) : '';
  return `<svg viewBox="0 0 ${MAP_SIZE.w} ${MAP_SIZE.h}" class="mini-map" role="img" aria-label="carta dei confini">
    <rect width="${MAP_SIZE.w}" height="${MAP_SIZE.h}" fill="#7fa9c9"/><path d="${LAND_PATH}" fill="#e9dcb4" stroke="#8a6b3e" stroke-width="4"/>
    ${lines}${dots}${band}</svg>`;
}

/** Scena di battaglia per l'esito di una guerra. */
export function battleScene(w: WarResult, ps: Player[]): string {
  const BLUE = '#2e5fa3', RED = '#8b2a1e';
  const soldier = (x: number, y: number, c: string, extra = '') => person(x, y, c, helmet + spear + extra);
  /** soldato caduto, steso a terra, con la lancia accanto */
  const fallen = (x: number, y: number, c: string, dir: 1 | -1) =>
    `<path d="M${x - 18} ${y + 9} l36 -4" stroke="#6b4a2c" stroke-width="2.5"/><g transform="translate(${x} ${y}) rotate(${dir * 84})">${person(0, 0, c, helmet)}</g>`;
  // respinti: alcuni attaccanti restano sul campo, gli altri ripiegano; vittoria: le schiere sono sotto le mura
  const attackers = w.win
    ? [0, 1, 2, 3].map(k => soldier(100 + k * 28, 152 - (k % 2) * 6, BLUE, k === 1 ? shield('#e3bb4f') : '')).join('')
    : [0, 1, 2].map(k => soldier(40 + k * 34, 150 - (k % 2) * 10, BLUE, k === 1 ? shield('#e3bb4f') : '')).join('')
      + ([[132, 160, 1], [214, 168, -1], [256, 158, 1]] as const).map(([x, y, d]) => fallen(x, y, BLUE, d)).join('');
  // i difensori: sui merli se hanno tenuto, caduti ai piedi delle mura se hanno perso
  const defenders = w.win
    ? ([[262, 164, -1], [314, 170, 1], [374, 160, 1]] as const).map(([x, y, d]) => fallen(x, y, RED, d)).join('')
    : [290, 312, 348, 372].map(x => `<g transform="translate(${x} 68) scale(.55)">${soldier(0, -12, RED)}</g>`).join('');
  const flag = w.win ? BLUE : RED;
  // le mura espugnate restano crepate
  const cracks = w.win
    ? ['M292 72 l6 12 -5 9 7 14 -3 10', 'M362 72 l-4 10 6 8 -5 12', 'M384 150 l-6 -14 5 -8 -7 -11', 'M300 150 l4 -10 -5 -7'].map(d => `<path d="${d}" stroke="#4a443c" stroke-width="2" fill="none" stroke-linejoin="bevel"/>`).join('')
    : '';
  return `<svg viewBox="0 0 420 180" class="battle-scene" role="img" aria-label="battaglia fra ${esc(ps[w.attacker].name)} e ${esc(ps[w.defender].name)}">
    <rect width="420" height="180" fill="#c9dbe6"/><path d="M0 140 Q120 120 240 136 T420 130 V180 H0z" fill="#7d9b5a"/>
    <rect x="270" y="70" width="130" height="80" fill="#a39a88" stroke="#5f584c"/>
    ${w.win ? '' : defenders}
    ${[270, 284, 298, 312, 326, 340, 354, 368, 382].map(x => `<rect x="${x}" y="62" width="9" height="9" fill="#a39a88" stroke="#5f584c"/>`).join('')}
    <path d="M325 150 v-26 a10 10 0 0 1 20 0 v26z" fill="#4a3424"/>${cracks}
    <path d="M390 62 v-34" stroke="#3e2617" stroke-width="2"/><path d="M390 28 l22 7 -22 7z" fill="${flag}"/>
    ${w.win ? defenders : ''}${attackers}
    <g transform="translate(232 92)"><path d="M-22 22 L22 -22 M-22 -22 L22 22" stroke="#5f584c" stroke-width="6" stroke-linecap="round"/>
      <path d="M-26 18 l8 8 M26 18 l-8 8" stroke="#6b4a2c" stroke-width="7" stroke-linecap="round"/></g>
    <rect x="70" y="16" width="160" height="34" rx="4" fill="#f6ead0" stroke="#2b2118" stroke-width="2"/>
    <text x="150" y="40" font-size="20" fill="${w.win ? '#2e5fa3' : '#8b2a1e'}" text-anchor="middle">${w.win ? 'VITTORIA!' : 'RESPINTI!'}</text>
  </svg>`;
}

// ---------------------------------------------------------------- testi

/** Quando torna a casa la schiera di una guerra. */
const homeword = (w: WarResult) => {
  const anni = w.anni ?? 1, left = w.sent - w.attackerLost;
  if (left <= 0) return '';
  if (w.siege) return ` I ${n(left)} superstiti restano ad assediare il feudo: torneranno all'assalto ogni anno, finché non cade o non togliete l'assedio.`;
  return ` I ${n(left)} superstiti sono in marcia: ${anni === 1 ? 'un anno' : 'due anni'} di viaggio, a casa all'inizio del ${900 + w.q + 1 + anni}. Fino ad allora non difendono il feudo.`;
};

/** Catapulte in campo, perdute e mura abbattute. */
const siegeworks = (w: WarResult, mine: boolean) => {
  const out: string[] = [];
  if (w.cat) out.push(`${mine ? 'Le vostre' : 'Le sue'} ${n(w.cat)} catapulte ${w.catLost ? `hanno battuto le mura (${plural(w.catLost, 'è andata distrutta', 'sono andate distrutte')})` : 'hanno battuto le mura'}.`);
  if (w.rings) out.push(`Una cerchia di mura è crollata.`);
  if (w.bombard) out.push(`Le catapulte, più forti delle mura, hanno colpito le case: ${plural(w.bombard, 'servo è morto', 'servi sono morti')} sotto il loro tiro.`);
  return out.length ? ` ${out.join(' ')}` : '';
};

/** Carte di guerra in battaglia: mercenari e traditori (svelati solo ora). */
function cardWords(w: WarResult, forAttacker: boolean): string {
  const out: string[] = [];
  if (forAttacker) {
    if (w.merc) out.push(`Con le vostre schiere hanno combattuto ${n(w.merc)} mercenari, che ora se ne vanno.`);
    if (w.traditore === 'aperte') out.push(`Il traditore ha mantenuto la parola: una porta si è aperta e il nemico ha combattuto con ${TRADITORE_MURA} cerchie di mura in meno.`);
    if (w.traditore === 'chiuse') out.push('Le porte sono rimaste chiuse: il traditore non si è visto.');
    if (w.mercDef) out.push('Fra i difensori c\'erano mercenari che le vostre spie non avevano visto.');
  } else {
    if (w.mercDef) out.push(`I ${n(w.mercDef)} mercenari del fortino hanno combattuto con voi, e ora se ne vanno.`);
    if (w.tradito) out.push(`<b>Il traditore faceva il doppio gioco!</b> Nella notte dell'assalto ha aperto una porta delle vostre mura: avete combattuto con ${TRADITORE_MURA} cerchie in meno.`);
  }
  return out.length ? ` ${out.join(' ')}` : '';
}

function warText(w: WarResult, ps: Player[], forAttacker: boolean): string {
  return warTextBase(w, ps, forAttacker) + cardWords(w, forAttacker);
}

function warTextBase(w: WarResult, ps: Player[], forAttacker: boolean): string {
  const A = who(ps[w.attacker]), D = who(ps[w.defender]);
  const spoils = [w.scudi ? `${n(w.scudi)} scudi` : '', w.grano ? `${n(w.grano)} misure di grano` : '', w.acri ? `${n(w.acri)} acri di terra` : ''].filter(Boolean).join(', ') || 'ben poco';
  const round = (w.round ?? 1) > 1 ? `${w.round}° assalto dell'assedio. ` : '';
  const slain = w.serviLost ? ` e ${n(w.serviLost)} servi` : '';
  if (forAttacker) {
    if (w.fell) return `${round}<b>${D} è caduto!</b> Il feudo è vostro: prendete <b>${spoils}</b> e metà dei servi rimasti. Il suo signore esce dalla partita.${siegeworks(w, true)}${homeword({ ...w, siege: false })}`;
    return w.win
      ? `${round}Vittoria! Le vostre schiere hanno travolto le difese di ${D} e portano via <b>${spoils}</b>. Avete perduto ${plural(w.attackerLost, 'soldato', 'soldati')}; il nemico ${plural(w.defenderLost, 'soldato', 'soldati')}${slain}.${siegeworks(w, true)}${homeword(w)}`
      : `${round}Respinti! Le mura e la guarnigione di ${D} hanno retto. Sono caduti ${plural(w.attackerLost, 'vostro soldato', 'vostri soldati')}; il nemico ne ha perduti ${n(w.defenderLost)}.${siegeworks(w, true)}${homeword(w)}`;
  }
  const how = w.goal === 'distruzione' ? 'per distruggerlo' : 'per le risorse';
  return w.win
    ? `${round}${A} ha assalito il vostro feudo ${how} con ${n(w.sent)} soldati e ha vinto: vi ha tolto <b>${spoils}</b>. Sono caduti ${plural(w.defenderLost, 'vostro soldato', 'vostri soldati')}${slain}.${siegeworks(w, false)}${w.siege ? ` <b>Il suo esercito resta sotto le vostre mura</b>: tornerà all'assalto l'anno prossimo. Arruolate, alzate le mura o proponetegli la pace.` : ''}`
    : `${round}${A} ha assalito il vostro feudo ${how} con ${n(w.sent)} soldati, ma le vostre difese hanno retto! Il nemico ha perduto ${n(w.attackerLost)} uomini, voi ${n(w.defenderLost)}.${siegeworks(w, false)}${w.siege ? ' Ma il suo esercito non se ne va: l\'assedio continua.' : ''}`;
}

/** Racconto della battaglia per tutti, a fine anno: chi, quanti, come è finita. */
function battleTale(w: WarResult, ps: Player[]): string {
  const A = who(ps[w.attacker]), D = who(ps[w.defender]);
  const spoils = [w.scudi ? `${n(w.scudi)} scudi` : '', w.grano ? `${n(w.grano)} misure di grano` : ''].filter(Boolean).join(' e ');
  const round = (w.round ?? 1) > 1 ? `Al ${w.round}° assalto dell'assedio, ` : '';
  const head = `${round}${A} ha assalito il feudo di ${D} ${w.goal === 'distruzione' ? 'per distruggerlo' : 'per le risorse'} con ${n(w.sent)} soldati${w.cat ? ` e ${plural(w.cat, 'catapulta', 'catapulte')}` : ''}.`;
  if (w.fell) return `${head} <b>Il feudo è caduto</b>: ${D} esce dalla partita.`;
  const tale = battleTaleBody(w, head, spoils);
  // il doppio gioco si racconta a tutti; i mercenari e il traditore dell'assalitore no (restano segreti)
  return w.tradito ? `${tale} Si dice che un traditore abbia aperto una porta ai nemici.` : tale;
}

function battleTaleBody(w: WarResult, head: string, spoils: string): string {
  const shots = w.bombard ? ` Il tiro delle catapulte ha ucciso ${plural(w.bombard, 'servo', 'servi')}.` : '';
  if (!w.win) return `${head} <b>Le difese hanno retto</b>: l'assalitore lascia sul campo ${plural(w.attackerLost, 'soldato', 'soldati')}.${shots}`;
  return `${head} <b>Le difese sono crollate</b>${spoils ? `: bottino di ${spoils}` : ''}${w.rings ? ', e una cerchia di mura è crollata' : ''}.${shots}${w.siege ? " L'esercito resta sotto le mura: l'assedio continua." : ''}`;
}

function dispatchItem(d: Dispatch, st: GameState): ScrollItem {
  if (d.k === 'attacked') return { title: d.war.win ? (d.war.siege ? 'Sotto assedio' : 'Il feudo è stato saccheggiato') : 'Assalto respinto', from: 'dalle mura', body: warText(d.war, st.players, false) };
  if (d.k === 'battle') return { title: d.war.fell ? 'Il feudo nemico è caduto' : d.war.win ? `Vittoria a ${FEUDI[st.players[d.war.defender].feudo]}` : `Sconfitta a ${FEUDI[st.players[d.war.defender].feudo]}`, from: 'dal campo di battaglia', body: warText(d.war, st.players, true) };
  if (d.k === 'siege') return { title: d.war.fell ? 'Il feudo nemico è caduto' : d.war.win ? "L'assalto è riuscito" : "L'assalto è fallito", from: "dal campo dell'assedio", body: warText(d.war, st.players, true) };
  if (d.k === 'returned') return {
    title: 'I soldati sono tornati',
    from: 'dalla strada',
    body: `Dopo ${d.anni === 1 ? 'un anno' : 'due anni'} di marcia dal feudo di ${who(st.players[d.from])}, <b>${plural(d.n, 'soldato è tornato', 'soldati sono tornati')}</b> al fortino${d.cat ? ` con ${plural(d.cat, 'catapulta', 'catapulte')}` : ''}${d.lost ? `; ${plural(d.lost, 'è morto', 'sono morti')} di malattia per via` : ', tutti sani'}. Di nuovo difendono il feudo e si possono mandare in guerra o congedare.`,
  };
  if (d.k === 'peaceAnswer') return d.ok
    ? { title: 'Pace accettata', from: "dal campo dell'assedio", body: `${who(st.players[d.by])} ha accettato la vostra proposta: pagati <b>${n(d.scudi)} scudi</b>, il suo esercito toglie l'assedio e torna a casa.` }
    : { title: 'Pace respinta', from: "dal campo dell'assedio", body: `${who(st.players[d.by])} ha respinto la vostra offerta di ${n(d.scudi)} scudi: <b>l'assedio continua</b>. Potrete fare un'altra proposta l'anno prossimo.` };
  if (d.k === 'peace') return { title: 'Pace comprata', from: "dal campo dell'assedio", body: `${who(st.players[d.by])} ha comprato la pace per <b>${n(d.scudi)} scudi</b>: il vostro esercito toglie l'assedio e si rimette in marcia verso casa.` };
  if (d.k === 'truce') return d.siege
    ? { title: 'Tregua di Dio', from: "dal campo dell'assedio", body: `${who(st.players[d.by])} ha invocato la tregua di Dio: quest'anno il vostro assedio non ha dato l'assalto, ma nel campo la malattia continua. Si tornerà all'assalto l'anno prossimo.` }
    : { title: 'Tregua di Dio', from: 'dalla marcia', body: `${who(st.players[d.by])} ha invocato la tregua di Dio: il vostro esercito si è fermato e darà battaglia alla fine dell'anno prossimo.` };
  if (d.k === 'lifted') return { title: "L'assedio è finito", from: 'dalle mura', body: `${who(st.players[d.by])} non vi assedia più: il suo esercito se ne va.` };
  return {
    title: 'Briganti nel feudo',
    from: 'dai boschi',
    body: `${who(st.players[d.by])} vi ha mandato contro i briganti: finché restano, vi sottraggono un quarto delle rendite. Si scacciano con i soldati o si pagano ${BRIGAND_PAY} scudi.`,
  };
}

/** Riga finale delle pergamene: quanto resta nel tesoro. */
const treasury = (p: Player) => (p.scudi >= 0 ? `Restano nel tesoro ${n(p.scudi)} scudi.` : `Il tesoro è in debito di ${n(-p.scudi)} scudi presso gli usurai.`);

const reaction = (r: ActionResult, ok: string, p: Player) => (r.ok ? ok : `${pick(['Impossibile', 'Non si può', 'Fermi'])}, ${h(p)}: ${r.reason}.`);

// ---------------------------------------------------------------- pannelli

function muraPanel(g: Game, st: SpadeState): string {
  const me = g.state.current, m = st.mura[me];
  const rings = Array.from({ length: MURA_MAX }, (_, i) => `<span class="ring ${i < m ? 'on' : ''}" aria-hidden="true"></span>`).join('');
  return `<div class="ext-stat"><span class="rings">${rings}</span> <b>${m}</b> di ${MURA_MAX} cerchie</div>
    <ul class="ext-ledger">
      <li>Difesa del feudo in guerra: <b>${n(defenseOf(g.player, st.soldati[me], m))}</b> (soldati, milizia dei servi e mura)${m < MURA_MAX ? `; con un'altra cerchia: ${n(defenseOf(g.player, st.soldati[me], m + 1))}` : ''}.</li>
      <li>Ogni cerchia vale ${WALL_MEN} difensori e moltiplica la difesa: +${Math.round(WALL_BONUS * 100)}% per cerchia. Solo le catapulte del nemico la annullano: ne servono ${CATAPULTS_PER_RING} per cerchia.</li>
      <li>Contro Longobardi e briganti le perdite di pugna e riscatto calano del ${Math.round(Math.min(1, WALL_EVENT_SHIELD * m) * 100)}%${m < MURA_MAX ? ` (${Math.round(Math.min(1, WALL_EVENT_SHIELD * (m + 1)) * 100)}% con un'altra cerchia)` : ''}.</li>
      <li>Le mura <b>non contano</b> per il rango: sono denaro speso per difendersi.</li>
    </ul>
    <div class="btns"><button data-act="ext" data-op="wall" ${m >= MURA_MAX ? 'disabled' : ''}>Innalza una cerchia (${n(MURA_COST)} scudi)</button></div>`;
}

const TORRE_WHEN = ['', 'solo al momento della guerra, alla fine dell\'anno', 'già nei dispendimenti, quando si costruisce', 'all\'inizio dell\'anno, prima di spendere per il grano'];

function torriPanel(g: Game, st: SpadeState): string {
  const me = g.state.current, lv = torriOf(st, me);
  const towers = Array.from({ length: TORRI_MAX }, (_, i) => `<span class="ring ${i < lv ? 'on' : ''}" aria-hidden="true"></span>`).join('');
  const levels = TORRE_COST.map((c, i) => `<li class="${i < lv ? 'good' : ''}">Livello ${i + 1} (${n(c)} scudi): l'avviso arriva ${TORRE_WHEN[i + 1]}.</li>`).join('');
  return `<div class="ext-stat"><span class="rings">${towers}</span> livello <b>${lv}</b> di ${TORRI_MAX}</div>
    <ul class="ext-ledger">
      <li>Le vedette avvistano gli eserciti nemici in marcia verso il feudo e dicono chi li manda e quando arriveranno; non quanti sono (per quello serve una spia).</li>
      <li>Un esercito che parte quest'anno si vede dall'anno dopo: contro un confinante combatte alla fine di quell'anno, da un feudo lontano un anno più tardi.</li>
      ${levels}
      <li>Le torri <b>non contano</b> per il rango.</li>
    </ul>
    <div class="btns"><button data-act="ext" data-op="tower" ${lv >= TORRI_MAX ? 'disabled' : ''}>${lv >= TORRI_MAX ? 'Torri al livello massimo' : `Alzate le torri al livello ${lv + 1} (${n(TORRE_COST[lv])} scudi)`}</button></div>`;
}

/** Avviso delle torri: eserciti nemici in avvicinamento, se le vedette li hanno visti. */
function alertBox(g: Game, seen: Campaign[]): string {
  if (!seen.length) return '';
  const ps = g.state.players;
  const rows = seen.map(c => `<li>Da <b>${who(ps[c.owner])}</b>${c.goal === 'distruzione' ? ', con macchine e salmerie come per un lungo assedio' : ''}: arriverà sotto le mura ${c.arrive === g.state.q ? "<b>alla fine di quest'anno</b>" : `alla fine del ${900 + c.arrive}`}.</li>`).join('');
  return `<div class="tower-alert" role="alert"><b class="tower-alert-head">Truppe nemiche in avvicinamento!</b><span class="tower-alert-from">dalle torri di guardia</span><ul>${rows}</ul></div>`;
}

function eserPanel(g: Game, st: SpadeState): string {
  const me = g.state.current, p = g.player, s = st.soldati[me], away = awayOf(st, me), max = maxArmy(p, s + away);
  const cat = catapultsOf(st, me), catAway = catAwayOf(st, me), catRoom = CATAPULT_MAX - cat - catAway;
  const looms = warLooms(g, me), vol = volunteersOf(g, me), room = recruitRoom(g, me);
  // proposta: quanti se ne possono arruolare davvero, anche con le armi da pagare (tesoro più credito)
  const canArm = Math.max(0, Math.min(room, Math.floor((p.scudi + p.credito) / RECRUIT_COST)));
  const marching = (st.marcia ?? []).filter(m => m.owner === me).map(m => `<li>${n(m.n)} soldati${m.cat ? ` e ${plural(m.cat, 'catapulta', 'catapulte')}` : ''} di ritorno dal feudo di ${who(g.state.players[m.from])}: a casa all'inizio del ${900 + m.back}.</li>`).join('');
  const going = campaignsBy(st, me).map(c => `<li>${n(c.n)} soldati${c.cat ? ` e ${plural(c.cat, 'catapulta', 'catapulte')}` : ''} marciano contro ${who(g.state.players[c.target])}: battaglia alla fine del ${900 + c.arrive}.</li>`).join('');
  const sieging = siegesBy(st, me).map(x => `<li>${n(x.n)} soldati${x.cat ? ` e ${plural(x.cat, 'catapulta', 'catapulte')}` : ''} assediano ${who(g.state.players[x.target])}.</li>`).join('');
  return `<div class="ext-stat"><b>${n(s)}</b> soldati nel fortino${away ? `, <b>${n(away)}</b> lontani` : ''}; al massimo ${n(max)} in tutto (un ${Math.round(ARMY_MAX_SHARE * 100) === 25 ? 'quarto' : `${Math.round(ARMY_MAX_SHARE * 100)}%`} della popolazione)</div>
    <ul class="ext-ledger">${going}${marching}${sieging}
      ${looms ? `<li class="warn"><b>Corre voce di guerra</b>: pochi servi vogliono imbracciare le armi, e chi si arruola ora è una leva inesperta che quest'anno in battaglia vale metà di un soldato.</li>` : ''}
      <li>Quest'anno si fanno avanti <b>${n(vol)}</b> volontari${room < vol ? `; se ne possono arruolare ancora <b>${n(room)}</b>` : ''}. In pace un servo su dieci accetta le armi; con la guerra in vista uno su venticinque, e la metà se il popolo è scontento.</li>
      <li>Solo i soldati nel fortino difendono il feudo e si possono congedare: chi marcia, assedia o torna resta soldato (e vuole il soldo) fino al ritorno.</li>
      <li>In difesa combattono anche i servi: ogni ${Math.round(1 / MILITIA)} servi valgono un soldato (oggi ${n(Math.floor(Math.max(0, p.servi) * MILITIA))}).</li>
      <li>Ogni soldato è un servo tolto al lavoro: rende meno gabelle e mercati.</li>
      <li>Armi: ${RECRUIT_COST} scudi a soldato; soldo: ${SOLDO} scudo a soldato a fine anno, anche a chi è lontano${s + away ? ` (quest'anno ${n((s + away) * SOLDO)})` : ''}.</li>
    </ul>
    <div class="ext-form with-art">${soldiersArt}
      <label>Arruolare <input type="number" name="recruit-n" min="1" max="${room}" value="${canArm}" inputmode="numeric"></label>
      <button data-act="ext" data-op="recruit" ${room <= 0 ? 'disabled' : ''}>Arruola</button>
      <label>Congedare <input type="number" name="disband-n" min="1" max="${s}" value="${s}" inputmode="numeric"></label>
      <button data-act="ext" data-op="disband" ${s === 0 ? 'disabled' : ''}>Congeda</button>
    </div>
    <h3>Catapulte</h3>
    <div class="ext-stat"><b>${n(cat)}</b> catapulte nel fortino${catAway ? `, <b>${n(catAway)}</b> lontane` : ''}</div>
    <ul class="ext-ledger">
      <li>Vanno in guerra con i soldati: ogni ${CATAPULTS_PER_RING} catapulte aprono una breccia in una cerchia di mura nemica. Senza, le mura danno al difensore un grande vantaggio.</li>
      <li>Nell'assedio per la distruzione, ogni assalto vinto con almeno ${CATAPULTS_PER_RING} catapulte abbatte una cerchia.</li>
      <li>Le catapulte in più di quelle che servono per le mura colpiscono le case: per ogni ${CATAPULTS_PER_RING} in più muore fino al ${Math.round(BOMBARD_KILL * 100)}% dei servi, vinca o perda l'assalto.</li>
      <li>Costano ${n(CATAPULT_COST)} scudi l'una e ${CATAPULT_UPKEEP} scudi l'anno di manutenzione; in una sconfitta se ne perdono molte. Al più ${CATAPULT_MAX}.</li>
    </ul>
    <div class="ext-form with-art">${catapultArt}
      <label>Costruire <input type="number" name="catapult-n" min="1" max="${Math.max(0, catRoom)}" value="${Math.max(0, Math.min(CATAPULTS_PER_RING, catRoom))}" inputmode="numeric"></label>
      <button data-act="ext" data-op="catapults" ${catRoom <= 0 ? 'disabled' : ''}>Costruisci (${n(CATAPULT_COST)} scudi l'una)</button>
    </div>`;
}

function guerraPanel(g: Game, st: SpadeState): string {
  const me = g.state.current, ps = g.state.players, s = st.soldati[me], cat = catapultsOf(st, me);
  const targets = ps.map((_, i) => i).filter(i => i !== me && ps[i].caduto === undefined).sort((a, b) => travelYears(g, me, a) - travelYears(g, me, b));
  if (!targets.length) return `<p>Nel regno non c'è nessun altro signore da assalire.</p>`;
  const done = st.lastWar[me] === g.state.q;
  const spy = hasSpy(g, me);
  const away = awayOf(st, me);
  const mine = siegesBy(st, me);
  // nei primi anni solo guerre per le risorse: c'è tempo per fortificarsi
  const early = g.state.q < DESTROY_FROM_Q;
  const destroyOff = early ? `disabled title="solo dall'anno ${900 + DESTROY_FROM_Q}"` : s + mercsOf(g, st, me) < WAR_MIN ? 'disabled' : '';
  const rows = targets.map(i => {
    const d = ps[i];
    const anni = travelYears(g, me, i);
    const siege = mine.find(x => x.target === i);
    const going = campaignsBy(st, me).filter(c => c.target === i);
    const goingText = going.map(c => `<small>${n(c.n)} vostri soldati in marcia: battaglia alla fine del ${900 + c.arrive}</small><br>`).join('');
    // senza spia si vedono solo le mura e la milizia dei servi: l'esercito resta segreto
    const known = knownSoldiers(g, me, i);
    const breach = st.mura[i] && cat ? `<br><small>con ${Math.min(cat, st.mura[i] * CATAPULTS_PER_RING)} catapulte: ${known === null ? 'almeno ' : ''}${n(defenseOf(d, known ?? 0, st.mura[i], cat))}</small>` : '';
    const defense = known === null
      ? `almeno ${n(defenseOf(d, 0, st.mura[i]))}<br><small>soldati: ?, ${st.mura[i]} mura</small>${breach}`
      : `${n(defenseOf(d, known, st.mura[i]))}<br><small>${n(known)} soldati, ${st.mura[i]} mura</small>${breach}`;
    const actions = siege
      ? `<small>assediato da ${n(siege.n)} vostri soldati (${siege.wins} di ${SIEGE_FALL_WINS} vittorie)</small><br>
        ${done ? '' : `<button data-act="ext" data-op="war" data-target="${i}" data-goal="distruzione" ${s + mercsOf(g, st, me) < WAR_MIN ? 'disabled' : ''}>Mandate rinforzi</button>`}
        <button data-act="ext" data-op="lift" data-target="${i}">Togliete l'assedio</button>`
      : done ? '' : `<button data-act="ext" data-op="war" data-target="${i}" data-goal="bottino" ${s + mercsOf(g, st, me) < WAR_MIN ? 'disabled' : ''}>Per le risorse</button>
        <button data-act="ext" data-op="war" data-target="${i}" data-goal="distruzione" ${destroyOff}>Per la distruzione</button>`;
    return `<tr>
      <th scope="row" data-label="Feudo">${who(d)}</th>
      <td data-label="Distanza">${anni === 1 ? 'confinante' : 'lontano'}<br><small>ritorno: ${anni === 1 ? '1 anno' : '2 anni'}</small></td>
      <td data-label="Difesa">${defense}</td>
      <td data-label="Ricchezze">${n(Math.max(0, d.scudi))} scudi<br><small>${n(d.grano)} grano, ${n(d.servi)} servi</small></td>
      <td data-label="" class="war-acts">${goingText}${actions}</td>
    </tr>`;
  }).join('');
  const merc = mercsOf(g, st, me);
  const form = done
    ? '<p class="hint">Quest\'anno avete già mosso guerra.</p>'
    : `${away ? `<p class="hint">Altri ${n(away)} soldati sono lontani, in marcia o all'assedio: non si possono mandare.</p>` : ''}<div class="ext-form"><label>Soldati da mandare <input type="number" name="war-sent" min="0" max="${s}" value="${s}" inputmode="numeric"></label>
        <label>Catapulte <input type="number" name="war-cat" min="0" max="${cat}" value="${cat}" inputmode="numeric"></label>
        ${merc ? `<label>Mercenari <input type="number" name="war-merc" min="0" max="${merc}" value="${merc}" inputmode="numeric"></label>` : ''}</div>
      ${merc ? `<p class="hint">I mercenari combattono la prima battaglia e poi se ne vanno; quelli che non partono restano a difendere il fortino.</p>` : ''}`;
  const formRest = done ? '' : `
      <ul class="ext-ledger">
        <li><b>Per le risorse</b>: chi vince porta via fino a ${LOOT_SCUDI} scudi e ${LOOT_GRANO} misure di grano per soldato rimasto in piedi; poi l'esercito torna a casa.</li>
        <li><b>Per la distruzione</b>: se vincete, l'esercito resta ad assediare e torna all'assalto all'inizio di ogni vostro anno. Ogni vittoria saccheggia, uccide il ${Math.round(SIEGE_KILL * 100)}% dei servi, brucia i granai e, con almeno ${CATAPULTS_PER_RING} catapulte, abbatte una cerchia. Dopo ${SIEGE_FALL_WINS} vittorie, o quando restano meno di ${FALL_SERVI} servi, il feudo cade: prendete terre, tesoro e metà dei servi, e il suo signore esce dalla partita. Potete togliere l'assedio quando volete; l'assediato può proporvi la pace a ${PEACE_PER_SOLDIER} scudi per soldato assediante, e siete voi a decidere se accettarla.${early ? ` <b>Non prima dell'anno ${900 + DESTROY_FROM_Q}</b>: nei primi ${DESTROY_FROM_Q} anni ogni signore ha tempo per fortificarsi.` : ''}</li>
      </ul>
      <p class="hint"><b>Le battaglie si combattono alla chiusura dell'anno</b>, quando tutti i signori hanno giocato: l'esercito parte a fine turno, e contro un confinante combatte alla fine dell'anno prossimo, contro un feudo lontano alla fine di quello dopo. Fino ad allora il nemico può arruolare e alzare mura, e se ha torri di guardia vi vedrà arrivare.</p>
      <p class="hint">Avete ${n(s)} soldati e ${plural(cat, 'catapulta', 'catapulte')}${s + merc < WAR_MIN ? ` (servono almeno ${WAR_MIN} soldati: arruolateli nell'esercito)` : ''}. La campagna costa ${CAMPAIGN_COST} scudo a soldato. Al ritorno i soldati restano in marcia e non difendono il feudo: un anno da un confinante, due da un feudo lontano, e la malattia ne porta via fino al ${Math.round(MARCH_SICKNESS * 100)}% per anno di viaggio. In battaglia la forza dei due campi varia del 30% in più o in meno: per stare tranquilli mandate una volta e mezza la difesa nemica.</p>`;
  const spyBox = spy
    ? `<p class="spy on">La vostra spia è oltre confine fino all'anno ${900 + spyUntil(st, me)}: conoscete gli eserciti di tutti i signori.</p>`
    : `<div class="spy"><p>Gli eserciti dei vicini sono segreti: vedete solo le mura e la milizia dei servi (e la guarnigione dei feudi che assediate). Una spia li rivela per ${SPY_YEARS} anni.</p>
        <button data-act="ext" data-op="spy">Assoldate una spia (${SPY_COST} scudi)</button></div>`;
  return `<div class="ext-map">${miniMap(g)}</div>${spyBox}
    <table class="ext-table war-table"><thead><tr><th>Feudo</th><th>Distanza</th><th>Difesa</th><th>Ricchezze</th><th></th></tr></thead><tbody>${rows}</tbody></table>${form}${formRest}`;
}

function assedioPanel(g: Game, st: SpadeState): string {
  const me = g.state.current, ps = g.state.players, p = g.player;
  const list = siegesOn(st, me);
  if (!list.length) return '<p>Nessuno vi assedia.</p>';
  const rows = list.map(x => {
    const price = peacePrice(x);
    const def = defenseOf(p, st.soldati[me], st.mura[me], x.cat);
    const block = peaceBlock(g, x);
    const peace = block
      ? `<p class="hint">Pace: ${block}${x.offerta ? ` (${n(x.offerta.price)} scudi, che pagherete solo se accetta)` : ''}.</p>`
      : `<div class="btns"><button data-act="ext" data-op="peace" data-target="${x.owner}" ${p.scudi + p.credito < price ? 'disabled' : ''}>Proponete la pace (${n(price)} scudi)</button></div>`;
    return `<li><b>${who(ps[x.owner])}</b> vi assedia con ${n(x.n)} soldati${x.cat ? ` e ${plural(x.cat, 'catapulta', 'catapulte')}` : ''}: ha vinto ${x.wins} assalti su ${SIEGE_FALL_WINS}. La vostra difesa contro di lui: <b>${n(def)}</b>.
      ${peace}</li>`;
  }).join('');
  return `<p>Un esercito nemico è accampato sotto le vostre mura e tornerà all'assalto all'inizio del suo anno. A ogni vittoria saccheggia, uccide il ${Math.round(SIEGE_KILL * 100)}% dei servi, brucia i granai e, con le catapulte, abbatte una cerchia. Dopo ${SIEGE_FALL_WINS} vittorie il feudo cade e uscite dalla partita.</p>
    <ul class="ext-ledger">${rows}</ul>
    <p class="hint">Per resistere: arruolate soldati e alzate le mura nel menu Guerra, dopo i dispendimenti. Oppure proponete la pace: se l'assediante accetta prende gli scudi e torna a casa, se rifiuta l'assedio continua (e potrete riprovare l'anno prossimo).</p>`;
}

function brigantiPanel(g: Game, st: SpadeState): string {
  const me = g.state.current, s = st.soldati[me];
  const tried = st.lastDrive[me] === g.state.q;
  return `<p>I briganti si sono accampati nei vostri boschi: finché restano, vi sottraggono <b>${Math.round(BRIGAND_TAX * 100)}%</b> delle rendite.</p>
    <ul class="ext-ledger">
      <li>Scacciarli: servono almeno ${WAR_MIN} soldati; la banda vale circa ${BRIGAND_BAND} uomini. Una prova l'anno.</li>
      <li>Pagarli: ${BRIGAND_PAY} scudi e se ne tornano nei boschi.</li>
    </ul>
    <div class="btns">
      <button data-act="ext" data-op="drive" ${s < WAR_MIN || tried ? 'disabled' : ''}>Scacciali con ${n(s)} soldati</button>
      <button data-act="ext" data-op="pay">Pagali ${BRIGAND_PAY} scudi</button>
    </div>${tried ? '<p class="hint">Quest\'anno avete già provato a scacciarli.</p>' : ''}`;
}

const PANELS: Record<string, { title: string; render: (g: Game, st: SpadeState) => string }> = {
  mura: { title: 'Le mura', render: muraPanel },
  torri: { title: 'Le torri di guardia', render: torriPanel },
  esercito: { title: "L'esercito", render: eserPanel },
  guerra: { title: 'La guerra', render: guerraPanel },
  assedio: { title: "L'assedio", render: assedioPanel },
  briganti: { title: 'I briganti', render: brigantiPanel },
};

// ---------------------------------------------------------------- vista

export const view: ExpansionView = {
  title: 'Spade e Castelli',
  motto: 'Mura da innalzare, eserciti da arruolare, spie da mandare oltre confine e briganti da scacciare.',
  miniature,
  summary: [
    `Esercito: arruolate soldati togliendoli ai servi; costano armi, soldo e lavoro. Contro le orde delle fazioni un soldato vale ${SOLDIER_VS_HORDE} nemici, sei volte un servo.`,
    `Catapulte: ${CATAPULTS_PER_RING} catapulte aprono una breccia in una cerchia di mura nemica; senza, le mura danno al difensore un grande vantaggio (+${Math.round(WALL_BONUS * 100)}% di difesa per cerchia). Costano ${CATAPULT_COST} scudi l'una.`,
    `Guerra: le battaglie si combattono alla chiusura dell'anno, quando tutti hanno giocato; l'esercito parte a fine turno e combatte alla fine dell'anno seguente contro un confinante, un anno più tardi contro un feudo lontano. ` +
    `Una volta l'anno potete assalire un feudo, per le risorse (saccheggio e ritorno) o per la distruzione (l'esercito resta ad assediare finché il feudo cade, e il suo signore esce dalla partita; non prima dell'anno ${900 + DESTROY_FROM_Q}). Ci si può sempre ritirare; l'assediato può proporre la pace, e l'assediante decide se accettarla. I soldati che tornano restano in marcia: un anno di ritorno dai confinanti, due dai feudi lontani, e intanto il feudo resta sguarnito. Per via la malattia ne porta via fino al ${Math.round(MARCH_SICKNESS * 100)}% per anno.`,
    `Spia: gli eserciti altrui sono segreti; una spia costa ${SPY_COST} scudi, se ne tiene una sola e per ${SPY_YEARS} anni rivela i soldati di tutti i signori.`,
    `Mura: fino a ${MURA_MAX} cerchie, difendono da guerre, fazioni e briganti (+${Math.round(WALL_VS_HORDE * 100)}% di difesa contro le orde per cerchia), ma non contano per il rango.`,
    `Briganti: chi li subisce li manda sul feudo di un avversario, che perde un quarto delle rendite finché non li scaccia o non paga.`,
  ],

  cards(g): ExtCard[] {
    const st = ss(g), me = g.state.current;
    const band: ExtCard = { panel: 'briganti', title: 'Briganti', sub: 'accampati nel vostro feudo', art: art.briganti };
    const hasBand = st.brigands === me;
    const on = siegesOn(st, me);
    const siege: ExtCard[] = on.length ? [{ panel: 'assedio', title: 'Assedio', sub: `${n(on.reduce((k, x) => k + x.n, 0))} nemici sotto le mura`, art: art.guerra }] : [];
    if (g.state.phase.kind === 'commercio') return [...siege, ...(hasBand ? [band] : [])];
    // nei dispendimenti tutto ciò che riguarda le armi sta nel menu Guerra
    return ([
      { panel: 'mura', title: 'Mura', sub: `${st.mura[me]} di ${MURA_MAX} cerchie`, art: art.mura },
      { panel: 'torri', title: 'Torri di guardia', sub: towerAlerts(g, me, 'guerra').length ? 'nemici in vista!' : `livello ${torriOf(st, me)} di ${TORRI_MAX}`, art: art.torri },
      { panel: 'esercito', title: 'Esercito', sub: `${n(st.soldati[me])} soldati${awayOf(st, me) ? `, ${n(awayOf(st, me))} lontani` : ''}${catapultsOf(st, me) ? `, ${n(catapultsOf(st, me))} catapulte` : ''}`, art: art.esercito },
      { panel: 'guerra', title: 'Guerra', sub: st.lastWar[me] === g.state.q ? 'gia\' combattuta quest\'anno' : siegesBy(st, me).length ? `${siegesBy(st, me).length === 1 ? 'un assedio' : `${siegesBy(st, me).length} assedi`} in corso` : `${neighbors(g, me).length} confinanti, ${g.state.players.filter((x, i) => i !== me && x.caduto === undefined).length - neighbors(g, me).length} lontani`, art: art.guerra, disabled: g.state.players.length < 2 },
      ...siege,
      ...(hasBand ? [band] : []),
    ] as ExtCard[]).map(c => ({ ...c, menu: 'guerra' as const }));
  },

  dispatches(g, animate) {
    const st = ss(g);
    return dispatchScrolls(st.inbox.map(d => dispatchItem(d, g.state)), animate, "Ser Ardengo, capitano d'armi");
  },

  eventPanel(g) {
    const st = ss(g), me = g.state.current;
    if (st.pendingMove !== me) return null;
    const ps = g.state.players;
    // i briganti vanno solo su un signore ancora in gioco
    const others = ps.map((p, i) => ({ p, i })).filter(x => x.i !== me && x.p.caduto === undefined);
    const buttons = others.map(({ p, i }) => `<button data-act="ext" data-op="move" data-target="${i}">${who(p)}<small> ${n(wealthIndex(p))}</small></button>`).join('');
    return `<div class="brigand-move">
      ${speechBox(ARDENGO, `${h(g.player)}, la banda si ritira, ma non lontano. Dove la spingiamo? Sul feudo che sceglierete ruberà un quarto delle rendite finché non verrà scacciata.`)}
      <div class="ext-map">${miniMap(g)}</div>
      <div class="btns brigand-targets">${buttons}</div></div>`;
  },

  cardNote: () => 'Non dovete decidere ora: la carta resta fra le vostre <b>Carte di guerra</b>, nel pannello a sinistra. Potete giocarla nei prossimi anni, una carta per anno.',

  aside(g) {
    const st = ss(g), me = g.state.current, ps = g.state.players;
    const band = st.brigands === null ? 'nei boschi' : st.brigands === me ? '<b class="warn">nel vostro feudo</b>' : `a ${FEUDI[ps[st.brigands].feudo]}`;
    const spy = hasSpy(g, me) ? `<br>Spia fino al ${900 + spyUntil(st, me)}` : '';
    const away = awayOf(st, me);
    const sieged = siegesOn(st, me).length ? '<br><b class="warn">Sotto assedio!</b>' : '';
    return `<p class="exp-aside">Mura ${st.mura[me]} · Soldati ${n(st.soldati[me])}${away ? ` (+${n(away)} lontani)` : ''}${catapultsOf(st, me) ? ` · Catapulte ${catapultsOf(st, me)}` : ''}${torriOf(st, me) ? ` · Torri ${torriOf(st, me)}` : ''}${sieged}<br>Briganti: ${band}${spy}${mercsOf(g, st, me) ? `<br>Mercenari ${n(mercsOf(g, st, me))}` : ''}</p>${cardsAside(g)}`;
  },

  cost(g, op, data, field) {
    const st = ss(g), me = g.state.current;
    const k = (name: string) => Math.max(0, field(name) || 0);
    switch (op) {
      case 'wall': return MURA_COST;
      case 'tower': return torriOf(st, me) < TORRI_MAX ? TORRE_COST[torriOf(st, me)] : 0;
      case 'recruit': return k('recruit-n') * RECRUIT_COST;
      case 'catapults': return k('catapult-n') * CATAPULT_COST;
      case 'spy': return SPY_COST;
      case 'mercHire': return mercCost(g);
      case 'war': return k('war-sent') * CAMPAIGN_COST;
      case 'pay': return BRIGAND_PAY;
      case 'peace': {
        const sg = siegesOn(st, me).find(x => x.owner === Number(data.target));
        return sg ? peacePrice(sg) : 0;
      }
    }
    return 0;
  },

  // l'assediato ha proposto la pace: l'assediante sceglie, come davanti a un imprevisto
  decision(g) {
    const kind = g.state.phase.kind;
    if (kind !== 'commercio' && kind !== 'investimenti') return null;
    const st = ss(g), me = g.state.current, p = g.player, ps = g.state.players;
    const s = siegesBy(st, me).find(x => x.offerta);
    if (!s) return null;
    const d = ps[s.target], def = defenseOf(d, st.soldati[s.target], st.mura[s.target], s.cat);
    return {
      title: 'Ambasceria di pace',
      body: `${h(p)}, un messo di ${who(d)} è giunto al nostro campo. Vi offre <b>${n(s.offerta!.price)} scudi</b> perché togliate l'assedio. Avete ${n(s.n)} soldati${s.cat ? ` e ${plural(s.cat, 'catapulta', 'catapulte')}` : ''} e ${s.wins} vittorie su ${SIEGE_FALL_WINS}; la sua difesa conta ${n(def)} uomini. Se accettate, l'esercito torna a casa con gli scudi; se rifiutate, l'assedio continua.`,
      options: [
        { label: `Accetto la pace (${n(s.offerta!.price)} scudi)`, op: 'peaceAccept', target: s.target },
        { label: "Continuo l'assedio", op: 'peaceReject', target: s.target, primary: true },
      ],
    };
  },

  resourceBar(g) {
    const st = ss(g), me = g.state.current;
    const away = awayOf(st, me), cat = catapultsOf(st, me), catAway = catAwayOf(st, me);
    return [
      { ico: barIcons.mura, value: `${st.mura[me]}/${MURA_MAX}`, label: 'cerchie di mura' },
      { ico: barIcons.soldati, value: n(st.soldati[me]), label: away ? `soldati, +${n(away)} lontani` : 'soldati' },
      { ico: barIcons.torri, value: `${torriOf(st, me)}/${TORRI_MAX}`, label: 'torri di guardia' },
      { ico: barIcons.catapulte, value: n(cat), label: catAway ? `catapulte, +${n(catAway)} lontane` : 'catapulte' },
    ];
  },

  alert(g, where) {
    return alertBox(g, towerAlerts(g, g.state.current, where));
  },

  yearEndScenes(state, year) {
    const st = state.ext as SpadeState | undefined;
    if (!st) return [];
    return st.wars.filter(w => w.q === year - 900).map(w => {
      const place = FEUDI[state.players[w.defender].feudo];
      const title = (w.round ?? 1) > 1 ? `Assedio di ${place}` : `Battaglia di ${place}`;
      return { title, html: `<figure class="battle">${battleScene(w, state.players)}</figure><p>${battleTale(w, state.players)}</p>` };
    });
  },

  mapMarkers(state) {
    const st = state.ext as SpadeState | undefined;
    if (!st) return '';
    const ps = state.players;
    const wars = st.wars.filter(w => w.q === state.q - 1).map(w => {
      const [x1, y1] = FEUDO_POS[ps[w.attacker].feudo], [x2, y2] = FEUDO_POS[ps[w.defender].feudo];
      return swords((x1 + x2) / 2, (y1 + y2) / 2);
    }).join('');
    const band = st.brigands === null ? '' : (() => {
      const [x, y] = FEUDO_POS[ps[st.brigands].feudo];
      return brigandToken(x + THUMB.w / 2 - 6, y - THUMB.h / 2 - 6);
    })();
    return wars + band;
  },

  open(g, panel) {
    const p = g.player, st = ss(g), me = g.state.current;
    switch (panel) {
      case 'torri': return torriOf(st, me) ? `Le nostre vedette scrutano i passi, ${h(p)}. Più alte le torri, prima ci avvisano.` : `${h(p)}, senza torri di guardia un esercito nemico ce lo troveremo sotto le mura senza preavviso.`;
      case 'mura': return st.mura[me] ? `Le nostre mura hanno ${st.mura[me]} ${st.mura[me] === 1 ? 'cerchia' : 'cerchie'}, ${h(p)}. Un'altra ci renderebbe più sicuri.` : `${h(p)}, il feudo è aperto come un granaio senza porta. Una cerchia di mura terrebbe lontani nemici e briganti.`;
      case 'esercito': return st.soldati[me] ? `Abbiamo ${n(st.soldati[me])} uomini in armi, ${h(p)}. Ricordate che ogni soldato è un servo in meno nei campi.` : pick([`Nessun soldato, ${h(p)}: solo i villici con i forconi. Volete arruolare?`, `Senza esercito non si muove guerra, ${h(p)}, e non si scacciano i briganti.`]);
      case 'guerra': {
        const all = g.state.players.filter((x, i) => i !== me && x.caduto === undefined);
        const richest = all.sort((a, b) => wealthIndex(b) - wealthIndex(a))[0];
        if (!richest) return 'Non abbiamo nessuno da assalire.';
        const away = awayOf(st, me);
        if (away) return `${h(p)}, ${n(away)} dei nostri sono lontani, in marcia o all'assedio. Chi parte ora lascia il feudo con meno difese.`;
        return hasSpy(g, me)
          ? `${h(p)}, la nostra spia ci ha portato i numeri dei loro eserciti. ${who(richest)} è il più ricco del regno. Ai confinanti si va e si torna in un anno; ai feudi lontani ne servono due.`
          : `${h(p)}, ecco i nostri confini. ${who(richest)} è il più ricco del regno, ma non sappiamo quanti uomini abbia: una spia ce lo direbbe.`;
      }
      case 'assedio': return pick([`${h(p)}, i loro fuochi brillano sotto le mura. Reggeremo, se ci date uomini e pietre.`, `Ci assediano, ${h(p)}. Possiamo resistere, o pagare perché se ne vadano.`]);
      case 'briganti': return `${h(p)}, i briganti sono nei nostri boschi e taglieggiano i mercanti. Ogni anno che restano ci costa un quarto delle rendite.`;
    }
    return '';
  },

  panel(g, ui: ExtUi) {
    const panel = PANELS[ui.panel ?? ''];
    if (!panel) return '';
    const back = g.state.phase.kind === 'investimenti' ? 'Torna alla guerra' : 'Torna alla delibera';
    return `<h2>${panel.title}</h2>${speechBox(ARDENGO, ui.say)}<div class="ext-panel">${panel.render(g, ss(g))}</div>
      <div class="btns"><button data-act="extClose" class="primary">${back}</button></div>`;
  },

  act(g, op, data, field): ExtActionResult {
    const p = g.player, st = ss(g), me = g.state.current;
    switch (op) {
      case 'tower': {
        const r = buildTower(g);
        return { say: reaction(r, `Le vedette salgono sulle torri, ${h(p)}: ora sono al livello ${torriOf(st, me)}. Nessun esercito ci coglierà di sorpresa.`, p) };
      }
      case 'wall':
        {
        const r = buildWall(g); // prima l'opera, poi la frase con il nuovo numero di cerchie
        return { say: reaction(r, `I muratori sono al lavoro, ${h(p)}: le mura hanno ora ${st.mura[me]} ${st.mura[me] === 1 ? 'cerchia' : 'cerchie'}.`, p) };
      }
      case 'recruit': {
        const k = field('recruit-n');
        const r = recruit(g, k);
        return {
          say: reaction(r, `${n(k)} uomini lasciano i campi e prendono le armi.`, p),
          notice: r.ok ? { title: 'Bando di arruolamento', body: `${plural(k, 'servo lascia', 'servi lasciano')} i campi e ${k === 1 ? 'prende' : 'prendono'} le armi, per ${n(k * RECRUIT_COST)} scudi di armi. Nel fortino ci sono ora <b>${n(st.soldati[me])} soldati</b>. ${treasury(p)}` } : undefined,
        };
      }
      case 'disband': {
        const k = field('disband-n');
        return { say: reaction(disband(g, k), `${n(k)} soldati tornano ai campi.`, p) };
      }
      case 'catapults': {
        const k = field('catapult-n');
        const r = buildCatapults(g, k);
        return {
          say: reaction(r, `I carpentieri hanno montato ${plural(k, 'catapulta', 'catapulte')}, ${h(p)}. Nessuna mura ci fermerà.`, p),
          notice: r.ok ? { title: 'Ordine ai carpentieri', body: `I carpentieri hanno costruito ${plural(k, 'catapulta', 'catapulte')} per ${n(k * CATAPULT_COST)} scudi. Nel fortino ce ne sono ora <b>${n(catapultsOf(st, me))}</b>. ${treasury(p)}` } : undefined,
        };
      }
      case 'lift': {
        const t = Number(data.target);
        return { say: reaction(liftSiege(g, t), `Togliamo il campo, ${h(p)}: i soldati si rimettono in marcia verso casa.`, p) };
      }
      case 'peace': {
        const t = Number(data.target), foe = who(g.state.players[t]);
        const r = offerPeace(g, t);
        if (!r.ok) return { say: reaction(r, '', p) };
        const price = n(r.price ?? 0);
        if (!r.answered) return {
          say: `L'ambasciatore è partito con l'offerta di ${price} scudi, ${h(p)}. ${foe} risponderà nel suo turno: fino ad allora l'assedio continua.`,
          notice: { title: 'Ambasceria di pace', body: `Avete offerto <b>${price} scudi</b> a ${foe} perché tolga l'assedio. Risponderà nel suo turno; gli scudi si pagano solo se accetta.` },
        };
        return r.accepted
          ? { say: `${foe} ha accettato, ${h(p)}: pagati ${price} scudi, il suo esercito toglie l'assedio.`, panel: siegesOn(st, me).length ? undefined : null, notice: { title: 'Pace conclusa', body: `${foe} ha accettato la vostra offerta: pagati <b>${price} scudi</b>, il suo esercito toglie il campo e torna a casa. ${treasury(p)}` } }
          : { say: `${foe} ha respinto l'offerta, ${h(p)}. L'assedio continua: potremo riprovare l'anno prossimo.`, notice: { title: 'Pace respinta', body: `${foe} ha respinto la vostra offerta di ${price} scudi: l'assedio continua. Potrete fare un'altra proposta l'anno prossimo.` } };
      }
      case 'peaceAccept':
      case 'peaceReject': {
        const t = Number(data.target), foe = who(g.state.players[t]);
        const price = siegesBy(st, me).find(x => x.target === t)?.offerta?.price ?? 0;
        const r = answerPeace(g, t, op === 'peaceAccept');
        if (!r.ok) return { say: reaction(r, '', p) };
        if (op === 'peaceReject') return { say: `Proposta respinta, ${h(p)}: l'assedio di ${FEUDI[g.state.players[t].feudo]} continua.`, notice: { title: 'Proposta respinta', body: `Avete rimandato indietro il messo di ${foe}: l'assedio continua. Se vorrà, vi farà un'altra proposta l'anno prossimo.` } };
        return r.paid
          ? { say: `Pace fatta: ${foe} ha pagato ${n(price)} scudi e il nostro esercito torna a casa.`, notice: { title: 'Pace conclusa', body: `${foe} vi ha pagato <b>${n(price)} scudi</b>. Il vostro esercito toglie l'assedio e si rimette in marcia verso casa.` } }
          : { say: `${foe} non ha più di che pagare, ${h(p)}: niente pace, l'assedio continua.`, notice: { title: 'Niente pace', body: `${foe} non ha più i ${n(price)} scudi promessi: l'assedio continua.` } };
      }
      case 'spy':
        return { say: reaction(hireSpy(g), pick([`Un mercante di stoffe passerà i confini per noi, ${h(p)}. Ecco quanti uomini hanno i nostri vicini.`, 'La spia è partita: per due anni sapremo quanti soldati tengono gli altri signori.']), p) };
      case 'war': {
        const num = (k: string) => (Number.isFinite(field(k)) ? field(k) : 0);
        const r = declareWar(g, Number(data.target), num('war-sent'), data.goal as WarGoal, num('war-cat'), num('war-merc'));
        if (!r.ok) return { say: reaction(r, '', p) };
        const c = r.campaign!, place = FEUDI[g.state.players[c.target].feudo], when = c.arrive === g.state.q + 1 ? 'alla fine dell\'anno prossimo' : `alla fine del ${900 + c.arrive}`;
        if (r.joined) return { say: `I rinforzi partono per il campo sotto ${place}, ${h(p)}: si uniranno all'assedio ${when}.` };
        return { say: pick([`L'esercito è partito, ${h(p)}! Si combatterà sotto ${place} ${when}.`, `Le schiere sono in marcia verso ${place}, ${h(p)}. La battaglia sarà ${when}: preghiamo.`]) };
      }
      case 'mercHire': {
        const r = hireMercs(g);
        return {
          say: reaction(r, `La compagnia si accampa nel fortino, ${h(p)}: ${n(r.n ?? 0)} spade in più, e nessuna spia lo saprà.`, p),
          notice: r.ok ? { title: 'Condotta firmata', body: `Avete assoldato <b>${n(r.n ?? 0)} mercenari</b>. Difendono il fortino, o partono con l'esercito dal pannello Guerra; dopo la prima battaglia se ne vanno. ${treasury(p)}` } : undefined,
        };
      }
      case 'traitor': {
        const t = Number(data.target);
        return { say: reaction(playTraitor(g, t), `Il nostro uomo è partito per ${FEUDI[g.state.players[t]?.feudo ?? 0]}, ${h(p)}. Al prossimo assalto vedremo se manterrà la parola.`, p) };
      }
      case 'truce':
        return { say: reaction(invokeTruce(g), `Il vescovo ha proclamato la tregua di Dio sul nostro feudo, ${h(p)}: per quest'anno nessuno ci assalirà.`, p) };
      case 'drive': {
        const r = driveBrigands(g);
        return { say: reaction(r, r.win ? `I briganti sono in fuga! Abbiamo perduto ${plural(r.lost ?? 0, 'uomo', 'uomini')}.` : `La banda ha resistito, ${h(p)}: abbiamo perduto ${plural(r.lost ?? 0, 'uomo', 'uomini')}. Riproveremo l'anno prossimo, o pagheremo.`, p), panel: r.ok && r.win ? null : undefined };
      }
      case 'pay': {
        const r = payBrigands(g);
        return { say: reaction(r, `Pagati. La banda se ne torna nei boschi... per ora.`, p), panel: r.ok ? null : undefined };
      }
      case 'move': {
        const t = Number(data.target);
        return { say: reaction(moveBrigands(g, t), `La banda marcia verso ${FEUDI[g.state.players[t]?.feudo ?? 0]}.`, p) };
      }
    }
    return { say: '' };
  },

  chronicle(f, players) {
    const d = f.data, P = (i: number) => who(players[i]);
    const card = cardChronicle(f.kind, d, players);
    if (card !== undefined) return card;
    switch (f.kind) {
      // gli eserciti sono segreti (si scoprono con le spie): la cronaca non ne dice il numero
      case 'recruit': return 'Arruolò nuovi soldati fra i suoi servi.';
      case 'tower': return d.level === 1 ? 'Fece costruire una torre di guardia sui confini.' : `Alzò le torri di guardia al ${d.level}° livello.`;
      case 'wall': return d.level === 1 ? 'Cinse il feudo di una prima cerchia di mura.' : `Innalzò la ${d.level}ª cerchia di mura.`;
      case 'war': {
        const spoils = [d.scudi ? `${n(d.scudi)} scudi` : '', d.grano ? `${n(d.grano)} misure di grano` : '', d.acri ? `${n(d.acri)} acri di terra` : ''].filter(Boolean).join(', ');
        if (d.fell) return `Prese il feudo di ${P(d.target)}, che cadde dopo l'assedio${spoils ? `, e ne ebbe ${spoils}` : ''}.`;
        if ((d.round ?? 1) > 1) return d.win ? `Tornò all'assalto di ${P(d.target)} (${d.round}° assalto dell'assedio) e vinse${spoils ? `, prendendo ${spoils}` : ''}.` : `Tornò all'assalto di ${P(d.target)} (${d.round}° assalto dell'assedio), ma fu respinto.`;
        if (d.goal === 1) return d.win ? `Mosse guerra a ${P(d.target)} per distruggerlo, vinse e ne pose l'assedio.` : `Mosse guerra a ${P(d.target)} per distruggerlo, ma fu respinto e perse ${n(d.lost)} uomini.`;
        return d.win
          ? `Mosse guerra a ${P(d.target)} con ${n(d.sent)} soldati e vinse${spoils ? `, tornando con ${spoils}` : ''}.`
          : `Mosse guerra a ${P(d.target)} con ${n(d.sent)} soldati, ma fu respinto e perse ${n(d.lost)} uomini.`;
      }
      case 'besieged': if ((d.round ?? 1) > 1) return d.held ? `Resistette a un nuovo assalto dell'assedio di ${P(d.attacker)}${d.bombard ? `, ma le catapulte gli uccisero ${n(d.bombard)} servi` : ''}.` : `Cedette a un nuovo assalto dell'assedio di ${P(d.attacker)}${d.rings ? ', che gli abbatté una cerchia di mura' : ''}.`;
        return d.held
        ? `Resistette all'assalto di ${P(d.attacker)}${d.bombard ? `, ma le catapulte gli uccisero ${n(d.bombard)} servi` : ''}.`
        : `Fu sconfitto da ${P(d.attacker)}${d.acri ? `, che gli tolse ${n(d.acri)} acri` : d.scudi || d.grano ? `, che ne saccheggiò le casse e i granai` : ''}.`;
      case 'brigandsMove': return `Spinse i briganti verso il feudo di ${P(d.target)}.`;
      case 'brigandTax': return `I briganti accampati nei suoi boschi gli sottrassero ${n(d.loss)} scudi di rendite.`;
      case 'brigandsDriven': return d.win ? 'Con i suoi soldati scacciò i briganti dal feudo.' : `Provò a scacciare i briganti, ma fu respinto e perse ${n(d.lost)} uomini.`;
      case 'brigandsPaid': return `Pagò ${n(d.amount)} scudi ai briganti perché se ne andassero.`;
      case 'army': return 'Tenne un esercito sotto le armi e ne pagò il soldo.';
      case 'catapults': return 'Fece costruire macchine d\'assedio.';
      case 'reinforce': return `Mandò rinforzi all'assedio di ${P(d.target)}.`;
      case 'march': return `Mise in marcia l'esercito contro ${P(d.target)}${d.goal ? ', per distruggerlo' : ''}.`;
      case 'lift': return `Tolse l'assedio a ${P(d.target)}.`;
      case 'peace': return `Comprò la pace da ${P(d.attacker)} per ${n(d.scudi)} scudi.`;
      case 'peaceOffer': return null;
      case 'peaceRefused': return `Offrì ${n(d.scudi)} scudi a ${P(d.attacker)} per la pace, ma la proposta fu respinta.`;
      case 'peaceAccepted': return `Accettò ${n(d.scudi)} scudi da ${P(d.target)} e tolse l'assedio.`;
      case 'conquest': return `Il feudo di ${P(d.target)} passò sotto il suo dominio: ${n(d.acri)} acri e ${n(d.servi)} servi.`;
      case 'fallen': return 'Il suo feudo cadde in guerra: perse ogni cosa e uscì dalla storia del regno.';
      case 'returned': return `Le sue schiere tornarono dalla campagna contro ${P(d.from)}${d.lost ? `; per via ${plural(d.lost, 'soldato morì', 'soldati morirono')} di malattia` : ''}.`;
    }
    return null;
  },

  news(state, year) {
    const st = state.ext as SpadeState | undefined;
    if (!st) return [];
    const out: string[] = [];
    const wars = st.wars.filter(w => 900 + w.q === year);
    if (wars.length > 1) out.push(`Fu un anno di guerra: si combatterono ${wars.length} battaglie fra i feudi del regno.`);
    else if (wars.length === 1) out.push(`Si combatté una battaglia: ${who(state.players[wars[0].attacker])} contro ${who(state.players[wars[0].defender])}.`);
    if (st.brigands !== null) out.push(`I briganti infestano ora i boschi di ${FEUDI[state.players[st.brigands].feudo]}.`);
    return out;
  },
};
