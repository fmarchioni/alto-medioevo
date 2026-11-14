/** Riquadro "personaggio che parla", condiviso dai consiglieri. */
import { Mulberry32 } from '../domain/rng';
import { portraitUrl } from './citta/assets';

export interface Speaker {
  name: string;
  role: string;
  portrait: string;
}

/**
 * Generatore per le frasi di colore, separato da quello di gioco: la
 * sequenza RND della partita (confrontabile con il C64) non viene toccata.
 */
const flavor = new Mulberry32((Date.now() ^ 0x5eed) >>> 0);
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(flavor.next() * arr.length)];

/**
 * Vista moderna: i consiglieri che hanno un ritratto dipinto (public/sprites/ritratti)
 * lo usano al posto di quello disegnato; gli altri tengono il proprio.
 */
const PAINTED: Record<string, string> = {
  'Frate Anselmo': 'anselmo', 'Ser Bonifacio': 'bonifacio', 'Mastro Ugolino': 'ugolino', 'Ser Gualtiero': 'gualtiero', 'Messer Lapo': 'lapo',
  'Baldo Orecchiofine': 'baldo', 'Cecco il Mormoratore': 'cecco', 'Taddeo Linguasciolta': 'taddeo', 'Ser Ardengo': 'ardengo', 'Ser Iacopo da Asti': 'iacopo',
};
/** Busti dipinti rivolti a sinistra: gli altri guardano a destra, e l'impaginazione li specchia di conseguenza. */
const FACES_LEFT = new Set(['baldo', 'taddeo']);
let painted = false;
export function setPainted(on: boolean): void {
  painted = on;
}
/** Vero in vista moderna: chi disegna sceglie le immagini dipinte al posto di quelle disegnate. */
export const isPainted = (): boolean => painted;

/**
 * Busti che parlano: hanno anche la bocca aperta ("-parla") e gli occhi chiusi ("-occhi"), ricavati
 * dal ritratto (tools/ritratti-animati.mjs) e quindi sovrapponibili al pixel.
 */
const ANIMATI = new Set(['anselmo', 'bonifacio', 'ugolino', 'gualtiero', 'lapo', 'giullare']);

const hashOf = (text: string) => {
  let h = 0;
  for (const ch of text) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return String(h);
};

/**
 * Un busto dipinto nella sua cornice dorata. `parla`: ciò che sta dicendo; chi ha i fotogrammi
 * muove la bocca finché la frase è fresca, poi tace e ogni tanto sbatte gli occhi.
 */
export function paintedPortrait(file: string, alt: string, parla?: string): string {
  const faces = FACES_LEFT.has(file) ? ' data-faces="left"' : '';
  const img = `<img class="portrait painted" src="${portraitUrl(file)}" alt="${alt}">`;
  if (!ANIMATI.has(file)) return `<span class="ritratto"${faces}>${img}</span>`;
  startAnim();
  const frame = (k: string) => `<img class="portrait painted frame frame-${k}" src="${portraitUrl(`${file}-${k}`)}" alt="" aria-hidden="true">`;
  return `<span class="ritratto anima"${faces} data-anima="${file}:${hashOf(parla ?? '')}" data-parla="${parla ? speakMs(parla) : 0}">${img}${frame('parla')}${frame('occhi')}</span>`;
}

export function portraitOf(who: Speaker, parla?: string, dipinto = painted): string {
  const file = dipinto ? PAINTED[who.name] : undefined;
  return file ? paintedPortrait(file, `${who.name}, ${who.role}`, parla) : who.portrait;
}

// ---------------------------------------------------------------- bocca e occhi

/** Quanto si parla per dire una frase. */
const speakMs = (text: string) => Math.min(7000, Math.max(1500, 900 + text.length * 45));

/**
 * Stato di ogni busto animato, per chiave (chi e che cosa dice): la pagina si ricostruisce a ogni
 * azione e il busto non deve ricominciare a parlare. Una chiave non vista da un po' riparte da capo.
 */
const busti = new Map<string, { start: number; seen: number; open: boolean; flip: number; blink: number; shut: number }>();
let animating = false;
/** Fin quando qualche consigliere sta parlando (per il banditore in piazza, che gli fa eco). */
let parlaFino = 0;
export const staParlando = (): boolean => typeof performance !== 'undefined' && performance.now() < parlaFino;
const quiet = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Sta parlando? Un discorso a più frasi parla a ogni frase nuova del fumetto accanto. */
function talking(el: HTMLElement, start: number, now: number): boolean {
  const seq = el.closest('.advisor')?.querySelector<HTMLElement>('.say-seq');
  const s = seq && sequenze.get(seq.dataset.seq ?? '');
  if (seq && s) return now - s.at < speakMs(seq.querySelectorAll('.frase')[s.i]?.textContent ?? '');
  return now - start < Number(el.dataset.parla ?? 0);
}

