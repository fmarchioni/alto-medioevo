/**
 * Orchestrazione delle fasi annuali (righe 80-2100).
 * L'ordine delle chiamate a RND è identico al listato: questo permette di
 * confrontare una partita con l'originale in VICE usando C64Rnd.
 */
import { buyGrain, collectRendite, computeRendite, feedServants, INT, type RateKind, sellGrain, setRate, spoilGrain, startOfTurn } from './economy';
import { annataOf, initAnnate } from './annate';
import { granaryCapacity, SETTLER_MEDIA_PRICE, settlersFor, storeGrain } from './gabelle';
import {
  CIAMBELLANO_THEFT_CHANCE, DECIMA, expireEffetti, fattiHarvestFactor, fattiRandom, fattoOptionOk, fattoOptions, hasEffetto, initFatti, pickFatto,
  pilgrimIncome, resolveFatto, rollTargets, theftAmount,
} from './fatti';
import { abitudineOf, DEBT_SPOIL_MAX, FAMINE_MAX_DEATHS, FIDUCIA_START, grainPrices, LEAVE_CHANCE, livelloOf, MERCHANT_CHANCE, MOOD_DRIFT, stepCapriccio, tolleranzaMercanti, tolleranzaServi, nextAbitudine, nextFiducia, nextUmore, ricarico, riotSlots, umoreOf, UMORE_START } from './gabelle';
import type { ExpansionRules, MacinaRule } from './expansion';
import { applyFixedEvent, ATTACK, EVENTS, drawEvent, resolveChoice, rollEvent } from './events';
import {
  attackSlots, defenseFrom, expirePacts, FACTION_EVENT, FACTION_OPTIONS, harvestFactor, hasPact, hordeSize, optionAvailable, pickFaction, PROTETTORATO_TRIBUTE,
  resolveFaction, winChance, type Defense, type FactionOption,
} from './fazioni';
import { Mulberry32 } from './rng';
import { canInvestTimes, invest, roomFor, type InvestmentKind } from './investments';
import { bottino, cartaInMano, COMPLICE_CHANCE, IMPRESA_SUCCESSO, impresaOfEvent, multa, scadenza, silenzioDal } from './imprese';
import { DEBITO_ARRESTO, endOfPlayerYear, PALAZZO_SERVI, victoryRule, wealthIndex } from './rank';
import type { Rng } from './rng';
import type { ActionResult, BotLevel, ChronicleFact, GameState, Gender, Options, Player, Strategia } from './types';
import { GAME_OPTIONS } from './types';

export interface NewPlayer {
  name: string;
  gender: Gender;
  /** se presente, il signore è guidato dal computer */
  bot?: BotLevel;
  /** vocazione del signore del computer (assente: a sorte) */
  strategia?: Strategia;
}

export const MAX_PLAYERS = 9;

/** Riga 80: stato iniziale di ogni signore. */
export function createPlayer(np: NewPlayer, feudo: number): Player {
  return {
    name: np.name,
    feudo,
    gender: np.gender,
    ...(np.bot ? { bot: np.bot } : {}),
    title: np.gender,
    scudi: 1000,
    servi: 1000,
    grano: 10000,
    acri: 500,
    mercato: 1,
    opificio: 1,
    palazzo: 0,
    rateBevere: 0,
    rateMacina: 0,
    rateCommerzio: 0,
    baseMercati: 0,
    baseOpifici: 0,
    vassalli: 0,
    credito: 0,
  };
}

const isQuantity = (n: number) => Number.isInteger(n) && n >= 0;

export class Game {
  constructor(
    public state: GameState,
    private rng: Rng,
    /** regole dell'espansione in gioco, se c'è */
    public readonly rules: ExpansionRules | null = null,
  ) {}

