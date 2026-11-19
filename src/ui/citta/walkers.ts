/**
 * Vista moderna: gli omini (puro, senza DOM).
 *
 * Ogni omino segue un percorso di tessere trovato sulla pianta: preferisce le
 * strade, gira attorno agli edifici e passa dalle porte delle mura. Le
 * posizioni sono in "coordinate di centro": il centro della tessera (gx, gy)
 * è (gx + 0.5, gy + 0.5), e `toWorld` le porta sullo schermo.
 */
import { C, hash, isRoad, isWater, N, RING_1, ROAD_X, ROAD_Y, tileKey, type CityModel } from './layout';

export type Pt = [number, number];

/**
 * - pendola: va, aspetta, torna, aspetta (la vita di tutti i giorni)
 * - giro: percorso chiuso, senza soste (ronde)
 * - arriva: va e resta alla meta (cortei, nemici)
 * - parte: comincia fermo alla meta e torna da dove era venuto, poi sparisce
 * - va: va e sparisce
 * - fermo: resta alla meta
 * - passa: attraversa (entra, arriva in fondo, sparisce), aspetta e ricomincia da capo
 */
export type Mode = 'pendola' | 'giro' | 'arriva' | 'parte' | 'va' | 'fermo' | 'passa';

export interface Walker {
  id: string;
  sprite: string;
  path: Pt[];
  /** distanza progressiva di ogni punto del percorso, in tessere */
  cum: number[];
  /** distanza percorsa lungo il percorso */
  pos: number;
  /** dove si ferma (per chi sta in fila dietro al primo) */
  stop: number;
  dir: 1 | -1;
  /** tessere al secondo */
  speed: number;
  mode: Mode;
  /** secondi di attesa prima di muoversi */
  wait: number;
  /** soste ai due capi, per chi fa la spola */
  pause: [number, number];
  /** 0..1: compare e scompare in dissolvenza */
  alpha: number;
  moving: boolean;
  done: boolean;
  /** tiene una torcia (la fiamma la disegnano gli effetti) */
  torch?: boolean;
  /** scostamento laterale fisso, per non camminare tutti sulla stessa riga */
  side: number;
}

// ---------------------------------------------------------------- percorsi

const LO = -30, HI = 54, SIDE = HI - LO + 1;
const idx = (gx: number, gy: number) => (gx - LO) * SIDE + (gy - LO);

/** Tessere su cui non si cammina: edifici e mura (le porte restano aperte), acqua. */
export function blockedOf(m: CityModel): Set<number> {
  const b = new Set<number>();
  for (const o of m.objects) {
    if (o.size < 1 || o.kind === 'porta') continue;
    for (let a = 0; a < o.size; a++) for (let c = 0; c < o.size; c++) b.add(tileKey(o.gx + a, o.gy + c));
  }
  return b;
}

