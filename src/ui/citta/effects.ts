/**
 * Vista moderna: gli effetti, come particelle semplici disegnate in codice
 * (fumo, polvere di cantiere, fuoco, monete, spruzzi, coriandoli).
 *
 * Coordinate di mondo (quelle di `toWorld`): le sorgenti restano accese finché
 * la scena non cambia, oppure per un tempo dato; le particelle vivono e
 * muoiono da sole. Nessuna dipendenza dal DOM: `draw` riceve il contesto.
 */

export type Kind = 'fumo' | 'polvere' | 'fuoco' | 'moneta' | 'goccia' | 'coriandolo';

export interface Emitter {
  kind: Kind;
  x: number;
  y: number;
  /** particelle al secondo */
  rate: number;
  /** secondi di vita della sorgente; assente = finché dura la scena */
  ttl?: number;
  /** larghezza della zona da cui nascono */
  spread?: number;
  /** spinta orizzontale (le monete del riscatto vanno verso i nemici) */
  vx?: number;
  /** gruppo: 'scena' si spegne al cambio di scena, 'vita' al cambio di città */
  group: 'scena' | 'vita' | 'momento';
  acc?: number;
}

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  /** variazione per particella: tinta, verso di rotazione */
  v: number;
}

const MAX = 900;

export class Effects {
  emitters: Emitter[] = [];
  particles: Particle[] = [];
  private seed = 12345;

  /** Caso veloce e ripetibile (non tocca la sequenza di gioco). */
  private rnd(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  add(e: Omit<Emitter, 'acc'>): void {
    this.emitters.push({ ...e, acc: this.rnd() });
  }

  /** Spegne le sorgenti di un gruppo (le particelle già nate finiscono la loro vita). */
  clear(group: Emitter['group']): void {
    this.emitters = this.emitters.filter(e => e.group !== group);
  }

  reset(): void {
    this.emitters = [];
    this.particles = [];
  }

  /** Una particella subito, senza sorgente (la torcia di chi cammina, la scia di monete di chi scappa). */
  spawn(kind: Kind, x: number, y: number, spread = 0, vx = 0, scale = 1): void {
    if (this.particles.length >= MAX) return;
    const r = () => this.rnd();
    const px = x + (r() - 0.5) * spread, py = y + (r() - 0.5) * spread * 0.4;
    switch (kind) {
      case 'fumo': this.particles.push({ kind, x: px, y: py, vx: 3 + r() * 5, vy: -(9 + r() * 6), age: 0, life: 2.6 + r() * 1.6, size: 2.5 + r() * 2, v: r() }); break;
      case 'polvere': this.particles.push({ kind, x: px, y: py, vx: (r() - 0.5) * 26, vy: -(6 + r() * 14), age: 0, life: 0.9 + r() * 0.8, size: 3 + r() * 4, v: r() }); break;
      case 'fuoco': this.particles.push({ kind, x: px, y: py, vx: (r() - 0.5) * 8 * scale, vy: -(16 + r() * 18) * scale, age: 0, life: (0.45 + r() * 0.4) * scale, size: (3 + r() * 3.5) * scale, v: r() }); break;
      case 'moneta': this.particles.push({ kind, x: px, y: py, vx: vx + (r() - 0.5) * 14, vy: -(34 + r() * 16), age: 0, life: 1.1 + r() * 0.5, size: 2.6, v: r() }); break;
      case 'goccia': this.particles.push({ kind, x: px, y: py, vx: (r() - 0.5) * 20, vy: -(18 + r() * 20), age: 0, life: 0.6 + r() * 0.4, size: 1.4 + r(), v: r() }); break;
      case 'coriandolo': this.particles.push({ kind, x: px, y: py, vx: (r() - 0.5) * 70, vy: -(60 + r() * 50), age: 0, life: 2 + r() * 1.2, size: 2 + r() * 1.5, v: r() }); break;
    }
  }

  update(dt: number): void {
    for (const e of this.emitters) {
      if (e.ttl !== undefined) e.ttl -= dt;
      e.acc = (e.acc ?? 0) + e.rate * dt;
      while (e.acc >= 1) {
        e.acc -= 1;
        this.spawn(e.kind, e.x, e.y, e.spread ?? 0, e.vx ?? 0);
      }
    }
    this.emitters = this.emitters.filter(e => e.ttl === undefined || e.ttl > 0);
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'moneta' || p.kind === 'goccia' || p.kind === 'coriandolo') p.vy += (p.kind === 'coriandolo' ? 70 : 90) * dt;
      if (p.kind === 'coriandolo') p.vx *= 1 - dt * 1.2;
      if (p.kind === 'fumo') p.vx += dt * 2;
    }
    this.particles = this.particles.filter(p => p.age < p.life);
  }

  get busy(): boolean {
    return this.emitters.length > 0 || this.particles.length > 0;
  }

  /** Disegna le particelle; il contesto è già nelle coordinate di mondo. */
  draw(ctx: CanvasRenderingContext2D): void {
    const CONF = ['#c8362b', '#e3bb4f', '#3f7d93', '#f3e3bd', '#6f8f4e'];
    for (const p of this.particles) {
      const t = p.age / p.life;
      switch (p.kind) {
        case 'fumo': {
          const g = Math.round(150 + p.v * 60);
          ctx.fillStyle = `rgba(${g}, ${g}, ${g - 6}, ${0.38 * (1 - t) * Math.min(1, t * 6)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 + t * 2.2), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'polvere':
          ctx.fillStyle = `rgba(${200 + Math.round(p.v * 30)}, ${176 + Math.round(p.v * 20)}, 128, ${0.55 * (1 - t)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 + t * 1.5), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'moneta': {
          // la moneta gira: larghezza che pulsa
          const w = p.size * Math.abs(Math.cos(p.age * 9 + p.v * 6));
          ctx.globalAlpha = Math.min(1, (1 - t) * 3);
          ctx.fillStyle = '#8a6418';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + 0.6, w + 0.6, p.size + 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#f5d04e';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, Math.max(0.5, w), p.size, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case 'goccia':
          ctx.fillStyle = `rgba(190, 228, 240, ${0.8 * (1 - t)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'coriandolo':
          ctx.globalAlpha = Math.min(1, (1 - t) * 2.5);
          ctx.fillStyle = CONF[Math.floor(p.v * CONF.length)];
          ctx.fillRect(p.x, p.y, p.size * Math.abs(Math.cos(p.age * 7 + p.v * 5)) + 0.6, p.size);
          ctx.globalAlpha = 1;
          break;
        default:
          break;
      }
    }
    // il fuoco per ultimo e in luce additiva: resta vivo anche sotto la tinta della notte
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (p.kind !== 'fuoco') continue;
      const t = p.age / p.life, r = p.size * (1 - t * 0.7);
      ctx.fillStyle = `rgba(255, ${Math.round(190 - t * 150)}, ${Math.round(60 - t * 60)}, ${0.75 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = prev;
  }
}
