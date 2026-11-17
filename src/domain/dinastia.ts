/**
 * Dinastia: un obiettivo di partita al posto della corsa al trono, valido con
 * il gioco base e con ogni espansione (opzione `dinastia`).
 *
 * - La partita non finisce sul trono ma nel 962, quando Ottone I è incoronato
 *   imperatore a Roma e il Regno d'Italia passa all'Impero.
 * - Ogni signore ha un'età. Muore di vecchiaia o di malattia (il rischio cresce
 *   con l'età e con gli anni di regno), per le ferite di una battaglia, negli
 *   scontri di una rivolta o per una congiura di palazzo quando il popolo è
 *   scontento. Gli succede il primogenito.
 * - L'eredità si divide: i fratelli cadetti prendono parte del tesoro, del grano
 *   e delle terre; città, botteghe e debiti restano all'erede. Con la famiglia, il
 *   primo dei cadetti fonda un ramo cadetto: entra in gioco come signore del
 *   computer in una città libera vicina (o in quella lasciata dall'erede che si
 *   trasferisce), con la parte dei fratelli (fondaRamo). La parte dei
 *   cadetti cresce con la ricchezza della casata rispetto alle altre: chi è
 *   avanti perde di più, chi è indietro quasi nulla.
 * - La corona d'Italia: il primo re è chi per primo ha le condizioni del trono
 *   (a fine anno; se sono più d'uno, il più ricco). Alla morte del re si vota il
 *   successore fra il suo erede legittimo e i signori di rango almeno duca: vota
 *   ogni signore in gioco, con tanti voti quanto il suo rango, mai per sé; il
 *   testamento del re vale il suo rango più TESTAMENTO_BONUS (senza testamento la sua casata
 *   non vota). A pari voti, il più ricco. Un erede bambino trova meno voti; i
 *   fratelli scontenti dell'erede possono tramare nella notte della successione
 *   (congiuraSuccessione). Un trono vacante (la casata del re è caduta) torna al
 *   primo che ne ha le condizioni.
 * - Famiglia e matrimoni: src/domain/famiglia.ts.
 * - Vince la casata con più prestigio: i titoli di ogni generazione, le corone
 *   e la ricchezza dell'ultimo signore.
 *
 * Il dado della dinastia è un generatore proprio: la sequenza RND del listato
 * non cambia.
 */
import { INT } from './economy';
import { livelloOf, UMORE_START, umoreOf } from './gabelle';
import { dist } from './geography';
import { FEUDI } from './rank';
import {
  casusBelli, dimora, erede, etaP, ETA_MAGGIORE, figliInCasa, initFamiglia, muore, nipote, nozzeDi, parenti, personaOf,
  type CasusBelli, type Matrimonio, type Persona, type PropostaNozze,
} from './famiglia';
import { rankOf, wealthIndex } from './rank';
import type { PrestitoCasata, RichiestaCasata } from './prestiti';
import { Mulberry32 } from './rng';
import type { GameState, Gender, Player } from './types';

/** anno in cui finisce la partita: incoronazione imperiale di Ottone I (2 febbraio 962) */
export const ANNO_FINE = 962;

export type CausaMorte = 'vecchiaia' | 'malattia' | 'battaglia' | 'rivolta' | 'congiura' | 'faida';
export type Pericolo = 'battaglia' | 'rivolta';

/** Un signore della casata. Gli anni sono in q (anno = 900 + q). */
export interface Generazione {
  /** nome senza ordinale */
  nome: string;
  /** ordinale nella casata (1: nessuno; 2: "II", ...) */
  ordinale: number;
  nato: number;
  /** primo anno di regno */
  dal: number;
  /** anno della morte */
  al?: number;
  morte?: CausaMorte;
  /** rango più alto raggiunto in vita (1..5) */
  rango: number;
  /** incoronato re d'Italia */
  re?: true;
  /** ha preso il posto dell'erede legittimo con una congiura: i signori fuori dalla famiglia non lo votano */
  usurpatore?: true;
  /** fratelli cadetti che hanno avuto parte dell'eredità */
  cadetti?: number;
  /** la persona (src/domain/famiglia.ts) */
  persona?: number;
  /** ha avuto l'eredità intera mentre c'erano fratelli o sorelle: rischia la faida (rischioFaida) */
  esclusi?: true;
  /** erede bambino: il consiglio di reggenza governa fino a quest'anno (q) compreso */
  reggenza?: number;
}

export interface Casata {
  /** nome del fondatore: la casata è "di" lui o lei */
  fondatore: string;
  generazioni: Generazione[];
  /** pericoli corsi dall'ultimo tiro: rischio di morte in più (0..1) */
  pericoli: Partial<Record<Pericolo, number>>;
  /** prestigio dei matrimoni illustri, meno quello perduto con i ripudi */
  lustro?: number;
  /** alla morte del re la casata vota per questa casata (la casata del re: il suo erede legittimo), se può essere eletta (assente: sceglie da sé) */
  appoggio?: number;
  /** la corona da annunciare al giocatore all'inizio del suo prossimo turno */
  annuncio?: AnnuncioCorona;
  /** avvisi del notaio di corte già dati (una volta sola per argomento) e quelli da dare */
  spiegati?: Avviso[];
  daSpiegare?: Avviso[];
  /**
   * Ramo cadetto: la casata è nata dalla divisione dell'eredità della casata `di` nell'anno `dal` (q).
   * Finché il vincolo tiene il suo prestigio si somma a quello della casata madre, e le due sono parenti.
   */
  ramo?: {
    di: number; dal: number;
    /** prestiti di casata (prestiti.ts): rifiuti nel conto, anno dell'ultima richiesta, anno in cui il vincolo si è rotto */
    rifiuti?: number; chiesto?: number; rotto?: number;
  };
}

