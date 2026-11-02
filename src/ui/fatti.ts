/**
 * Fatti del reame: il bando dell'araldo con un'illustrazione per ogni fatto,
 * le scelte con i numeri del feudo, gli esiti, gli effetti in corso e le
 * frasi della cronaca. Le regole sono in src/domain/fatti.ts.
 */
import {
  CIAMBELLANO_BONUS, CIAMBELLANO_THEFT_CHANCE, CIAMBELLANO_YEARS, DECIMA, fireTarget, IMMIGRANT_FOOD, immigrantCount,
  MULINO_BONUS, MULINO_YEARS, mulinoCost, MUFFA, PROCESSO_COST, rebuildCost, RELIQUIA_YEARS, SDEGNO_MALUS, SDEGNO_YEARS,
  visitCost, type Effetto, type FattoId, type FattoOutcome,
} from '../domain/fatti';
import type { Player } from '../domain/types';
import { honorific } from './advisor';
import { ground, house, person, sky } from './comics';

const n = (v: number) => Math.abs(Math.floor(v)).toLocaleString('it-IT');
const pct = (v: number) => `${Math.round(v * 100)}%`;

interface Info {
  title: string;
  /** il bando, come lo legge l'araldo */
  text: string;
  /** illustrazione sul cartiglio (coordinate 0..120 x 0..80) */
  icon: string;
  good: boolean;
}

