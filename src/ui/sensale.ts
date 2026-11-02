/**
 * Il sensale di piazza nel gioco base: riquadro nella Delibera, pannello per
 * assoldarlo, giudizi accanto alle gabelle e riga della cronaca. Solo
 * presentazione: le regole sono in src/domain/sensale.ts.
 */
import { rankOf } from '../domain/rank';
import {
  hasSensale, SENSALE_IDS, SENSALE_RANK, SENSALI, sensaleCost, sensaleNow, sensaleUseful, sensaleVerdict, type SensaleId,
} from '../domain/sensale';
import type { Game } from '../domain/turn';
import type { Player } from '../domain/types';
import { honorific } from './advisor';
import type { RateBadges } from './rendite';
import { speechBox, type Speaker } from './speaker';

const n = (v: number) => Math.floor(v).toLocaleString('it-IT');

/** Ritratto di un sensale: cappuccio a punta, colori e tratti diversi per ciascuno. */
const sensalePortrait = (label: string, bg: string, hood: string, face: string) => `
<svg viewBox="0 0 120 140" class="portrait" role="img" aria-label="${label}">
  <rect width="120" height="140" rx="10" fill="${bg}"/>
  <path d="M8 140 C12 104 34 92 60 92 C86 92 108 104 112 140 Z" fill="${hood}"/>
  <path d="M50 96 L60 120 L70 96" fill="#e8d8a8"/>
  <ellipse cx="60" cy="64" rx="21" ry="25" fill="#e8b88a"/>
  <path d="M32 58 C30 28 90 28 88 58 C84 44 76 38 60 38 C44 38 36 44 32 58 Z" fill="${hood}"/>
  <path d="M86 50 l14 -10 l-4 14z" fill="${hood}"/>
  <path d="M60 65 q-3 8 0 10" stroke="#b9875a" stroke-width="2" fill="none" stroke-linecap="round"/>
  ${face}
</svg>`;

/** I tre sensali di piazza: sanno cosa pensano popolo e mercanti delle gabelle. */
export const SENSALE_SPEAKERS: Record<SensaleId, Speaker> = {
  // Baldo ha l'orecchio fine: un orecchio grande, la mano a coppa, la barba grigia del vecchio saggio
  baldo: { name: SENSALI.baldo.name, role: 'sensale di piazza, il più fino', portrait: sensalePortrait('Baldo Orecchiofine, il sensale', '#b9c8dc', '#2e4f7a', `
  <circle cx="51" cy="63" r="2.2" fill="#2b2118"/><circle cx="69" cy="63" r="2.2" fill="#2b2118"/>
  <path d="M46 56 q5 -2 10 0 M64 56 q5 -2 10 0" stroke="#9a9a9a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M42 74 C42 96 78 96 78 74 C72 84 48 84 42 74z" fill="#cfcfcf"/>
  <path d="M38 56 c-14 -4 -16 20 -2 18" fill="#e8b88a" stroke="#b9875a" stroke-width="1.5"/><path d="M36 60 c-5 0 -5 8 0 8" stroke="#b9875a" fill="none"/>
  <path d="M22 70 c-2 -8 6 -16 12 -12 l-2 14z" fill="#e8b88a" stroke="#b9875a"/>`) },
  // Cecco mormora: occhio socchiuso e bocca storta, sempre a bisbigliare
  cecco: { name: SENSALI.cecco.name, role: 'sensale di piazza', portrait: sensalePortrait('Cecco il Mormoratore, il sensale', '#c9d3a0', '#3f6b3a', `
  <circle cx="51" cy="64" r="2.2" fill="#2b2118"/><path d="M64 64 q5 -3 10 0" stroke="#2b2118" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path d="M46 57 q5 -2 10 1 M64 56 q5 -3 10 0" stroke="#6b4a2c" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M50 80 q10 6 20 -2" stroke="#8b4b3b" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M38 64 c-6 -2 -8 8 -2 10" fill="#e8b88a" stroke="#b9875a"/>`) },
  // Taddeo ha la lingua sciolta: bocca aperta, parla sempre, occhi sgranati
  taddeo: { name: SENSALI.taddeo.name, role: 'sensale di piazza, il più chiacchierone', portrait: sensalePortrait('Taddeo Linguasciolta, il sensale', '#e3c3a0', '#8b2a1e', `
  <circle cx="51" cy="62" r="3" fill="#fff" stroke="#2b2118"/><circle cx="51" cy="62" r="1.5" fill="#2b2118"/>
  <circle cx="69" cy="62" r="3" fill="#fff" stroke="#2b2118"/><circle cx="69" cy="62" r="1.5" fill="#2b2118"/>
  <path d="M45 54 q6 -5 12 -1 M63 53 q6 -4 12 1" stroke="#6b4a2c" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M49 78 q11 14 22 0z" fill="#5c1520"/><path d="M54 84 q6 6 12 0 q-6 -3 -12 0z" fill="#d9707a"/>
  <path d="M38 64 c-6 -2 -8 8 -2 10" fill="#e8b88a" stroke="#b9875a"/>`) },
};

