/**
 * Fazioni storiche: stemmi, scene animate, testi delle scelte, esiti, patti
 * e frasi della cronaca. Solo presentazione: le regole sono in
 * src/domain/fazioni.ts. Le scene si registrano fra le vignette degli
 * imprevisti (COMICS), così vignetta e miniatura della cronaca funzionano
 * come per gli imprevisti del listato.
 */
import {
  ACCORDI_MARKET_BONUS, bribeCost, DEVASTATION_HARVEST_LOSS, FACTION_EVENT, factionOfEvent, marriageCost, PROTETTORATO_TRADE_BONUS,
  PROTETTORATO_TRIBUTE, tributeCost, VASSALLO_HARVEST_TAX, type Defense, type FactionId, type FactionOption, type Pact, type PactKind,
} from '../domain/fazioni';
import type { ChronicleFact, EventOutcome, Player } from '../domain/types';
import { honorific } from './advisor';
import { bubble, castle, COMICS, ground, helmet, house, person, shield, sky, spear } from './comics';
import { pick } from './speaker';

const n = (v: number) => Math.abs(Math.floor(v)).toLocaleString('it-IT');
const pct = (v: number) => `${Math.round(v * 100)}%`;

// ---------------------------------------------------------------- stemmi

const SHIELD = 'M-30 -36 H30 V0 Q30 26 0 38 Q-30 26 -30 0 Z';