/** Argomenti che il notaio di corte spiega la prima volta che contano. */
export type Avviso = 'inizio' | 'successione' | 'reggenza' | 'nozze' | 'pericoli' | 'congiura' | 'elezione' | 'ripudiato' | 'trasferimento' | 'testamento' | 'malumori';

/** Il nuovo re, come lo apprende ogni giocatore: primo re (nessun voto) o successore eletto alla morte del re. */
export interface AnnuncioCorona {
  re: number;
  /** successione: la casata del re morto (il suo erede legittimo era candidato) */
  casaRe?: number;
  /** voti per candidato */
  voti?: [number, number][];
  /** il testamento del re morto (assente: non l'aveva lasciato) */
  testamento?: number;
}

export interface DinastiaState {
  /** anno della fine */
  fine: number;
  rng: number;
  casate: Casata[];
  /** signore che porta la corona d'Italia (null: trono vacante) */
  re: number | null;
  /** casata dell'ultimo re */
  casaRe?: number;
  /** anno (q) dell'incoronazione del re */
  reDal?: number;
  /** il successore che il re indica nel testamento (la sua casata: l'erede legittimo); assente: nessun testamento */
  testamento?: number;
  /** il notaio ha già ricordato al re di fare testamento (una volta per regno) */
  ricordato?: true;
  /** signori che quest'anno hanno le condizioni del trono (vacante) */
  candidati?: number[];
  /** famiglia e matrimoni (src/domain/famiglia.ts) */
  persone?: Persona[];
  matrimoni?: Matrimonio[];
  proposte?: PropostaNozze[];
  casus?: CasusBelli[];
  nextId?: number;
  /** prestiti di casata fra casata madre e rami cadetti, e richieste in attesa di risposta (prestiti.ts) */
  prestiti?: PrestitoCasata[];
  richiesteCasata?: RichiestaCasata[];
}

/** Parte dell'eredità presa dai cadetti, e quello che resta all'erede. */
export interface Eredita {
  cadetti: number;
  /** i fratelli c'erano, ma non nasce un ramo cadetto (città al completo, o fratelli bambini): l'eredità resta tutta all'erede */
  intera?: true;
  scudi: number;
  grano: number;
  acri: number;
  servi: number;
}

export interface Successione {
  morto: string;
  /** genere del signore morto */
  gender: Gender;
  causa: CausaMorte;
  eta: number;
  anni: number;
  erede: string;
  etaErede: number;
  /** l'erede è un figlio o una figlia; nipote: nessun figlio, eredita un parente */
  rel: 'figlio' | 'figlia' | 'nipote' | 'fratello' | 'sorella';
  /** morte per faida: chi osservava la scena (il fratello o la sorella escluso dall'eredità) */
  assassino?: { nome: string; gender: Gender };
  /** anno (q) di fine della reggenza, se l'erede è un bambino */
  reggenza?: number;
  eredita: Eredita;
  /** il morto portava la corona: il trono è vacante */
  corona: boolean;
  /** città libere vicine dove l'erede può trasferirsi, lasciando la città ai fratelli (solo con dei fratelli) */
  trasferibile?: number[];
  /** l'erede si è trasferito: la città nuova e ciò che ha lasciato ai fratelli */
  trasferito?: Trasferimento;
}

/** L'erede lascia la città ai fratelli e fonda la sua sede in una città libera vicina. */
export interface Trasferimento {
  da: number;
  a: number;
  acri: number;
  servi: number;
  mercati: number;
  opifici: number;
  palazzo: number;
  granai: number;
}

/** Città libere più vicine fra cui l'erede può scegliere. */
export const CITTA_VICINE = 2;
/** Città libere più vicine a quella del signore i (nessun signore in gioco vi risiede). */
export function cittaLibere(state: GameState, i: number): number[] {
  const busy = new Set(state.players.filter(p => p.caduto === undefined).map(p => p.feudo));
  const from = state.players[i].feudo;
  return FEUDI.map((_, k) => k).filter(k => !busy.has(k)).sort((a, b) => dist(from, a) - dist(from, b)).slice(0, CITTA_VICINE);
}

/**
 * L'erede si trasferisce: la città con le sue botteghe, il palazzo, i granai e
 * le terre oltre le 500 restano ai fratelli; l'erede tiene tutto il tesoro e il
 * grano (i fratelli rinunciano alla loro parte), e lo seguono i servi delle sue
 * terre. I debiti restano suoi.
 */
export function trasferisci(state: GameState, s: Successione, i: number, citta: number): Trasferimento {
  const p = state.players[i];
  p.scudi += s.eredita.scudi;
  p.grano += s.eredita.grano;
  const acri = Math.max(0, p.acri - ACRI_BASE);
  const servi = p.acri > 0 ? INT(Math.max(0, p.servi) * (acri / p.acri)) : 0;
  const t: Trasferimento = { da: p.feudo, a: citta, acri, servi, mercati: p.mercato - 1, opifici: p.opificio - 1, palazzo: p.palazzo, granai: p.granai ?? 0 };
  p.acri -= acri;
  p.servi -= servi;
  p.mercato = 1;
  p.opificio = 1;
  p.palazzo = 0;
  if (p.granai !== undefined) p.granai = 0;
  p.feudo = citta;
  s.eredita = { ...s.eredita, scudi: 0, grano: 0 };
  s.trasferito = t;
  delete s.trasferibile;
  return t;
}

// ---------------------------------------------------------------- costanti (da tarare con le partite fra bot)

