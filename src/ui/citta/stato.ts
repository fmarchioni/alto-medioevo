/** Vista moderna: ciò che della città dipende dalla fase di gioco e dalle espansioni. */
import { FEUDI } from '../../domain/rank';
import type { GameState, Phase } from '../../domain/types';
import { ID as SPADE, type SpadeState } from '../../expansions/spade-castelli/rules';
import { ID as VIE, type MercantiState } from '../../expansions/vie-mercanti/rules';
import type { CityExtra, Stagione } from './layout';

/** Il turno segue l'anno: primavera nella Delibera, estate agli imprevisti, raccolto alle rendite, autunno nei dispendimenti. */
export function stagioneOf(kind: Phase['kind']): Stagione {
  if (kind === 'evento' || kind === 'impresa') return 'estate';
  if (kind === 'rendite' || kind === 'reame') return 'raccolto';
  if (kind === 'investimenti') return 'autunno';
  return 'primavera';
}

/** Feudi sul mare: hanno il porto (Vie dei mercanti). */
const SUL_MARE = new Set<string>(['Ravenna', 'Roma', 'Neapolis', 'Barium', 'Panormus']);

/** `stagione`: se assente segue la fase in corso. */
export function cityExtra(st: GameState, i: number, stagione?: Stagione): CityExtra {
  const x: CityExtra = { stagione: stagione ?? stagioneOf(st.phase.kind) };
  if (i === st.current) x.annata = st.scalars.annata;
  if (st.expansion === SPADE && st.ext) {
    const s = st.ext as SpadeState;
    x.mura = s.mura?.[i] ?? 0;
    x.torri = s.torri?.[i] ?? 0;
    x.catapulte = s.catapulte?.[i] ?? 0;
    x.soldati = s.soldati?.[i] ?? 0;
    x.accampamento = (s.campagne ?? []).some(c => c.owner === i) || (s.assedi ?? []).some(a => a.owner === i || a.target === i);
    x.breccia = (s.assedi ?? []).some(a => a.target === i);
  }
  if (st.expansion === VIE && st.ext) {
    const s = st.ext as MercantiState;
    x.fondaco = true;
    x.banco = true;
    x.vigneti = s.cantine?.[i]?.vigneti ?? 0;
    x.fiera = s.fiera?.q === st.q;
    x.porto = SUL_MARE.has(FEUDI[st.players[i]?.feudo] ?? '');
  }
  return x;
}
