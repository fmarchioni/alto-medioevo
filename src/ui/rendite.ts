/**
 * Fase "Rendite" guidata dal camerlengo.
 *
 * I cursori modificano una bozza: l'anteprima è calcolata con le formule
 * originali su una copia dello stato. Le gabelle vengono applicate al motore
 * solo alla conferma, una chiamata setRate per ciascuna voce cambiata, come se
 * il giocatore le avesse ritoccate una alla volta nell'originale (con il
 * relativo deperimento del grano, se le regole lo prevedono).
 */
import { type RateKind } from '../domain/economy';
import { bestRates, currentRates, KINDS, previewRates, RATE_SUM_CAP, yieldPerPoint, type Rates } from '../domain/strategy';
import { DECIMA, hasEffetto, pilgrimIncome } from '../domain/fatti';
import { abitudineOf, fiduciaOf, livelloOf, MAX_RICARICO, sereno, TOLLERANZA_MAX, umoreOf, type Livello } from '../domain/gabelle';
export { bestRates, currentRates, KINDS, previewRates, RATE_SUM_CAP, yieldPerPoint, type Rates };
import type { Game } from '../domain/turn';
import type { Player, RenditePreview, Scalars } from '../domain/types';
import { treasurerPortrait } from './art';
import { honorific } from './advisor';
import { pick, speechBox, type Speaker } from './speaker';
import { c64ify } from './theme';

export const BONIFACIO: Speaker = { name: 'Ser Bonifacio', role: 'camerlengo del feudo', portrait: treasurerPortrait };


/** Note di un'espansione accanto alle gabelle (es. il giudizio del sensale). */
export type RateBadges = (g: Game, r: Rates) => Partial<Record<RateKind, string>> | null;

export interface RenditeUi {
  /** frase del sensale di piazza alle rendite */
  sensaleSay?: string;
  key: string;
  draft: Rates;
  advisor: string;
  /** gabella di cui il camerlengo sta spiegando il pro e il contro */
  help?: RateKind;
}

const n = (v: number) => Math.floor(v).toLocaleString('it-IT');



/** Voci che differiscono dalle gabelle in vigore: ognuna è un ritocco. */
export const changedKinds = (p: Player, r: Rates): RateKind[] => KINDS.filter(k => currentRates(p)[k] !== r[k]);

/** Quanti deperimenti del grano costerebbe confermare la bozza. */
export function spoilsFor(g: Game, r: Rates): number {
  if (g.state.options.spoilOncePerYear || g.player.fiducia !== undefined) return 0;
  return changedKinds(g.player, r).length;
}



export function presets(p: Player, _sc: Scalars): { id: string; label: string; rates: Rates }[] {
  return [
    { id: 'current', label: 'Come sono ora', rates: currentRates(p) },
    { id: 'moderate', label: 'Moderate (30% ciascuna)', rates: { bevere: 30, macina: 30, commerzio: 30 } },
    { id: 'balanced', label: 'Equilibrate (60% ciascuna)', rates: { bevere: 60, macina: 60, commerzio: 60 } },
  ];
}

// ---------------------------------------------------------------- dialoghi