/** età del fondatore: da 28 a 38 anni */
export const ETA_FONDATORE = [28, 38] as const;
/** differenza d'età fra padre ed erede: da 18 a 30 anni; l'erede ha almeno 16 anni */
export const DISTACCO_EREDE = [18, 30] as const;
export const ETA_MIN_EREDE = 16;
/** anni di regno senza morte naturale */
export const REGNO_SICURO = 3;
/** rischio naturale annuo: fondo, più una parte che cresce con l'età, più il logorio degli anni di regno */
export const RISCHIO_FONDO = 0.01;
export const RISCHIO_ETA = 0.02;
export const RISCHIO_ETA_SCALA = 12;
export const RISCHIO_REGNO = 0.02;
export const RISCHIO_REGNO_DAL = 8;
/** rischio di una battaglia: vinta, persa */
export const RISCHIO_BATTAGLIA = { vinta: 0.03, persa: 0.08 } as const;
/** rischio di una rivolta del popolo */
export const RISCHIO_RIVOLTA = 0.03;
/** congiura di palazzo: rischio annuo con il popolo scontento o furioso */
export const RISCHIO_CONGIURA = { infelice: 0.02, rabbia: 0.06 } as const;
/** il rischio di un anno non supera questo valore */
export const RISCHIO_MAX = 0.75;
/** probabilità di 0, 1, 2, 3 fratelli cadetti */
export const CADETTI_PESI = [30, 35, 22, 13] as const;
/** parte di tesoro, grano e terre (oltre le 500 iniziali) che prende ogni cadetto, a ricchezza pari alla media */
export const QUOTA_CADETTO = 0.12;
/** la quota si moltiplica per la ricchezza rispetto alla media, entro questi limiti */
export const QUOTA_FATTORE = [0.25, 1.5] as const;
/** i cadetti non prendono mai più di questa parte */
export const QUOTA_MAX = 0.45;
/** terre che restano sempre all'erede */
export const ACRI_BASE = 500;

/** prestigio: titoli di ogni generazione (rango 1..5), corona, ricchezza finale */
export const PRESTIGIO_RANGO = [0, 50, 120, 200, 300] as const;
export const PRESTIGIO_RE = 400;
/** la ricchezza conta con la radice quadrata, diviso questo valore: 1 milione vale 250 */
export const PRESTIGIO_RICCHEZZA = 4;

export const NOMI_M = [
  'Berengario', 'Ugo', 'Lotario', 'Adalberto', 'Guido', 'Lamberto', 'Anscario', 'Oberto', 'Arduino', 'Rodolfo', 'Bonifacio',
  'Manfredi', 'Aleramo', 'Teobaldo', 'Ildebrando', 'Landolfo', 'Pandolfo', 'Guaimario', 'Atenolfo', 'Sergio', 'Marino', 'Ottone',
] as const;
export const NOMI_F = [
  'Adelaide', 'Berta', 'Willa', 'Ermengarda', 'Gisla', 'Rotlinda', 'Teodora', 'Marozia', 'Ageltrude', 'Waldrada', 'Matilde', 'Imelda',
] as const;

const ROMANI = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
/** nome con l'ordinale: "Berengario II" */
export const nomeCompleto = (g: Generazione) => (g.ordinale > 1 ? `${g.nome} ${ROMANI[g.ordinale] ?? g.ordinale}` : g.nome);

// ---------------------------------------------------------------- stato

function seed(state: GameState): number {
  let h = 2166136261;
  for (const v of [...state.rngState, state.players.length, 0xd1a5]) h = Math.imul(h ^ v, 16777619) >>> 0;
  return h;
}

export function dinastiaRandom(d: DinastiaState): number {
  const r = new Mulberry32(d.rng);
  const v = r.next();
  d.rng = r.getState()[0];
  return v;
}

const between = (d: DinastiaState, [a, b]: readonly [number, number]) => a + Math.floor(dinastiaRandom(d) * (b - a + 1));

export function initDinastia(state: GameState): DinastiaState {
  const d: DinastiaState = { fine: ANNO_FINE, rng: seed(state), casate: [], re: null };
  d.casate = state.players.map(p => ({
    fondatore: p.name,
    generazioni: [{ nome: p.name, ordinale: 1, nato: state.q - between(d, ETA_FONDATORE), dal: state.q, rango: rankOf(p) }],
    pericoli: {},
  }));
  initFamiglia(d, state);
  return d;
}

export const signoreOf = (d: DinastiaState, i: number): Generazione => d.casate[i].generazioni[d.casate[i].generazioni.length - 1];
export const etaOf = (g: Generazione, q: number) => q - g.nato;

// ---------------------------------------------------------------- morte

/** Rischio annuo di morte naturale. */
export function rischioNaturale(eta: number, anniRegno: number): number {
  if (anniRegno < REGNO_SICURO) return 0;
  return RISCHIO_FONDO + RISCHIO_ETA * Math.exp((eta - 40) / RISCHIO_ETA_SCALA) + RISCHIO_REGNO * Math.max(0, anniRegno - RISCHIO_REGNO_DAL);
}

/** Rischio di congiura di palazzo per l'umore del popolo (solo con la riforma delle gabelle). */
export function rischioCongiura(p: Player): number {
  if (p.umore === undefined) return 0;
  const l = livelloOf(umoreOf(p));
  return l === 'rabbia' ? RISCHIO_CONGIURA.rabbia : l === 'infelice' ? RISCHIO_CONGIURA.infelice : 0;
}

/** Il signore ha corso un pericolo: il rischio si somma fino al prossimo tiro. */
export function addPericolo(d: DinastiaState, i: number, kind: Pericolo, rischio: number): void {
  const p = d.casate[i].pericoli;
  p[kind] = (p[kind] ?? 0) + rischio;
}

