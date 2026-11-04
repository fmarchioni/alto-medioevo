/**
 * Stato di gioco. I commenti tra parentesi quadre indicano la variabile del
 * listato BASIC originale (vedi docs/fase0-variabili.md).
 */
import type { AnnateState } from './annate';
import type { CausaMorte, DinastiaState, Successione } from './dinastia';
import type { FactionId, FactionOption, Pact } from './fazioni';
import type { Effetto, FattiState, FattoId, FattoOutcome, Sorte } from './fatti';
import type { EsitoImpresa, Impresa, ImpresaId } from './imprese';
import type { Foreclosure } from './pignoramenti';
import type { SensaleHire, SensaleId } from './sensale';

/** 1 = cavaliere (titoli maschili, finale "re"), 6 = madonna (titoli femminili, finale "regina") [ll(a)] */
export type Gender = 1 | 6;

/** Tipo di annata: raccolto abbondante (grano a buon mercato), medio o carestia. */
export type AnnataKind = 'buona' | 'media' | 'carestia';

/** Livello di un signore guidato dal computer. */
export type BotLevel = 'facile' | 'medio' | 'difficile';

export interface Player {
  /** nome inserito dal giocatore [parte di n$(a)] */
  name: string;
  /** indice del feudo 0..8, assegnato in ordine di giocatore */
  feudo: number;
  /** base dei titoli [ll(a)] */
  gender: Gender;
  /** assente per i giocatori umani; livello del computer altrimenti */
  bot?: BotLevel;
  /** anno (q) in cui il signore è uscito dalla partita: feudo caduto in guerra (Spade e Castelli) o signore arrestato */
  caduto?: number;
  /** anno (q) dell'arresto per un'impresa temeraria finita male (con `caduto` allo stesso anno) */
  arrestato?: number;
  /** impresa temeraria in serbo o già compiuta (solo con `imprese`, src/domain/imprese.ts) */
  impresa?: Impresa;
  /** titolo corrente 1..10 [t(a)] */
  title: number;
  /** scudi, può essere frazionario dopo una vendita [s(a)] */
  scudi: number;
  /** servi [ss(a)] */
  servi: number;
  /** grano posseduto [g(a)] */
  grano: number;
  /** acri [te(a)] */
  acri: number;
  /** livello mercato, parte da 1; posseduti = mercato - 1 [p1(a)] */
  mercato: number;
  /** livello opificio, parte da 1; posseduti = opificio - 1 [p2(a)] */
  opificio: number;
  /** livelli di palazzo, 0..11 [p3(a)] */
  palazzo: number;
  /** percentuale "bevere" [ac(a)] */
  rateBevere: number;
  /** percentuale "macina" [pa(a)] */
  rateMacina: number;
  /** percentuale "commerzio" [da(a)] */
  rateCommerzio: number;
  /** base di rendita dei mercati, calcolata a fine anno [n(a)] */
  baseMercati: number;
  /** base di rendita degli opifici, calcolata a fine anno [v(a)] */
  baseOpifici: number;
  /** tributo dei vassalli maturato [va(a)] */
  vassalli: number;
  /** rendita + vassalli dell'ultimo anno: limite di debito [tt(a)] */
  credito: number;
  /** umore del popolo 0..100, mosso dalla gabella sul bevere (solo con `gabelle`) */
  umore?: number;
  /** fiducia dei mercanti 0..100, mossa dalla gabella sul commerzio (solo con `gabelle`) */
  fiducia?: number;
  /** umore di fondo nascosto di popolo e mercanti, ±15 (solo con `gabelle`, src/domain/gabelle.ts) */
  capriccioU?: number;
  capriccioF?: number;
  /** domanda di grano in più per servo, per l'abitudine a ricevere molto grano (solo con `gabelle`) */
  abitudine?: number;
  /** patti con le fazioni in vigore (solo con `fazioni`) */
  patti?: Pact[];
  /** effetti dei fatti del reame in corso (solo con `fatti`) */
  effetti?: Effetto[];
  /** prestigio guadagnato (visita del re): conta nella ricchezza [ka] */
  prestigio?: number;
  /** valore dei beni costruiti in un'espansione (es. i vigneti): conta nella ricchezza come gli altri beni */
  beni?: number;
  /** mercati e opifici limitati dalle terre: uno ogni 100 acri (solo con `botteghe`, src/domain/investments.ts) */
  botteghe?: true;
  /** granai costruiti (solo con `commercio`) */
  granai?: number;
  /** per i signori del computer: vocazione (dare grano al popolo o commerciarlo) */
  strategia?: Strategia;
}