  static create(players: NewPlayer[], rng: Rng, options: Options = GAME_OPTIONS, rules: ExpansionRules | null = null): Game {
    if (players.length < 1 || players.length > MAX_PLAYERS) throw new Error(`da 1 a ${MAX_PLAYERS} giocatori`);
    // con le fazioni le città si assegnano a sorte (generatore proprio: la sequenza RND non cambia)
    const feudi = players.map((_, i) => i);
    if (options.fazioni) {
      let h = 2166136261;
      for (const v of [...rng.getState(), players.length, 0xfa210]) h = Math.imul(h ^ v, 16777619) >>> 0;
      const r = new Mulberry32(h), all = [...Array(MAX_PLAYERS).keys()];
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(r.next() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }
      feudi.splice(0, feudi.length, ...all.slice(0, players.length));
    }
    const state: GameState = {
      version: 1,
      options: { ...options },
      players: players.map((np, i) => {
        let p = createPlayer(np, feudi[i]);
        if (options.gabelle) p = { ...p, umore: UMORE_START, fiducia: FIDUCIA_START, abitudine: 0 };
        if (options.fazioni) p = { ...p, patti: [] };
        if (options.fatti) p = { ...p, effetti: [] };
        if (options.commercio) p = { ...p, granai: 0 };
        if (options.botteghe) p = { ...p, botteghe: true };
        if (np.bot) p = { ...p, strategia: np.strategia ?? (feudi[i] % 2 ? 'mercante' : 'macina') };
        return p;
      }),
      q: 0,
      current: 0,
      phase: { kind: 'commercio' },
      scalars: { raccolto: 0, prezzo: 0, domanda: 0, usura: 0, s: 0, s1: 0, natiMorti: 0, macina: 0 },
      spoiledThisYear: false,
      rngState: rng.getState(),
      log: [],
    };
    if (state.options.annate) state.annate = initAnnate(state);
    if (state.options.fatti) state.fatti = initFatti(state, state.options.fatti);
    if (rules) {
      state.expansion = rules.id;
      state.ext = rules.init(state);
    }
    const g = new Game(state, rng, rules);
    g.beginPlayerTurn();
    return g;
  }

  get player(): Player {
    return this.state.players[this.state.current];
  }

  get year(): number {
    return 900 + this.state.q;
  }

  private sync(): void {
    this.state.rngState = this.rng.getState();
  }

  private log(msg: string): void {
    this.state.log.push(`${this.year} · ${this.player.name}: ${msg}`);
  }

  /** Annota un fatto per il libro delle cronache (non tocca regole né sorte). */
  private record(fact: ChronicleFact): void {
    this.note(this.state.current, fact);
  }

  /** Annota un fatto di un signore qualsiasi (usato anche dalle espansioni). */
  note(player: number, fact: ChronicleFact): void {
    (this.state.chronicle ??= []).push({ year: this.year, player, fact });
  }

  /** Regola della macina: nel gioco base conta tutto il grano distribuito. */
  macinaRule(): MacinaRule {
    return this.rules?.macina?.(this) ?? { cap: Infinity, beyond: 1 };
  }

  /** Grano distribuito che conta per la gabella della macina. */
  macinaBase(fed: number): number {
    const { cap, beyond } = this.macinaRule();
    return fed <= cap ? fed : cap + INT((fed - cap) * beyond);
  }

  private expect(kind: GameState['phase']['kind']): void {
    if (this.state.phase.kind !== kind) throw new Error(`azione non valida nella fase ${this.state.phase.kind}`);
  }

  private beginPlayerTurn(): void {
    const st = this.state;
    if (st.options.annate) st.annate ??= initAnnate(st);
    const annata = st.annate ? annataOf(st.annate, st.current, st.q) : undefined;
    startOfTurn(this.player, st.scalars, this.rng, annata);
    this.applyReformToTurn();
    this.applyPactsToTurn();
    if (st.options.granai) st.scalars.capienza = granaryCapacity(this.player);
    else delete st.scalars.capienza;
    if (this.player.granai !== undefined) {
      st.scalars.scorta = this.player.grano;
      st.scalars.coloni = 0;
    } else {
      delete st.scalars.scorta;
      delete st.scalars.coloni;
    }
    this.rules?.onTurnStart?.(this);
    this.state.spoiledThisYear = false;
    // un'espansione può arrestare il signore all'inizio del turno (arrestCurrent)
    if (this.player.arrestato === st.q) {
      this.state.phase = { kind: 'arresto' };
      this.sync();
      return;
    }
    this.state.phase = { kind: 'commercio' };
    // un complice che parla viene prima di tutto; poi il fatto del reame, se tocca a questo signore, prima della Delibera
    if (!this.impresaAtTurnStart()) this.applyFattiToTurn();
    this.sync();
  }

  // ---------- imprese temerarie (src/domain/imprese.ts)

  /** Carta scaduta o complici ormai muti; altrimenti un complice può parlare. Ritorna true se ha parlato. */
  private impresaAtTurnStart(): boolean {
    const p = this.player, q = this.state.q, i = p.impresa;
    if (!i) return false;
    if (i.usata === undefined) {
      if (q > scadenza(i)) {
        delete p.impresa;
        this.record({ t: 'impresa', id: i.id, esito: 'scaduta', amount: 0 });
      }
      return false;
    }
    if (q > silenzioDal(i)) {
      delete p.impresa;
      return false;
    }
    if (q === i.usata || this.rng.next() >= COMPLICE_CHANCE) return false;
    const amount = multa(i);
    delete p.impresa;
    if (p.scudi >= amount) {
      p.scudi -= amount;
      this.log(`un complice parla: paga ${amount} scudi`);
      this.record({ t: 'impresa', id: i.id, esito: 'multa', amount });
      this.state.phase = { kind: 'impresa', id: i.id, esito: 'multa', amount, dopo: 'inizio' };
    } else {
      this.arrest();
      this.record({ t: 'impresa', id: i.id, esito: 'arresto', amount });
      this.state.phase = { kind: 'impresa', id: i.id, esito: 'arresto', amount, dopo: 'inizio' };
    }
    return true;
  }

