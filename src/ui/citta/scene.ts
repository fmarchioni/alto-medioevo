/**
 * Vista moderna: dalla fase di gioco alla scena sulla mappa (puro, senza DOM).
 *
 * La scena dice chi entra in città e da dove, che cosa brucia, dove salgono
 * le monete, se è notte o se il fiume è uscito. Non cambia nulla nello stato:
 * legge soltanto. `index.ts` la traduce in omini (walkers.ts) ed effetti
 * (effects.ts) quando la sua chiave cambia.
 */
import type { FactionId } from '../../domain/fazioni';
import type { EventOutcome, GameState } from '../../domain/types';
import { ID as SPADE, type SpadeState } from '../../expansions/spade-castelli/rules';
import { ID as VIE, type MercantiState } from '../../expansions/vie-mercanti/rules';
import { BANK_X, C, RING_1, ROAD_X, ROAD_Y, type CityModel } from './layout';
import { edgeOf, tilesOf, type Mode, type Pt, type Vita } from './walkers';

/** Luoghi della città a cui un copione può riferirsi; `placeOf` li traduce in tessere sulla pianta del momento. */
export type Luogo = 'nord' | 'ovest' | 'sud' | 'riva' | 'bosco' | 'palazzo' | 'piazza' | 'soglia-nord' | 'soglia-ovest' | 'soglia-sud' | 'soglia-est'
  | 'granaio' | 'mercato' | 'chiesa' | 'mulino' | 'case' | 'campi';

export interface Gruppo {
  sprite: string;
  n: number;
  da: Luogo;
  a: Luogo;
  /** tessere al secondo */
  speed: number;
  mode: Mode;
  torce?: boolean;
  /** lascia cadere monete mentre corre (il ciambellano) */
  scia?: boolean;
  /** secondi prima di muoversi */
  attesa?: number;
}

export interface Scena {
  /** cambia quando la scena va rifatta */
  key: string;
  vita: Vita;
  gruppi: Gruppo[];
  /** incendi: luogo e quanti focolai */
  fuochi: { dove: Luogo; n: number }[];
  /** monete che salgono; `verso`: spinte in quella direzione (il riscatto va ai nemici) */
  monete?: { dove: Luogo; verso?: Luogo };
  polvere?: Luogo;
  tinta?: 'peste' | 'notte';
  alluvione?: boolean;
  /** vele sul fiume */
  barca?: boolean;
  /** croci al camposanto */
  croci?: boolean;
  festa?: boolean;
  /** dispendimenti: ciò che si costruisce compare fra la polvere di cantiere */
  cantiere?: boolean;
}

type Copione = Partial<Omit<Scena, 'key' | 'vita'>> & { folla?: number; nemici?: boolean };

const g = (sprite: string, n: number, da: Luogo, a: Luogo, speed = 2, mode: Mode = 'arriva', extra: Partial<Gruppo> = {}): Gruppo => ({ sprite, n, da, a, speed, mode, ...extra });

/** Da dove arriva ogni fazione, e con che figura. */
const FAZIONI: Record<FactionId, { sprite: string; da: Luogo; a: Luogo; speed: number; extra?: Copione }> = {
  franchi: { sprite: 'franco', da: 'nord', a: 'soglia-nord', speed: 2 },
  ungari: { sprite: 'ungaro', da: 'ovest', a: 'soglia-ovest', speed: 3.6, extra: { fuochi: [{ dove: 'campi', n: 4 }] } },
  longobardi: { sprite: 'longobardo', da: 'nord', a: 'soglia-nord', speed: 2 },
  bizantini: { sprite: 'bizantino', da: 'sud', a: 'soglia-sud', speed: 1.8 },
  saraceni: { sprite: 'saraceno', da: 'riva', a: 'soglia-est', speed: 2, extra: { barca: true } },
};
const FAZIONE_DI: Record<number, FactionId> = { 10: 'franchi', 11: 'ungari', 12: 'longobardi', 13: 'bizantini', 14: 'saraceni' };