/** Rischi dell'anno, per causa. */
export function rischi(d: DinastiaState, i: number, p: Player, q: number): Record<CausaMorte, number> {
  const g = signoreOf(d, i), eta = etaOf(g, q), nat = rischioNaturale(eta, q - g.dal);
  // dopo i 50 anni la morte naturale è vecchiaia, prima è malattia
  const vecchio = eta >= 50;
  const per = d.casate[i].pericoli;
  return {
    vecchiaia: vecchio ? nat : 0,
    malattia: vecchio ? 0 : nat,
    battaglia: per.battaglia ?? 0,
    rivolta: per.rivolta ?? 0,
    congiura: rischioCongiura(p),
    faida: rischioFaida(d, i, q),
  };
}

/** Tiro di inizio turno: ritorna la causa della morte, o null. I pericoli si azzerano. */
export function rollMorte(d: DinastiaState, i: number, p: Player, q: number): CausaMorte | null {
  const r = rischi(d, i, p, q);
  d.casate[i].pericoli = {};
  const cause = Object.keys(r) as CausaMorte[];
  const tot = cause.reduce((a, c) => a + r[c], 0);
  if (tot <= 0) return null;
  const x = dinastiaRandom(d);
  if (x >= Math.min(RISCHIO_MAX, tot)) return null;
  // la causa si sceglie in proporzione ai rischi
  let y = dinastiaRandom(d) * tot;
  for (const c of cause) {
    y -= r[c];
    if (y < 0) return c;
  }
  return cause.filter(c => r[c] > 0).pop()!;
}

// ---------------------------------------------------------------- successione

function nomeErede(d: DinastiaState, c: Casata, gender: Gender): { nome: string; ordinale: number } {
  const avi = [...new Set(c.generazioni.map(g => g.nome))];
  const lista: readonly string[] = gender === 1 ? NOMI_M : NOMI_F;
  // spesso l'erede porta il nome di un avo
  const nome = avi.length && dinastiaRandom(d) < 0.4 ? avi[Math.floor(dinastiaRandom(d) * avi.length)] : lista[Math.floor(dinastiaRandom(d) * lista.length)];
  return { nome, ordinale: ordinaleOf(c, nome) };
}

/** Ordinale di un nuovo signore con questo nome. */
export const ordinaleOf = (c: Casata, nome: string) => c.generazioni.filter(g => g.nome === nome).length + 1;

function cadettiOf(d: DinastiaState): number {
  let y = dinastiaRandom(d) * CADETTI_PESI.reduce((a, b) => a + b, 0);
  for (let k = 0; k < CADETTI_PESI.length; k++) {
    y -= CADETTI_PESI[k];
    if (y < 0) return k;
  }
  return 0;
}

/** Parte dell'eredità che va a ciascun cadetto: cresce con la ricchezza rispetto alla media dei signori in gioco. */
export function quotaCadetto(players: Player[], i: number): number {
  const alive = players.filter(p => p.caduto === undefined);
  const avg = alive.reduce((a, p) => a + Math.max(0, wealthIndex(p)), 0) / Math.max(1, alive.length);
  const ka = Math.max(0, wealthIndex(players[i]));
  const f = avg > 0 ? Math.min(QUOTA_FATTORE[1], Math.max(QUOTA_FATTORE[0], ka / avg)) : 1;
  return QUOTA_CADETTO * f;
}

/** Divide l'eredità: i cadetti prendono tesoro, grano e terre; città, botteghe e debiti restano all'erede. */
export function dividiEredita(players: Player[], i: number, cadetti: number): Eredita {
  const p = players[i];
  const share = Math.min(QUOTA_MAX, cadetti * quotaCadetto(players, i));
  const scudi = p.scudi > 0 ? INT(p.scudi * share) : 0;
  const grano = INT(Math.max(0, p.grano) * share);
  const acri = INT(Math.max(0, p.acri - ACRI_BASE) * share);
  // i servi seguono le terre dei cadetti
  const servi = p.acri > 0 ? INT(Math.max(0, p.servi) * (acri / p.acri)) : 0;
  p.scudi -= scudi;
  p.grano -= grano;
  p.acri -= acri;
  p.servi -= servi;
  return { cadetti, scudi, grano, acri, servi };
}

/** cadetti di un signore morto senza figli: i parenti si contendono l'eredità come due fratelli */
export const CADETTI_SENZA_FIGLI = 2;

/**
 * Il signore è morto: gli succede il primogenito rimasto in casa (del genere
 * del signore, se c'è), o un nipote se non ha figli. Gli altri figli in casa
 * sono i cadetti che si dividono l'eredità; un erede bambino regna sotto
 * reggenza fino a 16 anni.
 */