export function treasurerGreeting(g: Game): string {
  const p = g.player, sc = g.state.scalars;
  const h = honorific(p);
  const now = previewRates(p, sc, currentRates(p));
  const lines: string[] = [];
  lines.push(pick([
    `${h}, ho qui i registri delle gabelle. Con le aliquote in vigore incasseremmo ${n(now.totale)} scudi.`,
    `I conti sono pronti, ${h}. Lasciando le gabelle come sono, entreranno ${n(now.totale)} scudi nel tesoro.`,
    `Riverisco, ${h}. Se non toccate nulla, il feudo renderà ${n(now.totale)} scudi quest'anno.`,
  ]));
  if (p.baseMercati + p.baseOpifici <= 0) {
    lines.push(pick([
      `Sul commerzio non c'è nulla da tassare: mercati e opifici si censiscono a fine anno, e finora non ne abbiamo.`,
      `La gabella sul commerzio oggi non frutta: senza mercati né opifici censiti, i mercanti non hanno banchi da pagare.`,
    ]));
  }
  if (sc.s < p.servi) {
    lines.push(`La macina rende in proporzione al grano distribuito al popolo: quest'anno ne avete dato ${n(sc.s)} misure.`);
  }
  if (p.umore !== undefined) {
    const u = livelloOf(umoreOf(p)), f = livelloOf(fiduciaOf(p));
    if (!sereno(u)) lines.push(`Il popolo è ${MOOD_WORD[u]}, ${h}: quest'anno potrebbe rivoltarsi.`);
    if (!sereno(f)) lines.push(`I mercanti sono ${TRUST_WORD[f]}: qualcuno potrebbe chiudere bottega.`);
    if (p.scudi < 0) lines.push('Con il tesoro in debito i granai non si riparano: quest\'anno parte del grano è andata a male.');
    lines.push('Se volete sapere cosa comporta ciascuna gabella, chiedetemi pure (il "?" accanto a ognuna).');
  } else if (!g.state.options.spoilOncePerYear) {
    lines.push(pick([
      `Un avvertimento: ogni volta che si riscrivono le gabelle i granai restano incustoditi, e una parte del grano marcisce.`,
      `Badate che ogni ritocco delle gabelle costa grano: mentre i messi girano per il feudo, i sorci banchettano nei granai.`,
    ]));
  }
  return lines.join(' ');
}

export function treasurerReaction(g: Game, before: { grano: number; totale: number }, after: RenditePreview, spoils: number): string {
  const p = g.player, h = honorific(p);
  const lost = before.grano - p.grano;
  const parts = [pick([
    `Fatto, ${h}: i banditori hanno annunciato le nuove gabelle. Renderanno ${n(after.totale)} scudi.`,
    `Le nuove aliquote sono scritte nel registro: ${n(after.totale)} scudi attesi.`,
    `Così sia. Il popolo brontola, ma pagherà: ${n(after.totale)} scudi.`,
  ])];
  if (spoils > 0 && lost > 0) {
    parts.push(pick([
      `Ahimè, nel frattempo sono andate perse ${n(lost)} misure di grano.`,
      `Il prezzo dei ritocchi: ${n(lost)} misure di grano marcite nei granai.`,
    ]));
  }
  return parts.join(' ');
}

/** Consiglio "dal vivo" mentre si muovono i cursori: deterministico, niente frasi casuali. */
export function liveTip(g: Game, r: Rates): string {
  const p = g.player, sc = g.state.scalars;
  const sum = r.bevere + r.macina + r.commerzio;
  const y = yieldPerPoint(p, sc);
  const pv = previewRates(p, sc, r);
  if (p.fiducia !== undefined) {
    // riforma: niente previsioni né coefficienti, solo quello che si sa oggi
    const wasted = KINDS.find(k => r[k] > 0 && y[k] <= 0);
    if (wasted) return `La gabella su ${wasted} non frutta nulla quest'anno: potete lasciarla a zero.`;
    return 'Come prenderanno queste gabelle popolo e mercanti, lo vedrete solo l\'anno prossimo.';
  }
  if (sum > RATE_SUM_CAP) {
    return `Oltre ${RATE_SUM_CAP} punti le gabelle vengono ridotte in proporzione (×${pv.correttivo.toFixed(2)}): il totale non cresce, cambia solo chi paga.`;
  }
  const wasted = KINDS.find(k => r[k] > 0 && y[k] <= 0);
  if (wasted) return `La gabella su ${wasted} non frutta nulla quest'anno: potete lasciarla a zero.`;
  return `Con queste gabelle la rendita dell'anno è di ${n(pv.totale)} scudi.`;
}

