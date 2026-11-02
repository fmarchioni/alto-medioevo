/**
 * Espansione "Spade e Castelli": conflitto fra signori. Solo regole, nessuna
 * interfaccia (la vista è in view.ts).
 *
 * - Esercito: nei dispendimenti si arruolano soldati togliendoli ai servi
 *   (2 scudi d'armi ciascuno, al più un quarto della popolazione). I soldati
 *   non lavorano e a fine anno vogliono il soldo, 1 scudo a testa, anche se
 *   sono lontani. Si possono congedare (tornano servi) solo quando sono nel
 *   fortino: chi marcia, assedia o torna resta soldato fino al ritorno.
 * - Contadini reticenti: ogni anno si fa avanti al più un decimo dei servi.
 *   Quando la guerra è in vista (un esercito nemico in marcia verso il feudo,
 *   o un assedio) i volontari calano a uno su venticinque, e se il popolo è
 *   scontento si dimezzano ancora. Chi si arruola con la guerra alle porte è
 *   una leva inesperta: quell'anno in battaglia vale metà di un soldato, ed è
 *   soprattutto un bracciante tolto ai campi.
 * - Milizia: in difesa combattono anche i servi, uno ogni dieci vale un
 *   soldato. Cento soldati non prendono un feudo difeso da cento soldati e
 *   mille servi; con le mura, e senza catapulte, ancora meno.
 * - Catapulte: si costruiscono nei dispendimenti e vanno in guerra con i
 *   soldati. Ogni due catapulte aprono una breccia in una cerchia di mura:
 *   senza, le mura danno al difensore un grande vantaggio.
 * - Guerra: una volta l'anno, nei dispendimenti, si manda l'esercito contro un
 *   feudo qualsiasi. Le battaglie non si combattono subito: l'esercito marcia
 *   e tutti gli scontri si risolvono alla chiusura dell'anno, quando tutti i
 *   signori hanno giocato (così chi gioca per primo non ha vantaggio).
 *   L'esercito parte a fine turno: contro un confinante si combatte alla fine
 *   dell'anno seguente, contro un feudo lontano alla fine di quello dopo. Il
 *   difensore ha così almeno un anno intero per prepararsi, se lo sa. La battaglia è un tiro alla pari
 *   corretto dalle forze in campo: soldati mandati contro guarnigione, milizia
 *   dei servi e mura.
 *   - Per le risorse: chi vince porta via scudi e grano, poi l'esercito torna.
 *   - Per la distruzione: se vince, l'esercito resta ad assediare il feudo e
 *     ogni anno torna all'assalto. Ogni vittoria uccide servi, brucia grano e,
 *     con le catapulte, abbatte una cerchia di mura; dopo quattro vittorie (o
 *     quando restano pochi servi) il feudo cade e il suo signore esce dalla
 *     partita. L'assediante si può ritirare quando vuole; l'assediato può
 *     comprare la pace.
 *   I soldati che tornano restano in marcia: da un feudo confinante (sulla
 *   carta ciascuno confina con i due più vicini) un anno di viaggio, da uno
 *   lontano due. Intanto non difendono e non si congedano; al ritorno la
 *   malattia ne porta via fino al 5% per anno.
 * - Mura: fino a 5 cerchie, 2500 scudi ciascuna. Rafforzano molto la difesa
 *   in guerra e un poco contro le orde, e riducono le perdite di pugna e
 *   riscatto contro Longobardi e briganti. Non contano per il rango.
 * - Torri di guardia: fino a 3 livelli. Avvistano gli eserciti nemici in
 *   marcia verso il feudo (non quanti sono): con una torre l'avviso arriva
 *   solo al momento della guerra, con due già nei dispendimenti, con tre
 *   all'inizio dell'anno, prima di spendere per il grano. Non contano per il
 *   rango.
 * - Spia: i soldati degli altri signori sono segreti. Una spia costa 250
 *   scudi, se ne tiene una sola e per due anni rivela gli eserciti di tutti.
 *   Senza spia si vedono solo le mura e la milizia dei servi.
 * - Briganti: una pedina sulla carta. Chi subisce l'imprevisto dei briganti
 *   la manda sul feudo di un avversario, che perde un quarto delle rendite
 *   finché non li scaccia con i soldati o non paga 600 scudi.
 *
 * Il caso delle battaglie usa un generatore proprio, salvato nello stato:
 * la sequenza RND del gioco base non cambia.
 */
import { INT } from '../../domain/economy';
import type { BotCtx, ExpansionRules } from '../../domain/expansion';
import { borders } from '../../domain/geography';
import { MAX_ACRI } from '../../domain/investments';
import { wealthIndex } from '../../domain/rank';
import { Mulberry32 } from '../../domain/rng';
import type { Game } from '../../domain/turn';
import { livelloOf, sereno } from '../../domain/gabelle';
import type { ActionResult, EventOutcome, Player } from '../../domain/types';

export const ID = 'spade-castelli';

export const MURA_COST = 2500;
export const MURA_MAX = 5;
/** Costo di ciascun livello delle torri di guardia (il primo, il secondo, il terzo). */
export const TORRE_COST = [600, 900, 1200] as const;
export const TORRI_MAX = TORRE_COST.length;
/** Dove arriva l'avviso delle torri: livello minimo per vederlo in ciascun momento dell'anno. */
export const TORRE_ALERT: Record<'delibera' | 'dispendimenti' | 'guerra', number> = { delibera: 3, dispendimenti: 2, guerra: 1 };
/** armi per ogni soldato arruolato */
export const RECRUIT_COST = 2;
/** soldo annuo per soldato, pagato a fine anno */
export const SOLDO = 1;
/** l'esercito non supera questa quota di servi + soldati */
export const ARMY_MAX_SHARE = 0.25;
export const WAR_MIN = 50;
/** costo della campagna per ogni soldato mandato */
export const CAMPAIGN_COST = 1;
/** contro le orde delle fazioni: forza di un soldato (in nemici) e difesa in più per cerchia di mura */
export const SOLDIER_VS_HORDE = 3;
export const WALL_VS_HORDE = 0.2;

/** servi che difendono il feudo come milizia: dieci servi valgono un soldato */
export const MILITIA = 0.1;
/** quota dei servi che ogni anno accetta di arruolarsi, in pace e con la guerra in vista */
export const VOLUNTEERS = 0.1;
export const VOLUNTEERS_WAR = 0.04;
/** con il popolo infelice o furioso i volontari si dimezzano */
export const VOLUNTEERS_UNHAPPY = 0.5;
/** forza in battaglia di una leva arruolata con la guerra alle porte, nell'anno dell'arruolamento */
export const LEVY_STRENGTH = 0.5;
/** in guerra ogni cerchia di mura vale come 40 difensori e moltiplica la difesa: +50% per cerchia */
export const WALL_MEN = 40;
export const WALL_BONUS = 0.5;
/** catapulte: costo, manutenzione annua, quante ne servono per aprire una breccia in una cerchia */
export const CATAPULT_COST = 1200;
export const CATAPULT_UPKEEP = 60;
export const CATAPULTS_PER_RING = 2;
export const CATAPULT_MAX = MURA_MAX * CATAPULTS_PER_RING;
/** ogni cerchia riduce del 12% le perdite contro Longobardi e briganti */
export const WALL_EVENT_SHIELD = 0.12;
export const LOOT_SCUDI = 8;
export const LOOT_GRANO = 20;
/** assedio: servi uccisi e grano bruciato a ogni vittoria; vittorie per far cadere il feudo */
export const SIEGE_KILL = 0.2;
export const SIEGE_BURN = 0.3;
export const SIEGE_FALL_WINS = 5;
/** ogni anno d'assedio la malattia nel campo porta via fino a questa quota degli assedianti */
export const SIEGE_ATTRITION = 0.08;
/** il feudo cade anche quando gli restano meno servi di così */
export const FALL_SERVI = 300;
/** la pace si compra a tanti scudi per soldato assediante */
export const PEACE_PER_SOLDIER = 5;
/** quota dei servi del feudo caduto che passa al vincitore */
export const CONQUEST_SERVI = 0.5;
/** quota delle rendite sottratta dai briganti al feudo che li ospita */
export const BRIGAND_TAX = 0.25;
export const BRIGAND_PAY = 600;
/** forza della banda di briganti quando la si vuole scacciare */
export const BRIGAND_BAND = 150;
/** imprevisti in cui le mura riducono le perdite: Longobardi e briganti del listato, e gli attacchi delle fazioni */
export const RAID_EVENTS = [1, 7, 10, 11, 12, 13, 14];
export const BRIGAND_EVENT = 7;
export const SPY_COST = 250;
/** anni di servizio della spia, compreso quello in cui la si assolda */
export const SPY_YEARS = 2;
/** bottino minimo perché il medio pensi alla guerra */
export const MEDIO_MIN_LOOT = 1200;
/** perdite per malattia al ritorno: fino al 5% per ogni anno di viaggio */
export const MARCH_SICKNESS = 0.05;
/** i signori del computer stimano meno il bottino di un feudo lontano (due anni senza soldati) */
export const FAR_LOOT_WEIGHT = 0.6;
/** il medio non muove guerra prima di questo anno (q) e lascia questi anni fra due campagne */
export const MEDIO_FIRST_WAR = 2;
export const MEDIO_WAR_REST = 3;
/** un rivale da distruggere è più ricco di almeno questo fattore */
export const RIVAL_LEAD = 1.5;
/** probabilità che il medio scelga la distruzione quando potrebbe */
export const MEDIO_DESTROY = 0.35;
/** prima di questo anno (q) non si muove guerra per la distruzione: tempo per fortificarsi */
export const DESTROY_FROM_Q = 5;

