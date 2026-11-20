/**
 * Prestiti di casata nella Dinastia (src/domain/prestiti.ts): la sezione del menu "La Dinastia",
 * la richiesta ricevuta a cui rispondere a inizio turno e i dispacci delle espansioni.
 */
import { casaMadre } from '../domain/dinastia';
import {
  beniCasata, casateDelVincolo, haBene, limiteRichiesta, massimoRichiesta, nomeBene, PRESTITO_ANNI, prestitoFra, quantoBene, richiestaFra, richiesteA,
  rifiutiFra, rischioRottura, ROTTURA_RIFIUTO, type BeneCasata, type DispaccioCasata,
} from '../domain/prestiti';
import { FEUDI } from '../domain/rank';
import type { Game } from '../domain/turn';
import type { GameState } from '../domain/types';
import { SPADE_ID, usaEspansione } from '../domain/vocazioni';

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const house = (st: GameState, j: number) => `${esc(st.players[j].name)} da ${FEUDI[st.players[j].feudo]}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const anno = (q: number) => 900 + q;
/** Rompere il vincolo: che cosa vuol dire, per chi resta offeso. */
const offesa = (st: GameState) => (usaEspansione(st, SPADE_ID) ? ', e per lui vale come un assalto subito' : '');

/** Che cosa è l'altra casata per la casata i: la madre o un ramo. */
function legame(g: Game, i: number, j: number): string {
  return casaMadre(g.state.dinastia!, i) === j ? `la vostra casata madre, ${house(g.state, j)}` : `il vostro ramo cadetto, ${house(g.state, j)}`;
}

/** Sezione "Prestiti di casata" del menu della Dinastia ('' se l'espansione non ne ha o non c'è un vincolo). */
export function prestitiSection(g: Game): string {
  const st = g.state, d = st.dinastia!, me = st.current, q = st.q, beni = beniCasata(g);
  if (!beni.length) return '';
  const kin = casateDelVincolo(st, me);
  const regole = `<p class="hint">Fra casata madre e rami cadetti ci si presta senza interesse ${beni.map(nomeBene).join(', ')}: al più due anni della produzione di chi chiede (gli scudi: due anni di rendita), da rendere entro ${PRESTITO_ANNI} anni. Alla scadenza si rendono da soli; se non bastano, il vincolo si rompe. Anche ogni prestito negato può romperlo: ${pct(ROTTURA_RIFIUTO)} al primo rifiuto, poi ${pct(2 * ROTTURA_RIFIUTO)}, ${pct(3 * ROTTURA_RIFIUTO)} e sempre al quarto; un prestito concesso fa dimenticare due rifiuti. Rotto il vincolo il ramo esce dalla casata, e chi ha subito il torto se ne tiene offeso${offesa(st)}.</p>`;
  if (!kin.length) return `<h3>Prestiti di casata</h3><p class="hint">Nessuna casata legata a voi dal vincolo: i prestiti di casata si chiedono fra casata madre e rami cadetti.</p>`;
  const righe = kin.map(j => {
    const loan = prestitoFra(d, me, j), req = richiestaFra(d, me, j), who = house(st, j);
    const conto = `<small>Rifiuti nel conto del vincolo: ${rifiutiFra(d, me, j)}; un nuovo rifiuto lo romperebbe con probabilità ${pct(rischioRottura(d, me, j))}.</small>`;
    let body: string;
    if (loan) body = loan.a === me
      ? `<p>Dovete a ${who} <b>${quantoBene(loan.bene, loan.qty)}</b> (ne avete ${quantoBene(loan.bene, haBene(g, me, loan.bene))}): si prelevano da soli all'inizio del vostro turno del ${anno(loan.entro)}. Se non bastano, il vincolo si rompe.</p>`
      : `<p>${who} vi deve <b>${quantoBene(loan.bene, loan.qty)}</b>: li renderà all'inizio del suo turno del ${anno(loan.entro)}.</p>`;
    else if (req) body = req.da === me
      ? `<p>La vostra richiesta di ${quantoBene(req.bene, req.qty)} attende la risposta di ${who}, nel suo turno.</p>`
      : `<p>${who} vi ha chiesto ${quantoBene(req.bene, req.qty)}: rispondete all'inizio del turno.</p>`;
    else if (d.casate[casaMadre(d, me) === j ? me : j].ramo?.chiesto === q) body = `<p class="hint">Quest'anno fra voi si è già chiesto un prestito.</p>`;
    else {
      const opts = beni.map(b => {
        const max = massimoRichiesta(g, me, j, b);
        const why = max > 0 ? `fino a ${quantoBene(b, max)}` : limiteRichiesta(g, me, j, b) <= 0 ? 'non ne producete' : 'non ne ha';
        return `<option value="${b}" ${max > 0 ? '' : 'disabled'}>${nomeBene(b)} (${why})</option>`;
      }).join('');
      body = `<div class="prestito-form"><select name="prBene-${j}">${opts}</select> <input name="prQty-${j}" type="number" min="1" step="1" placeholder="quanto" size="7">
        <button data-act="din" data-op="prestito" data-a="${j}">Chiedete il prestito</button></div>`;
    }
    return `<li><b>${cap(legame(g, me, j))}</b>${body}${conto}</li>`;
  }).join('');
  return `<h3>Prestiti di casata</h3><ul class="nozze-list prestiti">${righe}</ul>${regole}`;
}

