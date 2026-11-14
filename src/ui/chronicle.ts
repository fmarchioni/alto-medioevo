/**
 * Il libro delle cronache: a fine anno, una pagina di giornale scritta come da un cronista, con
 * i fatti salienti in prima pagina, le notizie del regno e il trafiletto della vita dei feudi.
 * I fatti vengono dalle annotazioni strutturate del motore (GameState.chronicle).
 */
import { EVENTS } from '../domain/events';
import { FEUDI, titleName } from '../domain/rank';
import type { ChronicleEntry, ChronicleFact, GameState, Player } from '../domain/types';
import type { ExpansionView } from '../expansions/types';
import { eventMiniature } from './comics';
import { factionSentence } from './fazioni';
import { annualSentence, fattoSentence, fattoTitle } from './fatti';
import { impresaHeadline, impresaSentence } from './imprese';
import { seizedSentence } from './pignoramenti';
import { sensaleSentence } from './sensale';
import { eventArt, fattoArt, illustrationUrl, miniatureUrl } from './citta/assets';
import { MINIATURE } from './miniature-elenco';
import { scenaDellAnno, titoloScena } from './investiture';
import { dinastiaSentences } from './dinastia';
import { attacco, chiuse, luoghi, type Tono } from './cronista';
import type { FattoOutcome } from '../domain/fatti';

