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
 * - Mura: fino a 5 cerchie, 2500 scudi ciascuna. Una cerchia si costruisce in un
 *   anno: è pronta alla chiusura dell'anno, dopo le battaglie. Rafforzano molto la difesa
 *   in guerra e un poco contro le orde, e riducono le perdite di pugna e
 *   riscatto contro Longobardi e briganti. Non contano per il rango.
 * - Torri di guardia: fino a 3 livelli. Avvistano gli eserciti nemici in
 *   marcia verso il feudo (non quanti sono): con una torre l'avviso arriva
 *   solo al momento della guerra, e solo per l'assalto di quell'anno; con due
 *   già nei dispendimenti, con tre all'inizio dell'anno, prima di spendere per
 *   il grano (dal secondo livello si vedono anche gli eserciti che arriveranno
 *   l'anno dopo, dai feudi lontani). Non contano per il rango.
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
import { RISCHIO_BATTAGLIA } from '../../domain/dinastia';
import { legami, prudente, ripudiabili } from '../../domain/famiglia';
import { growPerPlayer, type BotCtx, type ExpansionRules } from '../../domain/expansion';
import { borders } from '../../domain/geography';
import { haOpera } from '../../domain/ere';
import { vietato } from '../../domain/vocazioni';
import { ACRI_PER_ACQUISTO, COSTS, MAX_ACRI } from '../../domain/investments';
import { wealthIndex } from '../../domain/rank';
import { Mulberry32 } from '../../domain/rng';
import type { Game } from '../../domain/turn';
import type { DispaccioCasata } from '../../domain/prestiti';
import { livelloOf, sereno } from '../../domain/gabelle';
import type { ActionResult, EventOutcome, Player } from '../../domain/types';
import { LEVA_ANNI, factionOfEvent } from '../../domain/fazioni';
import {
  cardOf, CARTA_EVENT, CARTA_PESO, CARTE_ID, cartaOfEvent, discard, drawCard, expireCards, handOf, MERC_PAGA, mercsOf, playedThisYear, scadenzaCarta, TRADITORE_MURA, traitorsAt, truceOn, type CartaGuerra,
} from './carte';

export const ID = 'spade-castelli';

export const MURA_COST = 2500;
export const MURA_MAX = 5;
/** Costo di ciascun livello delle torri di guardia (il primo, il secondo, il terzo). */
export const TORRE_COST = [600, 900, 1200] as const;
export const TORRI_MAX = TORRE_COST.length;
/** Dove arriva l'avviso delle torri: livello minimo per vederlo in ciascun momento dell'anno. */
export const TORRE_ALERT: Record<'delibera' | 'dispendimenti' | 'guerra', number> = { delibera: 3, dispendimenti: 2, guerra: 1 };
/** Livello delle torri che vede anche gli eserciti che arriveranno negli anni seguenti (sotto: solo l'assalto di quest'anno). */
export const TORRE_LONTANO = 2;
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
/** le catapulte oltre quelle che aprono le mura bombardano il feudo: fino a questa quota dei servi per ogni coppia in più, vinca o perda l'assalto */
export const BOMBARD_KILL = 0.02;
/** ogni cerchia riduce del 12% le perdite contro Longobardi e briganti */
export const WALL_EVENT_SHIELD = 0.12;
export const LOOT_SCUDI = 8;
export const LOOT_GRANO = 20;
/** assedio: servi uccisi e grano bruciato a ogni vittoria; vittorie per far cadere il feudo */
export const SIEGE_KILL = 0.2;
export const SIEGE_BURN = 0.3;
/** al più tanti assalti vinti per far cadere un feudo (quanti ne servono lo dice siegeNeed) */
export const SIEGE_FALL_WINS = 5;
/** popolo e soldati che tengono in piedi un feudo assediato: ogni soglia vale un assalto in più */
export const SIEGE_SERVI_STEPS = [1500, 3000] as const;
export const SIEGE_SOLDATI_STEP = 100;
/** le sconfitte subite negli ultimi anni nelle guerre per le risorse fiaccano il morale: una vittoria in meno ciascuna, fino a tante */
export const SIEGE_MORALE_YEARS = 3;
export const SIEGE_MORALE_MAX = 2;
/** ogni anno d'assedio la malattia nel campo porta via fino a questa quota degli assedianti */
export const SIEGE_ATTRITION = 0.08;
/** leva dei Franchi: quota degli uomini che tornano a casa (minima e massima) */
export const LEVA_RITORNO = [0.5, 0.8] as const;
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
/** anni in cui un signore del computer tiene i soldati radunati per una campagna che non parte */
export const PLAN_YEARS = 4;
/** un signore del computer con tanti scudi oltre la riserva si fortifica anche senza minacce */
export const RICH_WALLS = 4 * MURA_COST;

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
  /** servi uccisi dal tiro delle catapulte in più delle mura (assente nei salvataggi vecchi) */
  bombard?: number;
  /** assalto dell'assedio (1: la prima battaglia) */
  round?: number;
  /** l'esercito resta ad assediare il feudo */
  siege?: boolean;
  /** il feudo è caduto */
  fell?: boolean;
  /** mercenari in campo con l'assalitore e nel fortino del difensore */
  merc?: number;
  mercDef?: number;
  /** traditore giocato dall'assalitore: ha aperto una porta, o le porte sono rimaste chiuse (doppio gioco) */
  traditore?: 'aperte' | 'chiuse';
  /** il traditore del difensore faceva il doppio gioco e gli ha aperto le porte */
  tradito?: boolean;
  /** attacco comune: l'alleato che ha combattuto con l'assalitore, con la sua parte (i campi sopra sono dell'assalitore) */
  alleato?: { owner: number; sent: number; lost: number; scudi: number; grano: number; cat: number; catLost: number };
  /** soldati alleati arrivati in difesa del feudo, e quanti ne sono caduti */
  aiuto?: { n: number; lost: number };
}

/** Notizie per un signore, lette all'inizio del suo turno. */
export type Dispatch =
  /** Dinastia: prestiti di casata (src/domain/prestiti.ts) */
  | { k: 'casata'; d: DispaccioCasata }
  | { k: 'attacked'; war: WarResult }
  | { k: 'siege'; war: WarResult }
  /** all'attaccante: l'esito della battaglia, combattuta alla chiusura dell'anno */
  | { k: 'battle'; war: WarResult }
  | { k: 'returned'; n: number; lost: number; anni: number; from: number; cat?: number; franchi?: boolean }
  /** salvataggi vecchi: l'assediato comprava la pace senza chiedere */
  | { k: 'peace'; by: number; scudi: number }
  /** all'assediato: l'assediante ha accettato (ok) o respinto la sua proposta di pace */
  | { k: 'peaceAnswer'; by: number; ok: boolean; scudi: number }
  | { k: 'lifted'; by: number }
  /** all'assalitore: il feudo di `by` è sotto la tregua di Dio; siege: l'assedio non ha dato l'assalto */
  | { k: 'truce'; by: number; siege: boolean }
  | { k: 'brigandsIn'; by: number }
  /** a chi ha proposto la pace: accettata (fino all'anno `fino`), respinta, o decaduta senza risposta */
  | { k: 'treatyAnswer'; by: number; ok: boolean; anni: number; dono: number; fino?: number; scaduta?: boolean }
  /** l'esercito in marcia contro il nuovo alleato torna indietro */
  | { k: 'treatyRecall'; target: number; n: number }
  /** il trattato con `with` è scaduto */
  | { k: 'treatyEnd'; with: number }
  /** a chi ha proposto l'alleanza: accettata, respinta, o decaduta senza risposta */
  | { k: 'allianceAnswer'; by: number; ok: boolean; scaduta?: boolean }
  /** l'alleato `by` ha rotto l'alleanza; tornano indietro i soldati in viaggio */
  | { k: 'allianceEnd'; by: number; tornano: number }
  /** a chi ha chiesto aiuto: mandato (soldati, o scudi da un mercante), negato, o decaduto */
  | { k: 'aidAnswer'; by: number; ok: boolean; n: number; scudi: number; arrive?: number; scaduta?: boolean };

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
  /** uomini dati in leva ai Franchi (cigno nero): tornano dalla guerra contro gli Ungari */
  franchi?: boolean;
}

