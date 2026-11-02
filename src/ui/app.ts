/**
 * Interfaccia: una vista per fase; la Delibera è guidata dal consigliere (src/ui/trade.ts).
 * Tutta la logica sta in src/domain; qui solo rendering e input.
 */
import { ANNATA_LABEL } from '../domain/annate';
import type { RateKind } from '../domain/economy';
import { fiduciaOf, livelloOf, sereno, umoreOf, type Livello } from '../domain/gabelle';
import type { FactionOption } from '../domain/fazioni';
import type { Sorte } from '../domain/fatti';
import { effettiStrip, fattoBadges, fattoCaption, fattoOptionText, fattoScene, fattoTitle } from './fatti';
import { crest, factionBadges, factionOutcomeText, forcesBox, INFO as FACTION_INFO, optionText, pactsStrip, renderFactionOutcome } from './fazioni';
import { EVENTS } from '../domain/events';
import { COSTS, type InvestmentKind } from '../domain/investments';
import { DEBITO_ARRESTO, FEUDI, rankOf, titleName, wealthIndex } from '../domain/rank';
import { C64Rnd, Mulberry32, ORIGINAL_SEED, type Rng } from '../domain/rng';
import { Game, MAX_PLAYERS, type NewPlayer } from '../domain/turn';
import { BALANCED_OPTIONS, CLASSIC_OPTIONS, type BotLevel, type Gender, type Player } from '../domain/types';
import { playBotTurn } from '../domain/bots';
import { renderChronicle } from './chronicle';
import { EXPANSIONS, findExpansion } from '../expansions';
import type { Expansion, ExtCard, ExtUi } from '../expansions/types';
import { DEED_MS, makeDeed, renderDeed, type Deed } from './deed';
import { renderConfirm, renderDecision, renderNotice, type DebtConfirm, type Notice } from './notice';
import { seizedNotice } from './pignoramenti';
import { hiredLine, renderSensaleOffer, sensaleBadges } from './sensale';
import { hasSensale, hireSensale, sensaleCost, sensaleNow } from '../domain/sensale';
import type { RateBadges } from './rendite';
import { deleteSave, listSaves, loadGame, newSlotId, saveGame, type SaveSlot } from '../persistence/save';
import { feedingOutcome, greeting, question, reaction, refusal, type TradeMode } from './advisor';
import { icons, turret } from './art';
import { builderGreeting, builderReaction, renderCantiere, type CantiereUi } from './cantiere';
import { buildInterlude, renderInterlude, snapshot, type Interlude, type YearSnapshot } from './interlude';
import { impreseAside, renderImpresa } from './imprese';
import { realmComment, realmHeading, realmLegend, realmScene } from './realm';
import { c64ify, loadTheme, saveTheme, type Theme } from './theme';
import { renderTutorial, renderWelcome, TUTORIAL_PAGES, welcomeText } from './tutorial';
import { ANSELMO } from './advisor';
import { speechBox } from './speaker';
import { comicText, effectBadges, outcomeText, renderEventComic, renderOutcomeComic, type ComicText } from './comics';
import { changedKinds, currentRates, KINDS, presets, previewRates, renderRendite, spoilsFor, treasurerGreeting, treasurerReaction, updateLive, type RenditeUi } from './rendite';
import { maxQty, preview, renderExtCards, renderFeedingOutcome, renderSignoriCard, renderTrade, type TradeUi } from './trade';

/** Pagina "Fra signori": le carte dell'espansione per gli affari con gli altri signori. */
const signoriPage = (cards: ExtCard[], back: string) => `<h2>Fra signori</h2>${renderExtCards(cards, '')}
  <div class="btns"><button data-act="signoriMenu" data-close="1" class="primary">${back}</button></div>`;

type RngKind = 'c64' | 'mulberry';

interface UiState {
  game: Game | null;
  /** slot di salvataggio della partita in corso */
  slot: string | null;
  rngKind: RngKind;
  message: string;
  setup: { count: number; mode: 'classica' | 'bilanciata'; sorte: Sorte; rngKind: RngKind; names: string[]; genders: Gender[]; kinds: PlayerKind[]; levels: BotLevel[]; expansion: string | null };
  /** pannelli dell'espansione nella Delibera */
  ext: ExtUi;
  trade: TradeUi;
  rendite: RenditeUi;
  comic: ComicUi;
  cantiere: CantiereUi;
  theme: Theme;
  /** istantanea di inizio anno, per la cronaca del siparietto */
  yearSnap: YearSnapshot | null;
  interlude: Interlude | null;
  /** scene di fine anno dell'espansione (le battaglie), mostrate prima del riepilogo */
  scenes: { year: number; list: { title: string; html: string }[]; i: number } | null;
  /** schermata iniziale: il mercante chiede se serve l'insegnamento, poi la scelta dei signori */
  screen: 'welcome' | 'setup';
  welcome: string;
  tutorial: { page: number; inGame: boolean } | null;
  /** veduta del reame a fine anno di un signore, prima del signore seguente o del siparietto */
  realmReview: RealmReview | null;
  /** anno di cui si sta leggendo il libro delle cronache */
  chronicleYear: number | null;
  realmText: { key: string; text: string };
  /** atto di acquisto mostrato come pergamena dopo un investimento */
  deed: Deed | null;
  deedCount: number;
  /** pergamena da chiudere (arruolamento, catapulte): finché è aperta il resto della pagina non risponde */
  notice: Notice | null;
  /** spesa che manda il tesoro in debito, in attesa di conferma */
  confirm: DebtConfirm | null;
  /** turno per cui si è già cercato un pignoramento da annunciare */
  seizedKey?: string;
}

/** Testi delle vignette, scelti una volta per evento così restano fissi ai ridisegni. */
interface ComicUi {
  key: string;
  event?: ComicText;
  outcome?: ComicText;
}

type PlayerKind = 'umano' | 'computer';

/** Veduta del reame a fine anno di un signore umano. */
interface RealmReview {
  player: Player;
  year: number;
  comment: string;
}

/** Nomi per i signori del computer lasciati senza nome (nomi del tempo). */
const BOT_NAMES: Record<Gender, string[]> = {
  1: ['Ardoino', 'Berengario', 'Adalberto', 'Lamberto', 'Anscario', 'Guido', 'Ottone', 'Rodolfo', 'Ugo'],
  6: ['Matilde', 'Ermengarda', 'Teodolinda', 'Adelaide', 'Gisla', 'Ageltrude', 'Rotruda', 'Willa', 'Berta'],
};

/** Torrette in cima al riquadro, come nella cornice dello schermo originale. */
const battlements = `<div class="battlements" aria-hidden="true">${turret}${turret}${turret}</div>`;

const turnKey = (g: Game) => `${g.state.q}-${g.state.current}`;

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const fmt = (n: number) => Math.floor(n).toLocaleString('it-IT');

function fullName(p: Player): string {
  return `${titleName(p.title)} ${esc(p.name)} da ${FEUDI[p.feudo]}`;
}

/** Seme casuale per una partita nuova. */
function freshSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }
}

