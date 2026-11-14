/**
 * Il dipinto di un evento trasformato in miniatura duecentesca, nel browser (canvas):
 *  1. campiture piatte: filtro di Kuwahara, che toglie il chiaroscuro pittorico e tiene i bordi;
 *  2. tavolozza dei miniatori: ogni colore va al più vicino fra oltremare, vermiglio, malachite,
 *     ocra, biacca, terre e nero (con un poco del colore vero, perché le figure restino leggibili);
 *  3. il cielo (la zona chiara o azzurra che tocca il bordo in alto) diventa un fondo oltremare
 *     a stelline bianche, come nei codici;
 *  4. contorni neri netti dove il colore cambia di colpo.
 * La cornice dipinta (fasce rosa e azzurre, filo d'oro) è nel CSS.
 */

type RGB = [number, number, number];

/** Pigmenti dei miniatori del Duecento. */
const TAVOLOZZA: RGB[] = [
  [38, 64, 160], [26, 40, 104], // oltremare chiaro e scuro
  [196, 52, 38], [140, 34, 30], // vermiglio, lacca
  [214, 120, 140], // rosa
  [72, 132, 64], [40, 84, 44], // malachite, verde terra
  [214, 170, 76], [160, 112, 44], // ocra gialla, ocra bruna
  [226, 208, 166], // camoscio (terreni chiari, intonaco)
  [120, 74, 40], // terra (una sola: i miniatori ne usavano poca)
  [236, 196, 160], [200, 146, 112], // incarnato, ombra dell'incarnato
  [244, 236, 216], // biacca
  [176, 176, 168], [110, 112, 112], // grigio della maglia di ferro, grigio scuro
  [28, 22, 18], // nero
];

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Luminosità e due assi di colore (YCbCr). */
const ycc = (r: number, g: number, b: number): RGB => [lum(r, g, b), -0.169 * r - 0.331 * g + 0.5 * b, 0.5 * r - 0.419 * g - 0.081 * b];
const PIGMENTI = TAVOLOZZA.map(c => ycc(...c));
/** I neutri (ferro, pietra, nubi): solo nero, grigi e biacca. */
const NEUTRI = TAVOLOZZA.map((_, k) => k).filter(k => { const [r, g, b] = TAVOLOZZA[k]; return Math.max(r, g, b) - Math.min(r, g, b) < 24; });
const neutro = (y: number) => NEUTRI.reduce((a, k) => (Math.abs(PIGMENTI[k][0] - y) < Math.abs(PIGMENTI[a][0] - y) ? k : a), NEUTRI[0]);

/** Il pigmento più vicino: conta prima la luminosità, poi il colore (così i grigi restano grigi). */
function nearest(r: number, g: number, b: number): number {
  let best = 0, bd = Infinity;
  const [y, cb, cr] = ycc(r, g, b);
  for (let k = 0; k < PIGMENTI.length; k++) {
    const c = PIGMENTI[k];
    const d = 1.6 * (y - c[0]) ** 2 + (cb - c[1]) ** 2 + (cr - c[2]) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/** Kuwahara con le tabelle cumulate: per ogni pixel, la media del quadrante più uniforme. */
function kuwahara(src: Uint8ClampedArray, w: number, h: number, rad: number): Uint8ClampedArray {
  const W1 = w + 1, n = W1 * (h + 1);
  const S = [new Float64Array(n), new Float64Array(n), new Float64Array(n)], Q = new Float64Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4, i = (y + 1) * W1 + x + 1;
    for (let c = 0; c < 3; c++) S[c][i] = src[p + c] + S[c][i - 1] + S[c][i - W1] - S[c][i - W1 - 1];
    const l = lum(src[p], src[p + 1], src[p + 2]);
    Q[i] = l * l + Q[i - 1] + Q[i - W1] - Q[i - W1 - 1];
  }
  const L = new Float64Array(n); // somma delle luminanze, dalle tre somme di colore
  for (let i = 0; i < n; i++) L[i] = 0.299 * S[0][i] + 0.587 * S[1][i] + 0.114 * S[2][i];
  const box = (T: Float64Array, x0: number, y0: number, x1: number, y1: number) => T[(y1 + 1) * W1 + x1 + 1] - T[y0 * W1 + x1 + 1] - T[(y1 + 1) * W1 + x0] + T[y0 * W1 + x0];
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let bestV = Infinity, q = [0, 0, 0, 0];
    for (const [ax, ay] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x0 = Math.max(0, Math.min(x, x + ax * rad)), x1 = Math.min(w - 1, Math.max(x, x + ax * rad));
      const y0 = Math.max(0, Math.min(y, y + ay * rad)), y1 = Math.min(h - 1, Math.max(y, y + ay * rad));
      const k = (x1 - x0 + 1) * (y1 - y0 + 1), m = box(L, x0, y0, x1, y1) / k, v = box(Q, x0, y0, x1, y1) / k - m * m;
      if (v < bestV) { bestV = v; q = [x0, y0, x1, y1, k] as unknown as number[]; }
    }
    const [x0, y0, x1, y1, k] = q as unknown as number[];
    const p = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) out[p + c] = box(S[c], x0, y0, x1, y1) / k;
    out[p + 3] = 255;
  }
  return out;
}

