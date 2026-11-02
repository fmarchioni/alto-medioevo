/**
 * Vista dell'espansione "Le vie dei mercanti": il banchiere Ser Iacopo guida
 * magazzino, fondaco, vigne, fiera e banco dei prestiti. Solo presentazione: le
 * regole sono in rules.ts, merci.ts, fiera.ts e geografia.ts.
 */
import { FEUDI } from '../../domain/rank';
import type { Game } from '../../domain/turn';
import type { ActionResult, GameState, Player } from '../../domain/types';
import { dispatchScrolls } from '../../ui/scrolls';
import { pick, speechBox, type Speaker } from '../../ui/speaker';
import type { ExpansionView, ExtActionResult, ExtCard, ExtUi } from '../types';
import {
  banquet, bid, buyLot, cantinaOf, feast, fulfilRequest, joinFair, playBankrupt, playConsole, playSmuggle, playWater, prestigeOf, shipContract, LOAN_MAX_RATE, LOAN_MAX_YEARS, LOAN_MIN, loanDue, ms, plant, postLoan, postLot, sellPassing, takeLoan, withdrawLoan, withdrawLot, type Dispatch, type MercantiState,
} from './rules';
import {
  ACRI_GRANO_MIN, caravansFrom, caravansTo, LOT_MAX_PRICE, MANUFATTI_PER_OPIFICIO, maxVigneti, MERCI, passingPrices, UNITA, VIGNETO_ACRI, VIGNETO_COST, VINO_GUASTO, VINO_PER_VIGNETO, type Merce,
} from './merci';
import { specialitaText, SPECIALITA, travelYears, ZONA_FEUDO, ZONA_NOME } from './geografia';
import { VIAGGIO, type EventoViaggio } from './carovane';
import { MERCATI_MAX, MERCATI_PER_PUNTO, PRESTIGIO, prestigeName } from './prestigio';
import { fairOpen, impegniOf, QUOTE, type FieraDispatch } from './fiera';
import { consumiChronicle, festaTitoloText, festeCardSub, festePanel, palaceLine, requestNote } from './consumi-view';
import { BANCHETTI, RICHIESTE, type Banchetto, type RichiestaId } from './consumi';
import { impresaCardNote, impresaChronicle, impresaDispatchHead, impresaDispatchText, impreseAside, smuggleArrestText } from './imprese-view';
import type { ImpresaDispatch } from './imprese';
import { contractLine, fairCardSub, fairChronicle, fairDispatchHead, fairDispatchText, fairNews, fieraPanel } from './fiera-view';