export type WarGoal = 'bottino' | 'distruzione';

export interface WarResult {
  q: number;
  /** anni di viaggio del ritorno: 1 dai confinanti, 2 dai feudi lontani (assente nei salvataggi vecchi) */
  anni?: number;
  attacker: number;
  defender: number;
  /** 'terre' solo nei salvataggi vecchi */
  goal: WarGoal | 'terre';
  sent: number;
  win: boolean;
  attackerLost: number;
  defenderLost: number;
  serviLost: number;
  scudi: number;
  grano: number;
  acri: number;
  /** catapulte in campo e perdute */
  cat?: number;
  catLost?: number;
  /** cerchie di mura abbattute */
  rings?: number;
  /** assalto dell'assedio (1: la prima battaglia) */
  round?: number;
  /** l'esercito resta ad assediare il feudo */
  siege?: boolean;
  /** il feudo è caduto */
  fell?: boolean;
}

/** Notizie per un signore, lette all'inizio del suo turno. */
export type Dispatch =
  | { k: 'attacked'; war: WarResult }
  | { k: 'siege'; war: WarResult }
  /** all'attaccante: l'esito della battaglia, combattuta alla chiusura dell'anno */
  | { k: 'battle'; war: WarResult }
  | { k: 'returned'; n: number; lost: number; anni: number; from: number; cat?: number }
  | { k: 'peace'; by: number; scudi: number }
  | { k: 'lifted'; by: number }
  | { k: 'brigandsIn'; by: number };

/** Una schiera di ritorno da una campagna. */
export interface March {
  owner: number;
  n: number;
  /** catapulte che tornano con la schiera */
  cat?: number;
  /** anno (q) all'inizio del quale è di nuovo a casa */
  back: number;
  anni: number;
  /** feudo assalito */
  from: number;
}

/** Un esercito in marcia verso il nemico: combatterà alla chiusura dell'anno `arrive`. */
export interface Campaign {
  owner: number;
  target: number;
  n: number;
  cat: number;
  goal: WarGoal;
  /** anno (q) della partenza */
  q: number;
  /** anno (q) alla cui chiusura si combatte */
  arrive: number;
}

/** Un esercito che assedia un feudo. */
export interface Siege {
  owner: number;
  target: number;
  n: number;
  cat: number;
  /** anno (q) dell'ultimo assalto */
  last: number;
  wins: number;
  rounds: number;
}

export interface SpadeState {
  mura: number[];
  /** soldati nel fortino, gli unici che difendono, combattono e si congedano */
  soldati: number[];
  /** catapulte nel fortino (assente nei salvataggi vecchi) */
  catapulte?: number[];
  /** schiere in marcia verso casa (assente nei salvataggi vecchi) */
  marcia?: March[];
  /** assedi in corso (assente nei salvataggi vecchi) */
  assedi?: Siege[];
  /** eserciti in marcia verso il nemico (assente nei salvataggi vecchi) */
  campagne?: Campaign[];
  /** livello delle torri di guardia di ciascun signore (assente nei salvataggi vecchi) */
  torri?: number[];
  /** arruolati nell'anno q da ciascun signore: tutti (n) e quelli con la guerra in vista (leve) */
  leve?: ({ q: number; n: number; leve: number } | null)[];
  /** signore sul cui feudo stanno i briganti (null: nei boschi) */
  brigands: number | null;
  /** signore che deve decidere dove mandare i briganti */
  pendingMove: number | null;
  /** anno (q) dell'ultima guerra mossa da ciascun signore */
  lastWar: number[];
  /** anno (q) dell'ultimo tentativo di scacciare i briganti */
  lastDrive: number[];
  /** ultimo anno (q) di servizio della spia di ciascun signore (-1: nessuna); assente nei salvataggi vecchi */
  spia?: number[];
  wars: WarResult[];
  mail: { to: number; d: Dispatch }[];
  inbox: Dispatch[];
  /** stato del generatore delle battaglie */
  rng: number[];
}

export const ss = (g: Game): SpadeState => g.state.ext as SpadeState;

const alive = (g: Game, i: number) => g.state.players[i]?.caduto === undefined;
/** Signori ancora in gioco diversi da `me`. */
const others = (g: Game, me: number) => g.state.players.map((_, i) => i).filter(i => i !== me && alive(g, i));

/** Catapulte nel fortino del signore `i`. */
export const catapultsOf = (st: SpadeState, i: number) => st.catapulte?.[i] ?? 0;
/** Assedi posti dal signore `i`. */
export const siegesBy = (st: SpadeState, i: number) => (st.assedi ?? []).filter(s => s.owner === i);
/** Assedi che stringono il feudo del signore `i`. */
export const siegesOn = (st: SpadeState, i: number) => (st.assedi ?? []).filter(s => s.target === i);
/** Eserciti del signore `i` in marcia verso il nemico. */
export const campaignsBy = (st: SpadeState, i: number) => (st.campagne ?? []).filter(c => c.owner === i);
/** Eserciti in marcia verso il feudo del signore `i` (segreti: li vedranno le torri di guardia). */
export const campaignsOn = (st: SpadeState, i: number) => (st.campagne ?? []).filter(c => c.target === i);
/** Livello delle torri di guardia del signore `i`. */
export const torriOf = (st: SpadeState, i: number) => st.torri?.[i] ?? 0;
/**
 * Eserciti in avvicinamento che le torri del signore `i` possono avvistare:
 * partiti in un anno precedente (chi parte quest'anno è ancora oltre i monti).
 */
export const incomingOf = (g: Game, i: number) => campaignsOn(ss(g), i).filter(c => c.q < g.state.q);
/** Avvistamenti visibili in un momento dell'anno, secondo il livello delle torri. */
export function towerAlerts(g: Game, i: number, where: keyof typeof TORRE_ALERT): Campaign[] {
  return torriOf(ss(g), i) >= TORRE_ALERT[where] ? incomingOf(g, i) : [];
}
/** Soldati del signore `i` fuori dal fortino: verso il nemico, all'assedio o di ritorno. */
export const awayOf = (st: SpadeState, i: number) =>
  (st.marcia ?? []).filter(m => m.owner === i).reduce((a, m) => a + m.n, 0) + siegesBy(st, i).reduce((a, s) => a + s.n, 0) + campaignsBy(st, i).reduce((a, c) => a + c.n, 0);
