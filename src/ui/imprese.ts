/**
 * Imprese temerarie: la carta in serbo nel pannello a sinistra, l'esito
 * dell'impresa e le righe del libro delle cronache. Solo presentazione: le
 * regole sono in src/domain/imprese.ts.
 */
import {
  BOTTINO_MAX, BOTTINO_MIN, cartaInMano, COMPLICE_ANNI, COMPLICE_CHANCE, IMPRESA_SUCCESSO, MULTA_FATTORE, multa, scadenza, silenzioDal, type EsitoImpresa, type ImpresaId,
} from '../domain/imprese';
import type { Game } from '../domain/turn';
import type { Player } from '../domain/types';
import { honorific } from './advisor';
import { bubble, coin, ground, hood, panel, person, sky } from './comics';

const n = (v: number) => Math.abs(Math.floor(v)).toLocaleString('it-IT');
const pct = (v: number) => `${Math.round(v * 100)}%`;
const year = (q: number) => 900 + q;

/** Testi di ciascuna carta: le regole sono le stesse, cambia il racconto. */
interface CartaText {
  title: string;
  emblem: string;
  blurb: string;
  /** titolo della schermata dell'esito */
  deed: string;
  /** chi può tradirvi negli anni seguenti */
  accomplice: string;
  /** frutto dell'impresa riuscita, nel riquadro */
  fruit: (amount: number) => string;
  /** didascalie dell'esito; h = titolo d'onore, o = desinenza */
  riuscita: (amount: number, h: string) => string;
  fallita: (h: string, o: string) => string;
  multa: (amount: number, h: string) => string;
  arresto: (amount: number, h: string, o: string) => string;
  line: string;
  /** righe del libro delle cronache */
  chr: Record<EsitoImpresa | 'scaduta', (amount: number) => string>;
}

const CARTE: Record<ImpresaId, CartaText> = {
  decime: {
    title: "Le decime dell'abate",
    emblem: '✠',
    blurb: 'Un abate corrotto trasporta ogni anno le decime di decine di villaggi. I briganti conoscono il percorso e cercano un complice.',
    deed: "L'assalto al carro delle decime",
    accomplice: 'un complice',
    fruit: a => `Il carro delle decime vi ha fruttato ${n(a)} scudi.`,
    riuscita: (a, h) => `Nella notte il carro dell'abate cade nell'agguato al guado, ${h}. Nessuno vi ha riconosciuto: ${n(a)} scudi di decime finiscono nel vostro tesoro.`,
    fallita: (h, o) => `Era una trappola, ${h}: le guardie del vescovo aspettavano al guado. Siete arrestat${o} con i briganti, e il vostro feudo passa ad altre mani.`,
    multa: (a, h) => `Un vecchio complice, preso per altri furti, ha fatto il vostro nome, ${h}. Per chiudere la faccenda pagate ${n(a)} scudi, il doppio del bottino.`,
    arresto: (a, h, o) => `Un vecchio complice ha fatto il vostro nome, ${h}. Il tribunale chiede ${n(a)} scudi, il doppio del bottino, e il tesoro non basta: siete arrestat${o}.`,
    line: 'Le decime sono nostre!',
    chr: {
      riuscita: a => `Si unì in segreto ai briganti, e il carro delle decime dell'abate gli fruttò ${n(a)} scudi.`,
      fallita: () => "Tentò di assaltare con i briganti il carro delle decime dell'abate, ma fu preso dalle guardie del vescovo e messo in ceppi.",
      multa: a => `Un complice dell'assalto alle decime fece il suo nome, e per chiudere la faccenda dovette pagare ${n(a)} scudi.`,
      arresto: a => `Un complice dell'assalto alle decime fece il suo nome; non potendo pagare ${n(a)} scudi, fu arrestato.`,
      scaduta: () => "Lasciò cadere l'invito dei briganti, e il carro dell'abate passò indisturbato.",
    },
  },
  commercio: {
    title: 'Il commercio segreto',
    emblem: '⚖',
    blurb: 'Mercanti senza scrupoli offrono di partecipare a un lucroso commercio segreto: merci di contrabbando, sale e armi lontano dagli occhi delle dogane.',
    deed: 'Il commercio segreto',
    accomplice: 'un socio',
    fruit: a => `Il commercio segreto vi ha fruttato ${n(a)} scudi.`,
    riuscita: (a, h) => `Le galee tornano di notte con le stive piene, ${h}. Nessuna dogana ha visto nulla: ${n(a)} scudi di guadagno finiscono nel vostro tesoro.`,
    fallita: (h, o) => `Le guardie del porto aspettavano le galee, ${h}, e i mercanti hanno subito fatto il vostro nome. Siete arrestat${o}, e il vostro feudo passa ad altre mani.`,
    multa: (a, h) => `Uno dei mercanti, preso alla dogana, ha fatto il vostro nome, ${h}. Per chiudere la faccenda pagate ${n(a)} scudi, il doppio del guadagno.`,
    arresto: (a, h, o) => `Uno dei mercanti, preso alla dogana, ha fatto il vostro nome, ${h}. Il tribunale chiede ${n(a)} scudi, il doppio del guadagno, e il tesoro non basta: siete arrestat${o}.`,
    line: 'Un affare d\'oro!',
    chr: {
      riuscita: a => `Si mise in società con mercanti senza scrupoli, e il loro commercio segreto gli fruttò ${n(a)} scudi.`,
      fallita: () => 'Si mise in società con mercanti senza scrupoli, ma le guardie del porto scoprirono il loro commercio segreto e lo misero in ceppi.',
      multa: a => `Un mercante del commercio segreto fece il suo nome, e per chiudere la faccenda dovette pagare ${n(a)} scudi.`,
      arresto: a => `Un mercante del commercio segreto fece il suo nome; non potendo pagare ${n(a)} scudi, fu arrestato.`,
      scaduta: () => "Lasciò cadere l'offerta dei mercanti senza scrupoli, e il loro commercio segreto si fece senza di lui.",
    },
  },
};