const cloud = (x: number, y: number) => `<g transform="translate(${x} ${y})" fill="#8a96a8"><circle cx="0" cy="0" r="12"/><circle cx="14" cy="-5" r="14"/><circle cx="28" cy="0" r="11"/><rect x="0" y="0" width="28" height="11"/></g>`;
const wheat = (x: number, y: number, c = '#d6b25a') => `<g transform="translate(${x} ${y})"><path d="M0 0 V-24" stroke="#a8801f" stroke-width="2"/>${[0, 1, 2].map(i => `<ellipse cx="${i % 2 ? 3 : -3}" cy="${-14 - i * 4}" rx="3" ry="5" fill="${c}"/>`).join('')}</g>`;
const coin = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="5" fill="#e3bb4f" stroke="#a8801f"/>`;
const mill = (x: number, y: number, broken = false) => `<g transform="translate(${x} ${y})"><path d="M-12 0 L-8 -34 H8 L12 0z" fill="#d9c49a" stroke="#6b5a47"/>
  <g transform="translate(0 -30)"><g class="${broken ? '' : 'a-spin'}">${[0, 90, 180, 270].map(a => `<rect x="-2" y="-26" width="4" height="26" fill="#8a6b3e" transform="rotate(${broken && a === 90 ? a + 25 : a})"/>`).join('')}</g></g>
  ${broken ? '<path d="M-6 -16 l12 8 M6 -16 l-12 8" stroke="#8b2a1e" stroke-width="3"/>' : ''}</g>`;
const flame = (x: number, y: number, s = 1) => `<path class="a-flicker" transform="translate(${x} ${y}) scale(${s})" d="M0 0 q-12 -12 0 -30 q12 14 0 30z" fill="#f2a33a"/>`;

const INFO: Record<FattoId, Info> = {
  piogge: {
    title: 'Piogge abbondanti', good: true,
    text: 'Le piogge sono state abbondanti, e il raccolto supera ogni previsione.',
    icon: `${cloud(30, 20)}${[38, 48, 58, 68].map(x => `<path class="a-rain" d="M${x} 32 l-3 8" stroke="#4a7fa8" stroke-width="2"/>`).join('')}${[20, 34, 48, 62, 76, 90].map(x => wheat(x, 78)).join('')}`,
  },
  mulino: {
    title: 'Un mulino nuovo', good: true,
    text: 'Un mastro artigiano propone una nuova tecnica per macinare il grano, e chiede chi la finanzi.',
    icon: `${mill(60, 74)}${person(96, 76, '#6e4a2f', '')}`,
  },
  immigrati: {
    title: 'Profughi alle porte', good: true,
    text: 'Famiglie in fuga da guerre e carestie chiedono di stabilirsi nelle vostre terre.',
    icon: [24, 44, 64, 84].map((x, i) => person(x, 76, ['#6e4a2f', '#5b6b3a', '#7a3a2a', '#4a5a7a'][i], '')).join(''),
  },
  eredita: {
    title: 'Eredità inaspettata', good: true,
    text: 'Un nobile senza discendenti lascia i suoi beni al vostro casato.',
    icon: `<rect x="34" y="40" width="52" height="34" fill="#8a5a2a" stroke="#3e2617" stroke-width="2"/><path d="M34 40 q26 -22 52 0" fill="#a8703a" stroke="#3e2617" stroke-width="2"/>
      <rect x="56" y="48" width="8" height="10" fill="#e3bb4f"/>${coin(28, 70)}${coin(92, 68)}${coin(98, 60)}`,
  },
  reliquia: {
    title: 'Spoglie di un santo', good: true,
    text: 'Nella vecchia pieve si trovano le spoglie di un santo: da tutto il regno arrivano pellegrini.',
    icon: `<rect x="42" y="38" width="36" height="30" fill="#e3bb4f" stroke="#8a6420" stroke-width="2"/><path d="M42 38 L60 22 L78 38z" fill="#d6a03a" stroke="#8a6420" stroke-width="2"/>
      <path d="M60 44 v18 M53 50 h14" stroke="#8b2a1e" stroke-width="3"/><circle cx="60" cy="30" r="20" fill="none" stroke="#fff3a0" stroke-width="2" class="a-glow"/>
      ${person(20, 78, '#6e4a2f', '')}${person(100, 78, '#5b6b3a', '')}`,
  },
  visitaRe: {
    title: 'Visita del re', good: true,
    text: 'Il re in persona annuncia che passerà dal vostro feudo con tutta la corte.',
    icon: `${person(60, 76, '#8b2a1e', '<path d="M-8 -34 l2 -8 3 5 3 -7 3 7 3 -5 2 8z" fill="#e3bb4f" stroke="#8a6420"/>')}
      <path d="M86 76 V24" stroke="#6b4a2c" stroke-width="3"/><path class="a-flag" d="M88 24 h22 l-6 7 6 7 h-22z" fill="#2e4fa3"/>${person(30, 76, '#2e5fa3', '')}`,
  },
  incendio: {
    title: 'Incendio nel mercato', good: false,
    text: 'Durante la notte un vasto incendio divampa fra le botteghe.',
    icon: `${house(30, 76, 30, '#6b4a2c')}${house(66, 76, 30, '#6b4a2c')}${flame(44, 50, 1.2)}${flame(80, 48, 1.4)}${flame(62, 58)}`,
  },
  cavallette: {
    title: 'Invasione di cavallette', good: false,
    text: 'Sciami di cavallette scendono sui campi e divorano parte delle coltivazioni.',
    icon: `${[20, 40, 60, 80, 100].map(x => wheat(x, 78, '#9a8a5a')).join('')}${[[30, 20], [52, 30], [76, 18], [96, 34], [40, 42], [70, 40]].map(([x, y], i) =>
      `<g class="a-bob" style="animation-delay:${i * 0.1}s"><ellipse cx="${x}" cy="${y}" rx="6" ry="2.5" fill="#5b6b3a"/><path d="M${x - 4} ${y} l-3 4 M${x + 2} ${y} l3 4" stroke="#3e4a2a"/></g>`).join('')}`,
  },
  ciambellano: {
    title: 'Il ciambellano infedele', good: false,
    text: 'Il ciambellano viene sorpreso mentre sottrae denaro dalle casse del palazzo.',
    icon: `${person(50, 76, '#6b2a6b', '<path d="M-8 -36 h16 l-3 -6 h-10z" fill="#3e2617"/>')}<rect x="66" y="52" width="26" height="22" fill="#8a5a2a" stroke="#3e2617"/>${coin(70, 48)}${coin(80, 44)}${coin(90, 48)}`,
  },
  mulinoGuasto: {
    title: 'Il mulino si guasta', good: false,
    text: 'La ruota del mulino si spezza: per quest\'anno si macina a mano, e la gabella della macina rende la metà.',
    icon: `${mill(60, 76, true)}`,
  },
  muffa: {
    title: 'Muffa nei granai', good: false,
    text: 'L\'umidità entra nei granai: una parte del grano conservato ammuffisce.',
    icon: `<path d="M24 76 V40 L60 18 L96 40 V76z" fill="#b08a5a" stroke="#5a3d26" stroke-width="2"/>${[[40, 56], [58, 48], [76, 60], [50, 68], [70, 40]].map(([x, y]) =>
      `<circle cx="${x}" cy="${y}" r="5" fill="#6b8a4a" opacity=".85"/>`).join('')}`,
  },
  decima: {
    title: 'La decima del vescovo', good: false,
    text: 'Il vescovo reclama per la Chiesa una decima straordinaria sulle rendite dell\'anno.',
    icon: `<path d="M40 76 V40 H80 V76z" fill="#d9c49a" stroke="#6b5a47" stroke-width="2"/><path d="M36 40 L60 20 L84 40z" fill="#8b2a1e"/><path d="M60 6 v14 M54 12 h12" stroke="#e3bb4f" stroke-width="3"/>
      <rect x="54" y="56" width="12" height="20" fill="#6b4a2c"/>${person(98, 78, '#5b2a6e', '<path d="M-5 -36 l5 -10 5 10z" fill="#f3f0e6"/>')}`,
  },
};

export const fattoTitle = (id: FattoId) => INFO[id].title;

/** La vignetta del bando: l'araldo in piazza e il cartiglio illustrato. */
export function fattoScene(id: FattoId): string {
  const i = INFO[id];
  return `<figure class="comic fatto-${i.good ? 'good' : 'bad'}">
    <figcaption class="comic-caption">${i.text}</figcaption>
    <svg viewBox="0 0 320 180" class="comic-scene" role="img" aria-label="${i.title}">
      ${sky(i.good ? '#9cc3e6' : '#b89a8a', i.good ? '#efe6d0' : '#e8d3b0', `skf-${id}`)}${ground(i.good ? '#8fae5a' : '#8a7a4e')}
      ${person(52, 150, '#2e5fa3', '<path d="M8 -26 l12 -6 v10z" fill="#e3bb4f"/>')}
      <g transform="translate(90 34)"><rect x="-6" y="-6" width="132" height="98" rx="6" fill="#f6ecd2" stroke="#8a6b3e" stroke-width="3"/>
        <svg x="0" y="0" width="120" height="86" viewBox="0 0 120 86">${i.icon}</svg></g>
    </svg>
    <div class="comic-sound" aria-hidden="true">${i.good ? 'UDITE! UDITE!' : 'AHIMÈ!'}</div>
  </figure>`;
}

export interface FattoOptionText { label: string; sub: string; emblem: string }

/** Le scelte con i numeri del feudo. */
export function fattoOptionText(p: Player, id: FattoId, opt: string): FattoOptionText {
  switch (`${id}:${opt}`) {
    case 'mulino:finanziare': return { emblem: '⚙', label: 'Finanziare il progetto', sub: `${n(mulinoCost(p))} scudi: i campi rendono il ${pct(MULINO_BONUS)} in più per ${MULINO_YEARS} anni, a cominciare da quest'anno.` };
    case 'mulino:rifiutare': return { emblem: '✗', label: 'Rifiutare', sub: 'nessuna spesa, nessun effetto.' };
    case 'immigrati:accogliere': return { emblem: '⌂', label: 'Accoglierli', sub: `da ${n(immigrantCount(p, 0))} a ${n(immigrantCount(p, 1))} nuovi servi; ognuno costa ${IMMIGRANT_FOOD} misure di grano. A volte portano una malattia.` };
    case 'immigrati:respingere': return { emblem: '✗', label: 'Respingerli', sub: 'nessun effetto.' };
    case 'incendio:ricostruire': return { emblem: '⚒', label: 'Ricostruire subito', sub: `${n(rebuildCost(p))} scudi, metà del prezzo di ${fireTarget(p) === 'mercato' ? 'un mercato' : 'un opificio'} nuovo.` };
    case 'incendio:attendere': return { emblem: '⌛', label: 'Attendere tempi migliori', sub: `${fireTarget(p) === 'mercato' ? 'il mercato bruciato' : "l'opificio bruciato"} è perduto.` };
    case 'ciambellano:processare': return { emblem: '⚖', label: 'Processarlo', sub: `il processo costa ${PROCESSO_COST} scudi, ma non ruberà più.` };
    case 'ciambellano:occhio': return { emblem: '◐', label: 'Chiudere un occhio', sub: `è bravo nei conti: rendite +${pct(CIAMBELLANO_BONUS)} per ${CIAMBELLANO_YEARS} anni, ma ogni anno c'è il ${pct(CIAMBELLANO_THEFT_CHANCE)} che rubi ancora.` };
    case 'visitaRe:sontuosa': return { emblem: '♛', label: 'Accoglienza sontuosa', sub: `${n(visitCost(p))} scudi in contanti; il prestigio del casato cresce del doppio della spesa (conta per il rango).` };
    case 'visitaRe:modesta': return { emblem: '◇', label: 'Accoglienza modesta', sub: `nessuna spesa, ma il re se ne ricorda: rendite -${pct(SDEGNO_MALUS)} per ${SDEGNO_YEARS} anni.` };
    default: return { emblem: '?', label: opt, sub: '' };
  }
}