/** Catapulte del signore `i` fuori dal fortino. */
export const catAwayOf = (st: SpadeState, i: number) =>
  (st.marcia ?? []).filter(m => m.owner === i).reduce((a, m) => a + (m.cat ?? 0), 0) + siegesBy(st, i).reduce((a, s) => a + s.cat, 0) + campaignsBy(st, i).reduce((a, c) => a + c.cat, 0);
/** Anni di viaggio del ritorno da un feudo: 1 se confina, 2 se è lontano. */
export const travelYears = (g: Game, from: number, to: number) => (neighbors(g, from).includes(to) ? 1 : 2);

const note = (g: Game, player: number, kind: string, data: Record<string, number>) => g.note(player, { t: 'ext', kind, data });
const send = (st: SpadeState, to: number, d: Dispatch) => st.mail.push({ to, d });
const isCount = (n: number) => Number.isInteger(n) && n > 0;

function roll(st: SpadeState): () => number {
  const r = new Mulberry32(st.rng[0]);
  return () => {
    const v = r.next();
    st.rng = r.getState();
    return v;
  };
}

/** Feudi confinanti con il signore `i` (indici dei signori ancora in gioco). */
export function neighbors(g: Game, i: number): number[] {
  const ps = g.state.players;
  const live = ps.filter((p, k) => k === i || p.caduto === undefined);
  const map = borders(live.map(p => p.feudo));
  const near = map.get(ps[i].feudo) ?? [];
  return near.map(f => ps.findIndex(p => p.feudo === f)).filter(x => x >= 0 && x !== i);
}

export const maxArmy = (p: Player, soldati: number) => Math.floor(ARMY_MAX_SHARE * (Math.max(0, p.servi) + soldati));

/** Cerchie di mura che restano in piedi davanti a tante catapulte. */
export const standingWalls = (mura: number, cat = 0) => Math.max(0, mura - cat / CATAPULTS_PER_RING);

/** Forza difensiva media di un feudo (senza il tiro), contro un esercito con `cat` catapulte. */
export function defenseOf(p: Player, soldati: number, mura: number, cat = 0): number {
  const m = standingWalls(mura, cat);
  return (soldati + INT(Math.max(0, p.servi) * MILITIA) + WALL_MEN * m) * (1 + WALL_BONUS * m);
}

/** La guerra è in vista: un esercito nemico marcia verso il feudo (in piazza se ne parla, torri o no) o lo assedia. */
export const warLooms = (g: Game, i: number) => incomingOf(g, i).length > 0 || siegesOn(ss(g), i).length > 0;

/** Arruolati quest'anno dal signore `i`. */
const levyOf = (g: Game, i: number) => {
  const l = ss(g).leve?.[i];
  return l && l.q === g.state.q ? l : { q: g.state.q, n: 0, leve: 0 };
};

/** Volontari che si fanno avanti quest'anno (prima di chi si è già arruolato). */
export function volunteersOf(g: Game, i = g.state.current): number {
  const p = g.state.players[i];
  const pool = Math.max(0, p.servi) + levyOf(g, i).n;
  const unhappy = p.umore !== undefined && !sereno(livelloOf(p.umore)) && livelloOf(p.umore) !== 'normale';
  return INT(pool * (warLooms(g, i) ? VOLUNTEERS_WAR : VOLUNTEERS) * (unhappy ? VOLUNTEERS_UNHAPPY : 1));
}

/** Quanti se ne possono ancora arruolare quest'anno: volontari rimasti e tetto dell'esercito. */
export function recruitRoom(g: Game, i = g.state.current): number {
  const st = ss(g), p = g.state.players[i];
  const army = st.soldati[i] + awayOf(st, i);
  return Math.max(0, Math.min(volunteersOf(g, i) - levyOf(g, i).n, maxArmy(p, army) - army));
}

/** Soldati che combattono in difesa: le leve dell'anno valgono metà. */
export function fieldSoldiers(g: Game, i: number): number {
  const s = ss(g).soldati[i], l = levyOf(g, i);
  return s - Math.min(s, l.leve) * (1 - LEVY_STRENGTH);
}

function canSpend(p: Player, cost: number): boolean {
  return p.scudi - cost >= -p.credito;
}

function phaseIs(g: Game, ...kinds: string[]): ActionResult | null {
  return kinds.includes(g.state.phase.kind) ? null : { ok: false, reason: kinds.includes('commercio') ? 'si può fare durante la delibera o i dispendimenti' : 'si fa durante i dispendimenti' };
}

// ---------------------------------------------------------------- spia

/** Ultimo anno (q) in cui la spia del signore è in servizio, -1 se non ne ha. */
export const spyUntil = (st: SpadeState, i: number) => st.spia?.[i] ?? -1;
export const hasSpy = (g: Game, i: number) => spyUntil(ss(g), i) >= g.state.q;

export function hireSpy(g: Game): ActionResult {
  const no = phaseIs(g, 'commercio', 'investimenti');
  if (no) return no;
  const st = ss(g), me = g.state.current, p = g.player;
  if (hasSpy(g, me)) return { ok: false, reason: `avete già una spia, in servizio fino all'anno ${900 + spyUntil(st, me)}` };
  if (!canSpend(p, SPY_COST)) return { ok: false, reason: 'tesoro e credito insufficienti' };
  p.scudi -= SPY_COST;
  (st.spia ??= g.state.players.map(() => -1))[me] = g.state.q + SPY_YEARS - 1;
  // la spia è segreta: non finisce nella cronaca
  return { ok: true };
}

/** Soldati del signore `target` visti da `viewer`: noti con una spia, i propri, o quelli di un feudo che si assedia. */
export function knownSoldiers(g: Game, viewer: number, target: number): number | null {
  const st = ss(g);
  const besieging = siegesBy(st, viewer).some(s => s.target === target);
  return viewer === target || besieging || hasSpy(g, viewer) ? st.soldati[target] : null;
}

/**
 * Stima dei soldati di un vicino per chi non ha la spia: un terzo di quanti
 * ne potrebbe arruolare, o quanti ne ha mandati di recente in guerra.
 */
function guessSoldiers(g: Game, viewer: number, target: number): number {
  const known = knownSoldiers(g, viewer, target);
  if (known !== null) return known;
  const st = ss(g);
  // le schiere in marcia si vedono passare: chi è tornato da poco si conta, chi è ancora in viaggio no
  const q = g.state.q;
  const seen = Math.max(0, ...st.wars.filter(w => w.attacker === target && !w.siege && w.q + 1 + (w.anni ?? 0) <= q && w.q + 1 + (w.anni ?? 0) >= q - 1).map(w => w.sent - w.attackerLost));
  const away = awayOf(st, target);
  const room = Math.max(0, maxArmy(g.state.players[target], away) - away);
  return Math.max(seen, Math.floor(Math.min(room, Math.max(0, g.state.players[target].servi) * ARMY_MAX_SHARE) / 3));
}

// ---------------------------------------------------------------- esercito, catapulte e mura

export function recruit(g: Game, n: number): ActionResult {
  const no = phaseIs(g, 'investimenti');
  if (no) return no;
  const st = ss(g), me = g.state.current, p = g.player;
  if (!isCount(n)) return { ok: false, reason: 'numero non valido' };
  const army = st.soldati[me] + awayOf(st, me);
  if (army + n > maxArmy(p, army)) return { ok: false, reason: `l'esercito non può superare un quarto della popolazione (${maxArmy(p, army)} uomini, compresi quelli lontani)` };
  const l = levyOf(g, me), vol = volunteersOf(g, me);
  if (l.n + n > vol) return { ok: false, reason: vol - l.n > 0 ? `quest'anno si fanno avanti solo ${vol - l.n} volontari` : 'quest\'anno nessun altro servo vuole imbracciare le armi' };
  if (!canSpend(p, n * RECRUIT_COST)) return { ok: false, reason: 'tesoro e credito insufficienti per le armi' };
  p.servi -= n;
  p.scudi -= n * RECRUIT_COST;
  st.soldati[me] += n;
  // con la guerra alle porte le reclute sono leve inesperte
  (st.leve ??= g.state.players.map(() => null))[me] = { q: g.state.q, n: l.n + n, leve: l.leve + (warLooms(g, me) ? n : 0) };
  note(g, me, 'recruit', { n });
  return { ok: true };
}

