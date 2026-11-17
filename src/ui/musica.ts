/**
 * Musica del gioco, configurata in public/musica/musica.json (si cambia senza toccare il codice):
 *
 * - Sottofondo: per ogni modalità (gioco base, vie dei mercanti, spade e castelli) una lista di tracce,
 *   suonate una dopo l'altra e poi da capo. Quando una traccia sta per finire cala per `sfumatura`
 *   secondi, poi `silenzio` secondi di pausa, poi attacca la seguente. Cambiando modalità (una partita
 *   con un'altra espansione) si passa alla sua lista allo stesso modo.
 * - Momenti forti: il sottofondo sfuma e si ferma al suo punto, e suona da sola una traccia breve (requiem,
 *   festa, battaglia...; stacchi.ts sceglie quale). Lasciata la schermata ("Prosegui") la traccia breve sfuma
 *   e il sottofondo riprende da dove era; dura comunque al più `durataMomenti` secondi (i jingle del grano fino in fondo).
 *
 * I browser non suonano prima di un gesto del giocatore: la musica parte al primo clic o tasto.
 * La scelta sì/no del giocatore si ricorda. Se il file di configurazione manca, valgono i valori qui sotto.
 */
import { volumeMusica } from './suoni';

const ENV = (import.meta as { env?: { BASE_URL?: string; MODE?: string } }).env;
const BASE: string = ENV?.BASE_URL ?? '/';
const CARTELLA = `${BASE}musica/`;
export const CONFIG_URL = `${CARTELLA}musica.json`;
const KEY = 'alto-medioevo/musica';

/** Le tracce brevi dei momenti forti. */
export type Stacco = 'requiem' | 'scongiuro' | 'festa' | 'battaglia' | 'sorpresa' | 'gloria' | 'intrigo' | 'alleluia' | 'sin';
export const STACCHI: readonly Stacco[] = ['requiem', 'scongiuro', 'festa', 'battaglia', 'sorpresa', 'gloria', 'intrigo', 'alleluia', 'sin'];
/** I jingle dopo la distribuzione del grano (culle piene, morti di fame): suonano fino in fondo, oltre `durataMomenti`. */
const JINGLE: readonly Stacco[] = ['alleluia', 'sin'];
const JINGLE_MAX_S = 90;

export interface ConfigMusica {
  /** tracce di sottofondo per modalità: 'base' o l'id dell'espansione */
  modalita: Record<string, string[]>;
  momenti: Record<Stacco, string>;
  volume: number;
  sfumatura: number;
  silenzio: number;
  durataMomenti: number;
}

/** Valori se public/musica/musica.json manca o è sbagliato (gli stessi del file). */
export const CONFIG_DEFAULT: ConfigMusica = {
  modalita: {
    base: ['pax-lombardiae.mp3', 'main_game2.mp3'],
    'vie-mercanti': ['pax-lombardiae.mp3', 'main_game2.mp3'],
    'spade-castelli': ['main_battle_expansion.mp3', 'main_battle_expansion2.mp3'],
  },
  momenti: { requiem: 'requiem.mp3', scongiuro: 'scongiuro.mp3', festa: 'festa.mp3', battaglia: 'battaglia.mp3', sorpresa: 'sorpresa.mp3', gloria: 'gloria.mp3', intrigo: 'intrigo.mp3', alleluia: 'alleluia.mp3', sin: 'sin.mp3' },
  volume: 0.35,
  sfumatura: 6,
  silenzio: 3,
  durataMomenti: 22,
};

let config: ConfigMusica = CONFIG_DEFAULT;

/** Unisce la configurazione letta ai valori di partenza: ciò che manca o è sbagliato resta com'era. */
export function leggiConfig(j: unknown): ConfigMusica {
  const o = (j && typeof j === 'object' ? j : {}) as Partial<ConfigMusica>;
  const num = (v: unknown, d: number, max: number) => (typeof v === 'number' && v >= 0 && v <= max ? v : d);
  const liste = Object.fromEntries(Object.entries(o.modalita ?? {}).filter(([, v]) => Array.isArray(v) && v.length && v.every(x => typeof x === 'string')));
  const momenti = Object.fromEntries(STACCHI.map(t => [t, typeof o.momenti?.[t] === 'string' ? o.momenti[t] : CONFIG_DEFAULT.momenti[t]])) as Record<Stacco, string>;
  return {
    modalita: { ...CONFIG_DEFAULT.modalita, ...liste },
    momenti,
    volume: num(o.volume, CONFIG_DEFAULT.volume, 1),
    sfumatura: num(o.sfumatura, CONFIG_DEFAULT.sfumatura, 60),
    silenzio: num(o.silenzio, CONFIG_DEFAULT.silenzio, 60),
    durataMomenti: num(o.durataMomenti, CONFIG_DEFAULT.durataMomenti, 600),
  };
}

