/**
 * Signori guidati dal computer. Giocano con le stesse regole e le stesse
 * funzioni del motore (Game), quindi con il raccolto e il prezzo del grano
 * del loro turno. Le decisioni usano un generatore proprio, derivato dallo
 * stato della partita: la sequenza RND del gioco resta quella del C64 e la
 * partita resta riproducibile anche dopo un salvataggio.
 *
 * - facile: decisioni casuali entro i limiti delle regole
 * - medio: buon senso con un po' di caso
 * - difficile: scelte calcolate (gabelle ottimali, nessun grano sprecato,
 *   investimenti che rendono, pugna che in media conviene)
 */
import { SELL_DEBT_LIMIT, trustFactor, type RateKind } from './economy';
import { fiduciaOf, livelloMid, livelloOf, MARKET_MULT, OPIFICIO_MULT, workFactor } from './gabelle';
import { granaryCapacity, MACINA_MOOD_WEIGHT, RIOT_MOOD, SETTLER_MEDIA_PRICE, umoreOf } from './gabelle';
import { BATTLE_OPTIONS, CITY_WEIGHTS, FACTIONS, marriageCost, type FactionId, type FactionOption } from './fazioni';
import { etaP, fazioniSposabili, figliDi, nozzeDi, pretendenti, prudente, ripudiabili, signoreP, sposabili, type Sposo } from './famiglia';
import { canInvest, COSTS, type InvestmentKind } from './investments';
import { scadenza } from './imprese';
import { hasSensale, hireSensale, SENSALI, sensaleCost, sensaleNow, sensaleOfTurn, sensaleUseful, sensaleVerdict } from './sensale';
import { RANK_THRESHOLDS, wealthIndex } from './rank';
import { Mulberry32, type Rng } from './rng';
import { bestRates, currentRates, KINDS, maxBuyable, previewRates, RATE_SUM_CAP, yieldPerPoint, type Rates } from './strategy';
import type { Game } from './turn';
import type { BotLevel, EventOutcome, Phase, Player } from './types';

/** Resoconto del turno di un signore guidato dal computer. */
export interface BotTurnReport {
  log: string[];
  /** imprevisto subito nell'anno: i bot vi sono soggetti come gli umani */
  event?: { id: number; outcome: EventOutcome };
}

const n = (v: number) => Math.floor(v).toLocaleString('it-IT');