export function disband(g: Game, n: number): ActionResult {
  const no = phaseIs(g, 'investimenti');
  if (no) return no;
  const st = ss(g), me = g.state.current;
  if (!isCount(n) || n > st.soldati[me]) return { ok: false, reason: 'non avete tanti soldati nel fortino: quelli lontani si congedano solo al ritorno' };
  st.soldati[me] -= n;
  g.player.servi += n;
  return { ok: true };
}

export function buildCatapults(g: Game, n: number): ActionResult {
  const no = phaseIs(g, 'investimenti');
  if (no) return no;
  const st = ss(g), me = g.state.current, p = g.player;
  if (!isCount(n)) return { ok: false, reason: 'numero non valido' };
  const have = catapultsOf(st, me) + catAwayOf(st, me);
  if (have + n > CATAPULT_MAX) return { ok: false, reason: `non servono più di ${CATAPULT_MAX} catapulte (ne avete ${have})` };
  if (!canSpend(p, n * CATAPULT_COST)) return { ok: false, reason: 'tesoro e credito insufficienti' };
  p.scudi -= n * CATAPULT_COST;
  (st.catapulte ??= g.state.players.map(() => 0))[me] = catapultsOf(st, me) + n;
  note(g, me, 'catapults', { n });
  return { ok: true };
}

export function buildWall(g: Game): ActionResult {
  const no = phaseIs(g, 'investimenti');
  if (no) return no;
  const st = ss(g), me = g.state.current, p = g.player;
  if (st.mura[me] >= MURA_MAX) return { ok: false, reason: `le mura hanno già ${MURA_MAX} cerchie` };
  if (!canSpend(p, MURA_COST)) return { ok: false, reason: 'tesoro e credito insufficienti' };
  p.scudi -= MURA_COST;
  st.mura[me] += 1;
  note(g, me, 'wall', { level: st.mura[me] });
  return { ok: true };
}

/** Alza di un livello le torri di guardia. */
export function buildTower(g: Game): ActionResult {
  const no = phaseIs(g, 'investimenti');
  if (no) return no;
  const st = ss(g), me = g.state.current, p = g.player;
  const lv = torriOf(st, me);
  if (lv >= TORRI_MAX) return { ok: false, reason: `le torri sono già al livello ${TORRI_MAX}` };
  if (!canSpend(p, TORRE_COST[lv])) return { ok: false, reason: 'tesoro e credito insufficienti' };
  p.scudi -= TORRE_COST[lv];
  (st.torri ??= g.state.players.map(() => 0))[me] = lv + 1;
  note(g, me, 'tower', { level: lv + 1 });
  return { ok: true };
}

// ---------------------------------------------------------------- guerra

/** Un esercito si rimette in marcia verso casa. */
function goHome(g: Game, st: SpadeState, owner: number, n: number, cat: number, from: number): void {
  if (n <= 0 && cat <= 0) return;
  const anni = travelYears(g, owner, from);
  (st.marcia ??= []).push({ owner, n: Math.max(0, n), cat, back: g.state.q + 1 + anni, anni, from });
}

/**
 * Una battaglia: `n` soldati con `cat` catapulte contro il feudo `target`.
 * Applica perdite e saccheggio; in distruzione anche strage, incendio e
 * mura abbattute. Ritorna l'esito (le schiere non si spostano qui).
 */
function fight(g: Game, attacker: number, target: number, n: number, cat: number, goal: WarGoal, round: number): WarResult {
  const st = ss(g), ps = g.state.players, p = ps[attacker], d = ps[target];
  const rnd = roll(st);
  const attack = n * (0.7 + 0.6 * rnd());
  const defense = defenseOf(d, fieldSoldiers(g, target), st.mura[target], cat) * (0.7 + 0.6 * rnd());
  const win = attack > defense;
  const attackerLost = INT(n * (win ? 0.05 + 0.15 * rnd() : 0.3 + 0.3 * rnd()));
  const defenderLost = INT(st.soldati[target] * (win ? 0.3 + 0.3 * rnd() : 0.05 + 0.15 * rnd()));
  // le catapulte si perdono soprattutto nelle sconfitte
  const catLost = cat ? Math.min(cat, Math.round(cat * (win ? 0.15 * rnd() : 0.3 + 0.4 * rnd()))) : 0;
  const destroy = goal === 'distruzione';
  // anche la milizia dei servi combatte: qualcuno cade pure quando l'assalto è respinto
  const militia = INT(Math.max(0, d.servi) * MILITIA);
  const serviLost = win ? INT(Math.max(0, d.servi) * (destroy ? SIEGE_KILL * (0.8 + 0.4 * rnd()) : 0.03 * rnd())) : INT(militia * (0.05 + 0.1 * rnd()));
  st.soldati[target] -= defenderLost;
  d.servi -= serviLost;

  let scudi = 0, grano = 0, rings = 0;
  if (win) {
    const survivors = n - attackerLost;
    scudi = INT(Math.min(Math.max(0, d.scudi), survivors * LOOT_SCUDI));
    grano = INT(Math.min(d.grano * 0.5, survivors * LOOT_GRANO));
    d.scudi -= scudi;
    p.scudi += scudi;
    d.grano -= grano;
    p.grano += grano;
    if (destroy) {
      // l'assedio brucia i granai e, con le catapulte, abbatte una cerchia
      d.grano -= INT(d.grano * SIEGE_BURN);
      if (cat - catLost >= CATAPULTS_PER_RING && st.mura[target] > 0) {
        st.mura[target] -= 1;
        rings = 1;
      }
    }
  }
  return { q: g.state.q, anni: travelYears(g, attacker, target), attacker, defender: target, goal, sent: n, win, attackerLost, defenderLost, serviLost, scudi, grano, acri: 0, cat, catLost, rings, round };
}

/** Pubblica l'esito: storia, notizie e cronaca. */
function publish(g: Game, w: WarResult): void {
  const st = ss(g);
  st.wars.push(w);
  send(st, w.defender, { k: 'attacked', war: w });
  const data = { target: w.defender, win: w.win ? 1 : 0, goal: w.goal === 'distruzione' ? 1 : 0, sent: w.sent, lost: w.attackerLost, scudi: w.scudi, grano: w.grano, acri: w.acri, round: w.round ?? 1, fell: w.fell ? 1 : 0, cat: w.cat ?? 0 };
  note(g, w.attacker, 'war', data);
  note(g, w.defender, 'besieged', { attacker: w.attacker, held: w.win ? 0 : 1, lost: w.defenderLost, servi: w.serviLost, scudi: w.scudi, grano: w.grano, acri: w.acri, round: w.round ?? 1, rings: w.rings ?? 0 });
}

/**
 * Il feudo cade: il signore esce dalla partita. Il vincitore prende le terre
 * (fino al massimo), metà dei servi rimasti e il tesoro. Gli eserciti del
 * caduto si sciolgono; chi lo assediava torna a casa.
 */
