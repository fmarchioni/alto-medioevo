/**
 * Fase "Dispendimenti" guidata dal capomastro: investimenti in terre,
 * mercati, opifici e palazzo. Solo presentazione: le regole sono in
 * src/domain/investments.ts e src/domain/rank.ts.
 */
import { trustFactor } from '../domain/economy';
import { fiduciaOf, livelloMid, livelloOf, MARKET_MULT, OPIFICIO_MULT, umoreOf, workFactor } from '../domain/gabelle';
import { ACRI_IN_BLOCCO, ACRI_PER_ACQUISTO, COSTS, canInvest, canInvestTimes, MAX_ACRI, maxBotteghe, MAX_GRANAI, MAX_PALAZZO, type InvestmentKind } from '../domain/investments';
import { GRANAIO_CAPACITY, granaryCapacity, SETTLER_GRAIN } from '../domain/gabelle';
import { LISTING_VICTORY, missingFloors, PALAZZO_SERVI, palazzoServiMin, RANK_THRESHOLDS, titleName, victoryRule, wealthIndex, type Victory } from '../domain/rank';
import { addettiDi, addettiNecessari, CITTA, contadiniNecessari, serviLiberi, spesaCitta } from '../domain/citta';
import { botteghe, ERE, prossimaOpera, puoCostruireOpera, rangoMassimo, tettoBotteghe } from '../domain/ere';
import type { Game } from '../domain/turn';
import type { Player, Scalars } from '../domain/types';
import { honorific } from './advisor';
import { foreclosureWarning } from './pignoramenti';
import { builderPortrait, buildingArt, operaArt } from './art';
import { pick, speechBox, type Speaker } from './speaker';

export const UGOLINO: Speaker = { name: 'Mastro Ugolino', role: 'capomastro del feudo', portrait: builderPortrait };

export interface CantiereUi {
  key: string;
  advisor: string;
  /** l'era aperta dall'opera appena compiuta: se c'è, il cantiere mostra la sua vignetta finché non si prosegue */
  opera?: number;
}

const n = (v: number) => Math.floor(v).toLocaleString('it-IT');
/** In ordine di costo. */
export const KINDS: InvestmentKind[] = (['terre', 'granaio', 'mercato', 'opificio', 'palazzo'] as InvestmentKind[]).sort((a, b) => COSTS[a] - COSTS[b]);

/** Beni costruibili in questa partita (i granai solo con il commercio del grano). */
const kindsFor = (p: Player) => KINDS.filter(k => k !== 'granaio' || p.granai !== undefined);

/** Prossimo traguardo di ricchezza: titolo superiore o trono (con il palazzo reale serve anche il palazzo completo). */
export function nextGoal(p: Player, v: Victory = LISTING_VICTORY): { label: string; target: number; from: number; floors?: number } {
  const ka = wealthIndex(p);
  const idx = RANK_THRESHOLDS.findIndex(t => ka <= t);
  if (idx === -1) {
    // floors: piani di palazzo che mancano ancora per il trono
    const floors = missingFloors(p, v);
    return { label: p.gender === 1 ? 'il trono di re' : 'il trono di regina', target: v.threshold, from: RANK_THRESHOLDS[RANK_THRESHOLDS.length - 1], ...(floors ? { floors } : {}) };
  }
  return { label: titleName(idx + 1 + p.gender), target: RANK_THRESHOLDS[idx], from: idx === 0 ? 0 : RANK_THRESHOLDS[idx - 1] };
}

/** Quanti ne possono esistere al massimo (righe 1725-1820). */
export function capacity(p: Player, k: InvestmentKind): { owned: number; max: number; unit: string } {
  // le ere: anche l'era pone un tetto alle botteghe
  const cap = Math.min(maxBotteghe(p), tettoBotteghe(p));
  switch (k) {
    case 'terre': return { owned: p.acri, max: MAX_ACRI, unit: 'acri' };
    case 'mercato': return { owned: p.mercato - 1, max: cap, unit: '' };
    case 'opificio': return { owned: p.opificio - 1, max: cap, unit: '' };
    case 'palazzo': return { owned: p.palazzo, max: MAX_PALAZZO, unit: '' };
    case 'granaio': return { owned: p.granai ?? 0, max: MAX_GRANAI, unit: '' };
  }
}