/** Generatore delle decisioni: dipende da anno, giocatore e stato del generatore di gioco. */
function decisionRng(g: Game): Rng {
  let h = 2166136261;
  for (const v of [g.state.q, g.state.current, ...g.state.rngState]) {
    h ^= v;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return new Mulberry32(h);
}

/**
 * Sviste del medio: un signore di buon senso ma distratto. Ogni anno, con
 * questa probabilità, ne commette una (e una sola).
 */
export const MEDIO_SVISTA = 0.45;
export type Svista = 'fame' | 'svendita' | 'gabelle' | 'cantiere' | 'avarizia';
const SVISTE: Svista[] = ['fame', 'svendita', 'gabelle', 'cantiere', 'avarizia'];

interface Ctx {
  g: Game;
  rnd: () => number;
  log: string[];
  /** svista dell'anno (solo per il medio) */
  svista?: Svista;
  event?: { id: number; outcome: EventOutcome };
}

const between = (rnd: () => number, a: number, b: number) => a + (b - a) * rnd();

// ---------------------------------------------------------------- commercio

/**
 * La macina al 99% rende 2 × 99 / servi scudi per misura distribuita (per la
 * quota `share` che conta): conviene se supera il prezzo d'acquisto.
 */
function macinaConviene(p: Player, prezzo: number, share = 1): boolean {
  return (share * 2 * 99) / Math.max(1, p.servi) > (prezzo / 1000) * 1.2;
}

/** Annata del turno; senza le annate la si deduce dal prezzo. */
const annataOf = (sc: { annata?: string; prezzo: number }) => sc.annata ?? (sc.prezzo <= 15 ? 'buona' : sc.prezzo >= 41 ? 'carestia' : 'media');

/**
 * Vocazione mercante: nelle annate buone si riempiono i granai, in carestia si
 * vendono le scorte (e arrivano coloni), al popolo si dà solo la domanda.
 * Ritorna quanto distribuire.
 */
function merchantTrade(c: Ctx, level: BotLevel, buy: (q: number) => void, sell: (q: number) => void, affordable: () => number): number {
  const { g, rnd } = c;
  const p = g.player, sc = g.state.scalars;
  const need = Math.ceil(sc.domanda * 1.05);
  const annata = annataOf(sc);
  // svista: svende metà delle scorte al primo che passa, anche quando il grano non vale niente
  if (c.svista === 'svendita') sell(p.grano * 0.5);
  // in carestia si vende tutto tranne il bisogno dell'anno e mezza riserva per l'anno dopo
  if (annata === 'carestia') sell(p.grano - need - sc.domanda * 0.5);
  // nelle annate medie con il grano caro si vende una parte, tenendo una riserva intera
  else if (annata === 'media' && (sc.prezzoBase ?? sc.prezzo) >= SETTLER_MEDIA_PRICE) sell(p.grano - need - sc.domanda);
  if (p.grano < need) buy(need - p.grano);
  if (annata === 'buona' || (annata === 'media' && sc.prezzo <= 26)) {
    const room = granaryCapacity(p) + need - p.grano;
    const share = level === 'difficile' ? 0.9 : between(rnd, 0.25, 0.55); // il medio è prudente anche come mercante
    buy(Math.min(room, (affordable() - 100) * share));
  }
  return Math.min(p.grano, need);
}

function trade(c: Ctx, level: BotLevel): void {
  const { g, rnd, log } = c;
  const p = g.player, sc = g.state.scalars;
  const ext = { g, level, rnd, log };
  g.rules?.botBeforeTrade?.(ext);
  // grano oltre il quale la macina rende meno (solo con le espansioni che la limitano)
  const rule = g.macinaRule();
  const cap = macinaConviene(p, sc.prezzo, rule.beyond) ? Infinity : rule.cap;
  const room = () => Math.max(0, cap - p.grano);
  // quanto si può comprare con il tesoro, senza ricorrere agli usurai
  const affordable = () => Math.floor((Math.max(0, p.scudi) * 1000) / Math.max(1, sc.prezzo));
  const buy = (q: number, useCredit = false) => {
    q = Math.max(0, Math.min(Math.floor(q), maxBuyable(p, sc), useCredit ? Infinity : affordable()));
    if (q > 0 && g.buy(q).ok) log.push(`compra ${n(q)} misure di grano a ${sc.prezzo} scudi ogni mille`);
  };
  const sell = (q: number) => {
    q = Math.max(0, Math.min(Math.floor(q), p.grano));
    if (q > 0 && p.scudi >= SELL_DEBT_LIMIT && g.sell(q).ok) log.push(`vende ${n(q)} misure di grano`);
  };

  let feed: number;
  if (level !== 'facile' && p.strategia === 'mercante' && p.granai !== undefined && c.svista !== 'avarizia') {
    feed = merchantTrade(c, level, buy, sell, affordable);
  } else if (level === 'facile') {
    if (rnd() < 0.5) buy(maxBuyable(p, sc) * between(rnd, 0, 0.5), p.scudi > 0 && rnd() < 0.2);
    if (rnd() < 0.3) sell(p.grano * between(rnd, 0, 0.3));
    feed = sc.domanda * between(rnd, 0.6, 1.4);
  } else if (level === 'medio') {
    // svista: svende metà del granaio al primo mercante che passa, qualunque sia il prezzo
    if (c.svista === 'svendita') sell(p.grano * 0.5);
    // intuisce che sfamare bene il popolo rende, ma ci investe al più due quinti del tesoro
    // (svista: per avarizia, quell'anno compra solo il grano che serve)
    if (macinaConviene(p, sc.prezzo) && c.svista !== 'avarizia') {
      buy(Math.min(room(), Math.max(sc.domanda * 1.1 - p.grano, (affordable() * between(rnd, 0.15, 0.4)))));
      feed = Math.min(p.grano, cap);
    } else {
      if (p.grano < sc.domanda) buy(sc.domanda - p.grano);
      if (sc.prezzo >= 45 && p.grano > sc.domanda * 2) sell((p.grano - sc.domanda * 1.5) * 0.5);
      feed = sc.domanda * between(rnd, 1.0, 1.15);
    }
  } else {
    // Leva principale del listato: la "macina" rende 2 × aliquota / servi scudi per ogni misura distribuita
    // (riga 990, la scalare s è il grano dato al popolo), e sfamare oltre la domanda fa nascere servi (riga 670).
    // Con la macina al 99% una misura rende ~0,2 scudi a 1000 servi e ne costa al massimo 0,061:
    // conviene comprare tutto il grano che si può pagare senza indebitarsi e distribuirlo.
    if (macinaConviene(p, sc.prezzo)) {
      buy(Math.min(room(), Math.floor((Math.max(0, p.scudi - 50) * 1000) / sc.prezzo)));
      // con la riforma il grano dato oltre la domanda la alza l'anno dopo, ma nelle prove conviene ancora darlo tutto
      feed = Math.min(p.grano, cap);
    } else {
      // il grano avanzato marcisce alle rendite: se ne tiene solo quanto serve
      const target = Math.ceil(sc.domanda * 1.05);
      if (p.grano < target) buy(target - p.grano);
      if (p.grano > target) sell(p.grano - target);
      feed = target;
    }
  }
  // svista: conta male i sacchi e il popolo resta a stomaco vuoto
  if (c.svista === 'fame') feed = Math.min(feed, sc.domanda * between(rnd, 0.7, 0.9));
  feed = Math.max(0, Math.min(p.grano, Math.round(feed)));
  g.rules?.botBeforeFeed?.(ext, feed);
  feed = Math.min(feed, p.grano);
  // granai limitati: quel che non entra nei granai marcirebbe a fine anno, meglio venderlo
  if (g.state.options.granai && level !== 'facile') sell(p.grano - feed - granaryCapacity(p));
  if (g.feed(feed).ok) {
    const f = sc.natiMorti;
    log.push(`distribuisce ${n(feed)} misure al popolo: ${f >= 0 ? `nascono ${n(f)}` : `muoiono ${n(-f)}`} servi`);
  }
}

// ---------------------------------------------------------------- imprevisto

/**
 * Fatto del reame. Il difficile finanzia il mulino e accoglie i profughi se
 * ha di che sfamarli, ricostruisce, processa il ciambellano e accoglie il re
 * con sfarzo se può; il medio sceglie a buon senso; il facile a caso.
 */
function fatto(g: Game, level: BotLevel, rng: Rng): void {
  const ph = g.state.phase;
  if (ph.kind !== 'fatto') return;
  if (ph.awaitingChoice) {
    const ok = g.fattoChoices().filter(o => o.ok).map(o => o.id);
    const smart: Record<string, string> = { mulino: 'finanziare', immigrati: 'accogliere', incendio: 'ricostruire', ciambellano: 'processare', visitaRe: 'sontuosa' };
    const want = smart[ph.id];
    const pick = level === 'facile' || (level === 'medio' && rng.next() < 0.3) ? ok[Math.floor(rng.next() * ok.length)] : ok.includes(want) ? want : ok[ok.length - 1];
    g.chooseFatto(pick);
  }
  g.continueAfterFatto();
}

/**
 * Risposta a una fazione. Il difficile pesa la posta: combatte quando la
 * battaglia gli conviene, si fa proteggere se vive di commercio, sposa una
 * franca se la dote è alla sua portata; il medio va a buon senso, il facile a caso.
 */
/** Dinastia: probabilità di vittoria sotto cui un signore prudente non combatte */
export const PRUDENZA_VITTORIA = 0.8;

function factionChoice(c: Ctx, level: BotLevel, f: FactionId): FactionOption {
  const { g, rnd } = c;
  const p = g.player;
  const opts = g.factionOptions().filter(o => o.ok).map(o => o.id);
  const has = (o: FactionOption) => opts.includes(o);
  if (level === 'facile') return opts[Math.floor(rnd() * opts.length)];
  // Dinastia: un signore vecchio, o senza un erede adulto, combatte solo a vittoria quasi certa
  const careful = prudente(g.state, g.state.current);
  const win = careful && g.factionWinChance() < PRUDENZA_VITTORIA ? 0 : g.factionWinChance();
  const fight = opts.find(o => BATTLE_OPTIONS.includes(o))!;
  const trade = p.mercato - 1 + (p.opificio - 1);
  if (level === 'medio') {
    if (rnd() < win) return fight;
    if (careful && f === 'ungari') return p.grano * 0.25 * 30 / 1000 < 1500 ? 'passaggio' : 'mura';
    const peaceful = opts.filter(o => o !== fight);
    return peaceful[Math.floor(rnd() * peaceful.length)];
  }
  switch (f) {
    case 'franchi': return has('matrimonio') && p.palazzo < 11 && marriageCost(p) <= 6000 ? 'matrimonio' : win >= 0.45 ? fight : 'tributo';
    case 'ungari': return win >= 0.5 ? fight : p.grano * 0.25 * 30 / 1000 < 1500 ? 'passaggio' : careful ? 'mura' : fight;
    case 'longobardi': return win >= 0.45 ? fight : 'tributo';
    case 'bizantini': return trade >= 6 ? 'protettorato' : win >= 0.45 ? fight : 'corrompere';
    case 'saraceni': return p.mercato - 1 >= 6 ? 'accordi' : win >= 0.45 ? fight : 'riscatto';
  }
}

function event(c: Ctx, level: BotLevel): void {
  const { g, rnd, log } = c;
  g.continueAfterFeeding();
  // affari fra signori dell'espansione, chiuso il mercato del grano
  if (g.state.phase.kind === 'signori') {
    g.rules?.botSignori?.({ g, level, rnd, log });
    g.continueAfterSignori();
  }
  const ph = g.state.phase;
  if (ph.kind !== 'evento') return;
  if (ph.awaitingChoice && ph.faction) {
    const option = factionChoice(c, level, ph.faction);
    g.chooseFaction(option);
    log.push(`risponde ai ${ph.faction}: ${option}`);
  } else if (ph.awaitingChoice) {
    // la pugna vale in media +0,5 scudi e +0,5 servi; il riscatto costa in media 400 scudi
    // Dinastia: un signore prudente paga invece di battersi
    const careful = level !== 'facile' && prudente(g.state, g.state.current);
    const choice = careful ? 'riscatto' : level === 'difficile' ? 'pugna' : rnd() < (level === 'medio' ? 0.6 : 0.5) ? 'pugna' : 'riscatto';
    g.chooseEvent(choice);
  }
  const out = g.state.phase.kind === 'evento' ? g.state.phase.outcome : undefined;
  if (out && ph.kind === 'evento') c.event = { id: ph.eventId, outcome: out };
  if (out) {
    const parts = [out.scudi ? `${out.scudi > 0 ? '+' : ''}${n(out.scudi)} scudi` : '', out.servi ? `${out.servi > 0 ? '+' : ''}${n(out.servi)} servi` : ''].filter(Boolean);
    log.push(`imprevisto${out.choice ? ` (sceglie ${out.choice})` : ''}: ${parts.join(', ') || 'nessun effetto'}`);
  }
  g.continueAfterEvent();
}

// ---------------------------------------------------------------- rendite

/**
 * Gabelle con la riforma: la macina non costa umore, quindi va al massimo se
 * rende; bevere e commerzio si tengono dove umore e fiducia reggono.
 */
/** errore (in punti) con cui ciascun livello stima umore e fiducia, che nessuno vede */
const GUESS_ERR: Record<BotLevel, number> = { facile: 25, medio: 12, difficile: 4 };
/** Dinastia: umore stimato sotto cui i bot alleggeriscono le gabelle per evitare la congiura (sotto 40 il popolo è scontento) */
const CONGIURA_UMORE = 45;

function reformRates(c: Ctx, level: BotLevel): Rates {
  const { g, rnd } = c;
  const p = g.player, sc = g.state.scalars;
  const y = yieldPerPoint(p, sc);
  if (level === 'facile') return { bevere: Math.floor(rnd() * 100), macina: Math.floor(rnd() * 100), commerzio: Math.floor(rnd() * 100) };
  // umore e fiducia sono nascosti anche ai bot: li stimano, il difficile con più precisione del medio
  // con il sensale la stima è la sua, se è più fine
  const err = hasSensale(g) ? Math.min(GUESS_ERR[level], SENSALI[sensaleNow(g)].err) : GUESS_ERR[level];
  const guess = (v: number) => Math.min(100, Math.max(0, v + (rnd() * 2 - 1) * err));
  const umore = guess(umoreOf(p)), fiducia = guess(fiduciaOf(p));
  // l'umore è un bilancio: un punto di bevere ne costa uno, uno di macina mezzo. Il difficile resta
  // sopra la soglia delle rivolte con un margine, il medio va un po' a caso; la fiducia dei mercanti a metà strada
  let mood = level === 'difficile' ? 38 - Math.max(0, RIOT_MOOD + 5 - umore) : 25 + Math.floor(rnd() * 35);
  // Dinastia: con il popolo scontento la congiura minaccia la vita del signore: gabelle più miti
  if (g.state.dinastia && umore < CONGIURA_UMORE) mood -= Math.round((CONGIURA_UMORE - umore) * (level === 'difficile' ? 1 : 0.5));
  const comCap = level === 'difficile' ? 38 : 25 + Math.floor(rnd() * 40);
  const value: Rates = { ...y, commerzio: y.commerzio * (MARKET_MULT * fiducia) / 100 };
  const cost = { bevere: 1, macina: MACINA_MOOD_WEIGHT };
  const r: Rates = { bevere: 0, macina: 0, commerzio: 0 };
  let rest = RATE_SUM_CAP;
  r.commerzio = value.commerzio > 0 ? Math.min(comCap, rest) : 0;
  rest -= r.commerzio;
  for (const k of (['bevere', 'macina'] as const).slice().sort((a, b) => value[b] / cost[b] - value[a] / cost[a])) {
    if (value[k] <= 0) continue;
    r[k] = Math.max(0, Math.min(99, rest, Math.floor(mood / cost[k])));
    rest -= r[k];
    mood -= r[k] * cost[k];
  }
  return heedSensale(g, r, level);
}

/**
 * Gabelle ritoccate secondo il sensale: se le giudica inique si abbassano, e il
 * difficile alza quelle che giudica basse (lascerebbe scudi ai sudditi).
 */
function heedSensale(g: Game, r: Rates, level: BotLevel): Rates {
  const out = { ...r };
  for (let i = 0; i < 40; i++) {
    const v = sensaleVerdict(g, out);
    if (!v) break;
    let moved = false;
    if (v.popolo === 'iniqua' && out.bevere + out.macina > 0) {
      if (out.bevere >= out.macina) out.bevere = Math.max(0, out.bevere - 3);
      else out.macina = Math.max(0, out.macina - 3);
      moved = true;
    } else if (v.popolo === 'bassa' && level === 'difficile' && out.bevere + out.macina + out.commerzio + 3 <= RATE_SUM_CAP && out.bevere < 96) {
      out.bevere += 3;
      moved = true;
    }
    if (v.mercanti === 'iniqua' && out.commerzio > 0) {
      out.commerzio = Math.max(0, out.commerzio - 3);
      moved = true;
    }
    if (!moved) break;
  }
  return out;
}

/** Il sensale di piazza, alle rendite: il medio lo assolda se il tesoro lo consente, il difficile quasi sempre. */
function botSensale(c: Ctx, level: BotLevel): void {
  const { g, rnd, log } = c;
  const p = g.player;
  if (!sensaleUseful(g) || hasSensale(g) || level === 'facile') return;
  const cost = sensaleCost(p, sensaleOfTurn(g));
  const want = level === 'difficile' ? p.scudi - cost >= 500 : p.scudi - cost >= 1500 && rnd() < 0.5;
  if (want && hireSensale(g).ok) log.push(`assolda il sensale ${SENSALI[sensaleNow(g)].name} per ${n(cost)} scudi`);
}

function taxes(c: Ctx, level: BotLevel): void {
  const { g, rnd, log } = c;
  botSensale(c, level);
  const p = g.player, sc = g.state.scalars;
  const cur = currentRates(p);
  let target = cur;
  if (p.fiducia !== undefined) {
    if (level !== 'facile' || rnd() < 0.5) target = reformRates(c, level);
  } else if (level === 'facile') {
    if (rnd() < 0.5) target = { bevere: Math.floor(rnd() * 100), macina: Math.floor(rnd() * 100), commerzio: Math.floor(rnd() * 100) };
  } else if (level === 'medio') {
    // ricalcola bene le gabelle all'inizio, quando è in rosso e ogni tanto; altrimenti le lascia
    if (g.state.q === 0 || p.scudi < 0 || rnd() < 0.3) {
      target = rnd() < 0.7 ? bestRates(p, sc) : { bevere: 60, macina: 60, commerzio: 60 };
    }
  } else {
    const best = bestRates(p, sc);
    const gain = previewRates(p, sc, best).totale - previewRates(p, sc, cur).totale;
    const changes = KINDS.filter(k => best[k] !== cur[k]).length;
    // ogni ritocco fa marcire in media un quinto del grano (senza la riforma delle gabelle e senza spoilOncePerYear)
    const spoilCost = g.state.options.spoilOncePerYear || p.fiducia !== undefined ? 0 : changes * 0.2 * (p.grano * sc.prezzo) / 1000;
    if (gain > spoilCost) target = best;
  }
  // svista: si fa convincere dagli esattori ad alzare il bevere, e il popolo si scontenta
  if (c.svista === 'gabelle') target = { ...target, bevere: 70 + Math.floor(rnd() * 25) };
  const changed: RateKind[] = KINDS.filter(k => target[k] !== cur[k]);
  for (const k of changed) g.setRate(k, target[k]);
  if (changed.length) log.push(`fissa le gabelle: bevere ${target.bevere}%, macina ${target.macina}%, commerzio ${target.commerzio}%`);
  const ph = g.state.phase;
  if (ph.kind === 'rendite') log.push(`incassa ${n(ph.preview.totale)} scudi di rendita`);
  g.collect();
  if (g.state.phase.kind === 'reame') g.continueFromRealm();
}

// ---------------------------------------------------------------- investimenti

function marketYield(p: Player): number {
  const sum = p.rateBevere + p.rateMacina + p.rateCommerzio;
  const corr = sum > 180 ? 180 / sum : 1;
  // la fiducia è nascosta: si stima dal livello
  const trust = p.fiducia === undefined ? trustFactor(p) : (MARKET_MULT * livelloMid(livelloOf(fiduciaOf(p)))) / 100;
  return (p.servi * p.rateCommerzio) / 500 * corr * trust;
}

/** Rendita stimata di un opificio in più: nell'originale in media metà del massimo, con la riforma secondo l'umore. */
function opificioYield(p: Player): number {
  const sum = p.rateBevere + p.rateMacina + p.rateCommerzio;
  const corr = sum > 180 ? 180 / sum : 1;
  const mult = p.umore === undefined ? 3 / 2 : OPIFICIO_MULT * workFactor(livelloMid(livelloOf(umoreOf(p))));
  return (p.servi * p.rateCommerzio) / 500 * corr * mult;
}

/**
 * Dinastia: il signore vedovo si risposa, e ogni anno qualche figlio adulto
 * si sposa. Il difficile cerca la fazione che minaccia di più la sua città,
 * poi la casata più ricca; il medio a volte una fazione, poi una casata; il
 * facile si accontenta di quello che capita. Nessun bot ripudia.
 */
/** anni di matrimonio senza figli dopo cui un bot ripudia, ed età oltre la quale non lo fa più */
export const RIPUDIO_STERILE = { anni: 6, eta: 48 } as const;

/**
 * Dinastia: quando un bot ripudia. Un signore sposato da anni, senza figli e
 * ancora giovane, ripudia per risposarsi e avere un erede (il medio a volte,
 * il difficile quasi sempre); non ripudia una sposa di una fazione, per non
 * scatenarne la vendetta. Il facile, ogni tanto, ripudia a caso. In Spade e
 * Castelli si ripudia anche per muovere guerra a un parente (botWar).
 */
function ripudi(c: Ctx, level: BotLevel): void {
  const { g, rnd, log } = c, st = g.state, d = st.dinastia;
  if (!d?.persone) return;
  const me = st.current, s = signoreP(d, me), m = nozzeDi(d, s.id);
  if (m && st.q - m.dal >= RIPUDIO_STERILE.anni && !figliDi(d, me).length && etaP(s, st.q) <= RIPUDIO_STERILE.eta && (m.con.k !== 'fazione' || level === 'facile')) {
    if (rnd() < (level === 'difficile' ? 0.8 : level === 'medio' ? 0.5 : 0.2) && g.ripudia(m.id).ok) {
      log.push('ripudia il consorte: in tanti anni nessun figlio');
      return;
    }
  }
  if (level === 'facile' && rnd() < 0.02) {
    const all = ripudiabili(d, me);
    const x = all[Math.floor(rnd() * all.length)];
    if (x && g.ripudia(x.id).ok) log.push('ripudia un matrimonio, per capriccio');
  }
}

function nozze(c: Ctx, level: BotLevel): void {
  const { g, rnd, log } = c, st = g.state, d = st.dinastia;
  if (!d?.persone) return;
  ripudi(c, level);
  const me = st.current, s = signoreP(d, me);
  for (const x of sposabili(d, me, st.q)) {
    if (etaP(x, st.q) < 16 || rnd() > (x.id === s.id ? 0.8 : 0.3)) continue;
    const ok = (con: Sposo) => !g.nozzeBlock(x.id, con);
    const w = CITY_WEIGHTS[g.player.feudo] ?? CITY_WEIGHTS[4];
    const facs = fazioniSposabili(g.player).filter(f => ok({ k: 'fazione', f }));
    const pret = pretendenti(st, d, me, x).filter(z => ok({ k: 'casata', id: z.p.id }));
    let con: Sposo | null = null;
    if (facs.length && (level === 'difficile' || rnd() < 0.3)) {
      const f = level === 'difficile' ? facs.reduce((a, b) => (w[FACTIONS.indexOf(b)] > w[FACTIONS.indexOf(a)] ? b : a)) : facs[Math.floor(rnd() * facs.length)];
      con = { k: 'fazione', f };
    } else if (pret.length && rnd() < 0.7) {
      const z = level === 'facile' ? pret[Math.floor(rnd() * pret.length)] : pret.reduce((a, b) => (wealthIndex(st.players[b.casa]) > wealthIndex(st.players[a.casa]) ? b : a));
      con = { k: 'casata', id: z.p.id };
    } else if (ok({ k: 'locale' })) con = { k: 'locale' };
    if (!con) continue;
    const r = g.proponiNozze(x.id, con);
    if (r.ok) log.push(`nozze per ${x.nome}: ${con.k === 'fazione' ? con.f : con.k}${r.answered === false ? ' (proposta)' : r.accepted ? '' : ' (rifiutate)'}`);
  }
}

function invest(c: Ctx, level: BotLevel): void {
  const { g, rnd, log } = c;
  const p = g.player;
  g.rules?.botBeforeInvest?.({ g, level, rnd, log });
  nozze(c, level);
  const built: Record<InvestmentKind, number> = { terre: 0, mercato: 0, opificio: 0, palazzo: 0, granaio: 0 };
  const buy = (k: InvestmentKind) => {
    if (!g.invest(k).ok) return false;
    built[k]++;
    return true;
  };
  const kinds: InvestmentKind[] = ['terre', 'mercato', 'opificio', 'palazzo'];
  const reale = !!g.state.options.palazzoReale;
  // il mercante vuole granai capaci di un raccolto abbondante intero
  if (level !== 'facile' && p.strategia === 'mercante' && p.granai !== undefined) {
    while (granaryCapacity(p) < p.acri * 75 && canInvest(p, 'granaio').ok && p.scudi - COSTS.granaio >= 1000 && buy('granaio'));
  }

  if (level === 'facile') {
    for (let i = 0; i < 4; i++) {
      const k = kinds[Math.floor(rnd() * kinds.length)];
      if (rnd() < 0.5 && canInvest(p, k).ok && p.scudi - COSTS[k] >= 0) buy(k);
    }
  } else if (level === 'medio' && c.svista === 'cantiere') {
    // svista: o non costruisce nulla, o spende tutto in pietre che non rendono (palazzo e terre)
    if (rnd() < 0.5) {
      while (canInvest(p, 'palazzo').ok && p.scudi >= COSTS.palazzo && buy('palazzo'));
      while (canInvest(p, 'terre').ok && p.scudi >= COSTS.terre && buy('terre'));
    }
  } else if (level === 'medio') {
    // prudente: tiene una riserva e spesso rimanda
    const reserve = 2000;
    for (let i = 0; i < 6; i++) {
      // con il palazzo reale il palazzo serve per il trono: lo considera come gli altri beni
      const options = kinds.filter(k => (k !== 'palazzo' || reale) && canInvest(p, k).ok && p.scudi - COSTS[k] >= reserve);
      if (!options.length || rnd() < 0.4) break;
      buy(options[Math.floor(rnd() * options.length)]);
    }
  } else {
    // nessun debito; si tiene una riserva per comprare il grano dell'anno prossimo
    const reserve = Math.max(800, (p.acri * 75 * 0.5 * 35) / 1000);
    for (let i = 0; i < 40; i++) {
      const can = (k: InvestmentKind) => canInvest(p, k).ok && p.scudi - COSTS[k] >= reserve;
      let pick: InvestmentKind | null = null;
      // palazzo reale: da duca in su completa il palazzo, che serve per il trono e attira servi
      if (reale && wealthIndex(p) > RANK_THRESHOLDS[1] && can('palazzo')) pick = 'palazzo';
      else if (p.rateCommerzio > 0 || p.mercato > 1) {
        const perM = marketYield(p) / COSTS.mercato;
        const perO = opificioYield(p) / COSTS.opificio;
        const order: InvestmentKind[] = perM >= perO ? ['mercato', 'opificio'] : ['opificio', 'mercato'];
        pick = order.find(can) ?? null;
      } else if (can('mercato')) {
        pick = 'mercato';
      }
      if (!pick && can('terre')) pick = 'terre';
      if (!pick && p.scudi > 60000 && can('palazzo')) pick = 'palazzo';
      if (!pick) break;
      buy(pick);
    }
  }
  const parts = [
    built.terre ? `${built.terre * 25} acri` : '',
    built.mercato ? `${built.mercato} ${built.mercato === 1 ? 'mercato' : 'mercati'}` : '',
    built.opificio ? `${built.opificio} ${built.opificio === 1 ? 'opificio' : 'opifici'}` : '',
    built.palazzo ? `${built.palazzo} ${built.palazzo === 1 ? 'piano' : 'piani'} di palazzo` : '',
    built.granaio ? `${built.granaio} ${built.granaio === 1 ? 'granaio' : 'granai'}` : '',
  ].filter(Boolean);
  log.push(parts.length ? `costruisce ${parts.join(', ')}` : 'non costruisce nulla');
}

/**
 * Gioca l'intero anno del signore corrente (che deve essere un bot) fino a
 * "proximus" compreso. Ritorna il diario delle decisioni.
 */
/**
 * Impresa temeraria: una possibilità su due di uscire dalla partita. Il
 * difficile non rischia mai; il medio solo nei debiti o all'ultimo anno
 * della carta, e non sempre; il facile si lascia tentare.
 */
function wantsImpresa(g: Game, level: BotLevel, rnd: () => number): boolean {
  const p = g.player;
  if (level === 'difficile') return false;
  if (level === 'facile') return rnd() < 0.3;
  const last = p.impresa !== undefined && g.state.q === scadenza(p.impresa);
  return (p.scudi < 0 || last) && rnd() < 0.5;
}

export function playBotTurn(g: Game): BotTurnReport {
  const level = g.player.bot;
  if (!level) throw new Error('il giocatore di turno non è guidato dal computer');
  // Dinastia: il signore è morto; l'erede resta o si trasferisce, poi comincia il suo primo anno
  if (g.state.phase.kind === 'successione') {
    const s = g.state.phase.s, p = g.player;
    if (s.trasferibile && p.bot !== 'facile') {
      // si trasferisce se la parte dei fratelli vale più di ciò che resterebbe a loro nella città
      const parte = s.eredita.scudi + s.eredita.grano * Math.max(1, g.state.scalars.prezzo) / 1000;
      const citta = (p.mercato - 1) * COSTS.mercato + (p.opificio - 1) * COSTS.opificio + p.palazzo * COSTS.palazzo + Math.max(0, p.acri - 500) * 20;
      if (parte > citta * 1.2) g.trasferisciErede(s.trasferibile[0]);
    }
    g.continueAfterSuccessione();
  }
  const me = g.player;
  // un complice ha parlato: si paga, o il signore finisce in ceppi e il turno passa
  if (g.state.phase.kind === 'impresa') {
    g.continueAfterImpresa();
    if (me.arrestato !== undefined) return { log: ['un complice parla: arrestato'] };
  }
  // arrestato all'inizio del turno per una carta di un'espansione
  if (g.state.phase.kind === 'arresto') {
    g.continueAfterArrest();
    return { log: ['arrestato'] };
  }
  if (g.state.phase.kind === 'fatto') fatto(g, level, decisionRng(g));
  if (g.state.phase.kind !== 'commercio') throw new Error('il turno del computer deve iniziare dalla delibera');
  const rng = decisionRng(g);
  const c: Ctx = { g, rnd: () => rng.next(), log: [] };
  if (g.canUseImpresa() && wantsImpresa(g, level, c.rnd)) {
    g.useImpresa();
    const ph = g.state.phase as Phase;
    if (ph.kind === 'impresa') c.log.push(`impresa ${ph.id}: ${ph.esito === 'riuscita' ? `+${n(ph.amount)} scudi` : 'arrestato'}`);
    g.continueAfterImpresa();
    if (me.arrestato !== undefined) return { log: c.log };
  }
  if (level === 'medio' && rng.next() < MEDIO_SVISTA) {
    c.svista = SVISTE[Math.floor(rng.next() * SVISTE.length)];
    c.log.push(`svista dell'anno: ${c.svista}`);
  }
  trade(c, level);
  event(c, level);
  taxes(c, level);
  invest(c, level);
  g.nextYear();
  return { log: c.log, event: c.event };
}
