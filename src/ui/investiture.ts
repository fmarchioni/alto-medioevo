/**
 * Scene di rango e di casata (dipinti di public/sprites/fatti): l'investitura quando si sale di
 * titolo, la perdita del titolo, la corona d'Italia, e i fatti della famiglia (Dinastia).
 * Servono all'avviso d'inizio turno (solo al signore interessato) e alla miniatura del giornale.
 */
import { titleName } from '../domain/rank';
import type { ChronicleFact, Player } from '../domain/types';
import { illustrationUrl } from './citta/assets';
import type { Notice } from './notice';

/** Grado del titolo: 1 messere/madonna ... 5 principe/principessa (i titoli femminili partono da 6). */
export const rankOf = (title: number) => (title > 5 ? title - 5 : title);

const RANGO_ART: Record<number, string> = { 2: 'titolo-conte', 3: 'titolo-duca', 4: 'titolo-granduca', 5: 'titolo-principe' };

export interface Scena {
  art: string;
  caption: string;
}

/** Il cambio di titolo di fine anno: investitura (si sale) o titolo perduto (si scende). */
export function titoloScena(before: number, after: number): Scena | null {
  if (before === after) return null;
  if (rankOf(after) < rankOf(before)) return { art: 'titolo-perso', caption: 'Il titolo perduto' };
  const art = RANGO_ART[rankOf(after)];
  return art ? { art, caption: `Investitura a ${titleName(after)}` } : null;
}

const FAMIGLIA: Partial<Record<Extract<ChronicleFact, { t: 'famiglia' }>['k'], [string, (chi: string) => string]>> = {
  nozze: ['nozze', chi => `Le nozze di ${chi}`],
  nascita: ['nascita', chi => `La nascita di ${chi}`],
  ripudio: ['ripudio', () => 'Il ripudio'],
  ripudiato: ['ripudio', () => 'Il ripudio'],
  reggenza: ['reggenza', () => 'Il consiglio di reggenza'],
  trasferimento: ['trasferimento', () => 'La corte si trasferisce'],
};

/**
 * La scena più importante dell'anno di un signore fra quelle di rango e di casata, se c'è:
 * il titolo, poi la corona, la morte del signore, i fatti di famiglia.
 */
export function scenaDellAnno(facts: ChronicleFact[]): Scena | null {
  for (const f of facts) if (f.t === 'yearEnd') {
    const s = titoloScena(f.titleBefore, f.titleAfter);
    if (s) return s;
  }
  if (facts.some(f => f.t === 'corona')) return { art: 'incoronazione', caption: "La corona d'Italia" };
  const morto = facts.find(f => f.t === 'successione');
  if (morto?.t === 'successione') return { art: 'morte-signore', caption: `La morte di ${morto.morto}` };
  for (const f of facts) if (f.t === 'famiglia') {
    const k = FAMIGLIA[f.k];
    if (k) return { art: k[0], caption: k[1](f.chi) };
  }
  return null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/** La vignetta dipinta di una scena, con didascalia, come quelle degli imprevisti. */
export function scenaFigure(s: Scena, testo: string): string {
  return `<figure class="comic illustrata investitura">
    <figcaption class="comic-caption">${testo}</figcaption>
    <img class="comic-art" src="${illustrationUrl(s.art)}" alt="${esc(s.caption)}" width="1000" height="667">
  </figure>`;
}

/** Avviso d'inizio turno per il signore che a fine anno ha cambiato titolo. */
export function titoloNotice(p: Player, before: number, after: number): Notice | null {
  const s = titoloScena(before, after);
  if (!s) return null;
  const sale = rankOf(after) > rankOf(before);
  const testo = sale
    ? `Per la ricchezza e il buon governo del feudo, il re vi innalza al rango di <b>${titleName(after)}</b>. Il vescovo vi consegna la carta del titolo davanti alla corte riunita: da oggi il vostro nome si scrive ${titleName(after)} ${esc(p.name)}.`
    : `Il feudo ha perso troppo: il re vi toglie il titolo di ${titleName(before)}, e l'araldo spezza il vostro stemma davanti alla corte. Da oggi siete ${titleName(after)} ${esc(p.name)}.`;
  return { title: sale ? s.caption : 'Il titolo perduto', body: scenaFigure(s, testo), html: true };
}

/** Avviso d'inizio turno per chi i grandi del regno hanno eletto re (Dinastia). */
export function coronaNotice(p: Player): Notice {
  const s: Scena = { art: 'incoronazione', caption: "La corona d'Italia" };
  return {
    title: "La corona d'Italia",
    body: scenaFigure(s, `I grandi del regno vi hanno eletto: nella basilica l'arcivescovo pone sul capo di ${esc(p.name)} la Corona Ferrea, e i signori d'Italia vi acclamano re.`),
    html: true,
  };
}
