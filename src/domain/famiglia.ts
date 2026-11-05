/**
 * Dinastia, passo 2: la famiglia del signore e i matrimoni.
 *
 * - Ogni signore ha un consorte e dei figli: nascono finché il signore è
 *   sposato e non troppo vecchio, e possono morire bambini. L'erede è il
 *   primogenito (del genere del signore, se c'è); gli altri figli rimasti in
 *   casa sono i cadetti che si dividono l'eredità.
 * - I figli dai 14 anni (e il signore, se è vedovo) si sposano:
 *   - con un figlio di un'altra casata della partita: le due casate sono
 *     parenti finché vivono gli sposi. Fra parenti non si pagano tributi, non
 *     ci si fa guerra (Spade e Castelli) e all'elezione del re ci si appoggia;
 *   - con una casata dei Franchi, dei Longobardi o dei Bizantini: quella fazione
 *     non attacca più, ma le sue rivali vengono più spesso;
 *   - con la nobiltà del luogo: una piccola dote, nessun legame.
 *   La sposa va nella casa dello sposo; la sua famiglia paga la dote.
 * - Il ripudio scioglie il matrimonio: la dote torna indietro, la casata perde
 *   prestigio e l'offeso ha un casus belli per alcuni anni (una fazione offesa
 *   si vendica con nuovi attacchi).
 *
 * Tutto usa il dado della dinastia: la sequenza RND del listato non cambia.
 */
import { addPact, pactsOf, type FactionId } from './fazioni';
import { rankOf, wealthIndex } from './rank';
import type { Gender, GameState, Player } from './types';
import { dinastiaRandom, NOMI_F, NOMI_M, type DinastiaState } from './dinastia';

export interface Persona {
  id: number;
  nome: string;
  gender: Gender;
  /** anno di nascita (q) */
  nato: number;
  /** casata di nascita (indice del signore); -1: forestiero (fazione o nobiltà del luogo) */
  casa: number;
  /** id del padre o della madre signore */
  genitore?: number;
  morto?: number;
}

export type Sposo = { k: 'casata'; id: number } | { k: 'fazione'; f: FactionId } | { k: 'locale' };

export interface Matrimonio {
  id: number;
  /** il membro della casata che si sposa */
  a: number;
  /** con chi: un membro di un'altra casata, una fazione, la nobiltà del luogo */
  con: Sposo;
  /** nome del consorte forestiero (fazione o nobiltà del luogo) */
  nomeCon?: string;
  dal: number;
  /** dote pagata dalla famiglia della sposa */
  dote: number;
  /** fertilità: moltiplica la probabilità delle nascite del signore (assente: 1). Un matrimonio su sette è quasi sterile */
  fertile?: number;
  fine?: number;
  motivo?: 'morte' | 'ripudio';
  /** casata che ha ripudiato */
  ripudioDa?: number;
}

/** Proposta di nozze fra due casate della partita, in attesa della risposta dell'altra. */
export interface PropostaNozze {
  id: number;
  da: number;
  a: number;
  /** membro di chi propone, e membro dell'altra casata */
  mio: number;
  suo: number;
  q: number;
}

/** L'offeso (`da`) ha un casus belli contro `contro` fino all'anno `fino`. */
export interface CasusBelli {
  da: number;
  contro: number;
  fino: number;
}

// ---------------------------------------------------------------- costanti