/** Risposta della casata a cui si è chiesto, detta subito a chi ha chiesto. */
export function esitoRichiestaText(g: Game, a: number, r: { answered?: boolean; accepted?: boolean; rotto?: boolean }, bene: BeneCasata, qty: number): string {
  const st = g.state, who = st.players[a].name;
  if (r.answered === false) return `La richiesta è partita: ${who} risponderà nel suo turno.`;
  if (r.accepted) return `${who} vi presta ${quantoBene(bene, qty)}: si renderanno da soli fra ${PRESTITO_ANNI} anni.`;
  return `${who} ha negato il prestito.${r.rotto ? " Il vincolo fra le casate si è rotto: non siete più parenti, e ve ne tenete offesi." : ''}`;
}

/** Richiesta di prestito ricevuta: si risponde all'inizio del turno, come a una proposta di nozze. */
export function prestitoDecision(g: Game): { title: string; body: string; options: { label: string; op: string; target?: number; primary?: boolean; act?: string }[] } | null {
  const st = g.state, d = st.dinastia;
  if (!d?.persone || st.phase.kind !== 'commercio') return null;
  const x = richiesteA(d, st.current)[0];
  if (!x) return null;
  const me = st.current, have = haBene(g, me, x.bene), can = have >= x.qty;
  const n = rifiutiFra(d, x.da, me), risk = rischioRottura(d, x.da, me);
  return {
    title: 'Richiesta di prestito',
    body: `${cap(legame(g, me, x.da))} vi chiede in prestito <b>${quantoBene(x.bene, x.qty)}</b>, senza interesse, da rendere entro ${PRESTITO_ANNI} anni. Ne avete ${quantoBene(x.bene, have)}.
      ${n ? `Nel conto del vincolo ci sono già ${n === 1 ? 'un rifiuto' : `${n} rifiuti`}. ` : ''}Se rifiutate, il vincolo si rompe con probabilità <b>${pct(risk)}</b>: le casate non sarebbero più parenti, e ${esc(st.players[x.da].name)} se ne terrebbe offeso${offesa(st)}.${can ? '' : ' <b>Non avete abbastanza per concederlo.</b>'}`,
    options: [
      { label: 'Negate il prestito', op: 'prestitoNo', target: x.id, act: 'din' },
      ...(can ? [{ label: 'Concedete il prestito', op: 'prestitoSi', target: x.id, primary: true, act: 'din' }] : []),
    ],
  };
}

/** Titolo della pergamena di un dispaccio dei prestiti di casata. */
export const titoloDispaccioCasata = (d: DispaccioCasata) =>
  ({ concesso: 'Prestito concesso', negato: 'Prestito negato', reso: 'Prestito reso', mancato: 'Prestito non reso' } as const)[d.k];

/** Pergamena di un dispaccio dei prestiti di casata (per le espansioni). */
export function dispaccioCasata(d: DispaccioCasata, st: GameState): { title: string; from: string; body: string } {
  const P = house(st, d.con), q = quantoBene(d.bene, d.qty), from = 'dalla casata';
  const rotto = (offeso: boolean) => ` <b>Il vincolo fra le casate si è rotto</b>: non siete più parenti, il prestigio del ramo non va più alla casata madre${offeso ? `, e avete un casus belli contro ${P}` : `, e ${P} se ne tiene offeso`}.`;
  switch (d.k) {
    case 'concesso': return { title: 'Prestito concesso', from, body: `${P} vi ha prestato <b>${q}</b>, senza interesse. Si renderanno da soli all'inizio del vostro turno del ${anno(d.entro)}: se allora non bastano, il vincolo fra le casate si rompe.` };
    case 'negato': return { title: 'Prestito negato', from, body: `${P} vi ha negato il prestito di ${q}.${d.rotto ? rotto(true) : ''}` };
    case 'reso': return { title: 'Prestito reso', from, body: d.debitore ? `Avete reso a ${P} <b>${q}</b>, come pattuito: il debito è estinto.` : `${P} vi ha reso <b>${q}</b>, come pattuito.` };
    case 'mancato': return d.debitore
      ? { title: 'Prestito non reso', from, body: `Alla scadenza non avevate abbastanza per rendere a ${P} ${q}: ${d.resi ? `gli sono andati ${quantoBene(d.bene, d.resi)}` : 'non gli è andato nulla'}.${rotto(false)}` }
      : { title: 'Prestito non reso', from, body: `${P} non vi ha reso ${q}: ${d.resi ? `ne avete riavuti solo ${quantoBene(d.bene, d.resi)}` : 'non avete riavuto nulla'}.${rotto(true)}` };
  }
}