/** Il cielo: pixel chiari o azzurri, simili ai vicini, collegati al bordo in alto. */
function skyMask(d: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h), maxY = Math.floor(h * 0.7);
  const skyish = (p: number) => {
    const r = d[p], g = d[p + 1], b = d[p + 2], l = lum(r, g, b), mx = Math.max(r, g, b), sat = mx ? (mx - Math.min(r, g, b)) / mx : 0;
    return l > 105 && ((b > r + 6 && b >= g - 6) || sat < 0.24);
  };
  const stack: number[] = [];
  for (let x = 0; x < w; x++) if (skyish(x * 4)) { m[x] = 1; stack.push(x); }
  while (stack.length) {
    const i = stack.pop()!, x = i % w, y = (i - x) / w, p = i * 4;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny > maxY) continue;
      const j = ny * w + nx, q = j * 4;
      if (m[j] || !skyish(q)) continue;
      if (Math.abs(d[p] - d[q]) + Math.abs(d[p + 1] - d[q + 1]) + Math.abs(d[p + 2] - d[q + 2]) > 42) continue;
      m[j] = 1;
      stack.push(j);
    }
  }
  return m;
}

export interface MiniaturaOpts {
  /** larghezza di lavoro in pixel (l'altezza segue) */
  width?: number;
  /** quanta parte del colore vero resta sopra il pigmento (0 tutto pigmento) */
  vero?: number;
}