function conquer(g: Game, attacker: number, target: number, w: WarResult): void {
  const st = ss(g), ps = g.state.players, p = ps[attacker], d = ps[target];
  const acri = Math.min(Math.max(0, d.acri), MAX_ACRI - p.acri);
  const servi = INT(Math.max(0, d.servi) * CONQUEST_SERVI);
  const scudi = INT(Math.max(0, d.scudi));
  p.acri += acri;
  p.servi += servi;
  p.scudi += scudi;
  w.acri = acri;
  w.scudi += scudi;
  w.fell = true;
  note(g, attacker, 'conquest', { target, acri, servi, scudi });
  st.soldati[target] = 0;
  if (st.catapulte) st.catapulte[target] = 0;
  st.marcia = (st.marcia ?? []).filter(m => m.owner !== target);
  for (const s of siegesOn(st, target).filter(s => s.owner !== attacker)) {
    goHome(g, st, s.owner, s.n, s.cat, target);
    send(st, s.owner, { k: 'lifted', by: target });
  }
  st.assedi = (st.assedi ?? []).filter(s => s.target !== target && s.owner !== target);
  if (st.brigands === target) st.brigands = null;
  if (st.pendingMove === target) st.pendingMove = null;
  g.fall(target);
}

/** Dopo un assalto vinto in distruzione: il feudo cade? */
const falls = (g: Game, target: number, wins: number) => wins >= SIEGE_FALL_WINS || g.state.players[target].servi < FALL_SERVI;

export function declareWar(g: Game, target: number, sent: number, goal: WarGoal, cat = 0): ActionResult & { campaign?: Campaign; joined?: boolean } {
  const no = phaseIs(g, 'investimenti');
  if (no) return no;
  const st = ss(g), me = g.state.current, p = g.player;
  if (st.lastWar[me] === g.state.q) return { ok: false, reason: 'si muove guerra una sola volta l\'anno' };
  if (target === me || !g.state.players[target] || !alive(g, target)) return { ok: false, reason: 'scegliete il feudo di un altro signore' };
  if (!isCount(sent) || sent > st.soldati[me]) return { ok: false, reason: 'non avete tanti soldati nel fortino' };
  if (sent < WAR_MIN) return { ok: false, reason: `servono almeno ${WAR_MIN} soldati` };
  if (!Number.isInteger(cat) || cat < 0 || cat > catapultsOf(st, me)) return { ok: false, reason: 'non avete tante catapulte nel fortino' };
  if (goal !== 'bottino' && goal !== 'distruzione') return { ok: false, reason: 'scegliete risorse o distruzione' };
  if (goal === 'distruzione' && g.state.q < DESTROY_FROM_Q) return { ok: false, reason: `per la distruzione si muove guerra solo dall'anno ${900 + DESTROY_FROM_Q}` };
  if (!canSpend(p, sent * CAMPAIGN_COST)) return { ok: false, reason: 'non potete pagare la campagna' };
  const siege = siegesBy(st, me).find(s => s.target === target);
  if (siege && goal !== 'distruzione') return { ok: false, reason: 'quel feudo è già sotto il vostro assedio: mandate rinforzi per la distruzione' };
  p.scudi -= sent * CAMPAIGN_COST;
  st.lastWar[me] = g.state.q;
  st.soldati[me] -= sent;
  if (cat) st.catapulte![me] -= cat;
  // l'esercito parte a fine turno: contro un confinante combatte alla chiusura dell'anno seguente, contro un feudo lontano di quello dopo
  const arrive = g.state.q + travelYears(g, me, target);
  const c: Campaign = { owner: me, target, n: sent, cat, goal, q: g.state.q, arrive };
  (st.campagne ??= []).push(c);
  note(g, me, siege ? 'reinforce' : 'march', { target, n: sent, cat, goal: goal === 'distruzione' ? 1 : 0, arrive: 900 + arrive });
  return { ok: true, campaign: c, joined: !!siege };
}

/** Una battaglia d'apertura: l'esercito arrivato assale il feudo. */
function openBattle(g: Game, c: Campaign): void {
  const st = ss(g);
  const w = fight(g, c.owner, c.target, c.n, c.cat, c.goal, 1);
  const left = c.n - w.attackerLost, catLeft = c.cat - (w.catLost ?? 0);
  if (c.goal === 'distruzione' && w.win) {
    if (falls(g, c.target, 1)) {
      conquer(g, c.owner, c.target, w);
      goHome(g, st, c.owner, left, catLeft, c.target);
    } else {
      (st.assedi ??= []).push({ owner: c.owner, target: c.target, n: left, cat: catLeft, last: g.state.q, wins: 1, rounds: 1 });
      w.siege = true;
    }
  } else {
    goHome(g, st, c.owner, left, catLeft, c.target);
  }
  publish(g, w);
  send(st, c.owner, { k: 'battle', war: w });
}

/**
 * Chiusura dell'anno: tutti hanno giocato, si combatte. Prima i rinforzi
 * raggiungono gli assedi, poi gli assedi tornano all'assalto, infine gli
 * eserciti arrivati danno battaglia, nell'ordine in cui sono partiti.
 */
export function resolveBattles(g: Game): void {
  const st = ss(g), q = g.state.q;
  const arrived = (st.campagne ?? []).filter(c => c.arrive <= q);
  st.campagne = (st.campagne ?? []).filter(c => c.arrive > q);
  const fresh: Campaign[] = [];
  for (const c of arrived) {
    if (!alive(g, c.owner)) continue;
    const siege = siegesBy(st, c.owner).find(s => s.target === c.target);
    if (siege) {
      siege.n += c.n;
      siege.cat += c.cat;
    } else fresh.push(c);
  }
  for (const s of [...(st.assedi ?? [])].filter(x => x.last < q)) {
    if ((st.assedi ?? []).includes(s) && alive(g, s.owner) && alive(g, s.target)) siegeRound(g, s);
  }
  for (const c of fresh) {
    // il feudo è già caduto: l'esercito torna indietro senza combattere
    if (!alive(g, c.target)) goHome(g, st, c.owner, c.n, c.cat, c.target);
    else openBattle(g, c);
  }
}

/** Un nuovo assalto dell'assedio, alla chiusura dell'anno. */
function siegeRound(g: Game, s: Siege): void {
  const st = ss(g);
  s.rounds += 1;
  s.last = g.state.q;
  // il campo si ammala: l'assedio logora anche chi lo pone
  s.n -= INT(s.n * SIEGE_ATTRITION * (0.5 + 0.5 * roll(st)()));
  const w = fight(g, s.owner, s.target, s.n, s.cat, 'distruzione', s.rounds);
  s.n -= w.attackerLost;
  s.cat -= w.catLost ?? 0;
  if (w.win) s.wins += 1;
  if (w.win && falls(g, s.target, s.wins)) {
    st.assedi = (st.assedi ?? []).filter(x => x !== s);
    conquer(g, s.owner, s.target, w);
    goHome(g, st, s.owner, s.n, s.cat, s.target);
  } else if (s.n < WAR_MIN) {
    // troppo pochi per restare: si torna a casa
    st.assedi = (st.assedi ?? []).filter(x => x !== s);
    goHome(g, st, s.owner, s.n, s.cat, s.target);
  } else {
    w.siege = true;
  }
  publish(g, w);
  send(st, s.owner, { k: 'siege', war: w });
}

/** L'assediante toglie l'assedio: l'esercito si rimette in marcia. */
export function liftSiege(g: Game, target: number): ActionResult {
  const no = phaseIs(g, 'commercio', 'investimenti');
  if (no) return no;
  const st = ss(g), me = g.state.current;
  const s = siegesBy(st, me).find(x => x.target === target);
  if (!s) return { ok: false, reason: 'non assediate quel feudo' };
  st.assedi = st.assedi!.filter(x => x !== s);
  goHome(g, st, me, s.n, s.cat, target);
  send(st, target, { k: 'lifted', by: me });
  note(g, me, 'lift', { target, n: s.n });
  return { ok: true };
}

/** Prezzo della pace per l'assedio posto da `owner` al feudo di `target`. */
export const peacePrice = (s: Siege) => s.n * PEACE_PER_SOLDIER;

