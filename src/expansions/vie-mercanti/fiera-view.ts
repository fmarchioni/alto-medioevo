/**
 * Vista della fiera dei mercanti forestieri: pannello, dispacci e cronaca.
 * Solo presentazione: le regole sono in fiera.ts.
 */
import type { Game } from '../../domain/turn';
import type { GameState, Player } from '../../domain/types';
import { FEUDI, titleName } from '../../domain/rank';
import {
  bidOf, fairOpen, quotaValue, FIERA_OGNI, impegniOf, nextFair, OFFERTA_MAX, PAGA_RITARDO, PENALE, PESO_PREZZO, PESO_PRESTIGIO, QUOTE,
  visibleTo, type Contratto, type FieraDispatch, type FieraState,
} from './fiera';
import { PIAZZE, travelYears } from './geografia';
import { MERCI, UNITA, type Merce } from './merci';

const n = (v: number) => Math.floor(v).toLocaleString('it-IT');
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const who = (p: Player) => `${esc(p.name)} da ${FEUDI[p.feudo]}`;
const qtyOf = (good: Merce, k: number) => `${n(k)} ${UNITA[good][k === 1 ? 0 : 1]} di ${good}`;
const yearOf = (q: number) => 900 + q;
const anni = (k: number) => `${k} ${k === 1 ? 'anno' : 'anni'}`;
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 10) / 10).toLocaleString('it-IT')}`;

/** Chi compra in ciascuna piazza (due committenti per piazza). */
const COMMITTENTI: Record<string, [string, string]> = {
  venezia: ['il doge di Venezia', 'i mercanti di Rialto'],
  genova: ['i consoli di Genova', 'gli armatori genovesi'],
  pisa: ["l'arcivescovo di Pisa", 'i mercanti pisani'],
  amalfi: ['il duca di Amalfi', 'i mercanti amalfitani'],
  messina: ['lo stratego di Messina', 'i mercanti di Messina'],
  costantinopoli: ["la corte dell'imperatore d'Oriente", "i mercanti del Corno d'Oro"],
};
const SPECIALI = ["per l'incoronazione di un re", 'per le nozze di un principe', 'per la flotta che salpa in primavera', 'per la consacrazione di una cattedrale'];

export const piazzaName = (k: Contratto) => PIAZZE.find(x => x.id === k.piazza)!.name;
export const committente = (k: Contratto) => COMMITTENTI[k.piazza][k.chi];
/** "300 botti di vino per il doge di Venezia" */
export const contractLine = (k: Contratto) => `${qtyOf(k.good, k.qty)} per ${committente(k)}${k.speciale ? `, ${SPECIALI[k.id % SPECIALI.length]}` : ''}`;

export function fairDispatchText(d: FieraDispatch, st: GameState): string {
  const P = (i: number) => who(st.players[i]);
  switch (d.k) {
    case 'fieraAperta': return `È tempo di fiera! I mercanti forestieri hanno portato ${d.n} contratti di vino e manufatti. Pagate la quota d'ingresso e fate le vostre offerte prima della fine dell'anno.`;
    case 'fieraVinta': return `Avete vinto il contratto: ${contractLine(d.c)}, a <b>${d.price} scudi l'unità</b>${d.rivali ? ` (battuti ${d.rivali} ${d.rivali === 1 ? 'rivale' : 'rivali'})` : ''}. Spedite la merce entro la fine del ${yearOf(d.entro)}: incasserete <b>${n(d.price * d.c.qty)} scudi</b> all'arrivo a ${piazzaName(d.c)}.`;
    case 'fieraPersa': return `Il contratto di ${contractLine(d.c)} è andato a ${P(d.winner)}, che ha chiesto ${d.winPrice} scudi l'unità. Voi ne chiedevate ${d.price}.`;
    case 'fieraRifiutata': return `I mercanti hanno trovato troppo cara la vostra offerta per ${contractLine(d.c)}: ${d.price} scudi l'unità, oltre il prezzo base di ${d.c.base}.`;
    case 'fieraSpedita': return `Scaduto il tempo, la carovana per ${piazzaName(d.c)} è partita con ${qtyOf(d.c.good, d.qty)}. Arriverà nel ${yearOf(d.arrive)}.`;
    case 'fieraPagata': {
      const arrived = d.qty - d.perse;
      const road = d.evento === 'briganti' ? ` I briganti hanno portato via ${qtyOf(d.c.good, d.perse)}.`
        : d.evento === 'rotture' ? ` Per strada sono andati perduti ${qtyOf(d.c.good, d.perse)}.`
          : d.ritardo ? ` La carovana è arrivata con un anno di ritardo: i mercanti pagano un decimo in meno.` : '';
      return `La carovana è arrivata a ${piazzaName(d.c)}: ${committente(d.c)} pagano <b>${n(d.gain)} scudi</b> per ${qtyOf(d.c.good, arrived)}.${road}${d.prestigio ? ` Prestigio mercantile ${signed(d.prestigio)}.` : ''}`;
    }
    case 'vinoScoperto': return `A ${piazzaName(d.c)} un mercante ha assaggiato il vostro vino e lo ha trovato annacquato! ${committente(d.c)} non pagano nulla e vi chiedono una multa di <b>${n(d.multa)} scudi</b>. Prestigio mercantile ${signed(d.prestigio)}, e alle fiere non vi vogliono fino al ${yearOf(d.fino)}.`;
    case 'consoleScoperto': return `Si è saputo che avevate comprato il console per il contratto di ${contractLine(d.c)}! Niente contratto, prestigio mercantile ${signed(d.prestigio)}, e alle fiere non vi vogliono fino al ${yearOf(d.fino)}.`;
    case 'consoleFatto': return `Il console ha fatto il suo lavoro: il contratto di ${contractLine(d.c)} è vostro al prezzo base.`;
    case 'fieraMancata': return `Non avete consegnato ${qtyOf(d.c.good, d.manca)} promessi a ${committente(d.c)}: pagate una penale di <b>${n(d.penale)} scudi</b>. Prestigio mercantile ${signed(d.prestigio)}.`;
  }
}

