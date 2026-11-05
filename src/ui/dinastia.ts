/**
 * Viste della Dinastia (src/domain/dinastia.ts): obiettivo nella schermata
 * iniziale, morte e successione, riquadro della casata, classifica finale e
 * frasi per il libro delle cronache.
 */
import {
  ANNO_FINE, etaOf, nomeCompleto, prestigioOf, PRESTIGIO_RANGO, PRESTIGIO_RE, signoreOf, type CausaMorte, type DinastiaState, type Successione,
} from '../domain/dinastia';
import { FEUDI, missingFloors, rankOf, titleName, victoryRule, wealthIndex } from '../domain/rank';
import type { Game } from '../domain/turn';
import type { ChronicleFact, Gender, Player } from '../domain/types';
import { figliDi, nomeConsorte, nozzeDi, personaOf, signoreP } from '../domain/famiglia';
import { INFO } from './fazioni';

export type Obiettivo = 'regno' | 'dinastia';

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const fmt = (v: number) => Math.round(v).toLocaleString('it-IT');
const oa = (g: Gender) => (g === 1 ? 'o' : 'a');

/** Pannello in fondo alla schermata iniziale: la partita finisce sul trono o nel 962. */
export function renderObiettivi(selected: Obiettivo): string {
  const tile = (id: Obiettivo, emblem: string, title: string, motto: string) =>
    `<button type="button" class="exp-tile goal-tile" data-act="obiettivo" data-id="${id}" aria-pressed="${selected === id}">
      <span class="goal-emblem" aria-hidden="true">${emblem}</span><span class="exp-name">${title}</span><span class="exp-motto">${motto}</span></button>`;
  const rules = selected === 'dinastia'
    ? `<ul class="exp-rules">
        <li>La partita non finisce sul trono: finisce nel ${ANNO_FINE}, quando Ottone I è incoronato imperatore a Roma e il Regno d'Italia passa all'Impero.</li>
        <li>I signori invecchiano e muoiono: di malattia, di vecchiaia, per le ferite di una battaglia, negli scontri di una rivolta o per una congiura di palazzo, se il popolo è scontento. Regna allora l'erede.</li>
        <li>Nascono figli finché il signore è sposato. Eredita il primogenito; gli altri figli rimasti in casa prendono parte del tesoro, del grano e delle terre. La città, le botteghe e i debiti restano all'erede. Più la casata è ricca rispetto alle altre, più i fratelli pretendono. Un erede bambino regna sotto reggenza.</li>
        <li>I figli si sposano con le altre casate (niente tributi fra parenti, appoggio all'elezione, niente guerra fra loro), con Franchi, Longobardi e Bizantini (la fazione non vi attacca più, ma le sue rivali sì) o con la nobiltà del luogo. Il ripudio scioglie le nozze, ma dà all'offeso un casus belli.</li>
        <li>La corona d'Italia non si eredita. Chi raggiunge le condizioni del trono (ricchezza e palazzo completo) non vince: si candida, e con il trono vacante tutti i signori votano, ciascuno con il peso del suo rango. Alla morte del re si vota di nuovo. Ogni corona vale prestigio.</li>
        <li>Vince la casata con più prestigio: i titoli di ogni generazione, le corone, i matrimoni illustri e la ricchezza dell'ultimo signore.</li>
      </ul>`
    : '<p class="hint">Vince chi sale per primo al trono, come nel gioco originale.</p>';
  return `<fieldset class="expansions goals"><legend>Obiettivo</legend>
    <div class="exp-tiles">
      ${tile('regno', '♛', 'Regno', 'Diventare re: la partita finisce sul trono.')}
      ${tile('dinastia', '⚜', 'Dinastia', `Generazioni di signori fino al ${ANNO_FINE}.`)}
    </div>${rules}</fieldset>`;
}