  /** Un'espansione arresta il signore di turno (all'inizio del suo turno): esce dalla partita. */
  arrestCurrent(): void {
    this.arrest();
  }

  /** Dopo l'arresto deciso da un'espansione: il turno passa al signore seguente. */
  continueAfterArrest(): void {
    this.expect('arresto');
    this.advance();
  }

  private arrest(): void {
    const p = this.player;
    p.arrestato = this.state.q;
    p.caduto ??= this.state.q;
    this.log('è arrestato');
  }

  /** Il signore di turno può giocare la sua carta adesso (nella Delibera o nei dispendimenti). */
  canUseImpresa(): boolean {
    const k = this.state.phase.kind;
    return (k === 'commercio' || k === 'investimenti') && cartaInMano(this.player, this.state.q);
  }

  /** Gioca la carta: metà delle volte il bottino, metà l'arresto. */
  useImpresa(): ActionResult {
    const ph = this.state.phase;
    if (!this.canUseImpresa() || (ph.kind !== 'commercio' && ph.kind !== 'investimenti')) return { ok: false, reason: 'nessuna impresa da tentare ora' };
    const p = this.player, i = p.impresa!;
    if (this.rng.next() < IMPRESA_SUCCESSO) {
      const amount = bottino(this.rng.next());
      p.scudi += amount;
      p.impresa = { ...i, usata: this.state.q, bottino: amount };
      this.log(`assalta il carro delle decime: ${amount} scudi`);
      this.record({ t: 'impresa', id: i.id, esito: 'riuscita', amount });
      this.state.phase = { kind: 'impresa', id: i.id, esito: 'riuscita', amount, dopo: ph.kind };
    } else {
      delete p.impresa;
      this.arrest();
      this.record({ t: 'impresa', id: i.id, esito: 'fallita', amount: 0 });
      this.state.phase = { kind: 'impresa', id: i.id, esito: 'fallita', amount: 0, dopo: ph.kind };
    }
    this.sync();
    return { ok: true };
  }

  /** Dopo l'esito: chi è stato arrestato lascia il posto al signore seguente, gli altri riprendono il turno. */
  continueAfterImpresa(): void {
    const ph = this.state.phase;
    if (ph.kind !== 'impresa') throw new Error('nessuna impresa in corso');
    if (this.player.arrestato !== undefined) return this.advance();
    if (ph.dopo === 'investimenti') return this.enterInvestments();
    this.state.phase = { kind: 'commercio' };
    if (ph.dopo === 'inizio') this.applyFattiToTurn();
    this.sync();
  }

  /**
   * Fatti del reame: scadono gli effetti, il mulino nuovo fa rendere i campi,
   * il ciambellano lasciato al suo posto può rubare; poi, se tocca a questo
   * signore, il fatto dell'anno (prima della Delibera).
   */
  private applyFattiToTurn(): void {
    const st = this.state, p = this.player, f = st.fatti;
    if (!f || !p.effetti) return;
    expireEffetti(p, st.q);
    st.scalars.raccolto = INT(st.scalars.raccolto * fattiHarvestFactor(p));
    if (hasEffetto(p, 'ciambellano') && fattiRandom(f) < CIAMBELLANO_THEFT_CHANCE) {
      const amount = theftAmount(p, fattiRandom(f));
      if (amount > 0) {
        p.scudi -= amount;
        this.record({ t: 'fattoAnnuo', kind: 'furto', amount });
      }
    }
    rollTargets(st, f);
    if (!f.targets.includes(st.current)) return;
    const id = pickFatto(st, f, st.current);
    if (fattoOptions(p, id).length) {
      st.phase = { kind: 'fatto', id, awaitingChoice: true };
    } else {
      const outcome = resolveFatto(p, st.scalars, id, undefined, st.q, () => fattiRandom(f));
      this.record({ t: 'fatto', o: outcome });
      this.log(`fatto del reame: ${id}`);
      st.phase = { kind: 'fatto', id, awaitingChoice: false, outcome };
    }
  }

  /** Scelte del fatto in attesa. */
  fattoChoices(): { id: string; ok: boolean }[] {
    const ph = this.state.phase;
    if (ph.kind !== 'fatto' || !ph.awaitingChoice) return [];
    return fattoOptions(this.player, ph.id).map(id => ({ id, ok: fattoOptionOk(this.player, ph.id, id) }));
  }