export const ETA_NOZZE = 14;
export const ETA_MAGGIORE = 16;
/** nascite: probabilità annua per un signore sposato, fino a 45 anni e poi fino a 55 */
export const NASCITA = { giovane: 0.3, maturo: 0.12 } as const;
export const MAX_FIGLI = 8;
/** fertilità di un matrimonio: quasi sterile con probabilità STERILE, altrimenti fra 0,7 e 1,4 */
export const STERILE = 0.15;
const fertilita = (d: DinastiaState) => (dinastiaRandom(d) < STERILE ? 0.1 : 0.7 + 0.7 * dinastiaRandom(d));
/** morte dei figli rimasti in casa, per età: sotto i 5 anni, sotto i 15, adulti */
export const MORTE_FIGLI = { bambino: 0.05, ragazzo: 0.015, adulto: 0.01 } as const;
/** morte del consorte, ogni anno */
export const MORTE_CONSORTE = 0.025;
/** fazioni che danno spose e sposi, con il rango minimo per chiederli e la dote (le rivali: RIVALI in fazioni.ts) */
export const NOZZE_FAZIONE: Partial<Record<FactionId, { rango: number; dote: number; casata: string }>> = {
  franchi: { rango: 2, dote: 1500, casata: 'di una casata franca di Borgogna' },
  longobardi: { rango: 2, dote: 1000, casata: 'della casa dei principi di Benevento' },
  bizantini: { rango: 3, dote: 3000, casata: 'della corte di Costantinopoli' },
};
/** dote fra casate: parte del tesoro della famiglia della sposa, con un minimo */
export const DOTE_CASATA = { quota: 0.08, min: 300 } as const;
export const DOTE_LOCALE = 200;
/** le doti crescono con gli anni, come le ricchezze */
export const doteAnno = (base: number, q: number) => Math.round(base * (1 + q / 25));
/** ripudio: anni di casus belli e di vendetta della fazione, prestigio perduto */
export const CASUS_ANNI = 8;
export const PRESTIGIO_RIPUDIO = 100;
/** prestigio dei matrimoni illustri: con un'altra casata, con una fazione */
export const PRESTIGIO_NOZZE = { casata: 40, franchi: 50, longobardi: 50, bizantini: 100 } as const;
/** reggenza per un erede bambino: parte della rendita che il consiglio di reggenza trattiene */
export const REGGENZA_QUOTA = 0.15;

// ---------------------------------------------------------------- persone

export const personaOf = (d: DinastiaState, id: number) => d.persone!.find(x => x.id === id)!;
export const vivo = (x: Persona) => x.morto === undefined;
export const etaP = (x: Persona, q: number) => q - x.nato;

function nuovaPersona(d: DinastiaState, x: Omit<Persona, 'id'>): Persona {
  const p: Persona = { id: (d.nextId = (d.nextId ?? 0) + 1), ...x };
  (d.persone ??= []).push(p);
  return p;
}

/** Il matrimonio in corso di una persona. */
export const nozzeDi = (d: DinastiaState, id: number) =>
  (d.matrimoni ?? []).find(m => m.fine === undefined && (m.a === id || (m.con.k === 'casata' && m.con.id === id)));

/** Il consorte di una persona nel matrimonio m: id (casata) o null. */
const coniuge = (m: Matrimonio, id: number) => (m.a === id ? (m.con.k === 'casata' ? m.con.id : null) : m.a);

/** Genere della linea della casata: quello del suo signore (i figli di quel genere restano in casa quando si sposano). */
const linea = (d: DinastiaState, casa: number): Gender | null => (casa >= 0 && d.casate[casa] ? signoreP(d, casa).gender : null);

/** Chi si sposa resta in casa se è il signore, o se ha il genere della linea (e il coniuge non resta anche lui nella sua: allora va la sposa). */
function resta(d: DinastiaState, x: Persona): boolean {
  if (x.casa >= 0 && signoreP(d, x.casa).id === x.id) return true;
  if (x.gender !== linea(d, x.casa)) return false;
  const m = nozzeDi(d, x.id), other = m ? coniuge(m, x.id) : null;
  if (other === null) return true;
  const y = personaOf(d, other);
  const yStays = signoreP(d, y.casa).id === y.id || y.gender === linea(d, y.casa);
  return !yStays || x.gender === 1;
}

/** Dove vive una persona; -1 se vive fuori dalle casate della partita (sposata a una fazione o a un nobile del luogo). */
export function dimora(d: DinastiaState, x: Persona): number {
  const m = nozzeDi(d, x.id);
  if (!m || resta(d, x)) return x.casa;
  const other = coniuge(m, x.id);
  return other === null ? -1 : personaOf(d, other).casa;
}