const MORTE: Record<CausaMorte, (g: Gender) => string> = {
  vecchiaia: g => `si è spent${oa(g)} nel sonno, caric${oa(g)} d'anni`,
  malattia: () => 'è stato portato via in pochi giorni da una febbre maligna',
  battaglia: () => 'è morto per le ferite riportate in battaglia',
  rivolta: () => 'è caduto negli scontri della rivolta',
  congiura: () => 'è stato avvelenato in una congiura di palazzo: il popolo scontento ha trovato chi armasse la mano',
};
/** "è stato" → "è stata" per una signora */
const morte = (c: CausaMorte, g: Gender) => (g === 1 ? MORTE[c](g) : MORTE[c](g).replace(/stato/g, 'stata').replace(/morto/g, 'morta').replace(/caduto/g, 'caduta'));

function ereditaText(s: Successione): string {
  const e = s.eredita;
  if (!e.cadetti) return "Non ci sono fratelli minori: l'eredità resta intera.";
  const parts = [e.scudi && `${fmt(e.scudi)} scudi`, e.grano && `${fmt(e.grano)} misure di grano`, e.acri && `${fmt(e.acri)} acri`, e.servi && `${fmt(e.servi)} servi`].filter(Boolean);
  const who = e.cadetti === 1 ? 'Il fratello minore prende' : `I ${e.cadetti} fratelli minori prendono`;
  return parts.length ? `${who} la sua parte dell'eredità: ${parts.join(', ')}.` : `${who} la sua parte, ma nel tesoro non c'è nulla da dividere.`;
}

/** Restare nella città o trasferirsi in una città libera vicina, lasciando la città ai fratelli. */
function sede(g: Game, s: Successione): string {
  const p = g.player;
  if (s.trasferito) {
    const t = s.trasferito;
    const left = [t.mercati && `${t.mercati} mercati`, t.opifici && `${t.opifici} opifici`, t.palazzo && `${t.palazzo} piani di palazzo`, t.granai && `${t.granai} granai`, t.acri && `${fmt(t.acri)} acri con ${fmt(t.servi)} servi`].filter(Boolean);
    return `<p><b>L'erede ha lasciato ${FEUDI[t.da]} ai fratelli e si è trasferito a ${FEUDI[t.a]}</b>${left.length ? `: restano a loro ${left.join(', ')}` : ''}. Il tesoro e il grano sono tutti suoi.</p>`;
  }
  if (!s.trasferibile?.length) return '';
  const e = s.eredita;
  const keepCost = [e.scudi && `${fmt(e.scudi)} scudi`, e.grano && `${fmt(e.grano)} misure di grano`, e.acri && `${fmt(e.acri)} acri`].filter(Boolean).join(', ') || 'quasi nulla';
  const goCost = [p.mercato > 1 && `${p.mercato - 1} mercati`, p.opificio > 1 && `${p.opificio - 1} opifici`, p.palazzo && `${p.palazzo} piani di palazzo`, (p.granai ?? 0) && `${p.granai} granai`, p.acri > 500 && `${fmt(p.acri - 500)} acri`].filter(Boolean).join(', ') || 'nulla di costruito';
  return `<div class="sede"><h3>Dove regnerà l'erede?</h3>
    <ul class="nozze-list">
      <li><button data-act="successione" class="primary">Resta a ${FEUDI[p.feudo]}</button> <small>i fratelli prendono ${keepCost}.</small></li>
      ${s.trasferibile.map(c => `<li><button data-act="trasferisci" data-citta="${c}">Si trasferisce a ${FEUDI[c]}</button> <small>tiene tutto il tesoro e il grano; ai fratelli restano ${goCost}.</small></li>`).join('')}
    </ul></div>`;
}

