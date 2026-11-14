/**
 * Vista moderna: dallo stato del signore al modello della città (puro, senza DOM).
 *
 * La pianta è fissa e seminata dal feudo, come la veduta di realm.ts: ogni
 * cosa ha il suo posto in un elenco ordinato, così un edificio nuovo occupa il
 * primo posto libero e gli altri non si spostano fra un anno e l'altro.
 *
 * Griglia: gx cresce verso il basso a destra dello schermo, gy verso il basso
 * a sinistra. Il palazzo sta al centro con la piazza intorno; due strade si
 * incrociano alla piazza; l'abitato sta fra la prima e la seconda cerchia di
 * mura, i campi fuori; il fiume scorre lungo il lato di gx alto.
 */
import type { AnnataKind, Player } from '../../domain/types';
import { realmCounts } from '../realm';
import { CASERME_DISEGNATE } from './assets';

/** lato della mappa in tessere */
export const N = 24;
/** tessera centrale (centro del palazzo) */
export const C = 12;
/** le due strade: una lungo gy (gx fisso), una lungo gx (gy fisso) */
export const ROAD_X = 14;
export const ROAD_Y = 14;
/** riva del fiume (gx); l'acqua occupa le colonne seguenti */
export const BANK_X = 21;
export const RIVER_W = 3;
/** distanza dal centro delle due cerchie di mura: RING_2 è il perimetro dell'abitato al massimo della sua espansione */
export const RING_1 = 3;
export const RING_2 = 8;

export type Stagione = 'primavera' | 'estate' | 'raccolto' | 'autunno';

/** Quanto viene dalle espansioni e dalla fase di gioco (vedi stato.ts). */
export interface CityExtra {
  stagione?: Stagione;
  annata?: AnnataKind;
  /** Spade e castelli: cerchie di mura (0..5), livello delle torri di guardia (0..3), catapulte, esercito in campo */
  mura?: number;
  torri?: number;
  catapulte?: number;
  /** soldati del feudo: la caserma, più grande con l'esercito */
  soldati?: number;
  accampamento?: boolean;
  /** Vie dei mercanti */
  fondaco?: boolean;
  banco?: boolean;
  vigneti?: number;
  porto?: boolean;
}

export type CityKind = 'palazzo' | 'casa' | 'mercato' | 'opificio' | 'mulino' | 'granaio' | 'chiesa' | 'fondaco' | 'banco' | 'porto'
  | 'mura' | 'porta' | 'torre' | 'caserma' | 'assedio' | 'accampamento' | 'covone' | 'vigna' | 'natura';

export interface CityObject {
  /** posto occupato: stabile fra un modello e il successivo (serve a riconoscere ciò che è nuovo) */
  id: string;
  kind: CityKind;
  sprite: string;
  gx: number;
  gy: number;
  /** impronta in tessere (lato); 0 = oggetto di contorno al centro della tessera */
  size: number;
  flip?: boolean;
}

export interface Ground { sprite: string; flip?: boolean }

export interface CityModel {
  seed: number;
  /** terreno delle tessere che non sono quelle di base (campi, piazza) */
  ground: Map<number, Ground>;
  /** oggetti in ordine di profondità (dal fondo verso chi guarda) */
  objects: CityObject[];
  /** tessere di strada dentro la mappa, per gli omini */
  roads: [number, number][];
  /** distanza dal centro (in tessere) di ciò che è costruito o coltivato */
  extent: number;
  /** distanza dal centro dell'abitato (case, botteghe, mura): l'inquadratura di partenza si stringe su questo */
  core: number;
  /** impronta del modello: cambia solo se cambia ciò che si disegna */
  key: string;
}

export const tileKey = (gx: number, gy: number) => (gx + 64) * 256 + (gy + 64);