/** Il signore della casata i, come persona. */
export const signoreP = (d: DinastiaState, i: number) => personaOf(d, d.casate[i].generazioni[d.casate[i].generazioni.length - 1].persona!);

/** Figli del signore in vita che vivono ancora in casa, dal più vecchio. */
export function figliInCasa(d: DinastiaState, i: number): Persona[] {
  const s = signoreP(d, i);
  return (d.persone ?? []).filter(x => x.genitore === s.id && vivo(x) && dimora(d, x) === i).sort((a, b) => a.nato - b.nato || a.id - b.id);
}

/** Tutti i figli in vita del signore, anche quelli sposati fuori. */
export const figliDi = (d: DinastiaState, i: number) => {
  const s = signoreP(d, i);
  return (d.persone ?? []).filter(x => x.genitore === s.id && vivo(x)).sort((a, b) => a.nato - b.nato || a.id - b.id);
};

function nomeFiglio(d: DinastiaState, i: number, gender: Gender): string {
  const lista: readonly string[] = gender === 1 ? NOMI_M : NOMI_F;
  const avi = [...new Set(d.casate[i].generazioni.map(g => personaOf(d, g.persona!)).filter(x => x.gender === gender).map(x => x.nome))];
  const fratelli = figliDi(d, i).map(x => x.nome);
  const liberi = lista.filter(n => !fratelli.includes(n));
  if (avi.length && dinastiaRandom(d) < 0.35) {
    const a = avi[Math.floor(dinastiaRandom(d) * avi.length)];
    if (!fratelli.includes(a)) return a;
  }
  return (liberi.length ? liberi : lista)[Math.floor(dinastiaRandom(d) * (liberi.length || lista.length))];
}

const nomeForestiero = (d: DinastiaState, gender: Gender) => {
  const lista: readonly string[] = gender === 1 ? NOMI_M : NOMI_F;
  return lista[Math.floor(dinastiaRandom(d) * lista.length)];
};

/** Fondatori: sposati con la nobiltà del luogo, con da 0 a 2 figli piccoli. */
export function initFamiglia(d: DinastiaState, state: GameState): void {
  d.persone = [];
  d.matrimoni = [];
  d.proposte = [];
  d.casus = [];
  state.players.forEach((p, i) => {
    const g = d.casate[i].generazioni[0];
    const s = nuovaPersona(d, { nome: p.name, gender: p.gender, nato: g.nato, casa: i });
    g.persona = s.id;
    d.matrimoni!.push({ id: (d.nextId = (d.nextId ?? 0) + 1), a: s.id, con: { k: 'locale' }, nomeCon: nomeForestiero(d, p.gender === 1 ? 6 : 1), dal: state.q - 1, dote: 0, fertile: fertilita(d) });
    const k = Math.floor(dinastiaRandom(d) * 3);
    for (let n = 0; n < k; n++) {
      const gender: Gender = dinastiaRandom(d) < 0.5 ? 1 : 6;
      nuovaPersona(d, { nome: nomeFiglio(d, i, gender), gender, nato: state.q - Math.floor(dinastiaRandom(d) * 10), casa: i, genitore: s.id });
    }
  });
}

// ---------------------------------------------------------------- anno della famiglia

export type FattoFamiglia =
  | { k: 'nascita'; chi: string; gender: Gender }
  | { k: 'lutto'; chi: string; rel: 'figlio' | 'figlia' | 'consorte' };

/** Rischio annuo di morte di un membro della casata che non è il signore. */
export function rischioMembro(eta: number): number {
  if (eta < 5) return MORTE_FIGLI.bambino;
  if (eta < 15) return MORTE_FIGLI.ragazzo;
  return MORTE_FIGLI.adulto + 0.02 * Math.exp((eta - 45) / 10);
}

/**
 * Inizio del turno: nascite e morti fra i nati della casata (anche i cadetti e
 * chi si è sposato altrove) e fra i consorti forestieri. Il signore muore a
 * parte, in rollMorte. Si raccontano solo i lutti della famiglia del signore.
 */