/** Un esercito in marcia verso il nemico: combatterà alla chiusura dell'anno `arrive`. */
export interface Campaign {
  owner: number;
  target: number;
  n: number;
  cat: number;
  goal: WarGoal;
  /** mercenari che marciano con l'esercito */
  merc?: number;
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
  /** proposta di pace dell'assediato, in attesa della risposta dell'assediante (assente: nessuna) */
  offerta?: { q: number; price: number };
  /** anno (q) dell'ultima proposta respinta: se ne può fare un'altra l'anno dopo */
  rifiuto?: number;
  /** mercenari arrivati con i rinforzi: combattono il prossimo assalto, poi se ne vanno */
  merc?: number;
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
  /** cerchie di mura in costruzione: pronte alla chiusura dell'anno, dopo le battaglie (assente nei salvataggi vecchi) */
  muraNuove?: number[];
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
  /** signori del computer: esercito che stanno radunando per una campagna, dall'anno q (assente nei salvataggi vecchi) */
  piani?: ({ q: number; n: number } | null)[];
  /** carte di guerra in mano a ciascun signore (assente nei salvataggi vecchi) */
  carte?: CartaGuerra[][];
  /** anno (q) dell'ultima carta giocata da ciascun signore */
  giocata?: number[];
  /** mercenari nel fortino di ciascun signore, fino all'anno (q) `until` */
  mercenari?: ({ n: number; until: number } | null)[];
  /** traditori giocati: apriranno le porte di `target` al prossimo assalto di `owner` */
  traditori?: { owner: number; target: number; doppio: boolean }[];
  /** traditori che fanno il doppio gioco: apriranno le porte di `owner` al primo assalto, fino all'anno `until` */
  serpi?: { owner: number; until: number }[];
  /** anno (q) della tregua di Dio di ciascun signore */
  tregue?: number[];
  /** trattati di pace fra signori e proposte in attesa di risposta (assenti nei salvataggi vecchi) */
  trattati?: Trattato[];
  proposte?: PropostaTrattato[];
  /** alleanze fra signori, proposte in attesa, richieste d'aiuto in difesa e aiuti in viaggio o sul posto (assenti nei salvataggi vecchi) */
  alleanze?: Alleanza[];
  proposteAlleanza?: PropostaAlleanza[];
  richieste?: RichiestaAiuto[];
  aiuti?: Aiuto[];
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
/** Cerchie di mura del signore `i` in costruzione quest'anno (pronte alla chiusura dell'anno). */
export const muraNuoveOf = (st: SpadeState, i: number) => st.muraNuove?.[i] ?? 0;
/** Cerchie di mura del signore `i`, contando quelle in costruzione (per il tetto e per chi decide di costruirne). */
export const muraTotaliOf = (st: SpadeState, i: number) => st.mura[i] + muraNuoveOf(st, i);
/** Chiusura dell'anno, dopo le battaglie: le cerchie in costruzione sono pronte. */
export function completaMura(st: SpadeState): void {
  if (!st.muraNuove) return;
  st.muraNuove.forEach((k, i) => { st.mura[i] = Math.min(MURA_MAX, st.mura[i] + k); });
  st.muraNuove = st.muraNuove.map(() => 0);
}
/** Livello delle torri di guardia del signore `i`. */
export const torriOf = (st: SpadeState, i: number) => st.torri?.[i] ?? 0;
/**
 * Eserciti in avvicinamento che le torri del signore `i` possono avvistare:
 * partiti in un anno precedente (chi parte quest'anno è ancora oltre i monti).
 */
export const incomingOf = (g: Game, i: number) => campaignsOn(ss(g), i).filter(c => c.q < g.state.q);
/** Avvistamenti visibili in un momento dell'anno, secondo il livello delle torri. */
export function towerAlerts(g: Game, i: number, where: keyof typeof TORRE_ALERT): Campaign[] {
  const lv = torriOf(ss(g), i);
  if (lv < TORRE_ALERT[where]) return [];
  // la torre più bassa vede solo chi è già sotto i monti: l'assalto di quest'anno
  return lv >= TORRE_LONTANO ? incomingOf(g, i) : incomingOf(g, i).filter(c => c.arrive <= g.state.q);
}
/** Soldati del signore `i` mandati in difesa di un alleato (in viaggio o sul posto). */
export const aidAwayOf = (st: SpadeState, i: number) => (st.aiuti ?? []).filter(a => a.owner === i).reduce((k, a) => k + a.n, 0);
/** Soldati alleati in difesa del feudo `i` alla chiusura dell'anno `q` (arrivati). */
export const aidAtOf = (st: SpadeState, i: number, q: number) => (st.aiuti ?? []).filter(a => a.to === i && a.arrive <= q).reduce((k, a) => k + a.n, 0);
/** Soldati del signore `i` fuori dal fortino: verso il nemico, all'assedio, di ritorno o in aiuto a un alleato. */
export const awayOf = (st: SpadeState, i: number) =>
  (st.marcia ?? []).filter(m => m.owner === i).reduce((a, m) => a + m.n, 0) + siegesBy(st, i).reduce((a, s) => a + s.n, 0) + campaignsBy(st, i).reduce((a, c) => a + c.n, 0) + aidAwayOf(st, i);
/** Catapulte del signore `i` fuori dal fortino. */
export const catAwayOf = (st: SpadeState, i: number) =>
  (st.marcia ?? []).filter(m => m.owner === i).reduce((a, m) => a + (m.cat ?? 0), 0) + siegesBy(st, i).reduce((a, s) => a + s.cat, 0) + campaignsBy(st, i).reduce((a, c) => a + c.cat, 0);
/** Anni di viaggio del ritorno da un feudo: 1 se confina, 2 se è lontano. */
/** Anni di marcia: uno verso un confinante, due altrimenti; le ere: con strade e ponti un anno in meno (mai meno di uno). */
export const travelYears = (g: Game, from: number, to: number) =>
  Math.max(1, (neighbors(g, from).includes(to) ? 1 : 2) - (haOpera(g.state.players[from], 'strade') ? 1 : 0));

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

/** Cerchie che le catapulte potrebbero aprire oltre quelle del feudo (0: le mura bastano a fermarle). */
export const bombardRings = (mura: number, cat = 0) => Math.max(0, cat / CATAPULTS_PER_RING - mura);

/** Forza difensiva media di un feudo (senza il tiro), contro un esercito con `cat` catapulte. */
export function defenseOf(p: Player, soldati: number, mura: number, cat = 0): number {
  const m = standingWalls(mura, cat);
  return (soldati + INT(Math.max(0, p.servi) * MILITIA) + WALL_MEN * m) * (1 + WALL_BONUS * m);
}

/**
 * La guerra è in vista: un esercito nemico arriverà sotto le mura alla fine di quest'anno (in piazza se ne parla,
 * torri o no) o assedia il feudo. Chi arriverà l'anno dopo da un feudo lontano lo vedono solo le torri alte.
 */
export const warLooms = (g: Game, i: number) => incomingOf(g, i).some(c => c.arrive <= g.state.q) || siegesOn(ss(g), i).length > 0;

/** Usura di guerra: rincaro per il feudo minacciato o assediato e per chi ha l'esercito in campo; sconto in pace. */
export const USURA_MINACCIA = 10;
export const USURA_CAMPAGNA = 5;
export const USURA_PACE = -5;
export function warUsury(g: Game, i: number): number {
  const st = ss(g), inField = campaignsBy(st, i).length > 0 || siegesBy(st, i).length > 0;
  const war = (warLooms(g, i) ? USURA_MINACCIA : 0) + (inField ? USURA_CAMPAGNA : 0);
  return war || USURA_PACE;
}

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
  // Dinastia a vocazioni: il mercante non costruisce macchine da assedio
  const voc = vietato(g.player, 'catapulte');
  if (voc) return { ok: false, reason: voc };
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
  if (muraTotaliOf(st, me) >= MURA_MAX) return { ok: false, reason: muraNuoveOf(st, me) ? `con quelle in costruzione le mura avranno già ${MURA_MAX} cerchie` : `le mura hanno già ${MURA_MAX} cerchie` };
  if (!canSpend(p, MURA_COST)) return { ok: false, reason: 'tesoro e credito insufficienti' };
  p.scudi -= MURA_COST;
  // la cerchia si costruisce nell'anno: difende dalla chiusura dell'anno, dopo le battaglie
  (st.muraNuove ??= g.state.players.map(() => 0))[me] += 1;
  note(g, me, 'wall', { level: muraTotaliOf(st, me) });
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
function fight(g: Game, attacker: number, target: number, n1: number, cat1: number, goal: WarGoal, round: number, merc1 = 0, ally?: Alleato): WarResult {
  const st = ss(g), ps = g.state.players, p = ps[attacker], d = ps[target];
  const rnd = roll(st);
  // attacco comune: le forze dei due alleati si sommano in una sola battaglia
  const n = n1 + (ally?.n ?? 0), cat = cat1 + (ally?.cat ?? 0), merc = merc1 + (ally?.merc ?? 0);
  // carte di guerra: il traditore apre le porte (al nemico, o al suo padrone se fa il doppio gioco);
  // i mercenari del fortino difendono e poi se ne vanno
  const tr = traitorsAt(g, st, attacker, target);
  const mura = Math.max(0, st.mura[target] - (tr.help ? TRADITORE_MURA : 0) - (tr.betrayed ? TRADITORE_MURA : 0));
  const mercDef = mercsOf(g, st, target);
  if (st.mercenari?.[target]) st.mercenari[target] = null;
  // i soldati mandati in difesa da un alleato combattono con la guarnigione
  const aidN = aidAtOf(st, target, g.state.q);
  const attack = (n + merc) * (0.7 + 0.6 * rnd());
  const defense = defenseOf(d, fieldSoldiers(g, target) + mercDef + aidN, mura, cat) * (0.7 + 0.6 * rnd());
  const win = attack > defense;
  const attackerLost = INT(n * (win ? 0.05 + 0.15 * rnd() : 0.3 + 0.3 * rnd()));
  const defFrac = win ? 0.3 + 0.3 * rnd() : 0.05 + 0.15 * rnd();
  const defenderLost = INT(st.soldati[target] * defFrac);
  const aidLost = aidN ? loseAid(st, target, g.state.q, defFrac) : 0;
  // le catapulte si perdono soprattutto nelle sconfitte
  const catLost = cat ? Math.min(cat, Math.round(cat * (win ? 0.15 * rnd() : 0.3 + 0.4 * rnd()))) : 0;
  const destroy = goal === 'distruzione';
  // anche la milizia dei servi combatte: qualcuno cade pure quando l'assalto è respinto
  const militia = INT(Math.max(0, d.servi) * MILITIA);
  const serviLost = win ? INT(Math.max(0, d.servi) * (destroy ? SIEGE_KILL * (0.8 + 0.4 * rnd()) : 0.03 * rnd())) : INT(militia * (0.05 + 0.1 * rnd()));
  // le catapulte più forti delle mura colpiscono le case: muoiono servi comunque vada l'assalto
  const over = bombardRings(mura, cat);
  const bombard = over > 0 ? INT(Math.max(0, d.servi - serviLost) * Math.min(1, BOMBARD_KILL * over) * (0.5 + 0.5 * rnd())) : 0;
  st.soldati[target] -= defenderLost;
  d.servi -= serviLost + bombard;

  let scudi = 0, grano = 0, rings = 0;
  if (win) {
    // anche i mercenari rimasti in piedi fanno bottino per il loro signore
    const survivors = n - attackerLost + INT(merc * (n ? 1 - attackerLost / n : 0.9));
    scudi = INT(Math.min(Math.max(0, d.scudi), survivors * LOOT_SCUDI));
    grano = INT(Math.min(d.grano * 0.5, survivors * LOOT_GRANO));
    d.scudi -= scudi;
    d.grano -= grano;
    p.scudi += scudi;
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
  const w: WarResult = { q: g.state.q, anni: travelYears(g, attacker, target), attacker, defender: target, goal, sent: n, win, attackerLost, defenderLost, serviLost, scudi, grano, acri: 0, cat, catLost, rings, round, ...(bombard ? { bombard } : {}),
    ...(merc ? { merc } : {}), ...(mercDef ? { mercDef } : {}), ...(tr.played ? { traditore: tr.help ? ('aperte' as const) : ('chiuse' as const) } : {}), ...(tr.betrayed ? { tradito: true } : {}),
    ...(aidN ? { aiuto: { n: aidN, lost: aidLost } } : {}) };
  return ally ? splitAlly(g, w, n1, cat1, ally) : w;
}

/** Le forze di un alleato nell'attacco comune. */
export interface Alleato { owner: number; n: number; cat: number; merc: number }

/**
 * Attacco comune: perdite, catapulte perdute e bottino si dividono in proporzione ai soldati (e alle catapulte)
 * di ciascuno. Il bottino era tutto dell'assalitore: la parte dell'alleato passa a lui. I campi dell'esito
 * restano dell'assalitore; quelli dell'alleato vanno in `alleato`.
 */
function splitAlly(g: Game, w: WarResult, n1: number, cat1: number, ally: Alleato): WarResult {
  const ps = g.state.players, lead = ps[w.attacker], a = ps[ally.owner];
  const quota = (part: number, tot: number) => (tot ? part / tot : 0);
  const lost1 = INT(w.attackerLost * quota(n1, w.sent)), lost2 = w.attackerLost - lost1;
  const catLost1 = INT((w.catLost ?? 0) * quota(cat1, w.cat ?? 0)), catLost2 = (w.catLost ?? 0) - catLost1;
  // il bottino si divide fra chi è rimasto in piedi
  const vivi1 = n1 - lost1 + (w.merc ?? 0) - ally.merc, vivi2 = ally.n - lost2 + ally.merc;
  const s2 = INT(w.scudi * quota(vivi2, vivi1 + vivi2)), g2 = INT(w.grano * quota(vivi2, vivi1 + vivi2));
  lead.scudi -= s2;
  lead.grano -= g2;
  a.scudi += s2;
  a.grano += g2;
  return {
    ...w, sent: n1, attackerLost: lost1, cat: cat1, catLost: catLost1, scudi: w.scudi - s2, grano: w.grano - g2,
    ...(w.merc ? { merc: w.merc - ally.merc } : {}),
    alleato: { owner: ally.owner, sent: ally.n, lost: lost2, scudi: s2, grano: g2, cat: ally.cat, catLost: catLost2 },
  };
}

/** L'esito visto dall'alleato dell'attacco comune: i suoi numeri al posto di quelli dell'assalitore. */
export function perAlleato(w: WarResult): WarResult {
  const x = w.alleato!;
  return {
    ...w, attacker: x.owner, sent: x.sent, attackerLost: x.lost, scudi: x.scudi, grano: x.grano, cat: x.cat, catLost: x.catLost,
    anni: w.anni, alleato: { owner: w.attacker, sent: w.sent, lost: w.attackerLost, scudi: w.scudi, grano: w.grano, cat: w.cat ?? 0, catLost: w.catLost ?? 0 },
  };
}

/** I soldati alleati in difesa del feudo `to` perdono la stessa quota della guarnigione. Ritorna i caduti. */
function loseAid(st: SpadeState, to: number, q: number, frac: number): number {
  let lost = 0;
  for (const a of (st.aiuti ?? []).filter(x => x.to === to && x.arrive <= q)) {
    const k = INT(a.n * frac);
    a.n -= k;
    lost += k;
  }
  return lost;
}

/** Pubblica l'esito: storia, notizie e cronaca. */
function publish(g: Game, w: WarResult): void {
  const st = ss(g);
  st.wars.push(w);
  // Dinastia: i due signori rischiano la vita in battaglia (di più chi la perde)
  g.pericolo(w.attacker, 'battaglia', w.win ? RISCHIO_BATTAGLIA.vinta : RISCHIO_BATTAGLIA.persa);
  g.pericolo(w.defender, 'battaglia', w.win ? RISCHIO_BATTAGLIA.persa : RISCHIO_BATTAGLIA.vinta);
  send(st, w.defender, { k: 'attacked', war: w });
  const data = { target: w.defender, win: w.win ? 1 : 0, goal: w.goal === 'distruzione' ? 1 : 0, sent: w.sent, lost: w.attackerLost, scudi: w.scudi, grano: w.grano, acri: w.acri, round: w.round ?? 1, fell: w.fell ? 1 : 0, cat: w.cat ?? 0 };
  note(g, w.attacker, 'war', data);
  note(g, w.defender, 'besieged', { attacker: w.attacker, held: w.win ? 0 : 1, lost: w.defenderLost, servi: w.serviLost, scudi: w.scudi, grano: w.grano, acri: w.acri, round: w.round ?? 1, rings: w.rings ?? 0, bombard: w.bombard ?? 0, ...(w.alleato ? { ally: w.alleato.owner } : {}) });
  // attacco comune: anche l'alleato ha combattuto, con la sua parte di perdite e bottino
  const x = w.alleato;
  if (x) {
    g.pericolo(x.owner, 'battaglia', w.win ? RISCHIO_BATTAGLIA.vinta : RISCHIO_BATTAGLIA.persa);
    note(g, x.owner, 'war', { ...data, sent: x.sent, lost: x.lost, scudi: x.scudi, grano: x.grano, cat: x.cat, ally: w.attacker });
  }
}

/**
 * Il feudo cade: il signore esce dalla partita. Il vincitore prende le terre
 * (fino al massimo), metà dei servi rimasti e il tesoro. Gli eserciti del
 * caduto si sciolgono; chi lo assediava torna a casa.
 */
function conquer(g: Game, attacker: number, target: number, w: WarResult, socio?: { owner: number; quota: number }): void {
  const st = ss(g), ps = g.state.players, p = ps[attacker], d = ps[target];
  // attacco comune: terre, servi e tesoro si dividono con l'alleato, in proporzione ai soldati rimasti
  const quota = socio?.quota ?? 0, s = socio ? ps[socio.owner] : null;
  const acriTot = Math.max(0, d.acri), serviTot = INT(Math.max(0, d.servi) * CONQUEST_SERVI), scudiTot = INT(Math.max(0, d.scudi));
  const acri2 = s ? Math.min(INT(acriTot * quota), MAX_ACRI - s.acri) : 0, servi2 = INT(serviTot * quota), scudi2 = INT(scudiTot * quota);
  const acri = Math.min(acriTot - acri2, MAX_ACRI - p.acri);
  const servi = serviTot - servi2;
  const scudi = scudiTot - scudi2;
  p.acri += acri;
  p.servi += servi;
  p.scudi += scudi;
  w.acri = acri;
  w.scudi += scudi;
  w.fell = true;
  note(g, attacker, 'conquest', { target, acri, servi, scudi });
  if (s && w.alleato) {
    s.acri += acri2;
    s.servi += servi2;
    s.scudi += scudi2;
    w.alleato.scudi += scudi2;
    note(g, socio!.owner, 'conquest', { target, acri: acri2, servi: servi2, scudi: scudi2 });
  }
  st.soldati[target] = 0;
  if (st.catapulte) st.catapulte[target] = 0;
  st.marcia = (st.marcia ?? []).filter(m => m.owner !== target);
  sciogliAlleanze(g, target);
  for (const s of siegesOn(st, target).filter(s => s.owner !== attacker && s.owner !== socio?.owner)) {
    goHome(g, st, s.owner, s.n, s.cat, target);
    send(st, s.owner, { k: 'lifted', by: target });
  }
  st.assedi = (st.assedi ?? []).filter(s => s.target !== target && s.owner !== target);
  if (st.brigands === target) st.brigands = null;
  if (st.pendingMove === target) st.pendingMove = null;
  g.fall(target);
}

/**
 * Quanti assalti vinti servono per far cadere il feudo, da 1 a SIEGE_FALL_WINS (5): uno, più uno per cerchia
 * di mura ancora in piedi (fino a due), uno o due per un popolo numeroso, uno per una guarnigione;
 * meno uno per ogni sconfitta recente nelle guerre per le risorse (il morale è a terra).
 * Si ricalcola a ogni assalto: mura abbattute e servi uccisi avvicinano la caduta.
 */
export function siegeNeed(g: Game, target: number): number {
  const st = ss(g), p = g.state.players[target];
  const mura = Math.min(2, st.mura[target] ?? 0);
  const popolo = SIEGE_SERVI_STEPS.filter(x => p.servi >= x).length;
  const guarnigione = (st.soldati[target] ?? 0) >= SIEGE_SOLDATI_STEP ? 1 : 0;
  const sconfitte = st.wars.filter(w => w.defender === target && w.win && w.goal !== 'distruzione' && w.q >= g.state.q - SIEGE_MORALE_YEARS).length;
  return Math.max(1, Math.min(SIEGE_FALL_WINS, 1 + mura + popolo + guarnigione - Math.min(SIEGE_MORALE_MAX, sconfitte)));
}

/** Dopo un assalto vinto in distruzione: il feudo cade? */
const falls = (g: Game, target: number, wins: number) => wins >= siegeNeed(g, target) || g.state.players[target].servi < FALL_SERVI;

/** merc: mercenari del fortino che partono con l'esercito (anche da soli) */
export function declareWar(g: Game, target: number, sent: number, goal: WarGoal, cat = 0, merc = 0): ActionResult & { campaign?: Campaign; joined?: boolean } {
  const no = phaseIs(g, 'investimenti');
  if (no) return no;
  // Dinastia a vocazioni: la milizia del mercante non lascia il feudo
  const voc = vietato(g.player, 'marcia');
  if (voc) return { ok: false, reason: voc };
  const st = ss(g), me = g.state.current, p = g.player;
  if (st.lastWar[me] === g.state.q) return { ok: false, reason: 'si muove guerra una sola volta l\'anno' };
  if (target === me || !g.state.players[target] || !alive(g, target)) return { ok: false, reason: 'scegliete il feudo di un altro signore' };
  const tr = treatyOf(g, me, target);
  if (tr) return { ok: false, reason: `avete un trattato di pace con ${g.state.players[target].name} fino al ${900 + tr.fino}` };
  if (alleati(st, me, target)) return { ok: false, reason: `siete alleati di ${g.state.players[target].name}: per muovergli guerra rompete prima l'alleanza` };
  // Dinastia: fra casate imparentate non ci si fa guerra (prima bisogna ripudiare)
  if (g.parenti(me, target)) return { ok: false, reason: `siete imparentati con ${g.state.players[target].name}: per muovergli guerra dovete prima sciogliere il matrimonio` };
  if ((st.proposte ?? []).some(x => x.from === me && x.to === target)) return { ok: false, reason: `avete proposto la pace a ${g.state.players[target].name}: attendete la sua risposta` };
  if (!Number.isInteger(merc) || merc < 0 || merc > mercsOf(g, st, me)) return { ok: false, reason: 'non avete tanti mercenari nel fortino' };
  if (!Number.isInteger(sent) || sent < 0 || sent > st.soldati[me]) return { ok: false, reason: 'non avete tanti soldati nel fortino' };
  if (sent + merc < WAR_MIN) return { ok: false, reason: `servono almeno ${WAR_MIN} uomini` };
  if (!Number.isInteger(cat) || cat < 0 || cat > catapultsOf(st, me)) return { ok: false, reason: 'non avete tante catapulte nel fortino' };
  if (goal !== 'bottino' && goal !== 'distruzione') return { ok: false, reason: 'scegliete risorse o distruzione' };
  if (goal === 'distruzione' && g.state.q < DESTROY_FROM_Q) return { ok: false, reason: `per la distruzione si muove guerra solo dall'anno ${900 + DESTROY_FROM_Q}` };
  if (!canSpend(p, sent * CAMPAIGN_COST)) return { ok: false, reason: 'non potete pagare la campagna' };
  const siege = siegesBy(st, me).find(s => s.target === target);
  if (siege && goal !== 'distruzione') return { ok: false, reason: 'quel feudo è già sotto il vostro assedio: mandate rinforzi per la distruzione' };
  // chi muove guerra respinge la pace che il nemico gli aveva proposto
  for (const x of (st.proposte ?? []).filter(y => y.from === target && y.to === me)) settleTreaty(g, x, false);
  p.scudi -= sent * CAMPAIGN_COST;
  st.lastWar[me] = g.state.q;
  st.soldati[me] -= sent;
  if (cat) st.catapulte![me] -= cat;
  if (merc) {
    const m = st.mercenari![me]!;
    m.n -= merc;
    if (m.n <= 0) st.mercenari![me] = null;
  }
  // l'esercito parte a fine turno: contro un confinante combatte alla chiusura dell'anno seguente, contro un feudo lontano di quello dopo
  const arrive = g.state.q + travelYears(g, me, target);
  const c: Campaign = { owner: me, target, n: sent, cat, goal, q: g.state.q, arrive, ...(merc ? { merc } : {}) };
  (st.campagne ??= []).push(c);
  note(g, me, siege ? 'reinforce' : 'march', { target, n: sent, cat, goal: goal === 'distruzione' ? 1 : 0, arrive: 900 + arrive, merc });
  return { ok: true, campaign: c, joined: !!siege };
}

/** Una battaglia d'apertura: l'esercito arrivato assale il feudo. */
function openBattle(g: Game, c: Campaign, p?: Campaign): void {
  const st = ss(g);
  // attacco comune: l'esercito dell'alleato `p`, arrivato nello stesso anno, combatte con quello di `c`
  const ally = p ? { owner: p.owner, n: p.n, cat: p.cat, merc: p.merc ?? 0 } : undefined;
  // i mercenari combattono questa battaglia e se ne vanno: l'assedio lo tengono solo i soldati
  const w = fight(g, c.owner, c.target, c.n, c.cat, c.goal, 1, c.merc ?? 0, ally);
  const left = c.n - w.attackerLost, catLeft = c.cat - (w.catLost ?? 0);
  const left2 = p ? p.n - w.alleato!.lost : 0, catLeft2 = p ? p.cat - w.alleato!.catLost : 0;
  if (c.goal === 'distruzione' && w.win && (left + left2 >= WAR_MIN || falls(g, c.target, 1))) {
    if (falls(g, c.target, 1)) {
      conquer(g, c.owner, c.target, w, p ? { owner: p.owner, quota: left2 / Math.max(1, left + left2) } : undefined);
      goHome(g, st, c.owner, left, catLeft, c.target);
      if (p) goHome(g, st, p.owner, left2, catLeft2, c.target);
    } else {
      // ciascuno tiene il suo campo: gli assalti degli anni seguenti si danno insieme
      (st.assedi ??= []).push({ owner: c.owner, target: c.target, n: left, cat: catLeft, last: g.state.q, wins: 1, rounds: 1 });
      if (p && left2 > 0) st.assedi.push({ owner: p.owner, target: c.target, n: left2, cat: catLeft2, last: g.state.q, wins: 1, rounds: 1 });
      w.siege = true;
    }
  } else {
    goHome(g, st, c.owner, left, catLeft, c.target);
    if (p) goHome(g, st, p.owner, left2, catLeft2, c.target);
  }
  publish(g, w);
  send(st, c.owner, { k: 'battle', war: w });
  if (p) send(st, p.owner, { k: 'battle', war: { ...perAlleato(w), anni: travelYears(g, p.owner, c.target) } });
}

/**
 * Chiusura dell'anno: tutti hanno giocato, si combatte. Prima i rinforzi
 * raggiungono gli assedi, poi gli assedi tornano all'assalto, infine gli
 * eserciti arrivati danno battaglia, nell'ordine in cui sono partiti.
 */
/** Anni di pace che attirano gente in città (saldo dei cittadini): il primo dà un punto, il secondo due. */
export const ANNI_PACE = [5, 10] as const;

/**
 * Saldo dei cittadini (peso 2): un assalto subito alla chiusura dell'anno passato fa partire gente
 * (−2 se il feudo è caduto o saccheggiato, −1 se l'ha respinto); senza assalti da ANNI_PACE anni ne arriva.
 */
export function vocePace(st: SpadeState, me: number, q: number): { voce: string; punti: number; peso: number } {
  const subiti = st.wars.filter(w => w.defender === me);
  const ora = subiti.filter(w => w.q === q - 1);
  if (ora.length) return ora.some(w => w.win) ? { voce: 'assalto perduto', punti: -2, peso: 2 } : { voce: 'assalto respinto', punti: -1, peso: 2 };
  // anni senza assalti: dall'ultimo subito, o dall'inizio della partita
  const ultimo = subiti.reduce((a, w) => Math.max(a, w.q), -1);
  const pace = q - 1 - ultimo;
  if (pace >= ANNI_PACE[1]) return { voce: `${ANNI_PACE[1]} anni di pace`, punti: 2, peso: 2 };
  if (pace >= ANNI_PACE[0]) return { voce: `${ANNI_PACE[0]} anni di pace`, punti: 1, peso: 2 };
  return { voce: 'pace', punti: 0, peso: 2 };
}

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
      if (c.merc) siege.merc = (siege.merc ?? 0) + c.merc;
    } else if (alive(g, c.target) && truceOn(g, st, c.target)) {
      // tregua di Dio: l'esercito si ferma un anno e combatterà alla chiusura del prossimo
      c.arrive = q + 1;
      st.campagne.push(c);
      send(st, c.owner, { k: 'truce', by: c.target, siege: false });
    } else fresh.push(c);
  }
  for (const s of [...(st.assedi ?? [])].filter(x => x.last < q)) {
    if (!(st.assedi ?? []).includes(s) || s.last >= q || !alive(g, s.owner) || !alive(g, s.target)) continue;
    if (truceOn(g, st, s.target)) { truceRound(g, s); continue; }
    // due alleati che assediano lo stesso feudo danno l'assalto insieme
    const s2 = (st.assedi ?? []).find(x => x !== s && x.target === s.target && x.last < q && alive(g, x.owner) && alleati(st, s.owner, x.owner));
    siegeRound(g, s, s2);
  }
  const done = new Set<Campaign>();
  for (const c of fresh) {
    if (done.has(c)) continue;
    done.add(c);
    // il feudo è già caduto: l'esercito torna indietro senza combattere
    if (!alive(g, c.target)) { goHome(g, st, c.owner, c.n, c.cat, c.target); continue; }
    // attacco comune: l'esercito di un alleato arrivato nello stesso anno contro lo stesso feudo, per lo stesso scopo
    const p = fresh.find(x => !done.has(x) && x.target === c.target && x.goal === c.goal && alive(g, x.owner) && alleati(st, c.owner, x.owner));
    if (p) done.add(p);
    openBattle(g, c, p);
  }
}