function makeRng(kind: RngKind, state?: number[]): Rng {
  if (kind === 'c64') return new C64Rnd(state ?? ORIGINAL_SEED);
  return new Mulberry32(state?.[0] ?? freshSeed());
}

export interface MountOptions {
  /**
   * Generatore della partita. Il gioco usa sempre una sorte nuova ('mulberry');
   * 'c64' riproduce la sequenza dell'originale ed è usato dai test.
   */
  rngKind?: RngKind;
  /** false: partite senza fatti del reame (test che non li riguardano) */
  fatti?: boolean;
}

/** Note accanto alle gabelle: il giudizio del sensale e quelle di un'espansione. */
function rateBadgesFor(g: Game): RateBadges {
  const ext = findExpansion(g.state.expansion)?.view.rateBadges;
  return (game, r) => {
    const a = sensaleBadges(game, r), b = ext?.(game, r) ?? null;
    return a || b ? { ...a, ...b } : null;
  };
}

export function mountApp(root: HTMLElement, opts: MountOptions = {}): void {
  const startRng: RngKind = opts.rngKind ?? 'mulberry';
  const ui: UiState = {
    game: null, slot: null, rngKind: startRng, message: '', setup: { count: 1, mode: 'classica', sorte: 'normale', rngKind: startRng, names: [], genders: [], kinds: [], levels: [], expansion: null },
    ext: { key: '', panel: null, say: '' },
    trade: { key: '', mode: 'menu', advisor: '', qty: 0 },
    rendite: { key: '', draft: { bevere: 0, macina: 0, commerzio: 0 }, advisor: '' },
    comic: { key: '' },
    cantiere: { key: '', advisor: '' },
    theme: loadTheme(),
    yearSnap: null,
    interlude: null,
    scenes: null,
    screen: 'welcome',
    welcome: welcomeText(),
    tutorial: null,
    realmReview: null,
    chronicleYear: null,
    deed: null,
    deedCount: 0,
    notice: null,
    confirm: null,
    realmText: { key: '', text: '' },
  };

  const render = () => {
    const g = ui.game;
    const exp = g ? findExpansion(g.state.expansion) : null;
    // i pannelli dell'espansione valgono solo nella fase (Delibera o dispendimenti) del signore di turno
    if (g && ui.ext.key !== `${turnKey(g)}-${g.state.phase.kind}`) ui.ext = { key: `${turnKey(g)}-${g.state.phase.kind}`, panel: null, say: '' };
    // nuovo turno: il consigliere saluta con una frase adatta alla situazione
    if (g && g.state.phase.kind === 'commercio' && ui.trade.key !== turnKey(g)) {
      ui.trade = { key: turnKey(g), mode: 'menu', advisor: greeting(g.player, g.state.scalars, g.year), qty: 0 };
    }
    // fase rendite: il camerlengo presenta i conti, la bozza parte dalle gabelle in vigore
    if (g && g.state.phase.kind === 'rendite' && ui.rendite.key !== turnKey(g)) {
      ui.rendite = { key: turnKey(g), draft: currentRates(g.player), advisor: treasurerGreeting(g) };
    }
    const ph = g?.state.phase;
    if (g && ph?.kind === 'evento') {
      const key = `${turnKey(g)}-${ph.eventId}`;
      if (ui.comic.key !== key) ui.comic = { key, event: comicText(ph.eventId, g.player) };
      if (ph.outcome?.choice && !ph.faction && !ui.comic.outcome) ui.comic.outcome = outcomeText(ph.outcome, g.player);
      // attacco di una fazione: dopo la scelta la vignetta racconta l'esito, non più l'arrivo
      if (ph.faction && ph.outcome && !ph.awaitingChoice && !ui.comic.outcome) ui.comic.outcome = factionOutcomeText(ph.outcome, g.player);
    }
    if (g && ph?.kind === 'reame' && ui.realmText.key !== turnKey(g)) {
      ui.realmText = { key: turnKey(g), text: realmComment(g.player) };
    }
    if (g && ph?.kind === 'investimenti' && ui.cantiere.key !== turnKey(g)) {
      ui.cantiere = { key: turnKey(g), advisor: builderGreeting(g) };
    }
    // istantanea di inizio anno, prima che i signori del computer muovano
    if (g && !ui.yearSnap) ui.yearSnap = snapshot(g.state);
    // signori del computer: giocano in silenzio finché tocca a loro; il racconto è nel libro delle cronache
    if (g && !ui.realmReview && !ui.interlude && ui.chronicleYear === null && !ui.tutorial) {
      const q0 = g.state.q;
      while ((g.state.phase.kind === 'commercio' || g.state.phase.kind === 'fatto' || g.state.phase.kind === 'impresa' || g.state.phase.kind === 'arresto') && g.player.bot && g.state.q === q0) playBotTurn(g);
    }
    // fine dell'anno (tutti i signori hanno giocato): cala il sipario
    if (g && !ui.realmReview && ui.chronicleYear === null) {
      if (ui.yearSnap && g.state.q > ui.yearSnap.q) {
        // le battaglie dell'anno si vedono per prime, poi cala il sipario
        const year = 900 + ui.yearSnap.q;
        const list = exp?.view.yearEndScenes?.(g.state, year) ?? [];
        if (list.length) ui.scenes = { year, list, i: 0 };
        if (g.state.phase.kind !== 'fine') ui.interlude = buildInterlude(ui.yearSnap, g.state, exp?.view.mapMarkers?.(g.state) ?? '');
        ui.yearSnap = snapshot(g.state);
      }
    }
    document.documentElement.dataset.theme = ui.theme;
    // il font C64 non ha le lettere accentate: si scrive come sullo schermo originale ("piu'", "e' re")
    let page: string;
    if (ui.tutorial) page = renderTutorial(ui.tutorial.page, ui.tutorial.inGame);
    else if (!g) page = ui.screen === 'welcome' ? `<section class="card castle setup-card">${battlements}${renderWelcome(ui.welcome)}</section>` : renderSetup(ui);
    else if (ui.realmReview) page = renderRealmReview(ui.realmReview);
    else if (ui.chronicleYear !== null) page = renderChronicle(g.state, ui.chronicleYear, exp?.view ?? null);
    // sotto il sipario e le scene di fine anno non si vede nulla: l'anno nuovo (e le sue notizie) comincia dopo la cronaca
    else if ((ui.interlude || ui.scenes) && g.state.phase.kind !== 'fine') page = '';
    else page = renderGame(g, ui.message, ui.trade, ui.rendite, ui.comic, ui.cantiere, ui.theme, ui.realmText.text, exp, ui.ext);
    // la pergamena compare solo durante i dispendimenti
    if (ui.deed && g?.state.phase.kind !== 'investimenti') ui.deed = null;
    const deed = ui.deed && !ui.tutorial && !ui.realmReview ? renderDeed(ui.deed) : '';
    const overlay = ui.tutorial ? '' : ui.scenes ? renderScene(ui.scenes) : ui.interlude ? renderInterlude(ui.interlude) : '';
    // una scelta dell'espansione (es. una proposta di pace) si mostra solo sulla pagina del turno, non sotto sipari e cronache
    const onTurn = g && !g.player.bot && !overlay && !ui.realmReview && ui.chronicleYear === null && g.state.phase.kind !== 'fine';
    // pignoramento di fine anno: la pergamena arriva al signore all'inizio del suo turno seguente, una volta sola
    if (onTurn && g.state.phase.kind === 'commercio' && ui.seizedKey !== turnKey(g)) {
      ui.seizedKey = turnKey(g);
      const end = g.state.chronicle?.find(e => e.year === g.year - 1 && e.player === g.state.current && e.fact.t === 'yearEnd')?.fact;
      if (end?.t === 'yearEnd' && end.seized && !ui.notice) ui.notice = seizedNotice(end.seized, g.player);
    }
    const decision = onTurn ? exp?.view.decision?.(g) ?? null : null;
    const modal = !g || ui.tutorial ? '' : ui.confirm ? renderConfirm(ui.confirm) : ui.notice ? renderNotice(ui.notice) : decision ? renderDecision(decision) : '';
    root.innerHTML = c64ify(page + deed + overlay + modal);
    if (modal) root.querySelector<HTMLButtonElement>('.notice .primary')?.focus();
    if (ui.interlude && !ui.interlude.closing) root.querySelector<HTMLButtonElement>('.interlude button')?.focus();
    // i dispacci si srotolano una volta sola, quando la Delibera è davvero in vista (non sotto il siparietto)
    if (g && !ui.interlude && !ui.tutorial && !ui.realmReview && ui.chronicleYear === null) ui.ext.seen = true;
    // salvataggio automatico nello slot della partita; a partita finita lo slot si libera
    if (ui.game && ui.slot) {
      if (ui.game.state.phase.kind === 'fine') deleteSave(ui.slot);
      else saveGame(ui.game.state, ui.rngKind, ui.slot);
    }
  };

  const act = (fn: () => { ok: boolean; reason?: string } | void) => {
    const r = fn();
    ui.message = r && !r.ok ? (r.reason ?? 'azione non valida') : '';
    render();
  };

  const num = (name: string): number => {
    const el = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
    return el && el.value.trim() !== '' ? Number(el.value) : NaN;
  };

  /**
   * Schermata iniziale: i valori si memorizzano senza ridisegnare. Ridisegnare
   * su ogni "change" sostituiva il pulsante Inizia mentre lo si cliccava (il
   * campo nome perde il focus tra pressione e rilascio), e il clic andava perso.
   * Si ridisegna solo quando cambia il numero di signori.
   */
  const rememberSetup = (t: HTMLInputElement) => {
    const m = /^(name|gender|kind|level)(\d+)$/.exec(t.name ?? '');
    if (!m) return;
    const i = Number(m[2]);
    if (m[1] === 'name') ui.setup.names[i] = t.value;
    if (m[1] === 'gender' && (t.type !== 'radio' || t.checked)) ui.setup.genders[i] = Number(t.value) as Gender;
    if (m[1] === 'level') ui.setup.levels[i] = t.value as BotLevel;
    if (m[1] === 'kind') {
      ui.setup.kinds[i] = t.value as PlayerKind;
      // si abilita il livello senza ridisegnare (vedi sopra)
      const lv = root.querySelector<HTMLSelectElement>(`[name="level${i}"]`);
      if (lv) lv.disabled = t.value !== 'computer';
      const nm = root.querySelector<HTMLInputElement>(`[name="name${i}"]`);
      if (nm) nm.placeholder = t.value === 'computer' ? BOT_NAMES[ui.setup.genders[i] ?? 1][i] : `Signore ${i + 1}`;
    }
  };

  root.addEventListener('change', e => {
    if (ui.game) return;
    const t = e.target as HTMLInputElement;
    rememberSetup(t);
    if (t.name === 'mode') ui.setup.mode = t.value as 'classica' | 'bilanciata';
    if (t.name === 'sorte') ui.setup.sorte = t.value as Sorte;
    if (t.name === 'count') {
      ui.setup.count = Number(t.value);
      render();
    }
  });

  root.addEventListener('submit', e => e.preventDefault());

  // cursore e campo numerico restano allineati; l'anteprima si aggiorna senza ridisegnare
  root.addEventListener('input', e => {
    const t = e.target as HTMLInputElement;
    const g = ui.game;
    if (!g) return rememberSetup(t);
    if (t.name?.startsWith('r-') && g.state.phase.kind === 'rendite') {
      const kind = t.name.slice(2) as (typeof KINDS)[number];
      ui.rendite.draft = { ...ui.rendite.draft, [kind]: Math.max(0, Math.min(99, Math.floor(Number(t.value) || 0))) };
      updateLive(root, g, ui.rendite.draft, rateBadgesFor(g));
      return;
    }
    const mode = ui.trade.mode;
    if (!g || mode === 'menu' || (t.name !== 'qty' && t.name !== 'qty-range')) return;
    const max = maxQty(mode, g.player, g.state.scalars);
    const v = Math.max(0, Math.min(max, Math.floor(Number(t.value) || 0)));
    ui.trade.qty = v;
    const other = root.querySelector<HTMLInputElement>(`[name="${t.name === 'qty' ? 'qty-range' : 'qty'}"]`);
    if (other) other.value = String(v);
    const pv = root.querySelector('#trade-preview');
    if (pv) pv.innerHTML = c64ify(preview(mode, v, g.player, g.state.scalars));
  });

  /** Scudi che un pulsante sta per spendere (0: non è un acquisto). */
  const purchaseCost = (g: Game, a: string, data: DOMStringMap, field: (name: string) => number): number => {
    let cost = 0;
    if (a === 'hireSensale') cost = hasSensale(g) ? 0 : sensaleCost(g.player, sensaleNow(g));
    if (a === 'invest') cost = (COSTS[data.kind as InvestmentKind] ?? 0) * Math.max(1, Number(data.times) || 1);
    else if (a === 'confirmTrade' && ui.trade.mode === 'buy') cost = Math.ceil((field('qty') * g.state.scalars.prezzo) / 1000);
    else if (a === 'ext') cost = findExpansion(g.state.expansion)?.view.cost?.(g, data.op!, data, field) ?? 0;
    return Number.isFinite(cost) ? cost : 0;
  };

  root.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!btn) return;
    // con una pergamena aperta valgono solo i suoi pulsanti (un doppio clic non compra due volte)
    const modal = root.querySelector('.notice-backdrop');
    if (modal && !modal.contains(btn)) return;
    handle(btn.dataset, num, false);
  });

  const handle = (data: DOMStringMap, num: (name: string) => number, confirmed: boolean): void => {
    const btn = { dataset: data };
    const g = ui.game;
    const a = data.act!;
    // un acquisto che manda il tesoro in debito (ma resta nel credito concesso) si conferma prima
    if (g && !confirmed) {
      const cost = purchaseCost(g, a, data, num), p = g.player, after = p.scudi - cost;
      if (cost > 0 && after < 0 && after >= -p.credito) {
        // i campi del pannello si ridisegnano sotto la pergamena: se ne tengono i valori di adesso
        const vals = new Map([...root.querySelectorAll<HTMLInputElement>('input[name], select[name]')].map(el => [el.name, el.value]));
        const field = (name: string) => { const v = vals.get(name); return v !== undefined && v.trim() !== '' ? Number(v) : NaN; };
        const saved = { ...data };
        ui.confirm = { cost, after: -after, usura: g.state.scalars.usura, run: () => handle(saved, field, true) };
        return render();
      }
    }
    switch (a) {
      case 'confirmYes': {
        const c = ui.confirm;
        ui.confirm = null;
        if (c) c.run();
        else render();
        return;
      }
      case 'confirmNo':
        ui.confirm = null;
        return render();
      case 'noticeClose':
        ui.notice = null;
        return render();
      case 'start': {
        const players: NewPlayer[] = [];
        for (let i = 0; i < ui.setup.count; i++) {
          const genderEl = root.querySelector<HTMLSelectElement>(`[name="gender${i}"]`);
          const gender = (genderEl ? Number(genderEl.value) : ui.setup.genders[i] ?? 1) as Gender;
          const kind = (root.querySelector<HTMLSelectElement>(`[name="kind${i}"]`)?.value ?? ui.setup.kinds[i] ?? 'umano') as PlayerKind;
          const level = (root.querySelector<HTMLSelectElement>(`[name="level${i}"]`)?.value ?? ui.setup.levels[i] ?? 'medio') as BotLevel;
          const typed = root.querySelector<HTMLInputElement>(`[name="name${i}"]`)?.value.trim() || ui.setup.names[i]?.trim();
          const name = typed || (kind === 'computer' ? BOT_NAMES[gender][i] : `Signore ${i + 1}`);
          players.push(kind === 'computer' ? { name, gender, bot: level } : { name, gender });
        }
        ui.rngKind = ui.setup.rngKind;
        const exp = findExpansion(ui.setup.expansion);
        const rules = ui.setup.mode === 'classica' ? CLASSIC_OPTIONS : BALANCED_OPTIONS;
        ui.game = Game.create(players, makeRng(ui.rngKind), opts.fatti === false ? rules : { ...rules, fatti: ui.setup.sorte }, exp?.rules ?? null);
        ui.slot = newSlotId();
        ui.message = '';
        return render();
      }
      case 'resume': {
        const save = loadGame(btn.dataset.slot);
        if (save) {
          const exp = findExpansion(save.state.expansion);
          if (save.state.expansion && !exp) {
            ui.message = "La partita salvata usa un'espansione che non è più presente.";
            return render();
          }
          ui.rngKind = save.rngKind;
          ui.slot = save.id;
          ui.game = new Game(save.state, makeRng(save.rngKind, save.state.rngState), exp?.rules ?? null);
        }
        return render();
      }
      case 'deleteSave':
        if (btn.dataset.slot) deleteSave(btn.dataset.slot);
        return render();
      case 'expansion':
        ui.setup.expansion = btn.dataset.id || null;
        return render();
      case 'extOpen': {
        const exp = findExpansion(g!.state.expansion);
        const panel = btn.dataset.panel!;
        if (exp) ui.ext = { ...ui.ext, panel, say: exp.view.open(g!, panel) };
        return render();
      }
      case 'extArchive':
        ui.ext.archived = true;
        return render();
      case 'extClose':
        ui.ext.panel = null;
        return render();
      case 'signoriMenu':
        ui.ext.signori = btn.dataset.close ? undefined : g!.state.phase.kind;
        ui.message = '';
        return render();
      case 'warMenu':
        ui.ext.menu = btn.dataset.close ? undefined : 'guerra';
        ui.message = '';
        return render();
      case 'ext': {
        const exp = findExpansion(g!.state.expansion);
        if (!exp) return;
        const r = exp.view.act(g!, btn.dataset.op!, btn.dataset, num);
        ui.ext.say = r.say;
        if (r.panel !== undefined) ui.ext.panel = r.panel;
        if (r.notice) ui.notice = r.notice;
        ui.message = '';
        render();
        // la risposta del consigliere sta in cima al pannello: se il modulo l'ha spinta fuori schermo, la si riporta in vista
        const box = root.querySelector('.ext-panel')?.previousElementSibling;
        if (box?.classList.contains('advisor') && box.getBoundingClientRect().top < 0) {
          const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
          box.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
        }
        return;
      }
      case 'sceneNext':
        if (!ui.scenes) return;
        ui.scenes.i += 1;
        if (ui.scenes.i >= ui.scenes.list.length) ui.scenes = null;
        return render();
      case 'interludeClose': {
        if (!ui.interlude || ui.interlude.closing) return;
        ui.interlude.closing = true;
        render();
        const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        const year = ui.interlude.year;
        setTimeout(() => {
          ui.interlude = null;
          ui.chronicleYear = year;
          render();
          root.scrollIntoView?.({ block: 'start' });
        }, reduced ? 0 : 900);
        return;
      }
      case 'chronicleClose':
        ui.chronicleYear = null;
        return render();
      case 'new':
        ui.yearSnap = null;
        ui.interlude = null;
        ui.scenes = null;
        ui.chronicleYear = null;
        // la partita in corso resta nel suo slot: si potrà riprendere
        ui.slot = null;
        ui.game = null;
        return render();
      case 'tradeMode': {
        const mode = btn.dataset.mode as TradeMode;
        const sc = g!.state.scalars, p = g!.player;
        const start = mode === 'feed' ? Math.min(sc.domanda, p.grano) : 0;
        ui.trade = { ...ui.trade, mode, advisor: question(mode, p, sc), qty: start };
        ui.message = '';
        return render();
      }
      case 'hireSensale': {
        const r = hireSensale(g!);
        ui.rendite.sensaleSay = r.ok ? hiredLine(g!) : `Non si può, ${g!.player.gender === 1 ? 'Messere' : 'Madonna'}: ${r.reason}.`;
        return render();
      }
      case 'tradeBack':
        ui.trade = { ...ui.trade, mode: 'menu', advisor: 'Come desiderate. Cos\'altro comandate?' };
        return render();
      case 'chip':
        ui.trade.qty = Number(btn.dataset.qty);
        return render();
      case 'confirmTrade': {
        const mode = ui.trade.mode as TradeMode;
        const qty = num('qty');
        const r = mode === 'buy' ? g!.buy(qty) : mode === 'sell' ? g!.sell(qty) : g!.feed(qty);
        if (!r.ok) {
          ui.trade.advisor = refusal(r.reason, g!.player);
        } else if (mode === 'feed') {
          ui.trade.advisor = feedingOutcome(g!.state.scalars.natiMorti, g!.player);
        } else {
          ui.trade = { ...ui.trade, mode: 'menu', advisor: reaction(mode, qty, g!.player, g!.state.scalars) };
        }
        ui.message = '';
        return render();
      }
      case 'afterFeed': return act(() => g!.continueAfterFeeding());
      case 'afterSignori': return act(() => g!.continueAfterSignori());
      case 'faction': return act(() => { g!.chooseFaction(btn.dataset.opt as FactionOption); });
      case 'pugna': return act(() => g!.chooseEvent('pugna'));
      case 'riscatto': return act(() => g!.chooseEvent('riscatto'));
      case 'afterEvent': return act(() => g!.continueAfterEvent());
      case 'fatto': return act(() => { g!.chooseFatto(btn.dataset.opt!); });
      case 'afterFatto': return act(() => g!.continueAfterFatto());
      case 'impresa': return act(() => g!.useImpresa());
      case 'afterImpresa': return act(() => g!.continueAfterImpresa());
      case 'afterArrest': return act(() => g!.continueAfterArrest());
      case 'rHelp':
        ui.rendite.help = btn.dataset.kind as RateKind;
        return render();
      case 'rHelpClose':
        ui.rendite.help = undefined;
        return render();
      case 'rPreset': {
        const pr = presets(g!.player, g!.state.scalars).find(x => x.id === btn.dataset.preset);
        if (pr) ui.rendite.draft = { ...pr.rates };
        return render();
      }
      case 'rApply':
      case 'rCollect': {
        const draft = ui.rendite.draft;
        const before = { grano: g!.player.grano, totale: previewRates(g!.player, g!.state.scalars, currentRates(g!.player)).totale };
        const spoils = spoilsFor(g!, draft);
        // una chiamata per voce cambiata: come ritoccarle una alla volta nell'originale
        for (const k of changedKinds(g!.player, draft)) g!.setRate(k, draft[k]);
        const ph = g!.state.phase;
        if (a === 'rApply' && ph.kind === 'rendite') {
          ui.rendite.advisor = treasurerReaction(g!, before, ph.preview, spoils);
          ui.rendite.draft = currentRates(g!.player);
          return render();
        }
        // dopo l'incasso si va subito ai dispendimenti: il reame si mostra a fine anno, con gli acquisti fatti
        // (nell'originale la schermata del reame veniva qui; non consuma RND, quindi saltarla non cambia la partita)
        return act(() => {
          g!.collect();
          if (g!.state.phase.kind === 'reame') g!.continueFromRealm();
        });
      }
      case 'realmBack': return act(() => g!.continueFromRealm());
      case 'invest': {
        const kind = btn.dataset.kind as InvestmentKind;
        // acquisto rapido delle terre: più fondi in una volta
        const times = Math.max(1, Number(btn.dataset.times) || 1);
        const r = g!.invest(kind, times);
        ui.cantiere.advisor = r.ok ? builderReaction(kind, g!.player, times, r.ok ? r.servi : 0) : `Non si può, ${g!.player.gender === 1 ? 'Messere' : 'Madonna'}: ${r.reason}.`;
        ui.message = '';
        if (r.ok) {
          // la pergamena registra l'atto; si ritira da sola dopo qualche secondo
          const deed = makeDeed(kind, g!.player, g!.year, ++ui.deedCount, times);
          ui.deed = deed;
          setTimeout(() => {
            if (ui.deed !== deed) return;
            ui.deed = null;
            root.querySelector('.deed')?.remove();
          }, DEED_MS);
        }
        return render();
      }
      case 'deedClose': {
        ui.deed = null;
        root.querySelector('.deed')?.remove();
        return;
      }
      case 'theme':
        ui.theme = ui.theme === 'c64' ? 'pergamena' : 'c64';
        saveTheme(ui.theme);
        return render();
      case 'karta': return act(() => g!.viewRealm());
      case 'next': {
        const idx = g!.state.current, year = g!.year;
        g!.nextYear();
        // il reame del signore a fine anno (dopo usura, titoli e tributi), prima di passare oltre
        if (g!.state.phase.kind !== 'fine') {
          const player = structuredClone(g!.state.players[idx]);
          ui.realmReview = { player, year, comment: realmComment(player) };
        }
        ui.message = '';
        return render();
      }
      case 'reviewDone':
        ui.realmReview = null;
        return render();
      case 'tutorialStart':
        ui.tutorial = { page: 0, inGame: false };
        return render();
      case 'openTutorial':
        ui.tutorial = { page: 0, inGame: true };
        return render();
      case 'skipTutorial':
        ui.screen = 'setup';
        return render();
      case 'tutPrev':
        if (ui.tutorial) ui.tutorial.page = Math.max(0, ui.tutorial.page - 1);
        return render();
      case 'tutNext':
        if (ui.tutorial) ui.tutorial.page = Math.min(TUTORIAL_PAGES - 1, ui.tutorial.page + 1);
        return render();
      case 'tutClose':
        if (ui.tutorial && !ui.tutorial.inGame) ui.screen = 'setup';
        ui.tutorial = null;
        return render();
    }
  };

  render();
}

