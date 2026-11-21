/**
 * Espansione composta della Dinastia a vocazioni (docs/vocazioni.md, fase 3): carica Le vie dei mercanti e Spade e Castelli
 * insieme. Ogni signore è mercante o guerriero (src/domain/vocazioni.ts): lo stato delle due espansioni esiste per tutti, la
 * vocazione decide che cosa si può fare (i divieti stanno nelle azioni delle due espansioni, con `vietato`).
 *
 * Le due espansioni leggono il loro stato da `state.ext` come se fossero sole, e alcune chiavi (`mail`, `inbox`, `rng`) le
 * hanno tutte e due: lo stato composto le tiene separate (VocazioniExt) e `con` presta a ciascuna il suo, con il suo
 * identificativo in `state.expansion`, per la durata della chiamata. Le chiamate annidate (un'espansione che chiama il motore,
 * che richiama la composta) passano da un'espansione all'altra senza perdere nulla.
 */
import type { BotCtx, ExpansionRules } from '../../domain/expansion';
import type { BeneCasata, BeniCasata } from '../../domain/prestiti';
import type { Game } from '../../domain/turn';
import type { ActionResult, GameState } from '../../domain/types';
import type { VoceMigrazione } from '../../domain/migrazioni';
import { SPADE_ID, VIE_ID, VOCAZIONI_ID, vocazioneDelFeudo, type VocazioniExt, type Vocazione } from '../../domain/vocazioni';
import { casaMadre } from '../../domain/dinastia';
import { rules as vie } from '../vie-mercanti/rules';
import { rules as spade } from '../spade-castelli/rules';

export type Sub = typeof VIE_ID | typeof SPADE_ID;
export const SUBS: readonly Sub[] = [VIE_ID, SPADE_ID];
const REGOLE: Record<Sub, ExpansionRules> = { [VIE_ID]: vie, [SPADE_ID]: spade };
/** l'espansione della vocazione: il suo mazzo, le sue imprese */
export const SUB_DI: Record<Vocazione, Sub> = { mercante: VIE_ID, guerriero: SPADE_ID };

/** La chiamata in corso: lo stato composto e l'espansione che sta lavorando (null: nessuna). */
let fuori: VocazioniExt | null = null;
let dentro: Sub | null = null;

/** Esegue `f` con lo stato dell'espansione `sub` al posto di quello composto, poi rimette tutto com'era. */
export function con<T>(st: GameState, sub: Sub, f: () => T): T {
  const voc = fuori ?? (st.ext as VocazioniExt);
  const prima = dentro;
  if (prima) voc[prima] = st.ext;
  fuori = voc;
  dentro = sub;
  st.ext = voc[sub];
  st.expansion = sub;
  try {
    return f();
  } finally {
    voc[sub] = st.ext;
    if (prima) {
      st.ext = voc[prima];
      st.expansion = prima;
      dentro = prima;
    } else {
      st.ext = voc;
      st.expansion = VOCAZIONI_ID;
      fuori = null;
      dentro = null;
    }
  }
}

/** La vocazione del signore di turno (chi non l'ha, per una partita nata male, è guerriero). */
export const vocazioneDi = (g: Game, i = g.state.current): Vocazione => g.state.players[i]?.vocazione ?? 'guerriero';

/** Chiama l'aggancio `k` di tutte e due le espansioni, nell'ordine. */
function tutte(g: Game, f: (r: ExpansionRules) => void): void {
  for (const s of SUBS) con(g.state, s, () => f(REGOLE[s]));
}

/** Beni prestati fra rami della casata: vino e manufatti dal mercante, soldati da Spade e Castelli. */
function beniDi(bene: BeneCasata): Sub | null {
  for (const s of SUBS) if (REGOLE[s].prestiti?.beni.includes(bene)) return s;
  return null;
}
const prestiti: BeniCasata = {
  beni: SUBS.flatMap(s => REGOLE[s].prestiti?.beni ?? []),
  ha: (g, i, bene) => {
    const s = beniDi(bene);
    return s ? con(g.state, s, () => REGOLE[s].prestiti!.ha(g, i, bene)) : 0;
  },
  limite: (g, chi, a, bene) => {
    const s = beniDi(bene);
    return s ? con(g.state, s, () => REGOLE[s].prestiti!.limite(g, chi, a, bene)) : 0;
  },
  sposta(g, da, a, bene, qty) {
    const s = beniDi(bene);
    if (s) con(g.state, s, () => REGOLE[s].prestiti!.sposta(g, da, a, bene, qty));
  },
  dispaccio(g, to, d) {
    const s = beniDi(d.bene);
    if (s) con(g.state, s, () => REGOLE[s].prestiti!.dispaccio(g, to, d));
  },
  // il computer chiede prima ciò che serve alla sua vocazione
  bisogno(g, i) {
    const prima = SUB_DI[vocazioneDi(g, i)];
    for (const s of [prima, ...SUBS.filter(x => x !== prima)]) {
      const b = con(g.state, s, () => REGOLE[s].prestiti?.bisogno?.(g, i) ?? null);
      if (b) return b;
    }
    return null;
  },
};

