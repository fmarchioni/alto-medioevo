/**
 * Vista moderna: la città del signore di turno su un canvas persistente.
 *
 * mountApp ricostruisce la pagina con innerHTML a ogni azione: il canvas è
 * creato una volta sola e, dopo ogni ridisegno, viene rimesso nel suo
 * segnaposto (showCity). La città è un plastico vivo: gli omini camminano e
 * gli effetti si muovono a ogni fotogramma, ma nulla di ciò tocca lo stato di
 * gioco. Il ciclo si ferma se il canvas non è nel documento o la scheda è
 * nascosta; con "riduci movimento" resta la veduta ferma.
 */
import { staParlando } from '../speaker';
import { Assets } from './assets';
import { ATLANTE_BASE, ATLANTE_COLONNE, ATLANTE_SCALA, ATLANTE_RIGHE, ATLANTI, PASSO_BESTIA, PASSO_PERSONA, passoAtlante, rigaAtlante } from './atlanti';
import { Effects } from './effects';
import { TH, toWorld, TW } from './iso';
import { added, addedFields, BANK_X, C, hash, RIVER_W, type CityModel, type CityObject } from './layout';
import { drawFrame, drawStatic, frameFor, K, makeLayer, PEOPLE, ZOOM_MAX, type Camera, type Figure, type Placed } from './render';
import { placeOf, type Scena } from './scene';
import { advance, ambient, blockedOf, facing, makeWalker, PASSO_LUNGO, poseOf, route, stepOf, type Walker } from './walkers';

export { cityModel } from './layout';
export { sceneOf } from './scene';
export { cityExtra } from './stato';

interface City {
  show(slot: HTMLElement, model: CityModel, scene?: Scena): void;
}

let city: City | null = null;

/** Mette il canvas della città nel segnaposto e mostra il modello, con la scena della fase in corso. */
export function showCity(slot: HTMLElement, model: CityModel, scene?: Scena): void {
  (city ??= createCity()).show(slot, model, scene);
}

/** Ciò che l'ultimo modello mostrato ha aggiunto al precedente (i "momenti": un edificio appena costruito). */
export let lastAdded: CityObject[] = [];
/** Le tessere di campo appena arate (terre comprate). */
let lastFields: [number, number][] = [];

/** Sprite delle persone: si caricano con gli altri, ma non stanno nella tabella degli edifici. */
const PEOPLE_BASE = ['contadino', 'contadina', 'mercante-asino', 'soldato', 'cavaliere', 'cavaliere-pesante', 'monaco', 'signore', 'dama', 'banditore',
  'ungaro', 'saraceno', 'longobardo', 'bizantino', 'franco', 'brigante', 'contadino-retro', 'contadina-retro', 'banditore-retro', 'saraceno-retro', 'franco-retro', 'mercante-asino-retro', 'soldato-retro', 'monaco-retro', 'signore-retro', 'dama-retro', 'brigante-retro'];
/** Viste di spalle venute dopo il foglio delle persone: non hanno ancora il secondo passo. */
const PEOPLE_RETRO = ['cavaliere-retro', 'cavaliere-pesante-retro', 'ungaro-retro'];
/** Ogni figura del foglio ha anche il secondo passo della camminata ("-passo"); chi non ce l'ha resta sul primo. */
const PEOPLE_SPRITES = [...PEOPLE_BASE, ...PEOPLE_RETRO, ...PEOPLE_BASE.map(s => `${s}-passo`)];

const center = (gx: number, gy: number) => toWorld(gx + 0.5, gy + 0.5);

/** Quanto inquadrare: l'abitato con un po' di campagna attorno (i campi più lontani si vedono allontanando con la rotellina). */
const frameExtent = (m: CityModel): number => Math.min(m.extent, m.core + 1);

const ZOOM_KEY = 'alto-medioevo/zoom';
function loadZoom(): number {
  try {
    const z = Number(localStorage.getItem(ZOOM_KEY));
    return z >= 0.5 && z <= 4 ? z : 1;
  } catch {
    return 1;
  }
}
function saveZoom(z: number): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(Math.round(z * 100) / 100));
  } catch {
    /* storage non disponibile */
  }
}