const n = (v: number) => Math.floor(v).toLocaleString('it-IT');
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const who = (p: Player) => `${esc(p.name)} da ${FEUDI[p.feudo]}`;
const h = (p: Player) => (p.gender === 1 ? 'Messere' : 'Madonna');
const list = (xs: string[]) => xs.join(', ').replace(/, ([^,]*)$/, ' e $1');
const NOME: Record<Merce, string> = { vino: 'vino', manufatti: 'manufatti' };
/** "12 botti di vino", "1 pezzo di manufatti" */
const qtyOf = (good: Merce, k: number) => `${n(k)} ${UNITA[good][k === 1 ? 0 : 1]} di ${NOME[good]}`;
const yearOf = (q: number) => 900 + q;
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 10) / 10).toLocaleString('it-IT')}`;

/** Cosa è successo per strada (frase per i dispacci). */
function journeyWords(evento: EventoViaggio | undefined, perse: number, good: Merce): string {
  switch (evento) {
    case 'briganti': return ` Per strada i briganti hanno assalito la carovana e portato via ${qtyOf(good, perse)}.`;
    case 'rotture': return ` Per strada ${good === 'vino' ? 'si sono sfasciate alcune botti' : 'si sono sfondate alcune casse'}: perduti ${qtyOf(good, perse)}.`;
    case 'temporali': return ' I temporali hanno allagato le strade: la carovana è arrivata con un anno di ritardo.';
    case 'ponte': return ' Un ponte crollato ha costretto la carovana a un lungo giro: un anno di ritardo.';
    case 'rapido': return ' Strade asciutte e guadi bassi: la carovana è arrivata con un anno di anticipo.';
    default: return '';
  }
}

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

const svg = (body: string, label: string, vb = '0 0 64 48') => `<svg viewBox="${vb}" class="card-art" aria-hidden="true" data-label="${label}">${body}</svg>`;

const bancoArt = svg(`<rect x="6" y="26" width="52" height="16" fill="#6b4a2c"/><rect x="4" y="22" width="56" height="5" fill="#8a5a34"/>
    <rect x="12" y="12" width="18" height="11" fill="#efe2bf" stroke="#8a6a3a"/><path d="M15 16 h12 M15 19 h9" stroke="#8a6a3a"/>
    <g fill="#e3bb4f" stroke="#a8801f"><ellipse cx="44" cy="20" rx="7" ry="2.5"/><ellipse cx="44" cy="17" rx="7" ry="2.5"/><ellipse cx="44" cy="14" rx="7" ry="2.5"/></g>`, 'banco dei prestiti');

const cantinaArt = svg(`<path d="M4 44 h56" stroke="#6b4a2c" stroke-width="2"/>
    <ellipse cx="20" cy="32" rx="12" ry="11" fill="#8a5a34" stroke="#4a3424"/><path d="M10 26 h20 M10 38 h20" stroke="#4a3424" stroke-width="2"/><circle cx="20" cy="32" r="2.5" fill="#4a3424"/>
    <rect x="36" y="24" width="20" height="20" fill="#c9a86a" stroke="#6b4a2c"/><path d="M36 30 h20 M46 24 v20" stroke="#6b4a2c"/>`, 'magazzino');
const fondacoArt = svg(`<rect x="6" y="18" width="52" height="26" fill="#8a5a34"/><path d="M2 20 L32 4 L62 20z" fill="#7a1f2b"/>
    <path d="M14 44 v-12 h10 v12z" fill="#3e2617"/>
    <ellipse cx="42" cy="37" rx="7" ry="6" fill="#7a2a3a" stroke="#4a1a24"/><rect x="48" y="32" width="9" height="10" fill="#c9a86a" stroke="#6b4a2c"/>`, 'fondaco');
const fieraArt = svg(`<path d="M2 44 h60" stroke="#6b4a2c" stroke-width="2"/>
    <path d="M6 44 V22 L18 12 L30 22 V44z" fill="#e9d7a8" stroke="#6b4a2c"/><path d="M6 22 L18 12 L30 22" fill="none" stroke="#a82c22" stroke-width="3"/>
    <path d="M34 44 V24 L46 14 L58 24 V44z" fill="#f3e6c4" stroke="#6b4a2c"/><path d="M34 24 L46 14 L58 24" fill="none" stroke="#2e5fa3" stroke-width="3"/>
    <path d="M18 12 v-8 l6 2 l-6 2 M46 14 v-8 l6 2 l-6 2" stroke="#4a3424" fill="#c99a2e"/>
    <ellipse cx="18" cy="38" rx="6" ry="5" fill="#8a5a34" stroke="#4a3424"/><rect x="40" y="33" width="11" height="10" fill="#c9a86a" stroke="#6b4a2c"/>`, 'fiera dei mercanti');
const festeArt = svg(`<path d="M2 44 h60" stroke="#6b4a2c" stroke-width="2"/>
    <rect x="6" y="28" width="52" height="5" fill="#8a5a34"/><path d="M10 33 v11 M54 33 v11" stroke="#6b4a2c" stroke-width="2"/>
    <path d="M14 28 v-8 h6 v8z M44 28 v-8 h6 v8z" fill="#c9a86a" stroke="#6b4a2c"/><path d="M14 22 h6 M44 22 h6" stroke="#7a2a3a" stroke-width="2"/>
    <ellipse cx="32" cy="25" rx="9" ry="4" fill="#d9b56a" stroke="#8a6a3a"/><circle cx="29" cy="21" r="2.5" fill="#5b2a5e"/><circle cx="34" cy="21" r="2.5" fill="#a82c22"/>
    <path d="M26 12 l6 -8 l6 8" fill="none" stroke="#c99a2e" stroke-width="2"/>`, 'feste e banchetti');
const vigneArt = svg(`<path d="M2 44 h60" stroke="#6b4a2c" stroke-width="2"/>
    <g stroke="#6b4a2c" stroke-width="2"><path d="M12 44 v-26 M32 44 v-26 M52 44 v-26"/><path d="M8 20 h48"/></g>
    <g fill="#5b2a5e"><circle cx="18" cy="26" r="3"/><circle cx="22" cy="28" r="3"/><circle cx="20" cy="31" r="3"/><circle cx="38" cy="25" r="3"/><circle cx="42" cy="27" r="3"/><circle cx="40" cy="30" r="3"/></g>
    <path d="M14 20 q4 -6 8 0 M34 20 q4 -6 8 0 M50 20 q4 -6 8 0" fill="#4f7a3a"/>`, 'vigne');

/** Miniatura della tessera: banco del mercante con bilancia e monete, sotto un arco. */
const miniature = `<svg viewBox="0 0 160 110" class="exp-mini" role="img" aria-label="miniatura: le vie dei mercanti">
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

function seizedList(s: { acri: number; mercati: number; opifici: number; palazzo: number }): string {
  const parts: string[] = [];
  if (s.acri) parts.push(`${n(s.acri)} acri`);
  if (s.mercati) parts.push(`${s.mercati} ${s.mercati === 1 ? 'mercato' : 'mercati'}`);
  if (s.opifici) parts.push(`${s.opifici} ${s.opifici === 1 ? 'opificio' : 'opifici'}`);
  if (s.palazzo) parts.push(`${s.palazzo} ${s.palazzo === 1 ? 'piano' : 'piani'} di palazzo`);
  return list(parts);
}

const isFair = (d: Dispatch): d is FieraDispatch => d.k.startsWith('fiera') || d.k === 'vinoScoperto' || d.k.startsWith('console');
const isImpresa = (d: Dispatch): d is ImpresaDispatch => d.k.startsWith('contrabbando') || d.k === 'fallitoArrivo';