const fazione = (f: FactionId, n = 5): Copione => {
  const k = FAZIONI[f];
  return { nemici: true, gruppi: [g(k.sprite, n, k.da, k.a, k.speed)], ...k.extra };
};

/** Imprevisti (src/domain/events.ts) e carte delle espansioni. */
const EVENTI: Record<number, Copione> = {
  1: { nemici: true, gruppi: [g('longobardo', 4, 'nord', 'soglia-nord')] },
  2: { gruppi: [g('saraceno', 3, 'nord', 'palazzo', 1.8), g('mercante-asino', 1, 'nord', 'palazzo', 1.8, 'arriva', { attesa: 2.5 })], monete: { dove: 'palazzo' } },
  3: { tinta: 'peste', folla: 0.2, croci: true, gruppi: [g('carro-buoi', 1, 'piazza', 'sud', 0.8, 'va'), g('monaco', 2, 'chiesa', 'sud', 0.8, 'va', { attesa: 2 })] },
  4: { gruppi: [g('cavaliere', 1, 'nord', 'palazzo', 1.9), g('soldato', 5, 'nord', 'palazzo', 1.9, 'arriva', { attesa: 1 }), g('carro-buoi', 1, 'nord', 'palazzo', 1.9, 'arriva', { attesa: 5 })], monete: { dove: 'palazzo' } },
  5: { alluvione: true, folla: 0.6 },
  6: { polvere: 'piazza', monete: { dove: 'piazza' }, gruppi: [g('contadino', 3, 'case', 'piazza', 1.6)] },
  7: { nemici: true, gruppi: [g('brigante', 5, 'bosco', 'soglia-nord', 2.3, 'arriva', { torce: true })] },
  8: { tinta: 'notte', folla: 0.3, gruppi: [g('signore', 1, 'palazzo', 'nord', 3.2, 'va', { scia: true, attesa: 1 })] },
  9: { folla: 0.5, gruppi: [g('contadino', 4, 'case', 'granaio', 2.2, 'arriva', { torce: true }), g('contadina', 3, 'case', 'granaio', 2.2, 'arriva', { torce: true, attesa: 1 })], fuochi: [{ dove: 'granaio', n: 3 }] },
  // i mercanti vessati lasciano la città: carri e asini carichi escono dal mercato verso sud
  17: { folla: 0.2, gruppi: [g('carovana', 1, 'mercato', 'sud', 1.1, 'va'), g('mercante-asino', 2, 'mercato', 'sud', 1.2, 'va', { attesa: 1 }), g('carovana', 1, 'mercato', 'sud', 1.1, 'va', { attesa: 3 })] },
  15: { gruppi: [g('monaco', 3, 'chiesa', 'palazzo', 1.2)] },
  16: { tinta: 'notte', folla: 0.3, gruppi: [g('mercante-asino', 2, 'nord', 'mercato', 1.6)] },
  101: { gruppi: [g('cavaliere-pesante', 1, 'nord', 'soglia-nord', 2), g('soldato', 4, 'nord', 'soglia-nord', 2, 'arriva', { attesa: 1 })] },
  102: { tinta: 'notte', folla: 0.3, gruppi: [g('brigante', 1, 'bosco', 'palazzo', 1.6)] },
  103: { gruppi: [g('monaco', 4, 'nord', 'piazza', 1.3)] },
};
for (const [id, f] of Object.entries(FAZIONE_DI)) EVENTI[Number(id)] = fazione(f);

