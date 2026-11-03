/**
 * Agganci delle espansioni nel motore. Un'espansione è un modulo a parte
 * (src/expansions/<nome>/) che aggiunge stato proprio (GameState.ext) e
 * interviene in punti precisi dell'anno. Senza espansione il motore si
 * comporta come il listato originale.
 */
import type { Game } from './turn';
import type { InvestmentKind } from './investments';
import type { ActionResult, BotLevel, EventOutcome, GameState } from './types';

/** Contesto delle decisioni di un signore del computer. */
export interface BotCtx {
  g: Game;
  level: BotLevel;
  rnd: () => number;
  log: string[];
}

export interface MacinaRule {
  cap: number;
  beyond: number;
}

export interface ExpansionRules {
  /** identificativo salvato nella partita */
  id: string;
  /** stato iniziale dell'espansione (deve essere serializzabile in JSON) */
  init(state: GameState): unknown;
  /** dopo il mercato del grano c'è la pagina "Fra signori" (fase `signori`, prima dell'imprevisto) */
  signori?: boolean;
  /** inizio del turno di un signore, dopo raccolto, prezzo e domanda */
  onTurnStart?(g: Game): void;
  /** gabella della macina: il grano distribuito oltre `cap` conta solo per la quota `beyond` (assente: tutto) */
  macina?(g: Game): MacinaRule;
  /** mazzo dell'espansione: carte (registrate con registerEvents) che si aggiungono al mazzo comune, con il loro peso; solo con l'opzione `mazzo` */
  deck?(g: Game): { id: number; w: number }[];
  /** è uscita una carta del mazzo dell'espansione: la mette in mano al signore di turno */
  onCard?(g: Game, id: number): void;
  /** dopo un imprevisto: può correggere l'esito (e il signore) prima che sia annotato */
  onEvent?(g: Game, eventId: number, outcome: EventOutcome): void;
  /** prima di ogni acquisto nei dispendimenti (già verificato): può chiedere altro (merci, scudi) o rifiutarlo */
  beforeInvest?(g: Game, kind: InvestmentKind): ActionResult;
  /** dopo l'incasso delle rendite del signore di turno (amount = rendita dell'anno) */
  onIncome?(g: Game, amount: number): void;
  /** fine anno del signore di turno, prima di interessi, titoli e tributi */
  beforeYearEnd?(g: Game): void;
  /** fazioni: forza dei soldati e moltiplicatore delle mura del signore di turno (assente: nessuno) */
  factionDefense?(g: Game): { soldati: number; mura: number };
  /** rincaro (o sconto, se negativo) dell'usura in punti percentuali per il signore di turno, sommato a inizio turno a quella del raccolto, mai sotto zero (assente: 0) */
  usuryExtra?(g: Game): number;
  /** moltiplicatore dell'usura per il signore di turno (assente: 1) */
  usuryScale?(g: Game): number;
  /** tutti i signori hanno giocato l'anno 900 + q (prima che q avanzi) */
  onYearClose?(g: Game): void;
  /** signori del computer: azioni dell'espansione prima della Delibera */
  botBeforeTrade?(c: BotCtx): void;
  /** signori del computer: affari fra signori, chiuso il mercato del grano (con `signori`) */
  botSignori?(c: BotCtx): void;
  /** signori del computer: azioni prima di nutrire il popolo (feed = quanto distribuiranno) */
  botBeforeFeed?(c: BotCtx, feed: number): void;
  /** signori del computer: azioni all'inizio dei dispendimenti, dopo le rendite */
  botBeforeInvest?(c: BotCtx): void;
}