  chooseFatto(option: string): ActionResult {
    const ph = this.state.phase;
    if (ph.kind !== 'fatto' || !ph.awaitingChoice) throw new Error('nessun fatto in attesa');
    const c = this.fattoChoices().find(o => o.id === option);
    if (!c) return { ok: false, reason: 'scelta non prevista' };
    if (!c.ok) return { ok: false, reason: 'scelta non possibile ora' };
    const f = this.state.fatti!;
    const outcome = resolveFatto(this.player, this.state.scalars, ph.id, option, this.state.q, () => fattiRandom(f));
    this.record({ t: 'fatto', o: outcome });
    this.log(`fatto del reame: ${ph.id} (${option})`);
    this.state.phase = { ...ph, awaitingChoice: false, outcome };
    return { ok: true };
  }

  /** Dopo il fatto del reame si apre la Delibera. */
  continueAfterFatto(): void {
    const ph = this.state.phase;
    if (ph.kind !== 'fatto' || ph.awaitingChoice) throw new Error('fatto non concluso');
    this.state.phase = { kind: 'commercio' };
  }

  /** Fazioni: i patti scaduti si sciolgono; vassallaggio e devastazioni tolgono parte del raccolto. */
  private applyPactsToTurn(): void {
    const p = this.player;
    if (!p.patti) return;
    for (const x of expirePacts(p, this.state.q)) this.record({ t: 'pactEnd', faction: x.faction, kind: x.kind });
    this.state.scalars.raccolto = INT(this.state.scalars.raccolto * harvestFactor(p));
  }

  /** Riforma delle gabelle: domanda gonfiata dall'abitudine e ricarico dei mercanti sfiduciati. */
  private applyReformToTurn(): void {
    const p = this.player, sc = this.state.scalars;
    if (p.fiducia === undefined) {
      delete sc.prezzoBase;
      delete sc.prezzoVendita;
      delete sc.ricarico;
      delete sc.nutrito;
      delete sc.venduto;
      delete sc.domandaAnno;
      return;
    }
    // il capriccio di popolo e mercanti cambia all'inizio dell'anno: il sensale lo sente già alle rendite
    p.capriccioU = stepCapriccio(p.capriccioU, this.rng.next());
    p.capriccioF = stepCapriccio(p.capriccioF, this.rng.next());
    sc.domanda += INT(abitudineOf(p) * p.servi);
    sc.domandaAnno = sc.domanda;
    sc.nutrito = 0;
    sc.venduto = 0;
    const { compra, vendi } = grainPrices(sc.prezzo, p.fiducia);
    sc.prezzoBase = sc.prezzo;
    sc.ricarico = ricarico(p.fiducia);
    sc.prezzo = compra;
    sc.prezzoVendita = vendi;
  }

  // ---------- commercio (righe 420-690)

  buy(qty: number): ActionResult {
    this.expect('commercio');
    if (!isQuantity(qty)) return { ok: false, reason: 'quantità non valida' };
    const r = buyGrain(this.player, this.state.scalars, qty);
    if (r.ok) {
      this.log(`compra ${qty} grano`);
      this.record({ t: 'buy', qty, price: this.state.scalars.prezzo });
    }
    return r;
  }

  sell(qty: number): ActionResult {
    this.expect('commercio');
    if (!isQuantity(qty)) return { ok: false, reason: 'quantità non valida' };
    const sc = this.state.scalars, p = this.player;
    const price = sc.prezzoVendita ?? sc.prezzo;
    const r = sellGrain(p, sc, qty);
    if (r.ok) {
      // commercio del grano: le scorte vendute in carestia (e a metà ritmo nelle annate medie care) attirano famiglie dai feudi vicini
      let coloni = 0;
      const media = sc.annata === 'media' && (sc.prezzoBase ?? sc.prezzo) >= SETTLER_MEDIA_PRICE;
      if (p.granai !== undefined && (sc.annata === 'carestia' || media) && sc.scorta !== undefined) {
        const stock = Math.min(qty, sc.scorta);
        sc.scorta -= stock;
        coloni = settlersFor(p, media ? INT(stock / 2) : stock, sc.coloni ?? 0);
        p.servi += coloni;
        sc.coloni = (sc.coloni ?? 0) + coloni;
      }
      if (sc.venduto !== undefined) sc.venduto += qty;
      this.log(`vende ${qty} grano${coloni ? `: arrivano ${coloni} coloni` : ''}`);
      this.record({ t: 'sell', qty, price, ...(coloni ? { coloni } : {}) });
    }
    return r;
  }