/** Fatti del reame (src/domain/fatti.ts) che hanno qualcosa da far vedere. */
const FATTI: Record<string, Copione> = {
  ciambellano: EVENTI[8],
  immigrati: { gruppi: [g('contadino', 3, 'nord', 'piazza', 1.5), g('contadina', 3, 'nord', 'piazza', 1.5, 'arriva', { attesa: 1.5 })] },
  eredita: { gruppi: [g('mercante-asino', 1, 'nord', 'palazzo', 1.6)], monete: { dove: 'palazzo' } },
  incendio: { fuochi: [{ dove: 'case', n: 4 }] },
  reliquia: { gruppi: [g('monaco', 4, 'nord', 'chiesa', 1.1)] },
  visitaRe: { gruppi: [g('cavaliere-pesante', 1, 'nord', 'palazzo', 1.7), g('cavaliere', 3, 'nord', 'palazzo', 1.7, 'arriva', { attesa: 1 })] },
  decima: { gruppi: [g('monaco', 3, 'chiesa', 'palazzo', 1.2)] },
  mulino: { polvere: 'mulino' },
  mulinoGuasto: { polvere: 'mulino' },
  piogge: { alluvione: true },
};

/**
 * Vie dei mercanti: quante carovane partono dal feudo `i` in questo suo turno. Quelle spedite ora
 * alla fiera e quelle del fondaco partite quest'anno; una merce comprata al fondaco dopo il turno
 * del venditore (l'anno scorso, da chi gioca dopo di lui) parte all'inizio del suo turno seguente.
 */
function partenze(st: GameState, i: number): number {
  if (st.expansion !== VIE || !st.ext) return 0;
  const s = st.ext as MercantiState;
  const fondaco = (s.carovane ?? []).filter(c => c.seller === i && c.partita !== undefined
    && (c.partita === st.q ? c.buyer < i : c.partita === st.q - 1 && c.buyer > i)).length;
  const fiera = (s.impegni ?? []).filter(x => x.player === i && x.spedito?.q === st.q).length;
  return fondaco + fiera;
}

/** Come è andata con i nemici, per decidere se fuggono, bruciano o incassano. */
export function esitoOf(o: EventOutcome | undefined): 'fuga' | 'sconfitta' | 'riscatto' | 'patto' | null {
  if (!o || (!o.choice && !o.option && o.win === undefined)) return null;
  if (o.option === 'matrimonio' || o.option === 'vassallo' || o.option === 'protettorato' || o.option === 'accordi') return 'patto';
  const won = o.win ?? (o.choice === 'pugna' ? o.scudi >= 0 : undefined);
  if (won === true) return 'fuga';
  if (won === false || o.option === 'saccheggio') return 'sconfitta';
  return 'riscatto';
}

/** Dopo la scelta: i nemici fuggono, se ne vanno col riscatto o lasciando le case in fiamme, oppure restano da alleati. */
function conEsito(c: Copione, esito: NonNullable<ReturnType<typeof esitoOf>>): Copione {
  const gruppi = (c.gruppi ?? []).map(x => ({ ...x, torce: x.torce && esito === 'sconfitta' }));
  const barca = c.barca;
  switch (esito) {
    case 'fuga': return { gruppi: gruppi.map(x => ({ ...x, mode: 'parte' as Mode, speed: x.speed * 2.2, attesa: 0.3 })), barca };
    case 'sconfitta': return { gruppi: gruppi.map(x => ({ ...x, mode: 'parte' as Mode, attesa: 3 })), fuochi: [...(c.fuochi ?? []), { dove: 'case', n: 3 }], folla: 0.4, barca };
    case 'riscatto': return { gruppi: gruppi.map(x => ({ ...x, mode: 'parte' as Mode, speed: x.speed * 0.8, attesa: 3.5 })), monete: { dove: 'palazzo', verso: gruppi[0]?.a }, barca };
    case 'patto': return { gruppi: gruppi.map(x => ({ ...x, mode: 'fermo' as Mode })), barca };
  }
}

/**
 * Ciò che resta di un fatto o di un imprevisto quando la sua vignetta si chiude: i rivoltosi con le
 * torce restano dove sono arrivati e gli alleati di un patto restano in città; i visitatori (il mercante
 * dell'eredità, il re, i monaci) se ne sono andati con la vignetta. I fuochi bruciano, il fiume resta
 * fuori, la peste svuota le strade. Monete, polvere e notte erano del momento e svaniscono; la vela
 * resta solo se resta anche qualcuno.
 */