/** Didascalia dell'esito. */
export function fattoCaption(o: FattoOutcome, p: Player): string {
  const h = honorific(p);
  switch (o.id) {
    case 'piogge': return `Quest'anno sul mercato ci sono ${n(o.raccolto ?? 0)} misure di grano in più, ${h}.`;
    case 'cavallette': return `Le cavallette si mangiano ${n(o.raccolto ?? 0)} misure del raccolto, e il grano rincara di ${n(o.prezzo ?? 0)} scudi ogni mille.`;
    case 'mulino': return o.option === 'finanziare' ? `Il mulino nuovo gira già: quest'anno ${n(o.raccolto ?? 0)} misure in più, e così per ${MULINO_YEARS} anni.` : 'Il mastro se ne va a cercare un altro signore.';
    case 'immigrati': return o.option === 'accogliere' ? `Le famiglie si stabiliscono nel feudo: ${o.servi >= 0 ? `${n(o.servi)} servi in più` : `ma portano una malattia, e i servi calano di ${n(o.servi)}`}, sfamati con ${n(o.grano)} misure di grano.` : 'Le famiglie riprendono la strada, verso un altro feudo.';
    case 'eredita':
      return o.acri ? `Il lascito comprende ${o.acri} acri di buona terra.` : o.mercati ? 'Il lascito comprende un mercato avviato.' : o.opifici ? 'Il lascito comprende un opificio sul fiume.' : `Il lascito vale ${n(o.scudi)} scudi sonanti.`;
    case 'incendio':
      if (o.option === 'ricostruire') return `Le botteghe si ricostruiscono subito: ${n(o.scudi)} scudi.`;
      if (o.mercati) return 'Il mercato bruciato resta un cumulo di cenere.';
      if (o.opifici) return "L'opificio bruciato resta un cumulo di cenere.";
      return `Non c'erano botteghe: il fuoco si prende ${n(o.grano)} misure di grano.`;
    case 'ciambellano':
      return `Il ciambellano aveva già sottratto ${n(o.furto ?? 0)} scudi. ${o.option === 'processare' ? `Il processo costa ${PROCESSO_COST} scudi, ma il ladro finisce in catene.` : 'Resta al suo posto: è bravo, ma va tenuto d\'occhio.'}`;
    case 'reliquia': return `Per ${RELIQUIA_YEARS} anni i pellegrini lasceranno offerte (1 scudo ogni 10 servi)${o.umore ? ', e il popolo festeggia' : ''}.`;
    case 'visitaRe': return o.option === 'sontuosa' ? `Banchetti, tornei e cantori: ${n(o.scudi)} scudi spesi, e il prestigio del casato cresce di ${n(o.prestigio ?? 0)}.` : `Il re riparte con la bocca storta, ${h}: per ${SDEGNO_YEARS} anni le rendite caleranno.`;
    case 'mulinoGuasto': return 'Per quest\'anno la gabella della macina renderà la metà.';
    case 'muffa': return `Si buttano ${n(o.grano)} misure di grano ammuffito (il ${pct(MUFFA)} dei granai).`;
    case 'decima': return `All'incasso delle rendite il vescovo prenderà il ${pct(DECIMA)}.`;
  }
}

