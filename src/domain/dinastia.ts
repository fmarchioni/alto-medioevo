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
 *   e delle terre; città, botteghe e debiti restano all'erede. La parte dei
 *   cadetti cresce con la ricchezza della casata rispetto alle altre: chi è
 *   avanti perde di più, chi è indietro quasi nulla.
 * - La corona d'Italia è elettiva: con il trono vacante, a fine anno i grandi
 *   del regno eleggono il più ricco fra i signori che hanno le condizioni del
 *   trono; la casata dell'ultimo re solo se non c'è nessun altro. Alla morte
 *   del re il trono torna vacante.
 * - Vince la casata con più prestigio: i titoli di ogni generazione, le corone
 *   e la ricchezza dell'ultimo signore.
 *
 * Il dado della dinastia è un generatore proprio: la sequenza RND del listato
 * non cambia.
 */
import { INT } from './economy';
import { livelloOf, UMORE_START, umoreOf } from './gabelle';
import { rankOf, wealthIndex } from './rank';
import { Mulberry32 } from './rng';
import type { GameState, Gender, Player } from './types';

/** anno in cui finisce la partita: incoronazione imperiale di Ottone I (2 febbraio 962) */
export const ANNO_FINE = 962;

export type CausaMorte = 'vecchiaia' | 'malattia' | 'battaglia' | 'rivolta' | 'congiura';
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
  /** fratelli cadetti che hanno avuto parte dell'eredità */
  cadetti?: number;
}

export interface Casata {
  /** nome del fondatore: la casata è "di" lui o lei */
  fondatore: string;
  generazioni: Generazione[];
  /** pericoli corsi dall'ultimo tiro: rischio di morte in più (0..1) */
  pericoli: Partial<Record<Pericolo, number>>;
}

export interface DinastiaState {
  /** anno della fine */
  fine: number;
  rng: number;
  casate: Casata[];
  /** signore che porta la corona d'Italia (null: trono vacante) */
  re: number | null;
  /** casata dell'ultimo re: i grandi preferiscono un'altra casata */
  casaRe?: number;
  /** signori che quest'anno hanno le condizioni del trono (vacante) */
  candidati?: number[];
}

/** Parte dell'eredità presa dai cadetti, e quello che resta all'erede. */
export interface Eredita {
  cadetti: number;
  scudi: number;
  grano: number;
  acri: number;
  servi: number;
}

export interface Successione {
  morto: string;
  causa: CausaMorte;
  eta: number;
  anni: number;
  erede: string;
  etaErede: number;
  eredita: Eredita;
  /** il morto portava la corona: il trono è vacante */
  corona: boolean;
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
export const PRESTIGIO_RE = 500;
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

/** Il signore è morto: gli succede l'erede, che entra subito nel feudo. */
export function succedi(state: GameState, d: DinastiaState, i: number, causa: CausaMorte): Successione {
  const p = state.players[i], c = d.casate[i], q = state.q;
  const morto = signoreOf(d, i);
  morto.al = q;
  morto.morte = causa;
  morto.rango = Math.max(morto.rango, rankOf(p));
  const eta = etaOf(morto, q);
  const cadetti = cadettiOf(d);
  morto.cadetti = cadetti;
  const corona = d.re === i;
  if (corona) d.re = null;
  const { nome, ordinale } = nomeErede(d, c, p.gender);
  const etaErede = Math.max(ETA_MIN_EREDE, eta - between(d, DISTACCO_EREDE));
  const erede: Generazione = { nome, ordinale, nato: q - etaErede, dal: q, rango: rankOf(p) };
  c.generazioni.push(erede);
  const eredita = dividiEredita(state.players, i, cadetti);
  p.name = nomeCompleto(erede);
  // il popolo spera nel signore nuovo: l'umore torna a metà strada verso quello d'inizio
  if (p.umore !== undefined) p.umore = Math.round((p.umore + UMORE_START) / 2);
  return { morto: nomeCompleto(morto), causa, eta, anni: q - morto.dal, erede: p.name, etaErede, eredita, corona };
}

/** Il giocatore cambia il nome del suo erede (prima di cominciare a regnare). */
export function rinominaErede(state: GameState, d: DinastiaState, i: number, nome: string): boolean {
  const n = nome.trim();
  if (!n || n.length > 12) return false;
  const c = d.casate[i], g = signoreOf(d, i);
  c.generazioni.pop();
  const nuovo = { ...g, nome: n, ordinale: ordinaleOf(c, n) };
  c.generazioni.push(nuovo);
  state.players[i].name = nomeCompleto(nuovo);
  return true;
}

// ---------------------------------------------------------------- corona e prestigio

/** Fine anno: il rango più alto della generazione. */
export function annotaRango(d: DinastiaState, i: number, p: Player): void {
  const g = signoreOf(d, i);
  g.rango = Math.max(g.rango, rankOf(p));
}

/** Il signore ha le condizioni del trono: con il trono vacante è candidato all'elezione di fine anno. */
export function candidaAlTrono(d: DinastiaState, i: number): boolean {
  if (d.re !== null) return false;
  const c = (d.candidati ??= []);
  if (!c.includes(i)) c.push(i);
  return true;
}

/** Fine anno: i grandi eleggono il più ricco fra i candidati, se possibile di un'altra casata dell'ultimo re. Ritorna l'eletto. */
export function eleggiRe(state: GameState, d: DinastiaState): number | null {
  const c = (d.candidati ?? []).filter(i => state.players[i].caduto === undefined);
  delete d.candidati;
  if (d.re !== null || !c.length) return null;
  const others = c.filter(i => i !== d.casaRe);
  const pool = others.length ? others : c;
  const re = pool.reduce((a, b) => (wealthIndex(state.players[b]) > wealthIndex(state.players[a]) ? b : a));
  d.re = re;
  d.casaRe = re;
  signoreOf(d, re).re = true;
  return re;
}

export interface Prestigio {
  titoli: number;
  corone: number;
  ricchezza: number;
  totale: number;
}

/** Prestigio della casata: titoli di ogni generazione, corone, ricchezza dell'ultimo signore (se ancora in gioco). */
export function prestigioOf(d: DinastiaState, i: number, p: Player): Prestigio {
  const gens = d.casate[i].generazioni;
  const titoli = gens.reduce((a, g, k) => a + PRESTIGIO_RANGO[(k === gens.length - 1 && p.caduto === undefined ? Math.max(g.rango, rankOf(p)) : g.rango) - 1], 0);
  const corone = gens.filter(g => g.re).length * PRESTIGIO_RE;
  const ricchezza = p.caduto === undefined ? Math.round(Math.sqrt(Math.max(0, wealthIndex(p))) / PRESTIGIO_RICCHEZZA) : 0;
  return { titoli, corone, ricchezza, totale: titoli + corone + ricchezza };
}

/** Casata con più prestigio (a pari prestigio, la prima). */
export function casataVincitrice(state: GameState, d: DinastiaState): number {
  return state.players.reduce((best, p, i) => (prestigioOf(d, i, p).totale > prestigioOf(d, best, state.players[best]).totale ? i : best), 0);
}
