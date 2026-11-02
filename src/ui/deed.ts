/**
 * Atto di acquisto: una piccola pergamena che registra ogni acquisto nei
 * dispendimenti (terre, mercati, opifici, palazzo), con sigillo di ceralacca.
 */
import { COSTS, type InvestmentKind } from '../domain/investments';
import { FEUDI, titleName } from '../domain/rank';
import type { Player } from '../domain/types';
import { pick } from './speaker';

export interface Deed {
  /** numero progressivo dell'atto nella partita */
  number: number;
  title: string;
  body: string;
  notary: string;
}

/** Durata della pergamena a schermo, in millisecondi. */
export const DEED_MS = 5000;

const n = (v: number) => Math.floor(Math.abs(v)).toLocaleString('it-IT');
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

const NOTARIES = ['Ser Guglielmo', 'Ser Rolando', 'Ser Ildebrando', 'Ser Gherardo', 'Ser Ubaldo'];

export function makeDeed(kind: InvestmentKind, p: Player, year: number, number: number): Deed {
  const who = `${titleName(p.title)} ${esc(p.name)} da ${FEUDI[p.feudo]}`;
  const price = `per il prezzo di ${n(COSTS[kind])} scudi`;
  let title: string, what: string;
  switch (kind) {
    case 'terre':
      title = 'Atto di compravendita';
      what = `acquista un fondo di 25 acri di terra arativa ${price}. Il feudo conta ora ${n(p.acri)} acri.`;
      break;
    case 'mercato':
      title = 'Atto di concessione';
      what = `concede licenza per un nuovo mercato in piazza ${price}. I mercati del feudo sono ora ${p.mercato - 1}.`;
      break;
    case 'opificio':
      title = 'Atto di fondazione';
      what = `fonda un nuovo opificio presso il fiume ${price}. Gli opifici del feudo sono ora ${p.opificio - 1}.`;
      break;
    case 'palazzo':
      title = 'Atto di edificazione';
      what = `fa innalzare il ${p.palazzo}° piano del palazzo signorile ${price}.`;
      break;
    case 'granaio':
      title = 'Atto di edificazione';
      what = `fa costruire un nuovo granaio ${price}. I granai del feudo sono ora ${p.granai ?? 0}.`;
      break;
  }
  const treasury = p.scudi >= 0
    ? `Restano nel tesoro ${n(p.scudi)} scudi.`
    : `Il tesoro resta in debito di ${n(p.scudi)} scudi presso gli usurai.`;
  return {
    number,
    title,
    body: `Nell'anno del Signore ${year}, ${who} ${what} ${treasury}`,
    notary: pick(NOTARIES),
  };
}

export const seal = `<svg viewBox="0 0 60 60" class="deed-seal" aria-hidden="true">
  <path d="M30 4 C38 3 44 9 50 12 C56 18 55 26 57 32 C57 40 51 45 47 51 C40 56 33 55 27 57 C19 56 13 51 9 46 C4 39 5 32 3 26 C5 18 11 13 16 8 C21 5 25 5 30 4z" fill="#a3231b"/>
  <circle cx="30" cy="30" r="17" fill="#8b1a14" stroke="#c4473a" stroke-width="2"/>
  <path d="M22 36 V24 l8 7 8 -7 v12" stroke="#e8a090" stroke-width="2.5" fill="none" stroke-linejoin="round"/>
  <path d="M18 54 l-6 6 M42 54 l6 6" stroke="#6b1410" stroke-width="5"/></svg>`;

export function renderDeed(d: Deed): string {
  return `<aside class="deed" role="status" aria-live="polite">
    <div class="deed-roll top" aria-hidden="true"></div>
    <div class="deed-sheet">
      <button class="deed-close" data-act="deedClose" aria-label="chiudi l'atto">x</button>
      <div class="deed-head">${d.title} <span>n. ${d.number}</span></div>
      <p class="deed-body">${d.body}</p>
      <div class="deed-foot"><span class="deed-sign">Rogato da ${d.notary}, notaio del feudo</span>${seal}</div>
    </div>
    <div class="deed-roll bottom" aria-hidden="true"></div>
  </aside>`;
}