/** Badge degli effetti. */
export function fattoBadges(o: FattoOutcome): string {
  const b = (v: number | undefined, unit: string) => (!v ? '' : `<span class="badge ${v > 0 ? 'gain' : 'loss'}">${v > 0 ? '+' : '−'}${n(v)} ${unit}</span>`);
  const all = b(o.scudi, 'scudi') + b(o.servi, 'servi') + b(o.grano, 'grano') + b(o.raccolto, 'raccolto') + b(o.acri, 'acri') + b(o.mercati, 'mercati') + b(o.opifici, 'opifici') + b(o.prestigio, 'prestigio') + b(o.umore, 'umore');
  return `<div class="badges">${all || '<span class="badge">nessun effetto immediato</span>'}</div>`;
}

/** Effetti in corso di un signore, per la striscia sotto la barra delle risorse. */
export function effettoText(e: Effetto): string {
  const until = `fino al ${900 + e.until}`;
  switch (e.kind) {
    case 'mulino': return `Mulino nuovo: raccolto +${pct(MULINO_BONUS)} (${until})`;
    case 'reliquia': return `Pellegrini al santuario (${until})`;
    case 'ciambellano': return `Ciambellano abile ma infedele: rendite +${pct(CIAMBELLANO_BONUS)} (${until})`;
    case 'sdegno': return `Il re è sdegnato: rendite -${pct(SDEGNO_MALUS)} (${until})`;
    case 'mulinoGuasto': return 'Mulino guasto: macina dimezzata quest\'anno';
    case 'decima': return `Decima del vescovo: ${pct(DECIMA)} delle rendite quest'anno`;
  }
}