/** Correttivo delle gabelle in vigore (riga 940). */
function correttivo(p: Player): number {
  const c = p.rateBevere + p.rateMacina + p.rateCommerzio;
  return c > 180 ? 180 / c : 1;
}

/**
 * Rendita annua stimata di un mercato in più con le gabelle in vigore (righe 880 e 1960).
 * `fiducia`: livello supposto dei mercanti; di norma quello stimato ora (la fiducia è nascosta).
 */
export function marketYield(p: Player, fiducia = livelloOf(fiduciaOf(p))): number {
  const trust = p.fiducia === undefined ? trustFactor(p) : (MARKET_MULT * livelloMid(fiducia)) / 100;
  return Math.floor(((p.servi * p.rateCommerzio) / 500) * correttivo(p) * trust);
}

/**
 * Rendita annua di un opificio in più. Nell'originale il fattore k della riga 1975
 * sta fra 0 e 1 (qui il massimo); con la riforma è l'umore degli artigiani, supposto `umore`.
 */
export function opificioYield(p: Player, umore = livelloOf(umoreOf(p))): number {
  const mult = p.umore === undefined ? 3 : OPIFICIO_MULT * workFactor(livelloMid(umore));
  return Math.floor(((mult * p.servi * p.rateCommerzio) / 500) * correttivo(p));
}

/** Descrizione dell'effetto di ciascun bene, con i numeri del feudo. */
/** reale: con il palazzo reale ogni piano attira servi e il palazzo completo serve per il trono; certa: opzione `crescitaCerta`. */
export function effectText(p: Player, k: InvestmentKind, reale = false, certa = false): string {
  // la città: ogni bottega vuole i suoi addetti e una manutenzione annua
  if (p.citta && (k === 'mercato' || k === 'opificio')) {
    const extra = ` Vuole ${addettiDi(k)} servi liberi che ci lavorino e ${k === 'mercato' ? CITTA.manutenzioneMercato : CITTA.manutenzioneOpificio} scudi l'anno di manutenzione.`;
    return effectBase(p, k, reale, certa) + extra;
  }
  return effectBase(p, k, reale, certa);
}

function effectBase(p: Player, k: InvestmentKind, reale: boolean, certa: boolean): string {
  switch (k) {
    case 'terre':
      return `+25 acri: il raccolto può crescere fino a ${n((p.acri + 25) * 75)} misure. ${p.botteghe ? 'Ogni 100 acri consentono un mercato e un opificio.' : 'Ogni 500 acri in più consentono un mercato e un opificio in più.'}`;
    case 'mercato':
      if (p.rateCommerzio === 0) return 'Rende solo se tassate il commerzio: con la gabella a zero non frutta nulla.';
      return p.fiducia === undefined
        ? `Rende circa ${n(marketYield(p))} scudi l'anno con la gabella corrente sul commerzio, e cresce con il numero dei servi.`
        : `Rende circa ${n(marketYield(p, 'buono'))} scudi l'anno con la gabella corrente sul commerzio e i mercanti fiduciosi.`;
    case 'opificio':
      if (p.rateCommerzio === 0) return 'Rende solo se tassate il commerzio: con la gabella a zero non frutta nulla.';
      return p.umore === undefined
        ? `Rende fino a ${n(opificioYield(p))} scudi l'anno con la gabella corrente sul commerzio, se i servi crescono: la resa varia con la loro crescita.`
        : `Rende circa ${n(opificioYield(p, 'buono'))} scudi l'anno con la gabella corrente sul commerzio e il popolo felice.`;
    case 'palazzo':
      return reale
        ? `Non rende scudi, ma conta per il rango quanto costa e ogni piano attira da ${palazzoServiMin(certa)} a ${n(PALAZZO_SERVI[1])} servi nel feudo. Per salire al trono servono tutti gli ${MAX_PALAZZO} piani.`
        : 'Non rende nulla, ma conta per il rango quanto costa. Il massimo è di 11 piani.';
    case 'granaio':
      return `I granai tengono ${n(GRANAIO_CAPACITY)} misure in più (ora ${n(granaryCapacity(p))}). Grano comprato nelle annate buone e venduto in carestia rende, e ${certa ? 'il grano venduto dalle scorte in carestia attira tante famiglie quante ne nascerebbero distribuendolo' : `ogni ${SETTLER_GRAIN} misure vendute dalle scorte attirano una famiglia nel feudo`}.`;
  }
}