let caricamento: Promise<void> | null = null;
/** Legge public/musica/musica.json (una volta). */
function caricaConfig(): Promise<void> {
  if (caricamento) return caricamento;
  // nei test non c'è un server da cui leggerla: valgono i valori qui sotto
  caricamento = typeof fetch === 'undefined' || ENV?.MODE === 'test' ? Promise.resolve()
    : fetch(CONFIG_URL, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(j => { if (j) config = leggiConfig(j); }).catch(() => undefined);
  return caricamento;
}

export const tracceDi = (modo: string) => config.modalita[modo] ?? config.modalita.base ?? [];
export const staccoUrl = (t: Stacco) => CARTELLA + config.momenti[t];

/** La musica è accesa (preferenza del giocatore; all'inizio sì). */
export function musicaAccesa(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'no';
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------- sfumature

const sfumature = new Map<HTMLAudioElement, ReturnType<typeof setInterval>>();
/** Porta il volume di `a` a `to` in `ms`; poi `dopo`. */
function sfuma(a: HTMLAudioElement, to: number, ms: number, dopo?: () => void): void {
  clearInterval(sfumature.get(a));
  const from = a.volume, steps = Math.max(1, Math.round(ms / 50));
  let k = 0;
  const t = setInterval(() => {
    k++;
    a.volume = Math.min(1, Math.max(0, from + ((to - from) * k) / steps));
    if (k >= steps) {
      clearInterval(t);
      sfumature.delete(a);
      dopo?.();
    }
  }, 50);
  sfumature.set(a, t);
}

function ferma(a: HTMLAudioElement): void {
  clearInterval(sfumature.get(a));
  sfumature.delete(a);
  a.pause();
}

function avviaAudio(a: HTMLAudioElement, fallito: () => void): void {
  try {
    void a.play()?.catch(fallito);
  } catch {
    fallito();
  }
}

// ---------------------------------------------------------------- sottofondo

let modo = 'base';
const indice: Record<string, number> = {};
/** la traccia di sottofondo che suona (o che sta finendo) */
let audio: HTMLAudioElement | null = null;
/** la traccia sta calando verso la fine (o verso il cambio di modalità) */
let finendo = false;
/** la pausa fra una traccia e l'altra */
let pausa: ReturnType<typeof setTimeout> | null = null;
/** una traccia breve suona da sola: il sottofondo è in pausa, al suo punto */
let sospesa = false;
const ATTACCO_MS = 1500;

/** il volume del sottofondo: quello di musica.json per quello scelto dal giocatore (cursore "Musica") */
const livello = () => config.volume * (volumeMusica() / 100);

/** Attacca la traccia di turno della modalità, salendo piano. */
function attacca(): void {
  pausa = null;
  // durante una traccia breve il sottofondo tace: la traccia seguente aspetta che finisca
  if (sospesa) {
    pausa = setTimeout(attacca, 1000);
    return;
  }
  const lista = tracceDi(modo);
  if (!lista.length || !musicaAccesa() || typeof Audio === 'undefined') return;
  const k = (indice[modo] ?? 0) % lista.length;
  const a = new Audio(CARTELLA + lista[k]);
  a.volume = 0;
  audio = a;
  finendo = false;
  // poco prima della fine si comincia a calare
  a.addEventListener('timeupdate', () => {
    if (audio !== a || finendo || !Number.isFinite(a.duration)) return;
    const resta = a.duration - a.currentTime;
    if (resta <= config.sfumatura) {
      finendo = true;
      sfuma(a, 0, Math.max(200, resta * 1000));
    }
  });
  a.addEventListener('ended', () => audio === a && passa());
  avviaAudio(a, () => {
    // senza un gesto del giocatore il browser rifiuta: si riprova al prossimo clic
    if (audio === a) audio = null;
  });
  sfuma(a, livello(), ATTACCO_MS);
}

/** Fine di una traccia: un po' di silenzio, poi la seguente. */
function passa(): void {
  if (audio) ferma(audio);
  audio = null;
  indice[modo] = (indice[modo] ?? 0) + 1;
  if (pausa) clearTimeout(pausa);
  pausa = setTimeout(attacca, config.silenzio * 1000);
}

/** Suona, se accesa e se non sta già suonando. */
function suona(): void {
  if (!musicaAccesa() || (audio && !audio.paused) || pausa) return;
  void caricaConfig().then(() => {
    if (!musicaAccesa() || (audio && !audio.paused) || pausa) return;
    attacca();
  });
}

/**
 * La modalità della partita ('base' o l'id dell'espansione): se cambia, la traccia che suona cala,
 * un po' di silenzio, e attacca la prima della nuova modalità.
 */
export function modalitaMusica(m: string): void {
  if (m === modo) return;
  modo = m;
  indice[m] = 0;
  const a = audio;
  if (!a || a.paused) return;
  finendo = true;
  sfuma(a, 0, config.sfumatura * 1000, () => {
    if (audio !== a) return;
    ferma(a);
    audio = null;
    if (pausa) clearTimeout(pausa);
    pausa = setTimeout(attacca, config.silenzio * 1000);
  });
}

/** Accende o spegne la musica e ricorda la scelta; ritorna il nuovo stato. */
export function cambiaMusica(): boolean {
  const on = !musicaAccesa();
  try {
    localStorage.setItem(KEY, on ? 'si' : 'no');
  } catch {
    /* senza memoria vale solo per questa visita */
  }
  if (on) suona();
  else {
    if (pausa) clearTimeout(pausa);
    pausa = null;
    if (audio) ferma(audio);
    audio = null;
    sospesa = false;
    chiudiStacco(true);
  }
  return on;
}

// ---------------------------------------------------------------- tracce brevi sopra il sottofondo

const STACCO_VOLUME = 0.8, SFUMA_STACCO_MS = 2500, ZITTO_MS = 700;
let stacco: HTMLAudioElement | null = null, fine: ReturnType<typeof setTimeout> | null = null, ultimo = '';
/** il rientro del sottofondo dopo un jingle */
let ritorno: ReturnType<typeof setTimeout> | null = null;

/** Il sottofondo messo in pausa da una traccia breve riparte da dove era, da zero volume. */
function riprendi(): void {
  if (!sospesa) return;
  sospesa = false;
  const a = audio;
  if (!a || !musicaAccesa()) return;
  a.volume = 0;
  avviaAudio(a, () => audio === a && (audio = null));
}

/** Ferma la traccia breve (sfumando) e riporta su il sottofondo; `torna` false: il sottofondo resta com'è (arriva un'altra traccia breve). */
function chiudiStacco(subito = false, ms = SFUMA_STACCO_MS, torna = true): void {
  if (fine) clearTimeout(fine);
  fine = null;
  const s = stacco;
  stacco = null;
  if (s) {
    if (subito) ferma(s);
    else sfuma(s, 0, ms, () => s.pause());
  }
  if (ritorno) clearTimeout(ritorno);
  ritorno = null;
  if (!torna) return;
  const su = () => {
    ritorno = null;
    riprendi();
    if (audio && !finendo && musicaAccesa()) sfuma(audio, livello(), ms);
  };
  // il sottofondo rientra a metà della sfumatura, per non mescolarsi alla traccia breve
  if (sospesa && s && !subito) ritorno = setTimeout(su, ms / 2);
  else su();
}

/** Lasciata la schermata del momento (es. "Prosegui"): la traccia breve sfuma in pochi secondi e il sottofondo torna su. */
const LASCIA_STACCO_MS = 3500;
export function lasciaStacco(): void {
  if (stacco) chiudiStacco(false, LASCIA_STACCO_MS);
}

/**
 * Suona la traccia breve `tipo` da sola: il sottofondo sfuma e si ferma, e riprende quando lei finisce o sfuma. `key`: il momento del
 * gioco; la stessa schermata ridisegnata non la fa ripartire. Una traccia breve sola alla volta.
 */
export function suonaStacco(tipo: Stacco, key: string): void {
  if (key === ultimo) return;
  ultimo = key;
  if (!musicaAccesa() || typeof Audio === 'undefined') return;
  chiudiStacco(true, SFUMA_STACCO_MS, false);
  const s = new Audio(staccoUrl(tipo));
  s.volume = STACCO_VOLUME * (volumeMusica() / 100);
  stacco = s;
  const parti = () => {
    if (stacco !== s) return;
    s.addEventListener('ended', () => stacco === s && chiudiStacco());
    fine = setTimeout(() => stacco === s && chiudiStacco(), (JINGLE.includes(tipo) ? JINGLE_MAX_S : config.durataMomenti) * 1000);
    avviaAudio(s, () => stacco === s && chiudiStacco(true));
  };
  // il sottofondo cala a zero e si mette in pausa (al suo punto), poi la traccia breve attacca da sola
  const a = audio;
  if (!a || a.paused) {
    parti();
    return;
  }
  sfuma(a, 0, ZITTO_MS, () => {
    if (stacco === s && audio === a) {
      a.pause();
      sospesa = true;
    }
    parti();
  });
}

/** Al primo clic o tasto la musica parte (una volta sola: poi va da sé, traccia dopo traccia). */
export function preparaMusica(doc: Document = document): void {
  void caricaConfig();
  const start = () => {
    suona();
    if (audio || pausa) {
      doc.removeEventListener('pointerdown', start, true);
      doc.removeEventListener('keydown', start, true);
    }
  };
  doc.addEventListener('pointerdown', start, true);
  doc.addEventListener('keydown', start, true);
}

/** Il giocatore ha mosso il cursore "Musica": sottofondo e traccia breve prendono subito il nuovo volume. */
export function aggiornaVolumeMusica(): void {
  if (audio && !finendo && !sospesa && !sfumature.has(audio)) audio.volume = livello();
  if (stacco && !sfumature.has(stacco)) stacco.volume = STACCO_VOLUME * (volumeMusica() / 100);
}