export function succedi(state: GameState, d: DinastiaState, i: number, causa: CausaMorte): Successione {
  const p = state.players[i], c = d.casate[i], q = state.q;
  // faida: chi ha tramato è il maggiore dei fratelli esclusi dall'eredità
  const assassino = causa === 'faida' ? fratelliEsclusi(d, i, q)[0] ?? null : null;
  const morto = signoreOf(d, i);
  morto.al = q;
  morto.morte = causa;
  morto.rango = Math.max(morto.rango, rankOf(p));
  const eta = etaOf(morto, q), gender = p.gender;
  const corona = d.re === i;
  if (corona) d.re = null;
  const famiglia = !!d.persone && morto.persona !== undefined;
  const figlio = famiglia ? erede(d, i, p.gender) : null;
  // senza figli, dopo una faida il trono va proprio a chi ha tramato
  const usurpatore = famiglia && !figlio ? assassino : null;
  const cadetti = famiglia ? (figlio ? figliInCasa(d, i).length - 1 : usurpatore ? 0 : CADETTI_SENZA_FIGLI) : cadettiOf(d);
  morto.cadetti = cadetti;
  let heir: Generazione, rel: Successione['rel'];
  if (famiglia) {
    const x = figlio ?? usurpatore ?? nipote(d, i, p.gender, q);
    rel = figlio ? (x.gender === 1 ? 'figlio' : 'figlia') : usurpatore ? (x.gender === 1 ? 'fratello' : 'sorella') : 'nipote';
    muore(state, d, morto.persona!);
    heir = { nome: x.nome, ordinale: ordinaleOf(c, x.nome), nato: x.nato, dal: q, rango: rankOf(p), persona: x.id };
    // un erede dell'altro genere: i titoli passano al femminile o al maschile
    if (x.gender !== p.gender) {
      p.title = rankOf(p) - 1 + x.gender;
      p.gender = x.gender;
    }
    if (etaP(x, q) < ETA_MAGGIORE) heir.reggenza = x.nato + ETA_MAGGIORE - 1;
  } else {
    // partite salvate senza famiglia: erede immaginario, come nel passo 1
    const { nome, ordinale } = nomeErede(d, c, p.gender);
    heir = { nome, ordinale, nato: q - Math.max(ETA_MIN_EREDE, eta - between(d, DISTACCO_EREDE)), dal: q, rango: rankOf(p) };
    rel = p.gender === 1 ? 'figlio' : 'figlia';
  }
  c.generazioni.push(heir);
  // con la famiglia l'eredità si divide solo se nasce un ramo cadetto; altrimenti resta tutta all'erede
  const ramo = famiglia && nasceRamo(state, d, i, rel, cadetti);
  const eredita: Eredita = !famiglia || ramo ? dividiEredita(state.players, i, cadetti)
    : { cadetti, scudi: 0, grano: 0, acri: 0, servi: 0, ...(cadetti > 0 ? { intera: true as const } : {}) };
  // i fratelli rimasti a mani vuote possono covare una faida contro chi ha ereditato
  if (eredita.intera) heir.esclusi = true;
  // con dei fratelli a cui lasciare la città, l'erede può trasferirsi in una città libera vicina
  const libere = ramo && figlio ? cittaLibere(state, i) : [];
  p.name = nomeCompleto(heir);
  // il popolo spera nel signore nuovo: l'umore torna a metà strada verso quello d'inizio
  if (p.umore !== undefined) p.umore = Math.round((p.umore + UMORE_START) / 2);
  return {
    morto: nomeCompleto(morto), gender, causa, eta, anni: q - morto.dal, erede: p.name, etaErede: q - heir.nato, rel,
    ...(assassino ? { assassino: { nome: assassino.nome, gender: assassino.gender } } : {}),
    ...(heir.reggenza !== undefined ? { reggenza: heir.reggenza } : {}), eredita, corona, ...(libere.length ? { trasferibile: libere } : {}),
  };
}

// ---------------------------------------------------------------- ramo cadetto

/**
 * Città al più con un signore in gioco (fra casate e rami): tutte quelle della carta, 9. Raggiunto il limite non nascono più rami
 * cadetti: l'eredità va tutta a un solo erede, e i fratelli esclusi possono covare una faida.
 */
export const MAX_CITTA = FEUDI.length;
/** C'è posto per un nuovo ramo cadetto (signori in gioco sotto il limite delle città). */
export const postoPerRamo = (state: GameState) => state.players.filter(p => p.caduto === undefined).length < MAX_CITTA;

/** Il vincolo del ramo cadetto tiene: finché non si rompe (prestiti di casata negati o non resi, prestiti.ts). */
export const vincoloTiene = (d: DinastiaState, i: number) => d.casate[i]?.ramo !== undefined && d.casate[i].ramo!.rotto === undefined;
/** Casata madre del ramo i (null: non è un ramo, o il vincolo non tiene più). */
export const casaMadre = (d: DinastiaState, i: number): number | null => (vincoloTiene(d, i) ? d.casate[i].ramo!.di : null);
/** Rami cadetti legati alla casata i. */
export const ramiDi = (d: DinastiaState, i: number): number[] => d.casate.map((_, j) => j).filter(j => casaMadre(d, j) === i);

/** I fratelli dell'erede rimasti in casa, dal maggiore. */
export function fratelliErede(d: DinastiaState, i: number): Persona[] {
  const gens = d.casate[i].generazioni, morto = gens[gens.length - 2], heir = gens[gens.length - 1];
  if (morto?.persona === undefined || !d.persone) return [];
  return d.persone.filter(x => x.genitore === morto.persona && x.morto === undefined && dimora(d, x) === i && x.id !== heir.persona)
    .sort((a, b) => a.nato - b.nato || a.id - b.id);
}

/**
 * Nasce un ramo cadetto? Serve la famiglia, una parte dei cadetti e un fondatore adulto: il fratello
 * maggiore dell'erede di almeno ETA_MAGGIORE anni (con fratelli tutti bambini restano a corte con la loro
 * parte), o un parente se il signore è morto senza figli.
 */
export function nasceRamo(state: GameState, d: DinastiaState, i: number, rel: Successione['rel'], cadetti: number): boolean {
  if (!d.persone || !cadetti || !postoPerRamo(state) || d.casate[i].generazioni[d.casate[i].generazioni.length - 2]?.persona === undefined) return false;
  if (rel === 'nipote') return true;
  const f = fratelliErede(d, i)[0];
  return !!f && etaP(f, state.q) >= ETA_MAGGIORE;
}

/** Chi fonda il ramo: il fratello maggiore dell'erede (gli altri lo seguono), o un parente se il signore è morto senza figli. */
export interface Fondatore { persona: Persona; fratelli: Persona[] }
export function fondatoreRamo(state: GameState, d: DinastiaState, i: number, s: Successione): Fondatore | null {
  if (s.eredita.intera || !nasceRamo(state, d, i, s.rel, s.eredita.cadetti)) return null;
  const fratelli = fratelliErede(d, i);
  const persona = fratelli.shift() ?? nipote(d, i, dinastiaRandom(d) < 0.7 ? 1 : 6, state.q);
  return { persona, fratelli };
}