/** Suggerimento del capomastro: il bene più conveniente in questo momento. */
export function recommend(g: Game): { kind: InvestmentKind | null; why: string } {
  const p = g.player;
  const ok = (k: InvestmentKind) => canInvest(p, k).ok;
  if (p.scudi < 0) return { kind: null, why: 'Il tesoro è in rosso: ogni scudo preso a prestito costa usura. Io aspetterei.' };
  if (p.rateCommerzio > 0 && ok('mercato') && ok('opificio')) {
    const perScudoM = marketYield(p) / COSTS.mercato;
    // nell'originale la resa dell'opificio è in media metà del massimo
    const perScudoO = opificioYield(p) / (p.umore === undefined ? 2 : 1) / COSTS.opificio;
    return perScudoM >= perScudoO
      ? { kind: 'mercato', why: `Un mercato si ripaga in circa ${Math.ceil(COSTS.mercato / Math.max(1, marketYield(p)))} anni: è il miglior affare.` }
      : { kind: 'opificio', why: p.umore === undefined
        ? 'Con tanti servi, un opificio rende più di un mercato, anche se in modo meno prevedibile.'
        : 'Con il popolo di buon umore, un opificio rende più di un mercato.' };
  }
  if (p.rateCommerzio > 0 && ok('mercato')) return { kind: 'mercato', why: `Un mercato frutterebbe circa ${n(marketYield(p))} scudi l'anno.` };
  if (p.rateCommerzio === 0 && ok('mercato')) {
    return { kind: 'mercato', why: 'Mercati e opifici rendono solo con la gabella sul commerzio: se li costruite, ricordatevi di Ser Bonifacio.' };
  }
  if (ok('granaio') && p.grano > granaryCapacity(p) * 0.7) {
    return { kind: 'granaio', why: 'I granai sono quasi pieni: un granaio nuovo vi lascia conservare il grano per gli anni di carestia.' };
  }
  if (ok('terre')) return { kind: 'terre', why: 'Più terre significano raccolti più grandi e spazio per nuove botteghe.' };
  if (ok('palazzo')) return { kind: 'palazzo', why: g.state.options.palazzoReale ? 'Il palazzo attira servi, e senza tutti i suoi piani il trono resta lontano.' : 'Non resta molto altro: un piano di palazzo almeno fa crescere il prestigio.' };
  return { kind: null, why: 'Per quest\'anno non c\'è nulla che possiamo permetterci.' };
}