const lily = (x: number, y: number, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#e3bb4f" stroke="#8a6420" stroke-width=".8">
  <path d="M0 -12 C5 -6 4 0 0 4 C-4 0 -5 -6 0 -12z"/><path d="M-2 2 C-10 -2 -12 -8 -7 -10 C-6 -5 -4 -2 -1 0z"/><path d="M2 2 C10 -2 12 -8 7 -10 C6 -5 4 -2 1 0z"/>
  <rect x="-5" y="3" width="10" height="2.5"/><path d="M-1.5 5.5 h3 l-1.5 5z"/></g>`;

/** Stemma di ciascuna fazione, centrato in (0,0), alto circa 76. */
const CREST: Record<FactionId, string> = {
  // Franchi: gigli d'oro in campo azzurro
  franchi: `<path d="${SHIELD}" fill="#2e4fa3"/>${lily(-13, -16)}${lily(13, -16)}${lily(0, 10)}`,
  // Ungari: fasciato di rosso e d'argento
  ungari: `<clipPath id="cl-ung"><path d="${SHIELD}"/></clipPath><g clip-path="url(#cl-ung)">${[...Array(8)].map((_, i) =>
    `<rect x="-30" y="${-36 + i * 9.3}" width="60" height="9.3" fill="${i % 2 ? '#f3f0e6' : '#b8321e'}"/>`).join('')}</g>`,
  // Longobardi: corona ferrea d'oro in campo rosso
  longobardi: `<path d="${SHIELD}" fill="#8b2a1e"/><g fill="#e3bb4f" stroke="#8a6420" stroke-width="1">
    <path d="M-18 6 V-10 L-11 -2 L-5 -16 L0 -4 L5 -16 L11 -2 L18 -10 V6 Z"/><rect x="-18" y="6" width="36" height="7"/></g>
    <g fill="#2e5fa3">${[-11, 0, 11].map(x => `<circle cx="${x}" cy="9.5" r="2.2"/>`).join('')}</g>`,
  // Bizantini: aquila bicipite d'oro in campo porpora
  bizantini: `<path d="${SHIELD}" fill="#5b2a6e"/><g fill="#e3bb4f" stroke="#8a6420" stroke-width="1">
    <path d="M0 -6 C-6 -16 -16 -20 -26 -14 C-20 -8 -14 -2 -6 0 C-14 4 -18 12 -16 20 L-6 8 L-4 22 L0 12 L4 22 L6 8 L16 20 C18 12 14 4 6 0 C14 -2 20 -8 26 -14 C16 -20 6 -16 0 -6z"/>
    <circle cx="-8" cy="-14" r="4"/><circle cx="8" cy="-14" r="4"/><path d="M-12 -22 l4 -6 4 6z M4 -22 l4 -6 4 6z"/></g>`,
  // Saraceni: mezzaluna e stella d'argento in campo verde
saraceni: `<path d="${SHIELD}" fill="#2f6b3a"/><circle cx="-4" cy="-2" r="17" fill="#f3f0e6"/><circle cx="3" cy="-4" r="14" fill="#2f6b3a"/>
    <path d="M12 -8 l2.4 5 5.4 .6 -4 3.6 1.2 5.4 -5 -2.8 -5 2.8 1.2 -5.4 -4 -3.6 5.4 -.6z" fill="#f3f0e6"/>`,
};

/** Stemma come SVG autonomo (per carte, esiti e cronaca). */
export function crest(f: FactionId, size = 64): string {
  return `<svg viewBox="-34 -40 68 82" width="${size}" height="${Math.round(size * 82 / 68)}" class="crest" role="img" aria-label="stemma dei ${INFO[f].name}">
    <g stroke="#2b2118" stroke-width="2.5" fill="none"><path d="${SHIELD}"/></g>${CREST[f]}<path d="${SHIELD}" fill="none" stroke="#2b2118" stroke-width="2.5"/></svg>`;
}

const crestAt = (f: FactionId, x: number, y: number, s: number) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${CREST[f]}<path d="${SHIELD}" fill="none" stroke="#2b2118" stroke-width="2.5"/></g>`;

// ---------------------------------------------------------------- scene

const horse = (x: number, y: number, coat: string, rider: string) => `<g transform="translate(${x} ${y})">
  <path d="M-16 -4 l-4 14 M-10 -2 l2 12 M8 -2 l-3 12 M14 -4 l5 13" stroke="#3e2617" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="0" cy="-8" rx="20" ry="9" fill="${coat}"/><path d="M16 -12 l10 -12 6 3 -4 4 -6 9z" fill="${coat}"/><path d="M-20 -10 q-8 2 -8 10" stroke="${coat}" stroke-width="4" fill="none"/>
  ${rider}</g>`;
const rider = (body: string, extra = '') => `<g transform="translate(0 -14)"><path d="M-7 -20 h14 l2 18 h-18z" fill="${body}"/><circle cx="0" cy="-26" r="6" fill="#f0c9a0"/>${extra}</g>`;
const ship = (x: number, y: number, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-40 0 H40 L30 14 H-30 Z" fill="#6b4a2c" stroke="#3e2617" stroke-width="1.5"/>
  <path d="M0 0 V-46" stroke="#3e2617" stroke-width="2.5"/><path d="M2 -46 L34 -6 H2 Z" fill="#f3ecd8" stroke="#8a7f68"/>
  <path d="M-34 -2 V-10 M-24 -2 V-10 M-14 -2 V-10 M14 -2 V-10 M24 -2 V-10" stroke="#3e2617" stroke-width="1.5"/>
  <path d="M0 -46 l-10 4 10 4" fill="#2f6b3a"/></g>`;
const sea = (y: number, c = '#4a7fa8') => `<rect x="0" y="${y}" width="320" height="${180 - y}" fill="${c}"/>
  ${[0, 1, 2, 3].map(i => `<path class="a-wave" style="animation-delay:${i * 0.4}s" d="M${i * 80} ${y + 10 + (i % 2) * 8} q10 -6 20 0 t20 0" stroke="#cfe3f0" stroke-width="2" fill="none"/>`).join('')}`;
const banner = (x: number, y: number, f: FactionId) => `<g transform="translate(${x} ${y})"><path d="M0 0 V-58" stroke="#6b4a2c" stroke-width="3"/>
  <g class="a-flag">${crestAt(f, 13, -44, 0.3)}</g></g>`;

interface Info {
  /** nome al plurale, con l'articolo usato nelle frasi */
  name: string;
  the: string;
  /** chi si presenta */
  envoy: string;
  headline: string;
  /** parte dell'economia presa di mira */
  target: string;
  sound: string[];
  lines: string[];
  captions: (h: string) => string[];
  scene: (line: string) => string;
}

export const INFO: Record<FactionId, Info> = {
  franchi: {
    name: 'Franchi', the: 'i Franchi', envoy: 'Un conte franco', target: 'ricchezza e palazzi',
    headline: 'Un conte franco reclama la vostra obbedienza.',
    sound: ['TARATATA!', 'CLANG CLANG!'],
    lines: ['Obbedienza al re dei Franchi!', 'Piegate il capo, o pagate!', 'Il conte esige il suo!'],
    captions: h => [
      `Un conte franco giunge con i suoi cavalieri, ${h}. Pretende obbedienza, o un tributo degno del suo signore.`,
      `Stendardi azzurri con i gigli d'oro sulla strada del palazzo: i Franchi reclamano la vostra obbedienza, ${h}.`,
    ],
    scene: line => `${sky('#9cc3e6', '#e8f1f8', 'skf')}${ground('#8fae5a')}${castle(220, 150)}
      <g class="a-march">${[0, 1, 2].map(i => `<g class="a-bob" style="animation-delay:${i * 0.15}s">${person(40 + i * 34, 142, '#2e4fa3', helmet + shield('#e3bb4f') + spear)}</g>`).join('')}
        ${banner(150, 146, 'franchi')}</g>
      ${bubble(14, 24, line, 74, 100)}`,
  },
  ungari: {
    name: 'Ungari', the: 'gli Ungari', envoy: 'Cavalieri ungari', target: 'campi e raccolti',
    headline: 'Cavalieri ungari devastano le campagne.',
    sound: ['HUI! HUI!', 'TATAN TATAN!'],
    lines: ['Hui! Hui!', 'Al galoppo!', 'Fuoco ai campi!'],
    captions: h => [
      `Dalla pianura arrivano al galoppo i cavalieri ungari, ${h}: frecce, fuoco e campi in fiamme.`,
      `Una nube di polvere all'orizzonte: sono gli Ungari, e dove passano i loro cavalli non cresce più il grano.`,
    ],
    scene: line => `${sky('#e8a060', '#f6dcb0', 'sku')}${ground('#c9a94e')}
      ${[200, 240, 280].map((x, i) => `<g transform="translate(${x} 150)"><path d="M0 0 v-18 M-6 0 v-14 M6 0 v-14" stroke="#a8801f" stroke-width="3"/>
        <path class="a-flicker" style="animation-delay:${i * 0.1}s" d="M0 -14 q-9 -10 0 -24 q9 12 0 24z" fill="#f2a33a"/></g>`).join('')}
      <g class="a-run">${[0, 1].map(i => `<g class="a-bob" style="animation-delay:${i * 0.2}s">${horse(60 + i * 70, 148 - i * 6, i ? '#8a5a3a' : '#5a3d26',
        rider('#b8321e', '<path d="M10 -22 q10 8 0 18" stroke="#3e2617" stroke-width="2" fill="none"/>'))}</g>`).join('')}</g>
      ${bubble(14, 20, line, 70, 90)}`,
  },
  longobardi: {
    name: 'Longobardi', the: 'i Longobardi', envoy: 'Il duca longobardo', target: 'denaro e autonomia',
    headline: 'Il duca longobardo pretende fedeltà.',
    sound: ['TUM TUM TUM!', 'ALL\'ARMI!'],
    lines: ['Giurate fedeltà al duca!', 'Il duca vuole il suo!', 'Vassallo o nemico?'],
    captions: h => [
      `Il duca longobardo si presenta con la sua corona ferrea, ${h}. Pretende fedeltà: tributo, guerra, o un giuramento da vassallo.`,
      `Lance e scudi rossi davanti alle porte: il duca longobardo vuole sapere se siete amico o nemico, ${h}.`,
    ],
    scene: line => `${sky('#c9b48a', '#efe2c2', 'skl')}${ground('#9a8a5a')}${house(230, 150, 44)}
      <g class="a-march-in">${person(170, 142, '#8b2a1e', '<path d="M-8 -34 l2 -8 3 5 3 -7 3 7 3 -5 2 8z" fill="#e3bb4f" stroke="#8a6420"/>')}
        ${[0, 1].map(i => `<g class="a-bob" style="animation-delay:${i * 0.2}s">${person(110 - i * 32, 142, '#6e3a2a', helmet + shield('#8b2a1e') + spear)}</g>`).join('')}
        ${banner(196, 146, 'longobardi')}</g>
      ${bubble(14, 24, line, 160, 100)}`,
  },
  bizantini: {
    name: 'Bizantini', the: 'i Bizantini', envoy: 'Un governatore imperiale', target: 'mercati e opifici',
    headline: 'Un governatore imperiale rivendica il territorio.',
    sound: ['TRRR-TUUU!', 'SCRIIIC!'],
    lines: ["Per l'Imperatore dei Romani!", 'Questa terra è di Costantinopoli!', 'Firmate, e prospererete.'],
    captions: h => [
      `Un governatore imperiale sbarca con un rotolo sigillato, ${h}: rivendica il feudo per l'Imperatore. Guerra, protezione o un dono generoso?`,
      `Vesti di porpora e aquile d'oro: i Bizantini rivendicano il territorio, ma offrono anche ricchi commerci.`,
    ],
    scene: line => `${sky('#b8c8e8', '#efe6d0', 'skb')}${sea(118)}<path d="M0 150 Q80 120 170 128 L320 132 V180 H0z" fill="#d9c49a"/>
      <g class="a-drift">${ship(80, 112, 0.8)}</g>
      <g class="a-march-in">${person(220, 156, '#5b2a6e', '<path d="M-8 -34 h16 l-2 -6 h-12z" fill="#e3bb4f"/>')}
        <g transform="translate(232 128)"><g class="a-bob"><rect x="0" y="0" width="16" height="22" fill="#f6ecd2" stroke="#8a6b3e"/><circle cx="8" cy="22" r="4" fill="#8b2a1e"/></g></g>
        ${banner(270, 160, 'bizantini')}</g>
      ${bubble(14, 22, line, 210, 112)}`,
  },
  saraceni: {
    name: 'Saraceni', the: 'i Saraceni', envoy: 'Vele saracene', target: 'servi e commercio costiero',
    headline: "Vele saracene compaiono all'orizzonte.",
    sound: ['SPLASH!', 'AL PORTO! AL PORTO!'],
    lines: ['Vele all\'orizzonte!', 'Al porto, presto!', 'Arrivano dal mare!'],
    captions: h => [
      `Vele saracene all'orizzonte, ${h}! Le navi puntano dritte al porto: saccheggio, riscatto o un accordo coi mercanti d'oltremare?`,
      `Dalla torre di guardia si vedono le vele triangolari dei Saraceni. Cercano oro, merci e uomini da portare via.`,
    ],
    scene: line => `${sky('#7fb0d8', '#f2e2b8', 'sks')}${sea(100, '#3f78a3')}
      <path d="M200 112 L320 108 V180 H180 Q186 140 200 112z" fill="#d9c49a"/>${house(250, 140, 34)}
      <g class="a-sneak">${[0, 1].map(i => `<g class="a-bob" style="animation-delay:${i * 0.3}s">${ship(60 + i * 90, 132 + i * 8, 0.75 - i * 0.1)}</g>`).join('')}</g>
      ${person(232, 140, '#6e4a2f', '')}
      ${bubble(14, 20, line, 232, 100)}`,
  },
};

