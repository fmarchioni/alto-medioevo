/**
 * Viste della Dinastia (src/domain/dinastia.ts): obiettivo nella schermata
 * iniziale, morte e successione, riquadro della casata, classifica finale e
 * frasi per il libro delle cronache.
 */
import {
  ANNO_FINE, casatePrincipali, cittaRamo, MAX_CITTA, postoPerRamo, etaOf, nomeCompleto, prestigioCasata, prestigioOf, ramiDi, PRESTIGIO_RANGO, PRESTIGIO_RE, signoreOf, votiTestamento, type CausaMorte, type DinastiaState, type Successione,
} from '../domain/dinastia';
import { FEUDI, missingFloors, rankOf, titleName, victoryRule, wealthIndex } from '../domain/rank';
import type { Game } from '../domain/turn';
import type { ChronicleFact, Gender, Player } from '../domain/types';
import { faidaArt, scenaFigure } from './investiture';
import { figliDi, nomeConsorte, nozzeDi, personaOf, signoreP } from '../domain/famiglia';
import { INFO } from './fazioni';
import { quantoBene } from '../domain/prestiti';
import { miniatureUrl } from './citta/assets';

export type Obiettivo = 'regno' | 'dinastia';

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const fmt = (v: number) => Math.round(v).toLocaleString('it-IT');
const oa = (g: Gender) => (g === 1 ? 'o' : 'a');

/** Pannello in fondo alla schermata iniziale: la partita finisce sul trono o nel 962. */
export function renderObiettivi(selected: Obiettivo): string {
  const tile = (id: Obiettivo, mini: string, title: string, motto: string) =>
    `<button type="button" class="exp-tile goal-tile" data-act="obiettivo" data-id="${id}" aria-pressed="${selected === id}">
      <img class="exp-mini dipinta" src="${miniatureUrl(mini)}" alt="miniatura: ${title}"><span class="exp-name">${title}</span><span class="exp-motto">${motto}</span></button>`;
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
      ${tile('regno', 'incoronazione', 'Regno', 'Diventare re: la partita finisce sul trono.')}
      ${tile('dinastia', 'casata', 'Dinastia', `Generazioni di signori fino al ${ANNO_FINE}.`)}
    </div>${rules}</fieldset>`;
}

const MORTE: Record<CausaMorte, (g: Gender) => string> = {
  vecchiaia: g => `si è spent${oa(g)} nel sonno, caric${oa(g)} d'anni`,
  malattia: () => 'è stato portato via in pochi giorni da una febbre maligna',
  battaglia: () => 'è morto per le ferite riportate in battaglia',
  rivolta: () => 'è caduto negli scontri della rivolta',
  congiura: () => 'è stato avvelenato in una congiura di palazzo: il popolo scontento ha trovato chi armasse la mano',
  faida: () => "è morto all'improvviso, in strane circostanze",
};
/** "è stato" → "è stata" per una signora */
const morte = (c: CausaMorte, g: Gender) => (g === 1 ? MORTE[c](g) : MORTE[c](g).replace(/stato/g, 'stata').replace(/morto/g, 'morta').replace(/caduto/g, 'caduta'));

function ereditaText(s: Successione): string {
  const e = s.eredita;
  if (!e.cadetti) return "Non ci sono fratelli minori: l'eredità resta intera.";
  if (e.intera) return "L'eredità non si divide.";
  const parts = [e.scudi && `${fmt(e.scudi)} scudi`, e.grano && `${fmt(e.grano)} misure di grano`, e.acri && `${fmt(e.acri)} acri`, e.servi && `${fmt(e.servi)} servi`].filter(Boolean);
  const who = e.cadetti === 1 ? 'Il fratello minore prende' : `I ${e.cadetti} fratelli minori prendono`;
  return parts.length ? `${who} la sua parte dell'eredità: ${parts.join(', ')}.` : `${who} la sua parte, ma nel tesoro non c'è nulla da dividere.`;
}