function dispatchText(d: Dispatch, st: GameState): string {
  const P = (i: number) => who(st.players[i]);
  if (isFair(d)) return fairDispatchText(d, st);
  if (isImpresa(d)) return impresaDispatchText(d);
  switch (d.k) {
    case 'festaTitolo': return festaTitoloText(d.rango);
    case 'lotSold': return `${P(d.buyer)} ha comprato al fondaco ${qtyOf(d.good, d.qty)}: la carovana parte ora e incasserete <b>${n(d.gain)} scudi</b> al suo arrivo, nell'anno ${yearOf(d.arrive)}.`;
    case 'lotBack': return `Il fondaco vi rende ${qtyOf(d.good, d.qty)} rimasti invenduti.`;
    case 'caravanIn': return `È arrivata la carovana da ${P(d.from)}: ${qtyOf(d.good, d.qty - d.perse)} sono nei vostri magazzini.${journeyWords(d.evento, d.perse, d.good)}${d.refund ? ` Il venditore vi rimborsa <b>${n(d.refund)} scudi</b> per la merce perduta.` : ''}`;
    case 'caravanPaid': return `La vostra carovana è arrivata da ${P(d.to)}: incassate <b>${n(d.gain)} scudi</b> per ${qtyOf(d.good, d.qty - d.perse)}.${journeyWords(d.evento, d.perse, d.good)} Prestigio mercantile ${signed(d.prestigio)}.`;
    case 'disonore': return `Si è sparsa la voce del pignoramento dei vostri beni: i mercanti si fidano meno di voi. Prestigio mercantile ${signed(d.prestigio)}.`;
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
      const cash = d.cash ? ` ha preso ${n(d.cash)} scudi dalle casse` : '';
      return `Non avendo potuto rendere il prestito, ${P(d.lender)}${cash}${cash && goods ? ' e' : ''}${goods ? ` vi ha pignorato ${goods}` : ''}.${d.unpaid ? ` Restano insoluti ${n(d.unpaid)} scudi, che il creditore ha perduto.` : ''}`;
    }
  }
}

/** Mittente e titolo di ogni dispaccio, in testa alla pergamena. */
function dispatchHead(d: Dispatch): { from: string; title: string } {
  if (isFair(d)) return fairDispatchHead(d);
  if (isImpresa(d)) return impresaDispatchHead(d);
  switch (d.k) {
    case 'festaTitolo': return { from: 'dalla corte', title: 'Un titolo da celebrare' };
    case 'lotSold': return { from: 'dal fondaco', title: 'Merce venduta' };
    case 'lotBack': return { from: 'dal fondaco', title: 'Merce invenduta' };
    case 'caravanIn': return { from: 'dalla strada', title: 'Carovana arrivata' };
    case 'caravanPaid': return { from: 'dalla strada', title: d.perse ? 'Carovana assottigliata' : d.evento === 'temporali' || d.evento === 'ponte' ? 'Carovana in ritardo' : 'Carovana pagata' };
    case 'disonore': return { from: 'dalle piazze', title: 'Prestigio perduto' };
    case 'offerTaken': return { from: 'dal banco', title: 'Prestito accettato' };
    case 'offerBack': return { from: 'dal banco', title: 'Prestito non richiesto' };
    case 'repaid': return { from: 'dal banco', title: 'Prestito restituito' };
    case 'seized': return { from: 'dal banco', title: 'Pignoramento a vostro favore' };
    case 'paid': return { from: 'dal banco', title: 'Debito saldato' };
    case 'seizedFrom': return { from: 'dal banco', title: 'Beni pignorati' };
  }
}

/** Le imprese si giocano dalla colonna a sinistra: la risposta compare in un avviso. */
const fromAside = (title: string, say: string): ExtActionResult => ({ say, notice: { title, body: say } });

function reaction(r: ActionResult, ok: string, p: Player): string {
  if (!r.ok) return `${pick(['Ahimè', 'Non si può', 'Piano'])}, ${h(p)}: ${r.reason}.`;
  return ok;
}

// ---------------------------------------------------------------- pannelli

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
    <p class="hint">Gli usurai lombardi chiedono quest'anno il ${sc.usura}% sui debiti, e a fine anno pignorano i beni di chi deve loro oltre il credito concesso. Chi non rende un prestito fra signori si vede pignorare i beni dal creditore, al loro prezzo pieno.</p>`;
}

