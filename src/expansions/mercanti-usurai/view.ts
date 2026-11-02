/**
 * Vista dell'espansione "Mercanti e Usurai": il banchiere Ser Iacopo guida il
 * fondaco, il banco dei prestiti e la fiera. Solo presentazione: le regole
 * sono in rules.ts.
 */
import { FEUDI, rankOf } from '../../domain/rank';
import type { Game } from '../../domain/turn';
import type { ActionResult, GameState, Player } from '../../domain/types';
import { dispatchScrolls } from '../../ui/scrolls';
import { pick, speechBox, type Speaker } from '../../ui/speaker';
import type { ExpansionView, ExtActionResult, ExtCard, ExtUi } from '../types';
import {
  buyLot, FAIR_HOST_SHARE, FAIR_MIN_BID, GOODS, isFairYear, LOAN_MAX_RATE, LOAN_MAX_YEARS, LOAN_MIN, loanDue, LOMBARD_LIMIT,
  LOT_CUSTODY, LOT_MAX_PRICE, lotCost, MACINA_CAP_FACTOR, maxLotBuy, ms, owns, placeBid, postLoan, postLot, takeLoan,
  withdrawLoan, withdrawLot, hasSensale, hiredSensale, hireSensale, SENSALE_IDS, SENSALE_RANK, SENSALI, sensaleCost, sensaleOfTurn, sensaleUseful, sensaleVerdict, type SensaleId, type Dispatch, type GoodId, type MercantiState,
} from './rules';

const n = (v: number) => Math.floor(v).toLocaleString('it-IT');
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const who = (p: Player) => `${esc(p.name)} da ${FEUDI[p.feudo]}`;
const h = (p: Player) => (p.gender === 1 ? 'Messere' : 'Madonna');
const list = (xs: string[]) => xs.join(', ').replace(/, ([^,]*)$/, ' e $1');

// ---------------------------------------------------------------- grafica

const iacopoPortrait = `
<svg viewBox="0 0 120 140" class="portrait" role="img" aria-label="Ser Iacopo, il banchiere">
  <rect width="120" height="140" rx="10" fill="#d9c08a"/>
  <path d="M8 140 C12 104 34 92 60 92 C86 92 108 104 112 140 Z" fill="#7a1f2b"/>
  <path d="M30 100 C40 112 80 112 90 100 L94 108 C80 122 40 122 26 108 Z" fill="#8a6a4a"/>
  <ellipse cx="60" cy="64" rx="21" ry="25" fill="#f0c9a0"/>
  <path d="M34 50 C34 26 86 26 86 50 C80 40 40 40 34 50 Z" fill="#7a1f2b"/>
  <path d="M30 50 h60 v6 h-60z" fill="#5c1520"/>
  <circle cx="51" cy="64" r="2.2" fill="#2b2118"/><circle cx="69" cy="64" r="2.2" fill="#2b2118"/>
  <path d="M46 58 q5 -3 10 0 M64 58 q5 -3 10 0" stroke="#6b4a2c" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M60 65 q-3 8 0 10" stroke="#c9976a" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M52 80 q8 5 16 0" stroke="#8b4b3b" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M84 116 c-6 0 -9 6 -9 12 h18 c0 -6 -3 -12 -9 -12z" fill="#c99a2e" stroke="#7a5a1a"/>
  <path d="M80 116 h8" stroke="#7a5a1a" stroke-width="2"/>
  <circle cx="84" cy="124" r="2" fill="#7a5a1a"/>
</svg>`;

export const IACOPO: Speaker = { name: 'Ser Iacopo da Asti', role: 'banchiere lombardo', portrait: iacopoPortrait };

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

const svg = (body: string, label: string, vb = '0 0 64 48') => `<svg viewBox="${vb}" class="card-art" aria-hidden="true" data-label="${label}">${body}</svg>`;

