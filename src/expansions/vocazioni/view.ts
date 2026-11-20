/**
 * Vista della Dinastia a vocazioni: le viste delle due espansioni insieme. Pannelli e azioni portano il prefisso
 * dell'espansione (`vie-mercanti:fondaco`, `spade-castelli:war`): qui si toglie, si chiama la vista giusta con il suo stato
 * (`con`), e nell'HTML che torna si rimette, così i pulsanti delle due espansioni non si confondono.
 * La vocazione toglie le carte che non può usare: la fiera al guerriero, la guerra al mercante (che ha la milizia).
 */
import type { Game } from '../../domain/turn';
import type { GameState } from '../../domain/types';
import { SPADE_ID, VIE_ID } from '../../domain/vocazioni';
import type { ExpansionView, ExtCard, ExtUi } from '../types';
import { view as vie } from '../vie-mercanti/view';
import { view as spade } from '../spade-castelli/view';
import { con, SUB_DI, SUBS, vocazioneDi, type Sub } from './rules';

const VISTE: Record<Sub, ExpansionView> = { [VIE_ID]: vie, [SPADE_ID]: spade };
const SEP = ':';

/** I pulsanti dell'espansione `sub` nell'HTML: pannelli e azioni con il prefisso. */
export const prefissa = (html: string, sub: Sub) => html.replace(/data-(op|panel)="/g, (_, k: string) => `data-${k}="${sub}${SEP}`);

/** `vie-mercanti:fondaco` → ['vie-mercanti', 'fondaco']; senza prefisso: la vista della vocazione. */
function separa(g: Game, s: string): [Sub, string] {
  const k = s.indexOf(SEP);
  const sub = k > 0 ? (s.slice(0, k) as Sub) : null;
  return sub && SUBS.includes(sub) ? [sub, s.slice(k + 1)] : [SUB_DI[vocazioneDi(g)], s];
}

/** La vista `sub` con il suo stato. */
const in_ = <T>(g: Game, sub: Sub, f: (v: ExpansionView) => T): T => con(g.state, sub, () => f(VISTE[sub]));
const inSt = <T>(st: GameState, sub: Sub, f: (v: ExpansionView) => T): T => con(st, sub, () => f(VISTE[sub]));

/** Carte che la vocazione non può usare. */
function ammessa(g: Game, sub: Sub, c: ExtCard): boolean {
  const v = vocazioneDi(g);
  if (v === 'guerriero' && sub === VIE_ID && c.panel === 'fiera') return false;
  if (v === 'mercante' && sub === SPADE_ID && c.panel === 'guerra') return false;
  return true;
}

/** Concatena l'HTML delle due viste (con i prefissi). */
const insieme = (g: Game, f: (v: ExpansionView) => string | undefined) => SUBS.map(s => prefissa(in_(g, s, f) ?? '', s)).join('');
/** Il primo valore non nullo, partendo dalla vista della vocazione. */
function primo<T>(g: Game, f: (v: ExpansionView) => T | null | undefined): [Sub, T] | null {
  const prima = SUB_DI[vocazioneDi(g)];
  for (const s of [prima, ...SUBS.filter(x => x !== prima)]) {
    const x = in_(g, s, f);
    if (x !== null && x !== undefined) return [s, x];
  }
  return null;
}

export const view: ExpansionView = {
  title: 'Le vocazioni',
  motto: 'Mercanti e guerrieri nello stesso regno: ogni casata sceglie la sua strada.',
  miniature: vie.miniature,
  summary: [
    'Ogni signore è mercante o guerriero. Tutti hanno vigneti, opifici, cantina, mercanti di passaggio, fondaco, mura e torri.',
    'Il mercante va alla fiera dei forestieri e tenta le imprese mercantili; i suoi soldati sono una milizia che difende la città ma non lascia il feudo, e non costruisce catapulte.',
    "Il guerriero arruola un esercito, marcia, assedia e saccheggia, e gioca le carte di guerra; commercia in piccolo, ma non va alla fiera.",
  ],

  cards(g) {
    const v = vocazioneDi(g);
    return SUBS.flatMap(s =>
      in_(g, s, x => x.cards(g))
        .filter(c => ammessa(g, s, c))
        .map(c => ({ ...c, panel: `${s}${SEP}${c.panel}`, ...(v === 'mercante' && s === SPADE_ID && c.panel === 'esercito' ? { title: 'Milizia' } : {}) })),
    );
  },
  // la fiera (pagina propria dopo Fra signori) è dei mercanti
  afterSignori(g) {
    if (vocazioneDi(g) !== 'mercante') return null;
    const p = in_(g, VIE_ID, x => x.afterSignori?.(g) ?? null);
    return p ? `${VIE_ID}${SEP}${p}` : null;
  },
  musicaDispacci: g => primo(g, x => x.musicaDispacci?.(g))?.[1] ?? null,
  effettoDispacci: g => primo(g, x => x.effettoDispacci?.(g))?.[1] ?? null,
  dispatches: (g, animate) => insieme(g, x => x.dispatches(g, animate)),
  eventPanel(g) {
    const r = primo(g, x => x.eventPanel?.(g));
    return r ? prefissa(r[1], r[0]) : null;
  },
  reminder(g) {
    const r = primo(g, x => x.reminder?.(g));
    return r ? { title: r[1].title, body: prefissa(r[1].body, r[0]) } : null;
  },
  cardNote(g, id) {
    const s = SUB_DI[vocazioneDi(g)];
    return in_(g, s, x => x.cardNote?.(g, id) ?? '');
  },
  arrestText(g) {
    const r = primo(g, x => x.arrestText?.(g) || null);
    return r ? prefissa(r[1], r[0]) : '';
  },
  // le imprese della colonna a sinistra: quelle mercantili del mercante, le carte di guerra del guerriero
  imprese(g) {
    const s = SUB_DI[vocazioneDi(g)];
    return prefissa(in_(g, s, x => x.imprese?.(g) ?? ''), s);
  },
  aside: g => insieme(g, x => x.aside?.(g)),
  resourceBar: g => SUBS.flatMap(s => in_(g, s, x => x.resourceBar?.(g) ?? [])),
  alert: (g, where) => insieme(g, x => x.alert?.(g, where)),
  yearEndScenes: (st, year) => SUBS.flatMap(s => inSt(st, s, x => x.yearEndScenes?.(st, year) ?? [])),
  mapMarkers: st => SUBS.map(s => inSt(st, s, x => x.mapMarkers?.(st) ?? '')).join(''),
  mapRoutes: st => SUBS.map(s => inSt(st, s, x => x.mapRoutes?.(st) ?? '')).join(''),
  tradeHint: (g, mode) => SUBS.map(s => in_(g, s, x => x.tradeHint?.(g, mode) ?? '')).join(''),
  rateBadges(g, r) {
    const out = {};
    for (const s of SUBS) Object.assign(out, in_(g, s, x => x.rateBadges?.(g, r) ?? {}));
    return Object.keys(out).length ? out : null;
  },

  open(g, panel) {
    const [s, p] = separa(g, panel);
    return in_(g, s, x => x.open(g, p));
  },
  panel(g, ui: ExtUi) {
    const [s, p] = separa(g, ui.panel ?? '');
    return prefissa(in_(g, s, x => x.panel(g, { ...ui, panel: p })), s);
  },
  act(g, op, data, field) {
    const [s, o] = separa(g, op);
    const r = in_(g, s, x => x.act(g, o, data, field));
    return {
      ...r,
      ...(r.panel ? { panel: `${s}${SEP}${r.panel}` } : {}),
      ...(r.notice ? { notice: { title: r.notice.title, body: prefissa(r.notice.body, s) } } : {}),
    };
  },
  decision(g) {
    const r = primo(g, x => x.decision?.(g));
    if (!r) return null;
    const [s, d] = r;
    return { ...d, body: prefissa(d.body, s), options: d.options.map(o => ({ ...o, op: `${s}${SEP}${o.op}` })) };
  },
  cost(g, op, data, field) {
    const [s, o] = separa(g, op);
    return in_(g, s, x => x.cost?.(g, o, data, field) ?? 0);
  },

  // cronaca e giornale: ogni fatto lo racconta l'espansione che lo conosce
  chronicle(f, players) {
    for (const s of SUBS) {
      const t = VISTE[s].chronicle(f, players);
      if (t) return t;
    }
    return null;
  },
  news: (st, year) => SUBS.flatMap(s => inSt(st, s, x => x.news?.(st, year) ?? [])),
  salient(f, who, players) {
    for (const s of SUBS) {
      const x = VISTE[s].salient?.(f, who, players);
      if (x) return x;
    }
    return null;
  },
};