/** Come appaiono popolo e mercanti a ciascun livello. */
const MOOD_WORD: Record<Livello, string> = { ottimo: 'in festa', buono: 'contento', normale: 'tranquillo ma brontola', infelice: 'infelice', rabbia: 'in collera' };
const TRUST_WORD: Record<Livello, string> = { ottimo: 'entusiasti', buono: 'soddisfatti', normale: 'diffidenti', infelice: 'scontenti', rabbia: 'furiosi' };

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Il camerlengo spiega il pro e il contro di una gabella, con i numeri del feudo. */
export function rateHelp(g: Game, k: RateKind, _r: Rates): string {
  const p = g.player, sc = g.state.scalars, h = honorific(p);
  const y = yieldPerPoint(p, sc);
  if (p.fiducia === undefined) {
    return {
      bevere: `Il bevere tassa vino e cervogia dei servi, ${h}: rende ${y.bevere.toFixed(1)} scudi per punto e non scontenta nessuno.`,
      macina: `La macina si paga sul grano distribuito al popolo: più ne date, più rende, e meno servi avete più frutta ogni misura.`,
      commerzio: `Il commerzio tassa mercati e opifici censiti a fine anno: senza edifici non rende nulla.`,
    }[k];
  }
  const u = livelloOf(umoreOf(p));
  if (k === 'bevere') {
    return [
      `La gabella sul bevere tassa vino e cervogia dei servi, ${h}: rende ${y.bevere.toFixed(1)} scudi per punto, qualunque cosa accada.`,
      `Ma più è alta, più il popolo si scontenta, un poco ogni anno; e l'umore cambia anche per ragioni che nessuno sa dire. Oggi il popolo è ${MOOD_WORD[u]} (umore ${u}).`,
      `Finché l'umore è ottimo o buono nessuno si ribella. Da normale in giù il popolo può rivoltarsi, tanto più spesso quanto più è scontento: assalta i granai, muoiono servi negli scontri e sparisce parte del tesoro.`,
      `Un popolo ben nutrito sopporta meglio le gabelle: il grano dato oltre la domanda quest'anno le rende più tollerabili (fino a un ${TOLLERANZA_MAX}% di malcontento in meno).`,
      `E un popolo scontento lavora male: gli opifici rendono meno.`,
    ].join(' ');
  }
  if (k === 'macina') {
    const ab = abitudineOf(p);
    return [
      `La macina si paga sul grano che distribuite al popolo: rende 2 scudi per punto ogni ${n(p.servi)} misure distribuite.`,
      `Ma anche questa gabella esce dalle tasche del popolo e pesa sull'umore, meno del bevere: le due gabelle insieme non possono essere alte.`,
      `E il popolo si abitua! Ogni misura data oltre la domanda alza la domanda dell'anno seguente.`,
      ab > 0 ? `Ora ogni servo chiede ${ab.toFixed(1).replace('.', ',')} misure in più del solito (${n(ab * p.servi)} in tutto).` : 'Per ora il popolo non chiede più del solito.',
      `Se poi viene una carestia e non c'è grano a sufficienza, la fame uccide fino a un quinto del popolo. Dando meno grano, l'anno dopo la domanda torna a calare.`,
    ].join(' ');
  }
  const f = livelloOf(fiduciaOf(p));
  return [
    `Il commerzio tassa i banchi dei mercati e le botteghe degli opifici, ${h}.`,
    `I mercati però rendono secondo la fiducia dei mercanti, che cala se li spremete: rende bene un anno o due, poi se ne vanno. Oggi i mercanti sono ${TRUST_WORD[f]} (fiducia ${f}).`,
    `Se si fidano poco ci fanno pagare il grano più caro e ce lo comprano a meno, fino a ${pct(MAX_RICARICO)}.`,
    `Con la fiducia ottima o buona nessuno se ne va, e se è ottima può arrivare un mercante forestiero ad aprire un mercato. Da normale in giù qualcuno chiude bottega, tanto più spesso quanto più sono scontenti.`,
    `I mercanti sopportano meglio la gabella se vendete loro grano: quello venduto quest'anno la rende più tollerabile (fino a un ${TOLLERANZA_MAX}% di malcontento in meno).`,
    `Gli opifici invece non badano ai mercanti: rendono secondo l'umore degli artigiani.`,
  ].join(' ');
}