const n = (v: number) => Math.abs(Math.floor(v)).toLocaleString('it-IT');
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const plural = (k: number, one: string, many: string) => (k === 1 ? one : many);
/** Numeri piccoli in lettere, come in una cronaca. */
const words = ['nessun', 'un', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci'];
const say = (k: number) => (k <= 10 ? words[k] : String(k));

type Facts<T extends ChronicleFact['t']> = Extract<ChronicleFact, { t: T }>[];

interface PlayerYear {
  index: number;
  p: Player;
  facts: ChronicleFact[];
  of<T extends ChronicleFact['t']>(t: T): Facts<T>;
}

function playerYears(state: GameState, year: number): PlayerYear[] {
  const entries = (state.chronicle ?? []).filter(e => e.year === year);
  // chi era già uscito dalla partita negli anni passati non ha più storia; l'anno della caduta si racconta ancora
  return state.players.flatMap((p, index) => {
    if (p.caduto !== undefined && 900 + p.caduto < year) return [];
    const facts = entries.filter(e => e.player === index).map(e => e.fact);
    return [{ index, p, facts, of: <T extends ChronicleFact['t']>(t: T) => facts.filter(f => f.t === t) as Facts<T> }];
  });
}

function nameAt(p: Player, title: number): string {
  return `${titleName(title)} ${esc(p.name)} da ${FEUDI[p.feudo]}`;
}

// ---------------------------------------------------------------- racconto di un signore

function eventSentence(f: Facts<'event'>[number]): string {
  const fs = factionSentence(f);
  if (fs) return fs;
  const ev = EVENTS.find(e => e.id === f.id)!;
  switch (f.id) {
    case 1:
    case 7: {
      const who = f.id === 1 ? 'i Longobardi di Patavium' : 'una banda di briganti';
      if (f.choice === 'riscatto') return `Quando ${who} vennero a pretendere tributo, preferì pagare un riscatto di ${n(f.scudi)} scudi piuttosto che versare sangue.`;
      const servi = f.servi > 0 ? `e ${n(f.servi)} uomini si unirono alle sue schiere` : f.servi < 0 ? `ma ${n(f.servi)} dei suoi caddero sul campo` : 'senza perdere un solo uomo';
      return f.scudi >= 0
        ? `Quando ${who} vennero a pretendere tributo, scese in campo e li mise in fuga: il bottino fu di ${n(f.scudi)} scudi, ${servi}.`
        : `Quando ${who} vennero a pretendere tributo, accettò la pugna, ma la sorte gli fu avversa: la guerra costò ${n(f.scudi)} scudi, ${servi}.`;
    }
    case 2: return `Un principe saraceno giunse alla sua corte con sete e spezie, e gli fece dono di ${n(f.scudi)} scudi.`;
    case 3: return `La peste entrò nel suo feudo e si portò via ${n(f.servi)} anime.`;
    case 4: return `Le sue schiere tornarono vittoriose da una campagna contro i nemici, con un bottino di ${n(f.scudi)} scudi.`;
    case 5: return `Il fiume ruppe gli argini e annegò ${n(f.servi)} dei suoi villici.`;
    case 6: return `Crollò l'antica cloaca dei Romani, e per ripararla dovette spendere ${n(f.scudi)} scudi.`;
    case 8: return `Il suo ciambellano, che credeva fidato, fuggì nella notte con ${n(f.scudi)} scudi del tesoro.`;
    case 15: return "Un brigante incappucciato gli sussurrò del carro delle decime di un abate corrotto, e gli chiese di farsi complice.";
    case 16: return 'Mercanti senza scrupoli gli offrirono di entrare in società nel loro commercio segreto.';
    case 9: return `Il popolo, stremato dalla gabella sul bere, si ribellò: assaltò i granai e portò via ${n(f.grano ?? 0)} misure di grano; negli scontri morirono ${n(f.servi)} servi${f.scudi ? ` e sparirono ${n(f.scudi)} scudi` : ''}.`;
    default: return `Accadde un fatto mirabile: ${ev.title.toLowerCase()}.`;
  }
}

// ---------------------------------------------------------------- articoli di prima pagina

interface Parte { who: number; text: string }
/** Un articolo del giornale: i fatti salienti, anche di più signori (la stessa battaglia, le stesse nozze). */
interface Articolo {
  prio: number;
  ord: number;
  title: string;
  art?: string;
  group?: string;
  ev?: Facts<'event'>[number];
  tono: Tono;
  parts: Parte[];
}

/** Il tono di un imprevisto: gli stranieri, le offerte oscure, o i guadagni e le perdite. */
function tonoEvento(f: Facts<'event'>[number]): Tono {
  if (f.id >= 10 && f.id <= 14) return 'stranieri';
  if (f.id === 15 || f.id === 16) return 'mistero';
  if (f.choice === 'pugna') return 'guerra';
  const neg = f.scudi < 0 || f.servi < 0 || (f.grano ?? 0) < 0, pos = f.scudi > 0 || f.servi > 0;
  return neg ? 'sciagura' : pos ? 'fortuna' : 'ventura';
}

function tonoFatto(o: FattoOutcome): Tono {
  const v = [o.scudi, o.servi, o.grano, o.raccolto ?? 0, o.acri ?? 0, o.mercati ?? 0, o.opifici ?? 0];
  const neg = v.some(x => x < 0), pos = v.some(x => x > 0) || o.annata === 'buona';
  return neg && pos ? 'ventura' : neg ? 'sciagura' : pos ? 'fortuna' : 'ventura';
}

type Famiglia = Extract<ChronicleFact, { t: 'famiglia' }>;
const TITOLI_FAMIGLIA: Record<Famiglia['k'], (f: Famiglia, feudo: string) => string> = {
  nascita: (_, feudo) => `Una nascita a ${feudo}`,
  lutto: (_, feudo) => `Lutto a ${feudo}`,
  nozze: f => `Le nozze di ${esc(f.chi)}`,
  rifiuto: () => 'Le nozze rifiutate',
  ripudio: () => 'Il ripudio',
  ripudiato: () => 'Il ripudio',
  reggenza: (_, feudo) => `La reggenza di ${feudo}`,
  trasferimento: f => `La corte lascia ${FEUDI[f.da ?? 0]}`,
};

/**
 * I fatti dell'anno divisi fra la prima pagina e il trafiletto. Prima pagina, in ordine:
 * 1) battaglie (Spade e castelli) e casata (morti, nozze, nascite, la corona);
 * 2) imprevisti, fatti del reame, imprese; 3) i cambi di rango.
 * Il trafiletto racconta la vita di tutti i giorni: grano, gabelle, cantieri, commerci.
 */
function cronaca(pys: PlayerYear[], players: Player[], view: ExpansionView | null): { articoli: Articolo[]; vita: { py: PlayerYear; lines: string[] }[] } {
  const articoli: Articolo[] = [];
  let ord = 0;
  const vita = pys.map(py => {
    const { p } = py, feudo = FEUDI[p.feudo];
    const add = (prio: number, title: string, text: string, tono: Tono, o: { art?: string; group?: string; ev?: Articolo['ev'] } = {}) => {
      if (!text) return;
      const g = o.group ? articoli.find(a => a.group === o.group) : undefined;
      if (g) {
        g.parts.push({ who: py.index, text });
        g.prio = Math.min(g.prio, prio);
        if (!g.art) g.art = o.art;
      } else articoli.push({ prio, ord: ord++, title, tono, art: o.art, group: o.group, ev: o.ev, parts: [{ who: py.index, text }] });
    };
    const end = py.of('yearEnd')[0];

    // 1) la casata e le battaglie
    for (const f of py.facts) {
      if (f.t !== 'successione' && f.t !== 'famiglia' && f.t !== 'corona') continue;
      const text = dinastiaSentences([f], p, players).join(' ');
      const art = scenaDellAnno([f])?.art;
      if (f.t === 'successione') add(1, `La morte di ${esc(f.morto)}`, text, 'morte', { art });
      else if (f.t === 'corona') add(1, p.gender === 1 ? "Il nuovo re d'Italia" : "La nuova regina d'Italia", text, 'corona', { art });
      else {
        const coppia = f.con ? `${f.k === 'ripudiato' ? 'ripudio' : f.k}-${[f.chi, f.con].sort().join('|')}` : undefined;
        add(1, TITOLI_FAMIGLIA[f.k](f, feudo), text, f.k === 'nozze' || f.k === 'nascita' || f.k === 'lutto' ? f.k : 'casata', { art, group: coppia });
      }
    }
    const inPrima = new Set<ChronicleFact>();
    if (view?.salient) {
      for (const f of py.of('ext')) {
        const s = view.salient(f, py.index, players);
        if (!s) continue;
        inPrima.add(f);
        add(s.prio, s.title, view.chronicle(f, players) ?? '', s.group?.startsWith('pace') ? 'pace' : 'guerra', { art: s.art, group: s.group });
      }
    }
    if (end?.won) add(1, p.gender === 1 ? "Il re d'Italia" : "La regina d'Italia", `${nameAt(p, end.titleAfter)} fu incoronat${p.gender === 1 ? 'o re' : 'a regina'}.`, 'corona', { art: 'titolo-re' });

    // 2) imprevisti e fatti del reame
    for (const f of py.of('event')) {
      const ev = EVENTS.find(e => e.id === f.id);
      add(2, ev?.title ?? 'Un fatto mirabile', eventSentence(f), tonoEvento(f), { art: eventArt(f.id), group: `ev-${f.id}`, ev: f });
    }
    for (const f of py.of('fatto')) add(2, fattoTitle(f.o.id), fattoSentence(f.o), tonoFatto(f.o), { art: fattoArt(f.o.id), group: `fatto-${f.o.id}` });
    for (const f of py.of('impresa')) {
      const h = impresaHeadline(f.id, f.esito);
      add(2, h.title, impresaSentence(f.id, f.esito, f.amount), f.esito === 'riuscita' ? 'fortuna' : f.esito === 'arresto' ? 'rovina' : f.esito === 'scaduta' ? 'mistero' : 'sciagura', { art: h.art });
    }
    for (const f of py.of('bancarotta')) add(2, `La rovina di ${feudo}`, `Chiuse l'anno con ${n(-f.scudi)} scudi di debiti: gli usurai lo fecero arrestare, e uscì dalla storia del regno.`, 'rovina');

    // 3) il rango
    if (end && end.titleAfter !== end.titleBefore) {
      const sc = titoloScena(end.titleBefore, end.titleAfter);
      const text = end.titleAfter > end.titleBefore
        ? `Per tanta ricchezza fu elevato al rango di ${titleName(end.titleAfter)}.`
        : `Le sue fortune calarono, e tornò al rango di ${titleName(end.titleAfter)}.`;
      add(3, sc?.caption ?? 'Un nuovo titolo', text, end.titleAfter > end.titleBefore ? 'sale' : 'scende', { art: sc?.art });
    }

    return { py, lines: quotidiano(py, players, view, inPrima) };
  });
  articoli.sort((a, b) => a.prio - b.prio || a.ord - b.ord);
  return { articoli, vita };
}

/** La vita di tutti i giorni di un signore, per il trafiletto in fondo alla pagina. */
function quotidiano(py: PlayerYear, players: Player[], view: ExpansionView | null, inPrima: Set<ChronicleFact>): string[] {
  const s: string[] = [];
  const end = py.of('yearEnd')[0];

  // grano
  const bought = py.of('buy').reduce((a, f) => a + f.qty, 0);
  const price = py.of('buy')[0]?.price ?? py.of('sell')[0]?.price;
  const sold = py.of('sell').reduce((a, f) => a + f.qty, 0);
  const feed = py.of('feed')[0];
  let grain = "Quell'anno";
  if (bought) grain += ` comprò ${n(bought)} misure di grano a ${price} scudi il migliaio`;
  if (sold) grain += bought ? ` e ne vendette ${n(sold)} ai mercanti` : ` vendette ${n(sold)} misure di grano ai mercanti`;
  if (!bought && !sold) grain += ' non fece commercio di grano';
  s.push(grain + '.');
  const coloni = py.of('sell').reduce((a, f) => a + (f.coloni ?? 0), 0);
  if (coloni) s.push(`Il suo grano sfamò i feudi vicini nella carestia, e ${n(coloni)} famiglie vennero a stabilirsi nelle sue terre.`);
  if (feed) {
    if (feed.delta > 0) s.push(`Distribuì al popolo ${n(feed.qty)} misure, più delle ${n(feed.demand)} che chiedeva, e nelle case nacquero ${n(feed.delta)} bambini.`);
    else if (feed.delta < 0) s.push(`Ma il pane non bastò: diede ${n(feed.qty)} misure contro le ${n(feed.demand)} che il popolo chiedeva, e ${n(feed.delta)} servi morirono di fame.`);
    else s.push(`Diede al popolo ${n(feed.qty)} misure di grano, e il popolo restò com'era.`);
  }

  for (const f of py.of('fattoAnnuo')) s.push(annualSentence(f.kind, f.amount));
  for (const f of py.of('pactTribute')) s.push(`Come protetto dell'Impero d'Oriente, versò ai Bizantini ${n(f.amount)} scudi di tributo.`);
  for (const f of py.of('pactEnd')) {
    const line = { vassallo: 'Finì il suo vassallaggio verso il duca longobardo.', protettorato: "Scadde il protettorato dell'Impero d'Oriente.", accordi: 'Scaddero gli accordi commerciali con i Saraceni.', matrimonio: 'La parentela con i Franchi non lo protesse più.', devastati: 'I campi devastati dagli Ungari tornarono a dare frutto.' }[f.kind as string];
    if (line) s.push(line);
  }
  for (const f of py.of('granaio')) {
    if (f.over > 0) s.push(`I suoi granai non bastarono a tanto grano: ${n(f.over)} misure marcirono all'aperto${f.rot > 0 ? `, e altre ${n(f.rot)} se le presero ratti e muffa` : ''}.`);
  }
  for (const f of py.of('spoil')) s.push(`Con il tesoro in debito i granai restarono senza riparo, e marcirono ${n(f.qty)} misure di grano.`);

  // rendite
  const income = py.of('income')[0];
  if (income) {
    s.push(income.amount > 0
      ? `Le gabelle fruttarono ${n(income.amount)} scudi${income.tribute ? `, e i vassalli gli versarono ${n(income.tribute)} scudi di tributo` : ''}.`
      : `Le gabelle non fruttarono nulla${income.tribute ? `, ma i vassalli gli versarono ${n(income.tribute)} scudi di tributo` : ''}.`);
  }

  // il sensale di piazza
  for (const x of py.of('sensale')) s.push(sensaleSentence(x.who, x.cost));

  // costruzioni
  const count = (k: string) => py.of('build').filter(b => b.kind === k).length;
  const parts: string[] = [];
  const m = count('mercato'), o = count('opificio'), t = count('terre'), pl = count('palazzo'), gr = count('granaio');
  if (m) parts.push(`${say(m)} ${plural(m, 'mercato', 'mercati')}`);
  if (o) parts.push(`${say(o)} ${plural(o, 'opificio', 'opifici')}`);
  if (pl) parts.push(`${say(pl)} ${plural(pl, 'nuovo piano', 'nuovi piani')} del palazzo`);
  if (gr) parts.push(`${say(gr)} ${plural(gr, 'granaio', 'granai')}`);
  if (parts.length || t) {
    const built = parts.length ? `Fece edificare ${parts.join(', ').replace(/, ([^,]*)$/, ' e $1')}` : '';
    const land = t ? `${built ? ' e acquistò' : 'Acquistò'} ${n(t * 25)} acri di terra` : '';
    s.push(`${built}${land}.`);
    // palazzo reale: i servi accorsi per i nuovi piani
    const came = py.of('build').reduce((sum, b) => sum + (b.servi ?? 0), 0);
    if (came) s.push(`La fama del palazzo attirò nel feudo ${n(came)} servi.`);
  }

  // mercanti: chi se ne va per le gabelle, chi arriva perché si fida
  for (const f of py.of('mercanti')) {
    s.push(f.delta < 0
      ? 'Stanchi delle gabelle sul commerzio, i mercanti chiusero uno dei suoi mercati.'
      : 'Attirato dalla sua fama di signore onesto, un mercante forestiero aprì un nuovo mercato nel feudo.');
  }

  // fatti dell'espansione che non sono in prima pagina: fondaco, prestiti, fiere, torri...
  if (view) {
    for (const f of py.of('ext')) {
      if (inPrima.has(f)) continue;
      const line = view.chronicle(f, players);
      if (line) s.push(line);
    }
  }

  // fine dell'anno
  if (end) {
    if (end.usury > 0) s.push(`Gli usurai pretesero ${n(end.usury)} scudi d'interesse sui suoi debiti.`);
    if (end.seized) s.push(seizedSentence(end.seized));
    if (end.tribute.length) {
      const payers = end.tribute.map(t => esc(players[t.from].name)).join(', ').replace(/, ([^,]*)$/, ' e $1');
      s.push(`Come signore di rango più alto, riscosse tributo da ${payers}.`);
    }
    if (!end.won) s.push(end.scudi < 0 ? `Chiuse l'anno con un debito di ${n(end.scudi)} scudi.` : `Chiuse l'anno con ${n(end.scudi)} scudi nelle casse e ${n(end.servi)} servi.`);
  }
  return s;
}

// ---------------------------------------------------------------- notizie del regno

interface Best { value: number; year: number; player: number }

/** Nascite o morti di fame da notizia: sotto questa soglia restano nel trafiletto. */
const SOGLIA_POPOLO = 200;

/** Massimo di un valore negli anni precedenti, per riconoscere i record. */
function previousBest(entries: ChronicleEntry[], year: number, pick: (f: ChronicleFact) => number | null): Best | null {
  let best: Best | null = null;
  for (const e of entries) {
    if (e.year >= year) continue;
    const v = pick(e.fact);
    if (v !== null && (!best || v > best.value)) best = { value: v, year: e.year, player: e.player };
  }
  return best;
}

/** Notizie brevi, una riga ciascuna: il popolo, le casse, i commerci, e per ultima la fiera. */
function news(state: GameState, year: number, pys: PlayerYear[], view: ExpansionView | null): string[] {
  const out: string[] = [];
  const entries = state.chronicle ?? [];
  const name = (i: number) => `${esc(state.players[i].name)} da ${FEUDI[state.players[i].feudo]}`;
  const many = pys.length > 1;

  const born = previousBest(entries, year, f => (f.t === 'feed' && f.delta > 0 ? f.delta : null));
  const starved = previousBest(entries, year, f => (f.t === 'feed' && f.delta < 0 ? -f.delta : null));
  for (const py of pys) {
    const d = py.of('feed')[0]?.delta ?? 0, feudo = FEUDI[py.p.feudo];
    if (d >= SOGLIA_POPOLO) out.push(born && d > born.value ? `Mai prima d'ora tante culle: a ${feudo} nacquero ${n(d)} bambini.` : `A ${feudo} nacquero ${n(d)} bambini.`);
    else if (-d >= SOGLIA_POPOLO) out.push(starved && -d > starved.value ? `A ${feudo} morirono di fame ${n(d)} servi, come non si era mai visto.` : `A ${feudo} morirono di fame ${n(d)} servi.`);
  }

  if (many) {
    const ends = pys.map(py => ({ i: py.index, e: py.of('yearEnd')[0] })).filter(x => x.e);
    const richest = ends.reduce((a, b) => (b.e!.scudi > a.e!.scudi ? b : a), ends[0]);
    if (richest) out.push(`Le casse più piene: ${name(richest.i)}, con ${n(richest.e!.scudi)} scudi.`);
    const poorest = ends.reduce((a, b) => (b.e!.scudi < a.e!.scudi ? b : a), ends[0]);
    if (poorest && poorest.e!.scudi < 0) out.push(`Il più indebitato: ${name(poorest.i)}, con ${n(poorest.e!.scudi)} scudi di debiti.`);
    const builders = pys.map(py => ({ i: py.index, k: py.of('build').length })).sort((a, b) => b.k - a.k);
    if (builders[0].k > 0) out.push(`Il più gran costruttore: ${name(builders[0].i)}, con ${say(builders[0].k)} ${plural(builders[0].k, 'opera', 'opere')}.`);
    const tribute = ends.reduce((a, x) => a + x.e!.tribute.reduce((s, t) => s + t.amount, 0), 0);
    if (tribute) out.push(`Fra signori e vassalli passarono ${n(tribute)} scudi di tributo.`);
  }
  const income = pys.map(py => ({ i: py.index, v: py.of('income')[0]?.amount ?? 0 })).reduce((a, b) => (b.v > a.v ? b : a));
  const prevIncome = previousBest(entries, year, f => (f.t === 'income' ? f.amount : null));
  if (income.v > 0 && prevIncome && income.v > prevIncome.value) {
    out.push(`Nessun signore aveva mai incassato tanto dalle gabelle: ${n(income.v)} scudi a ${FEUDI[state.players[income.i].feudo]}.`);
  }
  // l'espansione: briganti, fondaco, e per ultima la fiera
  if (view?.news) out.push(...view.news(state, year));
  if (!out.length) out.push('Fu un anno quieto, e il cronista non ha altro da annotare.');
  return out;
}

// ---------------------------------------------------------------- pagina

/** L'anno in numeri romani, come lo scriveva il cronista. */
export function romano(n: number): string {
  let s = '';
  for (const [v, r] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']] as const) {
    while (n >= v) { s += r; n -= v; }
  }
  return s;
}

/** Tralcio fogliato d'angolo: foglie azzurre, rosse e verdi e un bottone d'oro. */
const angolo = `<svg viewBox="0 0 74 74" aria-hidden="true"><path d="M6 68 C6 30 30 6 68 6" fill="none" stroke="#7a5412" stroke-width="3"/>
  <path d="M14 44 q-10 -6 -6 -16 q8 2 6 16z" fill="#1f3f8a"/><path d="M44 14 q-6 -10 -16 -6 q2 8 16 6z" fill="#a3221a"/>
  <path d="M24 30 q-4 -10 4 -14 q4 8 -4 14z" fill="#3f7a3a"/><circle cx="12" cy="12" r="7" fill="#c99a2e" stroke="#7a5412" stroke-width="2"/></svg>`;
const fregio = `<svg class="gz-fregio" viewBox="0 0 520 22" aria-hidden="true"><path d="M0 11 H200 M320 11 H520" stroke="#a3221a" stroke-width="2"/>
  <path d="M210 11 q25 -14 50 0 q25 14 50 0" fill="none" stroke="#1f3f8a" stroke-width="2.5"/><circle cx="260" cy="11" r="5" fill="#c99a2e" stroke="#7a5412"/>
  <circle cx="200" cy="11" r="3" fill="#1f3f8a"/><circle cx="320" cy="11" r="3" fill="#1f3f8a"/></svg>`;
const filigrana = `<svg viewBox="0 0 96 96" aria-hidden="true"><g fill="none" stroke="#f6ebcb" stroke-width="1.2" opacity=".75">
  <path d="M10 86 q8 -14 0 -26 q-8 -12 4 -22 M86 10 q-14 8 -26 0 q-12 -8 -22 4"/><circle cx="14" cy="14" r="4"/><circle cx="82" cy="82" r="4"/>
  <path d="M78 30 q8 6 2 14 M18 66 q-8 -6 -2 -14"/></g></svg>`;

/** Il capolettera miniato: lettera d'oro su campo azzurro con filigrana, il resto del testo di seguito. */
function capolettera(text: string): string {
  return `<span class="gz-capo" aria-hidden="true">${filigrana}<b>${text[0]}</b></span><span class="gz-sr">${text[0]}</span>${text.slice(1)}`;
}

/** Lunghezza del testo (caratteri) che riempie il fianco della miniatura, in apertura e in colonna. */
const LUNGHEZZA = {
  apertura: { 'gz-grandi': 430, 'gz-medie': 440, 'gz-piccole': 400 },
  colonna: { 'gz-grandi': 0, 'gz-medie': 230, 'gz-piccole': 200 },
} as const;

/** Quante miniature al più in una pagina: oltre, gli articoli restano di solo testo. */
const MAX_MINIATURE = 8;

/**
 * La miniatura di un articolo: dipinta (public/sprites/miniature) se c'è; altrimenti il dipinto
 * trasformato nel browser (miniatura.ts, `data-m13`); per gli imprevisti senza dipinto, la vignetta disegnata.
 */
function miniatura(a: Articolo): string {
  const cornice = (inner: string) => `<figure class="gz-mini"><div class="gz-oro"><div class="gz-rosa"><div class="gz-azzurra">${inner}</div></div></div></figure>`;
  const alt = `miniatura: ${a.title}`;
  if (a.art && MINIATURE.includes(a.art)) return cornice(`<img class="gz-dipinta" src="${miniatureUrl(a.art)}" alt="${alt}">`);
  if (a.art) return cornice(`<img data-m13 class="gz-attesa" src="${illustrationUrl(a.art)}" alt="${alt}">`);
  const ev = a.ev;
  return ev ? cornice(eventMiniature(ev.id, ev.choice ? { scudi: ev.scudi, servi: ev.servi, choice: ev.choice } : undefined)) : '';
}

const haMiniatura = (a: Articolo) => !!(a.art || a.ev);

/** `target`: quanti caratteri servono perché il testo accompagni la miniatura (0: nessuna misura). */
function articolo(a: Articolo, players: Player[], cls: string, mini: boolean, target: number): string {
  // i fatti dello stesso signore uno dopo l'altro, sotto il suo nome
  const blocchi: Parte[] = [];
  for (const x of a.parts) {
    const last = blocchi[blocchi.length - 1];
    if (last && last.who === x.who) last.text += ` ${x.text}`;
    else blocchi.push({ ...x });
  }
  // il cronista apre l'articolo, e lo chiude con un commento finché il testo non è lungo quanto la miniatura
  const lead = attacco(a.tono, luoghi(blocchi.map(b => FEUDI[players[b.who].feudo])), a.title);
  const chi = (b: Parte) => `${titleName(players[b.who].title)} ${esc(players[b.who].name)} da ${FEUDI[players[b.who].feudo]}.`;
  const len = lead.length + blocchi.reduce((s, b) => s + chi(b).length + b.text.length + 2, 0);
  const coda = chiuse(a.tono, len, target, a.title).join(' ');
  const corpo = blocchi.map((b, k) => `<p><span class="gz-chi">${chi(b)}</span> ${b.text}${k === blocchi.length - 1 && coda ? ` ${coda}` : ''}</p>`).join('');
  return `<article class="chr-entry gz-articolo${cls}"><h3 class="gz-rubrica">${a.title}</h3>${mini ? miniatura(a) : ''}<p class="gz-attacco">${lead}</p>${corpo}</article>`;
}

/**
 * Il giornale di fine anno: una pagina di cronaca miniata che si srotola. Testata in gotico, anno in
 * numeri romani, capolettera; poi i fatti salienti come articoli, il più importante in apertura a
 * tutta pagina; le notizie del regno in breve; in fondo il trafiletto della vita dei feudi.
 * Le miniature sono tanto più grandi quanto meno sono i fatti dell'anno.
 */
export function renderChronicle(state: GameState, year: number, view: ExpansionView | null = null): string {
  const pys = playerYears(state, year);
  const { articoli, vita } = cronaca(pys, state.players, view);
  let restanti = MAX_MINIATURE;
  const conMini = articoli.map(a => haMiniatura(a) && restanti-- > 0);
  const quante = conMini.filter(Boolean).length;
  const taglia = quante <= 2 ? 'gz-grandi' : quante <= 4 ? 'gz-medie' : 'gz-piccole';
  let lato = 0;
  // caratteri di testo che stanno accanto alla miniatura, per taglia (misurati sulla pagina)
  const target = (k: number) => (!conMini[k] ? 0 : k === 0 ? LUNGHEZZA.apertura[taglia] : LUNGHEZZA.colonna[taglia]);
  const pezzo = (a: Articolo, k: number, cls: string) => articolo(a, state.players, `${cls}${conMini[k] ? ` gz-con-mini ${lato++ % 2 ? 'gz-sx' : 'gz-dx'}` : ''}`, conMini[k], target(k));
  const [apertura, ...altri] = articoli;
  const intro = `Qui si narrano i fatti accaduti nell'anno del Signore ${year} nei feudi del regno, come li raccolse il cronista dalla voce dei messi e dai registri dei camerlenghi. Iddio guardi chi legge e perdoni chi scrive.`;
  const trafiletto = vita.map(({ py, lines }) => {
    const tag = py.p.bot ? ` <span class="chr-bot">computer, ${py.p.bot}</span>` : '';
    return `<p><span class="gz-chi">${titleName(py.p.title)} ${esc(py.p.name)} da ${FEUDI[py.p.feudo]}.</span>${tag} ${lines.join(' ')}</p>`;
  }).join('');
  return `
  <div class="gz-rotolo">
  <div class="giornale chronicle ${taglia}" role="document">
    <div class="gz-cornice" aria-hidden="true"></div>${['tl', 'tr', 'bl', 'br'].map(k => `<span class="gz-angolo ${k}">${angolo}</span>`).join('')}
    <header class="gz-testa">
      <h2 class="gz-testata">Cronaca del Regno</h2>
      <p class="gz-anno">Anno Domini ${romano(year)}</p>
      ${fregio}
    </header>
    <p class="gz-intro">${capolettera(intro)}</p>
    ${apertura ? pezzo(apertura, 0, ' gz-apertura') : '<p class="gz-quieto">Fu un anno senza grandi fatti.</p>'}
    <div class="gz-colonne">
      ${altri.map((a, k) => pezzo(a, k + 1, '')).join('')}
      <section class="gz-notizie">
        <h3>Notizie del Regno</h3>
        <ul>${news(state, year, pys, view).map(x => `<li>${x}</li>`).join('')}</ul>
      </section>
      <section class="gz-trafiletto">
        <h3>Della vita dei feudi</h3>
        ${trafiletto}
      </section>
      <p class="gz-explicit">Explicit. Deo gratias.</p>
    </div>
    <div class="btns gz-nav"><button data-act="chronicleClose" class="primary">Inizia l'anno ${year + 1}</button></div>
  </div>
  <span class="map-rod gz-rullo top" aria-hidden="true"></span><span class="map-rod gz-rullo bottom" aria-hidden="true"></span></div>`;
}