/** Il ramo cadetto che nascerà all'inizio del regno: dove, e con che cosa. */
function ramoText(g: Game, s: Successione): string {
  const d = g.state.dinastia!;
  if (!d.persone || !s.eredita.cadetti) return '';
  if (s.eredita.intera) {
    return postoPerRamo(g.state)
      ? "<p>I fratelli sono ancora bambini: restano a corte, e l'eredità va tutta all'erede.</p>"
      : `<p><b>Le città del regno sono al completo</b> (${MAX_CITTA} signori in gioco): non c'è posto per un ramo cadetto, e l'eredità va tutta all'erede. I fratelli restano a corte a mani vuote, e chi resta escluso dal trono di famiglia può covare rancore.</p>`;
  }
  const citta = cittaRamo(g.state, g.state.current, s);
  if (citta === null) return '';
  return `<p><b>Nasce un ramo cadetto.</b> Con la parte dei fratelli il primo di loro si insedierà a ${FEUDI[citta]}${s.trasferito ? ", la città che l'erede lascia" : ''}, e regnerà come signore del computer. Lo lega a voi un vincolo: le due casate sono parenti, e il suo prestigio si somma al vostro.</p>`;
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

/** Successione del re: la notte della successione (se i fratelli hanno tramato) e il voto dei grandi. */
function coronaText(g: Game): string {
  const st = g.state, d = st.dinastia!, me = st.current;
  const fatti = (st.chronicle ?? []).filter(e => e.year === g.year && e.player === me).map(e => e.fact);
  const cong = fatti.find(f => f.t === 'famiglia' && (f.k === 'usurpazione' || f.k === 'esilio'));
  const fr = (gen?: number) => (gen === 6 ? 'la sorella' : 'il fratello');
  const notte = cong?.t !== 'famiglia' ? ''
    : cong.k === 'usurpazione'
      ? `<p>Nella notte della successione l'erede ${esc(cong.con ?? '')} è stato trovato morto. Al suo posto regna ${fr(cong.gender)} ${esc(cong.chi)}: a corte nessuno osa chiedere come, ma i grandi del regno non dimenticano.</p>`
      : `<p>Nella notte della successione ${fr(cong.gender)} ${esc(cong.chi)} ha tramato contro l'erede: la congiura è stata scoperta, e ${cong.gender === 6 ? 'la congiurata' : 'il congiurato'} è partit${cong.gender === 6 ? 'a' : 'o'} per l'esilio. Il regno si stringe intorno all'erede.</p>`;
  const re = d.re === null ? '' : d.re === me
    ? `<p>Portava la corona d'Italia: riuniti a Pavia, i grandi del regno l'hanno confermata all'erede, <b>${esc(g.player.name)}</b>.</p>`
    : `<p>Portava la corona d'Italia: riuniti a Pavia, i grandi del regno hanno preferito all'erede <b>${esc(st.players[d.re].name)}</b>, da ${FEUDI[st.players[d.re].feudo]}.</p>`;
  return notte + re;
}

/** Pagina della successione, prima del primo anno dell'erede. */
export function renderSuccessione(g: Game, s: Successione): string {
  const p = g.player, d = g.state.dinastia!, erede = signoreOf(d, g.state.current);
  const a = s.assassino, chi = a ? `${a.gender === 1 ? 'il fratello' : 'la sorella'} ${esc(a.nome)}` : '';
  // faida: il dipinto del fratello o della sorella che osserva la scena
  const scena = a ? { art: faidaArt(a.gender), caption: 'Morte improvvisa in strane circostanze' } : { art: 'morte-signore', caption: `La morte di ${s.morto}` };
  const testo = a
    ? `${esc(s.morto)} ${morte(s.causa, s.gender)}, a ${s.eta} anni, dopo ${s.anni} ${s.anni === 1 ? 'anno' : 'anni'} di regno. Il medico parla di un male improvviso; ma ${chi}, rimast${a.gender === 1 ? 'o' : 'a'} a mani vuote all'eredità, era lì e guardava la scena senza una lacrima.`
    : `${esc(s.morto)} ${morte(s.causa, s.gender)}, a ${s.eta} anni, dopo ${s.anni} ${s.anni === 1 ? 'anno' : 'anni'} di regno.`;
  const succede = s.rel === 'nipote' ? `${p.gender === 1 ? 'il nipote' : 'la nipote'}: non c'erano figli in casa`
    : s.rel === 'fratello' || s.rel === 'sorella' ? `proprio ${s.rel === 'fratello' ? 'il fratello' : 'la sorella'}: non c'erano figli in casa, e la faida ha il suo vincitore`
    : p.gender === 1 ? 'il figlio' : 'la figlia';
  return `<h2>${a ? 'Morte improvvisa in strane circostanze' : `Morte ${s.gender === 1 ? 'del signore' : 'della signora'}`}</h2>
    ${scenaFigure(scena, testo)}
    <p>${s.gender === 1 ? 'Gli' : 'Le'} succede ${succede} <b>${esc(s.erede)}</b>, di ${s.etaErede} anni.</p>
    ${s.reggenza !== undefined ? `<p>L'erede è un bambino: fino al ${900 + s.reggenza} governa un consiglio di reggenza, che trattiene parte della rendita.</p>` : ''}
    <p>${s.rel === 'nipote' && s.eredita.cadetti ? "Senza figli, i parenti si contendono l'eredità. " : ''}${ereditaText(s)}</p>
    ${ramoText(g, s)}
    ${s.corona ? coronaText(g) : ''}
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
    ? (d.testamento === undefined ? 'Alla vostra morte i grandi voteranno il successore, e non avete fatto testamento: la vostra casata non voterà.' : `Alla vostra morte i grandi voteranno il successore; il vostro testamento vale ${votiTestamento(rankOf(g.player))} voti.`)
    : d.re !== null
      ? "Alla morte del re i grandi voteranno il successore: il suo erede o un signore di rango almeno duca."
      : `A fine anno sale al trono il più ricco fra chi ha ricchezza oltre ${fmt(v.threshold)}${v.palazzo ? ' e il palazzo completo' : ''}. ${short.length ? `Vi mancano ${short.join(' e ')}.` : 'Voi avete le condizioni.'}`;
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
    ${button && d.persone ? '<button data-act="casata" class="casata-btn">La Dinastia: albero, nozze e ripudi</button>' : ''}</div>`;
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

const CAUSA_BREVE: Record<CausaMorte, string> = { vecchiaia: 'vecchiaia', malattia: 'malattia', battaglia: 'battaglia', rivolta: 'rivolta', congiura: 'congiura', faida: 'morte sospetta' };

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
  // i rami cadetti legati dal vincolo corrono con la casata madre: il loro prestigio si somma al suo
  const rows = casatePrincipali(d).map(i => ({ i, p: st.players[i], pr: prestigioCasata(st, d, i) })).sort((a, b) => b.pr.totale - a.pr.totale);
  const w = st.players[winner];
  const head = g.year >= d.fine
    ? `<h1>Anno ${d.fine}: la casata di ${esc(d.casate[winner].fondatore)} da ${FEUDI[w.feudo]} è la più illustre del regno</h1>
       <p>Il 2 febbraio Ottone di Sassonia è incoronato imperatore a Roma, e il Regno d'Italia passa all'Impero.</p>`
    : `<h1>La casata di ${esc(d.casate[winner].fondatore)} da ${FEUDI[w.feudo]} resta la più illustre del regno</h1><p>Anno ${g.year}: non restano rivali in gioco.</p>`;
  const items = rows.map(({ i, p, pr }) => `<li><b>Casata di ${esc(d.casate[i].fondatore)} da ${FEUDI[p.feudo]}</b>: ${fmt(pr.totale)} di prestigio
      <small>(titoli ${fmt(pr.titoli)}, corone ${fmt(pr.corone)}, nozze ${pr.nozze < 0 ? '−' : ''}${fmt(pr.nozze)}, ricchezza ${fmt(pr.ricchezza)})</small>
      <ol class="genealogy">${albero(d, i, p)}</ol>${ramiDi(d, i).map(j => `<p class="hint">Ramo cadetto di ${esc(d.casate[j].fondatore)} da ${FEUDI[st.players[j].feudo]}: ${fmt(prestigioOf(d, j, st.players[j]).totale)} di prestigio.</p>`).join('')}</li>`).join('');
  const gloria = scenaFigure({ art: 'casata', caption: 'La gloria della casata' }, `Nella sala grande l'albero della casata di ${esc(d.casate[winner].fondatore)} porta i volti di tutti i suoi signori.`);
  return `<section class="card end">${head}${gloria}
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
        case 'cadetto': out.push(`${f.gender === 6 ? 'La sorella' : 'Il fratello'} ${esc(f.chi)} ebbe la parte dei cadetti e fondò un ramo della casata a ${FEUDI[f.citta ?? 0]}, legato alla casa madre da un vincolo di fedeltà.`); break;
        case 'prestito': {
          const q = f.bene && f.qty ? quantoBene(f.bene, f.qty) : '';
          if (f.esito === 'concesso') out.push(`${casa(f.casa)} prestò alla casata ${q}, senza interesse, da rendere entro tre anni.`);
          else if (f.esito === 'prestato') out.push(`La casata prestò ${q} a ${casa(f.casa)}, senza interesse.`);
          else if (f.esito === 'negato') out.push(`${casa(f.casa)} negò alla casata un prestito di ${q}.`);
          else if (f.esito === 'reso') out.push(`La casata rese a ${casa(f.casa)} il prestito di ${q}, come pattuito.`);
          else if (f.esito === 'mancato') out.push(`Alla scadenza la casata non poté rendere a ${casa(f.casa)} il prestito di ${q}.`);
          break;
        }
        case 'vincolo': out.push(f.esito === 'offeso'
          ? `Si ruppe il vincolo con ${casa(f.casa)}: le casate non furono più parenti, e l'offesa restò da vendicare.`
          : `Si ruppe il vincolo con ${casa(f.casa)}: le casate non furono più parenti, e ${casa(f.casa)} se ne tenne offes${players[f.casa ?? 0]?.gender === 6 ? 'a' : 'o'}.`); break;
        case 'reggenza': out.push(`${esc(f.chi)} era ancora in tenera età, e in suo nome governò un consiglio di reggenza.`); break;
        case 'usurpazione': out.push(`Nella notte della successione ${esc(f.con ?? '')}, l'erede del re, fu trovato morto. Al suo posto regnò ${f.gender === 6 ? 'la sorella' : 'il fratello'} ${esc(f.chi)}, e nessuno osò chiedere come.`); break;
        case 'esilio': out.push(`${f.gender === 6 ? 'La sorella' : 'Il fratello'} dell'erede, ${esc(f.chi)}, tramò per prendergli il posto alla morte del re; la congiura fu scoperta, e ${f.gender === 6 ? 'la congiurata' : 'il congiurato'} lasciò la corte per l'esilio.`); break;
      }
      continue;
    }
    if (f.t === 'successione') {
      out.push(`In quell'anno ${esc(f.morto)} ${morte(f.causa, f.gender ?? p.gender)}, a ${f.eta} anni, dopo ${f.anni} di regno, e il feudo passò ${f.rel === 'nipote' ? 'a un parente' : f.rel === 'fratello' ? 'a suo fratello' : f.rel === 'sorella' ? 'a sua sorella' : `a ${f.rel === 'figlia' ? 'sua figlia' : 'suo figlio'}`}, ${esc(f.erede)}.`);
      if (f.assassino) out.push(`A corte si mormora ${f.ag === 6 ? 'della sorella' : 'del fratello'} ${esc(f.assassino)}, rimast${f.ag === 6 ? 'a' : 'o'} a mani vuote all'eredità, che guardava la scena senza una lacrima.`);
      if (f.cadetti) out.push(`${f.cadetti === 1 ? 'Il fratello minore ebbe' : `I ${f.cadetti} fratelli minori ebbero`} la loro parte: ${fmt(f.scudi)} scudi e ${fmt(f.acri)} acri.`);
      if (f.corona) out.push(`Con ${p.gender === 1 ? 'lui moriva un re' : 'lei moriva una regina'}: il trono d'Italia restò vacante.`);
    }
    if (f.t === 'corona') {
      const re = p.gender === 1 ? 're' : 'regina';
      if (f.casaRe === undefined) {
        out.push(`Nessuno in Italia era più ricco né più potente: ${esc(p.name)} fu incoronat${p.gender === 1 ? 'o' : 'a'} ${re} d'Italia con la Corona Ferrea, a Pavia.`);
        continue;
      }
      const altri = (f.voti ?? []).filter(([c, v]) => players[c] !== p && v > 0);
      const voti = ` con ${f.voti?.find(([c]) => players[c] === p)?.[1] ?? 0} voti${altri.length ? ` contro ${altri.map(([c, v]) => `${v} di ${esc(players[c]?.name ?? '')}`).join(', ')}` : ''}`;
      out.push(players[f.casaRe] === p
        ? `Morto il re, i grandi del regno, riuniti a Pavia, confermarono la corona all'erede: ${esc(p.name)} fu ${re} d'Italia${voti}.`
        : `Morto il re, i grandi del regno, riuniti a Pavia, preferirono all'erede ${esc(p.name)}, elett${p.gender === 1 ? 'o' : 'a'} ${re} d'Italia${voti}.`);
    }
  }
  return out;
}
