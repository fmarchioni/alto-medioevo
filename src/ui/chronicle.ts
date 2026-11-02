/**
 * Il libro delle cronache: a fine anno, una pagina scritta come da un
 * cronista, con miniature dei reami e degli imprevisti e le notizie del
 * regno. Pagina statica, senza animazioni. I fatti vengono dalle annotazioni
 * strutturate del motore (GameState.chronicle).
 */
import { EVENTS } from '../domain/events';
import { FEUDI, titleName } from '../domain/rank';
import type { ChronicleEntry, ChronicleFact, GameState, Player } from '../domain/types';
import type { ExpansionView } from '../expansions/types';
import { eventMiniature } from './comics';
import { factionSentence } from './fazioni';
import { annualSentence, fattoSentence } from './fatti';
import { impresaSentence } from './imprese';
import { realmScene } from './realm';

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
  return state.players.map((p, index) => {
    const facts = entries.filter(e => e.player === index).map(e => e.fact);
    return { index, p, facts, of: <T extends ChronicleFact['t']>(t: T) => facts.filter(f => f.t === t) as Facts<T> };
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

function story(py: PlayerYear, all: PlayerYear[], view: ExpansionView | null): string[] {
  const { p } = py;
  const end = py.of('yearEnd')[0];
  const titleStart = end?.titleBefore ?? p.title;
  const s: string[] = [];

  // grano
  const bought = py.of('buy').reduce((a, f) => a + f.qty, 0);
  const price = py.of('buy')[0]?.price ?? py.of('sell')[0]?.price;
  const sold = py.of('sell').reduce((a, f) => a + f.qty, 0);
  const feed = py.of('feed')[0];
  let grain = `Quell'anno ${nameAt(p, titleStart)}`;
  if (bought) grain += ` comprò ${n(bought)} misure di grano a ${price} scudi il migliaio`;
  if (sold) grain += `${bought ? ' e' : ''} ne vendette ${n(sold)} ai mercanti`;
  if (!bought && !sold) grain += ' non fece commercio di grano';
  s.push(grain + '.');
  const coloni = py.of('sell').reduce((a, f) => a + (f.coloni ?? 0), 0);
  if (coloni) s.push(`Il suo grano sfamò i feudi vicini nella carestia, e ${n(coloni)} famiglie vennero a stabilirsi nelle sue terre.`);
  if (feed) {
    if (feed.delta > 0) s.push(`Distribuì al popolo ${n(feed.qty)} misure, più delle ${n(feed.demand)} che chiedeva, e nelle case nacquero ${n(feed.delta)} bambini.`);
    else if (feed.delta < 0) s.push(`Ma il pane non bastò: diede ${n(feed.qty)} misure contro le ${n(feed.demand)} che il popolo chiedeva, e ${n(feed.delta)} servi morirono di fame.`);
    else s.push(`Diede al popolo ${n(feed.qty)} misure di grano, e il popolo restò com'era.`);
  }

  // imprevisti
  for (const f of py.of('event')) s.push(eventSentence(f));
  for (const f of py.of('impresa')) s.push(impresaSentence(f.id, f.esito, f.amount));
  for (const f of py.of('fatto')) s.push(fattoSentence(f.o));
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
  }

  // mercanti: chi se ne va per le gabelle, chi arriva perché si fida
  for (const f of py.of('mercanti')) {
    s.push(f.delta < 0
      ? 'Stanchi delle gabelle sul commerzio, i mercanti chiusero uno dei suoi mercati.'
      : 'Attirato dalla sua fama di signore onesto, un mercante forestiero aprì un nuovo mercato nel feudo.');
  }

  // fatti dell'espansione: fondaco, prestiti, fiere...
  if (view) {
    for (const f of py.of('ext')) {
      const line = view.chronicle(f, all.map(x => x.p));
      if (line) s.push(line);
    }
  }

  // fine dell'anno
  if (end) {
    if (end.usury > 0) s.push(`Gli usurai pretesero ${n(end.usury)} scudi d'interesse sui suoi debiti.`);
    if (end.tribute.length) {
      const payers = end.tribute.map(t => esc(all[t.from].p.name)).join(', ').replace(/, ([^,]*)$/, ' e $1');
      s.push(`Come signore di rango più alto, riscosse tributo da ${payers}.`);
    }
    if (end.titleAfter > end.titleBefore) s.push(`Per tanta ricchezza fu elevato al rango di ${titleName(end.titleAfter)}.`);
    if (end.titleAfter < end.titleBefore) s.push(`Le sue fortune calarono, e tornò al rango di ${titleName(end.titleAfter)}.`);
    if (end.won) s.push(`E fu incoronato ${p.gender === 1 ? 're' : 'regina'}.`);
    else if (end.scudi < 0) s.push(`Chiuse l'anno con un debito di ${n(end.scudi)} scudi.`);
    else s.push(`Chiuse l'anno con ${n(end.scudi)} scudi nelle casse e ${n(end.servi)} servi.`);
  }
  return s;
}

// ---------------------------------------------------------------- notizie del regno

interface Best { value: number; year: number; player: number }

/** Soglia sotto la quale un primato di nascite o di morti non fa notizia. */
const RECORD_MIN = 100;

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

function news(state: GameState, year: number, pys: PlayerYear[], view: ExpansionView | null): string[] {
  const out: string[] = [];
  const entries = state.chronicle ?? [];
  const name = (i: number) => `${esc(state.players[i].name)} da ${FEUDI[state.players[i].feudo]}`;
  const many = pys.length > 1;

  const births = pys.map(py => ({ i: py.index, v: py.of('feed')[0]?.delta ?? 0 }));
  const topBirth = births.reduce((a, b) => (b.v > a.v ? b : a), births[0]);
  if (topBirth && topBirth.v > 0) {
    const prev = previousBest(entries, year, f => (f.t === 'feed' && f.delta > 0 ? f.delta : null));
    // un primato si annuncia solo se è memorabile, non al primo anno né per poche anime
    const record = !!prev && topBirth.v > prev.value && topBirth.v >= RECORD_MIN;
    out.push(record && prev
      ? `Mai prima d'ora si videro tante culle: nel feudo di ${name(topBirth.i)} nacquero ${n(topBirth.v)} bambini, più del primato di ${n(prev.value)} dell'anno ${prev.year}.`
      : `${many ? 'Le culle più piene furono' : 'Molte culle si riempirono'} nel feudo di ${name(topBirth.i)}, dove nacquero ${n(topBirth.v)} bambini.`);
  }
  const deaths = births.filter(b => b.v < 0).sort((a, b) => a.v - b.v);
  if (deaths.length) {
    const d = deaths[0];
    const prev = previousBest(entries, year, f => (f.t === 'feed' && f.delta < 0 ? -f.delta : null));
    out.push(prev && -d.v > prev.value && -d.v >= RECORD_MIN
      ? `Fu l'anno della grande fame: a ${FEUDI[state.players[d.i].feudo]} morirono ${n(d.v)} servi, come non si era mai visto.`
      : `La fame colpì il feudo di ${name(d.i)}, dove morirono ${n(d.v)} servi.`);
  }
  const plague = pys.filter(py => py.of('event').some(e => e.id === 3));
  if (plague.length > 1) out.push(`La peste passò per ${plague.map(py => FEUDI[py.p.feudo]).join(', ').replace(/, ([^,]*)$/, ' e $1')}.`);
  const battles = pys.flatMap(py => py.of('event').filter(e => e.choice === 'pugna').map(e => ({ py, e })));
  if (battles.length > 1) out.push(`Fu un anno di battaglie: si combatté in ${battles.length} feudi.`);

  if (many) {
    const ends = pys.map(py => ({ i: py.index, e: py.of('yearEnd')[0] })).filter(x => x.e);
    const richest = ends.reduce((a, b) => (b.e!.scudi > a.e!.scudi ? b : a), ends[0]);
    if (richest) out.push(`Le casse più piene del regno sono quelle di ${name(richest.i)}: ${n(richest.e!.scudi)} scudi.`);
    const poorest = ends.reduce((a, b) => (b.e!.scudi < a.e!.scudi ? b : a), ends[0]);
    if (poorest && poorest.e!.scudi < 0) out.push(`Il più indebitato è ${name(poorest.i)}, che deve agli usurai ${n(poorest.e!.scudi)} scudi.`);
    const builders = pys.map(py => ({ i: py.index, k: py.of('build').length })).sort((a, b) => b.k - a.k);
    if (builders[0].k > 0) out.push(`Il più gran costruttore fu ${name(builders[0].i)}, con ${say(builders[0].k)} ${plural(builders[0].k, 'opera', 'opere')} in un solo anno.`);
    const tribute = ends.reduce((a, x) => a + x.e!.tribute.reduce((s, t) => s + t.amount, 0), 0);
    if (tribute) out.push(`Fra signori e vassalli passarono ${n(tribute)} scudi di tributo.`);
  }
  const income = pys.map(py => ({ i: py.index, v: py.of('income')[0]?.amount ?? 0 })).reduce((a, b) => (b.v > a.v ? b : a));
  const prevIncome = previousBest(entries, year, f => (f.t === 'income' ? f.amount : null));
  if (income.v > 0 && prevIncome && income.v > prevIncome.value) {
    out.push(`Nessun signore aveva mai incassato tanto dalle gabelle: ${n(income.v)} scudi a ${FEUDI[state.players[income.i].feudo]}.`);
  }
  if (view?.news) out.push(...view.news(state, year));
  if (!out.length) out.push('Fu un anno quieto, e il cronista non ha altro da annotare.');
  return out;
}

// ---------------------------------------------------------------- pagina

const fleuron = `<svg viewBox="0 0 200 20" class="fleuron" aria-hidden="true">
  <path d="M10 10 H80 M120 10 H190" stroke="#b8902e" stroke-width="1.5"/>
  <path d="M100 2 C92 2 88 10 100 18 C112 10 108 2 100 2z" fill="#8b2a1e"/>
  <circle cx="86" cy="10" r="3" fill="#b8902e"/><circle cx="114" cy="10" r="3" fill="#b8902e"/></svg>`;

export function renderChronicle(state: GameState, year: number, view: ExpansionView | null = null): string {
  const pys = playerYears(state, year);
  const entries = pys.map(py => {
    const ev = py.of('event')[0];
    const tag = py.p.bot ? ` <span class="chr-bot">computer, ${py.p.bot}</span>` : '';
    return `<article class="chr-entry">
      <h3 class="chr-name">${titleName(py.p.title)} ${esc(py.p.name)} da ${FEUDI[py.p.feudo]}${tag}</h3>
      <figure class="chr-mini">${realmScene(py.p, `miniatura del reame di ${esc(py.p.name)}`)}</figure>
      ${ev ? `<figure class="chr-mini chr-event">${eventMiniature(ev.id, ev.choice ? { scudi: ev.scudi, servi: ev.servi, choice: ev.choice } : undefined)}</figure>` : ''}
      <p>${story(py, pys, view).join(' ')}</p>
    </article>`;
  }).join(fleuron);
  return `
  <div class="codex chronicle" role="document">
    <div class="codex-head"><span>Libro delle cronache</span><span>anno del Signore ${year}</span></div>
    <h2 class="codex-title">Cronaca dell'anno ${year}</h2>
    <div class="codex-text"><p>Qui si narrano i fatti accaduti nell'anno del Signore ${year} nei feudi del regno, come li raccolse il cronista dalla voce dei messi e dai registri dei camerlenghi.</p></div>
    ${fleuron}
    ${entries}
    ${fleuron}
    <section class="chr-news">
      <h3>Notizie del regno</h3>
      <ul>${news(state, year, pys, view).map(x => `<li>${x}</li>`).join('')}</ul>
    </section>
    <div class="btns codex-nav"><span></span><button data-act="chronicleClose" class="primary">Inizia l'anno ${year + 1}</button></div>
  </div>`;
}