/** Riquadro "Imprese" sotto l'elenco dei signori. */
export function impreseAside(g: Game): string {
  if (!g.state.options.imprese) return '';
  const p = g.player, q = g.state.q, i = p.impresa;
  let body: string;
  if (i && cartaInMano(p, q)) {
    const t = CARTE[i.id], ok = g.canUseImpresa();
    body = `<div class="impresa-card">
      <div class="impresa-head"><span class="impresa-emblem" aria-hidden="true">${t.emblem}</span><b>${t.title}</b></div>
      <p>${t.blurb}</p>
      <ul class="impresa-terms">
        <li>${pct(IMPRESA_SUCCESSO)} di riuscita: da ${n(BOTTINO_MIN)} a ${n(BOTTINO_MAX)} scudi</li>
        <li>se fallisce, l'arresto: la partita finisce</li>
        <li>per ${COMPLICE_ANNI} anni, ogni anno ${pct(COMPLICE_CHANCE)} che ${t.accomplice} parli: pagate il ${MULTA_FATTORE === 2 ? 'doppio' : `${MULTA_FATTORE} volte il`} guadagno, o finite in ceppi</li>
      </ul>
      <p class="impresa-due">Si può tentare fino all'anno ${year(scadenza(i))}${q === scadenza(i) ? ': è l\'ultimo!' : '.'}</p>
      <button data-act="impresa" ${ok ? 'class="primary"' : 'disabled title="si tenta nella Delibera o nei dispendimenti"'}>Tenta l'impresa</button>
    </div>`;
  } else if (i?.usata !== undefined) {
    const t = CARTE[i.id];
    body = `<p class="impresa-note">${t.fruit(i.bottino ?? 0)} Fino all'anno ${year(silenzioDal(i))} ${t.accomplice} può parlare: vi costerebbe ${n(multa(i))} scudi.</p>`;
  } else {
    body = '<p class="hint">Nessuna impresa in serbo. Le occasioni arrivano fra gli imprevisti.</p>';
  }
  return `<section class="imprese"><h3>Imprese</h3>${body}</section>`;
}

const SOUND: Record<EsitoImpresa, string> = { riuscita: 'TLIN TLIN!', fallita: 'CLANK!', multa: 'SOB!', arresto: 'CLANK!' };
const LINE: Record<Exclude<EsitoImpresa, 'riuscita'>, string> = { fallita: 'Sono innocente!', multa: 'Prendete e tacete!', arresto: 'Maledetto traditore!' };

function caption(id: ImpresaId, esito: EsitoImpresa, amount: number, p: Player): string {
  const t = CARTE[id], h = honorific(p), o = p.gender === 1 ? 'o' : 'a';
  switch (esito) {
    case 'riuscita': return t.riuscita(amount, h);
    case 'fallita': return t.fallita(h, o);
    case 'multa': return t.multa(amount, h);
    case 'arresto': return t.arresto(amount, h, o);
  }
}