/** L'assediato compra la pace: paga l'assediante, che torna a casa. */
export function buyPeace(g: Game, owner: number): ActionResult {
  const no = phaseIs(g, 'commercio', 'investimenti');
  if (no) return no;
  const st = ss(g), me = g.state.current, p = g.player;
  const s = siegesOn(st, me).find(x => x.owner === owner);
  if (!s) return { ok: false, reason: 'quel signore non vi assedia' };
  const price = peacePrice(s);
  if (!canSpend(p, price)) return { ok: false, reason: `servono ${price} scudi` };
  p.scudi -= price;
  g.state.players[owner].scudi += price;
  st.assedi = st.assedi!.filter(x => x !== s);
  goHome(g, st, owner, s.n, s.cat, me);
  send(st, owner, { k: 'peace', by: me, scudi: price });
  note(g, me, 'peace', { attacker: owner, scudi: price });
  return { ok: true };
}

// ---------------------------------------------------------------- briganti

export function moveBrigands(g: Game, target: number): ActionResult {
  const st = ss(g), me = g.state.current;
  if (st.pendingMove !== me) return { ok: false, reason: 'non tocca a voi muovere i briganti' };
  if (target === me || !g.state.players[target] || !alive(g, target)) return { ok: false, reason: 'scegliete il feudo di un altro signore' };
  st.brigands = target;
  st.pendingMove = null;
  send(st, target, { k: 'brigandsIn', by: me });
  note(g, me, 'brigandsMove', { target });
  return { ok: true };
}

/** Scacciare i briganti con i soldati: una volta l'anno, con almeno WAR_MIN uomini. */
export function driveBrigands(g: Game): ActionResult & { win?: boolean; lost?: number } {
  const no = phaseIs(g, 'commercio', 'investimenti');
  if (no) return no;
  const st = ss(g), me = g.state.current;
  if (st.brigands !== me) return { ok: false, reason: 'non ci sono briganti nel vostro feudo' };
  if (st.lastDrive[me] === g.state.q) return { ok: false, reason: 'ci avete già provato quest\'anno' };
  if (st.soldati[me] < WAR_MIN) return { ok: false, reason: `servono almeno ${WAR_MIN} soldati` };
  const rnd = roll(st);
  st.lastDrive[me] = g.state.q;
  const win = st.soldati[me] * (0.7 + 0.6 * rnd()) > BRIGAND_BAND * (0.7 + 0.6 * rnd());
  const lost = INT(st.soldati[me] * (win ? 0.03 + 0.1 * rnd() : 0.15 + 0.2 * rnd()));
  st.soldati[me] -= lost;
  if (win) st.brigands = null;
  note(g, me, 'brigandsDriven', { win: win ? 1 : 0, lost });
  return { ok: true, win, lost };
}

export function payBrigands(g: Game): ActionResult {
  const no = phaseIs(g, 'commercio', 'investimenti');
  if (no) return no;
  const st = ss(g), me = g.state.current, p = g.player;
  if (st.brigands !== me) return { ok: false, reason: 'non ci sono briganti nel vostro feudo' };
  if (!canSpend(p, BRIGAND_PAY)) return { ok: false, reason: 'tesoro e credito insufficienti' };
  p.scudi -= BRIGAND_PAY;
  st.brigands = null;
  note(g, me, 'brigandsPaid', { amount: BRIGAND_PAY });
  return { ok: true };
}

/** Dove manda i briganti un signore del computer. */
function botBrigandTarget(g: Game, level: string, rnd: () => number): number {
  const me = g.state.current;
  const all = others(g, me);
  const richest = all.reduce((a, b) => (wealthIndex(g.state.players[b]) > wealthIndex(g.state.players[a]) ? b : a), all[0]);
  if (level === 'difficile' || (level === 'medio' && rnd() < 0.7)) return richest;
  return all[Math.floor(rnd() * all.length)];
}

/** Riduce del 12% per cerchia le perdite (scudi e servi) di pugna e riscatto. */
function wallShield(p: Player, mura: number, o: EventOutcome): void {
  const k = Math.min(1, WALL_EVENT_SHIELD * mura);
  if (o.scudi < 0) {
    const back = INT(-o.scudi * k);
    p.scudi += back;
    o.scudi += back;
  }
  if (o.servi < 0) {
    const back = INT(-o.servi * k);
    p.servi += back;
    o.servi += back;
  }
}

// ---------------------------------------------------------------- signori del computer

/** Probabilità di vittoria stimata con qualche tiro (stesse formule della battaglia). */
function winChance(sent: number, defense: number, rnd: () => number): number {
  let wins = 0;
  for (let i = 0; i < 40; i++) if (sent * (0.7 + 0.6 * rnd()) > defense * (0.7 + 0.6 * rnd())) wins++;
  return wins / 40;
}

/** Attacchi subiti negli ultimi tre anni. */
const recentlyAttacked = (st: SpadeState, me: number, q: number) => st.wars.filter(w => w.defender === me && w.q >= q - 3).length;

/**
 * Minaccia dei vicini: i soldati che hanno e un terzo di quelli che
 * potrebbero arruolare (dopo una guerra spesso li congedano), e chi assedia.
 */
function threatOf(g: Game, me: number): number {
  const st = ss(g);
  return Math.max(0, ...others(g, me).map(i => guessSoldiers(g, me, i)), ...siegesOn(st, me).map(s => s.n));
}

function botDefend(c: BotCtx): void {
  const { g, level, rnd, log } = c;
  const st = ss(g), me = g.state.current, p = g.player;
  const threat = threatOf(g, me);
  const hit = recentlyAttacked(st, me, g.state.q);
  const reserve = level === 'difficile' ? Math.max(800, (p.acri * 75 * 0.5 * 35) / 1000) : 1000;
  const defense = defenseOf(p, st.soldati[me], st.mura[me]);
  const wantWalls =
    level === 'difficile' ? defense < threat * (hit ? 1.3 : 0.9)
    : level === 'medio' ? (hit > 0 && st.mura[me] < 3) || (defense < threat * 0.6 && st.mura[me] < 2)
    : hit > 0 ? rnd() < 0.4 : rnd() < 0.05;
  if (wantWalls && st.mura[me] < MURA_MAX && p.scudi - MURA_COST >= reserve && buildWall(g).ok) log.push(`innalza la ${st.mura[me]}ª cerchia di mura`);
  // torri di guardia: il medio ne tiene una, il difficile due, quando il tesoro lo consente
  const wantTowers = level === 'difficile' ? 2 : level === 'medio' ? 1 : rnd() < 0.05 ? 1 : 0;
  const lv = torriOf(st, me);
  if (g.state.q >= 2 && lv < wantTowers && p.scudi - TORRE_COST[lv] >= reserve && buildTower(g).ok) log.push(`alza le torri di guardia al livello ${lv + 1}`);
  // le torri hanno avvistato un esercito: si arruola contro quanti soldati ha chi lo manda (stimati)
  const seen = towerAlerts(g, me, 'guerra');
  if (seen.length && level !== 'facile') {
    const foe = seen.reduce((a, c) => a + guessSoldiers(g, me, c.owner) + awayOf(st, c.owner) * 0.5, 0);
    const def = defenseOf(p, st.soldati[me], st.mura[me]);
    const k = Math.min(recruitRoom(g), Math.ceil((foe * 1.1 - def) / (1 + WALL_BONUS * st.mura[me])), Math.floor(Math.max(0, p.scudi - 200) / RECRUIT_COST));
    if (k > 0 && recruit(g, k).ok) log.push(`le torri avvistano un esercito: arruola ${k} soldati`);
  }
}