const NEAR: Pt[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * Percorso da una tessera all'altra (centri delle tessere), o null se non c'è.
 * Se la partenza o la meta sono occupate (una casa, il mercato) si parte o si
 * arriva alla tessera libera accanto. Le strade costano meno dell'erba.
 */
export function route(m: CityModel, blocked: Set<number>, from: Pt, to: Pt): Pt[] | null {
  const free = (gx: number, gy: number) => gx >= LO && gy >= LO && gx <= HI && gy <= HI && !isWater(gx) && !blocked.has(tileKey(gx, gy));
  // davanti a un edificio: le tessere libere lungo i due lati verso chi guarda (lì stanno le porte); se non ce n'è, quelle dietro
  const around = (p: Pt): Pt[] => {
    if (free(p[0], p[1])) return [p];
    const o = m.objects.find(b => b.size >= 1 && p[0] >= b.gx && p[0] < b.gx + b.size && p[1] >= b.gy && p[1] < b.gy + b.size);
    const x = o?.gx ?? p[0], y = o?.gy ?? p[1], n = o?.size ?? 1, front: Pt[] = [], back: Pt[] = [];
    for (let j = 0; j < n; j++) {
      front.push([x + n, y + j], [x + j, y + n]);
      back.push([x - 1, y + j], [x + j, y - 1]);
    }
    const ok = front.filter(q => free(q[0], q[1]));
    return ok.length ? ok : back.filter(q => free(q[0], q[1]));
  };
  const starts = around([Math.floor(from[0]), Math.floor(from[1])]), goals = new Set(around([Math.floor(to[0]), Math.floor(to[1])]).map(p => idx(p[0], p[1])));
  if (!starts.length || !goals.size) return null;
  // Dijkstra a secchi: strada 2, lastricato e terra 3, campi coltivati 6
  const cost = (gx: number, gy: number) => {
    if (isRoad(gx, gy)) return 2;
    const g = m.ground.get(tileKey(gx, gy))?.sprite;
    return g && (g.startsWith('grano') || g === 'arato') ? 6 : 3;
  };
  const dist = new Int32Array(SIDE * SIDE).fill(-1), prev = new Int32Array(SIDE * SIDE).fill(-1);
  const buckets: number[][] = [];
  const push = (d: number, i: number) => (buckets[d] ??= []).push(i);
  for (const s of starts) {
    dist[idx(s[0], s[1])] = 0;
    push(0, idx(s[0], s[1]));
  }
  let goal = -1;
  for (let d = 0; d < buckets.length && goal < 0; d++) {
    const b = buckets[d];
    if (!b) continue;
    for (let k = 0; k < b.length; k++) {
      const i = b[k];
      if (dist[i] !== d) continue;
      if (goals.has(i)) {
        goal = i;
        break;
      }
      const gx = Math.floor(i / SIDE) + LO, gy = (i % SIDE) + LO;
      for (const [dx, dy] of NEAR) {
        const nx = gx + dx, ny = gy + dy;
        if (!free(nx, ny)) continue;
        const j = idx(nx, ny), nd = d + cost(nx, ny);
        if (dist[j] < 0 || nd < dist[j]) {
          dist[j] = nd;
          prev[j] = i;
          push(nd, j);
        }
      }
    }
  }
  if (goal < 0) return null;
  const path: Pt[] = [];
  for (let i = goal; i >= 0; i = prev[i]) path.push([Math.floor(i / SIDE) + LO + 0.5, (i % SIDE) + LO + 0.5]);
  path.reverse();
  // si tengono solo le svolte
  return path.filter((p, i) => i === 0 || i === path.length - 1 || (p[0] - path[i - 1][0]) !== (path[i + 1][0] - p[0]) || (p[1] - path[i - 1][1]) !== (path[i + 1][1] - p[1]));
}

export function makeWalker(id: string, sprite: string, path: Pt[], o: Partial<Pick<Walker, 'speed' | 'mode' | 'wait' | 'pause' | 'torch' | 'side' | 'stop'>> = {}): Walker {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const len = cum[cum.length - 1], mode = o.mode ?? 'pendola';
  const stop = Math.max(0, Math.min(len, o.stop ?? len));
  const still = mode === 'parte' || mode === 'fermo';
  return {
    id, sprite, path, cum, stop, mode, pos: still ? stop : 0, dir: mode === 'parte' ? -1 : 1, speed: o.speed ?? 1.1, wait: o.wait ?? 0,
    pause: o.pause ?? [4, 4], alpha: still ? 1 : 0, moving: false, done: false, side: o.side ?? 0, ...(o.torch ? { torch: true } : {}),
  };
}

/** Fa avanzare l'omino di `dt` secondi. */
export function advance(w: Walker, dt: number): void {
  if (w.done) return;
  const len = w.cum[w.cum.length - 1];
  w.moving = false;
  if (w.wait > 0) {
    w.wait -= dt;
    // chi fa la spola sparisce "in casa" durante la sosta
    if (w.mode === 'pendola' || w.mode === 'passa') w.alpha = Math.max(0, w.alpha - dt * 2);
    return;
  }
  if (w.mode === 'fermo' || (w.mode === 'arriva' && w.pos >= w.stop)) {
    w.alpha = Math.min(1, w.alpha + dt * 2);
    return;
  }
  w.moving = true;
  w.pos += w.dir * w.speed * dt;
  const end = w.dir > 0 ? (w.mode === 'arriva' ? w.stop : len) : 0;
  const left = Math.abs(end - w.pos), reached = w.dir > 0 ? w.pos >= end : w.pos <= end;
  // dissolvenza: si compare partendo e, se alla meta si sparisce, ci si dissolve arrivando
  const vanishing = w.mode === 'pendola' || w.mode === 'va' || w.mode === 'parte' || w.mode === 'passa';
  const target = vanishing && left < 0.6 ? left / 0.6 : 1;
  w.alpha += Math.max(-dt * 3, Math.min(dt * 2, target - w.alpha));
  if (!reached) return;
  w.pos = end;
  if (w.mode === 'giro') w.pos = 0;
  else if (w.mode === 'passa') {
    w.pos = 0;
    w.alpha = 0;
    w.wait = w.pause[1];
  }
  else if (w.mode === 'pendola') {
    w.wait = w.dir > 0 ? w.pause[1] : w.pause[0];
    w.dir = w.dir > 0 ? -1 : 1;
  } else if (w.mode === 'va' || w.mode === 'parte') {
    w.done = true;
    w.alpha = 0;
  }
}

/** Dove sta e da che parte va (dx, dy: direzione sulla griglia). */
export function poseOf(w: Walker): { gx: number; gy: number; dx: number; dy: number } {
  const { path, cum } = w;
  if (path.length < 2) return { gx: path[0][0], gy: path[0][1], dx: 0, dy: 1 };
  let i = 1;
  while (i < cum.length - 1 && cum[i] < w.pos) i++;
  const a = path[i - 1], b = path[i], seg = cum[i] - cum[i - 1] || 1, t = Math.max(0, Math.min(1, (w.pos - cum[i - 1]) / seg));
  const dx = ((b[0] - a[0]) / seg) * w.dir, dy = ((b[1] - a[1]) / seg) * w.dir;
  // lo scostamento laterale è perpendicolare al cammino
  return { gx: a[0] + (b[0] - a[0]) * t - dy * w.side, gy: a[1] + (b[1] - a[1]) * t + dx * w.side, dx, dy };
}

/**
 * Sprite da disegnare e se va specchiato, secondo il cammino. Come sono disegnate le figure (controllato sui fogli):
 * - a piedi, di fronte: guardano in basso a destra; di spalle ("-retro"): in alto a sinistra;
 * - bestie e carri (`A_SINISTRA`): di fronte guardano in basso a sinistra; di spalle anche loro in alto a sinistra;
 * - contadino, banditore, saraceno e franco hanno la vista di spalle rifatta in un secondo tempo (prompt10-15);
 *   il mercante con l'asino è stato ridisegnato verso destra come chi va a piedi (prompt14).
 */
const RETRO = new Set(['contadino', 'contadina', 'banditore', 'saraceno', 'franco', 'soldato', 'monaco', 'signore', 'dama', 'brigante', 'mercante-asino', 'carro-buoi', 'cavaliere', 'cavaliere-pesante', 'ungaro']);
// disegnati rivolti a sinistra; la carovana esce solo verso sud, in primo piano (in basso a sinistra), e non ha vista di spalle
const A_SINISTRA = new Set(['carro-buoi', 'cavaliere', 'cavaliere-pesante', 'carovana']);
export function facing(sprite: string, dx: number, dy: number): { sprite: string; flip: boolean } {
  // sullo schermo: x = dx - dy, y = dx + dy
  const sx = dx - dy, sy = dx + dy;
  if (sy < -0.01 && RETRO.has(sprite)) return { sprite: `${sprite}-retro`, flip: sx > 0.01 };
  return { sprite, flip: A_SINISTRA.has(sprite) ? sx > 0.01 : sx < -0.01 };
}

/** Le figure in sella o col carro fanno passi più lunghi, in tessere. */
export const PASSO_LUNGO = new Set([...A_SINISTRA, 'ungaro', 'mercante-asino', 'carretto', 'carretto-vuoto']);
/**
 * Il fotogramma della camminata: 0 o 1, alternati secondo la strada fatta (non il tempo), così chi va
 * piano fa passi lenti. `sfasa` distingue gli omini, perché non marcino tutti allo stesso passo.
 */
export function stepOf(sprite: string, pos: number, sfasa = 0): 0 | 1 {
  const lungo = PASSO_LUNGO.has(sprite) ? 0.42 : 0.24;
  return (Math.floor(Math.abs(pos) / lungo + sfasa) % 2) as 0 | 1;
}

// ---------------------------------------------------------------- vita di tutti i giorni

/** Ciò che della partita conta per popolare la città. */
export interface Vita {
  servi: number;
  mercati: number;
  soldati: number;
  piani: number;
  /** 0..1: quanta gente è in giro (la peste svuota le strade) */
  folla: number;
  /** giorno di mercato (Delibera): più mercanti, il banditore in piazza */
  mercato: boolean;
}

/** Quanto lontano dal centro si entra in scena, in tessere: appena fuori dall'inquadratura. */
export const edgeOf = (m: CityModel): number => Math.min(21, Math.round(1.7 * (m.extent + 2) + 2));

export const tilesOf = (m: CityModel, test: (sprite: string) => boolean): Pt[] => {
  const out: Pt[] = [];
  for (const [k, g] of m.ground) if (test(g.sprite)) out.push([Math.floor(k / 256) - 64, (k % 256) - 64]);
  return out;
};

/** Paesani in giro al più. */
export const MAX_CROWD = 70;
/** Numero di paesani in giro: cresce con i servi (circa 11 a mille servi, 31 a diecimila, 51 a trentamila), al più MAX_CROWD. */
export const crowdOf = (servi: number): number => Math.max(3, Math.min(MAX_CROWD, Math.round(2 + Math.sqrt(Math.max(0, servi)) / 3.5)));

/** Giro della piazza, attorno al palazzo. */
const SQUARE: Pt[] = [[C - 2, C - 2], [C + 2, C - 2], [C + 2, C + 2], [C - 2, C + 2], [C - 2, C - 2]].map(p => [p[0] + 0.5, p[1] + 0.5] as Pt);

/** Gli omini della vita di tutti i giorni, in ordine stabile: l'omino `id` fa sempre lo stesso mestiere. */
export function ambient(m: CityModel, v: Vita): Walker[] {
  const blocked = blockedOf(m), out: Walker[] = [];
  const r = (i: number, salt: number) => hash(m.seed, i, salt, 31);
  const houses = m.objects.filter(o => o.kind === 'casa').map(o => [o.gx, o.gy] as Pt);
  const fields = tilesOf(m, s => s.startsWith('grano') || s === 'arato');
  const shops = m.objects.filter(o => o.kind === 'mercato' || o.kind === 'fondaco' || o.kind === 'chiesa' || o.kind === 'opificio' || o.kind === 'granaio').map(o => [o.gx, o.gy] as Pt);
  const D = edgeOf(m);
  const add = (id: string, sprite: string, from: Pt, to: Pt, o: Parameters<typeof makeWalker>[3], i: number) => {
    const path = route(m, blocked, from, to);
    if (path && path.length > 1) out.push(makeWalker(id, sprite, path, { side: (r(i, 9) - 0.5) * 0.36, ...o }));
    return !!path && path.length > 1;
  };
  // paesani: da casa ai campi, o alle botteghe e alla piazza
  const n = houses.length ? Math.round(crowdOf(v.servi) * v.folla) : 0;
  for (let i = 0; i < n; i++) {
    const toField = fields.length > 0 && r(i, 2) < 0.6;
    const to: Pt = toField ? fields[Math.floor(r(i, 3) * fields.length)] : shops.length && r(i, 3) < 0.7 ? shops[Math.floor(r(i, 4) * shops.length)] : [C - 2 + Math.floor(r(i, 4) * 5), C + 2];
    // le case chiuse fra le altre non hanno uscita: si prova con un'altra
    for (let k = 0; k < 6; k++) {
      const home = houses[Math.floor(r(i, 1 + k * 20) * houses.length)];
      if (add(`paesano-${i}`, r(i, 5) < 0.55 ? 'contadino' : 'contadina', home, to, { speed: 0.9 + r(i, 6) * 0.5, wait: r(i, 7) * 14, pause: [3 + r(i, 8) * 10, 2 + r(i, 10) * 6] }, i)) break;
    }
  }
  // mercanti: dal bordo della mappa al mercato (o alla piazza) e via
  const market = m.objects.find(o => o.kind === 'mercato') ?? m.objects.find(o => o.kind === 'fondaco');
  const nMerc = Math.round(Math.min(5, (v.mercati > 0 ? 1 + v.mercati / 3 : 0.6) * (v.mercato ? 2 : 1)) * v.folla);
  // entrano da nord, passano dal mercato ed escono a sud: così scendono sempre verso chi guarda (asino e carro non hanno la vista di spalle)
  const via = route(m, blocked, [ROAD_X, C - D], market ? [market.gx, market.gy] : [C + 2, C + 2]);
  const out2 = via && route(m, blocked, [Math.floor(via[via.length - 1][0]), Math.floor(via[via.length - 1][1])], [ROAD_X, C + D]);
  for (let i = 0; i < nMerc && via && out2; i++) {
    const sprite = r(i, 12) < 0.6 ? 'mercante-asino' : 'carretto';
    // chi va a piedi accanto all'asino non corre: il passo dell'asino carico
    out.push(makeWalker(`mercante-${i}`, sprite, [...via, ...out2.slice(1)],
      { mode: 'passa', speed: sprite === 'mercante-asino' ? 0.75 : 1.25, wait: i * 6 + r(i, 13) * 8, pause: [0, 8 + r(i, 14) * 14], side: (r(i, 9) - 0.5) * 0.3 }));
  }
  // soldati di ronda attorno al palazzo e lungo le strade (Spade e castelli)
  const nSold = Math.min(12, Math.ceil(v.soldati / 40));
  for (let i = 0; i < nSold; i++) {
    if (i % 3 === 0) {
      const w = makeWalker(`ronda-${i}`, 'soldato', SQUARE, { mode: 'giro', speed: 1 });
      w.pos = (i / 3 / Math.ceil(nSold / 3)) * w.cum[w.cum.length - 1];
      w.alpha = 1;
      out.push(w);
    } else add(`ronda-${i}`, 'soldato', i % 3 === 1 ? [ROAD_X, C + RING_1 + 1] : [C - RING_1 - 1, ROAD_Y], i % 3 === 1 ? [ROAD_X, Math.min(N - 1, C + 6 + i)] : [Math.max(0, C - 6 - i), ROAD_Y], { speed: 1, wait: i, pause: [1, 1] }, 200 + i);
  }
  // un monaco fra la chiesa e il palazzo; il signore o la dama a passeggio davanti al palazzo
  const church = m.objects.find(o => o.kind === 'chiesa');
  if (church && v.folla > 0.5) add('monaco', 'monaco', [church.gx, church.gy], [C, C + 2], { speed: 0.8, wait: 3, pause: [12, 6] }, 300);
  if (v.piani >= 3 && v.folla > 0.5) add('nobile', r(0, 16) < 0.5 ? 'dama' : 'signore', [C - 2, C + 2], [C + 2, C + 2], { speed: 0.7, wait: 6, pause: [9, 9] }, 301);
  if (v.mercato) out.push(makeWalker('banditore', 'banditore', [[C + 2.5, C + 2.5]], { mode: 'fermo' }));
  return out;
}

