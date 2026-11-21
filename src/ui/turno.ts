/**
 * Annuncio del turno: all'inizio del turno di un signore umano compare, in dissolvenza, "È il turno di …"
 * con lo stemma della sua città; dopo qualche secondo svanisce da solo. Non ferma il gioco (non si clicca)
 * e sta fuori dalla pagina che si ridisegna, così l'animazione non riparte a ogni clic.
 */
import { FEUDI, titleName } from '../domain/rank';
import type { Player } from '../domain/types';
import { stemma } from './stemmi';
import { c64ify } from './theme';

/** Quanto resta a schermo l'annuncio, dissolvenze comprese (ms); il CSS (.turno-pop) usa la stessa durata. */
export const TURNO_MS = 3200;

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/** L'annuncio, come HTML. */
export function renderTurno(p: Player): string {
  const citta = FEUDI[p.feudo] ?? '';
  return `<div class="turno-pop" role="status" aria-live="polite" style="animation-duration:${TURNO_MS}ms">
    <div class="turno-card">${stemma(p.feudo, citta)}
      <div class="turno-txt"><span class="turno-pre">È il turno di</span><b class="turno-nome">${titleName(p.title)} ${esc(p.name)}</b><span class="turno-citta">da ${citta}</span></div>
    </div>
  </div>`;
}

let attuale: HTMLElement | null = null;

/** Mostra l'annuncio del turno di `p` (sostituisce quello di prima, se c'è ancora). */
export function annunciaTurno(p: Player): void {
  if (typeof document === 'undefined') return;
  attuale?.remove();
  const box = document.createElement('div');
  box.innerHTML = c64ify(renderTurno(p));
  const el = box.firstElementChild as HTMLElement;
  document.body.appendChild(el);
  attuale = el;
  setTimeout(() => {
    el.remove();
    if (attuale === el) attuale = null;
  }, TURNO_MS);
}