/** Sotto assedio: si arruola per reggere l'assalto, o si compra la pace se non basta. */
function botUnderSiege(c: BotCtx): void {
  const { g, level, rnd, log } = c;
  const st = ss(g), me = g.state.current, p = g.player;
  for (const s of siegesOn(st, me)) {
    const need = Math.ceil(s.n * 1.1);
    const def = () => defenseOf(p, st.soldati[me], st.mura[me], s.cat);
    if (level !== 'facile' && def() < need) {
      const army = st.soldati[me] + awayOf(st, me);
      const room = maxArmy(p, army) - army;
      // soldati che servono, al netto della moltiplicazione delle mura in piedi
      const k = Math.min(room, recruitRoom(g), Math.ceil((need - def()) / (1 + WALL_BONUS * standingWalls(st.mura[me], s.cat))) + 1, Math.floor(Math.max(0, p.scudi) / RECRUIT_COST));
      if (k > 0 && recruit(g, k).ok) log.push(`arruola ${k} soldati contro l'assedio di ${g.state.players[s.owner].name}`);
    }
    const hopeless = winChance(s.n, def(), rnd) > 0.5;
    const pay = level === 'difficile' ? hopeless : level === 'medio' ? hopeless && rnd() < 0.7 : rnd() < 0.3;
    if (pay && p.scudi >= peacePrice(s) + 300 && buyPeace(g, s.owner).ok) log.push(`compra la pace da ${g.state.players[s.owner].name} per ${peacePrice(s)} scudi`);
  }
}

/** Bottino stimato: scudi e grano che un esercito può portar via. */
function lootOf(g: Game, d: Player): number {
  const prezzo = g.state.scalars.prezzo || 30;
  return Math.max(0, d.scudi) + (d.grano * 0.5 * prezzo) / 1000;
}

/** Un vicino ricco merita una spia: senza, la sua difesa si indovina male. */
function tempting(g: Game, me: number): boolean {
  return others(g, me).some(i => lootOf(g, g.state.players[i]) >= MEDIO_MIN_LOOT);
}

/** Prima di pensare alla guerra si manda una spia oltre confine. */
function botSpy(c: BotCtx): void {
  const { g, level, rnd } = c;
  const me = g.state.current, p = g.player;
  if (hasSpy(g, me) || !others(g, me).length) return;
  // il medio la manda quando un vicino ha qualcosa da prendere
  const want = level === 'difficile' ? p.scudi > SPY_COST + 1000 : level === 'medio' ? p.scudi > SPY_COST + 600 && tempting(g, me) && rnd() < 0.8 : rnd() < 0.1 && p.scudi > 1000;
  if (want && hireSpy(g).ok) c.log.push('assolda una spia');
}

/** L'assedio continua solo se l'assalto ha buone speranze. */
function botSiege(c: BotCtx): void {
  const { g, level, rnd, log } = c;
  const st = ss(g), me = g.state.current;
  for (const s of siegesBy(st, me)) {
    const d = g.state.players[s.target];
    const chance = winChance(s.n, defenseOf(d, st.soldati[s.target], st.mura[s.target], s.cat), rnd);
    if (chance < (level === 'difficile' ? 0.55 : level === 'medio' ? 0.45 : 0.3) && liftSiege(g, s.target).ok) log.push(`toglie l'assedio a ${d.name}`);
  }
}

/** Catapulte che servono per aprire tutte le mura di un feudo. */
const catNeeded = (mura: number) => Math.min(CATAPULT_MAX, Math.ceil(mura * CATAPULTS_PER_RING));

function botWar(c: BotCtx): void {
  const { g, level, rnd, log } = c;
  const st = ss(g), me = g.state.current, p = g.player;
  if (st.lastWar[me] === g.state.q) return;
  const ps = g.state.players;
  // il bersaglio migliore: molto da prendere, poca difesa
  const live = others(g, me);
  if (!live.length) return;
  const leader = live.reduce((a, i) => (wealthIndex(ps[i]) > wealthIndex(ps[a]) ? i : a), live[0]);
  const army = st.soldati[me] + awayOf(st, me);
  const room = maxArmy(p, army) - awayOf(st, me);
  const busy = new Set([...siegesBy(st, me).map(s => s.target), ...campaignsBy(st, me).map(c => c.target)]);
  // catapulte: quelle nel fortino, più quelle che si possono costruire quest'anno
  const catHome = catapultsOf(st, me);
  const catBuy = (mura: number) => level === 'facile' ? 0 : Math.max(0, Math.min(catNeeded(mura) - catHome, CATAPULT_MAX - catHome - catAwayOf(st, me)));
  // il facile guarda solo oltre il confine; gli altri anche lontano, dove però i soldati restano via due anni
  const targets = (level === 'facile' ? neighbors(g, me) : live).filter(i => !busy.has(i)).map(i => {
    const d = ps[i];
    const far = travelYears(g, me, i) > 1;
    const buy = catBuy(st.mura[i]);
    const cat = Math.min(catHome + buy, catNeeded(st.mura[i]));
    const soldiers = guessSoldiers(g, me, i);
    const defense = defenseOf(d, soldiers, st.mura[i], cat);
    // chi ci ha assalito di recente si ricorda: il medio cerca la rivincita
    const foe = st.wars.some(w => w.attacker === i && w.defender === me && w.q >= g.state.q - 3);
    return { i, loot: lootOf(g, d) * (far ? FAR_LOOT_WEIGHT : 1), defense, leader: i === leader, foe, cat, buy: Math.max(0, cat - catHome), servi: d.servi };
  });
  type T = (typeof targets)[number];
  // le catapulte costano: si tolgono dal bottino
  const net = (x: T) => x.loot - x.buy * CATAPULT_COST;
  // un rivale da abbattere: il capofila, o chi ci ha assalito, quando è ben più ricco di noi
  const mine = wealthIndex(p);
  const rival = (x: T) => (x.leader || x.foe) && wealthIndex(ps[x.i]) > mine * RIVAL_LEAD;
  let t: T | undefined;
  let wanted: number;
  let goal: WarGoal = 'bottino';
  if (level === 'difficile') {
    t = targets.sort((a, b) => (net(b) + (rival(b) ? 3000 : 0)) / (b.defense + 50) - (net(a) + (rival(a) ? 3000 : 0)) / (a.defense + 50))[0];
    if (!t || (net(t) < 1500 && !rival(t))) return;
    if (rival(t) && g.state.q >= DESTROY_FROM_Q && !siegesBy(st, me).length && !siegesOn(st, t.i).length) goal = 'distruzione';
    else if (net(t) < 1500) return;
    wanted = Math.max(WAR_MIN, Math.ceil(t.defense * (goal === 'distruzione' ? 1.7 : 1.5)));
  } else if (level === 'medio') {
    // il medio attacca quando gli conviene: un feudo che può battere e con qualcosa da prendere,
    // o un rivale che corre troppo avanti. Non nei primi anni, e fra una campagna e l'altra
    // lascia riposare l'esercito.
    if (g.state.q < MEDIO_FIRST_WAR || g.state.q - st.lastWar[me] < MEDIO_WAR_REST) return;
    const score = (x: T) => ((net(x) + (rival(x) ? 2000 : 0)) / (x.defense + 50)) * (x.leader ? 2 : 1) * (x.foe ? 2 : 1);
    t = targets.filter(x => (net(x) >= MEDIO_MIN_LOOT || rival(x)) && Math.ceil(x.defense * 1.3) <= room).sort((a, b) => score(b) - score(a))[0];
    if (!t) return;
    // più è facile la vittoria, più è probabile che la tenti
    const easy = Math.min(1, room / Math.max(1, t.defense * 1.3) - 1);
    if (rnd() > (t.leader || t.foe ? 0.35 : 0.2) + 0.3 * easy) return;
    // contro un rivale, se ha forze per un assedio lungo, punta a distruggerlo
    if (rival(t) && g.state.q >= DESTROY_FROM_Q && t.defense * 1.6 <= room && !siegesBy(st, me).length && !siegesOn(st, t.i).length && rnd() < MEDIO_DESTROY) goal = 'distruzione';
    else if (net(t) < MEDIO_MIN_LOOT) return;
    wanted = Math.max(WAR_MIN, Math.ceil(t.defense * (goal === 'distruzione' ? 1.6 : 1.3)));
  } else {
    t = targets.sort((a, b) => Number(b.leader) - Number(a.leader) || b.loot - a.loot)[0];
    if (!t || rnd() > (t.leader ? 0.2 : 0.1)) return;
    wanted = Math.max(WAR_MIN, Math.floor(p.servi * 0.08));
  }
  if (wanted > room) return;
  // si arruola solo se la vittoria è probabile e la campagna si può pagare
  if (level !== 'facile' && winChance(wanted, t.defense, rnd) < (level === 'difficile' ? 0.75 : 0.6)) return;
  const need = Math.max(0, wanted - st.soldati[me]);
  if (p.scudi < need * RECRUIT_COST + t.buy * CATAPULT_COST + wanted * CAMPAIGN_COST + (level === 'medio' ? 300 : 500)) return;
  if (t.buy && !buildCatapults(g, t.buy).ok) return;
  if (t.buy) log.push(`costruisce ${t.buy} catapulte`);
  // i volontari sono pochi: un esercito grande si mette insieme in più anni
  if (need > recruitRoom(g)) {
    const k = recruitRoom(g);
    if (k > 0 && recruit(g, k).ok) log.push(`arruola ${k} soldati (pochi volontari: la campagna aspetta)`);
    return;
  }
  if (need && !recruit(g, need).ok) return;
  if (need) log.push(`arruola ${need} soldati`);
  const r = declareWar(g, t.i, Math.min(wanted, st.soldati[me]), goal, Math.min(t.cat, catapultsOf(st, me)));
  if (r.ok && r.campaign) {
    const k = r.campaign;
    log.push(`manda ${k.n} soldati${k.cat ? ` e ${k.cat} catapulte` : ''} contro ${ps[t.i].name} ${goal === 'distruzione' ? 'per distruggerlo' : 'per le risorse'}: battaglia alla fine del ${900 + k.arrive}`);
  }
}

