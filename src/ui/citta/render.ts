/**
 * Vista moderna: disegno della città.
 * - strato statico (terreno, edifici, alberi) su un canvas fuori schermo, rifatto solo quando cambia il modello;
 * - a ogni fotogramma lo strato statico viene riportato sul canvas visibile secondo l'inquadratura.
 */
import { SPRITES, type Assets } from './assets';
import { depthOf, TH, toWorld, TW } from './iso';
import { groundAt, hash, wildAt, type CityModel, type CityObject } from './layout';

/** Rettangolo di mondo coperto dallo strato statico (il centro della mappa è a x = 0). */
export const WORLD = { x0: -1150, y0: -300, w: 2300, h: 1400 };
/** Risoluzione dello strato statico rispetto alla scala di gioco. */
export const SS = 1.25;
/**
 * Scala degli omini rispetto a quella naturale degli sprite: un omino è alto circa 27 px, tre quarti di una casa piccola (35–40 px
 * sopra la sua zolla). Con 0,9 era alto come la casa intera (2026-11-19).
 */
export const PEOPLE = 0.68;
/** Scala naturale degli sprite: una tessera disegnata è larga circa 220 px. */
export const K = TW / 220;
const BG = '#4d6427';

export interface Camera { x: number; y: number; z: number }

export function makeLayer(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(WORLD.w * SS);
  c.height = Math.round(WORLD.h * SS);
  return c;
}

function rhombus(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + TW / 2, y + TH / 2);
  ctx.lineTo(x, y + TH);
  ctx.lineTo(x - TW / 2, y + TH / 2);
  ctx.closePath();
}

function drawImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, flip?: boolean, crop?: Crop): void {
  const paint = (dx: number, dy: number) => (crop ? ctx.drawImage(img, crop[0], crop[1], crop[2], crop[3], dx, dy, w, h) : ctx.drawImage(img, dx, dy, w, h));
  if (!flip) return paint(x, y);
  ctx.save();
  ctx.translate(x + w, y);
  ctx.scale(-1, 1);
  paint(0, 0);
  ctx.restore();
}

/** Ritaglio dell'immagine di partenza, in pixel: x, y, larghezza, altezza. */
type Crop = [number, number, number, number];

function drawTile(ctx: CanvasRenderingContext2D, m: CityModel, a: Assets, gx: number, gy: number): void {
  const g = groundAt(m, gx, gy), { x, y } = toWorld(gx, gy);
  if (g.sprite === 'acqua') {
    rhombus(ctx, x, y - 0.5);
    ctx.fillStyle = hash(m.seed, gx, gy, 11) < 0.5 ? '#3f7d93' : '#42839a';
    ctx.fill();
    // increspature
    ctx.strokeStyle = 'rgba(200, 232, 240, .35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const wx = x + (hash(m.seed, gx, gy, 12 + i) - 0.5) * 30, wy = y + 8 + hash(m.seed, gx, gy, 14 + i) * 16;
      ctx.beginPath();
      ctx.moveTo(wx - 6, wy + 3);
      ctx.quadraticCurveTo(wx, wy - 1, wx + 6, wy - 3);
      ctx.stroke();
    }
    return;
  }
  const img = a.get(g.sprite);
  if (!img) {
    rhombus(ctx, x, y);
    ctx.fillStyle = BG;
    ctx.fill();
    return;
  }
  // la faccia superiore della zolla coincide con il rombo; lo spessore resta sotto e lo coprono le tessere davanti
  const w = TW + 2;
  drawImage(ctx, img, x - w / 2, y - 1, w, (w * img.naturalHeight) / img.naturalWidth, g.flip);
}

/** Uno sprite già collocato nel mondo: serve a ridisegnarlo davanti a un omino che gli passa dietro. */
export interface Placed {
  img: HTMLImageElement;
  x: number;
  y: number;
  w: number;
  h: number;
  flip?: boolean;
  depth: number;
  /** solo una parte dell'immagine (la sentinella a mezzo busto) */
  crop?: Crop;
  /** ombra a terra degli oggetti di contorno (si disegna una volta sola, nello strato statico) */
  shadow?: [number, number, number, number];
}

export function place(a: Assets, o: CityObject): Placed | null {
  const img = a.get(o.sprite), spec = SPRITES[o.sprite];
  if (!img || !spec) return null;
  const f = spec.f ?? 1, ratio = img.naturalHeight / img.naturalWidth;
  const top = toWorld(o.gx, o.gy), depth = depthOf(o.gx, o.gy, o.size);
  if (o.size === 0) {
    // contorno (alberi, covoni): scala naturale, piede al centro della tessera, ombra in codice
    const w = img.naturalWidth * K * f, h = w * ratio, cy = top.y + TH / 2 + 3;
    return { img, x: top.x - w / 2, y: cy - h + 2, w, h, flip: o.flip, depth, shadow: [top.x + w * 0.12, cy, Math.max(7, Math.min(w, 44) * 0.48), Math.max(3, Math.min(w, 44) * 0.2)] };
  }
  const w = o.size * TW * f, h = w * ratio;
  if (spec.anchor) {
    const ax = o.flip ? 1 - spec.anchor[0] : spec.anchor[0];
    return { img, x: top.x - w * ax, y: top.y + TH / 2 - h * spec.anchor[1], w, h, flip: o.flip, depth };
  }
  // la base dello sprite poggia sul vertice in basso dell'impronta (tenendo il centro se è più largo)
  const by = top.y + o.size * TH + (f - 1) * o.size * TH * 0.5;
  return { img, x: top.x - w / 2, y: by - h, w, h, flip: o.flip, depth };
}