const sensaleArt = `<svg viewBox="0 0 64 48" class="card-art" aria-hidden="true" data-label="sensale"><path d="M4 44 h56" stroke="#6b4a2c" stroke-width="2"/>
  <path d="M20 44 C20 30 26 24 32 24 C38 24 44 30 44 44z" fill="#3f6b3a"/><circle cx="32" cy="18" r="7" fill="#e8b88a"/>
  <path d="M24 16 C24 6 40 6 40 16 C38 11 26 11 24 16z" fill="#3f6b3a"/><path d="M39 12 l8 -5 l-2 8z" fill="#3f6b3a"/>
  <path d="M30 14 q4 -6 8 0 q-4 6 -8 0" fill="#efe2bf" stroke="#8a6a3a"/><path d="M33 10 v-3 M36 10 v-3" stroke="#8a6a3a"/></svg>`;

const RANK_NAMES = ['messere o madonna', 'conte o contessa', 'duca o duchessa', 'granduca o granduchessa', 'principe o principessa'];

/** Carta della Delibera che apre il pannello del sensale ('' se in questa partita non c'è). */
export function sensaleCard(g: Game): string {
  if (!sensaleUseful(g)) return '';
  const who = sensaleNow(g), first = SENSALI[who].name.split(' ')[0];
  const sub = hasSensale(g) ? `${first} al vostro servizio` : `${first}, ${n(sensaleCost(g.player, who))} scudi`;
  return `<h3 class="ext-cards-title">In piazza</h3><div class="action-cards ext-cards"><button class="action-card" data-act="sensaleOpen">
    ${sensaleArt}<span class="card-title">Sensale</span><span class="card-sub">${sub}</span></button></div>`;
}

/** Saluto del sensale di quest'anno. */
function greeting(g: Game): string {
  const p = g.player, who = sensaleNow(g), cost = n(sensaleCost(p, who)), h = honorific(p);
  if (hasSensale(g)) return `Ci rivediamo alle rendite, ${h}. Io ascolto, voi decidete.`;
  return {
    baldo: `Riverisco, ${h}. Sono Baldo, e sento anche quel che si dice sottovoce in fondo all'osteria. Costo caro, ${cost} scudi, ma sbaglio di rado.`,
    cecco: `${h}, il popolo non dice al signore quel che pensa, ma all'oste sì: e io ci bevo insieme ogni sera. Per ${cost} scudi, tutto l'anno.`,
    taddeo: `Ah, ${h}! Taddeo, per servirvi: parlo con tutti, e tutti parlano con me. Qualcosa capisco, qualcosa invento. Per ${cost} scudi soli!`,
  }[who];
}