// ---------------------------------------------------------------- vista

const LABELS: Record<RateKind, { title: string; base: string }> = {
  bevere: { title: 'Bevere', base: 'sui servi' },
  macina: { title: 'Macina', base: 'sul grano distribuito' },
  commerzio: { title: 'Commerzio', base: 'su mercati e opifici' },
};

function contribution(pv: RenditePreview, k: RateKind): number {
  return k === 'bevere' ? pv.bevere : k === 'macina' ? pv.macina : pv.commerzio;
}

/** Parte della vista che si aggiorna mentre si muovono i cursori. */
export function renderLive(g: Game, r: Rates): string {
  const p = g.player, sc = g.state.scalars;
  const pv = previewRates(p, sc, r);
  const sum = r.bevere + r.macina + r.commerzio;
  const pct = Math.min(100, (sum / 297) * 100);
  const capPct = (RATE_SUM_CAP / 297) * 100;
  const spoils = spoilsFor(g, r);
  // con la riforma il signore non vede coefficienti né la riduzione oltre il tetto
  const reform = p.fiducia !== undefined;
  const vass = p.vassalli
    ? `<tr><td>Tributo dei vassalli${g.state.options.vassalTributeCredited ? '' : ' <small>(solo credito, regola originale)</small>'}</td><td>${n(p.vassalli)}</td></tr>`
    : '';
  return `
    ${reform ? '' : `<div class="meter ${sum > RATE_SUM_CAP ? 'over' : ''}" aria-label="somma delle gabelle">
      <div class="meter-fill" style="width:${pct}%"></div>
      <div class="meter-cap" style="left:${capPct}%"></div>
      <div class="meter-label">Somma delle gabelle: <b>${sum}</b> / ${RATE_SUM_CAP} punti</div>
    </div>`}
    <p class="tip">${liveTip(g, r)}</p>
    <table class="calc ledger">
      <tr><td>Bevere</td><td>${n(pv.bevere)}</td></tr>
      <tr><td>Macina</td><td>${n(pv.macina)}</td></tr>
      <tr><td>Commerzio <small>(mercati ${n(pv.mercati)} + opifici ${n(pv.opifici)})</small></td><td>${n(pv.commerzio)}</td></tr>
      ${pv.correttivo !== 1 && !reform ? `<tr><td>Riduzione oltre ${RATE_SUM_CAP} punti</td><td>×${pv.correttivo.toFixed(3)}</td></tr>` : ''}
      <tr class="tot"><td>Rendita dell'anno</td><td>${n(pv.totale)} scudi</td></tr>
      ${hasEffetto(p, 'decima') ? `<tr><td>Decima del vescovo <small>(${Math.round(DECIMA * 100)}%)</small></td><td>−${n(pv.totale * DECIMA)}</td></tr>` : ''}
      ${pilgrimIncome(p) ? `<tr><td>Offerte dei pellegrini</td><td>+${n(pilgrimIncome(p))}</td></tr>` : ''}
      ${vass}
      <tr><td>Credito presso gli usurai <small>(rendita + vassalli)</small></td><td>${n(pv.conVassalli)}</td></tr>
    </table>
    ${moodRows(p)}
    ${spoils > 0 ? `<p class="warn spoil">Confermando ritoccate ${spoils} ${spoils === 1 ? 'gabella' : 'gabelle'}: il grano deperirà ${spoils} ${spoils === 1 ? 'volta' : 'volte'} (ogni volta fra un decimo e metà, in media un quinto). Granaio attuale: ${n(p.grano)}.</p>` : ''}
    <div class="btns">
      <button data-act="rApply" ${changedKinds(p, r).length ? '' : 'disabled'}>Applica le gabelle</button>
      <button data-act="rCollect" class="primary">${changedKinds(p, r).length ? 'Applica e incassa' : 'Bastante: incassa'} ${n(pv.totale)} scudi</button>
    </div>`;
}