export function annoFamiglia(state: GameState, d: DinastiaState, i: number): FattoFamiglia[] {
  const out: FattoFamiglia[] = [], q = state.q, s = signoreP(d, i);
  // il primo anno la famiglia è com'è: niente nascite né lutti prima che il signore abbia governato
  if (q === 0) return out;
  for (const x of (d.persone ?? []).filter(y => y.casa === i && vivo(y) && y.id !== s.id)) {
    if (dinastiaRandom(d) >= rischioMembro(etaP(x, q))) continue;
    const m = nozzeDi(d, x.id);
    const rel = x.genitore === s.id && dimora(d, x) === i ? (x.gender === 1 ? 'figlio' : 'figlia') : m && coniuge(m, x.id) === s.id ? 'consorte' : null;
    muore(state, d, x.id);
    if (rel) out.push({ k: 'lutto', chi: x.nome, rel });
  }
  // i consorti forestieri (fazioni, nobiltà del luogo) dei membri della casata
  for (const m of (d.matrimoni ?? []).filter(y => y.fine === undefined && y.con.k !== 'casata' && personaOf(d, y.a).casa === i)) {
    if (dinastiaRandom(d) >= MORTE_CONSORTE) continue;
    if (m.a === s.id) out.push({ k: 'lutto', chi: m.nomeCon ?? '', rel: 'consorte' });
    chiudi(state, d, m, q, 'morte');
  }
  const sposato = nozzeDi(d, s.id), eta = etaP(s, q);
  const pNascita = (eta < 45 ? NASCITA.giovane : eta < 55 ? NASCITA.maturo : 0) * (sposato?.fertile ?? 1);
  if (sposato && figliDi(d, i).length < MAX_FIGLI && dinastiaRandom(d) < pNascita) {
    const gender: Gender = dinastiaRandom(d) < 0.5 ? 1 : 6;
    const x = nuovaPersona(d, { nome: nomeFiglio(d, i, gender), gender, nato: q, casa: i, genitore: s.id });
    out.push({ k: 'nascita', chi: x.nome, gender });
  }
  return out;
}

/** Muore una persona: il suo matrimonio si chiude. */
export function muore(state: GameState, d: DinastiaState, id: number): void {
  const x = personaOf(d, id);
  x.morto = state.q;
  const m = nozzeDi(d, id);
  if (m) chiudi(state, d, m, state.q, 'morte');
}

/** Nome del consorte di `id` nel matrimonio m. */
export function nomeConsorte(d: DinastiaState, m: Matrimonio, id: number): string {
  const other = coniuge(m, id);
  return other !== null ? personaOf(d, other).nome : m.nomeCon ?? '';
}

// ---------------------------------------------------------------- parentele

/** Casata del coniuge nel matrimonio (null: fazione o nobiltà del luogo). */
const casaDi = (d: DinastiaState, m: Matrimonio) => [personaOf(d, m.a).casa, m.con.k === 'casata' ? personaOf(d, m.con.id).casa : null] as const;

/** Le casate i e j sono imparentate (un matrimonio in corso fra loro). */
export function parenti(d: DinastiaState, i: number, j: number): boolean {
  if (i === j) return false;
  return (d.matrimoni ?? []).some(m => {
    if (m.fine !== undefined || m.con.k !== 'casata') return false;
    const [a, b] = casaDi(d, m);
    return (a === i && b === j) || (a === j && b === i);
  });
}

/** Fazioni con cui la casata i è imparentata. */
export function fazioniParenti(d: DinastiaState, i: number): FactionId[] {
  return [...new Set((d.matrimoni ?? []).filter(m => m.fine === undefined && m.con.k === 'fazione' && personaOf(d, m.a).casa === i).map(m => (m.con as { f: FactionId }).f))];
}