/** Due vie al trono: sfamare il popolo per la macina, o comprare nelle annate buone e vendere in carestia. */
export type Strategia = 'macina' | 'mercante';

/**
 * Variabili scalari del BASIC condivise fra i giocatori. Sono conservate
 * esplicitamente perché alcune formule usano il valore lasciato da una fase
 * precedente (es. `s` nella macina, `s1` negli opifici).
 */
export interface Scalars {
  /** raccolto ancora acquistabile quest'anno [VAL(r$)] */
  raccolto: number;
  /** prezzo del grano [p] */
  prezzo: number;
  /** domanda di grano [d] */
  domanda: number;
  /** usura % [us] */
  usura: number;
  /** parte dell'usura dovuta alla guerra (positiva) o alla pace (negativa), già compresa in `usura` (solo con un'espansione che la cambia) */
  usuraGuerra?: number;
  /** ultimo valore della scalare s (buy/sell/nutrimento) [s] */
  s: number;
  /** servi prima del nutrimento [s1] */
  s1: number;
  /** nati (+) o morti (-) nell'ultimo nutrimento [f] */
  natiMorti: number;
  /** ultima componente "macina" calcolata, persiste se servi < 0 [pa] */
  macina: number;
  /** annata del signore di turno (solo con `annate`) */
  annata?: AnnataKind;
  /** prezzo dell'annata prima del ricarico dei mercanti (solo con `gabelle`; `prezzo` è quello d'acquisto) */
  prezzoBase?: number;
  /** prezzo a cui si vende il grano (solo con `gabelle`; assente: `prezzo`) */
  prezzoVendita?: number;
  /** ricarico dei mercanti sfiduciati, 0..0,25 (solo con `gabelle`) */
  ricarico?: number;
  /** grano distribuito e venduto quest'anno: danno la tolleranza di servi e mercanti (solo con `gabelle`) */
  nutrito?: number;
  venduto?: number;
  /** domanda dell'anno prima del nutrimento (solo con `gabelle`) */
  domandaAnno?: number;
  /** capienza dei granai del signore di turno (solo con `granai`) */
  capienza?: number;
  /** grano di scorta all'inizio del turno non ancora venduto (solo con `commercio`) */
  scorta?: number;
  /** coloni già arrivati quest'anno (solo con `commercio`) */
  coloni?: number;
}

export interface Options {
  /** probabilità evento: indice estratto in 1..eventSlots [32 nel listato] */
  eventSlots: number;
  /** A1: il tributo dei vassalli viene incassato (riga 1335 resa raggiungibile) */
  vassalTributeCredited: boolean;
  /** A2: il grano deperisce una sola volta l'anno, non a ogni modifica delle gabelle */
  spoilOncePerYear: boolean;
  /** A8: i servi non scendono sotto zero dopo una battaglia */
  clampServants: boolean;
  /** ogni 30 anni 10 annate abbondanti, 10 medie e 10 di carestia per signore, mai più di 3 uguali di fila */
  annate?: boolean;
  /** riforma delle gabelle: umore del popolo, fiducia dei mercanti, abitudine al grano (src/domain/gabelle.ts) */
  gabelle?: boolean;
  /** fazioni storiche regionali al posto del tributo longobardo; città assegnate a sorte (src/domain/fazioni.ts) */
  fazioni?: boolean;
  /** granai limitati (50 misure per acro) e 2% di grano perduto ogni anno (src/domain/gabelle.ts) */
  granai?: boolean;
  /** fatti del reame a inizio turno: quanto il signore teme la sorte (src/domain/fatti.ts) */
  fatti?: Sorte;
  /** chi supera la soglia del trono attende la fine dell'anno: fra più signori vince il più ricco */
  tieBreakWealth?: boolean;
  /** commercio del grano: granai da costruire, e le vendite in carestia attirano coloni */
  commercio?: boolean;
  /** imprese temerarie: carte che arrivano fra gli imprevisti e si giocano quando si vuole (src/domain/imprese.ts) */
  imprese?: boolean;
  /** un mercato e un opificio ogni 100 acri, al posto dei 19 + 1 ogni 500 acri del listato */
  botteghe?: boolean;
  /** pignoramenti: a fine anno il debito oltre il credito degli usurai si salda con i beni, a metà prezzo (src/domain/pignoramenti.ts) */
  pignoramenti?: boolean;
  /** palazzo reale: il trono chiede THRONE_THRESHOLD di ricchezza e il palazzo completo; ogni piano attira servi (src/domain/rank.ts) */
  palazzoReale?: boolean;
  /** mazzo degli imprevisti: niente caselle vuote, un imprevisto con probabilità fissa, senza doppioni (src/domain/events.ts) */
  mazzo?: boolean;
  /** sensale di piazza: con la riforma delle gabelle giudica le gabelle in bozza (src/domain/sensale.ts) */
  sensale?: boolean;
  /** bancarotta: chi chiude l'anno con DEBITO_ARRESTO scudi di debito o più è arrestato ed esce dalla partita */
  bancarotta?: boolean;
  /** usura minima: gli usurai non prestano mai sotto USURA_MIN %, nemmeno nelle annate piene o in pace (src/domain/economy.ts) */
  usuraMinima?: boolean;
  /** inizio mite: nei primi anni la sorte non toglie né dà più di qualche centinaio di scudi (src/domain/events.ts, luckCap) */
  inizioMite?: boolean;
  /** obiettivo Dinastia: la partita finisce nel 962, i signori muoiono e succedono gli eredi, vince la casata con più prestigio (src/domain/dinastia.ts) */
  dinastia?: boolean;
}