function cantina(g: Game): string {
  const p = g.player, c = cantinaOf(g), prices = passingPrices(g.state.q);
  const made = c.prodotto?.q === g.state.q ? c.prodotto : null;
  const rows = MERCI.map(good => `<tr>
      <th scope="row" data-label="Merce">${NOME[good][0].toUpperCase()}${NOME[good].slice(1)}</th>
      <td data-label="In magazzino">${n(c[good])} ${UNITA[good][1]}</td>
      <td data-label="Prodotti quest'anno">${made ? n(made[good]) : 0}</td>
      <td data-label="Mercanti di passaggio">${prices[good]} scudi l'unità</td>
      <td data-label="Vendere"><input type="number" name="sell-${good}" min="0" max="${c[good]}" value="${c[good]}" inputmode="numeric" aria-label="${UNITA[good][1]} da vendere">
        <button data-act="ext" data-op="sellPassing" data-good="${good}" ${c[good] ? '' : 'disabled'}>Vendi</button></td>
    </tr>`).join('');
  return `<table class="ext-table"><thead><tr><th>Merce</th><th>In magazzino</th><th>Prodotti quest'anno</th><th>Mercanti di passaggio</th><th>Vendere</th></tr></thead><tbody>${rows}</tbody></table>
    <ul class="ext-ledger">
      <li><b>Vino</b>: ogni vigneto dà circa ${VINO_PER_VIGNETO} botti l'anno, di più nelle annate buone. Avete ${c.vigneti} ${c.vigneti === 1 ? 'vigneto' : 'vigneti'}. Il vino non sfama il popolo, e in magazzino se ne guasta il ${Math.round(VINO_GUASTO * 100)}% l'anno.</li>
      <li><b>Manufatti</b>: ogni opificio ne fa fino a ${MANUFATTI_PER_OPIFICIO} pezzi l'anno, meno se gli artigiani sono scontenti. Avete ${p.opificio - 1} ${p.opificio - 1 === 1 ? 'opificio' : 'opifici'}. I manufatti non si guastano.</li>
      <li><b>Mercanti di passaggio</b>: comprano tutto e pagano subito, ma poco; il prezzo cambia ogni anno. Al fondaco si vende meglio, ma si incassa all'arrivo della carovana.</li>
      <li><b>Prestigio mercantile</b>: ${n(prestigeOf(g))} su 100 (${prestigeName(prestigeOf(g))}). Sale con le carovane puntuali (${signed(PRESTIGIO.consegna)}), i prestiti resi al banco (${signed(PRESTIGIO.prestitoReso)}) e i mercati (${signed(PRESTIGIO.mercati)} l'anno ogni ${MERCATI_PER_PUNTO}, al più ${signed(MERCATI_MAX)}); scende con ritardi e merce perduta (${signed(PRESTIGIO.ritardo)}) e con i pignoramenti (${signed(PRESTIGIO.pignoramento)}). Alla fiera i mercanti forestieri preferiscono chi ne ha di più.</li>
    </ul>`;
}

function fondaco(g: Game, st: MercantiState): string {
  const me = g.state.current, p = g.player, ps = g.state.players, prices = passingPrices(g.state.q);
  const others = st.lots.filter(l => l.seller !== me).sort((a, b) => a.good.localeCompare(b.good) || a.price - b.price);
  const rows = others.map(l => {
    const max = Math.min(l.qty, Math.max(0, Math.floor((p.scudi + p.credito) / l.price)));
    const years = travelYears(ps[l.seller].feudo, { feudo: p.feudo });
    return `<tr>
      <th scope="row" data-label="Banco">${who(ps[l.seller])}</th>
      <td data-label="Merce">${qtyOf(l.good, l.qty)}</td>
      <td data-label="Prezzo">${l.price} scudi l'unità<br><small>i mercanti di passaggio pagano ${prices[l.good]}</small></td>
      <td data-label="Viaggio">${years} ${years === 1 ? 'anno' : 'anni'}</td>
      <td data-label="Comprare"><input type="number" name="lot-${l.id}" min="0" max="${max}" value="${max}" inputmode="numeric" aria-label="quantità da comprare">
        <button data-act="ext" data-op="buyLot" data-id="${l.id}" ${max === 0 ? 'disabled' : ''}>Compra</button></td>
    </tr>`;
  }).join('');
  const table = others.length
    ? `<table class="ext-table"><thead><tr><th>Banco</th><th>Merce</th><th>Prezzo</th><th>Viaggio</th><th>Comprare</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p class="hint">Nessun altro signore vende merci al fondaco, per ora.</p>';
  const c = cantinaOf(g);
  const mine = MERCI.map(good => {
    const lot = st.lots.find(l => l.seller === me && l.good === good);
    if (lot) return `<p>Al vostro banco: <b>${qtyOf(good, lot.qty)}</b> a <b>${lot.price}</b> scudi l'unità. <button data-act="ext" data-op="withdrawLot" data-good="${good}">Ritira</button></p>`;
    return `<div class="ext-form"><b>${NOME[good][0].toUpperCase()}${NOME[good].slice(1)}</b>
        <label>Quantità <input type="number" name="lot-qty-${good}" min="1" max="${c[good]}" value="${c[good]}" inputmode="numeric"></label>
        <label>Prezzo l'unità <input type="number" name="lot-price-${good}" min="1" max="${LOT_MAX_PRICE[good]}" value="${prices[good] + 2}" inputmode="numeric"></label>
        <button data-act="ext" data-op="postLot" data-good="${good}" ${c[good] ? '' : 'disabled'}>Porta al fondaco</button></div>`;
  }).join('');
  const going = [
    ...caravansTo(st, me).map(k => `<li>In arrivo da ${who(ps[k.seller])}: ${qtyOf(k.good, k.qty)}, nell'anno ${yearOf(k.arrive)}.</li>`),
    ...caravansFrom(st, me).map(k => `<li>In viaggio verso ${who(ps[k.buyer])}: ${qtyOf(k.good, k.qty)}; incasserete ${n(k.paid)} scudi nell'anno ${yearOf(k.arrive)}.</li>`),
  ].join('');
  return `<h3>Merci in vendita</h3>${table}${going ? `<h3>Carovane in viaggio</h3><ul class="ext-ledger">${going}</ul>` : ''}
    <h3>Il vostro banco</h3>${mine}
    <p class="hint">Chi compra paga subito; la merce viaggia con una carovana e il venditore incassa al suo arrivo. Il viaggio dura un anno nella stessa zona, due in una zona vicina, tre a due zone di distanza e quattro fra il Nord e le Isole; un anno in meno da o per un porto. Il vostro feudo è nella zona ${ZONA_NOME[ZONA_FEUDO[p.feudo]]}. La merce invenduta torna al vostro prossimo turno.</p>
    <p class="hint">Per strada può succedere di tutto: briganti e botti rotte portano via fino a un decimo del carico (${Math.round((VIAGGIO.briganti.p + VIAGGIO.rotture.p) * 100)}% dei viaggi), temporali e ponti crollati fanno ritardare di un anno (${Math.round((VIAGGIO.temporali.p + VIAGGIO.ponte.p) * 100)}%), a volte si arriva prima. La merce perduta non si paga. Chi vende risponde della carovana: consegna puntuale e intatta ${signed(PRESTIGIO.consegna)} di prestigio mercantile, ritardo o merce perduta ${signed(PRESTIGIO.ritardo)}.</p>`;
}