/** Matrimoni in corso che legano le casate i e j. */
export function legami(d: DinastiaState, i: number, j: number): Matrimonio[] {
  return (d.matrimoni ?? []).filter(m => {
    if (m.fine !== undefined || m.con.k !== 'casata') return false;
    const [a, b] = casaDi(d, m);
    return (a === i && b === j) || (a === j && b === i);
  });
}

/** La casata i ha un casus belli contro j (j ha ripudiato qualcuno di i). */
export const casusBelli = (d: DinastiaState, i: number, j: number, q: number) => (d.casus ?? []).some(c => c.da === i && c.contro === j && c.fino >= q);

// ---------------------------------------------------------------- nozze

/** Membri della casata i che si possono sposare: in casa, vivi, almeno 14 anni, senza consorte. */
export function sposabili(d: DinastiaState, i: number, q: number): Persona[] {
  const s = signoreP(d, i);
  return [s, ...figliInCasa(d, i)].filter(x => vivo(x) && etaP(x, q) >= ETA_NOZZE && !nozzeDi(d, x.id));
}

/** Pretendenti di un'altra casata per il membro x di i: genere opposto, sposabili, casata in gioco. */
export function pretendenti(state: GameState, d: DinastiaState, i: number, x: Persona): { casa: number; p: Persona }[] {
  return state.players.flatMap((pl, j) => (j === i || pl.caduto !== undefined ? [] : sposabili(d, j, state.q).filter(y => y.gender !== x.gender).map(p => ({ casa: j, p }))));
}

/** Fazioni che darebbero uno sposo o una sposa alla casata (per il rango del signore). */
export function fazioniSposabili(p: Player): FactionId[] {
  return (Object.keys(NOZZE_FAZIONE) as FactionId[]).filter(f => rankOf(p) >= NOZZE_FAZIONE[f]!.rango);
}

/** Dote fra due casate: la paga la famiglia della sposa (in base al suo tesoro). */
export const doteCasata = (state: GameState, casaSposa: number) =>
  Math.max(doteAnno(DOTE_CASATA.min, state.q), Math.round(Math.max(0, state.players[casaSposa].scudi) * DOTE_CASATA.quota));

/** Dote con una fazione o la nobiltà del luogo, per il membro x: positiva se la riceve la casata (sposa forestiera), negativa se la paga. */
export function doteForestiera(con: Sposo, x: Persona, q: number): number {
  const base = con.k === 'fazione' ? NOZZE_FAZIONE[con.f]!.dote : DOTE_LOCALE;
  const v = doteAnno(base, q);
  return x.gender === 1 ? v : -v;
}

/** Perché il membro x di i non può sposare con: null se può. */
export function nozzeBlock(state: GameState, d: DinastiaState, i: number, x: Persona, con: Sposo): string | null {
  const q = state.q;
  if (!sposabili(d, i, q).some(y => y.id === x.id)) return `${x.nome} non si può sposare ora`;
  if (con.k === 'casata') {
    const y = personaOf(d, con.id), j = y.casa;
    if (!pretendenti(state, d, i, x).some(z => z.p.id === y.id)) return `${y.nome} non si può sposare ora`;
    if ((d.proposte ?? []).some(pr => pr.mio === x.id || pr.suo === x.id || pr.mio === y.id || pr.suo === y.id)) return "c'è già una proposta di nozze in attesa";
    if (casusBelli(d, j, i, q)) return `${state.players[j].name} non dimentica il ripudio: non vuole nozze con voi`;
    const bride = x.gender === 6 ? i : j;
    if (bride === i && state.players[i].scudi < doteCasata(state, i)) return 'non avete in contanti la dote della sposa';
  } else if (con.k === 'fazione') {
    if (!fazioniSposabili(state.players[i]).includes(con.f)) return 'il vostro rango non basta per quelle nozze';
    if ((d.casus ?? []).some(c => c.da === -1 - fazioneIndex(con.f) && c.contro === i && c.fino >= q)) return 'quella fazione non perdona il ripudio';
    const dote = doteForestiera(con, x, q);
    if (dote < 0 && state.players[i].scudi < -dote) return 'non avete in contanti la dote della sposa';
  } else {
    const dote = doteForestiera(con, x, q);
    if (dote < 0 && state.players[i].scudi < -dote) return 'non avete in contanti la dote della sposa';
  }
  return null;
}