function strascico(c: Copione): Copione | null {
  const gruppi = (c.gruppi ?? []).filter(x => x.mode === 'fermo' || (x.mode === 'arriva' && x.torce)).map(x => ({ ...x, mode: 'fermo' as Mode, attesa: 0 }));
  const s: Copione = {
    ...(gruppi.length ? { gruppi } : {}), ...(c.fuochi?.length ? { fuochi: c.fuochi } : {}), ...(c.folla !== undefined ? { folla: c.folla } : {}),
    ...(c.tinta === 'peste' ? { tinta: 'peste' as const } : {}), ...(c.alluvione ? { alluvione: true } : {}), ...(c.croci ? { croci: true } : {}),
    ...(c.barca && gruppi.length ? { barca: true } : {}),
  };
  return Object.keys(s).length ? s : null;
}

/**
 * Strascichi del turno in corso, per signore: l'ultimo fatto o imprevisto con qualcosa da lasciare sulla mappa.
 * Vivono nella vista, non nello stato di gioco: ricaricando la pagina a metà turno si perdono, e va bene così.
 */
let strascichiQ = -1;
const strascichi = new Map<string, { c: Copione; tag: string }>();

/** Due strascichi insieme (il fatto d'inizio turno e l'imprevisto): si sommano. */
const somma = (a: Copione, b: Copione): Copione => ({
  ...a, ...b, gruppi: [...(a.gruppi ?? []), ...(b.gruppi ?? [])], fuochi: [...(a.fuochi ?? []), ...(b.fuochi ?? [])],
  ...(a.folla !== undefined || b.folla !== undefined ? { folla: Math.min(a.folla ?? 1, b.folla ?? 1) } : {}),
});

/**
 * La scena per il feudo `i`. `quiet`: si guarda la città senza che vi accada
 * nulla (veduta di fine anno, feudo di un altro signore).
 */
export function sceneOf(st: GameState, i: number, quiet = false): Scena {
  const p = st.players[i], ph = st.phase;
  const soldati = st.expansion === SPADE && st.ext ? (st.ext as SpadeState).soldati?.[i] ?? 0 : 0;
  const vita: Vita = { servi: p?.servi ?? 0, mercati: (p?.mercato ?? 1) - 1, soldati, piani: p?.palazzo ?? 0, folla: 1, mercato: false };
  if (strascichiQ !== st.q) {
    strascichiQ = st.q;
    strascichi.clear();
  }
  let c: Copione = {}, tag = '';
  if (!quiet && i === st.current) {
    // l'ultima vista della vignetta decide che cosa resta (dopo la scelta: l'esito, non l'arrivo)
    const ricorda = (k: 'fatto' | 'evento') => {
      const s = strascico(c);
      if (s) strascichi.set(`${i}|${k}`, { c: s, tag });
      else strascichi.delete(`${i}|${k}`);
    };
    if (ph.kind === 'evento') {
      const base = ph.faction ? fazione(ph.faction, Math.max(3, Math.min(7, Math.round(3 + (ph.nemici ?? 0) / 600)))) : EVENTI[ph.eventId] ?? {};
      const esito = base.nemici && !ph.awaitingChoice ? esitoOf(ph.outcome) : null;
      c = esito ? conEsito(base, esito) : base;
      tag = `${ph.eventId}:${ph.faction ?? ''}:${esito ?? 'arrivo'}`;
      ricorda('evento');
    } else if (ph.kind === 'fatto') {
      c = FATTI[ph.id] ?? {};
      tag = ph.id;
      ricorda('fatto');
    } else {
      // finita la vignetta, l'imprevisto (o il fatto) resta sulla mappa fino alla fine del turno
      const resti = ph.kind === 'fine' ? [] : [strascichi.get(`${i}|fatto`), strascichi.get(`${i}|evento`)].filter(x => !!x);
      if (resti.length) {
        c = resti.map(x => x.c).reduce(somma);
        tag = `strascico:${resti.map(x => x.tag).join('+')}`;
      }
      const proprio: Copione =
        ph.kind === 'rendite' ? { gruppi: [g('carro-buoi', 1, 'campi', 'granaio', 1.1, 'va'), g('contadino', 2, 'campi', 'granaio', 1.1, 'va', { attesa: 2 })] }
        : ph.kind === 'fine' && ph.winner === i ? { festa: true, gruppi: [g('dama', 1, 'piazza', 'palazzo', 1, 'arriva'), g('signore', 1, 'piazza', 'palazzo', 1, 'arriva', { attesa: 1 })] }
        : {};
      c = { ...c, ...proprio, gruppi: [...(c.gruppi ?? []), ...(proprio.gruppi ?? [])] };
      if (ph.kind === 'commercio' || ph.kind === 'signori') {
        vita.mercato = true;
        // Vie dei mercanti: le carovane partite quest'anno escono dal mercato verso sud, in primo piano
        const n = partenze(st, i);
        if (n) {
          c.gruppi = [...(c.gruppi ?? []), ...Array.from({ length: Math.min(n, 3) }, (_, k) => g('carovana', 1, 'mercato', 'sud', 1.1, 'va', { attesa: k * 2.5 }))];
          tag += `:carovane${n}`;
        }
      }
    }
  }
  vita.folla = c.folla ?? 1;
  return {
    key: `${st.q}|${i}|${quiet ? 'quiete' : ph.kind}|${tag}`,
    vita, gruppi: c.gruppi ?? [], fuochi: c.fuochi ?? [],
    ...(c.monete ? { monete: c.monete } : {}), ...(c.polvere ? { polvere: c.polvere } : {}), ...(c.tinta ? { tinta: c.tinta } : {}),
    ...(c.alluvione ? { alluvione: true } : {}), ...(c.barca ? { barca: true } : {}), ...(c.croci ? { croci: true } : {}), ...(c.festa ? { festa: true } : {}),
    ...(!quiet && i === st.current && ph.kind === 'investimenti' ? { cantiere: true } : {}),
  };
}