function drawPlaced(ctx: CanvasRenderingContext2D, p: Placed, shadow: boolean): void {
  if (shadow && p.shadow) {
    ctx.fillStyle = 'rgba(20, 30, 10, .28)';
    ctx.beginPath();
    ctx.ellipse(p.shadow[0], p.shadow[1], p.shadow[2], p.shadow[3], 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawImage(ctx, p.img, p.x, p.y, p.w, p.h, p.flip, p.crop);
}

/** Ridisegna lo strato statico: tutto il mondo visibile, non solo la mappa. */
export function drawStatic(layer: HTMLCanvasElement, m: CityModel, a: Assets): Placed[] {
  const ctx = layer.getContext('2d');
  if (!ctx) return [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, layer.width, layer.height);
  ctx.setTransform(SS, 0, 0, SS, -WORLD.x0 * SS, -WORLD.y0 * SS);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const sMin = Math.floor(WORLD.y0 / (TH / 2)) - 2, sMax = Math.ceil((WORLD.y0 + WORLD.h) / (TH / 2)) + 1;
  const dMax = Math.ceil(WORLD.w / TW) + 1;
  const all: CityObject[] = [...m.objects];
  for (let s = sMin; s <= sMax; s++) for (let d = -dMax; d <= dMax; d++) {
    if ((s + d) & 1) continue;
    const gx = (s + d) / 2, gy = (s - d) / 2;
    drawTile(ctx, m, a, gx, gy);
    const wild = wildAt(m.seed, gx, gy);
    if (wild) all.push({ id: '', kind: 'natura', sprite: wild, gx, gy, size: 0, flip: hash(m.seed, gx, gy, 16) < 0.5 });
  }
  all.sort((p, q) => depthOf(p.gx, p.gy, p.size) - depthOf(q.gx, q.gy, q.size) || p.gx - q.gx);
  const placed: Placed[] = [];
  for (const o of all) {
    const p = place(a, o);
    if (!p) continue;
    drawPlaced(ctx, p, true);
    placed.push(p);
  }
  return placed;
}

/** Qualcosa che si muove sopra lo strato statico: un omino, una barca, l'acqua dell'alluvione. */
export interface Figure {
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  paint(ctx: CanvasRenderingContext2D): void;
}

/**
 * Un fotogramma: lo strato statico, poi le figure in ordine di profondità. Ogni
 * oggetto statico che sta davanti a una figura e la tocca viene ridisegnato
 * sopra di lei (e così quelli davanti a lui): l'omino passa dietro la casa.
 * `over` disegna ciò che sta sopra tutto (tinta, particelle), nelle coordinate di mondo.
 * `px`: pixel del canvas per pixel CSS.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, layer: HTMLCanvasElement, cam: Camera, cw: number, ch: number, px: number,
  statics: Placed[] = [], figures: Figure[] = [], over?: (ctx: CanvasRenderingContext2D) => void): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, cw, ch);
  const k = (cam.z * px) / SS;
  ctx.setTransform(k, 0, 0, k, (WORLD.x0 - cam.x) * cam.z * px + cw / 2, (WORLD.y0 - cam.y) * cam.z * px + ch / 2);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(layer, 0, 0);
  if (figures.length || over) {
    const z = cam.z * px;
    ctx.setTransform(z, 0, 0, z, cw / 2 - cam.x * z, ch / 2 - cam.y * z);
    if (figures.length) {
      const hw = cw / (2 * z) + 40, hh = ch / (2 * z) + 40;
      const seen = (r: { x: number; y: number; w: number; h: number }) => r.x < cam.x + hw && r.x + r.w > cam.x - hw && r.y < cam.y + hh && r.y + r.h > cam.y - hh;
      const figs = figures.filter(seen).sort((p, q) => p.depth - q.depth);
      const dirty: { x: number; y: number; w: number; h: number }[] = [];
      let j = 0;
      for (const s of statics) {
        if (j >= figs.length && !dirty.length) break;
        while (j < figs.length && figs[j].depth <= s.depth) {
          figs[j].paint(ctx);
          dirty.push(figs[j++]);
        }
        if (!dirty.length || !seen(s)) continue;
        for (const d of dirty) {
          if (s.x < d.x + d.w && s.x + s.w > d.x && s.y < d.y + d.h && s.y + s.h > d.y) {
            drawPlaced(ctx, s, false);
            dirty.push(s);
            break;
          }
        }
      }
      while (j < figs.length) figs[j++].paint(ctx);
    }
    over?.(ctx);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Inquadratura che contiene la città fino a `extent` tessere dal centro, in un canvas di cw × ch pixel CSS. */
export const ZOOM_MAX = 2.6;
/** `zoom`: fattore scelto dal giocatore con la rotellina (1 = l'inquadratura che contiene la città). */
export function frameFor(extent: number, cw: number, ch: number, center: { x: number; y: number }, zoom = 1): Camera {
  const side = 2 * (extent + 0.5) + 1;
  const fit = Math.min(cw / (side * TW * 0.72), ch / (side * TH + 110));
  const zMin = Math.max(cw / WORLD.w, ch / WORLD.h);
  const z = Math.max(zMin, Math.min(ZOOM_MAX, Math.min(1.9, fit) * zoom));
  // la veduta non esce dal mondo disegnato
  const hw = cw / (2 * z), hh = ch / (2 * z);
  const x = Math.max(WORLD.x0 + hw, Math.min(WORLD.x0 + WORLD.w - hw, center.x));
  const y = Math.max(WORLD.y0 + hh, Math.min(WORLD.y0 + WORLD.h - hh, center.y));
  return { x, y, z };
}