function createCity(): City {
  const canvas = document.createElement('canvas');
  canvas.className = 'citta-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'la città del feudo');
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    /* ambiente senza canvas (test) */
  }
  const assets = new Assets();
  const effects = new Effects();
  let layer: HTMLCanvasElement | null = null;
  let statics: Placed[] = [];
  let model: CityModel | null = null;
  let scene: Scena | null = null;
  let folk: Walker[] = [], cast: Walker[] = [];
  let staticDirty = true;
  let cam: Camera | null = null;
  let raf = 0, last = 0, clock = 0, sceneAt = 0;
  const home = (() => {
    const p = toWorld(C + 0.5, C + 0.5);
    return { x: p.x, y: p.y - TH * 0.6 };
  })();
  // scelte del giocatore: ingrandimento (ricordato fra le partite) e punto inquadrato (null = il centro della città)
  let zoom = loadZoom();
  let view: { x: number; y: number } | null = null;
  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------ omini ed effetti dalla scena

  /** La vita di tutti i giorni: chi c'era e fa ancora la stessa strada continua da dov'è. */
  const populate = () => {
    if (!model || !scene) return;
    const old = new Map(folk.map(w => [w.id + '|' + w.path.join(';'), w]));
    folk = ambient(model, scene.vita).map(w => old.get(w.id + '|' + w.path.join(';')) ?? w);
    effects.clear('vita');
    if (scene.vita.folla < 0.3) return;
    // fumo dai camini: qualche casa, gli opifici, l'accampamento
    let n = 0;
    for (const o of model.objects) {
      const smoky = o.kind === 'opificio' || o.kind === 'accampamento' || (o.kind === 'casa' && hash(model.seed, o.gx, o.gy, 21) < 0.3 && n++ < 14);
      if (!smoky) continue;
      const s = Math.max(1, o.size), p = center(o.gx + (s - 1) / 2, o.gy + (s - 1) / 2);
      effects.add({ kind: 'fumo', x: p.x + (o.kind === 'casa' ? 4 : 10), y: p.y - (o.kind === 'casa' ? 36 : 62), rate: o.kind === 'casa' ? 1.6 : 3.5, group: 'vita' });
    }
  };

  /** Gli attori dell'imprevisto e i suoi effetti. */
  const stage = () => {
    cast = [];
    effects.clear('scena');
    sceneAt = clock;
    if (!model || !scene) return;
    const m = model, blocked = blockedOf(m);
    scene.gruppi.forEach((gr, gi) => {
      const spread = gr.da === 'case' || gr.da === 'campi';
      const shared = spread ? null : route(m, blocked, placeOf(m, gr.da), placeOf(m, gr.a));
      for (let j = 0; j < gr.n; j++) {
        const path = spread ? route(m, blocked, placeOf(m, gr.da, j + gi * 3), placeOf(m, gr.a)) : shared;
        if (!path || path.length < 2) continue;
        // in doppia fila: chi sta dietro si ferma prima e parte dopo
        const row = Math.floor(j / 2), len = makeWalker('', '', path).cum.slice(-1)[0];
        const leaving = gr.mode === 'parte';
        cast.push(makeWalker(`scena-${gi}-${j}`, gr.sprite, path, {
          mode: gr.mode, speed: gr.speed * (1 + (hash(m.seed, gi, j, 41) - 0.5) * 0.08), side: gr.n > 1 ? (j % 2 ? 0.22 : -0.22) : 0, stop: len - row * 0.85,
          wait: (gr.attesa ?? 0) + (leaving ? (Math.ceil(gr.n / 2) - 1 - row) * 0.25 : spread ? j * 0.4 : (row * 0.85) / gr.speed), ...(gr.torce ? { torch: true } : {}),
        }));
      }
    });
    for (const f of scene.fuochi) for (let k = 0; k < f.n; k++) {
      const t = placeOf(m, f.dove, k), big = f.dove === 'granaio' ? 2 : 1, p = center(t[0] + (big - 1) / 2 + (f.dove === 'granaio' ? (k - 1) * 0.5 : 0), t[1] + (big - 1) / 2);
      effects.add({ kind: 'fuoco', x: p.x, y: p.y - (f.dove === 'campi' ? 4 : 26), rate: f.dove === 'campi' ? 60 : 46, spread: f.dove === 'campi' ? 30 : 26, group: 'scena' });
      effects.add({ kind: 'fumo', x: p.x, y: p.y - (f.dove === 'campi' ? 16 : 44), rate: 6, spread: 18, group: 'scena' });
    }
    if (scene.monete) {
      const t = placeOf(m, scene.monete.dove), p = center(t[0], t[1] - (scene.monete.dove === 'palazzo' ? 1 : 0));
      const to = scene.monete.verso ? placeOf(m, scene.monete.verso) : null, q = to ? center(to[0], to[1]) : null;
      effects.add({ kind: 'moneta', x: p.x, y: p.y - 30, rate: 7, spread: 26, vx: q ? Math.sign(q.x - p.x) * 46 : 0, group: 'scena' });
    }
    if (scene.polvere) {
      const t = placeOf(m, scene.polvere), p = center(t[0], t[1]);
      effects.add({ kind: 'polvere', x: p.x, y: p.y - 4, rate: 26, spread: 46, group: 'scena' });
    }
    if (scene.festa) {
      const p = center(C, C);
      effects.add({ kind: 'coriandolo', x: p.x, y: p.y - 70, rate: 55, spread: 110, group: 'scena' });
      effects.add({ kind: 'moneta', x: p.x, y: p.y - 50, rate: 5, spread: 60, group: 'scena' });
    }
    if (scene.alluvione) for (let k = 0; k < 6; k++) {
      const p = center(BANK_X - 1, 2 + k * 4);
      effects.add({ kind: 'goccia', x: p.x, y: p.y, rate: 9, spread: 60, group: 'scena' });
    }
  };

  /** Polvere di cantiere su ciò che è appena stato costruito. */
  const build = (news: CityObject[], fields: [number, number][] = []) => {
    // terre nuove: un po' di terra smossa su ogni zolla arata
    for (const [gx, gy] of fields) {
      const p = center(gx, gy);
      effects.add({ kind: 'polvere', x: p.x, y: p.y - 2, rate: 22, spread: 34, ttl: 2.4, group: 'momento' });
    }
    for (const o of news) {
      if (o.kind === 'covone' || o.kind === 'vigna' || o.kind === 'natura') continue;
      const s = Math.max(1, o.size), p = center(o.gx + (s - 1) / 2, o.gy + (s - 1) / 2);
      effects.add({ kind: 'polvere', x: p.x, y: p.y - 6, rate: 34 * s, spread: 44 * s, ttl: 2.4, group: 'momento' });
    }
  };

  // ------------------------------------------------------------ figure del fotogramma

  /** Chi ha l'atlante a 8 direzioni (atlanti.ts): la riga secondo la direzione, la colonna secondo il passo; niente specchio né saltello. */
  const atlasFigure = (w: Walker, img: HTMLImageElement, scala = 1): Figure | null => {
    if (w.alpha <= 0.02) return null;
    const pose = poseOf(w), p = toWorld(pose.gx, pose.gy);
    // fermo, l'omino guarda dove andava; la prima colonna è il passo a gambe quasi unite
    const riga = rigaAtlante(pose.dx, pose.dy);
    const col = w.moving ? passoAtlante(w.pos, PASSO_LUNGO.has(w.sprite) ? PASSO_BESTIA : PASSO_PERSONA, w.cum.length * 0.37 + w.side * 9) : 0;
    const cw = img.naturalWidth / ATLANTE_COLONNE, ch = img.naturalHeight / ATLANTE_RIGHE;
    const wd = cw * K * PEOPLE * scala, ht = ch * K * PEOPLE * scala, base = ATLANTE_BASE * K * PEOPLE * scala;
    const x = p.x - wd / 2, y = p.y - ht + base + 3, alpha = w.alpha;
    return {
      x: x - 2, y, w: wd + 4, h: ht + 4, depth: pose.gx + pose.gy,
      paint(c) {
        c.globalAlpha = alpha;
        c.fillStyle = 'rgba(20, 30, 10, .3)';
        c.beginPath();
        c.ellipse(p.x, p.y + 2, Math.max(6, wd * 0.3), Math.max(2.5, wd * 0.11), 0, 0, Math.PI * 2);
        c.fill();
        c.drawImage(img, col * cw, riga * ch, cw, ch, x, y, wd, ht);
        c.globalAlpha = 1;
      },
    };
  };

  const walkerFigure = (w: Walker, dt: number): Figure | null => {
    const atlante = ATLANTI[w.sprite] ? assets.get(`atlante:${ATLANTI[w.sprite]}`) : undefined;
    if (atlante && !w.torch) return atlasFigure(w, atlante, ATLANTE_SCALA[ATLANTI[w.sprite]] ?? 1);
    const pose = poseOf(w), f = facing(w.sprite, pose.dx, pose.dy);
    // camminata: due fotogrammi alternati secondo la strada fatta, con un saltello sul secondo; sfasati fra un omino e l'altro
    const step = w.moving ? stepOf(w.sprite, w.pos, w.cum.length * 0.37 + w.side * 9) : 0;
    const img = (step ? assets.get(`${f.sprite}-passo`) : undefined) ?? assets.get(f.sprite) ?? assets.get(w.sprite);
    if (!img || w.alpha <= 0.02) return null;
    const p = toWorld(pose.gx, pose.gy);
    const wd = img.naturalWidth * K * PEOPLE, ht = img.naturalHeight * K * PEOPLE;
    const bob = step ? 1.6 : 0;
    const x = p.x - wd / 2, y = p.y - ht + 3 - bob, alpha = w.alpha, flip = f.flip;
    if (w.torch && dt > 0) for (let k = effects.particles.length < 700 ? 2 : 0; k > 0; k--) effects.spawn('fuoco', p.x + (flip ? -6 : 6), y + ht * 0.2, 2, 0, 0.42);
    // il banditore in piazza fa eco al consigliere: mentre quello parla, lui grida e scuote il campanello
    const crier = w.sprite === 'banditore' && !w.moving && f.sprite === 'banditore' && staParlando();
    return {
      x: x - 2, y, w: wd + 4, h: ht + 4, depth: pose.gx + pose.gy,
      paint(c) {
        c.globalAlpha = alpha;
        c.fillStyle = 'rgba(20, 30, 10, .3)';
        c.beginPath();
        c.ellipse(p.x, p.y + 2, Math.max(6, wd * 0.36), Math.max(2.5, wd * 0.13), 0, 0, Math.PI * 2);
        c.fill();
        if (crier) banditore(c, img, x, y, wd, ht, flip);
        else if (flip) {
          c.save();
          c.translate(x + wd, y);
          c.scale(-1, 1);
          c.drawImage(img, 0, 0, wd, ht);
          c.restore();
        } else c.drawImage(img, x, y, wd, ht);
        c.globalAlpha = 1;
      },
    };
  };

  /**
   * Il banditore che grida: lo sprite senza il campanello, poi il campanello (ritagliato dallo sprite)
   * che oscilla attorno alla mano, la bocca che si apre e si chiude e qualche arco di suono.
   * Coordinate in pixel dello sprite persone/banditore (83 × 143).
   */
  const BELL = { x: 0, y: 17, w: 18, h: 20, px: 13, py: 37 }, MOUTH = { x: 45, y: 21.6 };
  const banditore = (c: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, wd: number, ht: number, flip: boolean) => {
    const W = img.naturalWidth, H = img.naturalHeight;
    const open = Math.sin(clock * 13) + Math.sin(clock * 5.3) * 0.6 > 0.15;
    c.save();
    // chi grida si solleva un poco sulle punte
    c.translate(flip ? x + wd : x, y - (open ? ht * 0.012 : 0));
    c.scale((flip ? -wd : wd) / W, ht / H);
    // tutto tranne il campanello
    c.save();
    c.beginPath();
    c.rect(0, 0, W, H);
    c.rect(BELL.x, BELL.y + BELL.h, BELL.w, -BELL.h);
    c.clip('evenodd');
    c.drawImage(img, 0, 0);
    c.restore();
    // il campanello oscilla, due scosse rapide e una pausa
    const t = clock * 2.2, swing = Math.sin(clock * 24) * (t % 1 < 0.7 ? 0.45 : 0.08);
    c.save();
    c.translate(BELL.px, BELL.py);
    c.rotate(swing);
    c.drawImage(img, BELL.x, BELL.y, BELL.w, BELL.h, BELL.x - BELL.px, BELL.y - BELL.py, BELL.w, BELL.h);
    c.restore();
    // la bocca: aperta e chiusa a tempi irregolari
    if (open) {
      c.fillStyle = '#3a120c';
      c.beginPath();
      c.ellipse(MOUTH.x, MOUTH.y + 0.6, 3, 2.4, 0, 0, Math.PI * 2);
      c.fill();
    }
    // il suono: archi che si allargano dal campanello
    c.lineWidth = 3.5;
    c.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const r = ((clock * 1.6 + k / 3) % 1), a = (1 - r) * (t % 1 < 0.7 ? 0.9 : 0.15);
      c.strokeStyle = `rgba(90, 50, 20, ${a})`;
      c.beginPath();
      c.arc(6, 26, 10 + r * 26, Math.PI * 0.72, Math.PI * 1.28);
      c.stroke();
    }
    c.restore();
  };

  const rhombus = (c: CanvasRenderingContext2D, x: number, y: number) => {
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + TW / 2, y + TH / 2);
    c.lineTo(x, y + TH);
    c.lineTo(x - TW / 2, y + TH / 2);
    c.closePath();
  };

  /** L'acqua che si muove: riflessi che scendono il fiume; con l'alluvione, le tessere allagate oltre la riva. */
  const waterFigures = (m: CityModel, out: Figure[]) => {
    for (let k = 0; k < 70; k++) {
      const gx = BANK_X + 1.3 + hash(m.seed, k, 0, 51) * (RIVER_W - 0.6), gy = ((hash(m.seed, k, 1, 51) * 64 + clock * (0.5 + hash(m.seed, k, 2, 51) * 0.5)) % 64) - 20;
      const p = toWorld(gx, gy), a = 0.18 + 0.3 * Math.abs(Math.sin(clock * 1.3 + k));
      out.push({
        x: p.x - 9, y: p.y - 4, w: 18, h: 9, depth: gx + gy - 0.5,
        paint(c) {
          c.strokeStyle = `rgba(214, 240, 246, ${a})`;
          c.lineWidth = 1.2;
          c.beginPath();
          c.moveTo(p.x + 8, p.y - 3.5);
          c.quadraticCurveTo(p.x, p.y - 1.5, p.x - 8, p.y + 3.5);
          c.stroke();
        },
      });
    }
    if (scene?.alluvione) {
      const rise = Math.min(1, (clock - sceneAt) / 2.5);
      for (let gy = -8; gy <= 32; gy++) {
        const reach = 2 + Math.floor(hash(m.seed, 7, gy >> 1, 52) * 3 * rise + rise);
        for (let gx = BANK_X - reach; gx <= BANK_X; gx++) {
          const t = toWorld(gx, gy), wave = 0.5 + 0.5 * Math.sin(clock * 2 + gx * 1.7 + gy);
          out.push({
            x: t.x - TW / 2, y: t.y, w: TW, h: TH, depth: gx + gy + 0.4,
            paint(c) {
              rhombus(c, t.x, t.y);
              c.fillStyle = `rgba(66, 131, 154, ${0.74 * rise})`;
              c.fill();
              c.strokeStyle = `rgba(214, 240, 246, ${0.35 * wave * rise})`;
              c.lineWidth = 1;
              c.beginPath();
              c.moveTo(t.x - 10, t.y + 12 + wave * 6);
              c.quadraticCurveTo(t.x, t.y + 8 + wave * 6, t.x + 10, t.y + 6 + wave * 6);
              c.stroke();
            },
          });
        }
      }
    }
  };

  /** Vele sul fiume: una nave risale la corrente e getta l'ancora all'altezza della strada. */
  const boatFigure = (out: Figure[]) => {
    const gy = Math.max(15.5, 34 - (clock - sceneAt) * 2.2), gx = BANK_X + 2.4;
    const p = toWorld(gx, gy), sway = Math.sin(clock * 2) * 1.2;
    out.push({
      x: p.x - 34, y: p.y - 58, w: 68, h: 70, depth: gx + gy,
      paint(c) {
        c.save();
        c.translate(p.x, p.y + sway);
        c.fillStyle = 'rgba(20, 40, 50, .3)';
        c.beginPath();
        c.ellipse(0, 6, 30, 7, -0.46, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#5a3a22';
        c.strokeStyle = '#2b1a0e';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(30, -12);
        c.quadraticCurveTo(8, 10, -30, 12);
        c.quadraticCurveTo(-18, 0, 20, -18);
        c.closePath();
        c.fill();
        c.stroke();
        c.beginPath();
        c.moveTo(0, -2);
        c.lineTo(0, -54);
        c.stroke();
        c.fillStyle = '#efe6cf';
        c.beginPath();
        c.moveTo(1, -52);
        c.quadraticCurveTo(26 + sway, -34, 2, -10);
        c.closePath();
        c.fill();
        c.stroke();
        c.fillStyle = '#b8321e';
        c.beginPath();
        c.moveTo(1, -40);
        c.quadraticCurveTo(15 + sway, -33, 1.5, -26);
        c.closePath();
        c.fill();
        c.restore();
      },
    });
  };

  /** Croci di legno accanto alla chiesa. */
  const crossFigures = (m: CityModel, out: Figure[]) => {
    const t = placeOf(m, 'chiesa');
    for (let k = 0; k < 6; k++) {
      const gx = t[0] + 0.3 + (k % 3) * 0.55, gy = t[1] + 2.3 + Math.floor(k / 3) * 0.5, p = toWorld(gx, gy);
      if (clock - sceneAt < 1 + k * 0.7) continue;
      out.push({
        x: p.x - 5, y: p.y - 15, w: 10, h: 17, depth: gx + gy,
        paint(c) {
          c.fillStyle = 'rgba(20, 30, 10, .3)';
          c.fillRect(p.x - 4, p.y, 9, 2);
          c.fillStyle = '#3a2414';
          c.fillRect(p.x - 1, p.y - 13, 2.4, 14);
          c.fillRect(p.x - 4, p.y - 9.5, 8.4, 2.2);
        },
      });
    }
  };

  // ------------------------------------------------------------ ciclo

  const frame = (now: number) => {
    raf = 0;
    if (!ctx || !model || !canvas.isConnected || document.hidden) {
      last = 0;
      return;
    }
    const px = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw < 2 || ch < 2) {
      last = 0;
      return;
    }
    if (canvas.width !== Math.round(cw * px) || canvas.height !== Math.round(ch * px)) {
      canvas.width = Math.round(cw * px);
      canvas.height = Math.round(ch * px);
    }
    if (staticDirty) {
      layer ??= makeLayer();
      statics = drawStatic(layer, model, assets);
      staticDirty = false;
    }
    const still = reduced();
    const dt = still || !last ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += dt;
    // l'inquadratura segue la città che cresce, senza scatti
    const target = frameFor(frameExtent(model), cw, ch, view ?? home, zoom);
    if (!cam || still) cam = target;
    else {
      const step = (a: number, b: number, eps: number) => (Math.abs(b - a) < eps ? b : a + (b - a) * 0.08);
      const next = { x: step(cam.x, target.x, 0.3), y: step(cam.y, target.y, 0.3), z: step(cam.z, target.z, 0.001) };
      cam = next;
    }
    if (still) {
      drawFrame(ctx, layer!, cam, canvas.width, canvas.height, px);
      return;
    }
    const figures: Figure[] = [];
    for (const w of folk) advance(w, dt);
    for (const w of cast) {
      advance(w, dt);
      if (w.moving && w.id.startsWith('scena') && scene?.gruppi[Number(w.id.split('-')[1])]?.scia && Math.floor(clock * 6) !== Math.floor((clock - dt) * 6)) {
        const pose = poseOf(w), p = toWorld(pose.gx, pose.gy);
        effects.spawn('moneta', p.x, p.y - 12, 4);
      }
    }
    cast = cast.filter(w => !w.done);
    for (const w of [...folk, ...cast]) {
      const f = walkerFigure(w, dt);
      if (f) figures.push(f);
    }
    waterFigures(model, figures);
    if (scene?.barca) boatFigure(figures);
    if (scene?.croci) crossFigures(model, figures);
    effects.update(dt);
    const tint = scene?.tinta, fade = Math.min(1, (clock - sceneAt) / 1.2);
    drawFrame(ctx, layer!, cam, canvas.width, canvas.height, px, statics, figures, c => {
      if (tint) {
        c.fillStyle = tint === 'notte' ? `rgba(8, 12, 48, ${0.52 * fade})` : `rgba(46, 58, 26, ${0.36 * fade})`;
        c.fillRect(cam!.x - 4000, cam!.y - 4000, 8000, 8000);
      }
      effects.draw(c);
    });
    invalidate();
  };
  const invalidate = () => {
    if (!raf && ctx && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
  };

  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(invalidate).observe(canvas);
  document.addEventListener('visibilitychange', invalidate);

  // ---- zoom con la rotellina (attorno al puntatore), trascinamento per spostarsi, doppio clic per tornare all'inquadratura di partenza
  const frameNow = () => (model ? frameFor(frameExtent(model), canvas.clientWidth, canvas.clientHeight, view ?? home, zoom) : null);
  canvas.addEventListener('wheel', e => {
    const f = frameNow();
    if (!f || !model) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
    const wx = f.x + mx / f.z, wy = f.y + my / f.z;
    const base = frameFor(frameExtent(model), r.width, r.height, home, 1).z;
    zoom = Math.max(0.5, Math.min(ZOOM_MAX / base, zoom * Math.exp(-e.deltaY * 0.0015)));
    const z = frameFor(frameExtent(model), r.width, r.height, home, zoom).z;
    // il punto sotto il puntatore resta dov'è
    view = { x: wx - mx / z, y: wy - my / z };
    cam = frameNow();
    saveZoom(zoom);
    invalidate();
  }, { passive: false });
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    const f = drag && frameNow();
    if (!drag || !f) return;
    view = { x: f.x - (e.clientX - drag.x) / f.z, y: f.y - (e.clientY - drag.y) / f.z };
    drag = { x: e.clientX, y: e.clientY };
    cam = frameNow();
    invalidate();
  });
  const drop = () => (drag = null);
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);
  canvas.addEventListener('dblclick', () => {
    zoom = 1;
    view = null;
    saveZoom(zoom);
    invalidate();
  });

  return {
    show(slot, next, nextScene) {
      if (canvas.parentElement !== slot) slot.appendChild(canvas);
      if (ctx) assets.load(() => {
        staticDirty = true;
        invalidate();
      }, PEOPLE_SPRITES);
      const other = !model || model.seed !== next.seed;
      const changed = !model || model.key !== next.key, staged = (scene?.key ?? '') !== (nextScene?.key ?? '');
      if (changed) {
        lastAdded = added(model, next);
        lastFields = addedFields(model, next);
        // un altro feudo: l'inquadratura riparte da capo, e con lei omini ed effetti
        if (other) {
          cam = null;
          view = null;
          folk = [];
          cast = [];
          effects.reset();
        }
        model = next;
        staticDirty = true;
      }
      scene = nextScene ?? null;
      if (ctx && (changed || staged)) {
        populate();
        if (staged || other) stage();
        if (changed && !other && scene?.cantiere) build(lastAdded, lastFields);
      }
      invalidate();
    },
  };
}
