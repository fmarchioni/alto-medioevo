/** Riquadro "personaggio che parla", condiviso dai consiglieri. */
import { Mulberry32 } from '../domain/rng';

export interface Speaker {
  name: string;
  role: string;
  portrait: string;
}

/**
 * Generatore per le frasi di colore, separato da quello di gioco: la
 * sequenza RND della partita (confrontabile con il C64) non viene toccata.
 */
const flavor = new Mulberry32((Date.now() ^ 0x5eed) >>> 0);
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(flavor.next() * arr.length)];

export function speechBox(who: Speaker, text: string): string {
  return `
  <div class="advisor">
    ${who.portrait}
    <div class="speech">
      <div class="who-speaks">${who.name} <span>${who.role}</span></div>
      <p class="say">${text}</p>
    </div>
  </div>`;
}