export function builderGreeting(g: Game): string {
  const p = g.player, sc: Scalars = g.state.scalars, h = honorific(p);
  const goal = nextGoal(p, victoryRule(g.state.options));
  const ka = wealthIndex(p);
  // ricchezza del trono già raggiunta: manca solo il palazzo
  const rich = ka > goal.target;
  const lines = rich ? [`${h}, la vostra ricchezza (${n(ka)}) basterebbe già per ${goal.label}: manca solo il palazzo completo, ${goal.floors === 1 ? 'un piano' : `${goal.floors} piani`}.`] : [pick([
    `${h}, il cantiere attende ordini. La vostra ricchezza vale ${n(ka)}: ne servono ${n(goal.target - ka + 1)} in più per ${goal.label}.`,
    `Buongiorno, ${h}! Mattoni e calce sono pronti. Per diventare ${goal.label} vi mancano ${n(goal.target - ka + 1)} di ricchezza.`,
    `Eccomi, ${h}. Contando terre, botteghe, palazzo e tesoro valete ${n(ka)}. Il prossimo traguardo è ${goal.label}.`,
  ])];
  if (goal.floors && !rich) lines.push(`Ricordate però che il trono spetta solo a chi ha il palazzo completo: ${goal.floors === 1 ? 'manca ancora un piano' : `mancano ancora ${goal.floors} piani`}.`);
  lines.push(pick([
    'Sappiate che ogni scudo speso in beni conta per il rango quanto conta nel tesoro: costruendo non perdete nulla nella scalata al trono.',
    'Un consiglio da vecchio muratore: ciò che costruite vale per il rango esattamente quanto lo pagate, ma in più può rendere.',
  ]));
  if (p.credito > 0 && p.scudi >= 0) {
    lines.push(`Gli usurai vi farebbero credito fino a ${n(p.credito)} scudi, ma a fine anno chiederebbero il ${sc.usura}% sul debito.`);
  }
  const rec = recommend(g);
  lines.push(rec.why);
  // una frase per volta nel fumetto
  return lines.join('\n');
}

/** servi: accorsi nel feudo per il nuovo piano di palazzo (palazzo reale). */
export function builderReaction(kind: InvestmentKind, p: Player, times = 1, servi = 0): string {
  const h = honorific(p);
  switch (kind) {
    case 'terre':
      if (times > 1) {
        const k = n(times * ACRI_PER_ACQUISTO);
        return pick([`Cippi piantati tutt'intorno: ${k} acri nuovi in un colpo solo, ${h}. Ora ne avete ${n(p.acri)}.`, `Un bel tratto di pianura, ${h}: ${k} acri in più, ${n(p.acri)} in tutto!`]);
      }
      return pick([`Ho fatto piantare i cippi: altri 25 acri sono vostri, ${h}. Ora ne avete ${n(p.acri)}.`, `I contadini già arano le nuove terre. ${n(p.acri)} acri in tutto!`]);
    case 'mercato':
      return pick([`Le bancarelle sono montate! I mercanti pagheranno la gabella dall'anno prossimo.`, `Un nuovo mercato in piazza, ${h}: è il numero ${p.mercato - 1}.`]);
    case 'opificio':
      return pick([`La ruota del nuovo opificio gira già, ${h}!`, `Telai, mole e fornaci: l'opificio numero ${p.opificio - 1} è pronto.`]);
    case 'palazzo':
      if (servi) {
        const left = MAX_PALAZZO - p.palazzo;
        const end = left ? `${left === 1 ? 'Manca un piano solo' : `Mancano ${left} piani`} al palazzo completo.` : 'Il palazzo è completo: ora il trono attende solo la vostra ricchezza!';
        return pick([`Un piano in più al palazzo, ${h}: si vede da tre valli, e ${n(servi)} servi sono già accorsi a cercare lavoro nel feudo. ${end}`, `La fama del palazzo corre lontano: ${n(servi)} servi arrivano con le loro famiglie. ${end}`]);
      }
      return pick([`Un piano in più al palazzo, ${h}: si vede da tre valli!`, `Il palazzo cresce: ${p.palazzo} piani su 11. Che magnificenza!`]);
    case 'granaio':
      return pick([`Il granaio nuovo profuma di legno, ${h}: ora i granai tengono ${n(granaryCapacity(p))} misure.`, `Travi, tegole e un buon gatto contro i sorci: il granaio è pronto.`]);
  }
}

// ---------------------------------------------------------------- vista

const TITLES: Record<InvestmentKind, string> = { terre: '25 acri di terra', mercato: 'Mercato', opificio: 'Opificio', palazzo: 'Piano di palazzo', granaio: 'Granaio' };