/** Chiusura dell'anno, dopo le battaglie: i soldati mandati in aiuto tornano a casa. */
function rimandaAiuti(g: Game): void {
  const st = ss(g), q = g.state.q;
  for (const a of (st.aiuti ?? []).filter(x => x.arrive <= q)) if (alive(g, a.owner)) goHome(g, st, a.owner, a.n, 0, a.to);
  st.aiuti = (st.aiuti ?? []).filter(x => x.arrive > q);
}

/** Tregua di Dio sull'assedio: niente assalto, ma il campo si ammala come sempre. */
function truceRound(g: Game, s: Siege): void {
  const st = ss(g);
  s.last = g.state.q;
  s.n -= INT(s.n * SIEGE_ATTRITION * (0.5 + 0.5 * roll(st)()));
  send(st, s.owner, { k: 'truce', by: s.target, siege: true });
  if (s.n < WAR_MIN) {
    st.assedi = (st.assedi ?? []).filter(x => x !== s);
    goHome(g, st, s.owner, s.n, s.cat, s.target);
    send(st, s.target, { k: 'lifted', by: s.owner });
  }
}

/** Un nuovo assalto dell'assedio, alla chiusura dell'anno. */
function siegeRound(g: Game, s: Siege, s2?: Siege): void {
  const st = ss(g);
  // s2: l'assedio di un alleato sullo stesso feudo, che dà l'assalto insieme
  for (const x of s2 ? [s, s2] : [s]) {
    x.rounds += 1;
    x.last = g.state.q;
  }
  // il campo si ammala: l'assedio logora anche chi lo pone
  s.n -= INT(s.n * SIEGE_ATTRITION * (0.5 + 0.5 * roll(st)()));
  if (s2) s2.n -= INT(s2.n * SIEGE_ATTRITION * (0.5 + 0.5 * roll(st)()));
  const w = fight(g, s.owner, s.target, s.n, s.cat, 'distruzione', s.rounds, s.merc ?? 0, s2 ? { owner: s2.owner, n: s2.n, cat: s2.cat, merc: s2.merc ?? 0 } : undefined);
  s.merc = undefined;
  s.n -= w.attackerLost;
  s.cat -= w.catLost ?? 0;
  if (s2) {
    s2.merc = undefined;
    s2.n -= w.alleato!.lost;
    s2.cat -= w.alleato!.catLost;
  }
  if (w.win) {
    s.wins += 1;
    if (s2) s2.wins += 1;
  }
  const camps = s2 ? [s, s2] : [s], tot = s.n + (s2?.n ?? 0);
  const leave = () => {
    st.assedi = (st.assedi ?? []).filter(x => !camps.includes(x));
    for (const x of camps) goHome(g, st, x.owner, x.n, x.cat, x.target);
  };
  if (w.win && falls(g, s.target, Math.max(s.wins, s2?.wins ?? 0))) {
    st.assedi = (st.assedi ?? []).filter(x => !camps.includes(x));
    conquer(g, s.owner, s.target, w, s2 ? { owner: s2.owner, quota: s2.n / Math.max(1, tot) } : undefined);
    leave();
  } else if (tot < WAR_MIN) {
    // troppo pochi per restare: si torna a casa
    leave();
  } else {
    w.siege = true;
  }
  publish(g, w);
  send(st, s.owner, { k: 'siege', war: w });
  if (s2) send(st, s2.owner, { k: 'siege', war: perAlleato(w) });
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

/** Si può proporre la pace a chi ci assedia? (null: sì, altrimenti il motivo) */
export function peaceBlock(g: Game, s: Siege): string | null {
  if (s.offerta) return `la vostra proposta attende la risposta di ${g.state.players[s.owner].name}`;
  if (s.rifiuto === g.state.q) return "la vostra proposta è stata respinta: se ne potrà fare un'altra l'anno prossimo";
  return null;
}

/**
 * L'assediato propone la pace al prezzo di oggi; paga solo se l'assediante
 * accetta. Un signore del computer risponde subito, un giocatore nel suo turno.
 */
export function offerPeace(g: Game, owner: number): ActionResult & { answered?: boolean; accepted?: boolean; price?: number } {
  const no = phaseIs(g, 'commercio', 'investimenti');
  if (no) return no;
  const st = ss(g), me = g.state.current, p = g.player;
  const s = siegesOn(st, me).find(x => x.owner === owner);
  if (!s) return { ok: false, reason: 'quel signore non vi assedia' };
  const block = peaceBlock(g, s);
  if (block) return { ok: false, reason: block };
  const price = peacePrice(s);
  if (!canSpend(p, price)) return { ok: false, reason: `servono ${price} scudi` };
  s.offerta = { q: g.state.q, price };
  note(g, me, 'peaceOffer', { attacker: owner, scudi: price });
  const bot = g.state.players[owner].bot;
  if (!bot) return { ok: true, answered: false, price };
  settlePeace(g, s, botAcceptsPeace(g, s, bot, roll(st)));
  return { ok: true, answered: true, accepted: !(st.assedi ?? []).includes(s), price };
}

/** L'assediante (il signore di turno) risponde alla proposta di pace di `target`. */
export function answerPeace(g: Game, target: number, accept: boolean): ActionResult & { paid?: boolean } {
  const st = ss(g), me = g.state.current;
  const s = siegesBy(st, me).find(x => x.target === target && x.offerta);
  if (!s) return { ok: false, reason: 'nessuna proposta di pace da quel feudo' };
  settlePeace(g, s, accept);
  return { ok: true, paid: !(st.assedi ?? []).includes(s) };
}

/** Pace accettata: l'assediato paga (se ancora può) e l'assedio finisce. Respinta: l'assedio continua. */
function settlePeace(g: Game, s: Siege, accept: boolean): void {
  const st = ss(g), d = g.state.players[s.target];
  const price = s.offerta!.price;
  s.offerta = undefined;
  if (accept && canSpend(d, price)) {
    d.scudi -= price;
    g.state.players[s.owner].scudi += price;
    st.assedi = (st.assedi ?? []).filter(x => x !== s);
    goHome(g, st, s.owner, s.n, s.cat, s.target);
    send(st, s.target, { k: 'peaceAnswer', by: s.owner, ok: true, scudi: price });
    note(g, s.target, 'peace', { attacker: s.owner, scudi: price });
    note(g, s.owner, 'peaceAccepted', { target: s.target, scudi: price });
    return;
  }
  // respinta, o accettata quando l'assediato non ha più di che pagare
  s.rifiuto = g.state.q;
  send(st, s.target, { k: 'peaceAnswer', by: s.owner, ok: false, scudi: price });
  note(g, s.target, 'peaceRefused', { attacker: s.owner, scudi: price });
}

// ---------------------------------------------------------------- trattati di pace

/** Durata dei trattati di pace, in anni (compreso quello in cui si firmano). */
export const TRATTATO_MIN = 2;
export const TRATTATO_MAX = 5;
/** Dono minimo che ripara un'offesa non vendicata, se il bottino è stato poco. */
export const RIPARAZIONE_MIN = 1000;

/** Un trattato di pace fra `a` e `b`, dall'anno `dal` all'anno `fino` compreso. */
export interface Trattato { a: number; b: number; dal: number; fino: number }
/** Una proposta di pace, con il dono già uscito dalle casse di chi propone. */
export interface PropostaTrattato { from: number; to: number; anni: number; dono: number; q: number }

const isPair = (x: number, y: number, i: number, j: number) => (x === i && y === j) || (x === j && y === i);
/** Il trattato in vigore fra i e j, se c'è. */
export const treatyOf = (g: Game, i: number, j: number) => (ss(g).trattati ?? []).find(t => isPair(t.a, t.b, i, j) && t.fino >= g.state.q);
/** Trattati in vigore del signore i. */
export const treatiesOf = (g: Game, i: number) => (ss(g).trattati ?? []).filter(t => (t.a === i || t.b === i) && t.fino >= g.state.q);
/** Proposte di pace in attesa fra i e j (in un senso o nell'altro). */
export const treatyOfferBetween = (st: SpadeState, i: number, j: number) => (st.proposte ?? []).find(x => isPair(x.from, x.to, i, j));
export const treatyOffersTo = (st: SpadeState, i: number) => (st.proposte ?? []).filter(x => x.to === i);
export const treatyOffersBy = (st: SpadeState, i: number) => (st.proposte ?? []).filter(x => x.from === i);

/** Assalti aperti da `a` contro `b` (un assedio conta una volta) e il bottino che ne ha portato via. */
function offese(st: SpadeState, a: number, b: number): { n: number; bottino: number } {
  // nell'attacco comune l'offesa è di tutti e due gli assalitori, ciascuno con il suo bottino
  const ws = st.wars.filter(w => w.defender === b && (w.attacker === a || w.alleato?.owner === a)).map(w => (w.attacker === a ? w : perAlleato(w)));
  return { n: ws.filter(w => (w.round ?? 1) === 1).length, bottino: ws.reduce((s, w) => s + w.scudi + INT(w.grano * 0.03), 0) };
}

/**
 * Il conto delle offese visto da `i` verso `j`: quanti assalti di `j` sono
 * rimasti senza risposta (positivo: `i` cerca vendetta; negativo: è `j` a
 * cercarla; zero: conti pari, nessuno ha assalito o il colpo è stato reso).
 * `bottino`: quanto gli assalti di `j` hanno portato via a `i`, se il conto è a suo sfavore.
 */
export function feud(g: Game, i: number, j: number): { conto: number; da: number; a: number; bottino: number } {
  const st = ss(g), da = offese(st, j, i), a = offese(st, i, j);
  // Dinastia: un ripudio subito è un'offesa in più da vendicare (e una fatta, per chi ha ripudiato)
  if (g.casusBelli(i, j)) da.n += 1;
  if (g.casusBelli(j, i)) a.n += 1;
  const conto = da.n - a.n;
  return { conto, da: da.n, a: a.n, bottino: conto > 0 ? Math.max(0, da.bottino - a.bottino) : 0 };
}

/** Dono che ripara le offese non vendicate di `j` verso `i` (0 a conti pari). */
export const reparation = (g: Game, i: number, j: number) => {
  const f = feud(g, i, j);
  return f.conto > 0 ? Math.max(RIPARAZIONE_MIN * f.conto, f.bottino) : 0;
};

/** Si può proporre la pace a `target`? (null: sì, altrimenti il motivo) */
export function treatyBlock(g: Game, target: number): string | null {
  const st = ss(g), me = g.state.current, ps = g.state.players;
  if (target === me || !ps[target] || !alive(g, target)) return 'scegliete il feudo di un altro signore';
  const t = treatyOf(g, me, target);
  if (t) return `siete già in pace con ${ps[target].name} fino al ${900 + t.fino}`;
  if (alleati(st, me, target)) return `siete alleati di ${ps[target].name}: l'alleanza vale già come pace`;
  const x = treatyOfferBetween(st, me, target);
  if (x) return x.from === me ? `la vostra proposta attende la risposta di ${ps[target].name}` : `${ps[target].name} vi ha già proposto la pace: rispondetegli`;
  if ((st.assedi ?? []).some(s => isPair(s.owner, s.target, me, target))) return "c'è un assedio fra voi: la pace si tratta al campo dell'assedio";
  return null;
}

/**
 * Propone a `target` un trattato di `anni` anni, con un dono in scudi che esce
 * subito dalle casse (e torna se la proposta è respinta). Un signore del
 * computer risponde subito, un giocatore nel suo turno.
 */
export function proposeTreaty(g: Game, target: number, anni: number, dono: number): ActionResult & { answered?: boolean; accepted?: boolean } {
  const no = phaseIs(g, 'commercio', 'investimenti');
  if (no) return no;
  const block = treatyBlock(g, target);
  if (block) return { ok: false, reason: block };
  if (!Number.isInteger(anni) || anni < TRATTATO_MIN || anni > TRATTATO_MAX) return { ok: false, reason: `un trattato dura da ${TRATTATO_MIN} a ${TRATTATO_MAX} anni` };
  const st = ss(g), me = g.state.current, p = g.player;
  if (!Number.isInteger(dono) || dono < 0) return { ok: false, reason: 'dono non valido' };
  if (dono > Math.max(0, p.scudi)) return { ok: false, reason: 'si dona solo il denaro che si possiede' };
  p.scudi -= dono;
  const x: PropostaTrattato = { from: me, to: target, anni, dono, q: g.state.q };
  (st.proposte ??= []).push(x);
  note(g, me, 'treatyOffer', { target, anni, dono });
  const bot = g.state.players[target].bot;
  if (!bot) return { ok: true, answered: false };
  const yes = botAcceptsTreaty(g, x, bot, roll(st));
  settleTreaty(g, x, yes);
  return { ok: true, answered: true, accepted: yes };
}

/** Il signore di turno risponde alla proposta di pace di `from`. */
export function answerTreaty(g: Game, from: number, accept: boolean): ActionResult & { fino?: number } {
  const st = ss(g), me = g.state.current;
  const x = (st.proposte ?? []).find(y => y.from === from && y.to === me);
  if (!x) return { ok: false, reason: 'nessuna proposta di pace da quel signore' };
  settleTreaty(g, x, accept);
  const t = accept ? treatyOf(g, me, from) : undefined;
  return { ok: true, ...(t ? { fino: t.fino } : {}) };
}

/**
 * Pace accettata: il dono passa a chi l'accetta, il trattato vale per `anni`
 * anni da quest'anno, e gli eserciti in marcia fra i due tornano indietro.
 * Respinta: il dono torna a chi l'ha offerto.
 */
function settleTreaty(g: Game, x: PropostaTrattato, accept: boolean): void {
  const st = ss(g), ps = g.state.players, q = g.state.q;
  st.proposte = (st.proposte ?? []).filter(y => y !== x);
  if (!accept || !alive(g, x.to)) {
    ps[x.from].scudi += x.dono;
    send(st, x.from, { k: 'treatyAnswer', by: x.to, ok: false, anni: x.anni, dono: x.dono });
    note(g, x.from, 'treatyRefused', { target: x.to, dono: x.dono });
    return;
  }
  ps[x.to].scudi += x.dono;
  const fino = q + x.anni - 1;
  (st.trattati ??= []).push({ a: x.from, b: x.to, dal: q, fino });
  for (const c of (st.campagne ?? []).filter(k => isPair(k.owner, k.target, x.from, x.to))) {
    const anni = Math.max(1, q - c.q);
    (st.marcia ??= []).push({ owner: c.owner, n: c.n, cat: c.cat, back: q + 1 + Math.max(0, q - c.q), anni, from: c.target });
    send(st, c.owner, { k: 'treatyRecall', target: c.target, n: c.n });
  }
  st.campagne = (st.campagne ?? []).filter(k => !isPair(k.owner, k.target, x.from, x.to));
  // un traditore mandato contro il nuovo alleato non ha più nulla da fare
  st.traditori = (st.traditori ?? []).filter(t => !isPair(t.owner, t.target, x.from, x.to));
  send(st, x.from, { k: 'treatyAnswer', by: x.to, ok: true, anni: x.anni, dono: x.dono, fino });
  note(g, x.from, 'treaty', { other: x.to, fino: 900 + fino, dono: x.dono, gave: 1 });
  note(g, x.to, 'treaty', { other: x.from, fino: 900 + fino, dono: x.dono, gave: 0 });
}

/**
 * Risposta di un signore del computer. Chi è stato assalito senza rendere il
 * colpo vuole vendetta: accetta solo un dono che ripari. A conti pari la pace
 * piace a tutti, tanto più con chi è forte; chi ha l'esercito in marcia contro
 * chi propone torna indietro solo se il dono vale il bottino, e il capofila
 * che corre troppo avanti non si lascia in pace per poco.
 */
function botAcceptsTreaty(g: Game, x: PropostaTrattato, level: string, rnd: () => number): boolean {
  const st = ss(g), me = x.to, ps = g.state.players;
  const f = feud(g, me, x.from), loot = lootOf(g, ps[x.from]);
  if (f.conto > 0) return level === 'facile' ? x.dono > 0 && rnd() < 0.5 : x.dono >= reparation(g, me, x.from);
  if (level === 'facile') return rnd() < 0.7;
  if (campaignsBy(st, me).some(c => c.target === x.from)) return x.dono >= loot * (level === 'difficile' ? 0.8 : 0.5);
  if (wealthIndex(ps[x.from]) > wealthIndex(ps[me]) * RIVAL_LEAD) return x.dono >= loot * 0.5;
  // chi propone e ha subito un'offesa senza renderla perdona: un buon affare
  if (f.conto < 0) return true;
  const strong = guessSoldiers(g, me, x.from) >= st.soldati[me] * 0.8;
  return level === 'medio' ? strong || x.dono > 0 || rnd() < 0.6 : strong || x.dono >= loot * 0.2;
}

/**
 * Inizio del turno: le proposte rimaste senza risposta decadono (il dono
 * torna), i trattati scaduti l'anno scorso si annunciano a entrambi.
 */
function treatyTurn(g: Game): void {
  const st = ss(g), me = g.state.current, q = g.state.q;
  for (const x of treatyOffersBy(st, me).filter(y => y.q < q)) {
    g.player.scudi += x.dono;
    st.proposte = (st.proposte ?? []).filter(y => y !== x);
    st.inbox.push({ k: 'treatyAnswer', by: x.to, ok: false, anni: x.anni, dono: x.dono, scaduta: true });
  }
  for (const t of (st.trattati ?? []).filter(k => (k.a === me || k.b === me) && k.fino === q - 1)) st.inbox.push({ k: 'treatyEnd', with: t.a === me ? t.b : t.a });
  st.trattati = (st.trattati ?? []).filter(t => t.fino >= q - 1);
}

/** Signori del computer: con un esercito più forte in arrivo, il medio e il difficile propongono la pace, se non cercano vendetta. */
function botTreaty(c: BotCtx): void {
  const { g, level, log } = c;
  if (level === 'facile') return;
  const st = ss(g), me = g.state.current, p = g.player;
  // solo gli eserciti che le sue torri hanno avvistato (entro la fine del turno), come per un giocatore
  for (const foe of [...new Set(towerAlerts(g, me, 'guerra').map(k => k.owner))]) {
    if (treatyBlock(g, foe) || feud(g, me, foe).conto > 0) continue;
    // l'esercito in marcia è segreto: si stima come per le difese, dai soldati noti e da quelli lontani
    const force = guessSoldiers(g, me, foe) + awayOf(st, foe) * 0.5;
    if (defenseOf(p, st.soldati[me], st.mura[me]) >= force * 1.2) continue;
    const dono = Math.floor(Math.min(Math.max(0, p.scudi) * 0.4, lootOf(g, p) * 0.8) / 50) * 50;
    const r = proposeTreaty(g, foe, 3, dono);
    if (r.ok) log.push(`propone la pace a ${g.state.players[foe].name} per 3 anni${dono ? ` con un dono di ${dono} scudi` : ''}${r.answered ? (r.accepted ? ': accettata' : ': respinta') : ''}`);
  }
}

/** Signori del computer: una proposta di pace ricevuta da un giocatore (rimasta in sospeso) ha subito risposta. */
function botAnswerTreaties(c: BotCtx): void {
  const { g, level, rnd, log } = c;
  for (const x of treatyOffersTo(ss(g), g.state.current)) {
    const yes = botAcceptsTreaty(g, x, level, rnd);
    settleTreaty(g, x, yes);
    log.push(yes ? `accetta la pace di ${g.state.players[x.from].name}` : `respinge la pace di ${g.state.players[x.from].name}`);
  }
}

// ---------------------------------------------------------------- alleanze

/**
 * Alleanze fra due signori (un solo alleato per volta), finché uno dei due non la rompe, senza costi.
 * - Gli alleati non si fanno guerra (l'alleanza vale come pace).
 * - Attacco comune: gli eserciti dei due alleati che arrivano alla fine dello stesso anno contro lo stesso
 *   feudo, per lo stesso scopo, combattono insieme (resolveBattles); perdite e bottino si dividono in
 *   proporzione ai soldati. Per il morale del nemico è una sola sconfitta.
 * - Aiuto in difesa: un signore chiede all'alleato i volontari che quello può arruolare quest'anno;
 *   l'alleato li arruola e paga le armi, chi chiede paga il soldo. Arrivano subito da un confinante,
 *   l'anno dopo da un feudo lontano, difendono il feudo alla chiusura di quell'anno e poi tornano a casa.
 *   Un mercante (Dinastia a vocazioni) non manda la milizia: manda scudi.
 * - A turno: chi ha ricevuto aiuto non può chiederne ancora finché l'alleato non è stato aiutato a sua volta.
 * - Rompere l'alleanza: i soldati mandati in aiuto e gli eserciti dell'attacco comune ancora in viaggio
 *   tornano indietro.
 */
export interface Alleanza {
  a: number;
  b: number;
  /** anno (q) della firma */
  dal: number;
  /** l'ultimo dei due che ha ricevuto aiuto in difesa (assente: nessuno ancora); non può chiederne finché non tocca all'altro */
  aiutato?: number;
}
export interface PropostaAlleanza { from: number; to: number; q: number }
/** `from` chiede a `to` `n` soldati (o il loro valore in scudi, se `to` è un mercante) */
export interface RichiestaAiuto { from: number; to: number; n: number; q: number }
/** soldati di `owner` in difesa del feudo `to`: combattono alla chiusura dell'anno `arrive`, poi tornano */
export interface Aiuto { owner: number; to: number; n: number; arrive: number }

/** Scudi che un mercante manda per ogni soldato chiesto: armi, soldo e un compenso per i mercenari. */
export const AIUTO_SCUDI = 10;

export const allianceOf = (st: SpadeState, i: number) => (st.alleanze ?? []).find(x => x.a === i || x.b === i);
/** L'alleato del signore `i`, o null. */
export const allyOf = (st: SpadeState, i: number): number | null => {
  const x = allianceOf(st, i);
  return x ? (x.a === i ? x.b : x.a) : null;
};
export const alleati = (st: SpadeState, i: number, j: number) => i !== j && allyOf(st, i) === j;
export const allianceOfferBetween = (st: SpadeState, i: number, j: number) => (st.proposteAlleanza ?? []).find(x => isPair(x.from, x.to, i, j));
export const allianceOffersTo = (st: SpadeState, i: number) => (st.proposteAlleanza ?? []).filter(x => x.to === i);
export const aidRequestsTo = (st: SpadeState, i: number) => (st.richieste ?? []).filter(x => x.to === i);
export const aidRequestBy = (st: SpadeState, i: number) => (st.richieste ?? []).find(x => x.from === i);
/** Aiuti in arrivo (o già arrivati) in difesa del feudo `i`. */
export const aidFor = (st: SpadeState, i: number) => (st.aiuti ?? []).filter(a => a.to === i);

/** Il signore manda scudi invece di soldati: la milizia di un mercante non lascia il feudo. */
const mandaScudi = (g: Game, i: number) => !!vietato(g.state.players[i], 'marcia');

/** Quanto può dare l'alleato `i` quest'anno: i volontari che può arruolare (e pagare), o il loro valore in scudi. */
export function aidRoom(g: Game, i: number): { soldati: number; scudi: number } {
  const p = g.state.players[i], room = recruitRoom(g, i);
  if (mandaScudi(g, i)) return { soldati: 0, scudi: Math.max(0, Math.min(room * AIUTO_SCUDI, Math.floor(p.scudi))) };
  return { soldati: Math.max(0, Math.min(room, Math.floor((p.scudi + p.credito) / RECRUIT_COST))), scudi: 0 };
}

/** Perché `me` non può chiedere aiuto ora (null: può). */
export function aidBlock(g: Game, me = g.state.current): string | null {
  const st = ss(g), x = allianceOf(st, me);
  if (!x) return 'non avete alleati';
  const ally = allyOf(st, me)!, ps = g.state.players;
  if (aidRequestBy(st, me)) return `avete già chiesto aiuto a ${ps[ally].name}: attendete la risposta`;
  if (x.aiutato === me) return `avete già ricevuto aiuto: ora tocca a ${ps[ally].name} essere aiutato, prima di poterlo chiedere di nuovo`;
  return null;
}

/** Perché `me` non può proporre l'alleanza a `target` (null: può). */
export function allianceBlock(g: Game, target: number, me = g.state.current): string | null {
  const st = ss(g), ps = g.state.players;
  if (target === me || !ps[target] || !alive(g, target)) return 'scegliete il feudo di un altro signore';
  if (alleati(st, me, target)) return `siete già alleati di ${ps[target].name}`;
  if (allyOf(st, me) !== null) return `avete già un alleato, ${ps[allyOf(st, me)!].name}: per allearvi con altri rompete prima l'alleanza`;
  if (allyOf(st, target) !== null) return `${ps[target].name} ha già un alleato`;
  const x = allianceOfferBetween(st, me, target);
  if (x) return x.from === me ? `la vostra proposta attende la risposta di ${ps[target].name}` : `${ps[target].name} vi ha già proposto l'alleanza: rispondetegli`;
  if ((st.proposteAlleanza ?? []).some(y => y.from === me)) return 'avete già proposto un\'alleanza: attendete la risposta';
  if ((st.assedi ?? []).some(s => isPair(s.owner, s.target, me, target)) || (st.campagne ?? []).some(c => isPair(c.owner, c.target, me, target))) return 'siete in guerra: prima fate la pace';
  return null;
}

/** Propone l'alleanza a `target`. Un signore del computer risponde subito, un giocatore nel suo turno. */
export function proposeAlliance(g: Game, target: number): ActionResult & { answered?: boolean; accepted?: boolean } {
  const no = phaseIs(g, 'commercio', 'investimenti');
  if (no) return no;
  const block = allianceBlock(g, target);
  if (block) return { ok: false, reason: block };
  const st = ss(g), me = g.state.current;
  const x: PropostaAlleanza = { from: me, to: target, q: g.state.q };
  (st.proposteAlleanza ??= []).push(x);
  const bot = g.state.players[target].bot;
  if (!bot) return { ok: true, answered: false };
  const yes = botAcceptsAlliance(g, x, bot, roll(st));
  settleAlliance(g, x, yes);
  return { ok: true, answered: true, accepted: yes };
}

/** Il signore di turno risponde alla proposta d'alleanza di `from`. */
export function answerAlliance(g: Game, from: number, accept: boolean): ActionResult {
  const st = ss(g), me = g.state.current;
  const x = (st.proposteAlleanza ?? []).find(y => y.from === from && y.to === me);
  if (!x) return { ok: false, reason: 'nessuna proposta d\'alleanza da quel signore' };
  if (accept && allyOf(st, me) !== null) return { ok: false, reason: 'avete già un alleato' };
  settleAlliance(g, x, accept);
  return { ok: true };
}

/** Alleanza firmata (gli eserciti in marcia fra i due tornano indietro, come per la pace) o respinta. */
function settleAlliance(g: Game, x: PropostaAlleanza, accept: boolean): void {
  const st = ss(g), q = g.state.q;
  st.proposteAlleanza = (st.proposteAlleanza ?? []).filter(y => y !== x);
  const ok = accept && alive(g, x.to) && alive(g, x.from) && allyOf(st, x.from) === null && allyOf(st, x.to) === null;
  send(st, x.from, { k: 'allianceAnswer', by: x.to, ok });
  if (!ok) {
    note(g, x.from, 'allianceRefused', { target: x.to });
    return;
  }
  (st.alleanze ??= []).push({ a: x.from, b: x.to, dal: q });
  // le altre proposte d'alleanza dei due decadono
  st.proposteAlleanza = st.proposteAlleanza.filter(y => ![x.from, x.to].includes(y.from) && ![x.from, x.to].includes(y.to));
  for (const c of (st.campagne ?? []).filter(k => isPair(k.owner, k.target, x.from, x.to))) {
    (st.marcia ??= []).push({ owner: c.owner, n: c.n, cat: c.cat, back: q + 1 + Math.max(0, q - c.q), anni: Math.max(1, q - c.q), from: c.target });
    send(st, c.owner, { k: 'treatyRecall', target: c.target, n: c.n });
  }
  st.campagne = (st.campagne ?? []).filter(k => !isPair(k.owner, k.target, x.from, x.to));
  st.traditori = (st.traditori ?? []).filter(t => !isPair(t.owner, t.target, x.from, x.to));
  note(g, x.from, 'alliance', { other: x.to });
  note(g, x.to, 'alliance', { other: x.from });
}

/**
 * Rompe l'alleanza del signore di turno: si torna come prima. I soldati mandati in aiuto (in viaggio o sul
 * posto) e gli eserciti dell'attacco comune ancora in marcia tornano indietro. Ritorna quanti soldati tornano.
 */
export function breakAlliance(g: Game): ActionResult & { tornano?: number } {
  const no = phaseIs(g, 'commercio', 'investimenti');
  if (no) return no;
  const st = ss(g), me = g.state.current, other = allyOf(st, me);
  if (other === null) return { ok: false, reason: 'non avete alleati' };
  const tornano = chiudiAlleanza(g, me, other);
  send(st, other, { k: 'allianceEnd', by: me, tornano });
  note(g, me, 'allianceEnd', { other, broke: 1 });
  note(g, other, 'allianceEnd', { other: me, broke: 0 });
  return { ok: true, tornano };
}

/** Scioglie l'alleanza fra `a` e `b`; i soldati in viaggio per l'alleanza tornano indietro. */
function chiudiAlleanza(g: Game, a: number, b: number): number {
  const st = ss(g), q = g.state.q;
  st.alleanze = (st.alleanze ?? []).filter(x => !isPair(x.a, x.b, a, b));
  st.richieste = (st.richieste ?? []).filter(x => !isPair(x.from, x.to, a, b));
  let tornano = 0;
  // gli aiuti dell'uno all'altro tornano a casa
  for (const x of (st.aiuti ?? []).filter(y => isPair(y.owner, y.to, a, b))) {
    (st.marcia ??= []).push({ owner: x.owner, n: x.n, back: q + 1, anni: 1, from: x.to });
    tornano += x.n;
  }
  st.aiuti = (st.aiuti ?? []).filter(y => !isPair(y.owner, y.to, a, b));
  // gli eserciti dell'attacco comune: i due marciano contro lo stesso feudo e arriverebbero insieme
  const comuni = (st.campagne ?? []).filter(c => (c.owner === a || c.owner === b)
    && (st.campagne ?? []).some(k => k !== c && k.owner === (c.owner === a ? b : a) && k.target === c.target && k.arrive === c.arrive));
  for (const c of comuni) {
    (st.marcia ??= []).push({ owner: c.owner, n: c.n, cat: c.cat, back: q + 1 + Math.max(0, q - c.q), anni: Math.max(1, q - c.q), from: c.target });
    if (c.owner !== g.state.current) send(st, c.owner, { k: 'treatyRecall', target: c.target, n: c.n });
    tornano += c.n;
  }
  st.campagne = (st.campagne ?? []).filter(c => !comuni.includes(c));
  return tornano;
}

/** Un feudo è caduto o il suo signore è uscito: le sue alleanze si sciolgono. */
function sciogliAlleanze(g: Game, i: number): void {
  const st = ss(g), other = allyOf(st, i);
  if (other !== null) chiudiAlleanza(g, i, other);
  st.proposteAlleanza = (st.proposteAlleanza ?? []).filter(x => x.from !== i && x.to !== i);
}

/**
 * Il signore di turno chiede aiuto in difesa all'alleato: `n` soldati (o, a un mercante, il loro valore in
 * scudi). Un signore del computer risponde subito, un giocatore nel suo turno.
 */
export function requestAid(g: Game, n: number): ActionResult & { answered?: boolean; accepted?: boolean; sent?: number; scudi?: number; arrive?: number } {
  const no = phaseIs(g, 'commercio', 'investimenti');
  if (no) return no;
  const block = aidBlock(g);
  if (block) return { ok: false, reason: block };
  if (!isCount(n)) return { ok: false, reason: 'numero non valido' };
  const st = ss(g), me = g.state.current, ally = allyOf(st, me)!;
  const room = aidRoom(g, ally);
  const max = mandaScudi(g, ally) ? Math.floor(room.scudi / AIUTO_SCUDI) : room.soldati;
  if (n > max) return { ok: false, reason: max > 0 ? `${g.state.players[ally].name} può darvi al più ${max} soldati quest'anno` : `${g.state.players[ally].name} quest'anno non ha uomini da mandarvi` };
  const x: RichiestaAiuto = { from: me, to: ally, n, q: g.state.q };
  (st.richieste ??= []).push(x);
  const bot = g.state.players[ally].bot;
  if (!bot) return { ok: true, answered: false };
  const yes = botGrantsAid(g, x, bot, roll(st));
  const r = settleAid(g, x, yes);
  return { ok: true, answered: true, accepted: r.ok, sent: r.n, scudi: r.scudi, arrive: r.arrive };
}

/** Il signore di turno risponde alla richiesta d'aiuto del suo alleato `from`. */
export function answerAid(g: Game, from: number, accept: boolean): ActionResult & { sent?: number; scudi?: number; arrive?: number } {
  const st = ss(g), me = g.state.current;
  const x = (st.richieste ?? []).find(y => y.from === from && y.to === me);
  if (!x) return { ok: false, reason: 'nessuna richiesta d\'aiuto da quel signore' };
  const r = settleAid(g, x, accept);
  return { ok: true, sent: r.n, scudi: r.scudi, arrive: r.arrive };
}

/**
 * L'alleato manda (o nega) l'aiuto. Con i suoi volontari di quest'anno, armati a sue spese: partono subito
 * e arrivano alla fine di quest'anno da un confinante, del prossimo da un feudo lontano; chi li riceve paga
 * il soldo. Un mercante manda scudi. L'aiuto dato (anche solo in parte) fa passare il turno dell'aiuto all'altro.
 */
function settleAid(g: Game, x: RichiestaAiuto, accept: boolean): { ok: boolean; n: number; scudi: number; arrive?: number } {
  const st = ss(g), ps = g.state.players, q = g.state.q, helper = ps[x.to], helped = ps[x.from];
  st.richieste = (st.richieste ?? []).filter(y => y !== x);
  const alliance = (st.alleanze ?? []).find(y => isPair(y.a, y.b, x.from, x.to));
  const no = () => {
    send(st, x.from, { k: 'aidAnswer', by: x.to, ok: false, n: x.n, scudi: 0 });
    return { ok: false, n: 0, scudi: 0 };
  };
  if (!accept || !alliance || !alive(g, x.from) || !alive(g, x.to)) return no();
  const room = aidRoom(g, x.to);
  if (mandaScudi(g, x.to)) {
    const scudi = Math.min(x.n * AIUTO_SCUDI, room.scudi);
    if (scudi <= 0) return no();
    helper.scudi -= scudi;
    helped.scudi += scudi;
    alliance.aiutato = x.from;
    send(st, x.from, { k: 'aidAnswer', by: x.to, ok: true, n: 0, scudi });
    note(g, x.to, 'aidSent', { other: x.from, n: 0, scudi });
    note(g, x.from, 'aidGot', { other: x.to, n: 0, scudi });
    return { ok: true, n: 0, scudi };
  }
  const k = Math.min(x.n, room.soldati);
  if (k <= 0) return no();
  // l'alleato arruola i suoi volontari dell'anno e paga le armi; chi riceve l'aiuto paga il soldo
  const l = levyOf(g, x.to);
  helper.servi -= k;
  helper.scudi -= k * RECRUIT_COST;
  (st.leve ??= ps.map(() => null))[x.to] = { q, n: l.n + k, leve: l.leve };
  helped.scudi -= k * SOLDO;
  const arrive = q + travelYears(g, x.to, x.from) - 1;
  (st.aiuti ??= []).push({ owner: x.to, to: x.from, n: k, arrive });
  alliance.aiutato = x.from;
  send(st, x.from, { k: 'aidAnswer', by: x.to, ok: true, n: k, scudi: 0, arrive });
  note(g, x.to, 'aidSent', { other: x.from, n: k, scudi: 0 });
  note(g, x.from, 'aidGot', { other: x.to, n: k, scudi: 0 });
  return { ok: true, n: k, scudi: 0, arrive };
}

/** Inizio del turno: le proposte d'alleanza e le richieste d'aiuto rimaste senza risposta decadono. */
function allianceTurn(g: Game): void {
  const st = ss(g), me = g.state.current, q = g.state.q;
  for (const x of (st.proposteAlleanza ?? []).filter(y => y.from === me && y.q < q)) st.inbox.push({ k: 'allianceAnswer', by: x.to, ok: false, scaduta: true });
  st.proposteAlleanza = (st.proposteAlleanza ?? []).filter(y => !(y.from === me && y.q < q));
  for (const x of (st.richieste ?? []).filter(y => y.from === me && y.q < q)) st.inbox.push({ k: 'aidAnswer', by: x.to, ok: false, n: x.n, scudi: 0, scaduta: true });
  st.richieste = (st.richieste ?? []).filter(y => !(y.from === me && y.q < q));
}

/**
 * Signori del computer: accettano l'alleanza se non hanno conti aperti con chi la propone e non è un
 * capofila che corre troppo avanti; il facile spesso, il medio volentieri, il difficile se gli serve.
 */
function botAcceptsAlliance(g: Game, x: PropostaAlleanza, level: string, rnd: () => number): boolean {
  const st = ss(g), me = x.to, ps = g.state.players;
  if (allyOf(st, me) !== null) return false;
  if (feud(g, me, x.from).conto > 0) return false;
  if (level === 'facile') return rnd() < 0.6;
  if (wealthIndex(ps[x.from]) > wealthIndex(ps[me]) * RIVAL_LEAD) return false;
  if (level === 'medio') return rnd() < 0.75;
  // il difficile si allea quando teme qualcuno, o con chi è forte
  const threatened = recentlyAttacked(st, me, g.state.q) > 0 || threatOf(g, me) > st.soldati[me];
  return threatened || guessSoldiers(g, me, x.from) >= st.soldati[me] * 0.7 || rnd() < 0.4;
}

/** Signori del computer: mandano l'aiuto chiesto se non hanno la guerra alle porte. */
function botGrantsAid(g: Game, x: RichiestaAiuto, level: string, rnd: () => number): boolean {
  if (warLooms(g, x.to)) return false;
  if (level === 'facile') return rnd() < 0.6;
  return level === 'medio' ? rnd() < 0.85 : true;
}

/** Signori del computer: rispondono alle proposte d'alleanza e alle richieste d'aiuto rimaste in sospeso. */
function botAnswerAlliances(c: BotCtx): void {
  const { g, level, rnd, log } = c;
  const st = ss(g), me = g.state.current, ps = g.state.players;
  for (const x of allianceOffersTo(st, me)) {
    const yes = botAcceptsAlliance(g, x, level, rnd);
    settleAlliance(g, x, yes);
    log.push(yes ? `accetta l'alleanza di ${ps[x.from].name}` : `respinge l'alleanza di ${ps[x.from].name}`);
  }
  for (const x of aidRequestsTo(st, me)) {
    const r = settleAid(g, x, botGrantsAid(g, x, level, rnd));
    log.push(r.ok ? `manda aiuto a ${ps[x.from].name}: ${r.n ? `${r.n} soldati` : `${r.scudi} scudi`}` : `nega l'aiuto a ${ps[x.from].name}`);
  }
}

/**
 * Signori del computer: il medio e il difficile cercano un alleato fra chi non ha conti aperti con loro,
 * preferendo il più forte (un capofila troppo avanti no); una proposta ogni tanto.
 */
function botAlliance(c: BotCtx): void {
  const { g, level, rnd, log } = c;
  if (level === 'facile' || g.state.q < 3) return;
  const st = ss(g), me = g.state.current, ps = g.state.players;
  if (allyOf(st, me) !== null || (st.proposteAlleanza ?? []).some(x => x.from === me)) return;
  if (rnd() >= (level === 'difficile' ? 0.35 : 0.2)) return;
  const pool = others(g, me).filter(i => !allianceBlock(g, i) && feud(g, me, i).conto <= 0 && feud(g, i, me).conto <= 0
    && wealthIndex(ps[i]) <= wealthIndex(ps[me]) * RIVAL_LEAD);
  if (!pool.length) return;
  const best = pool.sort((a, b) => guessSoldiers(g, me, b) - guessSoldiers(g, me, a))[0];
  const r = proposeAlliance(g, best);
  if (r.ok) log.push(`propone l'alleanza a ${ps[best].name}${r.answered ? (r.accepted ? ': accettata' : ': respinta') : ''}`);
}

/**
 * Signori del computer: l'alleato marcia contro un feudo e il bot può arrivarci nello stesso anno: si unisce
 * all'attacco comune, con lo stesso scopo, lasciando una guarnigione.
 */
function botJoinAlly(c: BotCtx): void {
  const { g, level, log } = c;
  if (level === 'facile') return;
  const st = ss(g), me = g.state.current, ally = allyOf(st, me), q = g.state.q;
  if (ally === null || st.lastWar[me] === q || vietato(g.player, 'marcia')) return;
  const sent = Math.floor(st.soldati[me] * 0.7);
  if (sent < WAR_MIN) return;
  for (const k of campaignsBy(st, ally)) {
    if (k.arrive !== q + travelYears(g, me, k.target) || !alive(g, k.target) || k.target === me) continue;
    const goal = k.goal === 'distruzione' && q >= DESTROY_FROM_Q ? 'distruzione' : 'bottino';
    if (goal !== k.goal) continue;
    const r = declareWar(g, k.target, sent, goal);
    if (r.ok) {
      log.push(`si unisce all'attacco di ${g.state.players[ally].name} contro ${g.state.players[k.target].name} con ${sent} soldati`);
      return;
    }
  }
}

/** Signori del computer: con un esercito avvistato più forte delle difese, chiedono aiuto all'alleato. */
function botAskAid(c: BotCtx): void {
  const { g, level, log } = c;
  if (level === 'facile') return;
  const st = ss(g), me = g.state.current, p = g.player, ally = allyOf(st, me);
  if (ally === null || aidBlock(g)) return;
  const seen = towerAlerts(g, me, 'guerra');
  const foe = seen.reduce((a, k) => a + guessSoldiers(g, me, k.owner) + awayOf(st, k.owner) * 0.5, 0) + siegesOn(st, me).reduce((a, s) => a + s.n, 0);
  if (!foe) return;
  const def = defenseOf(p, st.soldati[me] + aidAtOf(st, me, g.state.q + 1), st.mura[me]);
  if (def >= foe * 1.1) return;
  const room = aidRoom(g, ally);
  const max = room.soldati || Math.floor(room.scudi / AIUTO_SCUDI);
  const n = Math.min(max, Math.ceil((foe * 1.1 - def) / (1 + WALL_BONUS * st.mura[me])));
  if (n <= 0) return;
  const r = requestAid(g, n);
  if (r.ok) log.push(`chiede aiuto a ${g.state.players[ally].name}${r.answered ? (r.accepted ? `: ${r.sent ? `${r.sent} soldati` : `${r.scudi} scudi`}` : ': negato') : ''}`);
}

// ---------------------------------------------------------------- carte di guerra (carte.ts)

/** Si può giocare la carta? (null: sì, altrimenti il motivo) */
function cardBlock(g: Game, id: CartaGuerra['id']): string | null {
  const st = ss(g), me = g.state.current;
  const no = phaseIs(g, 'commercio', 'investimenti');
  if (no && !no.ok) return no.reason;
  const c = cardOf(st, me, id);
  if (!c || g.state.q > scadenzaCarta(c)) return 'non avete questa carta';
  if (playedThisYear(g, st, me)) return "quest'anno avete già giocato una carta";
  return null;
}

const played = (g: Game, id: CartaGuerra['id']) => {
  const st = ss(g), me = g.state.current;
  discard(st, me, id);
  (st.giocata ??= g.state.players.map(() => -1))[me] = g.state.q;
};

/** Costo della compagnia di ventura in mano (0 se non c'è). */
export const mercCost = (g: Game) => (cardOf(ss(g), g.state.current, 'mercenari')?.n ?? 0) * MERC_PAGA;

/** Mercenari: la compagnia si paga ora e si accampa nel fortino fino alla scadenza della carta. */
export function hireMercs(g: Game): ActionResult & { n?: number } {
  const block = cardBlock(g, 'mercenari');
  if (block) return { ok: false, reason: block };
  const st = ss(g), me = g.state.current, p = g.player;
  const c = cardOf(st, me, 'mercenari')!;
  const cost = c.n! * MERC_PAGA;
  if (!canSpend(p, cost)) return { ok: false, reason: `la compagnia vuole ${cost} scudi` };
  p.scudi -= cost;
  (st.mercenari ??= g.state.players.map(() => null))[me] = { n: mercsOf(g, st, me) + c.n!, until: scadenzaCarta(c) };
  played(g, 'mercenari');
  note(g, me, 'mercHired', { n: c.n!, scudi: cost });
  return { ok: true, n: c.n };
}

/** Feudi dove il traditore può lavorare: quelli contro cui marcia o che assedia un esercito del signore. */
export function traitorTargets(g: Game, i = g.state.current): number[] {
  const st = ss(g);
  return [...new Set([...campaignsBy(st, i).map(c => c.target), ...siegesBy(st, i).map(s => s.target)])].filter(t => alive(g, t));
}

/** Il traditore: aprirà una porta di `target` al prossimo assalto (se non fa il doppio gioco). */
export function playTraitor(g: Game, target: number): ActionResult {
  const block = cardBlock(g, 'traditore');
  if (block) return { ok: false, reason: block };
  const st = ss(g), me = g.state.current;
  if (!traitorTargets(g).includes(target)) return { ok: false, reason: "serve un vostro esercito in marcia o all'assedio contro quel feudo" };
  const c = cardOf(st, me, 'traditore')!;
  (st.traditori ??= []).push({ owner: me, target, doppio: !!c.doppio });
  played(g, 'traditore');
  // segreto: non va nella cronaca prima dell'assalto
  return { ok: true };
}

/** Tregua di Dio: nessuno combatte contro il feudo alla chiusura di quest'anno. */
export function invokeTruce(g: Game): ActionResult {
  const block = cardBlock(g, 'tregua');
  if (block) return { ok: false, reason: block };
  const st = ss(g), me = g.state.current;
  (st.tregue ??= g.state.players.map(() => -1))[me] = g.state.q;
  played(g, 'tregua');
  note(g, me, 'truce', {});
  return { ok: true };
}

/** Carte di guerra di un signore del computer: una per turno, quando servono. */
function botCards(c: BotCtx): void {
  const { g, level, rnd, log } = c;
  const st = ss(g), me = g.state.current, p = g.player;
  if (!handOf(st, me).length || playedThisYear(g, st, me)) return;
  const threatened = siegesOn(st, me).length > 0 || towerAlerts(g, me, 'dispendimenti').length > 0;
  // tregua: sotto un assedio che non si regge, o con un esercito avvistato e poca difesa
  if (cardOf(st, me, 'tregua') && threatened) {
    const foe = Math.max(0, ...siegesOn(st, me).map(s => s.n), ...towerAlerts(g, me, 'dispendimenti').map(x => x.n));
    const weak = defenseOf(p, st.soldati[me] + mercsOf(g, st, me), st.mura[me]) < foe * (level === 'difficile' ? 1.2 : 1);
    if ((weak || level === 'facile') && invokeTruce(g).ok) return void log.push('invoca la tregua di Dio');
  }
  // mercenari: contro una minaccia, o per una campagna che si prepara
  if (cardOf(st, me, 'mercenari') && (threatened || planOf(st, me, g.state.q) || rnd() < (level === 'facile' ? 0.2 : 0.05))) {
    if (p.scudi - mercCost(g) >= (level === 'difficile' ? 800 : 300)) {
      const r = hireMercs(g);
      if (r.ok) return void log.push(`assolda ${r.n} mercenari`);
    }
  }
  // traditore: sul primo feudo contro cui marcia o che assedia
  const t = traitorTargets(g)[0];
  if (cardOf(st, me, 'traditore') && t !== undefined && playTraitor(g, t).ok) log.push(`manda un traditore fra le mura di ${g.state.players[t].name}`);
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

/** Esercito che il signore sta radunando per una campagna (null: nessuno, o rinunciato dopo PLAN_YEARS anni). */
function planOf(st: SpadeState, me: number, q: number): { q: number; n: number } | null {
  const pl = st.piani?.[me];
  return pl && q - pl.q < PLAN_YEARS ? pl : null;
}

function setPlan(g: Game, me: number, pl: { q: number; n: number } | null): void {
  (ss(g).piani ??= g.state.players.map(() => null))[me] = pl;
}

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
  // con il tesoro pieno ci si fortifica comunque: il difficile fino a quattro cerchie, il medio tre, il facile una
  const rich = p.scudi - MURA_COST >= reserve + RICH_WALLS;
  // le cerchie in costruzione contano: saranno pronte a fine anno
  const muri = muraTotaliOf(st, me);
  const wantWalls = muraNuoveOf(st, me) === 0 && (
    level === 'difficile' ? defense < threat * (hit ? 1.3 : 0.9) || (rich && muri < 4)
    : level === 'medio' ? (hit > 0 && muri < 3) || (defense < threat * 0.6 && muri < 2) || (rich && muri < 3)
    : (hit > 0 ? rnd() < 0.4 : rnd() < 0.05) || (rich && muri < 1));
  if (wantWalls && muri < MURA_MAX && p.scudi - MURA_COST >= reserve && buildWall(g).ok) log.push(`innalza la ${muraTotaliOf(st, me)}ª cerchia di mura`);
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
    if (!pay || p.scudi < peacePrice(s) + 300 || peaceBlock(g, s)) continue;
    const price = peacePrice(s), foe = g.state.players[s.owner].name;
    const r = offerPeace(g, s.owner);
    if (r.ok) log.push(!r.answered ? `propone la pace a ${foe} per ${price} scudi` : r.accepted ? `compra la pace da ${foe} per ${price} scudi` : `propone la pace a ${foe}, che la respinge`);
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

/** anni d'assedio che il difficile mette nel conto, e quanto vale un anno dopo l'altro (il futuro è incerto) */
const PEACE_HORIZON = 6;
const PEACE_DISCOUNT = 0.85;
/** valore di un servo conquistato, in scudi: lavora e paga gabelle */
const SERVO_VALUE = 5;

/**
 * Quanto vale, in scudi, continuare l'assedio: anno per anno, con la
 * probabilità di vincere l'assalto, il bottino di ogni vittoria e la
 * conquista quando arrivano le vittorie che mancano; meno il soldo e la
 * malattia del campo. Gli anni lontani contano meno.
 */
function siegeValue(g: Game, s: Siege, chance: number): number {
  const d = g.state.players[s.target], p = g.state.players[s.owner];
  const prezzo = g.state.scalars.prezzo || 30;
  const need = Math.max(1, siegeNeed(g, s.target) - s.wins);
  // a ogni vittoria: scudi e grano che i soldati possono portar via, finché ce ne sono
  const perWin = Math.min(Math.max(0, d.scudi), s.n * LOOT_SCUDI) + (Math.min(d.grano * 0.5, s.n * LOOT_GRANO) * prezzo) / 1000;
  const prize = Math.max(0, d.scudi) + Math.min(Math.max(0, d.acri), MAX_ACRI - p.acri) * (COSTS.terre / ACRI_PER_ACQUISTO)
    + Math.max(0, d.servi) * CONQUEST_SERVI * SERVO_VALUE;
  const upkeep = s.n * SOLDO + s.cat * CATAPULT_UPKEEP + s.n * SIEGE_ATTRITION * 0.75 * RECRUIT_COST;
  // dist[k]: probabilità di avere ancora k vittorie da ottenere (il feudo non è ancora caduto)
  let dist = new Map([[need, 1]]);
  let value = 0, w = 1, loot = 0;
  for (let y = 0; y < PEACE_HORIZON && dist.size; y++) {
    const next = new Map<number, number>();
    for (const [k, pr] of dist) {
      value -= w * pr * upkeep;
      // il bottino non supera il tesoro del feudo
      const gain = Math.min(perWin, Math.max(0, d.scudi - loot));
      value += w * pr * chance * gain;
      if (k === 1) value += w * pr * chance * prize;
      else next.set(k - 1, (next.get(k - 1) ?? 0) + pr * chance);
      next.set(k, (next.get(k) ?? 0) + pr * (1 - chance));
    }
    loot += perWin * chance;
    dist = next;
    w *= PEACE_DISCOUNT;
  }
  return value;
}

/**
 * Un signore del computer davanti a una proposta di pace. Il facile accetta
 * quasi sempre, il medio se l'assalto è incerto; il difficile fa i conti:
 * accetta se gli scudi offerti valgono più di quanto renderebbe continuare.
 */
function botAcceptsPeace(g: Game, s: Siege, level: string, rnd: () => number): boolean {
  const st = ss(g), d = g.state.players[s.target];
  const chance = winChance(s.n, defenseOf(d, st.soldati[s.target], st.mura[s.target], s.cat), rnd);
  if (level === 'facile') return rnd() < 0.7;
  if (level === 'medio') return chance < 0.6 || rnd() < 0.25;
  return s.offerta!.price >= siegeValue(g, s, chance);
}

/** L'assedio continua solo se l'assalto ha buone speranze. */
function botSiege(c: BotCtx): void {
  const { g, level, rnd, log } = c;
  const st = ss(g), me = g.state.current;
  // una proposta di pace rimasta in sospeso (per esempio da un salvataggio): si risponde subito
  for (const s of siegesBy(st, me).filter(x => x.offerta)) {
    const price = s.offerta!.price, foe = g.state.players[s.target].name;
    const yes = botAcceptsPeace(g, s, level, rnd);
    settlePeace(g, s, yes);
    log.push(yes ? `accetta la pace da ${foe} per ${price} scudi` : `respinge la pace offerta da ${foe}`);
  }
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
  // in pace con chi ha un trattato, o con chi attende la risposta a una proposta
  const busy = new Set([...siegesBy(st, me).map(s => s.target), ...campaignsBy(st, me).map(c => c.target),
    ...live.filter(i => treatyOf(g, me, i) || treatyOfferBetween(st, me, i)?.from === me)]);
  // Dinastia: un parente si attacca solo dopo aver sciolto tutte le nozze che legano le casate, e solo se tocca a noi scioglierle
  const din = g.state.dinastia;
  const breakable = (i: number) => !!din?.persone && level !== 'facile' && legami(din, me, i).every(m => ripudiabili(din, me).includes(m));
  for (const i of live) if (g.parenti(me, i) && !breakable(i)) busy.add(i);
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
    // più è facile la vittoria, più è probabile che la tenti; se sta già radunando l'esercito, va avanti
    const easy = Math.min(1, room / Math.max(1, t.defense * 1.3) - 1);
    if (!planOf(st, me, g.state.q) && rnd() > (t.leader || t.foe ? 0.35 : 0.2) + 0.3 * easy) return;
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
  // un parente si attacca solo se è un rivale che corre troppo avanti: vale il ripudio
  const kin = g.parenti(me, t.i);
  if (kin && !rival(t)) return;
  // si arruola solo se la vittoria è probabile e la campagna si può pagare
  // Dinastia: un signore vecchio, o senza un erede adulto, attacca solo a vittoria quasi certa
  const careful = level !== 'facile' && prudente(g.state, me);
  if (level !== 'facile' && winChance(wanted, t.defense, rnd) < (careful ? 0.9 : level === 'difficile' ? 0.75 : 0.6)) return;
  const need = Math.max(0, wanted - st.soldati[me]);
  if (p.scudi < need * RECRUIT_COST + t.buy * CATAPULT_COST + wanted * CAMPAIGN_COST + (level === 'medio' ? 300 : 500)) return;
  if (t.buy && !buildCatapults(g, t.buy).ok) return;
  if (t.buy) log.push(`costruisce ${t.buy} catapulte`);
  // i volontari sono pochi: un esercito grande si mette insieme in più anni, e intanto non si congeda
  if (need > recruitRoom(g)) {
    const k = recruitRoom(g);
    setPlan(g, me, { q: planOf(st, me, g.state.q)?.q ?? g.state.q, n: wanted });
    if (k > 0 && recruit(g, k).ok) log.push(`arruola ${k} soldati (pochi volontari: la campagna aspetta)`);
    return;
  }
  if (need && !recruit(g, need).ok) return;
  if (need) log.push(`arruola ${need} soldati`);
  const merc = warLooms(g, me) ? 0 : mercsOf(g, st, me);
  if (kin && din) {
    for (const m of legami(din, me, t.i)) g.ripudia(m.id);
    log.push(`ripudia le nozze con la casata di ${ps[t.i].name} per muovergli guerra`);
  }
  const r = declareWar(g, t.i, Math.min(wanted, st.soldati[me]), goal, Math.min(t.cat, catapultsOf(st, me)), merc);
  if (r.ok && r.campaign) {
    setPlan(g, me, null);
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
  const keep = Math.max(
    besieged ? Math.ceil(threat * 1.1) : recentlyAttacked(st, me, g.state.q) ? Math.ceil(threat * (level === 'difficile' ? 0.8 : 0.5)) : 0,
    // l'esercito che si sta radunando per una campagna resta sotto le armi
    planOf(st, me, g.state.q)?.n ?? 0,
  );
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
      muraNuove: state.players.map(() => 0),
      lastWar: state.players.map(() => -1),
      lastDrive: state.players.map(() => -1),
      spia: state.players.map(() => -1),
      wars: [],
      mail: [],
      inbox: [],
      rng: [h],
    };
  },

  addPlayer(state, i) {
    growPerPlayer(state.ext as SpadeState, i, {
      mura: () => 0, muraNuove: () => 0, soldati: () => 0, catapulte: () => 0, torri: () => 0, lastWar: () => -1, lastDrive: () => -1, spia: () => -1,
      leve: () => null, giocata: () => -1, mercenari: () => null, tregue: () => -1, piani: () => null, carte: () => [],
    });
  },

  // mazzo dell'espansione: ogni carta che il signore non ha già in mano (traditore e tregua solo con altri signori)
  deck(g) {
    const st = ss(g), me = g.state.current, rivals = others(g, me).length > 0;
    return CARTE_ID.filter(id => !cardOf(st, me, id) && (id === 'mercenari' || rivals)).map(id => ({ id: CARTA_EVENT[id], w: CARTA_PESO }));
  },

  onCard(g, id) {
    const st = ss(g), me = g.state.current, card = cartaOfEvent(id);
    if (!card) return;
    const c = drawCard(g, st, me, card, roll(st));
    note(g, me, 'cardDrawn', { card: CARTE_ID.indexOf(card), n: c.n ?? 0 });
  },

  onTurnStart(g) {
    const st = ss(g), me = g.state.current;
    for (const id of expireCards(g, st, me)) note(g, me, 'cardLost', { card: CARTE_ID.indexOf(id) });
    st.inbox = st.mail.filter(m => m.to === me).map(m => m.d);
    st.mail = st.mail.filter(m => m.to !== me);
    treatyTurn(g);
    allianceTurn(g);
    // le schiere che arrivano a casa: la malattia ne ha portati via fino al 5% per anno di viaggio
    const home = (st.marcia ?? []).filter(m => m.owner === me && m.back <= g.state.q);
    if (home.length) {
      const rnd = roll(st);
      for (const m of home) {
        const lost = INT(m.n * MARCH_SICKNESS * m.anni * rnd());
        st.soldati[me] += m.n - lost;
        if (m.cat) (st.catapulte ??= g.state.players.map(() => 0))[me] = catapultsOf(st, me) + m.cat;
        st.inbox.push({ k: 'returned', n: m.n - lost, lost, anni: m.anni, from: m.from, cat: m.cat ?? 0, ...(m.franchi ? { franchi: true } : {}) });
        note(g, me, 'returned', { n: m.n - lost, lost, anni: m.anni, from: m.from, ...(m.franchi ? { franchi: 1 } : {}) });
      }
      st.marcia = st.marcia!.filter(m => !home.includes(m));
    }
  },

  // Dinastia: l'erede si trasferisce: mura e torri restano ai fratelli, e chi assediava la città vecchia torna a casa
  onTrasferimento(g, i, da) {
    const st = ss(g);
    st.mura[i] = 0;
    if (st.muraNuove) st.muraNuove[i] = 0;
    if (st.torri) st.torri[i] = 0;
    for (const s of siegesOn(st, i)) {
      goHome(g, st, s.owner, s.n, s.cat, i);
      send(st, s.owner, { k: 'lifted', by: i });
    }
    st.assedi = (st.assedi ?? []).filter(s => s.target !== i);
    void da;
  },

  // Dinastia: niente nozze fra signori in guerra (assedio, eserciti in marcia)
  ostili(g, i, j) {
    const st = ss(g);
    return (st.assedi ?? []).some(s => isPair(s.owner, s.target, i, j)) || (st.campagne ?? []).some(c => isPair(c.owner, c.target, i, j));
  },

  onEvent(g, eventId, outcome) {
    const st = ss(g), me = g.state.current, p = g.player;
    // i mercenari del fortino hanno combattuto contro l'orda: se ne vanno
    if (factionOfEvent(eventId) && outcome.win !== undefined && st.mercenari?.[me]) st.mercenari[me] = null;
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
  // in guerra il denaro costa di più
  usuryExtra: g => warUsury(g, g.state.current),

  // cigno nero: in guerra il grande esercito è enorme, perché i principi hanno soldati e mura
  cignoNero: 4,

  // cigno nero, la leva dei Franchi: gli uomini partono per la guerra contro gli Ungari; dopo LEVA_ANNI
  // anni ne torna a casa una parte (dal 50 all'80%), come una schiera che rientra da una campagna
  leva: {
    soldati: g => ss(g).soldati[g.state.current],
    parti(g, dalFortino, totale) {
      const st = ss(g), me = g.state.current;
      st.soldati[me] -= dalFortino;
      const tornano = INT(totale * (LEVA_RITORNO[0] + (LEVA_RITORNO[1] - LEVA_RITORNO[0]) * roll(st)()));
      (st.marcia ??= []).push({ owner: me, n: tornano, back: g.state.q + LEVA_ANNI, anni: 0, from: me, franchi: true });
      note(g, me, 'leva', { n: totale, servi: totale - dalFortino });
    },
  },

  factionDefense(g) {
    const st = ss(g), me = g.state.current;
    return { soldati: (st.soldati[me] + mercsOf(g, st, me)) * SOLDIER_VS_HORDE, mura: 1 + WALL_VS_HORDE * st.mura[me] };
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
    // il soldo spetta anche a chi è lontano (non a chi è in aiuto a un alleato: lo paga lui); le catapulte vogliono manutenzione
    const army = st.soldati[me] + awayOf(st, me) - aidAwayOf(st, me);
    const cat = catapultsOf(st, me) + catAwayOf(st, me);
    const soldo = army * SOLDO + cat * CATAPULT_UPKEEP;
    if (soldo > 0) {
      p.scudi -= soldo;
      note(g, me, 'army', { soldati: army, soldo, mura: st.mura[me], cat });
    }
  },

  // tutte le battaglie dell'anno si combattono quando tutti hanno giocato; poi le mura nuove sono pronte
  onYearClose(g) {
    resolveBattles(g);
    rimandaAiuti(g);
    completaMura(ss(g));
  },

  // saldo dei cittadini: chi subisce un assalto perde gente, la lunga pace ne attira
  migrazione: g => [vocePace(ss(g), g.state.current, g.state.q)],

  botBeforeTrade: botBrigands,

  // Dinastia: casata madre e rami cadetti si prestano soldati, al più metà di quelli nel fortino di chi presta
  prestiti: {
    beni: ['soldati'],
    ha: (g, i) => ss(g).soldati[i] ?? 0,
    limite: (g, _chi, a) => Math.floor((ss(g).soldati[a] ?? 0) / 2),
    sposta(g, da, a, _bene, qty) {
      const st = ss(g);
      st.soldati[da] -= qty;
      st.soldati[a] += qty;
    },
    dispaccio: (g, to, d) => send(ss(g), to, { k: 'casata', d }),
    // il computer chiede soldati quando un assedio è più forte del suo fortino
    bisogno(g, i) {
      const st = ss(g), n = siegesOn(st, i).reduce((a, s) => a + s.n, 0);
      return n > st.soldati[i] ? { bene: 'soldati', qty: n - st.soldati[i] } : null;
    },
  },

  botBeforeInvest(c) {
    botAnswerTreaties(c);
    botAnswerAlliances(c);
    botAlliance(c);
    botCards(c);
    botBrigands(c);
    botSpy(c);
    botTreaty(c);
    botUnderSiege(c);
    botDefend(c);
    botAskAid(c);
    botSiege(c);
    botJoinAlly(c);
    botWar(c);
    botGarrison(c);
  },
};