const art = {
  sensale: svg(`<path d="M4 44 h56" stroke="#6b4a2c" stroke-width="2"/>
    <g transform="translate(20 40)"><path d="M-5 0 l-3 4 M5 0 l3 4" stroke="#3e2617" stroke-width="3"/><path d="M-8 -22 h16 l3 22 h-22z" fill="#3f6b3a"/><circle cx="0" cy="-29" r="7" fill="#e8b88a"/><path d="M-8 -30 C-8 -40 8 -40 8 -30z" fill="#3f6b3a"/><path d="M8 -28 c4 -1 5 4 1 5" fill="#e8b88a" stroke="#b9875a"/></g>
    <g transform="translate(44 40)"><path d="M-5 0 l-3 4 M5 0 l3 4" stroke="#3e2617" stroke-width="3"/><path d="M-8 -22 h16 l3 22 h-22z" fill="#8b2a1e"/><circle cx="0" cy="-29" r="7" fill="#f0c9a0"/></g>
    <path d="M30 14 q4 -6 8 0 q-4 6 -8 0" fill="#efe2bf" stroke="#8a6a3a"/><path d="M33 10 v-3 M36 10 v-3" stroke="#8a6a3a"/>`, 'sensale'),
  fondaco: svg(`<rect x="6" y="18" width="52" height="26" fill="#8a5a34"/><path d="M2 20 L32 4 L62 20z" fill="#7a1f2b"/>
    <path d="M14 44 v-12 h10 v12z" fill="#3e2617"/>
    <ellipse cx="40" cy="38" rx="8" ry="6" fill="#d9b56a" stroke="#8a6a3a"/><path d="M36 33 q4 -4 8 0" stroke="#8a6a3a" fill="none"/>
    <ellipse cx="50" cy="40" rx="6" ry="5" fill="#cfa85a" stroke="#8a6a3a"/>`, 'fondaco'),
  banco: svg(`<rect x="6" y="26" width="52" height="16" fill="#6b4a2c"/><rect x="4" y="22" width="56" height="5" fill="#8a5a34"/>
    <rect x="12" y="12" width="18" height="11" fill="#efe2bf" stroke="#8a6a3a"/><path d="M15 16 h12 M15 19 h9" stroke="#8a6a3a"/>
    <g fill="#e3bb4f" stroke="#a8801f"><ellipse cx="44" cy="20" rx="7" ry="2.5"/><ellipse cx="44" cy="17" rx="7" ry="2.5"/><ellipse cx="44" cy="14" rx="7" ry="2.5"/></g>`, 'banco dei prestiti'),
  fiera: svg(`<path d="M8 42 L20 14 L32 42z" fill="#c23b2e"/><path d="M20 14 L26 42 H14z" fill="#e8d8a8"/>
    <path d="M32 42 L44 18 L56 42z" fill="#2e5fa3"/><path d="M44 18 L49 42 H39z" fill="#e8d8a8"/>
    <path d="M20 14 v-8" stroke="#3e2617" stroke-width="1.5"/><path d="M20 6 l8 3 l-8 3z" fill="#e3bb4f"/>
    <path d="M44 18 v-8" stroke="#3e2617" stroke-width="1.5"/><path d="M44 10 l8 3 l-8 3z" fill="#e3bb4f"/>`, 'fiera'),
};

const GOOD_INFO: Record<GoodId, { name: string; effect: string; art: string }> = {
  sementi: {
    name: "Sementi d'Oltremare",
    effect: 'il raccolto del feudo cresce di un quarto, ogni anno',
    art: `<path d="M10 44 h44" stroke="#6b4a2c" stroke-width="3"/>
      <g stroke="#a8801f" stroke-width="2"><path d="M18 44 v-22"/><path d="M32 44 v-28"/><path d="M46 44 v-20"/></g>
      <g fill="#d6b25a"><ellipse cx="18" cy="20" rx="3" ry="6"/><ellipse cx="32" cy="14" rx="3" ry="7"/><ellipse cx="46" cy="18" rx="3" ry="6"/></g>`,
  },
  destrieri: {
    name: 'Destrieri arabi',
    effect: 'nelle pugne contro Longobardi e briganti le perdite si dimezzano',
    art: `<path d="M12 40 C12 26 22 22 34 22 L44 12 L50 14 L48 22 C54 26 54 34 50 40" fill="#6b3a1f"/>
      <path d="M16 40 v6 M24 40 v6 M42 40 v6 M48 40 v6" stroke="#3e2617" stroke-width="3"/>
      <path d="M44 12 C40 14 38 20 36 24" stroke="#2b1a10" stroke-width="3" fill="none"/><circle cx="47" cy="16" r="1.2" fill="#fff"/>`,
  },
  privilegio: {
    name: 'Privilegio dei Lombardi',
    effect: "l'usura sui debiti del feudo si dimezza",
    art: `<rect x="12" y="8" width="40" height="30" fill="#efe2bf" stroke="#8a6a3a"/>
      <path d="M17 15 h30 M17 20 h30 M17 25 h22" stroke="#8a6a3a"/>
      <path d="M38 34 v12 l4 -3 l4 3 v-12" fill="#a82c22"/><circle cx="42" cy="34" r="6" fill="#c23b2e" stroke="#7a1f16"/>`,
  },
  reliquia: {
    name: 'Reliquia di un santo',
    effect: 'peste, alluvioni e sventure del tesoro costano la metà',
    art: `<rect x="16" y="20" width="32" height="22" rx="2" fill="#c99a2e" stroke="#7a5a1a"/>
      <path d="M14 20 L32 8 L50 20z" fill="#e3bb4f" stroke="#7a5a1a"/>
      <path d="M32 24 v14 M26 30 h12" stroke="#7a1f2b" stroke-width="3"/>
      <circle cx="32" cy="8" r="3" fill="#fff4c0"/>`,
  },
};

const goodArt = (g: GoodId, cls = 'good-art') => `<svg viewBox="0 0 64 48" class="${cls}" role="img" aria-label="${GOOD_INFO[g].name}">${GOOD_INFO[g].art}</svg>`;