function animTick(): void {
  const els = document.querySelectorAll<HTMLElement>('.ritratto.anima');
  animating = els.length > 0;
  if (!animating) return;
  const now = performance.now(), still = quiet();
  els.forEach(el => {
    const key = el.dataset.anima ?? '';
    let b = busti.get(key);
    if (!b || now - b.seen > 2000) busti.set(key, (b = { start: now, seen: now, open: false, flip: now, blink: now + 2500 + Math.random() * 2500, shut: 0 }));
    b.seen = now;
    const parla = !still && talking(el, b.start, now);
    if (parla) parlaFino = now + 120;
    // la bocca: aperta e chiusa a tempi un po' irregolari, come chi parla davvero
    if (!parla) b.open = false;
    else if (now >= b.flip) {
      b.open = !b.open;
      b.flip = now + (b.open ? 110 + Math.random() * 130 : 80 + Math.random() * 110);
    }
    // gli occhi: solo a discorso finito, ogni pochi secondi, qualche volta due volte di fila
    if (parla || still) b.blink = Math.max(b.blink, now + 1200);
    else if (now >= b.blink) {
      b.shut = now + 130;
      b.blink = now + (Math.random() < 0.2 ? 260 : 2500 + Math.random() * 3500);
    }
    el.classList.toggle('bocca', b.open);
    el.classList.toggle('occhi', now < b.shut);
  });
  if (busti.size > 60) for (const [k, b] of busti) if (now - b.seen > 10000) busti.delete(k);
  setTimeout(animTick, 50);
}

function startAnim(): void {
  if (animating || typeof document === 'undefined') return;
  animating = true;
  setTimeout(animTick, 0);
}

/**
 * Un discorso a più frasi (separate da un a capo): nella vista moderna il fumetto ne mostra una per
 * volta, ognuna per qualche secondo secondo la sua lunghezza, con una dissolvenza fra l'una e l'altra;
 * l'ultima resta, senza ricominciare. Un clic sul fumetto passa alla frase seguente.
 * La pagina si ricostruisce a ogni azione: a che frase si è arrivati si ricorda per testo.
 */
const sequenze = new Map<string, { i: number; at: number }>();
const durata = (frase: string) => Math.min(9000, Math.max(3500, 2600 + frase.length * 40));
let ticking = false;

function tick(): void {
  const els = document.querySelectorAll<HTMLElement>('.say-seq');
  ticking = els.length > 0;
  if (!ticking) return;
  const now = performance.now();
  els.forEach(el => {
    const frasi = el.querySelectorAll<HTMLElement>('.frase'), key = el.dataset.seq ?? '';
    let s = sequenze.get(key);
    if (!s) sequenze.set(key, (s = { i: 0, at: now }));
    if (s.i < frasi.length - 1 && now - s.at > durata(frasi[s.i]?.textContent ?? '')) {
      s.i++;
      s.at = now;
    }
    frasi.forEach((f, k) => f.classList.toggle('on', k === s.i));
  });
  setTimeout(tick, 200);
}

function startTicking(): void {
  if (ticking || typeof document === 'undefined') return;
  ticking = true;
  setTimeout(tick, 0);
  if (!clickBound) {
    clickBound = true;
    document.addEventListener('click', e => {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('.say-seq');
      const s = el && sequenze.get(el.dataset.seq ?? '');
      if (!el || !s) return;
      const n = el.querySelectorAll('.frase').length;
      if (s.i >= n - 1) return;
      s.i++;
      s.at = performance.now();
      el.querySelectorAll('.frase').forEach((f, k) => f.classList.toggle('on', k === s.i));
    });
  }
}
let clickBound = false;

function sayHtml(text: string): string {
  const frasi = text.split('\n').map(f => f.trim()).filter(Boolean);
  if (frasi.length < 2 || !painted) return `<p class="say">${frasi.join(' ')}</p>`;
  if (sequenze.size > 40) sequenze.clear();
  // la chiave è un numero: il testo passa poi per c64ify, che cambia gli accenti
  const key = hashOf(text), at = sequenze.get(key)?.i ?? 0;
  startTicking();
  // tutte le frasi nella stessa cella: il fumetto prende l'altezza della più lunga e non salta
  return `<p class="say say-seq" data-seq="${key}" title="Clic: frase seguente" aria-live="polite">${frasi.map((f, k) => `<span class="frase${k === at ? ' on' : ''}">${f}</span>`).join('')}</p>`;
}

/** `dipinto`: il ritratto dipinto anche fuori dalla vista moderna (la schermata di benvenuto). */
export function speechBox(who: Speaker, text: string, dipinto = painted): string {
  return `
  <div class="advisor${dipinto && PAINTED[who.name] ? ' dipinto' : ''}">
    ${portraitOf(who, text, dipinto)}
    <div class="speech">
      <div class="who-speaks">${who.name} <span>${who.role}</span></div>
      ${sayHtml(text)}
    </div>
  </div>`;
}