function vigne(g: Game): string {
  const p = g.player, c = cantinaOf(g), max = maxVigneti(p);
  const can = c.vigneti < max && p.scudi - VIGNETO_COST >= -p.credito;
  return `<ul class="ext-ledger">
      <li>Avete <b>${c.vigneti}</b> ${c.vigneti === 1 ? 'vigneto' : 'vigneti'} su ${n(p.acri)} acri: al più ${max}, perché ${ACRI_GRANO_MIN} acri restano a grano.</li>
      <li>Un vigneto costa ${n(VIGNETO_COST)} scudi e occupa ${VIGNETO_ACRI} acri, che smettono di dare grano al raccolto. Conta nella ricchezza quanto costa.</li>
      <li>Dà circa ${VINO_PER_VIGNETO} botti di vino l'anno, fino a una volta e mezza nelle annate buone e la metà in quelle cattive.</li>
    </ul>
    <div class="btns"><button data-act="ext" data-op="plant" ${can ? 'class="primary"' : 'disabled'}>Piantate un vigneto (${n(VIGNETO_COST)} scudi)</button></div>`;
}

const PANELS: Record<string, { title: string; render: (g: Game, st: MercantiState) => string }> = {
  cantina: { title: 'Il magazzino', render: g => cantina(g) },
  fondaco: { title: 'Il fondaco delle merci', render: fondaco },
  vigne: { title: 'Le vigne', render: g => vigne(g) },
  fiera: { title: 'La fiera dei mercanti forestieri', render: fieraPanel },
  feste: { title: 'Feste, banchetti e doni', render: festePanel },
  banco: { title: 'Il banco dei prestiti', render: banco },
};

// ---------------------------------------------------------------- vista