const FAZ_ORDER: FactionId[] = ['franchi', 'ungari', 'longobardi', 'bizantini', 'saraceni'];
const fazioneIndex = (f: FactionId) => FAZ_ORDER.indexOf(f);

/** Il matrimonio è celebrato: dote, patto con la fazione, prestigio. */
export function celebra(state: GameState, d: DinastiaState, i: number, x: Persona, con: Sposo): Matrimonio {
  const q = state.q, ps = state.players;
  let dote = 0, nomeCon: string | undefined;
  if (con.k === 'casata') {
    const y = personaOf(d, con.id), j = y.casa;
    const bride = x.gender === 6 ? i : j, groom = bride === i ? j : i;
    dote = Math.min(doteCasata(state, bride), Math.max(0, ps[bride].scudi));
    ps[bride].scudi -= dote;
    ps[groom].scudi += dote;
    d.casate[i].lustro = (d.casate[i].lustro ?? 0) + PRESTIGIO_NOZZE.casata;
    d.casate[j].lustro = (d.casate[j].lustro ?? 0) + PRESTIGIO_NOZZE.casata;
  } else {
    const v = doteForestiera(con, x, q);
    dote = Math.abs(v);
    ps[i].scudi += v;
    nomeCon = nomeForestiero(d, x.gender === 1 ? 6 : 1);
    if (con.k === 'fazione') {
      d.casate[i].lustro = (d.casate[i].lustro ?? 0) + PRESTIGIO_NOZZE[con.f as 'franchi'];
      if (ps[i].patti) addPact(ps[i], con.f, 'parentela', q).until = q + 999;
    }
  }
  const m: Matrimonio = { id: (d.nextId = (d.nextId ?? 0) + 1), a: x.id, con, ...(nomeCon ? { nomeCon } : {}), dal: q, dote, fertile: fertilita(d) };
  d.matrimoni!.push(m);
  return m;
}

/** Chiude un matrimonio: il patto con la fazione si scioglie. */
function chiudi(state: GameState, d: DinastiaState, m: Matrimonio, q: number, motivo: 'morte' | 'ripudio', da?: number): void {
  m.fine = q;
  m.motivo = motivo;
  if (da !== undefined) m.ripudioDa = da;
  if (m.con.k === 'fazione') {
    const casa = personaOf(d, m.a).casa, p = state.players[casa], f = m.con.f;
    // il patto resta finché c'è un altro matrimonio con la stessa fazione
    if (p?.patti && !fazioniParenti(d, casa).includes(f)) p.patti = pactsOf(p).filter(x => !(x.faction === f && x.kind === 'parentela'));
  }
}

/** Matrimoni in corso che la casata i può ripudiare: quelli dei suoi membri in casa. */
export function ripudiabili(d: DinastiaState, i: number): Matrimonio[] {
  const s = signoreP(d, i), fam = [s, ...figliInCasa(d, i)];
  return fam.flatMap(x => {
    const m = nozzeDi(d, x.id);
    return m ? [m] : [];
  });
}

export interface Ripudio {
  /** casata offesa (null: fazione o nobiltà del luogo) */
  offesa: number | null;
  fazione?: FactionId;
  /** dote restituita */
  dote: number;
  chi: string;
  coniuge: string;
}