/** Umore del popolo e fiducia dei mercanti: solo il livello di oggi, nessuna previsione. */
function moodRows(p: Player): string {
  if (p.fiducia === undefined) return '';
  const row = (label: string, l: Livello) => `<tr class="${sereno(l) ? '' : 'warn'}"><td>${label}</td><td><b>${l}</b></td></tr>`;
  return `<table class="calc ledger mood">
      ${row('Umore del popolo <small>(bevere e macina)</small>', livelloOf(umoreOf(p)))}
      ${row('Fiducia dei mercanti <small>(commerzio)</small>', livelloOf(fiduciaOf(p)))}
    </table>`;
}

export function renderRendite(g: Game, ui: RenditeUi, badges?: RateBadges, before = ''): string {
  const p = g.player, sc = g.state.scalars;
  const notes = badges?.(g, ui.draft) ?? null;
  const y = yieldPerPoint(p, sc);
  const pv = previewRates(p, sc, ui.draft);
  const cards = KINDS.map(k => `
    <div class="rate-card ${y[k] <= 0 ? 'barren' : ''}">
      <div class="rate-head"><span class="rate-title">${LABELS[k].title}</span><span class="rate-base">${LABELS[k].base}</span>
        <button class="rate-help" data-act="rHelp" data-kind="${k}" title="Pro e contro della gabella" aria-label="Pro e contro: ${LABELS[k].title}">?</button></div>
      <div class="qty-row">
        <input type="range" name="r-${k}" min="0" max="99" step="1" value="${ui.draft[k]}" aria-label="${LABELS[k].title} percentuale">
        <span class="rate-val"><output id="rv-${k}">${ui.draft[k]}</output>%</span>
      </div>
      <div class="rate-foot">≈ ${y[k] >= 1 ? n(y[k]) : y[k].toFixed(2)} scudi per punto · ora <b id="rc-${k}">${n(contribution(pv, k))}</b>${ui.draft[k] !== currentRates(p)[k] ? ` <span class="was">(in vigore ${currentRates(p)[k]}%)</span>` : ''}</div>
      ${notes ? `<div class="rate-note" id="rn-${k}">${notes[k] ?? ''}</div>` : ''}
    </div>`).join('');
  return `${speechBox(BONIFACIO, ui.advisor)}${before}
    <div class="chips">${presets(p, sc).map(x => `<button class="chip" data-act="rPreset" data-preset="${x.id}">${x.label} <small>${x.rates.bevere}/${x.rates.macina}/${x.rates.commerzio}</small></button>`).join('')}</div>
    <div class="rate-cards">${cards}</div>
    <div id="rendite-live">${renderLive(g, ui.draft)}</div>
    ${ui.help ? `<div class="help-pop" role="dialog" aria-label="Consiglio sulla gabella">
      <div class="help-card"><h3>Gabella sul ${LABELS[ui.help].title.toLowerCase()}</h3>${speechBox(BONIFACIO, rateHelp(g, ui.help, ui.draft))}
        <div class="btns"><button data-act="rHelpClose" class="primary">Ho capito</button></div></div></div>` : ''}`;
}

/** Aggiornamento parziale (senza ridisegnare i cursori) durante il trascinamento. */
export function updateLive(root: HTMLElement, g: Game, r: Rates, badges?: RateBadges): void {
  const pv = previewRates(g.player, g.state.scalars, r);
  const notes = badges?.(g, r) ?? null;
  for (const k of KINDS) {
    const o = root.querySelector(`#rv-${k}`);
    if (o) o.textContent = String(r[k]);
    const c = root.querySelector(`#rc-${k}`);
    if (c) c.textContent = n(contribution(pv, k));
    const note = root.querySelector(`#rn-${k}`);
    if (note && notes) note.innerHTML = c64ify(notes[k] ?? '');
  }
  const live = root.querySelector('#rendite-live');
  if (live) live.innerHTML = c64ify(renderLive(g, r));
}