/** Veduta del reame alla fine dell'anno di un signore. */
function renderRealmReview(r: RealmReview): string {
  return `<section class="card phase castle review">${battlements}
    <h2>Lo reame alla fine dell'anno ${r.year}</h2>
    <p class="realm-heading">${realmHeading(r.player, r.year)}</p>
    <div class="realm-frame">${realmScene(r.player)}</div>
    ${speechBox(ANSELMO, r.comment)}
    ${realmLegend(r.player)}
    <div class="btns"><button data-act="reviewDone" class="primary">Prosegui</button></div>
  </section>`;
}

/** Le partite salvate: anno, signori, regole, espansione e quando sono state salvate. */
function renderSaves(saves: SaveSlot[]): string {
  if (!saves.length) return '';
  const when = (t: number) => (t ? new Date(t).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'versione precedente');
  const items = saves.map(s => {
    const st = s.state;
    const lords = st.players.map(p => `${esc(p.name)}${p.bot ? ` <small>(computer, ${p.bot})</small>` : ''}`).join(', ');
    const exp = findExpansion(st.expansion);
    const rules = [st.options.spoilOncePerYear ? 'bilanciata' : 'classica', exp ? exp.view.title : '', st.options.fatti ? `sorte: ${st.options.fatti}` : ''].filter(Boolean).join(' · ');
    return `<li class="save-slot"><div class="save-info"><b>Anno ${900 + st.q}</b> · ${lords}<br><small>${rules} · salvata ${when(s.savedAt)}</small></div>
      <div class="save-btns"><button data-act="resume" data-slot="${esc(s.id)}" class="primary">Riprendi</button><button data-act="deleteSave" data-slot="${esc(s.id)}" class="ghost">Elimina</button></div></li>`;
  }).join('');
  return `<div class="saves"><h2>Riprendere una partita?</h2><ul class="save-list">${items}</ul><h2>Oppure iniziatene una nuova</h2></div>`;
}

