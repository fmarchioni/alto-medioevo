/**
 * Pannello "La casata" della Dinastia (src/domain/famiglia.ts): la famiglia
 * del signore, le nozze da combinare, i matrimoni da sciogliere, l'appoggio
 * all'elezione del re, e le proposte di nozze ricevute da un altro giocatore.
 */
import {
  CASUS_ANNI, dimora, doteCasata, etaP, ETA_NOZZE, fazioniSposabili, figliDi, nomeConsorte, nozzeDi, NOZZE_FAZIONE, personaOf, PRESTIGIO_RIPUDIO, pretendenti,
  proposteA, REGGENZA_QUOTA, ripudiabili, signoreP, sposabili, type Matrimonio, type Persona, type Sposo,
} from '../domain/famiglia';
import { inReggenza, signoreOf } from '../domain/dinastia';
import { RIVALI, type FactionId } from '../domain/fazioni';
import { FEUDI } from '../domain/rank';
import type { Game } from '../domain/turn';
import { INFO } from './fazioni';

export interface CasataUi {
  /** chiave del turno: il pannello si chiude al turno seguente */
  key: string;
  open: boolean;
  /** membro per cui si cercano nozze */
  membro?: number;
  /** matrimonio da ripudiare, in attesa di conferma */
  ripudio?: number;
  say?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const fmt = (v: number) => Math.round(Math.abs(v)).toLocaleString('it-IT');
const house = (g: Game, j: number) => `${esc(g.state.players[j].name)} da ${FEUDI[g.state.players[j].feudo]}`;

/** Con chi è sposato un membro della casata, in parole. */
function conChi(g: Game, x: Persona, m: Matrimonio): string {
  const d = g.state.dinastia!, nome = esc(nomeConsorte(d, m, x.id));
  if (m.con.k === 'fazione') return `${nome}, ${NOZZE_FAZIONE[m.con.f]!.casata}`;
  if (m.con.k === 'locale') return `${nome}, della nobiltà del luogo`;
  const other = m.a === x.id ? personaOf(d, m.con.id) : personaOf(d, m.a);
  return `${nome}, della casata di ${house(g, other.casa)}`;
}

function statoDi(g: Game, x: Persona): string {
  const d = g.state.dinastia!, q = g.state.q, me = g.state.current;
  const m = nozzeDi(d, x.id);
  if (m) {
    const where = dimora(d, x);
    const away = where !== me ? (where < 0 ? ' (vive presso la famiglia del consorte)' : ` (vive presso ${house(g, where)})`) : '';
    return `${x.gender === 1 ? 'sposato' : 'sposata'} con ${conChi(g, x, m)}${away}`;
  }
  if (etaP(x, q) < ETA_NOZZE) return etaP(x, q) < 5 ? 'in fasce' : 'fanciull' + (x.gender === 1 ? 'o' : 'a');
  return 'da sposare';
}

const doteText = (v: number) => (v > 0 ? `ricevete ${fmt(v)} scudi di dote` : v < 0 ? `pagate ${fmt(v)} scudi di dote` : 'nessuna dote');

function effetto(g: Game, con: Sposo): string {
  if (con.k === 'locale') return 'nessun legame';
  if (con.k === 'casata') return `le casate diventano parenti: niente tributi fra voi e appoggio all'elezione del re${g.state.expansion === 'spade-castelli' ? ', ma niente guerra fra voi' : ''}`;
  const rivali = (RIVALI[con.f] ?? []).map(r => INFO[r].the);
  return `${INFO[con.f].the} non vi attaccheranno più${rivali.length ? `, ma ${rivali.join(' e ')} verranno più spesso` : ''}`;
}

function scelte(g: Game, x: Persona): string {
  const st = g.state, d = st.dinastia!, q = st.q;
  const btn = (con: Sposo, label: string) => {
    const block = g.nozzeBlock(x.id, con);
    const v = JSON.stringify(con).replace(/"/g, '&quot;');
    return `<li><button data-act="din" data-op="sposa" data-membro="${x.id}" data-con="${v}" ${block ? 'disabled' : ''}>${label}</button>
      <small>${block ? esc(block) : `${doteText(g.doteNozze(x.id, con))}; ${effetto(g, con)}.`}</small></li>`;
  };
  const houses = pretendenti(st, d, st.current, x).map(z =>
    btn({ k: 'casata', id: z.p.id }, `${esc(z.p.nome)}, ${etaP(z.p, q)} anni, ${z.p.id === signoreP(d, z.casa).id ? (z.p.gender === 1 ? 'signore' : 'signora') : z.p.gender === 1 ? 'figlio' : 'figlia'} di ${house(g, z.casa)}`));
  const facs = (Object.keys(NOZZE_FAZIONE) as FactionId[]).map(f => {
    const ok = fazioniSposabili(st.players[st.current]).includes(f);
    return ok ? btn({ k: 'fazione', f }, `${x.gender === 1 ? 'Una sposa' : 'Uno sposo'} ${NOZZE_FAZIONE[f]!.casata} (${INFO[f].name})`)
      : `<li><button disabled>${INFO[f].name}</button> <small>serve il rango di ${NOZZE_FAZIONE[f]!.rango === 2 ? 'conte' : 'duca'}</small></li>`;
  });
  return `<h3>Nozze per ${esc(x.nome)}</h3>
    <ul class="nozze-list">${houses.join('') || '<li><small>Nessun figlio o figlia da sposare nelle altre casate, per ora.</small></li>'}${facs.join('')}
      ${btn({ k: 'locale' }, `${x.gender === 1 ? 'Una sposa' : 'Uno sposo'} della nobiltà del luogo`)}</ul>
    <p class="hint">Con un'altra casata è una proposta: il computer risponde subito, un giocatore nel suo turno. La sposa va a vivere nella casa dello sposo, e la sua famiglia paga la dote.</p>
    <div class="btns"><button data-act="din" data-op="membro">Torna alla casata</button></div>`;
}

function ripudioConfirm(g: Game, m: Matrimonio): string {
  const d = g.state.dinastia!, me = g.state.current;
  const x = [m.a, m.con.k === 'casata' ? m.con.id : -1].filter(id => id >= 0).map(id => personaOf(d, id)).find(p => p.casa === me)!;
  const offeso = m.con.k === 'casata' ? house(g, [personaOf(d, m.a), personaOf(d, m.con.id)].find(p => p.casa !== me)!.casa) : null;
  const consequence = offeso
    ? `${offeso} avrà un casus belli contro di voi per ${CASUS_ANNI} anni: non vi voterà, non vorrà nozze con voi${g.state.expansion === 'spade-castelli' ? ' e cercherà vendetta in guerra' : ''}.`
    : m.con.k === 'fazione' ? `${INFO[m.con.f].the} si vendicheranno: per ${CASUS_ANNI - 1} anni attaccheranno molto più spesso.` : '';
  return `<div class="ripudio-box"><p><b>Ripudiare ${esc(nomeConsorte(d, m, x.id))}?</b> La dote di ${fmt(m.dote)} scudi torna a chi l'ha pagata, la casata perde ${PRESTIGIO_RIPUDIO} di prestigio. ${consequence}</p>
    <div class="btns"><button data-act="din" data-op="ripudioNo">Annulla</button><button data-act="din" data-op="ripudioSi" data-m="${m.id}" class="primary">Confermo il ripudio</button></div></div>`;
}

/** Il pannello, al posto della Delibera o dei dispendimenti. */
export function renderCasata(g: Game, ui: CasataUi): string {
  const st = g.state, d = st.dinastia!, me = st.current, q = st.q, s = signoreP(d, me);
  const say = ui.say ? `<p class="msg">${esc(ui.say)}</p>` : '';
  if (ui.membro !== undefined) {
    const x = sposabili(d, me, q).find(y => y.id === ui.membro);
    if (x) return `<h2>La casata</h2>${say}${scelte(g, x)}`;
  }
  const heir = figliDi(d, me).find(x => dimora(d, x) === me && x.gender === s.gender) ?? figliDi(d, me).find(x => dimora(d, x) === me);
  const row = (x: Persona, rel: string) => `<tr><td>${esc(x.nome)}${heir?.id === x.id ? ' <small class="erede">erede</small>' : ''}</td><td>${rel}</td><td>${etaP(x, q)}</td><td>${statoDi(g, x)}</td></tr>`;
  const fam = [row(s, 'voi'), ...figliDi(d, me).map(x => row(x, x.gender === 1 ? 'figlio' : 'figlia'))].join('');
  const reg = inReggenza(d, me, q) ? `<p class="hint">Regnate sotto reggenza fino al ${900 + signoreOf(d, me).reggenza!}: il consiglio trattiene il ${Math.round(REGGENZA_QUOTA * 100)}% della rendita.</p>` : '';
  const free = sposabili(d, me, q);
  const nozze = free.length
    ? `<ul class="nozze-list">${free.map(x => `<li><button data-act="din" data-op="membro" data-membro="${x.id}">Cercate nozze per ${esc(x.nome)}</button> <small>${etaP(x, q)} anni</small></li>`).join('')}</ul>`
    : `<p class="hint">Nessuno da sposare: i figli si sposano dai ${ETA_NOZZE} anni.</p>`;
  const rip = ripudiabili(d, me);
  const ripList = ui.ripudio !== undefined && rip.some(m => m.id === ui.ripudio)
    ? ripudioConfirm(g, rip.find(m => m.id === ui.ripudio)!)
    : rip.length ? `<ul class="nozze-list">${rip.map(m => {
        const x = [m.a, m.con.k === 'casata' ? m.con.id : -1].filter(id => id >= 0).map(id => personaOf(d, id)).find(p => p.casa === me)!;
        return `<li><button data-act="din" data-op="ripudio" data-m="${m.id}">Ripudia</button> <small>${esc(x.nome)} e ${conChi(g, x, m)}</small></li>`;
      }).join('')}</ul>` : '<p class="hint">Nessun matrimonio da sciogliere.</p>';
  const pending = (d.proposte ?? []).filter(x => x.da === me).map(x => `<li><small>${esc(personaOf(d, x.mio).nome)} e ${esc(personaOf(d, x.suo).nome)}: attende la risposta di ${house(g, x.a)}</small></li>`).join('');
  const others = st.players.map((p, j) => ({ p, j })).filter(({ p, j }) => j !== me && p.caduto === undefined);
  const app = d.casate[me].appoggio;
  const vote = others.length ? `<h3>Elezione del re</h3>
    <p class="hint">Con il trono vacante votano tutti i signori, ciascuno con tanti voti quanto il suo rango. Se siete candidati votate per voi; altrimenti per chi appoggiate, se è candidato; se no per un parente, o per il più ricco.</p>
    <label>Appoggiate <select name="appoggio"><option value="">nessuno in particolare</option>${others.map(({ j }) => `<option value="${j}" ${app === j ? 'selected' : ''}>${house(g, j)}</option>`).join('')}</select></label>
    <button data-act="din" data-op="appoggio">Conferma</button>` : '';
  return `<h2>La casata</h2>${say}
    <table class="ext-table famiglia"><thead><tr><th>Nome</th><th></th><th>Età</th><th>Stato</th></tr></thead><tbody>${fam}</tbody></table>${reg}
    <h3>Nozze</h3>${nozze}${pending ? `<ul class="nozze-list">${pending}</ul>` : ''}
    <h3>Matrimoni da sciogliere</h3>${ripList}
    ${vote}
    <div class="btns"><button data-act="casata" data-close="1" class="primary">Chiudi</button></div>`;
}

/** Proposta di nozze ricevuta da un altro giocatore: si risponde all'inizio del turno. */
export function nozzeDecision(g: Game): { title: string; body: string; options: { label: string; op: string; target?: number; primary?: boolean; act?: string }[] } | null {
  const d = g.state.dinastia;
  if (!d?.persone || g.state.phase.kind !== 'commercio') return null;
  const x = proposteA(d, g.state.current)[0];
  if (!x) return null;
  const mio = personaOf(d, x.mio), suo = personaOf(d, x.suo), q = g.state.q;
  // la dote la paga la famiglia della sposa: positiva se la ricevete voi
  const dote = suo.gender === 6 ? -doteCasata(g.state, g.state.current) : doteCasata(g.state, x.da);
  return {
    title: 'Proposta di nozze',
    body: `${house(g, x.da)} chiede le nozze fra ${esc(mio.nome)} (${etaP(mio, q)} anni) e il vostro ${suo.gender === 1 ? 'figlio' : 'figlia'} ${esc(suo.nome)} (${etaP(suo, q)} anni). Le casate diventerebbero parenti: niente tributi fra voi, appoggio all'elezione del re${g.state.expansion === 'spade-castelli' ? ', niente guerra fra voi' : ''}. ${doteText(dote)}.`,
    options: [
      { label: 'Rifiutate', op: 'nozzeNo', target: x.id, act: 'din' },
      { label: 'Acconsentite', op: 'nozzeSi', target: x.id, primary: true, act: 'din' },
    ],
  };
}