/** La casata i ripudia: la dote torna a chi l'ha pagata, l'offeso ha un casus belli, la casata perde prestigio. */
export function ripudia(state: GameState, d: DinastiaState, i: number, m: Matrimonio): Ripudio {
  const q = state.q, ps = state.players;
  const membro = [m.a, m.con.k === 'casata' ? m.con.id : -1].map(id => (id >= 0 ? personaOf(d, id) : null)).find(x => x && x.casa === i)!;
  const coniugeNome = nomeConsorte(d, m, membro.id);
  let offesa: number | null = null, fazione: FactionId | undefined;
  // la dote torna indietro: la restituisce chi l'aveva ricevuta (lo sposo)
  if (m.con.k === 'casata') {
    const a = personaOf(d, m.a).casa, b = personaOf(d, m.con.id).casa;
    offesa = a === i ? b : a;
    const groomCasa = personaOf(d, m.a).gender === 1 ? a : b;
    const brideCasa = groomCasa === a ? b : a;
    ps[groomCasa].scudi -= m.dote;
    ps[brideCasa].scudi += m.dote;
    (d.casus ??= []).push({ da: offesa, contro: i, fino: q + CASUS_ANNI - 1 });
  } else {
    if (membro.gender === 1) ps[i].scudi -= m.dote;
    else ps[i].scudi += m.dote;
    if (m.con.k === 'fazione') {
      fazione = m.con.f;
      (d.casus ??= []).push({ da: -1 - fazioneIndex(fazione), contro: i, fino: q + CASUS_ANNI - 1 });
      if (ps[i].patti) addPact(ps[i], fazione, 'vendetta', q);
    }
  }
  chiudi(state, d, m, q, 'ripudio', i);
  d.casate[i].lustro = (d.casate[i].lustro ?? 0) - PRESTIGIO_RIPUDIO;
  return { offesa, ...(fazione ? { fazione } : {}), dote: m.dote, chi: membro.nome, coniuge: coniugeNome };
}

// ---------------------------------------------------------------- successione

/** L'erede: il primogenito in casa del genere preferito, altrimenti dell'altro. null: nessun figlio. */
export function erede(d: DinastiaState, i: number, gender: Gender): Persona | null {
  const f = figliInCasa(d, i);
  return f.find(x => x.gender === gender) ?? f[0] ?? null;
}

/** Erede collaterale, se il signore muore senza figli: un nipote o una nipote. */
export function nipote(d: DinastiaState, i: number, gender: Gender, q: number): Persona {
  const eta = 18 + Math.floor(dinastiaRandom(d) * 15);
  return nuovaPersona(d, { nome: nomeFiglio(d, i, gender), gender, nato: q - eta, casa: i });
}


/**
 * Risposta di un signore del computer a una proposta di nozze. Il facile
 * accetta quasi sempre; il medio volentieri, e ancor più da chi è più ricco;
 * il difficile non si imparenta con chi lo sta superando in prestigio, a meno
 * che la dote non sia sua.
 */
export function accettaNozze(state: GameState, d: DinastiaState, prop: { da: number; a: number; mio: number }, level: 'facile' | 'medio' | 'difficile', prestigio: (i: number) => number): boolean {
  const r = dinastiaRandom(d);
  const ricco = wealthIndex(state.players[prop.da]) >= wealthIndex(state.players[prop.a]);
  if (level === 'facile') return r < 0.75;
  if (level === 'medio') return r < (ricco ? 0.75 : 0.5);
  // difficile: la dote la riceve chi ha lo sposo
  const ricevo = personaOf(d, prop.mio).gender === 6;
  return prestigio(prop.da) <= prestigio(prop.a) * 1.1 || ricevo ? r < 0.8 : r < 0.15;
}

/** età da cui un signore del computer non rischia più la vita senza necessità */
export const ETA_PRUDENTE = 55;

/**
 * Il signore i ha ragioni per non rischiare la vita: è vecchio, o non ha in
 * casa un erede adulto (morirebbe lasciando un bambino, o nessuno).
 */
export function prudente(state: GameState, i: number): boolean {
  const d = state.dinastia;
  if (!d?.persone) return false;
  const s = signoreP(d, i), q = state.q;
  if (etaP(s, q) >= ETA_PRUDENTE) return true;
  return !figliInCasa(d, i).some(x => etaP(x, q) >= ETA_MAGGIORE);
}

/** Proposte di nozze rivolte alla casata i. */
export const proposteA = (d: DinastiaState, i: number) => (d.proposte ?? []).filter(x => x.a === i);