/** Miniatura della tessera: banco del mercante con bilancia e monete, sotto un arco. */
const miniature = `<svg viewBox="0 0 160 110" class="exp-mini" role="img" aria-label="miniatura: mercanti e usurai">
  <rect width="160" height="110" fill="#e9d7a8"/>
  <path d="M10 110 V40 Q80 -6 150 40 V110" fill="#2e5fa3"/>
  <path d="M18 110 V44 Q80 6 142 44 V110" fill="#f3e6c4"/>
  <rect x="30" y="72" width="100" height="10" fill="#8a5a34"/><rect x="36" y="82" width="88" height="22" fill="#6b4a2c"/>
  <path d="M80 30 v36 M56 40 h48" stroke="#5a4632" stroke-width="2.5"/>
  <path d="M56 40 l-9 16 h18z M104 40 l-9 16 h18z" fill="#c99a2e" stroke="#5a4632"/>
  <g fill="#e3bb4f" stroke="#a8801f"><ellipse cx="44" cy="70" rx="7" ry="2.5"/><ellipse cx="44" cy="67" rx="7" ry="2.5"/><ellipse cx="116" cy="70" rx="7" ry="2.5"/></g>
  <ellipse cx="128" cy="62" rx="9" ry="8" fill="#d9b56a" stroke="#8a6a3a"/>
  <circle cx="80" cy="28" r="4" fill="#a82c22"/>
</svg>`;

// ---------------------------------------------------------------- testi

function dispatchText(d: Dispatch, st: GameState): string {
  const P = (i: number) => who(st.players[i]);
  switch (d.k) {
    case 'lotSold': return `${P(d.buyer)} ha comprato ${n(d.qty)} misure dal vostro banco al fondaco: <b>+${n(d.gain)}</b> scudi.`;
    case 'lotBack': return `Il fondaco vi rende ${n(d.qty)} misure invendute e ne trattiene ${n(d.lost)} per la custodia.`;
    case 'offerTaken': return `${P(d.debtor)} ha accettato il vostro prestito di ${n(d.amount)} scudi: ve ne renderà <b>${n(d.due)}</b> alla fine dell'anno ${900 + d.dueQ}.`;
    case 'offerBack': return `Nessuno ha voluto il vostro prestito: tornano in cassa ${n(d.amount)} scudi.`;
    case 'repaid': return `${P(d.debtor)} ha restituito il prestito: <b>+${n(d.amount)}</b> scudi.`;
    case 'seized': {
      const goods = seizedList(d);
      return `${P(d.debtor)} non ha potuto rendere il prestito. Vi ha versato ${n(d.cash)} scudi${goods ? ` e avete pignorato ${goods}` : ''}.${d.unpaid ? ` ${n(d.unpaid)} scudi sono perduti.` : ''}`;
    }
    case 'paid': return `Avete reso a ${P(d.lender)} <b>${n(d.amount)}</b> scudi, come pattuito. Il debito è estinto.`;
    case 'seizedFrom': {
      const goods = seizedList(d);
      const by = d.lender < 0 ? 'Gli usurai lombardi, creditori di oltre ' + n(LOMBARD_LIMIT) + ' scudi,' : `Non avendo potuto rendere il prestito, ${P(d.lender)}`;
      const cash = d.cash ? ` ha preso ${n(d.cash)} scudi dalle casse` : '';
      return `${by}${cash}${cash && goods ? ' e' : ''}${goods ? ` vi ${d.lender < 0 ? 'hanno' : 'ha'} pignorato ${goods}` : ''}.${d.unpaid ? ` Restano insoluti ${n(d.unpaid)} scudi, che il creditore ha perduto.` : ''}`;
    }
    case 'fairWon': return `Alla fiera vi siete aggiudicati <b>${GOOD_INFO[d.good].name}</b> per ${n(d.bid)} scudi: ${GOOD_INFO[d.good].effect}.`;
    case 'fairLost': return `Alla fiera ${GOOD_INFO[d.good].name} è andato a ${P(d.winner)}, che ha offerto ${n(d.bid)} scudi.`;
    case 'fairFee': return `La fiera nel vostro feudo vi ha fruttato <b>${n(d.amount)}</b> scudi di diritti.`;
  }
}

/** Mittente e titolo di ogni dispaccio, in testa alla pergamena. */
function dispatchHead(d: Dispatch): { from: string; title: string } {
  switch (d.k) {
    case 'lotSold': return { from: 'dal fondaco', title: 'Grano venduto' };
    case 'lotBack': return { from: 'dal fondaco', title: 'Grano invenduto' };
    case 'offerTaken': return { from: 'dal banco', title: 'Prestito accettato' };
    case 'offerBack': return { from: 'dal banco', title: 'Prestito non richiesto' };
    case 'repaid': return { from: 'dal banco', title: 'Prestito restituito' };
    case 'seized': return { from: 'dal banco', title: 'Pignoramento a vostro favore' };
    case 'paid': return { from: 'dal banco', title: 'Debito saldato' };
    case 'seizedFrom': return { from: d.lender < 0 ? 'dai Lombardi' : 'dal banco', title: 'Beni pignorati' };
    case 'fairWon': return { from: 'dalla fiera', title: 'Asta vinta' };
    case 'fairLost': return { from: 'dalla fiera', title: 'Asta perduta' };
    case 'fairFee': return { from: 'dalla fiera', title: 'Diritti della fiera' };
  }
}