  feed(qty: number): ActionResult {
    this.expect('commercio');
    if (!isQuantity(qty)) return { ok: false, reason: 'quantità non valida' };
    const serviBefore = this.player.servi, domanda = this.state.scalars.domanda;
    const r = feedServants(this.player, this.state.scalars, qty, this.rng);
    this.sync();
    if (r.ok) {
      const p = this.player, sc = this.state.scalars;
      if (p.abitudine !== undefined) {
        sc.nutrito = (sc.nutrito ?? 0) + qty;
        p.abitudine = nextAbitudine(p, qty, domanda, serviBefore);
        const maxDeaths = INT(serviBefore * FAMINE_MAX_DEATHS);
        if (sc.natiMorti < -maxDeaths) {
          p.servi = serviBefore - maxDeaths;
          sc.natiMorti = r.natiMorti = -maxDeaths;
        }
      }
      // la scalare s alimenta la macina (riga 990): un'espansione può limitarne la parte che conta
      this.state.scalars.s = this.macinaBase(qty);
      this.log(`distribuisce ${qty} grano: ${r.natiMorti! >= 0 ? 'nati' : 'morti'} ${Math.abs(r.natiMorti!)} servi`);
      this.record({ t: 'feed', qty, demand: this.state.scalars.domanda, delta: r.natiMorti! });
      this.state.phase = { kind: 'esitoNutrimento' };
    }
    return r;
  }

  // ---------- evento (righe 780-799)

  /** Dopo l'esito del nutrimento: estrae l'evento dell'anno. */
  continueAfterFeeding(): void {
    this.expect('esitoNutrimento');
    // chiuso il mercato del grano, gli affari fra signori dell'espansione vengono prima dell'imprevisto
    if (this.rules?.signori) {
      this.state.phase = { kind: 'signori' };
      return;
    }
    this.drawYearEvent();
  }

  /** Fine degli affari fra signori: si estrae l'imprevisto dell'anno. */
  continueAfterSignori(): void {
    this.expect('signori');
    this.drawYearEvent();
  }

  /** Estrae l'evento dell'anno (dopo il nutrimento, ed eventualmente gli affari fra signori). */
  private drawYearEvent(): void {
    const p = this.player;
    // un'impresa temeraria arriva solo a chi non ne ha già una in serbo o in corso; con un'espansione ci sono solo le sue
    const impresa = !!this.state.options.imprese && !this.rules && !p.impresa;
    const riot = p.umore === undefined ? 0 : riotSlots(umoreOf(p)), attack = p.patti ? attackSlots(p) : -1;
    const ev = this.state.options.mazzo
      ? drawEvent(this.rng, { q: this.state.q, riot, attack, impresa, extra: this.rules?.deck?.(this) })
      : rollEvent(this.rng, this.state.options, riot, attack, impresa);
    this.sync();
    if (!ev) return this.enterRendite();
    if (ev.effect.kind === 'impresa') {
      p.impresa = { id: impresaOfEvent(ev.id)!, dal: this.state.q };
      const outcome = { scudi: 0, servi: 0 };
      this.log(`evento: ${ev.title}`);
      this.record({ t: 'event', id: ev.id, scudi: 0, servi: 0 });
      this.state.phase = { kind: 'evento', eventId: ev.id, awaitingChoice: false, outcome };
      return;
    }
    if (ev.effect.kind === 'carta') {
      // carta di un'espansione: va in mano, la cronaca la racconta l'espansione
      this.rules?.onCard?.(this, ev.id);
      this.log(`evento: ${ev.title}`);
      this.state.phase = { kind: 'evento', eventId: ev.id, awaitingChoice: false, outcome: { scudi: 0, servi: 0 } };
      return;
    }
    if (ev === ATTACK) {
      const f = pickFaction(p, this.rng.next());
      this.sync();
      if (!f) return this.enterRendite();
      // l'orda cresce con gli anni
      const nemici = hordeSize(f, this.state.q, this.rng.next());
      this.sync();
      this.state.phase = { kind: 'evento', eventId: FACTION_EVENT[f], awaitingChoice: true, faction: f, nemici };
      return;
    }
    if (ev.effect.kind === 'scelta') {
      this.state.phase = { kind: 'evento', eventId: ev.id, awaitingChoice: true };
    } else {
      const outcome = applyFixedEvent(this.player, ev);
      this.rules?.onEvent?.(this, ev.id, outcome);
      this.log(`evento: ${ev.title}`);
      this.record({ t: 'event', id: ev.id, scudi: outcome.scudi, servi: outcome.servi, ...(outcome.grano ? { grano: outcome.grano } : {}) });
      this.state.phase = { kind: 'evento', eventId: ev.id, awaitingChoice: false, outcome };
    }
  }

