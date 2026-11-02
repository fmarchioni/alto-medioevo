/**
 * Generatori casuali iniettabili.
 *
 * La logica di gioco riceve sempre un `Rng` e non chiama mai Math.random().
 * `C64Rnd` replica bit per bit la funzione RND(1) del BASIC V2 del C64
 * (ROM $E097): seme moltiplicato per 11879546, sommato a 3.927677739E-8,
 * byte della mantissa invertiti e rinormalizzati. Con lo stesso seme produce
 * la stessa sequenza dell'originale, quindi le partite sono confrontabili
 * con l'emulatore.
 */
export interface Rng {
  /** Equivalente di RND(1): numero in [0,1). */
  next(): number;
  /** Stato serializzabile per salvataggi e test. */
  getState(): number[];
}

/** Seme presente in memoria all'avvio del programma originale ($8B-$8F). */
export const ORIGINAL_SEED: readonly number[] = [0x80, 0x4f, 0x30, 0x52, 0x97];

// Costanti in formato MBF a 5 byte (esponente, mantissa con bit alto implicito)
const RMULC = { exp: 0x98, man: 0xb5447a00 }; // 11879546
const RADDC = { exp: 0x68, man: 0xa8b14600 }; // 3.927677739E-8

export class C64Rnd implements Rng {
  private seed: number[];

  constructor(seed: readonly number[] = ORIGINAL_SEED) {
    if (seed.length !== 5) throw new Error('il seme C64 ha 5 byte');
    this.seed = [...seed];
  }

  getState(): number[] {
    return [...this.seed];
  }

  next(): number {
    let exp = this.seed[0];
    if (exp === 0) {
      // seme nullo: la ROM produrrebbe sempre 0
      return 0;
    }
    const seedMan = ((((this.seed[1] | 0x80) << 24) | (this.seed[2] << 16) | (this.seed[3] << 8) | this.seed[4]) >>> 0);

    // --- FMULT: FAC (seme) * RMULC, moltiplicazione shift-and-add byte per byte
    let res = 0; // 32 bit risultato
    let ov = 0; // byte di arrotondamento FACOV ($70)
    const multiplierBytes = [0 /* FACOV azzerato da MOVFM */, seedMan & 0xff, (seedMan >>> 8) & 0xff, (seedMan >>> 16) & 0xff, seedMan >>> 24];
    for (const m of multiplierBytes) {
      if (m === 0) {
        ov = res & 0xff;
        res = res >>> 8;
        continue;
      }
      for (let bit = 0; bit < 8; bit++) {
        let carry = 0;
        if ((m >> bit) & 1) {
          const sum = res + RMULC.man;
          carry = sum > 0xffffffff ? 1 : 0;
          res = sum >>> 0;
        }
        const low = res & 1;
        res = ((carry << 31) | (res >>> 1)) >>> 0;
        ov = ((low << 7) | (ov >> 1)) & 0xff;
      }
    }
    exp = exp + RMULC.exp - 0x80;
    [res, ov, exp] = normalize(res, ov, exp);

    // --- FADD RADDC: l'addendo viene allineato all'esponente del FAC
    const diff = exp - RADDC.exp;
    if (diff < 40) {
      // caso raro (seme < 2^-8): somma a 40 bit
      const fac40 = BigInt(res) << 8n;
      const arg40 = (BigInt(RADDC.man) << 8n) >> BigInt(diff);
      let sum = fac40 + arg40;
      if (sum >= 1n << 40n) {
        sum >>= 1n;
        exp += 1;
      }
      res = Number(sum >> 8n) >>> 0;
    }

    // --- scambio dei byte della mantissa, esponente come byte di arrotondamento
    const b0 = res >>> 24, b1 = (res >>> 16) & 0xff, b2 = (res >>> 8) & 0xff, b3 = res & 0xff;
    res = (((b3 << 24) | (b2 << 16) | (b1 << 8) | b0) >>> 0);
    ov = exp & 0xff;
    exp = 0x80;
    [res, ov, exp] = normalize(res, ov, exp);

    // --- ROUND + MOVMF
    if (exp !== 0 && ov & 0x80) {
      res = (res + 1) >>> 0;
      if (res === 0) {
        res = 0x80000000;
        exp += 1;
      }
    }
    this.seed = exp === 0 ? [0, 0, 0, 0, 0] : [exp, (res >>> 24) & 0x7f, (res >>> 16) & 0xff, (res >>> 8) & 0xff, res & 0xff];
    return exp === 0 ? 0 : (res / 2 ** 32) * 2 ** (exp - 0x80);
  }
}

/** Normalizzazione del FAC: sposta a sinistra mantissa+FACOV finché il bit alto è 1. */
function normalize(man: number, ov: number, exp: number): [number, number, number] {
  let shifts = 0;
  while ((man & 0x80000000) === 0) {
    if (shifts >= 40 || (man === 0 && ov === 0)) return [0, 0, 0];
    if (man >>> 24 === 0) {
      man = ((man << 8) | ov) >>> 0;
      ov = 0;
      exp -= 8;
      shifts += 8;
    } else {
      man = ((man << 1) | (ov >> 7)) >>> 0;
      ov = (ov << 1) & 0xff;
      exp -= 1;
      shifts += 1;
    }
  }
  if (exp <= 0) return [0, 0, 0];
  return [man, ov, exp];
}

/** Generatore moderno seedable (mulberry32) per partite non vincolate alla fedeltà. */
export class Mulberry32 implements Rng {
  constructor(private state: number) {}
  getState(): number[] {
    return [this.state];
  }
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