export function effettiStrip(p: Player): string {
  const es = p.effetti ?? [];
  if (!es.length) return '';
  return `<div class="pacts-strip"><span class="pacts-title">Nel feudo:</span>${es.map(e => `<span class="pact">${effettoText(e)}</span>`).join('')}</div>`;
}

/** Frase della cronaca. */
export function fattoSentence(o: FattoOutcome): string {
  switch (o.id) {
    case 'piogge': return `Le piogge furono generose, e il raccolto crebbe di ${n(o.raccolto ?? 0)} misure.`;
    case 'cavallette': return `Le cavallette divorarono ${n(o.raccolto ?? 0)} misure del raccolto.`;
    case 'mulino': return o.option === 'finanziare' ? `Finanziò un mulino di nuova fattura, con ${n(o.scudi)} scudi.` : 'Rifiutò di finanziare il mulino di un mastro forestiero.';
    case 'immigrati': return o.option === 'accogliere' ? `Accolse nelle sue terre famiglie di profughi${o.servi > 0 ? `: ${n(o.servi)} nuovi servi` : ', che portarono però una malattia'}.` : 'Respinse le famiglie di profughi che chiedevano asilo.';
    case 'eredita': return `Un nobile senza eredi lasciò i suoi beni al casato${o.acri ? `: ${o.acri} acri di terra` : o.mercati ? ': un mercato' : o.opifici ? ': un opificio' : `: ${n(o.scudi)} scudi`}.`;
    case 'incendio': return o.option === 'ricostruire' ? `Un incendio devastò le botteghe, ed egli le fece ricostruire con ${n(o.scudi)} scudi.` : `Un incendio devastò ${o.mercati ? 'un mercato' : o.opifici ? 'un opificio' : 'i granai'}${o.option ? ', ed egli non lo ricostruì' : ''}.`;
    case 'ciambellano': return `Il ciambellano fu sorpreso a rubare ${n(o.furto ?? 0)} scudi; ${o.option === 'processare' ? 'fu processato e messo in catene' : 'il signore chiuse un occhio'}.`;
    case 'reliquia': return 'Nella pieve si trovarono le spoglie di un santo, e i pellegrini presero a giungere da ogni dove.';
    case 'visitaRe': return o.option === 'sontuosa' ? `Il re visitò il feudo, accolto con feste che costarono ${n(o.scudi)} scudi e diedero gran lustro al casato.` : 'Il re visitò il feudo e ne ripartì offeso per la povera accoglienza.';
    case 'mulinoGuasto': return 'La ruota del mulino si spezzò, e per un anno si macinò a mano.';
    case 'muffa': return `L'umidità guastò ${n(o.grano)} misure di grano nei granai.`;
    case 'decima': return 'Il vescovo reclamò una decima straordinaria.';
  }
}

export const annualSentence = (kind: 'furto' | 'decima' | 'pellegrini', amount: number) => ({
  furto: `Il ciambellano tornò a rubare: sparirono ${n(amount)} scudi.`,
  decima: `Versò al vescovo ${n(amount)} scudi di decima.`,
  pellegrini: `I pellegrini lasciarono offerte per ${n(amount)} scudi.`,
}[kind]);