/** Acquisto rapido delle terre: ACRI_IN_BLOCCO acri in una volta, entro MAX_ACRI e il credito (il costo nel suggerimento). */
function bulkLandButton(p: Player): string {
  const times = ACRI_IN_BLOCCO / ACRI_PER_ACQUISTO;
  const c = canInvestTimes(p, 'terre', times);
  const costo = `${n(times * COSTS.terre)} scudi`;
  return `<button data-act="invest" data-kind="terre" data-times="${times}" title="${c.ok ? costo : c.reason}" ${c.ok ? '' : 'disabled'}>Compra ${ACRI_IN_BLOCCO} acri</button>`;
}

const ERA_NOME = ['prima', 'seconda', 'terza', 'quarta', 'quinta'];
const RANGO_NOME = ['messere', 'conte', 'duca', 'granduca', 'principe'];

/** Le ere: la ricchezza per il titolo seguente c'è già, ma manca l'opera dell'era. */
function titoloInAttesa(p: Player, ka: number): string {
  const o = prossimaOpera(p);
  if (!o) return '';
  const r = rangoMassimo(p);
  if (r >= 5 || ka <= RANK_THRESHOLDS[r - 1]) return '';
  return `<p class="warn">La ricchezza per diventare <b>${titleName(r + p.gender)}</b> c'è già: manca l'opera dell'era, ${o.nome.toLowerCase()}.</p>`;
}

/** Le ere: la scheda dell'opera da costruire per passare all'era seguente (solo con `ere`). */
function operaCard(p: Player): string {
  if (p.era === undefined) return '';
  const o = prossimaOpera(p);
  const era = `Siete nella <b>${ERA_NOME[p.era]} era</b>: al più ${tettoBotteghe(p)} mercati e ${tettoBotteghe(p)} opifici.`;
  if (!o) {
    return `<div class="build-card opera"><div class="build-body">
      <div class="build-head"><span class="build-title">Le opere del feudo</span></div>
      <p class="build-effect">${era} Tutte le opere sono costruite: il trono è alla vostra portata.</p></div></div>`;
  }
  const c = puoCostruireOpera(p);
  const dopo = ERE.tetto[Math.min(p.era + 1, ERE.tetto.length - 1)];
  return `<div class="build-card opera">
      ${operaArt[o.id]}
      <div class="build-body">
        <div class="build-head"><span class="build-title">Opera dell'era: ${o.nome}</span><span class="build-cost">${n(o.scudi)} scudi e ${n(o.grano)} misure di grano</span></div>
        <div class="build-owned">botteghe: <b>${botteghe(p)}</b> su ${o.requisito} richieste</div>
        <p class="build-effect">${era} Con quest'opera: ${o.vantaggio}; fino a ${dopo} mercati e ${dopo} opifici; e si può diventare <b>${RANGO_NOME[Math.min(p.era + 1, 4)]}</b>.</p>
        <button data-act="opera" ${c.ok ? 'class="primary"' : `disabled title="${c.reason}"`}>${c.ok ? 'Costruisci l\'opera' : c.reason}</button>
      </div>
    </div>`;
}

/** Saldo dei cittadini (opzione `migrazioni`): quanti servi arriveranno o partiranno a fine anno, e perché. */
function saldoLine(g: Game): string {
  if (!g.state.options.migrazioni) return '';
  const s = g.saldoCittadini();
  const voci = g.vociMigrazione().filter(v => v.punti !== 0).map(v => `${v.voce} ${v.punti > 0 ? '+' : '−'}`).join(', ');
  const testo = s > 0 ? `arriveranno <b>${n(s)}</b> servi` : s < 0 ? `<span class="warn">partiranno <b>${n(-s)}</b> servi</span>` : 'nessuno arriva e nessuno parte';
  return `<p>Saldo dei cittadini a fine anno: ${testo}${voci ? ` <small>(${voci})</small>` : ''}</p>`;
}