/** Città del ramo: quella lasciata dall'erede che si è trasferito, o la libera più vicina. null: nessuna (o troppi signori in gioco). */
export function cittaRamo(state: GameState, i: number, s: Successione): number | null {
  if (!postoPerRamo(state)) return null;
  if (s.trasferito) return s.trasferito.da;
  return cittaLibere(state, i)[0] ?? null;
}

/**
 * Fonda il ramo cadetto: il nuovo signore `n` (già aggiunto a state.players) prende la casata, i fratelli
 * minori lo seguono. La parte dell'eredità dei cadetti va a lui.
 */
export function fondaRamo(state: GameState, d: DinastiaState, i: number, n: number, f: Fondatore): void {
  const q = state.q, x = f.persona;
  x.casa = n;
  for (const y of f.fratelli) y.casa = n;
  d.casate[n] = {
    fondatore: x.nome,
    generazioni: [{ nome: x.nome, ordinale: 1, nato: x.nato, dal: q, rango: rankOf(state.players[n]), persona: x.id, ...(etaP(x, q) < ETA_MAGGIORE ? { reggenza: x.nato + ETA_MAGGIORE - 1 } : {}) }],
    pericoli: {},
    ramo: { di: i, dal: q },
    daSpiegare: [],
  };
}

// ---------------------------------------------------------------- faida fra fratelli

/**
 * Faida: con le città al completo l'eredità va tutta a un solo erede, e i fratelli e le sorelle rimasti a
 * corte a mani vuote possono covare rancore. Finché ce n'è uno di almeno ETA_FAIDA anni, il signore che ha
 * ereditato rischia ogni anno, oltre alla morte naturale, una "morte improvvisa in strane circostanze":
 * il rischio cresce con gli anni passati dalla successione, fino a `max`. Morto senza figli, gli succede
 * proprio chi ha tramato.
 */
export const FAIDA = { base: 0.01, anno: 0.003, max: 0.06 } as const;
/** età minima di chi trama: quella delle nozze (ETA_NOZZE in famiglia.ts; qui scritta per esteso, perché i due moduli si importano a vicenda) */
export const ETA_FAIDA = 14;

/** Fratelli e sorelle del signore esclusi dall'eredità intera, in vita e a corte, di almeno ETA_FAIDA anni (dal maggiore). */
export function fratelliEsclusi(d: DinastiaState, i: number, q: number): Persona[] {
  const gens = d.casate[i].generazioni, g = gens[gens.length - 1], padre = gens[gens.length - 2];
  if (!d.persone || !g.esclusi || g.persona === undefined || padre?.persona === undefined) return [];
  return d.persone.filter(x => x.genitore === padre.persona && x.morto === undefined && x.id !== g.persona && dimora(d, x) === i && etaP(x, q) >= ETA_FAIDA)
    .sort((a, b) => a.nato - b.nato || a.id - b.id);
}

/** Rischio annuo di faida per il signore della casata i: cresce con gli anni di regno. */
export function rischioFaida(d: DinastiaState, i: number, q: number): number {
  if (!fratelliEsclusi(d, i, q).length) return 0;
  return Math.min(FAIDA.max, FAIDA.base + FAIDA.anno * (q - signoreOf(d, i).dal));
}

/** Il signore regna sotto reggenza quest'anno. */
export const inReggenza = (d: DinastiaState, i: number, q: number) => (signoreOf(d, i).reggenza ?? -1) >= q;

/** Il giocatore cambia il nome del suo erede (prima di cominciare a regnare). */
export function rinominaErede(state: GameState, d: DinastiaState, i: number, nome: string): boolean {
  const n = nome.trim();
  if (!n || n.length > 12) return false;
  const c = d.casate[i], g = signoreOf(d, i);
  c.generazioni.pop();
  const nuovo = { ...g, nome: n, ordinale: ordinaleOf(c, n) };
  c.generazioni.push(nuovo);
  if (g.persona !== undefined && d.persone) personaOf(d, g.persona).nome = n;
  state.players[i].name = nomeCompleto(nuovo);
  return true;
}

// ---------------------------------------------------------------- corona e prestigio

/** Fine anno: il rango più alto della generazione. */
export function annotaRango(d: DinastiaState, i: number, p: Player): void {
  const g = signoreOf(d, i);
  g.rango = Math.max(g.rango, rankOf(p));
}

/** Il signore ha le condizioni del trono: con il trono vacante è candidato a fine anno. */
export function candidaAlTrono(d: DinastiaState, i: number): boolean {
  if (d.re !== null) return false;
  const c = (d.candidati ??= []);
  if (!c.includes(i)) c.push(i);
  return true;
}

/** Il signore i diventa re: la corona alla sua generazione; il testamento è da fare (il computer indica subito il suo erede). */
function incorona(state: GameState, d: DinastiaState, i: number): void {
  d.re = i;
  d.reDal = state.q;
  delete d.testamento;
  delete d.ricordato;
  signoreOf(d, i).re = true;
  if (state.players[i].bot) d.testamento = i;
}

/** Il primo re (o il trono vacante perché la casata del re è caduta): fra chi a fine anno ha le condizioni del trono, il più ricco. */
export function primoRe(state: GameState, d: DinastiaState): number | null {
  const c = (d.candidati ?? []).filter(i => state.players[i].caduto === undefined);
  delete d.candidati;
  if (d.re !== null || !c.length) return null;
  const re = c.reduce((a, b) => (wealthIndex(state.players[b]) > wealthIndex(state.players[a]) ? b : a));
  incorona(state, d, re);
  return re;
}