function seizedList(s: { acri: number; mercati: number; opifici: number; palazzo: number }): string {
  const parts: string[] = [];
  if (s.acri) parts.push(`${n(s.acri)} acri`);
  if (s.mercati) parts.push(`${s.mercati} ${s.mercati === 1 ? 'mercato' : 'mercati'}`);
  if (s.opifici) parts.push(`${s.opifici} ${s.opifici === 1 ? 'opificio' : 'opifici'}`);
  if (s.palazzo) parts.push(`${s.palazzo} ${s.palazzo === 1 ? 'piano' : 'piani'} di palazzo`);
  return list(parts);
}

function reaction(r: ActionResult, ok: string, p: Player): string {
  if (!r.ok) return `${pick(['Ahimè', 'Non si può', 'Piano'])}, ${h(p)}: ${r.reason}.`;
  return ok;
}

// ---------------------------------------------------------------- pannelli

function fondaco(g: Game, st: MercantiState): string {
  const me = g.state.current, p = g.player, sc = g.state.scalars;
  const others = st.lots.filter(l => l.seller !== me).sort((a, b) => a.price - b.price);
  const rows = others.map(l => {
    const max = maxLotBuy(p, l);
    const cmp = l.price < sc.prezzo ? '<span class="good">meno caro del vostro raccolto</span>' : l.price > sc.prezzo ? '<span class="warn">più caro del vostro raccolto</span>' : 'come il vostro raccolto';
    return `<tr>
      <th scope="row" data-label="Banco">${who(g.state.players[l.seller])}</th>
      <td data-label="Misure">${n(l.qty)}</td>
      <td data-label="Prezzo">${l.price} ogni mille<br><small>${cmp}</small></td>
      <td data-label="Comprare"><input type="number" name="lot-${l.id}" min="0" max="${max}" value="${max}" inputmode="numeric" aria-label="misure da comprare">
        <button data-act="ext" data-op="buyLot" data-id="${l.id}" ${max === 0 ? 'disabled' : ''}>Compra</button></td>
    </tr>`;
  }).join('');
  const table = others.length
    ? `<table class="ext-table"><thead><tr><th>Banco</th><th>Misure</th><th>Prezzo</th><th>Comprare</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p class="hint">Nessun altro signore vende grano al fondaco, per ora.</p>';
  const mine = st.lots.find(l => l.seller === me);
  const sell = mine
    ? `<p>Al vostro banco: <b>${n(mine.qty)}</b> misure a <b>${mine.price}</b> scudi ogni mille.</p>
       <div class="btns"><button data-act="ext" data-op="withdrawLot">Ritira il grano</button></div>`
    : `<div class="ext-form">
        <label>Misure <input type="number" name="lot-qty" min="1" max="${p.grano}" value="${Math.max(0, Math.min(p.grano, p.grano - sc.domanda))}" inputmode="numeric"></label>
        <label>Prezzo ogni mille <input type="number" name="lot-price" min="1" max="${LOT_MAX_PRICE}" value="${Math.min(LOT_MAX_PRICE, sc.prezzo + 10)}" inputmode="numeric"></label>
        <button data-act="ext" data-op="postLot" ${p.grano === 0 ? 'disabled' : ''}>Porta al fondaco</button>
      </div>
      <p class="hint">Il grano resta in vendita fino al vostro prossimo turno; l'invenduto torna nei granai, meno ${Math.round(LOT_CUSTODY * 100)}% per la custodia. Granaio: ${n(p.grano)} misure, domanda del popolo ${n(sc.domanda)}.</p>`;
  return `<h3>Grano in vendita</h3>${table}<h3>Il vostro banco</h3>${sell}`;
}