// le scene diventano vignette degli imprevisti (fumetto animato e miniatura del libro)
for (const f of Object.keys(INFO) as FactionId[]) {
  const i = INFO[f];
  COMICS[FACTION_EVENT[f]] = { sound: i.sound, lines: i.lines, captions: i.captions, scene: i.scene };
}

// ---------------------------------------------------------------- scelte

export interface OptionText {
  label: string;
  sub: string;
  emblem: string;
}

/** Etichetta e conseguenze di una scelta, con i numeri del feudo. */
export function optionText(p: Player, f: FactionId, opt: FactionOption, winP = 0.5): OptionText {
  const chance = pct(winP);
  const fight = (label: string, risk: string) => ({ label, emblem: '⚔', sub: `vittoria ${chance} circa: bottino e meno attacchi per 6 anni. Se perdete: ${risk}` });
  const yrs = (k: PactKind) => ({ respinti: 6, tributari: 5, matrimonio: 8, vassallo: 8, protettorato: 8, corrotti: 4, accordi: 8, devastati: 3 }[k]);
  switch (opt) {
    case 'combattere':
      return f === 'franchi'
        ? fight('Combattere', 'denaro, servi e un piano del palazzo')
        : fight('Combattere', 'scudi e qualche servo');
    case 'affrontare': return fight('Affrontarli', 'molti servi, grano e campi devastati per 3 anni');
    case 'rifiutare': return fight('Rifiutare: guerra', 'un mercato, un opificio e qualche servo');
    case 'difendere': return fight('Difendere il porto', 'servi portati via come schiavi e un mercato');
    case 'tributo':
      return { label: 'Pagare tributo', emblem: '⚖', sub: `${n(tributeCost(p, f))} scudi, nessun rischio. Ma chi paga attira nuove richieste per ${yrs('tributari')} anni.` };
    case 'matrimonio':
      return { label: 'Matrimonio dinastico', emblem: '♥', sub: `dote di ${n(marriageCost(p))} scudi in contanti: niente Franchi per ${yrs('matrimonio')} anni e un nuovo piano del palazzo.` };
    case 'mura':
      return { label: 'Chiudersi nelle mura', emblem: '♜', sub: `i servi sono salvi, ma bruciano il 40% del grano e i campi rendono il ${pct(DEVASTATION_HARVEST_LOSS)} in meno per ${yrs('devastati')} anni.` };
    case 'passaggio':
      return { label: 'Pagare il passaggio', emblem: '⚖', sub: `un quarto del grano (${n(p.grano * 0.25)} misure) e nessun altro danno. Torneranno più facilmente.` };
    case 'vassallo':
      return { label: 'Diventare vassallo', emblem: '♛', sub: `per ${yrs('vassallo')} anni niente Longobardi e attacchi dimezzati, ma il duca prende il ${pct(VASSALLO_HARVEST_TAX)} di ogni raccolto.` };
    case 'protettorato':
      return { label: 'Accettare il protettorato', emblem: '☩', sub: `per ${yrs('protettorato')} anni quasi nessun attacco e mercati e opifici rendono il ${pct(PROTETTORATO_TRADE_BONUS)} in più, ma ogni anno il ${pct(PROTETTORATO_TRIBUTE)} della rendita va all'Impero.` };
    case 'corrompere':
      return { label: 'Corrompere il governatore', emblem: '✉', sub: `${n(bribeCost(p))} scudi subito, nessuna guerra, e per ${yrs('corrotti')} anni il governatore chiude un occhio.` };
    case 'riscatto':
      return { label: 'Pagare un riscatto', emblem: '⚖', sub: p.scudi >= tributeCost(p, f) ? `${n(tributeCost(p, f))} scudi, nessun rischio. Torneranno più facilmente.` : `il tesoro non basta: un quarto del grano. Torneranno più facilmente.` };
    case 'saccheggio':
      return { label: 'Lasciare saccheggiare', emblem: '⚐', sub: 'nessun morto, ma bruciano un mercato e un opificio (o il 30% del grano, se non ne avete).' };
    case 'accordi':
      return { label: 'Accordi commerciali', emblem: '☾', sub: `per ${yrs('accordi')} anni i mercati rendono il ${pct(ACCORDI_MARKET_BONUS)} in più, ma le vele saracene torneranno più spesso.` };
  }
}