export const rules: ExpansionRules = {
  id: VOCAZIONI_ID,
  signori: SUBS.some(s => REGOLE[s].signori),

  init(state) {
    // chi non ha scelto (il computer, o "a sorte") prende la vocazione del suo feudo: i porti commerciano
    for (const p of state.players) p.vocazione ??= vocazioneDelFeudo(p.feudo);
    return Object.fromEntries(SUBS.map(s => [s, REGOLE[s].init(state)])) as unknown as VocazioniExt;
  },

  addPlayer(state, i) {
    // il ramo cadetto nasce con la vocazione della casa madre
    const p = state.players[i];
    if (p && !p.vocazione) {
      const madre = state.dinastia ? casaMadre(state.dinastia, i) : null;
      p.vocazione = (madre !== null ? state.players[madre]?.vocazione : undefined) ?? vocazioneDelFeudo(p.feudo);
    }
    for (const s of SUBS) con(state, s, () => REGOLE[s].addPlayer?.(state, i));
  },

  onTurnStart: g => tutte(g, r => r.onTurnStart?.(g)),

  // il mazzo è quello della vocazione: le imprese mercantili al mercante, le carte di guerra al guerriero
  deck(g) {
    const s = SUB_DI[vocazioneDi(g)];
    return con(g.state, s, () => REGOLE[s].deck?.(g) ?? []);
  },
  onCard(g, id) {
    const s = SUB_DI[vocazioneDi(g)];
    con(g.state, s, () => REGOLE[s].onCard?.(g, id));
  },

  onEvent: (g, id, o) => tutte(g, r => r.onEvent?.(g, id, o)),

  beforeInvest(g, kind): ActionResult {
    for (const s of SUBS) {
      const r = con(g.state, s, () => REGOLE[s].beforeInvest?.(g, kind));
      if (r && !r.ok) return r;
    }
    return { ok: true };
  },

  onIncome: (g, amount) => tutte(g, r => r.onIncome?.(g, amount)),
  beforeYearEnd: g => tutte(g, r => r.beforeYearEnd?.(g)),
  onYearClose: g => tutte(g, r => r.onYearClose?.(g)),
  migrazione: g => {
    const voci: VoceMigrazione[] = [];
    tutte(g, r => voci.push(...(r.migrazione?.(g) ?? [])));
    return voci;
  },
  onTrasferimento: (g, i, da) => tutte(g, r => r.onTrasferimento?.(g, i, da)),

  usuryExtra(g) {
    let x = 0;
    for (const s of SUBS) x += con(g.state, s, () => REGOLE[s].usuryExtra?.(g) ?? 0);
    return x;
  },
  usuryScale(g) {
    let x = 1;
    for (const s of SUBS) x *= con(g.state, s, () => REGOLE[s].usuryScale?.(g) ?? 1);
    return x;
  },

  // i soldati e le orde sono di Spade e Castelli: per il mercante sono la milizia
  cignoNero: spade.cignoNero,
  leva: spade.leva && {
    soldati: g => con(g.state, SPADE_ID, () => spade.leva!.soldati(g)),
    parti: (g, dalFortino, totale) => con(g.state, SPADE_ID, () => spade.leva!.parti(g, dalFortino, totale)),
  },
  factionDefense: g => con(g.state, SPADE_ID, () => spade.factionDefense?.(g) ?? { soldati: 0, mura: 1 }),
  ostili: (g, i, j) => con(g.state, SPADE_ID, () => spade.ostili?.(g, i, j) ?? false),

  prestiti,

  // computer: tutte e due le espansioni; i divieti della vocazione fermano le azioni che non può fare
  botBeforeTrade: (c: BotCtx) => tutte(c.g, r => r.botBeforeTrade?.(c)),
  botSignori: (c: BotCtx) => tutte(c.g, r => r.botSignori?.(c)),
  botBeforeFeed: (c: BotCtx, feed: number) => tutte(c.g, r => r.botBeforeFeed?.(c, feed)),
  botBeforeInvest: (c: BotCtx) => tutte(c.g, r => r.botBeforeInvest?.(c)),
};