function banco(g: Game, st: MercantiState): string {
  const me = g.state.current, p = g.player, sc = g.state.scalars;
  const P = (i: number) => who(g.state.players[i]);
  const offers = st.offers.filter(o => o.lender !== me);
  const rows = offers.map(o => `<tr>
      <th scope="row" data-label="Prestatore">${P(o.lender)}</th>
      <td data-label="Somma">${n(o.amount)}</td>
      <td data-label="Interesse">${o.rate}% in ${o.years} ${o.years === 1 ? 'anno' : 'anni'}</td>
      <td data-label="Da rendere">${n(loanDue(o.amount, o.rate))} a fine ${g.year + o.years - 1}</td>
      <td data-label=""><button data-act="ext" data-op="takeLoan" data-id="${o.id}">Accetta</button></td>
    </tr>`).join('');
  const table = offers.length
    ? `<table class="ext-table"><thead><tr><th>Prestatore</th><th>Somma</th><th>Interesse</th><th>Da rendere</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p class="hint">Nessun signore offre denaro, per ora.</p>';
  const mine = st.offers.find(o => o.lender === me);
  const lend = mine
    ? `<p>Offrite <b>${n(mine.amount)}</b> scudi al ${mine.rate}% per ${mine.years} ${mine.years === 1 ? 'anno' : 'anni'}.</p>
       <div class="btns"><button data-act="ext" data-op="withdrawLoan">Ritira l'offerta</button></div>`
    : `<div class="ext-form">
        <label>Somma <input type="number" name="loan-amount" min="${LOAN_MIN}" step="100" value="${Math.max(LOAN_MIN, Math.min(2000, Math.floor(p.scudi / 2 / 100) * 100))}" inputmode="numeric"></label>
        <label>Interesse % <input type="number" name="loan-rate" min="0" max="${LOAN_MAX_RATE}" value="20" inputmode="numeric"></label>
        <label>Anni <input type="number" name="loan-years" min="1" max="${LOAN_MAX_YEARS}" value="1" inputmode="numeric"></label>
        <button data-act="ext" data-op="postLoan" ${p.scudi < LOAN_MIN ? 'disabled' : ''}>Offri al banco</button>
      </div>
      <p class="hint">La somma esce subito dalle casse; se nessuno la prende, torna al vostro prossimo turno. Il banco è aperto anche durante i dispendimenti, quando le rendite sono in cassa.</p>`;
  const debts = st.loans.filter(l => l.debtor === me).map(l => `<li>Dovete <b>${n(l.due)}</b> scudi a ${P(l.lender)} a fine ${900 + l.dueQ}.</li>`);
  const credits = st.loans.filter(l => l.lender === me).map(l => `<li>${P(l.debtor)} vi deve ${n(l.due)} scudi a fine ${900 + l.dueQ}.</li>`);
  const ledger = debts.length || credits.length ? `<h3>Il libro dei conti</h3><ul class="ext-ledger">${debts.join('')}${credits.join('')}</ul>` : '';
  return `<h3>Prestiti offerti</h3>${table}${ledger}<h3>Prestare</h3>${lend}
    <p class="hint">Gli usurai lombardi chiedono quest'anno il ${sc.usura}% sui debiti; oltre ${n(LOMBARD_LIMIT)} scudi di debito pignorano i beni a fine anno.</p>`;
}

function fiera(g: Game, st: MercantiState): string {
  const me = g.state.current, p = g.player;
  const fair = st.fair;
  const treasures = g.state.players
    .map((x, i) => (st.goods[i].length ? `<li>${who(x)}: ${st.goods[i].map(k => GOOD_INFO[k].name).join(', ')}</li>` : ''))
    .join('');
  const kept = treasures ? `<h3>I tesori del regno</h3><ul class="ext-ledger">${treasures}</ul>` : '';
  if (!fair) {
    const next = Array.from({ length: 3 }, (_, k) => g.state.q + k + 1).find(isFairYear)!;
    return `<p>Quest'anno non c'è fiera. La prossima si terrà nell'anno ${900 + next}.</p>${kept}`;
  }
  const info = GOOD_INFO[fair.good];
  const bid = st.bids[me];
  const form = owns(st, me, fair.good)
    ? '<p>Possedete già questo bene.</p>'
    : `<div class="ext-form">
        <label>Offerta segreta <input type="number" name="bid" min="0" step="50" value="${bid || FAIR_MIN_BID}" inputmode="numeric"></label>
        <button data-act="ext" data-op="bid">${bid ? 'Cambia offerta' : "Fai l'offerta"}</button>
        ${bid ? '<button data-act="ext" data-op="unbid" class="ghost">Ritira</button>' : ''}
      </div>
      <p class="hint">${bid ? `La vostra offerta: <b>${n(bid)}</b> scudi. ` : ''}Le offerte restano segrete fino alla fine dell'anno; si paga solo se si vince. Offerta minima ${FAIR_MIN_BID} scudi. ${fair.host === me ? `La fiera si tiene nel vostro feudo: se vince un altro signore, incassate il ${Math.round(FAIR_HOST_SHARE * 100)}% del prezzo.` : `${who(g.state.players[fair.host])} ospita la fiera e incassa il ${Math.round(FAIR_HOST_SHARE * 100)}% del prezzo.`} Tesoro: ${n(p.scudi)} scudi.</p>`;
  return `<div class="fair-good">${goodArt(fair.good)}<div><h3>${info.name}</h3><p>Chi lo possiede: ${info.effect}.</p></div></div>${form}${kept}`;
}

const RANK_NAMES = ['messere o madonna', 'conte o contessa', 'duca o duchessa', 'granduca o granduchessa', 'principe o principessa'];

/** Il sensale di quest'anno: quello assoldato o quello che si presenta. */
const sensaleNow = (g: Game): SensaleId => hiredSensale(g) ?? sensaleOfTurn(g);