/** Caso stabile per tessera, in [0, 1). */
export function hash(seed: number, gx: number, gy: number, salt = 0): number {
  let h = (seed ^ Math.imul(gx + 101, 0x9e3779b1) ^ Math.imul(gy + 211, 0x85ebca6b) ^ Math.imul(salt + 7, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const dist = (gx: number, gy: number) => Math.max(Math.abs(gx - C), Math.abs(gy - C));
const inMap = (gx: number, gy: number) => gx >= 0 && gy >= 0 && gx < N && gy < N;
export const isWater = (gx: number) => gx > BANK_X && gx <= BANK_X + RIVER_W;
export const isRoad = (gx: number, gy: number) => gx < BANK_X && (gx === ROAD_X || gy === ROAD_Y);

/** Terreno di base di una tessera qualsiasi, anche fuori dalla mappa (il mondo continua oltre il bordo). */
export function baseGround(seed: number, gx: number, gy: number): Ground {
  if (isWater(gx)) return { sprite: 'acqua' };
  if (gx === BANK_X) return { sprite: 'riva-erba', flip: true };
  if (isRoad(gx, gy)) return { sprite: 'sassoso' };
  return { sprite: hash(seed, gx, gy) < 0.05 ? 'erba-fiori' : 'erba' };
}

export function groundAt(m: CityModel, gx: number, gy: number): Ground {
  return m.ground.get(tileKey(gx, gy)) ?? baseGround(m.seed, gx, gy);
}

const TREES = ['quercia-1', 'quercia-2', 'cipresso-1', 'cipresso-2', 'cipresso-3', 'ulivo-1', 'ulivo-2'];

/** Bosco e sassi fuori dalla mappa: fitto, perché lì non si costruisce. */
export function wildAt(seed: number, gx: number, gy: number): string | null {
  if (inMap(gx, gy) || gx >= BANK_X && gx <= BANK_X + RIVER_W || isRoad(gx, gy)) return null;
  const r = hash(seed, gx, gy, 1);
  if (r < 0.42) return TREES[Math.floor(hash(seed, gx, gy, 2) * 4)]; // querce e cipressi
  if (r < 0.52) return hash(seed, gx, gy, 2) < 0.5 ? 'cespuglio-1' : 'cespuglio-2';
  if (r < 0.55) return 'sassi';
  return null;
}

// ---------------------------------------------------------------- pianta

type Lot = [number, number];
/** lotti di 2×2 tessere, in ordine di costruzione */
const MARKET_LOTS: Lot[] = [[12, 16], [10, 16], [8, 16], [12, 18], [10, 18]];
const WORKSHOP_LOTS: Lot[] = [[16, 12], [18, 12], [16, 10], [18, 10], [16, 8]];
const BARN_LOTS: Lot[] = [[16, 16], [18, 16], [16, 18], [18, 18]];
const FONDACO_LOT: Lot = [6, 16];
/** caserma (Spade e castelli): lo stesso lotto del fondaco, perché le espansioni non stanno mai insieme */
const CASERMA_LOT: Lot = FONDACO_LOT;
const BANCO_LOT: Lot = [8, 18];
const CHURCH_LOT: Lot = [7, 12];
const MILL_AT: Lot = [BANK_X, 11];
const PORT_AT: Lot = [BANK_X, ROAD_Y];
/** torri di guardia appena fuori dalle mura dell'abitato, accanto alle strade (nord, ovest, sud): restano nell'inquadratura */
const WATCH: Lot[] = [[ROAD_X + 1, C - RING_2 - 1], [C - RING_2 - 1, ROAD_Y + 1], [ROAD_X + 1, C + RING_2 + 1]];
const CATAPULT_AT: Lot = [10, 14];
const CAMP_AT: Lot = [12, 23];
/** campi riservati al grano; i successivi nell'elenco sono dei vigneti */
export const MAX_CAMPI = 24;
/** acri per tessera di campo: quanti ne porta un acquisto di terre */
const ACRI_PER_ZOLLA = 25;
/** in che ordine si arano le quattro tessere di un campo */
const ZOLLE: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
const FIELD_SPRITES = new Set(['grano-verde', 'grano-maturo', 'arato']);
export const MAX_VIGNE = 8;
export const MAX_CASE_CITTA = 70;

interface Plan {
  houses: Lot[];
  fields: Lot[];
  /** tessere dell'abitato lasciate libere: alberi e cespugli */
  green: { at: Lot; sprite: string }[];
}

const plans = new Map<number, Plan>();

function planFor(seed: number): Plan {
  const hit = plans.get(seed);
  if (hit) return hit;
  const taken = new Set<number>();
  const take = (gx: number, gy: number, n = 1) => {
    for (let x = gx; x < gx + n; x++) for (let y = gy; y < gy + n; y++) taken.add(tileKey(x, y));
  };
  for (const l of [...MARKET_LOTS, ...WORKSHOP_LOTS, ...BARN_LOTS, FONDACO_LOT, BANCO_LOT, CHURCH_LOT]) take(l[0], l[1], 2);
  for (const l of [...WATCH, CATAPULT_AT, CAMP_AT]) take(l[0], l[1]);

  // case: nell'abitato, fra le due cerchie, dal centro verso fuori
  const houses: (Lot & { d?: number })[] = [];
  const green: Plan['green'] = [];
  for (let gx = C - RING_2 + 1; gx < C + RING_2; gx++) for (let gy = C - RING_2 + 1; gy < C + RING_2; gy++) {
    if (dist(gx, gy) <= RING_1 || isRoad(gx, gy) || taken.has(tileKey(gx, gy))) continue;
    if (hash(seed, gx, gy, 3) < 0.16) {
      const r = hash(seed, gx, gy, 4);
      if (r < 0.75) green.push({ at: [gx, gy], sprite: r < 0.3 ? TREES[5 + Math.floor(r * 6.6)] : r < 0.55 ? 'cespuglio-1' : 'cespuglio-2' });
      continue;
    }
    houses.push([gx, gy]);
  }
  const hd = (l: Lot) => Math.hypot(l[0] - C, l[1] - C) + hash(seed, l[0], l[1], 5) * 2.2;
  houses.sort((a, b) => hd(a) - hd(b));

  // campi di 2×2 fuori dalla seconda cerchia: due fasce in alto, due a sinistra, una in basso
  const fields: Lot[] = [];
  const add = (x: number, y: number) => {
    for (let i = x; i < x + 2; i++) for (let j = y; j < y + 2; j++) if (!inMap(i, j) || isRoad(i, j) || i >= BANK_X || taken.has(tileKey(i, j))) return;
    fields.push([x, y]);
  };
  for (const y of [2, 0]) for (let x = 0; x <= 18; x += 2) add(x, y);
  for (const x of [2, 0]) for (let y = 4; y <= 20; y += 2) add(x, y);
  for (let x = 4; x <= 18; x += 2) add(x, 21);
  const fd = (l: Lot) => Math.hypot(l[0] + 0.5 - C, l[1] + 0.5 - C) + hash(seed, l[0], l[1], 6) * 2.5;
  fields.sort((a, b) => fd(a) - fd(b));
  // alberi sparsi fra i campi, dove non si coltiva
  const inField = new Set<number>();
  for (const f of fields) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) inField.add(tileKey(f[0] + i, f[1] + j));
  for (let gx = 0; gx < BANK_X; gx++) for (let gy = 0; gy < N; gy++) {
    if (dist(gx, gy) <= RING_2 || isRoad(gx, gy) || taken.has(tileKey(gx, gy)) || inField.has(tileKey(gx, gy))) continue;
    const r = hash(seed, gx, gy, 4);
    if (r < 0.5) green.push({ at: [gx, gy], sprite: r < 0.3 ? TREES[Math.floor(r * 23)] : r < 0.42 ? 'cespuglio-1' : 'sassi' });
  }
  const plan = { houses, fields, green };
  plans.set(seed, plan);
  return plan;
}

// ---------------------------------------------------------------- quantità

/** Palazzo: sei aspetti per undici piani. */
export function palaceSprite(piani: number): string {
  return `palazzo-${piani <= 0 ? 1 : piani <= 2 ? 2 : piani <= 4 ? 3 : piani <= 6 ? 4 : piani <= 8 ? 5 : 6}`;
}

/** Caserma: piccola fino a 100 soldati, media fino a 1000, grande oltre. */
export function casermaSprite(soldati: number): string {
  return CASERME_DISEGNATE ? `caserma-${soldati <= 100 ? 1 : soldati <= 1000 ? 2 : 3}` : 'caserma-tende';
}

/** Case sulla mappa: una per casa del reame fino a 30, poi sempre più rade (ogni casa "vale" di più). */
export function housesShown(caseReame: number): number {
  if (caseReame <= 30) return Math.max(0, caseReame);
  return Math.min(MAX_CASE_CITTA, 30 + Math.round(Math.sqrt(caseReame - 30) * 1.7));
}

/** Botteghe da disegnare: ogni cinque una grande (true), le altre piccole; al più `max`, le grandi per prime. */
export function shops(n: number, max: number): boolean[] {
  const big = Math.floor(Math.max(0, n) / 5), small = Math.max(0, n) % 5;
  return [...Array<boolean>(big).fill(true), ...Array<boolean>(small).fill(false)].slice(0, max);
}

const HOUSE_SPRITES = ['casa-paglia', 'casa-paglia', 'casa-orto', 'casa-pozzo'];

// ---------------------------------------------------------------- modello

export function cityModel(p: Player, x: CityExtra = {}): CityModel {
  const seed = p.feudo * 7919 + 17;
  const plan = planFor(seed);
  const k = realmCounts(p);
  const ground = new Map<number, Ground>();
  const objects: CityObject[] = [];
  const put = (kind: CityKind, id: string, sprite: string, at: Lot, size: number, flip?: boolean) =>
    objects.push({ id, kind, sprite, gx: at[0], gy: at[1], size, ...(flip ? { flip } : {}) });

  // palazzo e piazza lastricata
  for (let gx = C - 2; gx <= C + 2; gx++) for (let gy = C - 2; gy <= C + 2; gy++) ground.set(tileKey(gx, gy), { sprite: 'lastricato' });
  put('palazzo', 'palazzo', palaceSprite(k.piani), [C - 1, C - 1], 3);

  // case
  const nCase = Math.min(housesShown(k.case), plan.houses.length);
  for (let i = 0; i < nCase; i++) {
    const at = plan.houses[i];
    put('casa', `casa-${i}`, HOUSE_SPRITES[Math.floor(hash(seed, at[0], at[1], 7) * HOUSE_SPRITES.length)], at, 1, hash(seed, at[0], at[1], 8) < 0.5);
  }
  const chiesa = nCase >= 60 ? 'cattedrale' : nCase >= 6 ? 'chiesa' : '';
  if (chiesa) put('chiesa', 'chiesa', chiesa, CHURCH_LOT, 2);

  // mercati, opifici (il primo è il mulino sul fiume), granai
  shops(k.mercati, MARKET_LOTS.length).forEach((big, i) => put('mercato', `mercato-${i}`, big ? 'mercato-2' : 'mercato-1', MARKET_LOTS[i], 2));
  if (k.opifici >= 1) put('mulino', 'mulino', 'mulino', MILL_AT, 1);
  shops(k.opifici - 1, WORKSHOP_LOTS.length).forEach((big, i) => put('opificio', `opificio-${i}`, big ? 'opificio-2' : 'opificio-1', WORKSHOP_LOTS[i], 2));
  // senza granai da costruire (regole originali) si vedono i magazzini del grano
  const granai = p.granai !== undefined ? k.granai : Math.ceil(k.magazzini / 2);
  const nGranai = granai <= 3 ? granai : granai < 10 ? 3 : BARN_LOTS.length;
  for (let i = 0; i < nGranai; i++) put('granaio', `granaio-${i}`, 'granaio', BARN_LOTS[i], 2);

  // Vie dei mercanti
  if (x.fondaco) put('fondaco', 'fondaco', 'fondaco', FONDACO_LOT, 2);
  if (x.banco) put('banco', 'banco', 'banco', BANCO_LOT, 2);
  if (x.porto) put('porto', 'porto', 'porto', PORT_AT, 1);

  // campi: l'aspetto segue la stagione; in carestia una parte resta incolta
  const st = x.stagione ?? 'primavera';
  // un campo di 2×2 tessere sono 100 acri: ogni acquisto di terre (25 acri) ara una tessera in più del campo seguente
  const zolle = Math.min(MAX_CAMPI * 4, plan.fields.length * 4, Math.max(0, Math.floor(p.acri / ACRI_PER_ZOLLA)));
  const nCampi = Math.ceil(zolle / 4);
  for (let i = 0; i < nCampi; i++) {
    const [fx, fy] = plan.fields[i];
    const r = hash(seed, fx, fy, 9);
    const barren = x.annata === 'carestia' && r < 0.4;
    const mown = st === 'autunno' || (st === 'raccolto' && r >= 0.5);
    const sprite = barren ? 'arato' : mown ? 'arato' : st === 'primavera' ? 'grano-verde' : 'grano-maturo';
    const tiles = ZOLLE.slice(0, Math.min(4, zolle - i * 4));
    for (const [a, b] of tiles) ground.set(tileKey(fx + a, fy + b), { sprite });
    if (!barren && st === 'raccolto' && mown) {
      if (tiles.length > 2) put('covone', `covone-${i}a`, 'covone', [fx, fy + 1], 0);
      if (tiles.length > 1) put('covone', `covone-${i}b`, 'covone', [fx + 1, fy], 0);
    }
  }
  const nVigne = Math.min(x.vigneti ?? 0, MAX_VIGNE, Math.max(0, plan.fields.length - MAX_CAMPI));
  for (let i = 0; i < nVigne; i++) {
    const [fx, fy] = plan.fields[MAX_CAMPI + i];
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      ground.set(tileKey(fx + a, fy + b), { sprite: 'arato' });
      put('vigna', `vigna-${i}-${a}${b}`, 'cespuglio-2', [fx + a, fy + b], 0);
    }
  }

  // Spade e castelli: la prima cerchia chiude tutto l'abitato (case, botteghe, granai), la seconda il palazzo; dalla terza si aggiungono torrioni
  const mura = Math.max(0, Math.min(5, Math.floor(x.mura ?? 0)));
  const ring = (r: number, d: number, bastions: number[]) => {
    const lo = C - d, hi = C + d;
    for (let i = lo; i <= hi; i++) for (const [gx, gy, side] of [[i, lo, 'x'], [i, hi, 'x'], [lo, i, 'y'], [hi, i, 'y']] as [number, number, string][]) {
      const corner = (gx === lo || gx === hi) && (gy === lo || gy === hi);
      if (corner && side === 'y') continue; // gli angoli una volta sola
      if (gx >= BANK_X) continue;
      const id = `mura-${r}-${gx}-${gy}`;
      if (corner) put('torre', id, gx === hi && gy === hi ? 'mura-angolo' : 'torre', [gx, gy], 1);
      else if (side === 'x' && gx === ROAD_X) put('porta', id, 'porta', [gx, gy], 1);
      else if (side === 'y' && gy === ROAD_Y) put('porta', id, 'porta', [gx, gy], 1, true);
      else if (bastions.includes(Math.abs((side === 'x' ? gx : gy) - C))) put('torre', id, 'torre', [gx, gy], 1);
      else put('mura', id, side === 'x' ? 'mura-no' : 'mura-ne', [gx, gy], 1);
    }
  };
  if (mura >= 1) ring(1, RING_2, mura >= 4 ? [5, 0] : mura >= 3 ? [5] : []);
  if (mura >= 2) ring(2, RING_1, mura >= 5 ? [0] : []);
  for (let i = 0; i < Math.min(WATCH.length, x.torri ?? 0); i++) put('torre', `guardia-${i}`, 'torre-guardia', WATCH[i], 1);
  if ((x.catapulte ?? 0) > 0) put('assedio', 'catapulte', 'assedio', CATAPULT_AT, 1);
  if ((x.soldati ?? 0) > 0 && !x.fondaco) put('caserma', 'caserma', casermaSprite(x.soldati ?? 0), CASERMA_LOT, 2);
  if (x.accampamento) put('accampamento', 'accampamento', 'accampamento', CAMP_AT, 1);

  // verde: solo dove nulla è stato costruito o coltivato
  const used = new Set<number>(ground.keys());
  for (const o of objects) for (let a = 0; a < Math.max(1, o.size); a++) for (let b = 0; b < Math.max(1, o.size); b++) used.add(tileKey(o.gx + a, o.gy + b));
  for (const g of plan.green) if (!used.has(tileKey(g.at[0], g.at[1]))) put('natura', `verde-${g.at[0]}-${g.at[1]}`, g.sprite, g.at, 0);

  // profondità: il centro dell'impronta, dal fondo verso chi guarda
  const depth = (o: CityObject) => o.gx + o.gy + Math.max(1, o.size);
  objects.sort((a, b) => depth(a) - depth(b) || a.gx - b.gx);

  const roads: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    roads.push([ROAD_X, i]);
    if (i !== ROAD_X && i < BANK_X) roads.push([i, ROAD_Y]);
  }

  let extent = RING_1 + 2, core = RING_1 + 1;
  for (const o of objects) {
    if (o.kind === 'natura') continue;
    const d = Math.max(dist(o.gx, o.gy), dist(o.gx + Math.max(1, o.size) - 1, o.gy + Math.max(1, o.size) - 1));
    extent = Math.max(extent, d);
    if (o.kind !== 'covone' && o.kind !== 'vigna' && o.kind !== 'accampamento') core = Math.max(core, d);
  }
  for (let i = 0; i < nCampi; i++) extent = Math.max(extent, dist(plan.fields[i][0], plan.fields[i][1]), dist(plan.fields[i][0] + 1, plan.fields[i][1] + 1));

  const key = objects.map(o => `${o.id}:${o.sprite}`).join(',') + '|' + [...ground].map(([t, g]) => `${t}:${g.sprite}`).join(',');
  return { seed, ground, objects, roads, extent, core, key };
}

/** Ciò che c'è in `next` e non c'era (o era diverso) in `prev`: i "momenti" da mostrare. */
export function added(prev: CityModel | null, next: CityModel): CityObject[] {
  if (!prev || prev.seed !== next.seed) return [];
  const old = new Map(prev.objects.map(o => [o.id, o.sprite]));
  return next.objects.filter(o => o.kind !== 'natura' && old.get(o.id) !== o.sprite);
}

/** Tessere di campo appena arate (terre comprate): le loro coordinate. */
export function addedFields(prev: CityModel | null, next: CityModel): [number, number][] {
  if (!prev || prev.seed !== next.seed) return [];
  const out: [number, number][] = [];
  for (const [t, g] of next.ground) {
    if (!FIELD_SPRITES.has(g.sprite) || FIELD_SPRITES.has(prev.ground.get(t)?.sprite ?? '')) continue;
    out.push([Math.floor(t / 256) - 64, (t % 256) - 64]);
  }
  return out;
}
