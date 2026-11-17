/**
 * Effetti sonori del gioco, configurati in public/suoni/suoni.json (si cambiano senza toccare il codice):
 * per ogni effetto il file, il volume (0..1) e i secondi al più che suona prima di sfumare. Il volume
 * generale degli effetti lo sceglie il giocatore con il cursore "Suoni" in fondo alla pagina (0: muti),
 * quello della musica con il cursore "Musica" (musica.ts); le scelte si ricordano.
 *
 * Quali effetti suonano e quando: effetti.ts (le schermate) e app.ts (clic, pergamene, mappa, cronaca).
 */
const ENV = (import.meta as { env?: { BASE_URL?: string; MODE?: string } }).env;
const BASE: string = ENV?.BASE_URL ?? '/';
const CARTELLA = `${BASE}suoni/`;
export const CONFIG_SUONI_URL = `${CARTELLA}suoni.json`;
const KEY_SUONI = 'alto-medioevo/volume-suoni';
const KEY_MUSICA = 'alto-medioevo/volume-musica';

export type Suono =
  | 'click' | 'errore' | 'pergamena' | 'pergamenaChiudi' | 'mappa' | 'pagina'
  | 'fuoco' | 'pioggia' | 'alluvione' | 'mosche' | 'tosse' | 'mulino' | 'folla' | 'porta' | 'colpi'
  | 'crollo' | 'corno' | 'cavalli' | 'onde' | 'spade' | 'metallo' | 'campane';

export interface Effetto {
  file: string;
  /** volume dell'effetto, 0..1, prima di quello scelto dal giocatore */
  volume: number;
  /** secondi al più: poi sfuma (assente: tutto il file) */
  durata?: number;
}

export interface ConfigSuoni {
  /** volume generale degli effetti, 0..1 */
  volume: number;
  effetti: Record<Suono, Effetto>;
}

const e = (file: string, volume: number, durata?: number): Effetto => ({ file, volume, ...(durata !== undefined ? { durata } : {}) });

/** Valori se public/suoni/suoni.json manca o è sbagliato (gli stessi del file). */
export const CONFIG_SUONI_DEFAULT: ConfigSuoni = {
  volume: 0.6,
  effetti: {
    click: e('click.mp3', 0.5),
    errore: e('errore.mp3', 0.5),
    pergamena: e('pergamena.mp3', 0.45, 1.6),
    pergamenaChiudi: e('pergamena.mp3', 0.35, 0.9),
    mappa: e('pergamena.mp3', 0.5, 3.5),
    pagina: e('pagina.mp3', 0.6),
    fuoco: e('fuoco.mp3', 0.6, 4),
    pioggia: e('pioggia.mp3', 0.5, 4),
    alluvione: e('alluvione.mp3', 0.5, 4),
    mosche: e('mosche.mp3', 0.5, 3),
    tosse: e('tosse.mp3', 0.6),
    mulino: e('mulino.mp3', 0.5, 3.5),
    folla: e('folla.mp3', 0.5, 4),
    porta: e('porta.mp3', 0.6),
    colpi: e('colpi.mp3', 0.6),
    crollo: e('crollo.mp3', 0.6, 3),
    corno: e('corno.mp3', 0.5, 4),
    cavalli: e('cavalli.mp3', 0.5, 4),
    onde: e('onde.mp3', 0.5, 4),
    spade: e('spade.mp3', 0.6, 3.5),
    metallo: e('metallo.mp3', 0.5),
    campane: e('campane.mp3', 0.5, 5),
  },
};
export const SUONI = Object.keys(CONFIG_SUONI_DEFAULT.effetti) as Suono[];

let config: ConfigSuoni = CONFIG_SUONI_DEFAULT;

