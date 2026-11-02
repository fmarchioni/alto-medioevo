/**
 * Pergamene dei dispacci: una per notizia, si srotolano una dopo l'altra
 * (solo alla prima apparizione) e si archiviano con un pulsante. Usate dalle
 * espansioni per le notizie arrivate fra un turno e l'altro.
 */
import { seal } from './deed';

export interface ScrollItem {
  title: string;
  /** mittente, sotto il titolo (es. "dal banco") */
  from: string;
  /** testo (HTML già pronto) */
  body: string;
}

export function dispatchScrolls(items: ScrollItem[], animate: boolean, sign: string): string {
  if (!items.length) return '';
  const scrolls = items.map((d, i) => `<article class="dispatch${animate ? ' unroll' : ''}" style="--i:${i}">
      <div class="deed-roll top" aria-hidden="true"></div>
      <div class="deed-sheet">
        <div class="deed-head">${d.title} <span>${d.from}</span></div>
        <p class="deed-body">${d.body}</p>
        <div class="deed-foot"><span class="deed-sign">${sign}</span>${seal}</div>
      </div>
      <div class="deed-roll bottom" aria-hidden="true"></div>
    </article>`).join('');
  const count = items.length;
  return `<section class="dispatches" aria-label="dispacci">
    <div class="dispatches-head"><h3>${count === 1 ? 'Un dispaccio' : `${count} dispacci`} per voi</h3>
      <button data-act="extArchive" class="ghost">Archivia</button></div>
    <div class="dispatch-list">${scrolls}</div></section>`;
}