  /** Forze del signore di turno contro un'orda: servi, soldati e mura. */
  factionDefense(): Defense {
    const x = this.rules?.factionDefense?.(this) ?? { soldati: 0, mura: 1 };
    return defenseFrom(this.player, x.soldati, x.mura);
  }

  /** Probabilità di vincere contro l'orda in attesa. */
  factionWinChance(): number {
    const ph = this.state.phase;
    if (ph.kind !== 'evento' || !ph.faction) return 0;
    return winChance(this.factionDefense().total, ph.nemici ?? hordeSize(ph.faction, this.state.q, 0.5));
  }

  /** Scelte disponibili davanti alla fazione che attacca. */
  factionOptions(): { id: FactionOption; ok: boolean }[] {
    const ph = this.state.phase;
    if (ph.kind !== 'evento' || !ph.faction) return [];
    return FACTION_OPTIONS[ph.faction].map(id => ({ id, ok: optionAvailable(this.player, id) }));
  }

  /** Risponde all'attacco di una fazione. */
  chooseFaction(option: FactionOption): ActionResult {
    const ph = this.state.phase;
    if (ph.kind !== 'evento' || !ph.awaitingChoice || !ph.faction) throw new Error('nessuna fazione in attesa');
    const opt = this.factionOptions().find(o => o.id === option);
    if (!opt) return { ok: false, reason: 'scelta non prevista per questa fazione' };
    if (!opt.ok) return { ok: false, reason: 'scelta non possibile ora' };
    const difesa = this.factionDefense().total, nemici = ph.nemici ?? hordeSize(ph.faction, this.state.q, 0.5);
    const outcome = resolveFaction(this.player, ph.faction, option, this.rng, this.state.q, winChance(difesa, nemici));
    if (outcome.win !== undefined) Object.assign(outcome, { nemici, difesa });
    this.sync();
    this.rules?.onEvent?.(this, ph.eventId, outcome);
    this.log(`fazione ${ph.faction}: ${option}${outcome.win === undefined ? '' : outcome.win ? ' (vittoria)' : ' (sconfitta)'}`);
    const { faction, win, mercati, opifici, palazzo, grano } = outcome;
    this.record({
      t: 'event', id: ph.eventId, scudi: outcome.scudi, servi: outcome.servi, faction, option,
      ...(win === undefined ? {} : { win, nemici: outcome.nemici, difesa: outcome.difesa }), ...(grano ? { grano } : {}), ...(mercati ? { mercati } : {}), ...(opifici ? { opifici } : {}), ...(palazzo ? { palazzo } : {}),
    });
    this.state.phase = { ...ph, awaitingChoice: false, outcome };
    return { ok: true };
  }

  chooseEvent(choice: 'pugna' | 'riscatto'): void {
    const ph = this.state.phase;
    if (ph.kind !== 'evento' || !ph.awaitingChoice || ph.faction) throw new Error('nessuna scelta in sospeso');
    const outcome = resolveChoice(this.player, choice, this.rng, this.state.options);
    this.sync();
    this.rules?.onEvent?.(this, ph.eventId, outcome);
    this.log(`evento: ${EVENTS.find(e => e.id === ph.eventId)!.title} (${choice})`);
    this.record({ t: 'event', id: ph.eventId, scudi: outcome.scudi, servi: outcome.servi, choice });
    this.state.phase = { ...ph, awaitingChoice: false, outcome };
  }

  continueAfterEvent(): void {
    const ph = this.state.phase;
    if (ph.kind !== 'evento' || ph.awaitingChoice) throw new Error('evento non concluso');
    this.enterRendite();
  }

  // ---------- rendite (righe 860-1180)

  /** Riga 860: ogni ridisegno della schermata riesegue il deperimento (riga 865). */
  private enterRendite(): void {
    const p = this.player;
    if (p.fiducia !== undefined) {
      // riforma: le gabelle non fanno marcire il grano; solo i granai di un tesoro in debito, una volta l'anno
      if (!this.state.spoiledThisYear && p.scudi < 0 && p.grano > 0) {
        const lost = INT(p.grano * this.rng.next() * DEBT_SPOIL_MAX);
        p.grano -= lost;
        if (lost > 0) this.record({ t: 'spoil', qty: lost });
        this.sync();
      }
      this.state.spoiledThisYear = true;
    } else if (!(this.state.options.spoilOncePerYear && this.state.spoiledThisYear)) {
      spoilGrain(p, this.rng);
      this.state.spoiledThisYear = true;
      this.sync();
    }
    this.state.phase = { kind: 'rendite', preview: computeRendite(p, this.state.scalars) };
  }

  setRate(kind: RateKind, value: number): ActionResult {
    this.expect('rendite');
    const r = setRate(this.player, kind, value);
    if (r.ok) this.enterRendite();
    return r;
  }