/** Un luogo del copione sulla pianta di questa città; `k` distingue i posti di uno stesso luogo (più case, più campi). */
export function placeOf(m: CityModel, l: Luogo, k = 0): Pt {
  const D = edgeOf(m), first = (kind: string) => m.objects.find(o => o.kind === kind);
  const at = (kind: string, fallback: Pt): Pt => {
    const o = first(kind);
    return o ? [o.gx, o.gy] : fallback;
  };
  switch (l) {
    case 'nord': return [ROAD_X, C - D];
    case 'ovest': return [C - D, ROAD_Y];
    case 'sud': return [ROAD_X, C + D];
    case 'riva': return [BANK_X - 1, ROAD_Y];
    case 'bosco': return [ROAD_X + 3, C - D + 2];
    case 'palazzo': return [C, C + 2];
    case 'piazza': return [C + 2, C - 1 + (k % 3)];
    case 'soglia-nord': return [ROAD_X, C - RING_1 - 2];
    case 'soglia-ovest': return [C - RING_1 - 2, ROAD_Y];
    case 'soglia-sud': return [ROAD_X, C + RING_1 + 2];
    case 'soglia-est': return [C + RING_1 + 2, ROAD_Y];
    case 'granaio': return at('granaio', [C, C + 2]);
    case 'mercato': return at('mercato', at('fondaco', [C + 2, C + 2]));
    case 'chiesa': return at('chiesa', [C - 2, C]);
    case 'mulino': return at('mulino', [BANK_X - 1, C - 1]);
    case 'case': {
      const h = m.objects.filter(o => o.kind === 'casa');
      const o = h[(k * 7 + 3) % Math.max(1, h.length)];
      return o ? [o.gx, o.gy] : [C + 2, C + 3];
    }
    case 'campi': {
      const f = tilesOf(m, s => s.startsWith('grano') || s === 'arato');
      return f.length ? f[(k * 5 + 1) % f.length] : [C - 6, C - 6];
    }
  }
}