/** rango minimo per essere eletti alla morte del re (l'erede legittimo concorre sempre): duca */
export const RANGO_ELEGGIBILE = 3;
/** il testamento del re vale il suo rango più questi voti (un principe: 8) */
export const TESTAMENTO_BONUS = 3;
/** I voti del testamento del re di questo rango. */
export const votiTestamento = (rango: number) => rango + TESTAMENTO_BONUS;
/** probabilità che un signore senza legami voti l'erede legittimo: adulto, bambino (sotto reggenza) */
export const LEGITTIMITA = { adulto: 0.2, bambino: 0.05 } as const;

/** Chi può essere eletto alla morte del re della casata `casaRe`: il suo erede legittimo, poi i signori in gioco di rango almeno duca. */
export function eleggibili(state: GameState, casaRe: number): number[] {
  return [casaRe, ...state.players.map((p, j) => ({ p, j })).filter(({ p, j }) => j !== casaRe && p.caduto === undefined && rankOf(p) >= RANGO_ELEGGIBILE).map(({ j }) => j)];
}

/**
 * Per chi vota il signore i alla morte del re della casata `casaRe`, fra i candidati c (mai per sé, mai per chi l'ha offeso
 * con un ripudio); null: si astiene. `simpatia`: una congiura contro l'erede è fallita, e il regno si stringe intorno a lui.
 */
export function votoSuccessione(state: GameState, d: DinastiaState, i: number, c: number[], casaRe: number, simpatia = false): number | null {
  const q = state.q, erede = signoreOf(d, casaRe);
  let ok = c.filter(j => j !== i && !casusBelli(d, i, j, q));
  // l'usurpatore lo vota solo la famiglia
  if (erede.usurpatore && !parenti(d, i, casaRe)) ok = ok.filter(j => j !== casaRe);
  if (!ok.length) return null;
  const a = d.casate[i].appoggio;
  if (a !== undefined && ok.includes(a)) return a;
  const bot = state.players[i].bot;
  if (bot === 'facile') return ok[Math.floor(dinastiaRandom(d) * ok.length)];
  const legittimo = ok.includes(casaRe);
  // la famiglia del re sostiene il suo erede
  if (legittimo && parenti(d, i, casaRe)) return casaRe;
  if (legittimo && simpatia) return casaRe;
  // un erede bambino trova meno voti
  if (legittimo && dinastiaRandom(d) < (inReggenza(d, casaRe, q) ? LEGITTIMITA.bambino : LEGITTIMITA.adulto)) return casaRe;
  // gli altri fanno fronte comune: tutti per lo sfidante con più prestigio fuori dalla famiglia del re, perché la corona non
  // resti sempre nella stessa casata
  const fuori = ok.filter(j => j !== casaRe && !parenti(d, j, casaRe));
  const altri = fuori.length ? fuori : ok.filter(j => j !== casaRe);
  // senza uno sfidante da votare (l'unico è sé stesso) ci si astiene: nessuno è costretto a votare l'erede
  if (!altri.length) return null;
  return altri.reduce((x, y) => (prestigioOf(d, y, state.players[y]).totale > prestigioOf(d, x, state.players[x]).totale ? y : x));
}

/** I voti di un signore alla morte del re: il suo rango; un ramo cadetto ancora legato alla casata madre vota con metà del rango. */
export const pesoVoto = (d: DinastiaState, i: number, p: Player) => (casaMadre(d, i) !== null ? Math.ceil(rankOf(p) / 2) : rankOf(p));

export interface Elezione {
  re: number;
  /** voti per candidato */
  voti: Record<number, number>;
  /** il testamento del re morto, se c'era */
  testamento?: number;
}

/**
 * Alla morte del re della casata `casaRe` (il suo erede è già succeduto): si vota il successore. Il testamento del re vale
 * il suo rango più TESTAMENTO_BONUS; senza testamento la sua casata non vota. Ogni altro signore in gioco vota con il suo rango
 * (i rami cadetti con metà).
 * A pari voti, il più ricco.
 */
export function eleggiSuccessore(state: GameState, d: DinastiaState, casaRe: number, simpatia = false): Elezione {
  const c = eleggibili(state, casaRe);
  const voti: Record<number, number> = Object.fromEntries(c.map(j => [j, 0]));
  const testamento = d.testamento !== undefined && c.includes(d.testamento) ? d.testamento : undefined;
  if (testamento !== undefined) voti[testamento] += votiTestamento(rankOf(state.players[casaRe]));
  state.players.forEach((p, i) => {
    if (i === casaRe || p.caduto !== undefined) return;
    const v = votoSuccessione(state, d, i, c, casaRe, simpatia);
    if (v !== null) voti[v] += pesoVoto(d, i, p);
  });
  const re = c.reduce((a, b) => (voti[b] > voti[a] || (voti[b] === voti[a] && wealthIndex(state.players[b]) > wealthIndex(state.players[a])) ? b : a));
  d.casaRe = casaRe;
  incorona(state, d, re);
  return { re, voti, ...(testamento !== undefined ? { testamento } : {}) };
}

// ---------------------------------------------------------------- la notte della successione

/**
 * Congiura dei fratelli: alla morte del re, i fratelli e le sorelle adulti dell'erede, rimasti a corte senza nozze e senza
 * appannaggio, possono tramare per prendergli il posto. Un tiro solo, per successione: il rischio cresce con il loro numero
 * e se l'erede è un bambino. Riesce due volte su tre: l'erede muore e chi ha tramato regna, ma macchiato (usurpatore). Se
 * fallisce, chi ha tramato va in esilio e il regno si stringe intorno all'erede (simpatia).
 */