/** Pannello del sensale, al posto del menu della Delibera. */
export function renderSensale(g: Game, say?: string): string {
  const p = g.player;
  const who = sensaleNow(g), info = SENSALI[who], cost = sensaleCost(p, who), hired = hasSensale(g);
  const rk = rankOf(p) - 1;
  const rows = SENSALE_IDS.map(id => `<tr class="${id === who ? 'cur' : ''}"><td>${SENSALI[id].name}${id === who ? " <b>(quest'anno)</b>" : ''}</td><td>al più ${SENSALI[id].err} punti</td><td>${n(sensaleCost(p, id))} scudi</td></tr>`).join('');
  return `<h2>Il sensale di piazza</h2>${speechBox(SENSALE_SPEAKERS[who], say || greeting(g))}
    <div class="ext-panel"><ul class="ext-ledger">
      <li>Quest'anno alla vostra porta bussa <b>${info.name}</b>. Gira osterie, mulini e banchi del mercato, e sa cosa pensano popolo e mercanti delle vostre gabelle.</li>
      <li>Quando fissate le gabelle vi dice se sono <b>basse</b>, <b>eque</b> o <b>inique</b>: per il popolo (bevere e macina) e per i mercanti (commerzio).<ul><li><b>Iniqua</b>: secondo lui l'anno prossimo saranno scontenti, e rivolte o mercanti in fuga sono probabili.</li><li><b>Equa</b>: secondo lui saranno contenti. Ma se si sbaglia e l'anno gira storto, qualche guaio resta possibile.</li><li><b>Bassa</b>: saranno contenti comunque, qualunque cosa accada; però state lasciando scudi in tasca ai sudditi.</li></ul></li>
      <li>Tiene conto del grano dato e venduto quest'anno. Ma è un uomo, non un oracolo: la sua stima può sbagliare fino a <b>${info.err} punti</b> su cento, e vicino al limite il suo giudizio può essere sbagliato. Chi sbaglia di più dice "bassa" solo con un margine più largo.</li>
      <li>Il suo consiglio vale per un anno solo: popolo e mercanti cambiano umore di anno in anno anche senza una ragione che il signore possa vedere. Lui lo sente in piazza; dal castello non si indovina.</li>
      <li>Ogni anno se ne presenta uno dei tre, a caso; il compenso cresce con il rango (voi siete ${RANK_NAMES[rk]}, ×${SENSALE_RANK[rk]}):</li>
    </ul>
    <table class="ext-table sensali"><thead><tr><th>Sensale</th><th>Errore</th><th>Compenso</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="btns">${hired ? `<p class="good">${info.name} è al vostro servizio per quest'anno: lo troverete accanto al camerlengo, alle rendite.</p>` : `<button data-act="hireSensale" class="primary" ${p.scudi + p.credito < cost ? 'disabled' : ''}>Assoldate ${info.name} (${n(cost)} scudi)</button>`}</div></div>
    <div class="btns"><button data-act="tradeBack" class="primary">Torna alla Delibera</button></div>`;
}

/** Frase del sensale appena assoldato. */
export const hiredLine = (g: Game) => `Affare fatto, ${honorific(g.player)}. Quando fisserete le gabelle sarò lì, e vi dirò se sono basse, eque o inique.`;

/** Giudizi del sensale accanto alle gabelle, alle rendite. */
export const sensaleBadges: RateBadges = (g, r) => {
  const v = sensaleVerdict(g, r);
  if (!v) return null;
  const b = (who: string, x: string) => `<span class="verdict ${x}" title="${SENSALI[sensaleNow(g)].name}, sensale">${who}: <b>${x}</b></span>`;
  return { bevere: b('popolo', v.popolo), macina: b('popolo', v.popolo), commerzio: b('mercanti', v.mercanti) };
};

/** Riga della cronaca. */
export const sensaleSentence = (who: SensaleId, cost: number, _p?: Player) =>
  `Assoldò il sensale ${SENSALI[who].name} per ${n(cost)} scudi, per sapere cosa pensava il popolo delle gabelle.`;