function sensale(g: Game): string {
  const p = g.player;
  if (!sensaleUseful(p)) return '<p>In questa partita umore e fiducia non contano: il sensale non ha nulla da dirvi.</p>';
  const who = sensaleNow(g), info = SENSALI[who], cost = sensaleCost(p, who), hired = hasSensale(g);
  const rk = rankOf(p) - 1;
  const others = SENSALE_IDS.map(id => `<tr class="${id === who ? 'cur' : ''}"><td>${SENSALI[id].name}${id === who ? " <b>(quest'anno)</b>" : ''}</td><td>al più ${SENSALI[id].err} punti</td><td>${n(sensaleCost(p, id))} scudi</td></tr>`).join('');
  return `<ul class="ext-ledger">
      <li>Quest'anno alla vostra porta bussa <b>${info.name}</b>. Gira osterie, mulini e banchi del mercato, e sa cosa pensano popolo e mercanti delle vostre gabelle.</li>
      <li>Quando fissate le gabelle vi dice se sono <b>basse</b>, <b>eque</b> o <b>inique</b>: per il popolo (bevere e macina) e per i mercanti (commerzio).<ul><li><b>Iniqua</b>: secondo lui l'anno prossimo saranno scontenti, e rivolte o mercanti in fuga sono probabili.</li><li><b>Equa</b>: secondo lui saranno contenti. Ma se si sbaglia e l'anno gira storto, qualche guaio resta possibile.</li><li><b>Bassa</b>: saranno contenti comunque, qualunque cosa accada; però state lasciando scudi in tasca ai sudditi.</li></ul></li>
      <li>Tiene conto del grano dato e venduto quest'anno. Ma è un uomo, non un oracolo: la sua stima può sbagliare fino a <b>${info.err} punti</b> su cento, e vicino al limite il suo giudizio può essere sbagliato. Chi sbaglia di più dice "bassa" solo con un margine più largo.</li>
      <li>Il suo consiglio vale per un anno solo: popolo e mercanti cambiano umore di anno in anno anche senza una ragione che il signore possa vedere. Lui lo sente in piazza; dal castello non si indovina.</li>
      <li>Ogni anno se ne presenta uno dei tre, a caso; il compenso cresce con il rango (voi siete ${RANK_NAMES[rk]}, ×${SENSALE_RANK[rk]}):</li>
    </ul>
    <table class="ext-table sensali"><thead><tr><th>Sensale</th><th>Errore</th><th>Compenso</th></tr></thead><tbody>${others}</tbody></table>
    <div class="btns">${hired ? `<p class="good">${info.name} è al vostro servizio per quest'anno: lo troverete accanto al camerlengo, alle rendite.</p>` : `<button data-act="ext" data-op="hireSensale" class="primary" ${p.scudi + p.credito < cost ? 'disabled' : ''}>Assoldate ${info.name} (${n(cost)} scudi)</button>`}</div>`;
}

const PANELS: Record<string, { title: string; render: (g: Game, st: MercantiState) => string; speaker?: (g: Game) => Speaker }> = {
  sensale: { title: 'Il sensale di piazza', render: g => sensale(g), speaker: g => SENSALE_SPEAKERS[sensaleNow(g)] },
  fondaco: { title: 'Il fondaco del grano', render: fondaco },
  banco: { title: 'Il banco dei prestiti', render: banco },
  fiera: { title: 'La fiera', render: fiera },
};

// ---------------------------------------------------------------- vista