// ---------------------------------------------------------------- esiti e patti

/** Descrizione di un patto in vigore. */
export function pactText(x: Pact): string {
  const until = `fino al ${900 + x.until}`;
  const the = INFO[x.faction].the;
  switch (x.kind) {
    case 'respinti': return `${cap(the)} sono stati respinti: torneranno di rado (${until})`;
    case 'tributari': return `Avete pagato ${the}: tornano più facilmente (${until})`;
    case 'matrimonio': return `Parentela con una casata franca: niente Franchi (${until})`;
    case 'vassallo': return `Vassallo del duca longobardo: meno attacchi, ma il ${pct(VASSALLO_HARVEST_TAX)} del raccolto al duca (${until})`;
    case 'protettorato': return `Protettorato bizantino: quasi nessun attacco, commercio +${pct(PROTETTORATO_TRADE_BONUS)}, tributo del ${pct(PROTETTORATO_TRIBUTE)} (${until})`;
    case 'corrotti': return `Il governatore bizantino è stato comprato (${until})`;
    case 'accordi': return `Accordi con i Saraceni: mercati +${pct(ACCORDI_MARKET_BONUS)}, ma più incursioni (${until})`;
    case 'devastati': return `Campi devastati dagli Ungari: raccolto -${pct(DEVASTATION_HARVEST_LOSS)} (${until})`;
  }
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Didascalia dell'esito di una scelta. */
export function outcomeCaption(o: EventOutcome, p: Player): string {
  const f = o.faction!, h = honorific(p), the = INFO[f].the;
  const losses = lossText(o);
  const odds = o.nemici ? ` Le vostre forze (${n(o.difesa ?? 0)}) contro ${n(o.nemici)} nemici.` : '';
  if (o.win === true) return pick([`Vittoria, ${h}! ${cap(the)} fuggono e lasciano un bottino di ${n(o.scudi)} scudi.`, `${cap(the)} sono respinti! Il bottino vale ${n(o.scudi)} scudi.`]) + (o.servi ? ` Sono caduti ${n(o.servi)} dei vostri.` : '') + odds;
  if (o.win === false) return `La battaglia è perduta, ${h}. ${f === 'saraceni' ? `I Saraceni portano via ${n(o.servi)} servi come schiavi` : `Perdite: ${losses}`}.${odds}`;
  switch (o.option) {
    case 'tributo': return `Il tributo è pagato: ${n(o.scudi)} scudi. ${cap(the)} se ne vanno soddisfatti, e se ne ricorderanno.`;
    case 'matrimonio': return `Le nozze sono celebrate con gran pompa: la dote costa ${n(o.scudi)} scudi${o.palazzo ? ', e la sposa porta in dono un nuovo piano del palazzo' : ''}. I Franchi ora sono parenti.`;
    case 'mura': return `Le porte restano chiuse e nessuno muore, ma fuori gli Ungari bruciano ${n(o.grano ?? 0)} misure di grano e devastano i campi.`;
    case 'passaggio': return `Gli Ungari prendono ${n(o.grano ?? 0)} misure di grano e passano oltre, senza altri danni.`;
    case 'vassallo': return `Avete giurato fedeltà al duca longobardo, ${h}. Vi proteggerà, ma ogni anno vorrà la sua parte del raccolto.`;
    case 'protettorato': return `Il sigillo imperiale è apposto: il feudo è sotto la protezione di Costantinopoli. I mercanti greci arriveranno presto.`;
    case 'corrompere': return `Il governatore intasca ${n(o.scudi)} scudi, sorride e se ne torna da dove è venuto.`;
    case 'riscatto': return `Il riscatto è pagato (${losses}): le navi riprendono il largo.`;
    case 'saccheggio': return `I Saraceni saccheggiano senza toccare nessuno: ${losses}.`;
    case 'accordi': return `Si firmano gli accordi: spezie e sete arriveranno nei vostri mercati, e con loro altre vele saracene.`;
    default: return losses;
  }
}

function lossText(o: EventOutcome): string {
  const parts = [
    o.scudi < 0 ? `${n(o.scudi)} scudi` : '',
    o.servi < 0 ? `${n(o.servi)} servi` : '',
    o.grano ? `${n(o.grano)} misure di grano` : '',
    o.mercati ? `${n(o.mercati)} ${Math.abs(o.mercati) === 1 ? 'mercato' : 'mercati'}` : '',
    o.opifici ? `${n(o.opifici)} ${Math.abs(o.opifici) === 1 ? 'opificio' : 'opifici'}` : '',
    o.palazzo && o.palazzo < 0 ? 'un piano del palazzo' : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ').replace(/, ([^,]*)$/, ' e $1') : 'nessuna';
}

/** Badge degli effetti, compresi i beni e i patti. */
export function factionBadges(o: EventOutcome): string {
  const b = (v: number | undefined, unit: string) =>
    !v ? '' : `<span class="badge ${v > 0 ? 'gain' : 'loss'}">${v > 0 ? '+' : '−'}${n(v)} ${unit}</span>`;
  const all = b(o.scudi, 'scudi') + b(o.servi, 'servi') + b(o.grano, 'grano') + b(o.mercati, 'mercati') + b(o.opifici, 'opifici') + b(o.palazzo, 'piani di palazzo');
  const pacts = (o.pacts ?? []).map(x => `<li>${pactText(x)}</li>`).join('');
  return `<div class="badges">${all || '<span class="badge">nessuna perdita</span>'}</div>${pacts ? `<ul class="pacts">${pacts}</ul>` : ''}`;
}

/** Riquadro delle forze in campo: l'orda contro servi, soldati e mura. */
export function forcesBox(f: FactionId, nemici: number, d: Defense, winP: number, servi: number): string {
  const parts = [`${n(servi)} servi × ½ = <b>${n(d.servi)}</b>`];
  if (d.soldati) parts.push(`soldati <b>${n(d.soldati)}</b>`);
  const walls = d.mura > 1 ? ` · mura ×${d.mura.toFixed(1).replace('.', ',')}` : '';
  return `<div class="forces">
    <div class="forces-side enemy">${crest(f, 28)}<span>Nemici</span><b>${n(nemici)}</b></div>
    <div class="forces-vs">contro</div>
    <div class="forces-side ours"><span>Le vostre forze</span><b>${n(d.total)}</b><small>${parts.join(' + ')}${walls}</small></div>
    <div class="forces-odds">vittoria ${pct(winP)} circa</div>
  </div>`;
}

/** Striscia dei patti in vigore di un signore. */
export function pactsStrip(p: Player): string {
  const ps = p.patti ?? [];
  if (!ps.length) return '';
  return `<div class="pacts-strip"><span class="pacts-title">Patti:</span>${ps.map(x =>
    `<span class="pact" title="${pactText(x)}">${crest(x.faction, 18)} ${pactText(x)}</span>`).join('')}</div>`;
}

// ---------------------------------------------------------------- cronaca

type EventFact = Extract<ChronicleFact, { t: 'event' }>;

/** Frase della cronaca per l'attacco di una fazione (undefined se non è un attacco). */
export function factionSentence(f: EventFact): string | undefined {
  const fac = f.faction ?? factionOfEvent(f.id);
  if (!fac) return undefined;
  const i = INFO[fac];
  const head = `${i.headline.replace('la vostra', 'la sua')}`;
  const horde = f.nemici ? ` contro ${n(f.nemici)} nemici` : '';
  if (f.win === true) return `${head} Scese in campo${horde} e li vinse: il bottino fu di ${n(f.scudi)} scudi.`;
  if (f.win === false) return `${head} Accettò la battaglia${horde}, ma fu sconfitto${fac === 'saraceni' ? `: i Saraceni portarono via ${n(f.servi)} servi come schiavi` : ''}.`;
  switch (f.option) {
    case 'tributo': return `${head} Preferì pagare un tributo di ${n(f.scudi)} scudi.`;
    case 'matrimonio': return `${head} Rispose con un matrimonio dinastico, e la dote gli costò ${n(f.scudi)} scudi.`;
    case 'mura': return `${head} Si chiuse nelle mura: nessuno morì, ma bruciarono ${n(f.grano ?? 0)} misure di grano e i campi.`;
    case 'passaggio': return `${head} Pagò il passaggio con ${n(f.grano ?? 0)} misure di grano.`;
    case 'vassallo': return `${head} Si fece suo vassallo, in cambio di una parte di ogni raccolto.`;
    case 'protettorato': return `${head} Accettò il protettorato dell'Impero d'Oriente.`;
    case 'corrompere': return `${head} Corruppe il governatore con ${n(f.scudi)} scudi.`;
    case 'riscatto': return `${head} Pagò un riscatto e le navi ripresero il largo.`;
    case 'saccheggio': return `${head} Lasciò saccheggiare: nessuno morì, ma andarono perduti beni e botteghe.`;
    case 'accordi': return `${head} Strinse accordi commerciali con i mercanti d'oltremare.`;
    default: return head;
  }
}

export const factionName = (f: FactionId) => INFO[f].name;