/**
 * Trascrizione letterale del listato, compresi i suoi bug. Usata dal test di
 * fedeltà contro l'originale in VICE; non è offerta come modalità di gioco.
 */
export const ORIGINAL_OPTIONS: Options = {
  eventSlots: 32,
  vassalTributeCredited: false,
  spoilOncePerYear: false,
  clampServants: false,
};

/**
 * Le regole del gioco: il listato con i suoi bug corretti (tributo dei
 * vassalli incassato, grano che deperisce una volta l'anno, servi mai sotto
 * zero) e tutte le novità.
 */
export const GAME_OPTIONS: Options = {
  eventSlots: 32,
  vassalTributeCredited: true,
  spoilOncePerYear: true,
  clampServants: true,
  annate: true,
  gabelle: true,
  fazioni: true,
  granai: true,
  tieBreakWealth: true,
  commercio: true,
  imprese: true,
  botteghe: true,
  pignoramenti: true,
  palazzoReale: true,
  mazzo: true,
  sensale: true,
  bancarotta: true,
  usuraMinima: true,
  inizioMite: true,
};

export type Phase =
  | { kind: 'fatto'; id: FattoId; awaitingChoice: boolean; outcome?: FattoOutcome }
  /** esito di un'impresa temeraria; poi si torna alla fase `dopo` ('inizio': all'inizio del turno) */
  | { kind: 'impresa'; id: ImpresaId; esito: EsitoImpresa; amount: number; dopo: 'inizio' | 'commercio' | 'investimenti' }
  | { kind: 'commercio' }
  /** il signore è stato arrestato (per una carta di un'espansione, o per bancarotta a fine anno): lascia il posto al seguente */
  | { kind: 'arresto'; motivo?: 'debiti' }
  | { kind: 'esitoNutrimento' }
  /** Dinastia: all'inizio del turno il signore è morto e gli succede l'erede */
  | { kind: 'successione'; s: Successione }
  /** chiuso il mercato del grano: gli affari fra signori di un'espansione (`signori`), prima dell'imprevisto */
  | { kind: 'signori' }
  | { kind: 'evento'; eventId: number; awaitingChoice: boolean; outcome?: EventOutcome; faction?: FactionId; nemici?: number }
  | { kind: 'rendite'; preview: RenditePreview }
  | { kind: 'reame'; returnTo: 'investimenti' }
  | { kind: 'investimenti' }
  /** winner -1: nessun vincitore (tutti i signori fuori dalla partita) */
  | { kind: 'fine'; winner: number };

export interface RenditePreview {
  mercati: number; // l1
  opifici: number; // l2
  bevere: number; // ac
  macina: number; // pa
  commerzio: number; // da = l1 + l2
  correttivo: number; // c
  totale: number; // l
  conVassalli: number; // tt
}

export interface EventOutcome {
  scudi: number;
  servi: number;
  /** grano perso (rivolta, fazioni) */
  grano?: number;
  /** fazione e scelta, per gli attacchi delle fazioni */
  faction?: FactionId;
  option?: FactionOption;
  win?: boolean;
  /** uomini dell'orda e forze del signore, per gli attacchi delle fazioni */
  nemici?: number;
  difesa?: number;
  mercati?: number;
  opifici?: number;
  palazzo?: number;
  pacts?: Pact[];
  choice?: 'pugna' | 'riscatto';
}