export const view: ExpansionView = {
  title: 'Mercanti e Usurai',
  motto: 'Il grano si contende, il denaro si presta, i beni rari si comprano alla fiera.',
  miniature,
  summary: [
    'Fondaco: vendete il vostro grano agli altri signori al prezzo che volete, o comprate il loro.',
    'Banco: prestate denaro agli altri signori o prendetelo in prestito; chi non rende subisce il pignoramento.',
    'Fiera: ogni tre anni un bene raro va all\'asta con offerte segrete.',
    `Contrabbando: la gabella della macina rende per intero solo fino al ${MACINA_CAP_FACTOR === 2 ? 'doppio' : `${MACINA_CAP_FACTOR} volte`} della domanda; oltre, un quarto.`,
    `Sensale: per un compenso annuo che cresce con il rango, ogni anno si presenta uno di tre esperti di piazza (Baldo, Cecco o Taddeo) che vi dice se le gabelle sono basse, eque o inique per popolo e mercanti. Il più caro sbaglia di meno.`,
    `Lombardi: chi deve agli usurai più di ${n(LOMBARD_LIMIT)} scudi subisce il pignoramento.`,
  ],

  cards(g): ExtCard[] {
    const st = ms(g), me = g.state.current;
    const lots = st.lots.filter(l => l.seller !== me).length;
    const offers = st.offers.filter(o => o.lender !== me).length;
    const bank: ExtCard = { panel: 'banco', title: 'Banco', sub: offers ? `${offers} ${offers === 1 ? 'prestito offerto' : 'prestiti offerti'}` : 'prestare e farsi prestare', art: art.banco };
    // nei dispendimenti, con le rendite in cassa, resta aperto solo il banco
    if (g.state.phase.kind === 'investimenti') return [bank];
    const cards: ExtCard[] = [
      { panel: 'fondaco', title: 'Fondaco', sub: lots ? `${lots} ${lots === 1 ? 'banco aperto' : 'banchi aperti'}` : 'vendete il vostro grano', art: art.fondaco },
      bank,
    ];
    if (sensaleUseful(g.player)) cards.push({ panel: 'sensale', title: 'Sensale', sub: hasSensale(g) ? `${SENSALI[sensaleNow(g)].name.split(' ')[0]} al vostro servizio` : `${SENSALI[sensaleNow(g)].name.split(' ')[0]}, ${n(sensaleCost(g.player, sensaleNow(g)))} scudi`, art: art.sensale });
    if (st.fair) cards.push({ panel: 'fiera', title: 'Fiera', sub: `${GOOD_INFO[st.fair.good].name} a ${FEUDI[g.state.players[st.fair.host].feudo]}`, art: art.fiera });
    return cards;
  },

  dispatches(g, animate) {
    const st = ms(g);
    return dispatchScrolls(st.inbox.map(d => ({ ...dispatchHead(d), body: dispatchText(d, g.state) })), animate, 'Ser Iacopo da Asti, banchiere');
  },

  rateBadges(g, r) {
    const v = sensaleVerdict(g, r);
    if (!v) return null;
    const b = (who: string, x: string) => `<span class="verdict ${x}" title="${SENSALI[sensaleNow(g)].name}, sensale">${who}: <b>${x}</b></span>`;
    return { bevere: b('popolo', v.popolo), macina: b('popolo', v.popolo), commerzio: b('mercanti', v.mercanti) };
  },

  tradeHint(g, mode) {
    if (mode !== 'feed') return '';
    const cap = MACINA_CAP_FACTOR * g.state.scalars.domanda;
    return `Contrabbando: la gabella della macina conta per intero fino a ${n(cap)} misure distribuite; oltre, solo un quarto.`;
  },

  open(g, panel) {
    const p = g.player, st = ms(g), me = g.state.current;
    if (panel === 'sensale') {
      const who = sensaleNow(g), cost = n(sensaleCost(p, who));
      if (hasSensale(g)) return `Ci rivediamo alle rendite, ${h(p)}. Io ascolto, voi decidete.`;
      return {
        baldo: `Riverisco, ${h(p)}. Sono Baldo, e sento anche quel che si dice sottovoce in fondo all'osteria. Costo caro, ${cost} scudi, ma sbaglio di rado.`,
        cecco: `${h(p)}, il popolo non dice al signore quel che pensa, ma all'oste sì: e io ci bevo insieme ogni sera. Per ${cost} scudi, tutto l'anno.`,
        taddeo: `Ah, ${h(p)}! Taddeo, per servirvi: parlo con tutti, e tutti parlano con me. Qualcosa capisco, qualcosa invento. Per ${cost} scudi soli!`,
      }[who];
    }
    if (panel === 'fondaco') {
      const cheaper = st.lots.filter(l => l.seller !== me && l.price < g.state.scalars.prezzo);
      return cheaper.length
        ? `${h(p)}, al fondaco c'è grano più a buon mercato del vostro raccolto: ${cheaper.length === 1 ? 'un banco' : `${cheaper.length} banchi`} sotto i ${g.state.scalars.prezzo} scudi.`
        : pick([`Benvenuti al fondaco, ${h(p)}. Qui il grano si vende e si compra fra signori, al prezzo che si stabilisce.`, `Il fondaco è aperto, ${h(p)}. Chi ha granai pieni vende, chi ha fame compra.`]);
    }
    if (panel === 'banco') {
      return p.scudi < 0
        ? `${h(p)}, i vostri conti sono in rosso: gli usurai chiedono il ${g.state.scalars.usura}%. Un prestito fra signori può costare meno.`
        : pick([`Il denaro fermo non frutta, ${h(p)}. Prestatelo, ma badate a chi.`, `Al banco si presta e si prende, ${h(p)}. Il pignoramento protegge il creditore.`]);
    }
    const fair = st.fair;
    return fair ? `${h(p)}, alla fiera di ${FEUDI[g.state.players[fair.host].feudo]} si mette all'asta ${GOOD_INFO[fair.good].name}. Le offerte sono segrete.` : 'Quest\'anno nessuna fiera.';
  },

  panel(g, ui: ExtUi) {
    const panel = PANELS[ui.panel ?? ''];
    if (!panel) return '';
    return `<h2>${panel.title}</h2>${speechBox(panel.speaker?.(g) ?? IACOPO, ui.say)}<div class="ext-panel">${panel.render(g, ms(g))}</div>
      <div class="btns"><button data-act="extClose" class="primary">${g.state.phase.kind === 'investimenti' ? 'Torna ai dispendimenti' : 'Torna alla delibera'}</button></div>`;
  },

  cost(g, op, data, field) {
    const st = ms(g);
    switch (op) {
      case 'hireSensale': return hasSensale(g) ? 0 : sensaleCost(g.player, sensaleOfTurn(g));
      case 'buyLot': {
        const id = Number(data.id), lot = st.lots.find(l => l.id === id);
        return lot ? Math.ceil(lotCost(field(`lot-${id}`) || 0, lot.price)) : 0;
      }
      // l'offerta alla fiera si paga solo se vince, ma allora si paga tutta
      case 'bid': return field('bid') || 0;
    }
    return 0;
  },

  act(g, op, data, field): ExtActionResult {
    const p = g.player, st = ms(g);
    switch (op) {
      case 'hireSensale':
        return { say: reaction(hireSensale(g), `Affare fatto, ${h(p)}. Quando fisserete le gabelle sarò lì, e vi dirò se sono basse, eque o inique.`, p) };
      case 'postLot': {
        const qty = field('lot-qty'), price = field('lot-price');
        return { say: reaction(postLot(g, qty, price), `Bene, ${h(p)}: ${n(qty)} misure al fondaco, a ${price} scudi ogni mille. Ve ne darò notizia.`, p) };
      }
      case 'withdrawLot':
        return { say: reaction(withdrawLot(g), 'Il grano è tornato nei vostri granai.', p) };
      case 'buyLot': {
        const id = Number(data.id), qty = field(`lot-${id}`);
        const lot = st.lots.find(l => l.id === id);
        const cost = lot ? lotCost(qty, lot.price) : 0;
        return { say: reaction(buyLot(g, id, qty), `Affare fatto: ${n(qty)} misure per ${n(Math.ceil(cost))} scudi.`, p) };
      }
      case 'postLoan': {
        const amount = field('loan-amount'), rate = field('loan-rate'), years = field('loan-years');
        return { say: reaction(postLoan(g, amount, rate, years), `Registrato: ${n(amount)} scudi al ${rate}% per ${years} ${years === 1 ? 'anno' : 'anni'}. Se qualcuno li prende, lo saprete.`, p) };
      }
      case 'withdrawLoan':
        return { say: reaction(withdrawLoan(g), 'Il denaro è tornato nelle vostre casse.', p) };
      case 'takeLoan': {
        const o = st.offers.find(x => x.id === Number(data.id));
        const text = o ? `Firmato. Avete ${n(o.amount)} scudi in più, e ne dovrete ${n(loanDue(o.amount, o.rate))} a fine ${g.year + o.years - 1}. Se non pagherete, il creditore pignorerà.` : '';
        return { say: reaction(takeLoan(g, Number(data.id)), text, p) };
      }
      case 'bid': {
        const amount = field('bid');
        return { say: reaction(placeBid(g, amount), `La vostra offerta di ${n(amount)} scudi è sigillata. Si saprà a fine anno.`, p) };
      }
      case 'unbid':
        return { say: reaction(placeBid(g, 0), 'Offerta ritirata.', p) };
    }
    return { say: '' };
  },

  chronicle(f, players) {
    const d = f.data, P = (i: number) => who(players[i]);
    switch (f.kind) {
      case 'sensale': return `Assoldò ${d.who !== undefined ? `il sensale ${SENSALI[SENSALE_IDS[d.who]].name}` : 'un sensale di piazza'} per ${n(d.cost)} scudi, per sapere cosa pensava il popolo delle gabelle.`;
      case 'lotPost': return `Portò al fondaco ${n(d.qty)} misure di grano, a ${d.price} scudi il migliaio.`;
      case 'lotBuy': return `Comprò al fondaco ${n(d.qty)} misure dal banco di ${P(d.seller)}, a ${d.price} scudi il migliaio.`;
      case 'loanOffer': return `Offrì al banco un prestito di ${n(d.amount)} scudi al ${d.rate}%.`;
      case 'loanTake': return `Prese in prestito ${n(d.amount)} scudi da ${P(d.lender)}, con l'impegno di renderne ${n(d.due)}.`;
      case 'loanRepay': return `Restituì a ${P(d.lender)} ${n(d.amount)} scudi, come pattuito.`;
      case 'seize': {
        const goods = seizedList({ acri: d.acri, mercati: d.mercati, opifici: d.opifici, palazzo: d.palazzo });
        return `Non potendo rendere il prestito a ${P(d.lender)}, ${goods ? `si vide pignorare ${goods}` : 'gli versò quanto aveva'}.`;
      }
      case 'lombards': {
        const goods = seizedList({ acri: d.acri, mercati: d.mercati, opifici: d.opifici, palazzo: d.palazzo });
        return `Gli usurai lombardi, stanchi di attendere, gli pignorarono ${goods}.`;
      }
      case 'fairWon': return `Alla fiera di ${FEUDI[players[d.host].feudo]} si aggiudicò ${GOOD_INFO[GOODS[d.good]].name} per ${n(d.bid)} scudi.`;
    }
    return null;
  },

  news(state, year) {
    const st = state.ext as MercantiState | undefined;
    const fair = st?.fairs.find(f => 900 + f.q === year);
    const out: string[] = [];
    if (fair) {
      const place = FEUDI[state.players[fair.host].feudo];
      out.push(fair.winner === null
        ? `Alla fiera di ${place} nessuno volle ${GOOD_INFO[fair.good].name}.`
        : `Alla fiera di ${place} ${GOOD_INFO[fair.good].name} andò a ${who(state.players[fair.winner])} per ${n(fair.bid)} scudi.`);
    }
    const trades = (state.chronicle ?? []).filter(e => e.year === year && e.fact.t === 'ext' && e.fact.kind === 'lotBuy');
    const qty = trades.reduce((a, e) => a + (e.fact.t === 'ext' ? e.fact.data.qty : 0), 0);
    if (qty) out.push(`Al fondaco passarono di mano ${n(qty)} misure di grano.`);
    return out;
  },
};