/** Disegna la miniatura su un canvas nuovo. L'immagine deve essere già caricata. */
export function miniatura(img: HTMLImageElement, opts: MiniaturaOpts = {}): HTMLCanvasElement {
  const w = opts.width ?? 720, h = Math.round((img.naturalHeight / img.naturalWidth) * w), vero = opts.vero ?? 0.12;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const src = ctx.getImageData(0, 0, w, h);
  const flat = kuwahara(src.data, w, h, 4);
  const sky = skyMask(flat, w, h);
  const out = ctx.createImageData(w, h), o = out.data, idx = new Uint8Array(w * h);
  // pigmenti
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (sky[i]) {
      // oltremare, appena più scuro in alto
      const t = Math.floor(i / w) / h;
      o[p] = 30 - t * 6; o[p + 1] = 52 - t * 8; o[p + 2] = 150 - t * 20; o[p + 3] = 255;
      continue;
    }
    // colori più accesi e contrastati prima di scegliere il pigmento: i dipinti sono in toni bruni, i codici no
    const l0 = lum(flat[p], flat[p + 1], flat[p + 2]);
    // e le ombre schiarite: nei codici il nero è solo il contorno
    const mx = Math.max(flat[p], flat[p + 1], flat[p + 2]), s0 = mx ? (mx - Math.min(flat[p], flat[p + 1], flat[p + 2])) / mx : 0;
    const k = 1 + 0.9 * Math.min(1, Math.max(0, (s0 - 0.14) / 0.22)) ** 2;
    const vivo = (c: number) => 255 * (Math.max(0, Math.min(255, (l0 + (c - l0) * k - 128) * 1.12 + 128)) / 255) ** 0.72;
    idx[i] = s0 < 0.2 ? neutro(vivo(l0)) : nearest(vivo(flat[p]), vivo(flat[p + 1]), vivo(flat[p + 2]));
  }
  const conta = new Uint8Array(TAVOLOZZA.length);
  for (let i = 0; i < w * h; i++) {
    if (sky[i]) continue;
    const p = i * 4, x = i % w, y = (i - x) / w;
    conta.fill(0);
    let best = idx[i];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || sky[ny * w + nx]) continue;
      const k = idx[ny * w + nx];
      if (++conta[k] > conta[best]) best = k;
    }
    const [r, g, b] = TAVOLOZZA[best];
    o[p] = r * (1 - vero) + flat[p] * vero;
    o[p + 1] = g * (1 - vero) + flat[p + 1] * vero;
    o[p + 2] = b * (1 - vero) + flat[p + 2] * vero;
    o[p + 3] = 255;
  }
  // contorni: Sobel sulla luminanza delle campiture, più il bordo del cielo
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = lum(flat[i * 4], flat[i * 4 + 1], flat[i * 4 + 2]);
  const ink = [24, 18, 14], A = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - 1] - L[i + w - 1];
    const gy = L[i + w - 1] + 2 * L[i + w] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - w] - L[i - w + 1];
    let a = Math.min(1, Math.max(0, (Math.hypot(gx, gy) - 55) / 60));
    if (sky[i] !== sky[i + 1] || sky[i] !== sky[i + w]) a = 1;
    A[i] = a;
  }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, a = Math.max(A[i], 0.6 * Math.max(A[i - 1], A[i + 1], A[i - w], A[i + w]));
    if (a <= 0) continue;
    const p = i * 4;
    for (let c = 0; c < 3; c++) o[p + c] = o[p + c] * (1 - a) + ink[c] * a;
  }
  ctx.putImageData(out, 0, 0);
  // stelline del cielo: tre puntini bianchi a trifoglio, a quinconce
  ctx.fillStyle = 'rgba(244, 236, 216, .9)';
  const step = Math.round(w / 34);
  for (let y = step / 2, row = 0; y < h; y += step, row++) for (let x = (row % 2) * step / 2 + step / 4; x < w; x += step) {
    const xi = Math.round(x), yi = Math.round(y);
    if (!sky[yi * w + xi] || !sky[Math.max(0, yi - 4) * w + xi] || !sky[Math.min(h - 1, yi + 4) * w + xi]) continue;
    for (const [dx, dy] of [[0, -1.6], [-1.5, 1], [1.5, 1]]) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return cv;
}

/** Miniature già calcolate, per indirizzo del dipinto: la pagina si ridisegna spesso. */
const fatte = new Map<string, string>();

/**
 * Dopo il disegno della pagina: i dipinti marcati `data-m13` (giornale di fine anno, eventi senza
 * miniatura dipinta) diventano miniature. Restano invisibili (`gz-attesa`) finché non sono pronti.
 */
export function miniaturizza(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>('img[data-m13]').forEach(img => {
    const key = img.getAttribute('src') ?? '';
    const done = fatte.get(key);
    const show = (url: string) => {
      img.removeAttribute('data-m13');
      img.src = url;
      img.classList.remove('gz-attesa');
    };
    if (done) return show(done);
    const go = () => {
      try {
        const url = fatte.get(key) ?? miniatura(img).toDataURL('image/jpeg', 0.88);
        fatte.set(key, url);
        show(url);
      } catch {
        img.classList.remove('gz-attesa'); // senza canvas resta il dipinto
      }
    };
    if (img.complete && img.naturalWidth) go();
    else img.addEventListener('load', go, { once: true });
  });
}