export interface GameState {
  version: 1;
  options: Options;
  players: Player[];
  /** anni trascorsi: anno = 900 + q [q] */
  q: number;
  /** giocatore di turno, indice 0-based [a-1] */
  current: number;
  phase: Phase;
  scalars: Scalars;
  /** grano già deperito quest'anno (solo con spoilOncePerYear) */
  spoiledThisYear: boolean;
  rngState: number[];
  /** sensale al servizio di ciascun signore (solo con `sensale`) */
  sensale?: (SensaleHire | null)[];
  /** signori che quest'anno hanno superato la soglia del trono (solo con `tieBreakWealth`) */
  contenders?: number[];
  /** sorte dei fatti del reame (solo con `options.fatti`) */
  fatti?: FattiState;
  /** sequenze delle annate (solo con `options.annate`) */
  annate?: AnnateState;
  log: string[];
  /** fatti dell'anno in forma strutturata, per il libro delle cronache (assente nei salvataggi vecchi) */
  chronicle?: ChronicleEntry[];
  /** espansione in gioco (assente: gioco base) */
  expansion?: string;
  /** stato proprio dell'espansione */
  ext?: unknown;
  /** casate, età e corona (solo con `options.dinastia`) */
  dinastia?: DinastiaState;
}

export type ActionResult = { ok: true } | { ok: false; reason: string };

/** Un fatto avvenuto nel turno di un signore, annotato per il libro delle cronache. */
export type ChronicleFact =
  | { t: 'buy'; qty: number; price: number }
  | { t: 'sell'; qty: number; price: number; coloni?: number }
  | { t: 'feed'; qty: number; demand: number; delta: number }
  | {
      t: 'event'; id: number; scudi: number; servi: number; grano?: number; choice?: 'pugna' | 'riscatto';
      faction?: FactionId; option?: FactionOption; win?: boolean; mercati?: number; opifici?: number; palazzo?: number;
      nemici?: number; difesa?: number;
    }
  /** tributo annuo pagato per un patto (protettorato bizantino) */
  | { t: 'pactTribute'; faction: FactionId; amount: number }
  /** patti scaduti a inizio anno */
  | { t: 'pactEnd'; faction: FactionId; kind: Pact['kind'] }
  /** mercanti che chiudono (-1) o aprono (+1) un mercato, per la loro fiducia */
  | { t: 'mercanti'; delta: number }
  /** grano marcito nei granai trascurati di un tesoro in debito */
  | { t: 'spoil'; qty: number }
  /** fatto del reame accaduto al signore */
  | { t: 'fatto'; o: FattoOutcome }
  /** effetti annui dei fatti: furti del ciambellano, decima, offerte dei pellegrini */
  | { t: 'fattoAnnuo'; kind: 'furto' | 'decima' | 'pellegrini'; amount: number }
  /** grano perduto a fine anno: oltre la capienza dei granai e per ratti e muffa */
  | { t: 'granaio'; over: number; rot: number }
  | { t: 'income'; amount: number; tribute: number }
  /** costruzione; servi: accorsi per un piano di palazzo (opzione `palazzoReale`) */
  | { t: 'build'; kind: 'terre' | 'mercato' | 'opificio' | 'palazzo' | 'granaio'; servi?: number }
  /** impresa temeraria: tentata, scoperta da un complice, o lasciata scadere */
  | { t: 'impresa'; id: ImpresaId; esito: EsitoImpresa | 'scaduta'; amount: number }
  /** fatto di un'espansione: la narrazione spetta alla sua vista */
  | { t: 'ext'; kind: string; data: Record<string, number> }
  /** bancarotta: arrestato a fine anno per i debiti */
  | { t: 'bancarotta'; scudi: number }
  /** Dinastia: morte del signore e successione dell'erede */
  | { t: 'successione'; morto: string; causa: CausaMorte; eta: number; anni: number; erede: string; cadetti: number; scudi: number; acri: number; corona: boolean }
  /** Dinastia: incoronato re d'Italia a trono vacante */
  | { t: 'corona' }
  /** sensale di piazza assoldato per l'anno */
  | { t: 'sensale'; who: SensaleId; cost: number }
  | {
      t: 'yearEnd';
      usury: number;
      titleBefore: number;
      titleAfter: number;
      /** tributi riscossi da questo signore: chi ha pagato e quanto */
      tribute: { from: number; amount: number }[];
      scudi: number;
      servi: number;
      won: boolean;
      /** beni pignorati per il debito oltre il credito (assente: nessuno) */
      seized?: Foreclosure;
    };

export interface ChronicleEntry {
  year: number;
  player: number;
  fact: ChronicleFact;
}