  /** "bastante": incassa e mostra il reame. */
  collect(): void {
    const ph = this.state.phase;
    if (ph.kind !== 'rendite') throw new Error('non in fase rendite');
    const tribute = this.state.options.vassalTributeCredited ? this.player.vassalli : 0;
    collectRendite(this.player, ph.preview, this.state.options);
    this.record({ t: 'income', amount: ph.preview.totale, tribute });
    this.rules?.onIncome?.(this, ph.preview.totale);
    this.log(`incassa ${ph.preview.totale} scudi di rendita`);
    // protettorato bizantino: una parte della rendita va al governatore imperiale
    if (hasPact(this.player, 'protettorato') && ph.preview.totale > 0) {
      const amount = INT(ph.preview.totale * PROTETTORATO_TRIBUTE);
      this.player.scudi -= amount;
      this.record({ t: 'pactTribute', faction: 'bizantini', amount });
    }
    this.fattiAtIncome(ph.preview.totale);
    this.moodAndTrust();
    this.state.phase = { kind: 'reame', returnTo: 'investimenti' };
  }

  /** Fatti del reame all'incasso: la decima del vescovo e le offerte dei pellegrini. */
  private fattiAtIncome(totale: number): void {
    const p = this.player;
    if (!p.effetti) return;
    if (hasEffetto(p, 'decima') && totale > 0) {
      const amount = INT(totale * DECIMA);
      p.scudi -= amount;
      this.record({ t: 'fattoAnnuo', kind: 'decima', amount });
    }
    const pilgrims = pilgrimIncome(p);
    if (pilgrims > 0) {
      p.scudi += pilgrims;
      this.record({ t: 'fattoAnnuo', kind: 'pellegrini', amount: pilgrims });
    }
  }

  /** Fine dell'anno con uno o più pretendenti al trono: vince il più ricco. */
  private crown(contenders: number[]): void {
    const st = this.state;
    const winner = contenders.reduce((a, b) => (wealthIndex(st.players[b]) > wealthIndex(st.players[a]) ? b : a));
    st.contenders = [];
    st.current = winner;
    const entry = [...(st.chronicle ?? [])].reverse().find(e => e.player === winner && e.fact.t === 'yearEnd');
    if (entry?.fact.t === 'yearEnd') entry.fact.won = true;
    this.log('sale al trono');
    st.phase = { kind: 'fine', winner };
  }

  /** Riforma: le gabelle dell'anno muovono umore e fiducia; i mercanti chiudono o aprono bottega. */
  private moodAndTrust(): void {
    const p = this.player;
    if (p.fiducia === undefined) return;
    // tolleranza dal grano dato e venduto quest'anno, poi una deriva casuale: i numeri restano nascosti
    const sc = this.state.scalars, domanda = sc.domandaAnno ?? sc.domanda;
    const drift = () => Math.round((this.rng.next() * 2 - 1) * MOOD_DRIFT);
    p.umore = nextUmore(p, tolleranzaServi(sc.nutrito ?? 0, domanda), drift());
    p.fiducia = nextFiducia(p, tolleranzaMercanti(sc.venduto ?? 0, domanda), drift());
    const liv = livelloOf(p.fiducia);
    if (p.mercato > 1 && this.rng.next() < LEAVE_CHANCE[liv]) {
      p.mercato -= 1;
      this.log('i mercanti chiudono un mercato');
      this.record({ t: 'mercanti', delta: -1 });
    } else if (liv === 'ottimo' && roomFor(p, 'mercato') > 0 && this.rng.next() < MERCHANT_CHANCE) {
      p.mercato += 1;
      this.log('un mercante forestiero apre un mercato');
      this.record({ t: 'mercanti', delta: 1 });
    }
    this.sync();
  }

  // ---------- reame e investimenti (righe 1340-1840)

  continueFromRealm(): void {
    this.expect('reame');
    this.enterInvestments();
  }

  private enterInvestments(): void {
    this.player.scudi = INT(this.player.scudi); // riga 1640
    this.state.phase = { kind: 'investimenti' };
  }

  /** Investe una volta, o `times` volte di fila (tutte o nessuna: acquisto rapido delle terre). */
  invest(kind: InvestmentKind, times = 1): ActionResult & { servi?: number } {
    this.expect('investimenti');
    const check = canInvestTimes(this.player, kind, times);
    if (!check.ok) return check;
    let servi = 0;
    for (let i = 0; i < times; i++) {
      const extra = this.rules?.beforeInvest?.(this, kind);
      if (extra && !extra.ok) return extra;
      const r = invest(this.player, kind);
      if (!r.ok) return r;
      this.log(`investe in ${kind}`);
      // palazzo reale: la fama del palazzo che cresce attira servi nel feudo
      const come = kind === 'palazzo' && this.state.options.palazzoReale ? PALAZZO_SERVI[0] + Math.floor(this.rng.next() * (PALAZZO_SERVI[1] - PALAZZO_SERVI[0] + 1)) : 0;
      this.player.servi += come;
      servi += come;
      this.record(come ? { t: 'build', kind, servi: come } : { t: 'build', kind });
    }
    this.enterInvestments();
    return servi ? { ok: true, servi } : { ok: true };
  }

