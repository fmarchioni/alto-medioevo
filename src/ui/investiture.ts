/**
 * Scene di rango e di casata (dipinti di public/sprites/fatti): l'investitura quando si sale di
 * titolo, la perdita del titolo, la corona d'Italia, e i fatti della famiglia (Dinastia).
 * Servono all'avviso d'inizio turno (solo al signore interessato) e alla miniatura del giornale.
 */
import type { AnnuncioCorona } from '../domain/dinastia';
import { FEUDI, titleName } from '../domain/rank';
import type { Game } from '../domain/turn';
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
  cadetto: ['casata', chi => `Il ramo cadetto di ${chi}`],
  usurpazione: ['faida-fratello', () => 'La notte della successione'],
  esilio: ['traditore', () => 'La congiura sventata'],
};

/** Dipinto della faida: il fratello o la sorella che osserva la scena della morte. */
export const faidaArt = (g: number) => (g === 6 ? 'faida-sorella' : 'faida-fratello');

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
  if (morto?.t === 'successione') {
    return morto.causa === 'faida' ? { art: faidaArt(morto.ag ?? 1), caption: 'Morte improvvisa in strane circostanze' } : { art: 'morte-signore', caption: `La morte di ${morto.morto}` };
  }
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
  return { title: sale ? s.caption : 'Il titolo perduto', body: scenaFigure(s, testo), html: true, musica: sale ? 'gloria' : 'scongiuro' };
}

type FattoFamiglia = Extract<ChronicleFact, { t: 'famiglia' }>;

/**
 * Avviso d'inizio turno per i lutti e le nascite in famiglia (Dinastia): il signore li apprende
 * subito, con la vignetta, e non dal giornale di fine anno. Il lutto viene prima della nascita.
 */
export function famigliaNotice(p: Player, facts: FattoFamiglia[]): Notice | null {
  const lutti = facts.filter(f => f.k === 'lutto'), nascite = facts.filter(f => f.k === 'nascita');
  if (!lutti.length && !nascite.length) return null;
  const chi = (f: FattoFamiglia) => {
    if (f.k !== 'lutto') return esc(f.chi);
    const rel = f.rel === 'figlio' ? 'vostro figlio' : f.rel === 'figlia' ? 'vostra figlia' : p.gender === 1 ? 'vostra moglie' : 'vostro marito';
    return `${rel} <b>${esc(f.chi)}</b>`;
  };
  const frasi: string[] = [];
  if (lutti.length) {
    const nomi = lutti.map(chi).join(', ').replace(/, ([^,]*)$/, ' e $1');
    frasi.push(`${lutti.length === 1 ? 'È morto' : 'Sono morti'} ${nomi}. La corte veste il lutto, le campane suonano a morto e il vescovo celebra le esequie nella cattedrale.`
      .replace(/^È morto (vostra)/, 'È morta $1'));
  }
  for (const f of nascite) {
    if (f.k !== 'nascita') continue;
    frasi.push(`${lutti.length ? 'Ma il Signore dà e il Signore toglie: ' : ''}${f.gender === 1 ? 'è nato vostro figlio' : 'è nata vostra figlia'} <b>${esc(f.chi)}</b>, e il feudo festeggia il nuovo membro della casata.`);
  }
  const s: Scena = lutti.length
    ? { art: 'morte-signore', caption: lutti.length === 1 && lutti[0].k === 'lutto' ? `La morte di ${lutti[0].chi}` : 'Lutto a corte' }
    : { art: 'nascita', caption: nascite.length === 1 && nascite[0].k === 'nascita' ? `La nascita di ${nascite[0].chi}` : 'Nascite a corte' };
  return { title: lutti.length ? 'Lutto a corte' : s.caption, body: scenaFigure(s, frasi.join(' ')), html: true, musica: lutti.length ? 'requiem' : 'festa' };
}

/**
 * Avviso d'inizio turno sulla corona d'Italia (Dinastia), per ogni giocatore: il primo re, o il successore votato alla
 * morte del re, con i voti e il testamento.
 */
export function coronaNotice(g: Game, a: AnnuncioCorona): Notice {
  const st = g.state, me = st.current, P = st.players, re = P[a.re];
  const nome = (j: number) => esc(P[j]?.name ?? '');
  const s: Scena = { art: 'incoronazione', caption: "La corona d'Italia" };
  const corona = `nella basilica di Pavia l'arcivescovo pone sul capo di ${esc(re.name)} la Corona Ferrea`;
  let testo: string;
  if (a.casaRe === undefined) {
    testo = a.re === me
      ? `Nessuno in Italia è più ricco né più potente di voi: ${corona}, e i signori d'Italia vi acclamano ${re.gender === 1 ? 're' : 'regina'}. Pensate per tempo al testamento: alla vostra morte i grandi voteranno il successore.`
      : `${esc(re.name)} è il più ricco e il più potente d'Italia: ${corona}. Alla sua morte i grandi voteranno il successore, e voi con loro.`;
  } else {
    const erede = a.re === a.casaRe;
    const voti = [...(a.voti ?? [])].filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).map(([j, v]) => `${j === a.casaRe ? `l'erede ${nome(j)}` : nome(j)} ${v}`).join(', ');
    const tst = a.testamento === undefined ? 'Il re non aveva lasciato testamento.'
      : `Il re aveva lasciato testamento per ${a.testamento === a.casaRe ? 'il suo erede' : nome(a.testamento)}.`;
    const esito = a.re === me
      ? (erede ? `I grandi del regno, riuniti a Pavia, hanno confermato la corona all'erede: ${corona}.` : `I grandi del regno, riuniti a Pavia, vi hanno preferito all'erede del re: ${corona}.`)
      : erede ? `I grandi del regno, riuniti a Pavia, hanno confermato la corona all'erede del re, ${esc(re.name)}.` : `I grandi del regno, riuniti a Pavia, hanno preferito all'erede del re ${esc(re.name)}, da ${FEUDI[re.feudo]}.`;
    testo = `Il re è morto. ${esito} ${tst}${voti ? ` Voti: ${voti}.` : ''}`;
  }
  return { title: a.re === me ? "La corona d'Italia" : "Il nuovo re d'Italia", body: scenaFigure(s, testo), html: true, musica: a.re === me ? 'gloria' : 'sorpresa' };
}
