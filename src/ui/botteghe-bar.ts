import { tettoBotteghe } from '../domain/ere';
import type { Player } from '../domain/types';

const n = (x: number) => x.toLocaleString('it-IT');

const STALL = '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M3 9 l2 -5 h14 l2 5 z" fill="#a82c22" stroke="#6b1a14"/><path d="M7 4 l-1 5 M12 4 v5 M17 4 l1 5" stroke="#f3e6c4" stroke-width="1.4"/><rect x="5" y="9" width="14" height="11" fill="#c9a86a" stroke="#6b4a2c"/><rect x="7" y="13" width="10" height="3" fill="#8a5a34"/></svg>';
const WHEEL = '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><rect x="3" y="10" width="11" height="10" fill="#c9a86a" stroke="#6b4a2c"/><path d="M2 10 l6.5 -5 l6.5 5 z" fill="#8a5a34" stroke="#4a3424"/><circle cx="17" cy="15" r="5" fill="none" stroke="#4a3424" stroke-width="1.6"/><path d="M17 10 v10 M12 15 h10 M13.5 11.5 l7 7 M20.5 11.5 l-7 7" stroke="#4a3424"/></svg>';

/** Mercati e opifici costruiti per la barra delle risorse (con le ere, sul tetto dell'era). */
export function bottegheBar(p: Player): { ico: string; value: string; label: string; low?: boolean; botteghe: true }[] {
  const tetto = tettoBotteghe(p);
  const v = (k: number) => (tetto === Infinity ? n(k - 1) : `${n(k - 1)}/${tetto}`);
  return [
    { ico: STALL, value: v(p.mercato), label: p.mercato - 1 === 1 ? 'mercato' : 'mercati', botteghe: true },
    { ico: WHEEL, value: v(p.opificio), label: p.opificio - 1 === 1 ? 'opificio' : 'opifici', botteghe: true },
  ];
}