export const view: ExpansionView = {
  title: 'Le vie dei mercanti',
  motto: 'Vino, manufatti e denaro corrono per le strade del regno.',
  miniature,
  summary: [
    'Vino e manufatti: piantate vigneti al posto del grano, e gli opifici producono manufatti. Si vendono ai mercanti di passaggio, che pagano subito ma poco, o agli altri signori al fondaco.',
    'Carovane: la merce venduta al fondaco viaggia da uno a quattro anni secondo la distanza, e si incassa al suo arrivo.',
    'Specialità: ogni feudo ha la sua (più vino, più manufatti, più grano, un porto, più prestigio).',
    'Banco: prestate denaro agli altri signori o prendetelo in prestito; chi non rende subisce il pignoramento.',
    'Fiera: ogni due anni i mercanti forestieri offrono grandi contratti; vince chi chiede meno, e a parità di prezzo chi ha più prestigio mercantile.',
    'Prestigio mercantile: sale con le consegne puntuali e i prestiti resi, scende con ritardi, penali e pignoramenti.',
    "Imprese: il vino annacquato, il contrabbando del Corno d'Oro, il console comprato e il mercante fallito. Grandi guadagni, e grandi rischi.",
    'Feste: il vino si consuma in banchetti e nozze, i manufatti arredano il palazzo e le cattedrali; danno prestigio, che conta nella ricchezza.',
  ],

  cards(g): ExtCard[] {
    const st = ms(g), me = g.state.current, c = cantinaOf(g);
    const offers = st.offers.filter(o => o.lender !== me).length;
    const lots = st.lots.filter(l => l.seller !== me).length;
    const cards: ExtCard[] = [
      { panel: 'cantina', title: 'Magazzino', sub: `${n(c.vino)} botti, ${n(c.manufatti)} pezzi`, art: cantinaArt },
      { panel: 'fondaco', title: 'Fondaco', sub: lots ? `${lots} ${lots === 1 ? 'banco aperto' : 'banchi aperti'}` : 'vendete agli altri signori', art: fondacoArt },
    ];
    cards.push({ panel: 'fiera', title: 'Fiera', sub: fairCardSub(g, st), art: fieraArt });
    cards.push({ panel: 'feste', title: 'Feste', sub: festeCardSub(g, st), art: festeArt });
    if (g.state.phase.kind === 'investimenti') cards.push({ panel: 'vigne', title: 'Vigne', sub: `${c.vigneti} ${c.vigneti === 1 ? 'vigneto' : 'vigneti'}`, art: vigneArt });
    cards.push({ panel: 'banco', title: 'Banco', sub: offers ? `${offers} ${offers === 1 ? 'prestito offerto' : 'prestiti offerti'}` : 'prestare e farsi prestare', art: bancoArt });
    return cards;
  },

  aside(g) {
    const p = g.player;
    const v = prestigeOf(g);
    return `<p class="exp-aside">Specialità di ${FEUDI[p.feudo]}: ${specialitaText(p.feudo)}.<br>Zona: ${ZONA_NOME[ZONA_FEUDO[p.feudo]]}.<br>Prestigio mercantile: <b>${n(v)}</b> su 100 (${prestigeName(v)}).${palaceLine(g, ms(g))}</p>`;
  },

  imprese: g => impreseAside(g, ms(g)),

  arrestText: g => smuggleArrestText(ms(g), g) ?? '<p class="big">Le guardie vi hanno arrestato: per voi la partita è finita.</p>',

  cardNote(g, eventId) {
    void g;
    return requestNote(eventId) ?? impresaCardNote(eventId) ?? '';
  },

  resourceBar(g) {
    const c = cantinaOf(g);
    const barrel = '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><ellipse cx="12" cy="12" rx="8" ry="9" fill="#8a5a34" stroke="#4a3424"/><path d="M5 8 h14 M5 16 h14" stroke="#4a3424" stroke-width="1.5"/></svg>';
    const seal = '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><circle cx="12" cy="11" r="7" fill="#a82c22" stroke="#6b1a14"/><path d="M8 17 l-2 5 l4 -2 M16 17 l2 5 l-4 -2" fill="#a82c22"/><path d="M9 11 l2 2 l4 -4" stroke="#f3e6c4" stroke-width="1.6" fill="none"/></svg>';
    const crate = '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><rect x="4" y="5" width="16" height="15" fill="#c9a86a" stroke="#6b4a2c"/><path d="M4 11 h16 M12 5 v15" stroke="#6b4a2c"/></svg>';
    return [
      { ico: barrel, value: n(c.vino), label: `vino (${c.vigneti} ${c.vigneti === 1 ? 'vigneto' : 'vigneti'})` },
      { ico: crate, value: n(c.manufatti), label: 'manufatti' },
      { ico: seal, value: n(prestigeOf(g)), label: 'prestigio mercantile' },
    ];
  },

  dispatches(g, animate) {
    const st = ms(g);
    return dispatchScrolls(st.inbox.map(d => ({ ...dispatchHead(d), body: dispatchText(d, g.state) })), animate, 'Ser Iacopo da Asti, banchiere');
  },

  open(g, panel) {
    const p = g.player, c = cantinaOf(g), prices = passingPrices(g.state.q);
    if (panel === 'cantina') {
      const made = c.prodotto?.q === g.state.q ? c.prodotto : null;
      return made && (made.vino || made.manufatti)
        ? `${h(p)}, quest'anno sono entrati in magazzino ${list([made.vino ? qtyOf('vino', made.vino) : '', made.manufatti ? qtyOf('manufatti', made.manufatti) : ''].filter(Boolean))}. I mercanti di passaggio pagano ${prices.vino} scudi la botte e ${prices.manufatti} il pezzo.`
        : `Il magazzino aspetta, ${h(p)}: piantate vigneti e costruite opifici, e qui arriveranno vino e manufatti da vendere.`;
    }
    if (panel === 'fondaco') return pick([`Al fondaco si vende a chi paga di più, ${h(p)}, ma il denaro arriva con la carovana.`, `Qui vino e manufatti cambiano mano fra signori, ${h(p)}. Fissate voi il prezzo.`]);
    if (panel === 'vigne') return `${SPECIALITA[p.feudo].kind === 'vino' ? `Le colline di ${FEUDI[p.feudo]} sono fatte per la vite, ${h(p)}: qui il vino rende di più.` : `La vite rende più del grano, ${h(p)}, ma il vino non sfama nessuno.`}`;
    if (panel === 'fiera') {
      const f = fairOpen(ms(g), g.state.q), todo = impegniOf(ms(g), g.state.current).filter(x => !x.spedito);
      if (f) return f.quote[g.state.current] < 0 ? `${h(p)}, la fiera è aperta! Pagate la quota d'ingresso: più investite, più contratti vedrete.` : `Fate le vostre offerte, ${h(p)}. Chiedete poco e vincerete, ma badate di avere la merce.`;
      if (todo.length) return `${h(p)}, i mercanti forestieri aspettano la vostra merce. Spedite prima, e incasserete prima.`;
      return `La fiera torna ogni due anni, ${h(p)}. Riempite i magazzini.`;
    }
    if (panel === 'feste') return pick([`Il vino che non si vende si beve, ${h(p)}: e un banchetto ben dato vale più di cento botti vendute per poco.`, `La fama di un signore si misura dalle sue feste, ${h(p)}.`]);
    if (panel === 'banco') {
      return p.scudi < 0
        ? `${h(p)}, i vostri conti sono in rosso: gli usurai chiedono il ${g.state.scalars.usura}%. Un prestito fra signori può costare meno.`
        : pick([`Il denaro fermo non frutta, ${h(p)}. Prestatelo, ma badate a chi.`, `Al banco si presta e si prende, ${h(p)}. Il pignoramento protegge il creditore.`]);
    }
    return '';
  },

  panel(g, ui: ExtUi) {
    const panel = PANELS[ui.panel ?? ''];
    if (!panel) return '';
    return `<h2>${panel.title}</h2>${speechBox(IACOPO, ui.say)}<div class="ext-panel">${panel.render(g, ms(g))}</div>
      <div class="btns"><button data-act="extClose" class="primary">${g.state.phase.kind === 'investimenti' ? 'Torna ai dispendimenti' : 'Torna alla delibera'}</button></div>`;
  },

  act(g, op, data, field): ExtActionResult {
    const p = g.player, st = ms(g);
    switch (op) {
      case 'sellPassing': {
        const good = data.good as Merce, qty = field(`sell-${good}`);
        const r = sellPassing(g, good, qty);
        return { say: reaction(r, `Venduto ai mercanti di passaggio: ${qtyOf(good, qty)} per ${n(r.gain ?? 0)} scudi, pagati sull'unghia.`, p) };
      }
      case 'postLot': {
        const good = data.good as Merce, qty = field(`lot-qty-${good}`), price = field(`lot-price-${good}`);
        return { say: reaction(postLot(g, good, qty, price), `${qtyOf(good, qty)} al fondaco, a ${price} scudi l'unità. Vi farò sapere.`, p) };
      }
      case 'withdrawLot':
        return { say: reaction(withdrawLot(g, data.good as Merce), 'La merce è tornata nei vostri magazzini.', p) };
      case 'buyLot': {
        const id = Number(data.id), qty = field(`lot-${id}`), lot = st.lots.find(l => l.id === id);
        const r = buyLot(g, id, qty);
        return { say: reaction(r, lot ? `Affare fatto: ${qtyOf(lot.good, qty)} per ${n(qty * lot.price)} scudi. La carovana è partita.` : '', p) };
      }
      case 'joinFair': {
        const t = Number(data.tier);
        const r = joinFair(g, t);
        return { say: reaction(r, `Fatto: avete ${QUOTE[t]?.name} alla fiera. Ora scegliete i contratti e fate le offerte.`, p) };
      }
      case 'bid': {
        const id = Number(data.id), price = field(`bid-${id}`), k = ms(g).fiera?.contratti.find(x => x.id === id);
        return { say: reaction(bid(g, id, price), k ? `Busta sigillata: ${contractLine(k)} a ${price} scudi l'unità. Si apre alla fine dell'anno.` : '', p) };
      }
      case 'unbid':
        return { say: reaction(bid(g, Number(data.id), 0), 'Offerta ritirata.', p) };
      case 'ship': {
        const id = Number(data.id), qty = field(`ship-${id}`), imp = ms(g).impegni.find(x => x.id === id);
        const short = imp && qty < imp.c.qty ? ` Mancano ${n(imp.c.qty - qty)} unità: pagherete la penale.` : '';
        return { say: reaction(shipContract(g, id, qty), imp ? `La carovana è partita per la piazza con ${qtyOf(imp.c.good, qty)}.${short}` : '', p) };
      }
      case 'banquet': {
        const k = data.kind as Banchetto, r = banquet(g, k);
        return { say: reaction(r, `Che banchetto, ${h(p)}! ${n(BANCHETTI[k]?.vino ?? 0)} botti vuotate, e ${n(r.prestigio ?? 0)} di prestigio.${r.umore ? ' Il popolo brinda alla vostra salute.' : ''}`, p) };
      }
      case 'feast': {
        const r = feast(g);
        return { say: reaction(r, `Festa grande per il nuovo titolo: ${n(r.prestigio ?? 0)} di prestigio, e i mercanti ne parleranno.`, p) };
      }
      case 'fulfil': {
        const id = data.req as RichiestaId, r = fulfilRequest(g, id);
        return { say: reaction(r, `Dono fatto, ${h(p)}: ${n(RICHIESTE[id]?.prestigio ?? 0)} di prestigio.`, p) };
      }
      case 'water': {
        const r = playWater(g);
        return fromAside('Il vino annacquato', reaction(r, `Fatto, ${h(p)}: ${n(r.added ?? 0)} botti in più. Ora pregate che i mercanti non abbiano il palato fino.`, p));
      }
      case 'smuggle': {
        const qty = field('smuggle-qty');
        return fromAside("Il contrabbando del Corno d'Oro", reaction(playSmuggle(g, qty), `La nave salpa a luna nuova con ${n(qty)} manufatti, ${h(p)}. Arriverà fra due anni. Non ne parlate con nessuno.`, p));
      }
      case 'console': {
        const id = field('console-k'), k = st.fiera?.contratti.find(x => x.id === id);
        return fromAside('Il console comprato', reaction(playConsole(g, id), k ? `Il console ha intascato l'oro: ${contractLine(k)} sarà vostro al prezzo base. Se nessuno parla.` : '', p));
      }
      case 'bankrupt': {
        const r = playBankrupt(g);
        return fromAside('Il mercante fallito', reaction(r, `Comprato tutto per ${n(r.cost ?? 0)} scudi: la merce arriverà da Pisa nel ${900 + (r.arrive ?? 0)}. Speriamo non sia tutta marcia.`, p));
      }
      case 'plant':
        return { say: reaction(plant(g), `Le barbatelle sono a dimora, ${h(p)}: ora avete ${cantinaOf(g).vigneti} ${cantinaOf(g).vigneti === 1 ? 'vigneto' : 'vigneti'}. La prima vendemmia, l'anno prossimo.`, p) };
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
    }
    return { say: '' };
  },

  cost(g, op, data, field) {
    const st = ms(g);
    if (op === 'plant') return VIGNETO_COST;
    if (op === 'console') return 2000;
    if (op === 'bankrupt') {
      const c = (st.imprese?.[g.state.current] ?? []).find(x => x.id === 'fallito');
      return c ? ((c.vino ?? 0) + (c.manufatti ?? 0)) * 5 : 0;
    }
    if (op === 'joinFair') {
      const f = fairOpen(st, g.state.q), had = f?.quote[g.state.current] ?? -1, t = QUOTE[Number(data.tier)];
      return t ? t.fee - (had >= 0 ? QUOTE[had].fee : 0) : 0;
    }
    if (op === 'buyLot') {
      const id = Number(data.id), lot = st.lots.find(l => l.id === id);
      return lot ? (field(`lot-${id}`) || 0) * lot.price : 0;
    }
    return 0;
  },

  chronicle(f, players) {
    const d = f.data, P = (i: number) => who(players[i]);
    const fair = fairChronicle(f.kind, d) ?? consumiChronicle(f.kind, d) ?? impresaChronicle(f.kind, d);
    if (fair) return fair;
    switch (f.kind) {
      case 'vineyard': return d.n === 1 ? 'Piantò il suo primo vigneto.' : `Piantò nuove vigne: i vigneti del feudo divennero ${d.n}.`;
      case 'passing': return `Vendette ai mercanti di passaggio ${qtyOf(MERCI[d.good], d.qty)}, per ${n(d.gain)} scudi.`;
      case 'lotPost': return `Portò al fondaco ${qtyOf(MERCI[d.good], d.qty)}, a ${d.price} scudi l'unità.`;
      case 'lotBuy': return `Comprò al fondaco ${qtyOf(MERCI[d.good], d.qty)} dal banco di ${P(d.seller)}, a ${d.price} scudi l'unità.`;
      case 'loanOffer': return `Offrì al banco un prestito di ${n(d.amount)} scudi al ${d.rate}%.`;
      case 'loanTake': return `Prese in prestito ${n(d.amount)} scudi da ${P(d.lender)}, con l'impegno di renderne ${n(d.due)}.`;
      case 'loanRepay': return `Restituì a ${P(d.lender)} ${n(d.amount)} scudi, come pattuito.`;
      case 'seize': {
        const goods = seizedList({ acri: d.acri, mercati: d.mercati, opifici: d.opifici, palazzo: d.palazzo });
        return `Non potendo rendere il prestito a ${P(d.lender)}, ${goods ? `si vide pignorare ${goods}` : 'gli versò quanto aveva'}.`;
      }
    }
    return null;
  },

  news(state, year) {
    const trades = (state.chronicle ?? []).filter(e => e.year === year && e.fact.t === 'ext' && e.fact.kind === 'lotBuy');
    const out: string[] = [];
    for (const [i, good] of MERCI.entries()) {
      const qty = trades.reduce((a, e) => a + (e.fact.t === 'ext' && e.fact.data.good === i ? e.fact.data.qty : 0), 0);
      if (qty) out.push(`Al fondaco passarono di mano ${qtyOf(good, qty)}.`);
    }
    return [...out, ...fairNews(state, year)];
  },
};