/** Dopo la campagna si tiene solo la guarnigione utile: il resto torna a lavorare. */
function botGarrison(c: BotCtx): void {
  const { g, level } = c;
  const st = ss(g), me = g.state.current;
  if (level === 'facile') return;
  const threat = threatOf(g, me);
  const besieged = siegesOn(st, me).length > 0;
  const keep = besieged ? Math.ceil(threat * 1.1) : recentlyAttacked(st, me, g.state.q) ? Math.ceil(threat * (level === 'difficile' ? 0.8 : 0.5)) : 0;
  if (st.soldati[me] > keep) disband(g, st.soldati[me] - keep);
}

function botBrigands(c: BotCtx): void {
  const { g, level, rnd, log } = c;
  const st = ss(g), me = g.state.current, p = g.player;
  if (st.brigands !== me) return;
  const expectedLoss = Math.max(0, p.credito) * BRIGAND_TAX;
  const tryDrive = st.soldati[me] >= (level === 'difficile' ? 200 : WAR_MIN) && st.lastDrive[me] !== g.state.q;
  if (tryDrive && (level !== 'facile' || rnd() < 0.5)) {
    const r = driveBrigands(g);
    if (r.ok) log.push(r.win ? 'scaccia i briganti dal feudo' : 'prova a scacciare i briganti, ma è respinto');
    if (st.brigands !== me) return;
  }
  const pay = level === 'difficile' ? expectedLoss > BRIGAND_PAY : level === 'medio' ? p.scudi > 2000 : rnd() < 0.3;
  if (pay && p.scudi >= BRIGAND_PAY && payBrigands(g).ok) log.push(`paga ${BRIGAND_PAY} scudi perché i briganti se ne vadano`);
}

// ---------------------------------------------------------------- agganci

export const rules: ExpansionRules = {
  id: ID,
  init: (state): SpadeState => {
    let h = 2166136261;
    for (const v of [...state.rngState, state.players.length, 0x5bade]) h = Math.imul(h ^ v, 16777619) >>> 0;
    return {
      mura: state.players.map(() => 0),
      soldati: state.players.map(() => 0),
      catapulte: state.players.map(() => 0),
      brigands: null,
      pendingMove: null,
      marcia: [],
      assedi: [],
      campagne: [],
      torri: state.players.map(() => 0),
      lastWar: state.players.map(() => -1),
      lastDrive: state.players.map(() => -1),
      spia: state.players.map(() => -1),
      wars: [],
      mail: [],
      inbox: [],
      rng: [h],
    };
  },

  onTurnStart(g) {
    const st = ss(g), me = g.state.current;
    st.inbox = st.mail.filter(m => m.to === me).map(m => m.d);
    st.mail = st.mail.filter(m => m.to !== me);
    // le schiere che arrivano a casa: la malattia ne ha portati via fino al 5% per anno di viaggio
    const home = (st.marcia ?? []).filter(m => m.owner === me && m.back <= g.state.q);
    if (home.length) {
      const rnd = roll(st);
      for (const m of home) {
        const lost = INT(m.n * MARCH_SICKNESS * m.anni * rnd());
        st.soldati[me] += m.n - lost;
        if (m.cat) (st.catapulte ??= g.state.players.map(() => 0))[me] = catapultsOf(st, me) + m.cat;
        st.inbox.push({ k: 'returned', n: m.n - lost, lost, anni: m.anni, from: m.from, cat: m.cat ?? 0 });
        note(g, me, 'returned', { n: m.n - lost, lost, anni: m.anni, from: m.from });
      }
      st.marcia = st.marcia!.filter(m => !home.includes(m));
    }
  },

  onEvent(g, eventId, outcome) {
    const st = ss(g), me = g.state.current, p = g.player;
    if (!RAID_EVENTS.includes(eventId)) return;
    if (st.mura[me] > 0) wallShield(p, st.mura[me], outcome);
    // i briganti diventano una pedina: chi li ha subiti li manda su un avversario
    if (eventId === BRIGAND_EVENT && outcome.choice && others(g, me).length) {
      if (p.bot) {
        st.pendingMove = me;
        const r = roll(st);
        moveBrigands(g, botBrigandTarget(g, p.bot, r));
      } else {
        st.pendingMove = me;
      }
    }
  },

  // contro le orde delle fazioni un soldato vale tre nemici (sei servi), ogni cerchia di mura +20% di difesa
  factionDefense(g) {
    const st = ss(g), me = g.state.current;
    return { soldati: st.soldati[me] * SOLDIER_VS_HORDE, mura: 1 + WALL_VS_HORDE * st.mura[me] };
  },

  onIncome(g, amount) {
    const st = ss(g), me = g.state.current;
    if (st.brigands !== me || amount <= 0) return;
    const loss = INT(amount * BRIGAND_TAX);
    g.player.scudi -= loss;
    note(g, me, 'brigandTax', { loss });
  },

  beforeYearEnd(g) {
    const st = ss(g), me = g.state.current, p = g.player;
    // una decisione rimasta in sospeso: i briganti vanno sul più ricco
    if (st.pendingMove === me) moveBrigands(g, botBrigandTarget(g, 'difficile', roll(st)));
    // il soldo spetta anche a chi è lontano; le catapulte vogliono manutenzione
    const army = st.soldati[me] + awayOf(st, me);
    const cat = catapultsOf(st, me) + catAwayOf(st, me);
    const soldo = army * SOLDO + cat * CATAPULT_UPKEEP;
    if (soldo > 0) {
      p.scudi -= soldo;
      note(g, me, 'army', { soldati: army, soldo, mura: st.mura[me], cat });
    }
  },

  // tutte le battaglie dell'anno si combattono quando tutti hanno giocato
  onYearClose: resolveBattles,

  botBeforeTrade: botBrigands,

  botBeforeInvest(c) {
    botBrigands(c);
    botSpy(c);
    botUnderSiege(c);
    botDefend(c);
    botSiege(c);
    botWar(c);
    botGarrison(c);
  },
};