export const CONGIURA_FRATELLI = { ciascuno: 0.08, max: 0.15, bambino: 0.05, riesce: 2 / 3 } as const;
/** l'appannaggio che tiene buono un fratello o una sorella dell'erede, in scudi */
export const APPANNAGGIO = 10000;
/** dai quanti anni del re il notaio avverte dei malumori a corte */
export const ETA_MALUMORI = 55;

/** Chi può tramare contro l'erede del signore i: i suoi figli adulti a corte, senza nozze né appannaggio, escluso l'erede (dal maggiore). */
export function congiurati(d: DinastiaState, i: number, q: number): Persona[] {
  if (!d.persone || signoreOf(d, i).persona === undefined) return [];
  const e = erede(d, i, personaOf(d, signoreOf(d, i).persona!).gender);
  return figliInCasa(d, i).filter(x => x.id !== e?.id && etaP(x, q) >= ETA_MAGGIORE && !nozzeDi(d, x.id) && !x.appannaggio);
}

/** Rischio della congiura alla morte del re: con n congiurati, e un erede bambino o no. */
export function rischioCongiuraFratelli(n: number, bambino: boolean): number {
  if (!n) return 0;
  return Math.min(CONGIURA_FRATELLI.max, CONGIURA_FRATELLI.ciascuno * n) + (bambino ? CONGIURA_FRATELLI.bambino : 0);
}

export type EsitoCongiura = { esito: 'riuscita'; chi: Persona; vittima: string } | { esito: 'fallita'; chi: Persona } | null;

/**
 * La notte della successione (il re della casata i è appena morto, l'erede è succeduto): i fratelli tramano? `fratelli`: i
 * congiurati, calcolati prima della successione. Aggiorna la successione `s` se l'erede è sostituito.
 */
export function congiuraSuccessione(state: GameState, d: DinastiaState, i: number, s: Successione, fratelli: Persona[]): EsitoCongiura {
  const q = state.q, heir = signoreOf(d, i);
  const vivi = fratelli.filter(x => x.morto === undefined && x.id !== heir.persona && dimora(d, x) === i);
  if (!vivi.length || heir.persona === undefined || s.rel === 'nipote') return null;
  if (dinastiaRandom(d) >= rischioCongiuraFratelli(vivi.length, inReggenza(d, i, q))) return null;
  const chi = vivi[0];
  if (dinastiaRandom(d) >= CONGIURA_FRATELLI.riesce) {
    // scoperta: chi ha tramato lascia la corte per sempre
    chi.casa = -1;
    chi.esule = true;
    return { esito: 'fallita', chi };
  }
  // riuscita: l'erede muore prima di regnare, e chi ha tramato prende il suo posto
  const p = state.players[i], c = d.casate[i], vittima = p.name;
  muore(state, d, heir.persona);
  c.generazioni.pop();
  const nuovo: Generazione = { nome: chi.nome, ordinale: ordinaleOf(c, chi.nome), nato: chi.nato, dal: q, rango: rankOf(p), persona: chi.id, usurpatore: true };
  c.generazioni.push(nuovo);
  if (chi.gender !== p.gender) {
    p.title = rankOf(p) - 1 + chi.gender;
    p.gender = chi.gender;
  }
  p.name = nomeCompleto(nuovo);
  s.erede = p.name;
  s.etaErede = etaP(chi, q);
  s.rel = chi.gender === 1 ? 'figlio' : 'figlia';
  delete s.reggenza;
  return { esito: 'riuscita', chi, vittima };
}

export interface Prestigio {
  titoli: number;
  corone: number;
  /** matrimoni illustri, meno i ripudi */
  nozze: number;
  ricchezza: number;
  totale: number;
}

/** Prestigio della casata: titoli di ogni generazione, corone, ricchezza dell'ultimo signore (se ancora in gioco). */
export function prestigioOf(d: DinastiaState, i: number, p: Player): Prestigio {
  const gens = d.casate[i].generazioni;
  const titoli = gens.reduce((a, g, k) => a + PRESTIGIO_RANGO[(k === gens.length - 1 && p.caduto === undefined ? Math.max(g.rango, rankOf(p)) : g.rango) - 1], 0);
  const corone = gens.filter(g => g.re).length * PRESTIGIO_RE;
  const ricchezza = p.caduto === undefined ? Math.round(Math.sqrt(Math.max(0, wealthIndex(p))) / PRESTIGIO_RICCHEZZA) : 0;
  const nozze = d.casate[i].lustro ?? 0;
  return { titoli, corone, nozze, ricchezza, totale: titoli + corone + nozze + ricchezza };
}

/** Prestigio della casata con quello dei suoi rami cadetti legati dal vincolo. */
export function prestigioCasata(state: GameState, d: DinastiaState, i: number): Prestigio {
  const all = [i, ...ramiDi(d, i)].map(j => prestigioOf(d, j, state.players[j]));
  const sum = (k: keyof Prestigio) => all.reduce((a, x) => a + x[k], 0);
  return { titoli: sum('titoli'), corone: sum('corone'), nozze: sum('nozze'), ricchezza: sum('ricchezza'), totale: sum('totale') };
}

/** Casate che concorrono alla vittoria: i rami legati dal vincolo corrono con la casata madre. */
export const casatePrincipali = (d: DinastiaState) => d.casate.map((_, i) => i).filter(i => casaMadre(d, i) === null);

/** Casata con più prestigio, rami compresi (a pari prestigio, la prima). */
export function casataVincitrice(state: GameState, d: DinastiaState): number {
  return casatePrincipali(d).reduce((best, i) => (prestigioCasata(state, d, i).totale > prestigioCasata(state, d, best).totale ? i : best));
}