/** Pagina della successione, prima del primo anno dell'erede. */
export function renderSuccessione(g: Game, s: Successione): string {
  const p = g.player, d = g.state.dinastia!, erede = signoreOf(d, g.state.current);
  return `<h2>Morte ${s.gender === 1 ? 'del signore' : 'della signora'}</h2>
    <p class="big">${esc(s.morto)} ${morte(s.causa, s.gender)}, a ${s.eta} anni, dopo ${s.anni} ${s.anni === 1 ? 'anno' : 'anni'} di regno.</p>
    <p>${s.gender === 1 ? 'Gli' : 'Le'} succede ${s.rel === 'nipote' ? `${p.gender === 1 ? 'il nipote' : 'la nipote'}: non c'erano figli in casa` : p.gender === 1 ? 'il figlio' : 'la figlia'} <b>${esc(s.erede)}</b>, di ${s.etaErede} anni.</p>
    ${s.reggenza !== undefined ? `<p>L'erede è un bambino: fino al ${900 + s.reggenza} governa un consiglio di reggenza, che trattiene parte della rendita.</p>` : ''}
    <p>${s.rel === 'nipote' && s.eredita.cadetti ? "Senza figli, i parenti si contendono l'eredità. " : ''}${ereditaText(s)}</p>
    ${s.corona ? "<p>Portava la corona d'Italia: il trono è vacante, e a fine anno i grandi del regno eleggeranno il nuovo re.</p>" : ''}
    ${sede(g, s)}
    <form class="setup heir-form" onsubmit="return false">
      <label>Nome dell'erede <input name="erede" maxlength="12" autocomplete="off" value="${esc(erede.nome)}" aria-label="nome dell'erede"></label>
      <p class="hint">Se porta il nome di un avo, prende il suo ordinale (II, III...).</p>
    </form>
    ${s.trasferibile?.length ? '' : '<div class="btns"><button data-act="successione" class="primary">Inizia il regno</button></div>'}`;
}

/** Riquadro della casata nella colonna a sinistra. */
export function dinastiaAside(g: Game, button = false): string {
  const d = g.state.dinastia!, i = g.state.current, gen = signoreOf(d, i), c = d.casate[i];
  const re = d.re === null ? 'trono vacante' : d.re === i ? 'portate voi la corona' : `re: ${esc(g.state.players[d.re].name)}`;
  // cosa serve per essere eletti, e quanto manca a questo signore
  const v = victoryRule(g.state.options), p = g.player;
  const short = [Math.max(0, v.threshold - wealthIndex(p)) > 0 && `${fmt(v.threshold - wealthIndex(p))} di ricchezza`, missingFloors(p, v) > 0 && `${missingFloors(p, v)} piani di palazzo`].filter(Boolean);
  const trono = d.re === i
    ? "Alla vostra morte la corona non passa all'erede: il trono torna vacante."
    : d.re !== null
      ? 'Alla morte del re il trono tornerà vacante.'
      : `A fine anno i grandi eleggono re il più ricco fra chi ha ricchezza oltre ${fmt(v.threshold)}${v.palazzo ? ' e il palazzo completo' : ''}. ${short.length ? `Vi mancano ${short.join(' e ')}.` : 'Voi avete le condizioni.'}`;
  return `<div class="casata"><p class="exp-badge">Dinastia: fino al ${d.fine}</p>
    <dl class="res">
      <div><dt>Casata</dt><dd>di ${esc(c.fondatore)}</dd></div>
      <div><dt>Generazione</dt><dd>${c.generazioni.length}ª</dd></div>
      <div><dt>Età</dt><dd>${etaOf(gen, g.state.q)} anni</dd></div>
      <div><dt>Regna dal</dt><dd>${900 + gen.dal}</dd></div>
      <div><dt>Corona d'Italia</dt><dd>${re}</dd></div>
      <div><dt>Prestigio</dt><dd>${fmt(prestigioOf(d, i, g.player).totale)}</dd></div>
      ${famiglia(g)}
    </dl><p class="hint">${trono}</p>
    ${button && d.persone ? '<button data-act="casata" class="casata-btn">La casata: nozze e famiglia</button>' : ''}</div>`;
}

/** Consorte e figli nel riquadro. */
function famiglia(g: Game): string {
  const d = g.state.dinastia!, i = g.state.current;
  if (!d.persone) return '';
  const s = signoreP(d, i), m = nozzeDi(d, s.id), figli = figliDi(d, i);
  const cons = m ? esc(nomeConsorte(d, m, s.id)) + (m.con.k === 'fazione' ? ` (${INFO[m.con.f].name})` : '') : s.gender === 1 ? 'nessuna' : 'nessuno';
  const fig = figli.length ? `${figli.filter(x => x.gender === 1).length} figli e ${figli.filter(x => x.gender === 6).length} figlie` : 'nessuno';
  return `<div><dt>Consorte</dt><dd>${cons}</dd></div><div><dt>Figli</dt><dd>${fig}</dd></div>`;
}

const CAUSA_BREVE: Record<CausaMorte, string> = { vecchiaia: 'vecchiaia', malattia: 'malattia', battaglia: 'battaglia', rivolta: 'rivolta', congiura: 'congiura' };

function albero(d: DinastiaState, i: number, p: Player): string {
  return d.casate[i].generazioni.map((x, k, all) => {
    const last = k === all.length - 1;
    const end = x.al !== undefined ? `${900 + x.dal}–${900 + x.al}, ${CAUSA_BREVE[x.morte!]}` : p.caduto !== undefined ? `${900 + x.dal}–${900 + p.caduto}, fuori dalla partita` : `dal ${900 + x.dal}`;
    const rango = last && p.caduto === undefined ? Math.max(x.rango, rankOf(p)) : x.rango;
    const gender = x.persona !== undefined && d.persone ? personaOf(d, x.persona).gender : p.gender;
    return `<li>${esc(nomeCompleto(x))}, ${titleName(rango + gender - 1)}${x.re ? `, ${gender === 1 ? 're' : 'regina'} d'Italia` : ''}${x.reggenza !== undefined ? ', sotto reggenza da bambino' : ''} <small>(${end})</small></li>`;
  }).join('');
}

/** Fine della partita nel 962: la classifica delle casate. */
export function renderDinastiaEnd(g: Game, winner: number): string {
  const st = g.state, d = st.dinastia!;
  const rows = st.players.map((p, i) => ({ i, p, pr: prestigioOf(d, i, p) })).sort((a, b) => b.pr.totale - a.pr.totale);
  const w = st.players[winner];
  const head = g.year >= d.fine
    ? `<h1>Anno ${d.fine}: la casata di ${esc(d.casate[winner].fondatore)} da ${FEUDI[w.feudo]} è la più illustre del regno</h1>
       <p>Il 2 febbraio Ottone di Sassonia è incoronato imperatore a Roma, e il Regno d'Italia passa all'Impero.</p>`
    : `<h1>La casata di ${esc(d.casate[winner].fondatore)} da ${FEUDI[w.feudo]} resta la più illustre del regno</h1><p>Anno ${g.year}: non restano rivali in gioco.</p>`;
  const items = rows.map(({ i, p, pr }) => `<li><b>Casata di ${esc(d.casate[i].fondatore)} da ${FEUDI[p.feudo]}</b>: ${fmt(pr.totale)} di prestigio
      <small>(titoli ${fmt(pr.titoli)}, corone ${fmt(pr.corone)}, nozze ${pr.nozze < 0 ? '−' : ''}${fmt(pr.nozze)}, ricchezza ${fmt(pr.ricchezza)})</small>
      <ol class="genealogy">${albero(d, i, p)}</ol></li>`).join('');
  return `<section class="card end">${head}
    <ol class="standings">${items}</ol>
    <p class="hint">Prestigio: per ogni generazione ${PRESTIGIO_RANGO.slice(1).map((v, k) => `${titleName(k + 2)} ${v}`).join(', ')}; ogni corona ${PRESTIGIO_RE}; i matrimoni illustri e i ripudi; la ricchezza dell'ultimo signore in gioco conta con la radice quadrata.</p>
    <button data-act="new" class="primary">Nuova partita</button></section>`;
}

/** Frasi del libro delle cronache. */
export function dinastiaSentences(facts: ChronicleFact[], p: Player, players: Player[] = []): string[] {
  const out: string[] = [];
  const casa = (j?: number) => (j !== undefined && players[j] ? `${esc(players[j].name)} da ${FEUDI[players[j].feudo]}` : '');
  for (const f of facts) {
    if (f.t === 'famiglia') {
      const dote = f.dote ? (f.dote > 0 ? `, con una dote di ${fmt(f.dote)} scudi` : `, pagando una dote di ${fmt(-f.dote)} scudi`) : '';
      switch (f.k) {
        case 'nascita': out.push(`Nacque ${f.gender === 1 ? 'un figlio' : 'una figlia'}, che fu chiamat${f.gender === 1 ? 'o' : 'a'} ${esc(f.chi)}.`); break;
        case 'lutto': out.push(`La casa fu in lutto: morì ${f.rel === 'consorte' ? 'il consorte' : f.rel === 'figlia' ? 'la figlia' : 'il figlio'} ${esc(f.chi)}.`); break;
        case 'nozze': out.push(`Si celebrarono le nozze di ${esc(f.chi)} con ${esc(f.con ?? '')}${f.fazione ? `, di ${INFO[f.fazione].the}` : f.casa !== undefined ? `, della casata di ${casa(f.casa)}` : ', della nobiltà del luogo'}${dote}.`); break;
        case 'rifiuto': out.push(`${casa(f.casa)} rifiutò le nozze fra ${esc(f.chi)} e ${esc(f.con ?? '')}.`); break;
        case 'ripudio': out.push(`${esc(f.chi)} ripudiò ${esc(f.con ?? '')}${f.fazione ? `: ${INFO[f.fazione].the} giurarono vendetta` : f.casa !== undefined ? `, e la casata di ${casa(f.casa)} se ne tenne offesa` : ''}.`); break;
        case 'ripudiato': out.push(`${esc(f.con ?? '')} ripudiò ${esc(f.chi)}, che tornò nella casa paterna: un'offesa che la casata di ${casa(f.casa)} pagherà.`); break;
        case 'trasferimento': out.push(`${esc(f.chi)} lasciò ${FEUDI[f.da ?? 0]} ai fratelli e portò la sua sede a ${FEUDI[f.citta ?? 0]}, con il tesoro della casata.`); break;
        case 'reggenza': out.push(`${esc(f.chi)} era ancora in tenera età, e in suo nome governò un consiglio di reggenza.`); break;
      }
      continue;
    }
    if (f.t === 'successione') {
      out.push(`In quell'anno ${esc(f.morto)} ${morte(f.causa, f.gender ?? p.gender)}, a ${f.eta} anni, dopo ${f.anni} di regno, e il feudo passò ${f.rel === 'nipote' ? 'a un parente' : `a ${f.rel === 'figlia' ? 'sua figlia' : 'suo figlio'}`}, ${esc(f.erede)}.`);
      if (f.cadetti) out.push(`${f.cadetti === 1 ? 'Il fratello minore ebbe' : `I ${f.cadetti} fratelli minori ebbero`} la loro parte: ${fmt(f.scudi)} scudi e ${fmt(f.acri)} acri.`);
      if (f.corona) out.push(`Con ${p.gender === 1 ? 'lui moriva un re' : 'lei moriva una regina'}: il trono d'Italia restò vacante.`);
    }
    if (f.t === 'corona') {
      const voti = f.voti && f.voti.length > 1 ? ` con ${f.voti.find(([c]) => players[c] === p)?.[1] ?? 0} voti contro ${f.voti.filter(([c]) => players[c] !== p).map(([c, v]) => `${v} di ${esc(players[c]?.name ?? '')}`).join(', ')}` : '';
      out.push(`I grandi del regno, riuniti a Pavia, elessero ${esc(p.name)} ${p.gender === 1 ? 're' : 'regina'} d'Italia${voti}.`);
    }
  }
  return out;
}