function renderSetup(ui: UiState): string {
  const opt = (v: string, label: string, cur: string) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  const rows = Array.from({ length: ui.setup.count }, (_, i) => {
    const kind = ui.setup.kinds[i] ?? 'umano', level = ui.setup.levels[i] ?? 'medio', gender = ui.setup.genders[i] ?? 1;
    const placeholder = kind === 'computer' ? BOT_NAMES[gender][i] : `Signore ${i + 1}`;
    return `<tr>
      <th scope="row" data-label="Feudo">a sorte</th>
      <td data-label="Nome"><input name="name${i}" maxlength="12" autocomplete="off" placeholder="${placeholder}" value="${esc(ui.setup.names[i] ?? '')}" aria-label="nome del signore ${i + 1}"></td>
      <td data-label="Genere"><select name="gender${i}" aria-label="genere">${opt('1', 'cavaliere', String(gender))}${opt('6', 'madonna', String(gender))}</select></td>
      <td data-label="Giocatore"><select name="kind${i}" aria-label="giocatore">${opt('umano', 'umano', kind)}${opt('computer', 'computer', kind)}</select></td>
      <td data-label="Livello"><select name="level${i}" aria-label="livello del computer" ${kind === 'computer' ? '' : 'disabled'}>${opt('facile', 'facile', level)}${opt('medio', 'medio', level)}${opt('difficile', 'difficile', level)}</select></td>
    </tr>`;
  }).join('');
  const table = `<table class="lords-table"><thead><tr><th>Feudo</th><th>Nome</th><th>Genere</th><th>Giocatore</th><th>Livello</th></tr></thead><tbody>${rows}</tbody></table>`;
  return `
  <section class="card castle setup-card">${battlements}
    <h1>Alto Medioevo</h1>
    <p class="sub">Cronache di un feudo, anno 900 circa. Ricostruzione delle meccaniche dell'originale per Commodore 64.</p>
    ${ui.message ? `<p class="msg">${esc(ui.message)}</p>` : ''}
    ${renderSaves(listSaves())}
    <form class="setup">
      <label>Signori <select name="count">${Array.from({ length: MAX_PLAYERS }, (_, i) => `<option ${i + 1 === ui.setup.count ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
      <label>Regole <select name="mode">
        <option value="classica" ${ui.setup.mode === 'classica' ? 'selected' : ''}>classica (regole originali, tributo corretto)</option>
        <option value="bilanciata" ${ui.setup.mode === 'bilanciata' ? 'selected' : ''}>bilanciata (bug corretti)</option>
      </select></label>
      <label>Quanto temete la sorte, messere? <select name="sorte">
        <option value="poco" ${ui.setup.sorte === 'poco' ? 'selected' : ''}>poco (un fatto del reame ogni due anni)</option>
        <option value="normale" ${ui.setup.sorte === 'normale' ? 'selected' : ''}>normale (un fatto l'anno)</option>
        <option value="molto" ${ui.setup.sorte === 'molto' ? 'selected' : ''}>molto (due fatti l'anno)</option>
      </select></label>
      ${table}
      ${renderExpansions(ui.setup.expansion)}
      <button data-act="start" class="primary">Inizia</button>
    </form>
  </section>`;
}

/** Miniatura del gioco base: il castello del feudo. */
const baseMiniature = `<svg viewBox="0 0 160 110" class="exp-mini" role="img" aria-label="miniatura: il gioco base">
  <rect width="160" height="110" fill="#e9d7a8"/>
  <path d="M0 92 Q40 80 80 90 T160 88 V110 H0z" fill="#6f8f4e"/>
  <rect x="50" y="40" width="60" height="52" fill="#b8a07a" stroke="#6b5a47"/>
  <rect x="40" y="28" width="22" height="64" fill="#c9b18a" stroke="#6b5a47"/><rect x="98" y="28" width="22" height="64" fill="#c9b18a" stroke="#6b5a47"/>
  <path d="M40 28 h4 v-6 h5 v6 h4 v-6 h5 v6 h4 M98 28 h4 v-6 h5 v6 h4 v-6 h5 v6 h4" stroke="#6b5a47" fill="none"/>
  <path d="M72 92 v-18 a8 8 0 0 1 16 0 v18z" fill="#4a3424"/>
  <path d="M109 28 v-16" stroke="#3e2617" stroke-width="1.5"/><path d="M109 12 l12 4 l-12 4z" fill="#a82c22"/>
  <g fill="#d6b25a"><circle cx="20" cy="86" r="3"/><circle cx="28" cy="88" r="3"/><circle cx="138" cy="86" r="3"/></g>
</svg>`;

/** Tessere delle espansioni trovate: se ne sceglie una sola, o il gioco base. */
function renderExpansions(selected: string | null): string {
  const tile = (id: string, mini: string, title: string, motto: string) =>
    `<button type="button" class="exp-tile" data-act="expansion" data-id="${id}" aria-pressed="${(selected ?? '') === id}">
      ${mini}<span class="exp-name">${title}</span><span class="exp-motto">${motto}</span></button>`;
  const chosen: Expansion | null = findExpansion(selected);
  const rules = chosen
    ? `<ul class="exp-rules">${chosen.view.summary.map(r => `<li>${r}</li>`).join('')}</ul>`
    : '<p class="hint">Le regole del gioco originale, senza aggiunte.</p>';
  return `<fieldset class="expansions"><legend>Espansioni</legend>
    <div class="exp-tiles">
      ${tile('', baseMiniature, 'Gioco base', 'Il feudo, il grano e la scalata al trono.')}
      ${EXPANSIONS.map(e => tile(e.rules.id, e.view.miniature, e.view.title, e.view.motto)).join('')}
    </div>${rules}</fieldset>`;
}

/** Umore e fiducia in una parola: ottimo, buono, normale, infelice, rabbia. */
const SERVI_WORD: Record<Livello, string> = { ottimo: 'festanti', buono: 'contenti', normale: 'mormorano', infelice: 'scontenti', rabbia: 'furiosi' };
const MERCANTI_WORD: Record<Livello, string> = { ottimo: 'prosperi', buono: 'fiduciosi', normale: 'cauti', infelice: 'diffidenti', rabbia: 'in fuga' };

/** Una scena di fine anno (una battaglia), a tutto schermo prima del riepilogo. */
function renderScene(sc: { year: number; list: { title: string; html: string }[]; i: number }): string {
  const cur = sc.list[sc.i], last = sc.i === sc.list.length - 1;
  return `<div class="interlude year-scene" role="dialog" aria-modal="true" aria-label="${cur.title}">
    <div class="stage">
      <div class="stage-title"><span>Anno del Signore ${sc.year}${sc.list.length > 1 ? ` · ${sc.i + 1} di ${sc.list.length}` : ''}</span><b>${cur.title}</b></div>
      ${cur.html}
      <button data-act="sceneNext" class="primary">${last ? 'Al riepilogo dell\'anno' : 'Prossima battaglia'}</button>
    </div>
  </div>`;
}

/** Barra delle risorse in alto, sempre visibile. */
function resourceBar(g: Game, exp: Expansion | null): string {
  const p = g.player, sc = g.state.scalars;
  const umoreLv = livelloOf(umoreOf(p)), fiduciaLv = livelloOf(fiduciaOf(p));
  const item = (ico: string, label: string, value: string, cls = '') =>
    `<div class="rb-item ${cls}" title="${label || value}">${ico}<span class="rb-val">${value}</span>${label ? `<span class="rb-lab">${label}</span>` : ''}</div>`;
  // l'espansione aggiunge una seconda riga (Spade e Castelli: soldati, torri, catapulte)
  const extra = exp?.view.resourceBar?.(g) ?? [];
  return `<div class="resource-bar">
    ${item(icons.grano, 'grano', fmt(p.grano), p.grano < sc.domanda ? 'low' : '')}
    ${item(icons.scudi, 'scudi', fmt(p.scudi), p.scudi < 0 ? 'low' : '')}
    ${p.umore === undefined ? item(icons.servi, 'servi', fmt(p.servi)) : item(icons.servi, `servi ${SERVI_WORD[umoreLv]}`, fmt(p.servi), sereno(umoreLv) ? '' : 'low')}
    ${p.fiducia !== undefined ? item(icons.scudi, MERCANTI_WORD[fiduciaLv], 'mercanti', sereno(fiduciaLv) ? '' : 'low') : ''}
    ${item(icons.acri, 'acri', fmt(p.acri))}
    <span class="rb-sep"></span>
    ${sc.annata ? item(icons.grano, '', ANNATA_LABEL[sc.annata], `annata-${sc.annata}`) : ''}
    ${item(icons.prezzo, 'prezzo per 1000', String(sc.prezzo))}
    ${item(icons.domanda, 'domanda', fmt(sc.domanda))}
    ${item(icons.usura, 'usura', `${sc.usura}%`)}
    ${extra.length ? `<span class="rb-break"></span>${extra.map(x => item(x.ico, x.label, x.value, x.low ? 'low' : '')).join('')}` : ''}
  </div>`;
}

function resources(g: Game): string {
  const p = g.player, sc = g.state.scalars;
  const items: [string, string][] = [
    ['Raccolto in vendita', fmt(sc.raccolto)],
    ['Credito (tt)', fmt(p.credito)],
    ['Mercati', fmt(p.mercato - 1)],
    ['Opifici', fmt(p.opificio - 1)],
    ['Piani di palazzo', fmt(p.palazzo)],
    ['Ricchezza (ka)', fmt(wealthIndex(p))],
  ];
  return `<dl class="res">${items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

function renderGame(g: Game, message: string, trade: TradeUi, rendite: RenditeUi, comic: ComicUi, cantiere: CantiereUi, theme: Theme, realmText: string, exp: Expansion | null, ext: ExtUi): string {
  const p = g.player, st = g.state, ph = st.phase, sc = st.scalars;
  if (ph.kind === 'fine') {
    const w = st.players[ph.winner];
    const fallen = st.players.filter(x => x.caduto !== undefined && x.arrestato === undefined);
    const jailed = st.players.filter(x => x.arrestato !== undefined);
    const head = w
      ? `<h1>${esc(w.name)} da ${FEUDI[w.feudo]} è ${w.gender === 1 ? 're' : 'regina'}</h1><p>Anno ${g.year}. Ricchezza finale: ${fmt(wealthIndex(w))}.</p>`
      : `<h1>Il trono resta vuoto</h1><p>Anno ${g.year}. Nessun signore è rimasto a contenderselo.</p>`;
    const out = (x: Player) => (x.arrestato !== undefined ? `arrestat${x.gender === 1 ? 'o' : 'a'} nel ${900 + x.arrestato}` : `caduto nel ${900 + x.caduto!}`);
    return `<section class="card end">${head}
      ${fallen.length ? `<p>Feudi caduti in guerra: ${fallen.map(x => `${esc(x.name)} da ${FEUDI[x.feudo]} (${900 + x.caduto!})`).join(', ')}.</p>` : ''}
      ${jailed.length ? `<p>Signori arrestati: ${jailed.map(x => `${esc(x.name)} da ${FEUDI[x.feudo]} (${900 + x.arrestato!})`).join(', ')}.</p>` : ''}
      <ol class="standings">${[...st.players].sort((a, b) => Number(a.caduto !== undefined) - Number(b.caduto !== undefined) || wealthIndex(b) - wealthIndex(a)).map(x => `<li>${fullName(x)}: ${x.caduto !== undefined ? out(x) : fmt(wealthIndex(x))}</li>`).join('')}</ol>
      <button data-act="new" class="primary">Nuova partita</button></section>`;
  }
  let body = '';
  switch (ph.kind) {
    case 'fatto': {
      const cards = ph.awaitingChoice
        ? `<div class="action-cards two">${g.fattoChoices().map(o => {
            const t = fattoOptionText(p, ph.id, o.id);
            return `<button class="action-card" data-act="fatto" data-opt="${o.id}" ${o.ok ? '' : 'disabled'}><span class="card-emblem" aria-hidden="true">${t.emblem}</span>
              <span class="card-title">${t.label}</span><span class="card-sub">${o.ok ? t.sub : 'non ve lo potete permettere'}</span></button>`;
          }).join('')}</div>`
        : `<p class="big fatto-out">${fattoCaption(ph.outcome!, p)}</p>${fattoBadges(ph.outcome!)}<div class="btns"><button data-act="afterFatto" class="primary">Alla Delibera</button></div>`;
      body = `<h2>Notizie dal reame: ${fattoTitle(ph.id)}</h2>${fattoScene(ph.id)}${cards}`;
      break;
    }
    case 'commercio': {
      const all = exp ? exp.view.cards(g) : [];
      if (exp && ext.panel) body = exp.view.panel(g, ext);
      else {
        const extras = exp ? { cards: all.filter(c => c.menu !== 'signori'), dispatches: ext.archived ? '' : exp.view.dispatches(g, !ext.seen), hint: (m: TradeMode) => exp.view.tradeHint?.(g, m) ?? '' } : undefined;
        body = `<h2>Delibera</h2>${exp?.view.alert?.(g, 'delibera') ?? ''}${renderTrade(g, trade, extras)}`;
      }
      break;
    }
    case 'signori': {
      const cards = exp ? exp.view.cards(g).filter(c => c.menu === 'signori') : [];
      body = exp && ext.panel ? exp.view.panel(g, ext)
        : `<h2>Fra signori</h2><p class="hint">Chiuso il mercato del grano, è il momento degli affari con gli altri signori e con i mercanti.</p>${renderExtCards(cards, '')}
          <div class="btns"><button data-act="afterSignori" class="primary">Prosegui</button></div>`;
      break;
    }
    case 'esitoNutrimento':
      body = `<h2>Nello anno</h2>
        <p class="big">${sc.natiMorti >= 0 ? 'Sono nati' : 'Sono morti'} ${fmt(Math.abs(sc.natiMorti))} servi.</p>
        ${renderFeedingOutcome(trade.advisor)}`;
      break;
    case 'evento': {
      const ev = EVENTS.find(e => e.id === ph.eventId)!;
      // un'espansione può chiedere una decisione dopo l'imprevisto (es. dove mandare i briganti)
      const proceed = (!ph.awaitingChoice && exp?.view.eventPanel?.(g)) || '<div class="btns"><button data-act="afterEvent" class="primary">Prosegui</button></div>';
      const out = ph.outcome;
      if (ph.faction) {
        const f = ph.faction, info = FACTION_INFO[f];
        const head = `<div class="faction-head">${crest(f, 56)}<div><h2>${info.name}</h2><p class="faction-sub">${info.headline} Prendono di mira: ${info.target}.</p></div></div>`;
        if (ph.awaitingChoice) {
          const winP = g.factionWinChance();
          const cards = g.factionOptions().map(o => {
            const t = optionText(p, f, o.id, winP);
            return `<button class="action-card" data-act="faction" data-opt="${o.id}" ${o.ok ? '' : 'disabled'}><span class="card-emblem" aria-hidden="true">${t.emblem}</span>
              <span class="card-title">${t.label}</span><span class="card-sub">${o.ok ? t.sub : 'non avete abbastanza scudi in contanti'}</span></button>`;
          }).join('');
          const forces = forcesBox(f, ph.nemici ?? 0, g.factionDefense(), winP, p.servi);
          body = `${head}${renderEventComic(ev.id, ev.title, comic.event!)}${forces}<div class="action-cards ${cards.length > 3 ? 'four' : ''}">${cards}</div>`;
        } else {
          body = `${head}${renderFactionOutcome(out!, comic.outcome!)}${factionBadges(out!)}
            ${proceed}`;
        }
      } else if (ph.awaitingChoice) {
        body = `<h2>Accadimento: ${ev.title}</h2>${renderEventComic(ev.id, ev.title, comic.event!)}
          <div class="action-cards two">
            <button class="action-card" data-act="pugna"><span class="card-emblem" aria-hidden="true">⚔</span><span class="card-title">Pugna</span>
              <span class="card-sub">bottino fra −799 e +800 scudi, servi fra −49 e +50</span></button>
            <button class="action-card" data-act="riscatto"><span class="card-emblem" aria-hidden="true">⚖</span><span class="card-title">Riscatto</span>
              <span class="card-sub">da 0 a 800 scudi, nessun rischio per i servi</span></button>
          </div>`;
      } else if (out?.choice) {
        body = `<h2>Accadimento: ${ev.title}</h2>${renderOutcomeComic(out, comic.outcome!)}${effectBadges(out)}
          ${proceed}`;
      } else if (ev.effect.kind === 'impresa') {
        body = `<h2>Accadimento: ${ev.title}</h2>${renderEventComic(ev.id, ev.title, comic.event!)}
          <p class="big">Non dovete decidere ora: la carta resta fra le vostre <b>Imprese</b>, nel pannello a sinistra, e potete giocarla quando volete nei prossimi anni.</p>
          ${proceed}`;
      } else if (ev.effect.kind === 'carta') {
        // carta del mazzo di un'espansione: va fra le carte in mano, nella colonna a sinistra
        body = `<h2>Accadimento: ${ev.title}</h2>${renderEventComic(ev.id, ev.title, comic.event!)}
          <p class="big">${exp?.view.cardNote?.(g, ev.id) ?? 'Non dovete decidere ora: la carta resta nel pannello a sinistra, e potete giocarla nei prossimi anni.'}</p>
          ${proceed}`;
      } else {
        body = `<h2>Accadimento: ${ev.title}</h2>${renderEventComic(ev.id, ev.title, comic.event!)}${effectBadges(out!)}
          ${proceed}`;
      }
      break;
    }
    case 'impresa':
      body = renderImpresa(ph.id, ph.esito, ph.amount, p);
      break;
    case 'arresto':
      body = `<h2>Arrestato!</h2>${ph.motivo === 'debiti'
        ? `<p class="big">Avete chiuso l'anno con <b>${Math.round(-p.scudi).toLocaleString('it-IT')} scudi</b> di debiti, oltre i ${DEBITO_ARRESTO.toLocaleString('it-IT')} che gli usurai sopportano. Le guardie vi portano in ceppi: per voi la partita è finita.</p>`
        : exp?.view.arrestText?.(g) ?? '<p class="big">Le guardie vi hanno arrestato: per voi la partita è finita.</p>'}
        <div class="btns"><button data-act="afterArrest" class="primary">Lasciate il feudo</button></div>`;
      break;
    case 'rendite':
      body = `<h2>Rendite</h2>${renderRendite(g, rendite, rateBadgesFor(g), renderSensaleOffer(g, rendite.sensaleSay))}`;
      break;
    case 'reame':
      body = `<h2>Lo reame</h2>
        <p class="realm-heading">${realmHeading(p, g.year)}</p>
        <div class="realm-frame">${realmScene(p)}</div>
        ${speechBox(ANSELMO, realmText)}
        ${realmLegend(p)}
        <div class="btns"><button data-act="realmBack" class="primary">Prosegui</button></div>`;
      break;
    case 'investimenti':
    {
      const cards = exp ? exp.view.cards(g) : [];
      const war = cards.filter(c => c.menu === 'guerra'), signori = cards.filter(c => c.menu === 'signori'), rest = cards.filter(c => !c.menu);
      if (exp && ext.panel) body = exp.view.panel(g, ext);
      else if (ext.signori === 'investimenti' && signori.length) body = signoriPage(signori, 'Torna ai dispendimenti');
      else if (ext.menu === 'guerra' && war.length) {
        body = `<h2>Guerra</h2>${exp?.view.alert?.(g, 'guerra') ?? ''}${renderExtCards(war, '')}
          <div class="btns"><button data-act="warMenu" data-close="1">Torna ai dispendimenti</button><button data-act="next" class="primary">Proximus: fine dell'anno</button></div>`;
      } else body = `<h2>Dispendimenti</h2>${exp?.view.alert?.(g, 'dispendimenti') ?? ''}${renderCantiere(g, cantiere, war.length > 0)}${renderSignoriCard(signori)}${renderExtCards(rest)}`;
      break;
    }
  }
  const others = st.players.length > 1
    ? `<ul class="others">${st.players.map((x, i) => `<li class="${i === st.current ? 'cur' : ''}">${fullName(x)} · rango ${rankOf(x)} · ${fmt(wealthIndex(x))}</li>`).join('')}</ul>` : '';
  return `
  <header class="top"><span class="year">A.D. ${g.year}</span><span class="who">${fullName(p)}</span>
    <button data-act="openTutorial" class="ghost">Insegnamento</button>
    <button data-act="theme" class="ghost">Stile: ${theme === 'c64' ? 'C64' : 'pergamena'}</button>
    <button data-act="new" class="ghost">Nuova partita</button></header>
  ${resourceBar(g, exp)}${pactsStrip(g.player)}${effettiStrip(g.player)}
  <div class="layout">
    <aside class="card">${exp ? `<p class="exp-badge">Espansione: ${exp.view.title}</p>${exp.view.aside?.(g) ?? ''}` : ''}${resources(g)}${others}${exp ? `${exp.view.imprese?.(g) ?? ''}${g.player.impresa ? impreseAside(g) : ''}` : impreseAside(g)}</aside>
    <section class="card phase castle">${battlements}${message ? `<p class="msg">${esc(message)}</p>` : ''}${body}</section>
  </div>
  <details class="card log"><summary>Cronache</summary><ol>${st.log.slice(-30).reverse().map(l => `<li>${esc(l)}</li>`).join('')}</ol></details>`;
}