/** Unisce la configurazione letta ai valori di partenza: ciò che manca o è sbagliato resta com'era. */
export function leggiConfigSuoni(j: unknown): ConfigSuoni {
  const o = (j && typeof j === 'object' ? j : {}) as { volume?: unknown; effetti?: Record<string, unknown> };
  const num = (v: unknown, d: number, max: number) => (typeof v === 'number' && v >= 0 && v <= max ? v : d);
  const effetti = Object.fromEntries(SUONI.map(s => {
    const d = CONFIG_SUONI_DEFAULT.effetti[s], x = (o.effetti?.[s] ?? {}) as Partial<Effetto>;
    const durata = x.durata === undefined ? d.durata : num(x.durata, d.durata ?? 0, 60) || undefined;
    return [s, { file: typeof x.file === 'string' && x.file ? x.file : d.file, volume: num(x.volume, d.volume, 1), ...(durata ? { durata } : {}) }];
  })) as Record<Suono, Effetto>;
  return { volume: num(o.volume, CONFIG_SUONI_DEFAULT.volume, 1), effetti };
}

let caricamento: Promise<void> | null = null;
function caricaConfig(): Promise<void> {
  if (caricamento) return caricamento;
  caricamento = typeof fetch === 'undefined' || ENV?.MODE === 'test' ? Promise.resolve()
    : fetch(CONFIG_SUONI_URL, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(j => { if (j) config = leggiConfigSuoni(j); }).catch(() => undefined);
  return caricamento;
}

// ---------------------------------------------------------------- volumi scelti dal giocatore (0..100)

function leggi(key: string, d: number): number {
  try {
    const v = localStorage.getItem(key);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : d;
  } catch {
    return d;
  }
}
function scrivi(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* senza memoria vale solo per questa visita */
  }
}

/** Volume degli effetti scelto dal giocatore, 0..100 (all'inizio 70). */
export const volumeSuoni = () => leggi(KEY_SUONI, 70);
export const impostaVolumeSuoni = (v: number) => scrivi(KEY_SUONI, Math.max(0, Math.min(100, Math.round(v))));
/** Volume della musica scelto dal giocatore, 0..100 (all'inizio 100: quello di public/musica/musica.json). */
export const volumeMusica = () => leggi(KEY_MUSICA, 100);
export const impostaVolumeMusica = (v: number) => scrivi(KEY_MUSICA, Math.max(0, Math.min(100, Math.round(v))));

// ---------------------------------------------------------------- suonare

const SFUMA_S = 0.5;
const ultimi = new Map<string, number>();
let ultimaChiave = '';

/** Suona l'effetto. `chiave`: il momento del gioco; la stessa schermata ridisegnata non lo fa ripartire. */
export function suonaEffetto(s: Suono, chiave?: string): void {
  if (chiave !== undefined) {
    if (chiave === ultimaChiave) return;
    ultimaChiave = chiave;
  }
  const pref = volumeSuoni() / 100;
  if (pref <= 0 || typeof Audio === 'undefined') return;
  // lo stesso effetto a raffica (doppio clic) suona una volta sola
  const ora = Date.now();
  if (ora - (ultimi.get(s) ?? 0) < 80) return;
  ultimi.set(s, ora);
  void caricaConfig().then(() => {
    const ef = config.effetti[s];
    const v = Math.min(1, config.volume * ef.volume * pref);
    if (v <= 0) return;
    const a = new Audio(CARTELLA + ef.file);
    a.volume = v;
    // sfuma nell'ultimo mezzo secondo (della durata scelta o del file), poi si ferma
    const t = setInterval(() => {
      const tot = Math.min(ef.durata ?? Infinity, Number.isFinite(a.duration) ? a.duration : Infinity);
      if (a.ended || !Number.isFinite(tot)) {
        if (a.ended) clearInterval(t);
        return;
      }
      const resta = tot - a.currentTime;
      if (resta <= 0) {
        a.pause();
        clearInterval(t);
      } else if (resta < SFUMA_S) a.volume = v * (resta / SFUMA_S);
    }, 50);
    // il browser non suona prima di un gesto del giocatore; per sicurezza l'intervallo non dura oltre un minuto
    const stop = () => clearInterval(t);
    setTimeout(stop, 60000);
    try {
      void a.play()?.catch(stop);
    } catch {
      stop();
    }
  });
}

/** Al primo clic legge la configurazione (poi suona senza attese). */
export function preparaSuoni(): void {
  void caricaConfig();
}