export function fairDispatchHead(d: FieraDispatch): { from: string; title: string } {
  switch (d.k) {
    case 'fieraAperta': return { from: 'dalla fiera', title: 'La fiera è aperta' };
    case 'fieraVinta': return { from: 'dalla fiera', title: 'Contratto vinto' };
    case 'fieraPersa': return { from: 'dalla fiera', title: 'Contratto perduto' };
    case 'fieraRifiutata': return { from: 'dalla fiera', title: 'Offerta respinta' };
    case 'fieraSpedita': return { from: 'dalla strada', title: 'Carovana partita' };
    case 'fieraPagata': return { from: `da ${piazzaName(d.c)}`, title: 'Contratto pagato' };
    case 'fieraMancata': return { from: 'dalla fiera', title: 'Penale' };
    case 'vinoScoperto': return { from: `da ${piazzaName(d.c)}`, title: 'Vino annacquato!' };
    case 'consoleScoperto': return { from: 'dalla fiera', title: 'Il console ha parlato' };
    case 'consoleFatto': return { from: 'dalla fiera', title: 'Il console comprato' };
  }
}

/** Il pannello della fiera: quota, contratti e offerte, contratti in corso. */
export function fieraPanel(g: Game, st: FieraState): string {
  const me = g.state.current, p = g.player, q = g.state.q, cant = st.cantine[me];
  const f = fairOpen(st, q);
  let fair: string;
  if (!f) {
    fair = `<p>La prossima fiera si tiene nel <b>${yearOf(nextFair(q))}</b>. Preparate vino e manufatti: i mercanti forestieri comprano in grande.</p>`;
  } else {
    const tier = f.quote[me] ?? -1;
    const join = QUOTE.map((t, i) => {
      if (i <= tier) return '';
      const fee = t.fee - (tier >= 0 ? QUOTE[tier].fee : 0);
      return `<button data-act="ext" data-op="joinFair" data-tier="${i}" ${p.scudi - fee >= -p.credito ? '' : 'disabled'}>${tier < 0 ? 'Prendete' : 'Passate a'} ${t.name}: ${t.n === 1 ? '1 contratto' : `${t.n} contratti`} (${n(fee)} scudi, contratti per circa ${n(quotaValue(i))} scudi)</button>`;
    }).join('');
    const vis = visibleTo(f, me);
    const rows = vis.map(k => {
      const mine = bidOf(f, me, k.id), years = travelYears(p.feudo, { piazza: k.piazza });
      return `<tr${k.speciale ? ' class="speciale"' : ''}>
        <th scope="row" data-label="Contratto">${contractLine(k)}</th>
        <td data-label="Piazza">${piazzaName(k)}<br><small>viaggio ${anni(years)}</small></td>
        <td data-label="Spedire entro">${yearOf(f.q + k.tempo)}</td>
        <td data-label="Prezzo base">${k.base} scudi<br><small>${n(k.base * k.qty)} in tutto</small></td>
        <td data-label="Offerta"><input type="number" name="bid-${k.id}" min="1" max="${Math.floor(k.base * OFFERTA_MAX)}" value="${mine?.price ?? k.base}" inputmode="numeric" aria-label="prezzo l'unità">
          <button data-act="ext" data-op="bid" data-id="${k.id}">${mine ? 'Cambia' : 'Offri'}</button>
          ${mine ? `<button data-act="ext" data-op="unbid" data-id="${k.id}">Ritira</button>` : ''}</td>
      </tr>`;
    }).join('');
    const hidden = f.contratti.length - vis.length;
    fair = `<p>Fiera del <b>${yearOf(f.q)}</b>. ${tier < 0 ? "Per vedere i contratti pagate la quota d'ingresso." : `Avete ${QUOTE[tier].name}.`}${hidden && tier >= 0 ? ` Altri ${hidden} contratti, i più ricchi, li vede solo chi investe di più.` : ''}</p>
      ${join ? `<div class="btns">${join}</div>` : ''}
      ${vis.length ? `<table class="ext-table"><thead><tr><th>Contratto</th><th>Piazza</th><th>Spedire entro</th><th>Prezzo base l'unità</th><th>La vostra offerta</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
      <p class="hint">Le buste si aprono alla fine dell'anno. Conta per il ${Math.round(PESO_PREZZO * 100)}% il prezzo (vince chi chiede meno) e per il ${Math.round(PESO_PRESTIGIO * 100)}% il prestigio mercantile.</p>
      <p class="hint">Se prendi una loggia o un palazzo avrai accesso ad affari di alto livello.</p>`;
  }
  const mine = impegniOf(st, me);
  const going = mine.map(x => {
    const s = x.spedito;
    if (s) return `<li>${contractLine(x.c)} a ${x.price} scudi: la carovana è partita con ${qtyOf(x.c.good, s.qty)}, arriverà a ${piazzaName(x.c)} nel ${yearOf(s.arrive)}.</li>`;
    const have = cant[x.c.good], max = Math.min(have, x.c.qty);
    return `<li>${contractLine(x.c)} a ${x.price} scudi l'unità: spedire entro la fine del <b>${yearOf(x.entro)}</b> (viaggio ${anni(travelYears(p.feudo, { piazza: x.c.piazza }))}). In magazzino: ${qtyOf(x.c.good, have)}.
      <span class="ext-form"><input type="number" name="ship-${x.id}" min="1" max="${x.c.qty}" value="${Math.max(1, max)}" inputmode="numeric" aria-label="quantità da spedire">
      <button data-act="ext" data-op="ship" data-id="${x.id}" ${have ? '' : 'disabled'}>Spedite ora</button></span></li>`;
  }).join('');
  return `${fair}
    ${going ? `<h3>Contratti in corso</h3><ul class="ext-ledger">${going}</ul>` : ''}
    <p class="hint">La fiera si tiene ogni ${FIERA_OGNI} anni. Chi vince spedisce la merce con una carovana: si incassa all'arrivo. Alla scadenza la carovana parte da sola con quello che c'è in magazzino; la merce che manca costa una penale del ${Math.round(PENALE * 100)}% del suo prezzo. Chi arriva in ritardo è pagato il ${Math.round((1 - PAGA_RITARDO) * 100)}% in meno, e la merce perduta per strada non si paga. Consegna intera e puntuale fa salire il prestigio. Consegne parziali o mancate fanno diminuire il prestigio.<br>Se la merce non basta, compratela al fondaco a buon cuore degli offerenti.</p>`;
}

/**
 * Avviso nei dispendimenti dell'ultimo anno utile: c'è un contratto da
 * spedire entro quest'anno e la merce in magazzino basta.
 */
export function shipReminder(g: Game, st: FieraState): { title: string; body: string } | null {
  const me = g.state.current, p = g.player, q = g.state.q, cant = st.cantine[me];
  const due = impegniOf(st, me).filter(x => !x.spedito && x.entro === q && cant[x.c.good] >= x.c.qty);
  if (!due.length) return null;
  const rank = (p.title - 1) % 5;
  const who = rank === 0 ? (p.gender === 1 ? 'Messere' : 'Madonna') : `${p.gender === 1 ? 'Messer' : 'Madonna'} ${titleName(p.title)}`;
  const list = due.map(x => `<br>- ${contractLine(x.c)} (in magazzino: ${n(cant[x.c.good])})`).join('');
  return {
    title: 'Merce da spedire',
    body: `${who}, non dimenticate di spedire la merce ai mercanti! Quest'anno è l'ultimo utile:${list}<br>Per spedirla aprite Fra signori, poi la Fiera: è fra i contratti in corso.`,
  };
}

/** Sottotitolo della tessera della fiera. */
export function fairCardSub(g: Game, st: FieraState): string {
  const f = fairOpen(st, g.state.q), me = g.state.current;
  const open = impegniOf(st, me).filter(x => !x.spedito).length;
  if (f) return f.quote[me] >= 0 ? `${f.offerte.filter(o => o.player === me).length} offerte` : 'aperta: entrate!';
  if (open) return `${open} ${open === 1 ? 'contratto da spedire' : 'contratti da spedire'}`;
  return `prossima nel ${yearOf(nextFair(g.state.q))}`;
}

/** Righe della cronaca per i fatti della fiera. */
export function fairChronicle(kind: string, d: Record<string, number>): string | null {
  const good = MERCI[d.good], piazza = PIAZZE[d.piazza]?.name;
  switch (kind) {
    case 'fairJoin': return `Pagò ${n(d.fee)} scudi per avere ${QUOTE[d.tier].name} alla fiera dei mercanti forestieri.`;
    case 'fairWin': return `Vinse alla fiera ${d.speciale ? 'il contratto speciale' : 'un contratto'}: ${qtyOf(good, d.qty)} per ${piazza}, a ${d.price} scudi l'unità.`;
    case 'fairShip': return `Spedì a ${piazza} ${qtyOf(good, d.qty)}.`;
    case 'fairPaid': return `Da ${piazza} giunse il pagamento di ${qtyOf(good, d.qty)}: ${n(d.gain)} scudi.`;
    case 'fairFail': return `Mancò alla parola data ai mercanti forestieri: ${qtyOf(good, d.manca)} mai spediti, ${n(d.penale)} scudi di penale.`;
  }
  return null;
}

/** Notizie del regno sulla fiera dell'anno. */
export function fairNews(state: GameState, year: number): string[] {
  const wins = (state.chronicle ?? []).filter(e => e.year === year && e.fact.t === 'ext' && e.fact.kind === 'fairWin');
  if (!wins.length) return [];
  const value = wins.reduce((a, e) => a + (e.fact.t === 'ext' ? e.fact.data.qty * e.fact.data.price : 0), 0);
  return [`Alla fiera del ${year} i mercanti forestieri assegnarono ${wins.length} ${wins.length === 1 ? 'contratto' : 'contratti'}, per ${n(value)} scudi.`];
}