/** La città: dove lavorano i servi e quanto costerà la città a fine anno (solo con `citta`). */
function cittaLine(g: Game): string {
  const p = g.player;
  if (!p.citta) return saldoLine(g);
  const liberi = serviLiberi(p), s = spesaCitta(p);
  return `<p>Servi: <b>${n(p.servi)}</b> · nelle botteghe <b>${n(addettiNecessari(p))}</b> · per i campi <b>${n(contadiniNecessari(p))}</b> · liberi <b>${n(Math.max(0, liberi))}</b>${liberi < 0 ? ' <span class="warn">(mancano braccia)</span>' : ''}</p>
    ${saldoLine(g)}
    <p>Spese della città a fine anno: circa <b>${n(s.totale)}</b> scudi <small>(manutenzione edifici ${n(s.manutenzione)} + spese cittadine ${n(s.servizi)})</small></p>`;
}

/** war: dopo il cantiere viene il menu Guerra dell'espansione */
/** extra: altre carte grandi accanto alle costruzioni (es. "Fra signori", accanto al palazzo) */
export function renderCantiere(g: Game, ui: CantiereUi, war = false, extra = ''): string {
  const p = g.player, sc = g.state.scalars;
  const ka = wealthIndex(p);
  const goal = nextGoal(p, victoryRule(g.state.options));
  const pct = Math.max(0, Math.min(100, ((ka - goal.from) / (goal.target - goal.from)) * 100));
  const rec = recommend(g).kind;
  const cards = kindsFor(p).map(k => {
    const c = canInvest(p, k);
    const cap = capacity(p, k);
    return `<div class="build-card ${rec === k ? 'recommended' : ''}">
      ${rec === k ? '<span class="ribbon">consigliato</span>' : ''}
      ${buildingArt[k]}
      <div class="build-body">
        <div class="build-head"><span class="build-title">${TITLES[k]}</span><span class="build-cost">${n(COSTS[k])} scudi</span></div>
        <div class="build-owned">posseduti: <b>${n(cap.owned)}</b>${cap.unit ? ' ' + cap.unit : ''} su ${n(cap.max)}</div>
        <p class="build-effect">${effectText(p, k, !!g.state.options.palazzoReale, !!g.state.options.crescitaCerta)}</p>
        ${k === 'terre'
          ? `<div class="build-btns"><button data-act="invest" data-kind="terre" ${c.ok ? 'class="primary"' : `disabled title="${c.reason}"`}>${c.ok ? `Compra ${ACRI_PER_ACQUISTO} acri` : c.reason}</button>${bulkLandButton(p)}</div>`
          : `<button data-act="invest" data-kind="${k}" ${c.ok ? 'class="primary"' : `disabled title="${c.reason}"`}>${c.ok ? 'Costruisci' : c.reason}</button>`}
      </div>
    </div>`;
  }).join('');
  const usury = p.scudi < 0 ? `<p class="warn">A fine anno l'usura costerà circa ${n(Math.abs(Math.floor((sc.usura / 100) * p.scudi)))} scudi.</p>` : '';
  return `${speechBox(UGOLINO, ui.advisor)}
    <div class="goal">
      <div class="goal-label">Ricchezza <b>${n(ka)}</b> · prossimo traguardo: <b>${goal.label}</b> ${ka > goal.target ? '(ricchezza raggiunta)' : `oltre ${n(goal.target)}`}${goal.floors ? `, con il palazzo completo (mancano <b>${goal.floors}</b> ${goal.floors === 1 ? 'piano' : 'piani'})` : ''}</div>
      <div class="goal-bar"><div class="goal-fill" style="width:${pct}%"></div></div>
      ${titoloInAttesa(p, ka)}
    </div>
    <div class="build-cards">${operaCard(p)}${cards}${extra}</div>
    <p>Tesoro: <b>${n(p.scudi)}</b> scudi · credito degli usurai fino a <b>${n(-p.credito)}</b></p>
    ${cittaLine(g)}${usury}${g.state.options.pignoramenti ? foreclosureWarning(p, sc) : ''}
    <div class="btns"><button data-act="karta">Karta: guarda lo reame</button>${war ? '<button data-act="warMenu" class="primary">Proximus: guerra</button>' : '<button data-act="next" class="primary">Proximus: fine dell\'anno</button>'}</div>`;
}
