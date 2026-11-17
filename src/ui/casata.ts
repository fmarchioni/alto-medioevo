/**
 * Pannello "La casata" della Dinastia (src/domain/famiglia.ts): la famiglia
 * del signore, le nozze da combinare, i matrimoni da sciogliere, l'appoggio
 * all'elezione del re, e le proposte di nozze ricevute da un altro giocatore.
 */
import {
  CASUS_ANNI, doteCasata, erede, etaP, ETA_MAGGIORE, ETA_NOZZE, fazioniSposabili, nomeConsorte, NOZZE_FAZIONE, personaOf, PRESTIGIO_RIPUDIO, pretendenti,
  proposteA, REGGENZA_QUOTA, ripudiabili, signoreP, sposabili, type Matrimonio, type Persona, type Sposo,
} from '../domain/famiglia';
import {
  APPANNAGGIO, casaMadre, congiurati, eleggibili, inReggenza, nomeCompleto, pesoVoto, RANGO_ELEGGIBILE, ramiDi, rischioCongiuraFratelli, signoreOf, TESTAMENTO_BONUS, votiTestamento, type Generazione,
} from '../domain/dinastia';
import { rankOf, THRONE_THRESHOLD, titleName } from '../domain/rank';
import { RIVALI, type FactionId } from '../domain/fazioni';
import { FEUDI } from '../domain/rank';
import type { Game } from '../domain/turn';
import { INFO } from './fazioni';
import { prestitiSection } from './prestiti';
import { voltoPersona, voltoSrc } from './volti';

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
    <div class="btns"><button data-act="din" data-op="membro">Torna alla Dinastia</button></div>`;
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

// ---------------------------------------------------------------- albero genealogico

/** Tutti i matrimoni di una persona, anche quelli finiti (per morte o ripudio). */
const matrimoniDi = (g: Game, id: number) => (g.state.dinastia!.matrimoni ?? []).filter(m => m.a === id || (m.con.k === 'casata' && m.con.id === id));

/** Il medaglione di una persona: il suo volto dipinto, che cresce con gli anni (grigio se è morta). */
const medaglione = (x: Persona, morto: boolean, q: number) =>
  `<img class="gen-volto ${x.gender === 1 ? 'm' : 'f'}${morto ? ' morto' : ''}" data-persona="${x.id}" src="${voltoPersona(x, q)}" alt="" width="48" height="48">`;

/**
 * I coniugi di x, accanto al suo volto: tutti i matrimoni, anche quelli finiti. Chi è morto o è stato
 * ripudiato resta in grigio, con l'anno. Il coniuge forestiero (fazione o nobiltà del luogo) ha un volto
 * adulto fisso, scelto dal matrimonio.
 */
function coniugi(g: Game, x: Persona): { volti: string; nomi: string } {
  const d = g.state.dinastia!, q = g.state.q;
  const ms = matrimoniDi(g, x.id);
  const items = ms.map(m => {
    const altro = m.a === x.id ? (m.con.k === 'casata' ? personaOf(d, m.con.id) : null) : personaOf(d, m.a);
    const nome = esc(nomeConsorte(d, m, x.id)), g6 = (altro?.gender ?? (x.gender === 1 ? 6 : 1)) === 6;
    // il matrimonio è finito per la morte di x: il coniuge resta com'era
    const perX = m.motivo === 'morte' && x.morto === m.fine;
    const nota = m.fine === undefined || perX ? '' : m.motivo === 'ripudio' ? `ripudiat${g6 ? 'a' : 'o'} nel ${900 + m.fine}` : `† ${900 + m.fine}`;
    const spento = !!nota || (altro?.morto !== undefined && !perX);
    const src = altro ? voltoPersona(altro, q) : voltoSrc(g6 ? 6 : 1, Math.max(18, etaP(x, m.fine ?? x.morto ?? q)), m.id);
    const tip = `${nome}${nota ? `, ${nota}` : ''}`;
    return {
      volto: `<img class="gen-volto sposo${spento ? ' morto' : ''}" src="${src}" alt="" title="${tip}" width="34" height="34">`,
      nome,
    };
  });
  return { volti: items.map(i => i.volto).join(''), nomi: items.map(i => i.nome).join(', poi ') };
}

/**
 * L'albero della casata dall'alto in basso: il fondatore in cima, sotto ogni generazione i figli, con i
 * coniugi accanto a ciascuno. Chi ha ereditato da nipote (il signore morto senza figli) sta sotto il signore
 * a cui è succeduto; i rami cadetti nati dalla casata compaiono sotto il loro fondatore, con la città.
 */
export function alberoGenealogico(g: Game, casa = g.state.current): string {
  const st = g.state, d = st.dinastia!, q = st.q;
  // chi ha regnato, e su quale casata
  const regno = new Map<number, { casa: number; gen: Generazione }>();
  d.casate.forEach((c, j) => c.generazioni.forEach(gen => gen.persona !== undefined && regno.set(gen.persona, { casa: j, gen })));
  const signore = signoreP(d, casa);
  // nipoti eredi: sotto il signore che li ha preceduti
  const nipotiDi = new Map<number, Persona[]>();
  d.casate.forEach(c => c.generazioni.forEach((gen, k) => {
    if (k === 0 || gen.persona === undefined) return;
    const x = personaOf(d, gen.persona), prima = c.generazioni[k - 1].persona;
    if (x.genitore === undefined && prima !== undefined) nipotiDi.set(prima, [...(nipotiDi.get(prima) ?? []), x]);
  }));
  // nel riquadro solo il nome, gli anni ("895–" da vivo, "895–937" da morto) e i coniugi
  const nodo = (x: Persona, nipote = false): string => {
    const morto = x.morto !== undefined, r = regno.get(x.id), voi = x.id === signore.id;
    const anni = `${900 + x.nato}–${morto ? 900 + x.morto! : ''}`;
    const nome = r ? nomeCompleto(r.gen) : x.nome;
    const sp = coniugi(g, x);
    const figli = [...(d.persone ?? []).filter(y => y.genitore === x.id).sort((a, b) => a.nato - b.nato || a.id - b.id).map(y => nodo(y)),
      ...(nipotiDi.get(x.id) ?? []).map(y => nodo(y, true))];
    // chi è morto senza figli né nozze (spesso un bambino) ha un riquadro piccolo
    if (morto && !figli.length && !r && !sp.nomi) return `<li><div class="gen-nodo breve morto">${medaglione(x, morto, q)}<span class="gen-testo"><b>${esc(nome)}</b> <small>${anni}</small></span></div></li>`;
    return `<li${nipote ? ' class="nipote"' : ''}><div class="gen-nodo${voi ? ' voi' : ''}${morto ? ' morto' : ''}">
      <div class="gen-volti">${medaglione(x, morto, q)}${sp.volti}</div>
      <span class="gen-testo"><b>${esc(nome)}</b> <small>${anni}</small>${sp.nomi ? `<br><small>${x.gender === 1 ? 'sposo' : 'sposa'} di ${sp.nomi}</small>` : ''}</span></div>
      ${figli.length ? `<ul>${figli.join('')}</ul>` : ''}</li>`;
  };
  const fondatore = d.casate[casa].generazioni[0].persona;
  if (fondatore === undefined) return '';
  const madre = casaMadre(d, casa), rami = ramiDi(d, casa);
  const legami = [
    madre !== null ? `Siete un ramo cadetto della casata di ${esc(d.casate[madre].fondatore)} (${house(g, madre)}): finché il vincolo tiene, il vostro prestigio va alla casata madre.` : '',
    rami.length ? `Rami cadetti legati a voi: ${rami.map(j => house(g, j)).join(', ')}. Il loro prestigio si somma al vostro finché il vincolo tiene.` : '',
  ].filter(Boolean).map(t => `<p class="hint">${t}</p>`).join('');
  return `<div class="genealogia-wrap"><ul class="genealogia">${nodo(personaOf(d, fondatore))}</ul></div>${legami}`;
}

/**
 * La corona d'Italia nel pannello della casata: con il trono vacante, cosa serve per il primo re; il re fa testamento e tiene
 * buoni i fratelli del suo erede; gli altri scelgono per chi votare alla morte del re.
 */
function coronaSection(g: Game): string {
  const st = g.state, d = st.dinastia!, me = st.current, q = st.q, re = d.re;
  if (re === null) return `<h3>La corona d'Italia</h3><p class="hint">Il trono è vacante: a fine anno sale al trono chi ha oltre ${THRONE_THRESHOLD.toLocaleString('it-IT')} di ricchezza e il palazzo completo (se sono più d'uno, il più ricco). Alla sua morte i grandi voteranno il successore.</p>`;
  const altri = eleggibili(st, re).filter(j => j !== re && j !== me);
  if (re === me) {
    const sig = signoreOf(d, me), x = d.persone && sig.persona !== undefined ? personaOf(d, sig.persona) : null;
    const er = x && d.persone ? erede(d, me, x.gender) : null;
    const legittimo = er ? `il vostro erede legittimo, ${esc(er.nome)} (${etaP(er, q)} anni)` : 'il vostro erede legittimo';
    const t = d.testamento;
    const stato = t === undefined
      ? `Non avete fatto testamento: alla vostra morte la vostra casata non voterà, e il vostro erede concorrerà come gli altri.`
      : `Il vostro testamento indica ${t === me ? legittimo : house(g, t)}: alla vostra morte vale ${votiTestamento(rankOf(g.player))} voti.`;
    const opts = [`<option value="">nessun testamento</option>`, `<option value="${me}" ${t === me ? 'selected' : ''}>${legittimo}</option>`,
      ...altri.map(j => `<option value="${j}" ${t === j ? 'selected' : ''}>${house(g, j)}</option>`)].join('');
    const cong = congiurati(d, me, q);
    const bambino = !!er && etaP(er, q) < ETA_MAGGIORE;
    const malumori = cong.length ? `<p class="hint">Malumori a corte: alla vostra morte ${cong.length === 1 ? 'potrebbe tramare' : 'potrebbero tramare'} contro l'erede (rischio ${Math.round(rischioCongiuraFratelli(cong.length, bambino) * 100)}%). Le nozze o un appannaggio di ${APPANNAGGIO.toLocaleString('it-IT')} scudi li tengono buoni.</p>
      <ul class="nozze-list">${cong.map(y => `<li><button data-act="din" data-op="appannaggio" data-id="${y.id}" ${g.player.scudi < APPANNAGGIO ? 'disabled' : ''}>Appannaggio</button> <small>${esc(y.nome)}, ${etaP(y, q)} anni</small></li>`).join('')}</ul>` : '';
    return `<h3>Il testamento del re</h3>
      <p class="hint">Alla vostra morte i grandi votano il successore: il vostro erede o un signore di rango almeno ${titleName(RANGO_ELEGGIBILE)}. Ciascuno vota con il suo rango, il vostro testamento con ${TESTAMENTO_BONUS} voti in più.</p>
      <p>${stato}</p>
      <label>Successore <select name="testamento">${opts}</select></label>
      <button data-act="din" data-op="testamento">Conferma</button>${malumori}`;
  }
  const app = d.casate[me].appoggio;
  const opts = [`<option value="">decidete secondo i legami</option>`, `<option value="${re}" ${app === re ? 'selected' : ''}>l'erede legittimo di ${house(g, re)}</option>`,
    ...altri.map(j => `<option value="${j}" ${app === j ? 'selected' : ''}>${house(g, j)}</option>`)].join('');
  const voi = rankOf(g.player) >= RANGO_ELEGGIBILE ? 'Anche voi potete essere eletti.' : `Per essere eletti serve il rango di ${titleName(RANGO_ELEGGIBILE)}.`;
  return `<h3>Alla morte del re</h3>
    <p class="hint">Re d'Italia è ${house(g, re)}. Alla sua morte i grandi votano il successore: il suo erede legittimo o un signore di rango almeno ${titleName(RANGO_ELEGGIBILE)}, mai sé stessi. Votate con ${pesoVoto(d, me, g.player)} ${pesoVoto(d, me, g.player) === 1 ? 'voto' : 'voti'}, ${casaMadre(d, me) !== null ? 'metà del vostro rango, come ramo cadetto' : 'quanto il vostro rango'}. Chi non ha legami con il re vota di solito lo sfidante più illustre. ${voi}</p>
    <label>Votate per <select name="appoggio">${opts}</select></label>
    <button data-act="din" data-op="appoggio">Conferma</button>`;
}

/** Il pannello, al posto della Delibera o dei dispendimenti. */
export function renderCasata(g: Game, ui: CasataUi): string {
  const st = g.state, d = st.dinastia!, me = st.current, q = st.q;
  const say = ui.say ? `<p class="msg">${esc(ui.say)}</p>` : '';
  if (ui.membro !== undefined) {
    const x = sposabili(d, me, q).find(y => y.id === ui.membro);
    if (x) return `<h2>La Dinastia</h2>${say}${scelte(g, x)}`;
  }
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
  const vote = coronaSection(g);
  return `<h2>La Dinastia</h2>${say}
    <h3>L'albero della casata</h3>${alberoGenealogico(g)}${reg}
    <h3>Accasare figli e figlie</h3>${nozze}${pending ? `<ul class="nozze-list">${pending}</ul>` : ''}
    <h3>Ripudio</h3>${ripList}
    ${prestitiSection(g)}
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