  /** Opzione 5 "karta": rivede il reame e torna agli investimenti. */
  viewRealm(): void {
    this.expect('investimenti');
    this.state.phase = { kind: 'reame', returnTo: 'investimenti' };
  }

  /** Opzione 6 "proximus": fine anno del giocatore, poi il successivo (o l'arresto per bancarotta). */
  nextYear(): void {
    this.expect('investimenti');
    const st = this.state;
    const p = this.player;
    const titleBefore = p.title;
    if (st.options.granai) {
      const lost = storeGrain(p);
      if (lost.over + lost.rot > 0) this.record({ t: 'granaio', ...lost });
    }
    this.rules?.beforeYearEnd?.(this);
    const end = endOfPlayerYear(st.players, st.current, st.scalars, this.rules?.usuryScale?.(this) ?? 1, !!st.options.pignoramenti, victoryRule(st.options));
    // con più signori chi supera la soglia attende la fine dell'anno: se sono più d'uno, vince il più ricco
    const wait = end.won && st.options.tieBreakWealth && st.players.length > 1;
    this.record({ t: 'yearEnd', usury: end.usury, titleBefore, titleAfter: p.title, tribute: end.tribute, scudi: p.scudi, servi: p.servi, won: end.won && !wait, ...(end.seized ? { seized: end.seized } : {}) });
    if (end.seized) this.log(`subisce il pignoramento: ${end.seized.acri} acri, ${end.seized.mercati} mercati, ${end.seized.opifici} opifici, ${end.seized.palazzo} piani di palazzo per ${end.seized.paid} scudi`);
    if (end.won && !wait) {
      this.log('sale al trono');
      st.phase = { kind: 'fine', winner: st.current };
      return;
    }
    // bancarotta: troppi debiti, il signore finisce in ceppi
    if (st.options.bancarotta && p.scudi <= -DEBITO_ARRESTO) {
      this.arrest();
      this.record({ t: 'bancarotta', scudi: p.scudi });
      st.phase = { kind: 'arresto', motivo: 'debiti' };
      this.sync();
      return;
    }
    if (wait) {
      (st.contenders ??= []).push(st.current);
      this.log('supera la soglia del trono: si attende la fine dell\'anno');
    }
    this.advance();
  }

  /** Passa al signore seguente (e all'anno seguente dopo l'ultimo). */
  private advance(): void {
    const st = this.state;
    // nessun signore resta in gioco (un signore solo, arrestato): la partita finisce senza re
    if (st.players.every(x => x.caduto !== undefined)) {
      st.phase = { kind: 'fine', winner: -1 };
      return;
    }
    // i signori caduti in guerra o arrestati non giocano più
    do {
      st.current += 1;
      if (st.current >= st.players.length) {
        if (st.contenders?.length) return this.crown(st.contenders);
        st.current = 0;
        this.rules?.onYearClose?.(this);
        st.q += 1;
      }
    } while (st.players[st.current].caduto !== undefined);
    if (this.lastStanding()) return;
    this.beginPlayerTurn();
  }

  /**
   * Un feudo cade in guerra: il suo signore esce dalla partita. Se resta un
   * solo signore, o non resta nessun giocatore umano, la partita finisce.
   */
  fall(i: number): void {
    const p = this.state.players[i];
    if (p.caduto !== undefined) return;
    p.caduto = this.state.q;
    this.note(i, { t: 'ext', kind: 'fallen', data: { q: this.state.q } });
  }

  /** Fine della partita per caduta dei rivali: vince l'ultimo rimasto, o il più ricco fra i superstiti. */
  private lastStanding(): boolean {
    const st = this.state;
    const alive = st.players.map((_, i) => i).filter(i => st.players[i].caduto === undefined);
    const humans = st.players.some(p => !p.bot);
    const noHuman = humans && !alive.some(i => !st.players[i].bot);
    if (st.players.length < 2 || (alive.length > 1 && !noHuman)) return false;
    const winner = alive.reduce((a, b) => (wealthIndex(st.players[b]) > wealthIndex(st.players[a]) ? b : a));
    st.current = winner;
    st.phase = { kind: 'fine', winner };
    return true;
  }
}