const lord = (x: number) => person(x, 142, '#2f5b3a', '<path d="M-8 -36 h16 l-3 -6 h-10z" fill="#8b2a1e"/>');

function scene(id: ImpresaId, esito: EsitoImpresa, line: string): string {
  if (esito === 'riuscita' && id === 'decime') {
    return `${sky('#1c2238', '#3d4a6e', 'ski1')}<circle cx="270" cy="30" r="12" fill="#f3ecc8"/>${ground('#3e3a2e')}
      <g transform="translate(150 124)"><rect x="0" y="-10" width="70" height="26" fill="#6b4a2c" stroke="#3e2617" transform="rotate(12 35 3)"/>
        <circle cx="14" cy="20" r="9" fill="#3e2617"/></g>
      ${person(80, 142, '#2b2118', hood('#1c1814'))}${lord(116)}
      ${[0, 1, 2, 3, 4].map(i => coin(100 + i * 9, 112, 'a-toss', i * 0.2)).join('')}
      ${bubble(10, 30, line, 90, 100)}`;
  }
  if (esito === 'riuscita') {
    // le galee del contrabbando al molo, di notte
    return `${sky('#1c2238', '#3d4a6e', 'ski3')}<circle cx="270" cy="30" r="12" fill="#f3ecc8"/>
      <rect x="0" y="120" width="320" height="60" fill="#2a3a5a"/><rect x="0" y="132" width="150" height="48" fill="#6b5a47"/>
      <g class="a-bob"><path d="M170 128 h120 l-16 18 h-88z" fill="#5a3d26" stroke="#2b2118"/><path d="M230 128 v-56" stroke="#3e2617" stroke-width="3"/><path d="M232 76 l40 40 h-40z" fill="#e8dcc0"/></g>
      ${person(60, 142, '#6b2a6b', '<path d="M-9 -34 h18 l-2 -6 h-14z" fill="#3e2617"/>')}${lord(100)}
      ${[0, 1, 2, 3, 4].map(i => coin(70 + i * 9, 112, 'a-toss', i * 0.2)).join('')}
      ${bubble(10, 30, line, 80, 100)}`;
  }
  // in ceppi: le sbarre della prigione
  return `${sky('#3a3530', '#5a524a', 'ski2')}<rect x="0" y="0" width="320" height="180" fill="#4a443c"/>
    ${person(160, 150, '#2f5b3a', '<path d="M-8 -36 h16 l-3 -6 h-10z" fill="#8b2a1e"/>')}
    ${[60, 90, 120, 150, 180, 210, 240].map(x => `<rect x="${x}" y="20" width="6" height="150" fill="#2b2118"/>`).join('')}
    <rect x="50" y="20" width="206" height="8" fill="#2b2118"/>
    ${bubble(14, 36, line, 160, 104)}`;
}

/** Schermata dell'esito dell'impresa (o della confessione di un complice). */
export function renderImpresa(id: ImpresaId, esito: EsitoImpresa, amount: number, p: Player): string {
  const t = CARTE[id];
  const title = esito === 'riuscita' || esito === 'fallita' ? t.deed : `${t.accomplice[0].toUpperCase()}${t.accomplice.slice(1)} ha parlato`;
  const badge = esito === 'riuscita' ? `<span class="badge gain">+${n(amount)} scudi</span>`
    : esito === 'multa' ? `<span class="badge loss">−${n(amount)} scudi</span>` : '<span class="badge loss">arresto: la partita finisce</span>';
  const out = esito === 'fallita' || esito === 'arresto';
  const line = esito === 'riuscita' ? t.line : LINE[esito];
  return `<h2>${title}</h2>${panel(scene(id, esito, line), SOUND[esito], caption(id, esito, amount, p), title)}
    <div class="badges">${badge}</div>
    <div class="btns"><button data-act="afterImpresa" class="primary">${out ? 'Lasciate il feudo' : 'Prosegui'}</button></div>`;
}

/** Riga del libro delle cronache. */
export function impresaSentence(id: ImpresaId, esito: EsitoImpresa | 'scaduta', amount: number): string {
  // le cronache scritte prima che ci fossero più carte non hanno l'id
  return (CARTE[id] ?? CARTE.decime).chr[esito](amount);
}
